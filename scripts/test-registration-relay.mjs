import assert from 'node:assert/strict'
import { createH5RegistrationRelay, createMiniRegistrationRelay, createRegistrationApi,
  normalizeRegistrationScene, commitRegistrationLogin } from '../src/utils/registration-relay.mjs'

const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const id = 'r_' + 'a'.repeat(24)
const session = () => ({ sessionId: id, pollSecret: 'b'.repeat(64), status: 'waiting', expiresAt: 10000,
  qrUrl: '/api/registration/sessions/' + id + '/qrcode' })
const login = { token: 'final-token', userInfo: { username: '最终账号' }, isAdmin: false }
const result = data => ({ code: 0, data })
const cases = []
const test = (name, run) => cases.push({ name, run })

function h5(api = {}, options = {}) {
  const states = [], logins = [], timers = new Map()
  let time = 1, timerId = 0
  const controller = createH5RegistrationRelay({ api: {
    create: async () => result(session()), status: async () => result({ status: 'waiting' }),
    consume: async () => login, cancel: async () => result({}), ...api
  }, onState: state => states.push(state), onLogin: value => logins.push(value),
  onUnsupported: options.onUnsupported, now: () => time,
  schedule: (fn, delay) => { assert.equal(delay, 2500); timers.set(++timerId, fn); return timerId },
  unschedule: timer => timers.delete(timer) })
  return { controller, states, logins, timers, setTime: value => { time = value } }
}

test('request timeout and private headers do not inherit JWT', async () => {
  const calls = []
  const api = createRegistrationApi({ baseUrl: 'https://example.test/', runtime: {
    request: options => { calls.push(options); options.success({ statusCode: 200, data: result({}) }) }
  } })
  await api.status(session()); await api.consume(session()); await api.authorize(id, 'fresh-code', 'latest-jwt')
  for (const call of calls) assert.equal(call.timeout, 12000)
  assert.equal(calls[0].header.Authorization, undefined)
  assert.equal(calls[1].header['X-Registration-Secret'], session().pollSecret)
  assert.equal(calls[2].header.Authorization, 'Bearer latest-jwt')
  assert.deepEqual(calls[2].data, { wechatCode: 'fresh-code', confirm: true })
  assert.equal(api.qrUrl(session()).includes(session().pollSecret), false)
})

test('route leave ignores stale status and creation responses and cancels session', async () => {
  const pending = deferred(); let cancels = 0, consumes = 0
  const state = h5({ status: () => pending.promise, cancel: async () => { cancels++ }, consume: async () => { consumes++; return login } })
  state.controller.resume(); await tick(); state.controller.stop()
  pending.resolve(result({ status: 'authorized' })); await tick()
  assert.equal(consumes, 0); assert.equal(state.logins.length, 0); assert.equal(cancels, 1)
  const create = deferred()
  const second = h5({ create: () => create.promise, cancel: async () => { cancels++ } })
  second.controller.resume(); second.controller.stop(); create.resolve(result(session())); await tick()
  assert.equal(cancels, 2); assert.equal(second.timers.size, 0)
})

test('polls cannot overlap and hiding pauses without replacing the session', async () => {
  const pending = deferred(); let statuses = 0, creates = 0, consumes = 0
  const state = h5({ create: async () => { creates++; return result(session()) },
    status: () => { statuses++; return pending.promise }, consume: async () => { consumes++; return login } })
  state.controller.resume(); await tick(); await state.controller.poll(); state.controller.pause()
  pending.resolve(result({ status: 'authorized' })); await tick()
  assert.equal(statuses, 1); assert.equal(consumes, 0); assert.equal(state.timers.size, 0)
  state.controller.resume(); await tick()
  assert.equal(creates, 1); assert.equal(consumes, 1); assert.equal(state.logins.length, 1)
})

test('expired session never consumes and refresh creates a new session', async () => {
  let consumes = 0, creates = 0
  const state = h5({ create: async () => { creates++; return result(session()) }, consume: async () => { consumes++; return login } })
  state.setTime(10000); state.controller.resume(); await tick()
  assert.equal(state.states.at(-1).status, 'expired'); assert.equal(consumes, 0); assert.equal(state.timers.size, 0)
  state.setTime(1); await state.controller.refresh(); await tick(); assert.equal(creates, 2)
})

test('consume has one attempt even on network ambiguity and repeated resume', async () => {
  let consumes = 0
  const state = h5({ status: async () => result({ status: 'authorized' }),
    consume: async () => { consumes++; throw new Error('timeout') } })
  state.controller.resume(); await tick()
  state.controller.resume(); await state.controller.poll(); state.controller.pause(); state.controller.resume(); await tick()
  assert.equal(consumes, 1); assert.equal(state.states.at(-1).status, 'uncertain')
  assert.equal(state.logins.length, 0); assert.equal(state.timers.size, 0)
})

