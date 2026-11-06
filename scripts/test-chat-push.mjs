import assert from 'node:assert/strict'
import { createPushRegistration } from '../src/utils/chat-push-registration.mjs'
import { getOrCreatePushInstallationId, PUSH_INSTALLATION_KEY } from '../src/utils/chat-push-installation.mjs'

const json = value => JSON.stringify(value)
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

async function noPollingForSameIdentity() {
  const calls = [], bindings = []
  let binding = null, clock = 10_000
  const manager = createPushRegistration({
    request: async (...args) => { calls.push(args); return { huawei: true } },
    getToken: cb => cb(json({ token: 'device_token_123456' })),
    deleteToken: cb => cb(json({ ok: true })),
    readBinding: () => binding,
    writeBinding: value => { binding = value; bindings.push(value) },
    getInstallationId: () => 'stable-installation-identifier',
    now: () => clock
  })
  await manager.sync('jwt-a')
  assert.equal(calls.filter(([method]) => method === 'GET').length, 1)
  assert.equal(calls.filter(([method]) => method === 'PUT').length, 1)
  assert.equal(calls.find(([method]) => method === 'PUT')[3].installationId, 'stable-installation-identifier')
  clock += 60 * 60 * 1000
  await manager.sync('jwt-a')
  await manager.sync('jwt-a')
  assert.equal(calls.length, 2, 'repeated same-JWT socket ticks issue no additional HTTP requests')
  assert.equal(bindings.at(-1).boundAt, clock - 60 * 60 * 1000)
}

async function staleAwaitAndAccountSwitch() {
  const calls = [], writes = []
  let binding = null, tokenCallbacks = [], firstCapability = deferred()
  const manager = createPushRegistration({
    request: async (method, url, jwt, body) => {
      calls.push({ method, jwt, body })
      if (method === 'GET' && jwt === 'jwt-a') return firstCapability.promise
      return { huawei: true }
    },
    getToken: cb => tokenCallbacks.push(cb),
    deleteToken: cb => cb(json({ ok: true })),
    readBinding: () => binding,
    writeBinding: value => { binding = value; writes.push(value) }
  })
  const old = manager.sync('jwt-a')
  await Promise.resolve()
  await Promise.resolve()
  const current = manager.sync('jwt-b')
  firstCapability.resolve({ huawei: true })
  await old
  await Promise.resolve(); await Promise.resolve()
  assert.equal(tokenCallbacks.length, 1, 'obsolete capability result never requests the old account device token')
  tokenCallbacks.shift()(json({ token: 'new_account_device_123' }))
  await current
  assert.equal(binding.jwt, 'jwt-b', 'new account owns the final binding')
  assert.equal(calls.some(call => call.method === 'PUT' && call.jwt === 'jwt-a'), false, 'stale login cannot bind after account switch')
  assert.ok(writes.every(value => !value || value.jwt === 'jwt-b'))
}

async function logoutRevocationAndRetry() {
  const calls = []
  let binding = { jwt: 'jwt-old', token: 'device_token_123456', boundAt: 1 }, bindAttempts = 0, nativeDeletes = 0, clock = 100_000
  const manager = createPushRegistration({
    request: async (method, url, jwt) => {
      calls.push({ method, jwt })
      if (method === 'DELETE') throw new Error('offline')
      if (method === 'PUT' && ++bindAttempts === 1) throw new Error('temporary bind failure')
      return { huawei: true }
    },
    getToken: cb => cb(json({ token: 'device_token_123456' })),
    deleteToken: cb => { nativeDeletes++; cb(json(nativeDeletes === 1 ? { error: 'temporary native failure' } : { ok: true })) },
    readBinding: () => binding,
    writeBinding: value => { binding = value },
    now: () => clock
  })
  await manager.logout()
  assert.equal(calls[0].method, 'DELETE', 'logout attempts server revocation')
  assert.equal(nativeDeletes, 1, 'logout attempts native token revocation even if HTTP fails')
  assert.ok(binding, 'failed native revocation retains binding for cleanup')

  await manager.sync('jwt-new')
  assert.equal(bindAttempts, 1, 'first bind attempt can fail without escaping the registration chain')
  clock += 300_001
  await manager.sync('jwt-new', true)
  assert.equal(bindAttempts, 2, 'failed bind can be retried')
  assert.equal(binding.jwt, 'jwt-new', 'retry stores the current account binding')
}

