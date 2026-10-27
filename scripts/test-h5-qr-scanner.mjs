import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { isPhoneBrowser } from '../src/utils/h5-scan-entry.mjs'

for (const ua of ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'Mozilla/5.0 (Linux; Android 14) Mobile Safari/537.36']) {
  assert.equal(isPhoneBrowser({ userAgent: ua }), true)
}
for (const ua of ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', '']) {
  assert.equal(isPhoneBrowser({ userAgent: ua }), false)
}

const source = (await readFile(new URL('../src/utils/h5-qr-scanner.js', import.meta.url), 'utf8'))
  .replace(/^import .*\n/gm, '')
  .replace(/const loadDecoder = [\s\S]*?(?=\/\/ Ordinary QR)/, 'const loadDecoder = () => Promise.resolve(globalThis.decoder)\n\n')
  .replace('export function scanWithH5Camera', 'globalThis.scanWithH5Camera = function')

function harness({ mobile = true, secure = true, getUserMedia } = {}) {
  const listeners = new Map(), timers = new Map(), elements = new Map()
  let timerId = 0, cameraCalls = 0, stopped = 0, removed = false
  const stream = { getTracks: () => [{ stop() { stopped++ } }], getVideoTracks: () => [] }
  const element = key => {
    if (elements.has(key)) return elements.get(key)
    const value = {
      hidden: true, disabled: false, value: '', readyState: 2, videoWidth: 300, videoHeight: 300,
      isConnected: true, style: {}, textContent: '',
      setAttribute() {}, focus() {}, pause() {}, play: async () => {},
      addEventListener() {}, remove() { removed = true },
      querySelector: selector => element(`${key}/${selector}`),
      getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) })
    }
    elements.set(key, value)
    return value
  }
  const document = {
    hidden: false, activeElement: null,
    body: { style: { overflow: 'auto' }, append() {} },
    createElement: tag => element(tag),
    addEventListener: (key, callback) => listeners.set(key, callback),
    removeEventListener: key => listeners.delete(key)
  }
  const context = vm.createContext({
    document, isPhoneBrowser: () => mobile,
    vibrateScan: () => {},
    navigator: { mediaDevices: { getUserMedia: () => { cameraCalls++; return getUserMedia ? getUserMedia(stream) : Promise.resolve(stream) } } },
    window: { isSecureContext: secure, addEventListener: (key, callback) => listeners.set(key, callback), removeEventListener: key => listeners.delete(key) },
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId },
    clearTimeout: id => timers.delete(id),
    decoder: () => ({ data: 'device_id=test-bin&token=test' }),
    URL, Date, Uint8ClampedArray
  })
  vm.runInContext(source, context)
  const events = []
  const scan = () => context.scanWithH5Camera({ success: value => events.push(['ok', value]), fail: value => events.push(['fail', value]), complete: value => events.push(['complete', value]) })
  return {
    scan, events, document, listeners, timers, element,
    get cameraCalls() { return cameraCalls }, get stopped() { return stopped }, get removed() { return removed },
    close: () => element('section/[data-action="close"]').onclick(),
    tick: async delay => { const item = [...timers].find(([, t]) => t.delay === delay); assert.ok(item); timers.delete(item[0]); item[1].callback(); await flush() }
  }
}
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }

const desktop = harness({ mobile: false }); desktop.scan()
assert.equal(desktop.cameraCalls, 0)
assert.equal(desktop.events[0][0], 'fail')

const camera = harness(); camera.scan(); camera.scan(); await flush()
assert.equal(camera.cameraCalls, 1, 'single flight')
assert.equal(camera.events.length, 0, 'one frame is not enough')
await camera.tick(200)
assert.equal(camera.events.filter(([type]) => type === 'ok').length, 1)
assert.equal(camera.events.filter(([type]) => type === 'complete').length, 1)
assert.equal(camera.stopped, 1)
assert.equal(camera.removed, true)
assert.equal(camera.document.body.style.overflow, 'auto')
assert.equal(camera.timers.size, 0)
assert.equal(camera.listeners.size, 0)

let resolveLate
const late = harness({ getUserMedia: () => new Promise(resolve => { resolveLate = resolve }) })
late.scan(); late.close()
resolveLate({ getTracks: () => [{ stop() { late.events.push(['lateStop']) } }] })
await flush()
assert.equal(late.events.filter(([type]) => type === 'lateStop').length, 1)
assert.equal(late.events.some(([type]) => type === 'ok'), false)

const denied = harness({ getUserMedia: () => Promise.reject({ name: 'NotAllowedError' }) })
denied.scan(); await flush()
assert.match(denied.element('section/[role="status"]').textContent, /未获得相机权限/)
assert.equal(denied.events.length, 0, 'permission failure leaves manual / gallery choices available')
denied.element('section/[data-action="manual"]').onclick()
denied.element('section/form/input').value = 'test-bin'
denied.element('section/form').onsubmit({ preventDefault() {} })
assert.equal(denied.events[0][1].result, 'test-bin')

const insecure = harness({ secure: false }); insecure.scan()
assert.equal(insecure.cameraCalls, 0)
assert.match(insecure.element('section/[role="status"]').textContent, /HTTPS/)
insecure.close()

for (const reason of ['hidden', 'pagehide', 'hashchange', 'popstate']) {
  const scan = harness(); scan.scan(); await flush()
  if (reason === 'hidden') { scan.document.hidden = true; scan.listeners.get('visibilitychange')() }
  else scan.listeners.get(reason)()
  assert.equal(scan.stopped, 1, `${reason}: stops track`)
  assert.equal(scan.timers.size, 0)
  assert.equal(scan.events.some(([type]) => type === 'ok'), false)
  if (reason === 'hidden') scan.close()
}

const timeout = harness({ getUserMedia: () => new Promise(() => {}) })
timeout.scan(); await timeout.tick(15000)
assert.match(timeout.element('section/[role="status"]').textContent, /超时/)
timeout.close()
console.log('PASS mobile gate, stable decode/single-flight, cancellation/late stream, denied/manual, HTTPS, camera timeout and lifecycle cleanup')
