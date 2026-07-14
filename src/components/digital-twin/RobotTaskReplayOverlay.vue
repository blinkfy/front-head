<template>
  <view class="robot-task-overlay" :data-event-source="eventSource">
    <view class="overlay-head">
      <view class="overlay-title-group">
        <view class="overlay-title">{{ viewMode === 'bin' ? '智能垃圾桶内部处理' : '机器人局部任务' }}</view>
        <view class="overlay-stage-title">{{ activeDisplayStage.label }}<text>/ {{ activeDisplayStage.key.toUpperCase() }}</text></view>
      </view>
      <view class="task-facts">
        <view><text>垃圾类别</text><b>{{ garbageText }}</b></view>
        <view><text>目标桶</text><b>{{ targetBinText }}</b></view>
        <view><text>任务</text><b>{{ taskId || '—' }}</b></view>
        <view class="progress-fact"><text>阶段进度</text><b>{{ Math.round(overallProgress) }}%</b></view>
      </view>
    </view>

    <view :class="['stage-selector', { 'bin-stages': viewMode === 'bin' }]" :aria-label="viewMode === 'bin' ? '智能桶内部处理阶段' : '机器人局部任务阶段'">
      <view
        v-for="(stage, index) in displayStages"
        :key="stage.key"
        :class="['stage-chip', { active: index === activeDisplayStageIndex, done: index < activeDisplayStageIndex }]"
        :data-stage="stage.key"
        @tap="jumpToDisplayStage(index)"
      >
        <text class="stage-index">{{ index + 1 }}</text>
        <text>{{ stage.label }}</text>
      </view>
    </view>

    <view class="player-shell" :data-render-stage="renderStage" :data-view-mode="viewMode">
      <SortingWorkflowPlayer
        v-show="viewMode === 'robot'"
        ref="playerRef"
        class="task-player"
        :stage="renderStage"
        :running="active && running && !completed && viewMode === 'robot'"
        :playback-rate="playbackRate"
        :complete-on-stage-end="true"
        :six-stage-mode="true"
        :dynamic-object="true"
        :object-id="request?.garbageId"
        :object-class="request?.expectedClassName"
        :target-bin-id="request?.targetBinId"
        :transparent-environment="true"
        :show-status="false"
        @ready="handlePlayerReady"
        @framechange="handleFrameChange"
        @stageend="handleStageEnd"
        @visualchange="handleVisualChange"
        @error="handlePlayerError"
      />
      <SmartBinWorkflowPlayer
        v-show="viewMode === 'bin'"
        ref="binPlayerRef"
        class="task-player"
        :active="active && viewMode === 'bin'"
        :running="active && running && !completed && viewMode === 'bin'"
        :playback-rate="playbackRate"
        :object-id="request?.garbageId"
        :object-class="request?.expectedClassName"
        :target-bin-id="request?.targetBinId"
        :fill-target-pct="fillTargetPct"
        :fill-event-sequence="fillEventSequence"
        :reset-key="resetKey"
        :visual-version="binVisualVersion"
        :debug-calibration="debug && binDebugCalibration"
        @progress="handleBinProgress"
        @complete="handleBinComplete"
        @error="handlePlayerError"
      />
      <view class="progress-track"><view class="progress-fill" :style="{ width: `${overallProgress}%` }"></view></view>
    </view>

    <view class="overlay-footer">
      <view class="task-identity">
        <text>{{ taskId || '未登记任务 ID' }}</text>
        <small>{{ identityDetail }}</small>
      </view>
      <view class="local-controls">
        <button class="local-button" size="mini" @tap="running ? emit('pause') : emit('play')">
          {{ running ? '暂停' : '继续' }}
        </button>
        <button class="local-button secondary" size="mini" @tap="replay">重播</button>
      </view>
    </view>

    <view v-if="debug" class="debug-stages">
      <text>{{ eventSource }}</text>
      <text>{{ visualState.source || 'NO_ASSET_SOURCE' }}</text>
      <text v-for="stage in LOGICAL_STAGES" :key="stage.key">{{ stage.key.toUpperCase() }}</text>
    </view>
  </view>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import SortingWorkflowPlayer from '@/components/SortingWorkflowPlayer.vue'