test('hidden consume response waits for resume and stopped consume never logs in', async () => {
  const consume = deferred()
  const state = h5({ status: async () => result({ status: 'authorized' }), consume: () => consume.promise })
  state.controller.resume(); await tick(); state.controller.pause(); consume.resolve(login); await tick()
  assert.equal(state.logins.length, 0); state.controller.resume(); state.controller.resume()
  assert.equal(state.logins.length, 1); assert.equal(state.states.at(-1).status, 'complete')
  const secondConsume = deferred()
  const second = h5({ status: async () => result({ status: 'authorized' }), consume: () => secondConsume.promise })
  second.controller.resume(); await tick(); second.controller.stop(); secondConsume.resolve(login); await tick()
  assert.equal(second.logins.length, 0)
  const lateConsume = deferred()
  const late = h5({ status: async () => result({ status: 'authorized' }), consume: () => lateConsume.promise })
  late.controller.resume(); await tick(); late.controller.pause(); lateConsume.resolve(login); await tick()
  late.setTime(10000); late.controller.resume()
  assert.equal(late.logins.length, 0); assert.equal(late.states.at(-1).status, 'expired')
})

test('login storage clears previous guest/admin/password state', () => {
  const store = new Map([['isAdmin', true], ['guestMode', true], ['savedUser', { password: 'old' }]])
  commitRegistrationLogin({ setStorageSync: (key, value) => store.set(key, value), removeStorageSync: key => store.delete(key) }, login)
  assert.equal(store.get('token'), login.token); assert.deepEqual(store.get('userInfo'), login.userInfo)
  assert.equal(store.has('guestMode'), false); assert.equal(store.has('isAdmin'), false); assert.equal(store.has('savedUser'), false)
})

function mini(extra = {}) {
  let codes = 0
  const scans = [], authorizations = [], errors = [], cancellations = []
  const controller = createMiniRegistrationRelay({ api: {
    scan: async (...args) => { scans.push(args); return result({ status: 'scanned', expiresAt: 10000 }) },
    authorize: async (...args) => { authorizations.push(args); return result({ status: 'authorized' }) },
    cancelScan: async (...args) => { cancellations.push(args) }, ...extra.api
  }, getCode: async () => 'new-code-' + ++codes, confirm: extra.confirm || (async () => true),
  onError: error => errors.push(error), now: extra.now || (() => 1) })
  return { controller, scans, authorizations, errors, cancellations }
}

test('registration scene stays separate from device scene and module intent survives login transition', async () => {
  assert.equal(normalizeRegistrationScene('c'.repeat(32)), '')
  assert.equal(normalizeRegistrationScene(encodeURIComponent(id)), id)
  const state = mini(); state.controller.capture(id); await state.controller.scan()
  // App launch, theme relaunch, register->login may all capture the same scene.
  state.controller.capture(id); await state.controller.scan(); assert.equal(state.scans.length, 1)
  assert.deepEqual(Object.keys(state.controller.getPending()).sort(), ['expiresAt', 'scanned', 'sessionId'])
  await state.controller.authorize('merge-final-token', '最终保留账号')
  assert.deepEqual(state.authorizations[0], [id, 'new-code-2', 'merge-final-token'])
  assert.equal(state.controller.getPending(), null)
})

test('authorization error preserves independently retryable intent without repeating scan or login', async () => {
  let attempts = 0
  const state = mini({ api: { authorize: async () => { if (++attempts === 1) throw new Error('offline'); return result({}) } } })
  state.controller.capture(id)
  assert.equal(await state.controller.authorize('latest-token'), false)
  assert.ok(state.controller.getPending()); assert.equal(state.errors.length, 1)
  assert.equal(await state.controller.authorize('latest-token'), true)
  assert.equal(state.scans.length, 1); assert.equal(attempts, 2)
})

test('explicit rejection cancels scanned intent with a fresh WeChat code', async () => {
  const state = mini({ confirm: async () => false }); state.controller.capture(id)
  await state.controller.authorize('token'); assert.equal(state.controller.getPending(), null)
  assert.equal(state.authorizations.length, 0); assert.deepEqual(state.cancellations[0], [id, 'new-code-2'])
})

test('leaving MP login suppresses authorization and expired intent clears', async () => {
  const state = mini(); state.controller.capture(id); await state.controller.authorize('token', '', () => false)
  assert.equal(state.authorizations.length, 0)
  const expired = mini({ now: () => 10001 }); expired.controller.capture(id); await expired.controller.scan()
  assert.equal(expired.controller.getPending(), null)
})

