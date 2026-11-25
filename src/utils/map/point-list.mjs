const RELOAD_MOVE_METERS = 500
const RELOAD_DELAY_MS = 300
const ZOOM_CHANGE_THRESHOLD = 0.5
const DEVTOOLS_ZOOM_CHECK_MS = 250
const MAX_LOAD_ROUNDS = 6
const INCREMENTAL_LOAD_ROUNDS = 2
const PAGE_SIZE = 50
const MAX_CACHED_POINTS = 5000
const BBOX_SPAN_LIMIT = 0.45 // 比后端 0.5 度上限留出余量。
const MAX_VIEWPORT_TILES = 16
const CONCURRENT_REQUESTS = 2

function distanceMeters(a, b) {
  const toRad = degrees => degrees * Math.PI / 180
  const dLat = toRad(a.latitude - b.latitude)
  const dLng = toRad(a.longitude - b.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function tileCount(span) {
  return Math.max(1, Math.ceil(span / BBOX_SPAN_LIMIT - 1e-9))
}

function boundViewport({ minLat, maxLat, minLng, maxLng }) {
  const wantedRows = tileCount(maxLat - minLat), wantedColumns = tileCount(maxLng - minLng)
  let rows = wantedRows, columns = wantedColumns
  if (rows * columns > MAX_VIEWPORT_TILES) {
    // Keep as much of each axis as possible within the request budget.
    let bestFit = 0
    for (let candidate = 1; candidate <= Math.min(wantedRows, MAX_VIEWPORT_TILES); candidate++) {
      const width = Math.min(wantedColumns, Math.floor(MAX_VIEWPORT_TILES / candidate))
      const fit = Math.min(candidate / wantedRows, width / wantedColumns)
      if (fit > bestFit) { rows = candidate; columns = width; bestFit = fit }
    }
  }
  const latHalf = Math.min(maxLat - minLat, rows * BBOX_SPAN_LIMIT) / 2
  const lngHalf = Math.min(maxLng - minLng, columns * BBOX_SPAN_LIMIT) / 2
  const latCenter = (minLat + maxLat) / 2
  const lngCenter = (minLng + maxLng) / 2
  return {
    minLat: Math.max(-90, latCenter - latHalf), maxLat: Math.min(90, latCenter + latHalf),
    minLng: Math.max(-180, lngCenter - lngHalf), maxLng: Math.min(180, lngCenter + lngHalf)
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
      const minLng = lng(sw), maxLng = lng(ne)
      if ([minLat, maxLat, minLng, maxLng].every(Number.isFinite) && maxLat > minLat && maxLng > minLng) {
        return boundViewport({ minLat, maxLat, minLng, maxLng })
      }
    }
  } catch (_) { /* 地图未就绪时按缩放估算。 */ }
  const scale = Number(nativeScale) || 12
  const { windowWidth, windowHeight } = uni.getSystemInfoSync()
  const cos = Math.cos(latitude * Math.PI / 180)
  const metersPerPixel = 156543.03 * cos / Math.pow(2, scale)
  const latDelta = metersPerPixel * (windowHeight || 667) / 2 / 111320
  const lngDelta = metersPerPixel * (windowWidth || 375) / 2 / (111320 * Math.max(0.01, cos))
  return boundViewport({
    minLat: latitude - latDelta, maxLat: latitude + latDelta,
    minLng: longitude - lngDelta, maxLng: longitude + lngDelta
  })
}

function splitViewport({ minLat, maxLat, minLng, maxLng }) {
  const rows = tileCount(maxLat - minLat)
  const columns = tileCount(maxLng - minLng)
  const latitude = index => minLat + (maxLat - minLat) * index / rows
  const longitude = index => minLng + (maxLng - minLng) * index / columns
  return Array.from({ length: rows * columns }, (_, index) => {
    const row = Math.floor(index / columns), column = index % columns
    return { minLat: latitude(row), maxLat: latitude(row + 1), minLng: longitude(column), maxLng: longitude(column + 1) }
  })
}

function hasMorePages(result, page) {
  const { totalPages, total, pageSize } = result.pagination || {}
  if (Number.isFinite(totalPages)) return page < totalPages
  if (Number.isFinite(total)) return page * (pageSize || PAGE_SIZE) < total
  return result.data.length >= PAGE_SIZE
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

function regionChangeEnded(event, detail) {
  if (event?.type === 'end' || detail.type === 'end') return true
  if (event?.type === 'begin' || detail.type === 'begin') return false
  // WeChat may expose the phase as the gesture cause when type is "regionchange".
  const cause = event?.causedBy || detail.causedBy
  return cause === 'scale' || cause === 'drag'
}

function readViewportZoom(value) {
  const zoom = Number(value)
  return Number.isFinite(zoom) && zoom > 0 ? zoom : null
}

function hasViewportCenter(point) {
  return point?.latitude != null && point.longitude != null &&
    Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude))
}

