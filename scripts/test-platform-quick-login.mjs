import assert from 'node:assert/strict'
import { createPlatformQuickLogin } from '../src/utils/platform-quick-login-core.mjs'
import { createPasskeyAdapter } from '../src/utils/passkey-client-core.mjs'
import { createSoterAdapter } from '../src/utils/soter-client-core.mjs'

function quickFixture({ accepted = true, support = { supported: true, enrolled: true, label: '指纹登录' } } = {}) {
  const storage = new Map([['token', 'token-1']]), prompts = [], requests = [], enrollments = [], logins = []
  let adapterError, enrollHook, apiFailure = false
  const runtime = { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key), confirm: async options => { prompts.push(options); return accepted } }
  const api = async (path, body, token, method) => {
    requests.push({ path, body, token, method })
    if (apiFailure && method === 'DELETE') throw new Error('offline')
    return {}
  }
  const adapter = { label: '指纹登录', offerText: 'offer', capability: async () => support,
    enroll: async options => { enrollments.push(options); if (enrollHook) return enrollHook(options); return { credentialId: `key-${enrollments.length}`, userId: options.user.id } },
    login: async options => { logins.push(options); if (adapterError) throw adapterError; return { token: 'login-token' } }, cancel() {} }
  const manager = createPlatformQuickLogin({ runtime, adapter, api, scope: 'h5:https://example.test' })
  return { manager, runtime, storage, prompts, requests, enrollments, logins, setError: error => { adapterError = error },
    setEnrollHook: hook => { enrollHook = hook }, setApiFailure: value => { apiFailure = value } }
}

const user = { id: 7, username: 'alice' }
const offered = quickFixture({ accepted: false })
assert.deepEqual(offered.manager.state(), { enabled: true, prompted: false })
await offered.manager.afterLogin('token-1', user)
await offered.manager.afterLogin('token-1', user)
assert.equal(offered.prompts.length, 1)
assert.equal(offered.manager.state().enabled, false)
assert.equal(offered.manager.state().prompted, true)

const lifecycle = quickFixture()
await lifecycle.manager.afterLogin('token-1', user)
assert.equal(lifecycle.prompts.length, 1)
assert.equal(lifecycle.manager.state().credentialId, 'key-1')
await lifecycle.manager.setEnabled(false, 'token-1', user)
assert.equal(lifecycle.manager.state().credentialId, '')
assert.equal(lifecycle.manager.state().enabled, false)
assert.equal(lifecycle.manager.state().pendingRevocations.length, 0)
assert.ok(lifecycle.requests.some(call => call.method === 'DELETE' && call.path.endsWith('/key-1')))
await lifecycle.manager.setEnabled(true, 'token-1', user)
assert.equal(lifecycle.manager.state().credentialId, 'key-2')
assert.equal(lifecycle.enrollments[1].previousCredentialId, 'key-1')

const pending = quickFixture()
pending.storage.set('platform_quick_login_v1:h5%3Ahttps%3A%2F%2Fexample.test',
  { enabled: true, prompted: true, credentialId: 'reusable-key', userId: 7, username: 'alice' })
pending.setApiFailure(true)
const disableResult = await pending.manager.setEnabled(false, 'token-1', user)
assert.deepEqual(disableResult, { revocationPending: true })
assert.ok(pending.manager.state().pendingRevocations.some(item => item.credentialId === 'reusable-key'))
const deleteCallsBeforeReenable = pending.requests.filter(call => call.method === 'DELETE' && call.path.endsWith('/reusable-key')).length
pending.setEnrollHook(async () => ({ credentialId: 'reusable-key', userId: user.id }))
await pending.manager.setEnabled(true, 'token-1', user)
pending.setApiFailure(false)
assert.equal(pending.manager.state().credentialId, 'reusable-key')
assert.equal(pending.manager.state().pendingRevocations.some(item => item.credentialId === 'reusable-key'), false)
assert.equal(pending.requests.filter(call => call.method === 'DELETE' && call.path.endsWith('/reusable-key')).length, deleteCallsBeforeReenable + 1,
  'reenabling the reusable credential must keep the failed retry from deleting the newly active credential')

const retry = quickFixture()
retry.storage.set('platform_quick_login_v1:h5%3Ahttps%3A%2F%2Fexample.test',
  { enabled: false, prompted: true, pendingRevocations: [{ credentialId: 'queued-key', userId: 7 }] })