test('new scene while scan is in flight verifies the new scene separately', async () => {
  const old = deferred(); const scans = []
  const state = mini({ api: { scan: async scene => {
    scans.push(scene); if (scene === id) return old.promise
    return result({ status: 'scanned', expiresAt: 10000 })
  } } })
  state.controller.capture(id); const first = state.controller.scan()
  await tick(); const next = 'r_' + 'c'.repeat(24); state.controller.capture(next)
  const second = state.controller.scan(); old.resolve(result({ status: 'scanned', expiresAt: 10000 }))
  await Promise.all([first, second]); assert.deepEqual(scans, [id, next]); assert.equal(state.controller.getPending().sessionId, next)
})

test('old confirmation cannot cancel or authorize a newly scanned intent', async () => {
  for (const answer of [true, false]) {
    const confirmation = deferred()
    const state = mini({ confirm: () => confirmation.promise })
    state.controller.capture(id)
    const authorization = state.controller.authorize('latest-token')
    await tick()
    const next = 'r_' + 'd'.repeat(24); state.controller.capture(next)
    confirmation.resolve(answer); await authorization
    assert.equal(state.controller.getPending().sessionId, next)
    assert.equal(state.cancellations.length, 0); assert.equal(state.authorizations.length, 0)
  }
})

test('late fresh WeChat code after cancellation or page leave cannot send authorization', async () => {
  for (const stop of ['cancel', 'leave']) {
    let codes = 0, calls = 0, active = true
    const code = deferred()
    const controller = createMiniRegistrationRelay({ api: {
      scan: async () => result({ status: 'scanned', expiresAt: 10000 }),
      authorize: async () => { calls++ }, cancelScan: async () => {}
    }, getCode: () => ++codes === 2 ? code.promise : Promise.resolve('fresh-code'),
    confirm: async () => true, onError: () => {}, now: () => 1 })
    controller.capture(id)
    const authorization = controller.authorize('token', '', () => active)
    await tick()
    if (stop === 'cancel') await controller.cancel()
    else active = false
    code.resolve('late-code'); await authorization; assert.equal(calls, 0)
  }
})

test('late scan code cannot recreate a cancelled intent', async () => {
  const code = deferred(); let codes = 0, scans = 0
  const controller = createMiniRegistrationRelay({ api: {
    scan: async () => { scans++ }, cancelScan: async () => {}
  }, getCode: () => ++codes === 1 ? code.promise : Promise.resolve('cancel-code'),
  confirm: async () => true, onError: () => {}, now: () => 1 })
  controller.capture(id); const scan = controller.scan(); await controller.cancel()
  code.resolve('old-scan-code'); await scan; assert.equal(scans, 0)
})

test('cancellation waits for an already-sent scan before releasing its scanner claim', async () => {
  const scanResponse = deferred(); const order = []
  const state = mini({ api: {
    scan: async () => { order.push('scan-sent'); await scanResponse.promise; order.push('scan-complete'); return result({ status: 'scanned', expiresAt: 10000 }) },
    cancelScan: async () => { order.push('cancel-sent') }
  } })
  state.controller.capture(id); const scan = state.controller.scan(); await tick()
  const cancellation = state.controller.cancel(); await tick()
  assert.equal(state.controller.getPending(), null); assert.deepEqual(order, ['scan-sent'])
  scanResponse.resolve(); await Promise.all([scan, cancellation])
  assert.deepEqual(order, ['scan-sent', 'scan-complete', 'cancel-sent'])
})

test('MP can retry a completed server authorization whose response was lost', async () => {
  let authorized = false, requests = 0
  const state = mini({ api: { authorize: async () => {
    requests++
    if (!authorized) { authorized = true; throw new Error('response-lost') }
    return result({ status: 'authorized' })
  } } })
  state.controller.capture(id); assert.equal(await state.controller.authorize('final-token'), false)
  assert.equal(authorized, true); assert.ok(state.controller.getPending())
  assert.equal(await state.controller.authorize('final-token'), true)
  assert.equal(state.scans.length, 1); assert.equal(requests, 2)
})

test('old backend create endpoint falls back to manual QR once and resume does not recreate sessions', async () => {
  for (const statusCode of [404, 405, 501]) {
    const api = createRegistrationApi({ baseUrl: 'https://example.test', runtime: { request: options =>
      options.success({ statusCode, data: { code: statusCode, msg: 'unsupported endpoint' } })
    } })
    await assert.rejects(api.create(), error => error.httpStatus === statusCode && error.invalidResponse === false)
    let requests = 0, unsupported = 0
    const state = h5({ create: async () => {
      requests++
      throw Object.assign(new Error('unsupported endpoint'), { httpStatus: statusCode })
    } }, { onUnsupported: error => { unsupported++; assert.equal(error.httpStatus, statusCode) } })
    state.controller.resume(); await tick()
    assert.equal(requests, 1); assert.equal(unsupported, 1)
    assert.equal(state.states.at(-1).status, 'manual')
    state.controller.resume(); state.controller.pause(); state.controller.resume(); await tick()
    assert.equal(requests, 1, `HTTP ${statusCode} fallback must not create sessions on visibility resume`)
    assert.equal(unsupported, 1)
    assert.equal(state.timers.size, 0)
  }
})

