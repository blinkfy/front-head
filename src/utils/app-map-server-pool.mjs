// Share one loopback server across map pages, without retaining any map/WebGL instance.
export function createAppMapServerPool({ start, stop, setTimer = setTimeout, clearTimer = clearTimeout, idleMs = 60000 }) {
  let baseUrl = '', users = 0, idleTimer = null
  function cancelIdle() { if (idleTimer !== null) clearTimer(idleTimer); idleTimer = null }
  function close() {
    cancelIdle()
    const previous = baseUrl
    baseUrl = ''; users = 0
    try { if (previous) stop(previous) } catch (_) { /* Native teardown must stay best effort. */ }
  }
  return {
    acquire() {
      cancelIdle()
      if (!baseUrl) {
        const result = start()
        if (!/^http:\/\/127\.0\.0\.1:\d+\/[^/]+\/$/.test(result || '')) return ''
        baseUrl = result
      }
      users++
      return baseUrl
    },
    release(url) {
      if (!baseUrl || url !== baseUrl || users <= 0) return
      if (--users === 0) idleTimer = setTimer(close, idleMs)
    },
    dispose: close
  }
}
