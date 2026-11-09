// Native mini-program APIs are injected so compatibility and lifecycle races can be tested.
export function isLocationCancelled(error) {
  return error?.code === 'cancelled' || /cancel|已取消/i.test(String(error?.errMsg || error?.message || ''))
}
export function isLocationDenied(error) {
  return error?.code === 1 || error?.code === 'permission_denied' || /auth|permission|deny|denied|授权|权限|privacy/i.test(String(error?.errMsg || error?.message || ''))
}
export function isLocationUnavailable(error) {
  const message = String(error?.errMsg || error?.message || '')
  if (error?.code === 1 || error?.code === 'permission_denied' || /auth deny|permission denied by (?:the )?user|scope\.userLocation|privacy|用户.*(?:拒绝|授权)|隐私/i.test(message)) return false
  return /not support|not available|not a function|unsupported|未开通|无接口权限|接口.*(?:权限|不可用)|暂不支持|不支持|api\b.*(?:unavailable|permission|not authorized)|requiredPrivateInfos/i.test(message)
}
const cancelled = () => Object.assign(new Error('操作已取消'), { code: 'cancelled' })
export function invokeMiniLocation(api, method, options = {}) {
  return new Promise((resolve, reject) => {
    if (typeof api?.[method] !== 'function') { reject(new Error(`${method}: not support`)); return }
    try { api[method]({ ...options, success: resolve, fail: reject }) } catch (error) { reject(error) }
  })
}
function point(result) {
  const latitude = result?.latitude, longitude = result?.longitude
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error('定位返回数据异常')
  return { latitude, longitude }
}
export async function chooseMiniPoint(api, { latitude, longitude, isCurrent = () => true } = {}) {
  if (!isCurrent()) throw cancelled()
  const options = {}
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) Object.assign(options, { latitude, longitude })
  let result
  try { result = await invokeMiniLocation(api, 'chooseLocation', options) }
  catch (error) {
    // Never open a second chooser after cancellation or a user authorization refusal.
    if (isLocationCancelled(error) || !isLocationUnavailable(error) || !isCurrent()) throw error
    result = await invokeMiniLocation(api, 'choosePoi')
    if (result?.type !== 2) throw new Error('请选择具体地点，城市位置不能用于发送位置或填写详细地址')
  }
  if (!isCurrent()) throw cancelled()
  return { ...point(result), name: String(result.name || ''), address: String(result.address || ''), coordinateSystem: 'gcj02' }
}
export async function chooseMiniShippingAddress(api, { isCurrent = () => true } = {}) {
  if (!isCurrent()) throw cancelled()
  const result = await invokeMiniLocation(api, 'chooseAddress')
  if (!isCurrent()) throw cancelled()
  const parts = { province: String(result.provinceName || ''), city: String(result.cityName || ''), district: String(result.countyName || '') }
  const address = [...new Set(Object.values(parts).filter(Boolean)), String(result.detailInfo || '')].join('')
  if (!address.trim() || address.length > 500) throw new Error('收货地址不完整，请手动填写')
  return { address, parts, recipientName: String(result.userName || ''), recipientPhone: String(result.telNumber || '') }
}

