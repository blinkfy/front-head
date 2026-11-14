import { createQuickLoginAccounts } from './quick-login-accounts.mjs'

// This module has no platform globals; native code owns the private signing key.
export function createBiometricLoginManager({ runtime, native, api, scope }) {
  const storageKey = `biometric_login_v1:${encodeURIComponent(scope)}`
  let busy = false
  const { state, save, activate, accounts, select } = createQuickLoginAccounts({ runtime, key: storageKey })
  function retire(current) {
    if (!current.credentialId) return
    const pending = state(current.userId).pendingRevocations || []
    if (!pending.some(item => item.credentialId === current.credentialId)) {
      save({ pendingRevocations: [...pending, { credentialId: current.credentialId, userId: current.userId }] }, current.userId)
    }
  }
  function clearBinding(userId) {
    const current = state(userId)
    retire(current)
    return save({ credentialId: '' }, current.userId)
  }
  async function flushRevocations(token, userId) {
    const pending = state().pendingRevocations || []
    const removed = new Set()
    for (const item of pending) {
      if (String(item.userId) !== String(userId)) continue
      try { await api(`/biometric/credentials/${item.credentialId}`, {}, token, 'DELETE'); removed.add(item.credentialId) } catch (_) {}
    }
    save({ pendingRevocations: (state(userId).pendingRevocations || []).filter(item => !removed.has(item.credentialId)) }, userId)
  }
  async function capability() {
    try { return await native({ operation: 'capability' }) }
    catch (_) { return { supported: false, enrolled: false, label: '指纹或面容登录' } }
  }
  async function removeKey(id) { if (id) { try { await native({ operation: 'delete', keyId: id }) } catch (_) {} } }
  async function bind(token, user, isActive = () => true) {
    const options = await api('/biometric/enrollment/options', {}, token)
    const { credentialId, payload, challengeId } = options.data
    let committed = false
    try {
      if (!isActive()) throw { error: 'CANCELLED' }
      const { publicKey } = await native({ operation: 'create', keyId: credentialId })
      const { signature } = await native({ operation: 'sign', keyId: credentialId, payload })
      if (!isActive() || runtime.getStorageSync('token') !== token) throw { error: 'CANCELLED' }
      const result = await api('/biometric/enrollment/finish', { challengeId, publicKey, signature }, token)
      if (!isActive() || runtime.getStorageSync('token') !== token) throw { error: 'CANCELLED' }
      if (String(result?.data?.userId) !== String(user.id)) throw { error: 'ACCOUNT_MISMATCH', msg: '认证账号不匹配，请重新登录' }
      const previous = state(user.id)
      save({ enabled: true, prompted: true, credentialId, userId: result.data.userId, username: result.data.username || user.username }, user.id)
      committed = true
      retire(previous)
      await removeKey(previous.credentialId)
      await flushRevocations(token, user.id)
      // Once provisioned, never keep a plaintext password as a biometric fallback.
      runtime.removeStorageSync('savedUser')
      return true
    } finally { if (!committed) await removeKey(credentialId) }
  }
  return {
    state, capability, accounts,
    selectAccount: userId => !busy && select(userId),
    async afterLogin(token, user, isActive = () => true) {
      if (busy || !Number.isSafeInteger(Number(user?.id)) || Number(user.id) <= 0 || !isActive() || runtime.getStorageSync('token') !== token) return
      busy = true
      try {
        const current = activate(user)
        await flushRevocations(token, user.id)
        if (!isActive() || runtime.getStorageSync('token') !== token) return
        if (current.credentialId) runtime.removeStorageSync('savedUser')
        if (!current.enabled || current.prompted || current.credentialId) return
        const support = await capability()
        if (!support.supported || !support.enrolled || !isActive() || runtime.getStorageSync('token') !== token) return
        // Record before presenting: cancelling, errors, or a restart cannot repeat this offer.
        save({ prompted: true }, user.id)
        const accepted = await runtime.confirm({ title: `开启${support.label || '指纹或面容登录'}`,
          content: '下次未保持登录时，将优先使用系统指纹或面容认证。您可随时在「设置 → 账号与安全」中修改。',
          confirmText: '开启', cancelText: '暂不开启' })
        if (!isActive() || runtime.getStorageSync('token') !== token) return
        if (!accepted) { save({ enabled: false }, user.id); return }
        await bind(token, user, isActive)
      } finally { busy = false }
    },
    async setEnabled(enabled, token, user, isActive = () => true) {
      if (busy) throw { error: 'BUSY' }
      if (!isActive() || runtime.getStorageSync('token') !== token) throw { error: 'CANCELLED' }
      const current = activate(user)
      busy = true
      try {
        save({ enabled: Boolean(enabled), prompted: true }, user.id)
        if (!enabled) {
          clearBinding(user.id)
          await removeKey(current.credentialId)
          await flushRevocations(token, user.id)
          return
        }
        const support = await capability()
        if (!support.supported || !support.enrolled) throw { error: 'NOT_ENROLLED' }
        if (current.credentialId && accounts().some(item => item.credentialId === current.credentialId && String(item.userId) === String(user.id))) return
        await bind(token, user, isActive)
      } finally { busy = false }
    },
    async login(isActive = () => true, owner, { mfaSetupTicket, userId } = {}) {
      const current = state(userId)
      if (busy || !current.enabled || !current.credentialId || !accounts().some(item => item.credentialId === current.credentialId && String(item.userId) === String(current.userId))) return null
      busy = true
      try {
        const options = await api('/biometric/login/options', { credentialId: current.credentialId })
        if (!isActive()) throw { error: 'CANCELLED' }
        const { signature } = await native({ operation: 'sign', keyId: current.credentialId, payload: options.data.payload })
        if (!isActive()) throw { error: 'CANCELLED' }
        const result = await api('/biometric/login/finish', { challengeId: options.data.challengeId, signature, ...(mfaSetupTicket ? { mfaSetupTicket } : {}) })
        if (!isActive()) return null
        if (String(result?.accountId) !== String(current.userId)) throw { error: 'ACCOUNT_MISMATCH', msg: '认证账号不匹配，请重新选择账号' }
        return result
      } catch (error) {
        if (error?.error === 'KEY_INVALID' || error?.reason === 'invalid_credential') {
          await removeKey(current.credentialId)
          clearBinding(current.userId)
        }
        throw error
      } finally { busy = false }
    },
    cancel() { try { void native({ operation: 'cancel' }).catch(() => {}) } catch (_) {} },
    async forgetBinding(userId) { if (busy) throw { error: 'BUSY' }; const current = state(userId); clearBinding(userId); await removeKey(current.credentialId) }
  }
}

export function biometricErrorMessage(error) {
  if (error?.error === 'CANCELLED') return ''
  if (error?.error === 'LOCKED') return '系统认证暂时锁定，请使用其他方式登录'
  if (error?.error === 'KEY_INVALID' || error?.reason === 'invalid_credential') return '本机授权已失效，请登录后在账号与安全中重新开启'
  if (error?.error === 'NOT_ENROLLED') return '请先在手机系统设置中录入指纹或面容'
  if (error?.error === 'UNAVAILABLE') return error.msg || '此设备暂不支持系统认证，请使用其他方式登录'
  return error?.msg || error?.message || '暂时无法完成系统认证，请使用其他方式登录'
}
