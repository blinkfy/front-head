function appendValue(entries, key, value) {
  if (value === undefined || value === null) return
  if (Array.isArray(value)) {
    value.forEach(item => appendValue(entries, key, item))
    return
  }
  entries.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
}

export function appendQueryParams(url, params = {}) {
  const entries = []
  Object.keys(params || {}).forEach(key => appendValue(entries, key, params[key]))
  if (!entries.length) return String(url)

  const target = String(url)
  const hashIndex = target.indexOf('#')
  const hash = hashIndex >= 0 ? target.slice(hashIndex) : ''
  const base = hashIndex >= 0 ? target.slice(0, hashIndex) : target
  const separator = base.includes('?') ? (base.endsWith('?') || base.endsWith('&') ? '' : '&') : '?'
  return `${base}${separator}${entries.join('&')}${hash}`
}

export function isDatabaseHealthEndpoint(url) {
  const pathname = String(url || '').split('#')[0].split('?')[0]
  return pathname === '/health' || pathname.endsWith('/health') ||
    pathname === '/api/_db_state' || pathname.endsWith('/api/_db_state')
}
