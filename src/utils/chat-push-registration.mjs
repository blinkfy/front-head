// Serialized identity transitions prevent a slow old login from reclaiming a device.
export function createPushRegistration({ request, getToken, deleteToken, readBinding, writeBinding, now = Date.now }) {
  let identity = '', generation = 0, nextAttempt = 0, disabled = false, chain = Promise.resolve()
  const nativeResult = fn => new Promise(resolve => fn(raw => {
    try { resolve(JSON.parse(raw)) } catch (_) { resolve({ error: 'INVALID_RESULT' }) }
  }))
  async function remove(binding) {
    let removed = !binding
    if (binding?.jwt && binding?.token) {
      try { await request('DELETE', '/api/chat/push/device', binding.jwt, { token: binding.token }); removed = true } catch (_) { /* Native revocation is also attempted. */ }
    }
    const result = await nativeResult(deleteToken)
    if (removed || result.ok) writeBinding(null)
    return removed || Boolean(result.ok)
  }
  function sync(jwt = '', force = false) {
    if (disabled) return chain
    const changed = identity !== jwt
    if (changed) { identity = jwt; generation++; nextAttempt = 0 }
    // Existing socket ticks only detect identity changes; they never poll HTTP.
    if ((!changed && !force) || now() < nextAttempt) return chain
    nextAttempt = now() + 300000
    const version = generation
    chain = chain.catch(() => {}).then(async () => {
      if (version !== generation) return
      const previous = readBinding()
      if (previous && previous.jwt !== jwt && !await remove(previous)) return
      if (version !== generation || !jwt) return
      const capability = await request('GET', '/api/chat/push/capabilities', jwt)
      if (!capability?.huawei || version !== generation) return
      const result = await nativeResult(getToken)
      if (result.error === 'UNSUPPORTED') { disabled = true; return }
      if (!result.token || version !== generation) return
      if (previous?.jwt === jwt && previous.token === result.token && now() - previous.boundAt < 86400000) {
        nextAttempt = now() + 300000
        return
      }
      // Persist before binding so a failed response can still be cleaned up on logout.
      const binding = { jwt, token: result.token }
      writeBinding(binding)
      await request('PUT', '/api/chat/push/device', jwt, { token: result.token })
      writeBinding({ ...binding, boundAt: now() })
      if (version === generation) nextAttempt = now() + 300000
    }).catch(() => {})
    return chain
  }
  function logout() {
    identity = ''; generation++; nextAttempt = now() + 300000
    chain = chain.catch(() => {}).then(() => remove(readBinding())).catch(() => {})
    return chain
  }
  return { sync, logout }
}
