import { baseUrl } from './settings'

let loginRedirectTimer = null

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
  try {
    const cachedToken = uni.getStorageSync('token') || ''
    if (cachedToken) return cachedToken
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

function request({ url, method = 'GET', data = {}, header = {}, needAuth = false, contentType }) {
  const token = getToken()
  const headers = {
    'Content-Type': contentType || 'application/json',
    ...header
  }
  
  // 根据API文档，token作为查询参数传递
  let finalUrl = baseUrl + url
  if (needAuth && token) {
    headers['Authorization'] = headers['Authorization'] || token
    if (method !== 'GET' && data && typeof data === 'object' && !data.token) {
      data = { ...data, token }
    }
    const separator = url.includes('?') ? '&' : '?'
    finalUrl += `${separator}token=${token}`
  }
  
  return new Promise((resolve, reject) => {
    uni.request({
      url: finalUrl,
      method,
      data,
      header: headers,
      success: res => {
        const responseData = res?.data && typeof res.data === 'object' ? res.data : {}
        if (res.statusCode === 200) {
          // 同时兼容 code:0（社区风格）和 success:true（新增API风格）
          if (responseData.code === 0 || responseData.status === 'ok' || responseData.success === true) {
            resolve(res.data)
          } else if (responseData.code === 401 || responseData.error === 'Unauthorized') {
            uni.showToast({ title: '请重新登录', icon: 'none' })
            redirectToLogin()
            reject(responseData)
          } else if (responseData.code === 2) {
            // 数据库临时关闭：展示后端返回的具体提示信息，并在 storage 中记录状态
            uni.showToast({ title: responseData.msg || responseData.error || '数据库暂时关闭，该操作暂不可用', icon: 'none' })
            try {
              uni.setStorageSync('dbOffline', true)
            } catch (e) {
              // ignore storage errors
            }
            reject(responseData)
          } else {
            // 同时显示 msg（社区风格）或 error（新增API风格）
            uni.showToast({ title: responseData.msg || responseData.error || '请求失败', icon: 'none' })
            reject(responseData)
          }
        } else {
          const message = httpErrorMessage(res)
          uni.showToast({ title: message, icon: 'none' })
          if (res?.statusCode === 401) redirectToLogin()
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