import SmartBinWorkflowPlayer from '@/components/digital-twin/SmartBinWorkflowPlayer.vue'
import { resolveRobotTaskCamera } from '@/config/robot-task-shot-config.js'
import { SMART_BIN_PHASES } from '@/config/smart-bin-workflow.js'

const LOGICAL_STAGES = Object.freeze([
  { key: 'scan', label: '扫描识别' },
  { key: 'approach', label: '接近目标' },
  { key: 'grasp', label: '抓取' },
  { key: 'transport', label: '搬运' },
  { key: 'place', label: '分类投放' },
  { key: 'return', label: '返回复位' }
])

// release 是 PLACE 的内部落桶动作，不作为第七个业务展示阶段。
const RENDER_STEPS = Object.freeze([
  { render: 'scan', logical: 0 },
  { render: 'approach', logical: 1 },
  { render: 'grasp', logical: 2 },
  { render: 'transport', logical: 3 },
  { render: 'place', logical: 4 },
  { render: 'release', logical: 4 },
  { render: 'return', logical: 5 }
])

const props = defineProps({
  active: { type: Boolean, default: false },
  running: { type: Boolean, default: false },
  playbackRate: { type: Number, default: 1 },
  request: { type: Object, default: () => ({}) },
  eventSource: { type: String, default: 'SIM' },
  garbageLabel: { type: String, default: '' },
  targetBinLabel: { type: String, default: '' },
  fillTargetPct: { type: Number, default: 0 },
  fillEventSequence: { type: Number, default: 0 },
  resetKey: { type: [String, Number], default: '' },
  binVisualVersion: { type: String, default: 'cutaway-raster-v3' },
  binDebugCalibration: { type: Boolean, default: false },
  debug: { type: Boolean, default: false }
})

const emit = defineEmits(['complete', 'pause', 'play', 'error', 'visual-state'])
const playerRef = ref(null)
const binPlayerRef = ref(null)
const renderStepIndex = ref(0)
const stageProgress = ref(0)
const completed = ref(false)
const visualState = ref({ key: '', label: '对象素材未加载', placeholder: true, source: '' })
const viewMode = ref('robot')
const binProgressState = ref({ phase: 'intake', phaseLabel: '进入投入口', phaseIndex: 0, localProgress: 0, progress: 0, previewFillPct: 0 })
const robotReturnComplete = ref(false)
const binComplete = ref(false)
const playerReady = ref(false)

const renderStage = computed(() => RENDER_STEPS[renderStepIndex.value]?.render || 'scan')
const logicalStageIndex = computed(() => RENDER_STEPS[renderStepIndex.value]?.logical || 0)
const activeLogicalStage = computed(() => LOGICAL_STAGES[logicalStageIndex.value])
const displayStages = computed(() => viewMode.value === 'bin' ? SMART_BIN_PHASES : LOGICAL_STAGES)
const activeDisplayStageIndex = computed(() => viewMode.value === 'bin'
  ? Math.max(0, Number(binProgressState.value.phaseIndex) || 0)
  : logicalStageIndex.value)
const activeDisplayStage = computed(() => viewMode.value === 'bin'
  ? { key: binProgressState.value.phase || 'intake', label: binProgressState.value.phaseLabel || '进入投入口' }
  : activeLogicalStage.value)