retry.setApiFailure(true)
assert.deepEqual(await retry.manager.syncRevocations('token-1', 7), { revocationPending: true })
retry.setApiFailure(false)
assert.deepEqual(await retry.manager.syncRevocations('token-1', 7), { revocationPending: false })
assert.equal(retry.manager.state().pendingRevocations.length, 0)

const switched = quickFixture({ accepted: false })
switched.storage.set('platform_quick_login_v1:h5%3Ahttps%3A%2F%2Fexample.test',
  { enabled: true, prompted: true, credentialId: 'old-key', userId: 7, username: 'alice' })
await switched.manager.afterLogin('token-1', { id: 8, username: 'bob' })
assert.equal(switched.manager.state().credentialId, '')
assert.ok(switched.manager.state().pendingRevocations.some(item => item.credentialId === 'old-key'))
assert.equal(switched.requests.some(call => call.method === 'DELETE' && call.path.endsWith('/old-key')), false)

for (const error of [new Error('offline'), { error: 'CANCELLED' }, { error: 'TIMEOUT' }]) {
  const preserved = quickFixture()
  preserved.storage.set('platform_quick_login_v1:h5%3Ahttps%3A%2F%2Fexample.test',
    { enabled: true, prompted: true, credentialId: 'keep-key', userId: 7 })
  preserved.setError(error)
  await assert.rejects(preserved.manager.login())
  assert.equal(preserved.manager.state().credentialId, 'keep-key')
  assert.equal(preserved.requests.some(call => call.method === 'DELETE'), false)
}

for (const invalidation of ['page', 'token']) {
  const stale = quickFixture()
  let active = true, release
  stale.setEnrollHook(() => new Promise(resolve => { release = resolve }))
  const request = stale.manager.setEnabled(true, 'token-1', user, () => active)
  await new Promise(resolve => setImmediate(resolve))
  if (invalidation === 'page') active = false
  else stale.storage.set('token', 'token-2')
  release({ credentialId: 'orphan', userId: user.id })
  await assert.rejects(request)
  assert.equal(stale.manager.state().credentialId, undefined)
  assert.ok(stale.requests.some(call => call.method === 'DELETE' && call.path.endsWith('/orphan')))
}

const bytesToBase64 = bytes => Buffer.from(bytes).toString('base64')
const passkeyEnv = { isSecureContext: true, navigator: { credentials: {} },
  PublicKeyCredential: { isUserVerifyingPlatformAuthenticatorAvailable: async () => true }, AbortController,
  atob: value => Buffer.from(value, 'base64').toString('binary'), btoa: value => Buffer.from(value, 'binary').toString('base64') }
const passkeyApiCalls = []
const passkeyApi = async (...args) => { passkeyApiCalls.push(args); return { data: { passkey: { supported: true }, options: {
  challenge: bytesToBase64([0, 1, 254]), user: { id: bytesToBase64([2, 3]) }, excludeCredentials: []
} } } }
let sentPublicKey
passkeyEnv.navigator.credentials.create = async options => { sentPublicKey = options.publicKey; return {
  id: 'credential', rawId: Uint8Array.from([250, 251, 252]).buffer, type: 'public-key', response: {
    clientDataJSON: Uint8Array.from([1, 2]).buffer, attestationObject: Uint8Array.from([3, 4]).buffer,
    getTransports: () => ['internal']
  }, getClientExtensionResults: () => ({ credProps: { rk: true } })
} }
const passkey = createPasskeyAdapter({ environment: passkeyEnv, api: passkeyApi })
assert.deepEqual(await passkey.capability(), { supported: true, enrolled: true, label: '通行密钥登录',
  message: '当前浏览器或网页地址暂不支持通行密钥，可使用密码或微信扫码登录' })
const enrolledPasskey = await passkey.enroll({ token: 'token', isActive: () => true })
assert.deepEqual([...new Uint8Array(sentPublicKey.challenge)], [0, 1, 254])
assert.deepEqual([...new Uint8Array(sentPublicKey.user.id)], [2, 3])
assert.equal(passkeyApiCalls.at(-1)[1].response.rawId, '-vv8')
assert.equal(passkeyApiCalls.at(-1)[1].response.response.clientDataJSON, 'AQI')
assert.equal(enrolledPasskey.options.challenge, bytesToBase64([0, 1, 254]))
const unsupported = createPasskeyAdapter({ environment: { isSecureContext: false }, api: passkeyApi })
assert.equal((await unsupported.capability()).supported, false)

