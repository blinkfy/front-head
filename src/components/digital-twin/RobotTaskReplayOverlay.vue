<template>
  <view class="robot-task-overlay" :data-event-source="eventSource">
    <view class="overlay-head">
      <view>
        <view class="overlay-kicker">LOCAL TASK · PROCESS VIEW</view>
        <view class="overlay-title">{{ viewMode === 'bin' ? '智能垃圾桶内部处理' : '机器人局部任务解释' }}</view>
      </view>
      <view class="source-stack">
        <text class="source-badge">局部任务</text>
        <text class="source-badge simulated">{{ viewMode === 'bin' ? '桶内分类' : '六阶段流程' }}</text>
        <text class="source-note">业务状态来自 {{ displaySourceLabel(eventSource) }}</text>
      </view>
    </view>

    <view class="task-facts">
      <view><text>当前阶段</text><b>{{ activeDisplayStage.label }} / {{ activeDisplayStage.key.toUpperCase() }}</b></view>
      <view><text>垃圾类别</text><b>{{ garbageText }}</b></view>
      <view><text>目标桶</text><b>{{ targetBinText }}</b></view>
      <view><text>阶段进度</text><b>{{ Math.round(overallProgress) }}%</b></view>
    </view>

    <view class="stage-selector" aria-label="机器人局部任务阶段">
      <view
        v-for="(stage, index) in LOGICAL_STAGES"
        :key="stage.key"
        :class="['stage-chip', { active: index === logicalStageIndex, done: index < logicalStageIndex }]"
        @tap="jumpToStage(index)"
      >
        <text class="stage-index">{{ index + 1 }}</text>
        <text>{{ stage.label }}</text>
      </view>
    </view>

    <view class="player-shell">
      <SortingWorkflowPlayer
        v-show="viewMode === 'robot'"
        ref="playerRef"
        class="task-player"
        :stage="renderStage"
        :running="running && !completed && viewMode === 'robot'"
        :playback-rate="playbackRate"
        :complete-on-stage-end="true"
        :six-stage-mode="true"
        :dynamic-object="true"
        :object-id="request?.garbageId"
        :object-class="request?.expectedClassName"
        :target-bin-id="request?.targetBinId"
        :show-status="false"
        @framechange="handleFrameChange"
        @stageend="handleStageEnd"
        @visualchange="handleVisualChange"
        @error="handlePlayerError"
      />
      <SmartBinWorkflowPlayer
        v-show="viewMode === 'bin'"
        ref="binPlayerRef"
        class="task-player"
        :active="viewMode === 'bin'"
        :running="running && !completed"
        :playback-rate="playbackRate"
        :object-id="request?.garbageId"
        :object-class="request?.expectedClassName"
        :target-bin-id="request?.targetBinId"
        :fill-target-pct="fillTargetPct"
        :fill-event-sequence="fillEventSequence"
        :reset-key="resetKey"
        @progress="handleBinProgress"
        @complete="handleBinComplete"
        @error="handlePlayerError"
      />
      <view class="progress-track"><view class="progress-fill" :style="{ width: `${overallProgress}%` }"></view></view>
    </view>

    <view class="overlay-footer">
      <view class="task-identity">
        <text>{{ taskId || '未登记任务 ID' }}</text>
        <small>{{ identityDetail }}；不写回业务状态</small>
      </view>
      <view class="local-controls">
        <button class="local-button" size="mini" @tap="running ? emit('pause') : emit('play')">
          {{ running ? '暂停' : '继续' }}
        </button>
        <button class="local-button secondary" size="mini" @tap="replay">重播</button>
      </view>
    </view>

    <view v-if="debug" class="debug-stages">
      <text v-for="stage in LOGICAL_STAGES" :key="stage.key">{{ stage.key.toUpperCase() }}</text>
    </view>
  </view>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { displaySourceLabel } from '@/utils/source-display.js'
import SortingWorkflowPlayer from '@/components/SortingWorkflowPlayer.vue'
import SmartBinWorkflowPlayer from '@/components/digital-twin/SmartBinWorkflowPlayer.vue'

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
  debug: { type: Boolean, default: false }
})

