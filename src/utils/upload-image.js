import { imageMimeFromBase64 } from './trash-bin-image-core.mjs'
import { tryAppUploadWebp } from './app-upload-webp-core.mjs'
// #ifdef MP-WEIXIN
import { compressWechatUploadImage } from './mp-upload-image.js'
// #endif

// Upload encoders keep their actual MIME; unsupported WebP encoders can return PNG.
export function encodeUploadCanvas(canvas, quality = .8, preserveAlpha = false) {
  try {
    const webp = canvas.toDataURL('image/webp', quality)
    if (webp.startsWith('data:image/webp;')) return webp
  } catch (_) {}
  return canvas.toDataURL(preserveAlpha ? 'image/png' : 'image/jpeg', quality)
}

export function uploadImageExtension(mime) {
  return ({ 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' })[mime] || 'png'
}

export function uploadImageDimensions(width, height, maxSize) {
  if (!(width > 0 && height > 0)) throw new Error('图片尺寸无效')
  const scale = Math.min(1, maxSize / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export async function compressUploadImageBlob(filePath, quality = .8, maxSize = 800, preserveAlpha = false) {
  const image = await new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片加载失败'))
    image.src = filePath
  })
  const canvas = document.createElement('canvas')
  try {
    const dimensions = uploadImageDimensions(image.naturalWidth || image.width, image.naturalHeight || image.height, maxSize)
    canvas.width = dimensions.width
    canvas.height = dimensions.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法处理图片')
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    if (!preserveAlpha) {
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const data = encodeUploadCanvas(canvas, quality, preserveAlpha)
    const mime = /^data:([^;]+);/.exec(data)?.[1]
    const bytes = atob(data.split(',')[1])
    const buffer = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i)
    return new Blob([buffer], { type: mime })
  } finally {
    canvas.width = canvas.height = 0
  }
}

const uniCall = (invoke, options) => new Promise((resolve, reject) => invoke({ ...options, success: resolve, fail: reject }))

export function discardUploadImage(path, original = '') {
  if (!path || path === original) return
  // #ifdef APP-PLUS
  plus.io.resolveLocalFileSystemURL(path, entry => entry.remove(() => {}, () => {}), () => {})
  // #endif
  // #ifndef APP-PLUS
  try { uni.getFileSystemManager?.().unlink({ filePath: path, fail: () => {} }) } catch (_) {}
  // #endif
}

export function readUploadImageData(path) {
  // #ifdef APP-PLUS
  return new Promise((resolve, reject) => {
    plus.io.resolveLocalFileSystemURL(path, entry => entry.file(file => {
      const reader = new plus.io.FileReader()
      reader.onloadend = event => {
        const result = String(event?.target?.result || reader.result || '')
        const encoded = result.split(',')[1] || ''
        const mime = imageMimeFromBase64(encoded)
        if (mime) resolve(`data:${mime};base64,${encoded}`)
        else reject(new Error('读取图片失败'))
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    }, reject), reject)
  })
  // #endif
  // #ifndef APP-PLUS
  return uniCall(options => uni.getFileSystemManager().readFile(options), { filePath: path, encoding: 'base64' })
    .then(result => {
      const mime = imageMimeFromBase64(String(result.data || ''))
      if (!mime) throw new Error('无法识别图片格式')
      return `data:${mime};base64,${result.data}`
    })
  // #endif
}

export async function compressNativeUploadImage(filePath, quality = 80, maxSize = 800, preserveAlpha = false) {
  const info = await uniCall(options => uni.getImageInfo(options), { src: filePath })
  const { width, height } = uploadImageDimensions(info.width, info.height, maxSize)
  // #ifdef APP-PLUS
  const webp = await tryAppUploadWebp(info.path || filePath, quality, maxSize, preserveAlpha, plus.io)
  if (webp) return webp
  const format = preserveAlpha ? 'png' : 'jpg'
  return new Promise((resolve, reject) => plus.zip.compressImage({
    src: info.path || filePath,
    dst: `_doc/upload_${Date.now()}_${Math.random().toString(36).slice(2)}.${format}`,
    overwrite: true, format, quality, width: `${width}px`, height: `${height}px`
  }, result => resolve(result.target), reject))
  // #endif
  // #ifdef MP-WEIXIN
  const keepAlpha = preserveAlpha || !['jpg', 'jpeg', 'image/jpeg'].includes(String(info.type || '').toLowerCase())
  const candidate = await compressWechatUploadImage(info.path || filePath, info, quality, maxSize, keepAlpha)
  if (candidate) return candidate
  // Native compression does not promise to keep alpha. Keep the original if Canvas PNG also fails.
  if (keepAlpha) return filePath
  // #endif
  // #ifndef APP-PLUS
  const result = await uniCall(options => uni.compressImage(options), {
    src: filePath, quality, compressedWidth: width, compressedHeight: height
  })
  return result.tempFilePath || result.apFilePath || filePath
  // #endif
}

// The caller owns this candidate until its upload finishes; the selected original is never deleted.
export async function prepareAvatarUpload(filePath) {
  // #ifdef H5
  const blob = await compressUploadImageBlob(filePath, .8, 256, true)
  const file = new File([blob], `avatar_${Date.now()}.${uploadImageExtension(blob.type)}`, { type: blob.type })
  const blobPath = URL.createObjectURL(file)
  return { path: blobPath, file, cleanup: () => URL.revokeObjectURL(blobPath) }
  // #endif
  // #ifndef H5
  let path
  // #ifdef MP-WEIXIN
  try {
    path = await compressNativeUploadImage(filePath, 80, 256, true)
    if (path !== filePath) {
      const size = async file => {
        try { return (await uniCall(options => uni.getFileInfo(options), { filePath: file })).size || 0 }
        catch (_) { return 0 }
      }
      const [originalSize, compressedSize] = await Promise.all([size(filePath), size(path)])
      if (originalSize > 0 && compressedSize >= originalSize) {
        discardUploadImage(path, filePath)
        path = filePath
      }
    }
  } catch (_) { path = filePath }
  // #endif
  // #ifndef MP-WEIXIN
  path = await compressNativeUploadImage(filePath, 80, 256, true)
  // #endif
  return { path, cleanup: () => discardUploadImage(path, filePath) }
  // #endif
}