const cancelEnv = { ...passkeyEnv, navigator: { credentials: { get: () => Promise.reject({ name: 'NotAllowedError' }) } } }
const cancelledPasskey = createPasskeyAdapter({ environment: cancelEnv, api: passkeyApi })
await assert.rejects(cancelledPasskey.login({ credentialId: 'key', isActive: () => true }), error => error.error === 'CANCELLED')
const timeoutEnv = { ...passkeyEnv, navigator: { credentials: { get: () => new Promise(() => {}) } } }
const timedPasskey = createPasskeyAdapter({ environment: timeoutEnv, api: passkeyApi,
  setTimer: callback => { queueMicrotask(callback); return 1 }, clearTimer() {} })
await assert.rejects(timedPasskey.login({ credentialId: 'key', isActive: () => true }), error => error.error === 'CANCELLED')

function soterFixture({ methods = {}, mode = 'fingerPrint', serverSupported = true, finishError = null } = {}) {
  const calls = [], apiCalls = [], timers = new Set()
  const runtime = { ...methods }
  const api = async (...args) => { apiCalls.push(args)
    if (args[0] === '/quick-login/capabilities') return { data: { soter: { supported: serverSupported } } }
    if (args[0].endsWith('/options')) return { data: { challengeId: 'challenge-id', payload: 'nonce-123' } }
    if (args[0] === '/quick-login/soter/enrollment/finish' && finishError) throw finishError
    return { data: { credentialId: 'credential-id', userId: 7 } }
  }
  const adapter = createSoterAdapter({ runtime, api, setTimer: callback => { const timer = { callback }; timers.add(timer); return timer },
    clearTimer: timer => timers.delete(timer) })
  return { adapter, calls, apiCalls, runtime, timers, call: (name, options) => { calls.push({ name, options }) }, mode }
}
const readySoterMethods = (onAuth = options => options.success({ resultJSON: 'nonce-proof', resultJSONSignature: 'sig' })) => ({
  checkIsSupportSoterAuthentication: options => options.success({ supportMode: ['fingerPrint'] }),
  checkIsSoterEnrolledInDevice: options => options.success({ isEnrolled: true }),
  login: options => options.success({ code: 'wx-code' }),
  startSoterAuthentication: onAuth
})
let soter
soter = soterFixture({ methods: {
  checkIsSupportSoterAuthentication: options => { soter.call('support', options); options.success({ supportMode: ['fingerPrint'] }) },
  checkIsSoterEnrolledInDevice: options => { soter.call('enrolled', options); options.success({ isEnrolled: true }) },
  login: options => { soter.call('login', options); options.success({ code: 'wx-code' }) },
  startSoterAuthentication: options => { soter.call('auth', options); options.success({ resultJSON: 'nonce-proof', resultJSONSignature: 'sig' }) }
} })
const soterCapability = await soter.adapter.capability()
assert.equal(soterCapability.supported, true)
assert.equal(soterCapability.enrolled, true)
const proof = await soter.adapter.enroll({ token: 'token', isActive: () => true })
assert.deepEqual(proof, { credentialId: 'credential-id', userId: 7 })
const authCall = soter.calls.find(call => call.name === 'auth')
assert.deepEqual(authCall.options.requestAuthModes, ['fingerPrint'])
assert.equal(authCall.options.challenge, 'nonce-123')
assert.equal(soter.apiCalls.find(call => call[0] === '/quick-login/soter/enrollment/options')[1].code, 'wx-code')
assert.deepEqual(soter.apiCalls.find(call => call[0] === '/quick-login/soter/enrollment/finish')[1],
  { challengeId: 'challenge-id', resultJSON: 'nonce-proof', resultJSONSignature: 'sig' })

let delayedAuthOptions
const delayed = soterFixture({ methods: {
  checkIsSupportSoterAuthentication: options => options.success({ supportMode: ['facial'] }),
  checkIsSoterEnrolledInDevice: options => options.success({ isEnrolled: true }),
  login: options => options.success({ code: 'wx-code' }),
  startSoterAuthentication: options => { delayedAuthOptions = options }
} })
await delayed.adapter.capability()
const delayedRequest = delayed.adapter.login({ credentialId: 'key', isActive: () => true })
await new Promise(resolve => setImmediate(resolve))
delayed.adapter.cancel()
await assert.rejects(delayedRequest, error => error.error === 'CANCELLED')
delayedAuthOptions.success({ resultJSON: 'late', resultJSONSignature: 'late-signature' })

