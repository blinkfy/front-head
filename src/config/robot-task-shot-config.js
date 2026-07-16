import { fitRobotTaskSceneSize, ROBOT_TASK_SCENE_SIZE } from '@/config/robot-task-scene-registry.js'

const freeze = value => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(freeze)
  return Object.freeze(value)
}

const point = (x, y) => Object.freeze([x, y])
const move = (fromX, fromY, toX = fromX, toY = fromY, via = []) => Object.freeze({
  from: point(fromX, fromY),
  to: point(toX, toY),
  via: Object.freeze(via.map(([x, y]) => point(x, y)))
})
const mutablePoint = (x, y) => [x, y]
const mutableMove = (from, to = from, via = []) => ({
  from: mutablePoint(from[0], from[1]),
  to: mutablePoint(to[0], to[1]),
  via: via.map(([x, y]) => mutablePoint(x, y))
})
const pctToScenePoint = value => Array.isArray(value) && value.length >= 2
  ? mutablePoint(
    Number(value[0]) / 100 * ROBOT_TASK_SCENE_SIZE.width,
    Number(value[1]) / 100 * ROBOT_TASK_SCENE_SIZE.height
  )
  : null
const offsetPoint = (value, offsetX, offsetY) => mutablePoint(value[0] + offsetX, value[1] + offsetY)
const routePctPoints = value => Array.isArray(value) ? value.map(pctToScenePoint).filter(Boolean) : []
const isFoodServiceContext = spatialContext => {
  const servicePointId = String(spatialContext?.servicePointId || spatialContext?.targetServicePointId || '').toLowerCase()
  if (servicePointId.includes('food')) return true
  const targetBin = spatialContext?.targetBinPositionPct
  return Array.isArray(targetBin) && Number(targetBin[0]) >= 55
}

function normalizeRobotTaskCamera(camera) {
  const focus = Array.isArray(camera.focus) ? camera.focus : []
  const rawFocusX = Number(camera.focusX ?? focus[0])
  const rawFocusY = Number(camera.focusY ?? focus[1])
  return {
    scale: Math.max(1, Number(camera.scale ?? camera.cameraScale) || 1),
    focusX: Math.max(0, Math.min(
      ROBOT_TASK_SCENE_SIZE.width,
      Number.isFinite(rawFocusX) ? rawFocusX : ROBOT_TASK_SCENE_SIZE.width / 2
    )),
    focusY: Math.max(0, Math.min(
      ROBOT_TASK_SCENE_SIZE.height,
      Number.isFinite(rawFocusY) ? rawFocusY : ROBOT_TASK_SCENE_SIZE.height / 2
    ))
  }
}

export function robotTaskCameraTransformStyle(camera) {
  if (!camera) return { transform: 'none' }
  const normalized = normalizeRobotTaskCamera(camera)
  return {
    transformOrigin: '0 0',
    transform: `translate(50%, 50%) scale(${normalized.scale}) translate(-${normalized.focusX / ROBOT_TASK_SCENE_SIZE.width * 100}%, -${normalized.focusY / ROBOT_TASK_SCENE_SIZE.height * 100}%)`
  }
}

export function robotTaskCanvasCameraTransform(viewportWidth, viewportHeight, camera) {
  const width = Math.max(0, Number(viewportWidth) || 0)
  const height = Math.max(0, Number(viewportHeight) || 0)
  const normalized = normalizeRobotTaskCamera(camera || {})
  const fitted = fitRobotTaskSceneSize(width, height)
  const sceneScale = fitted.width / ROBOT_TASK_SCENE_SIZE.width * normalized.scale
  return {
    scale: sceneScale,
    translateX: width / 2 - normalized.focusX * sceneScale,
    translateY: height / 2 - normalized.focusY * sceneScale,
    cameraScale: normalized.scale,
    focus: [normalized.focusX, normalized.focusY]
  }
}

