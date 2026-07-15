<template>
  <view class="sorting-workflow-player">
    <view ref="viewportRef" :class="['workflow-viewport', { 'transparent-environment': transparentEnvironment }]">
      <canvas
        ref="canvasRef"
        class="workflow-canvas"
        canvas-id="sortingWorkflowCanvas"
        id="sortingWorkflowCanvas"
        type="2d"
        aria-label="自主垃圾分类投放分层关节动画"
      ></canvas>
      <view v-if="loadFailed" class="workflow-error">机器人分层资源暂时无法加载</view>
      <view v-else-if="dynamicObject && visualPlaceholder" class="workflow-placeholder">对象素材未加载</view>
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
import { resolveSmartBinVisual } from '@/config/smart-bin-visual-registry.js'
import DIGITAL_TWIN_VISUAL_SYSTEM from '@/config/digital-twin-visual-system.js'
import {
  ROBOT_TASK_SCENE_SIZE,
  resolveRobotTaskScene,
  robotTaskSceneAssets
} from '@/config/robot-task-scene-registry.js'
import {
  resolveRobotTaskCamera,
  resolveRobotTaskShot,
  shotValue
} from '@/config/robot-task-shot-config.js'

const FRAME_COUNT = 48
const SMART_BIN_PLACE_VISUAL = resolveSmartBinVisual('sortingPlace')
const ROBOT_TASK_ASSET_SRCS = robotTaskSceneAssets()
const LOCAL_VISUAL = DIGITAL_TWIN_VISUAL_SYSTEM.robotTaskLocal
const STAGE_ORDER = ['scan', 'approach', 'grasp', 'transport', 'place', 'release', 'return']
const STAGE_LABELS = ['扫描', '接近', '抓取', '运输', '投放', '释放', '返回']
const SIX_STAGE_ORDER = ['scan', 'approach', 'grasp', 'transport', 'place', 'return']
const SIX_STAGE_LABELS = ['扫描', '接近', '抓取', '运输', '投放', '返回']
const BIN_SLOTS = Object.freeze([
  { key: 'recyclable', label: '可', color: '#2f80ed' },
  { key: 'kitchen', label: '厨', color: '#18a56b' },
  { key: 'hazardous', label: '危', color: '#e34d59' },
  { key: 'other', label: '其', color: '#7b8794' }
])
const STAGE_RANGES = Object.freeze({
  idle: [47, 47], scan: [0, 5], approach: [6, 12], grasp: [13, 19],
  transport: [20, 30], place: [31, 38], release: [39, 42], return: [43, 47],
  completed: [47, 47], error: [0, 0]
})
const PREVIOUS_RENDER_STAGE = Object.freeze({
  scan: 'idle',
  approach: 'scan',
  grasp: 'approach',
  transport: 'grasp',
  place: 'transport',
  release: 'place',
  return: 'release'
})
const PICKUP_BEND_END_PROGRESS = .78
const PICKUP_ATTACH_PROGRESS = .72
const PICKUP_RECOVER_PROGRESS = .28
const PICKUP_BEND_POSE = Object.freeze({
  waist: -24,
  head: 6,
  leftShoulder: 16,
  leftElbow: 14
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
  playbackRate: { type: Number, default: 1 },
  completeOnStageEnd: { type: Boolean, default: false },
  sixStageMode: { type: Boolean, default: false },
  dynamicObject: { type: Boolean, default: false },
  objectId: { type: String, default: '' },
  objectClass: { type: String, default: '' },
  targetBinId: { type: String, default: '' },
  taskSpatialContext: { type: Object, default: () => ({}) },
  wasteConfigSrc: { type: String, default: '/static/sorting-robot/waste-adapters.json' },
  binVisualSrc: { type: String, default: '' },
  transparentEnvironment: { type: Boolean, default: false },
  showControls: { type: Boolean, default: false },
  showStatus: { type: Boolean, default: false }
})

const emit = defineEmits(['ready', 'error', 'stagechange', 'stageend', 'framechange', 'visualchange'])
const viewportRef = ref(null)
const canvasRef = ref(null)
const currentStage = ref(normalizeSortingWorkflowStage(props.stage))
const playing = ref(false)
const frame = ref(STAGE_RANGES[currentStage.value][0])
const loadFailed = ref(false)
const visualPlaceholder = ref(false)
const stageLabel = computed(() => sortingWorkflowStageLabel(currentStage.value))

let canvas = null
let context = null
let rig = null
let timeline = null
let wasteConfig = null
let wasteAdapter = null
let images = {}
let assetsReady = false
let resizeObserver = null
let densityMediaQuery = null
let canvasPixelRatio = 1
let animationFrameId = 0
let stageStartedAt = 0
let stageProgress = 0
let pageVisible = true
let errorLogged = false
let loadRevision = 0
let stageCompletionEmitted = false
let wasteLoadRevision = 0
let wasteOpaqueBounds = null
let robotOpaqueBounds = null
let smartBinOpaqueBounds = null

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

const normalizeObjectKey = value => String(value || '').trim().toLowerCase().replace(/\s+/g, '_')

function resolveWasteAdapter(config) {
  const candidates = new Set([props.objectId, props.objectClass].map(normalizeObjectKey).filter(Boolean))
  return Object.entries(config?.objects || {}).reduce((match, [key, adapter]) => {
    if (match) return match
    const aliases = [key, ...(adapter.aliases || [])].map(normalizeObjectKey)
    return aliases.some(alias => candidates.has(alias)) ? { key, ...adapter } : null
  }, null)
}

function targetSlotKey() {
  if (wasteAdapter?.targetSlot) return wasteAdapter.targetSlot
  const target = normalizeObjectKey(props.targetBinId)
  return BIN_SLOTS.find(slot => target.includes(slot.key))?.key || 'other'
}

function adapterNumber(key, fallback) {
  const value = Number(wasteAdapter?.[key])
  return Number.isFinite(value) ? value : fallback
}

function adapterOffset(key) {
  const value = wasteAdapter?.[key]
  return Array.isArray(value) && value.length >= 2 ? [Number(value[0]) || 0, Number(value[1]) || 0] : [0, 0]
}

