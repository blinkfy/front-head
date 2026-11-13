import Foundation
import UIKit
import AVFoundation
import CoreImage
import CryptoKit
import MediaPipeTasksVision

public class IdentityCaptureBridge: NSObject {
    fileprivate static var active: IdentityCaptureController?
    fileprivate static var pending = false
    fileprivate static var pendingId = ""
    fileprivate static var listener: ((String) -> Void)?
    private static var backgroundObserver: NSObjectProtocol?
    private static func clearPendingObserver() {
        if let observer = backgroundObserver { NotificationCenter.default.removeObserver(observer) }
        backgroundObserver = nil
    }
    fileprivate static func emit(_ input: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: input), let text = String(data: data, encoding: .utf8) else { return }
        listener?(text)
    }
    public static func open(_ options: String, _ callback: @escaping (String) -> Void) {
        DispatchQueue.main.async {
            guard let data = options.data(using: .utf8), let input = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], let id = input["id"] as? String,
                  let path = input["modelPath"] as? String else { return }
            if active != nil || pending {
                let result = ["id": id, "type": "error", "message": "正在认证，请勿重复打开"]
                if let data = try? JSONSerialization.data(withJSONObject: result) { callback(String(data: data, encoding: .utf8)!) }
                return
            }
            pending = true; pendingId = id; listener = callback
            // A permission alert resigns active too. Only real backgrounding cancels a pending launch.
            backgroundObserver = NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { _ in
                guard pending && pendingId == id else { return }
                pending = false; pendingId = ""; clearPendingObserver()
                emit(["id": id, "type": "cancel"]); listener = nil
            }
            AVCaptureDevice.requestAccess(for: .video) { allowed in
                DispatchQueue.main.async {
                    guard pending && pendingId == id else { return }
                    pending = false; clearPendingObserver()
                    guard allowed else { emit(["id": id, "type": "error", "message": "请在系统设置中允许相机权限后重试"]); listener = nil; return }
                    let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first { $0.activationState == .foregroundActive }
                    var presenter = scene?.windows.first(where: { $0.isKeyWindow })?.rootViewController
                    while let next = presenter?.presentedViewController { presenter = next }
                    guard let host = presenter else { emit(["id": id, "type": "error", "message": "无法打开认证页面，请重试"]); listener = nil; return }
                    let controller = IdentityCaptureController(id: id, path: path, actions: input["actions"] as? [String] ?? [])
                    active = controller; controller.modalPresentationStyle = .fullScreen
                    host.present(controller, animated: true)
                }
            }
        }
    }
    public static func update(_ options: String) {
        DispatchQueue.main.async {
            guard let data = options.data(using: .utf8), let input = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return }
            active?.update(input)
        }
    }
    public static func close(_ id: String) {
        DispatchQueue.main.async {
            if active?.captureId == id { active?.complete("cancel") }
            if pendingId == id { pending = false; pendingId = ""; clearPendingObserver(); if active == nil { listener = nil } }
        }
    }
}

