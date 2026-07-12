<template>
  <view class="replay-screen">
    <view class="header panel">
      <view class="header-copy">
        <view class="title">公园垃圾分类数字孪生回放</view>
        <view class="subtitle">基于现有事件协议检查“感知—决策—执行—反馈”闭环，不生成额外业务状态</view>
      </view>
      <view class="source-legend">
        <text v-for="source in sourceTypes" :key="source" :data-source="source" :class="['source-badge', sourceClass(source)]">{{ displaySourceLabel(source) }}</text>
      </view>
      <view class="header-actions">
        <picker mode="selector" :range="scenarioOptions" range-key="label" :value="scenarioIndex" @change="onScenarioChange">
          <view class="mode-select scenario-select">
            <text>回放场景</text>
            <b>{{ activeScenarioLabel }}</b>
          </view>
        </picker>
        <picker mode="selector" :range="modeOptions" range-key="label" :value="modeIndex" @change="onModeChange">
          <view class="mode-select">
            <text>数据文件</text>
            <b>{{ activeModeLabel }}</b>
          </view>
        </picker>
        <view class="filename" :title="filename">{{ displayFilename }}</view>
        <view class="header-button primary" @tap="loadReplay(activeMode, activeScenario)">刷新</view>
        <view class="header-button" @tap="goDashboard">清运大屏</view>
        <view class="header-button" @tap="goBack">返回</view>
      </view>
    </view>

    <view v-if="loading" class="loading panel">
      <view class="loading-ring"></view><text>正在读取原始回放 JSON…</text>
    </view>
    <view v-else-if="errorText" class="error panel">
      <view class="error-title">回放数据不可用</view>
      <view class="error-message">{{ errorText }}</view>
      <view class="header-button primary" @tap="loadReplay('sim', activeScenario)">读取当前场景</view>
    </view>

    <view v-else class="workspace">
      <view class="left-column">
        <ReplayTimeline class="timeline" :events="events" :current-index="currentIndex" @select="seek" />
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
            :scenario="activeScenario"
            :scenario-state="scenarioVisualState"
            :event-history="eventHistory"
            :robot-visual="robotVisualState"
            @select="selectEntity"
          />
          <RobotTaskReplayOverlay
            v-if="robotTaskWindowActive"
            :active="robotTaskWindowActive"
            :running="playing"
            :playback-rate="speed"
            :request="robotTaskRequest"
            :event-source="currentEvent?.source"
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
            :current-event="currentEvent"
            :event-history="eventHistory"
            :running="playing"
            :playback-rate="speed"
            :reset-key="visualRevision"
            :recovery-payload="recoveryEvent?.payload || {}"
            :initial-fill-pct="centerInitialFillPct"
            :stage-override="centerVisualStageOverride"
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

      <view class="right-column">
        <EntityInspector
          class="entity-inspector"
          :selected-id="selectedId"
          :id-map="idMap"
          :labels="labels"
          :current-event="currentEvent"
          :final-state="finalState"
          @select="selectEntity"
        />
        <ScenarioAnalyticsPanel
          v-if="activeScenario !== 'baseline'"
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
          <small>局部流程仅解释执行阶段；业务状态始终读取回放事件。</small>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import EntityInspector from '@/components/digital-twin/EntityInspector.vue'
