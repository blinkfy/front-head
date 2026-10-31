import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createAppTencentMap } from '../src/utils/app-tencent-map.mjs'

const require = createRequire(import.meta.url)
const { parse: parseSfc, compileTemplate, compileStyle } = require('@vue/compiler-sfc')
const babel = require('@babel/parser')
const rendererTests = []
const hookTests = []
const sfcTests = []
function check(list, name, fn) {
  if (process.env.APP_MAP_ONLY_PAGE_LIFECYCLE === '1' && name !== 'App page hide pauses while retaining background completion; show resumes without fallback') return
  try { fn(); list.push({ name, ok: true }) }
  catch (error) { list.push({ name, ok: false, error: error.message }) }
}
function fakeClock() {
  let now = 0, serial = 0
  const tasks = new Map()
  return {
    setTimeout(fn, delay = 0) { const id = ++serial; tasks.set(id, { at: now + Number(delay), fn }); return id },
    clearTimeout(id) { tasks.delete(id) },
    tick(ms) {
      const end = now + ms
      while (true) {
        const next = [...tasks].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
        if (!next) break
        tasks.delete(next[0]); now = next[1].at; next[1].fn()
      }
      now = end
    },
    get pending() { return tasks.size }
  }
}
function makeSdk() {
  const maps = [], layers = []
  class LatLng { constructor(lat, lng) { this.lat = lat; this.lng = lng } getLat() { return this.lat } getLng() { return this.lng } }
  class MapMock {
    constructor(container, options) { this.container = container; this.options = options; this.handlers = new Map(); this.calls = []; this.center = options.center; this.zoom = options.zoom; this.destroyed = false; maps.push(this) }
    on(type, fn) { const set = this.handlers.get(type) || new Set(); set.add(fn); this.handlers.set(type, set) }
    off(type, fn) { this.handlers.get(type)?.delete(fn) }
    fire(type, event = {}) { for (const fn of [...(this.handlers.get(type) || [])]) fn(event) }
    setBaseMap(options) { this.calls.push(['basemap', options]) }
    setCenter(value) { this.center = value; this.calls.push(['center', value]) }
    setZoom(value) { this.zoom = value; this.calls.push(['zoom', value]) }
    getCenter() { return this.center }
    getZoom() { return this.zoom }
    destroy() { this.destroyed = true }
    handlerCount() { return [...this.handlers.values()].reduce((n, s) => n + s.size, 0) }
  }
  class MarkerStyle { constructor(options) { Object.assign(this, options) } }
  class MultiMarker {
    constructor(options) { Object.assign(this, options); this.handlers = new Map(); this.detached = false; layers.push(this) }
    on(type, fn) { this.handlers.set(type, fn) }
    fire(type, event) { this.handlers.get(type)?.(event) }
    setMap(map) { if (map === null) this.detached = true }
  }
  return { sdk: { Map: MapMock, LatLng, MarkerStyle, MultiMarker }, maps, layers }
}

