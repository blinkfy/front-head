<template>
  <view ref="canvasRef" class="park-canvas panel">
    <image class="park-background" src="/static/digital-twin-replay/park-overview-bg-v1.png" mode="aspectFill" />
    <view class="map-shade"></view>

    <view class="north-mark"><view class="north-arrow"></view><text>N</text></view>
    <view class="map-legend">
      <view><i class="legend-shape robot"></i><text>机器人</text></view>
      <view><i class="legend-shape bin"></i><text>智能桶</text></view>
      <view><i class="legend-shape waste"></i><text>垃圾物体</text></view>
    </view>

    <view class="zone-label entrance"><text>公园入口</text><small>zone_entrance_01</small></view>
    <view class="zone-label food"><text>餐饮/休息区</text><small>zone_food_rest_01</small></view>
    <view class="zone-label standby"><text>备用区</text><small>standby_area</small></view>
    <view class="road-label">设备返航道路</view>

    <view class="facility-anchor center-facility">
      <MapEntitySprite kind="center" :active="centerPhase !== '—'" />
      <StableMapLabel label-id="center_ops_01:identity" text="运维与收运中心" detail="center_ops_01" :priority="72" placement="above" tone="cyan" />
    </view>
    <view v-for="station in centerStations" :key="station.id" :class="['facility-anchor', 'station-facility', station.key]">
      <MapEntitySprite kind="station" :variant="station.key" :active="centerPhase === station.phase" />
      <StableMapLabel :label-id="`${station.id}:status`" :text="station.label" :detail="station.id" :priority="centerPhase === station.phase ? 88 : 66" placement="below" :tone="centerPhase === station.phase ? 'cyan' : 'neutral'" :current="centerPhase === station.phase" />
    </view>

    <!-- #ifdef H5 -->
    <svg :class="['route-layer', { paused: !playing }]" viewBox="0 0 1000 650" preserveAspectRatio="none">
      <defs>
        <marker id="return-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#ff9a47" /></marker>
        <marker id="replace-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#24d9ff" /></marker>
      </defs>
      <path :style="routeAnimationStyle" :class="['route-path', 'return', { visible: showDispatchRoutes, complete: arrivedAtCenter }]" d="M740 340 C800 245 735 120 260 112" marker-end="url(#return-arrow)" />
      <path :style="routeAnimationStyle" :class="['route-path', 'replacement', { visible: showDispatchRoutes, complete: standbyTookOver }]" d="M205 208 C340 270 510 300 740 340" marker-end="url(#replace-arrow)" />
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
      @select="$emit('select', $event)"
    />

    <view class="service-link food-link"></view>
    <view class="service-link rest-link"></view>

    <view
      v-for="object in sceneObjects"
      :key="object.id"
      :class="['scene-object', object.kind, { selected: object.id === selectedId, affected: affectedIds.includes(object.id), faded: object.faded, moving: object.moving }]"
      :style="object.style"
      @tap.stop="$emit('select', object.id)"
    >
      <MapEntitySprite v-if="object.kind === 'robot' || object.kind === 'bin'" :kind="object.kind" :variant="object.variant || 'active'" :selected="object.id === selectedId" :affected="priorityEventIds.has(object.id)" />
      <view v-else-if="object.kind === 'visitor'" class="visitor-symbol"><i></i><b></b></view>
      <view v-else-if="object.kind === 'service'" class="service-symbol"></view>
      <view v-else-if="object.kind === 'waste'" :class="['waste-symbol', object.category]">{{ object.short }}</view>
      <StableMapLabel :label-id="`${object.id}:identity`" :text="labels[object.id] || object.id" :detail="object.id" :priority="labelPriority(object, 'identity')" placement="below" :selected="object.id === selectedId" :current="priorityEventIds.has(object.id)" />
      <StableMapLabel v-if="object.badge" :label-id="`${object.id}:status`" :text="object.badge" :priority="labelPriority(object, 'status')" placement="right" :tone="object.badgeTone || 'neutral'" :selected="object.id === selectedId" :current="priorityEventIds.has(object.id)" />
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
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParkScenarioOverlay from './ParkScenarioOverlay.vue'
import MapEntitySprite from './MapEntitySprite.vue'
import StableMapLabel from './StableMapLabel.vue'
import { centerPhaseFromEvent, eventEntityIds, eventPresentation, primaryEventEntityIds } from '@/utils/park-replay.js'
import { layoutStableMapLabels } from '@/utils/stable-map-label-layout.js'
import { displaySourceLabel } from '@/utils/source-display.js'

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
  robotVisual: { type: Object, default: () => ({}) }
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
const recovered = computed(() => hasEvent('DEVICE_RECOVERED'))
const blockedRouteVehicleActive = computed(() => props.scenario === 'blocked' && ['STARTED', 'BLOCKED', 'REPLANNED', 'RESUMED'].includes(props.scenarioState?.route?.status))
const showDispatchRoutes = computed(() => props.scenario !== 'blocked' && dispatchStarted.value)
const dispatchProgress = ref(0)
const canvasRef = ref(null)
const routeAnimationStyle = computed(() => ({ animationDuration: `${1.2 / Math.max(.25, Number(props.playbackRate) || 1)}s` }))
let dispatchRafId = 0
let dispatchLastTimestamp = 0
let labelRafId = 0
let labelSettleTimer = 0
let labelResizeObserver = null

