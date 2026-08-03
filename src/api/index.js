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

function httpErrorMessage(res) {
  const statusCode = Number(res?.statusCode)
  const data = res?.data && typeof res.data === 'object' ? res.data : {}
  const fromResponse = data.msg || data.error || res?.msg || res?.errMsg
  if (fromResponse) return String(fromResponse)

  const statusMessages = {
    400: '请求错误400',
    401: '请重新登录',
    403: '禁止访问403',
    404: '网络错误404',
    429: '流量限制429',
    500: '服务器错误500'
  }
  return statusMessages[statusCode] || `网络错误${statusCode || ''}`
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
            reject(responseData)
          } else if (responseData.code === 2) {
            // 数据库临时关闭：持久化降级状态，并对连续失败做 toast 去重。
            markDatabaseOffline({
              runtime: databaseStatusRuntime,
              message: responseData.msg || responseData.error || '数据库暂时关闭，该操作暂不可用',
              source: url
            })
            reject(responseData)
          } else {
            // 同时显示 msg（社区风格）或 error（新增API风格）
            uni.showToast({ title: responseData.msg || responseData.error || '请求失败', icon: 'none' })
            reject(responseData)
          }
        } else {
          const message = httpErrorMessage(res)
          if (res?.statusCode === 401) {
            handleUnauthorized()
          } else {
            uni.showToast({ title: message, icon: 'none' })
          }
          reject({ ...res, msg: message, message })
        }
      },
      fail: err => {
        const message = err?.msg || err?.errMsg || err?.message || '网络请求失败，请检查网络后重试'
        uni.showToast({ title: message, icon: 'none' })
        reject({ ...err, msg: message, message })
      }
    })
  })
}

export default request
