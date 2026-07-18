import { parkRoadNode, parkRoutePolyline } from '@/utils/park-road-network.js'

const ZONE_POINTS = Object.freeze({
  zone_entrance_01: { x: 48.1, y: 87.5 },
  zone_walkway_01: { x: 48, y: 66.5 },
  zone_rest_01: { x: 31.5, y: 61.5 },
  zone_food_rest_01: { x: 64, y: 48 },
  zone_activity_01: { x: 48.1, y: 36 },
  park_entrance: { x: 48.1, y: 92.5 },
  visitor_walkway: { x: 48, y: 66.5 },
  rest_area: { x: 31.5, y: 61.5 },
  food_rest_area: { x: 64, y: 48 },
  service_food_01: { x: 64, y: 48 },
  service_rest_01: { x: 31.5, y: 61.5 },
  standby_area: { x: 27.8, y: 20.5 },
  center_ops_01: { x: 24, y: 16 }
})

const ZONE_LABELS = Object.freeze({
  zone_entrance_01: '公园入口', zone_walkway_01: '游客步道', zone_rest_01: '休息区',
  zone_food_rest_01: '餐饮休息区', zone_activity_01: '活动区', service_food_01: '餐饮区服务点',
  park_entrance: '公园入口', visitor_walkway: '游客步道', rest_area: '休息区', food_rest_area: '餐饮休息区',
  service_rest_01: '休息区服务点', standby_area: '备用区', center_ops_01: '收运中心',
  return_road_crowd_zone: '设备返航道路'
})

const asNumber = value => Number.isFinite(Number(value)) ? Number(value) : null
const firstDefined = (...values) => values.find(value => value !== undefined && value !== null)
const asArray = value => Array.isArray(value) ? value : []
const firstNonEmptyArray = (...values) => values.find(value => Array.isArray(value) && value.length) || []
const BLOCKED_ROUTE_OBSTACLE_POINT = Object.freeze({ x: 51.2, y: 28.6, zoneId: 'zone_north_garden' })
const BLOCKED_ROUTE_VEHICLE_STOP_POINT = Object.freeze({ x: 48.8, y: 46.6, zoneId: 'zone_central_walk' })
const BLOCKED_CROWD_VISUAL_SHIFT = Object.freeze({ x: -3.2, y: -10 })
const BLOCKED_RETURN_LEFT_ROAD_ROUTE = Object.freeze([
  Object.freeze({ ...BLOCKED_ROUTE_VEHICLE_STOP_POINT }),
  Object.freeze({ x: 47.8, y: 44.2, zoneId: 'zone_central_walk' }),
  Object.freeze({ x: 48.1, y: 41.1, zoneId: 'zone_central_walk' }),
  Object.freeze({ x: 48.1, y: 37.2, zoneId: 'zone_central_walk' }),
  Object.freeze({ x: 46.2, y: 34.2, zoneId: 'zone_central_walk' }),
  Object.freeze({ x: 43.7, y: 32.1, zoneId: 'zone_center_entry' }),
  Object.freeze({ x: 40.5, y: 30.2, zoneId: 'zone_center_entry' }),
  Object.freeze({ x: 37.4, y: 27.8, zoneId: 'zone_center_entry' }),
  Object.freeze({ x: 34.2, y: 25.2, zoneId: 'zone_center_entry' }),
  Object.freeze({ x: 31.8, y: 23.4, zoneId: 'zone_center_entry' })
])
const GARBAGE_VISUAL_POSITION_PCT = Object.freeze({
  garbage_daily_banana_01: Object.freeze([70, 53.3])
})
const clonePctPoint = value => {
  if (!Array.isArray(value) || value.length < 2) return null
  const x = asNumber(value[0])
  const y = asNumber(value[1])
  return x == null || y == null ? null : [x, y]
}

export function visualGarbagePositionPct(garbageId, fallbackPct) {
  const override = GARBAGE_VISUAL_POSITION_PCT[garbageId]
  return override ? [...override] : clonePctPoint(fallbackPct)
}

export function blockedReturnLeftRoadRoute() {
  return BLOCKED_RETURN_LEFT_ROAD_ROUTE.map(point => ({ ...point }))
}

function applyGarbageVisualPoint(garbageId, point) {
  const override = visualGarbagePositionPct(garbageId, null)
  if (!override) return point
  return { ...point, x: override[0], y: override[1], visualAdjusted: true }
}

function rewriteVisualGarbageRoute(points, visualGarbage, mode) {
  if (!visualGarbage?.visualAdjusted || !points.length) return points
  const route = points.map(point => ({ ...point }))
  if (mode === 'approach') route[route.length - 1] = { ...visualGarbage }
  if (mode === 'transport') route[0] = { ...visualGarbage }
  return route
}

function rewriteVisualGarbageRoutePct(points, visualPct, mode) {
  if (!Array.isArray(points) || !visualPct) return points
  const route = points.map(point => clonePctPoint(point) || point)
  if (!route.length) return route
  if (mode === 'approach') route[route.length - 1] = [...visualPct]
  if (mode === 'transport') route[0] = [...visualPct]
  return route
}

