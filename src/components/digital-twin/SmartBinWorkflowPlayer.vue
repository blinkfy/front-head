<template>
  <view class="smart-bin-workflow">
    <view ref="viewportRef" class="bin-workflow-viewport">
      <canvas
        ref="canvasRef"
        class="bin-workflow-canvas"
        canvas-id="smartBinWorkflowCanvas"
        id="smartBinWorkflowCanvas"
        type="2d"
        aria-label="智能垃圾桶内部连续处理动画"
      ></canvas>
      <view class="workflow-note">连续处理 · 完成后机构自动复位</view>
    </view>
  </view>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  SMART_BIN_PHASES,
  SMART_BIN_TOTAL_DURATION,
  SMART_BIN_WORKFLOW_CONFIG
} from '@/config/smart-bin-workflow.js'

const LOGICAL_WIDTH = SMART_BIN_WORKFLOW_CONFIG.logicalSize.width
const LOGICAL_HEIGHT = SMART_BIN_WORKFLOW_CONFIG.logicalSize.height
const PHASES = SMART_BIN_PHASES
const TOTAL_DURATION = SMART_BIN_TOTAL_DURATION
const SLOTS = SMART_BIN_WORKFLOW_CONFIG.slots

const props = defineProps({
  active: { type: Boolean, default: false },
  running: { type: Boolean, default: false },
  playbackRate: { type: Number, default: 1 },
  objectId: { type: String, default: '' },
  objectClass: { type: String, default: '' },
  targetBinId: { type: String, default: '' },
  fillTargetPct: { type: Number, default: 0 },
  fillEventSequence: { type: Number, default: 0 },
  resetKey: { type: [String, Number], default: '' },
  wasteConfigSrc: { type: String, default: '/static/sorting-robot/waste-adapters.json' },
  structureVisualSrc: { type: String, default: '' }
})
const emit = defineEmits(['complete', 'progress', 'visualchange', 'error'])

const viewportRef = ref(null)
const canvasRef = ref(null)
const progress = ref(0)
const phaseKey = ref(PHASES[0].key)
const phaseLabel = ref(PHASES[0].label)

let canvas = null
let context = null
let objectImage = null
let adapter = null
let componentImages = {}
let ready = false
let playing = false
let completed = false
let elapsedMs = 0
let lastTimestamp = 0
let rafId = 0
let resizeObserver = null
let loadRevision = 0

const normalizeKey = value => String(value || '').trim().toLowerCase().replace(/\s+/g, '_')
const targetFill = computed(() => Math.max(0, Math.min(100, Number(props.fillTargetPct) || 0)))

function clamp(value, min = 0, max = 1) { return Math.max(min, Math.min(max, value)) }
function lerp(start, end, amount) { return start + (end - start) * clamp(amount) }
function ease(amount) { const t = clamp(amount); return t * t * (3 - 2 * t) }

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath(); ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r); ctx.closePath()
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

function resolveAdapter(config) {
  const candidates = new Set([props.objectId, props.objectClass].map(normalizeKey).filter(Boolean))
  return Object.entries(config?.objects || {}).reduce((match, [key, value]) => {
    if (match) return match
    const aliases = [key, ...(value.aliases || [])].map(normalizeKey)
    return aliases.some(alias => candidates.has(alias)) ? { key, ...value } : null
  }, null)
}

function targetSlot() {
  if (adapter?.targetSlot) return SLOTS.find(slot => slot.key === adapter.targetSlot) || SLOTS[3]
  const target = normalizeKey(props.targetBinId)
  return SLOTS.find(slot => target.includes(slot.key)) || SLOTS[3]
}

