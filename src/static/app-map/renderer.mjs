// Runs in the App render layer; the logic layer never accesses DOM or SDK objects.
export function createAppTencentMap({ sdk, container, emit, assetUrl = value => value, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let map, layer, detail, state, markerKey, basemap, boundsTimer, destroyed = false
  const listeners = []
  const location = () => {
    const center = map.getCenter()
    return { latitude: Number(center.getLat()), longitude: Number(center.getLng()) }
  }
  const send = (type, detail) => { if (!destroyed) emit({ type, detail }) }
  function listen(type, handler) { map.on(type, handler); listeners.push([type, handler]) }
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
      listen('tilesloaded', () => send('updated', { satellite: basemap === true }))
      listen('error', event => {
        const message = String(event?.message || event?.error?.message || event?.msg || '').replace(/https?:\/\/[^\s]+/g, '[url]').slice(0, 160)
        send('error', { code: 'sdk_error', sdkCode: event?.code || event?.error?.code, message, satellite: basemap === true })
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
    } else {
      if (previous.latitude !== state.latitude || previous.longitude !== state.longitude) {
        map.setCenter(new sdk.LatLng(Number(state.latitude), Number(state.longitude)))
      }
      if (previous.scale !== state.scale) map.setZoom(Number(state.scale) || 16)
    }
    if (basemap !== !!state.satellite) {
      basemap = !!state.satellite
      // Completion is reported by tilesloaded, never by a successful setter alone.
      detail.setActive(basemap)
      map.setBaseMap(getTencentBasemapOptions(basemap))
      send('switching', { satellite: basemap })
    }
    const key = JSON.stringify([state.markers || [], state.userLocation])
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
        geometries.push({ id, styleId: id, position: new sdk.LatLng(Number(marker.latitude), Number(marker.longitude)) })
      })
      const user = state.userLocation
      if (user?.latitude !== null && user?.latitude !== undefined && user?.longitude !== null && user?.longitude !== undefined &&
          Number.isFinite(Number(user.latitude)) && Number.isFinite(Number(user.longitude))) {
        styles.user = new sdk.MarkerStyle({ width: 24, height: 24, anchor: { x: 12, y: 12 },
          src: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="10" fill="#3989fa" stroke="white" stroke-width="3"/></svg>') })
        geometries.push({ id: 'user', styleId: 'user', position: new sdk.LatLng(Number(user.latitude), Number(user.longitude)) })
      }
      if (layer) layer.setMap(null)
      layer = new sdk.MultiMarker({ map, styles, geometries })
      layer.on('click', event => { if (ids.has(event.geometry?.id)) send('markertap', { markerId: ids.get(event.geometry.id) }) })
    }
    if (state.command && state.command.id !== previous?.command?.id) {
      if (state.command.type === 'move') {
        const { latitude, longitude } = state.command
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
          const center = location()
          if (Math.abs(center.latitude - latitude) > 1e-7 || Math.abs(center.longitude - longitude) > 1e-7) {
            map.setCenter(new sdk.LatLng(latitude, longitude))
          }
        }
      } else {
        send('center', { requestId: state.command.id, ...location() })
      }
    }
  }
  return {
    update,
    destroy() {
      if (destroyed) return
      destroyed = true
      if (boundsTimer) clearTimer(boundsTimer)
      if (layer) layer.setMap(null)
      detail?.destroy()
      if (map) { listeners.forEach(([type, handler]) => map.off(type, handler)); map.destroy() }
      map = layer = null
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
            if ((image.naturalWidth || image.width) !== 256 || (image.naturalHeight || image.height) !== 256) throw new Error('invalid_tile')
            check.drawImage(image, 0, 0, 64, 64)
            const data = check.getImageData(0, 0, 64, 64).data, bins = new Uint16Array(4096)
            let dominant = 0, most = 0
            for (let i = 0; i < data.length; i += 4) {
              const bin = (data[i] >> 4) * 256 + (data[i + 1] >> 4) * 16 + (data[i + 2] >> 4)
              if (++bins[bin] > most) { dominant = bin; most = bins[bin] }
            }
            const colors = [dominant >> 8, dominant >> 4 & 15, dominant & 15]
            if (most >= 4096 * .8 && Math.max(...colors) - Math.min(...colors) <= 3) throw new Error('imagery_unavailable')
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