function rewriteVisualGarbageTimeline(timeline, rawPosition, visualPosition) {
  const rows = asArray(timeline)
  if (!visualPosition?.visualAdjusted || !rawPosition) return rows
  const dx = visualPosition.x - rawPosition.x
  const dy = visualPosition.y - rawPosition.y
  return rows.map(frame => {
    const point = clonePctPoint(frame?.objectPositionPct)
    return point ? { ...frame, objectPositionPct: [point[0] + dx, point[1] + dy] } : frame
  })
}

export function withVisualGarbageTaskRequest(request = {}) {
  if (!request || typeof request !== 'object') return {}
  const visualPct = visualGarbagePositionPct(
    request.garbageId,
    request.garbagePositionPct || request.robotRoute?.toGarbagePositionPct || request.robotRoute?.garbagePositionPct
  )
  if (!visualPct || !GARBAGE_VISUAL_POSITION_PCT[request.garbageId]) return request
  const route = request.robotRoute && typeof request.robotRoute === 'object'
    ? {
      ...request.robotRoute,
      toGarbagePositionPct: [...visualPct],
      ...(request.robotRoute.garbagePositionPct ? { garbagePositionPct: [...visualPct] } : {}),
      ...(Array.isArray(request.robotRoute.approachWaypointsPct)
        ? { approachWaypointsPct: rewriteVisualGarbageRoutePct(request.robotRoute.approachWaypointsPct, visualPct, 'approach') }
        : {}),
      ...(Array.isArray(request.robotRoute.transportWaypointsPct)
        ? { transportWaypointsPct: rewriteVisualGarbageRoutePct(request.robotRoute.transportWaypointsPct, visualPct, 'transport') }
        : {})
    }
    : request.robotRoute
  return { ...request, garbagePositionPct: [...visualPct], robotRoute: route }
}

export function zoneLabel(zoneId) {
  return ZONE_LABELS[zoneId] || zoneId || '—'
}

export function normalizeMapPoint(value, fallbackZone = '') {
  if (typeof value === 'string') return { ...(ZONE_POINTS[value] || ZONE_POINTS[fallbackZone] || { x: 50, y: 50 }), zoneId: value }
  if (Array.isArray(value)) {
    const [rawX, rawY] = value; const x = asNumber(rawX); const y = asNumber(rawY)
    if (x == null || y == null) return normalizeMapPoint(fallbackZone)
    if (Math.abs(x) <= 15 && Math.abs(y) <= 10) return { x: ((x + 14) / 28) * 100, y: ((9 - y) / 18) * 100 }
    return { x, y }
  }
  if (value && typeof value === 'object') {
    const zoneId = firstDefined(value.zoneId, value.zone, fallbackZone)
    if (value.positionPct) return normalizeMapPoint(value.positionPct, zoneId)
    if (value.positionM) return normalizeMapPoint(value.positionM, zoneId)
    const x = asNumber(firstDefined(value.xPct, value.leftPct, value.x))
    const y = asNumber(firstDefined(value.yPct, value.topPct, value.y))
    if (x != null && y != null) {
      if (value.unit === 'm' || value.units === 'meters') return normalizeMapPoint([x, y], zoneId)
      return { x, y, zoneId }
    }
    return normalizeMapPoint(zoneId)
  }
  return { ...(ZONE_POINTS[fallbackZone] || { x: 50, y: 50 }), zoneId: fallbackZone }
}

function isReturnRoadCrowdPayload(payload) {
  return String(payload?.crowdZone?.zoneId || '') === 'return_road_crowd_zone'
    || String(payload?.reason || '') === 'TEMPORARY_CROWD_BLOCKS_RETURN_ROUTE'
    || String(payload?.obstacle?.type || '') === 'TEMPORARY_CROWD'
}

function blockedCrowdVisualPoint(point, payload, role = 'point') {
  if (!isReturnRoadCrowdPayload(payload) || !point) return point
  const phase = String(payload?.crowdPhase || '').toUpperCase()
  if (phase === 'APPROACHING' && role === 'from') return point
  if (['DISPERSING', 'DISPERSED'].includes(phase) && role !== 'from') return point
  const x = Number(point.x)
  const y = Number(point.y)
  if (x < 45 || x > 70 || y < 31 || y > 52) return point
  return {
    ...point,
    x: Math.max(0, Math.min(100, x + BLOCKED_CROWD_VISUAL_SHIFT.x)),
    y: Math.max(0, Math.min(100, y + BLOCKED_CROWD_VISUAL_SHIFT.y))
  }
}

function normalizeVisitors(payload) {
  const visitors = firstDefined(payload.visitorSnapshots, payload.visitors, payload.actors)
  return asArray(visitors).map((visitor, index) => {
    const id = visitor.id || visitor.visitorId || `visitor_${String(index + 1).padStart(2, '0')}`
    const zoneId = visitor.zoneId || visitor.zone || visitor.toZoneId || visitor.to
    const position = normalizeMapPoint(visitor.positionPct || visitor.positionM || visitor.position || zoneId, zoneId)
    return {
      ...visitor, id, visitorId: id, zoneId,
      behavior: visitor.behavior || visitor.action || visitor.status || '停留',
      position: blockedCrowdVisualPoint(position, payload, 'snapshot')
    }
  })
}

