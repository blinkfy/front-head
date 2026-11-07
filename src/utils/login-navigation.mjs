// #ifdef H5
import { WEB_CALL_RETURN_KEY, pendingWebCallPath } from './web-call-entry.mjs'
// #endif
// Keep the source page covered until reLaunch replaces it. Navigation failure
// is separate from authentication failure and must not clear a valid session.
export function navigateAfterLogin({ runtime, url, setLoading }) {
  let callReturn = ''
  // #ifdef H5
  try { callReturn = pendingWebCallPath(runtime.getStorageSync?.(WEB_CALL_RETURN_KEY)) } catch (_) {}
  if (callReturn) url = callReturn
  // #endif
  setLoading(true)
  const cancelPageLoading = runtime.beginPageLoading?.(url)
  return new Promise(resolve => {
    const fail = () => {
      cancelPageLoading?.()
      setLoading(false)
      runtime.showToast({ title: '登录成功，页面打开失败，请重试', icon: 'none' })
      resolve(false)
    }
    try {
      runtime.reLaunch({ url, success: () => {
        // #ifdef H5
        if (callReturn) runtime.removeStorageSync?.(WEB_CALL_RETURN_KEY)
        // #endif
        resolve(true)
      }, fail })
    } catch (_) { fail() }
  })
}

// A navigation back to login is not a new application launch.
let loginSplashClaimed = false
export function claimLoginSplash() {
  if (loginSplashClaimed) return false
  loginSplashClaimed = true
  return true
}

export function returnToLogin({ runtime, url, getPages = () => getCurrentPages() }) {
  loginSplashClaimed = true
  const redirect = () => runtime.redirectTo({ url })
  let pages = []
  try { pages = getPages() || [] } catch (_) {}
  const previous = pages[pages.length - 2]
  if (String(previous?.route || '').replace(/^\//, '') === url.replace(/^\//, '')) {
    runtime.navigateBack({ delta: 1, fail: redirect })
  } else redirect()
}
