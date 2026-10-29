import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initPreContext, preJs } from '@dcloudio/uni-cli-shared'
import { createUiSoundController, UI_SOUNDS } from '../src/utils/ui-sound-core.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const soundsSourcePath = path.join(root, 'src/utils/ui-sounds.js')
const soundsSource = readFileSync(soundsSourcePath, 'utf8')

function compilePlatform(platform) {
  initPreContext(platform)
  return preJs(soundsSource, soundsSourcePath)
}

function compiledFunction(source, name, nextMarker, args = []) {
  source = source.replace(/\r\n/g, '\n')
  const start = source.indexOf(`function ${name}(`)
  const end = source.indexOf(nextMarker, start)
  assert.ok(start >= 0 && end > start, `${name} should be present after conditional compilation`)
  return new Function(...args, `'use strict'\n${source.slice(start, end)}\nreturn ${name}`)
}

function harness(overrides = {}) {
  let time = 1000
  let page = 'pages/home/home'
  let owner = 'user-a'
  let visible = true
  let stored = overrides.stored
  const writes = []
  const calls = []
  const drivers = []
  const controller = createUiSoundController({
    getStoredEnabled: () => stored,
    storeEnabled: value => { writes.push(value); stored = value },
    createDriver: () => {
      const driver = {
        play(sound, options) {
          calls.push({ sound, ...options })
          if (overrides.play) return overrides.play(sound, options, calls.at(-1))
        },
        stop(options) { calls.push({ type: 'stop', options }) },
        dispose() { calls.push({ type: 'dispose' }) }
      }
      drivers.push(driver)
      return driver
    },
    now: () => time,
    getPage: () => page,
    getOwner: () => owner,
    isVisible: () => visible
  })
  return {
    controller, calls, writes, drivers,
    setTime: value => { time = value },
    setPage: value => { page = value },
    setOwner: value => { owner = value },
    setVisible: value => { visible = value }
  }
}

// Defaults and explicit persisted opt-outs.
for (const stored of [undefined, null, true, 'true']) {
  const h = harness({ stored })
  assert.equal(h.controller.isEnabled(), true, `stored ${String(stored)} should default on`)
  assert.equal(h.controller.play('confirm'), true)
}
for (const stored of [false, 'false', 0, '0']) {
  const h = harness({ stored })
  assert.equal(h.controller.isEnabled(), false, `stored ${String(stored)} should opt out`)
  assert.equal(h.controller.play('confirm'), false)
  assert.equal(h.drivers.length, 0, 'muted play must not create audio resources')
}

{
  const h = harness()
  assert.equal(h.controller.play('confirm'), true)
  assert.equal(h.calls.filter(call => call.sound).length, 1)
  h.controller.setEnabled(false)
  assert.deepEqual(h.writes, [false])
  assert.equal(h.calls.at(-1).type, 'stop')
  assert.equal(h.controller.play('challengeComplete'), false)
  h.controller.setEnabled(true)
  assert.deepEqual(h.writes, [false, true])
  assert.equal(h.controller.play('challengeComplete'), true)
  assert.equal(h.drivers.length, 1, 'driver should be created lazily and reused')
}

// Visibility, active state, media/voice blocking, and page guards invalidate pending starts.
for (const block of [h => h.setVisible(false), h => h.controller.setActive(false), h => h.controller.setBlocked('recording', true)]) {
  const h = harness()
  assert.equal(h.controller.play('confirm'), true)
  const request = h.calls.find(call => call.sound)
  block(h)
  assert.equal(request.canStart(), false)
}
{
  const h = harness()
  assert.equal(h.controller.play('confirm', { page: 'pages/shop/shop' }), false)
  assert.equal(h.controller.play('confirm', { page: ['pages/home/home'] }), true)
  const request = h.calls.find(call => call.sound)
  h.setPage('pages/shop/shop')
  assert.equal(request.canStart(), false, 'navigation must invalidate a delayed load')
}

