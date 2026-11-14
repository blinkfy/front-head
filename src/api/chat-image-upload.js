import { config } from './config.js'
import { compressChatImage, dataUrlByteLength, MAX_IMAGE_BYTES } from '@/pages-nonTheme/utils/chat-image-compression.js'

const unsupported = status => [404, 405, 501].includes(Number(status))
const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value } catch (_) { return null } }

// Only explicit unsupported-endpoint responses fall back to the legacy transport.
// Authentication, quota, timeout and upload errors must not trigger another large request.
export async function uploadChatImage(dataUrl, filePath = '', token = '', isCurrent = () => true) {
  // Cached BMPs from older clients also pass through the encoder, even when already below 500 KiB.
  if (/^data:image\/bmp;base64,/i.test(dataUrl || '')) {
    const converted = await compressChatImage(dataUrl)
    dataUrl = converted.dataUrl
    filePath = converted.filePath || ''
  }
  if (!dataUrl || !/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(dataUrl)) throw new Error('图片无法读取，请重新选择')
  if (dataUrlByteLength(dataUrl) > MAX_IMAGE_BYTES) throw new Error('图片需压缩到500KB以内')
  if (!isCurrent()) throw new Error('已取消发送')
  let status, payload
  // #ifdef H5
  const match = /^data:(image\/[^;]+);base64,([\s\S]*)$/.exec(dataUrl)
  const bytes = atob(match[2].replace(/\s/g, ''))
  const array = new Uint8Array(bytes.length)
  for (let index = 0; index < bytes.length; index++) array[index] = bytes.charCodeAt(index)
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[match[1]] || 'jpg'
  const form = new FormData()
  form.append('image', new Blob([array], { type: match[1] }), `chat.${extension}`)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const response = await fetch(`${config.baseUrl}/api/ai/chat/uploads`, { method: 'POST', headers: { Authorization: token }, body: form, signal: controller.signal })
    status = response.status
    payload = await response.json().catch(() => null)
  } finally { clearTimeout(timeout) }
  // #endif
  // #ifndef H5
  if (!filePath || /^data:|^https?:/i.test(filePath)) filePath = (await compressChatImage(dataUrl)).filePath
  if (!isCurrent()) throw new Error('已取消发送')
  const response = await new Promise((resolve, reject) => uni.uploadFile({
    url: `${config.baseUrl}/api/ai/chat/uploads`, filePath, name: 'image', header: { Authorization: token }, timeout: 30000,
    success: resolve, fail: reject
  }))
  status = response.statusCode
  payload = parse(response.data)
  // #endif
  if (!isCurrent()) throw new Error('已取消发送')
  if (unsupported(status)) return { imageBase64: dataUrl }
  if (Number(status) >= 400 || payload?.code !== 0 || !/^[a-f0-9-]{36}$/i.test(payload?.data?.id || '')) {
    throw new Error(payload?.msg || '图片上传失败，请重试')
  }
  return { imageUploadId: payload.data.id, expiresAt: payload.data.expiresAt }
}

// Strip the local cache envelope from the transport.
export const imageUploadFields = image => image?.imageUploadId ? { imageUploadId: image.imageUploadId } : image?.imageBase64 ? { imageBase64: image.imageBase64 } : {}

export async function prepareMessageImageUpload(item, token, isCurrent = () => true) {
  if (!isCurrent()) throw new Error('已取消发送')
  const cached = item?._imageUpload
  if (cached?.owner === token && cached.imageUploadId && Date.parse(cached.expiresAt) > Date.now() + 30000) return imageUploadFields(cached)
  const uploaded = await uploadChatImage(item.imageBase64, item._localImagePath || '', token, isCurrent)
  if (uploaded.imageUploadId) item._imageUpload = { ...uploaded, owner: token }
  return imageUploadFields(uploaded)
}