import CenterWorkflowOverlay from '@/components/digital-twin/CenterWorkflowOverlay.vue'
import ParkReplayCanvas from '@/components/digital-twin/ParkReplayCanvas.vue'
import ReplayControls from '@/components/digital-twin/ReplayControls.vue'
import ReplayTimeline from '@/components/digital-twin/ReplayTimeline.vue'
import RobotTaskReplayOverlay from '@/components/digital-twin/RobotTaskReplayOverlay.vue'
import ScenarioAnalyticsPanel from '@/components/digital-twin/ScenarioAnalyticsPanel.vue'
import { fetchParkReplay } from '@/api/digital-twin-replay.js'
import { goBackFromAdminPage, jumpToAdminPage } from '@/utils/admin-page-nav.js'
import {
  centerPhaseFromEvent,
  currentTaskId,
  DATA_SOURCE_LABELS,
  eventEntityIds,
  eventPresentation,
  normalizeReplayBundle
} from '@/utils/park-replay.js'
import { deriveScenarioVisualState } from '@/utils/park-scenario-visuals.js'
import { displaySourceLabel } from '@/utils/source-display.js'

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
const activeMode = ref('sim')
const activeScenario = ref('baseline')
const bundle = ref(null)
const currentIndex = ref(0)
const selectedId = ref('robot_patrol_01')
const playing = ref(false)
const speed = ref(1)
const loading = ref(true)
const errorText = ref('')
const robotVisualFailed = ref(false)
const visualRevision = ref(0)
const robotVisualState = ref({ stage: '', mode: 'map', progress: 0, carrying: false, completed: false })
const centerVisualStageOverride = ref(null)
let playbackTimer = 0
let replayLoadRevision = 0

const events = computed(() => bundle.value?.replay?.events || [])
const currentEvent = computed(() => events.value[currentIndex.value] || null)
const eventHistory = computed(() => events.value.slice(0, currentIndex.value + 1))
const scenarioVisualState = computed(() => deriveScenarioVisualState(events.value, currentIndex.value))
const currentPresentation = computed(() => eventPresentation(currentEvent.value))
const labels = computed(() => bundle.value?.labels || {})
const idMap = computed(() => bundle.value?.idMap || { entries: {} })
const finalState = computed(() => bundle.value?.replay?.finalState || {})
const filename = computed(() => bundle.value?.filename || '')
const displayFilename = computed(() => filename.value
  ? filename.value.replace(/\.sim(?=\.json$)/i, '.replay')
  : '等待加载')
