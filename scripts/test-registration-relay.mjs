import assert from 'node:assert/strict'
import { createH5RegistrationRelay, createMiniRegistrationRelay, createRegistrationApi,
  normalizeRegistrationScene, commitRegistrationLogin, createRegistrationDialogs } from '../src/utils/registration-relay.mjs'

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
  onUnsupported: options.onUnsupported, prepareRefresh: options.prepareRefresh, now: () => time,
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

test('registration API tags only APP-created sessions', async () => {
  const calls = []
  const runtime = { request: options => {
    calls.push(options)
    options.success({ statusCode: 200, data: result({ ...session(), qrUrl: session().qrUrl }) })
  } }
  await createRegistrationApi({ runtime, baseUrl: 'https://example.test' }).create()
  await createRegistrationApi({ runtime, baseUrl: 'https://example.test', clientPlatform: 'app' }).create()
  assert.deepEqual(calls.map(call => call.data), [{}, { clientPlatform: 'app' }])
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
  assert.deepEqual(Object.keys(state.controller.getPending()).sort(), ['clientPlatform', 'expiresAt', 'scanned', 'sessionId'])
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
  const dialogs = createRegistrationDialogs({ showModal: options => {
    options.success({ confirm: false, cancel: true })
  } })
  const state = mini({ confirm: dialogs.confirm }); state.controller.capture(id)
  await state.controller.authorize('token'); assert.equal(state.controller.getPending(), null)
  assert.equal(state.authorizations.length, 0); assert.deepEqual(state.cancellations[0], [id, 'new-code-2'])
})

test('native registration dialogs keep button labels within WeChat limits and confirm', async () => {
  const shown = []
  const dialogs = createRegistrationDialogs({ showModal: options => {
    shown.push(options)
    const labels = [options.confirmText, options.cancelText].filter(Boolean)
    if (labels.some(label => Array.from(label).length > 4)) {
      options.fail({ errMsg: 'showModal:fail confirmText length out of range' })
    } else {
      options.success({ confirm: true, cancel: false })
    }
  } })
  assert.equal(await dialogs.confirm('最终账号', id), true)
  assert.equal(shown[0].title, '确认登录网页')
  assert.match(shown[0].content, /登录刚才扫码的分投侠网页/)
  assert.equal(await dialogs.confirm('最终账号', id, 'app'), true)
  assert.equal(shown[1].title, '确认登录APP')
  assert.match(shown[1].content, /登录刚才扫码的分投侠APP/)
  assert.equal(await dialogs.retry(), true)
  assert.equal(shown.length, 3)
  for (const options of shown) {
    assert.ok(Array.from(options.confirmText).length <= 4)
    assert.ok(Array.from(options.cancelText).length <= 4)
  }
})

test('mini relay forwards scanned APP platform to confirm and keeps authorization flow', async () => {
  const confirmationArgs = [], authorizations = []
  const state = mini({ api: {
    scan: async () => result({ status: 'scanned', expiresAt: 10000, clientPlatform: 'app' }),
    authorize: async (...args) => { authorizations.push(args); return result({ status: 'authorized' }) }
  }, confirm: async (...args) => { confirmationArgs.push(args); return true } })
  state.controller.capture(id)
  assert.equal(await state.controller.authorize('login-token', '最终账号'), true)
  assert.equal(state.controller.getPending(), null)
  assert.deepEqual(confirmationArgs, [['最终账号', id, 'app']])
  assert.deepEqual(authorizations[0], [id, 'new-code-2', 'login-token'])
})

test('native confirmation failure preserves scanned intent for retry without cancelScan', async () => {
  let modalCalls = 0
  const dialogs = createRegistrationDialogs({ showModal: options => {
    modalCalls++
    if (modalCalls === 1) options.fail({ errMsg: 'showModal:fail' })
    else options.success({ confirm: true, cancel: false })
  } })
  const state = mini({ confirm: dialogs.confirm })
  state.controller.capture(id)
  assert.equal(await state.controller.authorize('first-token', '最终账号'), false)
  assert.ok(state.controller.getPending())
  assert.equal(state.cancellations.length, 0)
  assert.equal(state.errors[0]?.reason, 'REGISTRATION_CONFIRM_FAILED')

  assert.equal(await state.controller.authorize('retry-token', '最终账号'), true)
  assert.equal(state.controller.getPending(), null)
  assert.equal(state.cancellations.length, 0)
  assert.deepEqual(state.authorizations, [[id, 'new-code-2', 'retry-token']])
})

