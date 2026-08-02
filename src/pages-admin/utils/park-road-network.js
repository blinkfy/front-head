import PARK_ROAD_NETWORK from '@/pages-admin/config/park-road-network.json'
import PARK_ROUTE_GRAPH from '@/pages-admin/config/park-route-graph.json'

const nodeById = new Map(PARK_ROAD_NETWORK.nodes.map(node => [node.id, node]))
const edgeById = new Map(PARK_ROAD_NETWORK.edges.map(edge => [edge.id, edge]))
const routeById = new Map(PARK_ROUTE_GRAPH.routes.map(route => [route.id, route]))
const roadSegmentCache = new Map()
const preferredRoadPolylineCache = new Map()

function curvePoint(points, t) {
  if (points.length === 3) {
    const mt = 1 - t
    return {
      x: mt * mt * points[0].x + 2 * mt * t * points[1].x + t * t * points[2].x,
      y: mt * mt * points[0].y + 2 * mt * t * points[1].y + t * t * points[2].y
    }
  }
  if (points.length === 4) {
    const mt = 1 - t
    return {
      x: mt ** 3 * points[0].x + 3 * mt * mt * t * points[1].x + 3 * mt * t * t * points[2].x + t ** 3 * points[3].x,
      y: mt ** 3 * points[0].y + 3 * mt * mt * t * points[1].y + 3 * mt * t * t * points[2].y + t ** 3 * points[3].y
    }
  }
  const last = points[points.length - 1]
  return { x: points[0].x + (last.x - points[0].x) * t, y: points[0].y + (last.y - points[0].y) * t }
}

export function parkRoadEdgePath(edge) {
  const from = nodeById.get(edge.from)
  const to = nodeById.get(edge.to)
  if (!from || !to) return ''
  if (edge.controlPoints?.length === 1) {
    const [control] = edge.controlPoints
    return `M ${from.x} ${from.y} Q ${control[0]} ${control[1]} ${to.x} ${to.y}`
  }
  if (edge.controlPoints?.length === 2) {
    const [first, second] = edge.controlPoints
    return `M ${from.x} ${from.y} C ${first[0]} ${first[1]} ${second[0]} ${second[1]} ${to.x} ${to.y}`
  }
  return `M ${from.x} ${from.y} L ${to.x} ${to.y}`
}

export function sampleParkRoadEdge(edge, reverse = false) {
  const source = reverse ? nodeById.get(edge.to) : nodeById.get(edge.from)
  const target = reverse ? nodeById.get(edge.from) : nodeById.get(edge.to)
  if (!source || !target) return []
  const controls = (edge.controlPoints || []).map(([x, y]) => ({ x, y }))
  if (reverse) controls.reverse()
  const points = [source, ...controls, target]
  const segments = controls.length ? 16 : 1
  return Array.from({ length: segments + 1 }, (_, index) => curvePoint(points, index / segments))
}

function roadSegmentsForEntity(entityType) {
  if (roadSegmentCache.has(entityType)) return roadSegmentCache.get(entityType)
  const segments = []
  PARK_ROAD_NETWORK.edges
    .filter(edge => edge.enabled !== false && Array.isArray(edge.allowedEntities) && edge.allowedEntities.includes(entityType))
    .forEach(edge => {
      const points = sampleParkRoadEdge(edge)
      for (let index = 1; index < points.length; index += 1) {
        segments.push({ edgeId: edge.id, segmentIndex: index, from: points[index - 1], to: points[index] })
      }
    })
  roadSegmentCache.set(entityType, segments)
  return segments
}

export function nearestParkRoadPoint(point, entityType = 'visitor') {
  const source = { x: Number(point?.x) || 0, y: Number(point?.y) || 0 }
  let nearest = null
  let nearestDistance = Infinity
  for (const segment of roadSegmentsForEntity(entityType)) {
    const dx = segment.to.x - segment.from.x
    const dy = segment.to.y - segment.from.y
    const lengthSquared = dx * dx + dy * dy
    const amount = lengthSquared
      ? Math.max(0, Math.min(1, ((source.x - segment.from.x) * dx + (source.y - segment.from.y) * dy) / lengthSquared))
      : 0
    const candidate = { x: segment.from.x + dx * amount, y: segment.from.y + dy * amount }
    const distance = Math.hypot(candidate.x - source.x, candidate.y - source.y)
    if (distance < nearestDistance) {
      nearestDistance = distance
      const length = Math.sqrt(lengthSquared) || 1
      nearest = {
        ...candidate,
        edgeId: segment.edgeId,
        segmentIndex: segment.segmentIndex,
        segmentAmount: amount,
        distance,
        tangentX: dx / length,
        tangentY: dy / length
      }
    }
  }
  return nearest || { ...source, edgeId: '', segmentIndex: 1, segmentAmount: 0, distance: 0, tangentX: 0, tangentY: 1 }
}