function measureOpaqueBounds(image) {
  if (!image || typeof document === 'undefined') return null
  try {
    const probe = document.createElement('canvas')
    probe.width = image.width
    probe.height = image.height
    const probeContext = probe.getContext('2d', { willReadFrequently: true })
    probeContext.drawImage(image, 0, 0)
    const pixels = probeContext.getImageData(0, 0, image.width, image.height).data
    let minX = image.width
    let minY = image.height
    let maxX = 0
    let maxY = 0
    for (let y = 0; y < image.height; y += 2) {
      for (let x = 0; x < image.width; x += 2) {
        if (pixels[(y * image.width + x) * 4 + 3] < 20) continue
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
    if (minX > maxX || minY > maxY) return null
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
  } catch (_) {
    return null
  }
}

function mergeOpaqueBounds(boundsList, sourceSize) {
  const valid = boundsList.filter(Boolean)
  if (!valid.length) return null
  return {
    minX: Math.max(0, Math.min(...valid.map(item => item.minX))),
    minY: Math.max(0, Math.min(...valid.map(item => item.minY))),
    maxX: Math.min(sourceSize.width, Math.max(...valid.map(item => item.maxX))),
    maxY: Math.min(sourceSize.height, Math.max(...valid.map(item => item.maxY)))
  }
}

async function loadWasteAdapter() {
  const revision = ++wasteLoadRevision
  if (!props.dynamicObject) {
    wasteConfig = null
    wasteAdapter = null
    wasteOpaqueBounds = null
    visualPlaceholder.value = false
    delete images.taskObject
    return
  }
  try {
    const response = await fetch(props.wasteConfigSrc, { cache: 'no-store' })
    if (!response.ok) throw new Error(`Waste adapter HTTP ${response.status}`)
    const config = await response.json()
    const adapter = resolveWasteAdapter(config)
    const image = adapter?.sprite ? await loadImage(adapter.sprite) : null
    if (revision !== wasteLoadRevision) return
    wasteConfig = config
    wasteAdapter = adapter
    if (image) {
      images.taskObject = image
      wasteOpaqueBounds = measureOpaqueBounds(image)
    }
    else delete images.taskObject
    visualPlaceholder.value = !adapter || !image
    emit('visualchange', {
      key: adapter?.key || '',
      label: adapter?.label || '视觉占位',
      category: adapter?.category || '',
      targetSlot: targetSlotKey(),
      placeholder: visualPlaceholder.value,
      source: adapter?.sourceModel || ''
    })
  } catch (error) {
    if (revision !== wasteLoadRevision) return
    wasteConfig = null
    wasteAdapter = null
    wasteOpaqueBounds = null
    delete images.taskObject
    visualPlaceholder.value = true
    emit('visualchange', { key: '', label: '视觉占位', category: '', targetSlot: targetSlotKey(), placeholder: true, error })
  }
  drawScene(performance.now())
}

function getPose() {
  const spec = timeline?.stages?.[currentStage.value] || timeline?.stages?.idle
  if (!spec) return null
  let pose = mixPose(spec.from, spec.to, stageProgress)
  const previous = timeline?.stages?.[PREVIOUS_RENDER_STAGE[currentStage.value]]
  const shot = resolveRobotTaskShot(currentStage.value, props.taskSpatialContext)
  const blendWindow = Math.min(.34, (Number(shot?.transitionDuration) || 0) / Math.max(1, Number(spec.durationMs) || 1000))
  if (previous?.to && blendWindow > 0 && stageProgress < blendWindow) {
    pose = mixPose(previous.to, pose, smoothstep(stageProgress / blendWindow))
  }
  if (Number.isFinite(spec.holdBottleAt)) pose.holdBottle = stageProgress >= spec.holdBottleAt
  if (Number.isFinite(spec.holdBottleUntil)) pose.holdBottle = stageProgress < spec.holdBottleUntil
  pose = applyPickupBendVisualPose(pose)
  return pose
}

function applyPickupBendVisualPose(pose) {
  if (!['grasp', 'transport'].includes(currentStage.value)) return pose
  const bend = currentStage.value === 'grasp'
    ? smoothstep(clamp(stageProgress / PICKUP_BEND_END_PROGRESS))
    : 1 - smoothstep(clamp(stageProgress / PICKUP_RECOVER_PROGRESS))
  if (bend <= 0) return pose
  const adjusted = { ...pose }
  Object.entries(PICKUP_BEND_POSE).forEach(([key, target]) => {
    adjusted[key] = lerp(Number(pose[key]) || 0, target, bend)
  })
  if (currentStage.value === 'grasp' && stageProgress < PICKUP_ATTACH_PROGRESS) adjusted.holdBottle = false
  return adjusted
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

function applyRotations(ctx, rotations) {
  rotations.forEach(({ pivot, degrees }) => {
    const [x, y] = pivot
    ctx.translate(x, y)
    ctx.rotate(degrees * Math.PI / 180)
    ctx.translate(-x, -y)
  })
}

function drawVisualPlaceholder(ctx, x, y, size, rotationAngle = 0, alpha = 1) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, y)
  ctx.rotate(rotationAngle)
  ctx.setLineDash([5, 4])
  ctx.strokeStyle = '#f59e0b'
  ctx.fillStyle = 'rgba(255,247,224,.94)'
  ctx.lineWidth = 2
  roundedRect(ctx, -size / 2, -size / 2, size, size, Math.max(6, size * .15))
  ctx.fill(); ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = '#b45309'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.font = `800 ${Math.max(10, size * .22)}px system-ui, sans-serif`
  ctx.fillText('视觉占位', 0, 0, size * .82)
  ctx.restore()
}

function drawTaskObjectScreen(ctx, x, y, robotScale, rotationExtra = 0, alpha = 1) {
  const rotationAngle = (adapterNumber('rotation', 0) * Math.PI / 180) + rotationExtra
  const scale = adapterNumber('scale', .26) * robotScale
  if (!images.taskObject || visualPlaceholder.value) {
    drawVisualPlaceholder(ctx, x, y, Math.max(34, 120 * robotScale), rotationAngle, alpha)
    return
  }
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, y)
  ctx.rotate(rotationAngle)
  ctx.scale(scale, scale)
  ctx.drawImage(images.taskObject, -images.taskObject.width / 2, -images.taskObject.height / 2)
  ctx.restore()
}

function drawTaskObjectHeld(ctx, rotations, robotLeft, robotTop, robotScale) {
  const [anchorX, anchorY] = rig.anchors?.bottleCenter || [59.5, 360.5]
  const [offsetX, offsetY] = adapterOffset('handOffset')
  ctx.save()
  ctx.translate(robotLeft, robotTop)
  ctx.scale(robotScale, robotScale)
  applyRotations(ctx, rotations)
  const rotationAngle = adapterNumber('rotation', 0) * Math.PI / 180
  if (!images.taskObject || visualPlaceholder.value) {
    drawVisualPlaceholder(ctx, anchorX + offsetX, anchorY + offsetY, 96, rotationAngle)
  } else {
    const scale = adapterNumber('scale', .26)
    ctx.translate(anchorX + offsetX, anchorY + offsetY)
    ctx.rotate(rotationAngle)
    ctx.scale(scale, scale)
    ctx.drawImage(images.taskObject, -images.taskObject.width / 2, -images.taskObject.height / 2)
  }
  ctx.restore()
}

const LEFT_ELBOW_SOCKET_RECT = [180, 263, 73, 39]
const LEFT_ELBOW_CAP_RECT = [180, 289, 73, 59]
const LEFT_JOINT_SOCKET_RECT = [168, 261, 82, 47]
const LEFT_JOINT_CAP_RECT = [168, 289, 82, 59]

