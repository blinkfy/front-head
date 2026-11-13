import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { createWeixinIdentityDetector, weixinIdentityFaces, isWeixinIdentityNoFaceError } from '../src/utils/identity-weixin-detector.mjs'

const root = new URL('../', import.meta.url)
function conditional(source, target) {
  const stack = [true], result = []
  for (const line of source.split(/\r?\n/)) {
    const start = line.match(/(?:\/\/|<!--)\s*#(ifdef|ifndef)\s+(.+?)\s*$/)
    if (start) {
      const targets = start[2].split(/\s*\|\|\s*/).map(value => value.trim())
      stack.push(stack.at(-1) && (start[1] === 'ifdef' ? targets.includes(target) : !targets.includes(target)))
      continue
    }
    if (/(?:\/\/|<!--)\s*#endif/.test(line)) { stack.pop(); continue }
    if (stack.at(-1)) result.push(line)
  }
  assert.equal(stack.length, 1)
  return result.join('\n')
}

// Mimic the mini-program EventChannel behavior that iterates listeners and
// compacts its event list only after callbacks return. Synchronous off() inside
// a callback removes the list and makes the trailing .filter() throw.
class EventChannel {
  constructor(events = {}) {
    this.listeners = Object.create(null)
    this.emitDepth = 0
    this.onDuringEmit = false
    for (const [name, callback] of Object.entries(events)) this.on(name, callback)
  }
  on(name, callback) { (this.listeners[name] ||= []).push(callback) }
  off(name, callback) {
    if (this.emitDepth) this.onDuringEmit = true
    const listeners = this.listeners[name]
    if (!listeners) return
    this.listeners[name] = listeners.filter(listener => listener !== callback)
    if (!this.listeners[name].length) delete this.listeners[name]
  }
  emit(name, payload) {
    const queue = this.listeners[name]
    if (!queue) return
    this.emitDepth++
    try {
      for (const listener of queue) listener(payload)
      // Intentionally models the post-callback internal filter that crashed
      // when the event array had been synchronously removed by off().
      this.listeners[name] = this.listeners[name].filter(listener => !queue.includes(listener))
      if (!this.listeners[name].length) delete this.listeners[name]
    } finally { this.emitDepth-- }
  }
}

const unlinked = [], navigations = [], redirects = []
let detectorAcquires = 0, detectorReleases = 0, currentNavigation, backNavigations = 0, failNextBack = false, acquireBehavior = 'resolve'
let authorizeBehavior = 'resolve', pendingAuthorize, platform = 'devtools', frameCallback, faceResults = [], frameUpdates = [], faceDetectCalls = 0, landmarkResets = 0
const sdkWarnings = []
let nextLongTimer = 0
const longTimers = new Map()
function mockSetTimeout(callback, delay = 0, ...args) {
  if (delay === 0) return setTimeout(callback, delay, ...args)
  const id = `long-timer-${++nextLongTimer}`
  longTimers.set(id, { callback: () => callback(...args), delay })
  return id
}
function mockClearTimeout(id) {
  if (longTimers.delete(id)) return
  clearTimeout(id)
}
const uni = {
  authorize(options) {
    if (authorizeBehavior === 'pending') pendingAuthorize = options
    else if (authorizeBehavior === 'reject') options.fail({ errMsg: 'synthetic authorize denied' })
    else options.success()
  },
  getDeviceInfo() { return { platform } },
  navigateTo(options) { currentNavigation = { options }; navigations.push(currentNavigation) },
  navigateBack(options = {}) { backNavigations++; if (failNextBack) { failNextBack = false; options.fail?.() } },
  redirectTo(options) { redirects.push(options) },
  createCameraContext() { return { onCameraFrame(callback) { frameCallback = callback; return { start() {}, stop() {} } } } },
  getFileSystemManager() { return { unlink: options => { unlinked.push(options.filePath); options.fail?.() } } }
}
const context = vm.createContext({
  uni, wx: { faceDetect(options) { faceDetectCalls++; const result = faceResults.shift(); if (result?.fail) options.fail(result.fail); else options.success(result?.value); options.complete() } },
  setTimeout: mockSetTimeout, clearTimeout: mockClearTimeout, Promise, Date, console: { warn(...args) { sdkWarnings.push(args) } },
  weixinIdentityFaces, isWeixinIdentityNoFaceError,
  measureIdentityImageQuality: () => ({ valid: true }), identityImageQualityIssue: () => null,
  createIdentityNativeFlow: () => ({ update(input) { frameUpdates.push(input); return {} } }),
  createWeixinIdentityLandmarks: () => ({ reset() { landmarkResets++ }, update(points) { return Array.isArray(points) && points.length ? { calibrated: true, points: Array.from({ length: 106 }, () => ({ x: .5, y: .5 })) } : null } }),
  createIdentityBrightness: () => ({ start() {}, close() {} }),
  createWeixinIdentityDetector: () => ({
    acquire() { detectorAcquires++; return acquireBehavior === 'reject' ? Promise.reject(new Error('synthetic detector init failure')) : Promise.resolve(true) },
    release() { detectorReleases++ }
  })
})
const captureSource = conditional(readFileSync(new URL('src/utils/identity-capture.js', root), 'utf8'), 'MP-WEIXIN')
  .replace(/^import .*$/gm, '').replace(/^export /gm, '')
vm.runInContext(`${captureSource}\nglobalThis.captureApi = { captureIdentityPhoto, cancelIdentityCapture }`, context)

const componentScript = readFileSync(new URL('src/pages-nonTheme/identity-camera.vue', root), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1]
const pageSource = conditional(componentScript, 'MP-WEIXIN')
  .replace(/^import .*$/gm, '')
  .replace('export default {', 'globalThis.cameraComponent = {')
vm.runInContext(pageSource, context)
const pageComponent = context.cameraComponent
const pageFor = channel => ({ ...pageComponent.data(), ...pageComponent.methods, getOpenerEventChannel: () => channel })
const tick = () => new Promise(resolve => setTimeout(resolve, 10))

assert.equal(isWeixinIdentityNoFaceError({ errCode: 5, errMsg: 'faceDetect:fail face not detected or detection failed' }), true,
  'the SDK-reported code 5 is a transient per-frame no-face result')
assert.equal(isWeixinIdentityNoFaceError({ errCode: 12, errMsg: 'faceDetect:fail unknown error' }), false,
  'unrelated detector errors remain eligible for bounded capability failure')

// A stale pending init rejection must not poison the newer page that is waiting
// for the process-wide detector; the newer owner should retry initialization.
{
  const inits = [], stops = []
  const detector = createWeixinIdentityDetector({
    initFaceDetect(options) { inits.push(options) },
    stopFaceDetect(options) { stops.push(options); options.complete() }
  })
  const oldAcquire = detector.acquire('old-page')
  const newAcquire = detector.acquire('new-page')
  assert.equal(inits.length, 1, 'concurrent acquisition waits for the first process-wide init')
  inits[0].fail(new Error('synthetic first init failure'))
  await assert.rejects(oldAcquire, /synthetic first init failure/)
  await tick()
  assert.equal(inits.length, 2, 'the current owner retries after the stale init fails')
  inits[1].success()
  assert.equal(await newAcquire, true, 'the newer page receives the second successful init')
  detector.release('old-page')
  assert.equal(stops.length, 0, 'a stale release cannot stop the recovered owner')
  detector.release('new-page')
  await tick()
  assert.equal(stops.length, 1, 'the current owner stops the shared detector on release')
}

// A single page still receives its own init failure, and a subsequent acquire
// can initialize cleanly after that failed attempt has settled.
{
  const inits = []
  const detector = createWeixinIdentityDetector({ initFaceDetect(options) { inits.push(options) }, stopFaceDetect(options) { options.complete() } })
  const failed = detector.acquire('first')
  inits[0].fail(new Error('synthetic init failure'))
  await assert.rejects(failed, /synthetic init failure/)
  const retry = detector.acquire('second')
  inits[1].success()
  assert.equal(await retry, true)
}

// Caller + child page on the same EventChannel. Finish emits while the channel
// is iterating, but both sides defer off/navigation until that emit has ended.
{
  const photoPromise = context.captureApi.captureIdentityPhoto({ actions: ['blink', 'mouth'] })
  const record = currentNavigation
  const channel = new EventChannel(record.options.events)
  const page = pageFor(channel)
  pageComponent.onLoad.call(page, {})
  assert.equal(page.cameraVisible, false, 'camera waits for explicit camera authorization and detector initialization')
  await tick()
  assert.equal(detectorAcquires, 1, 'valid opener starts the detector')
  assert.equal(page.cameraVisible, true, 'camera becomes visible after authorization and detector initialization')
  record.options.success({ eventChannel: channel })

  page.finish({ path: '/synthetic/first.jpg' })
  assert.equal(channel.onDuringEmit, false, 'the current event listener array is not synchronously removed')
  assert.equal(backNavigations, 0, 'navigation waits for the active EventChannel emit to finish')
  const photo = await photoPromise
  assert.equal(photo.path, '/synthetic/first.jpg')
  await tick()
  assert.equal(backNavigations, 1, 'the child returns after emit dispatch has completed')
  assert.equal(detectorReleases, 1)
  assert.equal(channel.listeners.captured, undefined)
  assert.equal(channel.listeners.captureCancelled, undefined)
  assert.equal(channel.listeners.cancelCapture, undefined)
}

// A first detector initialization failure must settle the caller and a later
// page instance must be able to acquire successfully rather than inherit stale state.
{
  acquireBehavior = 'reject'; platform = 'devtools'
  const failed = context.captureApi.captureIdentityPhoto()
  const failedRecord = currentNavigation, failedChannel = new EventChannel(failedRecord.options.events)
  const failedPage = pageFor(failedChannel)
  pageComponent.onLoad.call(failedPage, {})
  failedRecord.options.success({ eventChannel: failedChannel })
  await assert.rejects(failed, /请在手机微信中完成人脸认证/)
  assert.equal(failedPage.closed, true)
  assert.equal(failedPage.cameraVisible, false)
  await tick()

  acquireBehavior = 'resolve'
  const recovered = context.captureApi.captureIdentityPhoto()
  const recoveredRecord = currentNavigation, recoveredChannel = new EventChannel(recoveredRecord.options.events)
  const recoveredPage = pageFor(recoveredChannel)
  pageComponent.onLoad.call(recoveredPage, {})
  recoveredRecord.options.success({ eventChannel: recoveredChannel })
  await tick()
  assert.equal(recoveredPage.closed, false, 'a fresh opener can recover after the first initialization failure')
  assert.equal(recoveredPage.cameraVisible, true)
  assert.equal(recoveredPage.detectorReady, true)
  recoveredPage.cancel()
  await assert.rejects(recovered, error => error.cancelled === true)
  await tick()
}

// Authorization is required before detector initialization or camera rendering;
// late permission completion after cancellation cannot start either one.
{
  authorizeBehavior = 'pending'; acquireBehavior = 'resolve'
  const waiting = context.captureApi.captureIdentityPhoto()
  const record = currentNavigation, channel = new EventChannel(record.options.events), page = pageFor(channel)
  const beforeAcquire = detectorAcquires
  pageComponent.onLoad.call(page, {})
  assert.equal(page.cameraVisible, false)
  assert.equal(detectorAcquires, beforeAcquire, 'detector waits for camera permission')
  record.options.success({ eventChannel: channel })
  page.cancel()
  await assert.rejects(waiting, error => error.cancelled === true)
  pendingAuthorize.success()
  await tick()
  assert.equal(detectorAcquires, beforeAcquire, 'late permission after cancellation does not initialize the detector')
  assert.equal(page.cameraVisible, false)
  authorizeBehavior = 'reject'; platform = 'android'
  const denied = context.captureApi.captureIdentityPhoto()
  const deniedRecord = currentNavigation, deniedChannel = new EventChannel(deniedRecord.options.events), deniedPage = pageFor(deniedChannel)
  const acquireAtDenied = detectorAcquires
  deniedPage.onLoad ? deniedPage.onLoad({}) : pageComponent.onLoad.call(deniedPage, {})
  deniedRecord.options.success({ eventChannel: deniedChannel })
  await assert.rejects(denied, /请允许微信访问相机后重新认证/)
  assert.equal(deniedPage.cameraVisible, false)
  assert.equal(detectorAcquires, acquireAtDenied, 'denied permission never starts detector or camera')
  await tick()
  authorizeBehavior = 'resolve'
}

// One transient detector frame failure and an explicit no-face result keep the
// session alive; a successful frame clears the failure streak, and multiple
// faces remain a blocking state instead of being reduced to a single face.
{
  platform = 'android'; authorizeBehavior = 'resolve'; acquireBehavior = 'resolve'
  const recordPromise = context.captureApi.captureIdentityPhoto()
  const record = currentNavigation, channel = new EventChannel(record.options.events), page = pageFor(channel)
  pageComponent.onLoad.call(page, {}); record.options.success({ eventChannel: channel }); await tick()
  page.viewport = { width: 100, height: 100 }
  page.cameraReady()
  const frame = { data: new Uint8Array(16).fill(120).buffer, width: 2, height: 2 }
  const callsBeforeWarmup = faceDetectCalls
  page.lastFrame = 0; page.detect({ ...frame, data: new Uint8Array(8).buffer })
  assert.equal(faceDetectCalls, callsBeforeWarmup, 'malformed camera warmup frames are rejected before the SDK')
  const detect = result => { faceResults.push(result); page.lastFrame = 0; page.detect(frame); assert.equal(page.closed, false) }
  detect({ fail: { errMsg: 'transient frame error' } })
  assert.equal(page.detectionFailures, 1)
  detect({ value: { faceInfo: [], x: -1, y: -1 } })
  assert.equal(page.detectionFailures, 0, 'valid no-face result resets the transient error streak')
  detect({ fail: { errMsg: 'transient frame error' } })
  detect({ value: { faceInfo: [{ pointArray: [] }, { pointArray: [] }] } })
  assert.equal(page.closed, false, 'multi-face result does not terminate the capture page')
  assert.equal(frameUpdates.at(-1).count, 2, 'multi-face result remains classified as multiple faces')
  page.cancel(); await assert.rejects(recordPromise, error => error.cancelled === true); await tick()
}

// A run of detector failures eventually reports unavailable, never a normal
// identity failure; unknown result schemas also fail closed after a bounded run.
{
  platform = 'devtools'; authorizeBehavior = 'resolve'; acquireBehavior = 'resolve'
  const recordPromise = context.captureApi.captureIdentityPhoto()
  const record = currentNavigation, channel = new EventChannel(record.options.events), page = pageFor(channel)
  pageComponent.onLoad.call(page, {}); record.options.success({ eventChannel: channel }); await tick()
  page.viewport = { width: 100, height: 100 }; page.cameraReady()
  const frame = { data: new Uint8Array(16).fill(120).buffer, width: 2, height: 2 }
  for (let i = 0; i < 11; i++) { faceResults.push({ fail: { errMsg: 'synthetic transient' } }); page.lastFrame = 0; page.detect(frame) }
  assert.equal(page.closed, false, 'single-frame errors do not end the session')
  faceResults.push({ fail: { errMsg: 'faceDetect:fail unknown error' } }); page.lastFrame = 0; page.detect(frame)
  await assert.rejects(recordPromise, error => error.unavailable === true && /请在手机微信中完成人脸认证/.test(error.message))
  assert.equal(page.closed, true)
  assert.equal(page.cameraVisible, false)

  const schemaPromise = context.captureApi.captureIdentityPhoto()
  const schemaRecord = currentNavigation, schemaChannel = new EventChannel(schemaRecord.options.events), schemaPage = pageFor(schemaChannel)
  pageComponent.onLoad.call(schemaPage, {}); schemaRecord.options.success({ eventChannel: schemaChannel }); await tick()
  schemaPage.viewport = { width: 100, height: 100 }; schemaPage.cameraReady()
  for (let i = 0; i < 24; i++) { faceResults.push({ value: { unexpected: true } }); schemaPage.lastFrame = 0; schemaPage.detect(frame) }
  assert.equal(schemaPage.closed, false, 'unknown face schema receives a bounded grace period')
  faceResults.push({ value: { unexpected: true } }); schemaPage.lastFrame = 0; schemaPage.detect(frame)
  await assert.rejects(schemaPromise, error => error.unavailable === true)
  assert.equal(schemaPage.closed, true)
  await tick()

  const layoutPromise = context.captureApi.captureIdentityPhoto()
  const layoutRecord = currentNavigation, layoutChannel = new EventChannel(layoutRecord.options.events), layoutPage = pageFor(layoutChannel)
  pageComponent.onLoad.call(layoutPage, {}); layoutRecord.options.success({ eventChannel: layoutChannel }); await tick()
  layoutPage.viewport = { width: 100, height: 100 }; layoutPage.cameraReady()
  for (let i = 0; i < 25; i++) { faceResults.push({ value: { faceInfo: [{ pointArray: [] }], x: 0, y: 0 } }); layoutPage.lastFrame = 0; layoutPage.detect(frame) }
  await assert.rejects(layoutPromise, error => error.unavailable === true)
  assert.equal(layoutPage.closed, true, 'persistent missing landmarks are reported as unavailable')
  await tick()
}

// No-face code 5 may repeat without closing the session. A recovered valid
// face resets transient state, and unrelated fatal errors still hit their bound.
{
  platform = 'devtools'; authorizeBehavior = 'resolve'; acquireBehavior = 'resolve'
  const capture = context.captureApi.captureIdentityPhoto()
  const record = currentNavigation, channel = new EventChannel(record.options.events), page = pageFor(channel)
  pageComponent.onLoad.call(page, {}); record.options.success({ eventChannel: channel }); await tick()
  page.viewport = { width: 100, height: 100 }; page.cameraReady()
  const frame = { data: new Uint8Array(16).fill(120).buffer, width: 2, height: 2 }
  const resetsBeforeNoFace = landmarkResets
  for (let i = 0; i < 20; i++) { faceResults.push({ fail: { errCode: 5, errMsg: 'faceDetect:fail face not detected or detection failed' } }); page.lastFrame = 0; page.detect(frame) }
  assert.equal(page.closed, false, 'more than twelve code-5 no-face frames do not close the capture')
  assert.equal(page.detectionFailures || 0, 0, 'no-face frames never accumulate fatal detection failures')
  assert.equal(landmarkResets, resetsBeforeNoFace, 'brief no-face frames preserve the neutral landmark baseline')
  page.noFaceSince = Date.now() - 1600
  faceResults.push({ fail: { errCode: 5, errMsg: 'faceDetect:fail face not detected or detection failed' } }); page.lastFrame = 0; page.detect(frame)
  assert.equal(landmarkResets, resetsBeforeNoFace + 1, 'a sustained no-face gap resets landmark calibration after its grace period')
  faceResults.push({ value: { faceInfo: [{ pointArray: Array(106).fill({ x: .5, y: .5 }) }, { pointArray: [] }] } }); page.lastFrame = 0; page.detect(frame)
  assert.equal(landmarkResets, resetsBeforeNoFace + 2, 'multiple faces reset calibration immediately')
  faceResults.push({ value: { faceInfo: [{ pointArray: Array(106).fill({ x: .5, y: .5 }) }] } }); page.lastFrame = 0; page.detect(frame)
  assert.equal(page.closed, false, 'a valid face recovers the session after no-face frames')
  assert.equal(page.detectionFailures, 0, 'valid face recovery clears detector failure state')
  for (let i = 0; i < 11; i++) { faceResults.push({ fail: { errCode: 12, errMsg: 'synthetic fatal' } }); page.lastFrame = 0; page.detect(frame) }
  assert.equal(page.closed, false, 'recovered session starts a fresh fatal-error streak')
  faceResults.push({ fail: { errCode: 5, errMsg: 'faceDetect:fail face not detected or detection failed' } }); page.lastFrame = 0; page.detect(frame)
  for (let i = 0; i < 11; i++) { faceResults.push({ fail: { errCode: 12, errMsg: 'synthetic fatal' } }); page.lastFrame = 0; page.detect(frame) }
  assert.equal(page.closed, false, 'a no-face miss between fatal errors resets the fatal streak')
  faceResults.push({ value: { faceInfo: [{ pointArray: Array(106).fill({ x: .5, y: .5 }) }] } }); page.lastFrame = 0; page.detect(frame)
  assert.equal(page.detectionFailures, 0, 'a valid face clears the fatal streak after mixed failures')
  for (let i = 0; i < 11; i++) { faceResults.push({ fail: { errCode: 12, errMsg: 'synthetic fatal' } }); page.lastFrame = 0; page.detect(frame) }
  assert.equal(page.closed, false, 'fatal errors after successful recovery are bounded from zero')
  faceResults.push({ fail: { errCode: 12, errMsg: 'synthetic fatal' } }); page.lastFrame = 0; page.detect(frame)
  await assert.rejects(capture, error => error.unavailable === true)
  assert.equal(page.closed, true, 'a genuinely repeated fatal error still fails in a bounded way')
  await tick()
}

// Calling the page directly after refresh has no opener. It must not register
// listeners, acquire the detector, or expose a camera before exiting safely.
{
  const acquireBefore = detectorAcquires, releasesBefore = detectorReleases
  const backBefore = backNavigations, redirectBefore = redirects.length
  failNextBack = true
  const page = pageFor({ on() { throw new Error('must not register a partial channel') } })
  page.getOpenerEventChannel = () => ({ on() { throw new Error('must not register a partial channel') } })
  pageComponent.onLoad.call(page, {})
  assert.equal(page.closed, true)
  assert.equal(page.cameraVisible, false)
  assert.equal(page.channel, null)
  assert.equal(detectorAcquires, acquireBefore, 'direct refresh never initializes face detection')
  await tick()
  assert.equal(backNavigations, backBefore + 1, 'invalid opener leaves the camera page')
  assert.equal(redirects.length, redirectBefore + 1, 'failed back navigation returns to the verification page')
  assert.equal(detectorReleases, releasesBefore + 1)
}

// Cancellation can precede navigateTo.success. A late success still signals
// the child to cancel; a late old callback deletes its temp image without
// clearing or resolving the next active session.
{
  const first = context.captureApi.captureIdentityPhoto()
  const staleRecord = currentNavigation
  context.captureApi.cancelIdentityCapture()
  await assert.rejects(first, error => error.cancelled === true)

  const staleChannel = new EventChannel(staleRecord.options.events)
  let cancelSignals = 0
  staleChannel.on('cancelCapture', () => { cancelSignals++ })
  staleRecord.options.success({ eventChannel: staleChannel })
  assert.equal(cancelSignals, 1, 'late navigate success receives the pending cancellation signal')
  staleRecord.options.events.captured({ path: '/synthetic/stale.jpg' })
  assert.ok(unlinked.includes('/synthetic/stale.jpg'), 'a late photo from a closed session is discarded')

  const second = context.captureApi.captureIdentityPhoto()
  const currentRecord = currentNavigation
  assert.notEqual(currentRecord, staleRecord)
  staleRecord.options.events.captured({ path: '/synthetic/stale-again.jpg' })
  assert.ok(unlinked.includes('/synthetic/stale-again.jpg'))
  await assert.rejects(context.captureApi.captureIdentityPhoto(), /正在认证/, 'stale callbacks do not clear the new active session')
  currentRecord.options.events.captured({ path: '/synthetic/current.jpg' })
  assert.equal((await second).path, '/synthetic/current.jpg')
  await tick()
  assert.ok(unlinked.includes('/synthetic/stale.jpg') && unlinked.includes('/synthetic/stale-again.jpg'))
}

// If the opener channel never completes, caller timeout settles the promise,
// signals the child when possible, and releases the singleton for a new session.
{
  const timed = context.captureApi.captureIdentityPhoto()
  const timedRecord = currentNavigation
  const channel = new EventChannel(timedRecord.options.events)
  let cancelSignals = 0
  channel.on('cancelCapture', () => { cancelSignals++ })
  timedRecord.options.success({ eventChannel: channel })
  const [timerId, timer] = [...longTimers.entries()].find(([, item]) => item.delay === 120000) || []
  assert.ok(timerId, 'a caller timeout is registered for the active capture')
  timer.callback()
  await assert.rejects(timed, /认证超时，请重新开始/)
  assert.equal(cancelSignals, 1, 'timeout sends a best-effort cancel to the child page')
  assert.equal(longTimers.has(timerId), false, 'settling clears the active caller timeout')
  await tick()

  const next = context.captureApi.captureIdentityPhoto()
  const nextRecord = currentNavigation
  assert.notEqual(nextRecord, timedRecord, 'timeout releases the single-flight slot for re-entry')
  const nextTimer = [...longTimers.entries()].find(([, item]) => item.delay === 120000)
  assert.ok(nextTimer)
  nextRecord.options.events.captured({ path: '/synthetic/after-timeout.jpg' })
  assert.equal((await next).path, '/synthetic/after-timeout.jpg')
  assert.equal(longTimers.has(nextTimer[0]), false, 'successful re-entry clears its own timeout')
}

// The page watchdog reports only a bounded stage and reason code, with no
// frame, point, photo, or form payload in diagnostics.
{
  platform = 'android'; authorizeBehavior = 'resolve'; acquireBehavior = 'resolve'
  const timed = context.captureApi.captureIdentityPhoto()
  const record = currentNavigation, channel = new EventChannel(record.options.events), page = pageFor(channel)
  pageComponent.onLoad.call(page, {}); record.options.success({ eventChannel: channel }); await tick()
  page.landmarks = { getIssue: () => 'face-alignment', reset() {} }
  const pageTimer = [...longTimers.entries()].find(([, item]) => item.delay === 90000)
  assert.ok(pageTimer, 'native page timeout is registered')
  pageTimer[1].callback()
  await assert.rejects(timed, /认证超时，请重新开始/)
  const warning = sdkWarnings.findLast(args => args[1]?.stage === 'capture-timeout')
  assert.ok(warning, 'watchdog logs the timeout stage')
  assert.equal(warning[1].errMsg, 'face-alignment', 'watchdog includes only the helper reason code')
  assert.doesNotMatch(JSON.stringify(warning), /pointArray|frameBuffer|photo|name|number/i, 'watchdog diagnostics contain no capture payload')
  assert.equal(longTimers.has(pageTimer[0]), false, 'settling clears the page timeout')
  await tick()
}

// Missing emit is treated like a broken opener, covering the native return
// path that previously failed while navigating back.
{
  const routeCount = navigations.length
  const page = pageFor({ on() {} })
  pageComponent.onLoad.call(page, {})
  assert.equal(page.closed, true)
  assert.equal(page.cameraVisible, false)
  await tick()
  assert.equal(navigations.length, routeCount, 'a broken child channel does not open another capture page')
}

// If unload wins the race with deferred navigation, the page must not pop a
// second route after its owner has already removed it.
{
  const channel = new EventChannel()
  const page = pageFor(channel)
  page.closed = false; page.unloaded = false
  pageComponent.methods.finish.call(page, null, 'cancelled')
  pageComponent.onUnload.call(page)
  const backBefore = backNavigations
  await tick()
  assert.equal(backNavigations, backBefore, 'unload suppresses the queued navigateBack')
}

assert.equal(longTimers.size, 0, 'all caller/page watchdog timers are cleared at the end of each scenario')
console.log('Mini EventChannel checks passed: deferred cleanup/navigation, missing opener, cancel races, stale-session photo cleanup, and unload guard.')