export const ROBOT_TASK_SHOT_CONFIG = freeze({
  scan: {
    stage: 'scan',
    scene: 'walkway_rest',
    cameraScale: [1, 3.6],
    cameraOffsetX: [0, 0],
    cameraOffsetY: [0, 0],
    cameraLeadY: -32,
    robotPosition: move(886, 519),
    wastePosition: point(804, 489),
    binPosition: point(1070, 452),
    showBin: true,
    focusTarget: 'robot_waste',
    transitionDuration: 360,
    minDurationMs: 1400,
    easing: 'cinematicOut',
    robotHeight: 60,
    binHeight: 46
  },
  approach: {
    stage: 'approach',
    scene: 'walkway_rest',
    cameraScale: [3.6, 4.2],
    cameraOffsetX: [0, 0],
    cameraOffsetY: [0, 0],
    cameraLeadY: -30,
    robotPosition: move(886, 519, 824, 519),
    wastePosition: point(804, 489),
    binPosition: point(1070, 452),
    showBin: true,
    focusTarget: 'robot_waste',
    transitionDuration: 420,
    easing: 'arrive',
    robotHeight: 60,
    binHeight: 46
  },
  grasp: {
    stage: 'grasp',
    scene: 'walkway_rest',
    cameraScale: [4.2, 4.8],
    cameraOffsetX: [0, 0],
    cameraOffsetY: [0, 0],
    cameraLeadY: -26,
    robotPosition: move(824, 519),
    wastePosition: point(804, 489),
    binPosition: point(1070, 452),
    showBin: true,
    focusTarget: 'grasp',
    transitionDuration: 460,
    easing: 'cinematicOut',
    robotHeight: 60,
    binHeight: 46,
    graspWindow: [0.22, 0.72],
    pickupWindow: [0.62, 0.78],
    completionHold: 0.12
  },
  transport: {
    stage: 'transport',
    scene: 'food_service',
    sceneTransition: { from: 'walkway_rest', to: 'food_service', start: 0.18, end: 0.74 },
    // Start from the completed grasp framing. The camera then pans with the
    // actual carrying movement instead of snapping to the bin-side framing on
    // the stage boundary.
    cameraScale: [4.8, 2.8],
    cameraFocusTransition: { from: 'grasp', fromProgress: 1, start: 0.08, end: 0.82, easing: 'cinematicInOut' },
    cameraOffsetX: [0, 0],
    cameraOffsetY: [0, 0],
    cameraLeadY: -24,
    // Pickup exits to the nearby robot path, then follows the central walkway
    // and food-service spur. Only the initial pickup clearance is off-road.
    // Arrive on the far side of the bin: the verified robot layer holds the
    // object to screen-left, so this keeps the held object between robot and
    // inlet instead of releasing it away from the bin.
    robotPosition: move(824, 519, 1088, 460, [
      [804, 489], [953, 475], [1020, 461], [1048, 430], [1076, 438]
    ]),
    wastePosition: point(804, 489),
    binPosition: point(1070, 452),
    showBin: true,
    focusTarget: 'robot_bin',
    transitionDuration: 520,
    easing: 'cinematicInOut',
    robotHeight: 60,
    binHeight: 46
  },
  place: {
    stage: 'place',
    scene: 'food_service',
    cameraScale: [2.8, 4.2],
    cameraOffsetX: [0, 0],
    cameraOffsetY: [0, 0],
    cameraLeadY: -24,
    robotPosition: move(1088, 460),
    wastePosition: point(804, 489),
    binPosition: point(1070, 452),
    showBin: true,
    focusTarget: 'inlet',
    transitionDuration: 420,
    easing: 'cinematicOut',
    robotHeight: 60,
    binHeight: 46,
    releaseWindow: [0.48, 0.82],
    completionHold: 0.12
  },
  return: {
    stage: 'return',
    scene: 'food_service',
    cameraScale: [4.2, 1],
    cameraOffsetX: [0, 0],
    cameraOffsetY: [0, 0],
    cameraLeadY: -28,
    robotPosition: move(1088, 460, 1020, 461, [[1076, 438], [1048, 430]]),
    wastePosition: point(804, 489),
    binPosition: point(1070, 452),
    showBin: true,
    focusTarget: 'robot_bin',
    transitionDuration: 460,
    easing: 'cinematicInOut',
    robotHeight: 60,
    binHeight: 46
  }
})

export const ROBOT_TASK_STAGE_ORDER = Object.freeze(['scan', 'approach', 'grasp', 'transport', 'place', 'return'])

export function resolveRobotTaskShot(stage = 'scan', spatialContext = null) {
  const key = stage === 'release' ? 'place' : stage
  const shot = ROBOT_TASK_SHOT_CONFIG[key] || ROBOT_TASK_SHOT_CONFIG.scan
  return applyRobotTaskSpatialContext(shot, spatialContext)
}

