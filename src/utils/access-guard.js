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
  // 获取当前路径：优先 H5 的 window.location，其次尝试小程序的 getCurrentPages()
  const currentPath = getCurrentPath()
  if (currentPath === '/no-permission' || currentPath === '/pages-nonTheme/no-permission') {
    return
  }

  const from = String(options.from || currentPath || '').trim()
  const reason = String(options.reason || '').trim()
  const params = {}
  if (from) params.from = from
  if (reason) params.reason = reason
  const qs = buildQueryString(params)
  const url = qs ? '/pages-nonTheme/no-permission?' + qs : '/pages-nonTheme/no-permission'
  uni.navigateTo({ url })
}

export function redirectIfAccessDenied(payload, response, options = {}) {
  if (!isAccessDeniedPayload(payload, response)) return false
  redirectToNoPermission({
    ...options,
    reason: options.reason || readMessage(payload, response)
  })
  return true
}

// Cross-platform helpers
function getCurrentPath() {
  // H5 environment
  if (typeof window !== 'undefined' && window.location && window.location.pathname) {
    return window.location.pathname
  }

  // 小程序环境：使用 getCurrentPages 获取当前页面 route
  try {
    if (typeof getCurrentPages === 'function') {
      const pages = getCurrentPages()
      if (pages && pages.length) {
        const last = pages[pages.length - 1]
        if (last && last.route) return '/' + String(last.route)
      }
    }
  } catch (e) {
    // ignore
  }

  return ''
}

function buildQueryString(params) {
  if (!params || typeof params !== 'object') return ''
  const parts = []
  for (const key in params) {
    if (!Object.prototype.hasOwnProperty.call(params, key)) continue
    const val = params[key]
    if (val === undefined || val === null) continue
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(val)))
  }
  return parts.join('&')
}