const taskId = computed(() => props.request?.taskId || '')
const garbageText = computed(() => props.garbageLabel || props.request?.expectedClassName || props.request?.garbageId || '未登记')
const targetBinText = computed(() => props.targetBinLabel || props.request?.targetBinId || '未登记')
const identityDetail = computed(() => {
  if (viewMode.value === 'bin') {
    const target = Number(props.fillTargetPct) || 0
    return `桶内仓位显示 ${binProgressState.value.previewFillPct}% / 事件 #${props.fillEventSequence || '—'} 目标 ${target}%`
  }
  return `垃圾：${garbageText.value} · 目标：${targetBinText.value}`
})
const overallProgress = computed(() => {
  if (completed.value) return 100
  if (viewMode.value === 'bin') return Math.min(100, (Number(binProgressState.value.progress) || 0) * 100)
  let withinLogicalStage = stageProgress.value
  if (renderStage.value === 'place') withinLogicalStage = stageProgress.value * .65
  if (renderStage.value === 'release') withinLogicalStage = .65 + stageProgress.value * .35
  return Math.min(100, (logicalStageIndex.value + withinLogicalStage) / LOGICAL_STAGES.length * 100)
})
const taskCamera = computed(() => resolveRobotTaskCamera(renderStage.value, stageProgress.value))

function resetSequence() {
  renderStepIndex.value = 0
  stageProgress.value = 0
  completed.value = false
  viewMode.value = 'robot'
  robotReturnComplete.value = false
  binComplete.value = false
  binProgressState.value = { phase: 'intake', phaseLabel: '进入投入口', phaseIndex: 0, localProgress: 0, progress: 0, previewFillPct: 0 }
  nextTick(() => playerRef.value?.setStage('scan', 0))
}

function replay() {
  resetSequence()
  if (!props.running) emit('play')
}

function jumpToDisplayStage(logicalIndex) {
  if (viewMode.value === 'bin') {
    const phase = SMART_BIN_PHASES[logicalIndex]
    if (phase) nextTick(() => binPlayerRef.value?.setPhase?.(phase.key, 0))
    return
  }
  const nextIndex = RENDER_STEPS.findIndex(step => step.logical === logicalIndex)
  renderStepIndex.value = Math.max(0, nextIndex)
  stageProgress.value = 0
  completed.value = false
  viewMode.value = 'robot'
  robotReturnComplete.value = false
  binComplete.value = false
  nextTick(() => playerRef.value?.setStage(renderStage.value, 0))
}

function handleFrameChange(payload) {
  if (payload?.stage !== renderStage.value) return
  stageProgress.value = Math.max(0, Math.min(1, Number(payload.progress) || 0))
}

function handlePlayerReady() {
  playerReady.value = true
}

function handleStageEnd(payload) {
  if (!props.active || payload?.stage !== renderStage.value || completed.value) return
  if (payload.stage === 'release') {
    renderStepIndex.value = RENDER_STEPS.length - 1
    stageProgress.value = 0
    viewMode.value = 'bin'
    robotReturnComplete.value = false
    binComplete.value = false
    return
  }
  if (payload.stage === 'return') {
    robotReturnComplete.value = true
    if (binComplete.value) finishWorkflow()
    return
  }
  if (renderStepIndex.value < RENDER_STEPS.length - 1) {
    renderStepIndex.value += 1
    stageProgress.value = 0
    return
  }
  finishWorkflow()
}

function finishWorkflow() {
  if (completed.value) return
  completed.value = true
  stageProgress.value = 1
  emit('complete', { taskId: taskId.value, source: 'VISUAL_AID', workflows: ['SIMULATED_SORTING_WORKFLOW', 'SIMULATED_BIN_WORKFLOW'] })
}

function handleBinProgress(payload) {
  binProgressState.value = payload || binProgressState.value
}

function handleBinComplete() {
  binComplete.value = true
  viewMode.value = 'robot'
  renderStepIndex.value = RENDER_STEPS.length - 1
  stageProgress.value = 0
  nextTick(() => playerRef.value?.setStage('return', 0))
}

function handlePlayerError(error) {
  emit('error', error)
}

function handleVisualChange(payload) {
  visualState.value = payload || { key: '', label: '对象素材未加载', placeholder: true, source: '' }
}

