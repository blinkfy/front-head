import { config } from '@/api/config.js'
import { prepareAppMapImage } from './map-image-preview.mjs'
// #ifdef MP-WEIXIN
import { compressWechatUploadImage } from './mp-upload-image.js'
// #endif
import { encodeBinImageWithinLimit, imageDataBytes, imageMimeFromBase64, normalizeImageData, resolveStoredBinImage, TRASH_BIN_IMAGE_LIMIT } from './trash-bin-image-core.mjs'

let cachedPreviewPath = ''

export const resolveTrashBinImage = (value, mapType) => resolveStoredBinImage(value, config.baseUrl, mapType)
// Keep API calls static so H5 production builds retain their implementations.
const uniCall = (invoke, options) => new Promise((resolve, reject) => invoke({ ...options, success: resolve, fail: reject }))

function photoProcessingError(stage, error) {
  return Object.assign(new Error(`${stage}，请重新选择照片`), {
    stage, code: error?.code ?? error?.errCode,
    detail: error?.errMsg || error?.message || error?.target?.error?.message || ''
  })
}

function fileSystem() {
  if (uni.getFileSystemManager) return uni.getFileSystemManager()
  // #ifdef MP-ALIPAY
  if (typeof my !== 'undefined' && my.getFileSystemManager) return my.getFileSystemManager()
  // #endif
  throw new Error('当前平台无法读取图片，请重新选图')
}

function readImageData(path) {
  // #ifdef APP-PLUS
  return new Promise((resolve, reject) => {
    const failed = error => reject(photoProcessingError('照片文件读取失败', error))
    plus.io.resolveLocalFileSystemURL(path, entry => entry.file(file => {
      const reader = new plus.io.FileReader()
      reader.onloadend = event => {
        const data = String(event?.target?.result || reader.result || '')
        if (data) resolve(data)
        else failed(new Error('empty_image_data'))
      }
      reader.onerror = failed
      reader.readAsDataURL(file)
    }, failed), failed)
  })
  // #endif
  // #ifndef APP-PLUS
  return new Promise((resolve, reject) => fileSystem().readFile({
    filePath: path, encoding: 'base64',
    success: result => {
      const encoded = String(result.data || '')
      resolve(`data:${imageMimeFromBase64(encoded) || 'application/octet-stream'};base64,${encoded}`)
    }, fail: reject
  }))
  // #endif
}

function discardCompressedFile(path, original) {
  if (!path || path === original) return
  // #ifdef APP-PLUS
  plus.io.resolveLocalFileSystemURL(path, entry => entry.remove(() => {}, () => {}), () => {})
  // #endif
  // #ifndef APP-PLUS
  try { fileSystem().unlink({ filePath: path, fail: () => {} }) } catch (_) {}
  // #endif
}

async function compressNativeImage(src, dimensions, info = dimensions) {
  let path
  try {
    // #ifdef APP-PLUS
    path = await new Promise((resolve, reject) => plus.zip.compressImage({
      src, dst: `_doc/trash_bin_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`,
      overwrite: true, format: 'jpg', quality: Math.round(dimensions.quality * 100),
      width: `${dimensions.width}px`, height: `${dimensions.height}px`
    }, result => resolve(result.target), error => reject(photoProcessingError('照片压缩失败', error))))
    // #endif
    // #ifdef MP-WEIXIN
    const keepAlpha = !['jpg', 'jpeg', 'image/jpeg'].includes(String(info.type || '').toLowerCase())
    path = await compressWechatUploadImage(src, info, Math.round(dimensions.quality * 100), Math.max(dimensions.width, dimensions.height), keepAlpha)
    if (!path && keepAlpha) throw new Error('暂时无法在保留透明背景的同时压缩此图片，请换一张图片')
    // #endif
    // #ifndef APP-PLUS
    if (!path) {
      const result = await uniCall(options => uni.compressImage(options), {
        src, quality: Math.round(dimensions.quality * 100),
        compressedWidth: dimensions.width, compressedHeight: dimensions.height
      })
      path = result.tempFilePath || result.apFilePath
    }
    // #endif
    if (!path) throw new Error('图片压缩失败，请重新选图')
    return await readImageData(path)
  } finally {
    discardCompressedFile(path, src)
  }
}

