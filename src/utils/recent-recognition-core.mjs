// Only the latest successful recognition lives in memory, scoped to the login session.
export const RECENT_RECOGNITION_IDLE_MS = 30 * 60 * 1000

export function createRecentRecognitionStore({ getOwner, now = Date.now }) {
  let entry = null
  let backgroundAt = null
  const listeners = new Set()
  function publish(reason) {
    for (const listener of listeners) listener(entry, reason)
  }
  function clear(reason = 'cleared') {
    entry = null
    publish(reason)
  }
  function get() {
    if (entry && entry.owner !== getOwner()) clear('owner-changed')
    return entry
  }
  return {
    get,
    save(id, result) {
      if (!result?.labels?.length) return get()
      entry = { id, owner: getOwner(), result: { ...result } }
      publish('saved')
      return entry
    },
    updateImage(id, patch) {
      const current = get()
      if (!current || current.id !== id) return
      entry = { ...current, result: { ...current.result, ...patch } }
      publish('image-updated')
    },
    clear,
    background() { if (backgroundAt === null) backgroundAt = now() },
    foreground() {
      const expired = backgroundAt !== null && now() - backgroundAt >= RECENT_RECOGNITION_IDLE_MS
      backgroundAt = null
      if (expired) clear('expired')
      else get()
      return expired
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}
