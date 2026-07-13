<template>
  <view v-if="scenario !== 'baseline'" :class="['scenario-layer', { paused: !playing }]" :style="visualTimingStyle">
    <!-- #ifdef H5 -->
    <svg class="scenario-route-layer" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline v-if="originalRoutePoints" :points="originalRoutePoints" class="scenario-route-ground" />
      <polyline v-if="newRoutePoints" :points="newRoutePoints" class="scenario-route-ground" />
      <polyline v-for="robotRoute in activeRobotRoutes" :key="`${robotRoute.robotId}:ground`" :points="robotRoute.points" class="scenario-route-ground robot-ground" />
      <polyline v-if="originalRoutePoints" :points="originalRoutePoints" :class="['scenario-route', 'original', { blocked: ['BLOCKED','REPLANNED','RESUMED','ARRIVED'].includes(route.status) }]" />
      <polyline v-if="newRoutePoints" :points="newRoutePoints" class="scenario-route replanned" />
      <polyline v-for="robotRoute in activeRobotRoutes" :key="robotRoute.robotId" :points="robotRoute.points" :class="['scenario-route', 'robot-task-route', robotRoute.variant]" />
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
    ><text>{{ zoneName(zoneId) }}</text><b>{{ count }} 人</b></view>

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
        :playing="playing"
        :playback-rate="playbackRate"
        :selected="visitor.id === selectedId"
        :depth-scale="mapDepthScale(visitor.renderedPosition?.y)"
      />
    </view>

    <view
      v-for="garbage in visibleGarbage"
      :key="garbage.id"
      class="generated-garbage"
      :class="{ falling: garbage.falling, carried: garbage.carried }"
      :style="pointStyle(garbage.renderedPosition || garbage.position)"
      @tap.stop="$emit('select', garbage.id)"
    ><i></i></view>

    <view v-if="disposalTrashPosition" class="action-trash disposal-trash" :style="pointStyle(disposalTrashPosition)">
      <i></i>
    </view>

    <view v-if="showFormalObstacle" class="route-obstacle" :style="pointStyle(state.route.obstacle.position)" @tap.stop="$emit('select', state.route.obstacle.id)">
      <i>!</i>
    </view>

    <view v-for="(robot, index) in renderedRobots" v-if="scenario === 'daily'" :key="robot.id" :class="['scenario-robot', `robot-${index + 1}`]" :style="pointStyle(robot.renderedPosition)" @tap.stop="$emit('select', robot.id)">
      <MapEntitySprite kind="robot" variant="active" :selected="selectedId === robot.id" :affected="currentEntityIds.has(robot.id)" :moving="robot.moving" :depth-scale="mapDepthScale(robot.renderedPosition?.y)" :heading-deg="robot.headingDeg" />
    </view>

    <view v-if="routeVehiclePosition" class="route-vehicle" :style="pointStyle(routeVehiclePosition)">
      <MapEntitySprite kind="bin" variant="returning" :affected="true" moving :depth-scale="mapDepthScale(routeVehiclePosition?.y)" :heading-deg="routeVehicleHeading" />
    </view>

    <view v-if="state.route?.original?.length" class="route-key">
      <view><i class="original"></i><text>原路线</text></view>
      <view v-if="state.route.replanned?.length"><i class="replanned"></i><text>新路线</text></view>
      <small :data-source="state.route.algorithmSource">{{ displaySourceLabel(state.route.algorithmSource) }}</small>
    </view>
  </view>

  <view v-if="scenario !== 'baseline'" class="scenario-label-overlay">
    <view v-for="visitor in renderedVisitors.filter(showScenarioVisitorLabel)" :key="`${visitor.id}:label`" class="scenario-label-anchor visitor" :style="pointStyle(visitor.renderedPosition)">
      <StableMapLabel :label-id="`${visitor.id}:behavior`" :text="behaviorLabel(visitor.behavior)" :detail="visitor.id === selectedId ? visitor.id : ''" :priority="scenarioLabelPriority('visitor', visitor.id)" placement="above" :selected="visitor.id === selectedId" :current="currentEntityIds.has(visitor.id)" />
    </view>
    <view v-for="cluster in visibleVisitorClusters" :key="`${cluster.id}:label`" class="scenario-label-anchor cluster" :style="pointStyle(cluster.position)">
      <StableMapLabel :label-id="`${cluster.id}:aggregate`" :text="`聚集 × ${cluster.count}`" :priority="76" placement="above" tone="amber" aggregate />
    </view>
    <view v-for="garbage in visibleGarbage.filter(showScenarioGarbageLabel)" :key="`${garbage.id}:label`" class="scenario-label-anchor garbage" :style="pointStyle(garbage.renderedPosition || garbage.position)">
      <StableMapLabel :label-id="`${garbage.id}:status`" :text="garbage.carried ? '已携带' : '散落垃圾'" :detail="garbage.id === selectedId ? garbage.id : ''" :priority="scenarioLabelPriority('garbage', garbage.id)" placement="below" tone="amber" :selected="garbage.id === selectedId" :current="currentEntityIds.has(garbage.id)" />
    </view>
    <view v-if="disposalTrashPosition" class="scenario-label-anchor garbage" :style="pointStyle(disposalTrashPosition)">
      <StableMapLabel label-id="active_disposal_object:status" text="投放物" :priority="88" placement="below" tone="green" current />
    </view>
    <view v-if="showFormalObstacle" class="scenario-label-anchor obstacle" :style="pointStyle(state.route.obstacle.position)">
      <StableMapLabel :label-id="`${state.route.obstacle.id}:status`" :text="obstacleLabel(state.route.obstacle.label)" :detail="state.route.obstacle.id" :priority="92" placement="below" tone="red" current />
    </view>
    <view v-for="(robot, index) in renderedRobots.filter(showScenarioRobotLabel)" :key="`${robot.id}:label`" class="scenario-label-anchor robot" :style="pointStyle(robot.renderedPosition)">
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
import StableMapLabel from './StableMapLabel.vue'
import { normalizeMapPoint, zoneLabel } from '@/utils/park-scenario-visuals.js'
import { primaryEventEntityIds } from '@/utils/park-replay.js'
import { displaySourceLabel } from '@/utils/source-display.js'
import { mapDepthScale, mapMotionProgress, mapPolylineHeading } from '@/config/digital-twin-visual-system.js'

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

