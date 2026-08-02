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
        <i :class="['center-status-dot', { active: running }]"></i>
        <text>{{ running ? '流程运行中' : '流程已暂停' }}</text>
      </view>
    </view>

    <view class="center-meta">
      <view><text>设备</text><text class="b-text">{{ deviceId }}</text></view>
      <view><text>处理泊位</text><text class="b-text">{{ assignedBayId || '待分配' }}</text></view>
      <view><text>当前事件</text><text class="b-text">{{ currentEvent?.eventType || '—' }}</text></view>
      <view><text>处理阶段</text><text class="b-text">{{ activeStage.label }}</text></view>
      <view><text>阶段进度</text><text class="b-text">{{ Math.round(localProgress * 100) }}%</text></view>
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
        <text class="small-text">{{ stage.zone }}</text>
      </view>
    </view>

    <view
      class="process-panel"
      :data-stage-visual-status="stageVisual.status"
      :data-stage-visual-source="stageVisual.source"
      :data-video-state="stageVideoState"
    >
      <view ref="sceneCanvasRef" class="scene-canvas">
        <image webp class="center-stage-visual" :src="stageVisual.src" mode="aspectFill" />
        <view :class="['center-stage-video-layer', { active: videoVisualActive }]">
          <image class="center-stage-video-backdrop" :src="CENTER_WORKFLOW_MASTER_VIDEO.poster" mode="aspectFill" />
          <video
            ref="centerMasterVideoRef"
            class="center-stage-video"
            :src="CENTER_WORKFLOW_MASTER_VIDEO.file"
            :poster="CENTER_WORKFLOW_MASTER_VIDEO.poster"
            :muted="true"
            :controls="false"
            :loop="false"
            :playback-rate="stageVideoPlaybackRate"
            :show-center-play-btn="false"
            :show-play-btn="false"
            :show-fullscreen-btn="false"
            :enable-progress-gesture="false"
            object-fit="contain"
            preload="auto"
            playsinline
            webkit-playsinline
            @loadedmetadata="handleCenterMasterVideoReady"
            @canplay="handleCenterMasterVideoReady"
            @timeupdate="handleCenterMasterVideoTimeUpdate"
            @ended="handleCenterMasterVideoEnded"
            @error="handleCenterMasterVideoError"
          ></video>
          <view class="center-stage-video-tone"></view>
        </view>
        <view class="scene-vignette"></view>

        <view v-if="phaseKey === 'DOCK'" class="dock-zone" :style="dockZoneStyle">
          <i class="dock-pulse" :style="{ opacity: dockPulseOpacity }"></i><text class="b-text"></text><strong class="dock-label">泊位已对齐</strong>
        </view>

        <view v-if="!videoVisualActive && phaseKey === 'UNLOAD'" class="unload-mask" :style="maskStyle('unload')">
          <i
            v-for="index in CENTER_WORKFLOW_SCENE.unloadStream.particleCount"
            :key="index"
            class="waste-particle"
            :style="unloadParticleStyle(index - 1)"
          ></i>
        </view>

        <view v-if="!videoVisualActive && phaseKey === 'CLEAN'" class="clean-mask" :style="maskStyle('clean')">
          <view class="clean-sweep" :style="cleanSweepStyle"></view>
        </view>

        <view v-if="!videoVisualActive && phaseKey === 'CHARGE'" class="charge-mask" :style="maskStyle('charge')">
          <view class="energy-link"></view>
          <i
            v-for="(dot, index) in CENTER_WORKFLOW_SCENE.energyDots"
            :key="index"
            class="energy-dot"
            :style="energyDotStyle(dot)"
          ></i>
        </view>

        <view v-if="!videoVisualActive && phaseKey === 'CHECK'" class="check-mask" :style="maskStyle('check')">
          <view class="scan-line" :style="scanLineStyle"></view>
          <i class="scan-corner c1"></i><i class="scan-corner c2"></i>
          <i class="scan-corner c3"></i><i class="scan-corner c4"></i>
        </view>

        <view v-if="!videoVisualActive" class="device-actor" :style="deviceStyle">
          <view v-if="phaseKey === 'UNLOAD'" class="device-fill-window">
            <i class="device-fill-level" :style="{ height: `${fillPreviewPct}%` }"></i>
          </view>
          <image :src="CENTER_WORKFLOW_SCENE.device.src" mode="aspectFit" />
          <view v-if="phaseKey === 'DOCK'" class="dock-lock" :style="{ opacity: dockLockOpacity }">
            <i class="dock-lock-edge"></i><i class="dock-lock-edge"></i>
          </view>
          <view v-if="phaseKey === 'STANDBY'" class="ready-halo" :style="{ opacity: readyHaloOpacity }"></view>
        </view>

        <view :class="['stage-card', { 'video-mode': videoVisualActive }]" :style="stageCardLayoutStyle">
          <view class="stage-card-head"><text class="small-text">{{ activeStage.zone }}</text><text class="b-text">{{ activeStage.label }}</text></view>
          <text>{{ stageDescription }}</text>
          <view class="stage-progress"><i class="stage-progress-bar" :style="{ width: `${localProgress * 100}%` }"></i></view>
          <strong class="stage-metric">{{ stageMetric }}</strong>
        </view>

        <view v-if="videoVisualActive && phaseKey !== 'CHECK'" class="video-status-card" :style="bottomVideoCardLayoutStyle">
          <text class="small-text">设备状态</text>
          <text class="b-text">{{ videoDeviceStatus }}</text>
          <text>阶段进度 {{ Math.round(localProgress * 100) }}%</text>
        </view>

        <view
          v-if="phaseKey === 'CHECK'"
          :class="['check-list', { 'video-mode': videoVisualActive }]"
          :style="checkListLayoutStyle"
        >
          <view v-for="item in checkItems" :key="item.label" :class="{ done: item.done }">
            <i class="check-indicator"></i><text>{{ item.label }}</text><text class="b-text">{{ item.value }}</text>
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  CENTER_WORKFLOW_SCENE,
  CENTER_WORKFLOW_STAGES,
  centerWorkflowAnimationIdentity,
  centerWorkflowDevicePose,
  centerWorkflowDuration,
  centerWorkflowLocalProgress,
  centerWorkflowStage,
  resolveCenterWorkflowPhase
} from '@/pages-admin/config/center-workflow.js'
import { CENTER_WORKFLOW_MASTER_VIDEO } from '@/pages-admin/config/center-workflow-video.js'
import { resolveCenterWorkflowSprite } from '@/pages-admin/config/map-sprite-registry.js'