async function tokenRotationAndRenewal() {
  const puts = []
  let binding = null, token = 'device_token_original', clock = 2_000_000
  const manager = createPushRegistration({
    request: async (method, url, jwt, body) => {
      if (method === 'PUT') puts.push(body)
      return { huawei: true }
    },
    getToken: cb => cb(json({ token })),
    deleteToken: cb => cb(json({ ok: true })),
    readBinding: () => binding,
    writeBinding: value => { binding = value },
    getInstallationId: () => 'stable-rotation-installation-id',
    now: () => clock
  })
  await manager.sync('jwt-a')
  assert.equal(puts[0].token, 'device_token_original')
  assert.equal(puts[0].installationId, 'stable-rotation-installation-id')
  token = 'device_token_rotated'
  clock += 25 * 60 * 60 * 1000
  await manager.sync('jwt-a', true)
  assert.deepEqual(puts.map(body => body.token), ['device_token_original', 'device_token_rotated'], 'rotated native token is rebound')
  assert.equal(puts[1].installationId, 'stable-rotation-installation-id')
  assert.equal(puts[1].previousToken, 'device_token_original', 'rotation PUT includes the previous token')
  assert.equal(binding.token, token)
  assert.equal(binding.previousToken, undefined, 'successful acknowledgement clears the pending previous token')

  clock += 25 * 60 * 60 * 1000
  await manager.sync('jwt-a', true)
  assert.equal(puts.length, 3, 'same device token is renewed after the daily binding window')
  assert.equal(puts.at(-1).token, token)
}

async function registrationDiagnostics() {
  const cases = [
    { capability: false, expected: { stage: 'capabilities', status: 'DISABLED' } },
    { error: 'UNSUPPORTED', expected: { stage: 'native-token', status: 'UNSUPPORTED' } },
    { error: 'NOTIFICATIONS_DISABLED', expected: { stage: 'native-token', status: 'NOTIFICATIONS_DISABLED' } },
    { error: 'TOKEN_UNAVAILABLE', expected: { stage: 'native-token', status: 'TOKEN_UNAVAILABLE' } },
    { error: 'TOKEN_UNAVAILABLE', details: { hmsCode: 6003, exceptionType: 'ApiException', packageName: 'uni.app.UNI0B093BC',
      expectedAppId: '119662995', manifestAppId: 'appid=119662995', certificateSha256: Array(32).fill('AB').join(':'),
      message: 'private_sdk_payload', token: 'private_device_token', clientSecret: 'private_client_secret' },
      expected: { stage: 'native-token', status: 'TOKEN_UNAVAILABLE', hmsCode: 6003, exceptionType: 'ApiException',
        packageName: 'uni.app.UNI0B093BC', expectedAppId: '119662995', manifestAppId: 'appid=119662995',
        certificateSha256: Array(32).fill('AB').join(':') } },
    { error: 'TOKEN_UNAVAILABLE', details: { hmsCode: 'private_code', exceptionType: 'private_exception',
      packageName: 'private_package?token=private_value', expectedAppId: 'private_app', manifestAppId: 'private_manifest',
      certificateSha256: 'private_certificate' }, expected: { stage: 'native-token', status: 'TOKEN_UNAVAILABLE' } },
    { error: 'sensitive-native-error-with-token', expected: { stage: 'native-token', status: 'TOKEN_UNAVAILABLE' } },
    { httpStatus: 503, expected: { stage: 'binding', status: 'REQUEST_FAILED', httpStatus: 503 } },
    { expected: { stage: 'binding', status: 'READY' } }
  ]
  for (const item of cases) {
    const statuses = []
    let binding = null
    const manager = createPushRegistration({
      request: async method => {
        if (method === 'GET') return { huawei: item.capability !== false }
        if (item.httpStatus) throw Object.assign(new Error('do not log token or JWT'), { pushHttpStatus: item.httpStatus })
        return {}
      },
      getToken: cb => cb(json(item.error ? { ...item.details, error: item.error, token: undefined } : { token: 'private_device_token' })),
      deleteToken: cb => cb(json({ ok: true })),
      readBinding: () => binding,
      writeBinding: value => { binding = value },
      onStatus: status => statuses.push(status)
    })
    await manager.sync('private_jwt')
    assert.deepEqual(statuses, [item.expected])
    assert.doesNotMatch(json(statuses), /private_|sensitive-native|do not log/)
  }
}

function installationIdStorageBehavior() {
  const storage = new Map()
  const read = key => storage.get(key)
  const write = (key, value) => storage.set(key, value)
  const firstInstance = getOrCreatePushInstallationId(read, write)
  const restartedInstance = getOrCreatePushInstallationId(read, write)
  assert.equal(firstInstance, restartedInstance, 'recreating registration with the same storage keeps the installation ID')
  assert.equal(storage.get(PUSH_INSTALLATION_KEY), firstInstance)

  const otherStorage = new Map()
  const otherInstance = getOrCreatePushInstallationId(key => otherStorage.get(key), (key, value) => otherStorage.set(key, value))
  assert.notEqual(otherInstance, firstInstance, 'independent app storage receives an independent installation ID')
  assert.throws(() => getOrCreatePushInstallationId(() => { throw new Error('storage unavailable') }, () => {}),
    /storage unavailable/, 'storage read failures must not silently generate a replacement ID')
  assert.throws(() => getOrCreatePushInstallationId(() => null, () => {}),
    /storage unavailable/, 'a failed ID write/readback must be surfaced')
}

