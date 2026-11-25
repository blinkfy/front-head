// Runs in the App render layer; the logic layer never accesses DOM or SDK objects.
export function createAppTencentMap({ sdk, container, emit, assetUrl = value => value, initialMarkerDelayMs = 0,
  setTimer = setTimeout, clearTimer = clearTimeout }) {
  let map, layer, walkingLayer, positionLayer, detail, state, markerKey, basemap, boundsTimer, destroyed = false
  let markerTimer = null
  let satelliteReady = false, satelliteView = null, stopSatelliteProbe = null
  const listeners = []
  const clusterIconUrls = new Map()
  const location = () => {
    const center = map.getCenter()
    return { latitude: Number(center.getLat()), longitude: Number(center.getLng()) }
  }
  const send = (type, detail) => { if (!destroyed) emit({ type, detail }) }
  function listen(type, handler) { map.on(type, handler); listeners.push([type, handler]) }
  function cancelSatelliteProbe() {
    stopSatelliteProbe?.()
    stopSatelliteProbe = null
  }
  function reportBasemapReady(confirmation) {
    if (basemap) {
      satelliteReady = true
      satelliteView = satelliteViewKey(map, container)
      cancelSatelliteProbe()
    }
    send('updated', { satellite: basemap, ...(confirmation && { confirmation }) })
  }
  function waitForSatellite() {
    if (!basemap || satelliteReady) return
    if (satelliteView && satelliteView === satelliteViewKey(map, container)) {
      reportBasemapReady('cached_view')
      return
    }
    stopSatelliteProbe = watchSatelliteTile(map, container, () => reportBasemapReady('center_tile'))
  }
  function update(next) {
    if (destroyed) return
    const previous = state
    state = next
    if (!map) {
      basemap = !!state.satellite
      map = new sdk.Map(container, {
        center: new sdk.LatLng(Number(state.latitude), Number(state.longitude)), zoom: Number(state.scale) || 16,
        viewMode: '2D', mapTypeControl: false,
        baseMap: getTencentBasemapOptions(basemap)
      })
      if (!basemap && initialMarkerDelayMs > 0) markerTimer = setTimer(releaseInitialMarkers, initialMarkerDelayMs)
      listen('tilesloaded', () => {
        reportBasemapReady()
        if (markerTimer !== null) {
          clearTimer(markerTimer)
          markerTimer = setTimer(releaseInitialMarkers, 0)
        }
      })
      listen('context_lost', () => {
        satelliteView = null
        satelliteReady = false
        cancelSatelliteProbe()
        send('error', { code: 'sdk_context_lost', satellite: basemap })
      })
      listen('click', event => {
        if (event.latLng) send('tap', { latitude: event.latLng.getLat(), longitude: event.latLng.getLng() })
      })
      listen('dragstart', () => send('regionchange', { type: 'begin' }))
      listen('bounds_changed', () => {
        if (boundsTimer) clearTimer(boundsTimer)
        boundsTimer = setTimer(() => {
          boundsTimer = null
          send('regionchange', { type: 'end', centerLocation: location(), scale: map.getZoom() })
        }, 100)
      })
      detail = createSatelliteDetailController({ sdk, map, container })
      detail.setActive(basemap)
      waitForSatellite()
      walkingLayer = createTencentWalkingLayer({ sdk, map, container })
      positionLayer = createTencentPositionLayer({ sdk, map })
    } else {
      if (previous.latitude !== state.latitude || previous.longitude !== state.longitude) {
        map.setCenter(new sdk.LatLng(Number(state.latitude), Number(state.longitude)))
      }
      if (previous.scale !== state.scale) map.setZoom(Number(state.scale) || 16)
    }
    if (basemap !== !!state.satellite) {
      basemap = !!state.satellite
      cancelSatelliteProbe()
      satelliteReady = false
      if (!basemap && satelliteView !== satelliteViewKey(map, container)) satelliteView = null
      detail.setActive(basemap)
      map.setBaseMap(getTencentBasemapOptions(basemap))
      send('switching', { satellite: basemap })
      waitForSatellite()
    }
    if (markerTimer === null) {
      updateMarkers()
      positionLayer.update(state.userLocation)
    }
    if (state.command && state.command.id !== previous?.command?.id) {
      if (state.command.type === 'move') {
        const { latitude, longitude, lift } = state.command
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
          const center = location()
          const target = getTencentFocusCenter(sdk, map, { latitude, longitude }, lift)
          if (Math.abs(center.latitude - target.getLat()) > 1e-7 || Math.abs(center.longitude - target.getLng()) > 1e-7) {
            map.setCenter(target)
          }
        }
      } else {
        send('center', { requestId: state.command.id, ...location() })
      }
    }
    walkingLayer.update(state.walkingRoute)
  }
  function releaseInitialMarkers() {
    markerTimer = null
    if (destroyed) return
    try {
      updateMarkers()
      positionLayer.update(state.userLocation)
    } catch (_) { send('error', { code: 'map_render_failed', stage: 'render', satellite: basemap === true }) }
  }
  function createClusterStyle(label) {
    let src = clusterIconUrls.get(label)
    if (!src) {
      const fontSize = label.length > 3 ? 8 : label.length > 2 ? 9 : 11
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="18">
        <rect x="1" y="1" width="20" height="16" rx="8" fill="#1d4ed8" stroke="white" stroke-width="1.5"/>
        <text x="11" y="9" dy=".35em" fill="white" font-family="sans-serif" font-size="${fontSize}" font-weight="700" text-anchor="middle">${label}</text>
      </svg>`
      src = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg)
      clusterIconUrls.set(label, src)
    }
    return new sdk.MarkerStyle({ width: 22, height: 18, anchor: { x: -3, y: 44 }, src })
  }
  function updateMarkers() {
    const key = JSON.stringify(state.markers || [])
    if (key !== markerKey) {
      markerKey = key
      const styles = {}, geometries = [], ids = new Map()
      ;(state.markers || []).forEach((marker, index) => {
        const id = `point-${index}`
        ids.set(id, marker.id)
        styles[id] = new sdk.MarkerStyle({
          width: marker.width || 32, height: marker.height || 40, src: assetUrl(marker.iconPath),
          anchor: { x: (marker.width || 32) * (marker.anchor?.x ?? .5), y: (marker.height || 40) * (marker.anchor?.y ?? 1) }
        })
        const position = new sdk.LatLng(Number(marker.latitude), Number(marker.longitude))
        geometries.push({ id, styleId: id, position })
        if (Number.isInteger(marker.clusterCount) && marker.clusterCount > 1) {
          const count = Math.min(marker.clusterCount, 1000)
          const styleId = `cluster-${count}`
          if (!styles[styleId]) styles[styleId] = createClusterStyle(count === 1000 ? '999+' : String(count))
          const badgeId = `badge-${index}`
          ids.set(badgeId, marker.id)
          geometries.push({ id: badgeId, styleId, position })
        }
      })
      if (layer) layer.setMap(null)
      layer = null
      if (geometries.length) {
        layer = new sdk.MultiMarker({ map, styles, geometries })
        layer.on('click', event => { if (ids.has(event.geometry?.id)) send('markertap', { markerId: ids.get(event.geometry.id) }) })
      }
    }
  }
  return {
    update,
    destroy() {
      if (destroyed) return
      destroyed = true
      if (boundsTimer) clearTimer(boundsTimer)
      if (markerTimer !== null) clearTimer(markerTimer)
      cancelSatelliteProbe()
      if (layer) layer.setMap(null)
      walkingLayer?.update(null)
      positionLayer?.update(null)
      clusterIconUrls.clear()
      detail?.destroy()
      if (map) { listeners.forEach(([type, handler]) => map.off(type, handler)); map.destroy() }
      map = layer = null
    }
  }
}

export function getTencentFocusCenter(sdk, map, { latitude, longitude }, lift) {
  const target = new sdk.LatLng(latitude, longitude)
  if (!(lift > 0) || !sdk.Point || !map.projectToContainer || !map.unprojectFromContainer) return target
  try {
    const center = map.getCenter()
    const pixel = map.projectToContainer(center)
    const x = pixel.getX?.() ?? pixel.x
    const y = pixel.getY?.() ?? pixel.y
    const visibleCenter = map.unprojectFromContainer(new sdk.Point(x, y - lift))
    const radians = Math.PI / 180
    const mercator = lat => Math.asinh(Math.tan(lat * radians))
    // Translate the camera by the projected ground distance, keeping its zoom and rotation.
    const centerY = mercator(latitude) + mercator(center.getLat()) - mercator(visibleCenter.getLat())
    const lng = longitude + center.getLng() - visibleCenter.getLng()
    if (Number.isFinite(centerY) && Number.isFinite(lng)) {
      return new sdk.LatLng(Math.atan(Math.sinh(centerY)) / radians, ((lng + 180) % 360 + 360) % 360 - 180)
    }
  } catch (_) { /* The map may still be initializing. */ }
  return target
}

const positionDot = '<circle cx="18" cy="18" r="10" fill="#3989fa" fill-opacity=".23"/><circle cx="18" cy="18" r="6.5" fill="#2276f4" stroke="white" stroke-width="2.5"/>'
function positionIcon(showHeading) {
  const pointer = showHeading ? '<path d="M18 2 26 17H10Z" fill="#2276f4" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>' : ''
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">${pointer}${positionDot}</svg>`
  )
}
const positionIcons = [positionIcon(false), positionIcon(true)]

