import assert from 'node:assert/strict'
import { createPlatformQuickLogin } from '../src/utils/platform-quick-login-core.mjs'
import { createBiometricLoginManager } from '../src/utils/biometric-login-core.mjs'

const user = { id: 7, username: 'alice' }
const tick = () => new Promise(resolve => setImmediate(resolve))
function deferred() { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
function fixture(kind, initial = {}) {
  const key = kind === 'app' ? 'biometric_login_v1:race' : 'platform_quick_login_v1:race'
  const storage = new Map([['token', 'session-a'], [key, { userId: 7, ...initial }]])
  const requests = [], prompts = [], nativeCalls = []
  let supportHook, enrollmentHook, loginHook, deleteHook, confirmHook, signError, createHook
  const runtime = { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key), confirm: async value => { prompts.push(value); return confirmHook ? confirmHook() : true } }
  const support = async () => { supportHook?.(); return { supported: true, enrolled: true } }
  const api = async (path, body, token, method) => {
    requests.push({ path, body, token, method })
    if (method === 'DELETE') { await deleteHook?.(); return {} }
    if (path === '/biometric/enrollment/options') return { data: { challengeId: 'challenge', credentialId: 'new-key', payload: 'proof' } }
    if (path === '/biometric/enrollment/finish') return { data: { userId: 7 } }
    if (path === '/biometric/login/options') return { data: { challengeId: 'login', payload: 'proof' } }
    if (path === '/biometric/login/finish') return loginHook?.() || { token: 'session-new', accountId: 7 }
    return {}
  }
  const native = async options => {
    nativeCalls.push(options.operation)
    if (options.operation === 'create') await createHook?.()
    if (options.operation === 'capability') return support()
    if (options.operation === 'sign' && signError) throw signError
    return options.operation === 'create' ? { publicKey: 'public-key' } : { signature: 'signature' }
  }
  const adapter = { capability: support, cancel() {},
    enroll: async options => enrollmentHook?.(options) || { credentialId: 'new-key', userId: 7 },
    login: async () => loginHook?.() || { token: 'session-new', accountId: 7 } }
  const manager = kind === 'app' ? createBiometricLoginManager({ runtime, api, native, scope: 'race' }) : createPlatformQuickLogin({ runtime, api, adapter, scope: 'race' })
  return { manager, storage, requests, prompts, nativeCalls,
    overwrite: value => storage.set(key, { userId: 7, ...value }),
    createHook: value => { createHook = value }, confirmHook: value => { confirmHook = value }, supportHook: value => { supportHook = value }, enrollmentHook: value => { enrollmentHook = value },
    loginHook: value => { loginHook = value }, deleteHook: value => { deleteHook = value }, signError: value => { signError = value } }
}

const tests = []
for (const kind of ['web', 'app']) {
  tests.push([`${kind}: stale credential failure preserves replacement`, async () => {
    const f = fixture(kind, { enabled: true, prompted: true, credentialId: 'old-key' })
    f.loginHook(() => { f.overwrite({ enabled: true, prompted: true, credentialId: 'replacement-key' }); throw { reason: 'invalid_credential' } })
    await assert.rejects(f.manager.login())
    assert.equal(f.manager.state(7).credentialId, 'replacement-key')
  }])
  tests.push([`${kind}: changed preferences suppress stale enrollment prompt`, async () => {
    const f = fixture(kind, { enabled: true, prompted: false })
    f.supportHook(() => f.overwrite({ enabled: false, prompted: true }))
    await f.manager.afterLogin('session-a', user)
    assert.equal(f.prompts.length, 0)
    assert.equal(f.manager.state(7).enabled, false)
  }])
  tests.push([`${kind}: obsolete confirmation cannot undo another window's choice`, async () => {
    const f = fixture(kind, { enabled: true, prompted: false })
    f.confirmHook(() => { f.overwrite({ enabled: false, prompted: true }); return true })
    await f.manager.afterLogin('session-a', user)
    assert.equal(f.manager.state(7).enabled, false)
    assert.equal(f.manager.state(7).credentialId, undefined)
  }])
  tests.push([`${kind}: delayed capability check preserves a newer binding`, async () => {
    const f = fixture(kind, { enabled: true, prompted: true, credentialId: 'old-key' })
    f.supportHook(() => f.overwrite({ enabled: true, prompted: true, credentialId: 'replacement-key' }))
    await f.manager.setEnabled(true, 'session-a', user)
    assert.equal(f.manager.state(7).credentialId, 'replacement-key')
  }])
  tests.push([`${kind}: old enrollment cleanup preserves new account password`, async () => {
    const initial = kind === 'web' ? { enabled: true, prompted: true, credentialId: 'old-key' } : {
      enabled: false, prompted: true, pendingRevocations: [{ userId: 7, credentialId: 'old-key' }] }
    const f = fixture(kind, initial), gate = deferred()
    f.deleteHook(() => gate.promise)
    const request = f.manager.setEnabled(true, 'session-a', user, () => true, { forceCreate: true })
    await tick()
    assert.equal(f.manager.state(7).credentialId, 'new-key', 'enrollment committed before cleanup is suspended')
    f.storage.set('token', 'session-b'); f.storage.set('savedUser', { username: 'bob', password: 'test-only' })
    gate.resolve(); await request
    assert.equal(f.storage.get('savedUser')?.username, 'bob')
  }])
}
tests.push(['app: cancelled first enrollment restores disabled switch', async () => {
  const f = fixture('app', { enabled: false, prompted: true })
  f.signError({ error: 'CANCELLED' })
  await assert.rejects(f.manager.setEnabled(true, 'session-a', user))
  assert.equal(f.manager.state(7).enabled, false)
}])
tests.push(['app: account switch during key creation never opens stale authentication', async () => {
  const f = fixture('app', { enabled: false, prompted: true }), gate = deferred()
  f.createHook(() => gate.promise)
  const request = f.manager.setEnabled(true, 'session-a', user)
  await tick()
  assert.ok(f.nativeCalls.includes('create'))
  f.storage.set('token', 'session-b'); gate.resolve()
  await assert.rejects(request)
  assert.equal(f.nativeCalls.includes('sign'), false)
  assert.ok(f.nativeCalls.includes('delete'), 'cancelled enrollment removes the orphan key')
}])

tests.push(['web: cancelled reuse never revokes an existing passkey', async () => {
  const f = fixture('web', { enabled: true, prompted: true, previousCredentialId: 'existing-key', previousUserId: 7 })
  f.enrollmentHook(() => { f.storage.set('token', 'session-b'); return { credentialId: 'existing-key', userId: 7 } })
  await assert.rejects(f.manager.setEnabled(true, 'session-a', user))
  assert.equal(f.requests.some(item => item.method === 'DELETE' && item.path.endsWith('/existing-key')), false)
}])
let failures = 0
for (const [name, run] of tests) {
  try { await run(); console.log(`PASS ${name}`) }
  catch (error) { failures++; console.error(`FAIL ${name}: ${error.message}`) }
}
assert.equal(failures, 0, `${failures} quick-login state race checks failed`)
