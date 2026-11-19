import AVFoundation
import Foundation

public class LocalTtsBridge: NSObject, AVSpeechSynthesizerDelegate {
    private static let shared = LocalTtsBridge()
    private let synthesizer = AVSpeechSynthesizer()
    private struct Speech {
        let id: String
        let utterance: AVSpeechUtterance
        let callback: (Bool) -> Void
    }
    private var active: Speech?

    private override init() {
        super.init()
        synthesizer.delegate = self
        if #available(iOS 13.0, *) {
            synthesizer.usesApplicationAudioSession = false
        }
    }

    private static func chineseVoice() -> AVSpeechSynthesisVoice? {
        let voices = AVSpeechSynthesisVoice.speechVoices().filter { $0.language.hasPrefix("zh-") }
        return voices.first { $0.language == "zh-CN" } ?? voices.first
    }

    public static func probe(_ callback: @escaping (Bool) -> Void) {
        DispatchQueue.main.async { callback(chineseVoice() != nil) }
    }

    public static func speak(_ text: String, _ id: String, _ callback: @escaping (Bool) -> Void) {
        DispatchQueue.main.async {
            guard let voice = chineseVoice() else { callback(false); return }
            let player = shared
            player.cancelActive()
            let utterance = AVSpeechUtterance(string: text)
            utterance.voice = voice
            player.active = Speech(id: id, utterance: utterance, callback: callback)
            player.synthesizer.speak(utterance)
        }
    }

    public static func stop(_ id: String) {
        DispatchQueue.main.async {
            if shared.active?.id == id { shared.cancelActive() }
        }
    }

    private func cancelActive() {
        guard let speech = active else { return }
        active = nil
        synthesizer.stopSpeaking(at: .immediate)
        speech.callback(false)
    }

    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        DispatchQueue.main.async { self.complete(utterance, true) }
    }

    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        DispatchQueue.main.async { self.complete(utterance, false) }
    }

    private func complete(_ utterance: AVSpeechUtterance, _ success: Bool) {
        guard let speech = active, speech.utterance === utterance else { return }
        active = nil
        speech.callback(success)
    }
}
