const STORAGE_KEY = 'map:last-device-location'

function validLocation(location) {
  if (!location || typeof location.latitude !== 'number' || typeof location.longitude !== 'number') return false
  const { latitude, longitude } = location
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
}

export function getLastMapLocation() {
  try {
    const location = uni.getStorageSync(STORAGE_KEY)
    return validLocation(location) ? { latitude: location.latitude, longitude: location.longitude } : null
  } catch (_) {
    return null
  }
}

export function saveLastMapLocation(location) {
  if (validLocation(location)) {
    try { uni.setStorageSync(STORAGE_KEY, { latitude: location.latitude, longitude: location.longitude }) } catch (_) {}
  }
  return location
}
