// Execute the SDK off-screen once; failed warmups get one bounded retry.
export function createAppMapPreloader({ createWindow, getNetworkType, log = () => {}, canStart = () => true,
  setTimer = setTimeout, clearTimer = clearTimeout, delayMs = 1200, timeoutMs = 20000,
  retryMs = 5000, maxAttempts = 2, successTtlMs = Infinity, now = Date.now }) {
  let view = null, timer = null, attempts = 0, readyUntil = 0, disposed = false, revision = 0, url = ''
  const clear = () => { if (timer !== null) clearTimer(timer); timer = null }
  function close() {
    clear()
    const previous = view
    view = null
    try { previous?.close('none') } catch (_) {}
  }
  function queue(delay) {
    if (disposed || now() < readyUntil || attempts >= maxAttempts || timer !== null || view || !url || !canStart()) return
    const token = ++revision
    timer = setTimer(async () => {
      timer = null
      if (!canStart()) return
      let network
      try { network = await getNetworkType() } catch (_) { network = 'none' }
      if (disposed || token !== revision || network === 'none' || !canStart()) return
      attempts++
      const finish = phase => {
        if (disposed || token !== revision) return
        revision++
        const loaded = phase === 'loaded'
        readyUntil = loaded ? now() + successTtlMs : 0
        log(phase)
        close()
        if (!loaded) queue(retryMs)
      }
      try {
        const current = createWindow(url, finish)
        if (!current) { finish('unavailable'); return }
        view = current
        current.addEventListener?.('close', () => { if (view === current) finish('closed') })
        timer = setTimer(() => finish('timeout'), timeoutMs)
        log('start')
      } catch (_) { finish('unavailable') }
    }, delay)
  }
  return {
    schedule(sdkUrl) {
      if (disposed || !sdkUrl) return
      if (url && url !== sdkUrl) { revision++; close(); attempts = 0; readyUntil = 0 }
      url = sdkUrl
      queue(delayMs)
    },
    complete() { revision++; readyUntil = Infinity; close() },
    cancel() { revision++; if (view) attempts = Math.max(0, attempts - 1); close() },
    dispose() { disposed = true; revision++; close() }
  }
}