const props = defineProps({
  currentEvent: { type: Object, default: () => ({}) },
  eventHistory: { type: Array, default: () => [] },
  running: { type: Boolean, default: false },
  playbackRate: { type: Number, default: 1 },
  resetKey: { type: [String, Number], default: '' },
  recoveryPayload: { type: Object, default: () => ({}) },
  initialFillPct: { type: Number, default: 0 },
  stageOverride: { type: Object, default: null },
  assignedBayId: { type: String, default: '' }
})
const emit = defineEmits(['play', 'pause', 'replay', 'seek-stage'])
const progress = ref(0)
let rafId = 0
let lastTimestamp = 0
let sceneResizeObserver = null

const clamp = value => Math.max(0, Math.min(1, Number(value) || 0))
const cuePoints = CENTER_WORKFLOW_MASTER_VIDEO.cuePoints
const CENTER_STAGE_VIDEO_SEGMENTS = Object.freeze({
  ARRIVE: Object.freeze({ startSeconds: cuePoints.arrive.startSeconds, endSeconds: cuePoints.arrive.endSeconds }),
  DOCK: Object.freeze({
    startSeconds: Math.max(cuePoints.arrive.startSeconds, cuePoints.arrive.endSeconds - 0.04),
    endSeconds: cuePoints.arrive.endSeconds,
    holdFrame: true
  }),
  UNLOAD: Object.freeze({ startSeconds: cuePoints.weigh.startSeconds, endSeconds: cuePoints.weigh.endSeconds }),
  CLEAN: Object.freeze({ startSeconds: cuePoints.wash.startSeconds, endSeconds: cuePoints.dry.endSeconds }),
  CHARGE: Object.freeze({ startSeconds: cuePoints.charge.startSeconds, endSeconds: cuePoints.charge.endSeconds }),
  CHECK: Object.freeze({ startSeconds: cuePoints.battery.startSeconds, endSeconds: cuePoints.battery.endSeconds }),
  STANDBY: Object.freeze({ startSeconds: cuePoints.ready.startSeconds, endSeconds: cuePoints.ready.endSeconds })
})
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
  : centerWorkflowLocalProgress(phaseKey.value, progress.value, animationIdentity.value))
