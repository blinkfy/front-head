import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { createScanDebugAccess } from '../src/utils/scan-debug.mjs'
import { cameraFrame, sharpenQrImage } from '../src/utils/h5-camera-frame.mjs'
import { isPhoneBrowser, canShowDeviceScanEntry, canUseBrowserCamera } from '../src/utils/h5-scan-entry.mjs'
import { videoConstraints, candidateFrame, imageClarity, PhotoGate, ScanAutoZoom, reprojectCandidate, selectSharpFrame, sharpFrameMatches } from '../src/utils/h5-scan-quality.mjs'
import { preparePhotoCapture } from '../src/utils/h5-photo-capture.mjs'
import { createNativeQrReader } from '../src/utils/h5-native-qr.mjs'

for (const ua of ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'Mozilla/5.0 (Linux; Android 14) Mobile Safari/537.36']) {
  assert.equal(isPhoneBrowser({ userAgent: ua }), true)
}
for (const ua of ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', '']) {
  assert.equal(isPhoneBrowser({ userAgent: ua }), false)
}

// H5 entry visibility and scanner capability must agree without opening a camera.
{
  let calls = 0
  const mobile = { userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile', mediaDevices: { getUserMedia() { calls++ } } }
  const secure = { isSecureContext: true }
  assert.equal(canShowDeviceScanEntry(mobile, secure), true)
  assert.equal(canShowDeviceScanEntry(mobile, { isSecureContext: false }), false)
  assert.equal(canShowDeviceScanEntry({ userAgent: mobile.userAgent }, secure), false)
  assert.equal(canShowDeviceScanEntry({ ...mobile, mediaDevices: {} }, secure), false)
  assert.equal(canShowDeviceScanEntry({ ...mobile, mediaDevices: { getUserMedia: true } }, secure), false)
  assert.equal(canShowDeviceScanEntry({ ...mobile, userAgent: 'Windows NT 10.0' }, secure), false)
  // Older engines may expose camera support without isSecureContext.
  assert.equal(canShowDeviceScanEntry(mobile, {}), true)
  assert.equal(canUseBrowserCamera(mobile, null), false)
  assert.equal(canShowDeviceScanEntry(undefined, undefined), true, 'native/mini-program environments keep their entry')
  assert.equal(calls, 0, 'visibility check never requests camera permission')
}

const source = (await readFile(new URL('../src/utils/h5-qr-scanner.js', import.meta.url), 'utf8'))
  .replace(/^import .*\r?\n/gm, '')
  .replace('const loadDecoder =', 'const createNativeQrReader = globalThis.createNativeQrReader\nconst loadDecoder =')
  .replace(/const loadDecoder = [\s\S]*?(?=export function scanWithH5Camera)/, 'const loadDecoder = () => Promise.resolve(globalThis.decoder)\n\n')
  .replace("const loadRoundPreview = () => import('./h5-roundcode.js')", 'const loadRoundPreview = () => Promise.resolve(globalThis.roundPreviewModule)')
  .replace('export function scanWithH5Camera', 'globalThis.scanWithH5Camera = function')

function harness({ mobile = true, secure = true, getUserMedia, track, admin = false, decodedText = 'device_id=test-bin&token=test',
  deviceMemory, hardwareConcurrency, photoCapture, detectQrCandidate = () => null,
  detectRoundCodeCandidate = () => null, imageDataFactory, soundMuted = false,
  BarcodeDetector, nativeWithin, roundDecode, roundPreview } = {}) {
  const listeners = new Map(), timers = new Map(), elements = new Map()
  let timerId = 0, cameraCalls = 0, stopped = 0, removed = false, fakeNow = 0, canvasId = 0
  let currentDecodedText = decodedText
  const draws = [], soundCalls = [], playedSounds = [], pixelReads = [], putImageDataCalls = [], decoderCalls = []
  const storage = { token: 'test-session', userInfo: { isAdmin: admin } }
  const stream = { getTracks: () => [{ stop() { stopped++ } }], getVideoTracks: () => track ? [track] : [] }
  const element = key => {
    if (elements.has(key)) return elements.get(key)
    const value = {
      hidden: true, disabled: false, value: '', readyState: 2, videoWidth: 300, videoHeight: 300,
      isConnected: true, style: {}, textContent: '',
      attributes: new Set(), setAttribute(name) { this.attributes.add(name) },
      hasAttribute(name) { return this.attributes.has(name) },
      focus() {}, pause() {}, play: async () => {},
      append() {},
      toDataURL: () => 'data:image/jpeg;base64,scanner-test-image',
      handlers: {}, addEventListener(name, callback) { this.handlers[name] = callback }, remove() { removed = true },
      querySelector: selector => element(`${key}/${selector}`),
      getContext: () => ({
        drawImage(...args) { draws.push(args) },
        fillRect() {},
        putImageData(pixels, x, y) { putImageDataCalls.push({ key, pixels, x, y }) },
        getImageData: () => {
          const size = value.width * value.height * 4
          const supplied = imageDataFactory?.({ width: value.width, height: value.height, key, now: fakeNow, draws })
          const pixels = supplied instanceof Uint8ClampedArray ? supplied : supplied?.data
          const data = pixels?.length === size ? pixels : new Uint8ClampedArray(size)
          const result = { width: value.width, height: value.height, data }
          pixelReads.push({ key, frame: { width: value.width, height: value.height }, pixels: result, now: fakeNow })
          return result
        }
      })
    }
    if (key === 'section') {
      let markup = ''
      Object.defineProperty(value, 'innerHTML', {
        get: () => markup,
        set: html => {
          markup = html
          if (/<video[^>]*\bmuted\b[^>]*data-ui-sound-camera-preview/.test(html)) {
            const video = element('section/video')
            video.muted = true
            video.attributes.add('data-ui-sound-camera-preview')
          }
        }
      })
    }
    elements.set(key, value)
    return value
  }
  const document = {
    hidden: false, activeElement: null,
    body: { style: { overflow: 'auto' }, append() {} },
    createElement: tag => tag === 'canvas' ? element(`canvas-${++canvasId}`) : element(tag),
    addEventListener: (key, callback) => listeners.set(key, callback),
    removeEventListener: key => listeners.delete(key)
  }
  const context = vm.createContext({
    document, cameraFrame, sharpenQrImage, detectRoundCodeCandidate, detectQrCandidate,
    videoConstraints, candidateFrame, imageClarity, PhotoGate, ScanAutoZoom, reprojectCandidate, selectSharpFrame, sharpFrameMatches,
    preparePhotoCapture: photoCapture || (async () => null),
    createNativeQrReader,
    createBrowserQrAnalyzer: () => {
      let closed = false
      return { close() { closed = true }, async analyze(pixels, options = {}) {
        if (closed) return { error: 'CANCELLED' }
        let text = '', candidate = null
        const decode = input => context.decoder(input.data, input.width, input.height, { inversionAttempts: 'attemptBoth' })?.data || ''
        if (options.decode !== false) {
          let input = pixels
          if (options.sharpen) { input = { ...pixels, data: new Uint8ClampedArray(pixels.data) }; sharpenQrImage(input) }
          text = decode(input)
          if (!text && options.enhance) {
            const enhanced = { ...pixels, data: new Uint8ClampedArray(pixels.data) }
            sharpenQrImage(enhanced); text = decode(enhanced)
          }
        }
        if (!text && options.locate) {
          const qr = detectQrCandidate(pixels), round = !qr && detectRoundCodeCandidate(pixels)
          candidate = qr ? { kind: 'qr', value: qr } : round ? { kind: 'round', value: round } : null
        }
        return { text, candidate }
      } }
    },
    createBrowserRoundCodeDecoder: onProgress => ({ available: Boolean(roundDecode),
      decode: pixels => { onProgress('decoding'); return roundDecode(pixels) }, close() {} }),
    prioritizeRoundCodeScanner: async () => () => {},
    preloadBrowserRoundCodeAssets: () => ({ promise: Promise.resolve(true), cancel() {} }),
    roundPreviewModule: { previewWebRoundCode: roundPreview },
    createScanDebugAccess,
    uni: { getStorageSync: key => storage[key] }, isPhoneBrowser: () => mobile,
    canUseBrowserCamera: () => canUseBrowserCamera(context.navigator, context.window),
    vibrateScan: () => {},
    primeUiSounds: () => soundCalls.push(['prime']),
    playUiSound: sound => { soundCalls.push(['play', sound]); if (!soundMuted) playedSounds.push(sound) },
    navigator: {
      deviceMemory, hardwareConcurrency,
      mediaDevices: { getUserMedia: () => { cameraCalls++; return getUserMedia ? getUserMedia(stream) : Promise.resolve(stream) } }
    },
    window: { isSecureContext: secure, BarcodeDetector, addEventListener: (key, callback) => listeners.set(key, callback), removeEventListener: key => listeners.delete(key) },
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId },
    clearTimeout: id => timers.delete(id),
    decoder: (...args) => { decoderCalls.push(args); return currentDecodedText ? ({ data: currentDecodedText }) : null },
    within: nativeWithin,
    Image: class FakeImage {
      naturalWidth = 640; naturalHeight = 640
      set src(value) { if (value) Promise.resolve().then(() => this.onload?.()) }
    },
    URL: { createObjectURL: () => 'blob:test-image', revokeObjectURL() {} }, Date: class FakeDate extends Date { static now() { return fakeNow } }, Uint8ClampedArray
  })
  vm.runInContext(source, context)
  const events = []
  const scan = () => context.scanWithH5Camera({ success: value => events.push(['ok', value]), fail: value => events.push(['fail', value]), complete: value => events.push(['complete', value]) })
  return {
    scan, events, document, listeners, timers, element, draws, storage, soundCalls, playedSounds,
    pixelReads, putImageDataCalls, decoderCalls,
    setDecodedText: value => { currentDecodedText = value },
    get cameraCalls() { return cameraCalls }, get stopped() { return stopped }, get removed() { return removed },
    close: () => element('section/[data-action="close"]').onclick(),
    tick: async (delay, advance = delay) => { fakeNow += advance; const item = [...timers].find(([, t]) => t.delay === delay); assert.ok(item); timers.delete(item[0]); item[1].callback(); await flush() },
    advance: amount => { fakeNow += amount }
  }
}
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve() }

