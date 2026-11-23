import { validDisposalLocation } from './nearby-disposal.mjs'

function decodeText(value) {
  const text = typeof value === 'string' ? value : ''
  try { return decodeURIComponent(text) } catch (_) { return text }
}

// Platform points retain their identity; ordinary shared locations have no bin actions.
export async function resolveMapViewCard(options, loadPoint) {
  let point
  if (options.pointId != null) {
    const id = String(options.pointId)
    if (!/^[1-9]\d{0,15}$/.test(id)) throw new Error('投放点信息无效')
    const response = await loadPoint(id)
    point = response?.code === 0 ? response.data : null
    if (!point || String(point.id) !== id || !validDisposalLocation(point)) throw new Error('投放点已移除或暂不可用')
    point = { ...point, id, latitude: Number(point.latitude), longitude: Number(point.longitude), sharedLocation: false }
  } else {
    const location = { latitude: options.lat, longitude: options.lng }
    if (!validDisposalLocation(location)) throw new Error('位置信息无效')
    point = { id: -2, latitude: Number(location.latitude), longitude: Number(location.longitude),
      name: decodeText(options.name) || '分享位置', description: decodeText(options.address), sharedLocation: true }
  }
  return {
    point,
    reportRequested: options.report === '1' && !point.sharedLocation,
    reportReason: decodeText(options.reason).trim().slice(0, 200),
    location: { latitude: point.latitude, longitude: point.longitude, name: point.name || '投放点', address: point.description || '' }
  }
}
