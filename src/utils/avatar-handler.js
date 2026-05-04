/**
 * 头像处理工具
 * 提供头像压缩、编码、识别等功能
 */

/**
 * 压缩图片到指定大小并转换为 Base64
 * @param {string} filePath - 图片文件路径（临时路径）
 * @param {number} maxWidth - 最大宽度，默认 64
 * @param {number} maxHeight - 最大高度，默认 64
 * @param {number} quality - 压缩质量，0-1，默认 0.8
 * @returns {Promise<string>} Base64 字符串
 */
export async function compressImageToBase64(filePath, maxWidth = 64, maxHeight = 64, quality = 0.8) {
  return new Promise((resolve, reject) => {
    // 获取图片信息
    uni.getImageInfo({
      src: filePath,
      success: (imageInfo) => {
        // 在 H5 环境中直接使用 Image 对象和 Canvas
        if (typeof window !== 'undefined' && window.HTMLCanvasElement) {
          // H5 环境
          handleH5Image(filePath, imageInfo, maxWidth, maxHeight, quality, resolve, reject)
        } else {
          // 小程序/APP 环境
          handleNativeImage(filePath, imageInfo, maxWidth, maxHeight, resolve, reject)
        }
      },
      fail: (err) => {
        console.error('获取图片信息失败:', err)
        reject(err)
      }
    })
  })
}

/**
 * H5 环境图片处理
 */
function handleH5Image(filePath, imageInfo, maxWidth, maxHeight, quality, resolve, reject) {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      
      canvas.width = maxWidth
      canvas.height = maxHeight
      
      const originWidth = imageInfo.width
      const originHeight = imageInfo.height
      
      // 计算缩放后的尺寸
      let width = originWidth
      let height = originHeight
      
      if (width > maxWidth || height > maxHeight) {
        if (width / height >= maxWidth / maxHeight) {
          width = maxWidth
          height = Math.round((originHeight * maxWidth) / originWidth)
        } else {
          height = maxHeight
          width = Math.round((originWidth * maxHeight) / originHeight)
        }
      }
      
      // 居中绘制
      const x = (maxWidth - width) / 2
      const y = (maxHeight - height) / 2
      
      // 清空 canvas
      ctx.fillStyle = 'transparent'
      ctx.fillRect(0, 0, maxWidth, maxHeight)
      
      // 绘制图片
      ctx.drawImage(img, x, y, width, height)
      
      // 转换为 Base64
      const base64 = canvas.toDataURL('image/png', quality)
      resolve(base64)
    } catch (error) {
      console.error('H5 图片处理失败:', error)
      reject(error)
    }
  }
  
  img.onerror = () => {
    console.error('H5 图片加载失败')
    reject(new Error('H5 图片加载失败'))
  }
  
  img.src = filePath
}

/**
 * 小程序/APP 环境图片处理
 */
function handleNativeImage(filePath, imageInfo, maxWidth, maxHeight, resolve, reject) {
  const canvas = uni.createCanvasContext('avatar-canvas')
  const originWidth = imageInfo.width
  const originHeight = imageInfo.height

  // 计算缩放后的尺寸
  let width = originWidth
  let height = originHeight

  if (width > maxWidth || height > maxHeight) {
    if (width / height >= maxWidth / maxHeight) {
      width = maxWidth
      height = Math.round((originHeight * maxWidth) / originWidth)
    } else {
      height = maxHeight
      width = Math.round((originWidth * maxHeight) / originHeight)
    }
  }

  // 居中绘制
  const x = (maxWidth - width) / 2
  const y = (maxHeight - height) / 2

  canvas.clearRect(0, 0, maxWidth, maxHeight)
  canvas.drawImage(filePath, x, y, width, height)

  // 转换为 Base64
  canvas.draw(false, () => {
    uni.canvasToTempFilePath(
      {
        canvasId: 'avatar-canvas',
        success: (res) => {
          const tempFilePath = res.tempFilePath
          
          // 检查是否支持 getFileSystemManager（小程序/APP）
          if (typeof uni.getFileSystemManager === 'function') {
            // 读取文件并转换为 Base64
            uni.getFileSystemManager().readFile({
              filePath: tempFilePath,
              encoding: 'base64',
              success: (data) => {
                const base64 = 'data:image/png;base64,' + data.data
                resolve(base64)
              },
              fail: (err) => {
                console.error('读取文件失败:', err)
                reject(err)
              }
            })
          } else {
            // 降级处理：直接使用 tempFilePath 作为临时 URL
            console.warn('getFileSystemManager 不支持，使用 tempFilePath 作为临时 URL')
            resolve(tempFilePath)
          }
        },
        fail: (err) => {
          console.error('Canvas 转换失败:', err)
          reject(err)
        }
      }
    )
  })
}