async function loadObject() {
  const revision = ++loadRevision
  ready = false
  try {
    const response = await fetch(props.wasteConfigSrc)
    if (!response.ok) throw new Error(`Waste adapter HTTP ${response.status}`)
    const config = await response.json()
    const nextAdapter = resolveAdapter(config)
    const visualSources = {
      ...SMART_BIN_WORKFLOW_CONFIG.visuals,
      structure: props.structureVisualSrc || SMART_BIN_WORKFLOW_CONFIG.visuals.structure
    }
    const visualEntries = Object.entries(visualSources)
    const [nextObject, ...visualResults] = await Promise.all([
      nextAdapter?.sprite ? loadImage(nextAdapter.sprite) : Promise.resolve(null),
      ...visualEntries.map(([, src]) => loadImage(src).catch(error => ({ loadError: error })))
    ])
    if (revision !== loadRevision) return
    adapter = nextAdapter
    objectImage = nextObject
    componentImages = visualEntries.reduce((images, [key], index) => {
      const result = visualResults[index]
      if (result && !result.loadError) images[key] = result
      return images
    }, {})
    const failed = visualResults.filter(result => result?.loadError)
    if (failed.length) emit('error', { message: '桶内活动部件素材部分加载失败，已使用绘制回退', errors: failed.map(item => item.loadError) })
    emit('visualchange', { key: adapter?.key || '', label: adapter?.label || '', placeholder: !adapter || !nextObject })
  } catch (error) {
    if (revision !== loadRevision) return
    adapter = null
    objectImage = null
    componentImages = {}
    emit('visualchange', { key: '', label: '', placeholder: true })
    emit('error', { message: '桶内动画素材加载失败', error })
  }
  ready = true
  draw()
  if (props.active && props.running) play()
}

function phaseAt(valueMs) {
  let cursor = 0
  for (let index = 0; index < PHASES.length; index += 1) {
    const phase = PHASES[index]
    const end = cursor + phase.durationMs
    if (valueMs <= end) return { ...phase, index, localProgress: clamp((valueMs - cursor) / phase.durationMs) }
    cursor = end
  }
  return { ...PHASES[PHASES.length - 1], index: PHASES.length - 1, localProgress: 1 }
}

function cubicPoint(points, amount) {
  const [start, controlA, controlB, end] = points
  const t = clamp(amount); const inverse = 1 - t
  return {
    x: inverse ** 3 * start.x + 3 * inverse ** 2 * t * controlA.x + 3 * inverse * t ** 2 * controlB.x + t ** 3 * end.x,
    y: inverse ** 3 * start.y + 3 * inverse ** 2 * t * controlA.y + 3 * inverse * t ** 2 * controlB.y + t ** 3 * end.y
  }
}

function intakePoint(amount) {
  const [start, through, end] = SMART_BIN_WORKFLOW_CONFIG.paths.intake
  const t = ease(amount)
  const inverse = 1 - t
  return {
    x: inverse * inverse * start.x + 2 * inverse * t * through.x + t * t * end.x,
    y: inverse * inverse * start.y + 2 * inverse * t * through.y + t * t * end.y
  }
}

