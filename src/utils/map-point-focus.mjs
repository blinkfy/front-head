// Offset only the camera; marker and navigation coordinates stay unchanged.
export function offsetMapCenter(point, zoom, liftPixels) {
  const latitude = Math.max(-85.05112878, Math.min(85.05112878, Number(point.latitude)))
  const sin = Math.sin(latitude * Math.PI / 180)
  const worldSize = 256 * 2 ** zoom
  const y = .5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)
  const centerY = Math.max(0, Math.min(1, y + Math.max(0, liftPixels) / worldSize))
  return { latitude: Math.atan(Math.sinh(Math.PI * (1 - 2 * centerY))) * 180 / Math.PI,
    longitude: Number(point.longitude) }
}

export async function getPointFocusCenter(point, zoom, page) {
  const viewport = uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()
  const windowHeight = Number(viewport.windowHeight) || 667
  const fallback = () => offsetMapCenter(point, zoom, Math.min(160, windowHeight * .18))
  try {
    return await new Promise(resolve => {
      const query = uni.createSelectorQuery().in(page?.proxy)
      query.select('.map-canvas').boundingClientRect()
      // Height and CSS bottom remain stable during the card's entrance animation.
      query.select('.info-card').fields({ size: true, computedStyle: ['bottom'] })
      query.exec(rects => {
        const [map, card] = rects || []
        if (!(map?.height > 0) || !(card?.height > 0)) { resolve(fallback()); return }
        const mapTop = Number(map.top) || 0
        const mapBottom = mapTop + map.height
        const cardTop = windowHeight - (parseFloat(card.bottom) || 0) - card.height
        // Start at the midpoint without the header, then avoid only actual overlap.
        const targetY = Math.max(mapTop + 48, Math.min(mapBottom / 2, cardTop - 64))
        const lift = Math.max(0, mapTop + map.height / 2 - targetY)
        resolve(offsetMapCenter(point, zoom, lift))
      })
    })
  } catch (_) { return fallback() }
}