// Pure renderer behavior with SDK and clock doubles.
{
  const clock = fakeClock(), { sdk, maps, layers } = makeSdk(), events = []
  const renderer = createAppTencentMap({ sdk, container: {}, emit: event => events.push(event), assetUrl: value => `/asset/${value}`, setTimer: clock.setTimeout, clearTimer: clock.clearTimeout })
  const base = { latitude: 25, longitude: 121, scale: 14, satellite: false, markers: [] }
  renderer.update(base)
  check(rendererTests, 'renderer setBaseMap switches vector and satellite; tilesloaded alone completes', () => {
    const map = maps[0]
    assert.deepEqual(map.calls.filter(x => x[0] === 'basemap').map(x => x[1]), [{ type: 'vector' }])
    assert.equal(events.some(e => e.type === 'updated'), false)
    renderer.update({ ...base, satellite: true })
    assert.deepEqual(map.calls.filter(x => x[0] === 'basemap').at(-1)[1], { type: 'satellite', features: ['base', 'road'] })
    assert.equal(events.some(e => e.type === 'updated'), false)
    map.fire('tilesloaded')
    assert.deepEqual(events.filter(e => e.type === 'updated').at(-1), { type: 'updated', detail: { satellite: true } })
    renderer.update({ ...base, satellite: false })
    assert.deepEqual(map.calls.filter(x => x[0] === 'basemap').at(-1)[1], { type: 'vector' })
  })
  check(rendererTests, 'renderer coordinates, center query and marker identity/assets', () => {
    const map = maps[0]
    renderer.update({ ...base, latitude: '24.5', longitude: '120.3', scale: '11', markers: [{ id: 'asset-77', latitude: 24, longitude: 120, iconPath: '/static/pin.png' }], command: { id: 9 } })
    assert.deepEqual(map.calls.filter(x => x[0] === 'center').at(-1)[1] && [map.center.getLat(), map.center.getLng()], [24.5, 120.3])
    assert.equal(map.zoom, 11)
    assert.deepEqual(events.filter(e => e.type === 'center').at(-1), { type: 'center', detail: { requestId: 9, latitude: 24.5, longitude: 120.3 } })
    const layer = layers.at(-1)
    assert.equal(layer.styles['point-0'].src, '/asset//static/pin.png')
    layer.fire('click', { geometry: { id: 'point-0' } })
    assert.deepEqual(events.filter(e => e.type === 'markertap').at(-1), { type: 'markertap', detail: { markerId: 'asset-77' } })
  })
  check(rendererTests, 'renderer repeats explicit moves with unchanged props and keeps center-query commands', () => {
    const map = maps[0]
  const props = { ...base, latitude: 24.6, longitude: 120.4 }
  renderer.update(props)
  const afterPropsCount = map.calls.filter(x => x[0] === 'center').length
  assert.deepEqual([map.center.getLat(), map.center.getLng()], [24.6, 120.4], 'props move the map to the selected target')
  renderer.update({ ...props, command: { id: 10, type: 'move', latitude: 24.6, longitude: 120.4 } })
  assert.equal(map.calls.filter(x => x[0] === 'center').length, afterPropsCount, 'same-target move command does not repeat props centering')

  map.center = new sdk.LatLng(23, 120) // Simulate the user panning after props have settled.
  renderer.update({ ...props, command: { id: 11, type: 'move', latitude: 24.6, longitude: 120.4 } })
  const afterRecenterCount = map.calls.filter(x => x[0] === 'center').length
  assert.equal(afterRecenterCount, afterPropsCount + 1, 'same-target move command recenters after a user pan')
  assert.deepEqual([map.center.getLat(), map.center.getLng()], [24.6, 120.4])

  renderer.update({ ...props, command: { id: 12, type: 'move', latitude: 21, longitude: 118 } })
  assert.equal(map.calls.filter(x => x[0] === 'center').length, afterRecenterCount + 1, 'a different move target still recenters')
    assert.deepEqual([map.center.getLat(), map.center.getLng()], [21, 118])
  renderer.update({ ...props, command: { id: 13 } })
  assert.deepEqual(events.filter(e => e.type === 'center').at(-1), { type: 'center', detail: { requestId: 13, latitude: 21, longitude: 118 } }, 'commands without type must continue to return the current center')
  })
  check(rendererTests, 'renderer bounds debounce and destroy leave no listeners/timers', () => {
    const map = maps[0], before = events.filter(e => e.type === 'regionchange').length
    map.center = new sdk.LatLng(23, 120); map.zoom = 8
    map.fire('bounds_changed'); clock.tick(60); map.fire('bounds_changed'); clock.tick(99)
    assert.equal(events.filter(e => e.type === 'regionchange').length, before)
    clock.tick(1)
    const region = events.filter(e => e.type === 'regionchange').at(-1)
    assert.deepEqual(region, { type: 'regionchange', detail: { type: 'end', centerLocation: { latitude: 23, longitude: 120 }, scale: 8 } })
    map.fire('bounds_changed'); renderer.destroy()
    assert.equal(map.destroyed, true); assert.equal(map.handlerCount(), 0); assert.equal(layers.at(-1).detached, true); assert.equal(clock.pending, 0)
    const count = events.length; clock.tick(1000); map.fire('tilesloaded')
    assert.equal(events.length, count)
  })
}

// Use the production state machine with deterministic timers.
import { createMapBasemapController, isBinLocationPicker } from '../src/utils/map-basemap-core.mjs'
import { captureSatelliteReference } from '../src/utils/bin-satellite-reference.mjs'



