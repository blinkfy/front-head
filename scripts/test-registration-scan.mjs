import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import * as deviceQrEntry from '../src/utils/device-qr-entry.mjs'
import { handleRegistrationQrScan, resolveRegistrationQrScanTarget } from '../src/utils/registration-relay.mjs'

const scene = 'r_' + 'a'.repeat(24)
const deviceScene = '0123456789abcdef0123456789abcdef'
const cases = []
const test = (name, run) => cases.push({ name, run })

test('registered login path wins over opaque scan result', () => {
  assert.deepEqual(resolveRegistrationQrScanTarget({
    path: `/pages/register/register?scene=${scene}`,
    result: 'opaque-wechat-result'
  }), { url: `/pages/register/register?scene=${scene}`, invalidScene: false })
})

test('encoded scenes and light, dark, and index landing paths resolve to registration', () => {
  const encoded = encodeURIComponent(scene)
  for (const path of [
    `/pages/register/register?scene=${encoded}`,
    `/pages-dark/register/register?scene=${encoded}`,
    `/pages/index/index?scene=${encoded}`,
    `/pages-dark/index/index?scene=${encoded}`
  ]) {
    assert.deepEqual(resolveRegistrationQrScanTarget({ path }), {
      url: `/pages/register/register?scene=${scene}`,
      invalidScene: false
    })
  }
})

test('fixed web_register and bare registration session result are accepted', () => {
  assert.equal(resolveRegistrationQrScanTarget({ path: '/pages/index/index?scene=web_register' }).url,
    '/pages/register/register?scene=web_register')
  assert.equal(resolveRegistrationQrScanTarget({ result: scene }).url,
    `/pages/register/register?scene=${scene}`)
})

test('unrecognized and external paths preserve device handling, including result fallback', () => {
  assert.equal(resolveRegistrationQrScanTarget({ path: `/pages-nonTheme/scan?scene=${deviceScene}`, result: scene }), null)
  assert.equal(resolveRegistrationQrScanTarget({ path: `https://example.test/pages/index/index?scene=${scene}`, result: scene }), null)
  assert.equal(resolveRegistrationQrScanTarget({ result: 'device_id=bin-7&token=legacy' }), null)
  assert.equal(deviceQrEntry.getDeviceQrScanContent({
    path: `/pages-nonTheme/scan?scene=${deviceScene}`,
    result: 'device_id=bin-7&token=legacy'
  }), `/pages-nonTheme/scan?scene=${deviceScene}`)
  assert.equal(deviceQrEntry.getDeviceQrScanContent({ result: 'device_id=bin-7&token=legacy' }),
    'device_id=bin-7&token=legacy')
})

test('old but syntactically valid scenes are forwarded without local expiry decisions or automatic authorization', () => {
  const nav = [], toast = [], runtime = {
    navigateTo: options => nav.push(options),
    showToast: options => toast.push(options)
  }
  assert.equal(handleRegistrationQrScan({ path: `/pages-dark/register/register?scene=${scene}` }, runtime), true)
  assert.deepEqual(nav, [{ url: `/pages/register/register?scene=${scene}` }])
  assert.deepEqual(toast, [])
  assert.equal(Object.keys(runtime).some(key => /authorize|request|login/i.test(key)), false)
})

test('invalid and repeated scenes are consumed with a non-device toast', () => {
  const nav = [], toast = []
  const runtime = { navigateTo: value => nav.push(value), showToast: value => toast.push(value) }
  for (const path of [
    '/pages/register/register?scene=not-a-session',
    `/pages/index/index?scene=${scene}&scene=${scene}`
  ]) {
    assert.equal(handleRegistrationQrScan({ path }, runtime), true)
  }
  assert.deepEqual(nav, [])
  assert.equal(toast.length, 2)
  assert.ok(toast.every(item => item.icon === 'none'))
})

test('shared mini-program scanner routes registration once and keeps device navigation/storage behavior', async () => {
  const sourceUrl = new URL('../src/utils/device-qr.js', import.meta.url)
  const source = await readFile(sourceUrl, 'utf8')
  const darkHome = await readFile(new URL('../src/pages-dark/home/home.vue', import.meta.url), 'utf8')
  assert.match(darkHome, /if \(handleRegistrationQrScan\(res, \{[\s\S]*?\}\)\) return[\s\S]*?connectDevice\(getDeviceQrScanContent\(res\)\)/,
    'dark home gives registration scans to the relay before falling back to device handling')
  const executableSource = source
    .replace(/^import[^\r\n]*\r?\n/gm, '')
    .replace(/^export\s+\{[^\r\n]*\}\s+from[^\r\n]*\r?\n/gm, '')
    .replace(/^export\s+/gm, '')
    .replace(/\/\/ #ifndef MP-WEIXIN[\s\S]*?\/\/ #endif/g, '')
  const calls = { navigate: [], toast: [], storage: [], scans: [] }
  let scanResult
  const runtime = {
    getDeviceInfo: () => ({ platform: 'devtools' }),
    getAppBaseInfo: () => ({ uniPlatform: 'mp-weixin' }),
    getSystemInfoSync: () => ({ platform: 'devtools', uniPlatform: 'mp-weixin' }),
    scanCode: options => { calls.scans.push(options); options.success(scanResult) },
    navigateTo: options => calls.navigate.push(options),
    showToast: options => calls.toast.push(options),
    setStorageSync: (key, value) => calls.storage.push([key, value])
  }
  const context = vm.createContext({
    ...deviceQrEntry,
    handleRegistrationQrScan,
    uni: runtime,
    Date,
    encodeURIComponent,
    console: { log() {} }
  })
  vm.runInContext(`${executableSource}\nglobalThis.__scanAndConnectDevice = scanAndConnectDevice;`, context, {
    filename: fileURLToPath(sourceUrl)
  })

  scanResult = { path: `/pages/register/register?scene=${scene}`, result: 'opaque' }
  context.__scanAndConnectDevice()
  assert.equal(calls.scans.length, 1)
  assert.deepEqual(calls.navigate, [{ url: `/pages/register/register?scene=${scene}` }])
  assert.deepEqual(calls.storage, [])

  calls.navigate.length = 0
  scanResult = { path: `/pages-nonTheme/scan?scene=${deviceScene}`, result: 'device_id=bin-7&token=legacy' }
  context.__scanAndConnectDevice()
  assert.equal(calls.navigate.length, 1)
  assert.equal(calls.navigate[0].url, `/pages-nonTheme/scan?scene=${deviceScene}`)
  assert.deepEqual(calls.storage, [])
})

for (const { name, run } of cases) {
  await run()
  console.log('PASS ' + name)
}
console.log(`${cases.length} registration scan checks passed`)
