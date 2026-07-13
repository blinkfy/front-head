<template>
  <view ref="canvasContainerRef" class="park-canvas panel">
  <view
    ref="canvasRef"
    :style="sceneSurfaceStyle"
    :class="['park-scene-surface', {
      'calibration-mode': sceneDev.calibration,
      'compare-backgrounds': sceneDev.compare,
      'candidate-preview': sceneDev.candidate,
      'hide-dynamic-objects': sceneDev.hideDynamics
    }]"
  >
    <view class="environment-back"></view>
    <image class="park-background ground-layer" :src="sceneDev.candidate ? sceneAssets.candidateBackground : sceneAssets.formalBackground" mode="aspectFit" />
    <image v-if="sceneDev.calibration" class="park-road-overlay" :src="sceneAssets.roadOverlay" mode="scaleToFill" />
    <view class="ground-detail-layer">
      <view v-for="detail in groundDetails" :key="detail.id" class="ground-detail" :data-purpose="detail.purpose" :style="detail.style"></view>
    </view>
    <view class="atmosphere-layer"></view>
    <image v-if="sceneDev.compare" class="candidate-background-comparison" :src="sceneAssets.candidateBackground" mode="scaleToFill" />

    <view class="north-mark"><view class="north-arrow"></view><text>N</text></view>
    <view class="map-legend">
      <view><i class="legend-shape robot"></i><text>机器人</text></view>
      <view><i class="legend-shape bin"></i><text>智能桶</text></view>
      <view><i class="legend-shape waste"></i><text>垃圾物体</text></view>
    </view>

    <view class="zone-label entrance"><text>公园入口</text><small>zone_entrance_01</small></view>
    <view class="zone-label food"><text>餐饮/休息区</text><small>zone_food_rest_01</small></view>
    <view class="road-label">设备返航道路</view>

    <view
      v-for="(bay, index) in centerBayRows"
      :key="bay.id"
      :class="['center-bay-anchor', `bay-${index + 1}`, { occupied: bay.deviceId, selected: selectedId === bay.id }]"
      @tap.stop="$emit('select', bay.id)"
    >
      <i></i>
    </view>
    <view v-for="station in visibleCenterStations" :key="station.id" :class="['facility-anchor', 'station-facility', station.key]">
      <MapEntitySprite kind="station" :variant="station.key" :active="centerPhase === station.phase" :depth-scale="mapDepthScale(18)" />
    </view>

    <!-- #ifdef H5 -->
    <svg :class="['route-layer', { paused: !playing }]" viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>
        <marker id="return-arrow" markerUnits="strokeWidth" markerWidth="2.2" markerHeight="2.2" refX="1.9" refY="1.1" orient="auto" viewBox="0 0 2.2 2.2"><path d="M0,0 L2.2,1.1 L0,2.2 Z" fill="#bd866b" /></marker>
        <marker id="replace-arrow" markerUnits="strokeWidth" markerWidth="2.2" markerHeight="2.2" refX="1.9" refY="1.1" orient="auto" viewBox="0 0 2.2 2.2"><path d="M0,0 L2.2,1.1 L0,2.2 Z" fill="#65a9b4" /></marker>
      </defs>
      <polyline :class="['route-path', 'route-bed', { visible: showDispatchRoutes, complete: arrivedAtCenter }]" :points="returnRoutePoints" />
      <polyline :class="['route-path', 'route-bed', { visible: showDispatchRoutes, complete: standbyTookOver }]" :points="replacementRoutePoints" />
      <polyline :style="routeAnimationStyle" :class="['route-path', 'return', { visible: showDispatchRoutes, complete: arrivedAtCenter }]" :points="returnRoutePoints" marker-end="url(#return-arrow)" />
      <polyline :style="routeAnimationStyle" :class="['route-path', 'replacement', { visible: showDispatchRoutes, complete: standbyTookOver }]" :points="replacementRoutePoints" marker-end="url(#replace-arrow)" />
    </svg>
    <!-- #endif -->

    <ParkScenarioOverlay
      :scenario="scenario"
      :state="scenarioState"
      :current-event="currentEvent"
      :selected-id="selectedId"
      :playing="playing"
      :playback-rate="playbackRate"
      :visual-reset-key="visualResetKey"
      :robot-visual="robotVisual"
      :runtime-state="runtimeState"
      @select="$emit('select', $event)"
    />

    <view
      v-for="object in sceneObjects"
      :key="object.id"
      :class="['scene-object', object.kind, { selected: object.id === selectedId, affected: affectedIds.includes(object.id) || incidentAffectedIds.has(object.id), faded: object.faded, moving: object.moving }]"
      :data-entity-id="object.id"
      :style="object.style"
      @tap.stop="$emit('select', object.id)"
    >
      <MapEntitySprite v-if="object.kind === 'robot' || object.kind === 'bin'" :kind="object.kind" :variant="object.variant || 'active'" :selected="object.id === selectedId" :affected="priorityEventIds.has(object.id) || incidentAffectedIds.has(object.id)" :moving="object.moving" :depth-scale="object.depthScale" :heading-deg="object.headingDeg" />
      <VisitorBehaviorSprite v-else-if="object.kind === 'visitor'" behavior="IDLE" :selected="object.id === selectedId" :depth-scale="object.depthScale" :playing="playing" :playback-rate="playbackRate" />
      <view v-else-if="object.kind === 'service'" class="service-symbol"></view>
      <view v-else-if="object.kind === 'waste'" :class="['waste-symbol', object.category]">{{ object.short }}</view>
    </view>

    <view v-if="sceneDev.showOcclusion" class="foreground-occlusion-layer" aria-hidden="true">
      <view
        v-for="region in foregroundOcclusions"
        :key="region.id"
        :class="['occlusion-region', region.type]"
        :data-occlusion-id="region.id"
        :style="occlusionStyle(region)"
      ></view>
    </view>

    <view class="scene-label-overlay">
      <view v-for="bay in centerBayRows.filter(item => item.deviceId || selectedId === item.id)" :key="`${bay.id}:labels`" :class="['center-bay-label-anchor', bay.id === 'bay_02' ? 'bay-2' : 'bay-1']">
        <StableMapLabel :label-id="`${bay.id}:status`" :text="bay.label" :detail="bay.detail" :priority="selectedId === bay.id ? 99 : 78" placement="below" :tone="bay.tone" :selected="selectedId === bay.id" />
      </view>
      <view v-for="station in visibleCenterStations" :key="`${station.id}:labels`" :class="['facility-label-anchor', station.key]">
        <StableMapLabel :label-id="`${station.id}:status`" :text="station.label" :detail="station.id" :priority="centerPhase === station.phase ? 88 : 66" placement="below" :tone="centerPhase === station.phase ? 'cyan' : 'neutral'" :current="centerPhase === station.phase" />
      </view>
      <view v-for="object in sceneObjects" :key="`${object.id}:labels`" :class="['scene-label-anchor', object.kind]" :style="object.style">
        <StableMapLabel v-if="showObjectPrimaryLabel(object)" :label-id="`${object.id}:primary`" :text="objectPrimaryLabel(object)" :detail="object.id === selectedId ? object.id : ''" :priority="labelPriority(object)" placement="below" :tone="object.badgeTone || 'neutral'" :selected="object.id === selectedId" :current="priorityEventIds.has(object.id)" />
      </view>
    </view>

    <view v-if="sceneDev.calibration" class="scene-calibration-layer">
      <!-- #ifdef H5 -->
      <svg class="calibration-road-layer" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path
          v-for="edge in calibrationEdges"
          :key="edge.id"
          :d="parkRoadEdgePath(edge)"
          :class="['calibration-road', edge.networkType, edge.laneType, { blocked: isCalibrationBlockedEdge(edge.id) }]"
        />
        <g v-for="route in calibrationCandidateRoutes" :key="route.id" :class="['candidate-route', route.tone]">
          <path v-for="edge in route.edges" :key="`${route.id}:${edge.id}`" :d="parkRoadEdgePath(edge)" />
        </g>
      </svg>
      <!-- #endif -->
      <view
        v-for="anchor in calibrationAnchors"
        :key="anchor.id"
        class="calibration-anchor"
        :style="calibrationPointStyle(anchor.positionPct)"
      ><i></i><text>{{ anchor.id }} · {{ anchor.positionPct.join(',') }}</text></view>
      <view
        v-for="anchor in calibrationAnchors"
        :key="`${anchor.id}:error`"
        class="calibration-anchor-error"
        :style="calibrationPointStyle(anchor.positionPct)"
      ><text>误差 {{ anchor.errorPct }}%</text></view>
      <view
        v-for="node in calibrationNodes"
        :key="node.id"
        :class="['calibration-node', node.networkType]"
        :style="calibrationPointStyle([node.x, node.y])"
      ><i></i><text>{{ node.id }}</text></view>
      <view
        v-for="edge in calibrationEdgeLabels"
        :key="`${edge.id}:label`"
        :class="['calibration-edge-label', edge.networkType, { blocked: isCalibrationBlockedEdge(edge.id) }]"
        :style="calibrationPointStyle(edge.positionPct)"
      ><text>{{ edge.id }} · {{ edge.allowedEntities.join('/') }}</text></view>
      <view
        v-for="object in calibrationObjects"
        :key="object.id"
        class="calibration-object-point"
        :style="calibrationPointStyle(object.positionPct)"
      ><text>{{ object.id }}</text></view>
      <view class="calibration-caption">三类网络：游客 / 机器人 / 移动桶 · 节点 / 边 / allowedEntities / 阻塞 / 候选路线 / 锚点误差{{ sceneDev.compare ? ' · 新旧背景 48% 叠加' : '' }}</view>
    </view>

    <view class="event-overlay">
      <view :class="['event-pulse', presentation.tone]"></view>
      <view>
        <text class="event-overlay-label">当前事件 {{ sequence }}</text>
        <text class="event-overlay-title">{{ presentation.title }}</text>
      </view>
      <text :data-source="currentEvent?.source" :class="['source-tag', sourceClass]">{{ displaySourceLabel(currentEvent?.source, '—') }}</text>
    </view>
  </view>
  </view>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParkScenarioOverlay from './ParkScenarioOverlay.vue'