test('native retry dialog failure rejects with a retryable confirmation error', async () => {
  const dialogs = createRegistrationDialogs({ showModal: options =>
    options.fail({ errMsg: 'showModal:fail' })
  })
  await assert.rejects(dialogs.retry(), error => error.reason === 'REGISTRATION_CONFIRM_FAILED')
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

test('staged refresh keeps the old session until the replacement image is registered', async () => {
  const preparation = deferred(), old = session(), next = { ...session(), sessionId: 'r_' + 'c'.repeat(24),
    qrUrl: '/api/registration/sessions/r_' + 'c'.repeat(24) + '/qrcode', expiresAt: 20000, displayExpiresAt: 15000 }
  let creates = 0, cancels = []
  const state = h5({ create: async () => { creates++; return result(creates === 1 ? old : next) },
    status: async () => result({ status: 'waiting' }), cancel: async value => { cancels.push(value.sessionId) }
  }, { prepareRefresh: async candidate => { assert.equal(candidate, next); return preparation.promise } })
  state.controller.resume(); await tick(); assert.equal(state.states.at(-1).session.sessionId, old.sessionId)
  const refreshing = state.controller.refresh(); await tick()
  assert.equal(creates, 2); assert.equal(state.states.at(-1).session.sessionId, old.sessionId)
  assert.equal(state.states.at(-1).refreshing, true); assert.deepEqual(cancels, [])
  preparation.resolve({ status: 'registered' }); await refreshing; await tick()
  assert.equal(state.states.some(value => value.session?.sessionId === next.sessionId), true)
  assert.deepEqual(cancels, [old.sessionId], 'old code is revoked only after replacement is ready')
})

test('failed staged refresh preserves the old code and cancels the candidate', async () => {
  const next = { ...session(), sessionId: 'r_' + 'd'.repeat(24), qrUrl: '/api/registration/sessions/r_' + 'd'.repeat(24) + '/qrcode' }
  let cancels = []
  let creates = 0
  const state = h5({ create: async () => result(++creates === 1 ? session() : next), cancel: async value => { cancels.push(value.sessionId) } },
    { prepareRefresh: async () => ({ status: 'failed' }) })
  state.controller.resume(); await tick(); await state.controller.refresh()
  assert.equal(state.states.at(-1).session.sessionId, id)
  assert.equal(state.states.at(-1).status, 'waiting')
  assert.deepEqual(cancels, [next.sessionId])
})

test('staged refresh honors public display expiry and old backend fields', async () => {
  let now = 12000
  const next = { ...session(), sessionId: 'r_' + 'e'.repeat(24), qrUrl: '/api/registration/sessions/r_' + 'e'.repeat(24) + '/qrcode',
    expiresAt: 30000, displayExpiresAt: 11000 }
  let creates = 0
  const state = h5({ create: async () => result(++creates === 1 ? session() : next), status: async () => result({ status: 'waiting' }) },
    { prepareRefresh: async () => ({ status: 'registered' }) })
  state.controller.resume(); await tick(); state.setTime(12001); await state.controller.refresh()
  // A freshly installed code is governed by its public display deadline.
  assert.equal(state.states.at(-1).status, 'expired')
  assert.equal(state.states.at(-1).session.sessionId, next.sessionId)
  const legacy = { ...session(), sessionId: 'r_' + 'f'.repeat(24), qrUrl: '/api/registration/sessions/r_' + 'f'.repeat(24) + '/qrcode' }
  let legacyCreates = 0
  const legacyState = h5({ create: async () => result(++legacyCreates === 1 ? session() : legacy) }, { prepareRefresh: async () => ({ status: 'unsupported' }) })
  legacyState.controller.resume(); await tick(); await legacyState.controller.refresh()
  assert.equal(legacyState.states.at(-1).session.sessionId, legacy.sessionId)
})

test('pause and authorization during candidate preparation discard only the candidate', async () => {
  for (const mode of ['pause', 'leave', 'authorized']) {
    const preparation = deferred(), next = { ...session(), sessionId: 'r_' + (mode === 'pause' ? '1' : mode === 'leave' ? '3' : '2').repeat(24),
      qrUrl: '/api/registration/sessions/candidate/qrcode' }
    let cancels = [], creates = 0, statuses = 0
    const state = h5({ create: async () => result(++creates === 1 ? session() : next),
      status: async () => result({ status: mode === 'authorized' && ++statuses > 1 ? 'authorized' : 'waiting' }),
      consume: async () => login,
      cancel: async value => { cancels.push(value.sessionId) }
    }, { prepareRefresh: async () => preparation.promise })
    state.controller.resume(); await tick()
    // Keep the first poll in its waiting state while the candidate is prepared.
    if (mode === 'pause') state.controller.pause()
    const refreshing = state.controller.refresh(); await tick()
    if (mode === 'authorized') { await state.controller.poll(); await tick() }
    else if (mode === 'leave') state.controller.stop()
    else state.controller.pause()
    preparation.resolve({ status: 'registered' }); await refreshing; await tick()
    assert.deepEqual(cancels, mode === 'leave' ? [id, next.sessionId] : [next.sessionId])
    if (mode === 'pause') assert.equal(state.states.at(-1).session.sessionId, id)
    else assert.equal(state.states.some(value => value.session?.sessionId === next.sessionId), false)
  }
})

test('uncertain consume can stage a refresh after the possible claim settles', async () => {
  const next = { ...session(), sessionId: 'r_' + '9'.repeat(24), qrUrl: '/api/registration/sessions/candidate/qrcode' }
  let consumes = 0, cancels = [], creates = 0
  const state = h5({ status: async () => result({ status: creates === 1 ? 'authorized' : 'waiting' }),
    consume: async () => { consumes++; throw new Error('response lost') },
    create: async () => result(++creates === 1 ? session() : next), cancel: async value => { cancels.push(value.sessionId) }
  }, { prepareRefresh: async () => ({ status: 'registered' }) })
  state.controller.resume(); await tick(); assert.equal(state.states.at(-1).status, 'uncertain')
  await state.controller.refresh(); await tick()
  assert.equal(consumes, 1); assert.equal(state.states.some(value => value.session?.sessionId === next.sessionId), true)
  assert.deepEqual(cancels, [id])
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
