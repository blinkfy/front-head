<template>
  <view class="sorting-workflow-player">
    <view ref="viewportRef" class="workflow-viewport">
      <canvas
        ref="canvasRef"
        class="workflow-canvas"
        canvas-id="sortingWorkflowCanvas"
        id="sortingWorkflowCanvas"
        type="2d"
        aria-label="自主垃圾分类投放分层关节动画"
      ></canvas>
      <view v-if="loadFailed" class="workflow-error">机器人分层资源暂时无法加载</view>
    </view>

    <view v-if="showStatus || showControls" class="workflow-footer">
      <text v-if="showStatus" class="workflow-stage">{{ stageLabel }}</text>
      <view v-if="showControls" class="workflow-controls">
        <button class="workflow-button" size="mini" @tap="playing ? pause() : play()">
          {{ playing ? '暂停' : '播放' }}
        </button>
        <slider class="workflow-slider" :value="frame" :min="0" :max="47" @change="seek($event.detail.value)" />
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { normalizeSortingWorkflowStage, sortingWorkflowStageLabel } from '@/utils/sorting-workflow.js'

const FRAME_COUNT = 48
const STAGE_ORDER = ['scan', 'approach', 'grasp', 'transport', 'place', 'release', 'return']
const STAGE_LABELS = ['扫描', '接近', '抓取', '运输', '投放', '释放', '返回']
const STAGE_RANGES = Object.freeze({
  idle: [47, 47], scan: [0, 5], approach: [6, 12], grasp: [13, 19],
  transport: [20, 30], place: [31, 38], release: [39, 42], return: [43, 47],
  completed: [47, 47], error: [0, 0]
})

const props = defineProps({
  stage: { type: String, default: 'idle' },
  progress: { type: Number, default: null },
  autoplay: { type: Boolean, default: false },
  running: { type: Boolean, default: undefined },
  loop: { type: Boolean, default: false },
  src: { type: String, default: '/static/sorting-robot/layers' },
  rigSrc: { type: String, default: '/static/sorting-robot/rig.json' },
  timelineSrc: { type: String, default: '/static/sorting-robot/timeline.json' },
  fallbackSrc: { type: String, default: '' },
  showControls: { type: Boolean, default: false },
  showStatus: { type: Boolean, default: false }
})

const emit = defineEmits(['ready', 'error', 'stagechange', 'stageend', 'framechange'])
const viewportRef = ref(null)
const canvasRef = ref(null)
const currentStage = ref(normalizeSortingWorkflowStage(props.stage))
const playing = ref(false)
const frame = ref(STAGE_RANGES[currentStage.value][0])
const loadFailed = ref(false)
const stageLabel = computed(() => sortingWorkflowStageLabel(currentStage.value))

let canvas = null
let context = null
let rig = null
let timeline = null
let images = {}
let assetsReady = false
let resizeObserver = null
let animationFrameId = 0
let stageStartedAt = 0
let stageProgress = 0
let pageVisible = true
let errorLogged = false
let loadRevision = 0

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value))
const lerp = (start, end, amount) => start + (end - start) * amount
const smoothstep = value => { const t = clamp(value); return t * t * (3 - 2 * t) }