function allowedRoadEdges(entityType) {
  return PARK_ROAD_NETWORK.edges.filter(edge => (
    edge.enabled !== false
    && edge.blocked !== true
    && Array.isArray(edge.allowedEntities)
    && edge.allowedEntities.includes(entityType)
  ))
}

function appendPolyline(target, source) {
  for (const point of source || []) {
    const previous = target[target.length - 1]
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 0.001) target.push({ x: point.x, y: point.y })
  }
  return target
}

function polylineLength(points) {
  return (points || []).slice(1).reduce((total, point, index) => (
    total + Math.hypot(point.x - points[index].x, point.y - points[index].y)
  ), 0)
}

function anchorToNodePoints(anchor, edge, nodeId) {
  const points = sampleParkRoadEdge(edge)
  const segmentIndex = Math.max(1, Math.min(points.length - 1, Number(anchor.segmentIndex) || 1))
  if (nodeId === edge.from) return [anchor, ...points.slice(0, segmentIndex).reverse()]
  return [anchor, ...points.slice(segmentIndex)]
}

function pointsBetweenAnchors(fromAnchor, toAnchor, edge) {
  const points = sampleParkRoadEdge(edge)
  const fromPosition = (Number(fromAnchor.segmentIndex) || 1) - 1 + (Number(fromAnchor.segmentAmount) || 0)
  const toPosition = (Number(toAnchor.segmentIndex) || 1) - 1 + (Number(toAnchor.segmentAmount) || 0)
  if (fromPosition <= toPosition) {
    return [fromAnchor, ...points.slice(fromAnchor.segmentIndex, toAnchor.segmentIndex), toAnchor]
  }
  return [toAnchor, ...points.slice(toAnchor.segmentIndex, fromAnchor.segmentIndex), fromAnchor].reverse()
}

function shortestRoadTraversal(startNodeId, endNodeId, entityType) {
  if (startNodeId === endNodeId) return []
  const edges = allowedRoadEdges(entityType)
  const nodeIds = new Set(edges.flatMap(edge => [edge.from, edge.to]))
  const distances = new Map([...nodeIds].map(nodeId => [nodeId, Infinity]))
  const previous = new Map()
  const pending = new Set(nodeIds)
  distances.set(startNodeId, 0)

  while (pending.size) {
    let currentId = ''
    let currentDistance = Infinity
    pending.forEach(nodeId => {
      const distance = distances.get(nodeId) ?? Infinity
      if (distance < currentDistance) {
        currentId = nodeId
        currentDistance = distance
      }
    })
    if (!currentId || currentDistance === Infinity) break
    pending.delete(currentId)
    if (currentId === endNodeId) break

    edges.forEach(edge => {
      let nextId = ''
      let reverse = false
      if (edge.from === currentId) nextId = edge.to
      else if (edge.bidirectional !== false && edge.to === currentId) {
        nextId = edge.from
        reverse = true
      }
      if (!nextId || !pending.has(nextId)) return
      const distance = currentDistance + (Number(edge.distance) || polylineLength(sampleParkRoadEdge(edge)))
      if (distance >= (distances.get(nextId) ?? Infinity)) return
      distances.set(nextId, distance)
      previous.set(nextId, { fromId: currentId, edge, reverse })
    })
  }

  if (!previous.has(endNodeId)) return null
  const traversal = []
  let currentId = endNodeId
  while (currentId !== startNodeId) {
    const step = previous.get(currentId)
    if (!step) return null
    traversal.push({ edge: step.edge, reverse: step.reverse })
    currentId = step.fromId
  }
  return traversal.reverse()
}

function cacheKeyForRoadPolyline(from, to, entityType) {
  const coordinate = value => (Number(value) || 0).toFixed(3)
  return `${entityType}:${coordinate(from.x)},${coordinate(from.y)}:${coordinate(to.x)},${coordinate(to.y)}`
}

