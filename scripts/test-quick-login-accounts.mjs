import assert from 'node:assert/strict'
import { createPlatformQuickLogin } from '../src/utils/platform-quick-login-core.mjs'
import { createBiometricLoginManager } from '../src/utils/biometric-login-core.mjs'

function runtimeFixture() {
  const storage = new Map([['token', 'session']])
  return { storage, runtime: { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key), confirm: async () => true } }
}

function platformFixture() {
  const { storage, runtime } = runtimeFixture(), owners = new Map(), deleted = [], enrollments = [], logins = []
  let sequence = 0, enrollmentHook, loginError, loginAccountOverride = null
  const adapter = { capability: async () => ({ supported: true, enrolled: true }),
    enroll: async ({ user, previousCredentialId }) => {
      enrollments.push({ userId: user.id, previousCredentialId })
      const value = enrollmentHook ? await enrollmentHook(user) : null
      const result = value || { credentialId: `platform-${user.id}-${++sequence}`, userId: user.id }
      owners.set(result.credentialId, result.userId)
      return result
    },
    login: async options => { logins.push(options); if (loginError) throw loginError; return { token: 'quick-session', accountId: loginAccountOverride ?? owners.get(options.credentialId) } }, cancel() {} }
  const manager = createPlatformQuickLogin({ runtime, adapter, scope: 'test:accounts', api: async (path, body, token, method) => {
    if (method === 'DELETE') deleted.push(path)
    return {}
  } })
  return { manager, storage, owners, deleted, enrollments, logins,
    setEnrollmentHook: hook => { enrollmentHook = hook }, setLoginError: error => { loginError = error },
    setLoginAccountOverride: id => { loginAccountOverride = id } }
}

async function exercisePlatformAccounts() {
  const fixture = platformFixture(), { manager } = fixture
  const alice = { id: 7, username: 'alice' }, bob = { id: 8, username: 'bob' }
  await manager.setEnabled(true, 'session', alice)
  let aliceKey = manager.state(7).credentialId
  await manager.setEnabled(true, 'session', bob)
  const bobKey = manager.state(8).credentialId
  assert.ok(aliceKey && bobKey && aliceKey !== bobKey, 'two accounts keep separate bindings')
  assert.deepEqual(manager.accounts().map(item => String(item.userId)).sort(), ['7', '8'])

  assert.equal(manager.selectAccount(7), true)
  assert.equal(manager.selectAccount(99), false)
  assert.equal(manager.state().userId, 7)
  assert.equal(manager.selectAccount(8), true)
  await manager.setEnabled(true, 'session', alice)
  assert.equal(manager.state(7).credentialId, aliceKey, 'reenabling an existing binding does not enroll again')
  assert.equal(fixture.enrollments.length, 2)

  await manager.setEnabled(true, 'session', alice, undefined, { forceCreate: true })
  const firstReplacement = manager.state(7).credentialId
  assert.notEqual(firstReplacement, aliceKey)
  assert.equal(manager.state(8).credentialId, bobKey)
  assert.ok(fixture.deleted.some(path => path.endsWith(`/${aliceKey}`)), 'same-account replacement retires A old key')
  assert.equal(fixture.deleted.some(path => path.endsWith(`/${bobKey}`)), false, 'same-account replacement preserves B key')
  aliceKey = firstReplacement

  await manager.setEnabled(false, 'session', alice)
  assert.equal(manager.state(7).credentialId, '')
  assert.equal(manager.state(8).credentialId, bobKey, 'disabling A leaves B bound')
  assert.equal(manager.accounts().length, 1)
  await manager.setEnabled(true, 'session', alice, undefined, { forceCreate: true })
  const replacementKey = manager.state(7).credentialId
  assert.notEqual(replacementKey, aliceKey)
  assert.equal(manager.state(8).credentialId, bobKey)
  assert.ok(fixture.deleted.some(path => path.endsWith(`/${aliceKey}`)), 'replacement retires only A old credential')
  assert.equal(fixture.deleted.some(path => path.endsWith(`/${bobKey}`)), false)

  await manager.selectAccount(8)
  const mfa = await manager.login(() => true, undefined, { userId: 7 })
  assert.equal(mfa.accountId, 7, 'MFA explicitly authenticates its ticket target even when B is selected')
  assert.equal(fixture.logins.at(-1).credentialId, replacementKey)
  assert.equal(manager.state().userId, 8, 'targeted MFA login does not drift the default selection')
  fixture.setLoginAccountOverride(99)
  await assert.rejects(manager.login(() => true, undefined, { userId: 7 }), error => error.error === 'ACCOUNT_MISMATCH')
  assert.equal(manager.state(7).credentialId, replacementKey, 'foreign login result does not commit or clear A')
  assert.equal(manager.state(8).credentialId, bobKey, 'foreign login result does not change B')
  fixture.setLoginAccountOverride(null)

  fixture.setLoginError({ reason: 'invalid_credential' })
  await assert.rejects(manager.login(() => true, undefined, { userId: 7 }))
  assert.equal(manager.state(7).credentialId, '')
  assert.equal(manager.state(8).credentialId, bobKey, 'invalid A credential clears A only')
  fixture.setLoginError(null)

  let releaseEnroll
  fixture.setEnrollmentHook(() => new Promise(resolve => { releaseEnroll = resolve }))
  const staleEnrollment = manager.setEnabled(true, 'session', { id: 9, username: 'stale' })
  await new Promise(resolve => setImmediate(resolve))
  fixture.storage.set('token', 'rotated-session')
  releaseEnroll({ credentialId: 'orphan-9', userId: 9 })
  await assert.rejects(staleEnrollment, error => error.error === 'CANCELLED')
  assert.equal(manager.state(9).credentialId, undefined)
  assert.equal(manager.state(7).credentialId, '')
  assert.equal(manager.state(8).credentialId, bobKey, 'a stale enrollment cannot overwrite another account')
  assert.ok(fixture.deleted.includes('/quick-login/credentials/orphan-9'), 'stale enrollment is revoked as an orphan')
}