// Native QR is an accelerator with bounded, session-safe fallback behavior.
{
  let detects = 0, jsqr = 0
  class Detector { static async getSupportedFormats() { return ['qr_code'] } constructor() {} async detect() { detects++; return [{ format: 'qr_code', rawValue: 'native-result' }] } }
  const reader = createNativeQrReader({ BarcodeDetector: Detector })
  assert.deepEqual(await reader.read({}, () => true), { text: 'native-result' })
  assert.equal(detects, 1); reader.close()
  const native = harness({ BarcodeDetector: Detector, decodedText: 'fallback-should-not-run' })
  native.scan(); await flush(); await flush(); await native.tick(200)
  assert.equal(native.decoderCalls.length, 0, 'native success bypasses jsQR')
  assert.equal(native.events.find(([type]) => type === 'ok')?.[1]?.result, 'native-result', JSON.stringify({ events: native.events, status: native.element('section/[role="status"]').textContent, draws: native.draws.length }))
}
{
  class EmptyDetector { static async getSupportedFormats() { return ['qr_code'] } constructor() {} async detect() { return [] } }
  class BrokenDetector { static async getSupportedFormats() { return ['qr_code'] } constructor() {} async detect() { throw new Error('native broken') } }
  for (const BarcodeDetector of [EmptyDetector, BrokenDetector]) {
    const scan = harness({ BarcodeDetector }); scan.scan(); await flush(); await flush(); await scan.tick(200)
    assert.ok(scan.decoderCalls.length > 0, 'native miss or exception falls back to jsQR')
    assert.equal(scan.events.find(([type]) => type === 'ok')[1].result, 'device_id=test-bin&token=test')
  }
  class MultipleDetector { static async getSupportedFormats() { return ['qr_code'] } constructor() {} async detect() { return [
    { format: 'qr_code', rawValue: 'one' }, { format: 'qr_code', rawValue: 'two' }
  ] } }
  const multiple = harness({ BarcodeDetector: MultipleDetector }); multiple.scan(); await flush(); await flush()
  assert.equal(multiple.decoderCalls.length, 0, 'multiple native codes do not decode the first as a winner')
  assert.match(multiple.element('section/[role="status"]').textContent, /多个二维码/)
}
{
  let resolveDetect
  class SlowDetector { static async getSupportedFormats() { return ['qr_code'] } constructor() {} detect() { return new Promise(resolve => { resolveDetect = resolve }) } }
  const closed = harness({ BarcodeDetector: SlowDetector }); closed.scan(); await flush(); closed.close()
  resolveDetect([{ format: 'qr_code', rawValue: 'too-late' }]); await flush()
  assert.equal(closed.events.some(([type]) => type === 'ok'), false, 'close invalidates a pending native result')

  resolveDetect = null
  const zoomed = harness({ BarcodeDetector: SlowDetector }); zoomed.scan(); await flush()
  zoomed.element('section/[data-action="zoom-in"]').onclick(); await flush()
  resolveDetect([{ format: 'qr_code', rawValue: 'old-zoom' }]); await flush()
  assert.equal(zoomed.events.some(([type]) => type === 'ok'), false, 'zoom change invalidates a pending native frame')
  assert.equal(zoomed.decoderCalls.length, 0)
  zoomed.close()
}

