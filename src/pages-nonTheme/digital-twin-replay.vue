<template>
  <view :class="['replay-screen', isDark ? 'dark-theme' : 'light-theme', { 'admin-light-theme': !isDark }]">
    <view class="header panel">
      <view class="header-copy">
        <view class="title">{{ pageTitle }}</view>
        <view class="subtitle">{{ pageSubtitle }}</view>
      </view>
      <AdminScreenHeader class="twin-screen-header" screen-key="digitalTwinReplay" :tone="isDark ? 'dark' : 'light'" @back="goBack">
        <view class="twin-header-business">
          <view class="source-legend">
            <text v-for="source in sourceTypes" :key="source" :data-source="source" :class="['source-badge', sourceClass(source)]">{{ displaySourceLabel(source) }}</text>
          </view>
          <view class="source-summary">数据源 {{ sourceTypes.length }} 类</view>
          <picker mode="selector" :range="pageModeOptions" range-key="label" :value="pageModeIndex" @change="onPageModeChange">
            <view class="mode-select page-mode-select">
              <text>页面模式</text>
              <b>{{ activePageModeLabel }}</b>
            </view>
          </picker>
          <picker v-if="pageMode === 'replay'" mode="selector" :range="scenarioOptions" range-key="label" :value="scenarioIndex" @change="onScenarioChange">
            <view class="mode-select scenario-select">
              <text>回放场景</text>
              <b>{{ activeScenarioLabel }}</b>
            </view>
          </picker>
          <picker v-if="pageMode === 'replay'" mode="selector" :range="modeOptions" range-key="label" :value="modeIndex" @change="onModeChange">
            <view class="mode-select">
              <text>数据文件</text>
              <b>{{ activeModeLabel }}</b>
            </view>
          </picker>
          <view class="filename" :title="filename">{{ pageMode === 'live' ? liveConnectionLabel : displayFilename }}</view>
          <view class="header-button primary" @tap="refreshPage">刷新</view>
        </view>
      </AdminScreenHeader>
    </view>

    <view v-if="loading" class="loading panel">
      <view class="loading-ring"></view><text>{{ pageMode === 'live' ? '正在连接实时仿真…' : '正在读取原始回放 JSON…' }}</text>
    </view>
    <view v-else-if="errorText" class="error panel">
      <view class="error-title">{{ pageMode === 'live' ? '实时仿真不可用' : '回放数据不可用' }}</view>
      <view class="error-message">{{ errorText }}</view>
      <view class="header-button primary" @tap="refreshPage">重新连接</view>
    </view>

    <view v-else class="workspace">
      <view class="left-column">
        <ReplayTimeline class="timeline" :events="events" :current-index="currentIndex" :live-window="pageMode === 'live'" @select="seek" />
        <view class="current-event panel">
          <view class="section-heading"><text>当前事件</text><text>{{ currentEvent?.sequence || '—' }}</text></view>
          <view class="current-title">{{ currentPresentation.title }}</view>
          <view class="current-desc">{{ currentPresentation.desc }}</view>
          <view class="event-meta"><text>类型</text><b>{{ currentEvent?.eventType || '—' }}</b></view>
          <view class="event-meta"><text>来源</text><b :data-source="currentEvent?.source" :class="sourceClass(currentEvent?.source)">{{ displaySourceLabel(currentEvent?.source, '—') }}</b></view>
          <view class="event-meta"><text>影响对象</text><b>{{ affectedIds.length ? affectedIds.join('、') : '无显式对象 ID' }}</b></view>
        </view>
      </view>

      <view class="center-column">
        <view class="park-stage">
          <ParkReplayCanvas
            class="park-map"
            :current-event="currentEvent"
            :labels="labels"
            :selected-id="selectedId"
            :playing="playing"
            :playback-rate="speed"
            :visual-reset-key="visualRevision"
            :scenario="pageMode === 'live' ? 'daily' : activeScenario"
            :scenario-state="scenarioVisualState"
            :event-history="eventHistory"
            :robot-visual="robotVisualState"
            :runtime-state="finalState"
            @select="selectEntity"
          />
          <RobotTaskReplayOverlay
            v-if="robotTaskWindowActive"
            :active="robotTaskWindowActive"
            :running="playing"
            :playback-rate="speed"
            :request="robotTaskRequest"
            :event-source="robotTaskFocusEvent?.source"
            :garbage-label="robotTaskGarbageLabel"
            :target-bin-label="robotTaskTargetBinLabel"
            :fill-target-pct="pendingBinFillEvent?.payload?.fillPct || 0"
            :fill-event-sequence="pendingBinFillEvent?.sequence || 0"
            :reset-key="robotTaskResetKey"
            @play="play"
            @pause="pause"
            @complete="handleRobotTaskVisualComplete"
            @error="handleRobotTaskVisualError"
            @visual-state="handleRobotVisualState"
          />
          <CenterWorkflowOverlay
            v-if="centerWindowActive"
            :current-event="centerFocusEvent"
            :event-history="centerFocusHistory"
            :running="playing"
            :playback-rate="speed"
            :reset-key="visualRevision"
            :recovery-payload="recoveryEvent?.payload || {}"
            :initial-fill-pct="centerInitialFillPct"
            :stage-override="centerVisualStageOverride"
            :assigned-bay-id="centerFocusEvent?.payload?.assignedBayId || selectedCenterBayId"
            @play="play"
            @pause="pause"
            @replay="replayCenterVisual"
            @seek-stage="seekCenterStage"
          />
        </view>
        <ReplayControls
          :current-index="currentIndex"
          :total="events.length"
          :playing="playing"
          :speed="speed"
          @play="play"
          @pause="pause"
          @reset="reset"
          @previous="previous"
          @next="next"
          @speed="setSpeed"
          @seek="seek"
        />
      </view>

      <view :class="['right-column', { live: pageMode === 'live' }]">
        <LiveSimulationControls
          v-if="pageMode === 'live'"
          :connected="liveConnected"
          :running="liveRunning"
          :status="liveStatus"
          :speed="speed"
          :time-of-day="liveAutomation.timeOfDay"
          :flow-phase-label="liveAutomation.flowPhaseLabel"
          :random-seed="liveAutomation.randomSeed"
          :auto-run-enabled="liveAutomation.autoRunEnabled"
          :auto-robot-task-enabled="liveAutomation.autoRobotTaskEnabled"
          :auto-dispatch-enabled="liveAutomation.autoDispatchEnabled"
          :auto-incident-enabled="liveAutomation.autoIncidentEnabled"
          :incident-profile="liveAutomation.incidentProfile"
          :incident-state="finalState.incidents || {}"
          :runtime-state="finalState"
          :message="liveMessage"
          @command="handleLiveCommand"
          @export-snapshot="downloadLiveSnapshot"
          @restore-snapshot="chooseLiveSnapshot"
        />
        <EntityInspector
          :class="['entity-inspector', { 'is-empty': !selectedId }]"
          :selected-id="selectedId"
          :id-map="idMap"
          :labels="labels"
          :current-event="currentEvent"
          :final-state="finalState"
          @select="selectEntity"
        />
        <DecisionExplanationPanel
          class="decision-explanation"
          :current-event="currentEvent"
          :labels="labels"
        />
        <ScenarioAnalyticsPanel
          v-if="activeScenario !== 'baseline' || riskExplanationAvailable"
          :scenario="activeScenario"
          :state="scenarioVisualState"
          :current-event="currentEvent"
        />
        <view class="state-panel panel">
          <view class="section-heading"><text>任务状态</text><text>{{ currentTaskIdValue || '—' }}</text></view>
          <view class="state-row"><text>当前事件状态</text><b :class="taskStatusTone">{{ currentTaskEventStatus }}</b></view>
          <view class="state-row"><text>回放结果</text><b>{{ currentTaskFinalStatus }}</b></view>
          <view class="state-row"><text>处理阶段</text><b>{{ centerPhase }}</b></view>
          <view class="state-row"><text>中心</text><b>center_ops_01</b></view>
        </view>
        <view class="visual-aid-note panel">
          <text>局部流程视觉窗口</text>
          <small>局部流程仅解释执行阶段；业务状态始终读取{{ pageMode === 'live' ? '实时事件' : '回放事件' }}。</small>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import AdminScreenHeader from '@/components/AdminScreenHeader.vue'
import EntityInspector from '@/components/digital-twin/EntityInspector.vue'
import DecisionExplanationPanel from '@/components/digital-twin/DecisionExplanationPanel.vue'
import CenterWorkflowOverlay from '@/components/digital-twin/CenterWorkflowOverlay.vue'
import LiveSimulationControls from '@/components/digital-twin/LiveSimulationControls.vue'
import ParkReplayCanvas from '@/components/digital-twin/ParkReplayCanvas.vue'
import ReplayControls from '@/components/digital-twin/ReplayControls.vue'
import ReplayTimeline from '@/components/digital-twin/ReplayTimeline.vue'
import RobotTaskReplayOverlay from '@/components/digital-twin/RobotTaskReplayOverlay.vue'
import ScenarioAnalyticsPanel from '@/components/digital-twin/ScenarioAnalyticsPanel.vue'
import { fetchParkReplay } from '@/api/digital-twin-replay.js'
import {
  connectParkSimulationStream,
  exportParkSimulationSnapshot,
  fetchParkSimulationState,
  restoreParkSimulationSnapshot,
  submitParkSimulationCommand
} from '@/api/digital-twin-simulation.js'
import { ensureAdminScreenAccess, goBackFromAdminPage } from '@/utils/admin-page-nav.js'
import { redirectIfAccessDenied } from '@/utils/access-guard.js'
import { applyStoredTheme, bindThemeStorageSync } from '@/utils/theme.js'
import '@/styles/admin-light-theme.css'
import {
  centerPhaseFromEvent,
  currentTaskId,
  DATA_SOURCE_LABELS,
  eventEntityIds,
  eventPresentation,
  normalizeReplayBundle
} from '@/utils/park-replay.js'
import { blockedReturnLeftRoadRoute, deriveScenarioVisualState, normalizeMapPoint, withVisualGarbageTaskRequest } from '@/utils/park-scenario-visuals.js'
import { displaySourceLabel } from '@/utils/source-display.js'
import { displayTwinStatus } from '@/utils/digital-twin-status.js'
import { CENTER_WORKFLOW_TIMINGS } from '@/config/center-workflow.js'
import { DIGITAL_TWIN_VISUAL_SYSTEM } from '@/config/digital-twin-visual-system.js'
import { robotTaskHandoffStartPositionPct } from '@/config/robot-task-shot-config.js'
import { PARK_ROAD_NETWORK, parkRoutePolyline, sampleParkRoadEdge } from '@/utils/park-road-network.js'

const isDark = ref(applyStoredTheme() === 'dark')
function syncThemeMode() {
  isDark.value = applyStoredTheme() === 'dark'
}
let unbindThemeWatcher = null
let storageHandler = null

const pageModeOptions = [
  { label: '回放模式', value: 'replay' },
  { label: '实时仿真模式', value: 'live' }
]
const modeOptions = [
  { label: '回放数据', value: 'sim' },
  { label: '实时结果', value: 'isaac' }
]
const scenarioOptions = [
  { label: '正常闭环', value: 'baseline' },
  { label: '公园日常', value: 'daily' },
  { label: '高峰预测', value: 'peak' },
  { label: '道路受阻', value: 'blocked' }
]
const sourceTypes = Object.keys(DATA_SOURCE_LABELS)
const LIVE_EVENT_WINDOW = 300
const LIVE_EVENT_FLUSH_BASE_MS = 600
const ROBOT_ROAD_ROUTE_IDS = Object.freeze(['robot_left_litter_to_bin', 'robot_right_litter_to_bin'])
const MAX_LEGACY_ROBOT_ROUTE_DEVIATION = 2.8
const LOCAL_TASK_SCAN_ROBOT_OFFSET_PCT = Object.freeze({
  x: 82 / 1672 * 100,
  y: 30 / 941 * 100
})
const ROBOT_ROAD_POINTS = Object.freeze(PARK_ROAD_NETWORK.edges
  .filter(edge => Array.isArray(edge.allowedEntities) && edge.allowedEntities.includes('robot'))
  .flatMap(edge => sampleParkRoadEdge(edge)))
const pageMode = ref('replay')
const activeMode = ref('sim')
const activeScenario = ref('baseline')
const bundle = ref(null)
const currentIndex = ref(0)
const selectedId = ref('robot_patrol_01')
const playing = ref(false)
const speed = ref(1)
const loading = ref(true)
const errorText = ref('')
const liveConnected = ref(false)
const liveRunning = ref(false)
const liveStatus = ref('READY')
const liveMessage = ref('')
const liveAutomation = ref({
  timeOfDay: '08:00', flowPhaseLabel: '早间低峰', randomSeed: 20260713,
  autoRunEnabled: false, autoRobotTaskEnabled: true, autoDispatchEnabled: true
})
const liveSessionRevision = ref(0)
const liveLastSequence = ref(0)
const liveLastClock = ref(0)
const robotVisualFailed = ref(false)
const visualRevision = ref(0)
const robotVisualState = ref({ stage: '', mode: 'map', progress: 0, carrying: false, completed: false })
const liveRobotVisualQueue = ref([])
const liveRobotFocusEvent = ref(null)
const centerVisualStageOverride = ref(null)
const selectedCenterBayId = ref('bay_01')
let playbackTimer = 0
let liveEventFlushTimer = 0
let pendingLiveEvents = []
let replayLoadRevision = 0
let closeLiveStream = null
let robotHandoffRafId = 0
let robotHandoffLastTimestamp = 0