export function createMapZoomSetter(viewportScale, cameraScale, afterRender) {
  let pending = null
  return zoom => {
    if (pending?.zoom === zoom) return
    pending = null
    if (cameraScale.value === zoom && viewportScale.value !== zoom) {
      // Reapply the same command after a gesture changed the actual scale.
      cameraScale.value = viewportScale.value
      const command = { zoom }
      pending = command
      afterRender(() => {
        if (pending !== command) return
        pending = null
        viewportScale.value = cameraScale.value = zoom
      })
      return
    }
    viewportScale.value = cameraScale.value = zoom
  }
}

export function createMapPointList({ points, userLocation, mapScale, getWebMap, getNativeMap, isNavigationMode,
  loadMapBins, resolveImage, onUpdate, onError, skipZeroCenter = false }) {
  let reloadTimer = null
  let lastLoadCenter = null
  let lastLoadScale = null
  let lastLoadBbox = null
  let activeLoad = null
  let nativeViewportRevision = 0

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
    cancelViewportReload()
    if (activeLoad) {
      const sameCenter = distanceMeters(activeLoad.center, center) <= RELOAD_MOVE_METERS
      const sameZoom = scale == null || Math.abs(scale - activeLoad.scale) <= ZOOM_CHANGE_THRESHOLD
      if (sameCenter && sameZoom) return
      activeLoad = null
    }
    const moved = !lastLoadCenter || distanceMeters(lastLoadCenter, center) > RELOAD_MOVE_METERS
    const zoomChanged = scale != null && (lastLoadScale == null || Math.abs(Number(scale) - lastLoadScale) > ZOOM_CHANGE_THRESHOLD)
    if (!moved && !zoomChanged && lastLoadBbox) return
    reloadTimer = setTimeout(() => {
      reloadTimer = null
      loadTrashBinList(center, scale)
    }, RELOAD_DELAY_MS)
  }

  function syncNativeViewport(event, isCurrent = () => true) {
    const revision = ++nativeViewportRevision
    const detail = event?.detail || {}
    if (!regionChangeEnded(event, detail) || isNavigationMode() || !isCurrent()) return

    const center = detail.centerLocation || detail.center || event?.centerLocation || event?.center
    const active = () => revision === nativeViewportRevision && !isNavigationMode() && isCurrent()
    const reload = (location, zoom) => {
      if (active() && hasViewportCenter(location)) scheduleViewportReload(location, zoom)
    }
    const commit = zoom => {
      if (!active()) return
      if (zoom !== null) mapScale.value = zoom
      if (hasViewportCenter(center)) reload(center, zoom)
      else getNativeMap?.()?.getCenterLocation?.({ success: location => reload(location, zoom) })
    }
    const zoom = readViewportZoom(detail.scale) ?? readViewportZoom(event?.scale)
    if (zoom !== null) { commit(zoom); return }

    const map = getNativeMap?.()
    if (typeof map?.getScale !== 'function') { commit(null); return }
    map.getScale({ success: result => commit(readViewportZoom(result?.scale)), fail: () => commit(null) })
  }

  function watchDevtoolsZoom(isCurrent) {
    let stopped = false, reading = false, previousZoom = mapScale.value
    const active = () => !stopped && !isNavigationMode() && isCurrent()
    function sample() {
      if (!active() || reading) return
      const map = getNativeMap?.()
      if (typeof map?.getScale !== 'function') return
      reading = true
      const revision = nativeViewportRevision
      const requestedZoom = mapScale.value
      map.getScale({
        success(result) {
          reading = false
          const zoom = readViewportZoom(result?.scale)
          if (zoom === null || !active() || revision !== nativeViewportRevision || requestedZoom !== mapScale.value) return
          const changed = zoom !== previousZoom
          previousZoom = zoom
          if (changed && zoom !== mapScale.value) {
            syncNativeViewport({ type: 'end', detail: { scale: zoom } }, active)
          }
        },
        fail() { reading = false }
      })
    }
    // The simulator can change zoom without sending regionchange until the map is dragged.
    const timer = setInterval(sample, DEVTOOLS_ZOOM_CHECK_MS)
    return () => { stopped = true; clearInterval(timer) }
  }

  async function loadTrashBinList(centerOverride, scaleOverride) {
    let load
    try {
      const user = userLocation.value
      const hasOverride = centerOverride && Number.isFinite(Number(centerOverride.latitude)) && Number.isFinite(Number(centerOverride.longitude))
      const fallback = user.latitude && user.longitude ? user : { latitude: 36.0671, longitude: 120.3826 }
      const location = hasOverride ? centerOverride : fallback
      const center = { latitude: Number(location.latitude), longitude: Number(location.longitude) }
      const { latitude, longitude } = center
      if (skipZeroCenter && (!latitude || !longitude)) {
        console.warn('用户位置信息不完整，无法加载垃圾桶列表')
        return
      }

      const webMap = getWebMap()
      const nativeScale = mapScale.value
      const scale = Number(scaleOverride ?? (typeof webMap?.getZoom === 'function' ? webMap.getZoom() : nativeScale)) || null
      load = { center, scale }
      activeLoad = load
      const viewport = viewportBbox(center, webMap, scale ?? nativeScale)
      const incremental = lastLoadBbox && scale != null && lastLoadScale != null && Math.abs(scale - lastLoadScale) <= ZOOM_CHANGE_THRESHOLD
      const newRects = incremental ? uncoveredRects(viewport, lastLoadBbox) : []
      const incrementalTiles = newRects.flatMap(splitViewport)
      const useIncremental = incrementalTiles.length > 0 && incrementalTiles.length <= MAX_VIEWPORT_TILES
      const rects = useIncremental ? incrementalTiles : splitViewport(viewport)
      const rounds = useIncremental ? INCREMENTAL_LOAD_ROUNDS : MAX_LOAD_ROUNDS
      const distanceToRect = rect => distanceMeters(center, {
        latitude: (rect.minLat + rect.maxLat) / 2, longitude: (rect.minLng + rect.maxLng) / 2
      })
      const queue = rects.sort((a, b) => distanceToRect(a) - distanceToRect(b)).map(rect => ({ rect, page: 1 }))
      // Give each area its first page before sending extra requests to dense areas.
      let budget = rects.length === 1 ? rounds : rects.length + MAX_LOAD_ROUNDS
      let complete = true
      let requestError
      const fetched = []
      while (queue.length && budget > 0) {
        const batch = queue.splice(0, Math.min(CONCURRENT_REQUESTS, budget))
        budget -= batch.length
        const results = await Promise.allSettled(batch.map(async ({ rect, page }) => loadMapBins({ ...rect, page, pageSize: PAGE_SIZE })))
        if (activeLoad !== load) return
        for (const [index, response] of results.entries()) {
          if (response.status === 'rejected') {
            complete = false
            requestError ??= response.reason
            continue
          }
          const result = response.value
          if (result?.code !== 0 || !Array.isArray(result.data)) {
            console.warn('获取垃圾桶列表响应格式异常:', result)
            complete = false
            continue
          }
          fetched.push(...result.data)
          if (result.msg === 'ok (cached)') complete = false
          const { rect, page } = batch[index]
          if (!hasMorePages(result, page)) continue
          if (page < rounds) queue.push({ rect, page: page + 1 })
          else complete = false
        }
      }

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
      const evictedVisiblePoints = merged.slice(MAX_CACHED_POINTS).some(point =>
        point.latitude >= viewport.minLat && point.latitude <= viewport.maxLat &&
        point.longitude >= viewport.minLng && point.longitude <= viewport.maxLng)
      points.value = merged.length > MAX_CACHED_POINTS ? merged.slice(0, MAX_CACHED_POINTS) : merged
      lastLoadCenter = center
      lastLoadScale = scale
      lastLoadBbox = complete && !queue.length && !evictedVisiblePoints ? viewport : null
      console.log(`成功加载 ${points.value.length} 个垃圾桶标记`)
      onUpdate()
      if (requestError) onError(requestError)
    } catch (error) {
      onError(error)
    } finally {
      if (activeLoad === load) activeLoad = null
    }
  }

  async function refreshAdminMarker(id, selectPoint, clearSelection) {
    await loadTrashBinList()
    const point = points.value.find(item => String(item.id) === String(id))
    if (point) selectPoint(point)
    else clearSelection()
  }

  return { cancelViewportReload, scheduleViewportReload, syncNativeViewport, watchDevtoolsZoom, loadTrashBinList, refreshAdminMarker }
}
