// Match object-fit: cover and optional centered digital zoom without stretching pixels.
export function cameraFrame(width, height, viewWidth, viewHeight, zoom = 1) {
  if (!(width > 0 && height > 0)) return null
  const ratio = viewWidth > 0 && viewHeight > 0 ? viewWidth / viewHeight : width / height
  let cropWidth = width, cropHeight = height
  if (width / height > ratio) cropWidth = height * ratio
  else cropHeight = width / ratio
  const scale = Number.isFinite(zoom) ? Math.max(1, zoom) : 1
  cropWidth /= scale; cropHeight /= scale
  return { left: (width - cropWidth) / 2, top: (height - cropHeight) / 2, width: cropWidth, height: cropHeight }
}

// Mild bounded edge enhancement only for a failed QR retry; never changes alpha.
export function sharpenQrImage(image) {
  const { width, height, data } = image
  if (!(width >= 3 && height >= 3) || data.length < width * height * 4) return image
  const source = new Uint8ClampedArray(data)
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = (y * width + x) * 4
    for (let c = 0; c < 3; c++) {
      const p = i + c
      const delta = (4 * source[p] - source[p - 4] - source[p + 4] - source[p - width * 4] - source[p + width * 4]) / 2
      data[p] = source[p] + Math.max(-32, Math.min(32, delta))
    }
  }
  return image
}
