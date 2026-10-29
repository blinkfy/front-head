import { imageDataBytes, normalizeImageData } from './trash-bin-image-core.mjs'

export const SATELLITE_REFERENCE_LIMIT = 100 * 1024

// Optional context belongs to this exact selected location, never to the saved bin photo.
export function normalizeSatelliteReference(reference, location) {
  if (!reference || !location) return null
  for (const [key, limit] of [['latitude', 90], ['longitude', 180]]) {
    const value = reference[key], selected = location[key]
    if (value == null || selected == null || String(value).trim() === '' || String(selected).trim() === '') return null
    if (!Number.isFinite(Number(value)) || !Number.isFinite(Number(selected)) || Math.abs(Number(value)) > limit || Math.abs(Number(selected)) > limit || Math.abs(Number(value) - Number(selected)) > .00001) return null
  }
  if (typeof reference.image !== 'string' || reference.image.length > 140000) return null
  const image = normalizeImageData(reference.image)
  if (!image || imageDataBytes(image) <= 0 || imageDataBytes(image) > SATELLITE_REFERENCE_LIMIT) return null
  return { image, latitude: Number(reference.latitude), longitude: Number(reference.longitude) }
}

// Export only an already-rendered map. No tile fetch, camera movement or submission-time wait.
export function captureSatelliteReference({ map, container, location, satellite, loading, toLatLng, createCanvas }) {
  if (!satellite || loading || !map || !container || !normalizeCoordinates(location)) return null
  let output
  try {
    const rect = container.getBoundingClientRect()
    const point = map.projectToContainer(toLatLng(location))
    if (rect.width < 64 || rect.height < 64 || !Number.isFinite(point?.x) || !Number.isFinite(point?.y) || point.x < 0 || point.y < 0 || point.x > rect.width || point.y > rect.height) return null
    const source = Array.from(container.querySelectorAll('canvas')).filter(canvas => {
      const bounds = canvas.getBoundingClientRect()
      return canvas.width > 0 && canvas.height > 0 && bounds.width >= rect.width * .9 && bounds.height >= rect.height * .9
    }).sort((a, b) => b.width * b.height - a.width * a.height)[0]
    if (!source) return null
    const bounds = source.getBoundingClientRect()
    const side = Math.min(640, rect.width, rect.height)
    const left = Math.max(0, Math.min(rect.width - side, point.x - side / 2))
    const top = Math.max(0, Math.min(rect.height - side, point.y - side / 2))
    output = createCanvas()
    output.width = output.height = Math.min(640, Math.round(side))
    const context = output.getContext('2d', { willReadFrequently: true })
    if (!context) return null
    context.drawImage(source, (rect.left + left - bounds.left) * source.width / bounds.width, (rect.top + top - bounds.top) * source.height / bounds.height, side * source.width / bounds.width, side * source.height / bounds.height, 0, 0, output.width, output.height)
    // Missing WebGL buffers can export a transparent/blank image without throwing.
    const pixels = context.getImageData(0, 0, output.width, output.height).data
    let min = 255, max = 0, visible = 0
    for (let i = 0; i < pixels.length; i += 4 * 37) {
      if (pixels[i + 3] < 128) continue
      visible++
      const value = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3
      min = Math.min(min, value); max = Math.max(max, value)
    }
    if (visible < pixels.length / (4 * 37) * .8 || max - min < 8) return null
    const x = (point.x - left) / side * output.width, y = (point.y - top) / side * output.height
    context.beginPath(); context.arc(x, y, 7, 0, Math.PI * 2)
    context.fillStyle = '#ef4444'; context.fill(); context.lineWidth = 3; context.strokeStyle = '#ffffff'; context.stroke()
    for (const quality of [.72, .55, .38]) {
      const reference = normalizeSatelliteReference({ image: output.toDataURL('image/jpeg', quality), latitude: location.latitude, longitude: location.longitude }, location)
      if (reference) return reference
    }
    return null
  } catch (_) { return null } // Unsupported export, tainted canvas, or old SDK: keep single-photo review.
  finally { if (output) output.width = output.height = 0 }
}

function normalizeCoordinates(location) {
  return location && location.latitude != null && location.longitude != null && Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude)) && Math.abs(Number(location.latitude)) <= 90 && Math.abs(Number(location.longitude)) <= 180
}
