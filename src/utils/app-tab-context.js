import { getCurrentInstance, inject } from 'vue'

export const APP_TAB_CONTEXT = Symbol('app-tab-context')
let shell = null

export function useAppTabContext() {
  return getCurrentInstance() ? inject(APP_TAB_CONTEXT, null) : null
}

export function registerAppTabShell(value) {
  shell = value
  return () => { if (shell === value) shell = null }
}

export function getAppTabShell() { return shell }

export function getAppCurrentPages() {
  const pages = getCurrentPages()
  if (!shell) return pages
  return pages.map(page => page === shell.page ? shell.logicalPage() : page)
}

export function parseAppTabUrl(url = '') {
  const [path, query = ''] = String(url).replace(/^\//, '').split('?')
  const match = /^(pages|pages-dark)\/(home|map|shop|profile)\/\2$/.exec(path)
  if (!match) return null
  const options = {}
  for (const entry of query.split('&').filter(Boolean)) {
    const split = entry.indexOf('=')
    try { options[decodeURIComponent(split < 0 ? entry : entry.slice(0, split))] = decodeURIComponent(split < 0 ? '' : entry.slice(split + 1)) } catch (_) { return null }
  }
  if (match[2] === 'map' && ['select', 'view'].includes(options.mode)) return null
  return { tab: match[2], dark: match[1] === 'pages-dark', route: path, options }
}