function motionState(phase) {
  const slot = targetSlot()
  const gantry = SMART_BIN_WORKFLOW_CONFIG.mechanisms.gantry
  const receivePoint = SMART_BIN_WORKFLOW_CONFIG.mechanisms.receive.point
  const targetAngle = SMART_BIN_WORKFLOW_CONFIG.mechanisms.hopper.slotAngles[slot.key] || 0
  const state = {
    carriage: { ...gantry.home },
    jawClosed: 0,
    hopperAngle: 0,
    object: { ...receivePoint, alpha: 0, rotationProgress: 0 },
    detectPulse: 0,
    localFillPct: 0,
    slotPulse: 0,
    dropProgress: 0
  }

  if (phase.key === 'intake') {
    state.object = { ...intakePoint(phase.localProgress), alpha: 1, rotationProgress: phase.localProgress * .28 }
  } else if (phase.key === 'detect') {
    state.object = { ...receivePoint, alpha: 1, rotationProgress: .28 }
    state.detectPulse = Math.sin(phase.localProgress * Math.PI * 4) * .5 + .5
  } else if (phase.key === 'receive') {
    const descend = ease(clamp(phase.localProgress / .42))
    const close = ease(clamp((phase.localProgress - .32) / .34))
    const lift = ease(clamp((phase.localProgress - .7) / .3))
    state.carriage.y = lerp(gantry.home.y, gantry.receive.y, descend * (1 - lift))
    state.jawClosed = close
    const held = phase.localProgress >= .58
    state.object = held
      ? { x: state.carriage.x, y: state.carriage.y + 90, alpha: 1, rotationProgress: .3 }
      : { ...receivePoint, alpha: 1, rotationProgress: .28 }
  } else if (phase.key === 'transfer') {
    const move = ease(phase.localProgress)
    state.carriage = { x: lerp(gantry.home.x, slot.transferX, move), y: gantry.liftY }
    state.jawClosed = 1
    state.object = { x: state.carriage.x, y: state.carriage.y + 90, alpha: 1, rotationProgress: .3 + move * .14 }
  } else if (phase.key === 'align') {
    state.carriage = { x: slot.transferX, y: gantry.liftY }
    state.jawClosed = 1
    state.hopperAngle = lerp(0, targetAngle, ease(phase.localProgress))
    state.object = { x: slot.transferX, y: gantry.liftY + 90, alpha: 1, rotationProgress: .44 }
  } else if (phase.key === 'drop') {
    const drop = ease(phase.localProgress)
    const point = cubicPoint(SMART_BIN_WORKFLOW_CONFIG.paths.drop[slot.key], drop)
    state.carriage = { x: slot.transferX, y: gantry.liftY }
    state.jawClosed = 1 - ease(clamp(phase.localProgress / .2))
    state.hopperAngle = targetAngle
    state.dropProgress = drop
    state.object = { ...point, alpha: 1 - ease(clamp((drop - .82) / .18)), rotationProgress: .44 + drop * .8 }
    state.slotPulse = clamp((drop - .55) / .45)
  } else if (phase.key === 'fill_update') {
    state.carriage = { x: slot.transferX, y: gantry.liftY }
    state.hopperAngle = targetAngle
    state.localFillPct = targetFill.value * ease(phase.localProgress)
    state.slotPulse = 1
  } else if (phase.key === 'reset') {
    const reset = ease(phase.localProgress)
    state.carriage = { x: lerp(slot.transferX, gantry.home.x, reset), y: gantry.liftY }
    state.hopperAngle = lerp(targetAngle, 0, reset)
    state.localFillPct = targetFill.value
    state.slotPulse = 1 - reset
  }
  return state
}

function drawImageCentered(ctx, image, x, y, width, height, rotationDeg = 0, alpha = 1) {
  if (!image) return false
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.rotate(rotationDeg * Math.PI / 180)
  ctx.drawImage(image, -width / 2, -height / 2, width, height); ctx.restore()
  return true
}

function drawStructure(ctx) {
  const image = componentImages.structure
  if (!image) return
  ctx.save(); ctx.globalAlpha = .23; ctx.globalCompositeOperation = 'multiply'
  ctx.drawImage(image, 240, 74, 420, 414); ctx.restore()
}

function drawGantryRail(ctx) {
  const gradient = ctx.createLinearGradient(250, 0, 650, 0)
  gradient.addColorStop(0, '#789096'); gradient.addColorStop(.45, '#eef4f4'); gradient.addColorStop(1, '#526b72')
  ctx.strokeStyle = gradient; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(250, 114); ctx.lineTo(650, 114); ctx.stroke()
  ctx.strokeStyle = '#314b53'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(255, 123); ctx.lineTo(645, 123); ctx.stroke()
}

function drawGantry(ctx, state) {
  const gantry = SMART_BIN_WORKFLOW_CONFIG.mechanisms.gantry
  if (!drawImageCentered(ctx, componentImages.carriage, state.carriage.x, state.carriage.y, gantry.carriageSize.width, gantry.carriageSize.height)) {
    ctx.fillStyle = '#873d91'; roundedRect(ctx, state.carriage.x - 34, state.carriage.y - 20, 68, 42, 7); ctx.fill()
  }
  const jawAngle = lerp(gantry.jawOpenDeg, gantry.jawClosedDeg, state.jawClosed)
  const jawTop = state.carriage.y + 23
  const drawJaw = (image, side) => {
    if (!image) return
    ctx.save(); ctx.translate(state.carriage.x + side * 5, jawTop); ctx.rotate(side * jawAngle * Math.PI / 180)
    if (side < 0) ctx.drawImage(image, -image.width + 8, 0)
    else ctx.drawImage(image, -8, 0)
    ctx.restore()
  }
  drawJaw(componentImages.leftJaw, -1)
  drawJaw(componentImages.rightJaw, 1)
}

