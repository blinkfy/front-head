// Unlock on ordinary page interactions without permanent silent playback.
export function createWebRingtoneDriver({ createContext, loadBuffer, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let context, loading, source = null, revision = 0
  const audioContext = () => context || (context = createContext())
  function buffer() {
    if (!loading) loading = Promise.resolve().then(() => loadBuffer(audioContext())).catch(error => { loading = null; throw error })
    return loading
  }
  function unlock() {
    const ctx = audioContext()
    if (ctx.state === 'running') return Promise.resolve()
    // Resume inside the gesture even if automatic playback is still pending.
    const resumed = ctx.resume()
    void resumed.catch(() => {})
    const silent = ctx.createBufferSource()
    silent.buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
    silent.connect(ctx.destination)
    silent.onended = () => silent.disconnect()
    silent.start()
    return resumed
  }
  function stop() {
    revision++
    if (source) { const old = source; source = null; try { old.stop() } catch (_) {}; old.disconnect() }
  }
  return {
    unlock() { try { unlock() } catch (_) {} },
    prime() { void buffer().catch(() => {}) },
    async play(canStart) {
      const attempt = ++revision, ctx = audioContext()
      const resumed = unlock()
      let timer
      // Browsers may leave resume() pending instead of rejecting autoplay.
      const ready = Promise.race([resumed, new Promise((_, reject) => {
        timer = setTimer(() => reject(new DOMException('Audio needs a page interaction', 'NotAllowedError')), 1200)
      })]).finally(() => clearTimer(timer))
      const [decoded] = await Promise.all([buffer(), ready])
      if (attempt !== revision || !canStart()) return
      if (ctx.state !== 'running') throw new DOMException('Audio is suspended', 'NotAllowedError')
      // Repeated page gestures resume the existing loop, never add a second one.
      if (source) return
      const next = ctx.createBufferSource(), gain = ctx.createGain()
      next.buffer = decoded; next.loop = true; gain.gain.value = 0.65
      next.connect(gain); gain.connect(ctx.destination)
      next.onended = () => { next.disconnect(); gain.disconnect(); if (source === next) source = null }
      source = next
      next.start()
    },
    stop
  }
}
