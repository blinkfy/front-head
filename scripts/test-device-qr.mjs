import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import {
  appendPageQuery,
  buildDeviceQrScanUrl,
  clearPendingDeviceQrScene,
  getDeviceQrScanContent,
  getPendingDeviceQrScene,
  isValidDeviceQrScene,
  normalizeDeviceQrScene,
  PENDING_DEVICE_QR_KEY,
  PENDING_DEVICE_QR_TTL_MS,
  resolveDeviceQrPathTarget,
  savePendingDeviceQrScene
} from '../src/utils/device-qr-entry.mjs'
import { getDeviceQrScanContent as getDeviceScanContent, normalizeDeviceMode, resolveDeviceScanTarget } from '../src/utils/device-qr.js'

const scene = '0123456789abcdef0123456789abcdef'
const path = `/pages/scan/scan?scene=${scene}`
const hookFile = new URL('../src/utils/use-device-scan-page.js', import.meta.url)
const hookSource = await readFile(hookFile, 'utf8')

const scannerSources = await Promise.all([
  ['src/utils/device-qr.js', await readFile(new URL('../src/utils/device-qr.js', import.meta.url), 'utf8')],
  ['src/utils/use-device-scan-page.js', hookSource],
  ['src/pages-dark/home/home.vue', await readFile(new URL('../src/pages-dark/home/home.vue', import.meta.url), 'utf8')]
])
for (const [file, scannerSource] of scannerSources) {
  assert.doesNotMatch(scannerSource, /wxCode/, `${file}: scanType must not use unsupported wxCode`)
  if (file === 'src/utils/device-qr.js') {
    const miniProgramScan = scannerSource.match(/\/\/ #ifdef MP-WEIXIN\s+uni\.scanCode\(\{([\s\S]*?)\/\/ #endif/)
    assert.ok(miniProgramScan, 'utility keeps its MP-Weixin scan branch')
    assert.doesNotMatch(miniProgramScan[1], /scanType/, 'MP-Weixin uses its default scan types')
    assert.match(scannerSource, /\/\/ #ifndef MP-WEIXIN\s+uni\.scanCode\(\{\s*scanType:\s*\['qrCode'\]/)
  } else {
    assert.match(scannerSource, /uni\.scanCode\(\{\s*\/\/ #ifndef MP-WEIXIN\s+scanType:\s*\['qrCode'\]/, `${file}: qrCode filtering remains APP-only`)
  }
}

assert.equal(getDeviceQrScanContent({ path, result: 'legacy-device' }), path, 'an own scan route path takes priority')
assert.equal(
  getDeviceQrScanContent({ path: '/pages/home/home?scene=ignored', result: 'device_id=bin-7&token=legacy' }),
  'device_id=bin-7&token=legacy',
  'paths outside the two scan pages fall back to the legacy result'
)
assert.equal(
  getDeviceQrScanContent({ path: 'https://other.example/#/pages/scan/scan?scene=' + scene, result: 'legacy' }),
  'legacy',
  'external URLs are not treated as trusted mini-program scan paths'
)

assert.deepEqual(
  resolveDeviceQrPathTarget(path, '/pages-dark/scan/scan'),
  {
    url: `/pages-dark/scan/scan?scene=${scene}`,
    scene,
    deviceId: '',
    deviceName: '',
    deviceMode: 'bin',
    token: '',
    isMock: false
  }
)
assert.equal(resolveDeviceQrPathTarget('/pages/profile/profile?scene=' + scene, '/pages/scan/scan'), null)
assert.equal(resolveDeviceQrPathTarget('/pages/scan/scan?scene=not-32-hex', '/pages/scan/scan').invalidScene, true)
const routedScene = resolveDeviceScanTarget(path, '/pages-dark/scan/scan')
assert.equal(routedScene.scene, scene)
assert.equal(routedScene.url, `/pages-dark/scan/scan?scene=${scene}`)

const rawHexDeviceId = scene
const rawTarget = resolveDeviceScanTarget(rawHexDeviceId)
assert.equal(rawTarget.deviceId, rawHexDeviceId, 'a bare 32-hex legacy ID remains a device ID')
assert.match(rawTarget.url, /device_id=0123456789abcdef/)
const oldQueryTarget = resolveDeviceScanTarget('device_id=bin-7&token=legacy-token')
assert.equal(oldQueryTarget.deviceId, 'bin-7')
assert.equal(oldQueryTarget.token, 'legacy-token')

assert.equal(buildDeviceQrScanUrl(scene, false), `/pages/scan/scan?scene=${scene}`)
assert.equal(buildDeviceQrScanUrl(scene, true), `/pages-dark/scan/scan?scene=${scene}`)
assert.equal(appendPageQuery('/pages/index/index', { scene, username: '张三' }), `/pages/index/index?scene=${scene}&username=%E5%BC%A0%E4%B8%89`)

const values = new Map()
const storage = {
  setStorageSync: (key, value) => values.set(key, value),
  getStorageSync: key => values.get(key),
  removeStorageSync: key => values.delete(key)
}
assert.equal(savePendingDeviceQrScene(storage, scene, 1000), true)
assert.equal(getPendingDeviceQrScene(storage, 1000 + PENDING_DEVICE_QR_TTL_MS), scene)
assert.equal(getPendingDeviceQrScene(storage, 1001 + PENDING_DEVICE_QR_TTL_MS), '')
assert.equal(values.has(PENDING_DEVICE_QR_KEY), false, 'expired scenes are cleared')
assert.equal(savePendingDeviceQrScene(storage, 'invalid', 2000), false)
assert.equal(values.has(PENDING_DEVICE_QR_KEY), false)
savePendingDeviceQrScene(storage, scene, 3000)
clearPendingDeviceQrScene(storage)
assert.equal(getPendingDeviceQrScene(storage, 3000), '')

function createScanPageHarness(dark, overrides = {}) {
  const calls = { resolve: [], connect: [], disconnect: [], connectedDevices: 0, login: [], navigate: [], redirect: [], back: [], toast: [], modals: [], scans: [] }
  const values = new Map([['app_theme', dark ? 'dark' : 'light']])
  if (overrides.authToken) values.set('token', overrides.authToken)
  const lifecycle = { load: [], show: [], hide: [], mounted: [], unmounted: [] }
  const timers = { nextId: 0, intervals: new Map(), timeouts: new Map(), clearedIntervals: [] }
  let page
  let currentDeviceId = ''
  const deviceAPI = {
    isValid: true,
    error: null,
    connectDevice: async (deviceId, token, authToken) => {
      calls.connect.push({ deviceId, token, authToken })
      currentDeviceId = String(deviceId)
      return overrides.connect
        ? overrides.connect({ deviceId, token, authToken, page })
        : { code: 0, data: { device_name: 'connect response name' } }
    },
    disconnectDevice: async (...args) => {
      calls.disconnect.push(args)
      return { code: 0 }
    },
    getConnectedDevices: async () => {
      calls.connectedDevices += 1
      return { code: 0, data: currentDeviceId ? [{ device_id: currentDeviceId }] : [] }
    }
  }
  const runtime = {
    getStorageSync: key => values.get(key),
    setStorageSync: (key, value) => values.set(key, value),
    removeStorageSync: key => values.delete(key),
    getDeviceInfo: () => overrides.deviceInfo || { platform: 'android' },
    getAppBaseInfo: () => ({ uniPlatform: overrides.uniPlatform || 'app' }),
    getSystemInfoSync: () => ({ platform: 'android', uniPlatform: 'app' }),
    showToast: value => calls.toast.push(value),
    reLaunch: value => calls.login.push(value),
    navigateTo: value => calls.navigate.push(value),
    redirectTo: value => calls.redirect.push(value),
    navigateBack: () => calls.back.push(true),
    showModal: value => calls.modals.push(value),
    scanCode: value => calls.scans.push(value)
  }
  const callbacks = {
    onLoad: callback => lifecycle.load.push(callback),
    onShow: callback => lifecycle.show.push(callback),
    onHide: callback => lifecycle.hide.push(callback),
    onMounted: callback => lifecycle.mounted.push(callback),
    onUnmounted: callback => lifecycle.unmounted.push(callback)
  }
  const timerApi = {
    setInterval: (callback, delay) => {
      const id = ++timers.nextId
      timers.intervals.set(id, { callback, delay })
      return id
    },
    clearInterval: id => {
      timers.clearedIntervals.push(id)
      timers.intervals.delete(id)
    },
    setTimeout: (callback, delay) => {
      const id = ++timers.nextId
      timers.timeouts.set(id, { callback, delay })
      return id
    },
    clearTimeout: id => timers.timeouts.delete(id)
  }
  const context = vm.createContext({
    ...callbacks,
    ...timerApi,
    ref: value => ({ value }),
    getDeviceAPI: () => deviceAPI,
    testDeviceAPI: () => true,
    normalizeDeviceMode,
    resolveDeviceScanTarget,
    getDeviceQrScanContent: getDeviceScanContent,
    saveMockDeviceConnection: value => ({ ...value, id: value.device_id }),
    resolveWechatQrScene: async value => {
      calls.resolve.push(value)
      return overrides.resolve ? overrides.resolve(value) : { code: 0, data: { device_id: 'device-1', token: 'device-token', device_name: 'resolved name', device_mode: 'bin' } }
    },
    appendPageQuery,
    clearPendingDeviceQrScene,
    isValidDeviceQrScene,
    normalizeDeviceQrScene,
    savePendingDeviceQrScene,
    uni: runtime,
    getCurrentPages: () => {
      const route = overrides.route || (dark ? 'pages-dark/scan/scan' : 'pages/scan/scan')
      const count = overrides.pageCount || 1
      return Array.from({ length: count }, (_, index) => ({
        route: index === count - 1 ? route : 'pages/home/home',
        options: index === count - 1 ? (overrides.pageOptions || {}) : {}
      }))
    },
    console: { log() {}, warn() {}, error() {} }
  })
  const executableSource = hookSource
    .replace(/^import[^\r\n]*\r?\n/gm, '')
    .replace(/^export\s+/gm, '')
  vm.runInContext(`${executableSource}\nglobalThis.__useDeviceScanPage = useDeviceScanPage;`, context, {
    filename: fileURLToPath(hookFile)
  })
  page = context.__useDeviceScanPage({ dark })

  return {
    page, calls, values, lifecycle, timers, runtime, deviceAPI,
    load: options => lifecycle.load.forEach(callback => callback(options)),
    show: () => lifecycle.show.forEach(callback => callback()),
    hide: () => lifecycle.hide.forEach(callback => callback()),
    mount: async () => { for (const callback of lifecycle.mounted) await callback() },
    unmount: () => lifecycle.unmounted.forEach(callback => callback()),
    fireTimeout: delay => {
      const entry = [...timers.timeouts.entries()].find(([, timer]) => timer.delay === delay)
      assert.ok(entry, `expected a ${delay}ms timeout`)
      timers.timeouts.delete(entry[0])
      return entry[1].callback()
    }
  }
}

async function settleAsync() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}

for (const dark of [false, true]) {
  const theme = dark ? 'pages-dark' : 'pages'

  const unauthenticated = createScanPageHarness(dark)
  unauthenticated.load({ scene })
  assert.equal(getPendingDeviceQrScene(unauthenticated.runtime), scene)
  await unauthenticated.mount()
  assert.deepEqual(unauthenticated.calls.resolve, [], `${theme}: no JWT must block the resolve call`)
  assert.deepEqual(unauthenticated.calls.connect, [])
  assert.equal(unauthenticated.calls.login[0].url, `/pages${dark ? '-dark' : ''}/index/index?scene=${scene}`)

  const connected = createScanPageHarness(dark, { authToken: 'user-jwt' })
  connected.load({ scene })
  await connected.mount()
  assert.deepEqual(connected.calls.resolve, [scene])
  assert.equal(connected.calls.connect.length, 1, `${theme}: resolved device still goes through connect`)
  assert.equal(connected.calls.connect[0].deviceId, 'device-1')
  assert.equal(connected.calls.connect[0].token, 'device-token')
  assert.equal(connected.page.deviceName.value, 'connect response name')
  assert.equal(getPendingDeviceQrScene(connected.runtime), '')

  const unauthorized = createScanPageHarness(dark, {
    authToken: 'expired-jwt',
    resolve: async () => { throw { code: 401 } }
  })
  unauthorized.load({ scene })
  await unauthorized.mount()
  assert.deepEqual(unauthorized.calls.connect, [])
  assert.equal(getPendingDeviceQrScene(unauthorized.runtime), scene, `${theme}: 401 retains the scan for login recovery`)

  const expired = createScanPageHarness(dark, {
    authToken: 'user-jwt',
    resolve: async () => ({ code: 2, data: {} })
  })
  expired.load({ scene })
  await expired.mount()
  assert.deepEqual(expired.calls.connect, [])
  assert.equal(expired.page.connected.value, false, `${theme}: resolve failure cannot mark the page connected`)
  assert.match(expired.page.errorMessage.value, /重新扫码/)
  assert.equal(getPendingDeviceQrScene(expired.runtime), '')

  let finishResolve
  const unmounted = createScanPageHarness(dark, {
    authToken: 'user-jwt',
    resolve: () => new Promise(resolve => { finishResolve = resolve })
  })
  unmounted.load({ scene })
  const inFlight = unmounted.mount()
  await Promise.resolve()
  assert.equal(unmounted.calls.resolve.length, 1)
  unmounted.unmount()
  finishResolve({ code: 0, data: { device_id: 'device-1', token: 'device-token', device_name: 'resolved name' } })
  await inFlight
  assert.deepEqual(unmounted.calls.connect, [], `${theme}: an unloaded scan page cannot connect after resolve`)
  assert.equal(unmounted.page.connected.value, false)
}

console.log('Device QR checks passed: trusted paths, platform scan options, legacy results, strict scene parsing and pending recovery.')
