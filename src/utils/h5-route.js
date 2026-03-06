import { baseUrl } from '@/api/settings'

function normalizeOrigin(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

export function resolveH5StandalonePath(prettyPath, spaPath) {
  const fallbackPath = String(spaPath || '').trim()
  const pretty = String(prettyPath || '').trim()

  if (typeof window === 'undefined') {
    return fallbackPath || pretty
  }

  const pageOrigin = normalizeOrigin(window.location.origin)
  const apiOrigin = normalizeOrigin(baseUrl)

  if (pretty && pageOrigin && apiOrigin && pageOrigin === apiOrigin) {
    return pretty
  }

  return fallbackPath || pretty
}