const emit = defineEmits(['complete', 'pause', 'play', 'error', 'visual-state'])
const playerRef = ref(null)
const binPlayerRef = ref(null)
const renderStepIndex = ref(0)
const stageProgress = ref(0)
const completed = ref(false)
const visualState = ref({ key: '', label: '视觉占位', placeholder: true })
const viewMode = ref('robot')
const binProgressState = ref({ phase: 'inlet', phaseLabel: '进入投入口', progress: 0, previewFillPct: 0 })
const robotReturnComplete = ref(false)
const binComplete = ref(false)

const renderStage = computed(() => RENDER_STEPS[renderStepIndex.value]?.render || 'scan')
const logicalStageIndex = computed(() => RENDER_STEPS[renderStepIndex.value]?.logical || 0)
const activeLogicalStage = computed(() => LOGICAL_STAGES[logicalStageIndex.value])
const activeDisplayStage = computed(() => viewMode.value === 'bin'
  ? { key: 'bin_internal', label: binProgressState.value.phaseLabel || '桶内分类' }
  : activeLogicalStage.value)
const taskId = computed(() => props.request?.taskId || '')
const garbageText = computed(() => props.garbageLabel || props.request?.expectedClassName || props.request?.garbageId || '未登记')
const targetBinText = computed(() => props.targetBinLabel || props.request?.targetBinId || '未登记')
const identityDetail = computed(() => {
  if (viewMode.value === 'bin') {
    const target = Number(props.fillTargetPct) || 0
    return `桶内仓位显示 ${binProgressState.value.previewFillPct}% / 事件 #${props.fillEventSequence || '—'} 目标 ${target}%`
  }
  return visualState.value.placeholder ? '未命中垃圾素材，当前显示视觉占位' : `${visualState.value.label} · ${visualState.value.key}`
})
const overallProgress = computed(() => {
  if (completed.value) return 100
  if (viewMode.value === 'bin') return Math.min(100, (5 + binProgressState.value.progress) / LOGICAL_STAGES.length * 100)
  let withinLogicalStage = stageProgress.value
  if (renderStage.value === 'place') withinLogicalStage = stageProgress.value * .65
  if (renderStage.value === 'release') withinLogicalStage = .65 + stageProgress.value * .35
  return Math.min(100, (logicalStageIndex.value + withinLogicalStage) / LOGICAL_STAGES.length * 100)
})

function resetSequence() {
  renderStepIndex.value = 0
  stageProgress.value = 0
  completed.value = false
  viewMode.value = 'robot'
  robotReturnComplete.value = false
  binComplete.value = false
  binProgressState.value = { phase: 'inlet', phaseLabel: '进入投入口', progress: 0, previewFillPct: 0 }
  nextTick(() => playerRef.value?.setStage('scan', 0))
}

function replay() {
  resetSequence()
  if (!props.running) emit('play')
}

function jumpToStage(logicalIndex) {
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
  visualState.value = payload || { key: '', label: '视觉占位', placeholder: true }
}

watch(() => props.resetKey, resetSequence, { flush: 'post' })
watch(() => props.active, active => { if (active) resetSequence() }, { flush: 'post' })
watch(
  [renderStage, stageProgress, viewMode, () => binProgressState.value.progress, completed],
  () => {
    const stage = viewMode.value === 'bin' ? 'bin_internal' : renderStage.value
    const carrying = viewMode.value === 'robot' && ['transport', 'place', 'release'].includes(stage)
    emit('visual-state', {
      stage,
      mode: viewMode.value,
      progress: viewMode.value === 'bin' ? Number(binProgressState.value.progress) || 0 : stageProgress.value,
      carrying,
      showCarriedMarker: carrying,
      completed: completed.value,
      taskId: taskId.value,
      source: 'VISUAL_AID'
    })
  },
  { immediate: true, flush: 'sync' }
)
</script>

