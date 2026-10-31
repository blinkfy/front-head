// A map can be pushed on top of another map; subNVue ids are only unique inside their owner page.
export function pageSubNVue(page, id, { pages = () => getCurrentPages(), fallback = value => uni.getSubNVueById(value) } = {}) {
  const proxy = page?.proxy
  const owner = pages().find(item => item.$vm === proxy || item.$vm?.$ === page)
  const host = owner?.$getAppWebview?.() || proxy?.$scope?.$getAppWebview?.() || proxy?.$getAppWebview?.()
  if (host?.children) return host.children().find(child => String(child.id) === id) || null
  // Do not use the global lookup when this page exists but its native children are not ready yet.
  if (owner) return null
  return fallback(id)
}
