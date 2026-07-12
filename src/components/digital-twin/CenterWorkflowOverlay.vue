<template>
  <view
    class="center-workflow-overlay"
    :data-event-source="currentEvent?.source"
    :data-stage="phaseKey"
  >
    <view class="center-head">
      <view>
        <view class="center-kicker">CENTER OPS · CONTINUOUS PROCESS</view>
        <view class="center-title">收运中心处理流程</view>
      </view>
      <view class="center-status">
        <i :class="{ active: running }"></i>
        <text>{{ running ? '流程运行中' : '流程已暂停' }}</text>
      </view>
    </view>

    <view class="center-meta">
      <view><text>设备</text><b>{{ deviceId }}</b></view>
      <view><text>当前事件</text><b>{{ currentEvent?.eventType || '—' }}</b></view>
      <view><text>处理阶段</text><b>{{ activeStage.label }}</b></view>
      <view><text>阶段进度</text><b>{{ Math.round(localProgress * 100) }}%</b></view>
    </view>

    <view class="flow-rail">
      <view class="rail-line"></view>
      <view
        v-for="(stage, index) in CENTER_WORKFLOW_STAGES"
        :key="stage.key"
        :class="['flow-stage', { active: index === activeStageIndex, done: index < activeStageIndex }]"
        @tap="jumpToStage(stage)"
      >
        <view class="stage-dot">{{ index + 1 }}</view>
        <text>{{ stage.label }}</text>
        <small>{{ stage.zone }}</small>
      </view>
    </view>

    <view
      class="process-panel"
      :data-stage-visual-status="stageVisual.status"
      :data-stage-visual-source="stageVisual.source"
    >
      <view class="scene-canvas">
        <image class="center-stage-visual" :src="stageVisual.src" mode="aspectFill" />
        <view class="scene-vignette"></view>

        <view v-if="phaseKey === 'DOCK'" class="dock-zone" :style="dockZoneStyle">
          <i :style="{ opacity: dockPulseOpacity }"></i><b></b><strong>泊位已对齐</strong>
        </view>

        <view v-if="phaseKey === 'UNLOAD'" class="unload-mask" :style="maskStyle('unload')">
          <i
            v-for="index in CENTER_WORKFLOW_SCENE.unloadStream.particleCount"
            :key="index"
            class="waste-particle"
            :style="unloadParticleStyle(index - 1)"
          ></i>
        </view>

        <view v-if="phaseKey === 'CLEAN'" class="clean-mask" :style="maskStyle('clean')">
          <view class="wash-curtain" :style="washCurtainStyle"></view>
          <i
            v-for="(drop, index) in CENTER_WORKFLOW_SCENE.cleanDrops"
            :key="index"
            class="wash-drop"
            :style="cleanDropStyle(drop)"
          ></i>
        </view>

        <view v-if="phaseKey === 'CHARGE'" class="charge-mask" :style="maskStyle('charge')">
          <view class="energy-link"></view>
          <i
            v-for="(dot, index) in CENTER_WORKFLOW_SCENE.energyDots"
            :key="index"
            class="energy-dot"
            :style="energyDotStyle(dot)"
          ></i>
        </view>

        <view v-if="phaseKey === 'CHECK'" class="check-mask" :style="maskStyle('check')">
          <view class="scan-line" :style="scanLineStyle"></view>
          <i class="scan-corner c1"></i><i class="scan-corner c2"></i>
          <i class="scan-corner c3"></i><i class="scan-corner c4"></i>
        </view>

        <view class="device-actor" :style="deviceStyle">
          <view v-if="phaseKey === 'UNLOAD'" class="device-fill-window">
            <i :style="{ height: `${fillPreviewPct}%` }"></i>
          </view>
          <image :src="CENTER_WORKFLOW_SCENE.device.src" mode="aspectFit" />
          <view v-if="phaseKey === 'DOCK'" class="dock-lock" :style="{ opacity: dockLockOpacity }">
            <i></i><i></i>
          </view>
          <view v-if="phaseKey === 'STANDBY'" class="ready-halo" :style="{ opacity: readyHaloOpacity }"></view>
        </view>

        <view class="stage-card">
          <view class="stage-card-head"><small>{{ activeStage.zone }}</small><b>{{ activeStage.label }}</b></view>
          <text>{{ stageDescription }}</text>
          <view class="stage-progress"><i :style="{ width: `${localProgress * 100}%` }"></i></view>
          <strong>{{ stageMetric }}</strong>
        </view>

        <view v-if="phaseKey === 'CHECK'" class="check-list">
          <view v-for="item in checkItems" :key="item.label" :class="{ done: item.done }">
            <i></i><text>{{ item.label }}</text><b>{{ item.value }}</b>
          </view>
        </view>
      </view>
    </view>

    <view class="center-footer">
      <view class="center-controls">
        <button size="mini" @tap="running ? emit('pause') : emit('play')">{{ running ? '暂停' : '继续' }}</button>
        <button class="secondary" size="mini" @tap="replayCurrentStage">重播当前阶段</button>
      </view>
      <text>点击上方阶段可跳转</text>
    </view>
  </view>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  CENTER_WORKFLOW_SCENE,
  CENTER_WORKFLOW_STAGES,
  centerWorkflowAnimationIdentity,
  centerWorkflowDevicePose,
  centerWorkflowDuration,
  centerWorkflowLocalProgress,
  centerWorkflowStage,
  resolveCenterWorkflowPhase
} from '@/config/center-workflow.js'
import { resolveCenterWorkflowSprite } from '@/config/map-sprite-registry.js'

