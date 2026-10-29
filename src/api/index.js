import { baseUrl } from './settings'
import {
  markDatabaseOffline,
  updateDatabaseStatusFromAvailability
} from './database-status.mjs'
import { appendQueryParams, isDatabaseHealthEndpoint } from './request-utils.mjs'

let loginRedirectTimer = null
let loginPromptActive = false
const databaseStatusRuntime = Object.freeze({
  getStorageSync: key => uni.getStorageSync(key),
  setStorageSync: (key, value) => uni.setStorageSync(key, value),
  removeStorageSync: key => uni.removeStorageSync(key),
  showToast: options => uni.showToast(options)
})

function isExplicitlyLoggedOut() {
  try {
    return !uni.getStorageSync('token') && uni.getStorageSync('autoLogin') === false
  } catch (e) {
    return false
  }
}

function handleUnauthorized() {
  // 用户已主动退出时，旧页面中尚未完成的请求不应再提示或重新跳转登录页。
  if (isExplicitlyLoggedOut() || loginPromptActive) return

  loginPromptActive = true
  uni.showToast({ title: '请重新登录', icon: 'none' })
  redirectToLogin()
}

function redirectToLogin() {
  try {
    uni.removeStorageSync('token')
  } catch (e) {
    // Storage failures should not prevent recovery to the login page.
  }

  if (loginRedirectTimer) return
  loginRedirectTimer = setTimeout(() => {
    loginRedirectTimer = null
    let theme = 'light'
    try {
      theme = uni.getStorageSync('app_theme') || 'light'
    } catch (e) {
      // Fall back to the default login page when theme storage is unavailable.
    }
    uni.reLaunch({
      url: theme === 'dark' ? '/pages-dark/index/index' : '/pages/index/index'
    })
  }, 1000)
}

function responseErrorMessage(data, fallback) {
  for (const value of [data?.msg, data?.error, data?.message]) {
    if (typeof value === 'string' && value.trim() && !/^request:\s*ok\b/i.test(value.trim())) return value.trim()
  }
  return fallback
}

function httpErrorMessage(res) {
  const statusCode = Number(res?.statusCode)
  const statusMessages = {
    400: '请求参数有误，请重试',
    401: '请重新登录',
    403: '暂无权限执行该操作',
    404: '请求的服务不存在，请稍后重试',
    408: '请求超时，请稍后重试',
    429: '请求过于频繁，请稍后重试',
    500: '服务器异常，请稍后重试',
    502: '服务暂时无法连接，请稍后重试',
    503: '服务暂不可用，请稍后重试',
    504: '服务器响应超时，请稍后重试'
  }
  // success 回调的 errMsg=request:ok 只表示收到了响应，不能作为 HTTP 错误提示。
  return responseErrorMessage(res?.data, statusMessages[statusCode] || '请求失败，请稍后重试')
}

function networkErrorMessage(error) {
  const detail = `${error?.errMsg || ''} ${error?.message || ''}`
  const fallback = /timeout|timed out|超时/i.test(detail)
    ? '请求超时，请检查网络或稍后重试'
    : '无法连接服务器，请检查网络或稍后重试'
  // abort/cancel 也可能来自连接中断，不能据此推断用户主动取消。
  // 原生 request:fail 等诊断信息保留在异常对象，不直接展示给用户。
  const message = responseErrorMessage({ msg: error?.msg }, fallback)
  return /^request:/i.test(message) ? fallback : message
}

function requestError(error, message) {
  return { ...error, originalErrMsg: error?.errMsg || error?.message, msg: message, message, errMsg: message }
}

function getToken() {
  // 退出后不要继续从 H5 URL 回退取得旧 token。
  if (isExplicitlyLoggedOut()) return ''

  try {
    const cachedToken = uni.getStorageSync('token') || ''
    if (cachedToken) {
      loginPromptActive = false
      return cachedToken
    }
  } catch (e) {
    // ignore storage errors and fall back to URL parsing below
  }

  // H5 / webview fallback: extract token from the current URL when storage is unavailable
  try {
    if (typeof window !== 'undefined' && window.location) {
      const url = new URL(window.location.href)
      const searchToken = url.searchParams.get('token')
      if (searchToken) return searchToken

      const hash = String(window.location.hash || '')
      const hashQuery = hash.includes('?') ? hash.split('?')[1] : ''
      if (hashQuery) {
        const hashParams = new URLSearchParams(hashQuery)
        const hashToken = hashParams.get('token')
        if (hashToken) return hashToken
      }
    }
  } catch (e) {
    // ignore URL parsing errors
  }

  return ''
}

function request({
  url,
  method = 'GET',
  data = {},
  params = {},
  header = {},
  needAuth = false,
  silent = false,
  timeout,
  contentType
}) {
  const token = getToken()
  const requestMethod = String(method || 'GET').toUpperCase()
  const headers = {
    'Content-Type': contentType || 'application/json',
    ...header
  }
  
  // 根据API文档，token作为查询参数传递
  let finalUrl = appendQueryParams(baseUrl + url, requestMethod === 'GET' ? params : {})
  let requestData = data
  if (needAuth && token) {
    headers['Authorization'] = headers['Authorization'] || token
    if (requestMethod !== 'GET' && data && typeof data === 'object' && !data.token) {
      requestData = { ...data, token }
    }
    finalUrl = appendQueryParams(finalUrl, { token })
  }
  
  return new Promise((resolve, reject) => {
    uni.request({
      url: finalUrl,
      method: requestMethod,
      data: requestData,
      header: headers,
      ...(Number.isFinite(timeout) && timeout > 0 ? { timeout } : {}),
      success: res => {
        const responseData = res?.data && typeof res.data === 'object' ? res.data : {}
        if (isDatabaseHealthEndpoint(url)) {
          updateDatabaseStatusFromAvailability(responseData, {
            runtime: databaseStatusRuntime,
            source: url,
            allowRecovery: true,
            notify: false
          })
        }
        if (res.statusCode === 200) {
          // 同时兼容 code:0（社区风格）和 success:true（新增API风格）
          if (
            responseData.code === 0 ||
            responseData.status === 'ok' ||
            responseData.status === 'degraded' ||
            responseData.success === true
          ) {
            resolve(res.data)
          } else if (responseData.code === 401 || responseData.error === 'Unauthorized') {
            handleUnauthorized()
            reject(requestError(responseData, responseErrorMessage(responseData, '请重新登录')))
          } else if (responseData.code === 2) {
            // 数据库临时关闭：持久化降级状态，并对连续失败做 toast 去重。
            const message = responseErrorMessage(responseData, '数据库暂不可用，请稍后重试')
            markDatabaseOffline({
              runtime: databaseStatusRuntime,
              message,
              source: url,
              notify: !silent
            })
            reject(requestError(responseData, message))
          } else {
            // 同时显示 msg（社区风格）或 error（新增API风格）
            const message = responseErrorMessage(responseData, '请求失败，请稍后重试')
            if (!silent) uni.showToast({ title: message, icon: 'none' })
            reject(requestError(responseData, message))
          }
        } else {
          const message = httpErrorMessage(res)
          if (res?.statusCode === 401) {
            handleUnauthorized()
          } else if (responseData.code === 2) {
            markDatabaseOffline({ runtime: databaseStatusRuntime, message, source: url, notify: !silent })
          } else if (!silent) {
            uni.showToast({ title: message, icon: 'none' })
          }
          reject(requestError(res, message))
        }
      },
      fail: err => {
        const message = networkErrorMessage(err)
        if (!silent) uni.showToast({ title: message, icon: 'none' })
        reject(requestError(err, message))
      }
    })
  })
}

export default request
