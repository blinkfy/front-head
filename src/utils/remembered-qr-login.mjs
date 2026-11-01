// Resume an explicitly remembered QR login without storing or reconstructing credentials.
export async function resumeRememberedQrLogin({ runtime, loadUser, onLogin, setLoading,
  isActive = () => true }) {
  let token
  try {
    if (runtime.getStorageSync('rememberedQrLogin') !== true
      || runtime.getStorageSync('autoLogin') !== true) return false
    token = runtime.getStorageSync('token')
  } catch (_) { return false }
  if (typeof token !== 'string' || !token) return false

  const current = () => {
    try { return isActive() && runtime.getStorageSync('token') === token } catch (_) { return false }
  }
  const clearMarker = () => {
    if (!current()) return
    try { runtime.removeStorageSync('rememberedQrLogin') } catch (_) {}
  }
  const clearLoading = () => { if (current()) { try { setLoading(false) } catch (_) {} } }

  try { setLoading(true) } catch (_) {}
  try {
    let response
    try { response = await loadUser() } catch (_) { clearMarker(); return true }
    const userInfo = response?.code === 0 && response.data && typeof response.data === 'object'
      && !Array.isArray(response.data) && response.data.id != null ? response.data : null
    if (!userInfo || !current()) {
      if (!userInfo) clearMarker()
      return true
    }
    clearLoading()
    if (!current()) return true
    try { await onLogin({ code: 0, token, userInfo, isAdmin: userInfo.isAdmin === true }) } catch (_) {}
    return true
  } finally { clearLoading() }
}