export async function compressTrashBinImage(filePath) {
  if (!filePath) throw new Error('请先选择图片')
  // #ifdef H5
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = async () => {
      const canvas = document.createElement('canvas')
      try {
        const context = canvas.getContext('2d')
        if (!context) throw new Error('无法处理图片，请换一张图片')
        resolve(await encodeBinImageWithinLimit(image.naturalWidth, image.naturalHeight, ({ width, height, quality }) => {
          canvas.width = width
          canvas.height = height
          context.fillStyle = '#ffffff'
          context.fillRect(0, 0, width, height)
          context.drawImage(image, 0, 0, width, height)
          // Unsupported encoders return PNG; inspect the MIME instead of relabeling the bytes.
          const webp = canvas.toDataURL('image/webp', quality)
          return webp.startsWith('data:image/webp;') ? webp : canvas.toDataURL('image/jpeg', quality)
        }))
      } catch (error) { reject(error) }
      finally { canvas.width = canvas.height = 0 }
    }
    image.onerror = () => reject(new Error('图片读取失败，请重新选图'))
    image.src = filePath
  })
  // #endif
  // #ifndef H5
  let info
  try { info = await uniCall(options => uni.getImageInfo(options), { src: filePath }) }
  catch (error) { throw photoProcessingError('照片信息读取失败', error) }
  // #ifdef APP-PLUS
  // Album files can be readable by the native image decoder but not by FileReader.
  // Read Base64 only from our own compressed temporary file, never the album original.
  return encodeBinImageWithinLimit(info.width, info.height,
    dimensions => compressNativeImage(info.path || filePath, dimensions, info))
  // #endif
  // #ifndef APP-PLUS
  const original = normalizeImageData(await readImageData(filePath))
  // #ifdef MP-WEIXIN
  let candidatePath
  try {
    const keepAlpha = !['jpg', 'jpeg', 'image/jpeg'].includes(String(info.type || '').toLowerCase())
    candidatePath = await compressWechatUploadImage(filePath, info, 86, 1600, keepAlpha)
    if (candidatePath) {
      const candidate = normalizeImageData(await readImageData(candidatePath))
      const bytes = imageDataBytes(candidate)
      if (candidate && bytes > 0 && bytes <= TRASH_BIN_IMAGE_LIMIT && (!original || bytes < imageDataBytes(original))) return candidate
    }
  } catch (_) {}
  finally { discardCompressedFile(candidatePath, filePath) }
  // #endif
  if (original && imageDataBytes(original) > 0 && imageDataBytes(original) <= TRASH_BIN_IMAGE_LIMIT) return original
  return encodeBinImageWithinLimit(info.width, info.height, dimensions => compressNativeImage(filePath, dimensions, info))
  // #endif
  // #endif
}

export async function previewTrashBinImage(value, { onReady } = {}) {
  let path = resolveTrashBinImage(value)
  if (!path) throw new Error('暂无图片')
  let temporaryPath = ''
  // #ifdef APP-PLUS
  const isEmbedded = path.startsWith('data:image/')
  if (isEmbedded && cachedPreviewPath) {
    discardCompressedFile(cachedPreviewPath)
    cachedPreviewPath = ''
  }
  path = await prepareAppMapImage(path, {
    downloadFile: options => uni.downloadFile(options),
    getImageInfo: options => uni.getImageInfo(options),
    createBitmap: name => new plus.nativeObj.Bitmap(name)
  })
  if (isEmbedded) temporaryPath = path
  // #endif
  // #ifndef H5
  // #ifndef APP-PLUS
  if (path.startsWith('data:image/')) {
    const fs = fileSystem()
    let root = uni.env?.USER_DATA_PATH
    // #ifdef MP-ALIPAY
    root = root || (typeof my !== 'undefined' && my.env?.USER_DATA_PATH)
    // #endif
    if (!root) throw new Error('当前平台无法准备图片预览')
    const ext = path.startsWith('data:image/png') ? 'png' : path.startsWith('data:image/webp') ? 'webp' : path.startsWith('data:image/gif') ? 'gif' : 'jpg'
    temporaryPath = `${root}/bin_preview_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    if (cachedPreviewPath) discardCompressedFile(cachedPreviewPath)
    cachedPreviewPath = ''
    await new Promise((resolve, reject) => fs.writeFile({ filePath: temporaryPath, data: path.split(',')[1], encoding: 'base64', success: resolve, fail: reject }))
    path = temporaryPath
  }
  // #endif
  // #endif
  try {
    onReady?.()
    await uniCall(options => uni.previewImage(options), { urls: [path], current: path })
  } catch (error) {
    if (temporaryPath) discardCompressedFile(temporaryPath)
    throw error
  }
  // Keep the active preview file until the next preview, avoiding both early removal and unbounded cache growth.
  if (temporaryPath) cachedPreviewPath = temporaryPath
}