function drawLeftElbowBridge(ctx, rotations, robotLeft, robotTop, robotScale) {
  ctx.save()
  ctx.translate(robotLeft, robotTop)
  ctx.scale(robotScale, robotScale)
  applyRotations(ctx, rotations)
  ctx.translate(217, 318)
  ctx.rotate(-.45)
  const shellGradient = ctx.createLinearGradient(-30, -17, 28, 16)
  shellGradient.addColorStop(0, 'rgba(246,248,248,.94)')
  shellGradient.addColorStop(.42, 'rgba(203,208,209,.95)')
  shellGradient.addColorStop(.72, 'rgba(132,139,142,.92)')
  shellGradient.addColorStop(1, 'rgba(73,80,84,.86)')
  ctx.fillStyle = shellGradient
  ctx.beginPath()
  ctx.ellipse(0, 0, 30, 19, 0, 0, Math.PI * 2)
  ctx.fill()

  const rimGradient = ctx.createLinearGradient(-24, -13, 22, 13)
  rimGradient.addColorStop(0, 'rgba(255,255,255,.42)')
  rimGradient.addColorStop(.48, 'rgba(255,255,255,.12)')
  rimGradient.addColorStop(1, 'rgba(20,26,30,.3)')
  ctx.strokeStyle = rimGradient
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.ellipse(0, 0, 28, 17, 0, 0, Math.PI * 2)
  ctx.stroke()
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
  drawLeftElbowBridge(ctx, leftLower, robotLeft, robotTop, robotScale)
  if (pose.holdBottle) {
    if (props.dynamicObject) drawTaskObjectHeld(ctx, leftLower, robotLeft, robotTop, robotScale)
    else drawLayer(ctx, 'bottle', leftLower, robotLeft, robotTop, robotScale)
  }
  drawLayer(ctx, 'rightShoulderCover', [waist], robotLeft, robotTop, robotScale)
  drawLayer(ctx, 'leftShoulderCover', [waist], robotLeft, robotTop, robotScale)
  drawLayer(ctx, 'leftElbowCover', [waist, leftShoulder], robotLeft, robotTop, robotScale, LEFT_ELBOW_SOCKET_RECT)
  drawLayer(ctx, 'leftJointCleanup', [waist, leftShoulder], robotLeft, robotTop, robotScale, LEFT_JOINT_SOCKET_RECT)
  drawLayer(ctx, 'leftElbowCover', leftLower, robotLeft, robotTop, robotScale, LEFT_ELBOW_CAP_RECT)
  drawLayer(ctx, 'leftJointCleanup', leftLower, robotLeft, robotTop, robotScale, LEFT_JOINT_CAP_RECT)
  drawLayer(ctx, 'sockets', [waist], robotLeft, robotTop, robotScale)
  drawLayer(ctx, 'bodyRightCover', [waist], robotLeft, robotTop, robotScale)
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
  const stageOrder = props.sixStageMode ? SIX_STAGE_ORDER : STAGE_ORDER
  const stageLabels = props.sixStageMode ? SIX_STAGE_LABELS : STAGE_LABELS
  const stageForDisplay = props.sixStageMode && currentStage.value === 'release' ? 'place' : currentStage.value
  const finalIndex = stageOrder.length - 1
  const activeIndex = currentStage.value === 'completed' ? finalIndex : stageOrder.indexOf(stageForDisplay)
  ctx.save()
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#dbe7e3'
  ctx.lineWidth = Math.max(2, height * .009)
  ctx.beginPath(); ctx.moveTo(left, top); ctx.lineTo(left + available, top); ctx.stroke()
  if (activeIndex >= 0) {
    ctx.strokeStyle = '#10b981'
    ctx.beginPath(); ctx.moveTo(left, top); ctx.lineTo(left + available * activeIndex / finalIndex, top); ctx.stroke()
  }
  stageOrder.forEach((stage, index) => {
    const x = left + available * index / finalIndex
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
      ctx.fillText(stageLabels[index], x, top + Math.max(18, height * .065))
    }
  })
  ctx.restore()
}

