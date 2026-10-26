import {
  MAX_IMAGE_BYTES,
  compressUntilWithinLimit,
  dataUrlByteLength
} from './chat-image-compression-core.mjs'

export { MAX_IMAGE_BYTES, dataUrlByteLength }

function makeTempName(extension = 'jpg') {
  const random = Math.random().toString(36).slice(2, 10)
  return `chat-image-${Date.now()}-${random}.${extension}`
}

function imageMimeFromBase64(base64, path = '') {
  const lowerPath = String(path).toLowerCase().split('?')[0]
  if (/\.png$/.test(lowerPath) || base64.startsWith('iVBORw0KGgo')) return 'image/png'
  if (/\.gif$/.test(lowerPath) || base64.startsWith('R0lGOD')) return 'image/gif'
  if (/\.webp$/.test(lowerPath) || base64.startsWith('UklGR')) return 'image/webp'
  if (/\.jpe?g$/.test(lowerPath) || base64.startsWith('/9j/')) return 'image/jpeg'
  return 'image/jpeg'
}

function makeImageDataUrl(base64, path = '') {
  return `data:${imageMimeFromBase64(base64, path)};base64,${base64}`
}

function extensionForImageDataUrl(dataUrl) {
  const mime = /^data:(image\/[^;,]+)/i.exec(String(dataUrl || ''))?.[1] || 'image/jpeg'
  return mime.split('/')[1].toLowerCase().replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '') || 'jpg'
}

function getBase64Payload(dataUrl) {
  const match = /^data:image\/[^;,]+;base64,([\s\S]*)$/i.exec(String(dataUrl || ''))
  if (!match) throw new Error('图片数据格式不正确，无法压缩。')
  return match[1].replace(/\s/g, '')
}

// #ifdef H5
function isBlob(value) {
  return typeof Blob !== 'undefined' && value instanceof Blob
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('读取图片失败，请重新选择图片。'))
    reader.readAsDataURL(blob)
  })
}

async function loadH5Image(source) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片解码失败，请重新选择图片。'))
    image.src = source
  })
}

async function compressH5Candidate(prepared, { maxEdge, quality }) {
  if (!prepared.imagePromise) {
    prepared.imagePromise = loadH5Image(prepared.objectUrl)
  }
  const image = await prepared.imagePromise
  const sourceWidth = Number(image.naturalWidth || image.width)
  const sourceHeight = Number(image.naturalHeight || image.height)
  if (!sourceWidth || !sourceHeight) throw new Error('无法读取图片尺寸。')

  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight))
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前环境无法压缩图片。')

  // JPEG 不保留透明通道，先铺白底，避免透明像素被渲染成黑色。
  context.fillStyle = '#fff'
  context.fillRect(0, 0, width, height)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, width, height)

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error('生成压缩图片失败。')),
      'image/jpeg',
      quality / 100
    )
  })
  const dataUrl = await blobToDataUrl(blob)
  return { dataUrl, filePath: dataUrl, size: blob.size }
}

