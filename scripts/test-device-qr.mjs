import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
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
import { resolveDeviceScanTarget } from '../src/utils/device-qr.js'

const scene = '0123456789abcdef0123456789abcdef'
const path = `/pages/scan/scan?scene=${scene}`

const scannerSources = await Promise.all([
  'src/utils/device-qr.js',
  'src/pages/scan/scan.vue',
  'src/pages-dark/scan/scan.vue',
  'src/pages-dark/home/home.vue'
].map(async file => [file, await readFile(file, 'utf8')]))
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

function extractFunction(source, name) {
  const match = source.match(new RegExp(`(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))
  assert.ok(match, `${name} should be present in both scan pages`)
  return match[0]
}

function createScanPageHarness(source, dark, overrides = {}) {
  const calls = { resolve: [], connect: 0, login: [], toast: [] }
  const values = new Map()
  if (overrides.authToken) values.set('token', overrides.authToken)
  values.set('app_theme', dark ? 'dark' : 'light')
  const runtime = {
    getStorageSync: key => values.get(key),
    setStorageSync: (key, value) => values.set(key, value),
    removeStorageSync: key => values.delete(key),
    showToast: value => calls.toast.push(value),
    reLaunch: value => calls.login.push(value)
  }
  const context = vm.createContext({
    uni: runtime,
    getCurrentPages: () => [{ route: dark ? 'pages-dark/scan/scan' : 'pages/scan/scan' }],
    normalizeDeviceQrScene,
    savePendingDeviceQrScene,
    getPendingDeviceQrScene,
    clearPendingDeviceQrScene,
    appendPageQuery,
    normalizeDeviceMode: value => String(value || '').toLowerCase() === 'robot' ? 'robot' : 'bin',
    isValidDeviceQrScene,
    resolveWechatQrScene: async scene => {
      calls.resolve.push(scene)
      return overrides.resolve ? overrides.resolve(scene) : { code: 0, data: { device_id: 'device-1', token: 'device-token', device_name: 'resolved name', device_mode: 'bin' } }
    },
    attemptConnection: async () => {
      calls.connect++
      return overrides.connect ? overrides.connect(context) : false
    },
    deviceId: { value: '' },
    deviceName: { value: '' },
    deviceMode: { value: 'bin' },
    token: { value: '' },
    loading: { value: false },
    connected: { value: false },
    errorMessage: { value: '' },
    isTokenError: { value: false },
    activeScene: { value: '' },
    connectionError: { value: null },
    pageActive: true
  })
  const functions = [
    'isUnauthorizedDeviceError',
    'redirectToLoginWithScene',
    'resolveSceneAndConnect'
  ].map(name => extractFunction(source, name)).join('\n')
  vm.runInContext(functions, context)
  return {
    calls,
    values,
    context,
    run: scene => vm.runInContext(`resolveSceneAndConnect(${JSON.stringify(scene)})`, context)
  }
}

for (const [theme, dark] of [['pages', false], ['pages-dark', true]]) {
  const source = await readFile(new URL(`../src/${theme}/scan/scan.vue`, import.meta.url), 'utf8')

  const unauthenticated = createScanPageHarness(source, dark)
  await unauthenticated.run(scene)
  assert.equal(unauthenticated.calls.resolve.length, 0, `${theme}: no JWT must block the resolve call`)
  assert.equal(unauthenticated.calls.connect, 0)
  assert.equal(getPendingDeviceQrScene(unauthenticated.context.uni), scene)
  assert.equal(unauthenticated.calls.login[0].url, `/pages${dark ? '-dark' : ''}/index/index?scene=${scene}`)

  const connected = createScanPageHarness(source, dark, {
    authToken: 'user-jwt',
    connect: context => {
      assert.equal(context.deviceId.value, 'device-1')
      assert.equal(context.token.value, 'device-token')
      assert.equal(context.deviceName.value, '', `${theme}: resolve name must not skip the connect call`)
      context.deviceName.value = 'connect response name'
      context.connected.value = true
      return true
    }
  })
  await connected.run(scene)
  assert.deepEqual(connected.calls.resolve, [scene])
  assert.equal(connected.calls.connect, 1, `${theme}: resolved device still goes through connect (${JSON.stringify(connected.calls)}; ${connected.context.errorMessage.value})`)
  assert.equal(connected.context.deviceName.value, 'connect response name')
  assert.equal(getPendingDeviceQrScene(connected.context.uni), '')

  const unauthorized = createScanPageHarness(source, dark, {
    authToken: 'expired-jwt',
    resolve: async () => { throw { code: 401 } }
  })
  await unauthorized.run(scene)
  assert.equal(unauthorized.calls.connect, 0)
  assert.equal(getPendingDeviceQrScene(unauthorized.context.uni), scene, `${theme}: 401 retains the scan for login recovery`)

  const expired = createScanPageHarness(source, dark, {
    authToken: 'user-jwt',
    resolve: async () => ({ code: 2, data: {} })
  })
  await expired.run(scene)
  assert.equal(expired.calls.connect, 0)
  assert.equal(expired.context.connected.value, false, `${theme}: resolve failure cannot mark the page connected`)
  assert.match(expired.context.errorMessage.value, /重新扫码/)
  assert.equal(getPendingDeviceQrScene(expired.context.uni), '')

  let finishResolve
  const unmounted = createScanPageHarness(source, dark, {
    authToken: 'user-jwt',
    resolve: () => new Promise(resolve => { finishResolve = resolve })
  })
  const inFlight = unmounted.run(scene)
  await Promise.resolve()
  unmounted.context.pageActive = false
  finishResolve({ code: 0, data: { device_id: 'device-1', token: 'device-token', device_name: 'resolved name' } })
  await inFlight
  assert.equal(unmounted.calls.connect, 0, `${theme}: an unloaded scan page cannot connect after resolve`)
  assert.equal(unmounted.context.connected.value, false)
}

console.log('Device QR checks passed: trusted paths, platform scan options, legacy results, strict scene parsing and pending recovery.')