// Duplicate keys include owner identity; equal/lower priority cannot overlap, higher priority can.
{
  const h = harness()
  assert.equal(h.controller.play('confirm', { key: 'same' }), true)
  assert.equal(h.controller.play('confirm', { key: 'same' }), false)
  h.calls.find(call => call.sound).onEnded()
  h.setOwner('user-b')
  h.setTime(1100)
  assert.equal(h.controller.play('confirm', { key: 'same' }), true, 'owner has an independent dedupe key')
}
{
  const h = harness()
  assert.equal(h.controller.play('recognitionFail'), true)
  assert.equal(h.controller.play('answerWrong'), false, 'equal priority must not layer')
  assert.equal(h.controller.play('achievementUnlock'), true, 'higher priority may replace current cue')
  assert.equal(h.calls.filter(call => call.sound).length, 2)
}

// The short global throttle blocks ordinary repeated taps, while completion unblocks a fresh cue.
{
  const h = harness()
  assert.equal(h.controller.play('confirm'), true)
  assert.equal(h.controller.play('confirm'), false)
  h.calls.find(call => call.sound).onEnded()
  assert.equal(h.controller.play('confirm'), false, '100ms throttle still applies after early completion')
  h.setTime(1100)
  assert.equal(h.controller.play('confirm'), true)
}

// Async loads may expire or become stale; rejected/throwing drivers stay silent to callers.
{
  const h = harness()
  h.controller.play('confirm')
  const request = h.calls.find(call => call.sound)
  h.setTime(1651)
  assert.equal(request.canStart(), false, 'late load must expire after 650ms')
  h.setTime(1700)
  h.controller.stop()
  assert.equal(request.canStart(), false, 'stop invalidates earlier asynchronous work')
}
{
  const h = harness({ play: () => Promise.reject(new Error('network failure')) })
  assert.doesNotThrow(() => assert.equal(h.controller.play('confirm'), true))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.controller.play('confirm'), false, 'failed load is absorbed and does not overlap')
}
{
  const h = harness({ play: () => { throw new Error('driver failure') } })
  assert.doesNotThrow(() => assert.equal(h.controller.play('confirm'), false))
}

// Event-specific start deadlines and guarded, silent failure callbacks.
{
  const h = harness()
  assert.equal(h.controller.play('preview'), true)
  assert.equal(h.calls.find(call => call.sound).startTimeout, 5000, 'preview gets time for its longer sequence')
  h.controller.stop()
  h.setTime(7000)
  assert.equal(h.controller.play('confirm'), true)
  assert.equal(h.calls.filter(call => call.sound).at(-1).startTimeout, 650, 'ordinary cues keep the short start deadline')
}
for (const play of [
  () => false,
  () => Promise.reject(new Error('load failed')),
  () => { throw new Error('driver threw') }
]) {
  const failures = []
  const h = harness({ play })
  const result = h.controller.play('confirm', { onFailure: error => failures.push(error.message) })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(failures.length, 1, 'false, rejection and throw report one current failure')
  assert.equal(h.controller.play('confirm'), false, 'failure callback does not reset the throttle')
  if (result === false) assert.equal(failures[0], 'driver threw')
}
for (const invalidate of [h => h.setVisible(false), h => h.setPage('pages/other/other'), h => h.controller.stop()]) {
  let failureCount = 0
  let reject
  const h = harness({ play: () => new Promise((_, fail) => { reject = fail }) })
  h.controller.play('confirm', { onFailure: () => failureCount++ })
  invalidate(h)
  reject(new Error('late load failure'))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(failureCount, 0, 'stale, hidden or off-page failures must not reach the UI')
}

// Dedupe history is bounded and lifecycle cleanup releases the lazy driver.
{
  const h = harness()
  for (let index = 0; index < 201; index++) {
    h.setTime(1000 + index * 100)
    h.controller.play('confirm', { key: `event-${index}` })
    h.calls.filter(call => call.sound).at(-1)?.onEnded()
  }
  h.setTime(1000 + 201 * 100)
  assert.equal(h.controller.play('confirm', { key: 'event-0' }), true, 'oldest dedupe key should be evicted')
  h.controller.dispose()
  assert.equal(h.calls.at(-1).type, 'dispose')
  assert.equal(h.controller.play('confirm'), false)
}

