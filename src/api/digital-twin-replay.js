import { baseUrl } from './settings.js'

function readAuthorizationToken() {
  try {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      return localStorage.getItem('token') || ''
    }
  } catch (_) {
    // Fall through to the native storage implementation.
  }

  try {
    return uni.getStorageSync('token') || ''
  } catch (_) {
    return ''
  }
}

function createResponseError(body, statusCode) {
  const error = new Error(body.msg || body.message || body.error || `HTTP ${statusCode}`)
  error.payload = body
  error.response = { status: statusCode }
  error.availableModes = body.data?.availableModes || []
  return error
}

export function fetchParkReplay(mode = 'sim', scene = 'baseline') {
  return new Promise((resolve, reject) => {
    const token = readAuthorizationToken()
    uni.request({
      url: `${baseUrl}/api/digital-twin/park-replay`,
      method: 'GET',
      data: { mode, scene },
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: token } : {})
      },
      success: (res) => {
        const body = res.data || {}
        if (res.statusCode === 200 && body.code === 0 && body.data) {
          resolve(body.data)
          return
        }
        reject(createResponseError(body, res.statusCode))
      },
      fail: reject
    })
  })
}