const centerStations = Object.freeze([
  { id: 'center_station_unload_01', key: 'unload', phase: 'UNLOADING', label: '卸料工位' },
  { id: 'center_station_clean_01', key: 'wash', phase: 'CLEANING', label: '清洗工位' },
  { id: 'center_station_charge_01', key: 'charge', phase: 'CHARGING', label: '充电工位' }
])

function pos(left, top) { return { left: `${left}%`, top: `${top}%` } }

function cubicPoint(start, controlA, controlB, end, amount) {
  const t = Math.max(0, Math.min(1, amount)); const inverse = 1 - t
  return {
    x: inverse ** 3 * start.x + 3 * inverse ** 2 * t * controlA.x + 3 * inverse * t ** 2 * controlB.x + t ** 3 * end.x,
    y: inverse ** 3 * start.y + 3 * inverse ** 2 * t * controlA.y + 3 * inverse * t ** 2 * controlB.y + t ** 3 * end.y
  }
}

function routePos(route, amount) {
  const point = route === 'return'
    ? cubicPoint({ x: 74, y: 52 }, { x: 80, y: 38 }, { x: 73.5, y: 18.5 }, { x: 24, y: 14 }, amount)
    : cubicPoint({ x: 20, y: 31 }, { x: 34, y: 41.5 }, { x: 51, y: 46 }, { x: 74, y: 52 }, amount)
  return pos(point.x, point.y)
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
  if (type === 'LITTER_CREATED') return pos(49, 70)
  if (type === 'TASK_CREATED' && props.currentEvent?.payload?.taskType === 'ROBOT_COLLECT_AND_SORT') return pos(50, 58)
  if (type === 'ROBOT_TASK_REQUESTED') return pos(55, 51)
  if (type === 'ROBOT_TASK_RESULT') return pos(69, 52)
  return pos(51, 64)
})

const fullBinPosition = computed(() => {
  if (!dispatchStarted.value) return pos(74, 52)
  if (props.scenario === 'blocked' && props.currentEvent?.eventType === 'RETURN_AND_REPLACEMENT_DISPATCHED') return pos(74, 52)
  if (props.currentEvent?.eventType === 'RETURN_AND_REPLACEMENT_DISPATCHED') return routePos('return', dispatchProgress.value * .68)
  if (!arrivedAtCenter.value) return routePos('return', .84)
  return routePos('return', 1)
})

const standbyBinPosition = computed(() => {
  if (!dispatchStarted.value) return pos(20, 31)
  if (props.currentEvent?.eventType === 'RETURN_AND_REPLACEMENT_DISPATCHED') return routePos('replacement', dispatchProgress.value * .72)
  if (!standbyTookOver.value) return routePos('replacement', .88)
  return routePos('replacement', 1)
})