// Compile and exercise the actual native driver independently for APP and WeChat.
const appSource = compilePlatform('app-plus')
const mpSource = compilePlatform('mp-weixin')
const h5Source = compilePlatform('h5')
assert.match(appSource, /function createNativeDriver\(/, 'APP should include the native driver')
assert.match(mpSource, /function createNativeDriver\(/, 'WeChat should include the native driver')
assert.doesNotMatch(h5Source, /function createNativeDriver\(/, 'H5 should exclude the native driver')

const webDriverFactory = compiledFunction(h5Source, 'createWebDriver', '\nlet driver = null', [
  'UI_SOUNDS', 'soundUrl', 'window', 'fetch', 'AbortController', 'setTimeout', 'clearTimeout', 'Date'
])

function webHarness(fetchImpl) {
  let resumeResolve
  const oscillators = [], gains = []
  const context = {
    state: 'suspended', currentTime: 0, destination: {},
    resume() { return new Promise(resolve => { resumeResolve = () => { context.state = 'running'; resolve() } }) },
    decodeAudioData: async data => ({ data }),
    createBufferSource() {
      return { connect() {}, disconnect() {}, start() { context.started = (context.started || 0) + 1 }, stop() {} }
    },
    createOscillator() {
      const tone = {
        frequency: { events: [], setValueAtTime(value, time) { this.events.push([value, time]) } },
        connect() {}, disconnect() {}, start(time) { this.startTime = time; this.startCount = (this.startCount || 0) + 1 },
        stop(time) { this.stopTime = time; this.stopCount = (this.stopCount || 0) + 1 }
      }
      oscillators.push(tone)
      return tone
    },
    createGain() {
      const gain = { events: [], gain: {
        value: 1,
        cancelScheduledValues(time) { gain.events.push(['cancel', time]) },
        setValueAtTime(value, time) { gain.events.push(['set', value, time]) },
        linearRampToValueAtTime(value, time) { gain.events.push(['linear', value, time]) },
        exponentialRampToValueAtTime(value, time) { gain.events.push(['exponential', value, time]) }
      }, connect() {}, disconnect() {} }
      gains.push(gain)
      return gain
    },
    close: async () => {}
  }
  const win = { AudioContext: function AudioContext() { return context } }
  const driver = webDriverFactory(UI_SOUNDS, sound => sound.file, win, fetchImpl, class AbortController {
    constructor() { this.signal = {}; this.aborted = false }
    abort() { this.aborted = true }
  }, () => 1, () => {}, Date)()
  return { context, driver, oscillators, gains, resume: () => resumeResolve?.() }
}

const navStopStart = h5Source.indexOf('const stopOnNavigation =')
const navStopEnd = h5Source.indexOf('\nexport function playUiSound', navStopStart)
assert.ok(navStopStart >= 0 && navStopEnd > navStopStart, 'H5 navigation stop hook should be compiled')
const stopOnNavigationFactory = new Function('controller',
  `${h5Source.slice(navStopStart, navStopEnd)}\nreturn stopOnNavigation`)
const initUiSoundsStart = h5Source.indexOf('function initUiSounds()')
const initUiSoundsEnd = h5Source.lastIndexOf('\n}')
assert.ok(initUiSoundsStart >= 0 && initUiSoundsEnd > initUiSoundsStart, 'H5 init function should be compiled')
const initUiSoundsFactory = new Function('controller', 'document', 'window', 'uni', 'primeUiSounds',
  'stopOnNavigation', 'HTMLMediaElement', 'initialized',
  `${h5Source.slice(initUiSoundsStart, initUiSoundsEnd + 2)}\nreturn initUiSounds`)

function initSoundLifecycle(controller) {
  const interceptors = {}, listeners = new Map()
  const document = { hidden: false, addEventListener(name, callback) { listeners.set(name, callback) } }
  const window = { addEventListener() {} }
  const uni = { addInterceptor(name, value) { interceptors[name] = value } }
  class HTMLMediaElement {}
  const stopOnNavigation = stopOnNavigationFactory(controller)
  initUiSoundsFactory(controller, document, window, uni, () => {}, stopOnNavigation, HTMLMediaElement, false)()
  return { interceptors, listeners, HTMLMediaElement }
}

// The marked, muted camera preview does not block a cue; ordinary media still does.
{
  const blocked = []
  const controller = {
    stop() {}, setActive() {},
    setBlocked(reason, value) { blocked.push([reason, value]) }
  }
  const lifecycle = initSoundLifecycle(controller)
  const dispatchPlay = lifecycle.listeners.get('play')
  assert.equal(typeof dispatchPlay, 'function')
  const preview = new lifecycle.HTMLMediaElement()
  preview.muted = true; preview.srcObject = {}; preview.isConnected = true; preview.paused = false; preview.ended = false
  preview.hasAttribute = name => name === 'data-ui-sound-camera-preview'
  dispatchPlay({ target: preview })
  assert.deepEqual(blocked, [], 'marked muted camera preview must not set the media audio block')
  const ordinary = new lifecycle.HTMLMediaElement()
  ordinary.muted = true; ordinary.srcObject = {}; ordinary.isConnected = true; ordinary.paused = false; ordinary.ended = false
  ordinary.hasAttribute = () => false
  dispatchPlay({ target: ordinary })
  assert.deepEqual(blocked, [['media', true]], 'unmarked media retains the normal audio block')
}

// Scan detection uses a short generated tone: it starts synchronously in a live
// context and does not fetch the ordinary confirmation sound asset.
{
  let fetches = 0
  const h = webHarness(async () => { fetches++; throw new Error('scan cue must not fetch') })
  h.context.state = 'running'
  const tonePromise = h.driver.play({ ...UI_SOUNDS.confirm, id: 'confirm', scanCue: true }, {
    canStart: () => true, onEnded() {}
  })
  assert.equal(h.oscillators.length, 1, 'scan cue oscillator starts synchronously')
  assert.equal(h.oscillators[0].startCount, 1)
  assert.deepEqual(h.oscillators[0].frequency.events, [[1320, 0]])
  assert.ok(h.gains[0].events.some(event => event[0] === 'exponential' && event[2] === 0.12),
    'scan cue should use the short exponential decay envelope')
  assert.equal(await tonePromise, true)
  assert.equal(fetches, 0, 'scan cue must not request audio assets')
  assert.equal(h.oscillators[0].stopCount, 1, 'driver schedules the normal 130ms tone end')
  h.driver.stop({ preserveScanCue: true })
  assert.equal(h.oscillators[0].stopCount, 1, 'navigation stop preserves an already-started scan tail')
  h.driver.stop()
  assert.equal(h.oscillators[0].stopCount, 2, 'ordinary stop cuts the scan tone immediately')
}

// A scan cue requested while suspended is discarded if its session is stale
// by the time AudioContext resumes.
{
  let fetches = 0
  const h = webHarness(async () => { fetches++; throw new Error('scan cue must not fetch') })
  const stale = h.driver.play({ ...UI_SOUNDS.confirm, id: 'confirm', scanCue: true }, {
    canStart: () => false, onEnded() {}
  })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.oscillators.length, 0)
  h.resume()
  assert.equal(await stale, false)
  assert.equal(h.oscillators.length, 0, 'stale scan cue must not start after resume')
  assert.equal(fetches, 0)
}

// Core navigation stop options reach the driver; muting remains an unconditional stop.
{
  const h = harness()
  h.controller.play('scanDetected')
  const lifecycle = initSoundLifecycle(h.controller)
  lifecycle.interceptors.navigateTo.invoke()
  assert.deepEqual(h.calls.at(-1), { type: 'stop', options: { preserveScanCue: true } })
  h.controller.setEnabled(false)
  assert.deepEqual(h.calls.at(-1), { type: 'stop', options: undefined }, 'mute must use a non-preserving stop')
}

{
  let fetches = 0
  const web = webHarness(async () => { fetches++; throw new Error('scan cue must not fetch') })
  web.context.state = 'running'
  const controller = createUiSoundController({ createDriver: () => web.driver })
  assert.equal(controller.play('scanDetected'), true)
  const tone = web.oscillators[0]
  const lifecycle = initSoundLifecycle(controller)
  lifecycle.interceptors.navigateTo.invoke()
  assert.equal(tone.stopCount, 1, 'actual navigation hook preserves the cue tail')
  controller.setEnabled(false)
  assert.equal(tone.stopCount, 2, 'core mute stops the actual oscillator immediately')
  assert.equal(fetches, 0)
}

{
  const h = webHarness(async () => ({ ok: true, headers: { get: () => 'audio/mpeg' }, arrayBuffer: async () => new ArrayBuffer(4) }))
  const options = { canStart: () => true, onEnded() {} }
  h.context.state = 'running'
  assert.equal(await h.driver.play({ ...UI_SOUNDS.confirm, id: 'confirm' }, options), true, 'first play decodes and caches the buffer')
  h.context.state = 'suspended'
  const pending = h.driver.play({ ...UI_SOUNDS.confirm, id: 'confirm' }, options)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.context.started, 1, 'cached buffer must not play before the suspended context resumes')
  h.resume()
  assert.equal(await pending, true, 'cached or quickly decoded audio waits for suspended context resume')
  assert.equal(h.context.started, 2)
}
{
  let attempts = 0
  const h = webHarness(async () => {
    attempts++
    if (attempts === 1) return { ok: true, headers: { get: () => 'text/html; charset=utf-8' }, arrayBuffer: async () => new ArrayBuffer(0) }
    return { ok: true, headers: { get: () => 'audio/mpeg' }, arrayBuffer: async () => new ArrayBuffer(4) }
  })
  const options = { canStart: () => true, onEnded() {} }
  const failed = h.driver.play({ ...UI_SOUNDS.retry, id: 'retry' }, options)
  const rejection = assert.rejects(failed, /expected audio/)
  await new Promise(resolve => setImmediate(resolve))
  h.resume()
  await rejection
  h.context.state = 'running'
  const retry = h.driver.play({ ...UI_SOUNDS.retry, id: 'retry' }, options)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(attempts, 2, 'HTML response is rejected and removed from cache for retry')
  assert.equal(await retry, true)
}

const appSoundUrlFactory = compiledFunction(appSource, 'soundUrl', '\n\n// One AudioContext', ['baseUrl'])
const mpSoundUrlFactory = compiledFunction(mpSource, 'soundUrl', '\n\n// One AudioContext', ['baseUrl'])
assert.equal(appSoundUrlFactory('https://api.example')(UI_SOUNDS.confirm), '/static/app/sounds/01-confirm.mp3')
assert.equal(mpSoundUrlFactory('https://api.example')(UI_SOUNDS.confirm), 'https://api.example/audio/ui-sounds/01-confirm.mp3')
for (const sound of Object.values(UI_SOUNDS)) {
  assert.ok(existsSync(path.join(root, 'src/static/app/sounds', sound.file)), `APP sound asset should exist: ${sound.file}`)
}

function nativeHarness(source, platform) {
  const contexts = []
  const uni = {
    failNextPlay: false,
    createInnerAudioContext() {
      const context = {
        handlers: {},
        onCanplay(callback) { this.handlers.canplay = callback },
        onPlay(callback) { this.handlers.play = callback },
        onEnded(callback) { this.handlers.ended = callback },
        onError(callback) { this.handlers.error = callback },
        play() {
          this.playCount = (this.playCount || 0) + 1
          if (uni.failNextPlay) { uni.failNextPlay = false; this.handlers.error?.(); return }
          this.handlers.play?.()
        },
        stop() { this.stopCount = (this.stopCount || 0) + 1 },
        destroy() { this.destroyCount = (this.destroyCount || 0) + 1 }
      }
      if (platform === 'app-plus') {
        Object.defineProperty(context, 'obeyMuteSwitch', { configurable: true, get() { return true } })
      }
      contexts.push(context)
      return context
    }
  }
  const makeDriver = compiledFunction(source, 'createNativeDriver', '\nlet driver = null', ['uni', 'UI_SOUNDS', 'soundUrl'])
  return { driver: makeDriver(uni, UI_SOUNDS, sound => sound.file)(), contexts, uni }
}

{
  const { driver, contexts, uni } = nativeHarness(appSource, 'app-plus')
  let canStart = true
  let endedCount = 0
  const first = driver.play({ ...UI_SOUNDS.confirm, id: 'confirm' }, {
    canStart: () => canStart,
    onEnded: () => { endedCount++ }
  })
  assert.equal(await first, true, 'APP should resolve after synchronous onPlay without waiting for onCanplay')
  assert.equal(contexts[0].playCount, 1)
  assert.equal(contexts[0].volume, UI_SOUNDS.confirm.volume * 1.5, 'APP should apply its separate volume boost')
  assert.equal(contexts[0].obeyMuteSwitch, true, 'readonly APP mute switch property should remain untouched')
  assert.equal(contexts[0].sessionCategory, 'ambient')
  assert.equal(contexts[0].seekCount || 0, 0, 'APP playback should not seek before play')
  const invalid = driver.play({ ...UI_SOUNDS.glide, id: 'glide' }, { canStart: () => false, onEnded() {} })
  assert.equal(await invalid, false, 'an invalid APP request should be discarded before playback')
  assert.equal(contexts[1].playCount || 0, 0)
  const duplicate = driver.play({ ...UI_SOUNDS.confirm, id: 'confirm' }, { canStart: () => true, onEnded: () => { endedCount++ } })
  assert.equal(await duplicate, true, 'a cached APP context should play again')
  assert.equal(contexts.length, 2, 'APP native context should be cached by sound file')
  driver.stop()
  assert.equal(contexts[0].stopCount, 1, 'stop should stop active native playback')
  assert.equal(endedCount, 1, 'stop should complete the active request')
  uni.failNextPlay = true
  const failed = driver.play({ ...UI_SOUNDS.retry, id: 'retry' }, { canStart: () => true, onEnded() {} })
  assert.equal(await failed, false, 'APP load errors should resolve as silent failures')
  const retry = driver.play({ ...UI_SOUNDS.retry, id: 'retry' }, { canStart: () => true, onEnded() {} })
  assert.equal(await retry, true, 'APP failed native loads should permit a later retry')
  driver.dispose()
  assert.deepEqual(contexts.map(context => context.destroyCount), [1, 1, 1, 1])
}

{
  const { driver, contexts } = nativeHarness(mpSource, 'mp-weixin')
  let canStart = false
  let endedCount = 0
  const stale = driver.play({ ...UI_SOUNDS.confirm, id: 'confirm' }, {
    canStart: () => canStart,
    onEnded: () => { endedCount++ }
  })
  assert.equal(contexts[0].playCount || 0, 0, 'WeChat should wait for onCanplay')
  canStart = true
  contexts[0].handlers.canplay()
  assert.equal(await stale, true, 'a ready WeChat request should play')
  assert.equal(contexts[0].playCount, 1)
  assert.equal(contexts[0].obeyMuteSwitch, true, 'WeChat should retain its mute-switch setting')
  assert.equal(contexts[0].volume, UI_SOUNDS.confirm.volume, 'WeChat should keep the original volume')
  driver.stop()
  assert.equal(contexts[0].stopCount, 1)
  assert.equal(endedCount, 1)

  canStart = false
  const invalid = driver.play({ ...UI_SOUNDS.glide, id: 'glide' }, { canStart: () => canStart, onEnded() {} })
  contexts[1].handlers.canplay()
  assert.equal(await invalid, false, 'a WeChat request invalidated before readiness should be discarded')
  assert.equal(contexts[1].playCount || 0, 0)

  const failed = driver.play({ ...UI_SOUNDS.retry, id: 'retry' }, { canStart: () => true, onEnded() {} })
  contexts[2].handlers.error()
  assert.equal(await failed, false, 'WeChat load errors should resolve as silent failures')
  const retry = driver.play({ ...UI_SOUNDS.retry, id: 'retry' }, { canStart: () => true, onEnded() {} })
  contexts[3].handlers.canplay()
  assert.equal(await retry, true, 'failed WeChat loads should permit a later retry')
  let expiredEnded = 0
  const expired = driver.play({ ...UI_SOUNDS.reveal, id: 'reveal' }, { canStart: () => true, onEnded() { expiredEnded++ } })
  assert.equal(await expired, false, 'WeChat requests that miss the readiness timeout should expire')
  assert.equal(contexts[4].playCount || 0, 0)
  assert.equal(expiredEnded, 1)
  driver.dispose()
  assert.deepEqual(contexts.map(context => context.destroyCount), [1, 1, 1, 1, 1])
}

console.log('UI sound controller checks passed')
