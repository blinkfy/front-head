<template>
  <view v-if="scenario !== 'baseline'" :class="['scenario-layer', { paused: !playing }]" :style="visualTimingStyle">
    <!-- #ifdef H5 -->
    <svg class="scenario-route-layer" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline v-if="originalRoutePoints" :points="originalRoutePoints" class="scenario-route-ground" />
      <polyline v-if="newRoutePoints" :points="newRoutePoints" class="scenario-route-ground" />
      <polyline v-for="robotRoute in activeRobotRoutes" :key="`${robotRoute.robotId}:ground`" :points="robotRoute.points" :class="['scenario-route-ground', 'robot-ground', { muted: !robotRoute.focused }]" />
      <polyline v-if="originalRoutePoints" :points="originalRoutePoints" :class="['scenario-route', 'original', { blocked: ['BLOCKED','REPLANNED','RESUMED','ARRIVED'].includes(route.status), active: ['STARTED','BLOCKED'].includes(route.status) }]" />
      <polyline v-if="newRoutePoints" :points="newRoutePoints" :class="['scenario-route', 'replanned', { active: ['REPLANNED','RESUMED'].includes(route.status) }]" />
      <polyline v-for="robotRoute in activeRobotRoutes" :key="robotRoute.robotId" :points="robotRoute.points" :class="['scenario-route', 'robot-task-route', robotRoute.variant, { active: robotRoute.focused, muted: !robotRoute.focused }]" />
    </svg>
    <!-- #endif -->

    <view
      v-for="heat in state.heatZones || []"
      :key="`heat-${heat.zoneId}`"
      class="heat-zone"
      :style="heatStyle(heat)"
    ><text>{{ heat.count == null ? '热区' : `${heat.count}人` }}</text></view>

    <view
      v-for="(count, zoneId) in state.zoneCounts || {}"
      :key="`count-${zoneId}`"
      class="zone-count"
      :style="pointStyle(zonePoint(zoneId))"
    ><text>{{ zoneName(zoneId) }}</text><text class="b-text">{{ count }} 人</text></view>

    <view
      v-for="visitor in renderedVisitors"
      :key="visitor.id"
      :class="['scenario-visitor', visitor.behavior.toLowerCase(), { selected: visitor.id === selectedId }]"
      :style="pointStyle(visitor.renderedPosition)"
      @tap.stop="$emit('select', visitor.id)"
    >
      <VisitorBehaviorSprite
        :visitor-id="visitor.id"
        :behavior="visitor.behavior"
        :direction="visitor.direction"
        :progress="moveProgress"
        :playing="visitorAnimationPlaying"
        :playback-rate="playbackRate"
        :selected="visitor.id === selectedId"
        :depth-scale="mapDepthScale(visitor.renderedPosition?.y)"
      />
    </view>

    <view
      v-for="garbage in mapVisibleGarbage"
      :key="garbage.id"
      class="generated-garbage"
      :class="{ falling: garbage.falling, carried: garbage.carried }"
      :style="pointStyle(garbage.renderedPosition || garbage.position)"
      @tap.stop="$emit('select', garbage.id)"
    ><MapWasteSprite :waste="garbage" :selected="garbage.id === selectedId" :affected="currentEntityIds.has(garbage.id)" :falling="garbage.falling" :carried="garbage.carried" :depth-scale="mapDepthScale((garbage.renderedPosition || garbage.position)?.y)" /></view>

    <view v-if="disposalTrashPosition && activeDisposalHasWasteIdentity" class="action-trash disposal-trash" :style="pointStyle(disposalTrashPosition)">
      <MapWasteSprite :waste="activeDisposal" :depth-scale="mapDepthScale(disposalTrashPosition?.y)" />
    </view>

    <view v-if="showFormalObstacle" class="route-obstacle" :style="pointStyle(state.route.obstacle.position)" @tap.stop="$emit('select', state.route.obstacle.id)">
      <i class="obstacle-icon">!</i>
    </view>

    <view v-for="(robot, index) in mapVisibleRobots" v-if="scenario === 'daily'" :key="robot.id" :class="['scenario-robot', `robot-${index + 1}`]" :style="pointStyle(robot.renderedPosition)" @tap.stop="$emit('select', robot.id)">
      <MapEntitySprite kind="robot" variant="active" :selected="selectedId === robot.id" :affected="currentEntityIds.has(robot.id)" :moving="robot.moving" :depth-scale="mapDepthScale(robot.renderedPosition?.y)" :heading-deg="robot.headingDeg" />
    </view>

    <view v-if="routeVehiclePosition" class="route-vehicle" :style="pointStyle(routeVehiclePosition)">
      <MapEntitySprite kind="bin" variant="returning" :affected="true" :moving="routeVehicleMoving" :depth-scale="mapDepthScale(routeVehiclePosition?.y)" :heading-deg="routeVehicleHeading" />
    </view>

    <view v-if="state.route?.original?.length" class="route-key">
      <view><i class="original"></i><text>受阻路线</text></view>
      <view v-if="state.route.replanned?.length"><i class="replanned"></i><text>绕行路线</text></view>
      <text class="small-text" :data-source="state.route.algorithmSource">{{ displaySourceLabel(state.route.algorithmSource) }}</text>
    </view>
  </view>

  <view v-if="scenario !== 'baseline'" class="scenario-label-overlay">
    <view v-for="visitor in renderedVisitors.filter(showScenarioVisitorLabel)" :key="`${visitor.id}:label`" class="scenario-label-anchor visitor" :style="pointStyle(visitor.renderedPosition)">
      <StableMapLabel :label-id="`${visitor.id}:behavior`" :text="behaviorLabel(visitor.behavior)" :detail="visitor.id === selectedId ? visitor.id : ''" :priority="scenarioLabelPriority('visitor', visitor.id)" placement="above" :selected="visitor.id === selectedId" :current="currentEntityIds.has(visitor.id)" />
    </view>
    <view v-for="cluster in visibleVisitorClusters.slice(0, 1)" :key="`${cluster.id}:label`" class="scenario-label-anchor cluster" :style="pointStyle(cluster.position)">
      <StableMapLabel :label-id="`${cluster.id}:aggregate`" :text="`聚集 × ${cluster.count}`" :priority="76" placement="above" tone="amber" aggregate />
    </view>
    <view v-for="garbage in mapVisibleGarbage.filter(showScenarioGarbageLabel)" :key="`${garbage.id}:label`" class="scenario-label-anchor garbage" :style="pointStyle(garbage.renderedPosition || garbage.position)">
      <StableMapLabel :label-id="`${garbage.id}:status`" :text="garbageShortLabel(garbage)" :priority="scenarioLabelPriority('garbage', garbage.id)" placement="below" tone="amber" :selected="garbage.id === selectedId" :current="currentEntityIds.has(garbage.id)" />
    </view>
    <view v-if="showFormalObstacle" class="scenario-label-anchor obstacle" :style="pointStyle(state.route.obstacle.position)">
      <StableMapLabel :label-id="`${state.route.obstacle.id}:status`" :text="obstacleLabel(state.route.obstacle.label)" :detail="state.route.obstacle.id" :priority="92" placement="below" tone="red" current />
    </view>
    <view v-for="(robot, index) in mapVisibleRobots.filter(showScenarioRobotLabel)" :key="`${robot.id}:label`" class="scenario-label-anchor robot" :style="pointStyle(robot.renderedPosition)">
      <StableMapLabel :label-id="`${robot.id}:status`" :text="robot.statusLabel" :detail="robot.id === selectedId ? robot.id : ''" :priority="scenarioLabelPriority('device', robot.id)" placement="above" :tone="robot.status === 'FAULT' ? 'red' : index ? 'amber' : 'cyan'" :selected="selectedId === robot.id" :current="currentEntityIds.has(robot.id)" />
    </view>
    <view v-if="routeVehiclePosition" class="scenario-label-anchor bin" :style="pointStyle(routeVehiclePosition)">
      <StableMapLabel label-id="device_smart_bin_food_01:return-status" :text="`满载桶 · ${routeVehicleBadge}`" :priority="89" placement="below" tone="amber" current />
    </view>
  </view>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import VisitorBehaviorSprite from './VisitorBehaviorSprite.vue'
