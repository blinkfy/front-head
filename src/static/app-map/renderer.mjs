// Runs in the App render layer; the logic layer never accesses DOM or SDK objects.
export function createAppTencentMap({ sdk, container, emit, assetUrl = value => value, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let map, layer, state, markerKey, basemap, boundsTimer, destroyed = false
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
      map = new sdk.Map(container, {
        center: new sdk.LatLng(Number(state.latitude), Number(state.longitude)), zoom: Number(state.scale) || 16,
        viewMode: '2D', mapTypeControl: false
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
    } else {
      if (previous.latitude !== state.latitude || previous.longitude !== state.longitude) {
        map.setCenter(new sdk.LatLng(Number(state.latitude), Number(state.longitude)))
      }
      if (previous.scale !== state.scale) map.setZoom(Number(state.scale) || 16)
    }
    if (basemap !== !!state.satellite) {
      basemap = !!state.satellite
      // Completion is reported by tilesloaded, never by a successful setter alone.
      map.setBaseMap(basemap ? { type: 'satellite', features: ['base', 'road'] } : { type: 'vector' })
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
      if (map) { listeners.forEach(([type, handler]) => map.off(type, handler)); map.destroy() }
      map = layer = null
    }
  }
}