watch(() => props.resetKey, resetSequence, { flush: 'post' })
watch(() => props.active, active => {
  if (active) resetSequence()
  else {
    playerRef.value?.pause?.()
    binPlayerRef.value?.pause?.()
  }
}, { flush: 'post' })
watch(
  [renderStage, stageProgress, viewMode, () => binProgressState.value.progress, completed, playerReady, () => props.active],
  () => {
    const stage = viewMode.value === 'bin' ? 'bin_internal' : renderStage.value
    const carrying = viewMode.value === 'robot' && ['transport', 'place', 'release'].includes(stage)
    const camera = viewMode.value === 'robot' && props.active && playerReady.value ? taskCamera.value : null
    emit('visual-state', {
      stage,
      mode: viewMode.value,
      active: props.active && playerReady.value,
      progress: viewMode.value === 'bin' ? Number(binProgressState.value.progress) || 0 : stageProgress.value,
      carrying,
      showCarriedMarker: carrying,
      completed: completed.value,
      taskId: taskId.value,
      robotId: props.request?.robotId || '',
      camera: camera ? {
        scale: camera.cameraScale,
        focusX: camera.focus[0],
        focusY: camera.focus[1]
      } : null,
      source: 'VISUAL_AID'
    })
  },
  { immediate: true, flush: 'sync' }
)
</script>