<style scoped>
.robot-task-overlay {
  position: absolute; inset: 12px; z-index: 8; display: flex; flex-direction: column; min-height: 0;
  padding: 14px; box-sizing: border-box; overflow: hidden; border: 1px solid rgba(85,205,255,.55);
  border-radius: 14px; color: #eaf9ff; background: linear-gradient(145deg,rgba(5,24,39,.96),rgba(8,43,62,.94));
  box-shadow: 0 18px 60px rgba(0,0,0,.45), inset 0 0 32px rgba(39,191,255,.07);
}
.overlay-head,.overlay-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.overlay-kicker { color: #52d9ff; font: 700 9px/1.2 ui-monospace,Consolas,monospace; letter-spacing: 1.4px; }
.overlay-title { margin-top: 4px; color: #fff; font-size: 17px; font-weight: 750; }
.source-stack { max-width: 310px; text-align: right; }.source-badge { display: inline-block; margin-left: 4px; padding: 3px 7px; border: 1px solid rgba(245,182,72,.5); border-radius: 5px; color: #ffd274; background: rgba(132,87,16,.28); font: 700 8px/1.2 ui-monospace,Consolas,monospace; }.source-badge.simulated { color: #7ee7c1; border-color: rgba(59,214,158,.48); background: rgba(19,109,79,.25); }.source-note { display: block; margin-top: 4px; color: #789eaf; font-size: 8px; }
.task-facts { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 7px; margin: 10px 0 8px; }.task-facts view { min-width: 0; padding: 7px 9px; border: 1px solid rgba(112,194,232,.2); border-radius: 8px; background: rgba(14,55,76,.58); }.task-facts text,.task-facts b { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.task-facts text { color: #7297a9; font-size: 8px; }.task-facts b { margin-top: 3px; color: #dff7ff; font-size: 10px; }
.stage-selector { display: grid; grid-template-columns: repeat(6,minmax(0,1fr)); gap: 5px; }.stage-chip { display: flex; align-items: center; justify-content: center; gap: 4px; min-width: 0; padding: 6px 4px; border: 1px solid rgba(103,173,205,.18); border-radius: 7px; color: #6f94a7; background: rgba(5,24,38,.5); font-size: 8px; cursor: pointer; }.stage-chip.done { color: #78d9b2; border-color: rgba(42,190,131,.3); }.stage-chip.active { color: #fff; border-color: rgba(63,207,255,.75); background: rgba(24,124,169,.44); box-shadow: 0 0 14px rgba(33,190,255,.18); }.stage-index { display: grid; place-items: center; width: 15px; height: 15px; flex: 0 0 15px; border-radius: 50%; background: rgba(255,255,255,.1); font: 700 8px/1 ui-monospace,Consolas,monospace; }
.player-shell { position: relative; flex: 1; min-height: 190px; margin-top: 8px; overflow: hidden; border-radius: 10px; background: #edf7f4; }.task-player { width: 100%; height: 100%; }.progress-track { position: absolute; right: 14px; bottom: 10px; left: 14px; height: 4px; overflow: hidden; border-radius: 999px; background: rgba(12,53,69,.15); }.progress-fill { height: 100%; border-radius: inherit; background: linear-gradient(90deg,#20c991,#36c9ff); transition: width .1s linear; }
.overlay-footer { margin-top: 8px; }.task-identity { min-width: 0; }.task-identity text,.task-identity small { display: block; }.task-identity text { overflow: hidden; color: #9fd5eb; font: 700 9px/1.2 ui-monospace,Consolas,monospace; text-overflow: ellipsis; white-space: nowrap; }.task-identity small { margin-top: 3px; color: #62889a; font-size: 8px; }.local-controls { display: flex; gap: 6px; }.local-button { margin: 0; padding: 0 12px; border: 1px solid rgba(68,190,236,.6); color: #fff; background: #167db1; font-size: 10px; }.local-button.secondary { color: #a9d6e8; background: rgba(255,255,255,.07); }
.debug-stages { display: grid; grid-template-columns: repeat(6,1fr); gap: 4px; margin-top: 6px; }.debug-stages text { padding: 4px; text-align: center; color: #799cac; border: 1px dashed rgba(116,197,255,.2); font: 7px/1 ui-monospace,Consolas,monospace; }
@media (max-width: 900px) { .robot-task-overlay { position: relative; inset: auto; min-height: 520px; }.task-facts { grid-template-columns: repeat(2,1fr); }.stage-selector { grid-template-columns: repeat(3,1fr); } }
@media (max-width: 560px) { .robot-task-overlay { padding: 10px; }.source-note,.task-identity small { display: none; }.task-facts { gap: 4px; }.stage-chip { font-size: 7px; }.player-shell { min-height: 230px; } }
</style>