function newHookHarness({ platform = 'app-plus', options = { mode: 'select', purpose: 'bin' }, appWebMap = true, canIUse = true, suspendedState = false, deferNextTick = false } = {}) {
  const clock = fakeClock(), toasts = [], warnings = []
  let ready, mounted, beforeUnmount, unload, show, hide, watchCallback
  const nextTicks = []
  const vue = {
    getCurrentInstance: () => ({ root: { proxy: {} } }), nextTick: fn => deferNextTick ? nextTicks.push(fn) : fn(),
    onBeforeUnmount: fn => { beforeUnmount = fn }, onMounted: fn => { mounted = fn },
    ref: value => ({ value }), watch: (_source, fn) => { watchCallback = fn }
  }
  const uni = { showToast: value => toasts.push(value), createMapContext: () => null, canIUse: () => canIUse }
  let code = fs.readFileSync(new URL('../src/utils/use-map-basemap.js', import.meta.url), 'utf8')
  code = code.replace(/^import .*?\n/gm, '').replace('export function useMapBasemap', 'function useMapBasemap')
  const run = new Function('getCurrentInstance','nextTick','onBeforeUnmount','onMounted','ref','watch','onReady','onUnload','onShow','onHide','createMapBasemapController','isBinLocationPicker','captureSatelliteReference','appManifest','uni','process','plus','console','setTimeout','clearTimeout', `${code}\nreturn useMapBasemap`)
  const use = run(vue.getCurrentInstance, vue.nextTick, vue.onBeforeUnmount, vue.onMounted, vue.ref, vue.watch,
    fn => { ready = fn }, fn => { unload = fn }, fn => { show = fn }, fn => { hide = fn }, args => createMapBasemapController({ ...args, setTimer: clock.setTimeout, clearTimer: clock.clearTimeout }), isBinLocationPicker, captureSatelliteReference,
    { 'app-plus': { distribute: { sdkConfigs: { maps: { tencent: true } } } } }, uni,
    { env: { UNI_PLATFORM: platform } }, {}, { warn: (...args) => warnings.push(args) }, clock.setTimeout, clock.clearTimeout)
  const api = use({ isH5: false, options, suspended: () => suspendedState, appWebMap })
  return {
    api, clock, toasts, warnings, ready: () => ready?.(), mounted: () => mounted?.(),
    show: () => show?.(), hide: () => hide?.(), flushNextTick: () => { while (nextTicks.length) nextTicks.shift()() },
    suspend(hidden) { suspendedState = hidden; watchCallback?.(hidden) },
    dispose() { beforeUnmount?.(); unload?.() }
  }
}