export function createTencentPositionLayer({ sdk, map }) {
  let layer, last
  return {
    update(point) {
      const { latitude, longitude, heading } = point || {}
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        layer?.setMap(null)
        layer = last = null
        return
      }
      const bearing = Number.isFinite(heading) ? Math.round(heading / 3) * 3 % 360 : null
      const moved = !last || latitude !== last.latitude || longitude !== last.longitude
      const turned = !last || bearing !== last.bearing
      if (!moved && !turned) return
      last = { latitude, longitude, bearing }
      const styles = () => ({ position: new sdk.MarkerStyle({
        width: 36, height: 36, anchor: { x: 18, y: 18 }, faceTo: 'map',
        // SDK rotation is counterclockwise. GPS and compass headings are clockwise.
        rotate: bearing === null ? 0 : (360 - bearing) % 360, src: positionIcons[Number(bearing !== null)]
      }) })
      const geometries = () => [{
        id: 'user-position', styleId: 'position', position: new sdk.LatLng(latitude, longitude)
      }]
      if (!layer) {
        layer = new sdk.MultiMarker({ id: 'user-position-layer', zIndex: 30, map, styles: styles(), geometries: geometries() })
      } else {
        if (turned) layer.setStyles(styles())
        if (moved) layer.setGeometries(geometries())
      }
    }
  }
}