const unsupportedSoter = soterFixture({ methods: { checkIsSupportSoterAuthentication: options => options.success({ supportMode: [] }) } })
assert.equal((await unsupportedSoter.adapter.capability()).supported, false)
const notEnrolledSoter = soterFixture({ methods: {
  checkIsSupportSoterAuthentication: options => options.success({ supportMode: ['fingerPrint'] }),
  checkIsSoterEnrolledInDevice: options => options.success({ isEnrolled: false })
} })
assert.equal((await notEnrolledSoter.adapter.capability()).enrolled, false)
const failedSoter = soterFixture({ methods: { checkIsSupportSoterAuthentication: options => options.fail({ errCode: 1 }) } })
assert.equal((await failedSoter.adapter.capability()).reason, 'service_unavailable')
const authFailure = soterFixture({ methods: {
  checkIsSupportSoterAuthentication: options => options.success({ supportMode: ['fingerPrint'] }),
  checkIsSoterEnrolledInDevice: options => options.success({ isEnrolled: true }),
  login: options => options.success({ code: 'wx-code' }),
  startSoterAuthentication: options => options.fail({ errCode: 1 })
} })
await authFailure.adapter.capability()
await assert.rejects(authFailure.adapter.login({ credentialId: 'key', isActive: () => true }), error => error.error === 'UNAVAILABLE')

// A system-auth hide suspends the proof. Its successful callback must not submit
// the finish request until the page resumes; the manager commits only afterward.
const hiddenStorage = new Map([['token', 'token-1']])
const hiddenRuntime = { getStorageSync: key => hiddenStorage.get(key), setStorageSync: (key, value) => hiddenStorage.set(key, value),
  removeStorageSync: key => hiddenStorage.delete(key) }
let hiddenAuth, hiddenManagerFixture
hiddenManagerFixture = soterFixture({ methods: readySoterMethods(options => { hiddenAuth = options }) })
const hiddenManager = createPlatformQuickLogin({ runtime: hiddenRuntime, adapter: hiddenManagerFixture.adapter,
  api: async (...args) => { hiddenManagerFixture.apiCalls.push(args)
    if (args[0] === '/quick-login/capabilities') return { data: { soter: { supported: true } } }
    if (args[0].endsWith('/options')) return { data: { challengeId: 'challenge-id', payload: 'nonce-123' } }
    return { data: { credentialId: 'credential-id', userId: 7 } }
  }, scope: 'weixin:test' })
const hiddenEnrollment = hiddenManager.setEnabled(true, 'token-1', user, () => true)
await new Promise(resolve => setImmediate(resolve))
assert.equal(hiddenManager.suspendSystemAuthentication(), true)
hiddenAuth.success({ resultJSON: 'nonce-proof', resultJSONSignature: 'sig' })
await new Promise(resolve => setImmediate(resolve))
assert.equal(hiddenManagerFixture.apiCalls.some(call => call[0] === '/quick-login/soter/enrollment/finish'), false)
hiddenManager.resumeSystemAuthentication()
await hiddenEnrollment
assert.equal(hiddenManager.state().enabled, true)
assert.equal(hiddenManager.state().credentialId, 'credential-id')
assert.ok(hiddenManagerFixture.apiCalls.some(call => call[0] === '/quick-login/soter/enrollment/finish'))

// Resuming before the native callback also allows the proof to finish normally.
let earlyResumeAuth
const earlyResume = soterFixture({ methods: readySoterMethods(options => { earlyResumeAuth = options }) })
const earlyEnrollment = earlyResume.adapter.enroll({ token: 'token', isActive: () => true })
await new Promise(resolve => setImmediate(resolve))
assert.equal(earlyResume.adapter.suspendSystemAuthentication(), true)
earlyResume.adapter.resumeSystemAuthentication()
earlyResumeAuth.success({ resultJSON: 'nonce-proof', resultJSONSignature: 'sig' })
await earlyEnrollment
assert.ok(earlyResume.apiCalls.some(call => call[0] === '/quick-login/soter/enrollment/finish'))

