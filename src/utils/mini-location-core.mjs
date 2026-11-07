// Native mini-program APIs are injected so compatibility and lifecycle races can be tested.
export function isLocationCancelled(error) {
  return error?.code === 'cancelled' || /cancel|已取消/i.test(String(error?.errMsg || error?.message || ''))
}
export function isLocationDenied(error) {
  return error?.code === 1 || error?.code === 'permission_denied' || /auth|permission|deny|denied|授权|权限|privacy/i.test(String(error?.errMsg || error?.message || ''))
}
export function isLocationUnavailable(error) {
  return /not support|not available|not a function|unsupported|未开通|无接口权限|接口.*(?:权限|不可用)|暂不支持|不支持|api.*(?:unavailable|permission)/i.test(String(error?.errMsg || error?.message || ''))
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
export async function chooseMiniPoint(api, { latitude, longitude, isCurrent = () => true, enhanced = true } = {}) {
  if (!isCurrent()) throw cancelled()
  const options = {}
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) Object.assign(options, { latitude, longitude })
  let result
  try { result = await invokeMiniLocation(api, 'chooseLocation', options) }
  catch (error) {
    // Never open a second chooser after cancellation or a user authorization refusal.
    if (!enhanced || isLocationCancelled(error) || !isLocationUnavailable(error) || !isCurrent()) throw error
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
export function createMiniLocationWatcher({ api, enhanced = () => true, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let owner = null, queue = Promise.resolve()
  const enqueue = task => { queue = queue.then(task, task).catch(() => {}) }
  return (success, failure) => {
    owner?.stop()
    const item = { stopped: false, timer: null, stream: false, listened: false, received: false }
    owner = item
    const current = () => owner === item && !item.stopped
    const report = error => {
      if (!current()) return
      if (isLocationDenied(error)) error = Object.assign(new Error('请允许定位权限后重试'), { code: 'permission_denied' })
      failure(error)
    }
    const receive = result => {
      if (!current()) return
      try {
        const coords = point(result)
        const accuracy = result.accuracy ?? result.horizontalAccuracy
        if (!Number.isFinite(accuracy) || accuracy < 0) throw new Error('定位精度不可用')
        item.received = true
        success({ ...coords, accuracy, coordinateSystem: 'wgs84' })
      } catch (error) { report(error) }
    }
    const poll = async () => {
      if (!current()) return
      try { receive(await invokeMiniLocation(api, 'getLocation', { type: 'wgs84', isHighAccuracy: true, highAccuracyExpireTime: 15000 })) }
      catch (error) { report(error); return }
      if (current()) item.timer = setTimer(poll, 15000)
    }
    const detach = () => {
      if (item.listened) {
        api.offLocationChange?.(receive)
        api.offLocationChangeError?.(report)
        item.listened = false
      }
    }
    item.stop = () => {
      if (item.stopped) return
      item.stopped = true
      if (item.timer !== null) clearTimer(item.timer)
      detach()
      if (owner === item) owner = null
      enqueue(async () => { if (item.stream) { item.stream = false; await invokeMiniLocation(api, 'stopLocationUpdate').catch(() => {}) } })
    }
    enqueue(async () => {
      if (!current()) return
      if (!enhanced() || !['startLocationUpdate', 'stopLocationUpdate', 'onLocationChange', 'offLocationChange'].every(name => typeof api?.[name] === 'function')) { void poll(); return }
      try {
        api.onLocationChange(receive)
        api.onLocationChangeError?.(report)
        item.listened = true
        await invokeMiniLocation(api, 'startLocationUpdate', { type: 'wgs84' })
        item.stream = true
        if (!current()) return // queued stop owns cleanup
        // Prime the map even when the platform has not emitted its first change.
        invokeMiniLocation(api, 'getLocation', { type: 'wgs84', isHighAccuracy: true, highAccuracyExpireTime: 15000 }).then(
          result => { if (!item.received) receive(result) }, error => { if (isLocationDenied(error)) report(error) })
      } catch (error) {
        detach()
        if (current() && isLocationUnavailable(error) && !isLocationCancelled(error)) void poll()
        else report(error)
      }
    })
    return item.stop
  }
}