import MapEntitySprite from './MapEntitySprite.vue'
import MapWasteSprite from './MapWasteSprite.vue'
import { mapWasteDisplayName } from '@/config/map-sprite-registry.js'
import StableMapLabel from './StableMapLabel.vue'
import { normalizeMapPoint, zoneLabel } from '@/utils/park-scenario-visuals.js'
import { primaryEventEntityIds } from '@/utils/park-replay.js'
import { displaySourceLabel } from '@/utils/source-display.js'
import { DIGITAL_TWIN_VISUAL_SYSTEM, mapDepthScale, mapMotionProgress, mapPolylineHeading } from '@/config/digital-twin-visual-system.js'
import { robotTaskScanStartPositionPct } from '@/config/robot-task-shot-config.js'
import { PARK_ROAD_NETWORK, nearestParkRoadPoint, parkPolylinePoint, parkRoutePolyline, preferredParkRoadPolyline, sampleParkRoadEdge } from '@/utils/park-road-network.js'

const props = defineProps({
  scenario: { type: String, default: 'baseline' },
  selectedId: { type: String, default: '' },
  state: { type: Object, default: () => ({}) },
  currentEvent: { type: Object, default: () => ({}) },
  playing: { type: Boolean, default: false },
  playbackRate: { type: Number, default: 1 },
  visualResetKey: { type: [String, Number], default: '' },
  robotVisual: { type: Object, default: () => ({}) },
  runtimeState: { type: Object, default: () => ({}) }
})
defineEmits(['select'])

const moveProgress = ref(1)
let rafId = 0
let lastTimestamp = 0
let observedResetKey = props.visualResetKey
const mapMotion = DIGITAL_TWIN_VISUAL_SYSTEM.mapEntity.motion

const route = computed(() => props.state.route || {})
const currentEntityIds = computed(() => new Set(primaryEventEntityIds(props.currentEvent)))
const originalRoutePoints = computed(() => routePoints(props.state.route?.original))
const newRoutePoints = computed(() => routePoints(props.state.route?.replanned))
const runtimeRobots = computed(() => ({
  robot_patrol_01: props.runtimeState?.robots?.robot_patrol_01 || (props.runtimeState?.robot?.id === 'robot_patrol_01' ? props.runtimeState.robot : { id: 'robot_patrol_01', status: 'PATROLLING', positionPct: [48, 66.5] }),
  robot_patrol_02: props.runtimeState?.robots?.robot_patrol_02 || { id: 'robot_patrol_02', status: 'PATROLLING', positionPct: [40, 61.5] }
}))
const runtimeActiveRobotTasks = computed(() => props.runtimeState?.operations?.activeRobotTasks || {})
const focusedRobotId = computed(() => props.robotVisual?.robotId || props.currentEvent?.payload?.selectedEntityId || props.currentEvent?.payload?.robotId || props.currentEvent?.payload?.request?.robotId || 'robot_patrol_01')
const visualActiveRobotTasks = computed(() => {
  const tasks = { ...runtimeActiveRobotTasks.value }
  const fixedTask = props.state.robotTask
  if (!Object.keys(tasks).length && fixedTask?.taskId && !fixedTask.completed) {
    tasks[focusedRobotId.value] = {
      taskId: fixedTask.taskId,
      positionPct: fixedTask.garbagePosition,
      request: { robotRoute: { approachWaypointsPct: fixedTask.robotRoute } }
    }
  }
  return tasks
})
const visualTimingStyle = computed(() => {
  const duration = 1.2 / Math.max(.25, Number(props.playbackRate) || 1)
  return {
    '--visual-duration': `${duration}s`,
    '--route-flow-duration': `${duration * 1.35}s`,
    '--heat-breathe-duration': `${duration * 1.5}s`,
    '--scenario-waste-motion-duration': `${duration * .7}s`
  }
})
const activeGarbageId = computed(() => props.state.robotTask?.garbageId || props.currentEvent?.payload?.request?.garbageId || '')
const localCanvasTaskActive = computed(() => Boolean(props.robotVisual?.active && props.robotVisual?.mode === 'robot'))
const ROBOT_ROAD_ROUTE_IDS = Object.freeze(['robot_left_litter_to_bin', 'robot_right_litter_to_bin'])
const MAX_LEGACY_ROBOT_ROUTE_DEVIATION = 2.8
const ACTIVE_DISPOSAL_BIN_MOUTH_POINTS = Object.freeze({
  device_smart_bin_food_01: { x: 64.7, y: 45.8 },
  service_food_01: { x: 64.7, y: 45.8 },
  device_smart_bin_rest_01: { x: 31.9, y: 59.2 },
  service_rest_01: { x: 31.9, y: 59.2 }
})
const DAILY_ACTIVE_DISPOSAL_BIN_MOUTH_POINTS = Object.freeze({
  device_smart_bin_food_01: { x: 73.4, y: 50.7 },
  service_food_01: { x: 73.4, y: 50.7 }
})
const DAILY_ACTIVE_DISPOSAL_VISITOR_OFFSET = Object.freeze({ x: 0, y: -0.9 })
const DAILY_REST_WATER_MASK = Object.freeze({ x: 28.6, y: 53.2, radiusX: 9.4, radiusY: 7.2 })
const DAILY_REST_DRY_LANDINGS = Object.freeze({
  west: { x: 20.8, y: 68.8 },
  east: { x: 36.2, y: 62.8 }
})
const DAILY_FOOD_TASK_VISITOR_POSITIONS = Object.freeze({
  visitor_06: { x: 80.4, y: 50.4 }
})
const ROBOT_ROAD_POINTS = Object.freeze(PARK_ROAD_NETWORK.edges
  .filter(edge => Array.isArray(edge.allowedEntities) && edge.allowedEntities.includes('robot'))
  .flatMap(edge => sampleParkRoadEdge(edge)))
