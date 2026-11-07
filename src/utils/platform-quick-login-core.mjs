// Preferences contain only opaque credential IDs, never passwords/private keys.
export function createPlatformQuickLogin({ runtime, adapter, api, scope }) {
  const key = `platform_quick_login_v1:${encodeURIComponent(scope)}`
  let busy = false
  const state = () => ({ enabled: true, prompted: false, ...(runtime.getStorageSync(key) || {}) })
  const save = patch => { const next = { ...state(), ...patch }; runtime.setStorageSync(key, next); return next }
  function recordEnrollmentError(error) {
    if (error?.error !== 'CANCELLED') save({ enrollmentError: error?.reason || 'enrollment_failed' })
  }
  function retire(binding) {
    if (!binding.credentialId) return
    const pending = state().pendingRevocations || []
    if (!pending.some(item => item.credentialId === binding.credentialId)) {
      save({ pendingRevocations: [...pending, { credentialId: binding.credentialId, userId: binding.userId }] })
    }
  }
  function clearBinding() {
    const current = state()
    retire(current)
    return save({ credentialId: '', userId: null, username: '', enrollmentError: '',
      ...(current.credentialId ? { previousCredentialId: current.credentialId, previousUserId: current.userId } : {}) })
  }
  async function flush(token, userId) {
    const removed = new Set()
    for (const item of state().pendingRevocations || []) {
      if (String(item.userId) !== String(userId)) continue
      try { await api(`/quick-login/credentials/${item.credentialId}`, {}, token, 'DELETE'); removed.add(item.credentialId) } catch (_) {}
    }
    save({ pendingRevocations: (state().pendingRevocations || []).filter(item => !removed.has(item.credentialId)) })
    return { revocationPending: state().pendingRevocations.some(item => String(item.userId) === String(userId)) }
  }
  async function enroll(token, user, isActive, options = {}) {
    const before = state()
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
        pendingRevocations: (state().pendingRevocations || []).filter(item => item.credentialId !== result.credentialId) })
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
    state,
    async capability() {
      try { return await adapter.capability() }
      catch (_) { return { supported: false, enrolled: false, label: adapter.label, reason: 'service_unavailable' } }
    },
    async afterLogin(token, user, isActive = () => true, owner) {
      if (busy || !Number.isSafeInteger(Number(user?.id)) || Number(user.id) <= 0 || !isActive()) return
      busy = true
      try {
        let current = state()
        if (current.credentialId && String(current.userId) !== String(user.id)) current = clearBinding()
        await flush(token, user.id)
        if (!isActive() || runtime.getStorageSync('token') !== token) return
        if (current.credentialId) runtime.removeStorageSync('savedUser')
        if (!current.enabled || current.prompted || current.credentialId) return
        const support = await adapter.capability()
        if (!support.supported || !support.enrolled || !isActive() || runtime.getStorageSync('token') !== token) return
        save({ prompted: true })
        const accepted = await runtime.confirm({ title: `开启${support.label || adapter.label}`,
          content: adapter.offerText, confirmText: '开启', cancelText: '暂不开启' })
        if (!isActive() || runtime.getStorageSync('token') !== token) return
        if (!accepted) { save({ enabled: false }); return }
        try { await enroll(token, user, isActive, { owner }) }
        catch (error) {
          if (isActive() && runtime.getStorageSync('token') === token) recordEnrollmentError(error)
          throw error
        }
      } finally { busy = false }
    },
    async setEnabled(enabled, token, user, isActive = () => true, options = {}) {
      if (busy) throw { error: 'BUSY' }
      busy = true
      const current = state()
      try {
        save({ enabled: Boolean(enabled), prompted: true, enrollmentError: '' })
        if (!enabled) { clearBinding(); return await flush(token, user.id) }
        const support = await adapter.capability()
        if (!support.supported || !support.enrolled) throw { error: 'UNAVAILABLE', msg: support.message }
        if (!options.forceCreate && current.credentialId && String(current.userId) === String(user.id)) return
        await enroll(token, user, isActive, options)
      } catch (error) {
        if (enabled && !state().credentialId && runtime.getStorageSync('token') === token) save({ enabled: current.enabled })
        if (enabled && isActive() && runtime.getStorageSync('token') === token) recordEnrollmentError(error)
        throw error
      } finally { busy = false }
    },
    async syncRevocations(token, userId) {
      if (busy) return
      busy = true
      try { return await flush(token, userId) } finally { busy = false }
    },
    async login(isActive = () => true, owner) {
      const current = state()
      if (busy || !current.enabled || !current.credentialId) return null
      busy = true
      try {
        const result = await adapter.login({ credentialId: current.credentialId, isActive, owner })
        return isActive() ? result : null
      } catch (error) {
        if (error?.reason === 'invalid_credential') clearBinding()
        throw error
      } finally { busy = false }
    },
    suspendSystemAuthentication: owner => adapter.suspendSystemAuthentication?.(owner) === true,
    resumeSystemAuthentication: owner => adapter.resumeSystemAuthentication?.(owner),
    cancel() { adapter.cancel() },
    async forgetBinding() { clearBinding() },
    probeSession: token => adapter.probeSession ? adapter.probeSession(token) : api('/userinfo?avater=false', {}, token, 'GET')
  }
}