import MapEntitySprite from './MapEntitySprite.vue'
import StableMapLabel from './StableMapLabel.vue'
import VisitorBehaviorSprite from './VisitorBehaviorSprite.vue'
import { centerPhaseFromEvent, eventEntityIds, eventPresentation, primaryEventEntityIds } from '@/utils/park-replay.js'
import { layoutStableMapLabels } from '@/utils/stable-map-label-layout.js'
import { displaySourceLabel } from '@/utils/source-display.js'
import PARK_SCENE_LAYERS, { PARK_SCENE_ASSETS, readParkSceneDevFlags } from '@/config/park-scene-layers.js'
import PARK_SCENE_OCCLUSIONS, { parkOcclusionStyle } from '@/config/park-scene-occlusion.js'
import PARK_SCENE_ALIGNMENT from '@/config/park-scene-alignment.json'
import { mapDepthScale, mapMotionProgress } from '@/config/digital-twin-visual-system.js'
import {
  PARK_ROAD_NETWORK, PARK_ROUTE_GRAPH, parkEdgesForRoute, parkRoadEdgePath,
  parkRoutePoint, parkRouteSvgPoints, sampleParkRoadEdge
} from '@/utils/park-road-network.js'

const props = defineProps({
  currentEvent: { type: Object, default: () => ({}) },
  labels: { type: Object, default: () => ({}) },
  selectedId: { type: String, default: '' },
  playing: { type: Boolean, default: false },
  playbackRate: { type: Number, default: 1 },
  visualResetKey: { type: [String, Number], default: '' },
  scenario: { type: String, default: 'baseline' },
  scenarioState: { type: Object, default: () => ({}) },
  eventHistory: { type: Array, default: () => [] },
  robotVisual: { type: Object, default: () => ({}) },
  runtimeState: { type: Object, default: () => ({}) }
})
defineEmits(['select'])

