export function asrAbortError() {
  return Object.assign(new Error('Speech recognition cancelled'), { name: 'AbortError' })
}

// Older App WebViews and small-program runtimes may lack AbortController.
export function createAsrController() {
  if (typeof AbortController === 'function') return new AbortController()
  const listeners = new Set()
  const signal = {
    aborted: false,
    addEventListener(type, listener) { if (type === 'abort') listeners.add(listener) },
    removeEventListener(type, listener) { if (type === 'abort') listeners.delete(listener) }
  }
  return { signal, abort() {
    if (signal.aborted) return
    signal.aborted = true
    for (const listener of listeners) listener()
    listeners.clear()
  } }
}

export function assertAsrCurrent({ signal, isCurrent = () => true } = {}) {
  if (signal?.aborted || !isCurrent()) throw asrAbortError()
}

// A local failure falls back once. Cancellation must never start a cloud request.
export async function localFirstAsr(local, cloud, options = {}) {
  assertAsrCurrent(options)
  try {
    const result = await local()
    assertAsrCurrent(options)
    if (String(result?.text || '').trim()) return { ...result, text: result.text.trim(), local: true }
  } catch (error) {
    assertAsrCurrent(options)
    if (error?.name === 'AbortError') throw error
  }
  assertAsrCurrent(options)
  return cloud()
}