const foodBinBadge = computed(() => {
  const type = props.currentEvent?.eventType
  if (type === 'BIN_FILL_UPDATED') return `${Number(props.currentEvent?.payload?.fillPct) || 0}%`
  if (type === 'FULL_RISK_TRIGGERED') return '满载风险'
  if (type === 'RETURN_AND_REPLACEMENT_DISPATCHED' && props.scenario === 'blocked') return '返航任务已下发'
  if (type === 'RETURN_AND_REPLACEMENT_DISPATCHED') return `返航中 ${Math.round(dispatchProgress.value * 68)}%`
  if (dispatchStarted.value && !arrivedAtCenter.value) return '接近中心'
  if (arrivedAtCenter.value && !recovered.value) return centerPhase.value === '—' ? '中心内' : centerPhase.value
  if (recovered.value) return '已恢复'
  return '在线'
})

const sceneObjects = computed(() => [
  ...(props.scenario !== 'daily' ? [{ id: 'robot_patrol_01', kind: 'robot', variant: 'active', style: robotPosition.value, badge: ['TASK_CREATED', 'ROBOT_TASK_REQUESTED', 'ROBOT_TASK_RESULT', 'TASK_SUCCEEDED'].includes(props.currentEvent?.eventType) ? presentation.value.title : '巡检中', badgeTone: 'cyan' }] : []),
  ...(props.scenario === 'baseline' ? [{ id: 'visitor_01', kind: 'visitor', style: pos(49, 78), badge: props.currentEvent?.eventType === 'LITTER_CREATED' ? '产生垃圾' : '', badgeTone: 'amber' }] : []),
  { id: 'service_food_01', kind: 'service', style: pos(74, 52), badge: dispatchStarted.value && !standbyTookOver.value ? '待补位' : '服务中', badgeTone: dispatchStarted.value && !standbyTookOver.value ? 'amber' : 'green' },
  { id: 'service_rest_01', kind: 'service', style: pos(27, 59), badge: '服务中', badgeTone: 'green' },
  ...(!blockedRouteVehicleActive.value ? [{ id: 'device_smart_bin_food_01', kind: 'bin', variant: dispatchStarted.value ? 'returning' : 'active', style: fullBinPosition.value, badge: foodBinBadge.value, badgeTone: hasEvent('FULL_RISK_TRIGGERED') && !recovered.value ? 'amber' : 'green', moving: props.currentEvent?.eventType === 'RETURN_AND_REPLACEMENT_DISPATCHED' && props.scenario !== 'blocked' }] : []),
  { id: 'device_smart_bin_rest_01', kind: 'bin', variant: 'active', style: pos(27, 59), badge: '30%', badgeTone: 'green' },
  { id: 'device_smart_bin_standby_01', kind: 'bin', variant: standbyTookOver.value ? 'active' : 'standby', style: standbyBinPosition.value, badge: props.currentEvent?.eventType === 'RETURN_AND_REPLACEMENT_DISPATCHED' ? `补位中 ${Math.round(dispatchProgress.value * 72)}%` : dispatchStarted.value && !standbyTookOver.value ? '接近服务点' : standbyTookOver.value ? '已接管' : '备用', badgeTone: dispatchStarted.value ? 'cyan' : 'blue', moving: props.currentEvent?.eventType === 'RETURN_AND_REPLACEMENT_DISPATCHED' },
  ...(props.scenario === 'baseline' ? [
    { id: 'garbage_cardboard_01', kind: 'waste', category: 'recyclable', short: '纸', style: pos(42, 60) },
    { id: 'garbage_banana_01', kind: 'waste', category: 'kitchen', short: '厨', style: pos(47, 55), faded: hasEvent('ROBOT_TASK_RESULT'), badge: props.currentEvent?.eventType === 'LITTER_CREATED' ? '新事件' : '', badgeTone: 'amber' },
    { id: 'garbage_battery_01', kind: 'waste', category: 'hazardous', short: '危', style: pos(55, 59) },
    { id: 'garbage_paper_cup_01', kind: 'waste', category: 'other', short: '其', style: pos(60, 54) }
  ] : [])
])

