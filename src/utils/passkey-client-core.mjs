export function createPasskeyAdapter({ environment, api, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let controller = null, capabilityCache = null, capabilityUntil = 0
  const cancelled = () => ({ error: 'CANCELLED' })
  function decode(value) {
    const raw = environment.atob(value.replace(/-/g, '+').replace(/_/g, '/'))
    return Uint8Array.from(raw, character => character.charCodeAt(0))
  }
  function encode(value) {
    if (value == null) return undefined
    return environment.btoa(Array.from(new Uint8Array(value), value => String.fromCharCode(value)).join(''))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }
  function publicOptions(options, create) {
    return { ...options, challenge: decode(options.challenge),
      ...(create ? { user: { ...options.user, id: decode(options.user.id) },
        excludeCredentials: (options.excludeCredentials || []).map(item => ({ ...item, id: decode(item.id) })) }
        : { allowCredentials: (options.allowCredentials || []).map(item => ({ ...item, id: decode(item.id) })) }) }
  }
  function serialize(credential, create) {
    if (!credential?.id || !credential.response) throw { error: 'UNAVAILABLE' }
    const response = credential.response
    return { id: credential.id, rawId: encode(credential.rawId), type: credential.type,
      authenticatorAttachment: credential.authenticatorAttachment || undefined,
      clientExtensionResults: credential.getClientExtensionResults?.() || {}, response: {
        clientDataJSON: encode(response.clientDataJSON),
        ...(create ? { attestationObject: encode(response.attestationObject), transports: response.getTransports?.() || [] }
          : { authenticatorData: encode(response.authenticatorData), signature: encode(response.signature), userHandle: encode(response.userHandle) })
      } }
  }
  async function ceremony(options, create, isActive) {
    if (!isActive()) throw cancelled()
    controller?.abort()
    const owner = new environment.AbortController()
    controller = owner
    let timer
    try {
      const timeout = new Promise((_, reject) => { timer = setTimer(() => { owner.abort(); reject(cancelled()) }, 65000) })
      const credential = await Promise.race([environment.navigator.credentials[create ? 'create' : 'get']({
        publicKey: publicOptions(options, create), signal: owner.signal
      }), timeout])
      if (!isActive() || owner.signal.aborted) throw cancelled()
      return serialize(credential, create)
    } catch (error) {
      if (error?.error) throw error
      if (['NotAllowedError', 'AbortError'].includes(error?.name)) throw cancelled()
      throw { error: 'UNAVAILABLE', msg: '当前浏览器未能完成通行密钥认证，可使用密码或微信扫码登录' }
    } finally { clearTimer(timer); if (controller === owner) controller = null }
  }
  async function capability() {
    const unsupported = { supported: false, enrolled: false, label: '通行密钥登录',
      message: '当前浏览器或网页地址暂不支持通行密钥，可使用密码或微信扫码登录' }
    if (!environment.isSecureContext || !environment.navigator?.credentials || !environment.PublicKeyCredential || !environment.AbortController) return unsupported
    if (capabilityCache && Date.now() < capabilityUntil) return capabilityCache
    let timer
    try {
      const available = await Promise.race([
        environment.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(),
        new Promise(resolve => { timer = setTimer(() => resolve(false), 3000) })
      ])
      if (!available) return unsupported
      const result = await api('/quick-login/capabilities', {}, '', 'GET')
      const supported = result.data?.passkey?.supported === true
      capabilityCache = { ...unsupported, supported, enrolled: supported }
      capabilityUntil = Date.now() + 15000
      return capabilityCache
    } catch (_) { return { ...unsupported, reason: 'service_unavailable' } }
    finally { clearTimer(timer) }
  }
  return {
    label: '通行密钥登录', capability,
    offerText: '下次未保持登录时，优先使用系统通行密钥验证。系统可能使用指纹、面容或设备 PIN。您可在「设置 → 账号与安全」中修改。',
    async enroll({ token, previousCredentialId, isActive }) {
      const { data } = await api('/quick-login/passkey/enrollment/options', { previousCredentialId }, token)
      const response = await ceremony(data.options, data.mode !== 'authenticate', isActive)
      if (!isActive()) throw cancelled()
      return (await api('/quick-login/passkey/enrollment/finish', { challengeId: data.challengeId, response }, token)).data
    },
    async login({ credentialId, mfaTicket, mfaSetupTicket, isActive }) {
      const { data } = await api('/quick-login/passkey/login/options', { credentialId, ...(mfaTicket ? { mfaTicket } : {}) })
      const response = await ceremony(data.options, false, isActive)
      if (!isActive()) throw cancelled()
      return api('/quick-login/passkey/login/finish', { challengeId: data.challengeId, response, ...(mfaSetupTicket ? { mfaSetupTicket } : {}) })
    },
    cancel() { controller?.abort(); controller = null }
  }
}