// Map handoff begins at the exact ground anchor used by the final local frame.
// Keeping this derived from the shot avoids a one-frame jump when task-specific
// bin coordinates do not coincide with the legacy road-graph dock.
export function robotTaskHandoffStartPositionPct(spatialContext = null) {
  const shot = resolveRobotTaskShot('return', spatialContext)
  const [x, y] = shotPoint(shot.robotPosition, 1)
  return [
    x / ROBOT_TASK_SCENE_SIZE.width * 100,
    y / ROBOT_TASK_SCENE_SIZE.height * 100
  ]
}

function applyRobotTaskSpatialContext(shot, spatialContext) {
  const garbage = pctToScenePoint(spatialContext?.garbagePositionPct)
  const targetBin = pctToScenePoint(spatialContext?.targetBinPositionPct)
  if (!garbage && !targetBin) return shot
  const pickupRobot = garbage ? offsetPoint(garbage, 20, 30) : shotPoint(shot.robotPosition, 1)
  const scanRobot = garbage ? offsetPoint(garbage, 82, 30) : shotPoint(shot.robotPosition, 0)
  const binRobot = targetBin ? offsetPoint(targetBin, 18, 8) : shotPoint(ROBOT_TASK_SHOT_CONFIG.place.robotPosition, 1)
  const route = spatialContext?.robotRoute || {}
  const transportRoute = routePctPoints(route.transportWaypointsPct || spatialContext?.globalTaskRoutes?.transportToBin)
  const contextual = { ...shot }
  if (isFoodServiceContext(spatialContext)) {
    contextual.scene = 'food_service'
    if (contextual.sceneTransition) contextual.sceneTransition = null
  }
  if (garbage) contextual.wastePosition = garbage
  if (targetBin) contextual.binPosition = targetBin
  if (shot.stage === 'scan') contextual.robotPosition = mutableMove(scanRobot)
  if (shot.stage === 'approach') contextual.robotPosition = mutableMove(scanRobot, pickupRobot)
  if (shot.stage === 'grasp') contextual.robotPosition = mutableMove(pickupRobot)
  if (shot.stage === 'transport') contextual.robotPosition = mutableMove(
    pickupRobot,
    binRobot,
    transportRoute.length > 2 ? transportRoute.slice(1, -1) : []
  )
  if (shot.stage === 'place') contextual.robotPosition = mutableMove(binRobot)
  if (shot.stage === 'return') contextual.robotPosition = mutableMove(binRobot)
  return contextual
}

export function shotProgress(stage, progress) {
  return ['release', 'completed', 'idle'].includes(stage) ? 1 : Math.max(0, Math.min(1, Number(progress) || 0))
}

export function shotValue(value, progress) {
  if (!Array.isArray(value)) return Number(value) || 0
  const from = Number(value[0]) || 0
  const to = Number(value[1]) || 0
  return from + (to - from) * progress
}

export function shotPoint(value, progress) {
  const from = value?.from || value || [0, 0]
  const to = value?.to || from
  const route = [from, ...(value?.via || []), to]
  if (route.length > 2) {
    const lengths = route.slice(1).map((point, index) => Math.hypot(point[0] - route[index][0], point[1] - route[index][1]))
    const total = lengths.reduce((sum, length) => sum + length, 0)
    let remaining = Math.max(0, Math.min(1, Number(progress) || 0)) * total
    for (let index = 0; index < lengths.length; index += 1) {
      if (remaining <= lengths[index] || index === lengths.length - 1) {
        const amount = lengths[index] ? remaining / lengths[index] : 0
        return [
          shotValue([route[index][0], route[index + 1][0]], amount),
          shotValue([route[index][1], route[index + 1][1]], amount)
        ]
      }
      remaining -= lengths[index]
    }
  }
  return [shotValue([from[0], to[0]], progress), shotValue([from[1], to[1]], progress)]
}

export function shotEasing(name, progress) {
  const t = Math.max(0, Math.min(1, Number(progress) || 0))
  if (name === 'arrive') return 1 - (1 - t) ** 3
  if (name === 'cinematicInOut') return t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2
  if (name === 'cinematicOut') return 1 - (1 - t) ** 3
  return t * t * (3 - 2 * t)
}

