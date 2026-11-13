import { mapConfig } from '../api/map-config.js'
import { loadRecyclingLeaflet } from '../pages-nonTheme/utils/recycling-map-loader.mjs'
import { gcj02ToWgs84, wgs84ToGcj02 } from '../pages-nonTheme/utils/recycling-geometry.mjs'

let sdkTask
const mapRequests = new WeakMap()
const sdkReady = sdk => ['Map', 'LatLng', 'LatLngBounds', 'MultiMarker', 'MarkerStyle', 'MultiCircle', 'CircleStyle', 'MultiPolygon', 'PolygonStyle', 'MultiPolyline', 'PolylineStyle'].every(key => typeof sdk?.[key] === 'function')

export function loadTencentWebMap() {
  if (sdkReady(window.TMap)) return Promise.resolve(window.TMap)
  if (sdkTask) return sdkTask
  sdkTask = (async () => {
    const keys = [...new Set([mapConfig.qqMapKey, mapConfig.qqMapKeyBackup].filter(Boolean))]
    for (const key of keys) {
      try {
        return await new Promise((resolve, reject) => {
          const script = document.createElement('script')
          let settled = false
          const finish = error => {
            if (settled) return
            settled = true; clearTimeout(timer); script.onload = script.onerror = null
            if (error) { script.remove(); reject(error) } else resolve(window.TMap)
          }
          const timer = setTimeout(() => finish(new Error('腾讯地图加载超时')), 6500)
          script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(key)}`
          script.onload = () => finish(sdkReady(window.TMap) ? null : new Error('腾讯地图不可用'))
          script.onerror = () => finish(new Error('腾讯地图加载失败'))
          document.head.appendChild(script)
        })
      } catch (_) { /* Try the configured backup before using the alternate provider. */ }
    }
    throw new Error('腾讯地图不可用')
  })().catch(error => { sdkTask = null; throw error })
  return sdkTask
}

// The small interface shared by the existing editors always accepts/returns
// WGS84. Only this display boundary knows Tencent's GCJ02 coordinates.
export function createTencentMapLibrary(sdk) {
  const toNative = point => { const p = wgs84ToGcj02(point[0], point[1]); return new sdk.LatLng(p.latitude, p.longitude) }
  const fromNative = point => {
    const p = gcj02ToWgs84(Number(point?.getLat?.() ?? point?.lat), Number(point?.getLng?.() ?? point?.lng))
    return p ? { lat: p.latitude, lng: p.longitude } : null
  }
  const rgba = (color = '#168362', opacity = .14) => /^#[\da-f]{6}$/i.test(color) ? `rgba(${parseInt(color.slice(1,3),16)},${parseInt(color.slice(3,5),16)},${parseInt(color.slice(5,7),16)},${opacity})` : color
  const pin = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="26" height="36" viewBox="0 0 26 36"><path fill="#2683c7" stroke="white" stroke-width="2" d="M13 35C10 29 1 21 1 13a12 12 0 1 1 24 0c0 8-9 16-12 22Z"/><circle cx="13" cy="13" r="4" fill="white"/></svg>')
  function map(container, options = {}) {
    const element = typeof container === 'string' ? document.getElementById(container) : container
    if (!element) throw new Error('地图容器不存在')
    const native = new sdk.Map(element, { center: toNative(options.center || [35.86,104.19]), zoom: options.zoom || 5, viewMode: '2D', pitch: 0, doubleClickZoom: options.doubleClickZoom !== false })
    const children = new Set(), listeners = []
    let removed = false
    const api = {
      native, element, children,
      on(event, fn) { const handler = e => { const latlng = e?.latLng ? fromNative(e.latLng) : null; fn({ ...e, latlng }) }; native.on(event, handler); listeners.push([event,handler]); return api },
      setView(point, zoom) { native.setCenter(toNative(point)); if (zoom != null) native.setZoom(zoom); return api },
      getCenter() { return fromNative(native.getCenter()) },
      invalidateSize() { native.resize?.(); return api },
      fitBounds(points, options = {}) {
        const bounds = new sdk.LatLngBounds(); points.forEach(point => bounds.extend(toNative(point)))
        const padding = options.padding || [24,24]
        native.fitBounds(bounds, { padding: Array.isArray(padding) ? { top:padding[1],bottom:padding[1],left:padding[0],right:padding[0] } : padding, ...(options.maxZoom ? {maxZoom:options.maxZoom} : {}), ease:{duration:0} })
        return api
      },
      removeLayer(layer) { layer.remove(); return api },
      remove() { if (removed) return; removed = true; [...children].forEach(child => child.remove()); listeners.forEach(([event,fn]) => native.off(event,fn)); native.destroy() }
    }
    return api
  }
  function layerGroup() {
    const children = new Set()
    const group = { children, addTo(parent) { group.parent = parent; parent.children.add(group); return group }, clearLayers() { [...children].forEach(child => child.remove()); return group }, remove() { group.clearLayers(); group.parent?.children.delete(group) } }
    return group
  }
  function shape(kind, points, options = {}) {
    let native, parent, owner, info, dragging = false
    let position = points
    const events = new Map(), cleanups = []
    const emit = event => (events.get(event) || []).forEach(fn => fn())
    const api = {
      addTo(target) {
        parent = target; owner = target.native ? target : target.parent
        const common = { map: owner.native, disableInteractive: options.interactive === false, geometries: [] }
        const color = options.color || '#168362'
        if (kind === 'marker' || kind === 'dot') {
          const radius = options.radius || 5
          const src = kind === 'marker' ? pin : 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${radius*2+2}" height="${radius*2+2}"><circle cx="${radius+1}" cy="${radius+1}" r="${radius}" fill="${color}" stroke="white"/></svg>`)
          const size = kind === 'marker' ? [26,36] : [radius*2+2,radius*2+2]
          native = new sdk.MultiMarker({ ...common, styles: { main: new sdk.MarkerStyle({ src, width:size[0], height:size[1], anchor:{x:size[0]/2,y:kind==='marker'?size[1]:size[1]/2} }) }, geometries:[{id:'point',styleId:'main',position:toNative(position)}] })
          if (options.draggable) {
            const start = () => { dragging = true; owner.native.setDraggable(false) }
            const move = e => { if (!dragging || !e?.latLng) return; const p = fromNative(e.latLng); if (!p) return; position = [p.lat,p.lng]; native.setGeometries([{id:'point',styleId:'main',position:toNative(position)}]) }
            const end = () => { if (!dragging) return; dragging = false; owner.native.setDraggable(true); emit('dragend') }
            for (const event of ['mousedown','touchstart']) { native.on(event,start); cleanups.push(() => native.off(event,start)) }
            for (const event of ['mousemove','touchmove']) { owner.native.on(event,move); cleanups.push(() => owner.native.off(event,move)) }
            for (const event of ['mouseup','touchend']) { owner.native.on(event,end); cleanups.push(() => owner.native.off(event,end)) }
            for (const event of ['pointerup','pointercancel']) { document.addEventListener(event,end); cleanups.push(() => document.removeEventListener(event,end)) }
          }
        } else {
          const style = { color:rgba(color, options.fillOpacity ?? .14), showBorder:true, borderColor:color, borderWidth:options.weight || 2 }
          if (kind === 'circle') native = new sdk.MultiCircle({ ...common, styles:{main:new sdk.CircleStyle(style)}, geometries:[{id:'shape',styleId:'main',center:toNative(points),radius:options.radius}] })
          else if (kind === 'polygon') native = new sdk.MultiPolygon({ ...common, styles:{main:new sdk.PolygonStyle(style)}, geometries:[{id:'shape',styleId:'main',paths:points.map(toNative)}] })
          else native = new sdk.MultiPolyline({ ...common, styles:{main:new sdk.PolylineStyle({color,width:options.weight || 2,dashArray:options.dashArray ? options.dashArray.split(' ').map(Number) : [0,0]})}, geometries:[{id:'shape',styleId:'main',paths:points.map(toNative)}] })
        }
        target.children.add(api)
        return api
      },
      on(event, fn) { events.set(event,[...(events.get(event)||[]),fn]); return api },
      getLatLng() { return {lat:position[0],lng:position[1]} },
      bindTooltip(text) { api.label = text; return api },
      bindPopup(text) { api.label = text; return api },
      openPopup() { if (sdk.InfoWindow && owner) info = new sdk.InfoWindow({map:owner.native,position:toNative(position),content:api.label || ''}); return api },
      remove() { cleanups.splice(0).forEach(fn=>fn()); if (dragging) owner.native.setDraggable(true); dragging = false; info?.destroy(); info = null; native?.setMap(null); native = null; parent?.children.delete(api) }
    }
    return api
  }
  return { map, layerGroup, marker:(p,o)=>shape('marker',p,o), circleMarker:(p,o)=>shape('dot',p,o), circle:(p,o)=>shape('circle',p,o), polygon:(p,o)=>shape('polygon',p,o), polyline:(p,o)=>shape('polyline',p,o) }
}

