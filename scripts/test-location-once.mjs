import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'
import { wgs84ToGcj02 } from '../src/utils/live-location-coordinates.mjs'
import { locationErrorMessage } from '../src/utils/location-error.mjs'

const locationSource = await readFile(new URL('../src/utils/location.js', import.meta.url), 'utf8')
const addressSource = await readFile(new URL('../src/utils/location-address.js', import.meta.url), 'utf8')
const pickerSource = await readFile(new URL('../src/pages-nonTheme/components/shop/ShopAddressPicker.vue', import.meta.url), 'utf8')
const mapCacheSource = await readFile(new URL('../src/utils/map-last-location.mjs', import.meta.url), 'utf8')
const mapPageSources = await Promise.all([
  readFile(new URL('../src/pages/map/map.vue', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages-dark/map/map.vue', import.meta.url), 'utf8')
])

function preprocessPlatform(source, platform) {
  const lines = source.split(/\r?\n/)
  const active = [true]
  const output = []
  for (const line of lines) {
    const directive = line.match(/^\s*(?:\/\/|<!--)\s*#(ifdef|ifndef)\s+([\w-]+)\s*(?:-->)?\s*$/)
    if (directive) {
      const matches = directive[2] === platform
      active.push(active.at(-1) && (directive[1] === 'ifdef' ? matches : !matches))
      continue
    }
    if (/^\s*(?:\/\/|<!--)\s*#endif\s*(?:-->)?\s*$/.test(line)) {
      assert.ok(active.length > 1, 'platform directive has matching #ifdef/#ifndef')
      active.pop()
      continue
    }
    if (active.at(-1)) output.push(line)
  }
  assert.equal(active.length, 1, 'platform directives are balanced')
  return output.join('\n')
}

function loadLocation(platform, { systemPlatform = platform, getLocation, navigatorValue, timers = new Map(), permissionResult = true } = {}) {
  const permissionCalls = []
  const code = locationSource
    .replace("import { wgs84ToGcj02 } from './live-location-coordinates.mjs'", 'const { wgs84ToGcj02 } = globalThis.coordinates')
    .replace("import { ensureFeaturePermission } from './feature-permission.js'", 'const { ensureFeaturePermission } = globalThis.permissions')
    .replace('export async function getUserLocationOnce', 'async function getUserLocationOnce')
  const context = {
    coordinates: { wgs84ToGcj02 },
    permissions: { ensureFeaturePermission: async (kind, options) => { permissionCalls.push({ kind, options }); return permissionResult } },
    process: { env: { UNI_PLATFORM: platform } },
    uni: {
      getSystemInfoSync: () => ({ uniPlatform: systemPlatform }),
      getLocation: options => getLocation(options)
    },
    navigator: navigatorValue,
    console: { log() {}, warn() {} },
    setTimeout(callback, delay) {
      const id = timers.size + 1
      timers.set(id, { callback, delay })
      return id
    },
    clearTimeout(id) { timers.delete(id) }
  }
  vm.runInNewContext(`${code}\nglobalThis.getUserLocationOnce = getUserLocationOnce`, context, { filename: 'location.js' })
  return { getUserLocationOnce: context.getUserLocationOnce, timers, permissionCalls }
}

async function test(name, run) {
  await run()
  console.log(`ok - ${name}`)
}

await test('App asks the native API for WGS84 and converts gcj02 exactly once', async () => {
  let options
  const { getUserLocationOnce } = loadLocation('app', { getLocation(value) { options = value; value.success({ latitude: 25.033, longitude: 121.5654 }) } })
  const actual = await getUserLocationOnce('gcj02')
  const once = wgs84ToGcj02(25.033, 121.5654)
  const twice = wgs84ToGcj02(once.latitude, once.longitude)
  assert.equal(options.type, 'wgs84')
  assert.equal(actual.latitude, once.latitude)
  assert.equal(actual.longitude, once.longitude)
  assert.notEqual(actual.latitude, twice.latitude)
  assert.notEqual(actual.longitude, twice.longitude)
})

await test('App native high accuracy is opt-in', async () => {
  let defaultOptions
  loadLocation('app', { getLocation(options) { defaultOptions = options; options.success({ latitude: 25, longitude: 121 }) } })
    .getUserLocationOnce('wgs84')
  assert.equal(Object.hasOwn(defaultOptions, 'isHighAccuracy'), false)

  let accurateOptions
  await loadLocation('app', { getLocation(options) { accurateOptions = options; options.success({ latitude: 25, longitude: 121 }) } })
    .getUserLocationOnce('gcj02', { highAccuracy: true })
  assert.equal(accurateOptions.isHighAccuracy, true)
})

await test('App light and dark map helpers request accurate WGS84 and cache converted GCJ02 once', async () => {
  const cacheCode = mapCacheSource
    .replaceAll('export function ', 'function ')
    + '\nglobalThis.mapCache = { getLastMapLocation, saveLastMapLocation }'

  for (const [index, original] of mapPageSources.entries()) {
    const match = original.match(/async function getUserLocationOnce\([\s\S]*?\n}\s*/)
    assert.ok(match, `APP getUserLocationOnce helper exists in map page ${index + 1}`)
    const appHelper = preprocessPlatform(match[0], 'APP-PLUS')

    const storage = new Map()
    let nativeOptions
    let sharedCall
    const native = { latitude: 25.033, longitude: 121.5654 }
    const expected = wgs84ToGcj02(native.latitude, native.longitude)
    const sharedLocation = loadLocation('app', {
      getLocation(options) {
        nativeOptions = options
        options.success({ ...native, accuracy: 8 })
      }
    })
    const context = {
      uni: {
        getStorageSync(key) { return storage.get(key) },
        setStorageSync(key, value) { storage.set(key, value) }
      },
      getSharedUserLocationOnce: (type, options) => {
        sharedCall = { type, options }
        return sharedLocation.getUserLocationOnce(type, options)
      },
      console: { info() {} }
    }
    vm.runInNewContext(`${cacheCode}\n${appHelper}\nglobalThis.getUserLocationOnce = getUserLocationOnce`, context)

    const result = await context.getUserLocationOnce('gcj02')
    assert.equal(sharedCall.type, 'gcj02')
    assert.deepEqual({ type: nativeOptions.type, isHighAccuracy: nativeOptions.isHighAccuracy }, { type: 'wgs84', isHighAccuracy: true })
    assert.deepEqual(JSON.parse(JSON.stringify(sharedCall.options)), { highAccuracy: true, includeAccuracy: true })
    assert.equal(result.latitude, expected.latitude)
    assert.equal(result.longitude, expected.longitude)
    assert.equal(result.accuracy, 8)
    assert.deepEqual(JSON.parse(JSON.stringify(context.mapCache.getLastMapLocation())), expected)
    assert.notEqual(result.latitude, wgs84ToGcj02(expected.latitude, expected.longitude).latitude)
    assert.notEqual(result.longitude, wgs84ToGcj02(expected.latitude, expected.longitude).longitude)
  }
})

await test('App WGS84 request returns native coordinates without conversion', async () => {
  let options
  const { getUserLocationOnce } = loadLocation('app', { getLocation(value) { options = value; value.success({ latitude: 25.033, longitude: 121.5654 }) } })
  const actual = await getUserLocationOnce('wgs84')
  assert.equal(options.type, 'wgs84')
  assert.equal(actual.latitude, 25.033)
  assert.equal(actual.longitude, 121.5654)
})

await test('mini program gcj02 request and coordinates are preserved', async () => {
  let options
  const { getUserLocationOnce } = loadLocation('mp-weixin', { getLocation(value) { options = value; value.success({ latitude: 25.033, longitude: 121.5654 }) } })
  const actual = await getUserLocationOnce('gcj02')
  assert.equal(options.type, 'gcj02')
  assert.equal(actual.latitude, 25.033)
  assert.equal(actual.longitude, 121.5654)
})

await test('accuracy is opt-in for native coordinates and preserved when requested', async () => {
  const defaults = loadLocation('app', { getLocation(options) { options.success({ latitude: 25, longitude: 121, accuracy: 63 }) } })
  const plain = await defaults.getUserLocationOnce('wgs84')
  assert.equal(Object.hasOwn(plain, 'accuracy'), false, 'existing callers keep the original result shape')

  const optedIn = loadLocation('app', { getLocation(options) { options.success({ latitude: 25, longitude: 121, accuracy: 63 }) } })
  const detailed = await optedIn.getUserLocationOnce('wgs84', { includeAccuracy: true })
  assert.equal(detailed.accuracy, 63)

  const horizontalFallback = loadLocation('app', { getLocation(options) { options.success({ latitude: 25, longitude: 121, horizontalAccuracy: 42 }) } })
  assert.equal((await horizontalFallback.getUserLocationOnce('wgs84', { includeAccuracy: true })).accuracy, 42)
})

await test('H5 native geolocation success bypasses uni.getLocation', async () => {
  let nativeOptions, uniCalls = 0
  const state = loadLocation('h5', {
    getLocation() { uniCalls++ },
    navigatorValue: { geolocation: { getCurrentPosition(success, fail, options) {
      nativeOptions = options
      success({ coords: { latitude: 25.033, longitude: 121.5654, accuracy: 28 } })
    } } }
  })
  const actual = await state.getUserLocationOnce('gcj02', { includeAccuracy: true })
  assert.equal(actual.latitude, 25.033)
  assert.equal(actual.longitude, 121.5654)
  assert.equal(nativeOptions.enableHighAccuracy, true)
  assert.equal(actual.accuracy, 28)
  assert.equal(uniCalls, 0)
})

await test('H5 native geolocation failure falls back to uni.getLocation', async () => {
  let uniCalls = 0
  const source = locationSource
    .replace("import { wgs84ToGcj02 } from './live-location-coordinates.mjs'", 'const { wgs84ToGcj02 } = globalThis.coordinates')
    .replace("import { ensureFeaturePermission } from './feature-permission.js'", 'const { ensureFeaturePermission } = globalThis.permissions')
    .replace('export async function getUserLocationOnce', 'async function getUserLocationOnce')
  const context = {
    coordinates: { wgs84ToGcj02 }, permissions: { ensureFeaturePermission: async () => true }, process: { env: { UNI_PLATFORM: 'h5' } },
    uni: { getSystemInfoSync: () => ({ uniPlatform: 'h5' }), getLocation(options) { uniCalls++; options.success({ latitude: 24, longitude: 120 }) } },
    navigator: { geolocation: { getCurrentPosition(success, fail) { fail(new Error('browser unavailable')) } } },
    console: { log() {}, warn() {} }, setTimeout() { return 1 }, clearTimeout() {}
  }
  vm.runInNewContext(`${source}\nglobalThis.getUserLocationOnce = getUserLocationOnce`, context)
  const actual = await context.getUserLocationOnce('wgs84')
  assert.equal(uniCalls, 1)
  assert.equal(actual.latitude, 24)
  assert.equal(actual.longitude, 120)
})

await test('uni.getLocation synchronous exception and permission failure propagate', async () => {
  const thrown = new Error('native bridge unavailable')
  const sync = loadLocation('app', { getLocation() { throw thrown } })
  await assert.rejects(sync.getUserLocationOnce(), error => error === thrown)

  const denied = { errCode: 1, errMsg: 'permission denied' }
  const permission = loadLocation('app', { getLocation(options) { options.fail(denied) } })
  await assert.rejects(permission.getUserLocationOnce(), error => error === denied)
})

await test('interactive location retry rechecks permission before calling the location API', async () => {
  let locationCalls = 0
  const denied = loadLocation('mp-weixin', { permissionResult: false, getLocation(options) { locationCalls++; options.success({ latitude: 25, longitude: 121 }) } })
  await assert.rejects(denied.getUserLocationOnce('gcj02', { interactive: true }), error => error.code === 'permission_denied')
  assert.equal(locationCalls, 0, 'denied location never reaches the platform API')
  assert.deepEqual(denied.permissionCalls.map(value => value.kind), ['location'])
  const retry = loadLocation('mp-weixin', { permissionResult: true, getLocation(options) { locationCalls++; options.success({ latitude: 25, longitude: 121 }) } })
  const actual = await retry.getUserLocationOnce('gcj02', { interactive: true })
  assert.equal(actual.latitude, 25)
  assert.equal(retry.permissionCalls.length, 1, 'a new action rechecks permission instead of caching the earlier denial')
})

await test('native callback timeout uses a fake timer instead of waiting', async () => {
  const state = loadLocation('app', { getLocation() {} })
  const pending = state.getUserLocationOnce()
  assert.equal(state.timers.size, 1)
  const [{ callback, delay }] = [...state.timers.values()]
  assert.equal(delay, 20000)
  callback()
  await assert.rejects(pending, error => error.code === 'LOCATION_TIMEOUT')
})

await test('address resolution errors are tagged as address stage and never shown as permission errors', async () => {
  const code = preprocessPlatform(addressSource, 'app')
    .replace("import { getUserLocationOnce } from '@/utils/location'", 'const { getUserLocationOnce } = globalThis.dependencies')
    .replace("import { reverseGeocoder } from '@/api/map'", 'const { reverseGeocoder } = globalThis.dependencies')
    .replace('export async function resolveLocationAddress', 'async function resolveLocationAddress')
    .replace('export async function getCurrentAddress', 'async function getCurrentAddress')
  const context = {
    dependencies: {
      getUserLocationOnce: async () => ({ latitude: 25, longitude: 121 }),
      reverseGeocoder: async () => { throw Object.assign(new Error('permission denied'), { code: 1 }) }
    }
  }
  vm.runInNewContext(`${code}\nglobalThis.getCurrentAddress = getCurrentAddress`, context)
  await assert.rejects(context.getCurrentAddress(), error => {
    assert.equal(error.locationStage, 'address')
    assert.match(locationErrorMessage(error), /地址解析失败/)
    assert.doesNotMatch(locationErrorMessage(error), /定位权限/)
    return true
  })
})

await test('current address opts into location accuracy and returns it with the resolved address', async () => {
  const code = preprocessPlatform(addressSource, 'app')
    .replace("import { getUserLocationOnce } from '@/utils/location'", 'const { getUserLocationOnce } = globalThis.dependencies')
    .replace("import { reverseGeocoder } from '@/api/map'", 'const { reverseGeocoder } = globalThis.dependencies')
    .replace('export async function resolveLocationAddress', 'async function resolveLocationAddress')
    .replace('export async function getCurrentAddress', 'async function getCurrentAddress')
  let locationOptions
  const context = {
    dependencies: {
      getUserLocationOnce: async (type, options) => { locationOptions = { type, ...options }; return { latitude: 25, longitude: 121, accuracy: 46 } },
      reverseGeocoder: async () => ({ data: { result: { address: '台北市中正區', address_component: {} } } })
    }
  }
  vm.runInNewContext(`${code}\nglobalThis.getCurrentAddress = getCurrentAddress`, context)
  const result = await context.getCurrentAddress()
  assert.equal(locationOptions.includeAccuracy, true)
  assert.equal(locationOptions.interactive, true)
  assert.equal(result.accuracy, 46)
})

await test('permission, timeout, SDK and places errors have distinct messages', async () => {
  const permission = locationErrorMessage({ errMsg: 'authorize denied' })
  const timeout = locationErrorMessage({ errMsg: 'request timeout' })
  const sdk = locationErrorMessage({ errMsg: 'Geolocation SDK module unavailable' })
  const places = locationErrorMessage({ errMsg: 'permission denied' }, 'places')
  assert.match(permission, /定位权限/)
  assert.match(timeout, /定位超时/)
  assert.match(sdk, /定位服务不可用/)
  assert.match(places, /附近地点加载失败/)
  assert.notEqual(places, permission)
})

await test('ShopAddressPicker H5 and App conditional script/template compile', async () => {
  for (const platform of ['H5', 'APP-PLUS']) {
    const normalizedPlatform = platform === 'APP-PLUS' ? 'APP-PLUS' : 'H5'
    const source = pickerSource.replace(/<template>([\s\S]*?)<\/template>/, (_, body) => `<template>${preprocessPlatform(body, normalizedPlatform)}</template>`)
      .replace(/<script setup>([\s\S]*?)<\/script>/, (_, body) => `<script setup>${preprocessPlatform(body, normalizedPlatform)}</script>`)
    const { descriptor, errors } = parse(source, { filename: 'ShopAddressPicker.vue' })
    assert.deepEqual(errors, [])
    const script = compileScript(descriptor, { id: `location-${platform.toLowerCase()}` })
    const template = compileTemplate({
      source: descriptor.template.content,
      filename: 'ShopAddressPicker.vue',
      id: `location-${platform.toLowerCase()}`,
      compilerOptions: { bindingMetadata: script.bindings }
    })
    assert.deepEqual(template.errors, [])
  }
})

console.log('location-once checks passed')
