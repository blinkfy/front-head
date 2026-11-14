// Only account metadata and opaque credential IDs belong in this store.
export function createQuickLoginAccounts({ runtime, key }) {
  const accountId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? String(Number(value)) : ''
  const fields = ['enabled', 'prompted', 'credentialId', 'username', 'enrollmentError', 'previousCredentialId', 'previousUserId']
  const preferences = value => {
    const result = {}
    for (const field of fields) if (value && Object.prototype.hasOwnProperty.call(value, field)) result[field] = value[field]
    return result
  }
  const defaults = (id, value) => ({ enabled: true, prompted: false, ...preferences(value), userId: id ? Number(id) : null })
  function read() {
    const value = runtime.getStorageSync(key)
    if (value?.version === 2 && value.accounts && typeof value.accounts === 'object') {
      const accounts = {}
      for (const [id, item] of Object.entries(value.accounts)) {
        if (accountId(id) === id) accounts[id] = defaults(id, item)
      }
      return { version: 2, selectedUserId: accountId(value.selectedUserId), accounts,
        unassigned: preferences(value.unassigned), pendingRevocations: Array.isArray(value.pendingRevocations) ? value.pendingRevocations.map(item => ({ ...item })) : [] }
    }
    const id = accountId(value?.userId) || accountId(value?.previousUserId)
    const migrated = { version: 2, selectedUserId: id, accounts: id ? { [id]: defaults(id, value) } : {},
      unassigned: id ? {} : { ...(typeof value?.enabled === 'boolean' ? { enabled: value.enabled } : {}), ...(typeof value?.prompted === 'boolean' ? { prompted: value.prompted } : {}) }, pendingRevocations: Array.isArray(value?.pendingRevocations) ? value.pendingRevocations.map(item => ({ ...item })) : [] }
    if (value && typeof value === 'object') runtime.setStorageSync(key, migrated)
    return migrated
  }
  function state(userId) {
    const root = read(), id = userId === undefined ? root.selectedUserId : accountId(userId)
    return { ...defaults(id, id ? root.accounts[id] : root.unassigned), pendingRevocations: root.pendingRevocations }
  }
  function save(patch, userId) {
    const root = read(), id = userId === undefined ? root.selectedUserId : accountId(userId)
    if (Array.isArray(patch.pendingRevocations)) root.pendingRevocations = patch.pendingRevocations.map(item => ({ ...item }))
    if (id) root.accounts[id] = defaults(id, { ...root.accounts[id], ...preferences(patch) })
    else root.unassigned = { ...root.unassigned, ...preferences(patch) }
    runtime.setStorageSync(key, root)
    return state(id || undefined)
  }
  function activate(user) {
    const id = accountId(user?.id)
    if (!id) throw { error: 'UNAVAILABLE', msg: '账号信息无效，请重新登录' }
    const root = read()
    if (!root.accounts[id]) { root.accounts[id] = defaults(id, root.unassigned); root.unassigned = {} }
    if (typeof user.username === 'string') root.accounts[id].username = user.username
    root.selectedUserId = id
    runtime.setStorageSync(key, root)
    return state(id)
  }
  function accounts() {
    const root = read()
    return Object.values(root.accounts).filter(item => item.enabled && item.credentialId &&
      !root.pendingRevocations.some(pending => pending.credentialId === item.credentialId && String(pending.userId) === String(item.userId)))
      .map(item => ({ ...item }))
  }
  function select(userId) {
    const id = accountId(userId), root = read()
    if (!accounts().some(item => String(item.userId) === id)) return false
    root.selectedUserId = id
    runtime.setStorageSync(key, root)
    return true
  }
  return { state, save, activate, accounts, select }
}