function mixPose(from, to, progress) {
  const eased = smoothstep(progress)
  const pose = {}
  Object.keys(from).forEach(key => {
    pose[key] = typeof from[key] === 'number' && typeof to[key] === 'number'
      ? lerp(from[key], to[key], eased)
      : (eased < .5 ? from[key] : to[key])
  })
  return pose
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`))
    image.src = src
  })
}

function getPose() {
  const spec = timeline?.stages?.[currentStage.value] || timeline?.stages?.idle
  if (!spec) return null
  const pose = mixPose(spec.from, spec.to, stageProgress)
  if (Number.isFinite(spec.holdBottleAt)) pose.holdBottle = stageProgress >= spec.holdBottleAt
  if (Number.isFinite(spec.holdBottleUntil)) pose.holdBottle = stageProgress < spec.holdBottleUntil
  return pose
}

function rotation(pivotName, degrees) {
  return { pivot: rig.pivots[pivotName], degrees: Number(degrees) || 0 }
}

function drawLayer(ctx, imageKey, rotations, robotLeft, robotTop, robotScale, sourceRect = null) {
  const image = images[imageKey]
  if (!image) return
  ctx.save()
  ctx.translate(robotLeft, robotTop)
  ctx.scale(robotScale, robotScale)
  rotations.forEach(({ pivot, degrees }) => {
    const [x, y] = pivot
    ctx.translate(x, y)
    ctx.rotate(degrees * Math.PI / 180)
    ctx.translate(-x, -y)
  })
  if (sourceRect) {
    const [sx, sy, sw, sh] = sourceRect
    ctx.drawImage(image, sx, sy, sw, sh, sx, sy, sw, sh)
  } else {
    ctx.drawImage(image, 0, 0, rig.sourceSize.width, rig.sourceSize.height)
  }
  ctx.restore()
}

function drawRobot(ctx, pose, width, height, groundY) {
  const robotHeight = height * .72
  const robotScale = robotHeight / rig.sourceSize.height
  const travelProgress = clamp((pose.robotX - 500) / (1030 - 500))
  const robotX = width * lerp(.2, .82, travelProgress)
  const robotLeft = robotX - rig.sourceSize.width * robotScale / 2
  const robotTop = groundY - robotHeight
  const waist = rotation('waist', pose.waist)
  const rightShoulder = rotation('rightShoulder', pose.rightShoulder)
  const rightElbow = rotation('rightElbow', pose.rightElbow)
  const leftShoulder = rotation('leftShoulder', pose.leftShoulder)
  const leftElbow = rotation('leftElbow', pose.leftElbow)
  const head = rotation('head', pose.head)
  const leftLower = [waist, leftShoulder, leftElbow]

  drawLayer(ctx, 'base', [], robotLeft, robotTop, robotScale)
  drawLayer(ctx, 'rightUpperArm', [waist, rightShoulder], robotLeft, robotTop, robotScale)
  drawLayer(ctx, 'torso', [waist], robotLeft, robotTop, robotScale)
  drawLayer(ctx, 'head', [waist, head], robotLeft, robotTop, robotScale)
  drawLayer(ctx, 'rightLowerArmHand', [waist, rightShoulder, rightElbow], robotLeft, robotTop, robotScale)
  drawLayer(ctx, 'leftUpperArm', [waist, leftShoulder], robotLeft, robotTop, robotScale)
  drawLayer(ctx, 'leftLowerEmptyHand', leftLower, robotLeft, robotTop, robotScale)
  if (pose.holdBottle) drawLayer(ctx, 'bottle', leftLower, robotLeft, robotTop, robotScale)
  drawLayer(ctx, 'rightShoulderCover', [waist], robotLeft, robotTop, robotScale)
  drawLayer(ctx, 'leftShoulderCover', [waist], robotLeft, robotTop, robotScale)
  drawLayer(ctx, 'leftElbowCover', [waist, leftShoulder], robotLeft, robotTop, robotScale)
  drawLayer(ctx, 'sockets', [waist], robotLeft, robotTop, robotScale)
  return { robotScale, robotX, robotTop }
}

function drawBottleImage(ctx, x, y, scale, rotationAngle = 0, alpha = 1) {
  if (!images.bottle) return
  const [anchorX, anchorY] = rig.anchors?.bottleCenter || [59.5, 360.5]
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, y)
  ctx.rotate(rotationAngle)
  ctx.scale(scale, scale)
  ctx.drawImage(images.bottle, -anchorX, -anchorY)
  ctx.restore()
}

function drawStageRail(ctx, width, height) {
  const top = Math.max(24, height * .11)
  const left = width * .09
  const available = width * .83
  const activeIndex = currentStage.value === 'completed' ? 6 : STAGE_ORDER.indexOf(currentStage.value)
  ctx.save()
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#dbe7e3'
  ctx.lineWidth = Math.max(2, height * .009)
  ctx.beginPath(); ctx.moveTo(left, top); ctx.lineTo(left + available, top); ctx.stroke()
  if (activeIndex >= 0) {
    ctx.strokeStyle = '#10b981'
    ctx.beginPath(); ctx.moveTo(left, top); ctx.lineTo(left + available * activeIndex / 6, top); ctx.stroke()
  }
  STAGE_ORDER.forEach((stage, index) => {
    const x = left + available * index / 6
    const done = currentStage.value === 'completed' || activeIndex >= 0 && index <= activeIndex
    const active = index === activeIndex && currentStage.value !== 'completed'
    ctx.beginPath(); ctx.arc(x, top, active ? 7 : 5, 0, Math.PI * 2)
    ctx.fillStyle = done ? '#10b981' : '#dbe7e3'; ctx.fill()
    if (active) {
      ctx.beginPath(); ctx.arc(x, top, 12, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(16,185,129,.28)'; ctx.lineWidth = 3; ctx.stroke()
    }
    if (width >= 520 || active) {
      ctx.fillStyle = done ? '#047857' : '#94a3b8'
      ctx.font = `700 ${Math.max(10, height * .034)}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(STAGE_LABELS[index], x, top + Math.max(18, height * .065))
    }
  })
  ctx.restore()
}

