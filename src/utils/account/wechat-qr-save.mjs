export function getWechatQrMenuPosition(event, { width, height, scrollX = 0, scrollY = 0 }) {
  const touch = event?.touches?.[0] || event?.changedTouches?.[0] || event?.detail?.touches?.[0]
  const x = touch?.clientX ?? event?.clientX ?? event?.detail?.x ?? (touch?.pageX != null ? touch.pageX - scrollX : width / 2)
  const y = touch?.clientY ?? event?.clientY ?? event?.detail?.y ?? (touch?.pageY != null ? touch.pageY - scrollY : height / 2)
  // Keep the small menu beside the finger and within the viewport.
  return { left: Math.max(8, Math.min(x + 8, width - 156)),
    top: Math.max(8, Math.min(y + 8, height - 56)) }
}

export async function saveWechatQrToAlbum({ src, downloadFile, saveImageToPhotosAlbum }) {
  if (!src) throw new Error('二维码尚未加载，请稍后重试')
  const file = await new Promise((resolve, reject) => downloadFile({
    url: src, timeout: 15000, success: resolve, fail: reject
  }))
  if (file.statusCode !== 200 || !file.tempFilePath) throw new Error('二维码下载失败，请刷新后重试')
  await new Promise((resolve, reject) => saveImageToPhotosAlbum({
    filePath: file.tempFilePath, success: resolve, fail: reject
  }))
}

export async function downloadWechatQr({ src, fetchImage = fetch, documentRef = document,
  urlApi = URL, schedule = setTimeout, cancel = clearTimeout }) {
  if (!src) throw new Error('二维码尚未加载，请稍后重试')
  const controller = new AbortController()
  const timeout = schedule(() => controller.abort(), 15000)
  try {
    const response = await fetchImage(src, { signal: controller.signal, credentials: 'omit' })
    if (!response.ok) throw new Error('二维码下载失败，请刷新后重试')
    const blob = await response.blob()
    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
      'image/gif': 'gif', 'image/svg+xml': 'svg' }[blob.type]
    if (!extension || !blob.size) throw new Error('二维码图片无效，请刷新后重试')
    const objectUrl = urlApi.createObjectURL(blob)
    const link = documentRef.createElement('a')
    try {
      link.href = objectUrl
      link.download = `分投侠-小程序码.${extension}`
      documentRef.body.appendChild(link)
      link.click()
    } finally {
      link.remove()
      schedule(() => urlApi.revokeObjectURL(objectUrl), 1000)
    }
  } finally { cancel(timeout) }
}