const localRobotStage = computed(() => String(props.robotVisual?.stage || '').toLowerCase())
const localFoodServiceTaskActive = computed(() => {
  const target = props.state.robotTask?.targetPosition
  return props.scenario === 'daily'
    && Boolean(props.robotVisual?.active)
    && ['scan', 'approach', 'grasp', 'transport', 'place', 'release', 'return'].includes(localRobotStage.value)
    && Number(target?.x) >= 55
})
const visitorAnimationPlaying = computed(() => props.playing && !(props.robotVisual?.active && props.robotVisual?.mode === 'robot'))
const motionDurationMs = computed(() => {
  const type = props.currentEvent?.eventType
  if (type === 'TASK_CREATED' && props.state.robotTask?.taskId) {
    const patrol = props.state.robotTask?.patrolPosition || { x: 48, y: 66.5 }
    const litter = props.state.robotTask?.garbagePosition || { x: 48.1, y: 52 }
    return cappedMapTravelDuration(resolveRobotRoute(props.state.robotTask?.robotRoute, litter, 'approach', patrol), 'robot')
  }
  if (['RETURN_ROUTE_STARTED', 'RETURN_ROUTE_RESUMED'].includes(type)) {
    const points = type === 'RETURN_ROUTE_STARTED'
      ? (route.value.startedSegment?.length ? route.value.startedSegment : route.value.original)
      : (route.value.resumed?.length ? route.value.resumed : route.value.replanned)
    return cappedMapTravelDuration(points, 'bin')
  }
  return 1500
})
const visibleGarbage = computed(() => (props.state.garbage || []).filter(item => item.status !== 'COLLECTED').map(item => {
  const falling = props.currentEvent?.eventType === 'LITTER_CREATED' && item.id === props.currentEvent?.payload?.garbageId && moveProgress.value < 1
  const actor = renderedVisitors.value.find(visitor => visitor.id === item.visitorId)
  const timelinePosition = falling ? objectPositionFromTimeline(item.actionTimeline, moveProgress.value) : null
  const renderedPosition = falling ? (timelinePosition || interpolatePoint(actor?.renderedPosition || item.position, item.position, easeOut(moveProgress.value))) : item.position
  const carried = item.id === activeGarbageId.value && Boolean(props.robotVisual?.carrying)
  return { ...item, falling, carried, renderedPosition: carried ? robotPosition.value : renderedPosition }
}).filter(item => !item.carried || props.robotVisual?.showCarriedMarker))
const activeDisposal = computed(() => props.currentEvent?.eventType === 'ACTIVE_DISPOSAL' ? props.currentEvent.payload || {} : null)
const activeDisposalHasWasteIdentity = computed(() => Boolean(activeDisposal.value?.garbageId || activeDisposal.value?.garbageType || activeDisposal.value?.templateGarbageId || activeDisposal.value?.garbageCategory || activeDisposal.value?.category))
const disposalTarget = computed(() => {
  const targetKey = activeDisposal.value?.targetDeviceId || activeDisposal.value?.deviceId || activeDisposal.value?.servicePointId
  const mouth = props.scenario === 'daily'
    ? (DAILY_ACTIVE_DISPOSAL_BIN_MOUTH_POINTS[targetKey] || ACTIVE_DISPOSAL_BIN_MOUTH_POINTS[targetKey])
    : ACTIVE_DISPOSAL_BIN_MOUTH_POINTS[targetKey]
  if (mouth) return { ...mouth }
  return normalizeMapPoint(activeDisposal.value?.binMouthPositionPct || activeDisposal.value?.targetPositionPct || activeDisposal.value?.positionPct || activeDisposal.value?.servicePointId, activeDisposal.value?.servicePointId || 'service_food_01')
})
const disposalStandPoint = computed(() => {
  const explicit = activeDisposal.value?.personPositionPct || activeDisposal.value?.visitorPositionPct
  if (explicit) return activeDisposalVisitorPoint(normalizeMapPoint(explicit, activeDisposal.value?.zoneId || 'food_rest_area'))
  const target = disposalTarget.value
  return activeDisposalVisitorPoint({ x: target.x + 2.6, y: target.y + 5.2 })
})

function isDailyFoodDisposal() {
  const targetKey = activeDisposal.value?.targetDeviceId || activeDisposal.value?.deviceId || activeDisposal.value?.servicePointId
  return props.scenario === 'daily' && props.currentEvent?.eventType === 'ACTIVE_DISPOSAL'
    && ['device_smart_bin_food_01', 'service_food_01'].includes(targetKey)
}

function activeDisposalVisitorPoint(point) {
  if (!isDailyFoodDisposal()) return point
  return {
    ...point,
    x: point.x + DAILY_ACTIVE_DISPOSAL_VISITOR_OFFSET.x,
    y: point.y + DAILY_ACTIVE_DISPOSAL_VISITOR_OFFSET.y
  }
}

const renderedVisitors = computed(() => (props.state.visitors || []).map(visitor => {
  const move = (props.state.activeMoves || []).find(item => item.visitorId === visitor.id)
  const isActor = visitor.id === (props.currentEvent?.payload?.visitorId || props.state.activity?.visitorId)
  if (isActor && ['ACTIVE_DISPOSAL', 'LITTER_CREATED'].includes(props.currentEvent?.eventType)) {
    const action = actionVisitorState(visitor)
    return { ...visitor, ...action }
  }
  if (!move) return {
    ...visitor,
    behavior: normalizeBehavior(visitor.behavior),
    direction: visitorDirection(visitor),
    renderedPosition: preferredStaticVisitorPoint(visitor)
  }
  const motionProgress = mapMotionProgress(moveProgress.value)
  const renderedPosition = preferredVisitorMovePoint(move, motionProgress)
  return {
    ...visitor,
    behavior: props.state.crowd?.phase === 'GATHERING' ? 'GATHERING' : normalizeBehavior(move.behavior || visitor.behavior),
    direction: move.to.x < move.from.x ? -1 : 1,
    renderedPosition
  }
}))
const visitorClusters = computed(() => {
  const visitors = renderedVisitors.value
    .map(visitor => ({ ...visitor, clusterPoint: visitor.position || visitor.renderedPosition }))
    .sort((left, right) => left.id.localeCompare(right.id))
  const pending = new Set(visitors.map(visitor => visitor.id))
  const clusters = []
  visitors.forEach(visitor => {
    if (!pending.has(visitor.id)) return
    const members = [visitor]
    pending.delete(visitor.id)
    for (let index = 0; index < members.length; index += 1) {
      visitors.forEach(candidate => {
        if (!pending.has(candidate.id)) return
        const dx = candidate.clusterPoint.x - members[index].clusterPoint.x
        const dy = candidate.clusterPoint.y - members[index].clusterPoint.y
        if (Math.hypot(dx, dy) <= 7.5) { members.push(candidate); pending.delete(candidate.id) }
      })
    }
    if (members.length < 3) return
    clusters.push({
      id: `visitor_cluster_${members.map(item => item.id).join('_')}`,
      count: members.length,
      visitorIds: members.map(item => item.id),
      position: {
        x: members.reduce((sum, item) => sum + item.clusterPoint.x, 0) / members.length,
        y: members.reduce((sum, item) => sum + item.clusterPoint.y, 0) / members.length
      }
    })
  })
  return clusters
})
const scenarioShowsCrowdStatus = computed(() => props.scenario === 'peak' || Boolean(props.state.crowd?.phase))
const visibleVisitorClusters = computed(() => scenarioShowsCrowdStatus.value ? visitorClusters.value.filter(cluster => cluster.count >= 4) : [])
const disposalTrashPosition = computed(() => {
  if (!activeDisposal.value || moveProgress.value < .34 || moveProgress.value > .66) return null
  const actor = renderedVisitors.value.find(visitor => visitor.id === activeDisposal.value.visitorId)
  const from = actor?.renderedPosition || disposalStandPoint.value
  const lift = { x: from.x + (actor?.direction || 1) * 1.4, y: from.y - 3.5 }
  if (moveProgress.value < .52) return lift
  return interpolatePoint(lift, disposalTarget.value, mapMotionProgress(Math.min(1, (moveProgress.value - .52) / .14)))
})

