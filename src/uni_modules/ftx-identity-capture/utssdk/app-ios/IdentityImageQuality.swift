import CoreVideo
import Foundation

// Same bounded inner-face sampling as the Android bridge and JavaScript adapters.
func identityImageQuality(_ pixels: CVPixelBuffer, bounds: [[String: Float]]) -> [String: Double]? {
    guard CVPixelBufferGetPixelFormatType(pixels) == kCVPixelFormatType_32BGRA else { return nil }
    CVPixelBufferLockBaseAddress(pixels, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(pixels, .readOnly) }
    guard let base = CVPixelBufferGetBaseAddress(pixels) else { return nil }
    let bytes = base.assumingMemoryBound(to: UInt8.self), stride = CVPixelBufferGetBytesPerRow(pixels)
    let width = CVPixelBufferGetWidth(pixels), height = CVPixelBufferGetHeight(pixels)
    guard width > 1 && height > 1 else { return nil }
    var left = 0.25, top = 0.2, right = 0.75, bottom = 0.8
    if bounds.count >= 2, let x0 = bounds[0]["x"], let y0 = bounds[0]["y"], let x1 = bounds[1]["x"], let y1 = bounds[1]["y"] {
        left = Double(x0); top = Double(y0); right = Double(x1); bottom = Double(y1)
        let dx = (right - left) * 0.1, dy = (bottom - top) * 0.1
        left += dx; right -= dx; top += dy; bottom -= dy
    }
    let x0 = max(0, min(width - 1, Int(floor(left * Double(width)))))
    let y0 = max(0, min(height - 1, Int(floor(top * Double(height)))))
    let rw = max(x0 + 1, min(width, Int(ceil(right * Double(width))))) - x0
    let rh = max(y0 + 1, min(height, Int(ceil(bottom * Double(height))))) - y0
    let size = 64
    var luma = [Double](repeating: 0, count: size * size)
    var sum = 0.0, black = 0.0, dark = 0.0, clipped = 0.0
    for y in 0..<size { for x in 0..<size {
        let sx = min(width - 2, x0 + Int(floor((Double(x) + 0.5) * Double(rw) / Double(size))))
        let sy = min(height - 2, y0 + Int(floor((Double(y) + 0.5) * Double(rh) / Double(size))))
        var value = 0.0
        for dy in 0...1 { for dx in 0...1 {
            let i = (sy + dy) * stride + (sx + dx) * 4
            value += 0.299 * Double(bytes[i + 2]) + 0.587 * Double(bytes[i + 1]) + 0.114 * Double(bytes[i])
        } }
        value /= 4; luma[y * size + x] = value; sum += value
        if value < 12 { black += 1 }; if value < 40 { dark += 1 }; if value > 245 { clipped += 1 }
    } }
    var edge = 0.0, square = 0.0
    for y in 1..<(size - 1) { for x in 1..<(size - 1) {
        let i = y * size + x
        let v = luma[i - 1] + luma[i + 1] + luma[i - size] + luma[i + size] - 4 * luma[i]
        edge += v; square += v * v
    } }
    let count = Double((size - 2) * (size - 2)), total = Double(size * size)
    return ["mean": sum / total, "black": black / total, "dark": dark / total, "clipped": clipped / total,
            "sharpness": max(0, square / count - (edge / count) * (edge / count)), "resolution": Double(min(rw, rh))]
}