const sequence = computed(() => Number(props.currentEvent?.sequence) || 1)
const presentation = computed(() => eventPresentation(props.currentEvent))
const affectedIds = computed(() => eventEntityIds(props.currentEvent))
const priorityEventIds = computed(() => new Set(primaryEventEntityIds(props.currentEvent)))
const sourceClass = computed(() => String(props.currentEvent?.source || '').toLowerCase().replace(/_/g, '-'))
const centerPhase = computed(() => centerPhaseFromEvent(props.currentEvent))
const eventTypes = computed(() => props.eventHistory.map(event => event.eventType))
const hasEvent = eventType => eventTypes.value.includes(eventType)
const dispatchStarted = computed(() => hasEvent('RETURN_AND_REPLACEMENT_DISPATCHED'))
const arrivedAtCenter = computed(() => hasEvent('DEVICE_ARRIVED_AT_CENTER'))
const standbyTookOver = computed(() => hasEvent('STANDBY_TOOK_OVER_SERVICE_POINT'))
const replacementDispatched = computed(() => dispatchStarted.value || hasEvent('REPLACEMENT_DISPATCHED'))
const recovered = computed(() => hasEvent('DEVICE_RECOVERED'))
const blockedRouteVehicleActive = computed(() => props.scenario === 'blocked' && ['STARTED', 'BLOCKED', 'REPLANNED', 'RESUMED'].includes(props.scenarioState?.route?.status))
const showDispatchRoutes = computed(() => props.scenario !== 'blocked' && dispatchStarted.value)
const activeIncidents = computed(() => props.runtimeState?.incidents?.active || [])
const incidentAffectedIds = computed(() => new Set(activeIncidents.value.flatMap(incident => incident.affectedEntityIds || [])))
const centerQueueCount = computed(() => props.runtimeState?.operations?.centerQueue?.length || 0)
const sceneAssets = PARK_SCENE_ASSETS
const sceneDev = ref(readParkSceneDevFlags())
const groundDetails = PARK_SCENE_LAYERS.groundDetails.items
const foregroundOcclusions = PARK_SCENE_OCCLUSIONS
const calibrationAnchors = Object.entries(PARK_SCENE_ALIGNMENT.anchors).map(([id, anchor]) => ({
  id, ...anchor, errorPct: PARK_SCENE_ALIGNMENT.candidateEvaluation?.anchorChecks?.[id]?.errorPct ?? 0
}))
const nodeNetworkById = new Map(PARK_ROAD_NETWORK.nodes.map(node => [node.id, node.networkType]))
const calibrationNodes = PARK_ROAD_NETWORK.nodes
const calibrationEdges = PARK_ROAD_NETWORK.edges.map(edge => ({ ...edge, networkType: nodeNetworkById.get(edge.from) }))
const calibrationCandidateRoutes = [
  { id: 'device_food_to_center_direct', tone: 'east-north' },
  { id: 'device_food_to_center_center_loop', tone: 'south-west' }
].map(route => ({ ...route, edges: parkEdgesForRoute(route.id) }))
const defaultBlockScenario = Object.values(PARK_ROUTE_GRAPH.blockScenarios || {})[0] || {}
const defaultBlockedEdgeIds = new Set(defaultBlockScenario.blockedEdgeIds || [])
const runtimeBlockedEdgeIds = computed(() => new Set(
  Object.values(props.runtimeState?.roadObstacles || {}).map(obstacle => obstacle.blockedEdgeId).filter(Boolean)
))
const calibrationEdgeLabels = calibrationEdges.map(edge => {
  const sampled = sampleParkRoadEdge(edge)
  const point = sampled[Math.floor(sampled.length / 2)] || { x: 0, y: 0 }
  return { ...edge, positionPct: [point.x, point.y] }
})
const calibrationObjects = Object.entries(PARK_SCENE_ALIGNMENT.objectCoordinateReferences).map(([id, positionPct]) => ({ id, positionPct }))
const returnRoutePoints = parkRouteSvgPoints('device_food_to_center_direct')
const replacementRoutePoints = parkRouteSvgPoints('device_standby_to_food_shared')
const centerBayRows = computed(() => {
  const bays = props.runtimeState?.operations?.centerBays || props.runtimeState?.sortingCenter?.bays || {}
  return ['bay_01', 'bay_02'].map((id, index) => {
    const bay = bays[id] || {}
    const occupied = Boolean(bay.deviceId)
    return {
      id,
      deviceId: bay.deviceId || '',
      label: `泊位 ${index + 1} · ${occupied ? stageLabel(bay.stage || bay.status) : '空闲'}`,
      detail: occupied ? bay.deviceId : id,
      tone: occupied ? 'cyan' : 'neutral'
    }
  })
})
const occupiedBayCount = computed(() => centerBayRows.value.filter(bay => bay.deviceId).length)
const centerDetail = computed(() => `泊位 ${occupiedBayCount.value}/2${centerQueueCount.value ? ` · 等待 ${centerQueueCount.value}` : ''}`)
const dispatchProgress = ref(0)
const canvasContainerRef = ref(null)
const canvasRef = ref(null)
const sceneSurfaceStyle = ref({ width: '100%', height: '100%' })
const routeAnimationStyle = computed(() => ({ animationDuration: `${1.8 / Math.max(.25, Number(props.playbackRate) || 1)}s` }))
let dispatchRafId = 0
let dispatchLastTimestamp = 0
let labelRafId = 0
let labelSettleTimer = 0
let labelResizeObserver = null