function drawScene(time = 0) {
  if (!canvas || !context || !assetsReady || !rig || !timeline) return
  const ratio = Math.max(1, Math.min(2, Number(window.devicePixelRatio) || 1))
  const width = canvas.width / ratio
  const height = canvas.height / ratio
  if (!width || !height) return
  const ctx = context
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const background = ctx.createLinearGradient(0, 0, width, height)
  background.addColorStop(0, '#f8fffd')
  background.addColorStop(.58, '#f2fbf8')
  background.addColorStop(1, '#eaf8f5')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)
  drawStageRail(ctx, width, height)

  const pose = getPose()
  if (!pose) return
  const groundY = height * .9
  const sourceX = width * .1
  const binX = width * .76
  const binWidth = Math.max(54, Math.min(96, height * .23))
  const binHeight = height * .31

  ctx.save()
  ctx.strokeStyle = 'rgba(16,185,129,.2)'
  ctx.lineWidth = 2
  ctx.setLineDash([7, 10])
  ctx.beginPath(); ctx.moveTo(sourceX, groundY); ctx.lineTo(binX, groundY); ctx.stroke()
  ctx.restore()

  ctx.save()
  ctx.shadowColor = ['place', 'release', 'completed'].includes(currentStage.value) ? 'rgba(16,185,129,.32)' : 'rgba(15,23,42,.12)'
  ctx.shadowBlur = 18
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = ['place', 'release'].includes(currentStage.value) ? '#10b981' : '#cbd5e1'
  ctx.lineWidth = 2
  roundedRect(ctx, binX - binWidth / 2, groundY - binHeight, binWidth, binHeight, 12)
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#16352f'
  roundedRect(ctx, binX - binWidth * .34, groundY - binHeight - 7, binWidth * .68, 12, 5)
  ctx.fill()
  ;['#2563eb', '#16a34a', '#dc2626', '#64748b'].forEach((color, index) => {
    ctx.fillStyle = color
    ctx.fillRect(binX - binWidth / 2 + binWidth / 4 * index, groundY - 18, binWidth / 4, 18)
  })
  ctx.restore()

  const robot = drawRobot(ctx, pose, width, height, groundY)
  const bottleScale = Math.max(.16, robot.robotScale * .65)
  const targetY = height * (500 / 900)
  if (pose.showTarget && !pose.holdBottle) {
    drawBottleImage(ctx, sourceX, targetY, bottleScale, -.16)
    const boxWidth = 44
    const boxHeight = 70
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 2
    ctx.strokeRect(sourceX - boxWidth / 2, targetY - boxHeight / 2, boxWidth, boxHeight)
  }
  if (pose.bottleDrop > 0) {
    const drop = smoothstep(pose.bottleDrop)
    drawBottleImage(
      ctx,
      lerp(binX - width * .06, binX, drop),
      lerp(height * (470 / 900), height * (640 / 900), drop),
      bottleScale,
      .35 + drop * .9,
      1 - drop * .35
    )
  }

  const phaseText = currentStage.value === 'idle' ? '等待任务' : currentStage.value === 'completed' ? '分类投放完成' : stageLabel.value
  const chipX = width * .035
  const chipY = height * .2
  const chipWidth = Math.min(160, width * .27)
  const chipHeight = Math.max(34, height * .11)
  ctx.fillStyle = currentStage.value === 'error' ? 'rgba(254,226,226,.94)' : 'rgba(255,255,255,.94)'
  ctx.strokeStyle = currentStage.value === 'error' ? 'rgba(220,38,38,.28)' : 'rgba(5,150,105,.2)'
  roundedRect(ctx, chipX, chipY, chipWidth, chipHeight, 11)
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = currentStage.value === 'error' ? '#dc2626' : '#059669'
  ctx.font = `800 ${Math.max(12, height * .044)}px system-ui, sans-serif`
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
  ctx.fillText(phaseText, chipX + Math.max(10, width * .02), chipY + chipHeight / 2)
}

