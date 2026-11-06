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

function soterFixture({ methods = {}, mode = 'fingerPrint', serverSupported = true } = {}) {
  const calls = [], apiCalls = [], timers = new Set()
  const runtime = { ...methods }
  const api = async (...args) => { apiCalls.push(args)
    if (args[0] === '/quick-login/capabilities') return { data: { soter: { supported: serverSupported } } }
    if (args[0].endsWith('/options')) return { data: { challengeId: 'challenge-id', payload: 'nonce-123' } }
    return { data: { credentialId: 'credential-id', userId: 7 } }
  }
  const adapter = createSoterAdapter({ runtime, api, setTimer: callback => { const timer = { callback }; timers.add(timer); return timer },
    clearTimer: timer => timers.delete(timer) })
  return { adapter, calls, apiCalls, runtime, timers, call: (name, options) => { calls.push({ name, options }) }, mode }
}
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

console.log('Platform quick login: preferences, lifecycle, stale enrollment, passkey serialization/cancel/timeout, and SOTER capability/proof/cancel passed.')
