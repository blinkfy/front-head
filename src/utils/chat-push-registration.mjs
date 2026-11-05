// Only explicit public fields may leave the native bridge through diagnostic logs.
function nativeFailureDetails(result) {
  const details = {}
  if (Number.isInteger(result.hmsCode) && result.hmsCode > 0 && result.hmsCode <= 2147483647) details.hmsCode = result.hmsCode
  if (['ApiException', 'IllegalArgumentException', 'IllegalStateException', 'SecurityException',
    'NullPointerException', 'RuntimeException', 'IOException', 'Exception'].includes(result.exceptionType)) details.exceptionType = result.exceptionType
  if (typeof result.packageName === 'string' && /^[A-Za-z][\w]*(?:\.[A-Za-z][\w]*){1,20}$/.test(result.packageName) && result.packageName.length <= 160) details.packageName = result.packageName
  if (typeof result.expectedAppId === 'string' && /^\d{1,20}$/.test(result.expectedAppId)) details.expectedAppId = result.expectedAppId
  if (typeof result.manifestAppId === 'string' && /^(?:appid=\d{1,20}|MISSING)$/.test(result.manifestAppId)) details.manifestAppId = result.manifestAppId
  if (typeof result.certificateSha256 === 'string' && /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(result.certificateSha256)) details.certificateSha256 = result.certificateSha256
  return details
}

// Serialized identity transitions prevent a slow old login from reclaiming a device.
export function createPushRegistration({ request, getToken, deleteToken, readBinding, writeBinding, now = Date.now, onStatus = () => {} }) {
  let identity = '', generation = 0, nextAttempt = 0, disabled = false, chain = Promise.resolve()
  const report = (stage, status, extra = {}) => {
    try { onStatus({ stage, status, ...extra }) } catch (_) {}
  }
  const nativeErrors = new Set(['UNSUPPORTED', 'UNAVAILABLE', 'TOKEN_PENDING', 'TOKEN_UNAVAILABLE', 'NOTIFICATIONS_DISABLED', 'NOTIFICATIONS_UNAVAILABLE', 'INVALID_RESULT'])
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
    let stage = 'cleanup'
    chain = chain.catch(() => {}).then(async () => {
      if (version !== generation) return
      const previous = readBinding()
      if (previous && previous.jwt !== jwt && !await remove(previous)) return
      if (version !== generation || !jwt) return
      stage = 'capabilities'
      const capability = await request('GET', '/api/chat/push/capabilities', jwt)
      if (version !== generation) return
      if (!capability?.huawei) { report(stage, 'DISABLED'); return }
      stage = 'native-token'
      const result = await nativeResult(getToken)
      if (version !== generation) return
      if (!result.token) {
        report(stage, nativeErrors.has(result.error) ? result.error : 'TOKEN_UNAVAILABLE', nativeFailureDetails(result))
        if (result.error === 'UNSUPPORTED') disabled = true
        return
      }
      if (previous?.jwt === jwt && previous.token === result.token && now() - previous.boundAt < 86400000) {
        report('binding', 'READY')
        nextAttempt = now() + 300000
        return
      }
      // Persist before binding so a failed response can still be cleaned up on logout.
      const binding = { jwt, token: result.token }
      writeBinding(binding)
      stage = 'binding'
      await request('PUT', '/api/chat/push/device', jwt, { token: result.token })
      writeBinding({ ...binding, boundAt: now() })
      if (version === generation) {
        nextAttempt = now() + 300000
        report(stage, 'READY')
      }
    }).catch(error => {
      if (version === generation) report(stage, 'REQUEST_FAILED',
        Number.isInteger(error?.pushHttpStatus) ? { httpStatus: error.pushHttpStatus } : {})
    })
    return chain
  }
  function logout() {
    identity = ''; generation++; nextAttempt = now() + 300000
    chain = chain.catch(() => {}).then(() => remove(readBinding())).catch(() => {})
    return chain
  }
  return { sync, logout }
}