function drawHopper(ctx, state) {
  const hopper = SMART_BIN_WORKFLOW_CONFIG.mechanisms.hopper
  if (!drawImageCentered(ctx, componentImages.hopper, hopper.center.x, hopper.center.y, hopper.size.width, hopper.size.height, state.hopperAngle)) {
    ctx.save(); ctx.translate(hopper.center.x, hopper.center.y); ctx.rotate(state.hopperAngle * Math.PI / 180)
    ctx.fillStyle = '#c7d3d5'; ctx.strokeStyle = '#4f6870'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(-130, -62); ctx.lineTo(130, -62); ctx.lineTo(72, 62); ctx.lineTo(-72, 62); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore()
  }
}

function drawDetect(ctx, state, slot) {
  if (!state.detectPulse) return
  const point = SMART_BIN_WORKFLOW_CONFIG.mechanisms.receive.point
  const radius = SMART_BIN_WORKFLOW_CONFIG.mechanisms.receive.detectRadius + state.detectPulse * 9
  ctx.save(); ctx.strokeStyle = slot.color; ctx.globalAlpha = .35 + state.detectPulse * .45; ctx.lineWidth = 3
  ctx.beginPath(); ctx.arc(point.x, point.y, radius, 0, Math.PI * 2); ctx.stroke()
  ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.arc(point.x, point.y, radius + 10, 0, Math.PI * 2); ctx.stroke(); ctx.restore()
}

function drawSlotsBack(ctx, activeSlot, state) {
  SLOTS.forEach(slot => {
    const selected = slot.key === activeSlot.key
    const left = slot.centerX - 72
    ctx.fillStyle = selected ? `${slot.color}1f` : 'rgba(241,247,247,.76)'
    ctx.strokeStyle = selected ? `${slot.color}99` : '#a9bdc1'; ctx.lineWidth = selected ? 3 : 2
    roundedRect(ctx, left, 334, 144, 138, 12); ctx.fill(); ctx.stroke()
    if (selected && state.localFillPct > 0) {
      const fillHeight = 103 * state.localFillPct / 100
      const fillGradient = ctx.createLinearGradient(0, 452 - fillHeight, 0, 452)
      fillGradient.addColorStop(0, `${slot.color}4d`); fillGradient.addColorStop(1, `${slot.color}a8`)
      ctx.fillStyle = fillGradient; ctx.fillRect(left + 8, 452 - fillHeight, 128, fillHeight)
    }
    if (selected && state.slotPulse > 0) {
      ctx.save(); ctx.globalAlpha = .16 + state.slotPulse * .24; ctx.shadowColor = slot.color; ctx.shadowBlur = 24
      ctx.strokeStyle = slot.color; ctx.lineWidth = 5; roundedRect(ctx, left - 3, 331, 150, 144, 14); ctx.stroke(); ctx.restore()
    }
  })
}

function drawSlotFronts(ctx, activeSlot, state) {
  SLOTS.forEach(slot => {
    const selected = slot.key === activeSlot.key
    const left = slot.centerX - 72
    ctx.fillStyle = selected ? `${slot.color}e8` : 'rgba(50,68,75,.92)'
    roundedRect(ctx, left + 7, 340, 130, 16, 6); ctx.fill()
    const frontGradient = ctx.createLinearGradient(0, 385, 0, 467)
    frontGradient.addColorStop(0, 'rgba(50,67,73,.62)'); frontGradient.addColorStop(1, 'rgba(23,39,45,.96)')
    ctx.fillStyle = frontGradient; roundedRect(ctx, left + 8, 389, 128, 76, 8); ctx.fill()
    ctx.fillStyle = '#edf6f6'; ctx.font = '800 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText(slot.label, slot.centerX, 425)
    ctx.fillStyle = selected ? '#ffffff' : '#9ab0b5'; ctx.font = '800 12px ui-monospace,Consolas,monospace'
    ctx.fillText(selected ? `${Math.round(state.localFillPct)}%` : '—', slot.centerX, 448)
  })
}