const props = defineProps({
  currentEvent: { type: Object, default: () => ({}) },
  eventHistory: { type: Array, default: () => [] },
  running: { type: Boolean, default: false },
  playbackRate: { type: Number, default: 1 },
  resetKey: { type: [String, Number], default: '' },
  recoveryPayload: { type: Object, default: () => ({}) },
  initialFillPct: { type: Number, default: 0 },
  stageOverride: { type: Object, default: null }
})
const emit = defineEmits(['play', 'pause', 'replay', 'seek-stage'])
const progress = ref(0)
let rafId = 0
let lastTimestamp = 0

const clamp = value => Math.max(0, Math.min(1, Number(value) || 0))
const deviceId = computed(() => props.currentEvent?.payload?.deviceId || 'device_smart_bin_food_01')
const eventType = computed(() => props.currentEvent?.eventType || '')
const eventSequence = computed(() => Number(props.currentEvent?.sequence) || 0)
const effectiveOverride = computed(() => (
  props.stageOverride?.stageKey && Number(props.stageOverride?.sequence) === eventSequence.value
    ? props.stageOverride.stageKey
    : ''
))
const phaseKey = computed(() => resolveCenterWorkflowPhase({
  eventType: eventType.value,
  progress: progress.value,
  eventHistory: props.eventHistory,
  override: effectiveOverride.value
}))
const animationIdentity = computed(() => centerWorkflowAnimationIdentity({
  eventType: eventType.value,
  eventHistory: props.eventHistory,
  override: effectiveOverride.value
}))
const localProgress = computed(() => effectiveOverride.value
  ? progress.value
  : centerWorkflowLocalProgress(phaseKey.value, progress.value))
const activeStage = computed(() => centerWorkflowStage(phaseKey.value))
const activeStageIndex = computed(() => CENTER_WORKFLOW_STAGES.findIndex(stage => stage.key === phaseKey.value))
const stageVisual = computed(() => resolveCenterWorkflowSprite(activeStage.value.visualKey))
const devicePose = computed(() => centerWorkflowDevicePose(phaseKey.value, localProgress.value))
const deviceStyle = computed(() => ({
  left: `${devicePose.value.x}%`,
  top: `${devicePose.value.y}%`,
  width: `${CENTER_WORKFLOW_SCENE.device.widthPct}%`,
  transform: `translate(-50%,-72%) scale(${devicePose.value.scale}) rotate(${devicePose.value.rotate}deg)`
}))

const stageDescription = computed(() => ({
  ARRIVE: '设备沿中心入口进入处理区。',
  DOCK: '完成泊位定位、夹紧与处理接口确认。',
  UNLOAD: '倾倒模块将桶内垃圾转入后端分拣区域。',
  CLEAN: '维护区域执行桶体清洗与排水。',
  CHARGE: '设备在处理泊位完成连接并补充电量。',
  CHECK: '依次核对填充率、电量、设备状态与处理结果。',
  STANDBY: '设备离开处理位置并恢复待命。'
}[phaseKey.value]))

