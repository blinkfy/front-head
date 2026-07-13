import PARK_ROAD_NETWORK from '@/config/park-road-network.json'
import PARK_ROUTE_GRAPH from '@/config/park-route-graph.json'

const nodeById = new Map(PARK_ROAD_NETWORK.nodes.map(node => [node.id, node]))
const edgeById = new Map(PARK_ROAD_NETWORK.edges.map(edge => [edge.id, edge]))
const routeById = new Map(PARK_ROUTE_GRAPH.routes.map(route => [route.id, route]))

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