function resizeCanvas() {
  if (!canvas || !context) return
  const viewport = viewportRef.value?.$el || viewportRef.value
  const rect = viewport?.getBoundingClientRect?.() || canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const ratio = Math.max(1, Math.min(2, Number(window.devicePixelRatio) || 1))
  const width = Math.round(rect.width * ratio)
  const height = Math.round(rect.height * ratio)
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  drawScene(performance.now())
}

function reportLoadError(error) {
  pause()
  assetsReady = false
  loadFailed.value = true
  if (!errorLogged) {
    errorLogged = true
    console.error('[SortingWorkflowPlayer] 分层机器人资源加载失败', error)
  }
  emit('error', { message: '分层机器人资源加载失败', error })
}

async function loadAssets() {
  const revision = ++loadRevision
  pause()
  loadFailed.value = false
  assetsReady = false
  errorLogged = false
  try {
    const [rigResponse, timelineResponse] = await Promise.all([fetch(props.rigSrc), fetch(props.timelineSrc)])
    if (!rigResponse.ok) throw new Error(`Rig HTTP ${rigResponse.status}`)
    if (!timelineResponse.ok) throw new Error(`Timeline HTTP ${timelineResponse.status}`)
    const nextRig = await rigResponse.json()
    const nextTimeline = await timelineResponse.json()
    const entries = await Promise.all(Object.entries(nextRig.layers).map(async ([key, filename]) => [key, await loadImage(`${props.src}/${filename}`)]))
    if (revision !== loadRevision) return
    rig = nextRig
    timeline = nextTimeline
    images = Object.fromEntries(entries)
    assetsReady = true
    stageProgress = Number.isFinite(props.progress) ? clamp(props.progress) : 0
    resizeCanvas()
    emit('ready')
    if (props.autoplay || props.running === true) play()
  } catch (error) {
    if (revision === loadRevision) reportLoadError(error)
  }
}

function tick(timestamp) {
  if (!playing.value) return
  if (!stageStartedAt) stageStartedAt = timestamp - stageProgress * (timeline?.stages?.[currentStage.value]?.durationMs || 1000)
  const spec = timeline?.stages?.[currentStage.value]
  const duration = Math.max(1, spec?.durationMs || 1000)
  if (!Number.isFinite(props.progress)) {
    const elapsed = timestamp - stageStartedAt
    if (currentStage.value === 'scan' || props.loop) {
      const cycle = (elapsed / duration) % 2
      stageProgress = cycle <= 1 ? cycle : 2 - cycle
    } else {
      stageProgress = clamp(elapsed / duration)
    }
  }
  const [start, end] = STAGE_RANGES[currentStage.value]
  frame.value = Math.round(lerp(start, end, stageProgress))
  drawScene(timestamp)
  emit('framechange', { frame: frame.value, stage: currentStage.value, progress: stageProgress })
  animationFrameId = requestAnimationFrame(tick)
}

function play() {
  if (!assetsReady || playing.value || !pageVisible || typeof requestAnimationFrame !== 'function') return
  if (['idle', 'completed', 'error'].includes(currentStage.value)) { drawScene(performance.now()); return }
  playing.value = true
  stageStartedAt = 0
  animationFrameId = requestAnimationFrame(tick)
}