// Legacy v1 state migrates once and pending revocation keeps the old key out of
// eligible accounts, even when the user is later reenabled.
const legacy = platformFixture()
legacy.storage.set('platform_quick_login_v1:test%3Aaccounts', { enabled: true, prompted: true,
  credentialId: '', previousCredentialId: 'legacy-old', previousUserId: 7, username: 'alice',
  pendingRevocations: [{ credentialId: 'legacy-old', userId: 7 }] })
assert.equal(legacy.manager.accounts().length, 0)
assert.equal(legacy.manager.state(7).credentialId, '')
assert.ok(legacy.manager.state(7).pendingRevocations.some(item => item.credentialId === 'legacy-old'))
assert.equal(await legacy.manager.login(() => true, undefined, { userId: 7 }), null,
  'legacy pending key cannot log in before the explicit enrollment ceremony')
legacy.storage.set('token', 'session')
await legacy.manager.setEnabled(true, 'session', { id: 7, username: 'alice' })
assert.notEqual(legacy.manager.state(7).credentialId, 'legacy-old')
assert.equal(legacy.enrollments.length, 1, 'explicit reenabling performs an enrollment ceremony before binding a credential')
assert.ok(legacy.deleted.includes('/quick-login/credentials/legacy-old'))

// An ownerless v1 credential cannot be claimed by whichever account logs in first.
const ownerless = platformFixture()
ownerless.storage.set('platform_quick_login_v1:test%3Aaccounts', { enabled: true, prompted: true,
  credentialId: 'ownerless-legacy-key', username: 'unknown' })
assert.equal(ownerless.manager.accounts().length, 0)
assert.equal(ownerless.manager.state().credentialId, undefined)
await ownerless.manager.setEnabled(true, 'session', { id: 8, username: 'bob' })
assert.notEqual(ownerless.manager.state(8).credentialId, 'ownerless-legacy-key')
assert.equal(ownerless.enrollments[0].previousCredentialId, '', 'first activation does not pass the ownerless key to enrollment')
assert.deepEqual(ownerless.manager.accounts().map(item => String(item.userId)), ['8'])

await exercisePlatformAccounts()
console.log('Quick login account store: multi-account bindings, selection, targeted MFA, isolated disable/invalidation/replacement, stale enrollment, and v1 migration passed.')