check(hookTests, 'App Web cold start waits 40s before vector fallback', () => {
  const h = newHookHarness(); h.ready()
  assert.equal(h.api.satellite.value, true); assert.equal(h.api.basemapLoading.value, true)
  h.clock.tick(39999); assert.equal(h.api.satellite.value, true)
  h.clock.tick(1); assert.equal(h.api.satellite.value, false); assert.equal(h.api.basemapLoading.value, false)
  assert.equal(h.toasts.length, 1)
})
check(hookTests, 'app platform with canIUse false keeps App Web map through cold timeout and matching update', () => {
  const h = newHookHarness({ platform: 'app', canIUse: false }); h.ready()
  assert.equal(h.api.satellite.value, true, 'ready does not immediately fall back when the app Web map is active')
  assert.equal(h.api.basemapLoading.value, true)
  h.clock.tick(39999)
  assert.equal(h.api.satellite.value, true, 'cold App Web timeout remains 40 seconds')
  assert.equal(h.api.basemapLoading.value, true)
  assert.equal(h.toasts.length, 0)
  h.api.onNativeMapUpdated({ detail: { satellite: true } })
  assert.equal(h.api.satellite.value, true)
  assert.equal(h.api.basemapLoading.value, false, 'matching renderer update completes loading')
  h.clock.tick(2)
  assert.equal(h.api.satellite.value, true, 'matching update cancels the cold fallback timeout')
  assert.equal(h.toasts.length, 0)
})
check(hookTests, 'App Web timeout becomes 10s only after matching renderer ready', () => {
  const h = newHookHarness(); h.ready()
  h.clock.tick(39999); assert.equal(h.api.satellite.value, true)
  h.api.onNativeMapUpdated({ detail: { satellite: true } })
  assert.equal(h.api.basemapLoading.value, false)
  h.api.setBasemap(false); h.api.setBasemap(true)
  h.clock.tick(9999); assert.equal(h.api.satellite.value, true); assert.equal(h.api.basemapLoading.value, true)
  h.clock.tick(1); assert.equal(h.api.satellite.value, false); assert.equal(h.api.basemapLoading.value, false)
  assert.equal(h.toasts.length, 1)
})
check(hookTests, 'early matching App Web error is cached and fails immediately onReady', () => {
  const h = newHookHarness()
  h.api.onNativeMapError({ detail: { code: 'frame_load_failed', satellite: true } })
  assert.equal(h.api.satellite.value, true)
  h.ready()
  assert.equal(h.api.satellite.value, false)
  assert.equal(h.api.basemapLoading.value, false)
  assert.equal(h.toasts.length, 1)
  h.clock.tick(40001)
  assert.equal(h.toasts.length, 1)
})
check(hookTests, 'App Web dragbegin does not restart basemap timeout', () => {
  const h = newHookHarness(); h.ready(); h.clock.tick(30000)
  h.api.onNativeMapRegionChange({ detail: { type: 'begin' } })
  h.clock.tick(9999); assert.equal(h.api.satellite.value, true); assert.equal(h.api.basemapLoading.value, true)
  h.clock.tick(1)
  assert.equal(h.api.satellite.value, false); assert.equal(h.api.basemapLoading.value, false); assert.equal(h.toasts.length, 1)
})
check(hookTests, 'matching SDK updated(true) ends App timeout', () => {
  const h = newHookHarness(); h.ready(); h.api.onNativeMapUpdated({ detail: { satellite: true } })
  assert.equal(h.api.basemapLoading.value, false)
  h.clock.tick(10001); assert.equal(h.api.satellite.value, true); assert.equal(h.toasts.length, 0)
})
check(hookTests, 'stale vector updated cannot complete satellite load', () => {
  const h = newHookHarness(); h.ready(); h.api.onNativeMapUpdated({ detail: { satellite: false } })
  assert.equal(h.api.basemapLoading.value, true)
  h.api.onNativeMapUpdated({ detail: { satellite: true } }); assert.equal(h.api.basemapLoading.value, false)
})
check(hookTests, 'updated before onReady is cached for requested basemap', () => {
  const h = newHookHarness(); h.api.onNativeMapUpdated({ detail: { satellite: true } }); h.ready()
  assert.equal(h.api.basemapLoading.value, false)
  h.clock.tick(10001); assert.equal(h.api.satellite.value, true); assert.equal(h.toasts.length, 0)
})
check(hookTests, 'setBasemap type change clears stale completion cache', () => {
  const h = newHookHarness(); h.api.onNativeMapUpdated({ detail: { satellite: true } }); h.ready()
  h.api.setBasemap(false); h.api.setBasemap(true)
  assert.equal(h.api.basemapLoading.value, true)
  h.clock.tick(10000); assert.equal(h.api.satellite.value, false); assert.equal(h.toasts.length, 1)
})
check(hookTests, 'suspended App Web map retains background completion for resume', () => {
  const h = newHookHarness({ deferNextTick: true }); h.ready(); h.suspend(true)
  assert.equal(h.api.basemapLoading.value, false); assert.equal(h.clock.pending, 0)
  h.api.onNativeMapUpdated({ detail: { satellite: true } })
  assert.equal(h.api.basemapLoading.value, false, 'background completion is cached without completing while suspended')
  h.suspend(false)
  assert.equal(h.api.basemapLoading.value, false, 'resume waits for nextTick')
  h.flushNextTick()
  assert.equal(h.api.basemapLoading.value, false, 'matching cached completion ends the resumed request')
  assert.equal(h.clock.pending, 0)
  h.clock.tick(40001)
  assert.equal(h.api.satellite.value, true); assert.equal(h.toasts.length, 0, 'cached completion prevents fallback')
  h.dispose(); assert.equal(h.clock.pending, 0)
})
check(hookTests, 'App page hide pauses while retaining background completion; show resumes without fallback', () => {
  const h = newHookHarness({ deferNextTick: true }); h.ready()
  assert.equal(h.api.basemapLoading.value, true)
  h.hide()
  assert.equal(h.api.basemapLoading.value, false)
  assert.equal(h.clock.pending, 0)
  h.api.onNativeMapUpdated({ detail: { satellite: true } })
  h.api.onNativeMapError({ detail: { code: 'frame_load_failed', satellite: true } })
  assert.equal(h.toasts.length, 0)

  h.show()
  assert.equal(h.api.basemapLoading.value, false, 'show waits for nextTick before re-requesting')
  h.flushNextTick()
  assert.equal(h.api.basemapLoading.value, false, 'background matching update completes the resumed request')
  assert.equal(h.clock.pending, 0, 'cached renderer readiness does not arm a fallback timeout')
  h.clock.tick(40001)
  assert.equal(h.api.satellite.value, true, 'background completion prevents satellite fallback')
  assert.equal(h.toasts.length, 0)
  h.dispose(); assert.equal(h.clock.pending, 0)
})
check(hookTests, 'non-App mounted/native updated flow remains operational', () => {
  const h = newHookHarness({ platform: 'mp-weixin', options: { mode: 'browse' } }); h.mounted()
  assert.equal(h.api.satellite.value, false); assert.equal(h.api.basemapLoading.value, false)
  h.api.setBasemap(true); assert.equal(h.api.basemapLoading.value, true)
  h.api.onNativeMapUpdated(); assert.equal(h.api.basemapLoading.value, false)
  h.dispose(); assert.equal(h.clock.pending, 0)
})

