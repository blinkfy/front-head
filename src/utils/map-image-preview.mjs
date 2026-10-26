function imageError(error, stage) {
  const result = new Error(stage + '，请重试')
  result.stage = stage
  result.code = error?.code
  result.detail = error?.errMsg || error?.message || (typeof error === 'string' ? error : '')
  return result
}

function normalizeRemoteImagePath(src) {
  // 接口中的旧图片路径可能使用 Windows 分隔符；只处理路径，保留查询参数和签名。
  const suffixIndex = src.search(/[?#]/)
  const path = suffixIndex < 0 ? src : src.slice(0, suffixIndex)
  const suffix = suffixIndex < 0 ? '' : src.slice(suffixIndex)
  return path.replace(/\\/g, '/') + suffix
}

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
      try { bitmap?.clear() } catch (_) {}
      if (error) reject(error)
      else resolve(path)
    }
    const timer = setTimeout(() => {
      finish(new Error('图片加载超时，请重试'))
      downloadTask?.abort?.()
    }, timeout)

    try {
      if (typeof src !== 'string' || !src.trim()) {
        finish(new Error('图片地址无效'))
        return
      }
      src = src.trim()
      if (src.startsWith('data:image/')) {
        // APP 原生查看器在部分设备上无法直接加载 data URI。
        const name = `map_preview_${Date.now()}`
        bitmap = createBitmap(name)
        bitmap.loadBase64Data(src, () => {
          if (settled) return
          bitmap.save(`_doc/${name}.png`, { overwrite: true, format: 'png' }, result => {
            if (!result.target) finish(new Error('图片保存失败，请重试'))
            else finish(null, result.target)
          }, error => finish(imageError(error, '图片保存失败')))
        }, error => finish(imageError(error, '图片解码失败')))
      } else if (/^https?:\/\//i.test(src)) {
        downloadTask = downloadFile({
          url: normalizeRemoteImagePath(src),
          timeout,
          success: result => {
            if (settled) return
            if (result.statusCode !== 200 || !result.tempFilePath) {
              finish(imageError({ code: result.statusCode, message: result.tempFilePath ? 'HTTP ' + result.statusCode : '未返回本地图片路径' }, '图片下载失败'))
              return
            }
            getImageInfo({
              src: result.tempFilePath,
              success: info => finish(null, info?.path || result.tempFilePath),
              fail: error => finish(imageError(error, '图片解码失败'))
            })
          },
          fail: error => finish(imageError(error, '图片下载失败'))
        })
      } else {
        finish(null, src)
      }
    } catch (error) {
      finish(imageError(error, '图片准备失败'))
    }
  })
}