const events = computed(() => bundle.value?.replay?.events || [])
const currentEvent = computed(() => events.value[currentIndex.value] || null)
const riskExplanationAvailable = computed(() => {
  const value = currentEvent.value?.payload?.decisionTrace
  const trace = Array.isArray(value) ? value[0] : value
  return ['FILL_RISK_ASSESSMENT', 'RETURN_TASK_PRIORITY'].includes(trace?.decisionType)
})
const eventHistory = computed(() => events.value.slice(0, currentIndex.value + 1))
let scenarioVisualCacheKey = ''
let scenarioVisualCacheValue = null
const scenarioVisualState = computed(() => {
  const key = `${pageMode.value}:${activeMode.value}:${activeScenario.value}:${currentEvent.value?.sequence || 0}:${visualRevision.value}`
  if (key === scenarioVisualCacheKey && scenarioVisualCacheValue) return scenarioVisualCacheValue
  scenarioVisualCacheKey = key
  scenarioVisualCacheValue = deriveScenarioVisualState(events.value, currentIndex.value)
  return scenarioVisualCacheValue
})
const currentPresentation = computed(() => eventPresentation(currentEvent.value))
const labels = computed(() => bundle.value?.labels || {})
const idMap = computed(() => bundle.value?.idMap || { entries: {} })
const finalState = computed(() => pageMode.value === 'live'
  ? (bundle.value?.replay?.finalState || currentEvent.value?.currentState || {})
  : (bundle.value?.replay?.finalState || {}))
const filename = computed(() => bundle.value?.filename || '')
const displayFilename = computed(() => filename.value
  ? filename.value.replace(/\.sim(?=\.json$)/i, '.replay')
  : '等待加载')
const affectedIds = computed(() => eventEntityIds(currentEvent.value))
const currentTaskIdValue = computed(() => currentTaskId(currentEvent.value))
const centerPhase = computed(() => displayCenterPhase(centerPhaseFromEvent(currentEvent.value)))
const activeModeLabel = computed(() => modeOptions.find(item => item.value === activeMode.value)?.label || '回放数据')
const activePageModeLabel = computed(() => pageModeOptions.find(item => item.value === pageMode.value)?.label || '回放模式')
const pageModeIndex = computed(() => Math.max(0, pageModeOptions.findIndex(item => item.value === pageMode.value)))
const pageTitle = computed(() => pageMode.value === 'live' ? '公园垃圾分类数字孪生实时仿真' : '公园垃圾分类数字孪生回放')
const pageSubtitle = computed(() => pageMode.value === 'live'
  ? '场景指令由后端编排，地图与流程窗口持续消费实时事件'
  : '基于现有事件协议检查“感知—决策—执行—反馈”闭环，不生成额外业务状态')
const liveConnectionLabel = computed(() => liveConnected.value ? `事件流 · ${displayLiveStatus(liveStatus.value)}` : '事件流连接中')
const activeScenarioLabel = computed(() => scenarioOptions.find(item => item.value === activeScenario.value)?.label || '正常闭环')
const scenarioIndex = computed(() => Math.max(0, scenarioOptions.findIndex(item => item.value === activeScenario.value)))
const modeIndex = computed(() => Math.max(0, modeOptions.findIndex(item => item.value === activeMode.value)))
const robotTaskFocusEvent = computed(() => pageMode.value === 'live'
  ? liveRobotFocusEvent.value
  : (currentEvent.value?.eventType === 'ROBOT_TASK_REQUESTED' ? currentEvent.value : null))
const robotTaskWindowActive = computed(() => Boolean(robotTaskFocusEvent.value))
const centerEventTypes = new Set(['DEVICE_ARRIVED_AT_CENTER', 'CENTER_BAY_ASSIGNED', 'CENTER_UNLOADING', 'CENTER_CLEANING', 'CENTER_CHARGING', 'CENTER_CHECKING', 'DEVICE_RECOVERED'])
const centerStartIndex = computed(() => events.value.findIndex(event => event.eventType === 'DEVICE_ARRIVED_AT_CENTER'))
const centerFocusHistory = computed(() => {
  if (pageMode.value !== 'live') return eventHistory.value
  const scoped = events.value.slice(0, currentIndex.value + 1).filter(event =>
    centerEventTypes.has(event.eventType) && event.payload?.assignedBayId === selectedCenterBayId.value)
  return scoped
})
const centerFocusEvent = computed(() => {
  if (pageMode.value !== 'live') return currentEvent.value
  return centerFocusHistory.value[centerFocusHistory.value.length - 1] || null
})
const centerWindowActive = computed(() => {
  if (pageMode.value === 'live') return Boolean(centerFocusEvent.value)
  const endIndex = events.value.findIndex(event => event.eventType === 'DEVICE_RECOVERED')
  return centerStartIndex.value >= 0 && endIndex >= centerStartIndex.value && currentIndex.value >= centerStartIndex.value && currentIndex.value <= endIndex
})
const recoveryEvent = computed(() => {
  const deviceId = centerFocusEvent.value?.payload?.deviceId
  return events.value.find(event => event.eventType === 'DEVICE_RECOVERED' && (!deviceId || event.payload?.deviceId === deviceId)) || null
})
const centerInitialFillPct = computed(() => {
  const end = centerStartIndex.value < 0 ? events.value.length : centerStartIndex.value
  const fillEvent = events.value.slice(0, end).reverse().find(event => event.eventType === 'BIN_FILL_UPDATED')
  return Number(fillEvent?.payload?.fillPct) || 0
})
const robotTaskRequest = computed(() => withVisualGarbageTaskRequest(robotTaskFocusEvent.value?.payload?.request || {}))
const robotTaskResetKey = computed(() => `${pageMode.value}:${activeMode.value}:${activeScenario.value}:${filename.value}:${robotTaskFocusEvent.value?.sequence || 0}:${visualRevision.value}`)
const robotTaskEventIndex = computed(() => events.value.findIndex(event => Number(event.sequence) === Number(robotTaskFocusEvent.value?.sequence)))
const pendingBinFillEvent = computed(() => events.value
  .slice(Math.max(0, robotTaskEventIndex.value + 1))
  .find(event => event.eventType === 'BIN_FILL_UPDATED') || null)
const garbageLabels = Object.freeze({
  banana: '香蕉皮 / 厨余垃圾', banana_peel: '香蕉皮 / 厨余垃圾', 'low-poly_banana': '香蕉皮 / 厨余垃圾',
  cardboard_box: '纸箱 / 可回收物', paper: '纸箱 / 可回收物',
  battery: '废电池 / 有害垃圾', battery_low_poly: '废电池 / 有害垃圾',
  papercup: '纸杯 / 其他垃圾', paper_cup: '纸杯 / 其他垃圾', 'simple-paper-cup': '纸杯 / 其他垃圾'
})
const binLabels = Object.freeze({
  bin_kitchen_green: '绿色厨余垃圾桶', bin_recyclable_blue: '蓝色可回收物桶',
  bin_hazardous_red: '红色有害垃圾桶', bin_other_gray: '灰色其他垃圾桶'
})
const robotTaskGarbageLabel = computed(() => garbageLabels[robotTaskRequest.value?.expectedClassName] || robotTaskRequest.value?.expectedClassName || robotTaskRequest.value?.garbageId || '未登记')
const robotTaskTargetBinLabel = computed(() => binLabels[robotTaskRequest.value?.targetBinId] || robotTaskRequest.value?.targetBinId || '未登记')

function displayTaskStatus(value, fallback = '—') {
  return displayTwinStatus(value, fallback)
}
function displayLiveStatus(value) {
  return displayTwinStatus(value, '连接中')
}
function displayCenterPhase(value) {
  return displayTwinStatus(value)
}
const currentTaskEventStatusCode = computed(() => {
  if (currentEvent.value?.eventType === 'TASK_CREATED') return 'PENDING'
  if (currentEvent.value?.eventType === 'TASK_SUCCEEDED') return 'SUCCEEDED'
  if (currentEvent.value?.eventType === 'ROBOT_TASK_REQUESTED') return 'REQUESTED'
  if (currentEvent.value?.eventType === 'ROBOT_TASK_RESULT') return currentEvent.value?.payload?.result?.placement?.status || 'RESULT_RECEIVED'
  if (currentEvent.value?.eventType === 'RETURN_AND_REPLACEMENT_DISPATCHED') return 'DISPATCHED'
  return '当前事件无任务状态更新'
})
const currentTaskEventStatus = computed(() => displayTaskStatus(currentTaskEventStatusCode.value, '当前事件无任务状态更新'))
const taskStatusTone = computed(() => /SUCCEEDED/i.test(currentTaskEventStatusCode.value) ? 'success' : /PENDING|REQUESTED/i.test(currentTaskEventStatusCode.value) ? 'warning' : '')
const currentTaskFinalStatus = computed(() => displayTaskStatus(finalState.value?.tasks?.[currentTaskIdValue.value]?.status))

const sourceClass = value => String(value || '').toLowerCase().replace(/_/g, '-')

function clearPlaybackTimer() {
  if (playbackTimer) clearTimeout(playbackTimer)
  playbackTimer = 0
}