const desktop = harness({ mobile: false }); desktop.scan()
assert.equal(desktop.cameraCalls, 0)
assert.equal(desktop.events[0][0], 'fail')

const camera = harness(); camera.scan(); camera.scan(); await flush()
assert.equal(camera.cameraCalls, 1, 'single flight')
assert.equal(camera.events.length, 0, 'one frame is not enough')
await camera.tick(200)
assert.equal(camera.events.filter(([type]) => type === 'ok').length, 1)
assert.equal(camera.events.filter(([type]) => type === 'complete').length, 1)
assert.deepEqual(camera.soundCalls, [['prime'], ['play', 'scanDetected']], 'accepted live decode plays one detection sound')
assert.deepEqual(camera.playedSounds, ['scanDetected'])
assert.equal(camera.stopped, 1)
assert.equal(camera.removed, true)
assert.equal(camera.document.body.style.overflow, 'auto')
assert.equal(camera.timers.size, 0)
assert.equal(camera.listeners.size, 0)

const mutedCamera = harness({ decodedText: 'muted-live-code', soundMuted: true })
mutedCamera.scan(); await flush(); await mutedCamera.tick(200)
assert.equal(mutedCamera.soundCalls.filter(([kind]) => kind === 'play').length, 1,
  'successful scan requests one sound through the shared preference-aware helper')
assert.deepEqual(mutedCamera.playedSounds, [], 'mock mute suppresses playback')

let resolveLate
const late = harness({ getUserMedia: () => new Promise(resolve => { resolveLate = resolve }) })
late.scan(); await flush(); late.close()
resolveLate({ getTracks: () => [{ stop() { late.events.push(['lateStop']) } }] })
await flush()
assert.equal(late.events.filter(([type]) => type === 'lateStop').length, 1)
assert.equal(late.events.some(([type]) => type === 'ok'), false)
assert.equal(late.soundCalls.some(([type]) => type === 'play'), false, 'cancelled scan does not play a detection sound')

const denied = harness({ getUserMedia: () => Promise.reject({ name: 'NotAllowedError' }) })
denied.scan(); await flush()
assert.match(denied.element('section/[role="status"]').textContent, /未获得相机权限/)
assert.equal(denied.events.length, 0, 'permission failure leaves manual / gallery choices available')
denied.element('section/[data-action="manual"]').onclick()
denied.element('section/form/input').value = 'test-bin'
denied.element('section/form').onsubmit({ preventDefault() {} })
assert.equal(denied.events[0][1].result, 'test-bin')

const insecure = harness({ secure: false }); insecure.scan(); await flush()
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
timeout.scan(); await flush(); await timeout.tick(15000)
assert.match(timeout.element('section/[role="status"]').textContent, /超时/)
timeout.close()
console.log('PASS mobile gate, stable decode/single-flight, cancellation/late stream, denied/manual, HTTPS, camera timeout and lifecycle cleanup')

