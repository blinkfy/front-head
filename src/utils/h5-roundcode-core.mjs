// Only resolved, registered scenes reach routing. An opaque circle-code payload
// must never go through the permissive ordinary device-ID parser.
export function createWebRoundCodeResolver({ getToken, getAccount, resolveImage, scanApp,
  authorizeApp, cancelApp, confirm, notify }) {
  return async function resolve(imageBase64, isActive = () => true) {
    const token = getToken()
    if (!token) throw new Error('请先登录，再识别微信圆码')
    const current = () => isActive() && getToken() === token
    const response = await resolveImage(imageBase64, token)
    if (!current()) return null
    const data = response?.data
    if (data?.kind === 'device' && /^[a-f0-9]{32}$/i.test(data.token || '')) {
      return { errMsg: 'scanCode:ok', scanType: 'WX_CODE', path: '/pages-nonTheme/scan?scene=' + data.token }
    }
    if (data?.kind !== 'registration' || !/^r_[a-f0-9]{24}$/.test(data.sessionId || '')) {
      throw new Error('此圆码暂不支持，请扫描分投侠有效设备码或登录码')
    }
    await scanApp(data.sessionId, token)
    if (!current()) return null
    const accepted = await confirm(getAccount(), data.sessionId)
    if (!current()) return null
    if (!accepted) {
      await cancelApp(data.sessionId, token).catch(() => {})
      return { handled: true, errMsg: 'scanCode:cancel' }
    }
    await authorizeApp(data.sessionId, token)
    if (!current()) return null
    notify('已确认网页登录，请返回目标网页查看')
    return { handled: true, errMsg: 'scanCode:ok' }
  }
}
