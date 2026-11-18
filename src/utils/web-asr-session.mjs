import { createWebAsrCapture, encodePcmWav } from './web-asr-audio.mjs'
import { createWebLocalAsr, webLocalAsrAvailable } from './web-local-asr.mjs'

// One recording owns the local recognizer, optional cloud socket and WAV backup.
// A local failure replays the full audio; interim text never substitutes for a lost tail.
export function createWebAsrSession({ url, onText = () => {}, onState = () => {}, onLimit = () => {},
  isCurrent = () => true, transcribe, environment = globalThis, createCapture = createWebAsrCapture,
  localAvailable = webLocalAsrAvailable, createLocal = createWebLocalAsr,
  maxDurationMs = 60000, readyTimeoutMs = 12000, finishTimeoutMs = 10000 }) {
  let socket, capture, starting, stopping, stopped = false, disposed = false, failed = false, ready = false, done = false
  let text = '', finishSent = false, queueBytes = 0, recordedBytes = 0, resolveResult
  let local, localMode = false, cloudStarted = false
  const chunks = [], queue = [], timers = new Set()
  const current = () => {
    if (disposed) return false
    if (!isCurrent()) { session.dispose(); return false }
    return true
  }
  const limit = () => { if (current()) onLimit() }
  const later = (fn, delay) => { const timer = setTimeout(fn, delay); timers.add(timer); return timer }
  const result = new Promise(resolve => { resolveResult = resolve })
  function closeSocket() {
    if (!socket) return
    socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null
    try { socket.close() } catch (_) {}
    socket = null; queue.length = 0; queueBytes = 0
  }
  function fail() {
    if (failed || done || disposed) return
    failed = true; closeSocket(); resolveResult(null)
    if (current()) onState(stopped ? 'processing' : 'recording')
  }
  function send(data) {
    if (!socket || socket.readyState !== 1 || socket.bufferedAmount > 512 * 1024) { fail(); return false }
    try { socket.send(data); return true } catch (_) { fail(); return false }
  }
  function finish() {
    if (!stopped || !ready || failed || finishSent) return
    while (queue.length && !failed) send(queue.shift())
    queueBytes = 0
    if (!failed) {
      finishSent = true
      send(JSON.stringify({ type: 'finish' }))
      later(fail, finishTimeoutMs)
    }
  }
  function frame(buffer) {
    if (!current() || done) return
    recordedBytes += buffer.byteLength
    if (recordedBytes > 16000 * 2 * maxDurationMs / 1000) { limit(); return }
    chunks.push(buffer)
    if (failed || localMode) return
    if (ready) send(buffer)
    else {
      queue.push(buffer); queueBytes += buffer.byteLength
      if (queueBytes > 512 * 1024) fail()
    }
  }
  function startCloud() {
    if (cloudStarted || !current()) return
    cloudStarted = true; localMode = false
    local?.dispose(); local = null
    // Replay the complete utterance when local recognition fails midway.
    queue.length = 0; queue.push(...chunks)
    queueBytes = recordedBytes
    if (queueBytes > 512 * 1024) { fail(); return }
    try {
      socket = new environment.WebSocket(url)
      socket.binaryType = 'arraybuffer'
      later(() => { if (!ready) fail() }, readyTimeoutMs)
      socket.onmessage = event => {
        if (!current()) { session.dispose(); return }
        let payload
        try { payload = JSON.parse(event.data) } catch (_) { return }
        if (payload.type === 'ready') {
          ready = true
          while (queue.length && !failed) send(queue.shift())
          queueBytes = 0
          if (!stopped && !failed) onState('realtime')
          finish()
        } else if (payload.type === 'partial' || payload.type === 'final') {
          text = String(payload.fullText ?? payload.text ?? '')
          onText(text)
        } else if (payload.type === 'done') {
          if (!finishSent) { fail(); return }
          done = true; text = String(payload.text || '').trim()
          onText(text); resolveResult({ text, usage: payload.usage || null })
          closeSocket()
        } else if (payload.type === 'error' || payload.type === 'closed') fail()
      }
      socket.onerror = fail
      socket.onclose = () => { if (!done) fail() }
    } catch (_) { fail() }
  }
  const session = {
    start() {
      if (starting) return starting
      starting = (async () => {
        const canLocal = await localAvailable(environment).catch(() => false)
        if (!current() || stopped) return false
        localMode = canLocal
        capture = createCapture({ onFrame: frame, onEnded: limit, environment })
        if (!await capture.start() || !current() || stopped) { capture.dispose(); return false }
        onState('recording')
        later(limit, maxDurationMs)
        if (canLocal && capture.getAudioTrack?.()) {
          try {
            local = createLocal({ track: capture.getAudioTrack(), environment, isCurrent: current, onText,
              onFailure: () => { if (current() && !stopped) startCloud() } })
            if (await local.start() && localMode && current()) { onState('realtime'); return true }
          } catch (_) { local?.dispose() }
        }
        startCloud()
        return true
      })()
      return starting
    },
    stop() {
      if (stopping) return stopping
      stopped = true
      stopping = (async () => {
        await starting
        if (!current()) { session.dispose(); return null }
        // Stop recognition before ending its input track, then flush the backup.
        let localResult = null
        if (localMode && local) {
          try { localResult = Promise.resolve(local.stop()).catch(() => null) }
          catch (_) { localResult = Promise.resolve(null) }
        }
        await capture?.stop()
        if (!current()) return null
        // Keep the ready timeout while waiting for a delayed task-started event.
        for (const timer of timers) clearTimeout(timer)
        timers.clear()
        if (!recordedBytes) { closeSocket(); return { text: '' } }
        onState('processing')
        if (localResult) {
          const recognized = await localResult
          if (!current()) return null
          if (recognized?.text) return recognized
          localMode = false; fail()
        }
        finish()
        if (!ready && !failed && !done) later(fail, readyTimeoutMs)
        const streamed = await result
        if (!current()) return null
        if (streamed) return streamed
        const controller = new environment.AbortController()
        session.abortUpload = () => controller.abort()
        const uploadTimer = later(() => controller.abort(), 60000)
        try {
          const wav = new environment.Blob([encodePcmWav(chunks)], { type: 'audio/wav' })
          const response = await transcribe(wav, 'audio.wav', { signal: controller.signal })
          if (!current()) return null
          return { text: String(response?.data?.text || '').trim(), fallback: true }
        } finally { clearTimeout(uploadTimer); timers.delete(uploadTimer); session.abortUpload = null }
      })().finally(() => { session.dispose() })
      return stopping
    },
    dispose() {
      disposed = true; stopped = true
      for (const timer of timers) clearTimeout(timer)
      timers.clear(); local?.dispose(); capture?.dispose(); closeSocket(); session.abortUpload?.()
      chunks.length = 0; resolveResult(null)
    }
  }
  return session
}