const batteryStart = computed(() => Math.max(0, Number(props.currentEvent?.payload?.batteryPct) || 0))
const batteryEnd = computed(() => Math.max(batteryStart.value, Number(props.recoveryPayload?.batteryPct) || batteryStart.value))
const batteryPreviewPct = computed(() => Math.round(batteryStart.value + (batteryEnd.value - batteryStart.value) * localProgress.value))
const fillEnd = computed(() => Math.max(0, Number(props.recoveryPayload?.fillPct) || 0))
const fillPreviewPct = computed(() => {
  const start = Math.max(fillEnd.value, Number(props.initialFillPct) || 0)
  return Math.max(4, start + (fillEnd.value - start) * localProgress.value)
})
const stageMetric = computed(() => {
  if (phaseKey.value === 'CHARGE') return `${batteryPreviewPct.value}%`
  if (phaseKey.value === 'STANDBY') return '待命'
  if (phaseKey.value === 'CHECK') return `${checkItems.value.filter(item => item.done).length}/4`
  return `${Math.round(localProgress.value * 100)}%`
})

const checkItems = computed(() => [
  { label: '填充率', value: `${props.recoveryPayload?.fillPct ?? '—'}%`, done: localProgress.value >= 0.22 },
  { label: '电量', value: `${props.recoveryPayload?.batteryPct ?? '—'}%`, done: localProgress.value >= 0.45 },
  { label: '设备状态', value: localProgress.value >= 0.68 ? '正常' : '检测中', done: localProgress.value >= 0.68 },
  { label: '处理结果', value: localProgress.value >= 0.9 ? '完成' : '核对中', done: localProgress.value >= 0.9 }
])

function maskStyle(key) {
  const mask = CENTER_WORKFLOW_SCENE.masks[key]
  return { left: `${mask.left}%`, top: `${mask.top}%`, width: `${mask.width}%`, height: `${mask.height}%` }
}

const dockZoneStyle = computed(() => ({ left: '12.8%', top: '43%', width: '19%', height: '30%' }))
const dockPulseOpacity = computed(() => 0.36 + Math.sin(localProgress.value * Math.PI * 4) * 0.18)
const dockLockOpacity = computed(() => clamp((localProgress.value - 0.55) / 0.35))
const readyHaloOpacity = computed(() => 0.45 + Math.sin(localProgress.value * Math.PI * 3) * 0.22)
const washCurtainStyle = computed(() => ({
  opacity: clamp(localProgress.value * 2.2),
  transform: `translateY(${(localProgress.value * 1.6 - 0.3) * 38}%)`
}))
const scanLineStyle = computed(() => ({ top: `${8 + localProgress.value * 82}%` }))

function unloadParticleStyle(index) {
  const stream = CENTER_WORKFLOW_SCENE.unloadStream
  const offset = index * 0.036
  const amount = clamp((localProgress.value - stream.startAt - offset) / Math.max(0.1, stream.endAt - stream.startAt - offset))
  const x = stream.start.x + (stream.end.x - stream.start.x) * amount
  const y = stream.start.y + (stream.end.y - stream.start.y) * amount - Math.sin(amount * Math.PI) * 13
  const visible = amount > 0 && amount < 1 ? 1 : 0
  return {
    left: `${x}%`, top: `${y}%`, opacity: visible,
    transform: `translate(-50%,-50%) rotate(${index * 31 + amount * 150}deg) scale(${0.72 + (index % 3) * 0.13})`
  }
}

function cleanDropStyle(drop) {
  const amount = clamp((localProgress.value - drop.delay) / Math.max(0.1, 1 - drop.delay))
  const visible = amount > 0 && amount < 1 ? Math.sin(amount * Math.PI) : 0
  return { left: `${drop.x}%`, top: `${6 + amount * 84}%`, opacity: visible }
}

