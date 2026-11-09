// Dedicated watch handles; no location storage writes.
import { androidRealtimeAvailable, watchAndroidRealtimeLocation } from './android-realtime.js'
import { ensureFeaturePermission } from './feature-permission.js'
import { miniLocationAvailable, watchMiniLocation } from './mini-location.js'
import { validLocationPoint } from './live-location-core.mjs'
export function webLocationAvailable() {
  // #ifdef H5
  return !!(globalThis.isSecureContext && globalThis.navigator?.geolocation?.watchPosition)
  // #endif
  // #ifndef H5
  return false
  // #endif
}
export const liveLocationTracker = {
  async permission(options) {
    const denied = () => Object.assign(new Error('请允许定位权限后重试'), { code: 'permission_denied' })
    if (!await ensureFeaturePermission('location', options)) throw denied()
    // #ifdef APP-PLUS
    // iOS can hide the webview while showing its first system prompt. Request
    // permission before joining so that interruption cannot end a new session.
    const status = () => uni.getAppAuthorizeSetting?.()?.locationAuthorized
    if (typeof plus !== 'undefined' && plus.os?.name === 'iOS' && status() === 'not determined') {
      await new Promise((resolve, reject) => plus.geolocation.getCurrentPosition(resolve, error => {
        if (status() === 'authorized') resolve()
        else reject(error?.code === 1 || status() === 'denied' ? denied() : new Error('暂时无法定位，请检查定位服务后重试'))
      }, { provider: 'system', coordsType: 'gps', geocode: false }))
    }
    // #endif
  },
  managesTimeout() { return webLocationAvailable() || androidRealtimeAvailable() || miniLocationAvailable() },
  canResume() { return webLocationAvailable() || miniLocationAvailable() },
  initialTimeout() { return webLocationAvailable() ? 45000 : 20000 },
  supported() {
    // #ifdef APP-PLUS
    return androidRealtimeAvailable() || (typeof plus !== 'undefined' && !!plus.geolocation?.watchPosition)
    // #endif
    // #ifdef H5
    return webLocationAvailable()
    // #endif
    // #ifdef MP-WEIXIN
    return miniLocationAvailable()
    // #endif
    // #ifndef APP-PLUS || H5 || MP-WEIXIN
    return false
    // #endif
  },
  watch(success, failure) {
    // #ifdef MP-WEIXIN
    return watchMiniLocation(success, failure)
    // #endif
    let stopped = false, refreshTimer = null, refreshRevision = 0, hasFix = false, errors = 0
    const toPoint = result => {
      const coords = result?.coords || result || {}
      return { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy, coordinateSystem: 'wgs84',
        ...(coords.provisional === true ? { provisional: true } : {}) }
    }
    // #ifdef APP-PLUS
    if (androidRealtimeAvailable()) return watchAndroidRealtimeLocation(result => success(toPoint(result)), failure)
    const geo = plus.geolocation
    const options = { provider: 'system', coordsType: 'gps', enableHighAccuracy: true, maximumAge: 0, timeout: 15000, geocode: false }
    // #endif
    // #ifdef H5
    const geo = globalThis.navigator.geolocation
    const options = { enableHighAccuracy: true, maximumAge: 0, timeout: 45000 }
    // #endif
    // #ifdef APP-PLUS || H5
    const scheduleRefresh = (delay = 30000) => {
      const revision = ++refreshRevision
      if (stopped || typeof geo.getCurrentPosition !== 'function') return
      if (refreshTimer !== null) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => {
        refreshTimer = null
        if (stopped) return
        const current = () => !stopped && revision === refreshRevision
        const failed = value => { if (current()) error(value) }
        try {
          geo.getCurrentPosition(result => { if (current()) receive(result) }, failed, { ...options, timeout: 15000 })
        } catch (value) { failed(value) }
      }, delay)
    }
    const receive = result => {
      if (stopped) return
      const point = toPoint(result)
      if (!validLocationPoint(point)) { error({ code: 2 }); return }
      hasFix = true; errors = 0
      success(point)
      scheduleRefresh()
    }
    const error = value => {
      if (stopped) return
      if (!hasFix || value?.code === 1 || value?.code === 'permission_denied' || typeof geo.getCurrentPosition !== 'function' || ++errors >= 3) failure(value)
      else scheduleRefresh(5000)
    }
    const id = geo.watchPosition(receive, error, options)
    return () => {
      if (stopped) return
      stopped = true; refreshRevision++
      if (refreshTimer !== null) clearTimeout(refreshTimer)
      geo.clearWatch(id)
    }
    // #endif
  }
}
