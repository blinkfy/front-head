export const APP_MAP_IDLE_MS = 5 * 60 * 1000

// The page shell may stay in the navigation stack; its expensive iframe must not.
export function createAppMapRetention({ release, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, idleMs = APP_MAP_IDLE_MS }) {
  let timer = null, deadline = null, disposed = false
  function clear() { if (timer !== null) clearTimer(timer); timer = null }
  function expire() { clear(); if (deadline !== null) { deadline = null; release() } }
  return {
    hide() {
      if (disposed || deadline !== null) return
      deadline = now() + idleMs
      timer = setTimer(expire, idleMs)
    },
    show() {
      if (disposed) return
      if (deadline !== null && now() >= deadline) expire()
      clear(); deadline = null
    },
    dispose() { disposed = true; clear(); deadline = null }
  }
}

// Only ordinary bottom-tab maps are retained. Picker/view routes keep their own lifecycle.
export function createAppMapTabCache({ now = Date.now, idleMs = APP_MAP_IDLE_MS } = {}) {
  let retained = null
  const mapRoute = route => /^(pages|pages-dark)\/map\/map$/.test(route || '')
  const tabRoute = route => /^(pages|pages-dark)\/(home|map|shop|profile)\/\2$/.test(route || '')
  return {
    navigation({ pages, from, targetRoute, owner, url = '', hasQuery = url.includes('?') }) {
      if (!tabRoute(targetRoute) || !pages.length) return null
      const passiveQuery = /^from=(home|map|shop|profile)$/.test(url.split('?')[1] || '')
      const explicitTarget = hasQuery && !passiveQuery
      if (retained && !pages.includes(retained.page)) retained = null
      const current = pages[pages.length - 1]
      if (retained?.page === current && retained.owner === owner) retained = null
      if (retained && (retained.owner !== owner || now() >= retained.deadline)) {
        retained = null
        // Drop the hidden old shell as well; do not accumulate expired map pages.
        return { method: 'reLaunch' }
      }
      if (explicitTarget) {
        if (!retained) return null
        retained = null
        return { method: 'reLaunch' }
      }
      if (retained) {
        if (targetRoute.split('/')[0] !== retained.route.split('/')[0]) { retained = null; return { method: 'reLaunch' } }
        const index = pages.indexOf(retained.page)
        if (targetRoute === retained.route) { retained = null; return { method: 'navigateBack', delta: pages.length - 1 - index } }
        return { method: 'redirectTo' }
      }
      if (from === 'map' && mapRoute(current.route) && !['select', 'view'].includes(current.options?.mode || current.$page?.options?.mode)) {
        retained = { page: current, route: current.route, owner, deadline: now() + idleMs }
        return { method: 'navigateTo' }
      }
      return null
    },
    clear() { retained = null }
  }
}
