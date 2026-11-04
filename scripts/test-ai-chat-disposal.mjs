import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { normalizeChatDisposalPoints, disposalMapUrl, disposalRouteUrl, createDisposalActions } from '../src/pages-nonTheme/utils/ai-chat-disposal.mjs'
import { getViewLocationMarkers } from '../src/utils/map-view-location.mjs'

const require = createRequire(import.meta.url)
const { parse, compileScript, compileTemplate, compileStyle } = require('@vue/compiler-sfc')
const pagePath = new URL('../src/pages-nonTheme/ai-chat.vue', import.meta.url)
const componentPath = new URL('../src/pages-nonTheme/components/ChatDisposalPoints.vue', import.meta.url)
const lightMapPath = new URL('../src/pages/map/map.vue', import.meta.url)
const darkMapPath = new URL('../src/pages-dark/map/map.vue', import.meta.url)
const page = fs.readFileSync(pagePath, 'utf8')
const component = fs.readFileSync(componentPath, 'utf8')
const lightMap = fs.readFileSync(lightMapPath, 'utf8')
const darkMap = fs.readFileSync(darkMapPath, 'utf8')
const point = { id: '17', name: '中山路投放点，东侧', description: '可投放生活垃圾', latitude: 31.2304, longitude: 121.4737, distanceMeters: 523 }

const normalized = normalizeChatDisposalPoints([point])[0]
assert.equal(normalized.id, '17', 'platform IDs remain strings')
assert.equal(normalized.latitude, point.latitude)
assert.deepEqual(normalizeChatDisposalPoints([
  { ...point, id: 18, latitude: null }, { ...point, id: 19, longitude: '' },
  { ...point, id: 20, latitude: 91 }, { ...point, id: 21, longitude: 181 },
  { ...point, id: 'bad-id' }
]), [], 'NULL, empty, out-of-range coordinates and malformed IDs are rejected')
assert.deepEqual(normalizeChatDisposalPoints([
  point, { ...point, id: '17', name: '重复项' }, { ...point, id: 18 }, { ...point, id: 19 }, { ...point, id: 20 }
]).map(item => item.id), ['17', '18'], 'only the first three raw items are considered and duplicate IDs are dropped')
assert.deepEqual(normalizeChatDisposalPoints(null), [])
assert.throws(() => disposalMapUrl({ ...point, latitude: null }), /投放点信息无效/)
const nativeMarker = getViewLocationMarkers({ latitude: '31.23', longitude: '121.47', name: '投放点详情' })
assert.equal(nativeMarker.length, 1)
assert.equal(nativeMarker[0].latitude, 31.23)
assert.equal(nativeMarker[0].longitude, 121.47)
assert.equal(nativeMarker[0].callout.content, '投放点详情')
assert.deepEqual(getViewLocationMarkers({ latitude: null, longitude: 121.47 }), [], 'missing coordinates do not make native markers')
assert.deepEqual(getViewLocationMarkers({ latitude: 91, longitude: 121.47 }), [], 'out-of-range coordinates do not make native markers')

const lightUrl = disposalMapUrl(point)
assert.equal(lightUrl, `/pages/map/map?mode=view&pointId=17&lat=31.2304&lng=121.4737&name=${encodeURIComponent(point.name)}&address=${encodeURIComponent(point.description)}`)
assert(disposalMapUrl(point, true).startsWith('/pages-dark/map/map?mode=view&'))
const route = new URL(disposalRouteUrl(point))
assert.equal(route.origin + route.pathname, 'https://uri.amap.com/navigation')
assert.equal(route.searchParams.get('to'), `${point.longitude},${point.latitude},中山路投放点，东侧`)
assert.equal(route.searchParams.get('mode'), 'walk')
assert.equal(route.searchParams.get('coordinate'), 'gaode')
assert.equal(route.searchParams.get('callnative'), '0')

let current = { ...point, name: '改名后的最新点位', latitude: 31.2401, longitude: 121.4899 }
let lookups = 0
const actions = []
const notices = []
const windows = []
const busy = []
let releaseLookup
const action = createDisposalActions({
  loadPoint: async id => { lookups++; actions.push(['lookup', id]); await new Promise(resolve => { releaseLookup = resolve }); return { code: 0, data: current } },
  navigateTo: async options => actions.push(['map', options]), openLocation: async options => actions.push(['native-route', options]),
  openRouteWindow: () => { const target = { location: { href: '' }, closed: false, close() { this.closed = true } }; windows.push(target); actions.push(['open-window']); return target },
  notify: value => notices.push(value), onBusy: value => busy.push(value)
})
const first = action({ ...point, latitude: 1, longitude: 1 }, 'map', true)
assert.equal(lookups, 1)
assert.equal(actions[0][0], 'lookup')
releaseLookup()
await first
assert.deepEqual(actions[1], ['map', { url: disposalMapUrl(current, true) }], 'map action uses the latest point data and selected theme')
assert.deepEqual(busy, ['17', ''])