const affectedIds = computed(() => eventEntityIds(currentEvent.value))
const currentTaskIdValue = computed(() => currentTaskId(currentEvent.value))
const centerPhase = computed(() => centerPhaseFromEvent(currentEvent.value))
const activeModeLabel = computed(() => modeOptions.find(item => item.value === activeMode.value)?.label || '回放数据')
const activeScenarioLabel = computed(() => scenarioOptions.find(item => item.value === activeScenario.value)?.label || '正常闭环')
const scenarioIndex = computed(() => Math.max(0, scenarioOptions.findIndex(item => item.value === activeScenario.value)))
const modeIndex = computed(() => Math.max(0, modeOptions.findIndex(item => item.value === activeMode.value)))
const robotTaskWindowActive = computed(() => currentEvent.value?.eventType === 'ROBOT_TASK_REQUESTED')
const centerStartIndex = computed(() => events.value.findIndex(event => event.eventType === 'DEVICE_ARRIVED_AT_CENTER'))
const centerEndIndex = computed(() => events.value.findIndex(event => event.eventType === 'DEVICE_RECOVERED'))
const centerWindowActive = computed(() => centerStartIndex.value >= 0 && centerEndIndex.value >= centerStartIndex.value && currentIndex.value >= centerStartIndex.value && currentIndex.value <= centerEndIndex.value)
const recoveryEvent = computed(() => events.value.find(event => event.eventType === 'DEVICE_RECOVERED') || null)
const centerInitialFillPct = computed(() => {
  const end = centerStartIndex.value < 0 ? events.value.length : centerStartIndex.value
  const fillEvent = events.value.slice(0, end).reverse().find(event => event.eventType === 'BIN_FILL_UPDATED')
  return Number(fillEvent?.payload?.fillPct) || 0
})
const robotTaskRequest = computed(() => currentEvent.value?.payload?.request || {})
const robotTaskResetKey = computed(() => `${activeMode.value}:${activeScenario.value}:${filename.value}:${currentEvent.value?.sequence || 0}:${visualRevision.value}`)
const pendingBinFillEvent = computed(() => events.value
  .slice(currentIndex.value + 1)
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

const currentTaskEventStatus = computed(() => {
  if (currentEvent.value?.eventType === 'TASK_CREATED') return 'PENDING'
  if (currentEvent.value?.eventType === 'TASK_SUCCEEDED') return 'SUCCEEDED'
  if (currentEvent.value?.eventType === 'ROBOT_TASK_REQUESTED') return 'REQUESTED'
  if (currentEvent.value?.eventType === 'ROBOT_TASK_RESULT') return currentEvent.value?.payload?.result?.placement?.status || 'RESULT_RECEIVED'
  if (currentEvent.value?.eventType === 'RETURN_AND_REPLACEMENT_DISPATCHED') return 'DISPATCHED'
  return '当前事件无任务状态更新'
})
const taskStatusTone = computed(() => /SUCCEEDED|succeeded/i.test(currentTaskEventStatus.value) ? 'success' : /PENDING|REQUESTED/i.test(currentTaskEventStatus.value) ? 'warning' : '')
const currentTaskFinalStatus = computed(() => finalState.value?.tasks?.[currentTaskIdValue.value]?.status || '—')

const sourceClass = value => String(value || '').toLowerCase().replace(/_/g, '-')

function clearPlaybackTimer() {
  if (playbackTimer) clearTimeout(playbackTimer)
  playbackTimer = 0
}

function schedulePlayback() {
  clearPlaybackTimer()
  if (!playing.value || !events.value.length) return
  if (robotTaskWindowActive.value && !robotVisualFailed.value) return
  playbackTimer = setTimeout(() => {
    if (currentIndex.value >= events.value.length - 1) {
      playing.value = false
      clearPlaybackTimer()
      return
    }
    currentIndex.value += 1
    schedulePlayback()
  }, Math.round(1500 / speed.value))
}

function play() {
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
function pause() { playing.value = false; clearPlaybackTimer() }
function reset() { pause(); centerVisualStageOverride.value = null; visualRevision.value += 1; currentIndex.value = 0; selectedId.value = 'robot_patrol_01' }
function previous() { pause(); seek(currentIndex.value - 1) }
function next() { pause(); seek(currentIndex.value + 1) }
function setSpeed(value) { speed.value = Number(value) || 1; if (playing.value) schedulePlayback() }
function seek(value, { preserveCenterOverride = false } = {}) {
  const max = Math.max(0, events.value.length - 1)
  if (!preserveCenterOverride) centerVisualStageOverride.value = null
  visualRevision.value += 1
  currentIndex.value = Math.max(0, Math.min(max, Number(value) || 0))
  if (playing.value) schedulePlayback()
}
function selectEntity(id) { if (id) selectedId.value = id }

function replayCenterVisual(payload = {}) {
  if (payload.stageKey && Number(payload.sequence) === Number(currentEvent.value?.sequence)) {
    centerVisualStageOverride.value = { stageKey: payload.stageKey, sequence: Number(payload.sequence) }
  }
  visualRevision.value += 1
  if (!playing.value) play()
  else schedulePlayback()
}

function seekCenterStage(payload = {}) {
  const targetIndex = events.value.findIndex(event => event.eventType === payload.eventType)
  if (targetIndex < 0 || !payload.stageKey) return
  const targetEvent = events.value[targetIndex]
  centerVisualStageOverride.value = { stageKey: payload.stageKey, sequence: Number(targetEvent.sequence) }
  seek(targetIndex, { preserveCenterOverride: true })
}

function handleRobotTaskVisualComplete() {
  robotVisualState.value = { stage: 'return', mode: 'map', progress: 1, carrying: false, completed: true }
  if (!playing.value || !robotTaskWindowActive.value) return
  if (currentIndex.value < events.value.length - 1) currentIndex.value += 1
  schedulePlayback()
}

function handleRobotVisualState(payload) {
  robotVisualState.value = payload || { stage: '', mode: 'map', progress: 0, carrying: false, completed: false }
}

function handleRobotTaskVisualError() {
  robotVisualFailed.value = true
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
    errorText.value = error?.message || String(error)
  } finally {
    if (loadRevision === replayLoadRevision) loading.value = false
  }
}

function onModeChange(event) {
  const option = modeOptions[Number(event?.detail?.value)] || modeOptions[0]
  loadReplay(option.value, option.value === 'isaac' ? 'baseline' : activeScenario.value)
}
function onScenarioChange(event) {
  const option = scenarioOptions[Number(event?.detail?.value)] || scenarioOptions[0]
  loadReplay('sim', option.value)
}
function goDashboard() { jumpToAdminPage('collectionDashboard', { from: 'digitalTwinReplay' }) }
function goBack() { goBackFromAdminPage('digitalTwinReplay', { fallback: 'collectionDashboard' }) }

watch(currentEvent, event => {
  if (centerVisualStageOverride.value && Number(event?.sequence) !== Number(centerVisualStageOverride.value.sequence)) {
    centerVisualStageOverride.value = null
  }
  robotVisualFailed.value = false
  if (event?.eventType !== 'ROBOT_TASK_REQUESTED') {
    robotVisualState.value = { stage: '', mode: 'map', progress: 0, carrying: false, completed: false }
  }
  const ids = eventEntityIds(event)
  if (ids.length) selectedId.value = ids[0]
})

onMounted(() => loadReplay('sim'))
onBeforeUnmount(clearPlaybackTimer)
</script>

<style scoped>
page { background: #071726; }
.replay-screen {
  --panel: rgba(7,27,43,.86); --line: rgba(116,197,255,.28); --text: #e8f8ff; --muted: #8fb1c4;
  min-height: 100vh; height: 100vh; width: 100%; padding: 9px; box-sizing: border-box; overflow: hidden;
  display: flex; flex-direction: column; gap: 8px; color: var(--text);
  font-family: "Source Han Sans SC", "Microsoft YaHei", sans-serif;
  background: radial-gradient(900px 500px at -15% 20%, rgba(44,143,255,.2), transparent 55%), linear-gradient(160deg,#071726,#0c2840);
}
.panel { border: 1px solid var(--line); border-radius: 12px; background: var(--panel); backdrop-filter: blur(6px); box-sizing: border-box; }
.header { min-height: 62px; padding: 9px 12px; display: flex; align-items: center; gap: 16px; }
.header-copy { min-width: 330px; }.title { font-size: 21px; font-weight: 750; letter-spacing: 1px; text-shadow: 0 0 18px rgba(36,217,255,.36); }.subtitle { color: var(--muted); font-size: 10px; margin-top: 4px; }
.source-legend { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }.source-badge { padding: 3px 6px; border: 1px solid rgba(80,164,217,.46); border-radius: 5px; color: #91cef2; background: rgba(23,91,144,.25); font: 700 9px/1.2 ui-monospace, Consolas, monospace; }.source-badge.isaac-realtime { color: #c6b0ff; border-color: rgba(147,105,255,.52); background: rgba(88,53,143,.3); }.source-badge.backend-api { color: #8aefb8; border-color: rgba(48,205,123,.48); background: rgba(28,122,74,.28); }.source-badge.visual-aid { color: #ffd274; border-color: rgba(245,182,72,.5); background: rgba(132,87,16,.28); }
.header-actions { margin-left: auto; display: flex; align-items: center; gap: 7px; min-width: 0; }.mode-select { min-width: 132px; padding: 6px 9px; border: 1px solid rgba(126,196,239,.28); border-radius: 8px; background: rgba(8,35,54,.68); }.mode-select text,.mode-select b { display: block; }.mode-select text { color: #749aae; font-size: 9px; }.mode-select b { color: #dff7ff; font-size: 11px; margin-top: 2px; }.filename { max-width: 180px; padding: 7px 9px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border: 1px solid rgba(126,196,239,.2); border-radius: 8px; color: #8eb8ca; background: rgba(8,35,54,.54); font: 10px/1 ui-monospace, Consolas, monospace; }.header-button { padding: 8px 10px; border: 1px solid rgba(126,196,239,.28); border-radius: 8px; color: #c4deea; background: rgba(255,255,255,.08); font-size: 11px; white-space: nowrap; }.header-button.primary { color: #fff; border-color: rgba(58,159,235,.72); background: linear-gradient(135deg,#1769c9,#2c8fff); }
.workspace { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(245px,19%) minmax(520px,1fr) minmax(270px,21%); gap: 8px; }.left-column,.center-column,.right-column { min-height: 0; display: flex; flex-direction: column; gap: 8px; }.timeline { flex: 1; }.current-event { flex: 0 0 158px; padding: 11px 12px; overflow: hidden; }.section-heading { display: flex; justify-content: space-between; align-items: center; color: #8bc9e7; font-size: 11px; font-weight: 700; letter-spacing: .5px; }.section-heading > text:last-child { color: #62d8ff; font: 700 10px/1 ui-monospace, Consolas, monospace; }.current-title { color: #f0fbff; font-size: 15px; font-weight: 700; margin-top: 10px; }.current-desc { color: #83a7b9; font-size: 10px; margin: 4px 0 8px; }.event-meta { min-height: 20px; display: flex; justify-content: space-between; gap: 10px; color: #7499ab; font-size: 9px; }.event-meta b { max-width: 72%; color: #cfe9f5; font-weight: 600; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.event-meta b.sim { color: #91cef2; }.event-meta b.isaac-realtime { color: #c6b0ff; }.event-meta b.backend-api { color: #8aefb8; }.event-meta b.visual-aid { color: #ffd274; }
.park-stage { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }.park-map { flex: 1; }.entity-inspector { flex: 1; }.state-panel { flex: 0 0 132px; padding: 11px 12px; }.state-row { min-height: 22px; display: flex; align-items: center; justify-content: space-between; gap: 8px; color: #779eaf; font-size: 9px; }.state-row b { color: #dceef6; font-weight: 600; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.state-row b.success { color: #79edb5; }.state-row b.warning { color: #ffc76c; }
.visual-aid-note { flex: 0 0 62px; padding: 10px 12px; }.visual-aid-note text,.visual-aid-note small { display: block; }.visual-aid-note text { color: #dceff7; font-size: 10px; font-weight: 700; }.visual-aid-note small { margin-top: 5px; color: #6d93a6; font-size: 8px; line-height: 1.5; }
.loading,.error { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: #8fb7ca; }.loading-ring { width: 30px; height: 30px; border: 3px solid rgba(36,217,255,.18); border-top-color: #24d9ff; border-radius: 50%; animation: spin .8s linear infinite; }.error-title { color: #ffd0d2; font-size: 18px; font-weight: 700; }.error-message { color: #a8c2cf; font-size: 11px; }.error .header-button { flex: none; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 1180px) { .header { flex-wrap: wrap; }.header-copy { min-width: 280px; }.source-legend { display: none; }.workspace { grid-template-columns: 230px 1fr 250px; }.filename { display: none; } }
@media (max-width: 900px) { .replay-screen { height: auto; min-height: 100vh; overflow: auto; }.header { align-items: flex-start; }.header-actions { width: 100%; margin-left: 0; overflow-x: auto; }.workspace { display: flex; flex-direction: column; }.left-column,.center-column,.right-column { min-height: auto; }.timeline { height: 360px; flex: none; }.park-stage { flex: none; min-height: auto; }.park-map { height: 520px; flex: none; }.entity-inspector { min-height: 430px; flex: none; }.current-event,.state-panel { flex-basis: auto; } }
@media (max-width: 560px) { .replay-screen { padding: 6px; }.title { font-size: 17px; }.subtitle { display: none; }.header-copy { min-width: 100%; }.mode-select { min-width: 116px; }.park-map { height: 430px; }.workspace { gap: 6px; } }
</style>
