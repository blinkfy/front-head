export function normalizeRegistrationScene(value) {
  let scene = String(value || '').trim()
  try { scene = decodeURIComponent(scene) } catch (_) { return '' }
  return /^r_[a-f0-9]{24}$/.test(scene) ? scene : ''
}

// These endpoints deliberately do not use the ordinary JWT/401 redirect interceptor.
export function createRegistrationApi({ runtime, baseUrl }) {
  const root = String(baseUrl).replace(/\/$/, '')
  const request = (method, path, data, header = {}) => new Promise((resolve, reject) => {
    runtime.request({ url: root + '/api/registration/sessions' + path, method, data,
      timeout: 12000, header: { 'Content-Type': 'application/json', ...header },
      success: response => {
        const body = response.data && typeof response.data === 'object' ? response.data : {}
        if (response.statusCode >= 200 && response.statusCode < 300 && body?.code === 0) resolve(body)
        else reject(Object.assign(new Error(body?.msg || '扫码登录请求失败'), body, {
          httpStatus: response.statusCode, invalidResponse: typeof body.code !== 'number'
        }))
      },
      fail: error => reject(Object.assign(new Error('网络连接失败，请检查网络后重试'), { reason: 'NETWORK_UNKNOWN', cause: error }))
    })
  })
  const privateRequest = (method, session, suffix = '') => request(method, '/' + session.sessionId + suffix,
    undefined, { 'X-Registration-Secret': session.pollSecret })
  return {
    create: async () => {
      const result = await request('POST', '', {})
      const data = result.data
      if (!/^r_[a-f0-9]{24}$/.test(data?.sessionId || '') || !/^[a-f0-9]{64}$/.test(data?.pollSecret || '') ||
          !Number.isFinite(data?.expiresAt) || typeof data?.qrUrl !== 'string') {
        throw Object.assign(new Error('当前服务暂不支持自动网页登录'), { reason: 'REGISTRATION_RELAY_UNSUPPORTED' })
      }
      return result
    },
    status: session => privateRequest('GET', session, '/status'),
    consume: session => privateRequest('POST', session, '/consume'),
    cancel: session => privateRequest('DELETE', session),
    scan: (id, wechatCode) => request('POST', '/' + id + '/scan', { wechatCode }),
    authorize: (id, wechatCode, token) => request('POST', '/' + id + '/authorize',
      { wechatCode, confirm: true }, { Authorization: 'Bearer ' + token }),
    cancelScan: (id, wechatCode) => request('POST', '/' + id + '/cancel-scan', { wechatCode }),
    qrUrl: session => root + session.qrUrl,
    fixedQrUrl: () => root + '/api/registration/wechat-qrcode'
  }
}

const terminal = new Set(['expired', 'cancelled', 'consumed'])
const reasonState = { SESSION_EXPIRED: 'expired', SESSION_CONSUMED: 'consumed', SESSION_CANCELLED: 'cancelled' }

export function createH5RegistrationRelay({ api, onState, onLogin, now = Date.now,
  schedule = setTimeout, unschedule = clearTimeout, onUnsupported }) {
  let session = null, active = false, stopped = false, epoch = 0, timer = null
  let busy = false, consumeAttempted = false, createPending = false, deferredLogin = null, loginDelivered = false
  let unsupported = false
  const emit = (status, message = '') => onState({ status, message, session })
  const clearTimer = () => { if (timer !== null) unschedule(timer); timer = null }
  const current = (revision, target) => !stopped && revision === epoch && target === session
  function useManual(error) {
    const unavailable = error.reason === 'REGISTRATION_RELAY_UNSUPPORTED' ||
      [404, 405, 501].includes(error.httpStatus) || [404, 405, 501].includes(error.code) ||
      (error.invalidResponse && error.httpStatus >= 200 && error.httpStatus < 300)
    if (!unavailable || !onUnsupported) return false
    const old = session
    unsupported = true; session = null; clearTimer()
    if (old) void api.cancel(old).catch(() => {})
    emit('manual', '扫码后请在小程序完成登录或注册，再使用账号密码登录网页。')
    onUnsupported(error)
    return true
  }
  const arm = () => {
    clearTimer()
    if (active && !stopped && session && !terminal.has(session.status) && !consumeAttempted) {
      timer = schedule(() => { timer = null; void poll() }, 2500)
    }
  }
  async function poll() {
    if (!active || stopped || busy || !session || terminal.has(session.status) || consumeAttempted) return
    if (now() >= Number(session.expiresAt)) { session.status = 'expired'; emit('expired'); return }
    busy = true
    const revision = epoch, target = session
    try {
      const response = await api.status(target)
      if (!current(revision, target)) return
      Object.assign(session, response.data)
      emit(session.status)
      if (session.status === 'authorized' && active) {
        consumeAttempted = true
        emit('consuming')
        const result = await api.consume(target)
        if (!current(revision, target)) return
        if (!result.token || !result.userInfo) throw new Error('扫码登录结果不完整，请重新扫码')
        session.status = 'consumed'
        // A hidden tab may retain a completed response, but must not navigate until shown again.
        if (active) { loginDelivered = true; emit('complete'); onLogin(result) }
        else deferredLogin = result
      }
    } catch (error) {
      if (!current(revision, target)) return
      if (!consumeAttempted && useManual(error)) return
      const status = reasonState[error.reason]
      if (status) { session.status = status; emit(status, error.message) }
      else emit(consumeAttempted ? 'uncertain' : 'error', consumeAttempted
        ? '登录领取结果未确认，请刷新二维码重新扫码。' : error.msg || error.message)
    } finally {
      busy = false
      arm()
    }
  }
  async function refresh() {
    if (stopped || createPending || busy) return
    clearTimer()
    const old = session
    session = null; deferredLogin = null; consumeAttempted = false; loginDelivered = false; unsupported = false
    const revision = ++epoch
    createPending = true
    emit('loading')
    if (old) void api.cancel(old).catch(() => {})
    try {
      const response = await api.create()
      const next = response.data
      if (stopped || revision !== epoch) { void api.cancel(next).catch(() => {}); return }
      session = next
      emit(session.status)
      if (active) void poll()
    } catch (error) {
      if (!stopped && revision === epoch && !useManual(error)) emit('error', error.msg || error.message)
    } finally { createPending = false }
  }
  return {
    refresh, poll,
    resume() {
      if (stopped || loginDelivered) return
      active = true
      if (unsupported) return
      if (deferredLogin) {
        if (now() >= Number(session.expiresAt)) { deferredLogin = null; session.status = 'expired'; emit('expired'); return }
        const result = deferredLogin; deferredLogin = null; loginDelivered = true; emit('complete'); onLogin(result); return
      }
      if (!session && !createPending) void refresh()
      else if (consumeAttempted) emit('uncertain', '登录领取结果未确认，请刷新二维码重新扫码。')
      else void poll()
    },
    pause() { active = false; clearTimer() },
    stop() {
      stopped = true; active = false; epoch++; clearTimer(); deferredLogin = null
      if (session) void api.cancel(session).catch(() => {})
    }
  }
}