function labelPriority(object, role) {
  const selected = object.id === props.selectedId
  const current = priorityEventIds.value.has(object.id)
  const base = ({ robot: 74, bin: 72, service: 68, waste: 52, visitor: 28 })[object.kind] || 40
  return (selected ? 100 : current ? 90 : base) - (role === 'status' ? 1 : 0)
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
onMounted(startDispatchAnimation)
onMounted(() => {
  scheduleLabelLayout()
  if (typeof ResizeObserver === 'function') {
    labelResizeObserver = new ResizeObserver(scheduleLabelLayout)
    const root = canvasRef.value?.$el || canvasRef.value
    if (root) labelResizeObserver.observe(root)
  }
})
onBeforeUnmount(() => { pauseDispatchAnimation(); stopLabelLayout() })
</script>

<style scoped>
.park-canvas { position: relative; min-height: 0; overflow: hidden; background: #071726; isolation: isolate; }
.park-background,.map-shade { position: absolute; inset: 0; width: 100%; height: 100%; }
.park-background { object-fit: cover; }.map-shade { z-index: 1; background: linear-gradient(180deg, rgba(1,18,32,.12), rgba(1,15,27,.26)); box-shadow: inset 0 0 60px rgba(0,14,26,.42); }
.north-mark { position: absolute; z-index: 6; right: 14px; top: 12px; display: flex; flex-direction: column; align-items: center; color: #dff7ff; font-size: 10px; text-shadow: 0 1px 4px #00111d; }
.north-arrow { width: 0; height: 0; border-left: 7px solid transparent; border-right: 7px solid transparent; border-bottom: 22px solid #e9f8ff; filter: drop-shadow(0 1px 3px #00111d); }
.map-legend { position: absolute; z-index: 6; left: 12px; top: 12px; padding: 8px 9px; display: grid; gap: 6px; border: 1px solid rgba(118,201,255,.28); border-radius: 9px; color: #b8d8e7; background: rgba(3,25,40,.8); font-size: 10px; backdrop-filter: blur(5px); }
.map-legend view { display: flex; align-items: center; gap: 7px; }.legend-shape { display: inline-block; width: 10px; height: 10px; }.legend-shape.robot { border: 2px solid #8cecff; border-radius: 3px; }.legend-shape.bin { background: #2c8fff; border-radius: 2px; }.legend-shape.waste { background: #ff5d66; border-radius: 50%; }
.zone-label { position: absolute; z-index: 5; padding: 4px 6px; border-radius: 5px; color: #f0fbff; background: rgba(4,26,40,.7); text-shadow: 0 1px 3px #00111d; pointer-events: none; }
.zone-label text,.zone-label small { display: block; }.zone-label text { font-size: 11px; font-weight: 700; }.zone-label small { color: #8eb4c7; font: 8px/1.2 ui-monospace, Consolas, monospace; margin-top: 2px; }
.zone-label.entrance { left: 46%; bottom: 3%; }.zone-label.food { right: 11%; top: 47%; }.zone-label.standby { left: 14%; top: 24%; }
.road-label { position: absolute; z-index: 5; top: 9%; left: 52%; color: #b6cbd4; font-size: 10px; letter-spacing: 1px; text-shadow: 0 1px 3px #00111d; }
.facility-anchor { position:absolute; z-index:6; transform:translate(-50%,-50%); pointer-events:none; }.center-facility{left:24%;top:12%}.station-facility{top:20%}.station-facility.unload{left:19%}.station-facility.wash{left:25%}.station-facility.charge{left:31%}
.route-layer { position: absolute; z-index: 3; inset: 0; width: 100%; height: 100%; pointer-events: none; }.route-layer.paused .route-path { animation-play-state: paused; }.route-path { fill: none; stroke-width: 5; stroke-linecap: round; stroke-dasharray: 10 10; opacity: 0; transition: opacity .2s ease; animation: route-flow 1.2s linear infinite; }.route-path.visible { opacity: .95; }.route-path.complete { opacity: .42; animation: none; }.route-path.return { stroke: #ff9a47; }.route-path.replacement { stroke: #24d9ff; }
@keyframes route-flow { to { stroke-dashoffset: -20; } }
.service-link { position: absolute; z-index: 2; width: 36px; height: 36px; margin: -18px; border: 1px dashed rgba(95,224,255,.65); border-radius: 9px; background: rgba(36,217,255,.08); }.food-link { left: 74%; top: 52%; }.rest-link { left: 27%; top: 59%; }
.scene-object { position: absolute; z-index: 7; transform: translate(-50%,-50%); transition: left .7s ease, top .7s ease, opacity .25s ease; cursor: pointer; }.scene-object.moving { transition: none; }.scene-object::after { content: ''; position: absolute; inset: -7px; border: 1px solid transparent; border-radius: 10px; transition: all .18s ease; }.scene-object:hover::after,.scene-object.selected::after { border-color: #24d9ff; box-shadow: 0 0 16px rgba(36,217,255,.42); }.scene-object.affected::after { animation: affected-pulse 1.2s ease-in-out infinite; border-color: rgba(255,190,80,.75); }.scene-object.faded { opacity: .34; }
@keyframes affected-pulse { 50% { box-shadow: 0 0 22px rgba(255,182,72,.55); } }
.visitor-symbol { width: 19px; height: 31px; position: relative; }.visitor-symbol i { position: absolute; left: 5px; top: 0; width: 9px; height: 9px; border-radius: 50%; background: #ffd0aa; border: 1px solid #071726; }.visitor-symbol b { position: absolute; left: 3px; top: 9px; width: 13px; height: 20px; border-radius: 5px 5px 3px 3px; background: #2c8fff; border: 1px solid #bce8ff; }
.service-symbol { width: 31px; height: 31px; border: 2px dashed #69e4ff; border-radius: 8px; background: rgba(36,217,255,.12); }
.waste-symbol { width: 21px; height: 21px; display: flex; align-items: center; justify-content: center; border: 2px solid #fff; border-radius: 50%; color: #fff; font-size: 8px; font-weight: 800; box-shadow: 0 0 10px rgba(0,0,0,.5); }.waste-symbol.recyclable { background: #2c8fff; }.waste-symbol.kitchen { background: #16a66a; }.waste-symbol.hazardous { background: #e14b55; }.waste-symbol.other { background: #667788; }
.event-overlay { position: absolute; z-index: 10; left: 12px; bottom: 12px; min-width: 230px; padding: 8px 10px; display: grid; grid-template-columns: 9px 1fr auto; align-items: center; gap: 8px; border: 1px solid rgba(116,197,255,.34); border-radius: 9px; background: rgba(2,23,38,.86); backdrop-filter: blur(6px); }.event-pulse { width: 8px; height: 8px; border-radius: 50%; background: #2c8fff; box-shadow: 0 0 10px currentColor; }.event-pulse.cyan { background: #24d9ff; }.event-pulse.green { background: #16c57c; }.event-pulse.amber { background: #f5b648; }.event-pulse.red { background: #ff5d66; }.event-overlay-label,.event-overlay-title { display: block; }.event-overlay-label { color: #789fb4; font-size: 8px; }.event-overlay-title { color: #e9f9ff; font-size: 11px; font-weight: 700; margin-top: 2px; }.source-tag { padding: 2px 5px; border-radius: 4px; color: #8ec8eb; border: 1px solid rgba(100,174,226,.34); background: rgba(22,91,143,.24); font: 700 8px/1.2 ui-monospace, Consolas, monospace; }.source-tag.isaac-realtime { color: #c1a7ff; }.source-tag.backend-api { color: #8af1be; }.source-tag.visual-aid { color: #ffd57c; }
@media (max-width: 900px) { .road-label,.map-legend { display: none; }.zone-label small { display: none; }.event-overlay { min-width: 190px; }.station-facility{top:18%} }
</style>
