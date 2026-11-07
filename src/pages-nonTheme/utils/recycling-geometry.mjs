import { wgs84ToGcj02 as convertWgs84ToGcj02 } from '../../utils/live-location-coordinates.mjs'

export function wgs84ToGcj02(point, longitude) {
  return typeof point === 'object' ? convertWgs84ToGcj02(point.latitude, point.longitude) : convertWgs84ToGcj02(point, longitude)
}
export const EARTH_RADIUS_METERS = 6371008.8
const EPSILON = 1e-10
const finite = value => typeof value === 'number' && Number.isFinite(value)
export function normalizePoint(point) {
  if (!point || !finite(point.latitude) || !finite(point.longitude) || Math.abs(point.latitude) > 85 || Math.abs(point.longitude) > 180) return null
  return { latitude: point.latitude, longitude: point.longitude }
}
const samePoint = (a, b) => a.latitude === b.latitude && a.longitude === b.longitude
const cross = (a, b, p) => (b.longitude - a.longitude) * (p.latitude - a.latitude) - (b.latitude - a.latitude) * (p.longitude - a.longitude)
export function pointOnSegment(point, a, b) {
  return Math.abs(cross(a, b, point)) <= EPSILON && point.latitude >= Math.min(a.latitude, b.latitude) - EPSILON && point.latitude <= Math.max(a.latitude, b.latitude) + EPSILON && point.longitude >= Math.min(a.longitude, b.longitude) - EPSILON && point.longitude <= Math.max(a.longitude, b.longitude) + EPSILON
}
function segmentsIntersect(a, b, c, d) {
  if (pointOnSegment(a, c, d) || pointOnSegment(b, c, d) || pointOnSegment(c, a, b) || pointOnSegment(d, a, b)) return true
  return (cross(a, b, c) > 0) !== (cross(a, b, d) > 0) && (cross(c, d, a) > 0) !== (cross(c, d, b) > 0)
}
export function geometryError(value) {
  if (!value || value.coordinateSystem !== 'wgs84') return '请在地图上绘制服务范围'
  if (value.type === 'circle') {
    if (!normalizePoint(value.center)) return '请在地图上选择圆心'
    return finite(value.radiusMeters) && value.radiusMeters >= 100 && value.radiusMeters <= 50000 ? '' : '半径须为 100 至 50000 米'
  }
  if (value.type !== 'polygon' || !Array.isArray(value.points)) return '请选择圆形或多边形范围'
  const points = value.points.slice()
  if (points.length > 1 && points[0] && points[points.length - 1] && samePoint(points[0], points[points.length - 1])) points.pop()
  if (points.length < 3 || points.length > 30) return '多边形须有 3 至 30 个顶点'
  if (points.some(point => !normalizePoint(point))) return '顶点坐标无效'
  if (new Set(points.map(point => `${point.latitude},${point.longitude}`)).size !== points.length) return '顶点不能重复'
  const latitudes = points.map(point => point.latitude), longitudes = points.map(point => point.longitude)
  if (Math.max(...latitudes) - Math.min(...latitudes) > 2 || Math.max(...longitudes) - Math.min(...longitudes) > 2) return '服务范围跨度不能超过 2 度或跨越日期变更线'
  let area = 0
  const origin = points[0]
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length]
    area += (a.longitude - origin.longitude) * (b.latitude - origin.latitude) - (b.longitude - origin.longitude) * (a.latitude - origin.latitude)
    // Adjacent edges may meet only at their shared vertex; reject backtracking.
    const c = points[(i + 2) % points.length]
    if (pointOnSegment(a, b, c) || pointOnSegment(c, a, b)) return '边界不能重叠或折返'
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue
      if (segmentsIntersect(a, b, points[j], points[(j + 1) % points.length])) return '多边形边界不能相交或相触'
    }
  }
  return Math.abs(area) >= EPSILON ? '' : '多边形面积不能为零'
}
export function normalizeGeometry(value) {
  if (geometryError(value)) return null
  if (value.type === 'circle') return { type: 'circle', coordinateSystem: 'wgs84', center: normalizePoint(value.center), radiusMeters: value.radiusMeters }
  const points = value.points.map(normalizePoint)
  if (samePoint(points[0], points[points.length - 1])) points.pop()
  return { type: 'polygon', coordinateSystem: 'wgs84', points }
}
export function distanceMeters(a, b) {
  const rad = Math.PI / 180
  const x = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(Math.min(1, x)), Math.sqrt(Math.max(0, 1 - x)))
}
function distanceToSegmentMeters(location, a, b) {
  // Project to metres around the query point. Service polygons span at most 2 degrees.
  const radians = Math.PI / 180, radius = 6371008.8
  const scaleX = radians * radius * Math.cos(location.latitude * radians), scaleY = radians * radius
  const ax = (a.longitude - location.longitude) * scaleX, ay = (a.latitude - location.latitude) * scaleY
  const bx = (b.longitude - location.longitude) * scaleX, by = (b.latitude - location.latitude) * scaleY
  const dx = bx - ax, dy = by - ay, lengthSquared = dx * dx + dy * dy
  const fraction = lengthSquared ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared)) : 0
  return Math.sqrt((ax + fraction * dx) ** 2 + (ay + fraction * dy) ** 2)
}
export function bookingToleranceMeters(accuracyMeters) {
  return typeof accuracyMeters === 'number' && Number.isFinite(accuracyMeters) && accuracyMeters >= 0
    ? Math.max(50, Math.min(200, accuracyMeters)) : 50
}
export function coversServiceLocation(geometry, location) {
  return containsPoint(geometry, location, bookingToleranceMeters(location?.accuracyMeters))
}
export function containsPoint(value, rawPoint, toleranceMeters = 0) {
  const geometry = normalizeGeometry(value), point = normalizePoint(rawPoint)
  if (!geometry || !point) return false
  const tolerance = typeof toleranceMeters === 'number' && Number.isFinite(toleranceMeters) ? Math.max(0, Math.min(200, toleranceMeters)) : 0
  if (geometry.type === 'circle') return distanceMeters(geometry.center, point) <= geometry.radiusMeters + tolerance + 1e-6
  let inside = false
  const points = geometry.points
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j], b = points[i]
    if (pointOnSegment(point, a, b)) return true
    if ((a.latitude > point.latitude) !== (b.latitude > point.latitude) && point.longitude < (b.longitude - a.longitude) * (point.latitude - a.latitude) / (b.latitude - a.latitude) + a.longitude) inside = !inside
  }
  return inside || (tolerance > 0 && points.some((a, i) => distanceToSegmentMeters(point, a, points[(i + 1) % points.length]) <= tolerance + 1e-6))
}
export function geometryBounds(value) {
  const geometry = normalizeGeometry(value)
  if (!geometry) return null
  if (geometry.type === 'polygon') return { south: Math.min(...geometry.points.map(p => p.latitude)), north: Math.max(...geometry.points.map(p => p.latitude)), west: Math.min(...geometry.points.map(p => p.longitude)), east: Math.max(...geometry.points.map(p => p.longitude)) }
  const delta = geometry.radiusMeters / EARTH_RADIUS_METERS
  const latDelta = delta * 180 / Math.PI
  const lngDelta = Math.asin(Math.min(1, Math.sin(delta) / Math.cos(geometry.center.latitude * Math.PI / 180))) * 180 / Math.PI
  return { south: geometry.center.latitude - latDelta, north: geometry.center.latitude + latDelta, west: geometry.center.longitude - lngDelta, east: geometry.center.longitude + lngDelta }
}
// Iteratively invert the existing local WGS84 -> GCJ02 transform (no network/key).
export function gcj02ToWgs84(latitude, longitude) {
  if (latitude && typeof latitude === 'object') { longitude = latitude.longitude; latitude = latitude.latitude }
  let result = { latitude, longitude }
  if (!normalizePoint(result)) return null
  for (let i = 0; i < 6; i++) {
    const shifted = wgs84ToGcj02(result.latitude, result.longitude)
    const latError = shifted.latitude - latitude, lngError = shifted.longitude - longitude
    result = { latitude: result.latitude - latError, longitude: result.longitude - lngError }
    if (Math.abs(latError) + Math.abs(lngError) < 1e-9) break
  }
  return normalizePoint(result)
}
