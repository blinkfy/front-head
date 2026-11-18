import { asrAbortError, assertAsrCurrent } from './local-asr-core.mjs'

// Older start() implementations silently ignore an audio-track argument and use
// the microphone. Only enable the documented Chromium desktop track API.
export function supportsLocalAudioTrack(environment = globalThis) {
  const Speech = environment.SpeechRecognition
  const version = /(?:Chrome|Chromium)\/(\d+)/.exec(environment.navigator?.userAgent || '')
  return !!(Speech && 'processLocally' in Speech.prototype && typeof Speech.available === 'function' &&
    version && Number(version[1]) >= 139 && !/Android|Mobile|iPhone|iPad/i.test(environment.navigator?.userAgent || ''))
}

export async function webLocalAsrAvailable(environment = globalThis) {
  if (!supportsLocalAudioTrack(environment)) return false
  let timer
  try {
    const status = await Promise.race([
      environment.SpeechRecognition.available({ langs: ['zh-CN'], processLocally: true }),
      new Promise(resolve => { timer = setTimeout(() => resolve('unavailable'), 1200) })
    ])
    // Do not silently install a language pack or switch to browser-vendor cloud ASR.
    return status === 'available'
  } catch (_) { return false }
  finally { clearTimeout(timer) }
}

export function createWebLocalAsr({ track, environment = globalThis, onText = () => {}, onFailure = () => {},
  isCurrent = () => true, signal, finishTimeoutMs = 3500 } = {}) {
  const recognition = new environment.SpeechRecognition()
  recognition.processLocally = true
  recognition.lang = 'zh-CN'
  recognition.continuous = true
  recognition.interimResults = true
  let disposed = false, stopping = false, ended = false, failed = false, pendingText = false, timer, startTimer, resolveStart, resolveEnd
  const finals = new Map()
  const started = new Promise(resolve => { resolveStart = resolve })
  const result = new Promise(resolve => { resolveEnd = resolve })
  const current = () => {
    if (disposed) return false
    if (signal?.aborted || !isCurrent()) { session.dispose(); return false }
    return true
  }
  const fail = () => {
    if (failed || disposed) return
    failed = true; resolveStart(false); resolveEnd(null)
    session.dispose(); onFailure()
  }
  const abort = () => session.dispose()
  const session = {
    async start() {
      if (!current() || !track || track.kind !== 'audio' || track.readyState !== 'live') return false
      signal?.addEventListener('abort', abort, { once: true })
      recognition.onstart = () => { if (current()) { clearTimeout(startTimer); resolveStart(true) } }
      recognition.onresult = event => {
        if (!current()) return
        const pieces = []
        pendingText = false
        for (let index = 0; index < event.results.length; index++) {
          const item = event.results[index]
          const text = String(item?.[0]?.transcript || '')
          if (item.isFinal) finals.set(index, text)
          else if (text.trim()) pendingText = true
          pieces.push(text)
        }
        onText(pieces.join('').trim())
      }
      recognition.onerror = fail
      recognition.onend = () => {
        if (!current()) return
        ended = true
        if (!stopping) { fail(); return }
        clearTimeout(timer)
        const text = [...finals.values()].join('').trim()
        resolveEnd(text && !pendingText ? { text, local: true } : null)
      }
      startTimer = setTimeout(fail, 2000)
      try { recognition.start(track) } catch (_) { fail() }
      return started
    },
    stop() {
      if (disposed || failed) return Promise.resolve(null)
      if (!stopping) {
        stopping = true
        timer = setTimeout(fail, finishTimeoutMs)
        try { recognition.stop() } catch (_) { fail() }
      }
      return result
    },
    dispose() {
      if (disposed) return
      disposed = true; clearTimeout(timer); clearTimeout(startTimer)
      signal?.removeEventListener('abort', abort)
      recognition.onstart = recognition.onresult = recognition.onerror = recognition.onend = null
      if (!ended) { try { recognition.abort() } catch (_) {} }
      resolveStart(false); resolveEnd(null)
    }
  }
  return session
}

// Recognize existing audio without playing it through speakers or opening a mic.
export async function transcribeWebLocalFiles(files, options = {}) {
  const environment = options.environment || globalThis
  assertAsrCurrent(options)
  if (!await webLocalAsrAvailable(environment)) return null
  assertAsrCurrent(options)
  const AudioContext = environment.AudioContext || environment.webkitAudioContext
  if (!AudioContext) return null
  let context, destination, recognition, timer, watcher
  const sources = []
  const controller = new environment.AbortController()
  const abort = () => { controller.abort(); recognition?.dispose(); void context?.close().catch(() => {}) }
  const wait = promise => new Promise((resolve, reject) => {
    const cancelled = () => reject(asrAbortError())
    if (controller.signal.aborted) { cancelled(); return }
    controller.signal.addEventListener('abort', cancelled, { once: true })
    Promise.resolve(promise).then(resolve, reject).finally(() => controller.signal.removeEventListener('abort', cancelled))
  })
  options.signal?.addEventListener('abort', abort, { once: true })
  try {
    context = new AudioContext()
    // A bounded timeout covers fetch, decoding, playback and finalization.
    timer = setTimeout(abort, 70000)
    watcher = setInterval(() => { if (options.isCurrent?.() === false) abort() }, 250)
    const buffers = []
    for (const file of files) {
      assertAsrCurrent(options)
      let data
      if (typeof file?.arrayBuffer === 'function') data = await wait(file.arrayBuffer())
      else {
        const response = await wait(environment.fetch(file, { signal: controller.signal }))
        if (!response.ok) throw new Error('Cannot read local speech audio')
        data = await wait(response.arrayBuffer())
      }
      if (data.byteLength > 50 * 1024 * 1024) return null
      buffers.push(await wait(context.decodeAudioData(data)))
    }
    assertAsrCurrent(options)
    const duration = buffers.reduce((total, buffer) => total + buffer.duration, 0)
    if (!duration || duration > 61) return null
    destination = context.createMediaStreamDestination()
    recognition = createWebLocalAsr({ track: destination.stream.getAudioTracks()[0], environment,
      isCurrent: options.isCurrent, signal: controller.signal, onFailure: abort })
    const resumeTimer = setTimeout(abort, 2000)
    try { await wait(context.resume()) } finally { clearTimeout(resumeTimer) }
    assertAsrCurrent(options)
    if (!await recognition.start()) return null
    let startAt = context.currentTime + 0.05
    await new Promise(resolve => {
      for (const [index, buffer] of buffers.entries()) {
        const source = context.createBufferSource()
        source.buffer = buffer; source.connect(destination); sources.push(source)
        if (index === buffers.length - 1) source.onended = resolve
        source.start(startAt); startAt += buffer.duration
      }
      controller.signal.addEventListener('abort', resolve, { once: true })
    })
    assertAsrCurrent(options)
    if (controller.signal.aborted) return null
    return await recognition.stop()
  } catch (error) {
    assertAsrCurrent(options)
    if (error?.name === 'AbortError' && options.signal?.aborted) throw asrAbortError()
    return null
  } finally {
    clearTimeout(timer); clearInterval(watcher); options.signal?.removeEventListener('abort', abort)
    recognition?.dispose()
    for (const source of sources) { source.onended = null; try { source.stop() } catch (_) {}; source.disconnect() }
    destination?.stream.getTracks().forEach(track => track.stop())
    if (context && context.state !== 'closed') await context.close().catch(() => {})
  }
}
