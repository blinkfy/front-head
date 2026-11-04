import Foundation
import UIKit
import ImageIO
import SDWebImage
import SDWebImageWebPCoder

public class UploadWebPBridge: NSObject {
    private static let worker = DispatchQueue(label: "ftx.upload.webp", qos: .utility)

    public static func encode(_ options: String, _ callback: @escaping (String) -> Void) {
        worker.async {
            let response: String = autoreleasepool {
                var ownedOutput: URL?
                var completed = false
                defer {
                    if !completed, let output = ownedOutput { try? FileManager.default.removeItem(at: output) }
                }
                do {
                    guard let json = options.data(using: .utf8),
                          let args = try JSONSerialization.jsonObject(with: json) as? [String: Any],
                          let source = args["source"] as? String,
                          let destination = args["destination"] as? String,
                          let requestedSize = args["maxSize"] as? NSNumber,
                          let quality = args["quality"] as? NSNumber,
                          let deadline = args["deadline"] as? NSNumber else { throw EncodingError.invalidImage }
                    func checkDeadline() throws {
                        if Date().timeIntervalSince1970 * 1000 >= deadline.doubleValue { throw EncodingError.expired }
                    }
                    func fileURL(_ path: String) throws -> URL {
                        if path.hasPrefix("file://"), let url = URL(string: path), url.isFileURL { return url }
                        guard path.hasPrefix("/") else { throw EncodingError.invalidImage }
                        return URL(fileURLWithPath: path)
                    }
                    try checkDeadline()
                    let input = try fileURL(source)
                    let output = try fileURL(destination)
                    guard output != input, output.lastPathComponent.hasPrefix("upload_webp_"),
                          !FileManager.default.fileExists(atPath: output.path),
                          let imageSource = CGImageSourceCreateWithURL(input as CFURL,
                            [kCGImageSourceShouldCache: false] as CFDictionary),
                          let properties = CGImageSourceCopyPropertiesAtIndex(imageSource, 0, nil) as? [CFString: Any],
                          let width = properties[kCGImagePropertyPixelWidth] as? NSNumber,
                          let height = properties[kCGImagePropertyPixelHeight] as? NSNumber,
                          width.intValue > 0, height.intValue > 0 else { throw EncodingError.invalidImage }
                    let maxSize = min(1600, max(1, requestedSize.intValue))
                    let sourceSide = max(width.intValue, height.intValue)
                    // ImageIO samples directly and bakes EXIF rotation/mirroring into the thumbnail.
                    guard let thumbnail = CGImageSourceCreateThumbnailAtIndex(imageSource, 0, [
                        kCGImageSourceCreateThumbnailFromImageAlways: true,
                        kCGImageSourceThumbnailMaxPixelSize: min(maxSize, sourceSide),
                        kCGImageSourceCreateThumbnailWithTransform: true,
                        kCGImageSourceShouldCacheImmediately: true
                    ] as CFDictionary) else { throw EncodingError.invalidImage }
                    var image = UIImage(cgImage: thumbnail)
                    if !(args["preserveAlpha"] as? Bool ?? false) {
                        let format = UIGraphicsImageRendererFormat()
                        format.opaque = true
                        format.scale = 1
                        image = UIGraphicsImageRenderer(size: image.size, format: format).image { context in
                            UIColor.white.setFill()
                            context.fill(CGRect(origin: .zero, size: image.size))
                            image.draw(at: .zero)
                        }
                    }
                    try checkDeadline()
                    guard let data = SDImageWebPCoder.shared.encodedData(with: image, format: .webP, options: [
                        .encodeCompressionQuality: min(1, max(0.01, quality.doubleValue / 100)),
                        .encodeWebPMethod: 3,
                        .encodeWebPAlphaQuality: 100,
                        .encodeWebPThreadLevel: 0
                    ]), data.count >= 12,
                          String(data: data.prefix(4), encoding: .ascii) == "RIFF",
                          String(data: data.subdata(in: 8..<12), encoding: .ascii) == "WEBP"
                    else { throw EncodingError.invalidImage }
                    try checkDeadline()
                    if sourceSide <= maxSize,
                       let fileSize = (try input.resourceValues(forKeys: [.fileSizeKey])).fileSize,
                       fileSize > 0, data.count >= fileSize { throw EncodingError.notSmaller }
                    try FileManager.default.createDirectory(at: output.deletingLastPathComponent(), withIntermediateDirectories: true)
                    try data.write(to: output, options: .withoutOverwriting)
                    ownedOutput = output
                    try checkDeadline()
                    let result: [String: Any] = ["path": destination, "size": data.count,
                                               "width": thumbnail.width, "height": thumbnail.height]
                    let encoded = try JSONSerialization.data(withJSONObject: result)
                    guard let response = String(data: encoded, encoding: .utf8) else { throw EncodingError.invalidImage }
                    completed = true
                    return response
                } catch {
                    return "{\"error\":\"ENCODE_UNAVAILABLE\"}"
                }
            }
            DispatchQueue.main.async { callback(response) }
        }
    }

    private enum EncodingError: Error { case invalidImage, expired, notSmaller }
}
