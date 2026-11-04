import { validDisposalLocation } from './nearby-disposal.mjs'

// View mode skips the bin-list request, so native maps need their own target marker.
export function getViewLocationMarkers(location) {
  if (!validDisposalLocation(location)) return []
  return [{
    id: -2, latitude: Number(location.latitude), longitude: Number(location.longitude),
    title: String(location.name || '投放点'), iconPath: '/static/normal-marker.png',
    width: 42, height: 46, anchor: { x: 0.5, y: 1 },
    callout: { content: String(location.name || '投放点'), color: '#ffffff', bgColor: '#4d6bfe',
      padding: 6, borderRadius: 6, display: 'ALWAYS' }
  }]
}
