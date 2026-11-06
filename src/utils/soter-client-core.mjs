export function createSoterAdapter({ runtime, api, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const pending = new Set()
  let selectedMode = '', cached = null, cachedUntil = 0
  function call(method, options = {}, timeout = 4000) {
    return new Promise((resolve, reject) => {
      let finished = false, timer
      const complete = (value, error) => {
        if (finished) return
        finished = true; clearTimer(timer); pending.delete(cancel)
        if (error) reject(value); else resolve(value)
      }
      const cancel = () => complete({ error: 'CANCELLED' }, true)
      pending.add(cancel)
      timer = setTimer(cancel, timeout)
      try {
        if (typeof runtime[method] !== 'function') return complete({ error: 'UNAVAILABLE' }, true)
        runtime[method]({ ...options, success: result => complete(result, false), fail: error => {
          const code = Number(error.errCode ?? error.errcode)
          const reason = [90008, 90009].includes(code) ? 'CANCELLED' : code === 90010 ? 'LOCKED' : 'UNAVAILABLE'
          complete({ error: reason }, true)
        } })
      } catch (_) { complete({ error: 'UNAVAILABLE' }, true) }
    })
  }
  const code = async () => {
    const result = await call('login', { provider: 'weixin' }, 10000)
    if (!result.code) throw { error: 'UNAVAILABLE' }
    return result.code
  }
  async function capability() {
    const no = { supported: false, enrolled: false, label: '指纹或面容登录', message: '当前微信或设备暂不支持生物认证，可使用微信或密码登录' }
    if (cached && Date.now() < cachedUntil) return cached
    try {
      const modes = (await call('checkIsSupportSoterAuthentication')).supportMode || []
      let supported = false, enrolled = false
      selectedMode = ''
      for (const mode of ['facial', 'fingerPrint']) {
        if (!modes.includes(mode)) continue
        supported = true
        try {
          const result = await call('checkIsSoterEnrolledInDevice', { checkAuthMode: mode })
          if (result.isEnrolled === true) { selectedMode = mode; enrolled = true; break }
        } catch (error) { if (error.error === 'CANCELLED') throw error }
      }
      if (!supported) return no
      const config = await api('/quick-login/capabilities', {}, '', 'GET')
      if (config.data?.soter?.supported !== true) return no
      cached = { ...no, supported, enrolled, label: selectedMode === 'facial' ? '面容登录' : selectedMode === 'fingerPrint' ? '指纹登录' : no.label,
        message: enrolled ? '' : '请先在手机系统设置中录入指纹或面容' }
      cachedUntil = Date.now() + 10000
      return cached
    } catch (_) { return { ...no, reason: 'service_unavailable' } }
  }
  async function proof(data, isActive) {
    if (!isActive()) throw { error: 'CANCELLED' }
    const result = await call('startSoterAuthentication', { requestAuthModes: [selectedMode], challenge: data.payload, authContent: '验证身份以登录分投侠' }, 65000)
    if (!isActive()) throw { error: 'CANCELLED' }
    if (!result.resultJSON || !result.resultJSONSignature) throw { error: 'UNAVAILABLE' }
    return { challengeId: data.challengeId, resultJSON: result.resultJSON, resultJSONSignature: result.resultJSONSignature }
  }
  return {
    label: '指纹或面容登录', capability,
    offerText: '下次未保持登录时，优先使用系统指纹或面容认证，并核验当前微信身份。您可在「设置 → 账号与安全」中修改。',
    async enroll({ token, isActive }) {
      const { data } = await api('/quick-login/soter/enrollment/options', { code: await code() }, token)
      const response = await proof(data, isActive)
      return (await api('/quick-login/soter/enrollment/finish', response, token)).data
    },
    async login({ credentialId, isActive }) {
      const { data } = await api('/quick-login/soter/login/options', { credentialId, code: await code() })
      return api('/quick-login/soter/login/finish', await proof(data, isActive))
    },
    async probeSession(token) { return api('/quick-login/soter/session', { code: await code() }, token) },
    cancel() { for (const cancel of [...pending]) cancel() }
  }
}
