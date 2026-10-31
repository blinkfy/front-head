const loadedPages = new Set()
const routeOf = url => String(url || '').split(/[?#]/)[0].replace(/^\//, '')

export function markH5PagePreloaded(url) {
  loadedPages.add(routeOf(url))
}

export function isH5PagePreloaded(url) {
  return loadedPages.has(routeOf(url))
}
