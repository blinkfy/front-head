<template>
  <view class="smart-bin-workflow" :data-phase="phaseKey" :data-running="playingState ? 'true' : 'false'" :data-visual-version="activeVisualVersion">
    <view ref="viewportRef" class="bin-workflow-viewport">
      <canvas
        ref="canvasRef"
        class="bin-workflow-canvas"
        canvas-id="smartBinWorkflowCanvas"
        id="smartBinWorkflowCanvas"
        type="2d"
        aria-label="智能垃圾桶内部连续处理动画"
      ></canvas>
    </view>
  </view>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { SMART_BIN_PHASES, SMART_BIN_TOTAL_DURATION } from '@/config/smart-bin-workflow.js'
import {
  SMART_BIN_INTERNAL_GEOMETRY,
  SMART_BIN_CUTAWAY_RASTER_V3,
  SMART_BIN_INTERNAL_DEVICE,
  SMART_BIN_INTERNAL_LEGACY_VISUALS,
  SMART_BIN_INTERNAL_LAYER_REGISTRY,
  SMART_BIN_INTERNAL_SCENE,
  smartBinCutawayRasterV3Sources,
  smartBinInternalAssetSources
} from '@/config/smart-bin-internal-layer-registry.js'
import { resolveSmartBinInternalShot } from '@/config/smart-bin-internal-shot-config.js'

const PHASES = SMART_BIN_PHASES
const TOTAL_DURATION = SMART_BIN_TOTAL_DURATION
const SCENE = SMART_BIN_INTERNAL_SCENE
const GEOMETRY = SMART_BIN_INTERNAL_GEOMETRY

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
  structureVisualSrc: { type: String, default: '' },
  visualVersion: { type: String, default: 'cutaway-raster-v8' },
  debugCalibration: { type: Boolean, default: false }
})

const emit = defineEmits(['complete', 'progress', 'visualchange', 'error'])
const viewportRef = ref(null)
const canvasRef = ref(null)
const phaseKey = ref(PHASES[0].key)
const playingState = ref(false)
const activeVisualVersion = ref('cutaway-raster-v8')

let canvas = null
let context = null
let objectImage = null
let adapter = null
let layerImages = {}
let legacyImages = {}
let rasterImages = {}
let ready = false
let playing = false
let completed = false
let disposed = false
let elapsedMs = 0
let lastTimestamp = 0
let rafId = 0
let resizeObserver = null
let densityMediaQuery = null
let loadRevision = 0
let cssWidth = 0
let cssHeight = 0

const SLOT_META = Object.freeze({
  recyclable: Object.freeze({ label: '可回收物', color: '#4f8fca' }),
  kitchen: Object.freeze({ label: '厨余垃圾', color: '#5c9c7d' }),
  hazardous: Object.freeze({ label: '有害垃圾', color: '#bd6870' }),
  other: Object.freeze({ label: '其他垃圾', color: '#7d8b95' })
})

const normalizeKey = value => String(value || '').trim().toLowerCase().replace(/\s+/g, '_')
const targetFill = computed(() => clamp(Number(props.fillTargetPct) || 0, 0, 100))

function clamp(value, min = 0, max = 1) { return Math.max(min, Math.min(max, Number(value) || 0)) }
function lerp(start, end, amount) { return start + (end - start) * clamp(amount) }
function smoothstep(amount) { const t = clamp(amount); return t * t * (3 - 2 * t) }

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

function targetSlotKey() {
  if (adapter?.targetSlot && SLOT_META[adapter.targetSlot]) return adapter.targetSlot
  const target = normalizeKey(props.targetBinId)
  return Object.keys(SLOT_META).find(key => target.includes(key)) || 'other'
}

async function loadAssets() {
  const revision = ++loadRevision
  ready = false
  try {
    const response = await fetch(props.wasteConfigSrc)
    if (!response.ok) throw new Error(`Waste adapter HTTP ${response.status}`)
    const config = await response.json()
    const nextAdapter = resolveAdapter(config)
    const sources = smartBinInternalAssetSources(props.structureVisualSrc)
    const entries = Object.entries(sources)
    const legacyEntries = Object.entries(SMART_BIN_INTERNAL_LEGACY_VISUALS)
    const rasterEntries = Object.entries(smartBinCutawayRasterV3Sources())
    const results = await Promise.all([
      nextAdapter?.sprite ? loadImage(nextAdapter.sprite).catch(error => ({ loadError: error })) : Promise.resolve(null),
      ...entries.map(([, src]) => loadImage(src).catch(error => ({ loadError: error }))),
      ...legacyEntries.map(([, src]) => loadImage(src).catch(error => ({ loadError: error }))),
      ...rasterEntries.map(([, src]) => loadImage(src).catch(error => ({ loadError: error })))
    ])
    if (disposed || revision !== loadRevision) return
    const nextObject = results[0]
    const layerResults = results.slice(1, 1 + entries.length)
    const legacyStart = 1 + entries.length
    const rasterStart = legacyStart + legacyEntries.length
    const legacyResults = results.slice(legacyStart, rasterStart)
    const rasterResults = results.slice(rasterStart)
    adapter = nextAdapter
    objectImage = nextObject && !nextObject.loadError ? nextObject : null
    layerImages = entries.reduce((result, [key], index) => {
      const image = layerResults[index]
      if (image && !image.loadError) result[key] = image
      return result
    }, {})
    legacyImages = legacyEntries.reduce((result, [key], index) => {
      const image = legacyResults[index]
      if (image && !image.loadError) result[key] = image
      return result
    }, {})
    rasterImages = rasterEntries.reduce((result, [key], index) => {
      const image = rasterResults[index]
      if (image && !image.loadError) result[key] = image
      return result
    }, {})
    const requiredV4 = ['fixedCadStructure', 'xyRails', 'movingCarriage', 'liftColumn', 'leftJaw', 'rightJaw', 'guideHopperRear', 'targetBins', 'guideHopperFrontLip', 'binFrontPanels', 'frontFrameOcclusion']
    const v4Ready = requiredV4.every(key => layerImages[key])
    const rasterReady = [
      ...SMART_BIN_CUTAWAY_RASTER_V3.panelAnimation.frameKeys,
      'carriageLift',
      'leftJaw',
      'rightJaw'
    ].every(key => rasterImages[key])
    const posterReady = !!rasterImages.assembledPoster
    const requested = normalizeKey(props.visualVersion)
    if (props.debugCalibration && requested === 'v4' && v4Ready) activeVisualVersion.value = 'v4'
    else if (props.debugCalibration && requested === 'legacy-v1' && Object.keys(legacyImages).length === legacyEntries.length) activeVisualVersion.value = 'legacy-v1'
    else if (rasterReady) activeVisualVersion.value = 'cutaway-raster-v8'
    else if (posterReady) activeVisualVersion.value = 'cutaway-raster-v8-static'
    else activeVisualVersion.value = 'unavailable'
    const errors = results.filter(result => result?.loadError).map(result => result.loadError)
    if (errors.length) emit('error', { message: '桶内剖视素材部分加载失败', errors })
    if (!rasterReady && posterReady) emit('error', { message: '桶内实体活动图层不完整，已切换完整静态实体画面' })
    emit('visualchange', { key: adapter?.key || '', label: adapter?.label || '', placeholder: !adapter || !objectImage, visualVersion: activeVisualVersion.value })
  } catch (error) {
    if (disposed || revision !== loadRevision) return
    adapter = null
    objectImage = null
    layerImages = {}
    legacyImages = {}
    rasterImages = {}
    emit('visualchange', { key: '', label: '', placeholder: true })
    emit('error', { message: '桶内剖视素材加载失败', error })
  }
  if (disposed || revision !== loadRevision) return
  ready = true
  if (props.active) draw(true)
  if (props.active && props.running) play()
}