check(sfcTests, 'AppTencentMap template/styles compile; options and renderjs scripts parse separately', () => {
  const filename = new URL('../src/components/AppTencentMap.vue', import.meta.url)
  const source = fs.readFileSync(filename, 'utf8')
  const renderMatch = source.match(/<script\s+module="mapView"\s+lang="renderjs">[\s\S]*?<\/script>/)
  const optionsMatch = source.match(/<script>\s*([\s\S]*?)\s*<\/script>/)
  assert.ok(renderMatch, 'renderjs module block found'); assert.ok(optionsMatch, 'options script found')
  const renderContent = renderMatch[0].replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')
  babel.parse(optionsMatch[1], { sourceType: 'module', plugins: ['dynamicImport', 'optionalChaining'] })
  babel.parse(renderContent, { sourceType: 'module', plugins: ['dynamicImport', 'optionalChaining'] })
  const { descriptor, errors } = parseSfc(source.replace(renderMatch[0], ''), { filename: filename.pathname })
  assert.equal(errors.length, 0, errors.map(e => e.message).join('; '))
  const template = compileTemplate({ source: descriptor.template.content, filename: filename.pathname, id: 'app-map-check' })
  assert.equal(template.errors.length, 0, template.errors.map(e => String(e)).join('; '))
  for (const style of descriptor.styles) {
    const result = compileStyle({ source: style.content, filename: filename.pathname, id: 'app-map-check', scoped: style.scoped })
    assert.equal(result.errors.length, 0, result.errors.map(e => String(e)).join('; '))
  }
})

// renderjs is compiled independently; the HTTP iframe owns the renderer module.
let compiledRenderjs = ''
try {
  const { transformWithEsbuild } = require('@dcloudio/uni-cli-shared')
  const filename = fileURLToPath(new URL('../src/components/AppTencentMap.vue', import.meta.url))
  const source = fs.readFileSync(filename, 'utf8')
  const code = source.match(/<script\s+module="mapView"\s+lang="renderjs">([\s\S]*?)<\/script>/)[1]
  const result = await transformWithEsbuild(code, filename, {
    format: 'iife', globalName: '__renderjsMapTest', target: 'es6', bundle: true, write: false
  })
  compiledRenderjs = result.outputFiles[0].text
  assert.match(compiledRenderjs, /frame\.contentWindow\.postMessage/)
  assert.doesNotMatch(compiledRenderjs, /createAppTencentMap/)
  sfcTests.push({ name: 'App renderjs independently compiles the HTTP iframe bridge', ok: true })
} catch (error) {
  sfcTests.push({ name: 'App renderjs independently compiles the HTTP iframe bridge', ok: false, error: error.message })
}

