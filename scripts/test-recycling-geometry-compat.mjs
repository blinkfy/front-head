import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { compileScript, compileStyle, compileTemplate, parse } from '@vue/compiler-sfc'
import { computed, nextTick, ref } from 'vue'
import { wgs84ToGcj02 as convertWgs84ToGcj02 } from '../src/utils/live-location-coordinates.mjs'
import { wgs84ToGcj02 } from '../src/pages-nonTheme/utils/recycling-geometry.mjs'

const geometryPath = new URL('../src/pages-nonTheme/utils/recycling-geometry.mjs', import.meta.url)
const componentPath = new URL('../src/pages-nonTheme/components/RecyclingServiceMap.vue', import.meta.url)
const geometrySource = await readFile(geometryPath, 'utf8')
const componentSource = await readFile(componentPath, 'utf8')

function createLegacyGeometryModule() {
  const source = geometrySource
    .replace('points[points.length - 1]', 'points.at(-1)')
    .replace("import { wgs84ToGcj02 as convertWgs84ToGcj02 } from '../../utils/live-location-coordinates.mjs'", '')
    .replaceAll('export function ', 'function ')
    .replaceAll('export const ', 'const ')
  const context = vm.createContext({ convertWgs84ToGcj02 })
  vm.runInContext('Array.prototype.at = undefined', context)
  vm.runInContext(`${source}\nglobalThis.api = { geometryError, normalizeGeometry, geometryBounds, containsPoint }`, context)
  return { context, api: context.api }
}

function createCurrentGeometryModule() {
  const source = geometrySource
    .replace("import { wgs84ToGcj02 as convertWgs84ToGcj02 } from '../../utils/live-location-coordinates.mjs'", '')
    .replaceAll('export function ', 'function ')
    .replaceAll('export const ', 'const ')
  const context = vm.createContext({ convertWgs84ToGcj02 })
  vm.runInContext('Array.prototype.at = undefined', context)
  vm.runInContext(`${source}\nglobalThis.api = { geometryError, normalizeGeometry, geometryBounds, containsPoint }`, context)
  return { context, api: context.api }
}

const legacy = createLegacyGeometryModule()
const twoPointValue = vm.runInContext(`({ type: 'polygon', coordinateSystem: 'wgs84', points: [
  { latitude: 25.033, longitude: 121.5654 },
  { latitude: 25.034, longitude: 121.5654 }
] })`, legacy.context)
assert.throws(() => legacy.api.geometryError(twoPointValue), /at is not a function/)
console.log('ok legacy geometry reproduces points.at failure with two points')

const current = createCurrentGeometryModule()
const fixtures = vm.runInContext(`({
  two: { type: 'polygon', coordinateSystem: 'wgs84', points: [
    { latitude: 25.033, longitude: 121.5654 },
    { latitude: 25.034, longitude: 121.5654 }
  ] },
  triangle: { type: 'polygon', coordinateSystem: 'wgs84', points: [
    { latitude: 25.033, longitude: 121.5654 },
    { latitude: 25.034, longitude: 121.5654 },
    { latitude: 25.034, longitude: 121.5664 }
  ] },
  closed: { type: 'polygon', coordinateSystem: 'wgs84', points: [
    { latitude: 25.033, longitude: 121.5654 },
    { latitude: 25.034, longitude: 121.5654 },
    { latitude: 25.034, longitude: 121.5664 },
    { latitude: 25.033, longitude: 121.5654 }
  ] },
  duplicate: { type: 'polygon', coordinateSystem: 'wgs84', points: [
    { latitude: 25.033, longitude: 121.5654 },
    { latitude: 25.034, longitude: 121.5654 },
    { latitude: 25.034, longitude: 121.5664 },
    { latitude: 25.034, longitude: 121.5654 }
  ] },
  crossing: { type: 'polygon', coordinateSystem: 'wgs84', points: [
    { latitude: 25.033, longitude: 121.5654 },
    { latitude: 25.034, longitude: 121.5664 },
    { latitude: 25.033, longitude: 121.5664 },
    { latitude: 25.034, longitude: 121.5654 }
  ] },
  circle: { type: 'circle', coordinateSystem: 'wgs84', center: { latitude: 25.033, longitude: 121.5654 }, radiusMeters: 1000 }
})`, current.context)

assert.match(current.api.geometryError(fixtures.two), /3 至 30/)
assert.equal(current.api.geometryError(fixtures.triangle), '')
assert.equal(current.api.normalizeGeometry(fixtures.triangle).points.length, 3)
assert.ok(current.api.geometryBounds(fixtures.triangle))
assert.equal(current.api.containsPoint(fixtures.triangle, { latitude: 25.0335, longitude: 121.5656 }), true)
assert.equal(current.api.geometryError(fixtures.closed), '')
assert.equal(current.api.normalizeGeometry(fixtures.closed).points.length, 3, 'a repeated closing vertex is removed')
assert.match(current.api.geometryError(fixtures.duplicate), /顶点不能重复/)
assert.match(current.api.geometryError(fixtures.crossing), /不能相交|面积不能为零/)
assert.equal(current.api.geometryError(fixtures.circle), '')
assert.equal(current.api.normalizeGeometry(fixtures.circle).type, 'circle')
assert.equal(current.api.containsPoint(fixtures.circle, fixtures.circle.center), true)
console.log('ok current geometry handles polygon progression, closure, invalid polygons, and circles without Array.at')