// Capability controls must change the camera, and stale completions must not revive it.
const settings = { zoom: 1, torch: false }, constraints = []
const capable = harness({ track: {
  getCapabilities: () => ({ zoom: { min: 1, max: 3, step: 0.1 }, torch: true }),
  getSettings: () => ({ ...settings }), addEventListener() {},
  applyConstraints: async value => { constraints.push(value.advanced[0]); Object.assign(settings, value.advanced[0]) }
} })
capable.scan(); await flush()
assert.equal(capable.element('section/output').textContent, '自动 1.5×')
capable.element('section/[data-action="zoom-in"]').onclick(); await flush()
assert.equal(settings.zoom, 1.8)
assert.equal(capable.element('section/output').textContent, '手动 1.8×')
assert.equal(capable.element('section/video').style.transform, 'scale(1)', 'no double scaling with hardware zoom')
capable.element('section/[data-action="zoom-out"]').onclick(); await flush()
assert.equal(settings.zoom, 1.5)
assert.equal(capable.element('section/output').textContent, '手动 1.5×', 'manual minus also locks automatic zoom')
capable.element('section/output').onclick(); await flush()
assert.equal(settings.zoom, 1, 'clicking the zoom label returns the hardware camera to 1x')
assert.equal(capable.element('section/output').textContent, '自动 1×', '1x reset restores automatic mode')
capable.element('section/[data-action="zoom-in"]').onclick(); await flush()
assert.equal(capable.element('section/output').textContent, '手动 1.2×', 'manual plus locks automatic zoom')
capable.element('section/[data-action="torch"]').onclick(); await flush()
assert.equal(settings.torch, true)
assert.equal(capable.element('section/[data-label="torch"]').textContent, '关闭补光')
capable.element('section/[data-action="manual"]').onclick()
assert.equal(capable.element('section/[data-action="zoom-in"]').disabled, true)
assert.equal(capable.element('section/[data-action="torch"]').disabled, true)
capable.close()

const coarseSettings = { zoom: 1.5 }, coarseZooms = []
const coarse = harness({ track: {
  getCapabilities: () => ({ zoom: { min: 1.1, max: 3.2, step: 0.7 } }),
  getSettings: () => ({ ...coarseSettings }), addEventListener() {},
  applyConstraints: async value => { const zoom = value.advanced[0].zoom; coarseZooms.push(zoom); coarseSettings.zoom = zoom }
} })
coarse.scan(); await flush()
coarse.element('section/[data-action="zoom-in"]').onclick(); await flush()
assert.equal(coarseSettings.zoom, 1.8, 'manual steps align relative to a non-integer minimum')
coarse.element('section/[data-action="zoom-in"]').onclick(); await flush()
assert.equal(coarseSettings.zoom, 2.5, 'coarse hardware steps remain aligned')
coarse.element('section/[data-action="zoom-in"]').onclick(); await flush()
assert.ok(Math.abs(coarseSettings.zoom - 3.2) < 1e-9, 'manual zoom can reach the hardware maximum above 3x')
assert.deepEqual(coarseZooms.slice(1, 3), [1.8, 2.5])
assert.ok(Math.abs(coarseZooms[3] - 3.2) < 1e-9)
coarse.close()

const unavailable = harness(); unavailable.scan(); await flush()
assert.equal(unavailable.element('section/[data-action="zoom-in"]').disabled, false)
assert.equal(unavailable.element('section/[data-action="torch"]').disabled, true)
assert.equal(unavailable.element('section/video').style.transform, 'scale(1.5)')
assert.equal(unavailable.element('section/video').muted, true)
assert.equal(unavailable.element('section/video').hasAttribute('data-ui-sound-camera-preview'), true,
  'scanner preview is marked muted so audio guards do not block scan cues')
assert.ok(unavailable.element('section/video').srcObject, 'camera preview has a live stream attached')
assert.equal(unavailable.draws[0][3], 200)
unavailable.element('section/[data-action="zoom-in"]').onclick(); await flush()
assert.equal(unavailable.element('section/video').style.transform, 'scale(1.8)')
await unavailable.tick(200)
assert.ok(Math.abs(unavailable.draws.at(-1)[3] - 300 / 1.8) < 0.01, 'decode crops exactly the digital zoom shown')
unavailable.close()

const autoDigital = harness({ decodedText: '', detectQrCandidate: () => ({ x: 0.5, y: 0.5, size: 0.2 }) })
autoDigital.scan(); await flush()
await autoDigital.tick(200, 200)
await autoDigital.tick(200, 200)
await autoDigital.tick(200, 200)
await autoDigital.tick(200, 200)
assert.equal(autoDigital.element('section/output').textContent, '自动 2.7×',
  'two stable geometry observations after the startup delay trigger automatic digital zoom')
assert.equal(autoDigital.element('section/video').style.transform, 'scale(2.7)')
await autoDigital.tick(200, 200)
const autoFrameWidth = autoDigital.draws.findLast(args => args[0] === autoDigital.element('section/video')
  && Math.abs(args[3] - 300 / 2.7) < 0.1)?.[3]
assert.ok(autoFrameWidth, 'digital preview zoom must use the same crop for live decoding')
autoDigital.close()

