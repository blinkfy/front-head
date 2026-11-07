// Dedicated watch handles; no global location update service or storage writes.
import { androidRealtimeAvailable, watchAndroidRealtimeLocation } from './android-realtime.js'
import { ensureFeaturePermission } from './feature-permission.js'
export function webLocationAvailable() {
  // #ifdef H5
  return !!(globalThis.isSecureContext && navigator.geolocation?.watchPosition)
  // #endif
  // #ifndef H5
  return false
  // #endif
}
export const liveLocationTracker = {
  async permission(options) {
    if (!await ensureFeaturePermission('location', options)) throw Object.assign(new Error('请允许定位权限后重试'), { code: 'permission_denied' })
  },
  managesTimeout() { return androidRealtimeAvailable() },
  canResume() { return webLocationAvailable() },
  initialTimeout() { return webLocationAvailable() ? 45000 : 20000 },
  supported() {
    // #ifdef APP-PLUS
    return typeof plus !== 'undefined' && !!plus.geolocation?.watchPosition
    // #endif
    // #ifdef H5
    return !!(globalThis.isSecureContext && navigator.geolocation?.watchPosition)
    // #endif
    // #ifndef APP-PLUS || H5
    return false
    // #endif
  },
  watch(success, failure) {
    let stopped = false, id, refreshTimer = null, refreshRevision = 0
    // #ifdef H5
    const scheduleRefresh = () => {
      const revision = ++refreshRevision
      if (stopped) return
      if (refreshTimer !== null) clearTimeout(refreshTimer)
      if (typeof navigator.geolocation.getCurrentPosition !== 'function') return
      refreshTimer = setTimeout(() => {
        refreshTimer = null
        if (stopped) return
        navigator.geolocation.getCurrentPosition(result => {
          if (!stopped && revision === refreshRevision) receive(result)
        }, value => { if (!stopped && revision === refreshRevision) error(value) }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 })
      }, 30000)
    }
    // #endif
    const receive = result => {
      if (stopped) return
      const point = result.coords || result
      success({ latitude: point.latitude, longitude: point.longitude, accuracy: point.accuracy, coordinateSystem: 'wgs84' })
      // #ifdef H5
      scheduleRefresh()
      // #endif
    }
    const error = value => { if (!stopped) failure(value) }
    // #ifdef APP-PLUS
    if (androidRealtimeAvailable()) return watchAndroidRealtimeLocation(receive, error)
    id = plus.geolocation.watchPosition(receive, error, {
      provider: 'system', coordsType: 'gps', enableHighAccuracy: true, maximumAge: 0, timeout: 15000, geocode: false
    })
    // #endif
    // #ifdef H5
    id = navigator.geolocation.watchPosition(receive, error, { enableHighAccuracy: true, maximumAge: 0, timeout: 45000 })
    // #endif
    return () => {
      stopped = true; refreshRevision++
      // #ifdef APP-PLUS
      plus.geolocation.clearWatch(id)
      // #endif
      // #ifdef H5
      if (refreshTimer !== null) clearTimeout(refreshTimer)
      navigator.geolocation.clearWatch(id)
      // #endif
    }
  }
}