function phaseStart(index) {
  return PHASES.slice(0, Math.max(0, index)).reduce((sum, phase) => sum + phase.durationMs, 0)
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

function polygonPoint(ctx, points) {
  if (!points?.length) return
  ctx.beginPath()
  points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y))
  ctx.closePath()
}

function cubicPoint(points, amount) {
  const [start, controlA, controlB, end] = points
  const t = clamp(amount); const inverse = 1 - t
  return {
    x: inverse ** 3 * start.x + 3 * inverse ** 2 * t * controlA.x + 3 * inverse * t ** 2 * controlB.x + t ** 3 * end.x,
    y: inverse ** 3 * start.y + 3 * inverse ** 2 * t * controlA.y + 3 * inverse * t ** 2 * controlB.y + t ** 3 * end.y
  }
}

function gripperPoint(state) {
  return { x: state.carriage.x, y: state.carriage.y + 58 + state.liftExtension }
}

function dropPath(slotKey, start) {
  const entry = GEOMETRY.bins.slots[slotKey].entry
  const angle = GEOMETRY.hopper.slotAngles[slotKey] * Math.PI / 180
  const hopperExit = {
    x: GEOMETRY.hopper.center.x + Math.sin(angle) * 82,
    y: GEOMETRY.hopper.center.y + 74
  }
  return [
    start,
    { x: start.x, y: 286 },
    hopperExit,
    { x: entry.x, y: 572 }
  ]
}

function motionState(phase) {
  const slotKey = targetSlotKey()
  const targetX = GEOMETRY.gantry.transferX[slotKey]
  const targetAngle = GEOMETRY.hopper.slotAngles[slotKey]
  const home = GEOMETRY.gantry.home
  const state = {
    carriage: { ...home },
    liftExtension: 0,
    jawClosed: 0,
    hopperAngle: 0,
    object: { ...GEOMETRY.receive.point, visible: false, rotation: Number(adapter?.receiveRotation) || 0 },
    detectProgress: 0,
    localFillPct: 0,
    slotEmphasis: 0,
    panelOpen: 0,
    dropProgress: 0,
    routeOpacity: 0,
    objectHeight: 0
  }

  if (phase.key === 'intake') {
    const t = phase.localProgress
    const fall = t < .84 ? (t / .84) ** 2 * .94 : .94 + smoothstep((t - .84) / .16) * .06
    state.object = {
      x: lerp(GEOMETRY.inlet.center.x, GEOMETRY.receive.point.x, fall),
      y: lerp(GEOMETRY.inlet.center.y - 34, GEOMETRY.receive.point.y, fall),
      visible: true,
      rotation: lerp(Number(adapter?.rotation) || 0, Number(adapter?.receiveRotation) || 0, fall)
    }
    state.routeOpacity = clamp(1 - t / .28) * .18
  } else if (phase.key === 'detect') {
    state.object = { ...GEOMETRY.receive.point, visible: true, rotation: Number(adapter?.receiveRotation) || 0 }
    state.detectProgress = phase.localProgress
  } else if (phase.key === 'receive') {
    const t = phase.localProgress
    const align = smoothstep(t / .22)
    const descend = smoothstep((t - .18) / .34)
    const close = smoothstep((t - .38) / .28)
    const lift = smoothstep((t - .82) / .18)
    state.carriage.x = lerp(home.x, GEOMETRY.receive.point.x, align)
    state.liftExtension = lerp(0, 26, descend * (1 - lift))
    state.jawClosed = close
    const anchor = gripperPoint(state)
    const attach = smoothstep((t - .46) / .2)
    state.object = {
      x: lerp(GEOMETRY.receive.point.x, anchor.x, attach),
      y: lerp(GEOMETRY.receive.point.y, anchor.y, attach),
      visible: true,
      rotation: lerp(Number(adapter?.receiveRotation) || 0, 0, attach)
    }
    state.objectHeight = lift
  } else if (phase.key === 'transfer') {
    const t = phase.localProgress
    const move = smoothstep((t - .08) / .84)
    state.carriage.x = lerp(home.x, targetX, move)
    state.liftExtension = 0
    state.jawClosed = 1
    const anchor = gripperPoint(state)
    const sway = Math.sin(move * Math.PI) * (Number(adapter?.transferSway) || 0)
    state.object = { x: anchor.x, y: anchor.y + sway * .18, visible: true, rotation: sway }
    state.objectHeight = 1
    state.panelOpen = smoothstep((t - .25) / .57)
    state.routeOpacity = clamp(1 - t / .25) * .14
  } else if (phase.key === 'align') {
    const turn = smoothstep(phase.localProgress / .78)
    state.carriage.x = targetX
    state.jawClosed = 1
    state.hopperAngle = lerp(0, targetAngle, turn)
    const anchor = gripperPoint(state)
    state.object = { ...anchor, visible: true, rotation: 0 }
    state.slotEmphasis = smoothstep(phase.localProgress / .6)
    state.objectHeight = 1
    state.panelOpen = 1
  } else if (phase.key === 'drop') {
    const release = smoothstep(phase.localProgress / .16)
    const fall = phase.localProgress <= .16 ? 0 : ((phase.localProgress - .16) / .84) ** 2
    state.carriage.x = targetX
    state.jawClosed = 1 - release
    state.hopperAngle = targetAngle
    const start = gripperPoint(state)
    const point = cubicPoint(dropPath(slotKey, start), fall)
    state.object = {
      ...point,
      visible: true,
      rotation: lerp(0, Number(adapter?.dropRotation) || 0, fall)
    }
    state.dropProgress = fall
    state.slotEmphasis = 1
    state.objectHeight = 1 - fall
    state.panelOpen = 1
  } else if (phase.key === 'fill_update') {
    state.carriage.x = targetX
    state.hopperAngle = targetAngle
    state.localFillPct = targetFill.value * smoothstep(phase.localProgress)
    state.slotEmphasis = 1
    state.panelOpen = 1
  } else if (phase.key === 'reset') {
    const t = phase.localProgress
    const hopperReset = smoothstep(t / .58)
    const carriageReset = smoothstep((t - .18) / .74)
    state.carriage.x = lerp(targetX, home.x, carriageReset)
    state.hopperAngle = lerp(targetAngle, 0, hopperReset)
    state.localFillPct = targetFill.value
    state.slotEmphasis = 1 - smoothstep(t)
    state.liftExtension = 0
    state.panelOpen = 1 - smoothstep(t / .6)
  }
  return state
}