/**
 * 判断头像类型
 * @param {string} avatar - 头像字符串
 * @returns {string} 'base64' | 'url' | 'static' | 'unknown'
 */
export function getAvatarType(avatar) {
  if (!avatar) return 'unknown'

  if (avatar.startsWith('data:image/')) {
    return 'base64'
  }

  if (avatar.startsWith('/static/')) {
    return 'static'
  }

  if (avatar.startsWith('http://') || avatar.startsWith('https://')) {
    return 'url'
  }

  if (avatar.startsWith('blob:')) {
    return 'blob'
  }

  return 'unknown'
}

/**
 * 获取可用的头像 URL
 * @param {string} avatar - 头像字符串
 * @param {string} baseUrl - 基础 URL（用于 static 路径）
 * @returns {string} 可用的头像 URL
 */
export function getAvatarUrl(avatar, baseUrl = '') {
  if (!avatar) {
    return '/static/person.webp.png'
  }

  const type = getAvatarType(avatar)

  switch (type) {
    case 'base64':
      // Base64 可以直接用作 src
      return avatar

    case 'static':
      // /static/ 路径需要补全基础 URL
      if (baseUrl) {
        return baseUrl + avatar
      }
      return avatar

    case 'url':
      // 完整 URL 直接返回
      return avatar

    case 'blob':
      // Blob URL 直接返回
      return avatar

    default:
      return '/static/person.webp.png'
  }
}

/**
 * 将 Base64 转换为 Blob URL（仅在需要时）
 * @param {string} base64String - Base64 字符串（包括 data:image/...;base64, 前缀）
 * @returns {string} Blob URL
 */
export function base64ToBlobUrl(base64String) {
  try {
    // 提取 Base64 数据（移除前缀）
    const base64Data = base64String.split(',')[1]
    const byteCharacters = atob(base64Data)
    const byteNumbers = new Array(byteCharacters.length)

    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }

    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], { type: 'image/png' })

    return URL.createObjectURL(blob)
  } catch (error) {
    console.error('Base64 转 Blob 失败:', error)
    return null
  }
}

/**
 * 获取头像的显示信息
 * @param {string} avatar - 头像字符串
 * @returns {object} { type, displayUrl, isLocal }
 */
export function getAvatarInfo(avatar) {
  const type = getAvatarType(avatar)
  const displayUrl = getAvatarUrl(avatar)

  return {
    type,
    displayUrl,
    isLocal: type === 'static' || type === 'base64',
    isRemote: type === 'url',
    isData: type === 'base64'
  }
}

/**
 * 验证头像尺寸
 * @param {string} avatar - 头像字符串（Base64 格式）
 * @returns {object} { isValid, width, height, size, message }
 */
export function validateAvatarSize(avatar) {
  if (!avatar || !avatar.startsWith('data:image/')) {
    return {
      isValid: false,
      message: '无效的头像格式'
    }
  }

  try {
    // 估算 Base64 字符串的字节大小
    const base64Data = avatar.split(',')[1]
    const byteSize = Math.ceil((base64Data.length * 3) / 4)

    // 检查大小是否在合理范围内（64x64 PNG 通常在 1-10KB）
    const isValid = byteSize < 100 * 1024 // 100KB 上限

    return {
      isValid,
      size: byteSize,
      message: isValid ? '头像大小正常' : '头像过大，请重新上传'
    }
  } catch (error) {
    return {
      isValid: false,
      message: '无法验证头像'
    }
  }
}