const failedZoomCalls = [], failedZoomSettings = { zoom: 1 }
const failedAuto = harness({ decodedText: '', detectQrCandidate: () => ({ x: 0.5, y: 0.5, size: 0.2 }), track: {
  getCapabilities: () => ({ zoom: { min: 1, max: 3, step: 0.1 } }),
  getSettings: () => ({ ...failedZoomSettings }), addEventListener() {},
  applyConstraints: async value => {
    const zoom = value.advanced[0].zoom
    failedZoomCalls.push(zoom)
    if (zoom > 1.5) throw new Error('hardware zoom rejected')
    failedZoomSettings.zoom = zoom
  }
} })
failedAuto.scan(); await flush()
await failedAuto.tick(200, 200)
await failedAuto.tick(200, 200)
await failedAuto.tick(200, 200)
await failedAuto.tick(200, 200)
assert.equal(failedZoomCalls.length, 2, 'one automatic hardware zoom failure is attempted')
assert.equal(failedAuto.element('section/output').textContent, '手动 1.5×',
  'failed hardware auto zoom switches to the manual state')
await failedAuto.tick(200, 200)
await failedAuto.tick(200, 200)
assert.equal(failedZoomCalls.length, 2, 'hardware failure stops repeated automatic zoom attempts')
failedAuto.close()

const controlLate = harness({ track: {
  getCapabilities: () => ({ zoom: { min: 1, max: 3, step: 0.1 } }), getSettings: () => ({ zoom: 1.5 }),
  addEventListener() {}, applyConstraints: async () => {}
} })
controlLate.scan(); await flush()
controlLate.element('section/[data-action="zoom-in"]').onclick(); controlLate.close(); await flush()
assert.equal(controlLate.removed, true)
assert.equal(controlLate.element('section/[data-action="zoom-in"]').disabled, true)
console.log('PASS H5 camera capability controls: actual zoom/torch, unsupported and closed-stream guards')

assert.deepEqual(cameraFrame(1920, 1080, 320, 320, 2), { left: 690, top: 270, width: 540, height: 540 })
for (const [w, h, vw, vh] of [[1920, 1080, 390, 400], [1080, 1920, 568, 220], [640, 480, 320, 170]]) {
  for (const zoom of [1, 1.5, 3]) {
    const frame = cameraFrame(w, h, vw, vh, zoom)
    assert.ok(Math.abs(frame.width / frame.height - vw / vh) < 1e-8)
    assert.ok(Math.abs(frame.left + frame.width / 2 - w / 2) < 1e-8)
    assert.ok(Math.abs(frame.top + frame.height / 2 - h / 2) < 1e-8)
    assert.ok(frame.left >= 0 && frame.top >= 0 && frame.left + frame.width <= w && frame.top + frame.height <= h)
  }
}
console.log('PASS centered cover/digital crop: portrait, landscape, 1–3x and source bounds')

const flatRgba = { width: 3, height: 3, data: new Uint8ClampedArray(3 * 3 * 4) }
for (let i = 0; i < flatRgba.data.length; i += 4) {
  flatRgba.data[i] = 90; flatRgba.data[i + 1] = 120; flatRgba.data[i + 2] = 150; flatRgba.data[i + 3] = (i * 7) % 256
}
const flatRgbaBefore = new Uint8ClampedArray(flatRgba.data)
assert.equal(sharpenQrImage(flatRgba), flatRgba)
assert.deepEqual(flatRgba.data, flatRgbaBefore, 'flat RGB remains unchanged and alpha is preserved')
const edgeRgba = { width: 5, height: 5, data: new Uint8ClampedArray(5 * 5 * 4) }
for (let i = 0; i < edgeRgba.data.length; i += 4) {
  edgeRgba.data[i] = edgeRgba.data[i + 1] = edgeRgba.data[i + 2] = 100
  edgeRgba.data[i + 3] = (i * 11) % 256
}
const alphaBefore = Array.from({ length: 25 }, (_, p) => edgeRgba.data[p * 4 + 3])
const centerPixel = (2 * edgeRgba.width + 2) * 4
edgeRgba.data[centerPixel] = edgeRgba.data[centerPixel + 1] = edgeRgba.data[centerPixel + 2] = 180
const centerBefore = edgeRgba.data[centerPixel]
sharpenQrImage(edgeRgba)
assert.ok(edgeRgba.data[centerPixel] > centerBefore, 'sharpening enhances an isolated RGB edge')
assert.deepEqual(Array.from({ length: 25 }, (_, p) => edgeRgba.data[p * 4 + 3]), alphaBefore,
  'sharpening never changes per-pixel alpha')
console.log('PASS QR sharpening preserves flat images and alpha while enhancing edges')

const inspect = harness({ admin: true, decodedText: '<img src=x onerror=alert(1)>' })
inspect.scan(); await flush()
assert.equal(inspect.element('section/[data-debug-text]').textContent, '<img src=x onerror=alert(1)>')
assert.equal(inspect.element('section/[data-action="use-decoded"]').disabled, false,
  'administrator can manually accept the first valid decoder frame')
await inspect.tick(200)
assert.equal(inspect.events.length, 0, 'administrator reads results without leaving preview')
assert.equal(inspect.soundCalls.filter(([kind]) => kind === 'play').length, 1,
  'the first actual administrator decode plays one detection sound')
assert.equal(inspect.element('section/[data-action="use-decoded"]').disabled, false)
await inspect.element('section/[data-action="use-decoded"]').onclick()
assert.equal(inspect.events.filter(([type]) => type === 'ok').length, 1)
assert.equal(inspect.events[0][1].result, '<img src=x onerror=alert(1)>')
assert.deepEqual(inspect.soundCalls.filter(([kind]) => kind === 'play'), [['play', 'scanDetected']],
  'administrator acceptance does not replay the already-sounded result')

