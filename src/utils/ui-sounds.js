import { baseUrl } from '@/api/settings.js'
import { createUiSoundController, UI_SOUNDS, UI_SOUND_STORAGE_KEY } from './ui-sound-core.mjs'

const currentPage = () => {
  try { const pages = getCurrentPages(); return pages[pages.length - 1]?.route || '' } catch (_) { return '' }
}
const visible = () => {
  if (['pages-nonTheme/chat', 'pages-nonTheme/voice-scan'].includes(currentPage())) return false
  // #ifdef H5
  if (document.hidden) return false
  // #endif
  return true
}
function soundUrl(sound) {
  // #ifdef APP-PLUS
  return `/static/app/sounds/${sound.file}`
  // #endif
  // #ifndef APP-PLUS
  return `${baseUrl}/audio/ui-sounds/${sound.file}`
  // #endif
}

// One AudioContext and six reusable decoded buffers on the web.
// #ifdef H5
function createWebDriver() {
  const Context = window.AudioContext || window.webkitAudioContext
  if (!Context) return null
  const context = new Context()
  const buffers = new Map()
  const requests = new Set()
  let source = null
  let disposed = false
  let lastWarm = -Infinity
  function load(sound) {
    if (!buffers.has(sound.file)) {
      const controller = new AbortController()
      requests.add(controller)
      const timeout = setTimeout(() => controller.abort(), 2500)
      const request = fetch(soundUrl(sound), { signal: controller.signal }).then(response => {
        if (!response.ok || /text\/html/i.test(response.headers.get('content-type') || '')) {
          throw new Error('UI sound resource unavailable: expected audio, received an error or HTML page')
        }
        return response.arrayBuffer()
      }).then(data => context.decodeAudioData(data)).catch(error => {
        buffers.delete(sound.file)
        throw error
      }).finally(() => { clearTimeout(timeout); requests.delete(controller) })
      buffers.set(sound.file, request)
    }
    return buffers.get(sound.file)
  }
  function stop() {
    const playing = source
    source = null
    try {
      if (playing) {
        const time = context.currentTime
        playing.gain.gain.cancelScheduledValues(time)
        playing.gain.gain.setValueAtTime(playing.gain.gain.value, time)
        playing.gain.gain.linearRampToValueAtTime(0, time + 0.008)
        playing.node.stop(time + 0.009)
      }
    } catch (_) { try { playing?.node.stop() } catch (_) {} }
  }
  return {
    warm() {
      if (disposed) return
      void context.resume().catch(() => {})
      if (Date.now() - lastWarm < 5000) return
      lastWarm = Date.now()
      for (const sound of Object.values(UI_SOUNDS)) void load(sound).catch(() => {})
    },
    async play(sound, { canStart, onEnded }) {
      // resume() is asynchronous even when called from a user gesture. Wait
      // for it as well as decoding, including when the buffer is already warm.
      const resume = context.state === 'running' ? Promise.resolve() : context.resume()
      const [buffer] = await Promise.all([load(sound), resume])
      if (disposed || context.state !== 'running' || !canStart()) return false
      const next = context.createBufferSource()
      const gain = context.createGain()
      gain.gain.value = sound.volume
      next.buffer = buffer
      next.connect(gain)
      gain.connect(context.destination)
      next.onended = () => {
        next.disconnect(); gain.disconnect()
        if (source?.node === next) source = null
        onEnded()
      }
      source = { node: next, gain }
      next.start()
      return true
    },
    stop,
    dispose() {
      disposed = true; stop()
      for (const request of requests) request.abort()
      buffers.clear()
      void context.close().catch(() => {})
    }
  }
}
// #endif