const robotPosition = computed(() => {
  const patrol = props.state.robotTask?.patrolPosition || { x: 48, y: 66.5 }
  const litter = props.state.robotTask?.garbagePosition || { x: 48.1, y: 52 }
  const bin = props.state.robotTask?.targetPosition || { x: 64, y: 48 }
  const approachRoute = resolveRobotRoute(props.state.robotTask?.robotRoute, litter, 'approach', patrol)
  const transportRoute = resolveRobotRoute(props.state.robotTask?.transportRoute, bin, 'transport', litter)
  const returnRoute = resolveRobotReturnRoute(props.state.robotTask?.returnRoute, patrol, bin)
  const localTaskActive = Boolean(props.robotVisual?.active && (!props.robotVisual?.completed || props.robotVisual?.handoff))
  // A local task handoff has priority over a newly appended live event. Without
  // this ordering the map briefly evaluates an unrelated TASK_CREATED route.
  if (!localTaskActive && props.currentEvent?.eventType === 'TASK_CREATED' && props.state.robotTask?.taskId) {
    return pointAlongRoute(approachRoute, mapMotionProgress(moveProgress.value))
  }
  if (!localTaskActive) return props.state.robotTask?.completed ? patrol : (props.state.robotTask?.requested ? litter : patrol)
  const stage = String(props.robotVisual?.stage || 'scan').toLowerCase()
  const progress = Math.max(0, Math.min(1, Number(props.robotVisual?.progress) || 0))
  // Keep the map entity at the route-side pickup point. The close-range grasp is
  // shown by the existing local workflow, rather than moving the patrol robot
  // across lawn pixels to the litter marker.
  if (['scan', 'approach', 'grasp'].includes(stage)) return approachRoute.at(-1) || litter
  if (stage === 'transport') return pointAlongRoute(transportRoute, mapMotionProgress(progress))
  if (['place', 'release', 'bin_internal'].includes(stage) || props.robotVisual?.mode === 'bin') return transportRoute.at(-1) || bin
  if (stage === 'return') return pointAlongRoute(returnRoute, mapMotionProgress(progress))
  return litter
})
const robotBadge = computed(() => {
  if (props.runtimeState?.robot?.status === 'FAULT') return props.runtimeState?.robot?.activeTaskId ? '任务暂停' : '暂不可用'
  if (props.currentEvent?.eventType === 'TASK_CREATED') return `前往垃圾 ${Math.round(moveProgress.value * 100)}%`
  const stage = String(props.robotVisual?.stage || '')
  return ({ scan: '识别垃圾', approach: '靠近垃圾', grasp: '抓取垃圾', transport: '搬运至桶', place: '对齐桶口', release: '投放', bin_internal: '桶内分类', return: '返回巡检点' })[stage] || (props.state.robotTask?.completed ? '巡检复位' : '巡检中')
})
const focusedRobotHeading = computed(() => {
  const stage = String(props.robotVisual?.stage || '').toLowerCase()
  const localProgress = mapMotionProgress(Math.max(0, Math.min(1, Number(props.robotVisual?.progress) || 0)))
  const litter = props.state.robotTask?.garbagePosition || { x: 48.1, y: 52 }
  const bin = props.state.robotTask?.targetPosition || { x: 64, y: 48 }
  const patrol = props.state.robotTask?.patrolPosition || { x: 48, y: 66.5 }
  const approachRoute = resolveRobotRoute(props.state.robotTask?.robotRoute, litter, 'approach', patrol)
  const transportRoute = resolveRobotRoute(props.state.robotTask?.transportRoute, bin, 'transport', litter)
  const returnRoute = resolveRobotReturnRoute(props.state.robotTask?.returnRoute, patrol, bin)
  if (props.currentEvent?.eventType === 'TASK_CREATED') return mapPolylineHeading(approachRoute, mapMotionProgress(moveProgress.value))
  if (stage === 'transport') return mapPolylineHeading(transportRoute, localProgress)
  if (stage === 'return') return mapPolylineHeading(returnRoute, localProgress)
  if (['scan', 'approach', 'grasp'].includes(stage)) return mapPolylineHeading(approachRoute, 1)
  return 0
})
const renderedRobots = computed(() => Object.values(runtimeRobots.value).sort((a, b) => String(a.id).localeCompare(String(b.id))).map(robot => {
  const activeTask = visualActiveRobotTasks.value?.[robot.id]
  const localTaskActive = robot.id === focusedRobotId.value && Boolean(
    props.robotVisual?.active && (!props.robotVisual?.completed || props.robotVisual?.handoff)
  )
  const basePosition = normalizeMapPoint(robot.positionPct || (robot.id === 'robot_patrol_02' ? [40, 61.5] : [48, 66.5]))
  const taskPosition = normalizeMapPoint(activeTask?.positionPct || basePosition)
  const approachRoute = activeRobotTaskRoute(activeTask, basePosition, taskPosition)
  const taskCreateApproachActive = props.currentEvent?.eventType === 'TASK_CREATED'
    && robot.id === focusedRobotId.value
    && Boolean(activeTask)
  const renderedPosition = localTaskActive || taskCreateApproachActive
    ? robotPosition.value
    : (activeTask ? approachRoute.at(-1) || basePosition : basePosition)
  const statusLabel = robot.status === 'FAULT'
    ? (activeTask ? '任务暂停' : '暂不可用')
    : taskCreateApproachActive ? robotBadge.value : activeTask ? '执行任务' : ((props.runtimeState?.operations?.robotQueues?.[robot.id]?.length || 0) ? '任务排队' : '巡检中')
  return {
    ...robot, renderedPosition, statusLabel,
    moving: (Boolean(activeTask) || localTaskActive) && !['FAULT', 'OFFLINE'].includes(robot.status),
    headingDeg: (localTaskActive || taskCreateApproachActive) ? focusedRobotHeading.value : mapPolylineHeading(approachRoute, 1)
  }
}))
const mapVisibleGarbage = computed(() => localCanvasTaskActive.value
  ? visibleGarbage.value.filter(garbage => garbage?.id !== activeGarbageId.value)
  : visibleGarbage.value)