function preprocess(source, platform) {
  const output = [], active = [true]
  for (const line of source.split(/\r?\n/)) {
    const directive = line.match(/^\s*(?:\/\/|<!--|\/\*)\s*#(ifdef|ifndef)\s+([\w-]+)\s*(?:-->|\*\/)?\s*$/)
    if (directive) {
      const matches = directive[2] === platform
      active.push(active.at(-1) && (directive[1] === 'ifdef' ? matches : !matches))
      continue
    }
    if (/^\s*(?:\/\/|<!--|\/\*)\s*#endif\s*(?:-->|\*\/)?\s*$/.test(line)) {
      active.pop()
      continue
    }
    if (active.at(-1)) output.push(line)
  }
  assert.equal(active.length, 1)
  return output.join('\n')
}

const componentFiles = [componentPath, new URL('../src/pages-nonTheme/collector-apply.vue', import.meta.url)]
for (const platform of ['H5', 'APP-PLUS', 'MP-WEIXIN']) {
  for (const url of componentFiles) {
    const filename = url.pathname.replace(/^\//, '')
    const original = await readFile(url, 'utf8')
    const source = original
      .replace(/<template>([\s\S]*?)<\/template>/, (_, body) => `<template>${preprocess(body, platform)}</template>`)
      .replace(/<script( setup)?>([\s\S]*?)<\/script>/, (_, setup = '', body) => `<script${setup}>${preprocess(body, platform)}</script>`)
      .replace(/<style([^>]*)>([\s\S]*?)<\/style>/g, (_, attrs, body) => `<style${attrs}>${preprocess(body, platform)}</style>`)
    const { descriptor, errors } = parse(source, { filename })
    assert.deepEqual(errors, [])
    if (descriptor.script || descriptor.scriptSetup) compileScript(descriptor, { id: `geometry-${platform}` })
    if (descriptor.template) {
      const result = platform === 'MP-WEIXIN'
        ? (await import('@dcloudio/uni-mp-compiler')).default.compile(descriptor.template.content, { filename, mode: 'module', miniProgram: { class: { array: true }, slot: { fallbackContent: true } } })
        : compileTemplate({ source: descriptor.template.content, filename, id: `geometry-${platform}` })
      assert.deepEqual(result.errors || [], [])
    }
    for (const style of descriptor.styles) {
      const result = compileStyle({ source: style.content, filename, id: `geometry-${platform}`, scoped: style.scoped })
      assert.deepEqual(result.errors, [])
    }
  }
  console.log(`ok SFC ${platform}`)
}

const nativeLinesSource = componentSource.slice(componentSource.indexOf('const nativeLines = computed'), componentSource.indexOf('const nativeMarkers'))
const nativeLinesCode = preprocess(nativeLinesSource, 'APP-PLUS')
const state = {
  props: { readonly: false }, mode: ref('polygon'), completed: ref(false),
  vertices: ref(fixtures.triangle.points.slice(0, 2))
}
const getAppLines = new Function('computed', 'props', 'mode', 'vertices', 'completed', 'wgs84ToGcj02', nativeLinesCode + '; return nativeLines')(
  computed, state.props, state.mode, state.vertices, state.completed, wgs84ToGcj02
)
const appLines = getAppLines.value
assert.equal(appLines.length, 1, 'two-point polygon draft keeps its live line')
assert.equal(appLines[0].points.length, 2)
assert.deepEqual(appLines[0].points.map(point => [point.latitude, point.longitude]), fixtures.triangle.points.slice(0, 2).map(point => {
  const converted = wgs84ToGcj02(point)
  return [converted.latitude, converted.longitude]
}))
state.completed.value = true
assert.equal(getAppLines.value.length, 0, 'completed polygon leaves the draft line layer')
console.log('ok App two-point draft line uses converted coordinates and clears on completion')

function extractFunction(source, start, end) {
  const from = source.indexOf(start)
  const to = source.indexOf(end, from)
  assert.notEqual(from, -1, `source contains ${start}`)
  assert.notEqual(to, -1, `source contains ${end}`)
  return source.slice(from, to).trim()
}

const appComponentSource = preprocess(componentSource, 'APP-PLUS')
const initializeSource = extractFunction(appComponentSource, 'async function initialize() {', '\nasync function search()')
const verifyReadySource = extractFunction(appComponentSource, 'async function verifyNativeReady(token) {', '\nasync function pickNativeCenter()')
for (const [binding, layer] of [['polygons', 'nativePolygons'], ['circles', 'nativeCircles'], ['polyline', 'nativeLines'], ['markers', 'nativeMarkers']]) {
  assert.match(componentSource, new RegExp(`:${binding}="nativeOverlaysReady \\? ${layer} : \\[\\]"`), `${binding} stay empty until the native map is ready`)
}

const lifecycle = {
  nativeMounted: { value: false }, nativeOverlaysReady: { value: false }, nativeCenterBusy: { value: false },
  loading: { value: true }, mapError: { value: '' }, locationHint: { value: '' },
  disposed: false, generation: 0, timeout: null, trace: [],
  clearTimeout() {},
  nextTick: async () => lifecycle.trace.push({ event: 'nextTick', mounted: lifecycle.nativeMounted.value, overlaysReady: lifecycle.nativeOverlaysReady.value }),
  fitMap: () => lifecycle.trace.push({ event: 'fitMap' }),
  verifyNativeReady: token => lifecycle.trace.push({ event: 'verifyNativeReady', token }),
  locateInitialViewport: token => lifecycle.trace.push({ event: 'locateInitialViewport', token })
}
let nativeMountedValue = false
Object.defineProperty(lifecycle.nativeMounted, 'value', {
  get: () => nativeMountedValue,
  set: value => { nativeMountedValue = value; lifecycle.trace.push({ event: 'mounted', value }) }
})
lifecycle.nativeMounted.value = false
lifecycle.trace.length = 0
vm.runInNewContext(`${initializeSource}\nglobalThis.runInitialize = initialize`, lifecycle)
await lifecycle.runInitialize()
assert.equal(lifecycle.nativeMounted.value, true, 'first initialization mounts the initially absent map')
assert.deepEqual(lifecycle.trace.filter(entry => entry.event === 'mounted').map(entry => entry.value), [true], 'first initialization does not redundantly unmount the map')
assert.equal(lifecycle.trace.filter(entry => entry.event === 'nextTick').length, 1, 'initial mount waits once after mounting')
assert.equal(lifecycle.trace.some(entry => entry.event === 'verifyNativeReady'), true, JSON.stringify(lifecycle.trace))
assert.equal(lifecycle.nativeOverlaysReady.value, false, 'initial mount keeps layers gated until readiness')

lifecycle.trace.length = 0
lifecycle.nativeOverlaysReady.value = true
await lifecycle.runInitialize()
const oldMapTick = lifecycle.trace.findIndex(entry => entry.event === 'nextTick' && entry.mounted && !entry.overlaysReady)
const unmountIndex = lifecycle.trace.findIndex(entry => entry.event === 'nextTick' && !entry.mounted)
assert.ok(oldMapTick >= 0 && unmountIndex > oldMapTick, 'retry flushes empty overlays before unmounting the old map')
assert.equal(lifecycle.nativeMounted.value, true, 'retry mounts a fresh map after teardown')
assert.deepEqual(lifecycle.trace.filter(entry => entry.event === 'mounted').map(entry => entry.value), [false, true], 'retry unmounts and remounts exactly once')
assert.equal(lifecycle.nativeOverlaysReady.value, false, 'retry keeps overlays gated on the fresh map')
console.log('ok App native map first mount, overlay gating, and retry teardown order')

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
const pendingCenter = deferred()
const readiness = {
  disposed: false, generation: 4,
  nativeMounted: { value: false }, nativeOverlaysReady: { value: false }, loading: { value: true },
  getNativeCenter: () => pendingCenter.promise,
  nativeReadyCalls: 0,
  nativeReady: () => { readiness.nativeReadyCalls++; readiness.nativeOverlaysReady.value = true },
  nativeError: () => { throw new Error('unexpected native error') }
}
vm.runInNewContext(`${verifyReadySource}\nglobalThis.runVerifyNativeReady = verifyNativeReady`, readiness)
await readiness.runVerifyNativeReady(3)
assert.equal(readiness.nativeReadyCalls, 0, 'an already stale probe exits before reading map state')
readiness.generation = 5
const unmountProbe = readiness.runVerifyNativeReady(5)
readiness.disposed = true
pendingCenter.resolve({ latitude: 25, longitude: 121 })
await unmountProbe
assert.equal(readiness.nativeReadyCalls, 0, 'a probe resolving after unmount does not expose overlays')
assert.equal(readiness.nativeMounted.value, false, 'a probe never remounts the native map')

readiness.disposed = false
readiness.generation = 6
const lateProbe = deferred()
readiness.getNativeCenter = () => lateProbe.promise
const lateProbeTask = readiness.runVerifyNativeReady(6)
readiness.loading.value = false
lateProbe.resolve({ latitude: 25, longitude: 121 })
await lateProbeTask
assert.equal(readiness.nativeReadyCalls, 0, 'a late center result after nativeError does not clear the error or expose overlays')
assert.equal(readiness.nativeOverlaysReady.value, false)
console.log('ok App native readiness ignores stale, unmounted, and post-error probes')

readiness.loading.value = true
readiness.nativeMounted.value = true
readiness.getNativeCenter = async () => ({ latitude: 25, longitude: 121 })
await readiness.runVerifyNativeReady(6)
assert.equal(readiness.nativeReadyCalls, 1, 'a current successful center probe makes the map ready')
assert.equal(readiness.nativeOverlaysReady.value, true, 'ready maps can display service overlays')
console.log('ok App native readiness exposes overlays after successful initialization')