const route = computed(() => props.state.route || {})
const currentEntityIds = computed(() => new Set(primaryEventEntityIds(props.currentEvent)))
const originalRoutePoints = computed(() => routePoints(props.state.route?.original))
const newRoutePoints = computed(() => routePoints(props.state.route?.replanned))
const runtimeRobots = computed(() => ({
  robot_patrol_01: props.runtimeState?.robots?.robot_patrol_01 || (props.runtimeState?.robot?.id === 'robot_patrol_01' ? props.runtimeState.robot : { id: 'robot_patrol_01', status: 'PATROLLING', positionPct: [51, 64] }),
  robot_patrol_02: props.runtimeState?.robots?.robot_patrol_02 || { id: 'robot_patrol_02', status: 'PATROLLING', positionPct: [43, 68] }
}))
const runtimeActiveRobotTasks = computed(() => props.runtimeState?.operations?.activeRobotTasks || {})
const focusedRobotId = computed(() => props.currentEvent?.payload?.selectedEntityId || props.currentEvent?.payload?.robotId || props.currentEvent?.payload?.request?.robotId || 'robot_patrol_01')
const visualTimingStyle = computed(() => ({ '--visual-duration': `${1.2 / Math.max(.25, Number(props.playbackRate) || 1)}s` }))
const activeGarbageId = computed(() => props.state.robotTask?.garbageId || props.currentEvent?.payload?.request?.garbageId || '')
const visibleGarbage = computed(() => (props.state.garbage || []).filter(item => item.status !== 'COLLECTED').map(item => {
  const falling = props.currentEvent?.eventType === 'LITTER_CREATED' && item.id === props.currentEvent?.payload?.garbageId && moveProgress.value < 1
  const actor = renderedVisitors.value.find(visitor => visitor.id === item.visitorId)
  const timelinePosition = falling ? objectPositionFromTimeline(item.actionTimeline, moveProgress.value) : null
  const renderedPosition = falling ? (timelinePosition || interpolatePoint(actor?.renderedPosition || item.position, item.position, easeOut(moveProgress.value))) : item.position
  const carried = item.id === activeGarbageId.value && Boolean(props.robotVisual?.carrying)
  return { ...item, falling, carried, renderedPosition: carried ? robotPosition.value : renderedPosition }
}).filter(item => !item.carried || props.robotVisual?.showCarriedMarker))
const activeDisposal = computed(() => props.currentEvent?.eventType === 'ACTIVE_DISPOSAL' ? props.currentEvent.payload || {} : null)
const disposalTarget = computed(() => normalizeMapPoint(activeDisposal.value?.positionPct || activeDisposal.value?.targetPositionPct || activeDisposal.value?.servicePointId, activeDisposal.value?.servicePointId || 'service_food_01'))

