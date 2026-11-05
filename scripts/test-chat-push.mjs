import assert from 'node:assert/strict'
import { createPushRegistration } from '../src/utils/chat-push-registration.mjs'

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
    now: () => clock
  })
  await manager.sync('jwt-a')
  assert.equal(calls.filter(([method]) => method === 'GET').length, 1)
  assert.equal(calls.filter(([method]) => method === 'PUT').length, 1)
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
      if (method === 'PUT') puts.push(body.token)
      return { huawei: true }
    },
    getToken: cb => cb(json({ token })),
    deleteToken: cb => cb(json({ ok: true })),
    readBinding: () => binding,
    writeBinding: value => { binding = value },
    now: () => clock
  })
  await manager.sync('jwt-a')
  assert.deepEqual(puts, ['device_token_original'])
  token = 'device_token_rotated'
  clock += 25 * 60 * 60 * 1000
  await manager.sync('jwt-a', true)
  assert.deepEqual(puts, ['device_token_original', 'device_token_rotated'], 'rotated native token is rebound')
  assert.equal(binding.token, token)

  clock += 25 * 60 * 60 * 1000
  await manager.sync('jwt-a', true)
  assert.equal(puts.length, 3, 'same device token is renewed after the daily binding window')
  assert.equal(puts.at(-1), token)
}

async function registrationDiagnostics() {
  const cases = [
    { capability: false, expected: { stage: 'capabilities', status: 'DISABLED' } },
    { error: 'UNSUPPORTED', expected: { stage: 'native-token', status: 'UNSUPPORTED' } },
    { error: 'NOTIFICATIONS_DISABLED', expected: { stage: 'native-token', status: 'NOTIFICATIONS_DISABLED' } },
    { error: 'TOKEN_UNAVAILABLE', expected: { stage: 'native-token', status: 'TOKEN_UNAVAILABLE' } },
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
      getToken: cb => cb(json(item.error ? { error: item.error } : { token: 'private_device_token' })),
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

async function main() {
  const cases = [
    ['same identity avoids HTTP polling', noPollingForSameIdentity],
    ['account switch fences stale awaits', staleAwaitAndAccountSwitch],
    ['logout revocation and bind retry', logoutRevocationAndRetry],
    ['token rotation and renewal', tokenRotationAndRenewal],
    ['safe stage diagnostics', registrationDiagnostics]
  ]
  for (const [name, run] of cases) { await run(); console.log(`PASS ${name}`) }
  console.log('Frontend Huawei push registration tests passed.')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
