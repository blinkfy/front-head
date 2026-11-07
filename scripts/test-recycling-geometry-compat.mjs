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
