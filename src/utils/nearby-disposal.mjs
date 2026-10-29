export const NEARBY_DISPOSAL_RADIUS = 5000

export function validDisposalLocation(location) {
  return location?.latitude !== null && location?.latitude !== undefined && location?.latitude !== '' &&
    location?.longitude !== null && location?.longitude !== undefined && location?.longitude !== '' &&
    Number.isFinite(Number(location.latitude)) && Math.abs(Number(location.latitude)) <= 90 &&
    Number.isFinite(Number(location.longitude)) && Math.abs(Number(location.longitude)) <= 180
}

export function disposalDistance(origin, point) {
  const rad = Math.PI / 180
  const lat = Number(origin.latitude) * rad
  const otherLat = Number(point.latitude) * rad
  const a = Math.sin((otherLat - lat) / 2) ** 2 +
    Math.cos(lat) * Math.cos(otherLat) * Math.sin((Number(point.longitude) - Number(origin.longitude)) * rad / 2) ** 2
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, a)))
}

export function formatDisposalDistance(distance) {
  return distance < 1000 ? `${Math.max(0, Math.round(distance))} m` : `${(distance / 1000).toFixed(1)} km`
}

export function nearbyDisposalPoints(points, origin, radius = NEARBY_DISPOSAL_RADIUS) {
  if (!validDisposalLocation(origin)) return []
  return points.filter(point => validDisposalLocation(point) && point.review !== false && point.review !== 0)
    .map(point => {
      const distanceMeters = disposalDistance(origin, point)
      return { ...point, distanceMeters, distance: formatDisposalDistance(distanceMeters) }
    })
    .filter(point => point.distanceMeters <= radius)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
}