function drawRegisteredLayer(ctx, key, options = {}) {
  const image = layerImages[key]
  const layer = SMART_BIN_INTERNAL_LAYER_REGISTRY[key]
  if (!image || !layer) return
  ctx.save()
  ctx.globalAlpha = options.opacity ?? layer.opacity ?? 1
  if (options.filter) ctx.filter = options.filter
  if (options.shadow) {
    const shadow = layer.shadow || {}
    ctx.shadowColor = `rgba(0, 10, 16, ${shadow.opacity || .2})`
    ctx.shadowBlur = shadow.blur || 4
    ctx.shadowOffsetX = shadow.offsetX || 0
    ctx.shadowOffsetY = shadow.offsetY || 0
  }
  if (layer.drawBox) {
    const box = layer.drawBox
    ctx.drawImage(image, box.x, box.y, box.width, box.height)
  } else {
    const anchor = layer.anchor || { x: image.width / 2, y: image.height / 2 }
    ctx.translate(options.x || 0, options.y || 0)
    ctx.rotate((options.rotation || 0) * Math.PI / 180)
    const scaleX = options.scaleX ?? 1
    const scaleY = options.scaleY ?? 1
    ctx.scale(scaleX, scaleY)
    ctx.drawImage(image, -anchor.x, -anchor.y, layer.nativeSize.width, layer.nativeSize.height)
  }
  ctx.restore()
}

function drawSceneBackground(ctx) {
  const gradient = ctx.createRadialGradient(SCENE.width * .5, SCENE.height * .42, 50, SCENE.width * .5, SCENE.height * .5, SCENE.width * .62)
  gradient.addColorStop(0, '#17303b')
  gradient.addColorStop(.55, '#0b202c')
  gradient.addColorStop(1, '#061722')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, SCENE.width, SCENE.height)
  ctx.strokeStyle = 'rgba(118, 160, 176, .055)'
  ctx.lineWidth = 1
  for (let x = 0; x < SCENE.width; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, SCENE.height); ctx.stroke() }
  for (let y = 0; y < SCENE.height; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SCENE.width, y); ctx.stroke() }
}

function drawRouteAid(ctx, state, slotKey) {
  if (state.routeOpacity <= 0) return
  const from = state.object.visible ? state.object : GEOMETRY.receive.point
  const toX = GEOMETRY.gantry.transferX[slotKey]
  ctx.save()
  ctx.globalAlpha = state.routeOpacity
  ctx.strokeStyle = SLOT_META[slotKey].color
  ctx.lineWidth = 1.4
  ctx.setLineDash([3, 9])
  ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.quadraticCurveTo(294, 190, toX, 210); ctx.stroke()
  ctx.restore()
}

function drawCarriageAndGripper(ctx, state) {
  const grip = gripperPoint(state)
  drawRegisteredLayer(ctx, 'movingCarriage', { x: state.carriage.x, y: state.carriage.y })

  const columnTop = state.carriage.y + 24
  const columnHeight = Math.max(48, grip.y - columnTop + 12)
  drawRegisteredLayer(ctx, 'liftColumn', {
    x: state.carriage.x,
    y: columnTop,
    scaleY: columnHeight / SMART_BIN_INTERNAL_LAYER_REGISTRY.liftColumn.nativeSize.height
  })

  const jawAngle = lerp(GEOMETRY.gantry.jawOpenDeg, GEOMETRY.gantry.jawClosedDeg, state.jawClosed)
  drawRegisteredLayer(ctx, 'leftJaw', { x: grip.x - 4, y: grip.y - 4, rotation: -jawAngle })
  drawRegisteredLayer(ctx, 'rightJaw', { x: grip.x + 4, y: grip.y - 4, rotation: jawAngle })
}