async function legacyBindingGetsInstallationId() {
  const installationId = 'installation-id-for-legacy-binding'
  const calls = []
  let binding = { jwt: 'jwt-a', token: 'device_token_123456', boundAt: 99_000 }, clock = 100_000
  const manager = createPushRegistration({
    request: async (method, url, jwt, body) => { calls.push({ method, body }); return { huawei: true } },
    getToken: cb => cb(json({ token: binding.token })), deleteToken: cb => cb(json({ ok: true })),
    readBinding: () => binding, writeBinding: value => { binding = value },
    getInstallationId: () => installationId, now: () => clock
  })
  await manager.sync('jwt-a')
  const put = calls.find(call => call.method === 'PUT')
  assert.ok(put, 'a recent legacy binding without installationId must be upgraded')
  assert.equal(put.body.installationId, installationId)
  assert.equal(binding.installationId, installationId)
}

async function failedRotationKeepsPreviousTokenUntilAcknowledged() {
  const installationId = 'installation-id-for-rotation'
  const puts = [], deletes = []
  let binding = { jwt: 'jwt-a', token: 'device_token_original', installationId, boundAt: 1_000_000 }
  let clock = 2_000_000, attempts = 0
  const manager = createPushRegistration({
    request: async (method, url, jwt, body) => {
      if (method === 'PUT') { puts.push(body); attempts++; throw new Error('temporary bind failure') }
      if (method === 'DELETE') { deletes.push({ jwt, body }); return { ok: true } }
      return { huawei: true }
    },
    getToken: cb => cb(json({ token: 'device_token_rotated' })),
    deleteToken: cb => cb(json({ ok: true })),
    readBinding: () => binding,
    writeBinding: value => { binding = value },
    getInstallationId: () => installationId,
    now: () => clock
  })
  await manager.sync('jwt-a', true)
  assert.equal(puts[0].installationId, installationId, 'rotation retains the same installation ID')
  assert.equal(puts[0].previousToken, 'device_token_original', 'rotation tells the server which token to replace')
  assert.deepEqual(binding, { jwt: 'jwt-a', token: 'device_token_rotated', installationId, previousToken: 'device_token_original' },
    'failed binding retains the first old token locally')

  clock += 300_001
  await manager.sync('jwt-a', true)
  assert.equal(attempts, 2, 'failed rotation can be retried')
  assert.equal(puts[1].previousToken, 'device_token_original', 'repeated failure does not replace the original previousToken')
  assert.equal(binding.previousToken, 'device_token_original')

  await manager.logout()
  assert.equal(deletes[0].body.token, 'device_token_rotated')
  assert.equal(deletes[0].body.previousToken, 'device_token_original', 'logout revokes current and prior tokens after failed retries')
  assert.equal(binding, null)
}

async function installationIdSurvivesLogoutAndAccountSwitch() {
  const storage = new Map()
  const read = key => storage.get(key)
  const write = (key, value) => storage.set(key, value)
  const installationId = getOrCreatePushInstallationId(read, write)
  const boundIds = []
  let binding = null
  const manager = createPushRegistration({
    request: async (method, url, jwt, body) => {
      if (method === 'PUT') boundIds.push({ jwt, installationId: body.installationId })
      return { huawei: true }
    },
    getToken: cb => cb(json({ token: 'device_token_123456' })),
    deleteToken: cb => cb(json({ ok: true })),
    readBinding: () => binding, writeBinding: value => { binding = value },
    getInstallationId: () => getOrCreatePushInstallationId(read, write)
  })
  await manager.sync('jwt-a')
  await manager.logout()
  assert.equal(getOrCreatePushInstallationId(read, write), installationId, 'logout does not reset installation identity')
  await manager.sync('jwt-b')
  assert.deepEqual(boundIds, [
    { jwt: 'jwt-a', installationId },
    { jwt: 'jwt-b', installationId }
  ], 'account switch keeps installation identity while changing account binding')
}

async function main() {
  const cases = [
    ['same identity avoids HTTP polling', noPollingForSameIdentity],
    ['installation ID storage and failure behavior', installationIdStorageBehavior],
    ['legacy binding upgrades with installation ID', legacyBindingGetsInstallationId],
    ['account switch fences stale awaits', staleAwaitAndAccountSwitch],
    ['logout revocation and bind retry', logoutRevocationAndRetry],
    ['token rotation and renewal', tokenRotationAndRenewal],
    ['failed rotation preserves old token for retry and logout', failedRotationKeepsPreviousTokenUntilAcknowledged],
    ['installation ID survives logout and account switch', installationIdSurvivesLogoutAndAccountSwitch],
    ['safe stage diagnostics', registrationDiagnostics]
  ]
  for (const [name, run] of cases) { await run(); console.log(`PASS ${name}`) }
  console.log('Frontend Huawei push registration tests passed.')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
