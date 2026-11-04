import { nearbyDisposalPoints, validDisposalLocation } from '../../utils/nearby-disposal.mjs'
import { toMapDisplayPoint } from '../../utils/map-display-point.mjs'

const MAX_AGE = 5 * 60 * 1000
const shortText = (value, size = 120) => typeof value === 'string' ? value.trim().slice(0, size) : ''

// 与后端 utils/mapCoordinates.js 使用同一 WGS84 -> GCJ02 算法。
// 浏览器原生定位返回 WGS84，腾讯地址服务及地图列表查询使用 GCJ02。
export function toChatMapLocation(location, coordinateSystem) {
  if (!validDisposalLocation(location)) throw new Error('定位数据无效')
  const latitude = Number(location.latitude), longitude = Number(location.longitude)
  if (coordinateSystem !== 'wgs84' || longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271) {
    return { latitude, longitude }
  }
  const x = longitude - 105, y = latitude - 35, pi = Math.PI
  let lat = -100 + 2*x + 3*y + 0.2*y*y + 0.1*x*y + 0.2*Math.sqrt(Math.abs(x))
  let lng = 300 + x + 2*y + 0.1*x*x + 0.1*x*y + 0.1*Math.sqrt(Math.abs(x))
  const common = (20*Math.sin(6*x*pi) + 20*Math.sin(2*x*pi))*2/3
  lat += common + (20*Math.sin(y*pi) + 40*Math.sin(y*pi/3))*2/3 + (160*Math.sin(y*pi/12) + 320*Math.sin(y*pi/30))*2/3
  lng += common + (20*Math.sin(x*pi) + 40*Math.sin(x*pi/3))*2/3 + (150*Math.sin(x*pi/12) + 300*Math.sin(x*pi/30))*2/3
  const rad = latitude*pi/180, magic = 1 - 0.00669342162296594323*Math.sin(rad)**2
  return {
    latitude: latitude + lat*180/((6378245*(1-0.00669342162296594323)/(magic*Math.sqrt(magic)))*pi),
    longitude: longitude + lng*180/((6378245/Math.sqrt(magic))*Math.cos(rad)*pi)
  }
}

function bounded(promise, timeout, fallback = null) {
  let timer
  return Promise.race([
    Promise.resolve(promise).catch(() => fallback),
    new Promise(resolve => { timer = setTimeout(() => resolve(fallback), timeout) })
  ]).finally(() => clearTimeout(timer))
}

export function createChatEnvironment({ locate, reverseGeocode, loadNearby, coordinateSystem = 'gcj02', now = Date.now, timeoutMs = 8000 }) {
  let state = { status: 'unavailable' }
  let pending = null, preparedAt = null, revision = 0, disposed = false

  function prepare() {
    if (disposed) return Promise.resolve()
    if (pending) return pending
    if (preparedAt !== null && now() - preparedAt < MAX_AGE) return Promise.resolve()
    const current = ++revision
    preparedAt = now()
    state = { status: 'locating' }
    pending = (async () => {
      const result = await bounded(Promise.resolve().then(locate), timeoutMs)
      if (disposed || current !== revision) return
      if (!validDisposalLocation(result)) { state = { status: 'unavailable' }; return }
      const origin = toChatMapLocation(result, coordinateSystem)
      state = { status: 'available', acquiredAt: new Date(now()).toISOString(), area: {}, nearbyStatus: 'loading', nearby: [] }
      // 两个查询独立完成，地址服务故障不影响附近点位。
      await Promise.all([
        bounded(Promise.resolve().then(() => reverseGeocode(origin)), timeoutMs).then(response => {
          if (disposed || current !== revision || response?.code !== 0) return
          const data = response.data?.result || response.data || {}
          const parts = data.address_component || {}
          state.area = Object.fromEntries(['nation', 'province', 'city', 'district', 'street'].map(key => [key, shortText(parts[key])]))
        }),
        bounded(Promise.resolve().then(() => loadNearby(origin)), timeoutMs).then(response => {
          if (disposed || current !== revision) return
          state.nearbyStatus = response?.code === 0 && Array.isArray(response.data) ? 'available' : 'unavailable'
          state.nearby = state.nearbyStatus === 'available'
            ? nearbyDisposalPoints(response.data.map(toMapDisplayPoint), origin).slice(0, 3).map(point => ({
                id: String(point.id || ''), name: shortText(point.name), description: shortText(point.description), distanceMeters: Math.round(point.distanceMeters)
              })) : []
        })
      ])
    })().catch(() => { if (!disposed && current === revision) state = { status: 'unavailable' } })
      .finally(() => { pending = null })
    return pending
  }

  async function forRequest(waitMs = 1200) {
    await bounded(prepare(), waitMs)
    let timeZone = ''
    try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '' } catch (_) {}
    // 只传地区和点位摘要，精确定位坐标不进入模型消息。
    return { timeZone, location: JSON.parse(JSON.stringify(state)) }
  }

  return { prepare, forRequest, dispose() { disposed = true; revision++ } }
}