// Only the page that owns a system prompt can suspend or resume it. A new page
// cannot wake an old page's proof; the old owner can still resume it later.
let ownerAuth
const ownerAdapter = soterFixture({ methods: readySoterMethods(options => { ownerAuth = options }) })
const oldOwner = {}, newOwner = {}
const ownerEnrollment = ownerAdapter.adapter.enroll({ token: 'token', isActive: () => true, owner: oldOwner })
await new Promise(resolve => setImmediate(resolve))
assert.equal(ownerAdapter.adapter.suspendSystemAuthentication(newOwner), false)
assert.equal(ownerAdapter.adapter.suspendSystemAuthentication(oldOwner), true)
ownerAuth.success({ resultJSON: 'nonce-proof', resultJSONSignature: 'sig' })
await new Promise(resolve => setImmediate(resolve))
ownerAdapter.adapter.resumeSystemAuthentication(newOwner)
await new Promise(resolve => setImmediate(resolve))
assert.equal(ownerAdapter.apiCalls.some(call => call[0] === '/quick-login/soter/enrollment/finish'), false,
  'a new page cannot resume an old page proof')
ownerAdapter.adapter.resumeSystemAuthentication(oldOwner)
await ownerEnrollment
assert.ok(ownerAdapter.apiCalls.some(call => call[0] === '/quick-login/soter/enrollment/finish'))

// Native authentication failures are held until the owning page is foreground,
// so the page can display the failure instead of losing it while hidden.
let hiddenFailureAuth
const hiddenFailure = soterFixture({ methods: readySoterMethods(options => { hiddenFailureAuth = options }) })
const hiddenFailureOwner = {}
const hiddenFailureEnrollment = hiddenFailure.adapter.enroll({ token: 'token', isActive: () => true, owner: hiddenFailureOwner })
await new Promise(resolve => setImmediate(resolve))
hiddenFailure.adapter.suspendSystemAuthentication(hiddenFailureOwner)
hiddenFailureAuth.fail({ errCode: 90009 })
let hiddenFailureSettled = false
hiddenFailureEnrollment.catch(() => { hiddenFailureSettled = true })
await new Promise(resolve => setImmediate(resolve))
assert.equal(hiddenFailureSettled, false, 'the auth failure waits while the owning page is hidden')
hiddenFailure.adapter.resumeSystemAuthentication(hiddenFailureOwner)
await assert.rejects(hiddenFailureEnrollment, error => error.error === 'AUTH_FAILED' && Boolean(error.msg))

// The manager passes a token-bound canCommit guard into SOTER. If the session
// changes while the native prompt is hidden, finish must never be requested.
let changedTokenAuth
const changedToken = soterFixture({ methods: readySoterMethods(options => { changedTokenAuth = options }) })
const changedTokenStorage = new Map([['token', 'token-1']])
const changedTokenManager = createPlatformQuickLogin({ runtime: { getStorageSync: key => changedTokenStorage.get(key),
  setStorageSync: (key, value) => changedTokenStorage.set(key, value), removeStorageSync: key => changedTokenStorage.delete(key) },
  adapter: changedToken.adapter, api: async (...args) => { changedToken.apiCalls.push(args)
    if (args[0] === '/quick-login/capabilities') return { data: { soter: { supported: true } } }
    if (args[0].endsWith('/options')) return { data: { challengeId: 'challenge-id', payload: 'nonce-123' } }
    return { data: { credentialId: 'credential-id', userId: 7 } }
  }, scope: 'weixin:token-change' })
const changedTokenEnrollment = changedTokenManager.setEnabled(true, 'token-1', user, () => true, { owner: oldOwner })
await new Promise(resolve => setImmediate(resolve))
changedTokenManager.suspendSystemAuthentication(oldOwner)
changedTokenAuth.success({ resultJSON: 'nonce-proof', resultJSONSignature: 'sig' })
changedTokenStorage.set('token', 'token-2')
changedTokenManager.resumeSystemAuthentication(oldOwner)
await assert.rejects(changedTokenEnrollment, error => error.error === 'CANCELLED')
assert.equal(changedToken.apiCalls.some(call => call[0] === '/quick-login/soter/enrollment/finish'), false,
  'a replaced session is rejected before the finish request')

// Unload uses unconditional cancel, so a late success callback cannot submit or bind.
let unloadAuth
const unload = soterFixture({ methods: readySoterMethods(options => { unloadAuth = options }) })
const unloadStorage = new Map([['token', 'token-1']])
const unloadManager = createPlatformQuickLogin({ runtime: { getStorageSync: key => unloadStorage.get(key),
  setStorageSync: (key, value) => unloadStorage.set(key, value), removeStorageSync: key => unloadStorage.delete(key) },
  adapter: unload.adapter, api: async (...args) => { unload.apiCalls.push(args)
    if (args[0] === '/quick-login/capabilities') return { data: { soter: { supported: true } } }
    if (args[0].endsWith('/options')) return { data: { challengeId: 'challenge-id', payload: 'nonce-123' } }
    return { data: { credentialId: 'credential-id', userId: 7 } }
  }, scope: 'weixin:unload' })
