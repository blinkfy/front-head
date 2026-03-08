import { resolveH5StandalonePath } from '../utils/h5-route'

const ACCESS_DENIED_PATTERNS = [
  /管理员/,
  /无权限/,
  /没有权限/,
  /未授权/,
  /未登录/,
  /token/i,
  /forbidden/i,
  /unauthori[sz]ed/i,
  /permission/i,
  /admin/i
]

function readMessage(payload, response) {
  const message = String(
    (payload && (payload.msg || payload.message || payload.error)) || ''
  ).trim()

  if (message) return message
  if (response && response.status) return `HTTP ${response.status}`
  return '请求失败'
}

export function describeApiFailure(payload, response) {
  return readMessage(payload, response)
}

export function isAccessDeniedPayload(payload, response) {
  if (response && (response.status === 401 || response.status === 403)) {
    return true
  }

  if (!payload || typeof payload !== 'object') return false

  const code = Number(payload.code)
  if (code === 401 || code === 403) return true
  if (code !== 1) return false

  const message = readMessage(payload, response)
  return ACCESS_DENIED_PATTERNS.some((pattern) => pattern.test(message))
}

export function redirectToNoPermission(options = {}) {
  const currentPath = window.location && window.location.pathname
  if (currentPath === '/no-permission' || currentPath === '/pages-nonTheme/no-permission') {
    return
  }

  const params = new URLSearchParams()
  const from = String(options.from || currentPath || '').trim()
  const reason = String(options.reason || '').trim()

  if (from) params.set('from', from)
  if (reason) params.set('reason', reason)

  const target = resolveH5StandalonePath(
    '/no-permission',
    '/pages-nonTheme/no-permission',
    params.toString()
  )
  try {
    window.location.replace(target)
  } catch (_) {
    window.location.href = target
  }
}

export function redirectIfAccessDenied(payload, response, options = {}) {
  if (!isAccessDeniedPayload(payload, response)) return false
  redirectToNoPermission({
    ...options,
    reason: options.reason || readMessage(payload, response)
  })
  return true
}
