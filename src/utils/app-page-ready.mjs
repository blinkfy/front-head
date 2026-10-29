let pageReady = false
const listeners = new Set()

export function markAppPageReady() {
  if (pageReady) return
  pageReady = true
  for (const listener of listeners) listener()
  listeners.clear()
}

export function onAppPageReady(listener) {
  if (pageReady) listener()
  else listeners.add(listener)
  return () => listeners.delete(listener)
}