function resolveShotFocus(shot, easedProgress) {
  const robotPosition = shotPoint(shot.robotPosition, easedProgress)
  const wastePosition = shot.wastePosition || [804, 489]
  const binPosition = shotPoint(shot.binPosition || [1070, 475], easedProgress)
  let focus = [ROBOT_TASK_SCENE_SIZE.width / 2, ROBOT_TASK_SCENE_SIZE.height / 2]
  if (shot.focusTarget === 'robot_waste') focus = [
    shotValue([wastePosition[0], robotPosition[0]], .52),
    shotValue([wastePosition[1], robotPosition[1]], .52) + (Number(shot.cameraLeadY) || 0)
  ]
  if (shot.focusTarget === 'grasp') focus = [
    shotValue([wastePosition[0], robotPosition[0]], .56),
    shotValue([wastePosition[1], robotPosition[1]], .54) + (Number(shot.cameraLeadY) || 0)
  ]
  if (shot.focusTarget === 'robot_bin') focus = [
    shotValue([binPosition[0], robotPosition[0]], .54),
    shotValue([binPosition[1], robotPosition[1]], .5) + (Number(shot.cameraLeadY) || 0)
  ]
  if (shot.focusTarget === 'inlet') focus = [
    shotValue([binPosition[0], robotPosition[0]], .48),
    shotValue([binPosition[1], robotPosition[1]], .5) + (Number(shot.cameraLeadY) || 0)
  ]
  focus[0] += shotValue(shot.cameraOffsetX, easedProgress)
  focus[1] += shotValue(shot.cameraOffsetY, easedProgress)
  return { robotPosition, wastePosition, binPosition, focus }
}

export function resolveRobotTaskCamera(stage = 'scan', progress = 0, spatialContext = null) {
  const renderStage = ['idle', 'completed'].includes(stage) ? 'return' : stage === 'error' ? 'scan' : stage
  const shot = resolveRobotTaskShot(renderStage, spatialContext)
  const configuredProgress = shotProgress(stage, progress)
  const easedProgress = shotEasing(shot.easing, configuredProgress)
  const frame = resolveShotFocus(shot, easedProgress)
  const { robotPosition, wastePosition, binPosition } = frame
  const cameraScale = shotValue(shot.cameraScale, easedProgress)
  let focus = frame.focus
  const focusTransition = shot.cameraFocusTransition
  if (focusTransition?.from) {
    const previousShot = resolveRobotTaskShot(focusTransition.from, spatialContext)
    const previousProgress = shotEasing(previousShot.easing, Number(focusTransition.fromProgress ?? 1))
    const previousFocus = resolveShotFocus(previousShot, previousProgress).focus
    const start = Math.max(0, Math.min(1, Number(focusTransition.start) || 0))
    const end = Math.max(start + .001, Math.min(1, Number(focusTransition.end) || 1))
    const localProgress = Math.max(0, Math.min(1, (configuredProgress - start) / (end - start)))
    const blend = shotEasing(focusTransition.easing || 'cinematicInOut', localProgress)
    focus = [
      shotValue([previousFocus[0], focus[0]], blend),
      shotValue([previousFocus[1], focus[1]], blend)
    ]
  }
  const halfWidth = ROBOT_TASK_SCENE_SIZE.width / Math.max(.001, cameraScale * 2)
  const halfHeight = ROBOT_TASK_SCENE_SIZE.height / Math.max(.001, cameraScale * 2)
  focus[0] = halfWidth >= ROBOT_TASK_SCENE_SIZE.width / 2
    ? ROBOT_TASK_SCENE_SIZE.width / 2
    : Math.max(halfWidth, Math.min(ROBOT_TASK_SCENE_SIZE.width - halfWidth, focus[0]))
  focus[1] = halfHeight >= ROBOT_TASK_SCENE_SIZE.height / 2
    ? ROBOT_TASK_SCENE_SIZE.height / 2
    : Math.max(halfHeight, Math.min(ROBOT_TASK_SCENE_SIZE.height - halfHeight, focus[1]))
  return { shot, easedProgress, robotPosition, wastePosition, binPosition, cameraScale, focus }
}

export default ROBOT_TASK_SHOT_CONFIG
