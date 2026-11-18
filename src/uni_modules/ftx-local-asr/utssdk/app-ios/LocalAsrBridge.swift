import Foundation
import Speech
import AVFoundation

public class LocalAsrBridge: NSObject {
    private class Job {
        let id: String
        let callback: (String) -> Void
        let lock = NSLock()
        var cancelled = false
        var task: SFSpeechRecognitionTask?
        var timer: DispatchWorkItem?
        init(_ id: String, _ callback: @escaping (String) -> Void) { self.id = id; self.callback = callback }
        func isCancelled() -> Bool { lock.lock(); defer { lock.unlock() }; return cancelled }
        func markCancelled() { lock.lock(); cancelled = true; lock.unlock() }
    }
    private static var active: Job?
    private static func reply(_ callback: (String) -> Void, _ result: [String: Any]) {
        let data = (try? JSONSerialization.data(withJSONObject: result)) ?? Data("{}".utf8)
        callback(String(data: data, encoding: .utf8) ?? "{}")
    }
    private static func finish(_ job: Job, _ result: [String: Any]) {
        guard active === job else { return }
        active = nil; job.markCancelled()
        job.timer?.cancel(); job.timer = nil
        job.task?.cancel(); job.task = nil
        reply(job.callback, result)
    }
    public static func cancel(_ id: String) {
        DispatchQueue.main.async {
            if let job = active, job.id == id { finish(job, ["error": "CANCELLED"]) }
        }
    }
    public static func request(_ options: String, _ callback: @escaping (String) -> Void) {
        DispatchQueue.main.async {
            guard #available(iOS 13.0, *) else { reply(callback, ["available": false]); return }
            guard let data = options.data(using: .utf8),
                  let input = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
                reply(callback, ["available": false]); return
            }
            guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "zh-CN")),
                  recognizer.supportsOnDeviceRecognition, recognizer.isAvailable else {
                reply(callback, ["available": false]); return
            }
            let status = SFSpeechRecognizer.authorizationStatus()
            guard status != .denied && status != .restricted else { reply(callback, ["available": false]); return }
            if input["action"] as? String == "available" { reply(callback, ["available": true]); return }
            guard active == nil, let id = input["id"] as? String,
                  let paths = input["paths"] as? [String], !paths.isEmpty, paths.count <= 12,
                  paths.allSatisfy({ $0.hasPrefix("/") && !$0.contains("://") }) else {
                reply(callback, ["error": "UNAVAILABLE"]); return
            }
            let job = Job(id, callback); active = job
            let timeout = DispatchWorkItem { [weak job] in
                if let job = job { finish(job, ["error": "TIMEOUT"]) }
            }
            job.timer = timeout; DispatchQueue.main.asyncAfter(deadline: .now() + 20, execute: timeout)
            func start(_ authorized: Bool) {
                DispatchQueue.main.async {
                    guard active === job else { return }
                    guard authorized else { finish(job, ["error": "NOT_AUTHORIZED"]); return }
                    let request = SFSpeechAudioBufferRecognitionRequest()
                    request.requiresOnDeviceRecognition = true
                    request.shouldReportPartialResults = false
                    request.taskHint = .dictation
                    job.task = recognizer.recognitionTask(with: request) { result, error in
                        DispatchQueue.main.async {
                            guard active === job else { return }
                            if let result = result, result.isFinal {
                                finish(job, ["text": result.bestTranscription.formattedString])
                            } else if error != nil { finish(job, ["error": "RECOGNITION_FAILED"]) }
                        }
                    }
                    DispatchQueue.global(qos: .userInitiated).async {
                        do {
                            var duration = 0.0
                            var expected: AVAudioFormat?
                            for path in paths {
                                let file = try AVAudioFile(forReading: URL(fileURLWithPath: path))
                                let format = file.processingFormat
                                duration += Double(file.length) / format.sampleRate
                                guard duration <= 61, expected == nil || expected!.isEqual(format) else {
                                    throw NSError(domain: "ftx.asr", code: 1)
                                }
                                expected = format
                                guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4096) else {
                                    throw NSError(domain: "ftx.asr", code: 2)
                                }
                                while file.framePosition < file.length {
                                    if job.isCancelled() { return }
                                    try file.read(into: buffer)
                                    if buffer.frameLength == 0 { break }
                                    request.append(buffer)
                                }
                            }
                            if !job.isCancelled() { request.endAudio() }
                        } catch { DispatchQueue.main.async { finish(job, ["error": "AUDIO_UNSUPPORTED"]) } }
                    }
                }
            }
            if status == .authorized { start(true) }
            else { SFSpeechRecognizer.requestAuthorization { start($0 == .authorized) } }
        }
    }
}
