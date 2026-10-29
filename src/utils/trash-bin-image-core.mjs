export const TRASH_BIN_IMAGE_LIMIT = 500 * 1024

const DEFAULT_BIN_IMAGES = Object.freeze({
  waste_basket: 'waste_basket.webp',
  waste_disposal: 'waste_disposal.webp',
  recycling: 'recycling.webp'
})

export function imageDataBytes(value) {
  const encoded = String(value || '').split(',')[1] || ''
  return Math.floor(encoded.length * 3 / 4) - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0)
}

export function imageMimeFromBase64(value) {
  if (value.startsWith('/9j/')) return 'image/jpeg'
  if (value.startsWith('iVBORw0KGgo')) return 'image/png'
  if (value.startsWith('R0lGOD')) return 'image/gif'
  if (value.startsWith('UklGR')) return 'image/webp'
  return ''
}

export function normalizeImageData(value) {
  const text = String(value || '').trim()
  const match = /^data:image\/(jpeg|jpg|png|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/i.exec(text)
  if (match) {
    const encoded = match[2].replace(/\s/g, '')
    if (encoded.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return ''
    const format = match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase()
    return `data:image/${format};base64,${encoded}`
  }
  const encoded = text.replace(/\s/g, '')
  const mime = imageMimeFromBase64(encoded)
  return mime && encoded.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(encoded) ? `data:${mime};base64,${encoded}` : ''
}

export function resolveStoredBinImage(value, baseUrl = '', mapType = '') {
  if (typeof value === 'string' && value.trim()) {
    const text = value.trim()
    const data = normalizeImageData(text)
    if (data) return data
    if (/^data:/i.test(text)) return ''
    if (/^(?:https?:|blob:|wxfile:|ttfile:|file:|_doc\/|_www\/)/i.test(text)) return text
    return `${baseUrl.replace(/\/$/, '')}/${text.replace(/\\/g, '/').replace(/^\/+/, '')}`
  }

  if (!mapType) return ''
  const filename = DEFAULT_BIN_IMAGES[mapType] || DEFAULT_BIN_IMAGES.waste_basket
  return `${baseUrl.replace(/\/$/, '')}/images/${filename}`
}

// Every candidate is measured; platforms ignoring quality/size must fail rather than upload an oversized file.
export async function encodeBinImageWithinLimit(width, height, encode, limit = TRASH_BIN_IMAGE_LIMIT) {
  if (!(width > 0 && height > 0)) throw new Error('图片尺寸无效，请重新选图')
  for (let attempt = 0; attempt < 18; attempt++) {
    const maximumSide = Math.max(96, Math.round(1600 * .8 ** Math.max(0, attempt - 3)))
    const scale = Math.min(1, maximumSide / Math.max(width, height))
    const targetWidth = Math.max(1, Math.round(width * scale))
    const targetHeight = Math.max(1, Math.round(height * scale))
    const quality = .86 * .8 ** (attempt % 4)
    const candidate = normalizeImageData(await encode({ width: targetWidth, height: targetHeight, quality }))
    if (candidate && imageDataBytes(candidate) > 0 && imageDataBytes(candidate) <= limit) return candidate
  }
  throw new Error('图片未能压缩到 500KB 以内，请换一张图片')
}
