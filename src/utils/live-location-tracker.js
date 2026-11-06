// Dedicated watch handles; no global location update service or storage writes.
import { androidRealtimeAvailable, watchAndroidRealtimeLocation } from './android-realtime.js'
export const liveLocationTracker = {
  managesTimeout() { return androidRealtimeAvailable() },
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
    let stopped = false, id
    const receive = result => {
      if (stopped) return
      const point = result.coords || result
      success({ latitude: point.latitude, longitude: point.longitude, accuracy: point.accuracy, coordinateSystem: 'wgs84' })
    }
    const error = value => { if (!stopped) failure(value) }
    // #ifdef APP-PLUS
    if (androidRealtimeAvailable()) return watchAndroidRealtimeLocation(receive, error)
    id = plus.geolocation.watchPosition(receive, error, {
      provider: 'system', coordsType: 'gps', enableHighAccuracy: true, maximumAge: 0, timeout: 15000, geocode: false
    })
    // #endif
    // #ifdef H5
    id = navigator.geolocation.watchPosition(receive, error, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 })
    // #endif
    return () => {
      stopped = true
      // #ifdef APP-PLUS
      plus.geolocation.clearWatch(id)
      // #endif
      // #ifdef H5
      navigator.geolocation.clearWatch(id)
      // #endif
    }
  }
}