test('status 404 retires the old session and switches to manual QR without more polling', async () => {
  let creates = 0, statuses = 0, cancels = 0, unsupported = 0
  const state = h5({
    create: async () => { creates++; return result(session()) },
    status: async () => { statuses++; throw Object.assign(new Error('status route missing'), { httpStatus: 404 }) },
    cancel: async () => { cancels++ }
  }, { onUnsupported: () => { unsupported++ } })
  state.controller.resume(); await tick()
  assert.equal(creates, 1); assert.equal(statuses, 1); assert.equal(cancels, 1)
  assert.equal(unsupported, 1); assert.equal(state.states.at(-1).status, 'manual')
  assert.equal(state.states.at(-1).session, null)
  state.controller.resume(); state.controller.resume(); await tick()
  assert.equal(creates, 1); assert.equal(statuses, 1); assert.equal(unsupported, 1)
  assert.equal(state.timers.size, 0)
})

test('503 and network failures remain retryable errors instead of manual fallback', async () => {
  for (const failure of ['503', 'network']) {
    let requests = 0, unsupported = 0
    const runtime = { request: options => {
      requests++
      if (failure === '503') options.success({ statusCode: 503, data: { code: 2, reason: 'DATABASE_UNAVAILABLE', msg: 'temporarily unavailable' } })
      else options.fail(new Error('connection dropped'))
    } }
    const api = createRegistrationApi({ runtime, baseUrl: 'https://example.test' })
    const state = h5({ create: () => api.create() }, { onUnsupported: () => { unsupported++ } })
    state.controller.resume(); await tick()
    assert.equal(requests, 1)
    assert.equal(unsupported, 0, `${failure} must not be misclassified as an old backend`)
    assert.equal(state.states.at(-1).status, 'error')
    state.controller.stop()
  }
})

test('consume 404 is uncertain and never downgrades or retries a possible claim', async () => {
  let consumes = 0, unsupported = 0
  const state = h5({
    status: async () => result({ status: 'authorized' }),
    consume: async () => { consumes++; throw Object.assign(new Error('consume route missing'), { httpStatus: 404 }) }
  }, { onUnsupported: () => { unsupported++ } })
  state.controller.resume(); await tick()
  assert.equal(consumes, 1); assert.equal(unsupported, 0)
  assert.equal(state.states.at(-1).status, 'uncertain')
  state.controller.resume(); await state.controller.poll(); await tick()
  assert.equal(consumes, 1, 'an ambiguous consume must not trigger manual fallback or another claim')
  assert.equal(unsupported, 0)
  assert.equal(state.states.at(-1).status, 'uncertain')
})

test('malformed create response selects manual mode and fixed QR URL contains no credentials', async () => {
  const runtime = { request: options => options.success({ statusCode: 200, data: {
    code: 0, data: { sessionId: id, pollSecret: 'short', expiresAt: 'not-a-time', qrUrl: '' }
  } }) }
  const api = createRegistrationApi({ runtime, baseUrl: 'https://example.test/' })
  await assert.rejects(api.create(), error => error.reason === 'REGISTRATION_RELAY_UNSUPPORTED')
  const malformedEnvelope = createRegistrationApi({ baseUrl: 'https://example.test', runtime: { request: options =>
    options.success({ statusCode: 200, data: { code: 'zero', data: {} } })
  } })
  await assert.rejects(malformedEnvelope.create(), error => error.httpStatus === 200 && error.invalidResponse === true)
  assert.equal(api.fixedQrUrl(), 'https://example.test/api/registration/wechat-qrcode')
  for (const credential of [session().pollSecret, 'latest-jwt', 'Bearer latest-jwt']) {
    assert.equal(api.fixedQrUrl().includes(credential), false)
  }
  let unsupported = 0
  const state = h5({ create: () => api.create() }, { onUnsupported: error => {
    unsupported++
    assert.equal(error.reason, 'REGISTRATION_RELAY_UNSUPPORTED')
  } })
  state.controller.resume(); await tick()
  assert.equal(unsupported, 1); assert.equal(state.states.at(-1).status, 'manual')
  state.controller.resume(); await tick()
  assert.equal(unsupported, 1); assert.equal(state.states.at(-1).status, 'manual')
})

for (const { name, run } of cases) { await run(); console.log('PASS ' + name) }
console.log(`${cases.length} registration relay checks passed`)