// Exercise the compiled renderjs parent from file:// against the real HTTP host and Tencent SDK.
if (compiledRenderjs && process.env.APP_MAP_SKIP_BROWSER !== '1') {
  let browser, tempDir
  try {
    const { chromium } = require('D:/nodejs/node_global/node_modules/openclaw/node_modules/playwright-core')
    const executablePath = 'C:/Users/29513/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'
    const manifest = JSON.parse(fs.readFileSync(new URL('../src/manifest.json', import.meta.url), 'utf8'))
    const key = manifest['app-plus']?.distribute?.sdkConfigs?.maps?.tencent?.key
    assert.ok(key, 'Tencent map key found in app manifest')
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-tencent-file-parent-'))
    const parentFile = path.join(tempDir, 'parent.html')
    fs.writeFileSync(parentFile, `<!doctype html><meta charset="utf-8"><style>html,body,#map-host{margin:0;width:100%;height:100%;overflow:hidden}</style><div id="map-host"></div><script>${compiledRenderjs}</script><script>window.events=[];window.testOwner={callMethod(name,event){if(name==='onMapEvent')window.events.push(event)}};window.mapContext={frame:null,token:null,frameOrigin:null,frameReady:false,stopped:false,owner:window.testOwner,sendEvent:window.__renderjsMapTest.default.methods.sendEvent,sendPacket:window.__renderjsMapTest.default.methods.sendPacket};window.startMap=packet=>window.__renderjsMapTest.default.methods.update.call(window.mapContext,packet,null,window.testOwner);</script>`)
    browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
    const page = await browser.newPage({ viewport: { width: 1100, height: 760 } })
    page.setDefaultTimeout(90000)
    await page.goto(pathToFileURL(parentFile).href)
    assert.equal(await page.evaluate(() => location.protocol), 'file:')
    const packet = { hostId: 'map-host', frameUrl: 'http://localhost:3001/src/static/app-map/index.html', key,
      assetBase: 'http://localhost:3001/', latitude: 25.033, longitude: 121.5654, scale: 12,
      satellite: false, markers: [], userLocation: {} }
    await page.evaluate(value => window.startMap(value), packet)
    await page.waitForFunction(() => window.events.some(event => event.type === 'phase' && event.detail?.phase === 'http_frame_ready'), null, { timeout: 30000 })
    await page.waitForFunction(() => window.events.some(event => event.type === 'updated' && event.detail?.satellite === false), null, { timeout: 60000 })
    await page.evaluate(() => window.__renderjsMapTest.default.methods.update.call(window.mapContext,
      { ...window.mapContext.latestPacket, satellite: true }, null, window.testOwner))
    await page.waitForFunction(() => window.events.some(event => event.type === 'updated' && event.detail?.satellite === true), null, { timeout: 90000 })
    const beforeForgedToken = await page.evaluate(() => window.events.filter(event => event.type === 'forged-token-check').length)
    const sdkFrame = page.frames().find(frame => frame.url().includes('/src/static/app-map/index.html'))
    assert.ok(sdkFrame, 'HTTP SDK frame exists')
    await sdkFrame.evaluate(() => parent.postMessage({ channel: 'app-tencent-map', token: 'forged-token',
      event: { type: 'forged-token-check', detail: {} } }, '*'))
    await page.waitForTimeout(150)
    assert.equal(await page.evaluate(() => window.events.filter(event => event.type === 'forged-token-check').length), beforeForgedToken, 'wrong token from the real frame is ignored')
    const readyPhasesBeforeForgedSource = await page.evaluate(() => window.events.filter(event => event.type === 'phase' && event.detail?.phase === 'http_frame_ready').length)
    await page.evaluate(() => {
      const duplicate = document.createElement('iframe')
      duplicate.id = 'forged-source-frame'
      duplicate.src = document.querySelector('iframe').src
      duplicate.onload = () => { window.forgedSourceLoaded = true }
      document.body.appendChild(duplicate)
    })
    await page.waitForFunction(() => window.forgedSourceLoaded === true, null, { timeout: 30000 })
    await page.waitForTimeout(150)
    assert.equal(await page.evaluate(() => window.events.filter(event => event.type === 'phase' && event.detail?.phase === 'http_frame_ready').length), readyPhasesBeforeForgedSource, 'correct token from a different frame is ignored')
    await page.evaluate(() => document.getElementById('forged-source-frame')?.remove())
    const screenshot = path.join(tempDir, 'satellite.png')
    await page.screenshot({ path: screenshot })
    assert.ok(fs.statSync(screenshot).size > 10000, 'satellite frame screenshot captured')
    await page.evaluate(() => window.__renderjsMapTest.default.methods.update.call(window.mapContext,
      { ...window.mapContext.latestPacket, satellite: false }, null, window.testOwner))
    await page.waitForFunction(() => window.events.filter(event => event.type === 'updated' && event.detail?.satellite === false).length >= 2, null, { timeout: 60000 })
    await page.evaluate(() => window.__renderjsMapTest.default.methods.update.call(window.mapContext,
      { ...window.mapContext.latestPacket, satellite: true }, null, window.testOwner))
    await page.waitForFunction(() => window.events.filter(event => event.type === 'updated' && event.detail?.satellite === true).length >= 2, null, { timeout: 90000 })
    await page.evaluate(() => window.__renderjsMapTest.default.methods.update.call(window.mapContext,
      { ...window.mapContext.latestPacket, latitude: 24.5, longitude: 120.3, command: { id: 42 } }, null, window.testOwner))
    await page.waitForFunction(() => window.events.some(event => event.type === 'center' && event.detail?.requestId === 42), null, { timeout: 15000 })
    const verified = await page.evaluate(() => ({
      protocol: location.protocol,
      origin: new URL(document.querySelector('iframe').src).origin,
      readySatelliteEvents: window.events.filter(event => event.type === 'updated' && event.detail?.satellite === true).length,
      center: window.events.find(event => event.type === 'center' && event.detail?.requestId === 42)?.detail
    }))
    assert.equal(verified.protocol, 'file:')
    assert.equal(verified.origin, 'http://localhost:3001')
    assert.ok(verified.readySatelliteEvents >= 2, 'tilesloaded satellite events crossed the bridge')
    assert.equal(verified.center.latitude, 24.5)
    assert.equal(verified.center.longitude, 120.3)
    const hostSource = fs.readFileSync(new URL('../src/static/app-map/host.mjs', import.meta.url), 'utf8')
    assert.match(hostSource, /send\('error',\s*\{\s*code,\s*stage,\s*satellite:\s*!!latestPacket\?\.satellite\s*\}\)/)
    console.log(`Temporary satellite screenshot: ${screenshot}`)
    sfcTests.push({ name: 'file parent filters forged source/token and bridges real tilesloaded and center query', ok: true })
  } catch (error) {
    sfcTests.push({ name: 'file parent filters forged source/token and bridges real tilesloaded and center query', ok: false, error: error.message })
  } finally {
    await browser?.close()
  }
}

