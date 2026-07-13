import { parkRoutePolyline } from '@/utils/park-road-network.js'

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

function normalizeVisitors(payload) {
  const visitors = firstDefined(payload.visitorSnapshots, payload.visitors, payload.actors)
  return asArray(visitors).map((visitor, index) => {
    const id = visitor.id || visitor.visitorId || `visitor_${String(index + 1).padStart(2, '0')}`
    const zoneId = visitor.zoneId || visitor.zone || visitor.toZoneId || visitor.to
    return {
      ...visitor, id, visitorId: id, zoneId,
      behavior: visitor.behavior || visitor.action || visitor.status || '停留',
      position: normalizeMapPoint(visitor.positionPct || visitor.positionM || visitor.position || zoneId, zoneId)
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

function routeFromPayload(payload, key) {
  const route = firstDefined(payload[key], payload.route?.[key], key === 'originalRoute' ? payload.route : null)
  const nodeIds = asArray(firstDefined(
    Array.isArray(route) ? null : route?.nodeIds,
    key === 'newRoute' ? payload.newNodeIds : payload.originalNodeIds
  ))
  if (nodeIds.includes('route_center')) {
    const startsAtFood = nodeIds[0] === 'route_food'
    const startsAtRest = nodeIds[0] === 'route_rest'
    const usesCenterLoop = nodeIds.includes('route_bypass_south') || nodeIds.includes('route_bypass_west')
    const routePrefix = startsAtFood
      ? 'device_food_to_center'
      : startsAtRest ? 'device_rest_to_center' : 'device_east_junction_to_center'
    const routeId = `${routePrefix}_${usesCenterLoop ? 'center_loop' : 'direct'}`
    const canonical = parkRoutePolyline(routeId)
    if (canonical.length) return normalizeRoutePoints(canonical)
  }
  if (Array.isArray(route)) return normalizeRoutePoints(route)
  return normalizeRoutePoints(route?.polyline || route?.points || route?.waypoints || route?.path)
}

function normalizeRobotRoute(payload) {
  const source = payload.robotRoute || payload.request?.robotRoute
  if (!source || typeof source !== 'object') return null
  const points = key => normalizeRoutePoints(source[key])
  const from = normalizeMapPoint(source.fromPositionPct || source.patrolPositionPct || 'zone_walkway_01')
  const garbage = normalizeMapPoint(source.toGarbagePositionPct || source.garbagePositionPct || 'zone_food_rest_01')
  const bin = normalizeMapPoint(source.toBinPositionPct || source.binPositionPct || 'service_food_01')
  const patrol = normalizeMapPoint(source.patrolPositionPct || source.fromPositionPct || 'zone_walkway_01')
  return {
    source: source.dataSource || payload.dataSource || 'SIM', from, garbage, bin, patrol,
    approach: points('approachWaypointsPct').length ? points('approachWaypointsPct') : [from, garbage],
    transport: points('transportWaypointsPct').length ? points('transportWaypointsPct') : [garbage, bin],
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
      from: normalizeMapPoint(row.fromPositionPct || row.fromPositionM || row.fromPosition || fromZoneId, fromZoneId),
      to: normalizeMapPoint(row.toPositionPct || row.toPositionM || row.toPosition || toZoneId, toZoneId),
      durationMs: asNumber(row.durationMs)
    }
  }).filter(item => item.visitorId)
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
    const visitorRows = normalizeVisitors(payload)
    if (eventIndex === currentIndex && ['VISITOR_ACTIVITY_UPDATED', 'PEDESTRIAN_FLOW_UPDATED', 'CROWD_FLOW_UPDATED'].includes(event.eventType)) {
      const explicitMoves = activeMovesFromEvent(event)
      state.activeMoves = explicitMoves.length ? explicitMoves : visitorRows.map(visitor => {
        const previous = state.visitors[visitor.id]
        return previous ? {
          visitorId: visitor.id, behavior: visitor.behavior, fromZoneId: previous.zoneId,
          toZoneId: visitor.zoneId, from: previous.position, to: visitor.position, durationMs: asNumber(payload.durationMs)
        } : null
      }).filter(Boolean)
    }
    visitorRows.forEach(visitor => { state.visitors[visitor.id] = { ...(state.visitors[visitor.id] || {}), ...visitor } })
    const counts = normalizeZoneCounts(payload)
    if (counts) state.zoneCounts = counts
    if (payload.currentArea || payload.currentZoneId || payload.zoneId || payload.areaId) state.currentArea = payload.currentArea || payload.currentZoneId || payload.zoneId || payload.areaId
    if (payload.areaVisitorCount != null) state.areaVisitorCount = asNumber(payload.areaVisitorCount)
    if (payload.garbageGenerationRateItemsPerHour != null) state.garbageGenerationRateItemsPerHour = asNumber(payload.garbageGenerationRateItemsPerHour)
    if (payload.crowdPhase) {
      state.crowd = {
        phase: payload.crowdPhase,
        count: asNumber(payload.crowdCount) || 0,
        threshold: asNumber(payload.crowdThreshold),
        occupancyPct: asNumber(payload.occupancyPct),
        occupancyThresholdPct: asNumber(payload.occupancyThresholdPct),
        source: payload.dataSource || event.source
      }
      if (['DISPERSING', 'DISPERSED'].includes(payload.crowdPhase) && state.route.obstacle) state.route.obstacleVisible = false
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
      state.garbage[payload.garbageId] = {
        id: payload.garbageId, visitorId: payload.visitorId, status: 'SCATTERED', source: event.source,
        position: normalizeMapPoint(payload.positionPct || payload.positionM || payload.position || payload.zoneId, payload.zoneId || 'zone_walkway_01'),
        actionTimeline: asArray(payload.actionTimeline)
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
      state.route.startedSegment = normalizeRoutePoints(payload.routeUntilObstacle)
      const stopValue = firstDefined(payload.stopAtPct, payload.vehiclePositionPct, payload.route?.stopAtPct)
      state.route.stopProgress = asNumber(firstDefined(payload.blockedProgress, typeof stopValue === 'number' ? stopValue : null))
      if (Array.isArray(stopValue) || (stopValue && typeof stopValue === 'object')) state.route.stopPosition = normalizeMapPoint(stopValue)
      if (!state.route.startedSegment.length && state.route.stopPosition && state.route.original.length) state.route.startedSegment = [state.route.original[0], state.route.stopPosition]
      state.route.status = 'STARTED'; state.route.algorithmSource = firstDefined(payload.algorithmSource, event.source)
    }
    if (event.eventType === 'ROUTE_BLOCKED') {
      if (!state.route.original.length) state.route.original = routeFromPayload(payload, 'originalRoute')
      state.route.obstacle = {
        id: payload.obstacleId || payload.obstacle?.id || 'route_obstacle',
        position: normalizeMapPoint(payload.obstacle?.positionPct || payload.obstacle?.positionM || payload.obstacle?.position || payload.blockedPositionPct || payload.blockedPositionM || payload.blockedPosition || payload.obstacle, payload.zoneId),
        label: payload.obstacle?.label || payload.obstacle?.type || payload.obstacleType || payload.reason || '临时障碍'
      }
      state.route.vehiclePosition = normalizeMapPoint(payload.vehiclePositionPct || payload.vehiclePositionM || state.route.stopPosition || state.route.obstacle.position)
      state.route.status = 'BLOCKED'; state.route.reason = payload.reason || state.route.reason
      state.route.obstacleVisible = true
    }
    if (event.eventType === 'ROUTE_REPLANNED') {
      if (!state.route.original.length) state.route.original = routeFromPayload(payload, 'originalRoute')
      state.route.replanned = routeFromPayload(payload, 'newRoute')
      if (payload.obstacle) {
        state.route.obstacle = {
          id: payload.obstacleId || payload.obstacle.id || state.route.obstacle?.id || 'route_obstacle',
          position: normalizeMapPoint(payload.obstacle.positionPct || payload.obstacle.positionM || payload.obstacle.position, payload.zoneId),
          label: payload.obstacle.label || payload.obstacle.type || state.route.obstacle?.label || '临时障碍'
        }
        state.route.vehiclePosition = normalizeMapPoint(payload.vehiclePositionPct || payload.vehiclePositionM || state.route.vehiclePosition || state.route.stopPosition || state.route.obstacle.position)
      }
      state.route.status = 'REPLANNED'; state.route.reason = payload.reason || state.route.reason
      state.route.algorithmSource = firstDefined(payload.algorithmSource, event.source)
      state.route.originalDistanceM = asNumber(firstDefined(payload.originalDistanceM, payload.distance?.originalM, payload.originalRoute?.distanceM))
      state.route.newDistanceM = asNumber(firstDefined(payload.newDistanceM, payload.distance?.newM, payload.newRoute?.distanceM))
      state.route.originalCost = asNumber(firstDefined(payload.originalCost, payload.cost?.original, payload.originalRoute?.cost))
      state.route.newCost = asNumber(firstDefined(payload.newCost, payload.cost?.new, payload.newRoute?.cost))
    }
    if (event.eventType === 'RETURN_ROUTE_RESUMED') {
      state.route.resumed = routeFromPayload(payload, 'originalRoute')
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