const renderedVisitors = computed(() => (props.state.visitors || []).map(visitor => {
  const move = (props.state.activeMoves || []).find(item => item.visitorId === visitor.id)
  const isActor = visitor.id === (props.currentEvent?.payload?.visitorId || props.state.activity?.visitorId)
  if (isActor && ['ACTIVE_DISPOSAL', 'LITTER_CREATED'].includes(props.currentEvent?.eventType)) {
    const action = actionVisitorState(visitor)
    return { ...visitor, ...action }
  }
  if (!move) return { ...visitor, behavior: normalizeBehavior(visitor.behavior), direction: visitorDirection(visitor), renderedPosition: visitor.position }
  return {
    ...visitor,
    behavior: props.state.crowd?.phase === 'GATHERING' ? 'GATHERING' : normalizeBehavior(move.behavior || visitor.behavior),
    direction: move.to.x < move.from.x ? -1 : 1,
    renderedPosition: {
      x: move.from.x + (move.to.x - move.from.x) * mapMotionProgress(moveProgress.value),
      y: move.from.y + (move.to.y - move.from.y) * mapMotionProgress(moveProgress.value)
    }
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
  if (!activeDisposal.value || moveProgress.value < .34 || moveProgress.value > .72) return null
  const timelinePosition = objectPositionFromTimeline(activeDisposal.value.actionTimeline, moveProgress.value)
  if (timelinePosition) return timelinePosition
  const actor = renderedVisitors.value.find(visitor => visitor.id === activeDisposal.value.visitorId)
  const from = actor?.renderedPosition || normalizeMapPoint(activeDisposal.value.visitorPositionPct || 'food_rest_area')
  const lift = { x: from.x + (actor?.direction || 1) * 1.4, y: from.y - 3.5 }
  if (moveProgress.value < .52) return lift
  return interpolatePoint(lift, disposalTarget.value, Math.min(1, (moveProgress.value - .52) / .2))
})

const robotPosition = computed(() => {
  const patrol = props.state.robotTask?.patrolPosition || { x: 51, y: 64 }
  const litter = props.state.robotTask?.garbagePosition || { x: 68, y: 56 }
  const bin = props.state.robotTask?.targetPosition || { x: 74, y: 52 }
  if (props.currentEvent?.eventType === 'TASK_CREATED' && props.state.robotTask?.taskId) {
    return pointAlongRoute(props.state.robotTask.robotRoute?.length ? props.state.robotTask.robotRoute : [patrol, litter], mapMotionProgress(moveProgress.value))
  }
  if (props.currentEvent?.eventType !== 'ROBOT_TASK_REQUESTED') return props.state.robotTask?.completed ? patrol : (props.state.robotTask?.requested ? litter : patrol)
  const stage = String(props.robotVisual?.stage || 'scan').toLowerCase()
  const progress = Math.max(0, Math.min(1, Number(props.robotVisual?.progress) || 0))
  if (['scan', 'approach', 'grasp'].includes(stage)) return litter
  if (stage === 'transport') return pointAlongRoute(props.state.robotTask?.transportRoute?.length ? props.state.robotTask.transportRoute : [litter, bin], mapMotionProgress(progress))
  if (['place', 'release', 'bin_internal'].includes(stage) || props.robotVisual?.mode === 'bin') return bin
  if (stage === 'return') return pointAlongRoute(props.state.robotTask?.returnRoute?.length ? props.state.robotTask.returnRoute : [bin, patrol], mapMotionProgress(progress))
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
  if (props.currentEvent?.eventType === 'TASK_CREATED') return mapPolylineHeading(props.state.robotTask?.robotRoute, mapMotionProgress(moveProgress.value))
  if (stage === 'transport') return mapPolylineHeading(props.state.robotTask?.transportRoute, localProgress)
  if (stage === 'return') return mapPolylineHeading(props.state.robotTask?.returnRoute, localProgress)
  if (['scan', 'approach', 'grasp'].includes(stage)) return mapPolylineHeading(props.state.robotTask?.robotRoute, 1)
  return 0
})
const renderedRobots = computed(() => Object.values(runtimeRobots.value).sort((a, b) => String(a.id).localeCompare(String(b.id))).map(robot => {
  const activeTask = runtimeActiveRobotTasks.value?.[robot.id]
  const basePosition = normalizeMapPoint(robot.positionPct || (robot.id === 'robot_patrol_02' ? [43, 68] : [51, 64]))
  const taskPosition = normalizeMapPoint(activeTask?.positionPct || basePosition)
  const renderedPosition = robot.id === focusedRobotId.value && activeTask ? robotPosition.value : (activeTask ? taskPosition : basePosition)
  const approachRoute = activeRobotTaskRoute(activeTask, basePosition, taskPosition)
  const statusLabel = robot.status === 'FAULT'
    ? (activeTask ? '任务暂停' : '暂不可用')
    : activeTask ? `执行 ${activeTask.taskId}` : ((props.runtimeState?.operations?.robotQueues?.[robot.id]?.length || 0) ? '任务排队' : '巡检中')
  return {
    ...robot, renderedPosition, statusLabel,
    moving: Boolean(activeTask) && !['FAULT', 'OFFLINE'].includes(robot.status),
    headingDeg: robot.id === focusedRobotId.value && activeTask ? focusedRobotHeading.value : mapPolylineHeading(approachRoute, 1)
  }
}))
const activeRobotRoutes = computed(() => Object.entries(runtimeActiveRobotTasks.value).map(([robotId, task], index) => {
  const robot = runtimeRobots.value?.[robotId]
  const from = normalizeMapPoint(robot?.positionPct || (robotId === 'robot_patrol_02' ? [43, 68] : [51, 64]))
  const to = normalizeMapPoint(task?.positionPct || from)
  return { robotId, variant: index ? 'robot-two' : 'robot-one', points: routePoints(activeRobotTaskRoute(task, from, to)) }
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
  if (route.status === 'RESUMED') return pointAlongRoute(route.resumed?.length ? route.resumed : route.replanned, 1)
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
const routeVehicleBadge = computed(() => ({ STARTED: '原路线行驶', BLOCKED: '路线受阻', REPLANNED: '等待新路线', RESUMED: '沿新路线行驶' })[props.state.route?.status] || '返航中')

function activeRobotTaskRoute(task, from, to) {
  const source = task?.request?.robotRoute || task?.robotRoute || {}
  const points = source.approachWaypointsPct || source.approach || []
  return Array.isArray(points) && points.length
    ? points.map(point => normalizeMapPoint(point))
    : [from, to]
}
function routePoints(route) {
  return (route || []).map(point => `${point.x},${point.y}`).join(' ')
}
function pointAlongRoute(route, amount) {
  if (!route?.length) return null
  if (route.length === 1) return route[0]
  const scaled = Math.max(0, Math.min(1, amount)) * (route.length - 1)
  const index = Math.min(route.length - 2, Math.floor(scaled)); const local = scaled - index
  return { x: route[index].x + (route[index + 1].x - route[index].x) * local, y: route[index].y + (route[index + 1].y - route[index].y) * local }
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
function actionVisitorState(visitor) {
  const timeline = Array.isArray(props.currentEvent?.payload?.actionTimeline) ? props.currentEvent.payload.actionTimeline : []
  if (timeline.length) {
    const frames = timeline.map((frame, index) => ({
      ...frame,
      at: Number(frame.progress ?? frame.at ?? frame.t ?? index / Math.max(1, timeline.length - 1)),
      position: normalizeMapPoint(frame.visitorPositionPct || frame.positionPct || frame.position || visitor.position, visitor.zoneId)
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
    const start = visitor.position; const target = disposalTarget.value; const leave = { x: start.x + (start.x <= target.x ? -5 : 5), y: start.y + 5 }
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
function showScenarioGarbageLabel(garbage) { return garbage.id === props.selectedId || currentEntityIds.value.has(garbage.id) || garbage.carried }
function showScenarioRobotLabel(robot) {
  return robot.id === props.selectedId
    || currentEntityIds.value.has(robot.id)
    || ['FAULT', 'OFFLINE'].includes(robot.status)
    || Boolean(runtimeActiveRobotTasks.value?.[robot.id])
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

function stopMotion() {
  if (rafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId)
  rafId = 0; lastTimestamp = 0
}
function hasMotion() {
  return props.state.activeMoves?.length || ['RETURN_ROUTE_STARTED', 'RETURN_ROUTE_RESUMED', 'ACTIVE_DISPOSAL', 'LITTER_CREATED'].includes(props.currentEvent?.eventType) || (props.currentEvent?.eventType === 'TASK_CREATED' && props.state.robotTask?.taskId)
}
function tick(timestamp) {
  if (!props.playing || !hasMotion()) return stopMotion()
  if (!lastTimestamp) lastTimestamp = timestamp
  const delta = Math.min(100, timestamp - lastTimestamp); lastTimestamp = timestamp
  moveProgress.value = Math.min(1, moveProgress.value + delta * Math.max(.25, Number(props.playbackRate) || 1) / 1500)
  if (moveProgress.value >= 1) return stopMotion()
  rafId = requestAnimationFrame(tick)
}
function startMotion() {
  if (!props.playing || !hasMotion() || moveProgress.value >= 1 || rafId) return
  lastTimestamp = 0; rafId = requestAnimationFrame(tick)
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
.scenario-route-layer { position: absolute; z-index:0; inset: 0; width: 100%; height: 100%; overflow: visible; }.scenario-route,.scenario-route-ground { fill:none;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke }.scenario-route-ground{stroke:rgba(0,14,24,.58);stroke-width:7;opacity:.48;filter:blur(.35px)}.scenario-route-ground.robot-ground{stroke-width:5;opacity:.4}.scenario-route.original { stroke: #ff9a47; stroke-width: 3.8; stroke-dasharray: 10 7; opacity: .78; filter:drop-shadow(1px 2px 1px rgba(0,14,24,.42)) }.scenario-route.original.blocked { opacity: .38; }.scenario-route.replanned { stroke: #24d9ff; stroke-width: 4; stroke-dasharray: 5 6; filter:drop-shadow(1px 2px 1px rgba(0,14,24,.5));animation:scenario-route-flow var(--visual-duration,1.1s) linear infinite; }
.scenario-route.robot-task-route { stroke-width:3;stroke-dasharray:4 5;opacity:.82;filter:drop-shadow(1px 2px 1px rgba(0,14,24,.48));animation:scenario-route-flow var(--visual-duration,1.1s) linear infinite}.scenario-route.robot-task-route.robot-one{stroke:#24d9ff}.scenario-route.robot-task-route.robot-two{stroke:#a77bff}
.scenario-layer.paused .scenario-route,
.scenario-layer.paused .heat-zone,
.scenario-layer.paused .active-disposal i,
.scenario-layer.paused .generated-garbage.falling i { animation-play-state: paused; }
@keyframes scenario-route-flow { to { stroke-dashoffset: -22; } }
.heat-zone { position: absolute; transform: translate(-50%,-50%) scale(var(--heat-scale)); border-radius: 50%; background: radial-gradient(circle,rgba(255,77,70,.86) 0,rgba(255,157,50,.48) 34%,rgba(255,210,55,.15) 60%,transparent 72%); animation: heat-breathe calc(var(--visual-duration,1.2s) * 1.5) ease-in-out infinite; }.heat-zone text { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); color: #fff6d9; font-size: 8px; font-weight: 800; text-shadow: 0 1px 4px #511; white-space: nowrap; }
@keyframes heat-breathe { 50% { filter: saturate(1.25) brightness(1.12); } }
.zone-count { position: absolute; z-index: 5; transform: translate(-50%,-50%); padding: 3px 6px; display: flex; gap: 5px; border: 1px solid rgba(126,216,255,.36); border-radius: 5px; color: #a8d8ec; background: rgba(3,27,43,.82); font-size: 7px; }.zone-count b { color: #f0fbff; }
.scenario-visitor { position: absolute; z-index: 8; transform: translate(-50%,-76%); pointer-events: auto; transition: filter .2s ease; }.scenario-visitor:hover { filter: drop-shadow(0 0 7px #24d9ff); }
.scenario-visitor.selected { z-index: 12; }
.generated-garbage,.route-obstacle,.action-trash { position: absolute; z-index: 10; transform: translate(-50%,-50%); pointer-events: auto; text-align: center; }.generated-garbage i,.action-trash i { display: block; width: 12px; height: 12px; margin: auto; border: 2px solid #fff; border-radius: 50%; background: #f5b648; box-shadow: 0 0 9px #f5b648; }.generated-garbage.falling i { animation: garbage-tumble calc(var(--visual-duration,.8s) * .7) linear infinite; }.generated-garbage.carried { transform: translate(-50%,-95%) scale(.72); }.action-trash { pointer-events:none; }
@keyframes garbage-tumble { to { transform: rotate(360deg); } }
.route-obstacle i { display: flex; width: 25px; height: 25px; margin: auto; align-items: center; justify-content: center; border: 2px solid #ffd2d2; border-radius: 5px; color: #fff; background: #df404a; box-shadow: 0 0 14px rgba(255,75,84,.72); font-style: normal; font-weight: 900; }
.route-vehicle { position: absolute; z-index: 9; transform: translate(-50%,-50%); text-align: center; }
.scenario-robot { position:absolute;z-index:9;transform:translate(-50%,-50%);text-align:center;pointer-events:auto;cursor:pointer }.scenario-robot.robot-2{filter:drop-shadow(0 0 5px rgba(167,123,255,.65))}
.scenario-label-overlay{position:absolute;z-index:12;inset:0;overflow:visible;pointer-events:none}.scenario-label-anchor{position:absolute;transform:translate(-50%,-50%);width:1px;height:1px}.scenario-label-anchor.visitor{width:24px;height:41px;transform:translate(-50%,-76%)}.scenario-label-anchor.robot{width:34px;height:48px}.scenario-label-anchor.bin{width:34px;height:43px}.scenario-label-anchor.garbage{width:12px;height:12px}.scenario-label-anchor.obstacle{width:25px;height:25px}
.route-key { position: absolute; z-index: 8; right: 12px; bottom: 67px; padding: 6px 8px; display: grid; gap: 4px; border: 1px solid rgba(116,197,255,.3); border-radius: 6px; color: #dff7ff; background: rgba(3,25,40,.82); font-size: 7px; }.route-key view { display: flex; align-items: center; gap: 6px; }.route-key i { width: 22px; border-top: 3px dashed; }.route-key i.original { border-color: #ff9a47; }.route-key i.replanned { border-color: #24d9ff; }.route-key small { color: #ffd57c; font: 6px/1 ui-monospace,Consolas,monospace; }
@media (max-width: 900px) { .scenario-badges { right: 34px; }.zone-count { padding: 2px 4px; }.zone-count text { display: none; }.route-key { bottom: 62px; } }
</style>