export function commitRegistrationLogin(runtime, result) {
  runtime.setStorageSync('token', result.token)
  runtime.setStorageSync('userInfo', result.userInfo)
  if (result.isAdmin === true) runtime.setStorageSync('isAdmin', true)
  else runtime.removeStorageSync('isAdmin')
  runtime.removeStorageSync('guestMode')
  runtime.removeStorageSync('savedUser')
  runtime.setStorageSync('autoLogin', true)
}

// Only the session ID/expiry/verification flag live in module memory. No login code is retained.
export function createMiniRegistrationRelay({ api, getCode, confirm, onError, now = Date.now }) {
  let pending = null, scanTask = null, scanIntent = null, scanRequest = null, authorizationTask = null
  const valid = intent => intent && pending === intent && (!intent.expiresAt || now() < intent.expiresAt)
  const capture = value => {
    const id = normalizeRegistrationScene(value)
    if (!id) return false
    if (pending?.sessionId !== id) pending = { sessionId: id, expiresAt: 0, scanned: false }
    return true
  }
  async function scan() {
    if (!pending) return
    if (scanTask) return scanIntent === pending ? scanTask : scanTask.then(() => scan())
    const intent = pending
    if (!valid(intent)) { pending = null; return }
    if (intent.scanned) return
    scanIntent = intent
    scanTask = (async () => {
      try {
        const code = await getCode()
        if (!valid(intent)) return
        scanRequest = Promise.resolve(api.scan(intent.sessionId, code))
        const response = await scanRequest
        if (pending !== intent) return
        Object.assign(intent, { expiresAt: Number(response.data.expiresAt), scanned: true })
        if (terminal.has(response.data.status)) {
          pending = null
          onError(new Error('本次网页二维码已过期，请返回网页刷新后重新扫码'))
        }
      } catch (error) {
        if (pending === intent) {
          if (reasonState[error.reason]) pending = null
          onError(error)
        }
        return false
      } finally { scanTask = null; scanIntent = null; scanRequest = null }
    })()
    return scanTask
  }
  async function authorize(token, account = '', isActive = () => true) {
    if (!pending || !token || authorizationTask) return authorizationTask
    const intent = pending
    authorizationTask = (async () => {
      try {
        if (await scan() === false) return false
        if (!valid(intent) || !intent.scanned || !isActive()) return
        const accepted = await confirm(account, intent.sessionId)
        if (!valid(intent) || !isActive()) return
        if (!accepted) { await cancel(); return }
        const code = await getCode()
        if (!valid(intent) || !isActive()) return
        await api.authorize(intent.sessionId, code, token)
        if (pending === intent) pending = null
        return true
      } catch (error) {
        if (pending === intent) {
          if (reasonState[error.reason]) pending = null
          onError(error)
        }
        return false
      } finally { authorizationTask = null }
    })()
    return authorizationTask
  }
  async function cancel() {
    const intent = pending
    const inFlightScan = scanIntent === intent ? scanRequest : null
    pending = null
    if (!intent) return
    // Release after an already-sent scan, so cancellation cannot arrive before the scanner claim.
    if (inFlightScan) { try { await inFlightScan } catch (_) { /* Still attempt to release. */ } }
    try { await api.cancelScan(intent.sessionId, await getCode()) } catch (_) { /* TTL releases it if offline. */ }
  }
  return { capture, scan, authorize, cancel, getPending: () => {
    if (pending && !valid(pending)) pending = null
    return pending ? { ...pending } : null
  } }
}
