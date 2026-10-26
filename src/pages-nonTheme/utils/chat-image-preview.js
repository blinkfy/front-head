import { prepareAppMapImage } from '@/utils/map-image-preview.mjs'

// H5 可直接预览 data URL；原生预览器使用本地文件，远端地址保留原有鉴权参数。
export async function resolveChatPreviewSource(source) {
  // #ifdef APP-PLUS
  return prepareAppMapImage(source, {
    downloadFile: options => uni.downloadFile(options),
    getImageInfo: options => uni.getImageInfo(options),
    createBitmap: name => new plus.nativeObj.Bitmap(name)
  })
  // #endif

  // #ifdef MP
  if (source.startsWith('data:image/')) {
    const match = /^data:image[/](png|jpeg|jpg|webp|gif|bmp);base64,([\s\S]+)$/i.exec(source)
    if (!match) throw new Error('图片数据格式无效')
    const root = (typeof wx !== 'undefined' && wx.env?.USER_DATA_PATH) ||
      (typeof my !== 'undefined' && my.env?.USER_DATA_PATH) || uni.env?.USER_DATA_PATH
    const fileSystem = uni.getFileSystemManager?.()
    if (!root || !fileSystem) throw new Error('当前小程序无法读取图片，请重试')
    const extension = match[1].toLowerCase().replace('jpeg', 'jpg')
    const path = `${root}/ai_chat_preview_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extension}`
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('图片加载超时，请重试')), 15000)
      const finish = error => {
        clearTimeout(timer)
        if (error) reject(new Error('图片读取失败，请重试'))
        else resolve(path)
      }
      try {
        fileSystem.writeFile({
          filePath: path, data: match[2].replace(/\s/g, ''), encoding: 'base64',
          success: () => finish(), fail: finish
        })
      } catch (error) { finish(error) }
    })
  }
  // #endif

  return source
}