// One native location service per mini-program. Start/stop operations are serialized:
// a late start callback cannot revive a stopped watch or stop its successor.
export function createMiniLocationWatcher({ api, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let owner = null, queue = Promise.resolve()
  const enqueue = task => { queue = queue.then(task, task).catch(() => {}) }
  return (success, failure) => {
    owner?.stop()
    const item = { stopped: false, timer: null, requestTimer: null, stream: false, listened: false, mode: 'stream' }
    owner = item
    const current = () => owner === item && !item.stopped
    const nativeCall = (method, timeout) => new Promise((resolve, reject) => {
      let settled = false
      const finish = (callback, value) => {
        if (settled) return
        settled = true; clearTimer(timer)
        if (method === 'startLocationUpdate') item.cancelStart = null
        callback(value)
      }
      const timer = setTimer(() => finish(reject, Object.assign(new Error(`${method}: timeout`), { code: 'LOCATION_TIMEOUT' })), timeout)
      if (method === 'startLocationUpdate') item.cancelStart = () => finish(reject, cancelled())
      try {
        api[method]({ ...(method === 'startLocationUpdate' ? { type: 'wgs84' } : {}),
          success: value => {
            if (!settled) finish(resolve, value)
            else if (method === 'startLocationUpdate') {
              // A timed-out/cancelled native start may still succeed. Do not stop
              // a successor's stream; otherwise clean up the orphaned service.
              enqueue(async () => { if (!owner || owner.mode === 'poll') await nativeCall('stopLocationUpdate', 5000).catch(() => {}) })
            }
          }, fail: error => finish(reject, error) })
      } catch (error) { finish(reject, error) }
    })
    const report = error => {
      if (!current()) return
      if (isLocationDenied(error) && !isLocationUnavailable(error)) error = Object.assign(new Error('请允许定位权限后重试'), { code: 'permission_denied' })
      item.stop()
      failure(error)
    }
    const receive = result => {
      if (!current()) return
      try {
        const coords = point(result)
        const accuracy = result.accuracy ?? result.horizontalAccuracy
        if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100000) throw new Error('定位精度不可用')
        if (item.mode === 'stream') {
          clearTimer(item.timer)
          item.timer = setTimer(fallback, 45000)
        }
        success({ ...coords, accuracy, coordinateSystem: 'wgs84' })
      } catch (error) { if (item.mode === 'poll') report(error); else streamError(error) }
    }
    const poll = async () => {
      if (!current()) return
      try {
        const result = await new Promise((resolve, reject) => {
          item.requestTimer = setTimer(() => reject(Object.assign(new Error('定位超时'), { code: 'LOCATION_TIMEOUT' })), 20000)
          invokeMiniLocation(api, 'getLocation', { type: 'wgs84', isHighAccuracy: true, highAccuracyExpireTime: 15000 }).then(resolve, reject)
        })
        clearTimer(item.requestTimer); item.requestTimer = null
        receive(result)
      }
      catch (error) { report(error); return }
      if (current()) item.timer = setTimer(poll, 15000)
    }
    const detach = () => {
      if (item.listened) {
        try { api.offLocationChange?.(streamReceive) } catch (_) {}
        try { api.offLocationChangeError?.(streamError) } catch (_) {}
        item.listened = false
      }
    }
    const stopStream = async () => {
      if (item.stream) { item.stream = false; await nativeCall('stopLocationUpdate', 5000).catch(() => {}) }
    }
    const fallback = () => {
      if (!current() || item.mode === 'poll') return
      item.mode = 'poll'
      item.cancelStart?.()
      clearTimer(item.timer); item.timer = null
      detach()
      enqueue(async () => { await stopStream(); if (current()) void poll() })
    }
    const streamError = error => {
      if (!current() || item.mode !== 'stream') return
      if ((isLocationDenied(error) && !isLocationUnavailable(error)) || isLocationCancelled(error)) report(error)
      else fallback()
    }
    const streamReceive = result => { if (item.mode === 'stream') receive(result) }
    item.stop = () => {
      if (item.stopped) return
      item.stopped = true
      item.cancelStart?.()
      if (item.timer !== null) clearTimer(item.timer)
      if (item.requestTimer !== null) clearTimer(item.requestTimer)
      detach()
      if (owner === item) owner = null
      enqueue(stopStream)
    }
    enqueue(async () => {
      if (!current()) return
      if (!['startLocationUpdate', 'stopLocationUpdate', 'onLocationChange', 'offLocationChange'].every(name => typeof api?.[name] === 'function')) { fallback(); return }
      try {
        api.onLocationChange(streamReceive)
        item.listened = true
        if (typeof api.offLocationChangeError === 'function') api.onLocationChangeError?.(streamError)
        // Also fall back if startup succeeds but the stream never supplies a fix.
        item.timer = setTimer(fallback, 15000)
        item.stream = true
        await nativeCall('startLocationUpdate', 10000)
        if (!current() || item.mode !== 'stream') return // queued stop owns cleanup
      } catch (error) {
        streamError(error)
      }
    })
    return item.stop
  }
}
