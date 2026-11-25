const MERCATOR_MAX_LATITUDE = 85.0511287798066
const WORLD_TILE_SIZE = 256
const DEFAULT_RADIUS = 28
// At close street level, only truly coincident coordinates remain grouped.
const DEFAULT_MAX_ZOOM = 18

function readCoordinate(value) {
  if (typeof value === 'string' && value.trim()) return Number(value)
  return typeof value === 'number' ? value : NaN
}

function projectPoint(point) {
  const latitude = readCoordinate(point?.latitude)
  const longitude = readCoordinate(point?.longitude)
  if (point?.id == null || !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
    !Number.isFinite(longitude) || Math.abs(longitude) > 180) return null

  const wrappedLongitude = longitude === 180 ? -180 : longitude
  const mercatorLatitude = Math.max(-MERCATOR_MAX_LATITUDE, Math.min(MERCATOR_MAX_LATITUDE, latitude))
  const sine = Math.sin(mercatorLatitude * Math.PI / 180)
  return {
    point,
    key: String(point.id),
    category: JSON.stringify([point.type ?? null, point.mapType ?? null]),
    latitude,
    longitude: wrappedLongitude,
    x: (wrappedLongitude + 180) / 360,
    y: 0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)
  }
}

function findNearbyGroup(grid, entry, step) {
  const horizontalPositions = [entry.x]
  // Search the opposite world edge when the radius crosses the antimeridian.
  if (entry.x <= step) horizontalPositions.push(entry.x + 1)
  if (entry.x + step >= 1) horizontalPositions.push(entry.x - 1)

  const gridY = Math.floor(entry.y / step)
  let nearestGroup
  let nearestDistance = step ** 2
  for (const x of horizontalPositions) {
    const gridX = Math.floor(x / step)
    for (let row = -1; row <= 1; row++) {
      for (let column = -1; column <= 1; column++) {
        const candidates = grid.get(`${entry.category}:${gridX + column},${gridY + row}`)
        if (!candidates) continue
        for (const group of candidates) {
          const distance = (x - group[0].x) ** 2 + (entry.y - group[0].y) ** 2
          if (distance > nearestDistance || (nearestGroup && distance === nearestDistance)) continue
          nearestGroup = group
          nearestDistance = distance
        }
      }
    }
  }
  return nearestGroup
}

function groupNearbyPoints(entries, step) {
  const groups = []
  const grid = new Map()
  for (const entry of entries) {
    const nearby = findNearbyGroup(grid, entry, step)
    if (nearby) {
      nearby.push(entry)
      continue
    }

    // Use a fixed anchor so a chain of nearby points cannot span the map.
    const group = [entry]
    const cell = `${entry.category}:${Math.floor(entry.x / step)},${Math.floor(entry.y / step)}`
    const candidates = grid.get(cell)
    if (candidates) candidates.push(group)
    else grid.set(cell, [group])
    groups.push(group)
  }
  return groups
}

function groupCoincidentPoints(entries) {
  const groups = new Map()
  for (const entry of entries) {
    const key = `${entry.category}:${entry.latitude},${entry.longitude}`
    const group = groups.get(key)
    if (group) group.push(entry)
    else groups.set(key, [entry])
  }
  return [...groups.values()]
}

function toMarker(group, zoom, radius, maxZoom) {
  const anchor = group[0]
  const count = group.length
  const members = group.map(entry => entry.point)
  if (count === 1) {
    return {
      type: 'point',
      id: anchor.point.id,
      latitude: anchor.latitude,
      longitude: Number(anchor.point.longitude),
      point: anchor.point,
      members,
      count
    }
  }

  let coincident = true
  let totalOffsetX = 0
  let totalY = 0
  let furthestDistanceSquared = 0
  for (const entry of group) {
    if (entry.latitude !== anchor.latitude || entry.longitude !== anchor.longitude) coincident = false
    let offsetX = entry.x - anchor.x
    if (offsetX > 0.5) offsetX -= 1
    if (offsetX < -0.5) offsetX += 1
    totalOffsetX += offsetX
    totalY += entry.y
    const distanceSquared = offsetX ** 2 + (entry.y - anchor.y) ** 2
    furthestDistanceSquared = Math.max(furthestDistanceSquared, distanceSquared)
  }

  const centerX = (anchor.x + totalOffsetX / count + 1) % 1
  const centerY = totalY / count
  const distance = Math.sqrt(furthestDistanceSquared) * WORLD_TILE_SIZE
  const firstSplitZoom = Math.floor(Math.log2(radius / distance)) + 1
  return {
    type: 'cluster',
    id: `cluster:${anchor.key}`,
    latitude: coincident ? anchor.latitude : Math.atan(Math.sinh(Math.PI * (1 - 2 * centerY))) * 180 / Math.PI,
    longitude: coincident ? anchor.longitude : centerX * 360 - 180,
    members,
    count,
    expansionZoom: coincident ? null : Math.min(maxZoom, Math.max(Math.floor(zoom) + 1, firstSplitZoom))
  }
}

export function clusterMapMarkers(points, zoom, { radius = DEFAULT_RADIUS, maxZoom = DEFAULT_MAX_ZOOM } = {}) {
  const entries = []
  for (const point of points) {
    const entry = projectPoint(point)
    if (entry) entries.push(entry)
  }
  // Stable anchors and IDs even when the same point set is fetched in a different order.
  entries.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)

  const scale = Number(zoom)
  const currentZoom = Number.isFinite(scale) ? Math.max(0, scale) : 0
  const pixels = Number.isFinite(radius) && radius > 0 ? radius : DEFAULT_RADIUS
  const zoomLimit = Number.isFinite(maxZoom) && maxZoom >= 0 ? maxZoom : DEFAULT_MAX_ZOOM
  const step = pixels / (WORLD_TILE_SIZE * 2 ** currentZoom)
  const groups = currentZoom >= zoomLimit || step === 0
    ? groupCoincidentPoints(entries)
    : groupNearbyPoints(entries, step)
  return groups.map(group => toMarker(group, currentZoom, pixels, zoomLimit))
}