async function compressH5(src) {
  if (!src) throw new Error('请选择要发送的图片。')
  let blob
  try {
    if (isBlob(src)) blob = src
    else {
      const response = await fetch(String(src))
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      blob = await response.blob()
    }
  } catch (error) {
    throw new Error('读取图片失败，请重新选择图片。')
  }

  const originalDataUrl = await blobToDataUrl(blob)
  const original = {
    dataUrl: originalDataUrl,
    filePath: originalDataUrl,
    size: blob.size
  }
  if (dataUrlByteLength(originalDataUrl) <= MAX_IMAGE_BYTES) {
    return { ...original, size: dataUrlByteLength(originalDataUrl) }
  }

  const objectUrl = URL.createObjectURL(blob)
  const prepared = { objectUrl, imagePromise: null }
  try {
    return await compressUntilWithinLimit(
      original,
      (params) => compressH5Candidate(prepared, params)
    )
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
// #endif

// #ifdef MP
function getMiniProgramFileSystem() {
  if (typeof uni !== 'undefined' && typeof uni.getFileSystemManager === 'function') {
    return uni.getFileSystemManager()
  }
  if (typeof wx !== 'undefined' && typeof wx.getFileSystemManager === 'function') {
    return wx.getFileSystemManager()
  }
  if (typeof my !== 'undefined' && typeof my.getFileSystemManager === 'function') {
    return my.getFileSystemManager()
  }
  throw new Error('当前小程序不支持图片文件读取。')
}

function getMiniProgramUserDataPath() {
  if (typeof wx !== 'undefined' && wx.env?.USER_DATA_PATH) return wx.env.USER_DATA_PATH
  if (typeof my !== 'undefined' && my.env?.USER_DATA_PATH) return my.env.USER_DATA_PATH
  if (typeof uni !== 'undefined' && uni.env?.USER_DATA_PATH) return uni.env.USER_DATA_PATH
  throw new Error('当前小程序无法创建图片临时文件。')
}

function writeMiniProgramDataUrl(dataUrl) {
  const fs = getMiniProgramFileSystem()
  const basePath = getMiniProgramUserDataPath()
  const filePath = `${basePath}/${makeTempName(extensionForImageDataUrl(dataUrl))}`
  const payload = getBase64Payload(dataUrl)
  return new Promise((resolve, reject) => {
    fs.writeFile({
      filePath,
      data: payload,
      encoding: 'base64',
      success: () => resolve(filePath),
      fail: () => reject(new Error('无法读取缓存图片，请重新选择图片。'))
    })
  })
}

function readMiniProgramDataUrl(filePath) {
  const fs = getMiniProgramFileSystem()
  return new Promise((resolve, reject) => {
    fs.readFile({
      filePath,
      encoding: 'base64',
      success: (result) => {
        if (typeof result?.data !== 'string') {
          reject(new Error('读取压缩图片失败，请重新选择图片。'))
          return
        }
        const dataUrl = makeImageDataUrl(result.data, filePath)
        if (!Number.isFinite(dataUrlByteLength(dataUrl))) {
          reject(new Error('读取压缩图片失败，请重新选择图片。'))
          return
        }
        resolve(dataUrl)
      },
      fail: () => reject(new Error('读取图片文件失败，请重新选择图片。'))
    })
  })
}

function removeMiniProgramFile(filePath) {
  if (!filePath) return Promise.resolve()
  try {
    const fs = getMiniProgramFileSystem()
    return new Promise((resolve) => fs.unlink({ filePath, success: resolve, fail: resolve }))
  } catch (error) {
    return Promise.resolve()
  }
}

function getMiniProgramImageInfo(src) {
  return new Promise((resolve, reject) => {
    uni.getImageInfo({
      src,
      success: (result) => {
        const width = Number(result?.width)
        const height = Number(result?.height)
        if (!width || !height) {
          reject(new Error('无法读取图片尺寸，请重新选择图片。'))
          return
        }
        resolve({ width, height, path: result?.path || src })
      },
      fail: () => reject(new Error('读取图片信息失败，请重新选择图片。'))
    })
  })
}

function compressMiniProgramCandidate(sourcePath, dimensions, { maxEdge, quality }) {
  const scale = Math.min(1, maxEdge / Math.max(dimensions.width, dimensions.height))
  const compressedWidth = Math.max(1, Math.round(dimensions.width * scale))
  const compressedHeight = Math.max(1, Math.round(dimensions.height * scale))
  return new Promise((resolve, reject) => {
    uni.compressImage({
      src: sourcePath,
      quality,
      compressedWidth,
      compressedHeight,
      success: async (result) => {
        const filePath = result?.tempFilePath
        if (!filePath) {
          reject(new Error('小程序没有返回压缩图片。'))
          return
        }
        try {
          const dataUrl = await readMiniProgramDataUrl(filePath)
          resolve({ dataUrl, filePath, size: dataUrlByteLength(dataUrl) })
        } catch (error) {
          await removeMiniProgramFile(filePath)
          reject(error)
        }
      },
      fail: () => reject(new Error('小程序图片压缩失败。'))
    })
  })
}

async function compressMiniProgram(src) {
  if (!src) throw new Error('请选择要发送的图片。')
  if (typeof uni === 'undefined' || typeof uni.getImageInfo !== 'function' || typeof uni.compressImage !== 'function') {
    throw new Error('当前小程序不支持图片压缩。')
  }

  const isDataUrl = /^data:image\//i.test(String(src))
  let temporarySourcePath = ''
  let sourcePath = String(src)
  if (isDataUrl) {
    temporarySourcePath = await writeMiniProgramDataUrl(sourcePath)
    sourcePath = temporarySourcePath
  }

  let result
  try {
    const imageInfo = await getMiniProgramImageInfo(sourcePath)
    sourcePath = imageInfo.path || sourcePath
    const originalDataUrl = isDataUrl ? String(src) : await readMiniProgramDataUrl(sourcePath)
    const original = {
      dataUrl: originalDataUrl,
      filePath: temporarySourcePath || sourcePath,
      size: dataUrlByteLength(originalDataUrl)
    }
    result = await compressUntilWithinLimit(
      original,
      (params) => compressMiniProgramCandidate(sourcePath, imageInfo, params),
      { onDiscard: (candidate) => removeMiniProgramFile(candidate.filePath) }
    )
    return result
  } finally {
    if (temporarySourcePath && result?.filePath !== temporarySourcePath) {
      await removeMiniProgramFile(temporarySourcePath)
    }
  }
}
// #endif

// #ifdef APP-PLUS
function appResolveFile(path) {
  return new Promise((resolve, reject) => {
    plus.io.resolveLocalFileSystemURL(path, resolve, reject)
  })
}

function decodeBase64ToBinary(base64) {
  if (typeof atob === 'function') return atob(base64)

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let result = ''
  for (let index = 0; index < base64.length; index += 4) {
    const a = alphabet.indexOf(base64[index])
    const b = alphabet.indexOf(base64[index + 1])
    const c = base64[index + 2] === '=' ? 0 : alphabet.indexOf(base64[index + 2])
    const d = base64[index + 3] === '=' ? 0 : alphabet.indexOf(base64[index + 3])
    const value = (a << 18) | (b << 12) | (c << 6) | d
    result += String.fromCharCode((value >> 16) & 0xff)
    if (base64[index + 2] !== '=') result += String.fromCharCode((value >> 8) & 0xff)
    if (base64[index + 3] !== '=') result += String.fromCharCode(value & 0xff)
  }
  return result
}

function writeAppDataUrlToFile(dataUrl) {
  const payload = getBase64Payload(dataUrl)
  const extension = extensionForImageDataUrl(dataUrl)
  const filePath = `_doc/${makeTempName(extension)}`
  const binary = decodeBase64ToBinary(payload)

  return new Promise((resolve, reject) => {
    plus.io.resolveLocalFileSystemURL('_doc/', (directory) => {
      directory.getFile(filePath.slice('_doc/'.length), { create: true, exclusive: true }, (entry) => {
        entry.createWriter((writer) => {
          writer.onwrite = () => resolve(filePath)
          writer.onerror = () => reject(new Error('无法读取缓存图片，请重新选择图片。'))
          writer.writeAsBinary(binary)
        }, () => reject(new Error('无法创建图片临时文件。')))
      }, () => reject(new Error('无法创建图片临时文件。')))
    }, () => reject(new Error('无法访问应用图片目录。')))
  })
}

function readAppDataUrl(filePath) {
  return appResolveFile(filePath).then((entry) => new Promise((resolve, reject) => {
    entry.file((file) => {
      const reader = new plus.io.FileReader()
      reader.onloadend = (event) => {
        const dataUrl = String(event?.target?.result || reader.result || '')
        if (!Number.isFinite(dataUrlByteLength(dataUrl))) {
          reject(new Error('读取压缩图片失败，请重新选择图片。'))
          return
        }
        resolve(dataUrl)
      }
      reader.onerror = () => reject(new Error('读取图片文件失败，请重新选择图片。'))
      reader.readAsDataURL(file)
    }, () => reject(new Error('读取图片文件失败，请重新选择图片。')))
  }))
}

function removeAppFile(filePath) {
  if (!filePath) return Promise.resolve()
  return appResolveFile(filePath)
    .then((entry) => new Promise((resolve) => entry.remove(resolve, resolve)))
    .catch(() => undefined)
}

function getAppImageInfo(src) {
  return new Promise((resolve, reject) => {
    uni.getImageInfo({
      src,
      success: (result) => {
        const width = Number(result?.width)
        const height = Number(result?.height)
        if (!width || !height) {
          reject(new Error('无法读取图片尺寸，请重新选择图片。'))
          return
        }
        resolve({ width, height, path: result?.path || src })
      },
      fail: () => reject(new Error('读取图片信息失败，请重新选择图片。'))
    })
  })
}

function compressAppCandidate(sourcePath, dimensions, { maxEdge, quality }) {
  const scale = Math.min(1, maxEdge / Math.max(dimensions.width, dimensions.height))
  const width = Math.max(1, Math.round(dimensions.width * scale))
  const height = Math.max(1, Math.round(dimensions.height * scale))
  const destination = `_doc/${makeTempName('jpg')}`
  return new Promise((resolve, reject) => {
    plus.zip.compressImage({
      src: sourcePath,
      dst: destination,
      overwrite: true,
      format: 'jpg',
      quality,
      width: `${width}px`,
      height: `${height}px`
    }, async () => {
      try {
        const dataUrl = await readAppDataUrl(destination)
        resolve({ dataUrl, filePath: destination, size: dataUrlByteLength(dataUrl) })
      } catch (error) {
        await removeAppFile(destination)
        reject(error)
      }
    }, async () => {
      await removeAppFile(destination)
      reject(new Error('APP 图片压缩失败。'))
    })
  })
}

async function compressApp(src) {
  if (!src) throw new Error('请选择要发送的图片。')
  if (typeof uni === 'undefined' || typeof uni.getImageInfo !== 'function') {
    throw new Error('当前 APP 不支持读取图片信息。')
  }

  const isDataUrl = /^data:image\//i.test(String(src))
  let temporarySourcePath = ''
  let sourcePath = String(src)
  if (isDataUrl) {
    temporarySourcePath = await writeAppDataUrlToFile(sourcePath)
    sourcePath = temporarySourcePath
  }

  let result
  try {
    const imageInfo = await getAppImageInfo(sourcePath)
    sourcePath = imageInfo.path || sourcePath
    const originalDataUrl = isDataUrl ? String(src) : await readAppDataUrl(sourcePath)
    const original = {
      dataUrl: originalDataUrl,
      filePath: temporarySourcePath || sourcePath,
      size: dataUrlByteLength(originalDataUrl)
    }
    result = await compressUntilWithinLimit(
      original,
      (params) => compressAppCandidate(sourcePath, imageInfo, params),
      { onDiscard: (candidate) => removeAppFile(candidate.filePath) }
    )
    return result
  } finally {
    if (temporarySourcePath && result?.filePath !== temporarySourcePath) {
      await removeAppFile(temporarySourcePath)
    }
  }
}
// #endif

export async function compressChatImage(src) {
  // #ifdef H5
  return compressH5(src)
  // #endif

  // #ifdef APP-PLUS
  return compressApp(src)
  // #endif

  // #ifdef MP
  return compressMiniProgram(src)
  // #endif

  throw new Error('当前平台暂不支持聊天图片压缩。')
}