function drawCarriageShadow(ctx, state) {
  ctx.save()
  ctx.filter = 'blur(4px)'
  ctx.globalAlpha = .2
  ctx.fillStyle = '#020d12'
  ctx.beginPath()
  ctx.ellipse(state.carriage.x + 6, state.carriage.y + 39, 53, 12, .04, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawObjectShadow(ctx, state) {
  if (!state.object.visible || !objectImage) return
  const height = clamp(state.objectHeight)
  const adapterScale = Number(adapter?.internalShadowScale) || 1
  ctx.save()
  ctx.filter = `blur(${lerp(2.2, 7, height)}px)`
  ctx.globalAlpha = lerp(.28, .11, height)
  ctx.fillStyle = '#020d12'
  ctx.beginPath()
  ctx.ellipse(state.object.x + lerp(2, 7, height), Math.min(507, state.object.y + lerp(12, 34, height)), 22 * adapterScale * lerp(1, .72, height), 7 * adapterScale * lerp(1, .62, height), -.12, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawWasteObject(ctx, state) {
  if (!state.object.visible || !objectImage || !adapter) return
  const scale = Number(adapter.internalScale) || .13
  const baseWidth = objectImage.naturalWidth || objectImage.width
  const baseHeight = objectImage.naturalHeight || objectImage.height
  ctx.save()
  ctx.translate(state.object.x + (Number(adapter.dropOffset?.[0]) || 0) * state.dropProgress, state.object.y + (Number(adapter.dropOffset?.[1]) || 0) * state.dropProgress)
  ctx.rotate((Number(state.object.rotation) || 0) * Math.PI / 180)
  ctx.scale(scale, scale)
  ctx.drawImage(objectImage, -baseWidth / 2, -baseHeight / 2)
  ctx.restore()
}

function drawHopper(ctx, state, layerKey, opacity = 1) {
  drawRegisteredLayer(ctx, layerKey, {
    x: GEOMETRY.hopper.center.x,
    y: GEOMETRY.hopper.center.y,
    rotation: state.hopperAngle,
    opacity,
    shadow: layerKey === 'guideHopperRear'
  })
}

function drawBinFill(ctx, slotKey, state) {
  const slot = GEOMETRY.bins.slots[slotKey]
  const color = SLOT_META[slotKey].color
  const fillHeight = GEOMETRY.bins.fillMaxHeight * state.localFillPct / 100
  if (fillHeight <= 0) return
  ctx.save()
  polygonPoint(ctx, slot.clip)
  ctx.clip()
  const top = GEOMETRY.bins.fillBottomY - fillHeight
  const gradient = ctx.createLinearGradient(0, top, 0, GEOMETRY.bins.fillBottomY)
  gradient.addColorStop(0, `${color}4d`)
  gradient.addColorStop(1, `${color}9e`)
  ctx.fillStyle = gradient
  ctx.fillRect(slot.centerX - 85, top, 170, fillHeight)
  ctx.restore()
}

function drawTargetEmphasis(ctx, slotKey, amount) {
  if (amount <= 0) return
  const slot = GEOMETRY.bins.slots[slotKey]
  ctx.save()
  ctx.globalAlpha = .22 + amount * .36
  ctx.strokeStyle = SLOT_META[slotKey].color
  ctx.lineWidth = 3
  ctx.shadowColor = SLOT_META[slotKey].color
  ctx.shadowBlur = 10 * amount
  polygonPoint(ctx, slot.clip.slice(0, 3))
  ctx.stroke()
  ctx.restore()
}

function drawDetection(ctx, state, slotKey) {
  if (!state.detectProgress) return
  const point = GEOMETRY.receive.point
  const box = GEOMETRY.receive.detectBox
  const pulse = Math.sin(state.detectProgress * Math.PI) ** 2
  const left = point.x - box.width / 2
  const top = point.y - box.height / 2
  const color = SLOT_META[slotKey].color
  ctx.save()
  ctx.strokeStyle = color
  ctx.globalAlpha = .56
  ctx.lineWidth = 2
  const corner = 12
  ;[[left, top, 1, 1], [left + box.width, top, -1, 1], [left, top + box.height, 1, -1], [left + box.width, top + box.height, -1, -1]].forEach(([x, y, sx, sy]) => {
    ctx.beginPath(); ctx.moveTo(x + sx * corner, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * corner); ctx.stroke()
  })
  ctx.globalAlpha = .18 + pulse * .18
  ctx.fillStyle = color
  ctx.fillRect(left + 4, top + 5 + (box.height - 10) * state.detectProgress, box.width - 8, 1.5)
  ctx.restore()
}

function drawInletOcclusion(ctx) {
  ctx.save()
  polygonPoint(ctx, GEOMETRY.inlet.frontOcclusion)
  const gradient = ctx.createLinearGradient(246, 61, 342, 84)
  gradient.addColorStop(0, '#8a989c')
  gradient.addColorStop(.45, '#dce3e4')
  gradient.addColorStop(1, '#3b494e')
  ctx.fillStyle = gradient
  ctx.fill()
  ctx.strokeStyle = '#28363b'
  ctx.lineWidth = 2.4
  ctx.stroke()
  ctx.restore()
}

function drawCalibration(ctx) {
  if (!props.debugCalibration) return
  ctx.save()
  ctx.strokeStyle = 'rgba(255, 190, 78, .72)'
  ctx.fillStyle = 'rgba(255, 210, 125, .9)'
  ctx.lineWidth = 1
  ctx.strokeRect(0, 0, 591, 702)
  ;[['INLET', GEOMETRY.inlet.center], ['RECEIVE', GEOMETRY.receive.point], ['HOPPER', GEOMETRY.hopper.center]].forEach(([label, point]) => {
    ctx.beginPath(); ctx.arc(point.x, point.y, 5, 0, Math.PI * 2); ctx.stroke()
    ctx.font = '12px ui-monospace,Consolas,monospace'; ctx.fillText(label, point.x + 8, point.y - 8)
  })
  ctx.restore()
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r); ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r); ctx.closePath()
}

function drawLegacyFrame(ctx, state, slotKey) {
  const fit = Math.min(cssWidth / 900, cssHeight / 520)
  ctx.save(); ctx.translate(cssWidth / 2, cssHeight / 2); ctx.scale(fit, fit); ctx.translate(-450, -260)
  const background = ctx.createLinearGradient(0, 0, 900, 520)
  background.addColorStop(0, '#effaf7'); background.addColorStop(1, '#dceceb')
  ctx.fillStyle = background; ctx.fillRect(0, 0, 900, 520)
  ctx.fillStyle = 'rgba(255,255,255,.34)'; ctx.strokeStyle = '#6f939a'; ctx.lineWidth = 3
  roundedRect(ctx, 70, 72, 760, 418, 18); ctx.fill(); ctx.stroke()
  if (legacyImages.structure) { ctx.save(); ctx.globalAlpha = .23; ctx.drawImage(legacyImages.structure, 240, 74, 420, 414); ctx.restore() }
  ctx.strokeStyle = '#73888e'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(250, 114); ctx.lineTo(650, 114); ctx.stroke()
  const nativeToLegacy = point => ({ x: 70 + point.x / 591 * 760, y: 72 + point.y / 702 * 418 })
  Object.entries(GEOMETRY.bins.slots).forEach(([key, slot]) => {
    const center = nativeToLegacy({ x: slot.centerX, y: 0 }).x
    ctx.fillStyle = key === slotKey ? `${SLOT_META[key].color}2b` : 'rgba(241,247,247,.76)'
    ctx.strokeStyle = key === slotKey ? SLOT_META[key].color : '#a9bdc1'; ctx.lineWidth = key === slotKey ? 3 : 2
    roundedRect(ctx, center - 66, 334, 132, 132, 10); ctx.fill(); ctx.stroke()
  })
  const hopperPoint = nativeToLegacy(GEOMETRY.hopper.center)
  if (legacyImages.hopper) {
    ctx.save(); ctx.translate(hopperPoint.x, hopperPoint.y); ctx.rotate(state.hopperAngle * Math.PI / 180)
    ctx.drawImage(legacyImages.hopper, -141, -72, 282, 145); ctx.restore()
  }
  const carriagePoint = nativeToLegacy(state.carriage)
  if (legacyImages.carriage) ctx.drawImage(legacyImages.carriage, carriagePoint.x - 63, carriagePoint.y - 25, 126, 82)
  const gripPoint = nativeToLegacy(gripperPoint(state))
  if (legacyImages.leftJaw) ctx.drawImage(legacyImages.leftJaw, gripPoint.x - 30, gripPoint.y - 8, 34, 72)
  if (legacyImages.rightJaw) ctx.drawImage(legacyImages.rightJaw, gripPoint.x - 4, gripPoint.y - 8, 34, 72)
  if (state.object.visible && objectImage && adapter) {
    const objectPoint = nativeToLegacy(state.object)
    const scale = (Number(adapter.scale) || .26) * .52
    ctx.save(); ctx.translate(objectPoint.x, objectPoint.y); ctx.rotate((Number(state.object.rotation) || 0) * Math.PI / 180)
    ctx.scale(scale, scale); ctx.drawImage(objectImage, -objectImage.width / 2, -objectImage.height / 2); ctx.restore()
  }
  if (legacyImages.foreground) ctx.drawImage(legacyImages.foreground, 0, 0, 900, 520)
  ctx.restore()
}

function rasterMechanismState(state, slotKey) {
  const config = SMART_BIN_CUTAWAY_RASTER_V3
  const oldHomeX = GEOMETRY.gantry.home.x
  const oldTargetX = GEOMETRY.gantry.transferX[slotKey]
  const denominator = oldTargetX - oldHomeX
  const travel = Math.abs(denominator) < .001 ? 0 : clamp((state.carriage.x - oldHomeX) / denominator)
  const carriageX = lerp(config.mechanism.home.x, config.mechanism.transferX[slotKey], travel)
  const carriageY = config.mechanism.home.y + state.liftExtension * config.mechanism.liftScale
  const deltaX = carriageX - config.mechanism.home.x
  const deltaY = carriageY - config.mechanism.home.y
  return {
    carriageX,
    carriageY,
    deltaX,
    deltaY,
    grip: {
      x: config.mechanism.gripAnchor.x + deltaX,
      y: config.mechanism.gripAnchor.y + deltaY
    }
  }
}

function rasterWasteState(phase, state, slotKey, mechanism) {
  const config = SMART_BIN_CUTAWAY_RASTER_V3
  const receive = config.mechanism.receive
  const slot = config.slots[slotKey]
  const baseRotation = Number(adapter?.receiveRotation) || 0
  const gripOffset = config.mechanism.wasteGripOffset || { x: 0, y: 0 }
  const heldGrip = {
    x: mechanism.grip.x + gripOffset.x,
    y: mechanism.grip.y + gripOffset.y
  }
  if (phase.key === 'intake') {
    const t = phase.localProgress
    const fall = t < .84 ? (t / .84) ** 2 * .94 : .94 + smoothstep((t - .84) / .16) * .06
    return { x: lerp(config.mechanism.inlet.x, receive.x, fall), y: lerp(config.mechanism.inlet.y, receive.y, fall), rotation: lerp(Number(adapter?.rotation) || 0, baseRotation, fall), visible: true, clipY: null, fall: 0 }
  }
  if (phase.key === 'detect') return { ...receive, rotation: baseRotation, visible: true, clipY: null, fall: 0 }
  if (phase.key === 'receive') {
    const attach = smoothstep((phase.localProgress - .46) / .2)
    return { x: lerp(receive.x, heldGrip.x, attach), y: lerp(receive.y, heldGrip.y, attach), rotation: lerp(baseRotation, 0, attach), visible: true, clipY: null, fall: 0 }
  }
  if (phase.key === 'transfer') {
    const sway = Math.sin(phase.localProgress * Math.PI) * (Number(adapter?.transferSway) || 0)
    return { x: heldGrip.x, y: heldGrip.y + sway * .2, rotation: sway, visible: true, clipY: null, fall: 0 }
  }
  if (phase.key === 'align') return { ...heldGrip, rotation: 0, visible: true, clipY: null, fall: 0 }
  if (phase.key === 'drop') {
    const fall = phase.localProgress <= .16 ? 0 : ((phase.localProgress - .16) / .84) ** 2
    const point = cubicPoint([
      heldGrip,
      { x: heldGrip.x, y: 320 },
      { x: slot.center.x, y: slot.center.y - 34 },
      { x: slot.center.x, y: slot.hideY + 28 }
    ], fall)
    return { ...point, rotation: lerp(0, Number(adapter?.dropRotation) || 0, fall), visible: true, clipY: slot.hideY, fall }
  }
  return { ...receive, rotation: 0, visible: false, clipY: null, fall: 0 }
}

function drawRasterImage(ctx, image, alpha = 1) {
  if (!image) return
  const box = SMART_BIN_CUTAWAY_RASTER_V3.motherDrawBox
  ctx.save(); ctx.globalAlpha = alpha
  ctx.drawImage(image, box.x, box.y, box.width, box.height)
  ctx.restore()
}

function drawRasterMother(ctx, state) {
  const openAmount = clamp(state?.panelOpen)
  const frameKeys = SMART_BIN_CUTAWAY_RASTER_V3.panelAnimation.frameKeys
  const framePosition = openAmount * (frameKeys.length - 1)
  const lowerIndex = Math.floor(framePosition)
  const upperIndex = Math.min(frameKeys.length - 1, lowerIndex + 1)
  const blend = framePosition - lowerIndex
  // Each keyframe is an opaque full-scene raster. Keep the lower frame fully
  // opaque, then fade the next frame over it; fading both frames exposes the
  // dark canvas at every midpoint and makes the opening sequence flash.
  drawRasterImage(ctx, rasterImages[frameKeys[lowerIndex]])
  if (upperIndex !== lowerIndex && blend > 0) drawRasterImage(ctx, rasterImages[frameKeys[upperIndex]], blend)
}

function drawRasterPiece(ctx, key, deltaX = 0, deltaY = 0, extraX = 0) {
  const image = rasterImages[key]
  const layer = SMART_BIN_CUTAWAY_RASTER_V3.layers[key]
  if (!image || !layer) return
  const scale = SMART_BIN_CUTAWAY_RASTER_V3.sourceToSceneScale
  const [left, top, right, bottom] = layer.sourceBbox
  const box = SMART_BIN_CUTAWAY_RASTER_V3.motherDrawBox
  ctx.save()
  if (key === 'carriageLift') ctx.filter = 'saturate(.22) brightness(1.02) contrast(1.06)'
  if (key === 'leftJaw' || key === 'rightJaw') ctx.filter = 'brightness(1.06) contrast(1.12) drop-shadow(0px 1px 1.4px rgba(0, 8, 12, .52))'
  ctx.drawImage(image, box.x + left * scale + deltaX + extraX, box.y + top * scale + deltaY, (right - left) * scale, (bottom - top) * scale)
  ctx.restore()
}

function drawRasterTargetEffect(ctx, state, slotKey) {
  const slot = SMART_BIN_CUTAWAY_RASTER_V3.slots[slotKey]
  if (!slot || (state.slotEmphasis <= 0 && state.localFillPct <= 0)) return
  ctx.save()
  const fillRatio = targetFill.value > 0 ? clamp(state.localFillPct / targetFill.value) : 0
  ctx.globalAlpha = .12 + state.slotEmphasis * .2
  ctx.strokeStyle = slot.color
  ctx.fillStyle = slot.color
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.ellipse(slot.center.x, slot.center.y, slot.radius.x, slot.radius.y, -.04, 0, Math.PI * 2)
  if (fillRatio > 0) { ctx.globalAlpha = .08 + fillRatio * .12; ctx.fill() }
  ctx.globalAlpha = .18 + state.slotEmphasis * .24; ctx.stroke()
  ctx.restore()
}

function drawRasterWaste(ctx, waste) {
  if (!waste.visible || !objectImage || !adapter) return
  ctx.save()
  if (Number.isFinite(waste.clipY)) {
    ctx.beginPath(); ctx.rect(0, 0, SCENE.width, waste.clipY); ctx.clip()
  }
  const scale = Number(adapter.internalScale) || .13
  ctx.translate(waste.x, waste.y)
  ctx.rotate((Number(waste.rotation) || 0) * Math.PI / 180)
  ctx.scale(scale, scale)
  ctx.drawImage(objectImage, -objectImage.width / 2, -objectImage.height / 2)
  ctx.restore()
}

function drawRasterEffects(ctx, phase, waste, slotKey) {
  if (phase.key !== 'detect') return
  const pulse = Math.sin(phase.localProgress * Math.PI) ** 2
  ctx.save()
  ctx.strokeStyle = SMART_BIN_CUTAWAY_RASTER_V3.slots[slotKey].color
  ctx.globalAlpha = .42
  ctx.lineWidth = 1.5
  const size = 26
  ctx.strokeRect(waste.x - size, waste.y - size, size * 2, size * 2)
  ctx.globalAlpha = .12 + pulse * .14
  ctx.fillStyle = SMART_BIN_CUTAWAY_RASTER_V3.slots[slotKey].color
  ctx.fillRect(waste.x - size + 3, waste.y - size + 6 + (size * 2 - 12) * phase.localProgress, size * 2 - 6, 1.5)
  ctx.restore()
}

function drawRasterRealOcclusion(ctx, phase, state, waste, slotKey) {
  const occlusion = SMART_BIN_CUTAWAY_RASTER_V3.panelOcclusion
  const image = rasterImages.panelsOpenMother
  if (!occlusion.enabled || phase.key !== 'drop' || state.panelOpen < .92 || !image) return
  const scale = SMART_BIN_CUTAWAY_RASTER_V3.sourceToSceneScale
  const box = SMART_BIN_CUTAWAY_RASTER_V3.motherDrawBox
  occlusion.frontPanelPolygons.forEach(polygon => {
    ctx.save()
    ctx.beginPath()
    polygon.forEach(([sourceX, sourceY], index) => {
      const sceneX = box.x + sourceX * scale
      const sceneY = box.y + sourceY * scale
      if (index === 0) ctx.moveTo(sceneX, sceneY)
      else ctx.lineTo(sceneX, sceneY)
    })
    ctx.closePath()
    ctx.clip()
    drawRasterImage(ctx, image)
    ctx.restore()
  })
}

function drawRasterV3Frame(ctx, phase, state, slotKey, staticFallback = false) {
  if (staticFallback) { drawRasterImage(ctx, rasterImages.assembledPoster); return }
  drawRasterMother(ctx, state)
  const mechanism = rasterMechanismState(state, slotKey)
  const waste = rasterWasteState(phase, state, slotKey, mechanism)
  drawRasterTargetEffect(ctx, state, slotKey)
  drawRasterPiece(ctx, 'carriageLift', mechanism.deltaX, mechanism.deltaY)
  drawRasterPiece(ctx, 'leftJaw', mechanism.deltaX, mechanism.deltaY, (SMART_BIN_CUTAWAY_RASTER_V3.layers.leftJaw.closeDeltaX || 0) * state.jawClosed)
  drawRasterWaste(ctx, waste)
  drawRasterPiece(ctx, 'rightJaw', mechanism.deltaX, mechanism.deltaY, (SMART_BIN_CUTAWAY_RASTER_V3.layers.rightJaw.closeDeltaX || 0) * state.jawClosed)
  drawRasterEffects(ctx, phase, waste, slotKey)
  drawRasterRealOcclusion(ctx, phase, state, waste, slotKey)
}

function drawFrame(emitState = false) {
  if (!canvas || !context || !ready || disposed || !cssWidth || !cssHeight) return
  const phase = phaseAt(elapsedMs)
  const state = motionState(phase)
  const slotKey = targetSlotKey()
  const shot = resolveSmartBinInternalShot(phase.key, phase.localProgress)
  phaseKey.value = phase.key

  const ctx = context
  // uni-app's H5 high-DPI wrapper scales images and most path coordinates but
  // does not scale ellipse coordinates. Mixing those wrapped operations moves
  // the target-slot ellipse away from the raster bin at fractional DPR. Own
  // the backing-store transform here so every drawing operation shares one
  // native coordinate system.
  if (ctx.__hidpi__ === true) ctx.__hidpi__ = false
  ctx.setTransform(canvas.width / cssWidth, 0, 0, canvas.height / cssHeight, 0, 0)
  ctx.clearRect(0, 0, cssWidth, cssHeight)
  ctx.fillStyle = '#061722'; ctx.fillRect(0, 0, cssWidth, cssHeight)

  if (activeVisualVersion.value === 'cutaway-raster-v8' || activeVisualVersion.value === 'cutaway-raster-v8-static') {
    const staticFallback = activeVisualVersion.value === 'cutaway-raster-v8-static'
    const fit = Math.min(cssWidth / SCENE.width, cssHeight / SCENE.height)
    const cameraScale = staticFallback ? 1 : shot.cameraScale
    const focus = staticFallback ? [600, 310] : shot.focus
    ctx.save()
    ctx.translate(cssWidth / 2, cssHeight / 2)
    ctx.scale(fit * cameraScale, fit * cameraScale)
    ctx.translate(-focus[0], -focus[1])
    drawSceneBackground(ctx)
    drawRasterV3Frame(ctx, phase, state, slotKey, staticFallback)
    ctx.restore()
  } else if (activeVisualVersion.value === 'legacy-v1') {
    drawLegacyFrame(ctx, state, slotKey)
  } else if (activeVisualVersion.value === 'v4') {
    const fit = Math.min(cssWidth / SCENE.width, cssHeight / SCENE.height)
    ctx.save()
    ctx.translate(cssWidth / 2, cssHeight / 2)
    ctx.scale(fit * shot.cameraScale, fit * shot.cameraScale)
    ctx.translate(-shot.focus[0], -shot.focus[1])
    drawSceneBackground(ctx)

    ctx.save()
    ctx.translate(SMART_BIN_INTERNAL_DEVICE.x, SMART_BIN_INTERNAL_DEVICE.y)
    ctx.scale(SMART_BIN_INTERNAL_DEVICE.scale, SMART_BIN_INTERNAL_DEVICE.scale)
    drawRegisteredLayer(ctx, 'rearFrame')
    drawRegisteredLayer(ctx, 'fixedCadStructure', { opacity: .26, filter: 'grayscale(.9) saturate(.24) brightness(.7) contrast(.78)' })
    drawRegisteredLayer(ctx, 'xyRails')
    drawCarriageShadow(ctx, state)
    drawObjectShadow(ctx, state)
    drawCarriageAndGripper(ctx, state)
    drawWasteObject(ctx, state)
    drawHopper(ctx, state, 'guideHopperRear', .72)
    drawRegisteredLayer(ctx, 'targetBins')
    drawBinFill(ctx, slotKey, state)
    drawHopper(ctx, state, 'guideHopperFrontLip')
    drawTargetEmphasis(ctx, slotKey, state.slotEmphasis)
    drawRegisteredLayer(ctx, 'binFrontPanels')
    drawInletOcclusion(ctx)
    drawRegisteredLayer(ctx, 'frontFrameOcclusion')
    drawRouteAid(ctx, state, slotKey)
    drawDetection(ctx, state, slotKey)
    drawCalibration(ctx)
    ctx.restore()
    ctx.restore()
  }

  if (emitState && props.active && !disposed) {
    emit('progress', {
      phase: phase.key,
      phaseLabel: phase.label,
      phaseIndex: phase.index,
      localProgress: phase.localProgress,
      visualVersion: activeVisualVersion.value,
      progress: clamp(elapsedMs / TOTAL_DURATION),
      previewFillPct: Math.round(state.localFillPct),
      mechanismState: {
        carriageX: Math.round(state.carriage.x),
        liftExtension: Number(state.liftExtension.toFixed(1)),
        jawClosed: Number(state.jawClosed.toFixed(2)),
        hopperAngle: Number(state.hopperAngle.toFixed(1)),
        panelOpen: Number(state.panelOpen.toFixed(2))
      }
    })
  }
}

function draw(emitState = false) { drawFrame(emitState) }

function tick(timestamp) {
  if (!playing || disposed || !props.active) return
  if (!lastTimestamp) lastTimestamp = timestamp
  const delta = Math.min(100, timestamp - lastTimestamp)
  lastTimestamp = timestamp
  elapsedMs = Math.min(TOTAL_DURATION, elapsedMs + delta * Math.max(.1, Number(props.playbackRate) || 1))
  draw(true)
  if (elapsedMs >= TOTAL_DURATION) {
    playing = false
    playingState.value = false
    completed = true
    rafId = 0
    emit('complete', { source: 'VISUAL_AID', workflow: 'SIMULATED_BIN_WORKFLOW', targetSlot: targetSlotKey() })
    return
  }
  rafId = requestAnimationFrame(tick)
}

function play() {
  if (!ready || !props.active || playing || completed || disposed || typeof requestAnimationFrame !== 'function') return
  playing = true
  playingState.value = true
  lastTimestamp = 0
  rafId = requestAnimationFrame(tick)
}

function pause() {
  playing = false
  playingState.value = false
  if (rafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId)
  rafId = 0
  lastTimestamp = 0
}

function reset() {
  pause()
  elapsedMs = 0
  completed = false
  phaseKey.value = PHASES[0].key
  if (ready && props.active) draw(true)
  if (props.active && props.running) play()
}

function setPhase(nextPhaseKey, localProgress = 0) {
  const index = PHASES.findIndex(phase => phase.key === normalizeKey(nextPhaseKey))
  if (index < 0) return false
  pause()
  const phase = PHASES[index]
  elapsedMs = Math.min(TOTAL_DURATION, phaseStart(index) + phase.durationMs * clamp(localProgress))
  completed = elapsedMs >= TOTAL_DURATION
  phaseKey.value = phase.key
  if (ready && props.active) draw(true)
  if (props.active && props.running && !completed) play()
  return true
}

function resizeCanvas() {
  if (!canvas || !context || disposed) return
  const viewport = viewportRef.value?.$el || viewportRef.value
  const rect = viewport?.getBoundingClientRect?.() || canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  cssWidth = rect.width
  cssHeight = rect.height
  if (canvas.style) { canvas.style.width = `${cssWidth}px`; canvas.style.height = `${cssHeight}px` }
  // Match uni-canvas' own H5 backing-store rule so its resize sensor does not
  // immediately replace our dimensions and clear a paused frame.
  const ratio = Math.max(1, Math.min(2, Number(window.devicePixelRatio) || 1))
  const width = Math.max(1, Math.floor((canvas.clientWidth || Math.round(cssWidth)) * ratio))
  const height = Math.max(1, Math.floor((canvas.clientHeight || Math.round(cssHeight)) * ratio))
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  if (ready && props.active) draw(true)
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
  bindDensityWatcher()
  resizeCanvas()
}

function handleWindowResize() {
  resizeCanvas()
}

watch(() => props.running, value => value ? play() : pause(), { flush: 'sync' })
watch(() => props.active, value => {
  if (value) reset()
  else pause()
}, { flush: 'post' })
watch(() => props.resetKey, reset, { flush: 'post' })
watch(() => [props.objectId, props.objectClass, props.targetBinId, props.wasteConfigSrc, props.structureVisualSrc, props.visualVersion], loadAssets)
watch(() => props.debugCalibration, () => { if (ready && props.active) draw(true) })

onMounted(async () => {
  await nextTick()
  const canvasHost = canvasRef.value?.$el || canvasRef.value
  canvas = canvasHost?.querySelector?.('canvas') || canvasHost
  if (canvas?.style) { canvas.style.display = 'block'; canvas.style.width = '100%'; canvas.style.height = '100%' }
  if (canvas?.getContext) {
    context = canvas.getContext('2d', { alpha: true })
    if (context?.__hidpi__ === true) context.__hidpi__ = false
  }
  if (context && typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(resizeCanvas)
    resizeObserver.observe(viewportRef.value?.$el || viewportRef.value)
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleWindowResize)
    bindDensityWatcher()
  }
  resizeCanvas()
  await loadAssets()
})

onBeforeUnmount(() => {
  disposed = true
  loadRevision += 1
  pause()
  resizeObserver?.disconnect()
  resizeObserver = null
  unbindDensityWatcher()
  if (typeof window !== 'undefined') window.removeEventListener('resize', handleWindowResize)
  objectImage = null
  layerImages = {}
  legacyImages = {}
  rasterImages = {}
  adapter = null
  ready = false
  canvas = null
  context = null
})

defineExpose({ play, pause, reset, setPhase })
</script>

<style scoped>
.smart-bin-workflow,.bin-workflow-viewport,.bin-workflow-canvas { display:block; width:100%; height:100%; }
.bin-workflow-viewport { position:relative; min-height:210px; overflow:hidden; border-radius:10px; background:#071b2a; box-shadow:inset 0 0 36px rgba(0,9,15,.42); }
.bin-workflow-canvas { pointer-events:none; }
</style>