function pause() {
  playing.value = false
  if (animationFrameId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(animationFrameId)
  animationFrameId = 0
  stageStartedAt = 0
}

function seek(value) {
  const next = Math.max(0, Math.min(FRAME_COUNT - 1, Number(value) || 0))
  frame.value = next
  const [start, end] = STAGE_RANGES[currentStage.value]
  stageProgress = end === start ? 0 : clamp((next - start) / (end - start))
  drawScene(performance.now())
  emit('framechange', { frame: next, stage: currentStage.value, progress: stageProgress })
}

function setStage(value, progress) {
  const next = normalizeSortingWorkflowStage(value)
  const nextProgress = Number.isFinite(progress) ? clamp(progress) : Number.isFinite(props.progress) ? clamp(props.progress) : 0
  if (next === currentStage.value && nextProgress === stageProgress) {
    if (props.autoplay || props.running === true) play()
    return
  }
  pause()
  currentStage.value = next
  stageProgress = nextProgress
  frame.value = STAGE_RANGES[next][0]
  drawScene(performance.now())
  emit('stagechange', { stage: next, progress: stageProgress })
  if (props.autoplay || props.running === true) play()
}

function renderNow() { drawScene(performance.now()) }
function resume() { play() }
function destroy() {
  pause()
  resizeObserver?.disconnect()
  resizeObserver = null
  images = {}
  rig = null
  timeline = null
  assetsReady = false
}

function handleVisibilityChange() {
  pageVisible = typeof document === 'undefined' || !document.hidden
  if (!pageVisible) pause()
  else if (props.autoplay || props.running === true) play()
}

watch(() => props.stage, value => setStage(value), { flush: 'sync' })
watch(() => props.progress, value => {
  if (!Number.isFinite(value)) return
  stageProgress = clamp(value)
  drawScene(performance.now())
}, { flush: 'sync' })
watch(() => props.autoplay, enabled => enabled ? play() : (props.running !== true && pause()), { flush: 'sync' })
watch(() => props.running, enabled => enabled ? play() : (enabled === false && !props.autoplay && pause()), { flush: 'sync' })
watch(() => [props.src, props.rigSrc, props.timelineSrc], loadAssets)

onMounted(async () => {
  await nextTick()
  canvas = canvasRef.value?.$el?.querySelector?.('canvas') || canvasRef.value?.$el || canvasRef.value
  if (canvas?.getContext) context = canvas.getContext('2d', { alpha: true })
  if (context && typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(resizeCanvas)
    resizeObserver.observe(viewportRef.value?.$el || viewportRef.value)
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', handleVisibilityChange)
  resizeCanvas()
  loadAssets()
})

onActivated(() => { pageVisible = true; if (props.autoplay || props.running === true) play() })
onDeactivated(() => { pageVisible = false; pause() })
onBeforeUnmount(() => {
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', handleVisibilityChange)
  destroy()
  canvas = null
  context = null
})

defineExpose({ play, pause, resume, seek, setStage, renderNow, destroy })
</script>

<style scoped>
.sorting-workflow-player,
.workflow-viewport,
.workflow-canvas { display: block; width: 100%; height: 100%; }
.workflow-viewport { position: relative; min-height: 260rpx; overflow: hidden; border-radius: 16rpx; background: #f2fbf8; }
.workflow-error { position: absolute; right: 18rpx; bottom: 16rpx; padding: 8rpx 14rpx; border-radius: 999rpx; color: #b91c1c; background: rgba(254,226,226,.94); font-size: 20rpx; }
.workflow-footer { display: flex; align-items: center; gap: 16rpx; margin-top: 12rpx; }
.workflow-stage { color: #059669; font-size: 22rpx; font-weight: 800; }
.workflow-controls { flex: 1; display: flex; align-items: center; gap: 12rpx; }
.workflow-button { margin: 0; color: #fff; background: #059669; }
.workflow-slider { flex: 1; }
@media (min-width: 1024px) {
  .workflow-viewport { min-height: 210px; border-radius: 14px; }
  .workflow-stage { font-size: 13px; }
  .workflow-error { right: 14px; bottom: 12px; padding: 5px 10px; font-size: 12px; }
}
</style>