let lookupResolve
const doubleCalls = []
const guarded = createDisposalActions({
  loadPoint: () => { doubleCalls.push('lookup'); return new Promise(resolve => { lookupResolve = resolve }) },
  navigateTo: options => doubleCalls.push(options), notify: message => notices.push(message)
})
const doubleOne = guarded(point)
const doubleTwo = await guarded(point)
assert.equal(doubleTwo, undefined)
assert.deepEqual(doubleCalls, ['lookup'], 'rapid double activation performs only one point lookup')
lookupResolve({ code: 0, data: current })
await doubleOne

let routeResolve
const routeEvents = []
let reservedRouteTarget
const routeAction = createDisposalActions({
  loadPoint: async () => { routeEvents.push('lookup'); await new Promise(resolve => { routeResolve = resolve }); return { code: 0, data: current } },
  openRouteWindow: () => { routeEvents.push('reserve-window'); reservedRouteTarget = { location: { href: '' }, close() { this.closed = true } }; return reservedRouteTarget },
  notify: message => notices.push(message)
})
const routePromise = routeAction(point, 'route')
assert.deepEqual(routeEvents.slice(0, 2), ['reserve-window', 'lookup'], 'route popup is reserved synchronously before awaiting latest-point lookup')
routeResolve()
await routePromise
assert.equal(reservedRouteTarget.location.href, disposalRouteUrl(current))

let nativeOptions
const nativeRoute = createDisposalActions({ loadPoint: async () => ({ code: 0, data: current }), openLocation: options => { nativeOptions = options } })
await nativeRoute(point, 'route')
assert.deepEqual(nativeOptions, { latitude: current.latitude, longitude: current.longitude, name: current.name, address: current.description }, 'native route uses latest platform point fields')

for (const failed of [{ code: 404 }, { code: 503 }, { code: 0, data: { ...point, id: '99' } }]) {
  const target = { location: { href: '' }, closed: false, close() { this.closed = true } }
  const notifyList = []
  const safe = createDisposalActions({ loadPoint: async () => failed, openRouteWindow: () => target, notify: message => notifyList.push(message) })
  await safe(point, 'route')
  assert.equal(target.closed, true, 'removed, unapproved or unavailable point closes the reserved route window')
  assert.equal(target.location.href, '')
  assert.equal(notifyList.length, 1)
}

// Compile the actual page and card component, including their scoped styles.
for (const [filename, source] of [['ai-chat.vue', page], ['ChatDisposalPoints.vue', component], ['pages/map/map.vue', lightMap], ['pages-dark/map/map.vue', darkMap]]) {
  const { descriptor, errors } = parse(source, { filename })
  assert.deepEqual(errors, [], `${filename}: SFC parse`)
  const compiled = compileScript(descriptor, { id: 'disposal-test' })
  // Uni's #ifdef/#ifndef compiler makes native/H5 map alternatives mutually exclusive.
  // Normalize only the root map's conditional for standalone Vue template compilation.
  const templateSource = filename.includes('/map/')
    ? descriptor.template.content.replace('<map v-else-if="!showAddModal"', '<map v-if="!isH5 && !showAddModal"')
    : descriptor.template.content
  const template = compileTemplate({ source: templateSource, filename, id: 'disposal-test', compilerOptions: { bindingMetadata: compiled.bindings } })
  assert.deepEqual(template.errors, [], `${filename}: template compile`)
  for (const style of descriptor.styles) assert.deepEqual(compileStyle({ source: style.content, filename, id: 'disposal-test', scoped: style.scoped }).errors, [], `${filename}: style compile`)
}

const componentScript = compileScript(parse(component).descriptor, { id: 'disposal-state-test' }).content
  .replace(/^import .* from 'vue'$/gm, 'const { computed } = Vue')
  .replace(/^import .*ai-chat-disposal\.mjs'$/gm, '')
  .replace(/^import .*nearby-disposal\.mjs'$/gm, '')
  .replace('export default', 'globalThis.DisposalComponent =')
const componentContext = { Vue: require('vue'), normalizeChatDisposalPoints, formatDisposalDistance: value => `${value}m` }
vm.createContext(componentContext)
vm.runInContext(componentScript, componentContext)
const state = componentContext.DisposalComponent.setup({ value: [point], busyId: '' }, { emit() {}, expose() {} })
assert.equal(state.points.value.length, 1)
assert(component.includes('@tap.stop="$emit(\'open\', point, \'map\')"'))
assert(component.includes('@tap.stop="$emit(\'open\', point, \'route\')"'))
assert(page.includes('msg.disposalPoints') && page.includes('openDisposalPoint'))
assert(page.includes('request({ url: `/api/ai/chat/disposal-point/${id}`'))
assert(lightMap.includes('getViewLocationMarkers(viewLocationInfo.value)'))
assert(darkMap.includes('getViewLocationMarkers(viewLocationInfo.value)'))

console.log('ai-chat disposal frontend checks passed: point safety, map/routes, latest-ID lookup, stale failure, actions, history UI SFC/style compile')