// Native contexts obey the iOS mute switch and never take over music playback.
// Late network loads are discarded instead of playing on a different screen.
// #ifndef H5
function createNativeDriver() {
  const entries = new Map()
  let pending = null
  function finish(entry) {
    if (pending?.entry !== entry) return
    const record = pending
    pending = null
    clearTimeout(record.timer)
    record.resolve(false)
    record.onEnded()
  }
  function start(entry) {
    if (pending?.entry !== entry || pending.started) return
    // APP prepares local audio when play() is called; waiting for canplay can
    // otherwise prevent playback from ever starting. Mini-programs preload.
    // #ifndef APP-PLUS
    if (!entry.ready) return
    // #endif
    if (!pending.canStart()) { finish(entry); return }
    pending.started = true
    try { entry.context.play() } catch (_) { finish(entry) }
  }
  function entryFor(sound) {
    if (entries.has(sound.file)) return entries.get(sound.file)
    const context = uni.createInnerAudioContext()
    const entry = { context, ready: false }
    entries.set(sound.file, entry)
    context.autoplay = false
    context.loop = false
    // APP exposes obeyMuteSwitch as getter-only. Its session category below
    // controls mute behavior; assigning this property throws in strict mode.
    // #ifndef APP-PLUS
    context.obeyMuteSwitch = true
    // #endif
    // #ifdef APP-PLUS
    context.sessionCategory = 'ambient'
    // #endif
    context.onCanplay(() => { entry.ready = true; start(entry) })
    context.onPlay(() => {
      if (pending?.entry !== entry || !pending.canStart()) { context.stop(); finish(entry); return }
      clearTimeout(pending.timer)
      pending.resolve(true)
      pending.timer = setTimeout(() => { context.stop(); finish(entry) }, sound.duration + 350)
    })
    context.onEnded(() => finish(entry))
    context.onError(() => {
      entry.ready = false; finish(entry)
      if (entries.get(sound.file) === entry) entries.delete(sound.file)
      try { context.destroy() } catch (_) {}
    })
    context.src = soundUrl(sound)
    return entry
  }
  function stop() {
    if (!pending) return
    const entry = pending.entry
    finish(entry)
    try { entry.context.stop() } catch (_) {}
  }
  return {
    warm() { for (const sound of Object.values(UI_SOUNDS)) { try { entryFor(sound) } catch (_) {} } },
    play(sound, options) {
      const entry = entryFor(sound)
      let volume = sound.volume
      // #ifdef APP-PLUS
      // Phone speakers need a stronger cue than the Web Audio mix.
      volume = Math.min(1, volume * 1.5)
      // #endif
      entry.context.volume = volume
      return new Promise(resolve => {
        pending = { entry, ...options, resolve, started: false }
        pending.timer = setTimeout(() => { stop() }, options.startTimeout || 650)
        start(entry)
      })
    },
    stop,
    dispose() { stop(); for (const entry of entries.values()) { try { entry.context.destroy() } catch (_) {} }; entries.clear() }
  }
}
// #endif

let driver = null
function getDriver() {
  if (driver) return driver
  // #ifdef H5
  driver = createWebDriver()
  // #endif
  // #ifndef H5
  driver = createNativeDriver()
  // #endif
  return driver
}
const controller = createUiSoundController({
  getStoredEnabled: () => uni.getStorageSync(UI_SOUND_STORAGE_KEY),
  storeEnabled: value => uni.setStorageSync(UI_SOUND_STORAGE_KEY, value),
  createDriver: getDriver,
  getPage: currentPage,
  getOwner: () => uni.getStorageSync('token') || '',
  isVisible: visible
})
export const areUiSoundsEnabled = () => controller.isEnabled()
export const setUiSoundsEnabled = value => controller.setEnabled(value)
export const setUiSoundsActive = value => controller.setActive(value)
export const setUiSoundBlocked = (reason, value) => controller.setBlocked(reason, value)
export const stopUiSounds = () => controller.stop()
export function playUiSound(event, options) {
  try { return controller.play(event, options) } catch (_) { return false }
}
export function primeUiSounds() {
  if (!areUiSoundsEnabled() || !visible()) return
  try { getDriver()?.warm() } catch (_) {}
}

let initialized = false
export function initUiSounds() {
  if (initialized) return
  initialized = true
  // Stop immediately on navigation; returning to a page never replays a cue.
  for (const method of ['navigateTo', 'redirectTo', 'reLaunch', 'switchTab', 'navigateBack']) {
    try { uni.addInterceptor(method, { invoke: stopUiSounds }) } catch (_) {}
  }
  // #ifdef H5
  const media = new Set()
  document.addEventListener('pointerdown', primeUiSounds, { capture: true, passive: true })
  document.addEventListener('touchend', primeUiSounds, { capture: true, passive: true })
  document.addEventListener('keydown', primeUiSounds, { capture: true, passive: true })
  document.addEventListener('visibilitychange', () => controller.setActive(!document.hidden))
  window.addEventListener('hashchange', () => { stopUiSounds(); releaseMedia({ target: null }) })
  document.addEventListener('play', event => {
    if (event.target instanceof HTMLMediaElement) { media.add(event.target); controller.setBlocked('media', true) }
  }, true)
  const releaseMedia = event => {
    media.delete(event.target)
    for (const element of media) if (!element.isConnected || element.paused || element.ended) media.delete(element)
    controller.setBlocked('media', media.size > 0)
  }
  document.addEventListener('pause', releaseMedia, true)
  document.addEventListener('ended', releaseMedia, true)
  // #endif
  // #ifndef H5
  primeUiSounds()
  // #endif
}