function normalizeZoneCounts(payload) {
  const source = firstDefined(payload.zoneCounts, payload.counts, payload.regions)
  if (Array.isArray(source)) return Object.fromEntries(source.map(item => [item.zoneId || item.zone, asNumber(item.count) || 0]).filter(([key]) => key))
  return source && typeof source === 'object' ? { ...source } : null
}

function normalizeHeatZones(payload) {
  const source = firstDefined(payload.heatZones, payload.heatmap, payload.zones)
  const rows = Array.isArray(source) ? source : payload.zoneId || payload.zone ? [payload] : []
  return rows.map(item => {
    const zoneId = item.zoneId || item.zone
    const point = normalizeMapPoint(item.centerPct || item.positionPct || item.positionM || item.position || zoneId, zoneId)
    return {
      ...item, zoneId, position: point,
      intensity: Math.max(0, Math.min(1, asNumber(firstDefined(item.intensity, item.level, item.density)) || 0)),
      count: asNumber(firstDefined(item.count, item.visitorCount))
    }
  })
}

function normalizeRoutePoints(value) {
  return asArray(value).map(point => normalizeMapPoint(point?.positionPct || point?.positionM || point, point?.zoneId)).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
}

function routeNodePoint(nodeId) {
  const node = parkRoadNode(nodeId)
  return node ? { x: node.x, y: node.y, zoneId: node.zoneId } : null
}

function routeObstaclePoint(payload) {
  const blockedEdgeId = firstDefined(payload?.obstacle?.blockedEdgeId, payload?.blockedEdgeId)
  const blockedNodeId = firstDefined(payload?.obstacle?.blockedNodeId, payload?.blockedNodeId)
  if (blockedEdgeId === 'edge_east_mid_block' || blockedNodeId === 'route_blocked_mid') {
    return { ...BLOCKED_ROUTE_OBSTACLE_POINT }
  }
  return routeNodePoint(blockedNodeId)
}

function isNearPoint(point, target, tolerance) {
  return point && target && Math.hypot(point.x - target.x, point.y - target.y) <= tolerance
}

function routeIdFromNodeIds(nodeIds) {
  if (nodeIds.includes('route_center')) {
    const startsAtFood = nodeIds[0] === 'route_food'
    const startsAtRest = nodeIds[0] === 'route_rest'
    const usesCenterLoop = nodeIds.includes('route_bypass_south') || nodeIds.includes('route_bypass_west')
    const routePrefix = startsAtFood
      ? 'device_food_to_center'
      : startsAtRest ? 'device_rest_to_center' : 'device_east_junction_to_center'
    const routeId = `${routePrefix}_${usesCenterLoop ? 'center_loop' : 'direct'}`
    const canonical = parkRoutePolyline(routeId)
    if (canonical.length) return routeId
  }
  return ''
}

function legacyCenterRouteId(points) {
  const route = normalizeRoutePoints(points)
  if (route.length < 2 || route.length > 6) return ''
  const first = route[0]
  const last = route[route.length - 1]
  if (!isNearPoint(last, { x: 24, y: 14 }, 12)) return ''
  const startsAtFood = isNearPoint(first, { x: 74, y: 52 }, 9)
  const startsAtRest = isNearPoint(first, { x: 31.5, y: 61.5 }, 8)
  const startsAtEastJunction = isNearPoint(first, { x: 62, y: 46 }, 9)
  const usesCenterLoop = route.some(point => (
    isNearPoint(point, { x: 55, y: 61 }, 9) || isNearPoint(point, { x: 39, y: 49 }, 9)
  ))
  const routePrefix = startsAtFood
    ? 'device_food_to_center'
    : startsAtRest ? 'device_rest_to_center' : startsAtEastJunction ? 'device_east_junction_to_center' : ''
  return routePrefix ? `${routePrefix}_${usesCenterLoop ? 'center_loop' : 'direct'}` : ''
}

function routeFromPayload(payload, key) {
  const route = firstDefined(payload[key], payload.route?.[key], key === 'originalRoute' ? payload.route : null)
  const nodeIds = firstNonEmptyArray(
    Array.isArray(route) ? null : route?.nodeIds,
    Array.isArray(route) ? null : route?.routeNodeIds,
    key === 'newRoute' ? payload.newNodeIds : payload.originalNodeIds,
    key === 'newRoute' ? payload.route?.newNodeIds : payload.route?.originalNodeIds,
    payload.nodeIds,
    payload.routeNodeIds
  )
  const nodeRouteId = routeIdFromNodeIds(nodeIds)
  if (nodeRouteId) return normalizeRoutePoints(parkRoutePolyline(nodeRouteId))
  const routePoints = Array.isArray(route)
    ? route
    : firstDefined(route?.polyline, route?.points, route?.waypoints, route?.path)
  const legacyRouteId = legacyCenterRouteId(routePoints)
  if (legacyRouteId) return normalizeRoutePoints(parkRoutePolyline(legacyRouteId))
  if (Array.isArray(route)) return normalizeRoutePoints(route)
  return normalizeRoutePoints(route?.polyline || route?.points || route?.waypoints || route?.path)
}