function drawSmartBin(ctx, binX, groundY, binWidth, binHeight) {
  const selectedKey = targetSlotKey()
  const selectedIndex = Math.max(0, BIN_SLOTS.findIndex(slot => slot.key === selectedKey))
  const image = images.smartBin
  const aspect = image?.width && image?.height ? image.width / image.height : .8
  const renderHeight = binHeight
  const renderWidth = renderHeight * aspect
  const left = binX - renderWidth / 2
  const top = groundY - renderHeight
  const inletX = left + renderWidth * SMART_BIN_PLACE_VISUAL.geometry.inletX
  const inletY = top + renderHeight * SMART_BIN_PLACE_VISUAL.geometry.inletY
  ctx.save()
  ctx.shadowColor = ['place', 'release'].includes(currentStage.value) ? 'rgba(36,203,151,.34)' : 'rgba(15,23,42,.18)'
  ctx.shadowBlur = 18
  if (image) ctx.drawImage(image, left, top, renderWidth, renderHeight)
  else {
    ctx.fillStyle = '#dfeaec'; ctx.strokeStyle = '#6f8b94'; ctx.lineWidth = 2
    roundedRect(ctx, left, top, renderWidth, renderHeight, 13); ctx.fill(); ctx.stroke()
  }
  ctx.shadowBlur = 0
  const railLeft = left + renderWidth * .12
  const railTop = groundY - Math.max(15, renderHeight * .095)
  const railWidth = renderWidth * .76
  const slotWidth = railWidth / BIN_SLOTS.length
  BIN_SLOTS.forEach((slot, index) => {
    const slotLeft = railLeft + index * slotWidth
    const selected = index === selectedIndex
    ctx.fillStyle = selected ? slot.color : 'rgba(19,48,57,.48)'
    roundedRect(ctx, slotLeft + 1, railTop, slotWidth - 2, Math.max(6, renderHeight * .035), 3); ctx.fill()
  })
  const selectedSlot = BIN_SLOTS[selectedIndex]
  ctx.strokeStyle = selectedSlot.color; ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(inletX, inletY, Math.max(6, renderWidth * .075), 0, Math.PI * 2); ctx.stroke()
  ctx.fillStyle = 'rgba(3,23,38,.86)'; roundedRect(ctx, left + renderWidth * .2, top - 22, renderWidth * .6, 19, 6); ctx.fill()
  ctx.fillStyle = selectedSlot.color; ctx.font = `800 ${Math.max(9, renderHeight * .06)}px system-ui, sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`${selectedSlot.label}仓`, binX, top - 12)
  ctx.restore()
  return { x: inletX, y: inletY + renderHeight * .035 }
}

function rotatePointAround(point, pivot, degrees) {
  const radians = degrees * Math.PI / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const dx = point[0] - pivot[0]
  const dy = point[1] - pivot[1]
  return [pivot[0] + dx * cos - dy * sin, pivot[1] + dx * sin + dy * cos]
}

function layerPointToWorld(point, rotations, robotLeft, robotTop, robotScale) {
  let transformed = [...point]
  for (let index = rotations.length - 1; index >= 0; index -= 1) {
    transformed = rotatePointAround(transformed, rotations[index].pivot, rotations[index].degrees)
  }
  return [robotLeft + transformed[0] * robotScale, robotTop + transformed[1] * robotScale]
}

function resolveRobotGeometry(pose, robotPosition, robotHeight) {
  const robotScale = robotHeight / rig.sourceSize.height
  const visibleBounds = robotOpaqueBounds || { minX: 0, minY: 0, maxX: rig.sourceSize.width, maxY: rig.sourceSize.height }
  const visibleCenterX = (visibleBounds.minX + visibleBounds.maxX) / 2
  const visibleBottomY = Math.min(rig.sourceSize.height, visibleBounds.maxY)
  const robotLeft = robotPosition[0] - visibleCenterX * robotScale
  const robotTop = robotPosition[1] - visibleBottomY * robotScale
  const waist = rotation('waist', pose.waist)
  const rightShoulder = rotation('rightShoulder', pose.rightShoulder)
  const rightElbow = rotation('rightElbow', pose.rightElbow)
  const leftShoulder = rotation('leftShoulder', pose.leftShoulder)
  const leftElbow = rotation('leftElbow', pose.leftElbow)
  const head = rotation('head', pose.head)
  const leftLower = [waist, leftShoulder, leftElbow]
  const [anchorX, anchorY] = rig.anchors?.bottleCenter || [59.5, 360.5]
  const [offsetX, offsetY] = adapterOffset('handOffset')
  const handPoint = layerPointToWorld([anchorX + offsetX, anchorY + offsetY], leftLower, robotLeft, robotTop, robotScale)
  return {
    robotScale,
    robotLeft,
    robotTop,
    robotHeight,
    visibleWidth: Math.max(1, (visibleBounds.maxX - visibleBounds.minX) * robotScale),
    visibleHeight: Math.max(1, (visibleBottomY - visibleBounds.minY) * robotScale),
    robotPosition,
    handPoint,
    waist,
    rightShoulder,
    rightElbow,
    leftShoulder,
    leftElbow,
    head,
    leftLower
  }
}

function drawRobotActor(ctx, pose, geometry, drawObject) {
  const { robotLeft, robotTop, robotScale, waist, rightShoulder, rightElbow, leftShoulder, leftLower, head } = geometry
  drawLayer(ctx, 'base', [], robotLeft, robotTop, robotScale)
  drawLayer(ctx, 'rightUpperArm', [waist, rightShoulder], robotLeft, robotTop, robotScale)
  drawLayer(ctx, 'torso', [waist], robotLeft, robotTop, robotScale)
  drawLayer(ctx, 'head', [waist, head], robotLeft, robotTop, robotScale)
  drawLayer(ctx, 'rightLowerArmHand', [waist, rightShoulder, rightElbow], robotLeft, robotTop, robotScale)
  drawLayer(ctx, 'leftUpperArm', [waist, leftShoulder], robotLeft, robotTop, robotScale)
  drawLayer(ctx, 'leftLowerEmptyHand', leftLower, robotLeft, robotTop, robotScale)
  drawLeftElbowBridge(ctx, leftLower, robotLeft, robotTop, robotScale)
  if (props.dynamicObject) drawObject?.()
  else if (pose.holdBottle) drawLayer(ctx, 'bottle', leftLower, robotLeft, robotTop, robotScale)
  drawLayer(ctx, 'rightShoulderCover', [waist], robotLeft, robotTop, robotScale)
  drawLayer(ctx, 'leftShoulderCover', [waist], robotLeft, robotTop, robotScale)
  drawLayer(ctx, 'leftElbowCover', [waist, leftShoulder], robotLeft, robotTop, robotScale, LEFT_ELBOW_SOCKET_RECT)
  drawLayer(ctx, 'leftJointCleanup', [waist, leftShoulder], robotLeft, robotTop, robotScale, LEFT_JOINT_SOCKET_RECT)
  drawLayer(ctx, 'leftElbowCover', leftLower, robotLeft, robotTop, robotScale, LEFT_ELBOW_CAP_RECT)
  drawLayer(ctx, 'leftJointCleanup', leftLower, robotLeft, robotTop, robotScale, LEFT_JOINT_CAP_RECT)
  drawLayer(ctx, 'sockets', [waist], robotLeft, robotTop, robotScale)
  drawLayer(ctx, 'bodyRightCover', [waist], robotLeft, robotTop, robotScale)
}

function taskObjectScale() {
  return adapterNumber('sceneScale', adapterNumber('scale', .26) * .72)
}

function taskObjectBoundsAt(x, y, scale = taskObjectScale(), rotationDegrees = 0) {
  const image = images.taskObject
  const bounds = wasteOpaqueBounds || (image ? { minX: 0, minY: 0, maxX: image.width, maxY: image.height, width: image.width, height: image.height } : null)
  if (!image || !bounds) return { x, y, scale, rotationDegrees, left: -30, top: -30, width: 60, height: 60 }
  return {
    x,
    y,
    scale,
    rotationDegrees,
    left: (bounds.minX - image.width / 2) * scale,
    top: (bounds.minY - image.height / 2) * scale,
    width: Math.max(18, bounds.width * scale),
    height: Math.max(18, bounds.height * scale)
  }
}

function taskObjectGroundAtCenter(center, scale = taskObjectScale()) {
  const image = images.taskObject
  const bounds = wasteOpaqueBounds || (image ? { maxY: image.height } : null)
  if (!image || !bounds) return [...center]
  return [
    center[0],
    center[1] + (bounds.maxY - image.height / 2) * scale
  ]
}

function drawTaskObjectActor(ctx, state) {
  if (!state || state.alpha <= 0) return
  if (!props.dynamicObject) {
    drawBottleImage(ctx, state.x, state.y, .3, state.rotationDegrees * Math.PI / 180, state.alpha)
    return
  }
  if (!images.taskObject || visualPlaceholder.value) return
  ctx.save()
  ctx.globalAlpha = state.alpha
  ctx.translate(state.x, state.y)
  ctx.rotate(state.rotationDegrees * Math.PI / 180)
  ctx.scale(state.scale, state.scale)
  ctx.drawImage(images.taskObject, -images.taskObject.width / 2, -images.taskObject.height / 2)
  ctx.restore()
}

const LOCAL_GROUND_SHADOW_PROFILES = {
  robot: {
    baseOpacity: .22,
    widthScale: 1.66,
    minHeightRatio: .32,
    heightScale: 1.05,
    offsetRatioX: .38,
    offsetRatioY: -.02,
    rotation: 24,
    skew: -10,
    blur: 6.2,
    mainStops: [.84, .54, .24, .07],
    secondaryStops: [.3, .1],
    contactWidthRatio: .24,
    contactHeightRatio: .04,
    contactOffsetRatioX: .07,
    contactBlur: 1.7,
    contactStops: [.18, .06]
  },
  bin: {
    baseOpacity: .2,
    widthScale: 1.08,
    minHeightRatio: .2,
    heightScale: .95,
    offsetRatioX: .22,
    offsetRatioY: -.03,
    rotation: 21,
    skew: -8,
    blur: 4.2,
    mainStops: [.54, .31, .12, .04],
    secondaryStops: [.2, .07],
    contactWidthRatio: .3,
    contactHeightRatio: .04,
    contactOffsetRatioX: .055,
    contactBlur: 1.5,
    contactStops: [.2, .06]
  },
  waste: {
    baseOpacity: .18,
    widthScale: .86,
    minHeightRatio: .24,
    heightScale: .95,
    offsetRatioX: .16,
    offsetRatioY: -.04,
    rotation: 22,
    skew: -8,
    blur: 3.4,
    mainStops: [.36, .19, .07, .025],
    secondaryStops: [.11, .04],
    contactWidthRatio: .28,
    contactHeightRatio: .07,
    contactOffsetRatioX: .04,
    contactBlur: 1.1,
    contactStops: [.16, .045]
  }
}

function drawGroundShadow(ctx, x, y, width, height, opacity, profileKey = 'robot') {
  if (!opacity || opacity <= 0) return
  const localShadow = LOCAL_VISUAL.shadow
  const profile = LOCAL_GROUND_SHADOW_PROFILES[profileKey] || LOCAL_GROUND_SHADOW_PROFILES.robot
  const alphaScale = Math.max(0, Math.min(1, opacity / Math.max(.001, profile.baseOpacity)))
  const shadowWidth = Math.max(1, width * profile.widthScale)
  const shadowHeight = Math.max(1, height * profile.heightScale, width * profile.minHeightRatio)
  const alpha = value => Math.max(0, Math.min(1, value * alphaScale))
  const rotate = profile.rotation * Math.PI / 180
  const skew = Math.tan(profile.skew * Math.PI / 180)
  ctx.save()
  ctx.translate(
    x + localShadow.offsetX + width * profile.offsetRatioX,
    y + localShadow.offsetY + height * profile.offsetRatioY
  )
  ctx.rotate(rotate)
  ctx.transform(1, 0, skew, 1, 0, 0)
  ctx.scale(shadowWidth / 2, shadowHeight / 2)
  ctx.filter = `blur(${profile.blur}px)`
  const mainGradient = ctx.createRadialGradient(-.56, -.12, .06, 0, 0, 1)
  mainGradient.addColorStop(0, `rgba(0,12,20,${alpha(profile.mainStops[0])})`)
  mainGradient.addColorStop(.3, `rgba(0,12,20,${alpha(profile.mainStops[1])})`)
  mainGradient.addColorStop(.53, `rgba(0,12,20,${alpha(profile.mainStops[2])})`)
  mainGradient.addColorStop(.68, `rgba(0,12,20,${alpha(profile.mainStops[3])})`)
  mainGradient.addColorStop(.84, 'rgba(0,12,20,0)')
  mainGradient.addColorStop(1, 'rgba(0,12,20,0)')
  ctx.fillStyle = mainGradient
  ctx.beginPath()
  ctx.ellipse(0, 0, 1, 1, 0, 0, Math.PI * 2)
  ctx.fill()

  const secondaryGradient = ctx.createRadialGradient(.16, .08, .02, .16, .08, .78)
  secondaryGradient.addColorStop(0, `rgba(0,12,20,${alpha(profile.secondaryStops[0])})`)
  secondaryGradient.addColorStop(.38, `rgba(0,12,20,${alpha(profile.secondaryStops[1])})`)
  secondaryGradient.addColorStop(.7, 'rgba(0,12,20,0)')
  secondaryGradient.addColorStop(1, 'rgba(0,12,20,0)')
  ctx.fillStyle = secondaryGradient
  ctx.beginPath()
  ctx.ellipse(0, 0, 1, 1, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.translate(x + width * profile.contactOffsetRatioX, y)
  ctx.transform(1, 0, skew, 1, 0, 0)
  ctx.scale(
    Math.max(1, width * profile.contactWidthRatio / 2),
    Math.max(1, width * profile.contactHeightRatio / 2)
  )
  ctx.filter = `blur(${profile.contactBlur}px)`
  const contactGradient = ctx.createRadialGradient(0, 0, .03, 0, 0, 1)
  contactGradient.addColorStop(0, `rgba(0,10,17,${alpha(profile.contactStops[0]) * Math.min(1, localShadow.contactOpacity / .44)})`)
  contactGradient.addColorStop(.62, `rgba(0,10,17,${alpha(profile.contactStops[1])})`)
  contactGradient.addColorStop(.82, 'rgba(0,10,17,0)')
  contactGradient.addColorStop(1, 'rgba(0,10,17,0)')
  ctx.fillStyle = contactGradient
  ctx.beginPath()
  ctx.ellipse(0, 0, 1, 1, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function smartBinGeometry(binPosition, binHeight) {
  const image = images.smartBin
  const aspect = image?.width && image?.height ? image.width / image.height : .8
  const width = binHeight * aspect
  const visibleBounds = smartBinOpaqueBounds || { minX: 0, minY: 0, maxX: image?.width || 1, maxY: image?.height || 1 }
  const visibleCenterX = (visibleBounds.minX + visibleBounds.maxX) / 2
  const visibleBottomRatio = visibleBounds.maxY / Math.max(1, image?.height || 1)
  const left = binPosition[0] - visibleCenterX / Math.max(1, image?.width || 1) * width
  const top = binPosition[1] - visibleBottomRatio * binHeight
  return {
    x: binPosition[0],
    groundY: binPosition[1],
    width,
    height: binHeight,
    left,
    top,
    visibleWidth: (visibleBounds.maxX - visibleBounds.minX) / Math.max(1, image?.width || 1) * width,
    visibleHeight: (visibleBounds.maxY - visibleBounds.minY) / Math.max(1, image?.height || 1) * binHeight,
    inletX: left + width * SMART_BIN_PLACE_VISUAL.geometry.inletX,
    inletY: top + binHeight * SMART_BIN_PLACE_VISUAL.geometry.inletY
  }
}

function drawSmartBinActor(ctx, geometry, alpha = 1) {
  if (alpha <= 0) return
  const selectedKey = targetSlotKey()
  const selectedSlot = BIN_SLOTS.find(slot => slot.key === selectedKey) || BIN_SLOTS[BIN_SLOTS.length - 1]
  const active = ['place', 'release'].includes(currentStage.value)
  ctx.save()
  ctx.globalAlpha = alpha
  if (images.smartBin) ctx.drawImage(images.smartBin, geometry.left, geometry.top, geometry.width, geometry.height)
  ctx.shadowBlur = 0
  ctx.fillStyle = active ? selectedSlot.color : LOCAL_VISUAL.statusLight.normal
  ctx.beginPath()
  ctx.arc(geometry.left + geometry.width * .18, geometry.top + geometry.height * .085, LOCAL_VISUAL.statusLight.radius, 0, Math.PI * 2)
  ctx.fill()
  if (active) {
    ctx.strokeStyle = selectedSlot.color
    ctx.globalAlpha = alpha * .72
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.ellipse(geometry.inletX, geometry.inletY, geometry.width * .095, geometry.height * .027, 0, 0, Math.PI * 2); ctx.stroke()
  }
  ctx.restore()
}

function sceneAsset(src) {
  return images.sceneAssets?.[src] || null
}

function sceneDetailOpacity(scene, cameraScale) {
  const blend = scene?.detailEnvironment?.blend
  if (!blend) return 0
  if (currentStage.value === 'return' && blend.returnFade) {
    const start = clamp(Number(blend.returnFade.start) || 0)
    const end = Math.max(start + .001, clamp(Number(blend.returnFade.end) || 1))
    const fade = 1 - smoothstep(clamp((stageProgress - start) / (end - start)))
    return clamp(blend.maxOpacity) * fade
  }
  const progress = smoothstep(clamp((cameraScale - blend.startScale) / Math.max(.001, blend.endScale - blend.startScale)))
  return progress * clamp(blend.maxOpacity)
}

function drawEnvironmentScene(ctx, scene, alpha = 1, cameraScale = 1, forceBackground = false) {
  const background = sceneAsset(scene?.backgroundEnvironment?.src)
  const detail = sceneAsset(scene?.detailEnvironment?.src)
  if (!scene || alpha <= 0 || (!background && !detail)) return
  const crop = scene.crop
  ctx.save()
  // The enclosing park canvas owns the persistent full scene background when
  // transparentEnvironment is enabled. This canvas only adds the local detail
  // crop and re-paints the foreground masks from that same background.
  if (background && (forceBackground || !props.transparentEnvironment)) {
    ctx.globalAlpha = alpha
    ctx.drawImage(
      background,
      0, 0, background.width, background.height,
      0, 0, ROBOT_TASK_SCENE_SIZE.width, ROBOT_TASK_SCENE_SIZE.height
    )
  }
  const detailOpacity = sceneDetailOpacity(scene, cameraScale)
  if (detail && detailOpacity > 0) {
    ctx.globalAlpha = alpha * detailOpacity
    ctx.drawImage(detail, 0, 0, detail.width, detail.height, crop.x, crop.y, crop.width, crop.height)
  }
  ctx.restore()
}

function drawGroundLayer(ctx, scene, alpha = 1) {
  if (!scene || alpha <= 0) return
  ctx.save()
  ctx.globalAlpha = alpha
  if (scene.serviceBerth) {
    const berth = scene.serviceBerth
    ctx.fillStyle = berth.fill
    ctx.strokeStyle = berth.stroke
    ctx.lineWidth = 2
    ctx.setLineDash([10, 14])
    roundedRect(ctx, berth.x - berth.width / 2, berth.y - berth.height / 2, berth.width, berth.height, 22)
    ctx.fill(); ctx.stroke()
    ctx.setLineDash([])
  }
  ctx.restore()
}

function drawForegroundOcclusion(ctx, scene, alpha = 1, cameraScale = 1) {
  if (!scene || alpha <= 0) return
  scene.foregroundOcclusion.forEach(mask => {
    ctx.save()
    ctx.beginPath(); ctx.ellipse(mask.x, mask.y, mask.radiusX, mask.radiusY, 0, 0, Math.PI * 2); ctx.clip()
    drawEnvironmentScene(ctx, scene, alpha, cameraScale, true)
    ctx.restore()
  })
}

function sceneLayersForShot(shot, progress) {
  const transition = shot.sceneTransition
  if (!transition) return [{ scene: resolveRobotTaskScene(shot.scene), alpha: 1 }]
  const blend = smoothstep(clamp((progress - transition.start) / Math.max(.001, transition.end - transition.start)))
  return [
    { scene: resolveRobotTaskScene(transition.from), alpha: 1 - blend },
    { scene: resolveRobotTaskScene(transition.to), alpha: blend }
  ]
}

function quadraticPoint(from, control, to, progress) {
  const inverse = 1 - progress
  return [
    inverse * inverse * from[0] + 2 * inverse * progress * control[0] + progress * progress * to[0],
    inverse * inverse * from[1] + 2 * inverse * progress * control[1] + progress * progress * to[1]
  ]
}

function resolveTaskObjectState(stage, progress, shot, geometry, binGeometry) {
  if (!props.dynamicObject) return null
  const groundCenter = shot.wastePosition || [804, 489]
  const baseScale = taskObjectScale()
  const ground = taskObjectGroundAtCenter(groundCenter, baseScale)
  const groundRotation = adapterNumber('sceneRotation', adapterNumber('rotation', 0))
  const graspRotation = adapterNumber('graspRotation', groundRotation)
  const releaseRotation = adapterNumber('releaseRotation', graspRotation)
  let point = [...groundCenter]
  let rotationDegrees = groundRotation
  let alpha = 1
  let lifted = false

  if (stage === 'grasp') {
    const [start, end] = shot.pickupWindow || shot.graspWindow || [.62, .78]
    const pickup = smoothstep(clamp((progress - start) / Math.max(.001, end - start)))
    point = [
      lerp(groundCenter[0], geometry.handPoint[0], pickup),
      lerp(groundCenter[1], geometry.handPoint[1], pickup)
    ]
    rotationDegrees = lerp(groundRotation, graspRotation, pickup)
    lifted = pickup > .55
  } else if (['transport', 'place'].includes(stage)) {
    point = [...geometry.handPoint]
    const sway = stage === 'transport' ? Math.sin(progress * Math.PI * 2) * adapterNumber('transportSway', 0) : 0
    rotationDegrees = graspRotation + sway
    lifted = true
  } else if (stage === 'release') {
    const [start, end] = shot.releaseWindow || [.18, .88]
    const release = smoothstep(clamp((progress - start) / Math.max(.001, end - start)))
    const [dropOffsetX, dropOffsetY] = adapterOffset('dropOffset')
    const target = [binGeometry.inletX + dropOffsetX, binGeometry.inletY + binGeometry.height * .12 + dropOffsetY]
    const control = [(geometry.handPoint[0] + target[0]) / 2, Math.min(geometry.handPoint[1], binGeometry.inletY) - 34]
    point = quadraticPoint(geometry.handPoint, control, target, release)
    rotationDegrees = lerp(graspRotation, releaseRotation, release)
    alpha = release <= .84 ? 1 : 1 - smoothstep((release - .84) / .16)
    lifted = true
  } else if (['return', 'idle', 'completed'].includes(stage)) {
    alpha = 0
  }

  const bounds = taskObjectBoundsAt(point[0], point[1], baseScale, rotationDegrees)
  const shadowGroundY = lifted ? geometry.robotPosition[1] : ground[1]
  const liftDistance = Math.max(0, shadowGroundY - point[1])
  return {
    x: point[0],
    y: point[1],
    scale: baseScale,
    rotationDegrees,
    alpha,
    bounds,
    shadowX: point[0],
    shadowY: shadowGroundY,
    shadowScale: (1 - clamp(liftDistance / 520) * .42) * adapterNumber('groundShadowScale', 1),
    shadowOpacity: lifted ? LOCAL_VISUAL.shadow.wasteOpacity * .58 : LOCAL_VISUAL.shadow.wasteOpacity
  }
}

function drawRecognitionEffect(ctx, state, progress) {
  if (!state || state.alpha <= 0 || !images.taskObject) return
  const visual = LOCAL_VISUAL.recognition
  const padding = 9
  const left = state.bounds.left - padding
  const top = state.bounds.top - padding
  const width = state.bounds.width + padding * 2
  const height = state.bounds.height + padding * 2
  const corner = Math.min(visual.cornerLength, width * .28, height * .28)
  ctx.save()
  ctx.translate(state.x, state.y)
  ctx.rotate(state.rotationDegrees * Math.PI / 180)
  ctx.strokeStyle = visual.color
  ctx.lineWidth = visual.lineWidth
  ctx.lineCap = 'round'
  const corners = [
    [left, top, 1, 1], [left + width, top, -1, 1],
    [left, top + height, 1, -1], [left + width, top + height, -1, -1]
  ]
  corners.forEach(([x, y, dx, dy]) => {
    ctx.beginPath(); ctx.moveTo(x + dx * corner, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * corner); ctx.stroke()
  })
  ctx.globalAlpha = visual.scanOpacity
  ctx.beginPath()
  const scanY = top + height * (.16 + .68 * (0.5 - 0.5 * Math.cos(progress * Math.PI * 2)))
  ctx.moveTo(left + 5, scanY); ctx.lineTo(left + width - 5, scanY); ctx.stroke()
  ctx.restore()
}

function drawStageLabelLayer(ctx, width, height, label, sceneLabel) {
  const left = 16
  const top = height - 46
  ctx.save()
  ctx.fillStyle = 'rgba(3,24,38,.82)'
  ctx.strokeStyle = 'rgba(126,196,239,.34)'
  ctx.lineWidth = 1
  roundedRect(ctx, left, top, Math.min(238, width * .42), 30, 7)
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#e8f8ff'
  ctx.font = '700 12px "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
  ctx.fillText(label, left + 11, top + 15)
  ctx.fillStyle = '#88adbf'
  ctx.font = '500 10px "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(sceneLabel, left + Math.min(226, width * .42 - 12), top + 15)
  ctx.restore()
}

function shotTravelDistance(shot) {
  const position = shot?.robotPosition || {}
  const points = [position.from, ...(position.via || []), position.to].filter(Array.isArray)
  return points.slice(1).reduce((total, point, index) => total + Math.hypot(
    Number(point[0]) - Number(points[index][0]),
    Number(point[1]) - Number(points[index][1])
  ), 0)
}

function visualStageDuration(stage, timelineDuration) {
  const shot = resolveRobotTaskShot(stage, props.taskSpatialContext)
  const baseDuration = Math.max(1, timelineDuration || 1000)
  const shotMinimum = Number(shot?.minDurationMs) || 0
  const motion = LOCAL_VISUAL.motion || {}
  if (!(motion.cappedStages || []).includes(stage)) return Math.max(baseDuration, shotMinimum)
  const distance = shotTravelDistance(shot)
  const speed = Math.max(1, Number(motion.maxTravelUnitsPerSecond) || 1)
  return Math.max(
    baseDuration,
    shotMinimum,
    Number(motion.minTravelDurationMs) || 0,
    Math.ceil(distance / speed * 1000)
  )
}

function drawScene(time = 0) {
  if (!canvas || !context || !assetsReady || !rig || !timeline) return
  // The backing-store dimensions and drawing transform must use the same DPR.
  // Reading window.devicePixelRatio here caused a mixed old/new ratio for one
  // or more frames after a window moved between monitors.
  const ratio = canvasPixelRatio
  const width = canvas.width / ratio
  const height = canvas.height / ratio
  if (!width || !height) return
  const ctx = context
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  if (!props.transparentEnvironment) {
    ctx.fillStyle = LOCAL_VISUAL.sceneFrame.background
    ctx.fillRect(0, 0, width, height)
  }

  const pose = getPose()
  if (!pose) return
  const rawProgress = clamp(stageProgress)
  const camera = resolveRobotTaskCamera(currentStage.value, rawProgress, props.taskSpatialContext)
  const { shot, easedProgress, robotPosition, wastePosition, binPosition, cameraScale, focus } = camera
  const baseScale = Math.min(width / ROBOT_TASK_SCENE_SIZE.width, height / ROBOT_TASK_SCENE_SIZE.height)
  const sceneLayers = sceneLayersForShot(shot, rawProgress)

  ctx.save()
  ctx.translate(width / 2, height / 2)
  ctx.scale(baseScale * cameraScale, baseScale * cameraScale)
  ctx.translate(-focus[0], -focus[1])

  sceneLayers.forEach(layer => drawEnvironmentScene(ctx, layer.scene, layer.alpha, cameraScale))
  sceneLayers.forEach(layer => drawGroundLayer(ctx, layer.scene, layer.alpha))

  const geometry = resolveRobotGeometry(pose, robotPosition, shotValue(shot.robotHeight, easedProgress))
  const binGeometry = smartBinGeometry(binPosition, shotValue(shot.binHeight, easedProgress))
  const objectState = resolveTaskObjectState(currentStage.value, rawProgress, shot, geometry, binGeometry)
  const showBinAlpha = shot.showBin ? 1 : 0

  drawGroundShadow(ctx, robotPosition[0], robotPosition[1], geometry.visibleWidth * .9, 30, LOCAL_VISUAL.shadow.robotOpacity, 'robot')
  if (showBinAlpha > 0) drawGroundShadow(ctx, binPosition[0], binPosition[1], binGeometry.visibleWidth * .88, 26, LOCAL_VISUAL.shadow.binOpacity * showBinAlpha, 'bin')
  if (objectState?.alpha > 0) {
    drawGroundShadow(
      ctx,
      objectState.shadowX,
      objectState.shadowY,
      Math.max(24, objectState.bounds.width * objectState.shadowScale),
      Math.max(9, objectState.bounds.height * .16 * objectState.shadowScale),
      objectState.shadowOpacity * objectState.alpha,
      'waste'
    )
  }

  drawSmartBinActor(ctx, binGeometry, showBinAlpha)
  drawRobotActor(ctx, pose, geometry, () => drawTaskObjectActor(ctx, objectState))
  if (!props.dynamicObject && pose.showTarget && !pose.holdBottle) {
    drawBottleImage(ctx, wastePosition[0], wastePosition[1], .3, -.16)
  }

  sceneLayers.forEach(layer => drawForegroundOcclusion(ctx, layer.scene, layer.alpha, cameraScale))
  if (currentStage.value === 'scan') drawRecognitionEffect(ctx, objectState, rawProgress)
  ctx.restore()

  const phaseText = currentStage.value === 'idle'
    ? '等待任务'
    : currentStage.value === 'completed'
      ? '分类投放完成'
      : props.sixStageMode && currentStage.value === 'release'
        ? sortingWorkflowStageLabel('place')
        : stageLabel.value
  const activeScene = sceneLayers.reduce((best, item) => item.alpha > best.alpha ? item : best, sceneLayers[0]).scene
  if (!props.transparentEnvironment) drawStageLabelLayer(ctx, width, height, phaseText, activeScene.label)
}

function resizeCanvas() {
  if (!canvas || !context) return
  const viewport = viewportRef.value?.$el || viewportRef.value
  const rect = viewport?.getBoundingClientRect?.() || canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  if (canvas.style) {
    canvas.style.width = `${Math.round(rect.width)}px`
    canvas.style.height = `${Math.round(rect.height)}px`
  }
  const ratio = Math.max(1, Math.min(2, Number(window.devicePixelRatio) || 1))
  canvasPixelRatio = ratio
  const width = Math.round(rect.width * ratio)
  const height = Math.round(rect.height * ratio)
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  drawScene(performance.now())
}

function unbindDensityWatcher() {
  if (!densityMediaQuery) return
  if (typeof densityMediaQuery.removeEventListener === 'function') densityMediaQuery.removeEventListener('change', handleDensityChange)
  else densityMediaQuery.removeListener?.(handleDensityChange)
  densityMediaQuery = null
}

function bindDensityWatcher() {
  unbindDensityWatcher()
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
  const density = Math.max(.1, Number(window.devicePixelRatio) || 1)
  densityMediaQuery = window.matchMedia(`(resolution: ${density}dppx)`)
  if (typeof densityMediaQuery.addEventListener === 'function') densityMediaQuery.addEventListener('change', handleDensityChange)
  else densityMediaQuery.addListener?.(handleDensityChange)
}

function handleDensityChange() {
  // Re-register against the new density because a MediaQueryList only tracks
  // the density value used when it was created.
  bindDensityWatcher()
  resizeCanvas()
}

function handleWindowResize() {
  resizeCanvas()
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
    const [rigResponse, timelineResponse, smartBinImage, sceneAssetEntries] = await Promise.all([
      fetch(props.rigSrc, { cache: 'no-store' }),
      fetch(props.timelineSrc, { cache: 'no-store' }),
      loadImage(props.binVisualSrc || SMART_BIN_PLACE_VISUAL.src),
      Promise.all(ROBOT_TASK_ASSET_SRCS.map(async src => [src, await loadImage(src)]))
    ])
    if (!rigResponse.ok) throw new Error(`Rig HTTP ${rigResponse.status}`)
    if (!timelineResponse.ok) throw new Error(`Timeline HTTP ${timelineResponse.status}`)
    const nextRig = await rigResponse.json()
    const nextTimeline = await timelineResponse.json()
    const entries = await Promise.all(Object.entries(nextRig.layers).map(async ([key, filename]) => [key, await loadImage(`${props.src}/${filename}`)]))
    if (revision !== loadRevision) return
    rig = nextRig
    timeline = nextTimeline
    images = Object.fromEntries(entries)
    images.smartBin = smartBinImage
    images.sceneAssets = Object.fromEntries(sceneAssetEntries)
    robotOpaqueBounds = mergeOpaqueBounds(
      entries.filter(([key]) => key !== 'bottle').map(([, image]) => measureOpaqueBounds(image)),
      nextRig.sourceSize
    )
    smartBinOpaqueBounds = measureOpaqueBounds(smartBinImage)
    assetsReady = true
    await loadWasteAdapter()
    if (revision !== loadRevision) return
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
  const spec = timeline?.stages?.[currentStage.value]
  const duration = visualStageDuration(currentStage.value, spec?.durationMs)
  const playbackRate = Math.max(.1, Number(props.playbackRate) || 1)
  if (!stageStartedAt) stageStartedAt = timestamp - stageProgress * duration / playbackRate
  if (!Number.isFinite(props.progress)) {
    const elapsed = (timestamp - stageStartedAt) * playbackRate
    if (props.loop && !props.completeOnStageEnd) {
      const cycle = (elapsed / duration) % 2
      stageProgress = cycle <= 1 ? cycle : 2 - cycle
    } else {
      stageProgress = clamp(elapsed / duration)
    }
  }
  const [start, end] = STAGE_RANGES[currentStage.value]
  frame.value = Math.round(lerp(start, end, stageProgress))
  emit('framechange', { frame: frame.value, stage: currentStage.value, progress: stageProgress })
  // The park camera consumes framechange. Wait for Vue to commit that CSS
  // transform, then draw the transparent local layer with the same progress.
  nextTick(() => drawScene(timestamp))
  if (props.completeOnStageEnd && stageProgress >= 1 && !stageCompletionEmitted) {
    stageCompletionEmitted = true
    pause()
    emit('stageend', { stage: currentStage.value, progress: 1 })
    return
  }
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
  stageCompletionEmitted = false
  emit('framechange', { frame: next, stage: currentStage.value, progress: stageProgress })
  nextTick(() => drawScene(performance.now()))
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
  stageCompletionEmitted = false
  frame.value = STAGE_RANGES[next][0]
  emit('stagechange', { stage: next, progress: stageProgress })
  nextTick(() => drawScene(performance.now()))
  if (props.autoplay || props.running === true) play()
}

function renderNow() { drawScene(performance.now()) }
function resume() { play() }
function destroy() {
  pause()
  resizeObserver?.disconnect()
  resizeObserver = null
  unbindDensityWatcher()
  if (typeof window !== 'undefined') window.removeEventListener('resize', handleWindowResize)
  images = {}
  rig = null
  timeline = null
  wasteConfig = null
  wasteAdapter = null
  wasteOpaqueBounds = null
  robotOpaqueBounds = null
  smartBinOpaqueBounds = null
  visualPlaceholder.value = false
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
watch(() => props.playbackRate, () => { stageStartedAt = 0 }, { flush: 'sync' })
watch(() => [props.src, props.rigSrc, props.timelineSrc, props.binVisualSrc], loadAssets)
watch(
  () => [props.dynamicObject, props.objectId, props.objectClass, props.targetBinId, props.wasteConfigSrc],
  () => { if (assetsReady) loadWasteAdapter() }
)

onMounted(async () => {
  await nextTick()
  canvas = canvasRef.value?.$el?.querySelector?.('canvas') || canvasRef.value?.$el || canvasRef.value
  if (canvas?.style) {
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
  }
  if (canvas?.getContext) context = canvas.getContext('2d', { alpha: true })
  if (context && typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(resizeCanvas)
    resizeObserver.observe(viewportRef.value?.$el || viewportRef.value)
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleWindowResize)
    bindDensityWatcher()
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

defineExpose({ play, pause, resume, seek, setStage, renderNow, loadWasteAdapter, destroy })
</script>

<style scoped>
.sorting-workflow-player,
.workflow-viewport,
.workflow-canvas { display: block; width: 100%; height: 100%; }
.workflow-viewport { position: relative; min-height: 260rpx; overflow: hidden; border-radius: 16rpx; background: #071b2a; }
.workflow-viewport.transparent-environment { background: transparent; }
.workflow-error { position: absolute; right: 18rpx; bottom: 16rpx; padding: 8rpx 14rpx; border-radius: 999rpx; color: #b91c1c; background: rgba(254,226,226,.94); font-size: 20rpx; }
.workflow-placeholder { position: absolute; right: 18rpx; top: 16rpx; padding: 7rpx 13rpx; border: 1px solid rgba(245,182,72,.4); border-radius: 6rpx; color: #f5c36d; background: rgba(47,35,18,.84); font-size: 20rpx; font-weight: 700; }
.workflow-footer { display: flex; align-items: center; gap: 16rpx; margin-top: 12rpx; }
.workflow-stage { color: #9fd5eb; font-size: 22rpx; font-weight: 800; }
.workflow-controls { flex: 1; display: flex; align-items: center; gap: 12rpx; }
.workflow-button { margin: 0; color: #fff; background: #167db1; }
.workflow-slider { flex: 1; }
@media (min-width: 1024px) {
  .workflow-viewport { min-height: 210px; border-radius: 14px; }
  .workflow-stage { font-size: 13px; }
  .workflow-error { right: 14px; bottom: 12px; padding: 5px 10px; font-size: 12px; }
  .workflow-placeholder { right: 14px; top: 12px; padding: 4px 9px; font-size: 11px; }
}
</style>