<style scoped>
.robot-task-overlay {
  position: absolute; inset: 0; z-index: 18; min-height: 0; overflow: hidden;
  box-sizing: border-box; color: #eaf9ff; background: transparent; pointer-events: none;
}
.overlay-head { position:absolute; z-index:5; top:10px; right:12px; left:12px; display:grid; grid-template-columns:minmax(190px,.72fr) minmax(0,1.6fr); align-items:center; gap:16px; min-height:46px; padding:7px 10px; box-sizing:border-box; border:1px solid rgba(85,205,255,.3); border-radius:10px; background:linear-gradient(90deg,rgba(3,23,38,.94),rgba(3,23,38,.76)); box-shadow:0 8px 24px rgba(0,13,22,.28); backdrop-filter:blur(7px); pointer-events:auto; animation:hud-enter-top .38s cubic-bezier(.22,1,.36,1) both; }
.overlay-title-group { min-width: 0; }
.overlay-title { color: #fff; font-size: 17px; font-weight: 760; letter-spacing: .1px; }
.overlay-stage-title { margin-top: 4px; color: #62d8ee; font-size: 10px; font-weight: 700; }
.overlay-stage-title text { margin-left: 5px; color: #7298aa; font: 650 8px/1.2 ui-monospace,Consolas,monospace; }
.task-facts { display: grid; grid-template-columns: 1fr 1fr 1.25fr .68fr; min-width: 0; border-left: 1px solid rgba(112,194,232,.2); }
.task-facts view { min-width: 0; padding: 2px 10px; border-right: 1px solid rgba(112,194,232,.16); }
.task-facts text,.task-facts b { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.task-facts text { color: #6f94a7; font-size: 8px; font-weight: 560; }
.task-facts b { margin-top: 4px; color: #dff7ff; font-size: 10px; font-weight: 720; }
.task-facts .progress-fact b { color: #68d8ec; font: 760 12px/1.1 ui-monospace,Consolas,monospace; }
.stage-selector { position:absolute; z-index:5; top:70px; right:12px; left:12px; display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:0; margin:0; padding:7px 0 6px; border-top:1px solid rgba(103,173,205,.2); border-bottom:1px solid rgba(103,173,205,.18); background:linear-gradient(90deg,rgba(3,23,38,.8),rgba(3,23,38,.54)); backdrop-filter:blur(5px); pointer-events:auto; animation:hud-enter-top .42s .04s cubic-bezier(.22,1,.36,1) both; }
.stage-selector::before { position: absolute; top: 14px; right: 8.5%; left: 8.5%; height: 1px; content: ''; background: rgba(112,166,186,.2); }
.stage-selector.bin-stages { grid-template-columns:repeat(8,minmax(0,1fr)); }
.stage-chip { position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; gap: 5px; min-width: 0; padding: 2px 4px; border: 0; color: #66899a; background: transparent; font-size: 8px; cursor: pointer; }
.stage-chip.done { color: #78bba7; }
.stage-chip.active { color: #eafaff; }
.stage-index { display: grid; place-items: center; width: 16px; height: 16px; flex: 0 0 16px; border: 1px solid rgba(117,165,184,.28); border-radius: 50%; color: #66899a; background: #071b2a; font: 700 8px/1 ui-monospace,Consolas,monospace; }
.stage-chip.done .stage-index { color: #7ed2b4; border-color: rgba(74,183,143,.46); }
.stage-chip.active .stage-index { color: #dffbff; border-color: rgba(82,216,238,.85); background: rgba(20,105,136,.72); box-shadow: 0 0 10px rgba(42,196,230,.2); }
.player-shell { position:absolute; z-index:1; inset:0; min-height:0; margin:0; overflow:hidden; border:0; border-radius:inherit; background:transparent; box-shadow:none; pointer-events:none; }
.task-player { width: 100%; height: 100%; }
.progress-track { position:absolute; z-index:4; right:18px; bottom:58px; left:18px; height:3px; overflow:hidden; border-radius:999px; background:rgba(3,24,38,.48); }
.progress-fill { height: 100%; border-radius: inherit; background: linear-gradient(90deg,#4aa892,#4cbad0); transition: width .1s linear; }
.overlay-footer { position:absolute; z-index:5; right:12px; bottom:10px; left:12px; display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:40px; padding:7px 10px; box-sizing:border-box; border:1px solid rgba(85,205,255,.24); border-radius:9px; background:linear-gradient(90deg,rgba(3,23,38,.9),rgba(3,23,38,.7)); box-shadow:0 -8px 24px rgba(0,13,22,.2); backdrop-filter:blur(6px); pointer-events:auto; animation:hud-enter-bottom .4s cubic-bezier(.22,1,.36,1) both; }
.task-identity { min-width: 0; }
.task-identity text,.task-identity small { display: block; }
.task-identity text { overflow: hidden; color: #9fd5eb; font: 700 9px/1.2 ui-monospace,Consolas,monospace; text-overflow: ellipsis; white-space: nowrap; }
.task-identity small { margin-top: 3px; color: #668a9b; font-size: 8px; }
.local-controls { display: flex; gap: 6px; }
.local-button { margin: 0; padding: 0 12px; border: 1px solid rgba(68,190,236,.55); color: #fff; background: #1679a7; font-size: 10px; }
.local-button.secondary { color: #a9d6e8; background: rgba(255,255,255,.055); }
.debug-stages { display: flex; gap: 4px; margin-top: 5px; overflow: hidden; }
.debug-stages text { padding: 3px 5px; color: #789aaa; border: 1px dashed rgba(116,197,255,.18); font: 7px/1 ui-monospace,Consolas,monospace; white-space: nowrap; }
@keyframes hud-enter-top { from { opacity:0; transform:translateY(-18px); } to { opacity:1; transform:translateY(0); } }
@keyframes hud-enter-bottom { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
@media (max-width: 900px) {
  .robot-task-overlay { position:absolute; inset:0; min-height:0; }
  .overlay-head { grid-template-columns:1fr; gap:7px; }
  .task-facts { border-left: 0; }
  .stage-selector { top:94px; }
  .stage-selector.bin-stages { grid-template-columns:repeat(4,minmax(0,1fr)); row-gap:5px; }
}
@media (max-width: 560px) {
  .task-facts { grid-template-columns: repeat(2,1fr); row-gap: 5px; }
  .stage-selector { top:132px; grid-template-columns:repeat(3,1fr); row-gap:6px; }
  .stage-selector::before,.task-identity small { display: none; }
  .stage-chip { font-size: 7px; }
}
</style>