function routeStopPoint(payload) {
  const routePoints = firstDefined(payload?.route, payload?.originalRoute, payload?.route?.originalRoute)
  const blockedEdgeId = firstDefined(payload?.obstacle?.blockedEdgeId, payload?.blockedEdgeId)
  const blockedNodeId = firstDefined(payload?.obstacle?.blockedNodeId, payload?.blockedNodeId)
  if (payload?.blockedProgress != null && legacyCenterRouteId(routePoints) === 'device_food_to_center_direct') {
    return { ...BLOCKED_ROUTE_VEHICLE_STOP_POINT }
  }
  if (blockedEdgeId === 'edge_east_mid_block' || blockedNodeId === 'route_blocked_mid') {
    return { ...BLOCKED_ROUTE_VEHICLE_STOP_POINT }
  }
  return routeNodePoint(firstDefined(payload?.vehiclePositionNodeId, payload?.stopNodeId, payload?.blockedNodeId, payload?.obstacle?.blockedNodeId))
}

function nearestRoutePointIndex(route, point) {
  if (!route.length || !point) return -1
  let nearestIndex = 0
  let nearestDistance = Infinity
  route.forEach((routePoint, index) => {
    const distance = Math.hypot(routePoint.x - point.x, routePoint.y - point.y)
    if (distance < nearestDistance) {
      nearestIndex = index
      nearestDistance = distance
    }
  })
  return nearestIndex
}

function nearestRouteSegmentCut(route, point) {
  if (route.length < 2 || !point) return null
  const target = normalizeMapPoint(point)
  let nearest = null
  for (let index = 0; index < route.length - 1; index += 1) {
    const from = route[index]
    const to = route[index + 1]
    const dx = to.x - from.x
    const dy = to.y - from.y
    const lengthSquared = dx * dx + dy * dy
    const amount = lengthSquared
      ? Math.max(0, Math.min(1, ((target.x - from.x) * dx + (target.y - from.y) * dy) / lengthSquared))
      : 0
    const projected = { x: from.x + dx * amount, y: from.y + dy * amount }
    const distance = Math.hypot(projected.x - target.x, projected.y - target.y)
    if (!nearest || distance < nearest.distance) nearest = { index, point: projected, distance }
  }
  return nearest
}

function routeSegmentUntilPoint(route, point) {
  const cut = nearestRouteSegmentCut(route, point)
  if (!cut) {
    const index = nearestRoutePointIndex(route, point)
    return index >= 0 ? route.slice(0, index + 1) : []
  }
  const target = normalizeMapPoint(point)
  const segment = route.slice(0, cut.index + 1)
  const endPoint = cut.distance <= 1 ? target : cut.point
  const previous = segment[segment.length - 1]
  if (!previous || Math.hypot(previous.x - endPoint.x, previous.y - endPoint.y) > 0.1) segment.push(endPoint)
  return segment
}

function isBlockedReturnRoute(payload, routeState = {}) {
  return isReturnRoadCrowdPayload(payload)
    || String(payload?.reason || routeState.reason || '') === 'TEMPORARY_CROWD_BLOCKS_RETURN_ROUTE'
    || isNearPoint(routeState.stopPosition, BLOCKED_ROUTE_VEHICLE_STOP_POINT, 1.5)
}

function blockedReturnReplannedRoute(route, payload, routeState = {}) {
  if (!isBlockedReturnRoute(payload, routeState)) return route
  return blockedReturnLeftRoadRoute()
}

function normalizeRobotRoute(payload) {
  const source = payload.robotRoute || payload.request?.robotRoute
  if (!source || typeof source !== 'object') return null
  const points = key => normalizeRoutePoints(source[key])
  const from = normalizeMapPoint(source.fromPositionPct || source.patrolPositionPct || 'zone_walkway_01')
  const garbageId = payload.garbageId || payload.request?.garbageId || source.garbageId
  const rawGarbage = normalizeMapPoint(source.toGarbagePositionPct || source.garbagePositionPct || 'zone_food_rest_01')
  const garbage = applyGarbageVisualPoint(garbageId, rawGarbage)
  const bin = normalizeMapPoint(source.toBinPositionPct || source.binPositionPct || 'service_food_01')
  const patrol = normalizeMapPoint(source.patrolPositionPct || source.fromPositionPct || 'zone_walkway_01')
  const approach = rewriteVisualGarbageRoute(points('approachWaypointsPct'), garbage, 'approach')
  const transport = rewriteVisualGarbageRoute(points('transportWaypointsPct'), garbage, 'transport')
  return {
    source: source.dataSource || payload.dataSource || 'SIM', from, garbage, bin, patrol,
    approach: approach.length ? approach : [from, garbage],
    transport: transport.length ? transport : [garbage, bin],
    returning: points('returnWaypointsPct').length ? points('returnWaypointsPct') : [bin, patrol]
  }
}