function waitForTencentTiles(map, request) {
  return new Promise((resolve,reject) => {
    const finish = error => { clearTimeout(timer); map.native.off('tilesloaded',loaded); map.native.off('context_lost',failed); error ? reject(error) : resolve() }
    const loaded = () => finish()
    const failed = () => finish(new Error('腾讯地图渲染失败'))
    const timer = setTimeout(() => finish(new Error('腾讯地图底图加载超时')), 9000)
    request.cancel = failed
    map.native.on('tilesloaded',loaded); map.native.on('context_lost',failed)
  })
}

export async function createPreferredWebMap(container, options = {}) {
  if (options.signal?.aborted) throw new Error('地图已关闭')
  const element = typeof container === 'string' ? document.getElementById(container) : container
  if (!element || element.isConnected === false) throw new Error('地图容器已关闭')
  const previous = mapRequests.get(element)
  previous?.cancel?.(); previous?.map?.remove()
  const request = {}
  mapRequests.set(element,request)
  const current = () => !options.signal?.aborted && mapRequests.get(element) === request && element.isConnected !== false
  const ensureCurrent = () => { if (!current()) throw new Error('地图容器已关闭') }
  const abort = () => { request.cancel?.(); request.map?.remove() }
  options.signal?.addEventListener('abort',abort,{once:true})
  let map
  try {
  try {
    const library = createTencentMapLibrary(await loadTencentWebMap())
    ensureCurrent()
    map = library.map(element, options); request.map = map
    await waitForTencentTiles(map, request)
    ensureCurrent()
    request.cancel = null
    return { library, map, provider:'tencent' }
  } catch (_) { map?.remove() }
  ensureCurrent()
  const library = await loadRecyclingLeaflet()
  ensureCurrent()
  map = library.map(element, options); request.map = map
  try {
    await new Promise((resolve,reject) => {
      const tile = library.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19, attribution:'&copy; OpenStreetMap contributors' })
      const timer = setTimeout(() => reject(new Error('备用地图加载超时，请检查网络后重试')),12000)
      request.cancel = () => { clearTimeout(timer); reject(new Error('地图容器已关闭')) }
      tile.on('tileload', () => { clearTimeout(timer); resolve() }); tile.addTo(map)
    })
    ensureCurrent()
    request.cancel = null
    return { library, map, provider:'osm' }
  } catch (error) { map.remove(); throw error }
  } finally { options.signal?.removeEventListener('abort',abort) }
}