async function verifyHostLifecycle() {
  const filename = new URL('../src/static/app-map/host.mjs', import.meta.url)
  const source = fs.readFileSync(filename, 'utf8').replace(/^import .*?\r?\n/, '')
  const windowListeners = new Map(), documentListeners = new Map(), scripts = [], posted = []
  const container = { style: {} }, errorElement = { style: {} }
  const parent = { postMessage(message) { posted.push(message) } }
  const addListener = (listeners, type, callback) => {
    const callbacks = listeners.get(type) || new Set(); callbacks.add(callback); listeners.set(type, callbacks)
  }
  const removeListener = (listeners, type, callback) => listeners.get(type)?.delete(callback)
  const dispatch = (listeners, type, event = {}) => {
    for (const callback of [...(listeners.get(type) || [])]) callback(event)
  }
  const window = {
    TMap: null,
    addEventListener: (type, callback) => addListener(windowListeners, type, callback),
    removeEventListener: (type, callback) => removeListener(windowListeners, type, callback)
  }
  const document = {
    hidden: false,
    addEventListener: (type, callback) => addListener(documentListeners, type, callback),
    removeEventListener: (type, callback) => removeListener(documentListeners, type, callback),
    getElementById(id) { return id === 'map' ? container : errorElement },
    createElement() {
      return { onload: null, onerror: null, remove() { this.removed = true } }
    },
    head: { appendChild(script) { scripts.push(script) } }
  }
  let timerId = 0
  const timers = new Map()
  let created = 0, destroyed = 0, updates = 0
  const context = {
    window, document, parent, location: { hash: '#test-token', protocol: 'https:' },
    createAppTencentMap() {
      created++
      return { update() { updates++ }, destroy() { destroyed++ } }
    },
    setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id },
    clearTimeout(id) { timers.delete(id) },
    console: { info() {}, warn() {}, error() {} }
  }
  vm.runInNewContext(source, context, { filename: filename.pathname })
  const sendPacket = () => dispatch(windowListeners, 'message', {
    source: parent, origin: 'https://parent.example',
    data: { channel: 'app-tencent-map', token: 'test-token', packet: { key: 'test-key', assetBase: '/assets/', satellite: false } }
  })
  const frameReadyCount = () => posted.filter(message => message.event?.type === 'frame-ready').length

  sendPacket()
  assert.equal(scripts.length, 1, 'first parent packet starts SDK loading')
  dispatch(windowListeners, 'pagehide')
  assert.equal(windowListeners.get('message')?.size || 0, 0, 'pagehide removes the parent message listener')
  assert.equal(scripts[0].removed, true, 'pagehide cancels the pending SDK script')
  dispatch(windowListeners, 'pageshow')
  assert.equal(windowListeners.get('message')?.size, 1, 'pageshow reattaches one parent message listener')
  assert.equal(frameReadyCount(), 2, 'pageshow announces frame readiness')
  dispatch(windowListeners, 'pageshow')
  assert.equal(windowListeners.get('message')?.size, 1, 'repeated pageshow does not duplicate listeners')
  assert.equal(frameReadyCount(), 2, 'repeated pageshow does not duplicate readiness events')
  sendPacket()
  assert.equal(scripts.length, 2, 'parent packet after pageshow starts a fresh SDK request')
  window.TMap = { Map: function Map() {} }
  scripts[1].onload()
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  assert.equal(created, 1, 'fresh SDK completion creates a renderer')
  assert.equal(updates, 1, 'fresh renderer receives the parent packet')
  assert.equal(posted.some(message => message.event?.type === 'error'), false, 'old SDK rejection after pagehide emits no error')

  const requestsBeforeVisibility = scripts.length
  const readyBeforeVisibility = frameReadyCount()
  for (let index = 0; index < 3; index++) {
    document.hidden = true
    dispatch(documentListeners, 'visibilitychange')
    document.hidden = false
    dispatch(documentListeners, 'visibilitychange')
  }
  assert.equal(destroyed, 0, 'visibility changes keep the active renderer alive')
  assert.equal(created, 1, 'visibility changes do not create another renderer')
  assert.equal(updates, 1, 'visibility changes do not reapply packets')
  assert.equal(scripts.length, requestsBeforeVisibility, 'visibility changes do not request the SDK again')
  assert.equal(frameReadyCount(), readyBeforeVisibility, 'visibility changes do not send frame-ready')
  assert.equal(windowListeners.get('message')?.size, 1, 'visibility changes keep one message listener')

  document.hidden = true
  dispatch(windowListeners, 'pagehide')
  assert.equal(destroyed, 1, 'pagehide still disposes the renderer')
  assert.equal(windowListeners.get('message')?.size || 0, 0, 'pagehide removes the message listener')
  const readyBeforeHiddenPageShow = frameReadyCount()
  dispatch(windowListeners, 'pageshow')
  assert.equal(windowListeners.get('message')?.size || 0, 0, 'pageshow while hidden waits to resume')
  assert.equal(frameReadyCount(), readyBeforeHiddenPageShow, 'hidden pageshow sends no readiness event')
  document.hidden = false
  dispatch(documentListeners, 'visibilitychange')
  assert.equal(windowListeners.get('message')?.size, 1, 'visible notification resumes after hidden pageshow')
  assert.equal(frameReadyCount(), readyBeforeHiddenPageShow + 1, 'visible notification announces readiness once')
  sendPacket()
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  assert.equal(created, 2, 'visible restore recreates the renderer')
  assert.equal(destroyed, 1)
  assert.equal(updates, 2, 'recreated renderer receives the packet')
  dispatch(documentListeners, 'visibilitychange')
  assert.equal(windowListeners.get('message')?.size, 1, 'duplicate visible notification keeps one listener')
  assert.equal(scripts.length, requestsBeforeVisibility, 'renderer restore reuses the loaded SDK')
  assert.equal(posted.some(message => message.event?.type === 'error'), false)
}

try {
  await verifyHostLifecycle()
  sfcTests.push({ name: 'host preserves renderer during visibility changes and restores after pagehide; stale SDK rejection is ignored', ok: true })
} catch (error) {
  sfcTests.push({ name: 'host preserves renderer during visibility changes and restores after pagehide; stale SDK rejection is ignored', ok: false, error: error.stack || error.message })
}

for (const [group, results] of [['renderer', rendererTests], ['hook', hookTests], ['SFC', sfcTests]]) {
  for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'} [${group}] ${result.name}${result.ok ? '' : `\n  ${result.error}`}`)
}
const failed = [...rendererTests, ...hookTests, ...sfcTests].filter(result => !result.ok)
console.log(`\n${[...rendererTests, ...hookTests, ...sfcTests].length - failed.length} passed; ${failed.length} failed`)
if (failed.length) process.exitCode = 1