function normalizeSeries(value) {
  return asArray(value).map((item, index) => {
    if (typeof item === 'number') return { index, value: item, label: String(index + 1) }
    const numeric = asNumber(firstDefined(item.fillPct, item.value, item.predictedFillPct, item.y))
    return numeric == null ? null : { ...item, index, value: numeric, label: firstDefined(item.label, item.time, item.timestamp, item.t, String(index + 1)) }
  }).filter(Boolean)
}

function normalizePrediction(payload) {
  const prediction = payload.prediction && typeof payload.prediction === 'object' ? payload.prediction : payload
  return {
    source: firstDefined(prediction.algorithmSource, prediction.modelSource, prediction.source, payload.algorithmSource, payload.modelSource, payload.source, 'SIM'),
    currentFillPct: asNumber(firstDefined(prediction.currentFillPct, prediction.fillPct, payload.currentFillPct, payload.fillPct)),
    growthRatePctPerHour: asNumber(firstDefined(prediction.growthRatePctPerHour, prediction.growthRate, payload.growthRatePctPerHour, payload.growthRate)),
    predictedFillPct: asNumber(firstDefined(prediction.predictedFillPct, prediction.forecastFillPct, payload.predictedFillPct)),
    etaMinutes: asNumber(firstDefined(prediction.etaMinutes, prediction.minutesToFull, prediction.estimatedFullMinutes, payload.etaMinutes)),
    riskLevel: firstDefined(prediction.riskLevel, prediction.risk, payload.riskLevel, '—'),
    riskScore: asNumber(firstDefined(prediction.riskScore, payload.riskScore)),
    confidence: asNumber(firstDefined(prediction.confidence, payload.confidence)),
    modelVersion: firstDefined(prediction.modelVersion, payload.modelVersion, ''),
    estimatedFullAt: firstDefined(prediction.estimatedFullAt, payload.estimatedFullAt, null),
    windows: firstDefined(prediction.windows, payload.windows, {}),
    historical: normalizeSeries(firstDefined(prediction.historical, prediction.historicalSeries, prediction.history, payload.historical, payload.historicalSeries, payload.history)),
    forecast: normalizeSeries(firstDefined(prediction.forecast, prediction.forecastSeries, prediction.future, payload.forecast, payload.forecastSeries, payload.future)),
    reason: firstDefined(prediction.reason, payload.reason, '')
  }
}

function activeMovesFromEvent(event) {
  if (!['VISITOR_ACTIVITY_UPDATED', 'PEDESTRIAN_FLOW_UPDATED', 'CROWD_FLOW_UPDATED'].includes(event?.eventType)) return []
  const payload = event.payload || {}
  const rows = Array.isArray(payload.movements) ? payload.movements : payload.visitorId ? [payload] : []
  return rows.map(row => {
    const visitorId = row.visitorId || row.id
    const fromZoneId = row.fromZoneId || row.fromZone || row.from
    const toZoneId = row.toZoneId || row.toZone || row.to
    return {
      visitorId, behavior: row.behavior || row.action || '行走', fromZoneId, toZoneId,
      from: blockedCrowdVisualPoint(normalizeMapPoint(row.fromPositionPct || row.fromPositionM || row.fromPosition || fromZoneId, fromZoneId), payload, 'from'),
      to: blockedCrowdVisualPoint(normalizeMapPoint(row.toPositionPct || row.toPositionM || row.toPosition || toZoneId, toZoneId), payload, 'to'),
      durationMs: asNumber(row.durationMs)
    }
  }).filter(item => item.visitorId)
}

function returnRoadCrowdFinalEvent(events, startIndex = 0) {
  const rows = asArray(events).slice(Math.max(0, startIndex))
  const crowdRows = rows.filter(event => event?.eventType === 'CROWD_FLOW_UPDATED' && isReturnRoadCrowdPayload(event.payload || {}))
  return crowdRows.find(event => String(event.payload?.crowdPhase || '').toUpperCase() === 'THRESHOLD_REACHED')
    || crowdRows.at(-1)
    || null
}

function snapshotVisitors(visitors) {
  return Object.fromEntries(Object.entries(visitors || {}).map(([id, visitor]) => [
    id,
    {
      ...visitor,
      position: visitor?.position ? { ...visitor.position } : visitor?.position
    }
  ]))
}

function applyReturnRouteCrowdPreview(state, events, eventIndex, fromVisitors = null) {
  const finalEvent = returnRoadCrowdFinalEvent(events, eventIndex + 1)
  const finalPayload = finalEvent?.payload || {}
  const finalVisitors = normalizeVisitors(finalPayload)
  if (!finalVisitors.length) return false
  state.activeMoves = finalVisitors.map(visitor => {
    const previous = fromVisitors?.[visitor.id] || state.visitors[visitor.id] || visitor
    return {
      visitorId: visitor.id,
      behavior: 'GATHERING',
      fromZoneId: previous.zoneId,
      toZoneId: visitor.zoneId,
      from: previous.position || visitor.position,
      to: visitor.position,
      durationMs: asNumber(finalPayload.durationMs)
    }
  })
  finalVisitors.forEach(visitor => {
    state.visitors[visitor.id] = {
      ...(state.visitors[visitor.id] || {}),
      ...visitor,
      behavior: 'GATHERING'
    }
  })
  state.crowd = {
    phase: 'GATHERING',
    count: asNumber(finalPayload.crowdCount) || finalVisitors.length,
    threshold: asNumber(finalPayload.crowdThreshold),
    occupancyPct: asNumber(finalPayload.occupancyPct),
    occupancyThresholdPct: asNumber(finalPayload.occupancyThresholdPct),
    source: finalPayload.dataSource || finalEvent?.source || state.crowd.source
  }
  return true
}

