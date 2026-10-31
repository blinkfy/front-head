import { createBrowserRoundCodeDecoder } from './h5-roundcode-local.js'
import { createWebGeneratedCodeRegistrar } from './h5-generated-roundcode-core.mjs'

// Canvas conversion stays local; only the exact decoded bytes are registered.
export function createGeneratedImageDecoder() {
  const decoder = createBrowserRoundCodeDecoder()
  let closed = false, image = null, cancelLoad = null
  const current = isCurrent => !closed && isCurrent()
  return {
    get available() { return decoder.available },
    async decode(encoded, mime, isCurrent) {
      if (!current(isCurrent)) return { error: 'CANCELLED' }
      let bitmap
      try {
        const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0))
        const blob = new Blob([bytes], { type: mime })
        if (typeof createImageBitmap === 'function') bitmap = await createImageBitmap(blob)
        else {
          image = new Image()
          const pendingImage = image, url = URL.createObjectURL(blob)
          try {
            await new Promise((resolve, reject) => {
              cancelLoad = () => reject(new Error('CANCELLED'))
              pendingImage.onload = resolve; pendingImage.onerror = reject; pendingImage.src = url
            })
            bitmap = pendingImage
          } finally { cancelLoad = null; URL.revokeObjectURL(url) }
        }
        if (!current(isCurrent)) return { error: 'CANCELLED' }
        const width = bitmap.width || bitmap.naturalWidth, height = bitmap.height || bitmap.naturalHeight
        if (!width || !height || width > 1600 || height > 1600) return { error: 'INVALID_IMAGE' }
        const canvas = document.createElement('canvas'), context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) return { error: 'UNSUPPORTED' }
        try {
          for (const edge of [192, 288]) {
            if (!current(isCurrent)) return { error: 'CANCELLED' }
            const scale = Math.min(1, edge / Math.max(width, height))
            canvas.width = Math.max(24, Math.round(width * scale)); canvas.height = Math.max(24, Math.round(height * scale))
            context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
            const result = await decoder.decode(context.getImageData(0, 0, canvas.width, canvas.height))
            if (!current(isCurrent)) return { error: 'CANCELLED' }
            if (!['NO_CODE', 'WRONG_CODE_TYPE'].includes(result.error)) return result
          }
          return { error: 'NO_CODE' }
        } finally { canvas.width = canvas.height = 0 }
      } catch (_) { return { error: 'DECODER_UNAVAILABLE' } }
      finally { bitmap?.close?.(); if (image) { image.onload = image.onerror = null; image.src = ''; image = null } }
    },
    close() { closed = true; decoder.close(); cancelLoad?.(); if (image) image.src = '' }
  }
}

export function createBrowserGeneratedCodeClient({ baseUrl, transport, getIdentity }) {
  return createWebGeneratedCodeRegistrar({ baseUrl, transport, getIdentity,
    createDecoder: createGeneratedImageDecoder, decodeBase64: encoded => atob(encoded),
    encodeImage: bytes => uni.arrayBufferToBase64(bytes) })
}