function drawHopperOcclusion(ctx, state) {
  if (!(state.dropProgress > .18 && state.dropProgress < .58)) return
  const hopper = SMART_BIN_WORKFLOW_CONFIG.mechanisms.hopper
  ctx.save(); ctx.translate(hopper.center.x, hopper.center.y); ctx.rotate(state.hopperAngle * Math.PI / 180)
  const gradient = ctx.createLinearGradient(0, 0, 0, 56)
  gradient.addColorStop(0, 'rgba(174,189,193,.08)'); gradient.addColorStop(.35, 'rgba(117,139,145,.9)'); gradient.addColorStop(1, 'rgba(66,88,95,.98)')
  ctx.fillStyle = gradient; ctx.beginPath(); ctx.moveTo(-106, 5); ctx.lineTo(106, 5); ctx.lineTo(66, 59); ctx.lineTo(-66, 59); ctx.closePath(); ctx.fill(); ctx.restore()
}

function drawObject(ctx, state) {
  const position = state.object
  if (!position || position.alpha <= 0) return
  const wasteVisual = SMART_BIN_WORKFLOW_CONFIG.wasteVisuals[adapter?.key] || {}
  const scale = (Number(adapter?.scale) || .26) * .52 * (Number(wasteVisual.scaleMultiplier) || 1)
  const rotation = ((Number(adapter?.rotation) || 0) + (Number(wasteVisual.rotationOffset) || 0) + position.rotationProgress * 58) * Math.PI / 180
  ctx.save(); ctx.globalAlpha = position.alpha; ctx.translate(position.x, position.y); ctx.rotate(rotation)
  if (objectImage) {
    ctx.scale(scale, scale); ctx.drawImage(objectImage, -objectImage.width / 2, -objectImage.height / 2)
  } else {
    ctx.setLineDash([6, 5]); ctx.strokeStyle = '#f5a623'; ctx.fillStyle = 'rgba(255,247,224,.95)'; ctx.lineWidth = 2
    roundedRect(ctx, -34, -25, 68, 50, 10); ctx.fill(); ctx.stroke(); ctx.setLineDash([])
    ctx.fillStyle = '#a65b00'; ctx.font = '800 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('视觉占位', 0, 0)
  }
  ctx.restore()
}

function draw() {
  if (!canvas || !context || !ready) return
  const ctx = context
  ctx.setTransform(canvas.width / LOGICAL_WIDTH, 0, 0, canvas.height / LOGICAL_HEIGHT, 0, 0)
  ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT)
  const background = ctx.createLinearGradient(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT)
  background.addColorStop(0, '#effaf7'); background.addColorStop(1, '#dceceb')
  ctx.fillStyle = background; ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT)

  const phase = phaseAt(elapsedMs)
  const state = motionState(phase)
  const slot = targetSlot()
  phaseKey.value = phase.key; phaseLabel.value = phase.label

  ctx.fillStyle = '#123d49'; ctx.font = '800 23px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  ctx.fillText('智能垃圾桶内部连续处理', 28, 36)
  ctx.fillStyle = '#5b7880'; ctx.font = '600 13px system-ui'; ctx.fillText(`当前阶段：${phase.label} / ${phase.key.toUpperCase()}`, 30, 59)
  ctx.textAlign = 'right'; ctx.fillStyle = slot.color; ctx.font = '800 14px system-ui'; ctx.fillText(`目标仓：${slot.label}`, 872, 37)
  ctx.fillStyle = '#617b83'; ctx.font = '600 12px system-ui'
  ctx.fillText(`局部仓位 ${Math.round(state.localFillPct)}% · 事件 #${props.fillEventSequence || '—'} 到达后同步全局容量`, 872, 59)

  ctx.fillStyle = 'rgba(255,255,255,.34)'; ctx.strokeStyle = '#6f939a'; ctx.lineWidth = 3
  roundedRect(ctx, 70, 72, 760, 418, 18); ctx.fill(); ctx.stroke()

  drawStructure(ctx)
  drawGantryRail(ctx)
  drawSlotsBack(ctx, slot, state)
  drawHopper(ctx, state)
  drawDetect(ctx, state, slot)
  drawObject(ctx, state)
  drawHopperOcclusion(ctx, state)
  drawGantry(ctx, state)
  drawSlotFronts(ctx, slot, state)
  if (componentImages.foreground) ctx.drawImage(componentImages.foreground, 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT)

  const completedPhases = phase.index + phase.localProgress
  const phaseTrackWidth = 760 / PHASES.length
  PHASES.forEach((item, index) => {
    const left = 70 + index * phaseTrackWidth
    ctx.fillStyle = index < completedPhases ? slot.color : 'rgba(78,111,120,.18)'
    roundedRect(ctx, left + 3, 480, phaseTrackWidth - 6, 5, 3); ctx.fill()
  })

  progress.value = clamp(elapsedMs / TOTAL_DURATION)
  emit('progress', {
    phase: phase.key,
    phaseLabel: phase.label,
    progress: progress.value,
    previewFillPct: Math.round(state.localFillPct),
    mechanismState: {
      carriageX: Math.round(state.carriage.x),
      jawClosed: Number(state.jawClosed.toFixed(2)),
      hopperAngle: Number(state.hopperAngle.toFixed(1))
    }
  })
}

