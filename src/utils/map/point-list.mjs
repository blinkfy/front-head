const RELOAD_MOVE_METERS = 500
const RELOAD_DELAY_MS = 300
const ZOOM_CHANGE_THRESHOLD = 0.5
const MAX_LOAD_ROUNDS = 6
const INCREMENTAL_LOAD_ROUNDS = 2
const PAGE_SIZE = 50
const MAX_CACHED_POINTS = 1000
const BBOX_SPAN_LIMIT = 0.45 // 比后端 0.5 度上限留出余量。

function distanceMeters(a, b) {
  const toRad = degrees => degrees * Math.PI / 180
  const dLat = toRad(a.latitude - b.latitude)
  const dLng = toRad(a.longitude - b.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function clampBboxSpan({ minLat, maxLat, minLng, maxLng }) {
  const latHalf = Math.min(maxLat - minLat, BBOX_SPAN_LIMIT) / 2
  const lngHalf = Math.min(maxLng - minLng, BBOX_SPAN_LIMIT) / 2
  const latCenter = (minLat + maxLat) / 2
  const lngCenter = (minLng + maxLng) / 2
  return {
    minLat: latCenter - latHalf, maxLat: latCenter + latHalf,
    minLng: lngCenter - lngHalf, maxLng: lngCenter + lngHalf
  }
}

function viewportBbox({ latitude, longitude }, webMap, nativeScale) {
  try {
    const bounds = webMap?.getBounds?.()
    const ne = bounds?.getNorthEast?.()
    const sw = bounds?.getSouthWest?.()
    if (ne && sw) {
      const lat = point => Number(typeof point.getLat === 'function' ? point.getLat() : point.lat)
      const lng = point => Number(typeof point.getLng === 'function' ? point.getLng() : point.lng)
      const minLat = Math.min(lat(ne), lat(sw)), maxLat = Math.max(lat(ne), lat(sw))
      const minLng = Math.min(lng(ne), lng(sw)), maxLng = Math.max(lng(ne), lng(sw))
      if ([minLat, maxLat, minLng, maxLng].every(Number.isFinite) && maxLat > minLat && maxLng > minLng) {
        return clampBboxSpan({ minLat, maxLat, minLng, maxLng })
      }
    }
  } catch (_) { /* 地图未就绪时按缩放估算。 */ }
  const scale = Number(nativeScale) || 12
  const { windowWidth, windowHeight } = uni.getSystemInfoSync()
  const cos = Math.cos(latitude * Math.PI / 180)
  const metersPerPixel = 156543.03 * cos / Math.pow(2, scale)
  const latDelta = metersPerPixel * (windowHeight || 667) / 2 / 111320
  const lngDelta = metersPerPixel * (windowWidth || 375) / 2 / (111320 * Math.max(0.01, cos))
  return clampBboxSpan({
    minLat: latitude - latDelta, maxLat: latitude + latDelta,
    minLng: longitude - lngDelta, maxLng: longitude + lngDelta
  })
}

function uncoveredRects(viewport, loaded) {
  const minLat = Math.max(viewport.minLat, loaded.minLat)
  const maxLat = Math.min(viewport.maxLat, loaded.maxLat)
  const minLng = Math.max(viewport.minLng, loaded.minLng)
  const maxLng = Math.min(viewport.maxLng, loaded.maxLng)
  if (maxLat <= minLat || maxLng <= minLng) return []
  const overlap = (maxLat - minLat) * (maxLng - minLng)
  const area = (viewport.maxLat - viewport.minLat) * (viewport.maxLng - viewport.minLng)
  if (overlap / area < 0.5) return []

  // 左右条带覆盖完整纬度，上下条带只覆盖重叠经度，彼此不重叠。
  const rects = []
  if (viewport.minLng < minLng) rects.push({ minLat: viewport.minLat, maxLat: viewport.maxLat, minLng: viewport.minLng, maxLng: minLng })
  if (viewport.maxLng > maxLng) rects.push({ minLat: viewport.minLat, maxLat: viewport.maxLat, minLng: maxLng, maxLng: viewport.maxLng })
  if (viewport.minLat < minLat) rects.push({ minLat: viewport.minLat, maxLat: minLat, minLng, maxLng })
  if (viewport.maxLat > maxLat) rects.push({ minLat: maxLat, maxLat: viewport.maxLat, minLng, maxLng })
  return rects.length <= 2 ? rects : []
}

export function createMapPointList({ points, userLocation, mapScale, getWebMap, isNavigationMode,
  loadMapBins, resolveImage, onUpdate, onError, skipZeroCenter = false }) {
  let reloadTimer = null
  let lastLoadCenter = null
  let lastLoadScale = null
  let lastLoadBbox = null

  function cancelViewportReload() {
    if (reloadTimer !== null) clearTimeout(reloadTimer)
    reloadTimer = null
  }

  function scheduleViewportReload(centerPoint, scale) {
    if (isNavigationMode()) return
    const latitude = Number(centerPoint && centerPoint.latitude)
    const longitude = Number(centerPoint && centerPoint.longitude)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return
    const center = { latitude, longitude }
    const moved = !lastLoadCenter || distanceMeters(lastLoadCenter, center) > RELOAD_MOVE_METERS
    const zoomChanged = scale != null && (lastLoadScale == null || Math.abs(Number(scale) - lastLoadScale) > ZOOM_CHANGE_THRESHOLD)
    if (!moved && !zoomChanged) return
    cancelViewportReload()
    reloadTimer = setTimeout(() => {
      reloadTimer = null
      loadTrashBinList(center, scale)
    }, RELOAD_DELAY_MS)
  }

  async function loadTrashBinList(centerOverride, scaleOverride) {
    try {
      const user = userLocation.value
      const hasOverride = centerOverride && Number.isFinite(Number(centerOverride.latitude)) && Number.isFinite(Number(centerOverride.longitude))
      const fallback = user.latitude && user.longitude ? user : { latitude: 36.0671, longitude: 120.3826 }
      const center = hasOverride ? centerOverride : fallback
      const { latitude, longitude } = center
      if (skipZeroCenter && (!latitude || !longitude)) {
        console.warn('用户位置信息不完整，无法加载垃圾桶列表')
        return
      }

      lastLoadCenter = { latitude: Number(latitude), longitude: Number(longitude) }
      const webMap = getWebMap()
      const nativeScale = mapScale.value
      const scale = Number(scaleOverride ?? (typeof webMap?.getZoom === 'function' ? webMap.getZoom() : nativeScale)) || null
      const viewport = viewportBbox(center, webMap, nativeScale)
      const incremental = lastLoadBbox && scale != null && lastLoadScale != null && Math.abs(scale - lastLoadScale) <= ZOOM_CHANGE_THRESHOLD
      const newRects = incremental ? uncoveredRects(viewport, lastLoadBbox) : []
      const rects = newRects.length ? newRects : [viewport]
      const rounds = newRects.length ? INCREMENTAL_LOAD_ROUNDS : MAX_LOAD_ROUNDS
      const fetched = []
      for (const rect of rects) {
        for (let page = 1; page <= rounds; page++) {
          const result = await loadMapBins({ ...rect, page, pageSize: PAGE_SIZE })
          if (result?.code !== 0 || !Array.isArray(result.data)) {
            console.warn('获取垃圾桶列表响应格式异常:', result)
            break
          }
          fetched.push(...result.data)
          if (result.data.length < PAGE_SIZE) break
        }
      }
      lastLoadBbox = viewport
      if (scale != null) lastLoadScale = scale

      const byId = new Map(points.value.map(point => [String(point.id), point]))
      for (const item of fetched) {
        const image = item.hasImage === true && !(item.image || item.imagePath)
          ? '' : resolveImage(item.image || item.imagePath, item.mapType || 'waste_basket')
        byId.set(String(item.id), {
          ...item,
          latitude: typeof item.latitude === 'number' ? item.latitude : parseFloat(item.latitude),
          longitude: typeof item.longitude === 'number' ? item.longitude : parseFloat(item.longitude),
          image
        })
      }
      const merged = [...byId.values()]
      if (merged.length > MAX_CACHED_POINTS) {
        merged.sort((a, b) => distanceMeters(a, center) - distanceMeters(b, center))
      }
      points.value = merged.length > MAX_CACHED_POINTS ? merged.slice(0, MAX_CACHED_POINTS) : merged
      console.log(`成功加载 ${points.value.length} 个垃圾桶标记`)
      onUpdate()
    } catch (error) {
      onError(error)
    }
  }

  async function refreshAdminMarker(id, selectPoint, clearSelection) {
    await loadTrashBinList()
    const point = points.value.find(item => String(item.id) === String(id))
    if (point) selectPoint(point)
    else clearSelection()
  }

  return { cancelViewportReload, scheduleViewportReload, loadTrashBinList, refreshAdminMarker }
}