function energyDotStyle(dot) {
  const amount = (dot.at + localProgress.value * 1.55) % 1
  return { left: `${8 + amount * 82}%`, opacity: 0.3 + Math.sin(amount * Math.PI) * 0.7 }
}

function jumpToStage(stage) {
  emit('seek-stage', { stageKey: stage.key, eventType: stage.eventType })
}

function replayCurrentStage() {
  emit('replay', { stageKey: phaseKey.value, sequence: eventSequence.value })
}

function stop() {
  if (rafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId)
  rafId = 0
  lastTimestamp = 0
}

function tick(timestamp) {
  if (!props.running) return stop()
  if (!lastTimestamp) lastTimestamp = timestamp
  const delta = Math.min(100, timestamp - lastTimestamp)
  lastTimestamp = timestamp
  const duration = centerWorkflowDuration(animationIdentity.value)
  progress.value = Math.min(1, progress.value + delta * Math.max(0.25, Number(props.playbackRate) || 1) / duration)
  if (progress.value >= 1) return stop()
  rafId = requestAnimationFrame(tick)
}

function play() {
  if (!props.running || progress.value >= 1 || rafId || typeof requestAnimationFrame !== 'function') return
  lastTimestamp = 0
  rafId = requestAnimationFrame(tick)
}

function reset() {
  stop()
  progress.value = 0
  play()
}

watch(() => [animationIdentity.value, props.resetKey], reset, { flush: 'post' })
watch(() => props.running, value => value ? play() : stop(), { flush: 'sync' })
onMounted(play)
onBeforeUnmount(stop)
</script>