private final class IdentityCaptureController: UIViewController, AVCaptureVideoDataOutputSampleBufferDelegate {
    let captureId: String
    private let path: String
    private let actions: [String]
    private let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "ftx.identity.camera")
    private let imageContext = CIContext()
    private var detector: FaceLandmarker?
    private let cameraView = UIView()
    private var layer: AVCaptureVideoPreviewLayer?
    private let heading = UILabel(), detail = UILabel(), progress = UILabel()
    private let lightButton = UIButton(type: .system)
    private var oldBrightness: CGFloat = 0
    private var oldIdle = false
    private var savedDisplay = false
    private var timeout: Timer?
    private var closed = false
    private var waiting = false
    private var frameId = 0
    private var lastTime = 0
    private var pendingImage: UIImage?
    init(id: String, path: String, actions: [String]) { captureId = id; self.path = path; self.actions = actions; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("init(coder:) unsupported") }
    override func viewDidLoad() {
        super.viewDidLoad()
        guard !closed else { return }
        oldBrightness = UIScreen.main.brightness; oldIdle = UIApplication.shared.isIdleTimerDisabled
        savedDisplay = true
        UIScreen.main.brightness = 1; UIApplication.shared.isIdleTimerDisabled = true
        view.backgroundColor = .white
        let back = UIButton(type: .system); back.setTitle("返回", for: .normal); back.addTarget(self, action: #selector(cancel), for: .touchUpInside)
        let title = UILabel(); title.text = "实名认证"; title.font = .boldSystemFont(ofSize: 18); title.textAlignment = .center
        let header = UIStackView(arrangedSubviews: [back, title]); header.distribution = .fillEqually
        heading.text = "正在准备相机…"; heading.font = .boldSystemFont(ofSize: 25)
        detail.text = "请本人独自入镜"; detail.font = .systemFont(ofSize: 15)
        progress.text = actions.first == "mouth" ? "准备 · 张嘴 → 眨眼 · 完成" : "准备 · 眨眼 → 张嘴 · 完成"
        lightButton.setTitle("柔光补光已开启", for: .normal); lightButton.addTarget(self, action: #selector(toggleLight), for: .touchUpInside)
        let hint = UILabel(); hint.text = "保持手机平稳 · 完成动作后继续认证"; hint.font = .systemFont(ofSize: 13)
        let stack = UIStackView(arrangedSubviews: [header, heading, detail, cameraView, progress, lightButton, hint]); stack.axis = .vertical; stack.spacing = 18
        stack.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(stack)
        for label in [heading, detail, progress, hint] { label.textAlignment = .center; label.numberOfLines = 0; label.textColor = UIColor(red: 0.09, green: 0.19, blue: 0.19, alpha: 1) }
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 26), stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -26),
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12), stack.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -18), header.heightAnchor.constraint(equalToConstant: 44), cameraView.heightAnchor.constraint(greaterThanOrEqualToConstant: 160)])
        cameraView.clipsToBounds = true
        NotificationCenter.default.addObserver(self, selector: #selector(cancel), name: UIApplication.willResignActiveNotification, object: nil)
        timeout = Timer.scheduledTimer(withTimeInterval: 90, repeats: false) { [weak self] _ in self?.complete("error", message: "认证超时，请重新开始") }
        queue.async { [weak self] in self?.prepare() }
    }
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews(); layer?.frame = cameraView.bounds
        let mask = CAShapeLayer(); mask.path = UIBezierPath(ovalIn: cameraView.bounds).cgPath; cameraView.layer.mask = mask
    }
    private func prepare() {
        do {
            let file = URL(fileURLWithPath: path.replacingOccurrences(of: "file://", with: ""))
            let data = try Data(contentsOf: file, options: .mappedIfSafe)
            guard SHA256.hash(data: data).map({ String(format: "%02x", $0) }).joined() == "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff" else { throw NSError(domain: "MODEL", code: 1) }
        } catch { DispatchQueue.main.async { self.complete("error", message: "认证资源校验失败，请重新下载后重试", code: "MODEL") }; return }
        do {
            let options = FaceLandmarkerOptions(); options.baseOptions.modelAssetPath = path.replacingOccurrences(of: "file://", with: "")
            options.runningMode = .video; options.numFaces = 2; options.outputFaceBlendshapes = true; options.minFaceDetectionConfidence = 0.65; options.minFacePresenceConfidence = 0.65
            detector = try FaceLandmarker(options: options)
            session.beginConfiguration()
            var configured = false
            defer { if !configured { session.commitConfiguration() } }
            session.sessionPreset = .vga640x480
            guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front) else { throw NSError(domain: "CAMERA", code: 1) }
            let input = try AVCaptureDeviceInput(device: camera)
            guard session.canAddInput(input) else { throw NSError(domain: "CAMERA", code: 2) }; session.addInput(input)
            let output = AVCaptureVideoDataOutput(); output.alwaysDiscardsLateVideoFrames = true
            output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
            output.setSampleBufferDelegate(self, queue: queue)
            guard session.canAddOutput(output) else { throw NSError(domain: "CAMERA", code: 3) }; session.addOutput(output)
            output.connection(with: .video)?.videoOrientation = .portrait
            if output.connection(with: .video)?.isVideoMirroringSupported == true { output.connection(with: .video)?.isVideoMirrored = false }
            session.commitConfiguration()
            configured = true
            DispatchQueue.main.async {
                guard !self.closed else { return }
                let preview = AVCaptureVideoPreviewLayer(session: self.session); preview.videoGravity = .resizeAspectFill
                preview.frame = self.cameraView.bounds; self.cameraView.layer.insertSublayer(preview, at: 0); self.layer = preview
                preview.connection?.videoOrientation = .portrait
                if preview.connection?.isVideoMirroringSupported == true { preview.connection?.isVideoMirrored = true }
            }
            // All session/detector work, including teardown, stays on this serial queue.
            session.startRunning()
        } catch { DispatchQueue.main.async { self.complete("error", message: "无法准备认证，请检查相机权限或更新 App") } }
    }
    func captureOutput(_ output: AVCaptureOutput, didOutput buffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        let time = Int(ProcessInfo.processInfo.systemUptime * 1000)
        guard !waiting && time - lastTime >= 120 else { return }; lastTime = time; waiting = true
        do {
            guard let pixels = CMSampleBufferGetImageBuffer(buffer), let detector = detector else { return }
            let image = try MPImage(pixelBuffer: pixels)
            let result = try detector.detect(videoFrame: image, timestampInMilliseconds: time)
            let points = result.faceLandmarks.first ?? []
            let bounds: [[String: Float]] = points.isEmpty ? [] : [["x": points.map { $0.x }.min()!, "y": points.map { $0.y }.min()!], ["x": points.map { $0.x }.max()!, "y": points.map { $0.y }.max()!]]
            let categories = result.faceBlendshapes.first?.categories ?? []
            func score(_ name: String) -> Float { categories.first { $0.categoryName == name }?.score ?? 0 }
            // Copy this exact analyzed frame; later frames cannot replace the approved photo.
            let ci = CIImage(cvPixelBuffer: pixels)
            guard let cg = imageContext.createCGImage(ci, from: ci.extent) else { throw NSError(domain: "CAMERA", code: 4) }
            let photo = UIImage(cgImage: cg)
            var color: [Double]? = nil
            if points.count > 280 {
                CVPixelBufferLockBaseAddress(pixels, .readOnly)
                if let base = CVPixelBufferGetBaseAddress(pixels) {
                    let bytes = base.assumingMemoryBound(to: UInt8.self), stride = CVPixelBufferGetBytesPerRow(pixels), width = CVPixelBufferGetWidth(pixels), height = CVPixelBufferGetHeight(pixels)
                    var sum = [Double](repeating: 0, count: 3), count = 0
                    for index in [50, 280] {
                        let cx = Int(points[index].x * Float(width - 1)), cy = Int(points[index].y * Float(height - 1)), radius = max(1, Int(Double(width) * 0.025))
                        let xmin = max(0, cx - radius), xmax = min(width - 1, cx + radius), ymin = max(0, cy - radius), ymax = min(height - 1, cy + radius)
                        if xmin <= xmax && ymin <= ymax { for y in Swift.stride(from: ymin, through: ymax, by: 3) { for x in Swift.stride(from: xmin, through: xmax, by: 3) {
                            let i = y * stride + x * 4, r = Int(bytes[i + 2]), g = Int(bytes[i + 1]), b = Int(bytes[i])
                            if r + g + b >= 45 && min(r, min(g, b)) <= 245 { sum[0] += Double(r); sum[1] += Double(g); sum[2] += Double(b); count += 1 }
                        } } }
                    }
                    if count >= 8 { color = sum.map { $0 / Double(count) } }
                }
                CVPixelBufferUnlockBaseAddress(pixels, .readOnly)
            }
            var event: [String: Any] = ["type": "frame", "id": captureId, "count": result.faceLandmarks.count, "points": bounds,
                "blink": min(score("eyeBlinkLeft"), score("eyeBlinkRight")), "blinkLeft": score("eyeBlinkLeft"), "blinkRight": score("eyeBlinkRight"), "mouth": score("jawOpen"), "video": ["width": cg.width, "height": cg.height]]
            if let quality = identityImageQuality(pixels, bounds: bounds) { event["quality"] = quality }
            if let color = color { event["color"] = color }
            DispatchQueue.main.async {
                guard !self.closed else { return }
                self.frameId += 1; self.pendingImage = photo
                event["frameId"] = self.frameId; event["viewport"] = ["width": self.cameraView.bounds.width, "height": self.cameraView.bounds.height]
                IdentityCaptureBridge.emit(event)
            }
        } catch { DispatchQueue.main.async { self.complete("error", message: "动作认证未完成，请重新认证") } }
    }
    func update(_ input: [String: Any]) {
        guard !closed && input["id"] as? String == captureId else { return }
        if let fill = input["fill"] as? String, let rgb = Int(fill.dropFirst(), radix: 16) { view.backgroundColor = UIColor(red: CGFloat((rgb >> 16) & 255) / 255, green: CGFloat((rgb >> 8) & 255) / 255, blue: CGFloat(rgb & 255) / 255, alpha: 1) }
        if let title = input["title"] as? String { heading.text = title }; if let text = input["detail"] as? String { detail.text = text }
        if let step = input["progress"] as? Int { progress.text = "动作进度 \(step) / 2" }
        if let light = input["light"] as? Bool { lightButton.setTitle(light ? "柔光补光已开启" : "柔光补光已关闭", for: .normal) }
        guard input["frameId"] as? Int == frameId else { return }
        if input["capture"] as? Bool == true {
            do {
                guard let data = pendingImage?.jpegData(compressionQuality: 0.9) else { throw NSError(domain: "PHOTO", code: 1) }
                let url = FileManager.default.temporaryDirectory.appendingPathComponent("identity-\(UUID().uuidString).jpg")
                try data.write(to: url, options: [.atomic, .completeFileProtection]); complete("photo", path: url.path)
            } catch { complete("error", message: "认证失败，请重新尝试") }
        } else { queue.async { self.waiting = false } }
    }
    @objc private func cancel() { complete("cancel") }
    @objc private func toggleLight() { IdentityCaptureBridge.emit(["id": captureId, "type": "light"]) }
    func complete(_ type: String, message: String = "", code: String = "", path: String = "") {
        guard !closed else { return }; closed = true
        timeout?.invalidate(); NotificationCenter.default.removeObserver(self)
        if savedDisplay { UIScreen.main.brightness = oldBrightness; UIApplication.shared.isIdleTimerDisabled = oldIdle; savedDisplay = false }
        queue.async { self.session.stopRunning(); self.detector = nil }
        pendingImage = nil
        IdentityCaptureBridge.emit(["id": captureId, "type": type, "message": message, "code": code, "path": path])
        IdentityCaptureBridge.active = nil; IdentityCaptureBridge.listener = nil
        dismiss(animated: true)
    }
    override func viewDidDisappear(_ animated: Bool) { super.viewDidDisappear(animated); if !closed { complete("cancel") } }
}
