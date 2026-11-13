import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { wgs84ToGcj02, gcj02ToWgs84 } from '../src/pages-nonTheme/utils/recycling-geometry.mjs'

function loadModule(source, bindings, filename) {
  const executable = source.replace(/^import .*\r?\n/gm, '').replaceAll('export function ', 'function ').replaceAll('export async function ', 'async function ')
  const names = [...executable.matchAll(/^(?:async )?function (\w+)\(/gm)].map(match => match[1])
  const context = vm.createContext({ ...bindings })
  vm.runInContext(`${executable}\nthis.exports = { ${names.join(', ')} }`, context, { filename })
  return { ...context.exports, context }
}

function onlyH5(source) {
  const stack = [true], output = []
  for (const line of source.split(/\r?\n/)) {
    const open = line.match(/^\s*\/\/\s*#(ifdef|ifndef)\s+(.+)\s*$/)
    const otherwise = /^\s*\/\/\s*#else\s*$/.test(line)
    const close = /^\s*\/\/\s*#endif\s*$/.test(line)
    if (open) { const match = open[2].split(/\s+\|\|\s+/).includes('H5'); stack.push(stack.at(-1) && (open[1] === 'ifdef' ? match : !match)) }
    else if (otherwise) stack[stack.length - 1] = stack.at(-2) && !stack.at(-1)
    else if (close) stack.pop()
    else if (stack.at(-1)) output.push(line)
  }
  return output.join('\n')
}

const preferredSource = await readFile(new URL('../src/utils/preferred-web-map.js', import.meta.url), 'utf8')
const preferred = loadModule(preferredSource, { mapConfig: { qqMapKey: 'primary', qqMapKeyBackup: 'backup' }, loadRecyclingLeaflet: async () => ({}), wgs84ToGcj02, gcj02ToWgs84, document: { addEventListener() {}, removeEventListener() {}, getElementById: id => ({ id }) }, window: {} }, 'preferred-web-map.js')

class LatLng { constructor(lat, lng) { this.lat = lat; this.lng = lng } getLat() { return this.lat } getLng() { return this.lng } }
class Bounds { constructor() { this.points = [] } extend(point) { this.points.push(point) } }
const overlays = []
class Overlay {
  constructor(options) { Object.assign(this, options); this.events = new Map(); this.geometries = options.geometries || []; overlays.push(this) }
  on(name, callback) { this.events.set(name, [...(this.events.get(name) || []), callback]) }
  off(name, callback) { this.events.set(name, (this.events.get(name) || []).filter(fn => fn !== callback)) }
  fire(name, event = {}) { for (const fn of this.events.get(name) || []) fn(event) }
  setMap(map) { this.map = map }
  setGeometries(geometries) { this.geometries = geometries }
  setDraggable(value) { this.draggable = value }
}
class NativeMap extends Overlay {
  constructor(element, options) { super(options); this.element = element; this.center = options.center; this.zoom = options.zoom }
  setCenter(point) { this.center = point }
  setZoom(zoom) { this.zoom = zoom }
  getCenter() { return this.center }
  getZoom() { return this.zoom }
  resize() {}
  fitBounds(bounds) { this.bounds = bounds }
  destroy() { this.destroyed = true }
}
const sdk = { Map: NativeMap, LatLng, LatLngBounds: Bounds, MultiMarker: Overlay, MarkerStyle: class {}, MultiCircle: Overlay, CircleStyle: class {}, MultiPolygon: Overlay, PolygonStyle: class {}, MultiPolyline: Overlay, PolylineStyle: class {} }
const library = preferred.createTencentMapLibrary(sdk)
const map = library.map({ id: 'map' }, { center: [25.033, 121.5654], zoom: 12 })
const nativeCenter = wgs84ToGcj02(25.033, 121.5654)
assert.ok(Math.abs(map.native.center.lat - nativeCenter.latitude) < 1e-8, 'map center converts WGS84 to GCJ02 for display')
let clicked
map.on('click', event => { clicked = event.latlng })
map.native.fire('click', { latLng: new LatLng(nativeCenter.latitude, nativeCenter.longitude) })
assert.ok(Math.abs(clicked.lat - 25.033) < 2e-5 && Math.abs(clicked.lng - 121.5654) < 2e-5, 'map click returns a WGS84 point')
const group = library.layerGroup().addTo(map)
const circle = library.circle([25.033, 121.5654], { radius: 120 }).addTo(group)
const polygon = library.polygon([[25.03,121.56],[25.04,121.56],[25.04,121.57]]).addTo(group)
const circleNative = overlays.find(overlay => overlay.geometries[0]?.id === 'shape' && overlay.geometries[0]?.center)
const polygonNative = overlays.find(overlay => overlay.geometries[0]?.paths?.length === 3)
assert.ok(Math.abs(circleNative.geometries[0].center.lat - nativeCenter.latitude) < 1e-8, 'circle center converts to GCJ02')
assert.equal(polygonNative.geometries[0].paths.length, 3, 'polygon paths are sent to Tencent overlay')
const marker = library.marker([25.033, 121.5654], { draggable: true }).addTo(group)
const markerNative = overlays.at(-1)
let dragEnd = 0
marker.on('dragend', () => dragEnd++)
markerNative.fire('mousedown')
const moved = wgs84ToGcj02(25.034, 121.566)
map.native.fire('mousemove', { latLng: new LatLng(moved.latitude, moved.longitude) })
map.native.fire('mouseup')
assert.equal(dragEnd, 1, 'marker drag emits dragend after movement')
assert.ok(Math.abs(marker.getLatLng().lat - 25.034) < 2e-5 && Math.abs(marker.getLatLng().lng - 121.566) < 2e-5, 'marker drag position is converted back to WGS84')
// Removal must tolerate repeated calls and detach overlay listeners.
map.remove(); map.remove(); group.remove(); marker.remove(); circle.remove(); polygon.remove()
assert.equal(map.native.destroyed, true, 'map removal destroys the native map')

const placeSource = await readFile(new URL('../src/utils/map-place-search.js', import.meta.url), 'utf8')
const places = loadModule(placeSource, { searchPlaces: async (_q, lat, lng) => ({ code: 0, data: [{ title: '地点', address: '台北市', location: { lat, lng } }] }), wgs84ToGcj02, gcj02ToWgs84, uni: { request() {} } }, 'map-place-search.js')
const found = await places.searchMapPlaces('地点', { latitude: 25.033, longitude: 121.5654 })
assert.ok(Math.abs(found[0].latitude - 25.033) < 2e-5, 'Tencent search result is converted back to WGS84')

const addressSource = await readFile(new URL('../src/utils/location-address.js', import.meta.url), 'utf8')
const h5AddressSource = onlyH5(addressSource)
  .replace("import { getUserLocationOnce } from '@/utils/location'", '')
  .replace("import { reverseGeocoder } from '@/api/map'", '')
  .replace("import { wgs84ToGcj02 } from '@/pages-nonTheme/utils/recycling-geometry.mjs'", '')
  .replace('export async function resolveLocationAddress', 'async function resolveLocationAddress')
  .replace('export async function getCurrentAddress', 'async function getCurrentAddress')
let reverseInput
const address = loadModule(h5AddressSource, {
  getUserLocationOnce: async () => ({ latitude: 25.033, longitude: 121.5654, accuracy: 31 }),
  reverseGeocoder: async (latitude, longitude) => { reverseInput = { latitude, longitude }; return { code: 0, data: { result: { address: '台北市', address_component: {} } } } },
  wgs84ToGcj02, uni: { request() { throw new Error('OSM fallback should not be used') } }
}, 'location-address.js')
const resolved = await address.resolveLocationAddress(25.033, 121.5654, 31)
const expectedReverse = wgs84ToGcj02(25.033, 121.5654)
assert.ok(Math.abs(reverseInput.latitude - expectedReverse.latitude) < 1e-8, 'Tencent reverse geocoder receives GCJ02 input')
assert.equal(resolved.latitude, 25.033, 'resolved Tencent address retains original WGS84 latitude')
assert.equal(resolved.longitude, 121.5654, 'resolved Tencent address retains original WGS84 longitude')
assert.equal(resolved.accuracy, 31, 'resolved address retains location accuracy')

const fallbackAddress = loadModule(h5AddressSource, {
  getUserLocationOnce: async () => ({}), reverseGeocoder: async () => { throw new Error('Tencent unavailable') }, wgs84ToGcj02,
  uni: { request(options) { options.success({ statusCode: 200, data: { display_name: 'OSM 地址', address: {} } }) } }
}, 'location-address-fallback.js')
assert.equal((await fallbackAddress.resolveLocationAddress(25.033, 121.5654, 12)).address, 'OSM 地址', 'reverse geocoder falls back to OSM when Tencent fails')

console.log('preferred Tencent map coordinate, overlay, marker, cleanup, place search, and reverse geocoding checks passed')


// Exercise the asynchronous factory with real timers, not just its display adapter.
let pendingNative, alternateLoads = 0
class PendingMap extends NativeMap { constructor(element, options) { super(element, options); pendingNative = this } }
const pendingFactory = loadModule(preferredSource, {
  mapConfig: {}, window: { TMap: { ...sdk, Map: PendingMap } },
  document: { getElementById() {}, addEventListener() {}, removeEventListener() {} },
  loadRecyclingLeaflet: async () => { alternateLoads++; throw new Error('Unexpected alternate map') },
  wgs84ToGcj02, gcj02ToWgs84, setTimeout, clearTimeout
}, 'preferred-map-pending.js')
const controller = new AbortController()
const canceledMap = pendingFactory.createPreferredWebMap({ isConnected: true }, { signal: controller.signal })
for (let turn = 0; !pendingNative && turn < 6; turn++) await Promise.resolve()
assert.ok(pendingNative, 'Tencent instance exists while waiting for its tiles')
controller.abort()
await assert.rejects(canceledMap, /关闭/)
assert.equal(pendingNative.destroyed, true, 'abort immediately destroys the pending native map')
assert.equal(alternateLoads, 0, 'canceling does not start the alternate provider')
assert.equal([...pendingNative.events.values()].flat().length, 0, 'abort detaches readiness listeners')

let fallbackRemoved = 0, fallbackLoads = 0
const fallbackLibrary = {
  map: () => ({ remove() { fallbackRemoved++ } }),
  tileLayer: () => { let loaded; return { on(event, fn) { if (event === 'tileload') loaded = fn; return this }, addTo() { queueMicrotask(loaded) } } }
}
const fallbackFactory = loadModule(preferredSource, {
  mapConfig: {}, window: { TMap: { ...sdk, Map: class { constructor() { throw new Error('WebGL unavailable') } } } },
  document: {}, loadRecyclingLeaflet: async () => { fallbackLoads++; return fallbackLibrary },
  wgs84ToGcj02, gcj02ToWgs84, setTimeout, clearTimeout
}, 'preferred-map-fallback.js')
const alternate = await fallbackFactory.createPreferredWebMap({ isConnected: true })
assert.equal(alternate.provider, 'osm', 'Tencent renderer failure falls back to the alternate provider')
assert.equal(fallbackLoads, 1)
alternate.map.remove(); assert.equal(fallbackRemoved, 1)

const sdkWindow = {}, sdkRequests = []
const sdkLoader = loadModule(preferredSource, {
  mapConfig: { qqMapKey: 'primary', qqMapKeyBackup: 'backup' }, window: sdkWindow,
  document: { createElement: () => ({ remove() {} }), head: { appendChild(script) { sdkRequests.push(script.src); if (sdkRequests.length === 1) script.onerror(); else { sdkWindow.TMap = sdk; script.onload() } } } },
  loadRecyclingLeaflet: async () => {}, wgs84ToGcj02, gcj02ToWgs84, setTimeout, clearTimeout
}, 'preferred-map-sdk-loader.js')
assert.equal(await sdkLoader.loadTencentWebMap(), sdk)
assert.equal(sdkRequests.length, 2, 'SDK download failure tries the configured backup key')
assert.match(sdkRequests[0], /key=primary/); assert.match(sdkRequests[1], /key=backup/)
console.log('preferred map pending abort, renderer fallback, and SDK backup checks passed')
