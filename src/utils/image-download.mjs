// Credentials are added only to the API-owned relative path, never to a provider URL.
export function resolveUpcyclingImage(value, baseUrl = '', token = '') {
  const source = typeof value === 'string' ? value.trim() : ''
  if (/^data:image\/(?:png|jpe?g|webp|gif|bmp);base64,[a-z0-9+/=\s]+$/i.test(source)) return source
  if (/^\/api\/recognition_history\/upcycling-image\/[1-9]\d*$/.test(source)) {
    return `${String(baseUrl).replace(/\/+$/, '')}${source}?token=${encodeURIComponent(token || '')}`
  }
  if (/^https?:\/\/[^\s/]+(?:[/?#]|$)/i.test(source)) return source
  return ''
}