const mapVisibleRobots = computed(() => localCanvasTaskActive.value
  ? renderedRobots.value.filter(robot => robot?.id !== focusedRobotId.value)
  : renderedRobots.value)
const activeRobotRoutes = computed(() => Object.entries(visualActiveRobotTasks.value).map(([robotId, task], index) => {
  const robot = runtimeRobots.value?.[robotId]
  const from = normalizeMapPoint(robot?.positionPct || (robotId === 'robot_patrol_02' ? [40, 61.5] : [48, 66.5]))
  const to = normalizeMapPoint(task?.positionPct || from)
  const focused = robotId === props.selectedId || robotId === focusedRobotId.value || currentEntityIds.value.has(robotId)
  return { robotId, variant: index ? 'robot-two' : 'robot-one', focused, points: routePoints(activeRobotTaskRoute(task, from, to)) }
}).filter(item => item.points))
const showFormalObstacle = computed(() => Boolean(props.state.route?.obstacle) && !['IDLE', 'STARTED'].includes(props.state.route?.status) && props.state.route?.obstacleVisible !== false)
const routeVehiclePosition = computed(() => {
  const type = props.currentEvent?.eventType
  const route = props.state.route || {}
  const stopAt = route.stopProgress == null ? .5 : Math.max(0, Math.min(1, Number(route.stopProgress)))
  const startedRoute = route.startedSegment?.length ? route.startedSegment : route.original
  if (type === 'RETURN_ROUTE_STARTED') return pointAlongRoute(startedRoute, route.startedSegment?.length ? mapMotionProgress(moveProgress.value) : mapMotionProgress(moveProgress.value) * stopAt)
  if (type === 'RETURN_ROUTE_RESUMED') return pointAlongRoute(route.resumed?.length ? route.resumed : route.replanned, mapMotionProgress(moveProgress.value))
  if (route.status === 'BLOCKED' || route.status === 'REPLANNED') return route.vehiclePosition || route.obstacle?.position || pointAlongRoute(route.original, stopAt)
  if (route.status === 'RESUMED' || route.status === 'ARRIVED') return pointAlongRoute(route.resumed?.length ? route.resumed : route.replanned, 1)
  if (route.status === 'STARTED') return route.stopPosition || pointAlongRoute(startedRoute, route.startedSegment?.length ? 1 : stopAt)
  return null
})
const routeVehicleHeading = computed(() => {
  const type = props.currentEvent?.eventType
  const routeState = props.state.route || {}
  const stopAt = routeState.stopProgress == null ? .5 : Math.max(0, Math.min(1, Number(routeState.stopProgress)))
  const startedRoute = routeState.startedSegment?.length ? routeState.startedSegment : routeState.original
  if (type === 'RETURN_ROUTE_STARTED') return mapPolylineHeading(startedRoute, routeState.startedSegment?.length ? mapMotionProgress(moveProgress.value) : mapMotionProgress(moveProgress.value) * stopAt)
  if (type === 'RETURN_ROUTE_RESUMED') return mapPolylineHeading(routeState.resumed?.length ? routeState.resumed : routeState.replanned, mapMotionProgress(moveProgress.value))
  return mapPolylineHeading(routeState.replanned?.length ? routeState.replanned : startedRoute, 1)
})
const routeVehicleMoving = computed(() => ['RETURN_ROUTE_STARTED', 'RETURN_ROUTE_RESUMED'].includes(props.currentEvent?.eventType))
const routeVehicleBadge = computed(() => ({ STARTED: '原路线行驶', BLOCKED: '路线受阻', REPLANNED: '等待新路线', RESUMED: '沿新路线行驶', ARRIVED: '已到中心' })[props.state.route?.status] || '返航中')

