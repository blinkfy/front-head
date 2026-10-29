export const DEFAULT_APP_DOWNLOAD_PATH = '/files/download/classfication.apk'
export const SKIPPED_APP_VERSION_KEY = 'skipped_app_version'

export function compareVersions(a, b) {
  const parse = value => String(value || '').trim().replace(/^v/i, '').split('.').map(part => /^\d+$/.test(part) ? Number(part) : NaN)
  const left = parse(a)
  const right = parse(b)
  if (left.some(Number.isNaN) || right.some(Number.isNaN)) return null
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] || 0) - (right[i] || 0)
    if (difference) return difference > 0 ? 1 : -1
  }
  return 0
}

export function parseVersionResponse(response) {
  const payload = response?.data || response || {}
  const data = payload.data || payload
  return { version: String(data.versionName || data.version || data.latestVersion || '').trim(), url: data.url || '' }
}

export function appDownloadUrl(baseUrl, path = DEFAULT_APP_DOWNLOAD_PATH) {
  const target = String(path || DEFAULT_APP_DOWNLOAD_PATH).trim()
  if (/^https?:\/\//i.test(target)) return target
  if (!target.startsWith('/') || target.startsWith('//')) return ''
  return String(baseUrl || '').replace(/\/+$/, '') + target
}