function tick(timestamp) {
  if (!playing) return
  if (!lastTimestamp) lastTimestamp = timestamp
  const delta = Math.min(100, timestamp - lastTimestamp)
  lastTimestamp = timestamp
  elapsedMs = Math.min(TOTAL_DURATION, elapsedMs + delta * Math.max(.1, Number(props.playbackRate) || 1))
  draw()
  if (elapsedMs >= TOTAL_DURATION) {
    playing = false; completed = true; rafId = 0
    emit('complete', { source: 'VISUAL_AID', workflow: 'SIMULATED_BIN_WORKFLOW', targetSlot: targetSlot().key })
    return
  }
  rafId = requestAnimationFrame(tick)
}

function play() {
  if (!ready || !props.active || playing || completed || typeof requestAnimationFrame !== 'function') return
  playing = true; lastTimestamp = 0; rafId = requestAnimationFrame(tick)
}
function pause() { playing = false; if (rafId) cancelAnimationFrame(rafId); rafId = 0; lastTimestamp = 0 }
function reset() {
  pause(); elapsedMs = 0; completed = false; progress.value = 0
  phaseKey.value = PHASES[0].key; phaseLabel.value = PHASES[0].label; draw()
  if (props.active && props.running) play()
}

function resizeCanvas() {
  if (!canvas || !context) return
  const viewport = viewportRef.value?.$el || viewportRef.value
  const rect = viewport?.getBoundingClientRect?.() || canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  if (canvas.style) { canvas.style.width = `${Math.round(rect.width)}px`; canvas.style.height = `${Math.round(rect.height)}px` }
  const ratio = Math.max(1, Math.min(2, Number(window.devicePixelRatio) || 1))
  canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio); draw()
}

watch(() => props.running, value => value ? play() : pause(), { flush: 'sync' })
watch(() => props.active, value => value ? reset() : pause(), { flush: 'post' })
watch(() => props.resetKey, reset, { flush: 'post' })
watch(() => [props.objectId, props.objectClass, props.targetBinId, props.wasteConfigSrc, props.structureVisualSrc], loadObject)

onMounted(async () => {
  await nextTick()
  canvas = canvasRef.value?.$el?.querySelector?.('canvas') || canvasRef.value?.$el || canvasRef.value
  if (canvas?.style) { canvas.style.display = 'block'; canvas.style.width = '100%'; canvas.style.height = '100%' }
  if (canvas?.getContext) context = canvas.getContext('2d', { alpha: true })
  if (context && typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(resizeCanvas); resizeObserver.observe(viewportRef.value?.$el || viewportRef.value)
  }
  await loadObject(); resizeCanvas()
})
onBeforeUnmount(() => {
  pause(); resizeObserver?.disconnect(); resizeObserver = null; objectImage = null; componentImages = {}; adapter = null
  ready = false; canvas = null; context = null
})

defineExpose({ play, pause, reset })
</script>

<style scoped>
.smart-bin-workflow,.bin-workflow-viewport,.bin-workflow-canvas { display: block; width: 100%; height: 100%; }
.bin-workflow-viewport { position: relative; min-height: 210px; overflow: hidden; border-radius: 10px; background: #eaf6f4; }
.workflow-note { position: absolute; right: 12px; bottom: 9px; padding: 4px 8px; border: 1px solid rgba(25,149,112,.35); border-radius: 999px; color: #176c58; background: rgba(235,251,246,.9); font-size: 8px; font-weight: 700; pointer-events: none; }
</style>