function activeRobotTaskRoute(task, from, to) {
  const source = task?.request?.robotRoute || task?.robotRoute || {}
  const points = source.approachWaypointsPct || source.approach || []
  return resolveRobotRoute(points, to, 'approach', from)
}
function nearestRouteIndex(route, point) {
  const target = normalizeMapPoint(point)
  return route.reduce((best, candidate, index) => {
    const distance = Math.hypot(candidate.x - target.x, candidate.y - target.y)
    return distance < best.distance ? { index, distance } : best
  }, { index: 0, distance: Infinity })
}
function routeStaysOnRobotRoad(points) {
  if (!Array.isArray(points) || points.length < 2) return false
  return points.every(rawPoint => {
    const point = normalizeMapPoint(rawPoint)
    return ROBOT_ROAD_POINTS.some(roadPoint => Math.hypot(roadPoint.x - point.x, roadPoint.y - point.y) <= MAX_LEGACY_ROBOT_ROUTE_DEVIATION)
  })
}
function canonicalRobotRoadRoute(target, phase = 'approach', fallbackStart = null) {
  const targetPoint = normalizeMapPoint(target)
  const startPoint = normalizeMapPoint(fallbackStart || targetPoint)
  const candidates = ROBOT_ROAD_ROUTE_IDS
    .map(routeId => parkRoutePolyline(routeId).map(point => normalizeMapPoint(point)))
    .filter(route => route.length)
    .map(route => ({ route, start: nearestRouteIndex(route, startPoint), target: nearestRouteIndex(route, targetPoint) }))
    .sort((left, right) => (left.start.distance + left.target.distance) - (right.start.distance + right.target.distance))
  const selected = candidates[0]
  if (!selected) return [startPoint, targetPoint]
  const fromIndex = selected.start.index
  const toIndex = selected.target.index
  if (phase === 'return') {
    return fromIndex >= toIndex
      ? selected.route.slice(toIndex, fromIndex + 1).reverse()
      : selected.route.slice(fromIndex, toIndex + 1)
  }
  return fromIndex <= toIndex
    ? selected.route.slice(fromIndex, toIndex + 1)
    : selected.route.slice(toIndex, fromIndex + 1).reverse()
}
function taskApproachVisualEndpoint(target) {
  const bin = props.state.robotTask?.targetPosition
  if (props.scenario !== 'daily' || Number(bin?.x) < 55) return null
  const point = normalizeMapPoint(target)
  const [x, y] = robotTaskScanStartPositionPct({ garbagePositionPct: [point.x, point.y] })
  return {
    ...point,
    x: Math.max(0, Math.min(100, x)),
    y: Math.max(0, Math.min(100, y))
  }
}
function appendTaskApproachEndpoint(route, target) {
  const endpoint = taskApproachVisualEndpoint(target)
  const last = route?.at?.(-1)
  if (!endpoint || !last) return route
  if (Math.hypot(last.x - endpoint.x, last.y - endpoint.y) <= .3) return route
  return [...route, endpoint]
}
function resolveRobotRoute(points, target, phase = 'approach', fallbackStart = null) {
  // Live routes already come from the robot graph. Legacy replay coordinates may
  // describe a direct diagonal across grass, so render those through the same
  // robot-road centerlines. The daily food-service route then continues to the
  // exact scan pose used by the local task player's opening frame.
  const followsRobotRoad = routeStaysOnRobotRoad(points)
  const route = followsRobotRoad
    ? points.map(point => normalizeMapPoint(point))
    : canonicalRobotRoadRoute(target, phase, fallbackStart)
  return phase === 'approach' ? appendTaskApproachEndpoint(route, target) : route
}
function resolveRobotReturnRoute(points, patrol, bin) {
  const route = resolveRobotRoute(points, patrol, 'return', bin)
  const rawStart = props.robotVisual?.handoff ? props.robotVisual?.startPositionPct : null
  if (!Array.isArray(rawStart) || rawStart.length < 2 || !route.length) return route
  const start = normalizeMapPoint(rawStart)
  const first = route[0]
  if (Math.hypot(start.x - first.x, start.y - first.y) <= .05) return route
  return [start, ...route]
}
function routePoints(route) {
  return (route || []).map(point => `${point.x},${point.y}`).join(' ')
}
function pointAlongRoute(route, amount) {
  if (!route?.length) return null
  return parkPolylinePoint(route, amount)
}
function routeLength(route) {
  return (route || []).slice(1).reduce((total, point, index) => total + Math.hypot(
    Number(point?.x) - Number(route[index]?.x),
    Number(point?.y) - Number(route[index]?.y)
  ), 0)
}
function cappedMapTravelDuration(points, kind) {
  const robot = kind === 'robot'
  const speed = Math.max(.1, Number(robot ? mapMotion.maxRobotTravelPctPerSecond : mapMotion.maxBinTravelPctPerSecond) || .1)
  const minimum = Number(robot ? mapMotion.minRobotTravelMs : mapMotion.minBinTravelMs) || 0
  return Math.max(minimum, Math.ceil(routeLength(points) / speed * 1000))
}
function interpolatePoint(from, to, amount) {
  const a = from || to || { x: 50, y: 50 }; const b = to || a; const t = Math.max(0, Math.min(1, Number(amount) || 0))
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}
function easeOut(value) { const t = Math.max(0, Math.min(1, Number(value) || 0)); return 1 - (1 - t) ** 3 }
function objectPositionFromTimeline(timeline, progress) {
  if (!Array.isArray(timeline) || !timeline.length) return null
  const frames = timeline.map((frame, index) => ({
    at: Number(frame.at ?? frame.progress ?? frame.t ?? index / Math.max(1, timeline.length - 1)),
    position: frame.objectPositionPct ? normalizeMapPoint(frame.objectPositionPct) : null
  })).filter(frame => frame.position).sort((a, b) => a.at - b.at)
  if (!frames.length) return null
  const nextIndex = frames.findIndex(frame => frame.at >= progress)
  const next = nextIndex < 0 ? frames[frames.length - 1] : frames[nextIndex]
  const previous = frames[Math.max(0, (nextIndex < 0 ? frames.length : nextIndex) - 1)]
  const local = next.at === previous.at ? 1 : (progress - previous.at) / (next.at - previous.at)
  return interpolatePoint(previous.position, next.position, mapMotionProgress(local))
}
function normalizeBehavior(value) {
  const key = String(value || 'IDLE').toUpperCase()
  return ({
    DWELLING: 'IDLE', STANDING: 'IDLE', EXITING: 'LEAVING', PAUSE: 'IDLE',
    APPROACH: 'WALKING', APPROACHING: 'WALKING', LIFT: 'DISPOSING', RELEASE: 'LITTERING', DROP: 'LITTERING', FALL: 'LITTERING', GROUND: 'LEAVING',
    LEAVE: 'LEAVING', DISPERSE: 'LEAVING', DISPERSING: 'LEAVING'
  })[key] || key
}
function visitorDirection(visitor) {
  const value = String(visitor?.direction || '').toUpperCase()
  if (['LEFT', 'WEST', 'W'].includes(value)) return -1
  if (['RIGHT', 'EAST', 'E'].includes(value)) return 1
  const heading = Number(visitor?.headingDeg)
  return Number.isFinite(heading) && heading > 90 && heading < 270 ? -1 : 1
}
function roadZone(zoneId) {
  const value = String(zoneId || '').toLowerCase()
  return value.includes('walk') || value.includes('entrance') || value.includes('gate')
}
function visitorRoadPoint(point, visitorId) {
  const roadPoint = nearestParkRoadPoint(point, 'visitor')
  const numericMatch = String(visitorId || '').match(/(\d+)$/)
  const numericId = numericMatch ? Number(numericMatch[1]) : Number.NaN
  const seed = Number.isFinite(numericId)
    ? numericId
    : [...String(visitorId || '')].reduce((total, character) => total + character.charCodeAt(0), 0)
  const longitudinalOffset = (((Math.max(1, seed) - 1) % 8) - 3.5) * 1.8
  const lateralOffset = seed % 2 === 0 ? 0.55 : -0.55
  return {
    ...roadPoint,
    x: roadPoint.x + roadPoint.tangentX * longitudinalOffset - roadPoint.tangentY * lateralOffset,
    y: roadPoint.y + roadPoint.tangentY * longitudinalOffset + roadPoint.tangentX * lateralOffset
  }
}
function preferredStaticVisitorPoint(visitor) {
  const point = dailyFoodTaskVisitorPoint(dailyDryVisitorPoint(visitor.position, visitor.zoneId), visitor)
  if (!point || !roadZone(visitor.zoneId)) return point
  const roadPoint = visitorRoadPoint(point, visitor.id)
  return interpolatePoint(point, roadPoint, 0.88)
}
function preferredVisitorMovePoint(move, progress) {
  const from = dailyDryVisitorPoint(move.from, move.fromZoneId)
  const to = dailyDryVisitorPoint(move.to, move.toZoneId)
  const rawPoint = interpolatePoint(from, to, progress)
  const visualFrom = roadZone(move.fromZoneId)
    ? interpolatePoint(from, visitorRoadPoint(from, move.visitorId), 0.88)
    : from
  const visualTo = roadZone(move.toZoneId)
    ? interpolatePoint(to, visitorRoadPoint(to, move.visitorId), 0.88)
    : to
  if (Math.hypot(visualTo.x - visualFrom.x, visualTo.y - visualFrom.y) < 0.01) return visualFrom
  const route = preferredParkRoadPolyline(visualFrom, visualTo, 'visitor')
  return parkPolylinePoint(route, progress)
}
function dailyDryVisitorPoint(point, zoneId = '') {
  if (props.scenario !== 'daily' || !point || !String(zoneId || '').toLowerCase().includes('rest')) return point
  const mask = DAILY_REST_WATER_MASK
  const dx = Number(point.x) - mask.x
  const dy = Number(point.y) - mask.y
  const insideWater = (dx * dx) / (mask.radiusX * mask.radiusX) + (dy * dy) / (mask.radiusY * mask.radiusY) < 1.08
  if (!insideWater) return point
  const landing = dx >= 0 ? DAILY_REST_DRY_LANDINGS.east : DAILY_REST_DRY_LANDINGS.west
  return {
    ...point,
    ...landing
  }
}
function dailyFoodTaskVisitorPoint(point, visitor) {
  if (!localFoodServiceTaskActive.value || !point || !String(visitor?.zoneId || '').toLowerCase().includes('food')) return point
  const landing = DAILY_FOOD_TASK_VISITOR_POSITIONS[visitor.id]
  return landing ? { ...point, ...landing } : point
}
function actionVisitorState(visitor) {
  const timeline = Array.isArray(props.currentEvent?.payload?.actionTimeline) ? props.currentEvent.payload.actionTimeline : []
  if (timeline.length) {
    const frames = timeline.map((frame, index) => ({
      ...frame,
      at: Number(frame.progress ?? frame.at ?? frame.t ?? index / Math.max(1, timeline.length - 1)),
      position: props.currentEvent?.eventType === 'ACTIVE_DISPOSAL'
        ? activeDisposalVisitorPoint(normalizeMapPoint(frame.visitorPositionPct || frame.positionPct || frame.position || visitor.position, visitor.zoneId))
        : normalizeMapPoint(frame.visitorPositionPct || frame.positionPct || frame.position || visitor.position, visitor.zoneId)
    })).sort((a, b) => a.at - b.at)
    const nextIndex = frames.findIndex(frame => frame.at >= moveProgress.value)
    const next = nextIndex < 0 ? frames[frames.length - 1] : frames[nextIndex]
    const previous = frames[Math.max(0, (nextIndex < 0 ? frames.length : nextIndex) - 1)]
    const local = next.at === previous.at ? 1 : (moveProgress.value - previous.at) / (next.at - previous.at)
    return {
      behavior: actionBehavior(next.behavior || next.action || next.phase),
      direction: next.position.x < previous.position.x ? -1 : 1,
      renderedPosition: interpolatePoint(previous.position, next.position, mapMotionProgress(local))
    }
  }
  if (props.currentEvent?.eventType === 'ACTIVE_DISPOSAL') {
    const start = visitor.position; const target = disposalStandPoint.value; const leave = { x: start.x + (start.x <= target.x ? -5 : 5), y: start.y + 5 }
    if (moveProgress.value < .32) return { behavior: 'WALKING', direction: target.x < start.x ? -1 : 1, renderedPosition: interpolatePoint(start, target, mapMotionProgress(moveProgress.value / .32)) }
    if (moveProgress.value < .72) return { behavior: 'DISPOSING', direction: target.x < start.x ? -1 : 1, renderedPosition: target }
    return { behavior: 'LEAVING', direction: leave.x < target.x ? -1 : 1, renderedPosition: interpolatePoint(target, leave, mapMotionProgress((moveProgress.value - .72) / .28)) }
  }
  return { behavior: moveProgress.value < .78 ? 'LITTERING' : 'LEAVING', direction: 1, renderedPosition: visitor.position }
}
function actionBehavior(value) {
  const phase = String(value || '').toUpperCase()
  if (props.currentEvent?.eventType === 'ACTIVE_DISPOSAL') {
    return ({ APPROACH: 'WALKING', LIFT: 'DISPOSING', DROP: 'DISPOSING', RELEASE: 'DISPOSING', LEAVE: 'LEAVING' })[phase] || 'DISPOSING'
  }
  return ({ PAUSE: 'IDLE', RELEASE: 'LITTERING', FALL: 'LITTERING', DROP: 'LITTERING', GROUND: 'LEAVING', LEAVE: 'LEAVING' })[phase] || 'LITTERING'
}
function pointStyle(point) { return { left: `${point?.x ?? 50}%`, top: `${point?.y ?? 50}%` } }
function zonePoint(zoneId) { return normalizeMapPoint(zoneId) }
function zoneName(zoneId) { return zoneLabel(zoneId) }
function behaviorLabel(value) { return ({ WALKING: '行走', IDLE: '停留', EATING: '用餐', DISPOSING: '投放', LITTERING: '遗落', LEAVING: '离开', GATHERING: '聚集' })[value] || value || '活动中' }
function isFocusedVisitor(visitor) { return visitor.id === props.selectedId || currentEntityIds.value.has(visitor.id) }
function showScenarioVisitorLabel(visitor) { return isFocusedVisitor(visitor) }
function showScenarioGarbageLabel(garbage) { return garbage.id === props.selectedId || currentEntityIds.value.has(garbage.id) }
function showScenarioRobotLabel(robot) {
  return robot.id === props.selectedId
    || currentEntityIds.value.has(robot.id)
    || ['FAULT', 'OFFLINE'].includes(robot.status)
    || (robot.id === focusedRobotId.value && Boolean(visualActiveRobotTasks.value?.[robot.id]))
}
function garbageShortLabel(garbage) {
  return mapWasteDisplayName(garbage)
}
function scenarioLabelPriority(kind, id) {
  if (id === props.selectedId) return 100
  if (currentEntityIds.value.has(id)) return 90
  return ({ device: 74, garbage: 54, visitor: 28 })[kind] || 40
}
function obstacleLabel(value) { return ({ TEMPORARY_CROWD: '临时人群聚集', TEMPORARY_OBSTACLE: '临时障碍' })[value] || value || '临时障碍' }
function heatStyle(heat) {
  const intensity = Math.max(.12, Number(heat.intensity) || 0)
  const size = 70 + intensity * 90
  return {
    ...pointStyle(heat.position), width: `${size}px`, height: `${size}px`,
    opacity: String(.3 + intensity * .45), '--heat-scale': String(1 + intensity * .18)
  }
}