<style scoped>
.center-workflow-overlay { position:absolute; z-index:8; inset:12px auto 12px 12px; width:min(76%,760px); min-width:560px; display:flex; flex-direction:column; padding:14px; box-sizing:border-box; overflow:hidden; border:1px solid rgba(92,213,255,.55); border-radius:14px; color:#eaf9ff; background:linear-gradient(145deg,rgba(5,24,39,.98),rgba(8,43,62,.96)); box-shadow:0 18px 60px rgba(0,0,0,.45); }
.center-head,.center-footer { display:flex; align-items:center; justify-content:space-between; gap:12px; }.center-kicker { color:#54dbff; font:700 10px/1.2 ui-monospace,Consolas,monospace; letter-spacing:1.3px; }.center-title { margin-top:4px; color:#fff; font-size:18px; font-weight:800; }.center-status { display:flex; align-items:center; gap:7px; color:#9cc3d2; font-size:9px; }.center-status i { width:8px; height:8px; border-radius:50%; background:#607f8c; box-shadow:0 0 0 4px rgba(96,127,140,.12); }.center-status i.active { background:#54e6aa; box-shadow:0 0 0 4px rgba(84,230,170,.13),0 0 13px rgba(84,230,170,.5); }
.center-meta { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px; margin:10px 0; }.center-meta view { min-width:0; padding:7px 8px; border:1px solid rgba(112,194,232,.2); border-radius:8px; background:rgba(14,55,76,.58); }.center-meta text,.center-meta b { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.center-meta text { color:#7fa5b6; font-size:9px; }.center-meta b { margin-top:3px; color:#e6f8ff; font-size:11px; }
.flow-rail { position:relative; display:grid; grid-template-columns:repeat(7,1fr); gap:3px; padding-top:4px; }.rail-line { position:absolute; left:6%; right:6%; top:17px; height:2px; background:rgba(113,175,200,.25); }.flow-stage { position:relative; z-index:1; min-width:0; cursor:pointer; text-align:center; color:#688e9f; }.stage-dot { display:grid; place-items:center; width:24px; height:24px; margin:0 auto 4px; border:2px solid rgba(100,160,186,.35); border-radius:50%; color:#759aaa; background:#0b2b3d; font:800 9px/1 ui-monospace,Consolas,monospace; }.flow-stage text,.flow-stage small { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.flow-stage text { font-size:9px; font-weight:700; }.flow-stage small { margin-top:2px; font:6px/1 ui-monospace,Consolas,monospace; }.flow-stage.done { color:#68d9b1; }.flow-stage.done .stage-dot { color:#fff; border-color:#20b981; background:#147455; }.flow-stage.active { color:#e9fbff; }.flow-stage.active .stage-dot { color:#fff; border-color:#3ad4ff; background:#1680aa; box-shadow:0 0 16px rgba(50,203,255,.35); }
.process-panel { position:relative; flex:1; min-height:315px; margin-top:10px; border:1px solid rgba(76,204,247,.4); border-radius:12px; overflow:hidden; background:#031725; box-shadow:inset 0 0 38px rgba(19,133,168,.12); }.scene-canvas { position:absolute; inset:0; overflow:hidden; }.center-stage-visual { position:absolute; inset:0; width:100%; height:100%; opacity:.94; filter:saturate(1.12) contrast(1.06) brightness(.9); pointer-events:none; }.scene-vignette { position:absolute; inset:0; pointer-events:none; background:linear-gradient(90deg,rgba(1,15,25,.78),transparent 31%,transparent 77%,rgba(1,15,25,.18)),linear-gradient(0deg,rgba(1,15,25,.72),transparent 34%); box-shadow:inset 0 0 55px rgba(0,8,14,.36); }
.device-actor { position:absolute; z-index:7; aspect-ratio:.78; transform-origin:50% 85%; filter:drop-shadow(0 8px 7px rgba(0,7,13,.48)); will-change:left,top,transform; }.device-actor image { position:absolute; z-index:2; inset:0; width:100%; height:100%; }.device-fill-window { position:absolute; z-index:3; right:12%; bottom:16%; width:13%; height:37%; overflow:hidden; border:1px solid rgba(255,225,164,.72); border-radius:3px; background:rgba(5,25,34,.5); }.device-fill-window i { position:absolute; right:1px; bottom:1px; left:1px; border-radius:2px; background:linear-gradient(#ffc265,#e88031); box-shadow:0 0 8px rgba(255,165,74,.48); }
.dock-zone { position:absolute; z-index:4; border:1px dashed rgba(89,224,255,.6); border-radius:50%; }.dock-zone > i { position:absolute; inset:8%; border:2px solid #5be2ff; border-radius:50%; box-shadow:0 0 22px rgba(46,206,245,.38); }.dock-zone > b { position:absolute; left:50%; bottom:4%; width:12px; height:6px; border-left:3px solid #59e6ad; border-bottom:3px solid #59e6ad; transform:translateX(-50%) rotate(-45deg); }.dock-zone strong { position:absolute; left:50%; bottom:-16px; transform:translateX(-50%); color:#9eeeff; font-size:7px; white-space:nowrap; }.dock-lock { position:absolute; z-index:4; inset:10% -22%; }.dock-lock i { position:absolute; top:32%; width:22%; height:35%; border-top:3px solid #58e5ff; border-bottom:3px solid #58e5ff; }.dock-lock i:first-child { left:0; border-left:3px solid #58e5ff; border-radius:6px 0 0 6px; }.dock-lock i:last-child { right:0; border-right:3px solid #58e5ff; border-radius:0 6px 6px 0; }
.unload-mask,.clean-mask,.charge-mask,.check-mask { position:absolute; z-index:5; overflow:hidden; pointer-events:none; }.waste-particle { position:absolute; width:7px; height:5px; border-radius:2px; background:linear-gradient(135deg,#ffc35c,#eb7631); box-shadow:0 0 7px rgba(255,171,65,.48); }.wash-curtain { position:absolute; inset:-24% 0 0; background:linear-gradient(112deg,transparent 8%,rgba(73,225,255,.05) 20%,rgba(96,231,255,.56) 52%,rgba(61,193,241,.06) 80%,transparent 92%); filter:blur(1px); }.wash-drop { position:absolute; width:4px; height:12px; border-radius:50% 50% 62% 62%; background:#7ce9ff; box-shadow:0 0 8px rgba(102,224,255,.75); }.energy-link { position:absolute; left:7%; right:8%; top:58%; height:3px; border-radius:3px; background:linear-gradient(90deg,rgba(44,215,155,.18),#60efb2,rgba(44,215,155,.2)); box-shadow:0 0 12px rgba(62,229,167,.58); }.energy-dot { position:absolute; top:58%; width:8px; height:8px; margin:-3px 0 0 -4px; border-radius:50%; background:#b9ffe0; box-shadow:0 0 11px #44e6a6; }.check-mask { border:1px solid rgba(88,239,183,.46); background:rgba(24,139,103,.08); }.scan-line { position:absolute; left:4%; right:4%; height:2px; background:#76ffc8; box-shadow:0 0 11px #4be8a8; }.scan-corner { position:absolute; width:14px; height:14px; border-color:#73f6c4; }.scan-corner.c1{left:4px;top:4px;border-left:2px solid;border-top:2px solid}.scan-corner.c2{right:4px;top:4px;border-right:2px solid;border-top:2px solid}.scan-corner.c3{left:4px;bottom:4px;border-left:2px solid;border-bottom:2px solid}.scan-corner.c4{right:4px;bottom:4px;border-right:2px solid;border-bottom:2px solid}.ready-halo { position:absolute; z-index:1; inset:10%; border:3px solid #5aefb6; border-radius:50%; box-shadow:0 0 22px rgba(78,236,175,.7); }
.stage-card { position:absolute; z-index:9; left:12px; bottom:12px; width:39%; min-width:200px; padding:11px 12px; box-sizing:border-box; border:1px solid rgba(114,207,237,.3); border-radius:10px; background:linear-gradient(145deg,rgba(5,38,55,.94),rgba(3,25,39,.9)); box-shadow:0 9px 28px rgba(0,10,18,.35); backdrop-filter:blur(7px); }.stage-card-head { display:flex; align-items:baseline; gap:8px; }.stage-card-head small { color:#5ce0ff; font:700 7px/1 ui-monospace,Consolas,monospace; letter-spacing:.8px; }.stage-card-head b { color:#fff; font-size:14px; }.stage-card > text { display:block; min-height:29px; margin-top:6px; color:#9fc2cf; font-size:8px; line-height:1.55; }.stage-progress { height:4px; margin-top:7px; overflow:hidden; border-radius:3px; background:rgba(105,176,202,.18); }.stage-progress i { display:block; height:100%; border-radius:3px; background:linear-gradient(90deg,#29bde7,#59eab1); box-shadow:0 0 10px rgba(50,212,255,.45); }.stage-card strong { display:block; margin-top:6px; color:#64e4ff; font:800 15px/1 ui-monospace,Consolas,monospace; }
.check-list { position:absolute; z-index:9; right:12px; bottom:12px; width:34%; padding:8px 9px; border:1px solid rgba(92,232,181,.28); border-radius:9px; background:rgba(3,34,43,.88); backdrop-filter:blur(6px); }.check-list view { display:grid; grid-template-columns:11px 1fr auto; align-items:center; gap:6px; min-height:20px; color:#779eaa; font-size:7px; }.check-list i { width:7px; height:7px; border:1px solid #557e88; border-radius:50%; }.check-list b { color:#9cb8bf; font-weight:600; }.check-list view.done { color:#c7f8e5; }.check-list view.done i { border-color:#56e6ae; background:#43d89f; box-shadow:0 0 7px rgba(69,226,169,.5); }.check-list view.done b { color:#62e7b2; }
.center-footer { margin-top:9px; }.center-footer > text { color:#668b9b; font-size:8px; }.center-controls { display:flex; gap:5px; }.center-controls button { margin:0; padding:0 11px; border:1px solid rgba(68,190,236,.6); color:#fff; background:#167db1; font-size:9px; }.center-controls button.secondary { color:#a9d6e8; background:rgba(255,255,255,.07); }
@media (max-width:900px) { .center-workflow-overlay { position:relative; inset:auto; width:100%; min-width:0; min-height:620px; }.center-meta { grid-template-columns:repeat(2,1fr); }.flow-stage small { display:none; }.process-panel { min-height:360px; } }
@media (max-width:560px) { .center-workflow-overlay { padding:10px; min-height:610px; }.center-status { display:none; }.flow-stage text { font-size:7px; }.stage-dot { width:20px; height:20px; }.rail-line { top:15px; }.process-panel { min-height:370px; }.stage-card { left:8px; bottom:8px; width:56%; min-width:0; }.check-list { right:8px; bottom:8px; width:38%; }.center-footer > text { display:none; } }
</style>