export function preferredParkRoadPolyline(from, to, entityType = 'visitor') {
  const source = { x: Number(from?.x) || 0, y: Number(from?.y) || 0 }
  const target = { x: Number(to?.x) || 0, y: Number(to?.y) || 0 }
  const cacheKey = cacheKeyForRoadPolyline(source, target, entityType)
  if (preferredRoadPolylineCache.has(cacheKey)) return preferredRoadPolylineCache.get(cacheKey)

  const startAnchor = nearestParkRoadPoint(source, entityType)
  const endAnchor = nearestParkRoadPoint(target, entityType)
  const startEdge = edgeById.get(startAnchor.edgeId)
  const endEdge = edgeById.get(endAnchor.edgeId)
  const candidates = []

  if (startEdge && startEdge.id === endEdge?.id) {
    const direct = []
    appendPolyline(direct, [source])
    appendPolyline(direct, pointsBetweenAnchors(startAnchor, endAnchor, startEdge))
    appendPolyline(direct, [target])
    candidates.push(direct)
  }

  if (startEdge && endEdge) {
    for (const startNodeId of [startEdge.from, startEdge.to]) {
      for (const endNodeId of [endEdge.from, endEdge.to]) {
        const traversal = shortestRoadTraversal(startNodeId, endNodeId, entityType)
        if (!traversal) continue
        const candidate = []
        appendPolyline(candidate, [source])
        appendPolyline(candidate, anchorToNodePoints(startAnchor, startEdge, startNodeId))
        traversal.forEach(step => appendPolyline(candidate, sampleParkRoadEdge(step.edge, step.reverse)))
        appendPolyline(candidate, anchorToNodePoints(endAnchor, endEdge, endNodeId).reverse())
        appendPolyline(candidate, [target])
        candidates.push(candidate)
      }
    }
  }

  const result = candidates.sort((left, right) => polylineLength(left) - polylineLength(right))[0] || [source, target]
  if (preferredRoadPolylineCache.size > 300) preferredRoadPolylineCache.clear()
  preferredRoadPolylineCache.set(cacheKey, result)
  return result
}

export function parkPolylinePoint(points, progress = 0) {
  if (!points?.length) return { x: 0, y: 0 }
  if (points.length === 1) return points[0]
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y))
  let remaining = Math.max(0, Math.min(1, Number(progress) || 0)) * lengths.reduce((total, length) => total + length, 0)
  for (let index = 0; index < lengths.length; index += 1) {
    if (remaining <= lengths[index] || index === lengths.length - 1) {
      const amount = lengths[index] ? remaining / lengths[index] : 0
      return {
        x: points[index].x + (points[index + 1].x - points[index].x) * amount,
        y: points[index].y + (points[index + 1].y - points[index].y) * amount
      }
    }
    remaining -= lengths[index]
  }
  return points[points.length - 1]
}

export function parkRouteTraversal(routeId) {
  const route = routeById.get(routeId)
  if (!route) return []
  let currentId = route.startNodeId
  return route.edgeIds.map(edgeId => {
    const edge = edgeById.get(edgeId)
    if (!edge) return null
    const reverse = edge.to === currentId
    if (!reverse && edge.from !== currentId) return null
    currentId = reverse ? edge.from : edge.to
    return { edge, reverse }
  }).filter(Boolean)
}

export function parkRoutePolyline(routeId) {
  const points = []
  for (const traversal of parkRouteTraversal(routeId)) {
    const sampled = sampleParkRoadEdge(traversal.edge, traversal.reverse)
    points.push(...(points.length ? sampled.slice(1) : sampled))
  }
  return points
}

export function parkRoutePoint(routeId, progress = 0) {
  const points = parkRoutePolyline(routeId)
  if (!points.length) return { x: 0, y: 0 }
  if (points.length === 1) return points[0]
  const lengths = []
  let total = 0
  for (let index = 1; index < points.length; index += 1) {
    const length = Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y)
    lengths.push(length)
    total += length
  }
  let remaining = Math.max(0, Math.min(1, Number(progress) || 0)) * total
  for (let index = 0; index < lengths.length; index += 1) {
    if (remaining <= lengths[index] || index === lengths.length - 1) {
      const amount = lengths[index] ? remaining / lengths[index] : 0
      return {
        x: points[index].x + (points[index + 1].x - points[index].x) * amount,
        y: points[index].y + (points[index + 1].y - points[index].y) * amount
      }
    }
    remaining -= lengths[index]
  }
  return points[points.length - 1]
}

export function parkRouteSvgPoints(routeId) {
  return parkRoutePolyline(routeId).map(point => `${point.x.toFixed(3)},${point.y.toFixed(3)}`).join(' ')
}

export function parkEdgesForRoute(routeId) {
  return parkRouteTraversal(routeId).map(traversal => traversal.edge)
}

export function parkRoadNode(nodeId) {
  return nodeById.get(nodeId) || null
}

export { PARK_ROAD_NETWORK, PARK_ROUTE_GRAPH }
