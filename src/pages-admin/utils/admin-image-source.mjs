// Admin image fields can contain either a complete URL or a file-manager key.
export function adminImageSource(value, baseUrl = '', { message = false } = {}) {
  const source = String(value || '').trim()
  if (!source || /^(?:https?:|data:|blob:|wxfile:|ttfile:|file:|_doc\/|_www\/)/i.test(source)) return source
  const normalized = source.replace(/\\/g, '/')
  if (/^\/?(?:files\/download|images|static|api)\//i.test(normalized)) return normalized
  const key = normalized.replace(/^\/+/, '')
  if (/^(?:chat|uploads)\//i.test(key) || (message && !normalized.startsWith('/'))) {
    return `${baseUrl.replace(/\/$/, '')}/files/download/${key.split('/').map(part => encodeURIComponent(part)).join('/')}`
  }
  return source
}