const walkingOriginIcon = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="7" fill="#ffffff" stroke="#526980" stroke-width="2.5"/></svg>'
)
const walkingDestinationIcon = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="43" viewBox="0 0 36 43"><path d="M18 40C15 37 3 25 3 17a15 15 0 1 1 30 0c0 8-12 20-15 23Z" fill="#183a85" stroke="#fff" stroke-width="2.5"/><path d="M12 23V10m1 1h10l-2.6 3.5 2.6 3.5H13" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
)

export function createTencentWalkingLayer({ sdk, map, container }) {
  let routeId = null, polyline, routeMarkers
  const latLng = ({ latitude, longitude }) => new sdk.LatLng(latitude, longitude)
  return {
    update(route) {
      const id = route?.id ?? null
      if (routeId === id) return
      routeId = id
      polyline?.setMap(null)
      routeMarkers?.setMap(null)
      polyline = routeMarkers = null
      if (!route) return

      const paths = route.points.map(latLng)
      const destination = latLng(route.destination)
      polyline = new sdk.MultiPolyline({
        id: 'walking-route', map,
        styles: { walking: new sdk.PolylineStyle({
          color: '#2259df', width: 8, borderColor: '#ffffff', borderWidth: 3,
          lineCap: 'round', lineJoin: 'round', showArrow: true, arrowOptions: { space: 54 }
        }) },
        geometries: [{ id: 'walking-route-path', styleId: 'walking', paths }]
      })
      routeMarkers = new sdk.MultiMarker({
        id: 'walking-route-markers', map, zIndex: 20,
        styles: {
          origin: new sdk.MarkerStyle({ width: 22, height: 22, anchor: { x: 11, y: 11 }, src: walkingOriginIcon }),
          destination: new sdk.MarkerStyle({ width: 36, height: 43, anchor: { x: 18, y: 40 }, src: walkingDestinationIcon })
        },
        geometries: [
          { id: 'walking-route-origin', styleId: 'origin', position: paths[0] },
          { id: 'walking-route-destination', styleId: 'destination', position: destination }
        ]
      })
      if (map.fitBounds && sdk.LatLngBounds) {
        const bounds = new sdk.LatLngBounds()
        paths.forEach(point => bounds.extend(point))
        bounds.extend(destination)
        const bottom = Math.min(270, Math.round((container?.clientHeight || 460) * 0.47))
        map.fitBounds(bounds, { padding: { top: 42, bottom, left: 42, right: 42 }, maxZoom: 18 })
      }
    }
  }
}

