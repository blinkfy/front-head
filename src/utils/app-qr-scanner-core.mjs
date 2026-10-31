const sessionPattern = /^r_[a-f0-9]{24}$/
const tokenPattern = /^[a-f0-9]{32}$/i

// Pure orchestration, separated from UTS so race/cancel/error cases can be tested.
export function createAppQrScanner({ nativeScan, standardScan, resolveRaw, scanApp,
  authorizeApp, cancelApp, getToken, getAccount, confirm, fallback, notify }) {
  let busy = false
  async function nativeOrStandard() {
    let result
    try { result = await nativeScan() } catch (_) {
      notify('当前安装包不支持圆码，请扫描普通二维码')
      return standardScan()
    }
    if (result?.error === 'CANCELLED') return null
    if (['UNAVAILABLE', 'UNSUPPORTED', 'USE_STANDARD'].includes(result?.error)) {
      if (result.error !== 'USE_STANDARD') notify('当前安装包或设备不支持圆码，请扫描普通二维码')
      return standardScan()
    }
    if (result?.error) {
      if (result.error !== 'BUSY' && await fallback('暂时无法识别，请保持光线充足，或改用普通二维码。')) return standardScan()
      return null
    }
    return result
  }
  return {
    async scan() {
      if (busy) return null
      busy = true
      try {
        const result = await nativeOrStandard()
        if (!result || result.scanType !== 'WX_CODE') return result
        const token = getToken()
        if (!token) { notify('请先登录APP，再扫描小程序码'); return null }
        // Opaque WX_CODE is never routed through the permissive ordinary device-ID parser.
        let resolved
        try { resolved = await resolveRaw(result.rawBase64, token) }
        catch (error) {
          if (error?.statusCode === 401 || error?.code === 401) {
            notify('登录状态已失效，请先重新登录APP'); return null
          }
          const unsupported = (error?.reason || error?.data?.reason) === 'ROUND_CODE_UNSUPPORTED'
          const message = unsupported
            ? 'APP已读出圆码，但当前服务无法还原其业务参数，请使用普通二维码或微信扫码'
            : [404, 405, 501].includes(error?.statusCode || error?.httpStatus)
            ? `圆码已识别，但服务器未提供解析接口（HTTP ${error?.statusCode || error?.httpStatus}），请更新后端或使用普通二维码/微信扫码。`
            : error?.msg || error?.message || '该圆码暂不可用，请刷新二维码或改扫普通二维码。'
          if (await fallback(message)) return standardScan()
          return null
        }
        if (getToken() !== token) { notify('账号已变化，请刷新网页二维码后重新扫码'); return null }
        const data = resolved?.data
        if (data?.kind === 'device' && tokenPattern.test(data.token || '')) {
          return { scanType: 'WX_CODE', path: '/pages-nonTheme/scan?scene=' + encodeURIComponent(data.token) }
        }
        if (data?.kind !== 'registration') {
          notify('圆码类型或参数异常，请使用普通二维码或微信扫码'); return null
        }
        if (!sessionPattern.test(data.sessionId || '')) {
          notify('这是小程序注册入口，请使用微信扫码'); return null
        }
        const id = data.sessionId
        try {
          await scanApp(id, token)
          if (getToken() !== token) { notify('账号已变化，请刷新网页二维码后重新扫码'); return null }
          const accepted = await confirm(getAccount(), id)
          if (getToken() !== token) { notify('账号已变化，请刷新网页二维码后重新扫码'); return null }
          if (!accepted) { await cancelApp(id, token).catch(() => {}); return null }
          await authorizeApp(id, token)
          notify('已确认网页登录，请返回网页查看')
        } catch (error) {
          notify([404, 405, 501].includes(error?.httpStatus)
            ? '当前服务暂不支持APP授权，请使用微信扫码'
            : error?.msg || error?.message || '网页登录未完成，请重新扫码')
        }
        return null
      } finally { busy = false }
    }
  }
}