const sceneCanvasRef = ref(null)
const centerMasterVideoRef = ref(null)
const centerMasterVideoReady = ref(false)
const centerMasterVideoFailed = ref(false)
const videoContentRect = ref(null)
const stageVideoSegment = computed(() => CENTER_STAGE_VIDEO_SEGMENTS[phaseKey.value] || null)
const videoVisualActive = computed(() => Boolean(
  stageVideoSegment.value && centerMasterVideoReady.value && !centerMasterVideoFailed.value
))
const stageCardLayoutStyle = computed(() => {
  const rect = videoContentRect.value
  if (!videoVisualActive.value || !rect) return {}
  const anchor = CENTER_WORKFLOW_MASTER_VIDEO.overlayAnchors.topLeft
  return {
    left: `${rect.left + rect.width * anchor.leftPct / 100}px`,
    top: `${rect.top + rect.height * anchor.topPct / 100}px`,
    width: `${rect.width * anchor.widthPct / 100}px`,
    minWidth: '0'
  }
})
const bottomVideoCardLayoutStyle = computed(() => {
  const rect = videoContentRect.value
  if (!videoVisualActive.value || !rect) return {}
  const anchor = CENTER_WORKFLOW_MASTER_VIDEO.overlayAnchors.bottomRight
  return {
    right: `${rect.canvasWidth - rect.left - rect.width + rect.width * anchor.rightPct / 100}px`,
    bottom: `${rect.canvasHeight - rect.top - rect.height + rect.height * anchor.bottomPct / 100}px`,
    width: `${rect.width * anchor.widthPct / 100}px`,
    minWidth: '0'
  }
})
const checkListLayoutStyle = computed(() => videoVisualActive.value ? bottomVideoCardLayoutStyle.value : {})
const stageVideoState = computed(() => {
  if (!stageVideoSegment.value) return 'fallback'
  if (centerMasterVideoFailed.value) return 'failed'
  return centerMasterVideoReady.value ? 'ready' : 'loading'
})
const stageVideoPlaybackRate = computed(() => {
  const baseRate = Number(CENTER_WORKFLOW_MASTER_VIDEO.playbackRate) || 1
  return Math.max(0.25, Math.min(4, baseRate * Math.max(0.25, Number(props.playbackRate) || 1)))
})
const stageVideoTimelineSeconds = computed(() => {
  const segment = stageVideoSegment.value
  if (!segment) return 0
  if (segment.holdFrame) return Math.max(segment.startSeconds, segment.endSeconds - 0.04)
  return segment.startSeconds + (segment.endSeconds - segment.startSeconds) * localProgress.value
})
const activeStage = computed(() => centerWorkflowStage(phaseKey.value))
const activeStageIndex = computed(() => CENTER_WORKFLOW_STAGES.findIndex(stage => stage.key === phaseKey.value))
const stageVisual = computed(() => resolveCenterWorkflowSprite(activeStage.value.visualKey))
const devicePose = computed(() => centerWorkflowDevicePose(phaseKey.value, localProgress.value))
const deviceOpacity = computed(() => {
  if (phaseKey.value === 'ARRIVE') return 1
  if (phaseKey.value !== 'DOCK') return 0
  const fadeEnd = Number(CENTER_WORKFLOW_SCENE.device.dockFadeEnd) || 0.58
  return 1 - clamp(localProgress.value / Math.max(0.01, fadeEnd))
})
const deviceStyle = computed(() => ({
  left: `${devicePose.value.x}%`,
  top: `${devicePose.value.y}%`,
  width: `${CENTER_WORKFLOW_SCENE.device.widthPct}%`,
  opacity: deviceOpacity.value,
  transform: `translate(-50%,-72%) scale(${devicePose.value.scale}) rotate(${devicePose.value.rotate}deg)`
}))

