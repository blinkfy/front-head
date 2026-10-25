// 原生预览只接收已下载、可解码的本地图片，避免远程加载失败后一直转圈。
export function prepareAppMapImage(src, { downloadFile, getImageInfo, createBitmap }, timeout = 15000) {
  return new Promise((resolve, reject) => {
    let settled = false
    let bitmap
    let downloadTask
    const finish = (error, path) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (bitmap) bitmap.clear()
      if (error) reject(error)
      else resolve(path)
    }
    const timer = setTimeout(() => {
      finish(new Error('图片加载超时，请重试'))
      downloadTask?.abort?.()
    }, timeout)

    try {
      if (src.startsWith('data:image/')) {
        // APP 原生查看器在部分设备上无法直接加载 data URI。
        const name = `map_preview_${Date.now()}`
        bitmap = createBitmap(name)
        bitmap.loadBase64Data(src, () => {
          if (settled) return
          bitmap.save(`_doc/${name}.png`, { overwrite: true, format: 'png' }, result => {
            if (!result.target) finish(new Error('图片保存失败，请重试'))
            else finish(null, result.target)
          }, error => finish(error))
        }, error => finish(error))
      } else if (/^https?:\/\//i.test(src)) {
        downloadTask = downloadFile({
          url: src,
          timeout,
          success: result => {
            if (settled) return
            if (result.statusCode !== 200 || !result.tempFilePath) {
              finish(new Error('图片下载失败，请重试'))
              return
            }
            getImageInfo({
              src: result.tempFilePath,
              success: () => finish(null, result.tempFilePath),
              fail: error => finish(error)
            })
          },
          fail: error => finish(error)
        })
      } else {
        finish(null, src)
      }
    } catch (error) {
      finish(error)
    }
  })
}
