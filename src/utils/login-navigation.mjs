// Keep the source page covered until reLaunch replaces it. Navigation failure
// is separate from authentication failure and must not clear a valid session.
export function navigateAfterLogin({ runtime, url, setLoading }) {
  setLoading(true)
  return new Promise(resolve => {
    const fail = () => {
      setLoading(false)
      runtime.showToast({ title: '登录成功，页面打开失败，请重试', icon: 'none' })
      resolve(false)
    }
    try {
      runtime.reLaunch({ url, success: () => resolve(true), fail })
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
