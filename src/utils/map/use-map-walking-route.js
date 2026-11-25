import { computed, shallowRef } from 'vue'
import { getWalkingRoute } from '@/api/map.js'
import { getUserLocationOnce } from '@/utils/location.js'
// #ifdef H5
import { wgs84ToGcj02 } from './coordinates.mjs'
// #endif

export function walkingRouteCoordinates(point) {
  const [latitude, longitude] = Array.isArray(point) ? point : [point?.latitude, point?.longitude]
  if (latitude == null || latitude === '' || longitude == null || longitude === '') return null
  const lat = Number(latitude)
  const lng = Number(longitude)
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { latitude: lat, longitude: lng } : null
}

export function walkingDestinationMarker(destination) {
  return {
    id: -1, ...destination, iconPath: '/static/normal-marker.png', width: 40, height: 45, anchor: { x: 0.5, y: 1 }, zIndex: 10,
    callout: { content: '终点', color: '#ffffff', bgColor: '#183a85', padding: 5, borderRadius: 8, display: 'ALWAYS' }
  }
}

async function getMapWalkingOrigin(isCurrent) {
  const options = { interactive: true, highAccuracy: true, isCurrent }
  // #ifdef H5
  const position = await getUserLocationOnce('wgs84', options)
  return wgs84ToGcj02(position.latitude, position.longitude)
  // #endif
  // #ifndef H5
  return getUserLocationOnce('gcj02', options)
  // #endif
}

export function useMapWalkingRoute() {
  const walkingRoute = shallowRef(null)
  const walkingOverlay = computed(() => walkingRoute.value?.overlay || null)
  const walkingPolyline = computed(() => walkingOverlay.value ? [{
    points: walkingOverlay.value.points, color: '#2259df', width: 8, borderColor: '#ffffff', borderWidth: 3,
    // #ifdef MP-WEIXIN
    arrowLine: true
    // #endif
  }] : [])
  let requestId = 0

  function closeWalkingRoute() {
    requestId++
    walkingRoute.value = null
  }

  async function showWalkingRoute(point) {
    const id = ++requestId
    const destination = walkingRouteCoordinates(point)
    walkingRoute.value = { status: 'loading' }
    if (!destination) {
      walkingRoute.value = { status: 'error', message: '这个点位的坐标暂不可用' }
      return
    }
    let from
    try {
      from = walkingRouteCoordinates(await getMapWalkingOrigin(() => id === requestId))
    } catch (_) { /* The user can still open the destination in Maps. */ }
    if (id !== requestId) return
    if (!from) {
      walkingRoute.value = { status: 'error', message: '未能获取当前位置' }
      return
    }
    walkingRoute.value = { status: 'loading', from }
    try {
      const response = await getWalkingRoute(from, { ...destination, name: point.title || point.name })
      if (id !== requestId) return
      const { polyline, distanceMeters, durationSeconds } = response?.data || {}
      const points = Array.isArray(polyline) ? polyline.map(walkingRouteCoordinates) : []
      if (points.length < 2 || points.some(p => !p)) {
        walkingRoute.value = { status: 'error', message: '未找到可用的步行路线', from }
        return
      }
      walkingRoute.value = { status: 'ready', from, distanceMeters, durationSeconds, overlay: { id, points, destination } }
    } catch (error) {
      if (id === requestId) {
        const message = error?.statusCode === 422 ? '未找到可用的步行路线' : '步行路线暂不可用'
        walkingRoute.value = { status: 'error', message, from }
      }
    }
  }

  return { walkingRoute, walkingOverlay, walkingPolyline, closeWalkingRoute, showWalkingRoute }
}
