// Local display gate only; backend permissions and scan authorization remain unchanged.
export function createScanDebugAccess(runtime) {
  const read = key => { try { return runtime?.getStorageSync(key) } catch (_) { return null } }
  const token = read('token')
  return () => {
    if (!token || read('token') !== token) return false
    let user = read('userInfo')
    try { if (typeof user === 'string') user = JSON.parse(user) } catch (_) { return false }
    // An explicit ordinary profile overrides an older cached administrator flag.
    if (user?.isAdmin === false) return false
    if (user?.isAdmin === true) return true
    return [true, 1, '1', 'true'].includes(read('isAdmin'))
  }
}

export function roundCodeDebugText(data) {
  if (data?.kind === 'device' && /^[a-f0-9]{32}$/i.test(data.token || '')) {
    return '/pages-nonTheme/scan?scene=' + data.token
  }
  if (data?.kind === 'registration' && /^r_[a-f0-9]{24}$/.test(data.sessionId || '')) {
    return '/pages/register/register?scene=' + data.sessionId
  }
  throw new Error('此圆码暂不支持，请扫描分投侠有效设备码或登录码')
}