// Draw satellite labels with the vector text renderer instead of the satellite road layer.
// Exclude vector 'base' and buildings so that they cannot cover the satellite imagery.
export function getTencentBasemapOptions(satellite) {
  return satellite ? [
    { type: 'satellite', features: ['base'] },
    { type: 'vector', features: ['point', 'label'] }
  ] : { type: 'vector' }
}

// ImageTileLayer supplies XYZ rows, whereas the existing Tencent imagery CDN uses TMS.
// A 512px result still covers exactly ONE original tile: no camera/coordinate scaling.
export function getSatelliteDetailTiles(x, y, z, highResolution = true) {
  if (![x, y, z].every(Number.isInteger) || z < 3 || z > 18 || y < 0 || y >= 2 ** z) return null
  const count = 2 ** z
  x = (x % count + count) % count
  const divisions = highResolution && z < 18 ? 2 : 1
  const level = z + (divisions === 2 ? 1 : 0)
  const url = (tx, xyzY, zoom) => {
    const ty = 2 ** zoom - 1 - xyzY
    return `https://p${(tx + ty) % 4}.map.gtimg.com/sateTiles/${zoom}/${tx >> 4}/${ty >> 4}/${tx}_${ty}.jpg`
  }
  return {
    id: `${z}/${x}/${y}`,
    children: Array.from({ length: divisions ** 2 }, (_, index) => {
      const tx = x * divisions + index % divisions, ty = y * divisions + Math.floor(index / divisions)
      const sources = Array.from({ length: Math.min(4, level - 3) + 1 }, (_, depth) => {
        const factor = 2 ** depth, size = 256 / factor
        return { url: url(Math.floor(tx / factor), Math.floor(ty / factor), level - depth), level: level - depth,
          sx: tx % factor * size, sy: ty % factor * size, sw: size, sh: size }
      })
      return { url: sources[0].url, x: index % divisions * 512 / divisions,
        y: Math.floor(index / divisions) * 512 / divisions, size: 512 / divisions, sources }
    })
  }
}