function safeRaf(cb) {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(cb)
  if (typeof setTimeout === 'function') return setTimeout(cb, 16)
  return 0
}
function safeCancelRaf(id) {
  if (!id) return
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id)
  else if (typeof clearTimeout === 'function') clearTimeout(id)
}

function stopMotion() {
  safeCancelRaf(rafId)
  rafId = 0; lastTimestamp = 0
}
function hasMotion() {
  return props.state.activeMoves?.length || ['RETURN_ROUTE_STARTED', 'RETURN_ROUTE_RESUMED', 'ACTIVE_DISPOSAL', 'LITTER_CREATED'].includes(props.currentEvent?.eventType) || (props.currentEvent?.eventType === 'TASK_CREATED' && props.state.robotTask?.taskId)
}
function tick(timestamp) {
  if (!props.playing || !hasMotion()) return stopMotion()
  if (!lastTimestamp) lastTimestamp = timestamp
  const delta = Math.min(100, timestamp - lastTimestamp); lastTimestamp = timestamp
  moveProgress.value = Math.min(1, moveProgress.value + delta * Math.max(.25, Number(props.playbackRate) || 1) / motionDurationMs.value)
  if (moveProgress.value >= 1) return stopMotion()
  rafId = safeRaf(tick)
}
function startMotion() {
  if (!props.playing || !hasMotion() || moveProgress.value >= 1 || rafId) return
  lastTimestamp = 0; rafId = safeRaf(tick)
}
function resetMotion() {
  stopMotion()
  const manuallyReset = observedResetKey !== props.visualResetKey
  observedResetKey = props.visualResetKey
  moveProgress.value = manuallyReset ? 1 : 0
  startMotion()
}