const stageDescription = computed(() => ({
  ARRIVE: '设备沿中心入口进入处理区。',
  DOCK: '完成泊位定位、夹紧与处理接口确认。',
  UNLOAD: '倾倒模块将桶内垃圾转入后端分拣区域。',
  CLEAN: '维护区域执行桶体清洁。',
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
const videoDeviceStatus = computed(() => ({
  ARRIVE: '设备入站中',
  UNLOAD: '卸料称重中',
  CLEAN: '清洗消毒中',
  CHARGE: '补能连接中',
  CHECK: '状态检测中',
  STANDBY: '已清洁待命'
}[phaseKey.value] || activeStage.value.label))

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

const dockZoneStyle = computed(() => ({
  left: '8%', top: '24%', width: '18%', height: '35%',
  opacity: clamp((localProgress.value - 0.18) / 0.34)
}))
const dockPulseOpacity = computed(() => 0.36 + Math.sin(localProgress.value * Math.PI * 4) * 0.18)
const dockLockOpacity = computed(() => clamp((localProgress.value - 0.55) / 0.35))
const readyHaloOpacity = computed(() => 0.45 + Math.sin(localProgress.value * Math.PI * 3) * 0.22)
const cleanSweepStyle = computed(() => ({
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

function centerMasterVideoElement() {
  const target = centerMasterVideoRef.value
  if (!target) return null
  if (typeof target.play === 'function') return target
  const root = target.$el || target
  if (typeof root?.play === 'function') return root
  return root?.querySelector?.('video') || null
}

function sceneCanvasElement() {
  const target = sceneCanvasRef.value
  if (!target) return null
  const root = target.$el || target
  if (typeof root?.getBoundingClientRect === 'function') return root
  return root?.querySelector?.('.scene-canvas') || null
}

function updateVideoContentRect() {
  const canvas = sceneCanvasElement()
  if (!canvas) return
  const bounds = canvas.getBoundingClientRect()
  const canvasWidth = Number(bounds.width) || 0
  const canvasHeight = Number(bounds.height) || 0
  if (!canvasWidth || !canvasHeight) return

  const media = centerMasterVideoElement()
  const sourceWidth = Number(media?.videoWidth) || Number(CENTER_WORKFLOW_MASTER_VIDEO.width) || 16
  const sourceHeight = Number(media?.videoHeight) || Number(CENTER_WORKFLOW_MASTER_VIDEO.height) || 9
  const sourceAspect = sourceWidth / Math.max(1, sourceHeight)
  const canvasAspect = canvasWidth / canvasHeight
  const width = canvasAspect > sourceAspect ? canvasHeight * sourceAspect : canvasWidth
  const height = canvasAspect > sourceAspect ? canvasHeight : canvasWidth / sourceAspect
  videoContentRect.value = {
    canvasWidth,
    canvasHeight,
    left: (canvasWidth - width) / 2,
    top: (canvasHeight - height) / 2,
    width,
    height
  }
}

function bindVideoLayoutObserver() {
  updateVideoContentRect()
  const canvas = sceneCanvasElement()
  if (canvas && typeof ResizeObserver !== 'undefined') {
    sceneResizeObserver = new ResizeObserver(updateVideoContentRect)
    sceneResizeObserver.observe(canvas)
  }
  if (typeof window !== 'undefined') window.addEventListener('resize', updateVideoContentRect)
}

function unbindVideoLayoutObserver() {
  sceneResizeObserver?.disconnect?.()
  sceneResizeObserver = null
  if (typeof window !== 'undefined') window.removeEventListener('resize', updateVideoContentRect)
}

function pauseCenterMasterVideo() {
  const media = centerMasterVideoElement()
  if (!media) return
  try { media.pause?.() } catch (_) {}
}

function seekCenterMasterVideo(seconds) {
  const media = centerMasterVideoElement()
  if (!media) return
  const target = Math.max(0, Math.min(
    Number(seconds) || 0,
    Math.max(0, CENTER_WORKFLOW_MASTER_VIDEO.durationSeconds - 0.04)
  ))
  try {
    if (typeof media.fastSeek === 'function') media.fastSeek(target)
    else media.currentTime = target
  } catch (_) {}
}

function updateCenterMasterVideoRate() {
  const media = centerMasterVideoElement()
  if (!media) return
  try { media.playbackRate = stageVideoPlaybackRate.value } catch (_) {}
}

async function playCenterMasterVideo() {
  if (!props.running || !videoVisualActive.value || progress.value >= 1) return
  if (stageVideoSegment.value?.holdFrame) {
    holdCenterMasterVideoEnd()
    return
  }
  await nextTick()
  const media = centerMasterVideoElement()
  if (!media) return
  updateCenterMasterVideoRate()
  try {
    const promise = media.play?.()
    if (promise?.catch) promise.catch(() => {})
  } catch (_) {}
}

function syncCenterMasterVideo(forceSeek = false) {
  if (!videoVisualActive.value) {
    pauseCenterMasterVideo()
    return
  }
  if (stageVideoSegment.value?.holdFrame) {
    pauseCenterMasterVideo()
    if (forceSeek) seekCenterMasterVideo(stageVideoTimelineSeconds.value)
    return
  }
  if (forceSeek) seekCenterMasterVideo(stageVideoTimelineSeconds.value)
  updateCenterMasterVideoRate()
  if (props.running && progress.value < 1) playCenterMasterVideo()
  else pauseCenterMasterVideo()
}

function holdCenterMasterVideoEnd() {
  const segment = stageVideoSegment.value
  if (!segment) return
  pauseCenterMasterVideo()
  seekCenterMasterVideo(segment.endSeconds - 0.04)
}

function handleCenterMasterVideoReady() {
  const firstReady = !centerMasterVideoReady.value
  centerMasterVideoReady.value = true
  centerMasterVideoFailed.value = false
  updateVideoContentRect()
  if (firstReady) nextTick(() => syncCenterMasterVideo(true))
}

function handleCenterMasterVideoTimeUpdate() {
  const media = centerMasterVideoElement()
  const segment = stageVideoSegment.value
  if (!media || !segment || Number(media.currentTime) < segment.endSeconds - 0.04) return
  holdCenterMasterVideoEnd()
}

function handleCenterMasterVideoEnded() {
  holdCenterMasterVideoEnd()
}

function handleCenterMasterVideoError() {
  centerMasterVideoFailed.value = true
  pauseCenterMasterVideo()
}

function stop() {
  if (rafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId)
  rafId = 0
  lastTimestamp = 0
  pauseCenterMasterVideo()
}

function tick(timestamp) {
  if (!props.running) return stop()
  const now = Number(timestamp) || Date.now()
  if (!lastTimestamp) lastTimestamp = now
  const delta = Math.min(100, Math.max(0, now - lastTimestamp))
  lastTimestamp = now
  const duration = centerWorkflowDuration(animationIdentity.value)
  progress.value = Math.min(1, progress.value + delta * Math.max(0.25, Number(props.playbackRate) || 1) / duration)
  if (progress.value >= 1) {
    holdCenterMasterVideoEnd()
    return stop()
  }
  rafId = requestAnimationFrame(tick)
}

function play() {
  if (!props.running || progress.value >= 1 || rafId || typeof requestAnimationFrame !== 'function') return
  lastTimestamp = 0
  rafId = requestAnimationFrame(tick)
  nextTick(() => syncCenterMasterVideo(false))
}

function reset() {
  stop()
  progress.value = 0
  nextTick(() => syncCenterMasterVideo(true))
  play()
}

watch(() => [animationIdentity.value, props.resetKey], reset, { flush: 'post' })
watch(() => props.running, value => value ? play() : stop(), { flush: 'sync' })
watch(phaseKey, () => nextTick(() => syncCenterMasterVideo(true)), { flush: 'post' })
watch(() => props.playbackRate, () => syncCenterMasterVideo(false))
onMounted(() => {
  play()
  nextTick(bindVideoLayoutObserver)
})
onBeforeUnmount(() => {
  stop()
  unbindVideoLayoutObserver()
})
</script>

<style scoped>
.center-workflow-overlay { position:absolute; z-index:8; inset:12px auto 12px 12px; width:min(76%,760px); min-width:560px; display:flex; flex-direction:column; padding:14px; box-sizing:border-box; overflow:hidden; border:1px solid rgba(92,213,255,.55); border-radius:14px; color:#eaf9ff; background:linear-gradient(145deg,rgba(5,24,39,.98),rgba(8,43,62,.96)); box-shadow:0 18px 60px rgba(0,0,0,.45); }
.center-head,.center-footer { display:flex; align-items:center; justify-content:space-between; gap:12px; }.center-kicker { color:#54dbff; font:700 10px/1.2 ui-monospace,Consolas,monospace; letter-spacing:1.3px; }.center-title { margin-top:4px; color:#fff; font-size:18px; font-weight:800; }.center-status { display:flex; align-items:center; gap:7px; color:#9cc3d2; font-size:9px; }.center-status-dot { width:8px; height:8px; border-radius:50%; background:#607f8c; box-shadow:0 0 0 4px rgba(96,127,140,.12); }.center-status-dot.active { background:#54e6aa; box-shadow:0 0 0 4px rgba(84,230,170,.13),0 0 13px rgba(84,230,170,.5); }
.center-meta { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:6px; margin:10px 0; }.center-meta view { min-width:0; padding:7px 8px; border:1px solid rgba(112,194,232,.2); border-radius:8px; background:rgba(14,55,76,.58); }.center-meta text,.center-meta .b-text { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.center-meta text { color:#7fa5b6; font-size:9px; }.center-meta .b-text { margin-top:3px; color:#e6f8ff; font-size:11px; }
.flow-rail { position:relative; display:grid; grid-template-columns:repeat(7,1fr); gap:3px; padding-top:4px; }.rail-line { position:absolute; left:6%; right:6%; top:17px; height:2px; background:rgba(113,175,200,.25); }.flow-stage { position:relative; z-index:1; min-width:0; cursor:pointer; text-align:center; color:#688e9f; }.stage-dot { display:grid; place-items:center; width:24px; height:24px; margin:0 auto 4px; border:2px solid rgba(100,160,186,.35); border-radius:50%; color:#759aaa; background:#0b2b3d; font:800 9px/1 ui-monospace,Consolas,monospace; }.flow-stage text,.flow-stage .small-text { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.flow-stage text { font-size:9px; font-weight:700; }.flow-stage .small-text { margin-top:2px; font:6px/1 ui-monospace,Consolas,monospace; }.flow-stage.done { color:#68d9b1; }.flow-stage.done .stage-dot { color:#fff; border-color:#20b981; background:#147455; }.flow-stage.active { color:#e9fbff; }.flow-stage.active .stage-dot { color:#fff; border-color:#3ad4ff; background:#1680aa; box-shadow:0 0 16px rgba(50,203,255,.35); }
.process-panel { position:relative; flex:1; min-height:315px; margin-top:10px; border:1px solid rgba(76,204,247,.4); border-radius:12px; overflow:hidden; background:#031725; box-shadow:inset 0 0 38px rgba(19,133,168,.12); }.scene-canvas { position:absolute; inset:0; overflow:hidden; }.center-stage-visual { position:absolute; inset:0; width:100%; height:100%; opacity:.94; filter:saturate(1.12) contrast(1.06) brightness(.9); pointer-events:none; }.center-stage-video-layer { position:absolute; z-index:3; inset:0; overflow:hidden; opacity:0; pointer-events:none; transition:opacity .42s cubic-bezier(.22,.8,.24,1); background:#031421; }.center-stage-video-layer.active { opacity:1; }.center-stage-video-backdrop { position:absolute; inset:0; width:100%; height:100%; opacity:.22; filter:none; transform:none; }.center-stage-video { position:absolute; z-index:1; inset:0; width:100%; height:100%; background:transparent; object-fit:contain; }.center-stage-video video { object-fit:contain !important; }.center-stage-video-tone { position:absolute; z-index:2; inset:0; background:linear-gradient(90deg,rgba(2,17,29,.48),transparent 18%,transparent 82%,rgba(2,16,27,.48)),linear-gradient(0deg,rgba(2,16,27,.58),transparent 27%,rgba(3,20,32,.14)); box-shadow:inset 0 0 48px rgba(0,10,18,.5); }.scene-vignette { position:absolute; z-index:4; inset:0; pointer-events:none; background:linear-gradient(90deg,rgba(1,15,25,.42),transparent 31%,transparent 77%,rgba(1,15,25,.16)),linear-gradient(0deg,rgba(1,15,25,.45),transparent 34%); box-shadow:inset 0 0 55px rgba(0,8,14,.32); }
.device-actor { position:absolute; z-index:7; aspect-ratio:.78; transform-origin:50% 85%; filter:drop-shadow(0 8px 7px rgba(0,7,13,.48)); pointer-events:none; will-change:left,top,transform,opacity; }.device-actor image { position:absolute; z-index:2; inset:0; width:100%; height:100%; }.device-fill-window { position:absolute; z-index:3; right:12%; bottom:16%; width:13%; height:37%; overflow:hidden; border:1px solid rgba(255,225,164,.72); border-radius:3px; background:rgba(5,25,34,.5); }.device-fill-level { position:absolute; right:1px; bottom:1px; left:1px; border-radius:2px; background:linear-gradient(#ffc265,#e88031); box-shadow:0 0 8px rgba(255,165,74,.48); }
.dock-zone { position:absolute; z-index:4; border:1px dashed rgba(89,224,255,.6); border-radius:50%; }.dock-zone > .dock-pulse { position:absolute; inset:8%; border:2px solid #5be2ff; border-radius:50%; box-shadow:0 0 22px rgba(46,206,245,.38); }.dock-zone > .b-text { position:absolute; left:50%; bottom:4%; width:12px; height:6px; border-left:3px solid #59e6ad; border-bottom:3px solid #59e6ad; transform:translateX(-50%) rotate(-45deg); }.dock-label { position:absolute; left:50%; bottom:-16px; transform:translateX(-50%); color:#9eeeff; font-size:7px; white-space:nowrap; }.dock-lock { position:absolute; z-index:4; inset:10% -22%; }.dock-lock-edge { position:absolute; top:32%; width:22%; height:35%; border-top:3px solid #58e5ff; border-bottom:3px solid #58e5ff; }.dock-lock-edge:first-child { left:0; border-left:3px solid #58e5ff; border-radius:6px 0 0 6px; }.dock-lock-edge:last-child { right:0; border-right:3px solid #58e5ff; border-radius:0 6px 6px 0; }
.unload-mask,.clean-mask,.charge-mask,.check-mask { position:absolute; z-index:5; overflow:hidden; pointer-events:none; }.waste-particle { position:absolute; width:7px; height:5px; border-radius:2px; background:linear-gradient(135deg,#ffc35c,#eb7631); box-shadow:0 0 7px rgba(255,171,65,.48); }.clean-sweep { position:absolute; inset:-24% 0 0; background:linear-gradient(112deg,transparent 8%,rgba(109,255,194,.03) 20%,rgba(117,239,196,.38) 52%,rgba(84,207,168,.04) 80%,transparent 92%); filter:blur(1px); }.energy-link { position:absolute; left:7%; right:8%; top:58%; height:3px; border-radius:3px; background:linear-gradient(90deg,rgba(44,215,155,.18),#60efb2,rgba(44,215,155,.2)); box-shadow:0 0 12px rgba(62,229,167,.58); }.energy-dot { position:absolute; top:58%; width:8px; height:8px; margin:-3px 0 0 -4px; border-radius:50%; background:#b9ffe0; box-shadow:0 0 11px #44e6a6; }.check-mask { border:1px solid rgba(88,239,183,.46); background:rgba(24,139,103,.08); }.scan-line { position:absolute; left:4%; right:4%; height:2px; background:#76ffc8; box-shadow:0 0 11px #4be8a8; }.scan-corner { position:absolute; width:14px; height:14px; border-color:#73f6c4; }.scan-corner.c1{left:4px;top:4px;border-left:2px solid;border-top:2px solid}.scan-corner.c2{right:4px;top:4px;border-right:2px solid;border-top:2px solid}.scan-corner.c3{left:4px;bottom:4px;border-left:2px solid;border-bottom:2px solid}.scan-corner.c4{right:4px;bottom:4px;border-right:2px solid;border-bottom:2px solid}.ready-halo { position:absolute; z-index:1; inset:10%; border:3px solid #5aefb6; border-radius:50%; box-shadow:0 0 22px rgba(78,236,175,.7); }
.stage-card { position:absolute; z-index:9; left:12px; bottom:12px; width:39%; min-width:200px; padding:11px 12px; box-sizing:border-box; border:1px solid rgba(114,207,237,.3); border-radius:10px; background:linear-gradient(145deg,#052637,#031927); box-shadow:0 9px 28px rgba(0,10,18,.35); }.stage-card.video-mode { top:12px; bottom:auto; border-color:rgba(83,219,255,.58); box-shadow:0 9px 28px rgba(0,10,18,.4),inset 3px 0 #37d8f4; }.stage-card-head { display:flex; align-items:baseline; gap:8px; }.stage-card-head .small-text { color:#5ce0ff; font:700 7px/1 ui-monospace,Consolas,monospace; letter-spacing:.8px; }.stage-card-head .b-text { color:#fff; font-size:14px; }.stage-card > text { display:block; min-height:29px; margin-top:6px; color:#9fc2cf; font-size:8px; line-height:1.55; }.stage-progress { height:4px; margin-top:7px; overflow:hidden; border-radius:3px; background:rgba(105,176,202,.18); }.stage-progress-bar { display:block; height:100%; border-radius:3px; background:linear-gradient(90deg,#29bde7,#59eab1); box-shadow:0 0 10px rgba(50,212,255,.45); }.stage-metric { display:block; margin-top:6px; color:#64e4ff; font:800 15px/1 ui-monospace,Consolas,monospace; }.video-status-card { position:absolute; z-index:9; right:12px; bottom:12%; width:34%; min-width:180px; padding:10px 12px; box-sizing:border-box; border:1px solid rgba(84,231,177,.52); border-radius:9px; color:#eafaff; background:linear-gradient(135deg,#041f2f,#053342); box-shadow:0 8px 22px rgba(0,8,15,.42),inset 3px 0 #4ee5aa; }.video-status-card .small-text,.video-status-card .b-text,.video-status-card text { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.video-status-card .small-text { color:#71eab9; font-size:7px; }.video-status-card .b-text { margin-top:4px; color:#fff; font-size:12px; }.video-status-card text { margin-top:4px; color:#9fc6d5; font-size:8px; }
.check-list { position:absolute; z-index:9; right:12px; bottom:12px; width:34%; padding:8px 9px; border:1px solid rgba(92,232,181,.28); border-radius:9px; background:#03222b; }.check-list.video-mode { bottom:12%; background:#03222b; }.check-list view { display:grid; grid-template-columns:11px 1fr auto; align-items:center; gap:6px; min-height:20px; color:#779eaa; font-size:7px; }.check-indicator { width:7px; height:7px; border:1px solid #557e88; border-radius:50%; }.check-list .b-text { color:#9cb8bf; font-weight:600; }.check-list view.done { color:#c7f8e5; }.check-list view.done .check-indicator { border-color:#56e6ae; background:#43d89f; box-shadow:0 0 7px rgba(69,226,169,.5); }.check-list view.done .b-text { color:#62e7b2; }
.center-footer { margin-top:9px; }.center-footer > text { color:#668b9b; font-size:8px; }.center-controls { display:flex; gap:5px; }.center-controls button { margin:0; padding:0 11px; border:1px solid rgba(68,190,236,.6); color:#fff; background:#167db1; font-size:9px; }.center-controls button.secondary { color:#a9d6e8; background:rgba(255,255,255,.07); }
@media (max-width:900px) { .center-workflow-overlay { position:relative; inset:auto; width:100%; min-width:0; min-height:620px; }.center-meta { grid-template-columns:repeat(2,1fr); }.flow-stage .small-text { display:none; }.process-panel { min-height:360px; } }
@media (max-width:560px) { .center-workflow-overlay { padding:10px; min-height:610px; }.center-status { display:none; }.flow-stage text { font-size:7px; }.stage-dot { width:20px; height:20px; }.rail-line { top:15px; }.process-panel { min-height:370px; }.stage-card { left:8px; bottom:8px; width:56%; min-width:0; }.stage-card.video-mode { top:8px; bottom:auto; }.video-status-card { right:8px; bottom:12%; width:38%; min-width:0; }.check-list { right:8px; bottom:8px; width:38%; }.check-list.video-mode { bottom:12%; }.center-footer > text { display:none; } }

/* #ifdef MP-WEIXIN */
.center-workflow-overlay { position: relative; top: auto; left: auto; right: auto; bottom: auto; width: 100%; min-width: 0; height: auto; min-height: 360px; box-sizing: border-box; }
.center-meta { display: flex; flex-wrap: wrap; }
.center-meta view { flex: 1; min-width: 80px; }
.flow-rail { display: flex; justify-content: space-between; }
.flow-stage { flex: 1; }
.stage-dot { display: flex; align-items: center; justify-content: center; }
.check-list view { display: flex; align-items: center; gap: 6px; }
.device-actor { aspect-ratio: auto; }
.process-panel { min-height: 240px; }
.stage-card,.video-status-card,.check-list { position: relative; inset: auto; width: auto; min-width: 0; left: auto; right: auto; bottom: auto; top: auto; }
/* #endif */
</style>
