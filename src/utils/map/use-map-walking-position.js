import { computed } from 'vue'

// #ifdef H5 || APP-PLUS
import { onMounted, onScopeDispose, shallowRef, watch } from 'vue'
import { onHide, onShow } from '@/utils/app-tab-lifecycle.js'
import { liveLocationTracker } from '../realtime/live-location-tracker.js'
import { wgs84ToGcj02 } from './coordinates.mjs'

function headingOrNull(value) {
  return Number.isFinite(value) && value >= 0 && value <= 360 ? value % 360 : null
}

function watchCompass(receive) {
  // #ifdef H5
  const update = event => {
    const compass = headingOrNull(event.webkitCompassHeading)
    if (compass !== null && !(event.webkitCompassAccuracy < 0)) receive(compass)
    else if (event.absolute && headingOrNull(event.alpha) !== null) receive((360 - event.alpha) % 360)
  }
  window.addEventListener('deviceorientationabsolute', update)
  window.addEventListener('deviceorientation', update)
  return () => {
    window.removeEventListener('deviceorientationabsolute', update)
    window.removeEventListener('deviceorientation', update)
  }
  // #endif
  // #ifdef APP-PLUS
  if (typeof plus === 'undefined' || !plus.orientation?.watchOrientation) return
  const orientation = plus.orientation
  const id = orientation.watchOrientation(sample => {
    receive(sample.headingAccuracy < 0 ? null : headingOrNull(sample.trueHeading) ?? headingOrNull(sample.magneticHeading))
  }, () => receive(null), { frequency: 500 })
  if (id != null) return () => orientation.clearWatch(id)
  // #endif
}
// #endif

export function useMapWalkingPosition(route) {
  const origin = computed(() => route.value?.from ?? null)
  // #ifndef H5 || APP-PLUS
  // The native map supplies the current blue dot and handles recentering itself.
  return { position: origin }
  // #endif
  // #ifdef H5 || APP-PLUS
  const live = shallowRef(null)
  const position = computed(() => live.value ?? origin.value)
  let pageVisible = false, appVisible = true, stopTracking

  function syncTracking() {
    const start = origin.value
    if (!pageVisible || !appVisible || !start) {
      stopTracking?.()
      stopTracking = undefined
      if (!start) live.value = null
      else if (live.value?.heading != null) live.value = { ...live.value, heading: null }
      return
    }
    if (stopTracking) return

    let active = true, timer = null, point = live.value ?? start, course = null, compass = null
    let stopLocation, stopCompass
    function publish() {
      if (!active || timer !== null) return
      timer = setTimeout(() => {
        timer = null
        const heading = course ?? compass
        const previous = position.value
        if (previous.latitude !== point.latitude || previous.longitude !== point.longitude ||
            (previous.heading ?? null) !== heading) live.value = { ...point, heading }
      }, 350)
    }
    stopTracking = () => {
      active = false
      clearTimeout(timer)
      stopLocation?.()
      stopCompass?.()
    }

    // Keep this watch independent of the Android chat-sharing callback.
    const locationOptions = { systemOnly: true }
    const unavailable = () => {
      if (!active) return
      course = null
      publish()
    }
    try {
      if (liveLocationTracker.supported(locationOptions)) stopLocation = liveLocationTracker.watch(update => {
        if (!active || update.coordinateSystem !== 'wgs84') return
        point = wgs84ToGcj02(update.latitude, update.longitude)
        course = headingOrNull(update.heading)
        publish()
      }, unavailable, locationOptions)
    } catch (_) { unavailable() }
    try {
      stopCompass = watchCompass(heading => { compass = heading; publish() })
    } catch (_) { /* Location updates still work if the device has no compass. */ }
  }

  watch(origin, syncTracking, { flush: 'sync' })
  onShow(() => { pageVisible = true; syncTracking() })
  onHide(() => { pageVisible = false; syncTracking() })
  // #ifdef H5
  const syncDocument = () => { appVisible = !document.hidden; syncTracking() }
  onMounted(() => { syncDocument(); document.addEventListener('visibilitychange', syncDocument) })
  onScopeDispose(() => document.removeEventListener('visibilitychange', syncDocument))
  // #endif
  // #ifdef APP-PLUS
  const show = () => { appVisible = true; syncTracking() }
  const hide = () => { appVisible = false; syncTracking() }
  uni.onAppShow?.(show)
  uni.onAppHide?.(hide)
  onScopeDispose(() => { uni.offAppShow?.(show); uni.offAppHide?.(hide) })
  // #endif
  onScopeDispose(() => { pageVisible = false; syncTracking() })
  return { position }
  // #endif
}