export function validateSatelliteTileImage(image, context) {
  if ((image.naturalWidth || image.width) !== 256 || (image.naturalHeight || image.height) !== 256) throw new Error('invalid_tile')
  context.drawImage(image, 0, 0, 64, 64)
  const data = context.getImageData(0, 0, 64, 64).data, bins = new Uint16Array(4096)
  let dominant = 0, most = 0
  for (let i = 0; i < data.length; i += 4) {
    const bin = (data[i] >> 4) * 256 + (data[i + 1] >> 4) * 16 + (data[i + 2] >> 4)
    if (++bins[bin] > most) { dominant = bin; most = bins[bin] }
  }
  const colors = [dominant >> 8, dominant >> 4 & 15, dominant & 15]
  if (most >= 4096 * .8 && Math.max(...colors) - Math.min(...colors) <= 3) throw new Error('imagery_unavailable')
}

function centerTileUrl(map) {
  const center = map.getCenter?.()
  const latitude = center?.getLat()
  const longitude = center?.getLng()
  const zoom = map.getZoom?.()
  if (![latitude, longitude, zoom].every(Number.isFinite)) return null
  const level = Math.floor(zoom)
  if (level < 3 || level > 18) return null
  const count = 2 ** level
  const radians = Math.max(-85.05112878, Math.min(85.05112878, latitude)) * Math.PI / 180
  const x = Math.floor((longitude + 180) / 360 * count)
  const y = Math.max(0, Math.min(count - 1, Math.floor((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * count)))
  return getSatelliteDetailTiles(x, y, level, false)?.children[0].url
}

export function satelliteViewKey(map, container) {
  const center = map.getCenter?.()
  if (!center) return null
  return JSON.stringify([
    center.getLat(), center.getLng(), map.getZoom?.(), map.getRotation?.(), map.getPitch?.(),
    container?.clientWidth, container?.clientHeight
  ])
}

// The SDK can draw imagery without reporting that every visible tile is loaded.
export function watchSatelliteTile(map, container, onAvailable) {
  const doc = container?.ownerDocument
  const view = doc?.defaultView
  if (!view?.Image) return () => {}
  let image = null
  const timer = view.setTimeout(() => {
    const url = centerTileUrl(map)
    if (!url) return
    image = new view.Image()
    image.crossOrigin = 'anonymous'
    image.onerror = stop
    image.onload = () => {
      const canvas = doc.createElement('canvas')
      canvas.width = canvas.height = 64
      let available = false
      try {
        const baseMap = map.getBaseMap?.()
        const layers = Array.isArray(baseMap) ? baseMap : [baseMap]
        if ((baseMap && !layers.some(layer => layer?.type === 'satellite')) || centerTileUrl(map) !== url) return
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (context) {
          validateSatelliteTileImage(image, context)
          available = true
        }
      } catch (_) { /* A placeholder or inaccessible image cannot confirm coverage. */ }
      finally { canvas.width = canvas.height = 0; stop() }
      if (available) onAvailable()
    }
    image.src = url
  }, 3000)
  function stop() {
    view.clearTimeout(timer)
    if (!image) return
    image.onload = image.onerror = null
    image.removeAttribute('src')
    image = null
  }
  return stop
}

export function createSatelliteDetailLoader({ loadImage, createCanvas, empty, highResolution = true, onEvent = () => {} }) {
  const cache = new Map(), pending = new Map(), queue = []
  let active = 0, disposed = false, reported = false, reportedFailure = false, reportedParent = false
  const reportFailure = error => {
    if (!disposed && !reportedFailure) { reportedFailure = true; onEvent('fallback', { reason: error?.message || 'tile_failed' }) }
  }
  const canUseParent = error => ['imagery_unavailable', 'invalid_tile', 'tile_not_found'].includes(error?.message) || error?.status === 404
  async function render(job) {
    const images = [], sources = new Map(), canvas = createCanvas(), probe = createCanvas()
    try {
      canvas.width = canvas.height = 512
      probe.width = probe.height = 64
      const context = canvas.getContext('2d'), check = probe.getContext('2d', { willReadFrequently: true })
      if (!context || !check) throw new Error('canvas_unavailable')
      async function readSource(source) {
        if (!sources.has(source.url)) {
          try {
            const image = await loadImage(source.url)
            images.push(image)
            if (disposed) throw new Error('cancelled')
            validateSatelliteTileImage(image, check)
            sources.set(source.url, { image })
          } catch (error) { sources.set(source.url, { error }) }
        }
        const result = sources.get(source.url)
        if (result.error) throw result.error
        return result.image
      }
      let painted = 0, dataLevel = 18
      // Only the missing quadrant falls back. Crop parents in XYZ space before TMS conversion.
      // Sequential decoding and per-job parent reuse retain the two-request concurrency limit.
      for (const tile of job.tiles.children) {
        let lastError
        for (const source of tile.sources) {
          if (disposed) return empty
          try {
            const image = await readSource(source)
            context.drawImage(image, source.sx, source.sy, source.sw, source.sh, tile.x, tile.y, tile.size, tile.size)
            painted++; dataLevel = Math.min(dataLevel, source.level)
            if (source.level < tile.sources[0].level && !reportedParent) {
              reportedParent = true
              onEvent('parent_fallback', { displayLevel: job.z, requestedDataLevel: tile.sources[0].level, dataLevel: source.level })
            }
            lastError = null; break
          } catch (error) {
            lastError = error
            // Timeouts/network/CORS failures must not multiply requests down the hierarchy.
            if (!canUseParent(error)) break
          }
        }
        if (lastError) {
          reportFailure(lastError)
          // Do not turn one network timeout into four serial timeouts for this tile.
          if (!canUseParent(lastError)) break
        }
      }
      if (disposed || !painted) return empty
      // Preserve transparent holes if even the lowest permitted parent is unavailable.
      const result = canvas.toDataURL(painted === job.tiles.children.length ? 'image/jpeg' : 'image/png', .95)
      if (!result.startsWith('data:image/') || result.length > 512 * 1024) throw new Error('tile_too_large')
      cache.set(job.tiles.id, result)
      if (cache.size > 8) cache.delete(cache.keys().next().value)
      if (!reported) { reported = true; onEvent('ready', { displayLevel: job.z, dataLevel, tileSize: 512 }) }
      return result
    } catch (error) {
      reportFailure(error)
      return empty
    } finally {
      canvas.width = canvas.height = probe.width = probe.height = 0
      images.forEach(image => { if (image.close) image.close(); else image.src = '' })
    }
  }
  function pump() {
    while (!disposed && active < 2 && queue.length) {
      const job = queue.shift()
      active++
      render(job).then(job.resolve, () => job.resolve(empty)).finally(() => {
        active--; pending.delete(job.tiles.id); pump()
      })
    }
  }
  return {
    getTileUrl(x, y, z) {
      const tiles = getSatelliteDetailTiles(x, y, z, highResolution)
      if (disposed || !tiles) return Promise.resolve(empty)
      if (cache.has(tiles.id)) {
        const value = cache.get(tiles.id); cache.delete(tiles.id); cache.set(tiles.id, value)
        return Promise.resolve(value)
      }
      if (pending.has(tiles.id)) return pending.get(tiles.id)
      if (pending.size >= 12) return Promise.resolve(empty)
      let resolve
      const promise = new Promise(done => { resolve = done })
      pending.set(tiles.id, promise)
      queue.push({ tiles, z, resolve }); pump()
      return promise
    },
    destroy() {
      disposed = true; cache.clear()
      queue.splice(0).forEach(job => job.resolve(empty))
      pending.clear()
    }
  }
}

// Keep missing imagery covered with parent tiles; only high-DPI devices request extra detail.
export function createSatelliteDetailController({ sdk, map, container }) {
  const view = container?.ownerDocument?.defaultView, doc = container?.ownerDocument
  if (!view || !sdk?.ImageTileLayer) return { setActive() {}, destroy() {} }
  const highResolution = view.devicePixelRatio > 1.25 && !(view.navigator?.deviceMemory > 0 && view.navigator.deviceMemory <= 2)
  let layer = null, loader = null, timer = null, enabled = false, ready = false, disposed = false, lastSatelliteView = null
  const cancellations = new Set()
  const blank = doc.createElement('canvas'); blank.width = blank.height = 1
  const empty = blank.toDataURL(); blank.width = blank.height = 0
  const log = (phase, detail = {}) => view.console?.info('[map-imagery-lod] ' + phase + ' ' + JSON.stringify(detail))
  function stop() {
    if (timer !== null) view.clearTimeout(timer)
    timer = null
    loader?.destroy(); loader = null
    for (const cancel of [...cancellations]) cancel()
    const previous = layer; layer = null
    try { previous?.destroy() } catch (_) { /* Optional overlay teardown is best effort. */ }
  }
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new view.Image()
      const finish = error => {
        view.clearTimeout(timeout); cancellations.delete(cancel)
        image.onload = image.onerror = null
        if (error) { image.src = ''; reject(error) } else resolve(image)
      }
      const cancel = () => finish(new Error('cancelled'))
      const timeout = view.setTimeout(() => finish(new Error('tile_timeout')), 4000)
      cancellations.add(cancel)
      image.crossOrigin = 'anonymous'
      image.onload = () => finish()
      image.onerror = () => finish(new Error('tile_load_failed'))
      image.src = url
    })
  }
  function update() {
    if (disposed) return
    const zoom = map.getZoom()
    if (!enabled || zoom < 12 || zoom > 20) { stop(); return }
    if (!ready || layer || timer !== null) return
    timer = view.setTimeout(() => {
      timer = null
      if (disposed || !enabled || map.getZoom() < 12 || map.getZoom() > 20) return
      try {
        loader = createSatelliteDetailLoader({ loadImage, createCanvas: () => doc.createElement('canvas'), empty, highResolution, onEvent: log })
        layer = new sdk.ImageTileLayer({ map, minZoom: 12, maxZoom: 20, maxDataZoom: 18,
          isMainThreadLoaded: true, getTileUrl: loader.getTileUrl })
        log('start', { displayLevel: map.getZoom(), maxDataLevel: 18 })
      } catch (error) {
        stop()
        log('fallback', { reason: 'unsupported_layer', message: String(error?.message || '').replace(/https?:\/\/[^\s]+/g, '[url]').slice(0, 120) })
      }
    }, 120)
  }
  function currentView() {
    const center = map.getCenter?.()
    if (!center) return null
    return [center.getLat(), center.getLng(), map.getZoom(), container.clientWidth || 0,
      container.clientHeight || 0, map.getRotation?.() || 0, map.getPitch?.() || 0]
  }
  function loaded() {
    if (disposed) return
    ready = true
    if (enabled) lastSatelliteView = currentView()
    update()
  }
  function destroy() {
    if (disposed) return
    disposed = true; stop()
    for (const [event, handler] of [['tilesloaded', loaded], ['zoom', update], ['destroyed', destroy]]) {
      try { map.off(event, handler) } catch (_) { /* SDK may already be destroyed. */ }
    }
  }
  map.on('tilesloaded', loaded); map.on('zoom', update); map.on('destroyed', destroy)
  return { setActive(value) {
    if (disposed) return
    if (enabled !== !!value) {
      const view = currentView()
      // Switching back to an already loaded, identical view can produce no tilesloaded.
      ready = !!value && !!view && !!lastSatelliteView && view.every((n, i) => Math.abs(n - lastSatelliteView[i]) < 1e-7)
    }
    enabled = !!value; update()
  }, destroy }
}