const firstFrame = harness({ admin: true, decodedText: 'first-frame-X' })
firstFrame.scan(); await flush()
assert.equal(firstFrame.element('section/[data-debug-text]').textContent, 'first-frame-X')
assert.equal(firstFrame.element('section/[data-action="use-decoded"]').disabled, false)
firstFrame.setDecodedText('')
await firstFrame.tick(200)
assert.equal(firstFrame.element('section/[data-debug-text]').textContent, 'first-frame-X',
  'moving away after the first decode retains its text')
assert.equal(firstFrame.element('section/[data-action="use-decoded"]').disabled, false)
await firstFrame.element('section/[data-action="use-decoded"]').onclick()
assert.equal(firstFrame.events.filter(([type]) => type === 'ok').length, 1,
  'the first-frame result can be accepted once after a blank frame')
assert.equal(firstFrame.events[0][1].result, 'first-frame-X')

// A transient miss or one-frame different decode must not erase the last stable admin result.
const retained = harness({ admin: true, decodedText: 'stable-X' })
retained.scan(); await flush(); await retained.tick(200)
assert.equal(retained.element('section/[data-debug-text]').textContent, 'stable-X')
assert.equal(retained.element('section/[data-action="use-decoded"]').disabled, false)
retained.setDecodedText('')
await retained.tick(200)
retained.setDecodedText('candidate-Y')
await retained.tick(200)
assert.equal(retained.element('section/[data-debug-text]').textContent, 'stable-X', 'one-frame Y must not replace stable X')
assert.equal(retained.element('section/[data-action="use-decoded"]').disabled, false, 'one-frame Y must leave X available')
retained.setDecodedText('')
await retained.tick(200)
assert.equal(retained.element('section/[data-debug-text]').textContent, 'stable-X', 'a later miss must retain stable X')
assert.equal(retained.soundCalls.filter(([kind]) => kind === 'play').length, 1,
  'transient or retained administrator text does not repeatedly sound')
await retained.element('section/[data-action="use-decoded"]').onclick()
assert.equal(retained.events.filter(([type]) => type === 'ok').length, 1, 'retained result accepts once after a gap')
assert.equal(retained.events[0][1].result, 'stable-X')
assert.equal(retained.soundCalls.filter(([kind]) => kind === 'play').length, 1,
  'accepting retained text does not repeat its detection sound')

// Two consecutive frames of a replacement are enough to promote the new result.
const replaced = harness({ admin: true, decodedText: 'stable-X' })
replaced.scan(); await flush(); await replaced.tick(200)
replaced.setDecodedText('candidate-Y')
await replaced.tick(200)
assert.equal(replaced.element('section/[data-debug-text]').textContent, 'stable-X')
assert.equal(replaced.element('section/[data-action="use-decoded"]').disabled, false)
await replaced.tick(200)
assert.equal(replaced.element('section/[data-debug-text]').textContent, 'candidate-Y')
assert.equal(replaced.element('section/[data-action="use-decoded"]').disabled, false)
replaced.close()

const revoked = harness({ admin: true }); revoked.scan(); await flush()
revoked.storage.token = 'other-account'
await revoked.tick(200)
assert.equal(revoked.element('section/.ftx-web-scanner-debug').hidden, true)
assert.equal(revoked.element('section/[data-debug-text]').textContent, '')
revoked.close()
const ordinary = harness(); ordinary.scan(); await flush()
assert.equal(ordinary.element('section').innerHTML.includes('data-debug-text'), false)
ordinary.close()
console.log('PASS administrator live literal text / explicit acceptance, ordinary hidden and account-switch cleanup')

// Optional bounded video upgrades must preserve camera scanning when rejected.
function upgradeTrack({ rejectUpgrade = false } = {}) {
  const settings = { width: 1280, height: 720 }
  const constraints = []
  return {
    constraints, settings,
    track: {
      getCapabilities: () => ({ width: { min: 640, max: 3840 }, height: { min: 480, max: 2160 } }),
      getSettings: () => ({ ...settings }), addEventListener() {},
      applyConstraints: async value => {
        constraints.push(value)
        if (rejectUpgrade && value.width) throw new Error('HD unavailable')
        if (value.width) { settings.width = value.width.ideal; settings.height = value.height.ideal }
      }
    }
  }
}
const hdSource = upgradeTrack()
const hd = harness({ track: hdSource.track, deviceMemory: 4, hardwareConcurrency: 4, decodedText: 'live-after-hd' })
hd.scan(); await flush()
assert.equal(hdSource.settings.width, 3840, 'HD-capable devices receive the bounded higher-resolution profile')
assert.equal(hdSource.settings.height, 2160)
assert.equal(hdSource.constraints[0].width.max, 3840)
await hd.tick(200)
assert.equal(hd.events[0][1].result, 'live-after-hd', 'live decode works after the optional HD upgrade')

const baseSource = upgradeTrack({ rejectUpgrade: true })
const base = harness({ track: baseSource.track, deviceMemory: 4, hardwareConcurrency: 4, decodedText: 'live-base' })
base.scan(); await flush()
await base.tick(200)
assert.equal(baseSource.settings.width, 1280, 'a rejected HD request keeps the original stream settings')
assert.equal(base.events[0][1].result, 'live-base', 'rejected upgrade leaves base-resolution scanning active')