export function deriveScenarioVisualState(events, currentIndex) {
  const state = {
    visitors: {}, zoneCounts: {}, heatZones: [], garbage: {}, prediction: null,
    route: { original: [], startedSegment: [], replanned: [], resumed: [], obstacle: null, stopProgress: null, stopPosition: null, vehiclePosition: null, status: 'IDLE', reason: '', algorithmSource: '', originalDistanceM: null, newDistanceM: null, originalCost: null, newCost: null },
    currentArea: '', areaVisitorCount: null, activeMoves: [], activity: null, dataSource: 'SIM', garbageGenerationRateItemsPerHour: null,
    capacity: { currentFillPct: null, sourceEventType: '', source: '' },
    robotTask: { taskId: '', garbageId: '', robotRoute: [], transportRoute: [], returnRoute: [], patrolPosition: normalizeMapPoint('zone_walkway_01'), garbagePosition: null, targetPosition: normalizeMapPoint('service_food_01'), requested: false, completed: false, source: 'SIM' },
    crowd: { phase: '', count: 0, threshold: null, occupancyPct: null, occupancyThresholdPct: null, source: 'SIM' }
  }
  const taskGarbage = {}
  asArray(events).slice(0, Math.max(0, currentIndex) + 1).forEach((event, eventIndex) => {
    const payload = event.payload || {}
    const collapseReturnRoadCrowdUpdate = eventIndex === currentIndex
      && event.eventType === 'CROWD_FLOW_UPDATED'
      && isReturnRoadCrowdPayload(payload)
    const crowdVisualPayload = collapseReturnRoadCrowdUpdate
      ? (returnRoadCrowdFinalEvent(events, eventIndex)?.payload || payload)
      : payload
    if (event.eventType === 'VISITOR_ENTERED' && payload.visitorId) {
      state.visitors[payload.visitorId] = {
        id: payload.visitorId, visitorId: payload.visitorId, zoneId: payload.zoneId,
        behavior: 'ENTER', direction: 1,
        position: normalizeMapPoint(payload.positionPct || payload.positionM || payload.zoneId, payload.zoneId)
      }
    }
    if (event.eventType === 'VISITOR_REMOVED') {
      const removedIds = Array.isArray(payload.visitorIds) ? payload.visitorIds : (payload.visitorId ? [payload.visitorId] : [])
      removedIds.forEach(visitorId => delete state.visitors[visitorId])
    }
    if (event.eventType === 'LITTER_REMOVED' && payload.garbageId) delete state.garbage[payload.garbageId]
    const visitorsBeforeEvent = snapshotVisitors(state.visitors)
    const visitorRows = normalizeVisitors(crowdVisualPayload)
    if (eventIndex === currentIndex && ['VISITOR_ACTIVITY_UPDATED', 'PEDESTRIAN_FLOW_UPDATED', 'CROWD_FLOW_UPDATED'].includes(event.eventType)) {
      const explicitMoves = collapseReturnRoadCrowdUpdate ? [] : activeMovesFromEvent(event)
      state.activeMoves = explicitMoves.length ? explicitMoves : visitorRows.map(visitor => {
        const previous = state.visitors[visitor.id]
        return previous && !collapseReturnRoadCrowdUpdate ? {
          visitorId: visitor.id, behavior: visitor.behavior, fromZoneId: previous.zoneId,
          toZoneId: visitor.zoneId, from: previous.position, to: visitor.position, durationMs: asNumber(crowdVisualPayload.durationMs)
        } : null
      }).filter(Boolean)
    }
    visitorRows.forEach(visitor => { state.visitors[visitor.id] = { ...(state.visitors[visitor.id] || {}), ...visitor } })
    const counts = normalizeZoneCounts(payload)
    if (counts) state.zoneCounts = counts
    if (payload.currentArea || payload.currentZoneId || payload.zoneId || payload.areaId) state.currentArea = payload.currentArea || payload.currentZoneId || payload.zoneId || payload.areaId
    if (payload.areaVisitorCount != null) state.areaVisitorCount = asNumber(payload.areaVisitorCount)
    if (payload.garbageGenerationRateItemsPerHour != null) state.garbageGenerationRateItemsPerHour = asNumber(payload.garbageGenerationRateItemsPerHour)
    if (crowdVisualPayload.crowdPhase) {
      state.crowd = {
        phase: crowdVisualPayload.crowdPhase,
        count: asNumber(crowdVisualPayload.crowdCount) || 0,
        threshold: asNumber(crowdVisualPayload.crowdThreshold),
        occupancyPct: asNumber(crowdVisualPayload.occupancyPct),
        occupancyThresholdPct: asNumber(crowdVisualPayload.occupancyThresholdPct),
        source: crowdVisualPayload.dataSource || event.source
      }
      if (['DISPERSING', 'DISPERSED'].includes(crowdVisualPayload.crowdPhase) && state.route.obstacle) state.route.obstacleVisible = false
    }
    if (Array.isArray(payload.heatZones) || Array.isArray(payload.heatmap)) state.heatZones = normalizeHeatZones(payload)

    if (event.eventType === 'VISITOR_ACTIVITY_UPDATED') {
      activeMovesFromEvent(event).forEach(move => {
        const previous = state.visitors[move.visitorId] || { id: move.visitorId, visitorId: move.visitorId }
        state.visitors[move.visitorId] = { ...previous, zoneId: move.toZoneId, behavior: move.behavior, position: move.to }
      })
      state.activity = { type: 'visitor', source: event.source, ...payload }
    }
    if (event.eventType === 'ACTIVE_DISPOSAL') state.activity = { type: 'active_disposal', source: event.source, ...payload }
    if (event.eventType === 'LITTER_CREATED') {
      const rawPosition = normalizeMapPoint(payload.positionPct || payload.positionM || payload.position || payload.zoneId, payload.zoneId || 'zone_walkway_01')
      const visualPosition = applyGarbageVisualPoint(payload.garbageId, rawPosition)
      state.garbage[payload.garbageId] = {
        id: payload.garbageId, visitorId: payload.visitorId, status: 'SCATTERED', source: event.source,
        position: visualPosition,
        actionTimeline: rewriteVisualGarbageTimeline(payload.actionTimeline, rawPosition, visualPosition),
        // 仅保留事件已有的垃圾身份字段，供地图选择与局部流程相同的正式素材。
        garbageType: payload.garbageType || payload.templateGarbageId || payload.garbageId,
        templateGarbageId: payload.templateGarbageId || '',
        category: payload.garbageCategory || payload.category || ''
      }
      state.activity = { type: 'litter', source: event.source, ...payload }
    }
    if (event.eventType === 'TASK_CREATED' && payload.taskId && payload.garbageId) {
      taskGarbage[payload.taskId] = payload.garbageId
      const route = normalizeRobotRoute(payload)
      const garbage = state.garbage[payload.garbageId]
      state.robotTask = {
        ...state.robotTask, taskId: payload.taskId, garbageId: payload.garbageId,
        robotRoute: route?.approach || [state.robotTask.patrolPosition, garbage?.position || normalizeMapPoint('zone_food_rest_01')],
        transportRoute: route?.transport || [], returnRoute: route?.returning || [],
        patrolPosition: route?.patrol || state.robotTask.patrolPosition,
        garbagePosition: route?.garbage || garbage?.position || normalizeMapPoint('zone_food_rest_01'),
        targetPosition: route?.bin || normalizeMapPoint(payload.servicePointId || 'service_food_01'),
        source: route?.source || event.source, requested: false, completed: false
      }
    }
    if (event.eventType === 'ROBOT_TASK_REQUESTED') {
      const request = payload.request || payload
      const route = normalizeRobotRoute(payload) || normalizeRobotRoute(request)
      state.robotTask = {
        ...state.robotTask,
        taskId: request.taskId || state.robotTask.taskId,
        garbageId: request.garbageId || state.robotTask.garbageId,
        robotRoute: route?.approach || state.robotTask.robotRoute,
        transportRoute: route?.transport || state.robotTask.transportRoute,
        returnRoute: route?.returning || state.robotTask.returnRoute,
        patrolPosition: route?.patrol || state.robotTask.patrolPosition,
        garbagePosition: route?.garbage || state.robotTask.garbagePosition,
        targetPosition: route?.bin || state.robotTask.targetPosition,
        requested: true, source: route?.source || event.source
      }
    }
    if (event.eventType === 'ROBOT_TASK_RESULT') state.robotTask.completed = true
    if (event.eventType === 'TASK_SUCCEEDED' && taskGarbage[payload.taskId] && state.garbage[taskGarbage[payload.taskId]]) state.garbage[taskGarbage[payload.taskId]].status = 'COLLECTED'
    if (event.eventType === 'TASK_SUCCEEDED' && payload.taskId === state.robotTask.taskId) state.robotTask.completed = true
    if (event.eventType === 'BIN_FILL_UPDATED') state.capacity = { currentFillPct: asNumber(payload.fillPct), sourceEventType: event.eventType, source: event.source }
    if (event.eventType === 'DEVICE_RECOVERED' && payload.fillPct != null) state.capacity = { currentFillPct: asNumber(payload.fillPct), sourceEventType: event.eventType, source: event.source }
    if (event.eventType === 'HEATMAP_UPDATED') state.heatZones = normalizeHeatZones(payload)
    if (event.eventType === 'FILL_PREDICTION_UPDATED') state.prediction = normalizePrediction(payload)

    if (event.eventType === 'RETURN_ROUTE_STARTED') {
      state.route.original = routeFromPayload(payload, 'originalRoute')
      const stopValue = firstDefined(payload.stopAtPct, payload.vehiclePositionPct, payload.route?.stopAtPct)
      const stopPosition = routeStopPoint(payload)
      state.route.stopProgress = asNumber(firstDefined(payload.blockedProgress, typeof stopValue === 'number' ? stopValue : null))
      if (stopPosition) state.route.stopPosition = stopPosition
      else if (Array.isArray(stopValue) || (stopValue && typeof stopValue === 'object')) state.route.stopPosition = normalizeMapPoint(stopValue)
      state.route.startedSegment = routeSegmentUntilPoint(state.route.original, state.route.stopPosition)
      if (!state.route.startedSegment.length) state.route.startedSegment = normalizeRoutePoints(payload.routeUntilObstacle)
      if (!state.route.startedSegment.length && state.route.stopPosition && state.route.original.length) state.route.startedSegment = [state.route.original[0], state.route.stopPosition]
      state.route.status = 'STARTED'; state.route.algorithmSource = firstDefined(payload.algorithmSource, event.source)
      if (eventIndex === currentIndex) applyReturnRouteCrowdPreview(state, events, eventIndex, visitorsBeforeEvent)
    }
    if (event.eventType === 'ROUTE_BLOCKED') {
      if (!state.route.original.length) state.route.original = routeFromPayload(payload, 'originalRoute')
      const obstaclePosition = routeObstaclePoint(payload)
        || normalizeMapPoint(payload.obstacle?.positionPct || payload.obstacle?.positionM || payload.obstacle?.position || payload.blockedPositionPct || payload.blockedPositionM || payload.blockedPosition || payload.obstacle, payload.zoneId)
      state.route.obstacle = {
        id: payload.obstacleId || payload.obstacle?.id || 'route_obstacle',
        position: obstaclePosition,
        label: payload.obstacle?.label || payload.obstacle?.type || payload.obstacleType || payload.reason || '临时障碍'
      }
      state.route.vehiclePosition = routeStopPoint(payload)
        || routeNodePoint(payload.vehiclePositionNodeId)
        || normalizeMapPoint(payload.vehiclePositionPct || payload.vehiclePositionM || state.route.stopPosition || state.route.obstacle.position)
      if (!state.route.stopPosition) state.route.stopPosition = state.route.vehiclePosition
      state.route.status = 'BLOCKED'; state.route.reason = payload.reason || state.route.reason
      state.route.obstacleVisible = true
      if (eventIndex === currentIndex) state.activeMoves = []
    }
    if (event.eventType === 'ROUTE_REPLANNED') {
      if (!state.route.original.length) state.route.original = routeFromPayload(payload, 'originalRoute')
      state.route.replanned = blockedReturnReplannedRoute(routeFromPayload(payload, 'newRoute'), payload, state.route)
      if (payload.obstacle) {
        const obstaclePosition = routeObstaclePoint(payload)
          || normalizeMapPoint(payload.obstacle.positionPct || payload.obstacle.positionM || payload.obstacle.position, payload.zoneId)
        state.route.obstacle = {
          id: payload.obstacleId || payload.obstacle.id || state.route.obstacle?.id || 'route_obstacle',
          position: obstaclePosition,
          label: payload.obstacle.label || payload.obstacle.type || state.route.obstacle?.label || '临时障碍'
        }
        state.route.vehiclePosition = routeStopPoint(payload)
          || routeNodePoint(payload.vehiclePositionNodeId)
          || normalizeMapPoint(payload.vehiclePositionPct || payload.vehiclePositionM || state.route.vehiclePosition || state.route.stopPosition || state.route.obstacle.position)
        if (!state.route.stopPosition) state.route.stopPosition = state.route.vehiclePosition
      }
      state.route.status = 'REPLANNED'; state.route.reason = payload.reason || state.route.reason
      state.route.algorithmSource = firstDefined(payload.algorithmSource, event.source)
      state.route.originalDistanceM = asNumber(firstDefined(payload.originalDistanceM, payload.distance?.originalM, payload.originalRoute?.distanceM))
      state.route.newDistanceM = asNumber(firstDefined(payload.newDistanceM, payload.distance?.newM, payload.newRoute?.distanceM))
      state.route.originalCost = asNumber(firstDefined(payload.originalCost, payload.cost?.original, payload.originalRoute?.cost))
      state.route.newCost = asNumber(firstDefined(payload.newCost, payload.cost?.new, payload.newRoute?.cost))
    }
    if (event.eventType === 'RETURN_ROUTE_RESUMED') {
      state.route.resumed = blockedReturnReplannedRoute(routeFromPayload(payload, 'originalRoute'), payload, state.route)
      if (!state.route.resumed.length) state.route.resumed = routeFromPayload({ originalRoute: payload.route }, 'originalRoute')
      if (!state.route.resumed.length) state.route.resumed = state.route.replanned
      state.route.status = 'RESUMED'
      state.route.obstacleVisible = false
    }
    if (event.eventType === 'DEVICE_ARRIVED_AT_CENTER') state.route.status = 'ARRIVED'
  })
  return { ...state, visitors: Object.values(state.visitors), garbage: Object.values(state.garbage) }
}

export function scenarioMetricText(value, suffix = '') {
  return value === null || value === undefined || value === '' ? '—' : `${value}${suffix}`
}