const centerStations = Object.freeze([
  { id: 'center_station_unload_01', key: 'unload', phase: 'UNLOADING', label: '卸料工位' },
  { id: 'center_station_clean_01', key: 'wash', phase: 'CLEANING', label: '清洁工位' },
  { id: 'center_station_charge_01', key: 'charge', phase: 'CHARGING', label: '充电工位' }
])
// The service dock must remain identical to the route graph endpoint.
// The food/rest zone caption is visually offset independently.
const FOOD_SERVICE_POINT = Object.freeze([64, 48])
const visibleCenterStations = computed(() => centerStations.filter(station =>
  centerPhase.value === station.phase || props.selectedId === station.id
))

function pos(left, top) { return { left: `${left}%`, top: `${top}%` } }
function staticPose(left, top, headingDeg = 0) {
  return { style: pos(left, top), depthScale: mapDepthScale(top), headingDeg }
}
function calibrationPointStyle(point) { return pos(point[0], point[1]) }
function occlusionStyle(region) { return parkOcclusionStyle(region) }
function syncSceneDevFlags() { sceneDev.value = readParkSceneDevFlags() }
function isCalibrationBlockedEdge(edgeId) {
  return runtimeBlockedEdgeIds.value.size ? runtimeBlockedEdgeIds.value.has(edgeId) : defaultBlockedEdgeIds.has(edgeId)
}
function fitSceneSurface() {
  const root = canvasContainerRef.value?.$el || canvasContainerRef.value
  const bounds = root?.getBoundingClientRect?.()
  if (!bounds?.width || !bounds?.height) return
  const targetRatio = PARK_ROAD_NETWORK.scene.width / PARK_ROAD_NETWORK.scene.height
  const width = bounds.width / bounds.height > targetRatio ? bounds.height * targetRatio : bounds.width
  const height = width / targetRatio
  sceneSurfaceStyle.value = { width: `${Math.round(width * 100) / 100}px`, height: `${Math.round(height * 100) / 100}px` }
}
function stageLabel(stage) {
  return ({ DOCK: '对接', UNLOAD: '卸料', CLEAN: '清洁', CHARGE: '充电', CHECK: '检测', STANDBY: '待命' })[stage] || stage || '处理中'
}

function routePose(route, amount) {
  const routeId = route === 'return' ? 'device_food_to_center_direct' : 'device_standby_to_food_shared'
  const progress = Math.max(0, Math.min(1, Number(amount) || 0))
  const point = parkRoutePoint(routeId, progress)
  const before = parkRoutePoint(routeId, Math.max(0, progress - .008))
  const after = parkRoutePoint(routeId, Math.min(1, progress + .008))
  return {
    style: pos(point.x, point.y),
    depthScale: mapDepthScale(point.y),
    headingDeg: Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI
  }
}

