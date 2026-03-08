import { baseUrl } from '@/api/settings'

function normalizeOrigin(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function normalizeSpaPath(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function normalizeQuery(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  return trimmed.startsWith('?') ? trimmed : `?${trimmed}`
}

export function buildH5SpaPath(spaPath, query = '') {
  const normalizedSpaPath = normalizeSpaPath(spaPath)
  if (!normalizedSpaPath) return ''
  return `/#${normalizedSpaPath}${normalizeQuery(query)}`
}

export function resolveH5StandalonePath(prettyPath, spaPath, query = '') {
  const fallbackPath = normalizeSpaPath(spaPath)
  const pretty = String(prettyPath || '').trim()
  const normalizedQuery = normalizeQuery(query)

  if (typeof window === 'undefined') {
    return (fallbackPath ? `${fallbackPath}${normalizedQuery}` : '') || (pretty ? `${pretty}${normalizedQuery}` : '')
  }

  const pageOrigin = normalizeOrigin(window.location.origin)
  const apiOrigin = normalizeOrigin(baseUrl)

  if (pretty && pageOrigin && apiOrigin && pageOrigin === apiOrigin) {
    return `${pretty}${normalizedQuery}`
  }

  return buildH5SpaPath(fallbackPath || pretty, normalizedQuery)
}
