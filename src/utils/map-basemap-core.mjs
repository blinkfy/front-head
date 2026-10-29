export const SATELLITE_LOAD_TIMEOUT_MS = 10000

export function isBinLocationPicker(options = {}) {
  return options.mode === 'select' && options.purpose === 'bin'
}

// Only the basemap changes. The adapter must not recreate the map or move its camera.
export function createMapBasemapController({ apply, onChange = () => {}, onFallback = () => {}, timeoutMs = SATELLITE_LOAD_TIMEOUT_MS, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let state = { satellite: false, loading: false }
  let revision = 0, timer = null, release = null, disposed = false
  const publish = patch => { state = { ...state, ...patch }; onChange({ ...state }) }
  function clearWatch() {
    if (timer !== null) clearTimer(timer)
    timer = null
    if (release) { const cleanup = release; release = null; cleanup() }
  }
  function fallback(token) {
    if (disposed || token !== revision || !state.satellite) return
    request(false)
    onFallback()
  }
  function arm(token) {
    if (timer !== null) clearTimer(timer)
    timer = setTimer(() => fallback(token), timeoutMs)
  }
  function loaded(token) {
    if (disposed || token !== revision || !state.satellite) return
    if (timer !== null) clearTimer(timer)
    timer = null
    publish({ loading: false })
  }
  function request(satellite) {
    if (disposed) return
    const token = ++revision
    clearWatch()
    publish({ satellite: !!satellite, loading: !!satellite })
    if (satellite) arm(token)
    try {
      const cleanup = apply(!!satellite, { loaded: () => loaded(token), failed: () => fallback(token) })
      if (cleanup === false && satellite) return fallback(token)
      if (typeof cleanup === 'function') {
        if (token === revision) release = cleanup
        else cleanup()
      }
    } catch (_) { if (satellite) fallback(token) }
  }
  function refresh() {
    if (disposed || !state.satellite) return
    publish({ loading: true })
    arm(revision)
  }
  function pause() { ++revision; clearWatch(); publish({ loading: false }) }
  function dispose() { pause(); disposed = true }
  return { request, refresh, pause, dispose, getState: () => ({ ...state }) }
}
