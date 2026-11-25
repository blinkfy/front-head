import { adminImageSource } from './admin-image-source.mjs'
export function adminMessageAttachment(type, content, baseUrl) {
  if (!['voice', 'video', 'file'].includes(type) || !content) return null
  let data = content
  if (typeof data === 'string' && /^\s*\{/.test(data)) {
    try { data = JSON.parse(data) } catch { return null }
  }
  const source = typeof data === 'string' ? data : data?.path || data?.url || data?.fileUrl || data?.src
  if (typeof source !== 'string' || !source.trim()) return null
  const resolved = adminImageSource(source, baseUrl, { message: true })
  const url = resolved.startsWith('/') ? `${baseUrl.replace(/\/$/, '')}${resolved}` : resolved
  if (!/^(?:https?:|wxfile:|file:|blob:|_doc\/)/i.test(url)) return null
  const name = typeof data === 'object' ? data.name || data.fileName || data.filename : ''
  return { type, url, name: String(name || ({ voice: '语音消息', video: '视频消息', file: '查看文件' })[type]) }
}

export function adminOnlineFilePreview(url, baseUrl) {
  const source = String(url || '')
  const root = `${String(baseUrl || '').replace(/\/$/, '')}/files/download/`
  return root !== '/files/download/' && source.startsWith(root)
    ? `${String(baseUrl).replace(/\/$/, '')}/files/preview/${source.slice(root.length)}` : ''
}