const unloadEnrollment = unloadManager.setEnabled(true, 'token-1', user)
await new Promise(resolve => setImmediate(resolve))
unloadManager.cancel()
await assert.rejects(unloadEnrollment, error => error.error === 'CANCELLED')
unloadAuth.success({ resultJSON: 'late-proof', resultJSONSignature: 'late-signature' })
assert.equal(unload.apiCalls.some(call => call[0] === '/quick-login/soter/enrollment/finish'), false)
assert.equal(unloadManager.state().credentialId, undefined)

// A suspended proof still times out after 15 seconds and remains cancellable.
let timeoutAuth
const backgroundTimeout = soterFixture({ methods: readySoterMethods(options => { timeoutAuth = options }) })
const timeoutEnrollment = backgroundTimeout.adapter.enroll({ token: 'token', isActive: () => true })
await new Promise(resolve => setImmediate(resolve))
backgroundTimeout.adapter.suspendSystemAuthentication()
timeoutAuth.success({ resultJSON: 'nonce-proof', resultJSONSignature: 'sig' })
await new Promise(resolve => setImmediate(resolve))
assert.equal(backgroundTimeout.timers.size, 1)
for (const timer of [...backgroundTimeout.timers]) timer.callback()
await assert.rejects(timeoutEnrollment, error => error.error === 'CANCELLED')
assert.equal(backgroundTimeout.apiCalls.some(call => call[0] === '/quick-login/soter/enrollment/finish'), false)

// Finish failures leave no local credential and retain an error marker; retry success clears it.
const finishFailure = soterFixture({ methods: readySoterMethods(), finishError: { reason: 'reauth_required', msg: '重新登录' } })
const finishStorage = new Map([['token', 'token-1']])
const finishManager = createPlatformQuickLogin({ runtime: { getStorageSync: key => finishStorage.get(key),
  setStorageSync: (key, value) => finishStorage.set(key, value), removeStorageSync: key => finishStorage.delete(key) },
  adapter: finishFailure.adapter, api: async (...args) => { finishFailure.apiCalls.push(args)
    if (args[0] === '/quick-login/capabilities') return { data: { soter: { supported: true } } }
    if (args[0].endsWith('/options')) return { data: { challengeId: 'challenge-id', payload: 'nonce-123' } }
    return { data: { credentialId: 'credential-id', userId: 7 } }
  }, scope: 'weixin:failure' })
await assert.rejects(finishManager.setEnabled(true, 'token-1', user), error => error.reason === 'reauth_required')
assert.equal(finishManager.state().credentialId, undefined)
assert.equal(finishManager.state().enrollmentError, 'reauth_required')
finishFailure.adapter.cancel()
const retrySuccess = soterFixture({ methods: readySoterMethods() })
const retryManager = createPlatformQuickLogin({ runtime: { getStorageSync: key => finishStorage.get(key),
  setStorageSync: (key, value) => finishStorage.set(key, value), removeStorageSync: key => finishStorage.delete(key) },
  adapter: retrySuccess.adapter, api: async (...args) => { retrySuccess.apiCalls.push(args)
    if (args[0] === '/quick-login/capabilities') return { data: { soter: { supported: true } } }
    if (args[0].endsWith('/options')) return { data: { challengeId: 'challenge-id', payload: 'nonce-123' } }
    return { data: { credentialId: 'credential-id', userId: 7 } }
  }, scope: 'weixin:failure' })
await retryManager.setEnabled(true, 'token-1', user)
assert.equal(retryManager.state().credentialId, 'credential-id')
assert.equal(retryManager.state().enrollmentError, '')

for (const [errCode, expected, message] of [[90009, 'AUTH_FAILED', '指纹或面容未验证通过，请重试'], [90008, 'CANCELLED', '']]) {
  const failedCode = soterFixture({ methods: { ...readySoterMethods(), startSoterAuthentication: options => options.fail({ errCode }) } })
  await failedCode.adapter.capability()
  await assert.rejects(failedCode.adapter.enroll({ token: 'token', isActive: () => true }), error => {
    assert.equal(error.error, expected)
    assert.equal(error.msg || '', message)
    return true
  })
}

console.log('Platform quick login: preferences, lifecycle, stale enrollment, passkey serialization/cancel/timeout, and SOTER suspend/resume/timeout/failure passed.')
