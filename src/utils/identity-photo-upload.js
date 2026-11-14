// #ifndef H5
import { compressNativeUploadImage, discardUploadImage } from './upload-image.js'
// #endif

export async function encodeIdentityCanvas(canvas) {
  // Encode the complete frame once. Older browsers may silently return PNG.
  try {
    const webp = await new Promise(done => canvas.toBlob(done, 'image/webp', .88))
    if (webp?.size && webp.type === 'image/webp') return webp
  } catch (_) {}
  return new Promise(done => canvas.toBlob(done, 'image/jpeg', .9))
}

// #ifndef H5
const call = (invoke, options) => new Promise((resolve, reject) => invoke({ ...options, success: resolve, fail: reject }))
export async function prepareIdentityUpload(photo) {
  const original = { path: photo.path, cleanup() {} }
  let candidate
  try {
    const file = await call(options => uni.getFileInfo(options), { filePath: photo.path })
    if (!(file.size > 512 * 1024)) return original
    const info = await call(options => uni.getImageInfo(options), { src: photo.path })
    const maximum = Math.max(info.width, info.height)
    // The shared WebP encoders cap their output at 1600px. For larger camera
    // stills use the native JPEG encoder so archival resolution is preserved.
    if (maximum <= 1600) candidate = await compressNativeUploadImage(photo.path, 88, maximum)
    else {
      const result = await call(options => uni.compressImage(options), {
        src: photo.path, quality: 88, compressedWidth: info.width, compressedHeight: info.height
      })
      candidate = result.tempFilePath || result.apFilePath
    }
    if (!candidate || candidate === photo.path) return original
    const [compressed, image] = await Promise.all([
      call(options => uni.getFileInfo(options), { filePath: candidate }),
      call(options => uni.getImageInfo(options), { src: candidate })
    ])
    const sameFrame = (image.width === info.width && image.height === info.height) ||
      (image.width === info.height && image.height === info.width)
    if (sameFrame && compressed.size > 0 && compressed.size <= file.size * .9) {
      return { path: candidate, cleanup: () => discardUploadImage(candidate, photo.path) }
    }
  } catch (_) { /* Compression is optional; keep the usable camera result. */ }
  discardUploadImage(candidate, photo.path)
  return original
}
// #endif