let photoPrepareCalls = 0, photoTakeCalls = 0
const normal = harness({ decodedText: 'ordinary-live-qr', photoCapture: async () => {
  photoPrepareCalls++
  return { capture: async () => { photoTakeCalls++; return null } }
} })
normal.scan(); await flush(); await normal.tick(200)
assert.equal(photoPrepareCalls, 1, 'optional capture setup is attempted once per camera session')
assert.equal(photoTakeCalls, 0, 'a successful live QR decode does not capture a high-resolution still')
const noPhotoApi = harness({ decodedText: 'live-without-photo-api', photoCapture: async () => null })
noPhotoApi.scan(); await flush(); await noPhotoApi.tick(200)
assert.equal(noPhotoApi.events[0][1].result, 'live-without-photo-api', 'unsupported optional photo capture keeps live scanning available')

function candidateCamera({ photoCapture, detector = () => ({ x: 0.5, y: 0.5, size: 0.15 }) } = {}) {
  const cameraTrack = {
    getCapabilities: () => ({}), getSettings: () => ({ width: 1280, height: 720 }), addEventListener() {}
  }
  const scan = harness({ track: cameraTrack, decodedText: '', photoCapture, detectQrCandidate: detector })
  scan.scan()
  return scan
}
async function reachPhotoEligibility(scan) {
  await flush()
  scan.element('section/[data-action="zoom-in"]').onclick()
  await flush()
  for (let i = 0; i < 8 && scan.timers.size; i++) await scan.tick(200, 600)
}

let resolveCapture, inFlightCapture = 0
const waitingBitmap = { width: 800, height: 600, closed: 0, close() { this.closed++ } }
const waiting = candidateCamera({ photoCapture: async () => ({ capture: () => {
  inFlightCapture++
  return new Promise(resolve => { resolveCapture = resolve })
} }) })
await reachPhotoEligibility(waiting)
assert.equal(inFlightCapture, 1, 'stable QR geometry schedules one high-resolution capture')
assert.equal(waiting.timers.size, 0, 'video frames stay paused while a still capture is in flight')
waiting.close()
resolveCapture(waitingBitmap)
await flush()
assert.equal(waitingBitmap.closed, 1, 'a late bitmap after close is released')
assert.equal(waiting.events.some(([type]) => type === 'ok'), false, 'a late photo result after close is ignored')

let finishFirstCapture, cooldownCaptures = 0
const cooldownBitmap = { width: 800, height: 600, close() {} }
const cooldown = candidateCamera({ photoCapture: async () => ({ capture: () => {
  cooldownCaptures++
  return cooldownCaptures === 1 ? new Promise(resolve => { finishFirstCapture = resolve }) : Promise.resolve(null)
} }) })
await reachPhotoEligibility(cooldown)
assert.equal(cooldownCaptures, 1)
finishFirstCapture(cooldownBitmap)
await flush()
await cooldown.tick(200, 600)
assert.equal(cooldownCaptures, 1, 'photo gate enforces its cooldown after completion')
await cooldown.tick(200, 12000)
assert.equal(cooldownCaptures, 2, 'photo gate allows a later attempt after the cooldown')
cooldown.close()

for (const lifecycle of ['hidden', 'retry']) {
  let resolveLatePhoto
  const bitmap = { width: 800, height: 600, closed: 0, close() { this.closed++ } }
  const scan = candidateCamera({ photoCapture: async () => ({ capture: () => new Promise(resolve => { resolveLatePhoto = resolve }) }) })
  await reachPhotoEligibility(scan)
  assert.equal(typeof resolveLatePhoto, 'function', `${lifecycle}: capture started`)
  if (lifecycle === 'hidden') { scan.document.hidden = true; scan.listeners.get('visibilitychange')() }
  else scan.element('section/[data-action="retry"]').onclick()
  resolveLatePhoto(bitmap)
  await flush()
  assert.equal(bitmap.closed, 1, `${lifecycle}: late bitmap is released`)
  assert.equal(scan.events.some(([type]) => type === 'ok'), false, `${lifecycle}: late result is ignored`)
  scan.close()
}
console.log('PASS bounded HD fallback, optional still gating, QR singleflight and late-photo cleanup')

// Web scanning resolves only locally decoded payloads; it never uploads an image.
assert.doesNotMatch(source, /resolveWechatQrImage|prepareWechatQrImage|imageBase64/)
assert.match(source, /readRoundCode/)

// A detected circle code gets a calm, explicit guidance message while the local
// QR pipeline remains active; no round-code upload is attempted.
{
  const track = {
    getCapabilities: () => ({}), getSettings: () => ({ width: 1280, height: 720 }), addEventListener() {},
    applyConstraints: async () => {}
  }
  let roundChecks = 0
  const scan = harness({
    track, decodedText: '',
    detectRoundCodeCandidate: () => { roundChecks++; return { x: 0.5, y: 0.5, size: 0.3 } },
    imageDataFactory: ({ width, height }) => new Uint8ClampedArray(width * height * 4)
  })
  scan.scan(); await flush()
  for (let i = 0; i < 12 && !/请使用微信扫码/.test(scan.element('section/[role="status"]').textContent); i++) await scan.tick(200, 350)
  assert.ok(roundChecks > 0, 'circle-code geometry can be identified locally')
  assert.match(scan.element('section/[role="status"]').textContent, /请使用微信扫码/)
  assert.equal(scan.events.some(([type]) => type === 'ok'), false)
  scan.close()
}
console.log('PASS web circle-code guidance without server imports, requests, or image uploads')