function clearRobotHandoffAnimation() {
  if (robotHandoffRafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(robotHandoffRafId)
  robotHandoffRafId = 0
  robotHandoffLastTimestamp = 0
}

function robotHandoffRouteId(request = {}) {
  return request?.servicePointId === 'service_rest_01'
    ? 'robot_left_litter_to_bin'
    : 'robot_right_litter_to_bin'
}

function visualRouteLength(routeId) {
  const points = parkRoutePolyline(routeId)
  return points.slice(1).reduce((total, point, index) => total + Math.hypot(
    Number(point.x) - Number(points[index].x),
    Number(point.y) - Number(points[index].y)
  ), 0)
}

function visualPointRouteLength(points = []) {
  return points.slice(1).reduce((total, point, index) => total + Math.hypot(
    Number(point?.x) - Number(points[index]?.x),
    Number(point?.y) - Number(points[index]?.y)
  ), 0)
}

const BLOCKED_RETURN_STOP_POINT = Object.freeze({ x: 48.8, y: 46.6 })
const BLOCKED_DISPATCH_KICKOFF_PROGRESS = 0.46

function routeStaysOnRobotRoad(points) {
  if (!Array.isArray(points) || points.length < 2) return false
  return points.every(rawPoint => {
    const point = normalizeMapPoint(rawPoint)
    return ROBOT_ROAD_POINTS.some(roadPoint => Math.hypot(roadPoint.x - point.x, roadPoint.y - point.y) <= MAX_LEGACY_ROBOT_ROUTE_DEVIATION)
  })
}

function nearestRouteIndex(route, point) {
  const target = normalizeMapPoint(point)
  return route.reduce((best, candidate, index) => {
    const distance = Math.hypot(candidate.x - target.x, candidate.y - target.y)
    return distance < best.distance ? { index, distance } : best
  }, { index: 0, distance: Infinity })
}

function canonicalRobotRoadRoute(target, fallbackStart = null) {
  const targetPoint = normalizeMapPoint(target)
  const startPoint = normalizeMapPoint(fallbackStart || targetPoint)
  const selected = ROBOT_ROAD_ROUTE_IDS
    .map(routeId => parkRoutePolyline(routeId).map(point => normalizeMapPoint(point)))
    .filter(route => route.length)
    .map(route => ({ route, start: nearestRouteIndex(route, startPoint), target: nearestRouteIndex(route, targetPoint) }))
    .sort((left, right) => (left.start.distance + left.target.distance) - (right.start.distance + right.target.distance))[0]
  if (!selected) return [startPoint, targetPoint]
  const fromIndex = selected.start.index
  const toIndex = selected.target.index
  return fromIndex <= toIndex
    ? selected.route.slice(fromIndex, toIndex + 1)
    : selected.route.slice(toIndex, fromIndex + 1).reverse()
}

function resolveRobotApproachRoute(points, target, fallbackStart = null) {
  if (routeStaysOnRobotRoad(points)) return points.map(point => normalizeMapPoint(point))
  return canonicalRobotRoadRoute(target, fallbackStart)
}

function taskApproachVisualEndpoint(target, targetBin) {
  if (activeScenario.value !== 'daily' || Number(targetBin?.x) < 55) return null
  const point = normalizeMapPoint(target)
  return {
    ...point,
    x: Math.max(0, Math.min(100, point.x + LOCAL_TASK_SCAN_ROBOT_OFFSET_PCT.x)),
    y: Math.max(0, Math.min(100, point.y + LOCAL_TASK_SCAN_ROBOT_OFFSET_PCT.y))
  }
}

function appendTaskApproachEndpoint(route, target, targetBin) {
  const endpoint = taskApproachVisualEndpoint(target, targetBin)
  const last = route?.at?.(-1)
  if (!endpoint || !last) return route
  if (Math.hypot(last.x - endpoint.x, last.y - endpoint.y) <= .3) return route
  return [...route, endpoint]
}

function taskCreatedApproachRoute(event = currentEvent.value) {
  const payload = withVisualGarbageTaskRequest(event?.payload || {})
  const source = payload.robotRoute || {}
  const patrol = normalizeMapPoint(source.patrolPositionPct || source.fromPositionPct || payload.patrolPositionPct || 'zone_walkway_01')
  const garbage = normalizeMapPoint(payload.garbagePositionPct || source.toGarbagePositionPct || source.garbagePositionPct || 'zone_food_rest_01')
  const targetBin = normalizeMapPoint(payload.targetBinPositionPct || source.toBinPositionPct || source.binPositionPct || payload.servicePointId || 'service_food_01')
  const route = Array.isArray(source.approachWaypointsPct)
    ? source.approachWaypointsPct.map(point => normalizeMapPoint(point))
    : []
  return appendTaskApproachEndpoint(resolveRobotApproachRoute(route.length ? route : [patrol, garbage], garbage, patrol), garbage, targetBin)
}

function taskCreatedPlaybackDuration(event = currentEvent.value) {
  const motion = DIGITAL_TWIN_VISUAL_SYSTEM.mapEntity.motion
  const speedLimit = Math.max(.1, Number(motion.maxRobotTravelPctPerSecond) || .1)
  const travel = Math.max(Number(motion.minRobotTravelMs) || 0, Math.ceil(visualPointRouteLength(taskCreatedApproachRoute(event)) / speedLimit * 1000))
  const arrivalHold = Math.max(0, Number(motion.arrivalHold) || 0)
  return travel + Math.max(180, Math.ceil(travel * arrivalHold))
}

function robotHandoffDuration(routeId, startPositionPct = null) {
  const motion = DIGITAL_TWIN_VISUAL_SYSTEM.mapEntity.motion
  const speedLimit = Math.max(.1, Number(motion.maxRobotTravelPctPerSecond) || .1)
  const routeEnd = parkRoutePolyline(routeId).at(-1)
  const start = Array.isArray(startPositionPct) ? normalizeMapPoint(startPositionPct) : null
  const connectorLength = start && routeEnd
    ? Math.hypot(Number(start.x) - Number(routeEnd.x), Number(start.y) - Number(routeEnd.y))
    : 0
  return Math.max(Number(motion.minRobotTravelMs) || 0, Math.ceil((visualRouteLength(routeId) + connectorLength) / speedLimit * 1000))
}

function binRouteTravelDuration(routeId) {
  const motion = DIGITAL_TWIN_VISUAL_SYSTEM.mapEntity.motion
  const speedLimit = Math.max(.1, Number(motion.maxBinTravelPctPerSecond) || .1)
  return Math.max(Number(motion.minBinTravelMs) || 0, Math.ceil(visualRouteLength(routeId) / speedLimit * 1000))
}

function binPointRouteTravelDuration(points = []) {
  const motion = DIGITAL_TWIN_VISUAL_SYSTEM.mapEntity.motion
  const speedLimit = Math.max(.1, Number(motion.maxBinTravelPctPerSecond) || .1)
  return Math.max(Number(motion.minBinTravelMs) || 0, Math.ceil(visualPointRouteLength(points) / speedLimit * 1000))
}

function routeSegmentUntil(routeId, point) {
  const route = parkRoutePolyline(routeId).map(item => normalizeMapPoint(item))
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
  if (!nearest) {
    const fallback = nearestRouteIndex(route, target)
    return route.slice(0, fallback.index + 1)
  }
  const segment = route.slice(0, nearest.index + 1)
  const endPoint = nearest.distance <= 1 ? target : nearest.point
  const previous = segment[segment.length - 1]
  if (!previous || Math.hypot(previous.x - endPoint.x, previous.y - endPoint.y) > 0.1) segment.push(endPoint)
  return segment
}

function dispatchTravelDuration() {
  const motion = DIGITAL_TWIN_VISUAL_SYSTEM.mapEntity.motion
  return Math.max(
    Number(motion.dispatchTravelMs) || 0,
    binRouteTravelDuration('device_food_to_center_direct'),
    binRouteTravelDuration('device_standby_to_food_shared')
  )
}

function dispatchPlaybackDuration() {
  const travel = dispatchTravelDuration()
  if (activeScenario.value === 'blocked') return Math.ceil(travel * BLOCKED_DISPATCH_KICKOFF_PROGRESS)
  const arrivalHold = Math.max(0, Number(DIGITAL_TWIN_VISUAL_SYSTEM.mapEntity.motion.arrivalHold) || 0)
  // Keep a short, explicit at-center hold so a timer frame can never reveal a
  // center stage before the road animation has reached its endpoint.
  return travel + Math.max(180, Math.ceil(travel * arrivalHold))
}

function blockedReturnRoutePlaybackDuration(type) {
  const route = type === 'RETURN_ROUTE_RESUMED'
    ? blockedReturnLeftRoadRoute()
    : routeSegmentUntil('device_food_to_center_direct', BLOCKED_RETURN_STOP_POINT)
  const travel = binPointRouteTravelDuration(route)
  const arrivalHold = Math.max(0, Number(DIGITAL_TWIN_VISUAL_SYSTEM.mapEntity.motion.arrivalHold) || 0)
  return travel + Math.max(180, Math.ceil(travel * arrivalHold))
}

function isBlockedReturnCrowdEvent(event) {
  const payload = event?.payload || {}
  return event?.eventType === 'CROWD_FLOW_UPDATED' && (
    String(payload?.crowdZone?.zoneId || '') === 'return_road_crowd_zone'
    || String(payload?.reason || '') === 'TEMPORARY_CROWD_BLOCKS_RETURN_ROUTE'
    || String(payload?.obstacle?.type || '') === 'TEMPORARY_CROWD'
  )
}

function replayEventDurationMs(event = currentEvent.value) {
  const type = event?.eventType
  if (type === 'TASK_CREATED') return taskCreatedPlaybackDuration(event)
  if (type === 'RETURN_AND_REPLACEMENT_DISPATCHED') return dispatchPlaybackDuration()
  if (activeScenario.value === 'blocked' && ['RETURN_ROUTE_STARTED', 'RETURN_ROUTE_RESUMED'].includes(type)) return blockedReturnRoutePlaybackDuration(type)
  if (activeScenario.value === 'blocked' && isBlockedReturnCrowdEvent(event)) return 320
  const centerVisualDuration = ({
    DEVICE_ARRIVED_AT_CENTER: CENTER_WORKFLOW_TIMINGS.ARRIVE,
    CENTER_BAY_ASSIGNED: CENTER_WORKFLOW_TIMINGS.DOCK,
    CENTER_UNLOADING: CENTER_WORKFLOW_TIMINGS.UNLOAD,
    CENTER_CLEANING: CENTER_WORKFLOW_TIMINGS.CLEAN,
    CENTER_CHARGING: CENTER_WORKFLOW_TIMINGS.CHECK_CHARGE,
    CENTER_CHECKING: CENTER_WORKFLOW_TIMINGS.CHECK,
    DEVICE_RECOVERED: CENTER_WORKFLOW_TIMINGS.STANDBY
  })[type]
  if (centerVisualDuration) return centerVisualDuration
  const inReturnCenterHandoff = eventHistory.value.some(item => item.eventType === 'RETURN_AND_REPLACEMENT_DISPATCHED')
    && !eventHistory.value.some(item => item.eventType === 'CENTER_UNLOADING')
  if (!inReturnCenterHandoff) return 1500
  if (type === 'DEVICE_ARRIVED_AT_CENTER') return 1050
  if (['TASK_SUCCEEDED', 'STANDBY_TOOK_OVER_SERVICE_POINT'].includes(type)) return 420
  return 1500
}

function resumeRobotHandoffAnimation() {
  const handoff = robotVisualState.value
  if (!playing.value || !handoff?.handoff || Number(handoff.progress) >= 1 || robotHandoffRafId || typeof requestAnimationFrame !== 'function') return
  const taskId = handoff.taskId
  const duration = Math.max(1, Number(handoff.durationMs) || robotHandoffDuration(handoff.routeId))
  robotHandoffLastTimestamp = 0
  const tick = timestamp => {
    if (!playing.value || !robotVisualState.value?.handoff || robotVisualState.value?.taskId !== taskId) {
      clearRobotHandoffAnimation()
      return
    }
    if (!robotHandoffLastTimestamp) robotHandoffLastTimestamp = timestamp
    const delta = Math.min(100, timestamp - robotHandoffLastTimestamp)
    robotHandoffLastTimestamp = timestamp
    const progress = Math.min(1, Number(robotVisualState.value.progress || 0) + delta * Math.max(.25, Number(speed.value) || 1) / duration)
    robotVisualState.value = { ...robotVisualState.value, progress }
    if (progress >= 1) {
      clearRobotHandoffAnimation()
      return
    }
    robotHandoffRafId = requestAnimationFrame(tick)
  }
  robotHandoffRafId = requestAnimationFrame(tick)
}

function schedulePlayback({ restart = false } = {}) {
  if (pageMode.value === 'live') return
  if (playbackTimer && !restart) return
  if (restart) clearPlaybackTimer()
  if (!playing.value || !events.value.length) return
  if (robotTaskWindowActive.value && !robotVisualFailed.value) return
  const currentEventDuration = replayEventDurationMs()
  playbackTimer = setTimeout(() => {
    playbackTimer = 0
    if (currentIndex.value >= events.value.length - 1) {
      if (pageMode.value !== 'live') playing.value = false
      return
    }
    currentIndex.value += 1
    schedulePlayback()
  }, Math.round(currentEventDuration / speed.value))
}

function play() {
  if (pageMode.value === 'live') {
    handleLiveCommand({ type: 'START', payload: {} })
    return
  }
  if (!events.value.length) return
  if (currentIndex.value >= events.value.length - 1) {
    if (centerWindowActive.value) {
      playing.value = true
      schedulePlayback()
      return
    }
    currentIndex.value = 0
  }
  playing.value = true
  schedulePlayback()
}
function pause() {
  if (pageMode.value === 'live') {
    handleLiveCommand({ type: 'PAUSE', payload: {} })
    return
  }
  playing.value = false; clearPlaybackTimer()
}
function reset() {
  if (pageMode.value === 'live') {
    handleLiveCommand({ type: 'RESET', payload: {} })
    return
  }
  pause(); clearRobotHandoffAnimation(); robotVisualState.value = { stage: '', mode: 'map', progress: 0, carrying: false, completed: false }
  centerVisualStageOverride.value = null; visualRevision.value += 1; currentIndex.value = 0; selectedId.value = 'robot_patrol_01'
}
function previous() { pause(); seek(currentIndex.value - 1) }
function next() { pause(); seek(currentIndex.value + 1) }
function setSpeed(value) {
  speed.value = Number(value) || 1
  if (pageMode.value === 'live') submitLiveCommand('SET_SPEED', { speed: speed.value })
  if (playing.value) schedulePlayback({ restart: true })
}
function seek(value, { preserveCenterOverride = false } = {}) {
  const max = Math.max(0, events.value.length - 1)
  if (!preserveCenterOverride) centerVisualStageOverride.value = null
  clearRobotHandoffAnimation()
  if (robotVisualState.value?.handoff) robotVisualState.value = { stage: '', mode: 'map', progress: 0, carrying: false, completed: false }
  visualRevision.value += 1
  currentIndex.value = Math.max(0, Math.min(max, Number(value) || 0))
  if (playing.value) schedulePlayback({ restart: true })
}
function latestEventIndex(predicate) {
  for (let index = events.value.length - 1; index >= 0; index -= 1) if (predicate(events.value[index])) return index
  return -1
}
function selectEntity(id) {
  if (!id) return
  selectedId.value = id
  if (pageMode.value !== 'live') return
  let targetIndex = -1
  if (/^robot_patrol_/.test(id)) {
    targetIndex = latestEventIndex(event => event.eventType === 'ROBOT_TASK_REQUESTED' && (event.payload?.selectedEntityId === id || event.payload?.robotId === id || event.payload?.request?.robotId === id))
  } else if (/^bay_/.test(id)) {
    selectedCenterBayId.value = id
    targetIndex = latestEventIndex(event => centerEventTypes.has(event.eventType) && event.payload?.assignedBayId === id)
  }
  if (targetIndex >= 0 && targetIndex !== currentIndex.value) seek(targetIndex)
}

function replayCenterVisual(payload = {}) {
  const focusSequence = centerFocusEvent.value?.sequence
  if (payload.stageKey && Number(payload.sequence) === Number(focusSequence)) {
    centerVisualStageOverride.value = { stageKey: payload.stageKey, sequence: Number(payload.sequence) }
  }
  visualRevision.value += 1
  if (!playing.value) play()
  else schedulePlayback()
}

function seekCenterStage(payload = {}) {
  const targetIndex = events.value.findIndex(event => event.eventType === payload.eventType
    && (pageMode.value !== 'live' || event.payload?.assignedBayId === selectedCenterBayId.value))
  if (targetIndex < 0 || !payload.stageKey) return
  const targetEvent = events.value[targetIndex]
  centerVisualStageOverride.value = { stageKey: payload.stageKey, sequence: Number(targetEvent.sequence) }
  seek(targetIndex, { preserveCenterOverride: true })
}

function handleRobotTaskVisualComplete() {
  // The local return shot only restores the close-up framing. Continue the
  // verified map-road return after that shot, so the overview never jumps from
  // the bin-side pose directly to the patrol point.
  clearRobotHandoffAnimation()
  const routeId = robotHandoffRouteId(robotTaskRequest.value)
  const startPositionPct = robotTaskHandoffStartPositionPct({
    garbagePositionPct: robotTaskRequest.value?.garbagePositionPct,
    targetBinPositionPct: robotTaskRequest.value?.targetBinPositionPct,
    servicePointId: robotTaskRequest.value?.servicePointId,
    robotRoute: robotTaskRequest.value?.robotRoute,
    globalTaskRoutes: robotTaskRequest.value?.globalTaskRoutes
  })
  robotVisualState.value = {
    stage: 'return', mode: 'map', progress: 0, carrying: false, completed: true,
    active: true, handoff: true, taskId: robotTaskRequest.value?.taskId || '',
    robotId: robotTaskRequest.value?.robotId || '', routeId, startPositionPct,
    durationMs: robotHandoffDuration(routeId, startPositionPct)
  }
  resumeRobotHandoffAnimation()
  if (!playing.value || !robotTaskWindowActive.value) return
  if (pageMode.value === 'live') {
    liveRobotFocusEvent.value = null
    activateNextLiveRobotVisual()
    return
  }
  if (currentIndex.value < events.value.length - 1) currentIndex.value += 1
  schedulePlayback()
}

function handleRobotVisualState(payload) {
  // The player emits one final completed state after `complete`. That update
  // is scheduled after the completion handler and would overwrite the map
  // handoff pose, briefly exposing the robot's pre-task position on exit.
  if (robotVisualState.value?.handoff && payload?.completed &&
    payload?.taskId === robotVisualState.value?.taskId) return
  if (!payload?.handoff) clearRobotHandoffAnimation()
  robotVisualState.value = payload || { stage: '', mode: 'map', progress: 0, carrying: false, completed: false }
}

function handleRobotTaskVisualError() {
  robotVisualFailed.value = true
  if (pageMode.value === 'live') {
    liveRobotFocusEvent.value = null
    activateNextLiveRobotVisual()
    return
  }
  if (playing.value) schedulePlayback()
}

async function loadReplay(mode = 'sim', scene = activeScenario.value) {
  const loadRevision = ++replayLoadRevision
  pause()
  loading.value = true
  errorText.value = ''
  try {
    const requestedScene = mode === 'isaac' ? 'baseline' : scene
    const next = normalizeReplayBundle(await fetchParkReplay(mode, requestedScene))
    if (loadRevision !== replayLoadRevision) return
    bundle.value = next
    activeMode.value = next.mode || mode
    activeScenario.value = next.scene || next.scenario || requestedScene
    currentIndex.value = 0
    selectedId.value = 'robot_patrol_01'
    centerVisualStageOverride.value = null
    visualRevision.value += 1
  } catch (error) {
    if (loadRevision !== replayLoadRevision) return
    if (redirectForAccessDenied(error)) return
    errorText.value = error?.message || String(error)
  } finally {
    if (loadRevision === replayLoadRevision) loading.value = false
  }
}

function applyLiveSnapshot(snapshot, { follow = false, force = false } = {}) {
  if (!snapshot) return
  clearLiveEventBuffer()
  const revision = Number(snapshot.sessionRevision) || 0
  const nextSequence = Math.max(0, ...(snapshot.events || []).map(event => Number(event.sequence) || 0))
  const nextClock = Number(snapshot.automation?.simulationClock ?? snapshot.currentState?.simulation?.simulationClock) || 0
  if (!force && (revision < liveSessionRevision.value
    || (revision === liveSessionRevision.value && nextSequence < liveLastSequence.value)
    || (revision === liveSessionRevision.value && nextSequence === liveLastSequence.value && nextClock < liveLastClock.value))) return
  if (force || revision > liveSessionRevision.value) {
    liveSessionRevision.value = revision
    liveLastSequence.value = 0
    liveLastClock.value = 0
    liveRobotVisualQueue.value = []
    liveRobotFocusEvent.value = null
  }
  liveSessionRevision.value = revision
  liveLastSequence.value = nextSequence
  liveLastClock.value = nextClock
  const previousLength = events.value.length
  const nextEvents = Array.isArray(snapshot.events) ? snapshot.events.slice().sort((a, b) => Number(a.sequence) - Number(b.sequence)) : []
  bundle.value = {
    mode: 'live', scene: 'baseline', filename: '实时事件流',
    parkConfig: snapshot.parkConfig || bundle.value?.parkConfig || {},
    labels: snapshot.labels || bundle.value?.labels || {},
    idMap: snapshot.idMap || bundle.value?.idMap || { entries: {} },
    categoryMap: snapshot.categoryMap || bundle.value?.categoryMap || {},
    replay: { mode: 'LIVE_SIMULATION', events: nextEvents, finalState: snapshot.currentState || {} }
  }
  liveStatus.value = snapshot.status || 'READY'
  liveRunning.value = !!snapshot.running
  liveAutomation.value = snapshot.automation || snapshot.currentState?.simulation || liveAutomation.value
  if (Number(snapshot.speed)) speed.value = Number(snapshot.speed)
  if (!nextEvents.length) currentIndex.value = 0
  else if (!previousLength || follow) currentIndex.value = nextEvents.length - 1
  playing.value = liveRunning.value
}

function clearLiveEventBuffer() {
  if (liveEventFlushTimer) clearTimeout(liveEventFlushTimer)
  liveEventFlushTimer = 0
  pendingLiveEvents = []
}

function activateNextLiveRobotVisual() {
  if (pageMode.value !== 'live' || liveRobotFocusEvent.value || !liveRobotVisualQueue.value.length) return
  const preferredIndex = liveRobotVisualQueue.value.findIndex(event => {
    const robotId = event.payload?.selectedEntityId || event.payload?.request?.robotId
    return robotId === selectedId.value
  })
  const index = preferredIndex >= 0 ? preferredIndex : 0
  const queue = liveRobotVisualQueue.value.slice()
  liveRobotFocusEvent.value = queue.splice(index, 1)[0] || null
  liveRobotVisualQueue.value = queue
  robotVisualFailed.value = false
  clearRobotHandoffAnimation()
  robotVisualState.value = { stage: '', mode: 'map', progress: 0, carrying: false, completed: false }
}

function enqueueLiveRobotVisuals(batch) {
  const knownTaskIds = new Set([
    liveRobotFocusEvent.value?.payload?.request?.taskId,
    ...liveRobotVisualQueue.value.map(event => event.payload?.request?.taskId)
  ].filter(Boolean))
  const additions = batch.filter(event => event.eventType === 'ROBOT_TASK_REQUESTED')
    .filter(event => {
      const taskId = event.payload?.request?.taskId
      if (!taskId || knownTaskIds.has(taskId)) return false
      knownTaskIds.add(taskId)
      return true
    })
  if (additions.length) liveRobotVisualQueue.value = [...liveRobotVisualQueue.value, ...additions]
  activateNextLiveRobotVisual()
}

function flushLiveEventBuffer() {
  liveEventFlushTimer = 0
  if (!pendingLiveEvents.length || pageMode.value !== 'live') return
  const batch = pendingLiveEvents.slice().sort((a, b) => Number(a.sequence) - Number(b.sequence))
  pendingLiveEvents = []
  const eventMap = new Map(events.value.map(event => [Number(event.sequence), event]))
  batch.forEach(event => eventMap.set(Number(event.sequence), event))
  const merged = [...eventMap.values()].sort((a, b) => Number(a.sequence) - Number(b.sequence))
  const nextEvents = merged.slice(-LIVE_EVENT_WINDOW)
  const latestEvent = batch[batch.length - 1]
  bundle.value = {
    ...(bundle.value || {}),
    replay: {
      ...(bundle.value?.replay || {}),
      events: nextEvents,
      finalState: latestEvent.currentState || bundle.value?.replay?.finalState || {}
    }
  }
  currentIndex.value = Math.max(0, nextEvents.length - 1)
  liveLastSequence.value = Math.max(liveLastSequence.value, ...batch.map(event => Number(event.sequence) || 0))
  enqueueLiveRobotVisuals(batch)
}

function scheduleLiveEventFlush() {
  if (liveEventFlushTimer) return
  const delay = Math.max(120, Math.round(LIVE_EVENT_FLUSH_BASE_MS / Math.max(.25, Number(speed.value) || 1)))
  liveEventFlushTimer = setTimeout(flushLiveEventBuffer, delay)
}

function appendLiveEvent(event) {
  if (!event?.eventType || !Number.isFinite(Number(event.sequence))) return
  const revision = Number(event.sessionRevision) || liveSessionRevision.value
  if (revision < liveSessionRevision.value) return
  if (revision > liveSessionRevision.value) {
    clearLiveEventBuffer()
    liveSessionRevision.value = revision
    liveLastSequence.value = 0
    bundle.value = bundle.value ? { ...bundle.value, replay: { ...bundle.value.replay, events: [] } } : bundle.value
    liveRobotVisualQueue.value = []
    liveRobotFocusEvent.value = null
  }
  const sequence = Number(event.sequence)
  if (events.value.some(item => Number(item.sequence) === sequence)
    || pendingLiveEvents.some(item => Number(item.sequence) === sequence)) return
  pendingLiveEvents.push({ ...event, sequence })
  scheduleLiveEventFlush()
}

function applyLiveState(state) {
  if (!state) return
  const revision = Number(state.sessionRevision) || 0
  const sequence = Number(state.lastSequence) || 0
  const clock = Number(state.automation?.simulationClock) || 0
  if (revision < liveSessionRevision.value
    || (revision === liveSessionRevision.value && sequence < liveLastSequence.value)
    || (revision === liveSessionRevision.value && sequence === liveLastSequence.value && clock < liveLastClock.value)) return
  liveSessionRevision.value = revision
  liveLastSequence.value = Math.max(liveLastSequence.value, sequence)
  liveLastClock.value = Math.max(liveLastClock.value, clock)
  liveStatus.value = state.status || liveStatus.value
  liveRunning.value = !!state.running
  liveAutomation.value = state.automation || liveAutomation.value
  if (Number(state.speed)) speed.value = Number(state.speed)
  if (bundle.value?.replay) {
    bundle.value = { ...bundle.value, replay: { ...bundle.value.replay, finalState: state.currentState || bundle.value.replay.finalState } }
  }
  playing.value = liveRunning.value
  if (playing.value) schedulePlayback()
  else clearPlaybackTimer()
}

async function connectLiveSimulation() {
  const loadRevision = ++replayLoadRevision
  clearPlaybackTimer()
  clearLiveEventBuffer()
  closeLiveStream?.()
  closeLiveStream = null
  loading.value = true
  errorText.value = ''
  liveMessage.value = ''
  liveConnected.value = false
  try {
    const snapshot = await fetchParkSimulationState()
    if (loadRevision !== replayLoadRevision || pageMode.value !== 'live') return
    applyLiveSnapshot(snapshot, { follow: true, force: true })
    closeLiveStream = connectParkSimulationStream({
      onOpen: () => { liveConnected.value = true },
      onEvent: appendLiveEvent,
      onSnapshot: next => applyLiveSnapshot(next),
      onState: applyLiveState,
      onError: error => {
        if (redirectForAccessDenied(error)) return
        liveMessage.value = error?.message || '实时事件流连接异常'
      },
      onClose: () => { liveConnected.value = false }
    })
  } catch (error) {
    if (loadRevision === replayLoadRevision && !redirectForAccessDenied(error)) {
      errorText.value = error?.message || String(error)
    }
  } finally {
    if (loadRevision === replayLoadRevision) loading.value = false
  }
}

async function submitLiveCommand(type, payload = {}) {
  liveMessage.value = ''
  try {
    const snapshot = await submitParkSimulationCommand(type, payload)
    applyLiveSnapshot(snapshot, { follow: type !== 'PAUSE' })
    if (type === 'RESET') {
      clearPlaybackTimer()
      clearRobotHandoffAnimation()
      playing.value = false
      currentIndex.value = 0
      selectedId.value = 'robot_patrol_01'
      centerVisualStageOverride.value = null
      robotVisualState.value = { stage: '', mode: 'map', progress: 0, carrying: false, completed: false }
      visualRevision.value += 1
    } else if (type === 'PAUSE') {
      playing.value = false
      clearPlaybackTimer()
    } else if (type === 'START') {
      playing.value = true
      schedulePlayback()
    }
  } catch (error) {
    if (redirectForAccessDenied(error)) return
    liveMessage.value = error?.message || String(error)
  }
}

function handleLiveCommand(command = {}) {
  if (!command.type) return
  submitLiveCommand(command.type, command.payload || {})
}

async function downloadLiveSnapshot() {
  liveMessage.value = ''
  try {
    const snapshot = await exportParkSimulationSnapshot()
    if (typeof document === 'undefined' || typeof Blob === 'undefined') {
      liveMessage.value = '当前平台已生成快照，请在 H5 页面下载 JSON'
      return
    }
    const blob = new Blob([`${JSON.stringify(snapshot, null, 2)}\n`], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `park-live-snapshot-${snapshot.runtime?.simulationClock || 0}.json`
    link.click()
    URL.revokeObjectURL(url)
    liveMessage.value = '当前仿真快照已导出'
  } catch (error) {
    if (redirectForAccessDenied(error)) return
    liveMessage.value = error?.message || String(error)
  }
}

function chooseLiveSnapshot() {
  liveMessage.value = ''
  if (typeof uni.chooseFile !== 'function') {
    liveMessage.value = '当前平台不支持选择快照文件'
    return
  }
  uni.chooseFile({
    count: 1,
    extension: ['json'],
    success: async result => {
      try {
        const selected = result.tempFiles?.[0]
        const rawFile = selected?.file || selected
        let text = ''
        if (rawFile && typeof rawFile.text === 'function') text = await rawFile.text()
        else if (selected?.path || result.tempFilePaths?.[0]) {
          const response = await fetch(selected?.path || result.tempFilePaths[0])
          text = await response.text()
        }
        if (!text) throw new Error('未读取到快照内容')
        const snapshot = await restoreParkSimulationSnapshot(JSON.parse(text))
        applyLiveSnapshot(snapshot, { follow: true })
        playing.value = false
        currentIndex.value = Math.max(0, events.value.length - 1)
        visualRevision.value += 1
        liveMessage.value = '快照已恢复，仿真保持暂停'
      } catch (error) {
        if (redirectForAccessDenied(error)) return
        liveMessage.value = error?.message || String(error)
      }
    },
    fail: error => {
      if (!/cancel/i.test(error?.errMsg || '')) liveMessage.value = error?.errMsg || '快照选择失败'
    }
  })
}

function onPageModeChange(event) {
  const option = pageModeOptions[Number(event?.detail?.value)] || pageModeOptions[0]
  if (option.value === pageMode.value) return
  pageMode.value = option.value
  pauseLocalPlayback()
  if (option.value === 'live') connectLiveSimulation()
  else {
    clearLiveEventBuffer()
    liveRobotVisualQueue.value = []
    liveRobotFocusEvent.value = null
    closeLiveStream?.()
    closeLiveStream = null
    liveConnected.value = false
    loadReplay(activeMode.value, activeScenario.value)
  }
}

function pauseLocalPlayback() { playing.value = false; clearPlaybackTimer() }
function refreshPage() { if (pageMode.value === 'live') connectLiveSimulation(); else loadReplay(activeMode.value, activeScenario.value) }

function onModeChange(event) {
  const option = modeOptions[Number(event?.detail?.value)] || modeOptions[0]
  loadReplay(option.value, option.value === 'isaac' ? 'baseline' : activeScenario.value)
}
function onScenarioChange(event) {
  const option = scenarioOptions[Number(event?.detail?.value)] || scenarioOptions[0]
  loadReplay('sim', option.value)
}
function goBack() { goBackFromAdminPage('digitalTwinReplay', { fallback: 'collectionDashboard' }) }

function redirectForAccessDenied(error) {
  const payload = error?.payload || error?.data || null
  const status = Number(error?.response?.status || error?.statusCode || error?.status)
  const response = Number.isFinite(status) && status > 0 ? { status } : error?.response
  const message = String(error?.message || payload?.msg || payload?.message || payload?.error || '').trim()

  if (/access\s+denied/i.test(message)) {
    return redirectIfAccessDenied({ code: 403, message }, response || { status: 403 })
  }

  return redirectIfAccessDenied(payload, response)
}

watch(currentEvent, event => {
  if (pageMode.value === 'live' && event?.payload?.assignedBayId && centerEventTypes.has(event.eventType) && !centerFocusEvent.value) {
    selectedCenterBayId.value = event.payload.assignedBayId
  }
  robotVisualFailed.value = false
  if (pageMode.value !== 'live' && event?.eventType !== 'ROBOT_TASK_REQUESTED' && !robotVisualState.value?.handoff) {
    robotVisualState.value = { stage: '', mode: 'map', progress: 0, carrying: false, completed: false }
  }
  const ids = eventEntityIds(event)
  if (ids.length) selectedId.value = ids[0]
})

watch(playing, active => {
  if (active) resumeRobotHandoffAnimation()
  else clearRobotHandoffAnimation()
})

watch(centerFocusEvent, event => {
  if (centerVisualStageOverride.value && Number(event?.sequence) !== Number(centerVisualStageOverride.value.sequence)) {
    centerVisualStageOverride.value = null
  }
})

onMounted(async () => {
  if (!await ensureAdminScreenAccess('digitalTwinReplay')) return
  syncThemeMode()
  unbindThemeWatcher = bindThemeStorageSync()
  // #ifdef H5
  storageHandler = (event) => {
    if (!event || event.key === 'app_theme') syncThemeMode()
  }
  window.addEventListener('storage', storageHandler)
  // #endif
  loadReplay('sim')
})
onShow(() => {
  syncThemeMode()
})
onBeforeUnmount(() => {
  clearPlaybackTimer()
  clearRobotHandoffAnimation()
  clearLiveEventBuffer()
  closeLiveStream?.()
  if (typeof unbindThemeWatcher === 'function') unbindThemeWatcher()
  // #ifdef H5
  if (storageHandler) {
    window.removeEventListener('storage', storageHandler)
    storageHandler = null
  }
  // #endif
})
</script>

<style scoped>
page { background: #071726; }
.replay-screen {
  --panel: rgba(7,27,43,.86); --line: rgba(116,197,255,.28); --text: #e8f8ff; --muted: #8fb1c4;
  --dt-soft: rgba(8,35,54,.68); --dt-soft-2: rgba(12,42,62,.78); --dt-heading: #e8f8ff;
  --dt-subtle: #789fb4; --dt-label: #8bc9e7; --dt-value: #dceff7;
  min-height: 100vh; height: 100vh; width: 100%; padding: 9px; box-sizing: border-box; overflow: hidden;
  display: flex; flex-direction: column; gap: 8px; color: var(--text);
  font-family: "Source Han Sans SC", "Microsoft YaHei", sans-serif;
  background: radial-gradient(900px 500px at -15% 20%, rgba(44,143,255,.2), transparent 55%), linear-gradient(160deg,#071726,#0c2840);
}
.replay-screen.light-theme {
  --panel: rgba(255,255,255,.95); --line: rgba(91,136,164,.28); --text: #18374c; --muted: #667f91;
  --dt-soft: rgba(244,248,251,.96); --dt-soft-2: rgba(237,244,248,.96); --dt-heading: #18374c;
  --dt-subtle: #6c8495; --dt-label: #347293; --dt-value: #294f67;
  background: radial-gradient(900px 500px at -15% 20%, rgba(44,143,255,.1), transparent 55%), linear-gradient(160deg,#f4f8fb,#e8f1f6);
}
.panel { border: 1px solid var(--line); border-radius: 12px; background: var(--panel); backdrop-filter: blur(6px); box-sizing: border-box; }
.header { position: relative; z-index: 100; overflow: visible; min-height: 62px; padding: 9px 12px; display: flex; align-items: center; gap: 12px; }
.header-copy { min-width: 300px; }.title { font-size: clamp(20px, 1.35vw, 26px); font-weight: 750; letter-spacing: 1px; text-shadow: 0 0 18px rgba(36,217,255,.36); }.subtitle { color: var(--muted); font-size: 11px; margin-top: 4px; }
.twin-screen-header { margin-left: auto; }
.twin-header-business { display: flex; align-items: center; gap: 7px; min-width: 0; }
.source-legend { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }.source-badge { padding: 3px 6px; border: 1px solid rgba(80,164,217,.46); border-radius: 5px; color: #91cef2; background: rgba(23,91,144,.25); font: 700 10px/1.2 ui-monospace, Consolas, monospace; }.source-badge.isaac-realtime { color: #c6b0ff; border-color: rgba(147,105,255,.52); background: rgba(88,53,143,.3); }.source-badge.backend-api { color: #8aefb8; border-color: rgba(48,205,123,.48); background: rgba(28,122,74,.28); }.source-badge.visual-aid { color: #ffd274; border-color: rgba(245,182,72,.5); background: rgba(132,87,16,.28); }
.mode-select { min-width: 118px; padding: 6px 8px; border: 1px solid rgba(126,196,239,.28); border-radius: var(--admin-screen-control-radius, 8px); background: rgba(8,35,54,.68); }.mode-select text,.mode-select b { display: block; }.mode-select text { color: #749aae; font-size: 10px; }.mode-select b { color: #dff7ff; font-size: 12px; margin-top: 2px; }.filename { max-width: 180px; padding: 7px 9px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border: 1px solid rgba(126,196,239,.2); border-radius: var(--admin-screen-control-radius, 8px); color: #8eb8ca; background: rgba(8,35,54,.54); font: 11px/1 ui-monospace, Consolas, monospace; }.header-button { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; min-height: var(--admin-screen-control-height, 36px); height: var(--admin-screen-control-height, 36px); padding: 0 12px; border: 1px solid rgba(126,196,239,.42); border-radius: var(--admin-screen-control-radius, 8px); color: #c4deea; background: rgba(8,35,54,.42); font-size: var(--admin-screen-control-font-size, 13px); font-weight: var(--admin-screen-control-font-weight, 650); white-space: nowrap; }.header-button.primary { color: #fff; border-color: rgba(85,177,255,.92); background: linear-gradient(135deg,#2479e8,#42abff); box-shadow: 0 5px 14px rgba(44,143,255,.28); }
.workspace { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(230px,17%) minmax(660px,1fr) minmax(320px,20%); gap: 8px; }.left-column,.center-column,.right-column { min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 8px; }.timeline { flex: 1; }.current-event { flex: 0 0 158px; padding: 11px 12px; overflow: hidden; }.section-heading { display: flex; justify-content: space-between; align-items: center; color: #8bc9e7; font-size: 12px; font-weight: 700; letter-spacing: .5px; }.section-heading > text:last-child { color: #62d8ff; font: 700 11px/1 ui-monospace, Consolas, monospace; }.current-title { color: #f0fbff; font-size: 16px; font-weight: 700; margin-top: 10px; }.current-desc { color: #83a7b9; font-size: 11px; margin: 4px 0 8px; }.event-meta { min-height: 20px; display: flex; justify-content: space-between; gap: 10px; color: #7499ab; font-size: 10px; }.event-meta b { max-width: 72%; color: #cfe9f5; font-weight: 600; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.event-meta b.sim { color: #91cef2; }.event-meta b.isaac-realtime { color: #c6b0ff; }.event-meta b.backend-api { color: #8aefb8; }.event-meta b.visual-aid { color: #ffd274; }
.park-stage { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }.park-map { flex: 1; }.entity-inspector { flex: 1; }.state-panel { flex: 0 0 132px; padding: 11px 12px; }.state-row { min-height: 24px; display: flex; align-items: center; justify-content: space-between; gap: 8px; color: #86aebf; font-size: 11px; }.state-row b { color: #dceef6; font-weight: 600; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.state-row b.success { color: #79edb5; }.state-row b.warning { color: #ffc76c; }
.right-column { overflow-y: auto; padding-right: 2px; scrollbar-width: thin; scrollbar-color: rgba(77,167,215,.45) transparent; }.right-column .entity-inspector { flex: 0 0 330px; }.right-column.live .entity-inspector { flex-basis: 360px; }.decision-explanation { flex: 0 0 auto; }
.visual-aid-note { flex: 0 0 66px; padding: 10px 12px; }.visual-aid-note text,.visual-aid-note small { display: block; }.visual-aid-note text { color: #dceff7; font-size: 11px; font-weight: 700; }.visual-aid-note small { margin-top: 5px; color: #7fa5b7; font-size: 9px; line-height: 1.5; }
.loading,.error { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: #8fb7ca; }.loading-ring { width: 30px; height: 30px; border: 3px solid rgba(36,217,255,.18); border-top-color: #24d9ff; border-radius: 50%; animation: spin .8s linear infinite; }.error-title { color: #ffd0d2; font-size: 18px; font-weight: 700; }.error-message { color: #a8c2cf; font-size: 11px; }.error .header-button { flex: none; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 1440px) { .header-copy { min-width: 280px; }.source-legend,.filename { display: none; } }
@media (max-width: 1180px) { .header { flex-wrap: wrap; }.workspace { grid-template-columns: 220px minmax(0,1fr) 240px; } }
@media (max-width: 900px) { .replay-screen { height: auto; min-height: 100vh; overflow: auto; }.header { align-items: flex-start; flex-wrap: wrap; }.twin-header-business { width: 100%; overflow-x: auto; }.workspace { display: flex; flex-direction: column; }.left-column,.center-column,.right-column { min-height: auto; }.timeline { height: 360px; flex: none; }.park-stage { flex: none; min-height: auto; }.park-map { height: 520px; flex: none; }.entity-inspector { min-height: 430px; flex: none; }.current-event,.state-panel { flex-basis: auto; } }
@media (max-width: 560px) { .replay-screen { padding: 6px; }.title { font-size: 17px; }.subtitle { display: none; }.header-copy { min-width: 100%; }.mode-select { min-width: 116px; }.park-map { height: 430px; }.workspace { gap: 6px; } }

/* 亮色模式下使用浅色信息界面和浅色场景承载区。 */
.replay-screen.light-theme .panel,
.replay-screen.light-theme :deep(.panel) {
  border-color: var(--line);
  background: var(--panel);
  box-shadow: 0 7px 20px rgba(33, 72, 98, .08);
}
.replay-screen.light-theme .title { text-shadow: none; }
.replay-screen.light-theme .mode-select,
.replay-screen.light-theme .filename,
.replay-screen.light-theme .header-button:not(.primary) {
  color: #365e76;
  border-color: #bfd2df;
  background: #f5f9fb;
}
.replay-screen.light-theme .mode-select text { color: #71899a; }
.replay-screen.light-theme .mode-select b { color: #244c65; }
.replay-screen.light-theme .filename { color: #587487; }
.replay-screen.light-theme .source-badge { color: #266f99; border-color: #a8cade; background: #eaf4fa; }
.replay-screen.light-theme .source-badge.isaac-realtime { color: #7352b7; border-color: #c6b7e7; background: #f1edfa; }
.replay-screen.light-theme .source-badge.backend-api { color: #16754a; border-color: #a8d7bd; background: #eaf7f0; }
.replay-screen.light-theme .source-badge.visual-aid { color: #95600a; border-color: #e3c889; background: #fff7e4; }
.replay-screen.light-theme .section-heading { color: #347293; }
.replay-screen.light-theme .section-heading > text:last-child { color: #177caa; }
.replay-screen.light-theme .current-title,
.replay-screen.light-theme .visual-aid-note text { color: #18374c; }
.replay-screen.light-theme .current-desc,
.replay-screen.light-theme .event-meta,
.replay-screen.light-theme .state-row,
.replay-screen.light-theme .visual-aid-note small { color: #6b8393; }
.replay-screen.light-theme .event-meta b,
.replay-screen.light-theme .state-row b { color: #294f67; }
.replay-screen.light-theme .loading,
.replay-screen.light-theme .error { color: #667f91; }
.replay-screen.light-theme .error-title { color: #b73d48; }
.replay-screen.light-theme .error-message { color: #708796; }

.replay-screen.light-theme :deep(.panel-head),
.replay-screen.light-theme :deep(.inspector-head),
.replay-screen.light-theme :deep(.decision-head),
.replay-screen.light-theme :deep(.progress-row),
.replay-screen.light-theme :deep(.entity-summary),
.replay-screen.light-theme :deep(.data-section) { border-color: #d5e2e9; }
.replay-screen.light-theme :deep(.panel-title),
.replay-screen.light-theme :deep(.analytics-head text),
.replay-screen.light-theme :deep(.entity-name),
.replay-screen.light-theme :deep(.event-title),
.replay-screen.light-theme :deep(.task-row text) { color: var(--dt-heading); }
.replay-screen.light-theme :deep(.panel-sub),
.replay-screen.light-theme :deep(.event-desc),
.replay-screen.light-theme :deep(.event-sequence),
.replay-screen.light-theme :deep(.control-label),
.replay-screen.light-theme :deep(.data-row),
.replay-screen.light-theme :deep(.metric-head),
.replay-screen.light-theme :deep(.task-row small),
.replay-screen.light-theme :deep(.empty-state),
.replay-screen.light-theme :deep(.empty-inline),
.replay-screen.light-theme :deep(.decision-empty text),
.replay-screen.light-theme :deep(.candidate-name small),
.replay-screen.light-theme :deep(.candidate-state),
.replay-screen.light-theme :deep(.analytics-head small),
.replay-screen.light-theme :deep(.metric-grid small),
.replay-screen.light-theme :deep(.chart-legend),
.replay-screen.light-theme :deep(.prediction-empty),
.replay-screen.light-theme :deep(.reason-block small),
.replay-screen.light-theme :deep(.automation-row label),
.replay-screen.light-theme :deep(.auto-summary small),
.replay-screen.light-theme :deep(.coordination-summary small),
.replay-screen.light-theme :deep(.field small),
.replay-screen.light-theme :deep(.recent-incident small) { color: var(--dt-subtle); }
.replay-screen.light-theme :deep(.counter),
.replay-screen.light-theme :deep(.section-title),
.replay-screen.light-theme :deep(.section-heading) { color: var(--dt-label); }
.replay-screen.light-theme :deep(.data-row b),
.replay-screen.light-theme :deep(.metric-head b),
.replay-screen.light-theme :deep(.decision-meta b),
.replay-screen.light-theme :deep(.candidate-name b),
.replay-screen.light-theme :deep(.selected-reason b),
.replay-screen.light-theme :deep(.analytics-head text),
.replay-screen.light-theme :deep(.metric-grid b),
.replay-screen.light-theme :deep(.prediction-title text),
.replay-screen.light-theme :deep(.reason-block text),
.replay-screen.light-theme :deep(.auto-summary b),
.replay-screen.light-theme :deep(.coordination-summary b),
.replay-screen.light-theme :deep(.field b),
.replay-screen.light-theme :deep(.recent-incident b) { color: var(--dt-value); }
.replay-screen.light-theme :deep(.event-row) { border-color: #dde7ed; }
.replay-screen.light-theme :deep(.event-row:hover) { background: #f0f6fa; }
.replay-screen.light-theme :deep(.event-row.active) { background: linear-gradient(90deg, rgba(44,143,255,.16), rgba(36,217,255,.05)); box-shadow: inset 3px 0 #248fff; }
.replay-screen.light-theme :deep(.source-tag) { color: #2b7196; border-color: #b2cede; background: #eaf4fa; }
.replay-screen.light-theme :deep(.source-tag.isaac-realtime) { color: #7352b7; border-color: #c8bae7; background: #f1edfa; }
.replay-screen.light-theme :deep(.source-tag.backend-api) { color: #16754a; border-color: #aad7be; background: #eaf7f0; }
.replay-screen.light-theme :deep(.source-tag.visual-aid) { color: #95600a; border-color: #e3c889; background: #fff7e4; }
.replay-screen.light-theme :deep(.control-button),
.replay-screen.light-theme :deep(.speed-button),
.replay-screen.light-theme :deep(.jump-input),
.replay-screen.light-theme :deep(.command),
.replay-screen.light-theme :deep(.apply) { color: #42667b; border-color: #c2d5e0; background: #f3f8fb; }
.replay-screen.light-theme :deep(.control-button.primary),
.replay-screen.light-theme :deep(.speed-button.active),
.replay-screen.light-theme :deep(.command.primary) { color: #fff; border-color: #2d79cf; background: linear-gradient(135deg,#1769c9,#2c8fff); }
.replay-screen.light-theme :deep(.progress-count),
.replay-screen.light-theme :deep(.fill-value) { color: #167da7; }
.replay-screen.light-theme :deep(.entity-type),
.replay-screen.light-theme :deep(.entity-symbol) { color: #2577a2; border-color: #b4d3e2; background: #eaf5fa; }
.replay-screen.light-theme :deep(.entity-id) { color: #287eaa; }
.replay-screen.light-theme :deep(.metric-track),
.replay-screen.light-theme :deep(.cost-track) { background: #dce8ee; }
.replay-screen.light-theme :deep(.incident-section) { background: linear-gradient(90deg,rgba(224,151,35,.1),transparent); }
.replay-screen.light-theme :deep(.coordination-section),
.replay-screen.light-theme :deep(.selected-reason) { background: linear-gradient(90deg,rgba(36,157,190,.07),transparent); }
.replay-screen.light-theme :deep(.decision-empty b) { color: #536f80; }
.replay-screen.light-theme :deep(.decision-meta view),
.replay-screen.light-theme :deep(.score-summary view),
.replay-screen.light-theme :deep(.candidate-row),
.replay-screen.light-theme :deep(.metric-grid view),
.replay-screen.light-theme :deep(.prediction-block),
.replay-screen.light-theme :deep(.auto-summary view),
.replay-screen.light-theme :deep(.coordination-summary view),
.replay-screen.light-theme :deep(.field),
.replay-screen.light-theme :deep(.incident-count) { border-color: #d4e1e8; background: #f5f9fb; }
.replay-screen.light-theme :deep(.candidate-row.selected) { border-color: #8dceb5; background: linear-gradient(90deg,#edf8f3,#f6fafb); }
.replay-screen.light-theme :deep(.candidate-facts text),
.replay-screen.light-theme :deep(.route-metrics b) { color: #456c7f; background: #eaf1f5; }
.replay-screen.light-theme :deep(.reason-block) { background: #edf7fa; }
.replay-screen.light-theme :deep(.chart-axis),
.replay-screen.light-theme :deep(.split-line) { stroke: rgba(74,112,134,.24); }
.replay-screen.light-theme :deep(.recent-incident) { background: #fff8e8; }
.replay-screen.light-theme :deep(.command.accent) { color: #14734b; border-color: #9dd3b8; background: #edf8f2; }
.replay-screen.light-theme :deep(.command.danger) { color: #ad3e48; border-color: #e5b1b7; background: #fff1f2; }
.replay-screen.light-theme :deep(.timeline-list .uni-scroll-view) { scrollbar-color: #91b9cf #e7f0f5; }
.replay-screen.light-theme,
.replay-screen.light-theme .right-column,
.replay-screen.light-theme :deep(.timeline-list .uni-scroll-view),
.replay-screen.light-theme :deep(.tasks-section),
.replay-screen.light-theme :deep(.button-rail) {
  scrollbar-width: thin;
  scrollbar-color: #5da9cc #e5eef3;
}
.replay-screen.light-theme::-webkit-scrollbar,
.replay-screen.light-theme .right-column::-webkit-scrollbar,
.replay-screen.light-theme :deep(.timeline-list .uni-scroll-view::-webkit-scrollbar),
.replay-screen.light-theme :deep(.tasks-section::-webkit-scrollbar),
.replay-screen.light-theme :deep(.button-rail::-webkit-scrollbar) { width: 6px; height: 6px; }
.replay-screen.light-theme::-webkit-scrollbar-track,
.replay-screen.light-theme .right-column::-webkit-scrollbar-track,
.replay-screen.light-theme :deep(.timeline-list .uni-scroll-view::-webkit-scrollbar-track),
.replay-screen.light-theme :deep(.tasks-section::-webkit-scrollbar-track),
.replay-screen.light-theme :deep(.button-rail::-webkit-scrollbar-track) {
  border-radius: 999px;
  background: #e5eef3;
}
.replay-screen.light-theme::-webkit-scrollbar-thumb,
.replay-screen.light-theme .right-column::-webkit-scrollbar-thumb,
.replay-screen.light-theme :deep(.timeline-list .uni-scroll-view::-webkit-scrollbar-thumb),
.replay-screen.light-theme :deep(.tasks-section::-webkit-scrollbar-thumb),
.replay-screen.light-theme :deep(.button-rail::-webkit-scrollbar-thumb) {
  border: 1px solid #d5e4ec;
  border-radius: 999px;
  background: linear-gradient(180deg, #75bbd6, #4b98c0);
}
.replay-screen.light-theme::-webkit-scrollbar-button,
.replay-screen.light-theme .right-column::-webkit-scrollbar-button,
.replay-screen.light-theme :deep(.timeline-list .uni-scroll-view::-webkit-scrollbar-button),
.replay-screen.light-theme :deep(.tasks-section::-webkit-scrollbar-button),
.replay-screen.light-theme :deep(.button-rail::-webkit-scrollbar-button) { display: none; width: 0; height: 0; }

/* 中心处理流程浮层 */
.replay-screen.light-theme :deep(.center-workflow-overlay) {
  color: #18374c;
  border-color: #91bdd1;
  background: linear-gradient(145deg, rgba(255,255,255,.98), rgba(235,245,249,.97));
  box-shadow: 0 20px 56px rgba(30, 63, 83, .24);
}
.replay-screen.light-theme :deep(.center-kicker) { color: #087f9f; }
.replay-screen.light-theme :deep(.center-title) { color: #17364a; }
.replay-screen.light-theme :deep(.center-status) { color: #657f90; }
.replay-screen.light-theme :deep(.center-meta view) {
  border-color: #c8dce5;
  background: rgba(246,250,252,.96);
}
.replay-screen.light-theme :deep(.center-meta text) { color: #6a8393; }
.replay-screen.light-theme :deep(.center-meta b) { color: #244c64; }
.replay-screen.light-theme :deep(.rail-line) { background: #c2d5df; }
.replay-screen.light-theme :deep(.flow-stage) { color: #718997; }
.replay-screen.light-theme :deep(.stage-dot) {
  color: #607c8c;
  border-color: #b4cbd6;
  background: #eef5f8;
}
.replay-screen.light-theme :deep(.flow-stage.done) { color: #258263; }
.replay-screen.light-theme :deep(.flow-stage.active) { color: #175b73; }
.replay-screen.light-theme :deep(.process-panel) {
  border-color: #91bdd1;
  box-shadow: inset 0 0 30px rgba(24, 108, 139, .08);
}
.replay-screen.light-theme :deep(.stage-card) {
  color: #18374c;
  border-color: rgba(87, 153, 181, .42);
  background: linear-gradient(145deg,rgba(255,255,255,.95),rgba(235,246,249,.93));
  box-shadow: 0 9px 24px rgba(20,58,77,.2);
}
.replay-screen.light-theme :deep(.stage-card-head b),
.replay-screen.light-theme :deep(.video-status-card b) { color: #17364a; }
.replay-screen.light-theme :deep(.stage-card > text),
.replay-screen.light-theme :deep(.video-status-card text) { color: #617d8d; }
.replay-screen.light-theme :deep(.video-status-card) {
  color: #18374c;
  border-color: #80cbb0;
  background: linear-gradient(135deg,rgba(250,255,252,.97),rgba(232,247,240,.96));
  box-shadow: 0 8px 22px rgba(20,65,48,.18), inset 3px 0 #36b884;
}
.replay-screen.light-theme :deep(.check-list),
.replay-screen.light-theme :deep(.check-list.video-mode) {
  border-color: #b9d9cc;
  background: rgba(247,252,249,.96);
}
.replay-screen.light-theme :deep(.check-list view) { color: #6b8490; }
.replay-screen.light-theme :deep(.check-list b) { color: #4f6e78; }
.replay-screen.light-theme :deep(.check-list view.done),
.replay-screen.light-theme :deep(.check-list view.done b) { color: #197554; }
.replay-screen.light-theme :deep(.center-footer > text) { color: #6b8392; }
.replay-screen.light-theme :deep(.center-controls button.secondary) {
  color: #356579;
  border-color: #b7d2de;
  background: #f1f7f9;
}

/* 机器人局部任务 HUD */
.replay-screen.light-theme :deep(.robot-task-overlay) { color: #18374c; }
.replay-screen.light-theme :deep(.overlay-head),
.replay-screen.light-theme :deep(.overlay-footer) {
  border-color: rgba(100, 159, 184, .42);
  background: linear-gradient(90deg,rgba(255,255,255,.96),rgba(239,247,250,.91));
  box-shadow: 0 8px 22px rgba(27,64,83,.18);
}
.replay-screen.light-theme :deep(.overlay-title) { color: #17364a; }
.replay-screen.light-theme :deep(.overlay-stage-title) { color: #087f9f; }
.replay-screen.light-theme :deep(.overlay-stage-title text),
.replay-screen.light-theme :deep(.task-facts text),
.replay-screen.light-theme :deep(.task-identity small) { color: #6a8493; }
.replay-screen.light-theme :deep(.task-facts),
.replay-screen.light-theme :deep(.task-facts view) { border-color: #d0dfe7; }
.replay-screen.light-theme :deep(.task-facts b) { color: #244c64; }
.replay-screen.light-theme :deep(.task-facts .progress-fact b) { color: #087f9f; }
.replay-screen.light-theme :deep(.stage-selector) {
  border-color: #cbdde5;
  background: linear-gradient(90deg,rgba(250,253,254,.94),rgba(235,245,248,.9));
}
.replay-screen.light-theme :deep(.stage-selector::before) { background: #c5d7df; }
.replay-screen.light-theme :deep(.stage-chip) { color: #6e8795; }
.replay-screen.light-theme :deep(.stage-chip.done) { color: #2b8065; }
.replay-screen.light-theme :deep(.stage-chip.active) { color: #145b73; }
.replay-screen.light-theme :deep(.stage-index) {
  color: #66808f;
  border-color: #b8cdd7;
  background: #eef5f7;
}
.replay-screen.light-theme :deep(.stage-chip.active .stage-index) {
  color: #fff;
  border-color: #1c98b7;
  background: #1685a5;
  box-shadow: 0 0 0 3px rgba(22,133,165,.12);
}
.replay-screen.light-theme :deep(.progress-track) { background: rgba(83,126,145,.22); }
.replay-screen.light-theme :deep(.task-identity text) { color: #27677f; }
.replay-screen.light-theme :deep(.local-button.secondary) {
  color: #356579;
  border-color: #b7d2de;
  background: #f1f7f9;
}
.replay-screen.light-theme :deep(.debug-stages text) { color: #607d8c; border-color: #c2d8e2; }

/* ─── 浅色运营外壳 ─── */
.source-summary { display: none; }
.replay-screen.light-theme.admin-light-theme {
  --panel: var(--admin-light-surface);
  --line: var(--admin-light-border);
  --text: var(--admin-light-text);
  --muted: var(--admin-light-text-secondary);
  --dt-soft: var(--admin-light-surface-soft);
  --dt-soft-2: #f1f5f8;
  --dt-heading: var(--admin-light-text);
  --dt-subtle: var(--admin-light-text-secondary);
  --dt-label: #356b8b;
  --dt-value: var(--admin-light-text);
  padding: 10px;
  gap: 9px;
  background: var(--admin-light-bg);
}
.replay-screen.light-theme.admin-light-theme .panel,
.replay-screen.light-theme.admin-light-theme :deep(.panel) {
  border: 1px solid var(--admin-light-border);
  border-radius: var(--admin-light-radius-panel);
  background: var(--admin-light-surface);
  box-shadow: var(--admin-light-shadow);
  backdrop-filter: none;
}
.replay-screen.light-theme.admin-light-theme .header {
  min-height: 54px;
  padding: 7px 10px;
  gap: 10px;
}
.replay-screen.light-theme.admin-light-theme .header-copy { min-width: 270px; }
.replay-screen.light-theme.admin-light-theme .title {
  color: var(--admin-light-text);
  font-size: clamp(20px, 1.25vw, 24px);
  font-weight: 740;
  letter-spacing: 0;
}
.replay-screen.light-theme.admin-light-theme .subtitle { color: var(--admin-light-text-secondary); margin-top: 2px; }
.replay-screen.light-theme.admin-light-theme :deep(.admin-screen-header) {
  --admin-screen-control-height: 32px;
  --admin-screen-control-font-size: 12px;
  gap: 6px;
}
.replay-screen.light-theme.admin-light-theme .twin-header-business { gap: 6px; }
.replay-screen.light-theme.admin-light-theme .source-legend { display: none; }
.replay-screen.light-theme.admin-light-theme .source-summary {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 9px;
  border: 1px solid var(--admin-light-border-strong);
  border-radius: var(--admin-light-radius-control);
  color: var(--admin-light-text-secondary);
  background: var(--admin-light-surface-soft);
  font-size: 11px;
  white-space: nowrap;
}
.replay-screen.light-theme.admin-light-theme .mode-select,
.replay-screen.light-theme.admin-light-theme .filename,
.replay-screen.light-theme.admin-light-theme .header-button:not(.primary) {
  min-width: 108px;
  min-height: 32px;
  box-sizing: border-box;
  padding: 4px 8px;
  border: 1px solid var(--admin-light-border-strong);
  border-radius: var(--admin-light-radius-control);
  color: var(--admin-light-text-secondary);
  background: var(--admin-light-surface);
}
.replay-screen.light-theme.admin-light-theme .mode-select text { color: var(--admin-light-text-muted); font-size: 9px; }
.replay-screen.light-theme.admin-light-theme .mode-select b { color: var(--admin-light-text); font-size: 11px; margin-top: 1px; }
.replay-screen.light-theme.admin-light-theme .filename { color: var(--admin-light-text-secondary); }
.replay-screen.light-theme.admin-light-theme .header-button.primary {
  border-color: var(--admin-light-primary);
  background: var(--admin-light-primary);
  box-shadow: 0 3px 8px rgba(24, 167, 124, .2);
}
.replay-screen.light-theme.admin-light-theme .workspace {
  grid-template-columns: minmax(230px, 16%) minmax(620px, 1fr) minmax(280px, 19%);
  gap: 9px;
}
.replay-screen.light-theme.admin-light-theme .left-column,
.replay-screen.light-theme.admin-light-theme .center-column,
.replay-screen.light-theme.admin-light-theme .right-column { gap: 9px; }
.replay-screen.light-theme.admin-light-theme .current-event {
  flex-basis: 144px;
  padding: 10px 11px 10px 14px;
  border-left: 3px solid var(--admin-light-primary);
  box-shadow: none;
}
.replay-screen.light-theme.admin-light-theme .section-heading { color: #356b8b; letter-spacing: 0; }
.replay-screen.light-theme.admin-light-theme .section-heading > text:last-child { color: var(--admin-light-primary); }
.replay-screen.light-theme.admin-light-theme .current-title { margin-top: 8px; color: var(--admin-light-text); font-size: 15px; }
.replay-screen.light-theme.admin-light-theme .current-desc { margin: 3px 0 6px; color: var(--admin-light-text-secondary); }
.replay-screen.light-theme.admin-light-theme .event-meta { min-height: 18px; color: var(--admin-light-text-secondary); }
.replay-screen.light-theme.admin-light-theme .event-meta b { color: var(--admin-light-text); }
.replay-screen.light-theme.admin-light-theme .park-stage {
  overflow: hidden;
  border: 1px solid var(--admin-light-border-strong);
  border-radius: var(--admin-light-radius-panel);
  background: #edf5f0;
  box-shadow: var(--admin-light-shadow-map);
}
.replay-screen.light-theme.admin-light-theme :deep(.park-canvas),
.replay-screen.light-theme.admin-light-theme :deep(.park-scene-surface) {
  border-radius: 11px;
  background: #edf5f0;
}
.replay-screen.light-theme.admin-light-theme .right-column { padding-right: 3px; }
.replay-screen.light-theme.admin-light-theme .right-column .entity-inspector { flex-basis: 300px; }
.replay-screen.light-theme.admin-light-theme .right-column .entity-inspector.is-empty {
  flex: 0 0 116px;
  min-height: 116px;
}
.replay-screen.light-theme.admin-light-theme :deep(.entity-inspector.is-empty .inspector-head) { padding: 10px 12px 8px; }
.replay-screen.light-theme.admin-light-theme :deep(.entity-inspector.is-empty .empty-state) { padding: 12px 10px; }
.replay-screen.light-theme.admin-light-theme :deep(.panel-head),
.replay-screen.light-theme.admin-light-theme :deep(.inspector-head),
.replay-screen.light-theme.admin-light-theme :deep(.decision-head) {
  padding: 10px 12px 8px;
  border-color: var(--admin-light-border);
  background: var(--admin-light-surface);
}
.replay-screen.light-theme.admin-light-theme :deep(.panel-title),
.replay-screen.light-theme.admin-light-theme :deep(.analytics-head text),
.replay-screen.light-theme.admin-light-theme :deep(.entity-name),
.replay-screen.light-theme.admin-light-theme :deep(.event-title),
.replay-screen.light-theme.admin-light-theme :deep(.task-row text) { color: var(--admin-light-text); }
.replay-screen.light-theme.admin-light-theme :deep(.panel-sub),
.replay-screen.light-theme.admin-light-theme :deep(.event-desc),
.replay-screen.light-theme.admin-light-theme :deep(.event-sequence),
.replay-screen.light-theme.admin-light-theme :deep(.data-row),
.replay-screen.light-theme.admin-light-theme :deep(.metric-head),
.replay-screen.light-theme.admin-light-theme :deep(.empty-state),
.replay-screen.light-theme.admin-light-theme :deep(.empty-inline) { color: var(--admin-light-text-secondary); }
.replay-screen.light-theme.admin-light-theme :deep(.event-row) {
  min-height: 54px;
  border-color: var(--admin-light-border);
  background: var(--admin-light-surface);
}
.replay-screen.light-theme.admin-light-theme :deep(.event-row:hover) { background: var(--admin-light-surface-soft); }
.replay-screen.light-theme.admin-light-theme :deep(.event-row.active) {
  border-color: #b7d1f1;
  background: var(--admin-light-primary-soft);
  box-shadow: inset 3px 0 var(--admin-light-primary);
}
.replay-screen.light-theme.admin-light-theme :deep(.decision-meta view),
.replay-screen.light-theme.admin-light-theme :deep(.score-summary view),
.replay-screen.light-theme.admin-light-theme :deep(.candidate-row),
.replay-screen.light-theme.admin-light-theme :deep(.metric-grid view),
.replay-screen.light-theme.admin-light-theme :deep(.prediction-block),
.replay-screen.light-theme.admin-light-theme :deep(.auto-summary view),
.replay-screen.light-theme.admin-light-theme :deep(.coordination-summary view),
.replay-screen.light-theme.admin-light-theme :deep(.field),
.replay-screen.light-theme.admin-light-theme :deep(.incident-count) {
  border-color: var(--admin-light-border);
  background: var(--admin-light-surface-soft);
}
.replay-screen.light-theme.admin-light-theme :deep(.control-button),
.replay-screen.light-theme.admin-light-theme :deep(.speed-button),
.replay-screen.light-theme.admin-light-theme :deep(.jump-input),
.replay-screen.light-theme.admin-light-theme :deep(.command),
.replay-screen.light-theme.admin-light-theme :deep(.apply) {
  color: var(--admin-light-text-secondary);
  border-color: var(--admin-light-border-strong);
  background: var(--admin-light-surface);
  box-shadow: none;
}
.replay-screen.light-theme.admin-light-theme :deep(.control-button.primary),
.replay-screen.light-theme.admin-light-theme :deep(.speed-button.active),
.replay-screen.light-theme.admin-light-theme :deep(.command.primary) {
  color: #fff;
  border-color: var(--admin-light-primary);
  background: var(--admin-light-primary);
}
.replay-screen.light-theme.admin-light-theme .state-panel { flex-basis: 118px; padding: 10px 11px; }
.replay-screen.light-theme.admin-light-theme .state-row { min-height: 21px; color: var(--admin-light-text-secondary); }
.replay-screen.light-theme.admin-light-theme .visual-aid-note { flex-basis: 54px; padding: 8px 10px; }
.replay-screen.light-theme.admin-light-theme .visual-aid-note text { color: var(--admin-light-text); }
.replay-screen.light-theme.admin-light-theme .visual-aid-note small { margin-top: 3px; color: var(--admin-light-text-secondary); line-height: 1.35; }
.replay-screen.light-theme.admin-light-theme :deep(.decision-empty),
.replay-screen.light-theme.admin-light-theme :deep(.prediction-empty) {
  min-height: 0;
  padding: 14px 10px;
  border: 0;
  background: var(--admin-light-surface-soft);
}

/* 基础局部回放样式，后续浅色规则统一其外壳和控制区。 */
.replay-screen.light-theme.admin-light-theme :deep(.center-workflow-overlay) {
  color: #eaf9ff;
  border-color: rgba(92, 213, 255, .55);
  background: linear-gradient(145deg, rgba(5, 24, 39, .98), rgba(8, 43, 62, .96));
  box-shadow: 0 18px 60px rgba(0, 0, 0, .45);
}
.replay-screen.light-theme.admin-light-theme :deep(.center-kicker) { color: #54dbff; }
.replay-screen.light-theme.admin-light-theme :deep(.center-title) { color: #fff; }
.replay-screen.light-theme.admin-light-theme :deep(.center-status) { color: #9cc3d2; }
.replay-screen.light-theme.admin-light-theme :deep(.center-meta view) { border-color: rgba(112, 194, 232, .2); background: rgba(14, 55, 76, .58); }
.replay-screen.light-theme.admin-light-theme :deep(.center-meta text) { color: #7fa5b6; }
.replay-screen.light-theme.admin-light-theme :deep(.center-meta b) { color: #e6f8ff; }
.replay-screen.light-theme.admin-light-theme :deep(.rail-line) { background: rgba(113, 175, 200, .25); }
.replay-screen.light-theme.admin-light-theme :deep(.flow-stage) { color: #688e9f; }
.replay-screen.light-theme.admin-light-theme :deep(.stage-dot) { color: #759aaa; border-color: rgba(100, 160, 186, .35); background: #0b2b3d; }
.replay-screen.light-theme.admin-light-theme :deep(.flow-stage.done) { color: #68d9b1; }
.replay-screen.light-theme.admin-light-theme :deep(.flow-stage.active) { color: #e9fbff; }
.replay-screen.light-theme.admin-light-theme :deep(.process-panel) { border-color: rgba(76, 204, 247, .4); background: #031725; box-shadow: inset 0 0 38px rgba(19, 133, 168, .12); }
.replay-screen.light-theme.admin-light-theme :deep(.stage-card) { color: #eaf9ff; border-color: rgba(114, 207, 237, .3); background: linear-gradient(145deg, rgba(5, 38, 55, .94), rgba(3, 25, 39, .9)); box-shadow: 0 9px 28px rgba(0, 10, 18, .35); }
.replay-screen.light-theme.admin-light-theme :deep(.stage-card-head b),
.replay-screen.light-theme.admin-light-theme :deep(.video-status-card b) { color: #fff; }
.replay-screen.light-theme.admin-light-theme :deep(.stage-card > text),
.replay-screen.light-theme.admin-light-theme :deep(.video-status-card text) { color: #9fc2cf; }
.replay-screen.light-theme.admin-light-theme :deep(.video-status-card) { color: #eafaff; border-color: rgba(84, 231, 177, .52); background: linear-gradient(135deg, rgba(4, 31, 47, .98), rgba(5, 51, 66, .98)); box-shadow: 0 8px 22px rgba(0, 8, 15, .42), inset 3px 0 #4ee5aa; }
.replay-screen.light-theme.admin-light-theme :deep(.check-list),
.replay-screen.light-theme.admin-light-theme :deep(.check-list.video-mode) { border-color: rgba(92, 232, 181, .28); background: rgba(3, 34, 43, .94); }
.replay-screen.light-theme.admin-light-theme :deep(.check-list view) { color: #779eaa; }
.replay-screen.light-theme.admin-light-theme :deep(.check-list b) { color: #9cb8bf; }
.replay-screen.light-theme.admin-light-theme :deep(.center-footer > text) { color: #668b9b; }
.replay-screen.light-theme.admin-light-theme :deep(.center-controls button.secondary) { color: #a9d6e8; border-color: rgba(68, 190, 236, .6); background: rgba(255, 255, 255, .07); }
.replay-screen.light-theme.admin-light-theme :deep(.robot-task-overlay) { color: #eaf9ff; }
.replay-screen.light-theme.admin-light-theme :deep(.overlay-head),
.replay-screen.light-theme.admin-light-theme :deep(.overlay-footer) { border-color: rgba(85, 205, 255, .3); background: linear-gradient(90deg, rgba(3, 23, 38, .94), rgba(3, 23, 38, .76)); box-shadow: 0 8px 24px rgba(0, 13, 22, .28); }
.replay-screen.light-theme.admin-light-theme :deep(.overlay-title) { color: #fff; }
.replay-screen.light-theme.admin-light-theme :deep(.overlay-stage-title) { color: #62d8ee; }
.replay-screen.light-theme.admin-light-theme :deep(.overlay-stage-title text),
.replay-screen.light-theme.admin-light-theme :deep(.task-facts text),
.replay-screen.light-theme.admin-light-theme :deep(.task-identity small) { color: #6f94a7; }
.replay-screen.light-theme.admin-light-theme :deep(.task-facts),
.replay-screen.light-theme.admin-light-theme :deep(.task-facts view) { border-color: rgba(112, 194, 232, .18); }
.replay-screen.light-theme.admin-light-theme :deep(.task-facts b) { color: #dff7ff; }
.replay-screen.light-theme.admin-light-theme :deep(.task-facts .progress-fact b) { color: #68d8ec; }
.replay-screen.light-theme.admin-light-theme :deep(.stage-selector) { border-color: rgba(103, 173, 205, .2); background: linear-gradient(90deg, rgba(3, 23, 38, .8), rgba(3, 23, 38, .54)); }
.replay-screen.light-theme.admin-light-theme :deep(.stage-selector::before) { background: rgba(112, 166, 186, .2); }
.replay-screen.light-theme.admin-light-theme :deep(.stage-chip) { color: #66899a; }
.replay-screen.light-theme.admin-light-theme :deep(.stage-chip.done) { color: #78bba7; }
.replay-screen.light-theme.admin-light-theme :deep(.stage-chip.active) { color: #eafaff; }
.replay-screen.light-theme.admin-light-theme :deep(.stage-index) { color: #66899a; border-color: rgba(117, 165, 184, .28); background: #071b2a; }
.replay-screen.light-theme.admin-light-theme :deep(.stage-chip.active .stage-index) { color: #dffbff; border-color: rgba(82, 216, 238, .85); background: rgba(20, 105, 136, .72); box-shadow: 0 0 10px rgba(42, 196, 230, .2); }
.replay-screen.light-theme.admin-light-theme :deep(.progress-track) { background: rgba(3, 24, 38, .48); }
.replay-screen.light-theme.admin-light-theme :deep(.task-identity text) { color: #9fd5eb; }
.replay-screen.light-theme.admin-light-theme :deep(.local-button.secondary) { color: #a9d6e8; border-color: rgba(68, 190, 236, .55); background: rgba(255, 255, 255, .055); }
.replay-screen.light-theme.admin-light-theme :deep(.debug-stages text) { color: #789aaa; border-color: rgba(116, 197, 255, .18); }

/* 浅色局部窗口：深色素材只保留在独立媒体画布内。 */
.replay-screen.light-theme.admin-light-theme :deep(.center-workflow-overlay) {
  color: var(--admin-light-text);
  border-color: #b9ddcc;
  background: rgba(252, 255, 253, .98);
  box-shadow: 0 16px 42px rgba(46, 91, 70, .18);
}
.replay-screen.light-theme.admin-light-theme :deep(.center-kicker),
.replay-screen.light-theme.admin-light-theme :deep(.overlay-stage-title),
.replay-screen.light-theme.admin-light-theme :deep(.task-facts .progress-fact b),
.replay-screen.light-theme.admin-light-theme :deep(.task-identity text) { color: var(--admin-light-primary); }
.replay-screen.light-theme.admin-light-theme :deep(.center-title),
.replay-screen.light-theme.admin-light-theme :deep(.overlay-title),
.replay-screen.light-theme.admin-light-theme :deep(.center-meta b),
.replay-screen.light-theme.admin-light-theme :deep(.task-facts b),
.replay-screen.light-theme.admin-light-theme :deep(.stage-card-head b),
.replay-screen.light-theme.admin-light-theme :deep(.video-status-card b) { color: var(--admin-light-text); }
.replay-screen.light-theme.admin-light-theme :deep(.center-status),
.replay-screen.light-theme.admin-light-theme :deep(.center-meta text),
.replay-screen.light-theme.admin-light-theme :deep(.overlay-stage-title text),
.replay-screen.light-theme.admin-light-theme :deep(.task-facts text),
.replay-screen.light-theme.admin-light-theme :deep(.task-identity small),
.replay-screen.light-theme.admin-light-theme :deep(.stage-card > text),
.replay-screen.light-theme.admin-light-theme :deep(.video-status-card text),
.replay-screen.light-theme.admin-light-theme :deep(.center-footer > text) { color: var(--admin-light-text-secondary); }
.replay-screen.light-theme.admin-light-theme :deep(.center-meta view) {
  border-color: var(--admin-light-border);
  background: var(--admin-light-surface-soft);
}
.replay-screen.light-theme.admin-light-theme :deep(.rail-line),
.replay-screen.light-theme.admin-light-theme :deep(.stage-selector::before) { background: #cfe3d8; }
.replay-screen.light-theme.admin-light-theme :deep(.flow-stage),
.replay-screen.light-theme.admin-light-theme :deep(.stage-chip) { color: var(--admin-light-text-muted); }
.replay-screen.light-theme.admin-light-theme :deep(.stage-dot),
.replay-screen.light-theme.admin-light-theme :deep(.stage-index) {
  color: var(--admin-light-text-secondary);
  border-color: #bfd8cc;
  background: #f1f8f4;
}
.replay-screen.light-theme.admin-light-theme :deep(.flow-stage.done),
.replay-screen.light-theme.admin-light-theme :deep(.stage-chip.done) { color: #16835f; }
.replay-screen.light-theme.admin-light-theme :deep(.flow-stage.done .stage-dot),
.replay-screen.light-theme.admin-light-theme :deep(.stage-chip.done .stage-index) {
  color: #16835f;
  border-color: #8fcab0;
  background: #e9f7f0;
}
.replay-screen.light-theme.admin-light-theme :deep(.flow-stage.active),
.replay-screen.light-theme.admin-light-theme :deep(.stage-chip.active) { color: #116f51; }
.replay-screen.light-theme.admin-light-theme :deep(.flow-stage.active .stage-dot),
.replay-screen.light-theme.admin-light-theme :deep(.stage-chip.active .stage-index) {
  color: #fff;
  border-color: var(--admin-light-primary);
  background: var(--admin-light-primary);
  box-shadow: 0 0 0 3px rgba(24, 167, 124, .12);
}
.replay-screen.light-theme.admin-light-theme :deep(.process-panel) {
  border-color: #bfdacf;
  background: #edf5f0;
  box-shadow: inset 0 0 0 8px #f7fbf8;
}
.replay-screen.light-theme.admin-light-theme :deep(.center-stage-visual) {
  opacity: .96;
  filter: saturate(.94) contrast(.98) brightness(1.08);
}
.replay-screen.light-theme.admin-light-theme :deep(.center-stage-video-layer) { background: #edf5f0; }
.replay-screen.light-theme.admin-light-theme :deep(.center-stage-video-backdrop) {
  opacity: .28;
  filter: blur(22px) saturate(.75) brightness(.85);
}
.replay-screen.light-theme.admin-light-theme :deep(.center-stage-video-tone) {
  background: linear-gradient(90deg, rgba(24, 69, 49, .14), transparent 20%, transparent 80%, rgba(24, 69, 49, .14));
  box-shadow: inset 0 0 34px rgba(30, 76, 55, .1);
}
.replay-screen.light-theme.admin-light-theme :deep(.scene-vignette) {
  background: linear-gradient(90deg, rgba(29, 72, 53, .1), transparent 30%, transparent 78%, rgba(29, 72, 53, .08));
  box-shadow: inset 0 0 34px rgba(31, 76, 56, .08);
}
.replay-screen.light-theme.admin-light-theme :deep(.stage-card),
.replay-screen.light-theme.admin-light-theme :deep(.video-status-card),
.replay-screen.light-theme.admin-light-theme :deep(.check-list),
.replay-screen.light-theme.admin-light-theme :deep(.check-list.video-mode) {
  color: var(--admin-light-text);
  border-color: #b9ddcc;
  background: rgba(255, 255, 255, .94);
  box-shadow: 0 7px 18px rgba(42, 83, 65, .14);
  backdrop-filter: none;
}
.replay-screen.light-theme.admin-light-theme :deep(.stage-card-head small),
.replay-screen.light-theme.admin-light-theme :deep(.video-status-card small),
.replay-screen.light-theme.admin-light-theme :deep(.check-list view.done),
.replay-screen.light-theme.admin-light-theme :deep(.check-list view.done b) { color: var(--admin-light-primary); }
.replay-screen.light-theme.admin-light-theme :deep(.stage-progress),
.replay-screen.light-theme.admin-light-theme :deep(.progress-track) { background: #dcebe3; }
.replay-screen.light-theme.admin-light-theme :deep(.stage-progress i),
.replay-screen.light-theme.admin-light-theme :deep(.progress-fill) {
  background: linear-gradient(90deg, var(--admin-light-primary), #5bcda3);
  box-shadow: none;
}
.replay-screen.light-theme.admin-light-theme :deep(.check-list view),
.replay-screen.light-theme.admin-light-theme :deep(.check-list b) { color: var(--admin-light-text-secondary); }
.replay-screen.light-theme.admin-light-theme :deep(.center-controls button),
.replay-screen.light-theme.admin-light-theme :deep(.local-button) {
  color: #fff;
  border-color: var(--admin-light-primary);
  background: var(--admin-light-primary);
}
.replay-screen.light-theme.admin-light-theme :deep(.center-controls button.secondary),
.replay-screen.light-theme.admin-light-theme :deep(.local-button.secondary) {
  color: var(--admin-light-text-secondary);
  border-color: var(--admin-light-border-strong);
  background: var(--admin-light-surface);
}
.replay-screen.light-theme.admin-light-theme :deep(.robot-task-overlay) {
  color: var(--admin-light-text);
  background: transparent;
}
.replay-screen.light-theme.admin-light-theme :deep(.overlay-head),
.replay-screen.light-theme.admin-light-theme :deep(.overlay-footer) {
  border-color: #c4ded2;
  background: rgba(255, 255, 255, .96);
  box-shadow: 0 6px 18px rgba(42, 83, 65, .12);
  backdrop-filter: none;
}
.replay-screen.light-theme.admin-light-theme :deep(.task-facts),
.replay-screen.light-theme.admin-light-theme :deep(.task-facts view) { border-color: var(--admin-light-border); }
.replay-screen.light-theme.admin-light-theme :deep(.stage-selector) {
  border-color: var(--admin-light-border);
  background: rgba(247, 251, 248, .97);
  backdrop-filter: none;
}
.replay-screen.light-theme.admin-light-theme :deep(.player-shell) {
  inset: 0;
  border: 0;
  border-radius: inherit;
  background: transparent;
  box-shadow: none;
}
.replay-screen.light-theme.admin-light-theme :deep(.robot-task-overlay .workflow-viewport),
.replay-screen.light-theme.admin-light-theme :deep(.workflow-viewport.transparent-environment) {
  background: transparent;
}
.replay-screen.light-theme.admin-light-theme :deep(.bin-workflow-viewport) {
  background: #edf5f0;
  box-shadow: none;
}
.replay-screen.light-theme.admin-light-theme :deep(.debug-stages text) {
  color: var(--admin-light-text-muted);
  border-color: var(--admin-light-border-strong);
}

.replay-screen.light-theme.admin-light-theme,
.replay-screen.light-theme.admin-light-theme .right-column,
.replay-screen.light-theme.admin-light-theme :deep(.timeline-list .uni-scroll-view),
.replay-screen.light-theme.admin-light-theme :deep(.tasks-section),
.replay-screen.light-theme.admin-light-theme :deep(.button-rail) {
  scrollbar-color: var(--admin-light-scroll-thumb) var(--admin-light-scroll-track);
}

@media (max-width: 1440px) and (min-width: 901px) {
  .replay-screen.light-theme.admin-light-theme .header-copy { min-width: 245px; }
  .replay-screen.light-theme.admin-light-theme .workspace { grid-template-columns: 220px minmax(0, 1fr) 265px; }
  .replay-screen.light-theme.admin-light-theme .filename { display: none; }
}

@media (max-width: 1180px) and (min-width: 901px) {
  .replay-screen.light-theme.admin-light-theme .workspace { grid-template-columns: 205px minmax(0, 1fr) 230px; }
  .replay-screen.light-theme.admin-light-theme .source-summary { display: none; }
}

@media (max-width: 900px) {
  .replay-screen.light-theme.admin-light-theme { height: auto; min-height: 100vh; overflow: auto; }
  .replay-screen.light-theme.admin-light-theme .workspace { display: flex; flex-direction: column; }
  .replay-screen.light-theme.admin-light-theme .left-column,
  .replay-screen.light-theme.admin-light-theme .center-column,
  .replay-screen.light-theme.admin-light-theme .right-column { min-height: auto; }
  .replay-screen.light-theme.admin-light-theme .right-column .entity-inspector.is-empty { flex-basis: 116px; min-height: 116px; }
}
</style>
