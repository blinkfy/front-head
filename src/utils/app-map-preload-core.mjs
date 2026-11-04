// Preload only the SDK response into the WebView HTTP cache; never create a map.
export function createAppMapPreloader({ createWindow, getNetworkType, log = () => {},
  setTimer = setTimeout, clearTimer = clearTimeout, delayMs = 1200, timeoutMs = 20000 }) {
  let view = null, timer = null, attempted = false, disposed = false, revision = 0
  const clear = () => { if (timer !== null) clearTimer(timer); timer = null }
  function close() {
    clear()
    const previous = view
    view = null
    try { previous?.close('none') } catch (_) {}
  }
  return {
    schedule(sdkUrl) {
      if (disposed || attempted || timer !== null || view || !sdkUrl) return
      const token = ++revision
      timer = setTimer(async () => {
        timer = null
        try {
          const network = await getNetworkType()
          if (disposed || token !== revision || network === 'none') return
          attempted = true
          const current = createWindow(sdkUrl)
          if (!current) return
          view = current
          current.addEventListener?.('close', () => { if (view === current) { view = null; clear() } })
          timer = setTimer(() => { log('timeout'); close() }, timeoutMs)
          log('start')
        } catch (_) { log('unavailable'); close() }
      }, delayMs)
    },
    cancel() { revision++; if (view) attempted = false; close() },
    dispose() { disposed = true; revision++; close() }
  }
}