function pauseDispatchAnimation() {
  if (dispatchRafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(dispatchRafId)
  dispatchRafId = 0; dispatchLastTimestamp = 0
}

function tickDispatch(timestamp) {
  if (!props.playing || props.currentEvent?.eventType !== 'RETURN_AND_REPLACEMENT_DISPATCHED') return pauseDispatchAnimation()
  if (!dispatchLastTimestamp) dispatchLastTimestamp = timestamp
  const delta = Math.min(100, timestamp - dispatchLastTimestamp); dispatchLastTimestamp = timestamp
  dispatchProgress.value = Math.min(1, dispatchProgress.value + delta * Math.max(.25, Number(props.playbackRate) || 1) / 1500)
  if (dispatchProgress.value >= 1) return pauseDispatchAnimation()
  dispatchRafId = requestAnimationFrame(tickDispatch)
}

function startDispatchAnimation() {
  if (!props.playing || props.currentEvent?.eventType !== 'RETURN_AND_REPLACEMENT_DISPATCHED' || dispatchProgress.value >= 1 || dispatchRafId) return
  dispatchLastTimestamp = 0; dispatchRafId = requestAnimationFrame(tickDispatch)
}

function resetDispatchAnimation() {
  pauseDispatchAnimation(); dispatchProgress.value = 0; startDispatchAnimation()
}

const robotPosition = computed(() => {
  const type = props.currentEvent?.eventType
  if (type === 'LITTER_CREATED') return pos(48.1, 58)
  if (type === 'TASK_CREATED' && props.currentEvent?.payload?.taskType === 'ROBOT_COLLECT_AND_SORT') return pos(48.1, 58)
  if (type === 'ROBOT_TASK_REQUESTED') return pos(53, 52)
  if (type === 'ROBOT_TASK_RESULT') return pos(...FOOD_SERVICE_POINT)
  return pos(48, 66.5)
})

const fullBinPose = computed(() => {
  if (!dispatchStarted.value) return staticPose(...FOOD_SERVICE_POINT)
  if (props.scenario === 'blocked' && props.currentEvent?.eventType === 'RETURN_AND_REPLACEMENT_DISPATCHED') return staticPose(...FOOD_SERVICE_POINT)
  if (props.currentEvent?.eventType === 'RETURN_AND_REPLACEMENT_DISPATCHED') return routePose('return', mapMotionProgress(dispatchProgress.value) * .68)
  if (!arrivedAtCenter.value) return routePose('return', .84)
  return routePose('return', 1)
})

const standbyBinPose = computed(() => {
  if (!replacementDispatched.value) return staticPose(27.8, 20.5)
  if (props.currentEvent?.eventType === 'RETURN_AND_REPLACEMENT_DISPATCHED') return routePose('replacement', mapMotionProgress(dispatchProgress.value) * .72)
  if (!standbyTookOver.value) return routePose('replacement', .88)
  return routePose('replacement', 1)
})

const foodBinBadge = computed(() => {
  const runtimeBadge = deviceStatusBadge('device_smart_bin_food_01')
  if (runtimeBadge) return runtimeBadge
  const type = props.currentEvent?.eventType
  if (type === 'BIN_FILL_UPDATED') return `${Number(props.currentEvent?.payload?.fillPct) || 0}%`
  if (type === 'FULL_RISK_TRIGGERED') return '满载风险'
  if (type === 'RETURN_AND_REPLACEMENT_DISPATCHED' && props.scenario === 'blocked') return '返航任务已下发'
  if (type === 'RETURN_AND_REPLACEMENT_DISPATCHED') return `返航中 ${Math.round(mapMotionProgress(dispatchProgress.value) * 68)}%`
  if (dispatchStarted.value && !arrivedAtCenter.value) return '接近中心'
  if (arrivedAtCenter.value && !recovered.value) return centerPhase.value === '—' ? '中心内' : centerPhase.value
  if (recovered.value) return '已恢复'
  return '在线'
})

function deviceStatusBadge(deviceId) {
  const device = props.runtimeState?.devices?.[deviceId]
  if (!device) return ''
  if (device.status === 'FAULT') return '设备故障'
  if (device.status === 'OFFLINE') return '设备离线'
  if (device.status === 'LOW_BATTERY') return `低电量 ${Number(device.batteryPct) || 0}%`
  if (device.status === 'RETURNING') return '返航充电'
  if (device.status === 'AT_CENTER') return '中心排队'
  if (device.status === 'DEPLOYING') return '前往补位'
  if (['DOCKING', 'UNLOADING', 'CLEANING', 'CHARGING', 'CHECKING'].includes(device.status)) return '中心处理中'
  return ''
}
function statusTone(status, fallback = 'green') {
  if (['FAULT', 'OFFLINE'].includes(status)) return 'red'
  if (['LOW_BATTERY', 'RETURNING', 'AT_CENTER'].includes(status)) return 'amber'
  if (['DEPLOYING', 'DOCKING', 'UNLOADING', 'CLEANING', 'CHARGING', 'CHECKING'].includes(status)) return 'cyan'
  return fallback
}
function serviceBadge(pointId) {
  const point = props.runtimeState?.servicePoints?.[pointId]
  if (!point) return null
  if (point.status === 'DEGRADED') return { text: '服务降级', tone: 'red' }
  if (point.status === 'WAITING_REPLACEMENT') return { text: '等待补位', tone: 'amber' }
  if (point.status === 'PENDING_REPLACEMENT') return { text: '补位途中', tone: 'amber' }
  return { text: '服务中', tone: 'green' }
}

function withMapEntityVisual(object) {
  const y = Number.parseFloat(object.style?.top)
  return {
    ...object,
    depthScale: object.depthScale ?? mapDepthScale(Number.isFinite(y) ? y : 50),
    headingDeg: Number(object.headingDeg) || 0
  }
}

const sceneObjects = computed(() => [
  ...(props.scenario !== 'daily' ? [{ id: 'robot_patrol_01', kind: 'robot', variant: 'active', style: robotPosition.value, badge: ['TASK_CREATED', 'ROBOT_TASK_REQUESTED', 'ROBOT_TASK_RESULT', 'TASK_SUCCEEDED'].includes(props.currentEvent?.eventType) ? presentation.value.title : '巡检中', badgeTone: 'cyan' }] : []),
  ...(props.scenario === 'baseline' ? [{ id: 'visitor_01', kind: 'visitor', style: pos(48.1, 76), badge: props.currentEvent?.eventType === 'LITTER_CREATED' ? '产生垃圾' : '', badgeTone: 'amber' }] : []),
  { id: 'service_food_01', kind: 'service', style: pos(...FOOD_SERVICE_POINT), badge: serviceBadge('service_food_01')?.text || (dispatchStarted.value && !standbyTookOver.value ? '待补位' : '服务中'), badgeTone: serviceBadge('service_food_01')?.tone || (dispatchStarted.value && !standbyTookOver.value ? 'amber' : 'green') },
  { id: 'service_rest_01', kind: 'service', style: pos(31.5, 61.5), badge: serviceBadge('service_rest_01')?.text || '服务中', badgeTone: serviceBadge('service_rest_01')?.tone || 'green' },
  ...(!blockedRouteVehicleActive.value ? [{ id: 'device_smart_bin_food_01', kind: 'bin', variant: dispatchStarted.value ? 'returning' : 'active', style: fullBinPose.value.style, depthScale: fullBinPose.value.depthScale, headingDeg: fullBinPose.value.headingDeg, badge: foodBinBadge.value, badgeTone: statusTone(props.runtimeState?.devices?.device_smart_bin_food_01?.status, hasEvent('FULL_RISK_TRIGGERED') && !recovered.value ? 'amber' : 'green'), moving: props.currentEvent?.eventType === 'RETURN_AND_REPLACEMENT_DISPATCHED' && props.scenario !== 'blocked' }] : []),
  { id: 'device_smart_bin_rest_01', kind: 'bin', variant: 'active', style: pos(31.5, 61.5), badge: deviceStatusBadge('device_smart_bin_rest_01') || `${Number(props.runtimeState?.devices?.device_smart_bin_rest_01?.fillPct ?? 30)}%`, badgeTone: statusTone(props.runtimeState?.devices?.device_smart_bin_rest_01?.status) },
  { id: 'device_smart_bin_standby_01', kind: 'bin', variant: standbyTookOver.value ? 'active' : 'standby', style: standbyBinPose.value.style, depthScale: standbyBinPose.value.depthScale, headingDeg: standbyBinPose.value.headingDeg, badge: deviceStatusBadge('device_smart_bin_standby_01') || (props.currentEvent?.eventType === 'RETURN_AND_REPLACEMENT_DISPATCHED' ? `补位中 ${Math.round(mapMotionProgress(dispatchProgress.value) * 72)}%` : replacementDispatched.value && !standbyTookOver.value ? '接近服务点' : standbyTookOver.value ? '已接管' : '备用'), badgeTone: statusTone(props.runtimeState?.devices?.device_smart_bin_standby_01?.status, replacementDispatched.value ? 'cyan' : 'blue'), moving: props.currentEvent?.eventType === 'RETURN_AND_REPLACEMENT_DISPATCHED' },
  { id: 'device_smart_bin_standby_02', label: '备用智能桶 02', kind: 'bin', variant: props.runtimeState?.devices?.device_smart_bin_standby_02?.role === 'ACTIVE' ? 'active' : 'standby', style: pos(...(props.runtimeState?.devices?.device_smart_bin_standby_02?.positionPct || [29.6, 20.5])), badge: deviceStatusBadge('device_smart_bin_standby_02') || (props.runtimeState?.devices?.device_smart_bin_standby_02?.reservedForPointId ? '已预留' : '备用'), badgeTone: statusTone(props.runtimeState?.devices?.device_smart_bin_standby_02?.status, props.runtimeState?.devices?.device_smart_bin_standby_02?.reservedForPointId ? 'cyan' : 'blue') },
  ...(props.scenario === 'baseline' ? [
    { id: 'garbage_cardboard_01', kind: 'waste', category: 'recyclable', short: '纸', style: pos(36, 61.5) },
    { id: 'garbage_banana_01', kind: 'waste', category: 'kitchen', short: '厨', style: pos(48.1, 52), faded: hasEvent('ROBOT_TASK_RESULT'), badge: props.currentEvent?.eventType === 'LITTER_CREATED' ? '新事件' : '', badgeTone: 'amber' },
    { id: 'garbage_battery_01', kind: 'waste', category: 'hazardous', short: '危', style: pos(51, 57) },
    { id: 'garbage_paper_cup_01', kind: 'waste', category: 'other', short: '其', style: pos(57, 50.5) }
  ] : [])
].map(withMapEntityVisual))

function isObjectFocused(object) {
  return object.id === props.selectedId
    || priorityEventIds.value.has(object.id)
    || affectedIds.value.includes(object.id)
    || incidentAffectedIds.value.has(object.id)
}

function showObjectPrimaryLabel(object) {
  if (sceneDev.value.calibration) return true
  if (object.kind === 'service' && object.id !== props.selectedId && !incidentAffectedIds.value.has(object.id)) return false
  if (isObjectFocused(object) || object.moving) return true
  return Boolean(object.badge) && ['red', 'amber'].includes(object.badgeTone)
}

function objectPrimaryLabel(object) {
  const name = props.labels[object.id] || object.label || object.id
  if (object.kind === 'waste') return object.short || name
  return object.badge ? `${name} · ${object.badge}` : name
}

function labelPriority(object) {
  const selected = object.id === props.selectedId
  const current = priorityEventIds.value.has(object.id)
  const base = ({ robot: 74, bin: 72, service: 68, waste: 52, visitor: 28 })[object.kind] || 40
  return selected ? 100 : current ? 90 : base
}

function runLabelLayout() {
  labelRafId = 0
  layoutStableMapLabels(canvasRef.value?.$el || canvasRef.value)
}

function scheduleLabelLayout() {
  if (labelRafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(labelRafId)
  if (labelSettleTimer) clearTimeout(labelSettleTimer)
  nextTick(() => {
    labelRafId = requestAnimationFrame(runLabelLayout)
    if (props.playing) labelSettleTimer = setTimeout(runLabelLayout, Math.round(1580 / Math.max(.25, Number(props.playbackRate) || 1)))
  })
}

function stopLabelLayout() {
  if (labelRafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(labelRafId)
  if (labelSettleTimer) clearTimeout(labelSettleTimer)
  labelRafId = 0; labelSettleTimer = 0
  labelResizeObserver?.disconnect(); labelResizeObserver = null
}

watch(() => [props.currentEvent?.sequence, props.visualResetKey], resetDispatchAnimation, { flush: 'post' })
watch(() => props.playing, value => value ? startDispatchAnimation() : pauseDispatchAnimation(), { flush: 'sync' })
watch(() => [props.currentEvent?.sequence, props.visualResetKey, props.selectedId, props.scenario, props.playbackRate], scheduleLabelLayout, { flush: 'post' })
onMounted(() => {
  syncSceneDevFlags()
  if (typeof window !== 'undefined') window.addEventListener('hashchange', syncSceneDevFlags)
  fitSceneSurface()
  startDispatchAnimation()
})
onMounted(() => {
  scheduleLabelLayout()
  if (typeof ResizeObserver === 'function') {
    labelResizeObserver = new ResizeObserver(() => {
      fitSceneSurface()
      scheduleLabelLayout()
    })
    const root = canvasContainerRef.value?.$el || canvasContainerRef.value
    if (root) labelResizeObserver.observe(root)
  }
})
onBeforeUnmount(() => {
  if (typeof window !== 'undefined') window.removeEventListener('hashchange', syncSceneDevFlags)
  pauseDispatchAnimation(); stopLabelLayout()
})
</script>

<style scoped>
.park-canvas { position: relative; min-height: 0; overflow: hidden; display:flex; align-items:center; justify-content:center; background: #061522; }
.park-scene-surface { position:relative; flex:0 0 auto; overflow:hidden; aspect-ratio:1672/941; background:#061522; isolation:isolate; }
.environment-back,.park-background,.park-road-overlay,.ground-detail-layer,.atmosphere-layer,.candidate-background-comparison,.foreground-occlusion-layer,.scene-calibration-layer { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.environment-back { z-index: 0; background: radial-gradient(ellipse at 48% 42%, #0a2634 0%, #061522 72%, #020b12 100%); }
.park-background { z-index: 1; object-fit: contain; }
.park-road-overlay { z-index:2; object-fit:fill; opacity:.42; }
.ground-detail-layer { z-index: 2; overflow: hidden; }.ground-detail { position: absolute; pointer-events: none; }
.atmosphere-layer { z-index: 4; background: linear-gradient(135deg,rgba(214,240,255,.08),rgba(117,166,189,.018) 35%,rgba(0,17,29,.12)),radial-gradient(ellipse at 50% 42%,rgba(55,118,134,.025),rgba(0,14,26,.18) 94%); box-shadow: inset 0 0 72px rgba(0,14,26,.38); }
.candidate-background-comparison { z-index: 5; object-fit: fill; opacity: .48; mix-blend-mode: normal; }
.foreground-occlusion-layer { z-index: 6; overflow: hidden; }.occlusion-region { position:absolute;inset:0;background-repeat:no-repeat;background-position:center;background-size:cover;transform:translateZ(0)}.occlusion-region.building_roof,.occlusion-region.platform_front_edge{filter:drop-shadow(7px 10px 10px rgba(0,17,29,.2))}
.scene-calibration-layer { z-index: 14; overflow: hidden; }.calibration-road-layer{position:absolute;inset:0;width:100%;height:100%}.calibration-road{fill:none;stroke:#6de9ff;stroke-width:.32;stroke-dasharray:1 1;vector-effect:non-scaling-stroke}.calibration-road.pedestrian{stroke:#d9ff8f}.calibration-road.business_route_reference{stroke:#ffb866}.calibration-anchor,.calibration-object-point{position:absolute;transform:translate(-50%,-50%);white-space:nowrap}.calibration-anchor i{display:block;width:8px;height:8px;margin:-4px;border:2px solid #fff;border-radius:50%;background:#ff5d66;box-shadow:0 0 10px #ff5d66}.calibration-anchor text{position:absolute;left:8px;top:-12px;padding:2px 4px;border-radius:3px;color:#fff;background:rgba(78,12,20,.86);font:700 7px/1.2 ui-monospace,Consolas,monospace}.calibration-object-point{width:4px;height:4px;border:1px solid #24d9ff;background:#061522}.calibration-object-point text{position:absolute;left:5px;top:3px;color:#8ff2ff;font:6px/1.2 ui-monospace,Consolas,monospace}.calibration-caption{position:absolute;right:12px;top:12px;padding:5px 8px;border:1px solid rgba(255,184,102,.7);border-radius:5px;color:#fff2d8;background:rgba(70,41,9,.86);font:700 8px/1.2 ui-monospace,Consolas,monospace}
.calibration-road.robot{stroke:#ffbf69}.calibration-road.service_device{stroke:#63e6ff}.calibration-road.blocked{stroke:#ff4f63;stroke-width:.8;stroke-dasharray:2 .5}.candidate-route path{fill:none;stroke-width:.75;stroke-dasharray:2 1;vector-effect:non-scaling-stroke}.candidate-route.east-north path{stroke:#ff9a47}.candidate-route.south-west path{stroke:#b784ff}.calibration-node,.calibration-edge-label,.calibration-anchor-error{position:absolute;transform:translate(-50%,-50%);white-space:nowrap}.calibration-node i{display:block;width:5px;height:5px;margin:-2.5px;border:1px solid #fff;border-radius:50%;background:#63e6ff}.calibration-node.pedestrian i{background:#b8eb72}.calibration-node.robot i{background:#ffbf69}.calibration-node text{position:absolute;left:4px;top:2px;color:#e8fbff;font:5px/1.1 ui-monospace,Consolas,monospace;text-shadow:0 1px 2px #00111d}.calibration-edge-label{opacity:.75}.calibration-edge-label text{display:block;padding:1px 2px;color:#bfefff;background:rgba(0,21,32,.76);font:4px/1 ui-monospace,Consolas,monospace}.calibration-edge-label.pedestrian text{color:#dfffab}.calibration-edge-label.robot text{color:#ffd49a}.calibration-edge-label.blocked text{color:#fff;background:#a4192a}.calibration-anchor-error{margin-top:9px;color:#ffd8dc;font:5px/1 ui-monospace,Consolas,monospace}.calibration-caption{max-width:52%;white-space:normal}
.north-mark { position: absolute; z-index: 10; right: 14px; top: 12px; display: flex; flex-direction: column; align-items: center; color: #dff7ff; font-size: 10px; text-shadow: 0 1px 4px #00111d; }
.north-arrow { width: 0; height: 0; border-left: 7px solid transparent; border-right: 7px solid transparent; border-bottom: 22px solid #e9f8ff; filter: drop-shadow(0 1px 3px #00111d); }
.map-legend { position: absolute; z-index: 10; left: 12px; top: 12px; padding: 8px 9px; display: grid; gap: 6px; border: 1px solid rgba(118,201,255,.28); border-radius: 9px; color: #b8d8e7; background: rgba(3,25,40,.8); font-size: 10px; backdrop-filter: blur(5px); }
.map-legend view { display: flex; align-items: center; gap: 7px; }.legend-shape { display: inline-block; width: 10px; height: 10px; }.legend-shape.robot { border: 2px solid #8cecff; border-radius: 3px; }.legend-shape.bin { background: #2c8fff; border-radius: 2px; }.legend-shape.waste { background: #ff5d66; border-radius: 50%; }
.zone-label { position: absolute; z-index: 9; padding: 4px 6px; border-radius: 5px; color: #f0fbff; background: rgba(4,26,40,.7); text-shadow: 0 1px 3px #00111d; pointer-events: none; }
.zone-label text,.zone-label small { display: block; }.zone-label text { font-size: 11px; font-weight: 700; }.zone-label small { color: #8eb4c7; font: 8px/1.2 ui-monospace, Consolas, monospace; margin-top: 2px; }
.zone-label.entrance { left: 44%; bottom: 3%; }.zone-label.food { right: 20%; top: 41%; }
.road-label { position: absolute; z-index: 9; top: 10%; left: 52%; color: #b6cbd4; font-size: 10px; letter-spacing: 1px; text-shadow: 0 1px 3px #00111d; }
.facility-anchor { position:absolute; z-index:5; transform:translate(-50%,-50%); pointer-events:none; }.center-facility{left:24%;top:16%}.station-facility{top:20.5%}.station-facility.unload{left:20.5%}.station-facility.wash{left:23%}.station-facility.charge{left:25.5%}
.center-bay-anchor { position:absolute; z-index:5; top:17.5%; width:14px; height:8px; transform:translate(-50%,-50%); cursor:pointer; }.center-bay-anchor.bay-1{left:21.2%}.center-bay-anchor.bay-2{left:24%}.center-bay-anchor>i{display:block;width:100%;height:100%;box-sizing:border-box;border:1px solid rgba(115,171,199,.7);border-radius:2px;background:rgba(19,54,72,.82)}.center-bay-anchor.occupied>i{border-color:#24d9ff;background:rgba(36,217,255,.32);box-shadow:0 0 10px rgba(36,217,255,.5)}.center-bay-anchor.selected>i{outline:1px solid #fff;outline-offset:2px}
.route-layer { position:absolute; z-index:3; inset:0; width:100%; height:100%; pointer-events:none; }.route-layer.paused .route-path { animation-play-state:paused; }.route-path { fill:none; stroke-width:2.65px; stroke-linecap:round; stroke-dasharray:4px 10px; vector-effect:non-scaling-stroke; opacity:0; transition:opacity .3s ease; animation:route-flow 1.65s linear infinite; filter:drop-shadow(1px 1px .7px rgba(0,14,24,.34)); }.route-path.visible { opacity:.82; }.route-path.complete { opacity:.14; animation:none; }.route-path.return { stroke:#bd866b; }.route-path.replacement { stroke:#65a9b4; }.route-path.route-bed { stroke:rgba(3,19,29,.52);stroke-width:4.8px;stroke-dasharray:none;animation:none;filter:none;opacity:0}.route-path.route-bed.visible{opacity:.42}.route-path.route-bed.complete{opacity:.09}
@keyframes route-flow { to { stroke-dashoffset: -28; } }
.scene-object { position: absolute; z-index: 5; transform: translate(-50%,-50%); transition: left .7s cubic-bezier(.22,1,.36,1),top .7s cubic-bezier(.22,1,.36,1),opacity .25s ease; cursor: pointer; }.scene-object.moving { transition: none; }.scene-object::after { content: ''; position: absolute; inset: -7px; border: 1px solid transparent; border-radius: 10px; transition: all .18s ease; }.scene-object:hover::after { border-color:rgba(36,217,255,.5);box-shadow:0 0 12px rgba(36,217,255,.28)}.scene-object.faded { opacity: .34; }
.scene-label-overlay { position:absolute;z-index:12;inset:0;pointer-events:none;overflow:visible }.scene-label-anchor{position:absolute;transform:translate(-50%,-50%);width:36px;height:46px}.scene-label-anchor.robot{width:42px;height:60px}.scene-label-anchor.visitor{width:24px;height:41px}.scene-label-anchor.service{width:20px;height:20px}.scene-label-anchor.waste{width:21px;height:21px}.center-bay-label-anchor,.facility-label-anchor{position:absolute;transform:translate(-50%,-50%)}.center-bay-label-anchor{top:17.5%;width:14px;height:8px}.center-bay-label-anchor.bay-1{left:21.2%}.center-bay-label-anchor.bay-2{left:24%}.facility-label-anchor{top:20.5%;width:34px;height:31px}.facility-label-anchor.unload{left:20.5%}.facility-label-anchor.wash{left:23%}.facility-label-anchor.charge{left:25.5%}
.service-symbol { width: 31px; height: 31px; border: 2px dashed #69e4ff; border-radius: 8px; background: rgba(36,217,255,.12); }
.waste-symbol { width: 21px; height: 21px; display: flex; align-items: center; justify-content: center; border: 2px solid #fff; border-radius: 50%; color: #fff; font-size: 8px; font-weight: 800; box-shadow: 0 0 10px rgba(0,0,0,.5); }.waste-symbol.recyclable { background: #2c8fff; }.waste-symbol.kitchen { background: #16a66a; }.waste-symbol.hazardous { background: #e14b55; }.waste-symbol.other { background: #667788; }
.event-overlay { position: absolute; z-index: 10; left: 12px; bottom: 12px; min-width: 230px; padding: 8px 10px; display: grid; grid-template-columns: 9px 1fr auto; align-items: center; gap: 8px; border: 1px solid rgba(116,197,255,.34); border-radius: 9px; background: rgba(2,23,38,.86); backdrop-filter: blur(6px); }.event-pulse { width: 8px; height: 8px; border-radius: 50%; background: #2c8fff; box-shadow: 0 0 10px currentColor; }.event-pulse.cyan { background: #24d9ff; }.event-pulse.green { background: #16c57c; }.event-pulse.amber { background: #f5b648; }.event-pulse.red { background: #ff5d66; }.event-overlay-label,.event-overlay-title { display: block; }.event-overlay-label { color: #789fb4; font-size: 8px; }.event-overlay-title { color: #e9f9ff; font-size: 11px; font-weight: 700; margin-top: 2px; }.source-tag { padding: 2px 5px; border-radius: 4px; color: #8ec8eb; border: 1px solid rgba(100,174,226,.34); background: rgba(22,91,143,.24); font: 700 8px/1.2 ui-monospace, Consolas, monospace; }.source-tag.isaac-realtime { color: #c1a7ff; }.source-tag.backend-api { color: #8af1be; }.source-tag.visual-aid { color: #ffd57c; }
.hide-dynamic-objects .route-layer,.hide-dynamic-objects .scene-object,.hide-dynamic-objects .facility-anchor,.hide-dynamic-objects .center-bay-anchor,.hide-dynamic-objects .map-legend,.hide-dynamic-objects .north-mark,.hide-dynamic-objects .zone-label,.hide-dynamic-objects .road-label,.hide-dynamic-objects .event-overlay,.hide-dynamic-objects :deep(.scenario-layer),.hide-dynamic-objects :deep(.stable-map-label){display:none!important}
@media (max-width: 900px) { .road-label,.map-legend { display: none; }.zone-label small { display: none; }.event-overlay { min-width: 190px; } }
</style>