// Album guidance must also explain the circle-code limitation when conservative
// geometry detection misses the rings; ordinary QR success still completes.
for (const kind of ['round', 'unknown', 'qr']) {
  const scan = harness({ decodedText: kind === 'qr' ? 'album-ordinary-code' : '',
    detectRoundCodeCandidate: () => kind === 'round' ? { x: 0.5, y: 0.5, size: 0.6 } : null })
  scan.scan(); await flush()
  const input = scan.element('section/input[type="file"]')
  input.files = [{ size: 1024 }]
  await input.handlers.change()
  if (kind === 'qr') assert.equal(scan.events.find(([type]) => type === 'ok')?.[1]?.result, 'album-ordinary-code')
  else {
    assert.match(scan.element('section/[role="status"]').textContent, /圆码.*微信扫码/)
    assert.equal(scan.events.some(([type]) => type === 'ok'), false)
    scan.close()
  }
}
console.log('PASS album circle-code limitation guidance, missed geometry and ordinary QR success')

// Camera and album use the local circle decoder and route its preview, never its opaque bytes.
for (const mode of ['camera', 'album', 'admin']) {
  let decoded = 0, resolved = 0, accepted = 0
  const scan = harness({ decodedText: '', admin: mode === 'admin',
    detectRoundCodeCandidate: () => ({ x: 0.5, y: 0.5, size: 0.5 }),
    roundDecode: async pixels => { decoded++; assert.ok(pixels.width <= 288); return { scanType: 'WX_CODE', rawBase64: 'opaque-test' } },
    roundPreview: async raw => { assert.equal(raw, 'opaque-test'); resolved++; return { text: 'registered-scene',
      accept: async () => { accepted++; return { scanType: 'WX_CODE', path: '/pages-nonTheme/scan?scene=' + 'a'.repeat(32) } } } }
  })
  scan.scan(); await flush()
  if (mode === 'album') {
    const input = scan.element('section/input[type="file"]'); input.files = [{ size: 1024 }]; await input.handlers.change()
  } else for (let i = 0; i < 4 && scan.timers.size; i++) await scan.tick(200, 400)
  assert.equal(decoded, 1); assert.equal(resolved, 1)
  if (mode === 'admin') {
    assert.equal(accepted, 0, 'administrator preview waits for explicit use')
    await scan.element('section/[data-action="use-decoded"]').onclick()
  }
  assert.equal(accepted, 1)
  const result = scan.events.find(([type]) => type === 'ok')?.[1]
  assert.equal(result.scanType, 'WX_CODE'); assert.ok(result.path.includes('scene='))
  assert.equal(result.result, undefined, 'opaque bytes never enter ordinary QR routing')
}
{
  let complete, resolved = 0
  const scan = harness({ decodedText: '', roundDecode: () => new Promise(resolve => { complete = resolve }),
    roundPreview: async () => { resolved++; return null } })
  scan.scan(); await flush()
  const input = scan.element('section/input[type="file"]'); input.files = [{ size: 1024 }]
  const pending = input.handlers.change(); await flush(); scan.close()
  complete({ scanType: 'WX_CODE', rawBase64: 'late' }); await pending
  assert.equal(resolved, 0, 'closed scanner never resolves a late Worker result')
}
console.log('PASS local camera/album circle decode, administrator acceptance and close guard')

{
  let complete, resolved = 0
  const scan = harness({ decodedText: '', roundDecode: () => new Promise(resolve => { complete = resolve }),
    roundPreview: async () => { resolved++; return null } })
  scan.scan(); await flush()
  const input = scan.element('section/input[type="file"]'); input.files = [{ size: 1024 }]
  const pending = input.handlers.change(); await flush()
  scan.storage.token = 'another-account'
  complete({ scanType: 'WX_CODE', rawBase64: 'late' }); await pending
  assert.equal(resolved, 0, 'account changed during local decoding: never resolve or authorize with a different account')
  scan.close()
}
console.log('PASS circle-code account identity guard during album decoding')

for (const choice of ['accept', 'cancel', 'close']) {
  let authorized = 0
  const scan = harness({ decodedText: '',
    roundDecode: async () => ({ scanType: 'WX_CODE', rawBase64: 'opaque-test' }),
    roundPreview: async () => ({ text: 'registered-login-scene', accept: async ({ confirm }) => {
      const accepted = await confirm('昵称<script>', 'r_' + 'a'.repeat(24))
      if (accepted) authorized++
      return { handled: true, errMsg: accepted ? 'scanCode:ok' : 'scanCode:cancel' }
    } }) })
  scan.scan(); await flush()
  const input = scan.element('section/input[type="file"]'); input.files = [{ size: 1024 }]
  const pending = input.handlers.change(); await flush()
  assert.match(scan.element('aside').innerHTML, /确认登录网页/)
  assert.equal(scan.removed, false, 'login confirmation is visible before the scanner closes')
  assert.ok(scan.element('aside/.ftx-web-scanner-confirm-copy').textContent.includes('昵称<script>'))
  assert.doesNotMatch(scan.element('aside').innerHTML, /昵称<script>/, 'account text is not interpolated into HTML')
  assert.equal(authorized, 0)
  if (choice === 'close') scan.close()
  else scan.element(`aside/[data-confirm="${choice}"]`).onclick()
  await pending
  assert.equal(authorized, choice === 'accept' ? 1 : 0)
  assert.equal(scan.events.some(([type]) => type === 'ok'), false, 'handled login must not navigate as a device QR')
}
console.log('PASS in-scanner login confirmation, explicit authorization/cancellation, safe account text and close cleanup')
