import { photoSettings } from './h5-scan-quality.mjs'

const MAX_BLOB_BYTES = 16 * 1024 * 1024
const MAX_HEADER_BYTES = 256 * 1024
const MAX_PIXELS = 16 * 1000 * 1000
const MAX_EDGE = 8192
const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])
const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10]

function validDimensions(width, height) {
  return Number.isSafeInteger(width) && Number.isSafeInteger(height)
    && width >= 2 && height >= 2 && width <= MAX_EDGE && height <= MAX_EDGE
    && width * height <= MAX_PIXELS
}

function readU32(bytes, offset) {
  return bytes[offset] * 0x1000000 + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]
}

/** Read bounded PNG/JPEG dimensions without decoding image data. */
export function photoDimensions(input) {
  if (!(input instanceof Uint8Array) || input.length < 8 || input.length > MAX_HEADER_BYTES) return null
  const bytes = input
  if (bytes.length >= 24 && pngSignature.every((value, i) => bytes[i] === value)
    && bytes[12] === 73 && bytes[13] === 72 && bytes[14] === 68 && bytes[15] === 82) {
    const width = readU32(bytes, 16), height = readU32(bytes, 20)
    return validDimensions(width, height) ? { width, height } : null
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let cursor = 2
  while (cursor + 3 < bytes.length) {
    if (bytes[cursor++] !== 0xff) return null
    while (cursor < bytes.length && bytes[cursor] === 0xff) cursor++
    if (cursor >= bytes.length) return null
    const marker = bytes[cursor++]
    if (marker === 0xd9 || marker === 0xda) return null
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue
    if (cursor + 2 > bytes.length) return null
    const segmentLength = (bytes[cursor] << 8) | bytes[cursor + 1]
    if (segmentLength < 2 || cursor + segmentLength > bytes.length) return null
    if (SOF_MARKERS.has(marker)) {
      if (segmentLength < 7) return null
      const height = (bytes[cursor + 3] << 8) | bytes[cursor + 4]
      const width = (bytes[cursor + 5] << 8) | bytes[cursor + 6]
      return validDimensions(width, height) ? { width, height } : null
    }
    cursor += segmentLength
  }
  return null
}

function closeBitmap(bitmap) {
  try { bitmap?.close?.() } catch (_) {}
}

/** Prepare an optional high-resolution still adapter for one live video track. */
export async function preparePhotoCapture(track, runtime = {}, within = promise => promise, isActive = () => true) {
  if (!track || typeof runtime.ImageCapture !== 'function' || typeof runtime.createImageBitmap !== 'function'
    || !isActive()) return null
  let capture, capabilities
  try {
    capture = new runtime.ImageCapture(track)
    if (typeof capture.getPhotoCapabilities !== 'function' || typeof capture.takePhoto !== 'function') return null
    capabilities = await within(capture.getPhotoCapabilities(), 2500)
  } catch (_) { return null }
  if (!isActive()) return null
  let video
  try { video = track.getSettings?.() || {} } catch (_) { return null }
  const settings = photoSettings(capabilities, video)
  if (!settings) return null

  return {
    async capture() {
      if (!isActive()) return null
      const blob = await within(capture.takePhoto(settings), 6000)
      if (!isActive()) return null
      if (!(blob instanceof Blob) || blob.size <= 0 || blob.size > MAX_BLOB_BYTES) {
        throw new Error('INVALID_PHOTO_BLOB')
      }
      const header = new Uint8Array(await within(blob.slice(0, MAX_HEADER_BYTES).arrayBuffer(), 1000))
      if (!isActive()) return null
      const dimensions = photoDimensions(header)
      if (!dimensions) throw new Error('INVALID_PHOTO_DIMENSIONS')

      let abandoned = false
      let pendingBitmap = null
      const bitmapPromise = Promise.resolve().then(() => runtime.createImageBitmap.call(runtime, blob)).then(bitmap => {
        pendingBitmap = bitmap
        if (!bitmap || abandoned || !isActive()
          || !validDimensions(bitmap.width, bitmap.height)) {
          closeBitmap(bitmap); pendingBitmap = null
          return null
        }
        return bitmap
      })
      let bitmap
      try { bitmap = await within(bitmapPromise, 4000) }
      catch (error) {
        abandoned = true; closeBitmap(pendingBitmap); pendingBitmap = null
        throw error
      }
      if (!bitmap || !isActive() || !validDimensions(bitmap.width, bitmap.height)) {
        closeBitmap(bitmap); pendingBitmap = null
        return null
      }
      pendingBitmap = null
      return bitmap
    }
  }
}