watch(() => [props.currentEvent?.sequence, props.visualResetKey], resetMotion, { flush: 'post' })
watch(() => props.playing, value => value ? startMotion() : stopMotion(), { flush: 'sync' })
onMounted(startMotion)
onBeforeUnmount(stopMotion)
</script>

<style scoped>
.scenario-layer { position: absolute; z-index: 5; inset: 0; pointer-events: none; overflow: hidden; }
.scenario-badges { position: absolute; z-index: 9; right: 42px; top: 12px; display: flex; gap: 4px; }.scenario-badges text { padding: 3px 6px; border: 1px solid rgba(245,182,72,.48); border-radius: 4px; color: #ffd57c; background: rgba(83,55,9,.75); font: 700 7px/1 ui-monospace,Consolas,monospace; }
.scenario-route-layer { position:absolute; z-index:0; inset:0; width:100%; height:100%; overflow:visible; }.scenario-route,.scenario-route-ground { fill:none;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke;transition:opacity .3s ease }.scenario-route-ground{stroke:rgba(3,22,31,.48);stroke-width:4.4;opacity:.34}.scenario-route-ground.robot-ground{stroke-width:3.1;opacity:.25}.scenario-route-ground.muted{opacity:.07}.scenario-route { stroke-width:2.55;stroke-dasharray:4 10;opacity:.18;filter:drop-shadow(1px 1px .6px rgba(0,14,24,.28))}.scenario-route.active{opacity:.82;animation:scenario-route-flow var(--route-flow-duration) linear infinite}.scenario-route.original{stroke:#e9545f}.scenario-route.original.blocked{opacity:.74}.scenario-route.original.blocked.active{opacity:.86}.scenario-route.replanned{stroke:#35cf84}.scenario-route.replanned.active{opacity:.9}.scenario-route.robot-task-route{stroke-width:2.05;stroke-dasharray:3 10}.scenario-route.robot-task-route.robot-one{stroke:#65a9b4}.scenario-route.robot-task-route.robot-two{stroke:#8c83af}.scenario-route.robot-task-route.muted{opacity:.08;animation:none}
.scenario-layer.paused .scenario-route,
.scenario-layer.paused .heat-zone,
.scenario-layer.paused :deep(.map-waste-sprite.falling .waste-image) { animation-play-state: paused; }
@keyframes scenario-route-flow { to { stroke-dashoffset:-28; } }
.heat-zone { position: absolute; transform: translate(-50%,-50%) scale(var(--heat-scale)); border-radius: 50%; background: radial-gradient(circle,rgba(255,77,70,.86) 0,rgba(255,157,50,.48) 34%,rgba(255,210,55,.15) 60%,transparent 72%); animation: heat-breathe var(--heat-breathe-duration) ease-in-out infinite; }.heat-zone text { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); color: #fff6d9; font-size: 8px; font-weight: 800; text-shadow: 0 1px 4px #511; white-space: nowrap; }
@keyframes heat-breathe { 50% { filter: saturate(1.25) brightness(1.12); } }
.zone-count { position: absolute; z-index: 5; transform: translate(-50%,-50%); padding: 3px 6px; display: flex; gap: 5px; border: 1px solid rgba(126,216,255,.36); border-radius: 5px; color: #a8d8ec; background: rgba(3,27,43,.82); font-size: 7px; }.zone-count .b-text { color: #f0fbff; }
.scenario-visitor { position: absolute; z-index: 8; transform: translate(-50%,-76%); pointer-events: auto; transition: filter .2s ease; }.scenario-visitor:hover { filter: drop-shadow(0 0 7px #24d9ff); }
.scenario-visitor.selected { z-index: 12; }
.generated-garbage,.route-obstacle,.action-trash { position: absolute; z-index: 10; transform: translate(-50%,-50%); pointer-events: auto; text-align: center; }.generated-garbage :deep(.map-waste-sprite){--waste-motion-duration:var(--scenario-waste-motion-duration)}.generated-garbage.carried{transform:translate(-50%,-95%)}.action-trash{pointer-events:none}
.route-obstacle .obstacle-icon { display: flex; width: 25px; height: 25px; margin: auto; align-items: center; justify-content: center; border: 2px solid #ffd2d2; border-radius: 5px; color: #fff; background: #df404a; box-shadow: 0 0 14px rgba(255,75,84,.72); font-style: normal; font-weight: 900; }
.route-vehicle { position: absolute; z-index: 9; transform: translate(-50%,-82%); text-align: center; }
.scenario-robot { position:absolute;z-index:9;transform:translate(-50%,-82%);text-align:center;pointer-events:auto;cursor:pointer }.scenario-robot.robot-2{filter:drop-shadow(0 0 5px rgba(167,123,255,.65))}
.scenario-label-overlay{position:absolute;z-index:12;inset:0;overflow:visible;pointer-events:none}.scenario-label-anchor{position:absolute;transform:translate(-50%,-50%);width:1px;height:1px}.scenario-label-anchor.visitor{width:24px;height:41px;transform:translate(-50%,-76%)}.scenario-label-anchor.robot{width:42px;height:60px;transform:translate(-50%,-82%)}.scenario-label-anchor.bin{width:36px;height:46px;transform:translate(-50%,-82%)}.scenario-label-anchor.garbage{width:32px;height:27px}.scenario-label-anchor.obstacle{width:25px;height:25px}
.route-key { position: absolute; z-index: 8; right: 12px; bottom: 67px; padding: 6px 8px; display: grid; gap: 4px; border: 1px solid rgba(116,197,255,.3); border-radius: 6px; color: #dff7ff; background: rgba(3,25,40,.82); font-size: 7px; }.route-key view { display: flex; align-items: center; gap: 6px; }.route-key .original,.route-key .replanned { width:22px; border-top:2px dotted; }.route-key .original { border-color:#e9545f; }.route-key .replanned { border-color:#35cf84; }.route-key .small-text { color: #ffd57c; font: 6px/1 ui-monospace,Consolas,monospace; }
@media (max-width: 900px) { .scenario-badges { right: 34px; }.zone-count { padding: 2px 4px; }.zone-count text { display: none; }.route-key { bottom: 62px; } }

/* #ifdef MP-WEIXIN */
.scenario-layer,.scenario-route-layer,.scenario-label-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; width: 100%; height: 100%; }
.scenario-badges { right: 8px; top: 8px; }
.route-key { right: 8px; bottom: 8px; }
/* #endif */
</style>
