import { createQuickLoginAccounts } from './quick-login-accounts.mjs'

// Preferences contain only opaque credential IDs, never passwords/private keys.
export function createPlatformQuickLogin({ runtime, adapter, api, scope }) {
  const key = `platform_quick_login_v1:${encodeURIComponent(scope)}`
  let busy = false
  const { state, save, activate, accounts, select } = createQuickLoginAccounts({ runtime, key })
  function recordEnrollmentError(error, userId) {
    if (error?.error !== 'CANCELLED') save({ enrollmentError: error?.reason || 'enrollment_failed' }, userId)
  }
  function retire(binding) {
    if (!binding.credentialId) return
    const pending = state(binding.userId).pendingRevocations || []
    if (!pending.some(item => item.credentialId === binding.credentialId)) {
      save({ pendingRevocations: [...pending, { credentialId: binding.credentialId, userId: binding.userId }] }, binding.userId)
    }
  }
  function clearBinding(userId) {
    const current = state(userId)
    retire(current)
    return save({ credentialId: '', enrollmentError: '',
      ...(current.credentialId ? { previousCredentialId: current.credentialId, previousUserId: current.userId } : {}) }, current.userId)
  }
  async function flush(token, userId) {
    const removed = new Set()
    for (const item of state().pendingRevocations || []) {
      if (String(item.userId) !== String(userId)) continue
      try { await api(`/quick-login/credentials/${item.credentialId}`, {}, token, 'DELETE'); removed.add(item.credentialId) } catch (_) {}
    }
    save({ pendingRevocations: (state(userId).pendingRevocations || []).filter(item => !removed.has(item.credentialId)) }, userId)
    return { revocationPending: state(userId).pendingRevocations.some(item => String(item.userId) === String(userId)) }
  }
  async function enroll(token, user, isActive, options = {}) {
    const before = state(user.id)
    await flush(token, user.id)
    if (!isActive() || runtime.getStorageSync('token') !== token) throw { error: 'CANCELLED' }
    const previousCredentialId = String(before.previousUserId) === String(user.id) ? before.previousCredentialId : ''
    let result, committed = false
    try {
      const canCommit = () => isActive() && runtime.getStorageSync('token') === token
      result = await adapter.enroll({ token, user, previousCredentialId: options.forceCreate ? '' : previousCredentialId,
        isActive: canCommit, owner: options.owner })
      if (!isActive() || runtime.getStorageSync('token') !== token) throw { error: 'CANCELLED' }
      if (!result?.credentialId || String(result.userId) !== String(user.id)) throw { error: 'UNAVAILABLE' }
      save({ enabled: true, prompted: true, credentialId: result.credentialId, userId: result.userId, enrollmentError: '',
        username: result.username || user.username, previousCredentialId: '', previousUserId: null,
        pendingRevocations: (state(user.id).pendingRevocations || []).filter(item => item.credentialId !== result.credentialId) }, user.id)
      committed = true
      if (before.credentialId && before.credentialId !== result.credentialId) retire(before)
      await flush(token, user.id)
      runtime.removeStorageSync('savedUser')
      return true
    } finally {
      if (!committed && result?.credentialId) {
        try { await api(`/quick-login/credentials/${result.credentialId}`, {}, token, 'DELETE') } catch (_) {}
      }
    }
  }
  return {
    state, accounts,
    selectAccount: userId => !busy && select(userId),
    async capability() {
      try { return await adapter.capability() }
      catch (_) { return { supported: false, enrolled: false, label: adapter.label, reason: 'service_unavailable' } }
    },
    async afterLogin(token, user, isActive = () => true, owner) {
      if (busy || !Number.isSafeInteger(Number(user?.id)) || Number(user.id) <= 0 || !isActive() || runtime.getStorageSync('token') !== token) return
      busy = true
      try {
        const current = activate(user)
        await flush(token, user.id)
        if (!isActive() || runtime.getStorageSync('token') !== token) return
        if (current.credentialId) runtime.removeStorageSync('savedUser')
        if (!current.enabled || current.prompted || current.credentialId) return
        const support = await adapter.capability()
        if (!support.supported || !support.enrolled || !isActive() || runtime.getStorageSync('token') !== token) return
        save({ prompted: true }, user.id)
        const accepted = await runtime.confirm({ title: `开启${support.label || adapter.label}`,
          content: adapter.offerText, confirmText: '开启', cancelText: '暂不开启' })
        if (!isActive() || runtime.getStorageSync('token') !== token) return
        if (!accepted) { save({ enabled: false }, user.id); return }
        try { await enroll(token, user, isActive, { owner }) }
        catch (error) {
          if (isActive() && runtime.getStorageSync('token') === token) recordEnrollmentError(error, user.id)
          throw error
        }
      } finally { busy = false }
    },
    async setEnabled(enabled, token, user, isActive = () => true, options = {}) {
      if (busy) throw { error: 'BUSY' }
      if (!isActive() || runtime.getStorageSync('token') !== token) throw { error: 'CANCELLED' }
      const current = activate(user)
      busy = true
      try {
        save({ enabled: Boolean(enabled), prompted: true, enrollmentError: '' }, user.id)
        if (!enabled) { clearBinding(user.id); return await flush(token, user.id) }
        const support = await adapter.capability()
        if (!support.supported || !support.enrolled) throw { error: 'UNAVAILABLE', msg: support.message }
        if (!options.forceCreate && current.credentialId && accounts().some(item => item.credentialId === current.credentialId && String(item.userId) === String(user.id))) return
        await enroll(token, user, isActive, options)
      } catch (error) {
        if (enabled && !state(user.id).credentialId && runtime.getStorageSync('token') === token) save({ enabled: current.enabled }, user.id)
        if (enabled && isActive() && runtime.getStorageSync('token') === token) recordEnrollmentError(error, user.id)
        throw error
      } finally { busy = false }
    },
    async syncRevocations(token, userId) {
      if (busy) return
      busy = true
      try { return await flush(token, userId) } finally { busy = false }
    },
    async login(isActive = () => true, owner, { mfaSetupTicket, userId } = {}) {
      const current = state(userId)
      if (busy || !current.enabled || !current.credentialId || !accounts().some(item => item.credentialId === current.credentialId && String(item.userId) === String(current.userId))) return null
      busy = true
      try {
        const result = await adapter.login({ credentialId: current.credentialId, isActive, owner, ...(mfaSetupTicket ? { mfaSetupTicket } : {}) })
        if (!isActive()) return null
        if (String(result?.accountId) !== String(current.userId)) throw { error: 'ACCOUNT_MISMATCH', msg: '认证账号不匹配，请重新选择账号' }
        return result
      } catch (error) {
        if (error?.reason === 'invalid_credential') clearBinding(current.userId)
        throw error
      } finally { busy = false }
    },
    suspendSystemAuthentication: owner => adapter.suspendSystemAuthentication?.(owner) === true,
    resumeSystemAuthentication: owner => adapter.resumeSystemAuthentication?.(owner),
    cancel() { adapter.cancel() },
    async forgetBinding(userId) { if (busy) throw { error: 'BUSY' }; clearBinding(userId) },
    probeSession: token => adapter.probeSession ? adapter.probeSession(token) : api('/userinfo?avater=false', {}, token, 'GET')
  }
}
