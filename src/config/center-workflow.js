import { CENTER_WORKFLOW_MASTER_VIDEO } from '@/config/center-workflow-video.js'

const freezeList = list => Object.freeze(list.map(item => Object.freeze(item)))

const cueDurationMs = (startKey, endKey = startKey) => Math.round(
  (CENTER_WORKFLOW_MASTER_VIDEO.cuePoints[endKey].endSeconds
    - CENTER_WORKFLOW_MASTER_VIDEO.cuePoints[startKey].startSeconds) * 1000
)
const checkMs = cueDurationMs('battery')
const chargeMs = cueDurationMs('charge')
const standbyMs = cueDurationMs('ready')
const checkChargeMs = checkMs + chargeMs

export const CENTER_WORKFLOW_STAGES = freezeList([
  { key: 'ARRIVE', label: '设备到站', zone: 'ARRIVE', eventType: 'DEVICE_ARRIVED_AT_CENTER', visualKey: 'arrival' },
  { key: 'DOCK', label: '泊位对接', zone: 'DOCK', eventType: 'DEVICE_ARRIVED_AT_CENTER', visualKey: 'waiting' },
  { key: 'UNLOAD', label: '垃圾卸载', zone: 'UNLOAD', eventType: 'CENTER_UNLOADING', visualKey: 'unloading' },
  { key: 'CLEAN', label: '桶体清洁', zone: 'CLEAN', eventType: 'CENTER_CLEANING', visualKey: 'cleaning' },
  { key: 'CHECK', label: '状态检测', zone: 'CHECK', eventType: 'CENTER_CHARGING', visualKey: 'status_check' },
  { key: 'CHARGE', label: '充电', zone: 'CHARGE', eventType: 'CENTER_CHARGING', visualKey: 'charging' },
  { key: 'STANDBY', label: '恢复待命', zone: 'STANDBY', eventType: 'DEVICE_RECOVERED', visualKey: 'standby' }
])

export const CENTER_WORKFLOW_TIMINGS = Object.freeze({
  // 与清运大屏母带提示点保持同速；仅控制局部窗口视觉驻留，不改变业务事件和阶段顺序。
  ARRIVE: cueDurationMs('arrive'),
  DOCK: 1850,
  UNLOAD: cueDurationMs('weigh'),
  CLEAN: cueDurationMs('wash', 'dry'),
  CHECK: checkMs,
  CHARGE: chargeMs,
  STANDBY: standbyMs,
  CHECK_CHARGE: checkChargeMs,
  CHECK_CHARGE_SPLIT: checkMs / checkChargeMs
})

export const CENTER_WORKFLOW_SCENE = Object.freeze({
  aspectRatio: 4 / 3,
  device: Object.freeze({
    src: '/static/digital-twin-replay/sprites/smart-bin-v2.png',
    widthPct: 18,
    source: '/static/digital-twin-replay/sprites/smart-bin-v2.png',
    dockFadeEnd: 0.58
  }),
  masks: Object.freeze({
    unload: Object.freeze({ left: 11, top: 29, width: 28, height: 43 }),
    clean: Object.freeze({ left: 29, top: 29, width: 28, height: 42 }),
    check: Object.freeze({ left: 51, top: 40, width: 27, height: 28 }),
    charge: Object.freeze({ left: 66, top: 42, width: 22, height: 27 })
  }),
  paths: Object.freeze({
    ARRIVE: freezeList([
      { at: 0, x: 58, y: 108, scale: 0.68, rotate: 2 },
      { at: 0.2, x: 50, y: 90, scale: 0.74, rotate: 1 },
      { at: 0.5, x: 33, y: 71, scale: 0.86, rotate: 1 },
      { at: 0.78, x: 20, y: 55, scale: 0.99, rotate: 0 },
      { at: 1, x: 15.8, y: 48, scale: 1.05, rotate: 0 }
    ]),
    DOCK: freezeList([
      { at: 0, x: 15.8, y: 48, scale: 1.05, rotate: 0 },
      { at: 1, x: 15.8, y: 48, scale: 1.05, rotate: 0 }
    ]),
    UNLOAD: freezeList([
      { at: 0, x: 19.2, y: 58.4, scale: 0.84, rotate: -2 },
      { at: 0.24, x: 19.2, y: 57.4, scale: 0.84, rotate: -10 },
      { at: 0.78, x: 19.2, y: 57.4, scale: 0.84, rotate: -10 },
      { at: 1, x: 19.2, y: 58.4, scale: 0.84, rotate: -2 }
    ]),
    CLEAN: freezeList([
      { at: 0, x: 19.2, y: 58.4, scale: 0.84, rotate: -2 },
      { at: 0.34, x: 31, y: 55.8, scale: 0.82, rotate: 0 },
      { at: 1, x: 38.5, y: 53.8, scale: 0.8, rotate: 1 }
    ]),
    CHECK: freezeList([
      { at: 0, x: 38.5, y: 53.8, scale: 0.8, rotate: 1 },
      { at: 0.42, x: 50.5, y: 59, scale: 0.78, rotate: 1 },
      { at: 1, x: 59.5, y: 62.2, scale: 0.76, rotate: 2 }
    ]),
    CHARGE: freezeList([
      { at: 0, x: 59.5, y: 62.2, scale: 0.76, rotate: 2 },
      { at: 0.55, x: 68, y: 64.5, scale: 0.74, rotate: 2 },
      { at: 1, x: 72.5, y: 66, scale: 0.73, rotate: 2 }
    ]),
    STANDBY: freezeList([
      { at: 0, x: 72.5, y: 66, scale: 0.73, rotate: 2 },
      { at: 0.62, x: 82, y: 71, scale: 0.69, rotate: 3 },
      { at: 1, x: 91, y: 76, scale: 0.65, rotate: 3 }
    ])
  }),
  unloadStream: Object.freeze({
    start: Object.freeze({ x: 31, y: 70 }),
    end: Object.freeze({ x: 58, y: 18 }),
    particleCount: 7,
    startAt: 0.24,
    endAt: 0.82
  }),
  energyDots: freezeList([
    { at: 0.08 }, { at: 0.3 }, { at: 0.52 }, { at: 0.74 }
  ])
})

const stageByKey = Object.freeze(Object.fromEntries(CENTER_WORKFLOW_STAGES.map(stage => [stage.key, stage])))

export function centerWorkflowStage(key = 'ARRIVE') {
  return stageByKey[key] || CENTER_WORKFLOW_STAGES[0]
}

export function resolveCenterWorkflowPhase({ eventType = '', progress = 0, eventHistory = [], override = null } = {}) {
  if (override && stageByKey[override]) return override
  if (eventType === 'DEVICE_ARRIVED_AT_CENTER') return 'ARRIVE'
  if (eventType === 'CENTER_BAY_ASSIGNED') return 'DOCK'
  if (eventType === 'CENTER_UNLOADING') return 'UNLOAD'
  if (eventType === 'CENTER_CLEANING') return 'CLEAN'
  if (eventType === 'CENTER_CHARGING') {
    return progress < CENTER_WORKFLOW_TIMINGS.CHECK_CHARGE_SPLIT ? 'CHECK' : 'CHARGE'
  }
  if (eventType === 'CENTER_CHECKING') return 'CHECK'
  if (eventType === 'DEVICE_RECOVERED') return 'STANDBY'

  const types = eventHistory.map(event => event?.eventType)
  const arrived = types.includes('DEVICE_ARRIVED_AT_CENTER')
  const unloading = types.includes('CENTER_UNLOADING')
  return arrived && !unloading ? 'DOCK' : 'ARRIVE'
}

export function centerWorkflowAnimationIdentity({ eventType = '', eventHistory = [], override = null } = {}) {
  if (override && stageByKey[override]) return override
  if (eventType === 'CENTER_CHARGING') return 'CHECK_CHARGE'
  return resolveCenterWorkflowPhase({ eventType, eventHistory, progress: 0 })
}

export function centerWorkflowDuration(identity = 'ARRIVE') {
  return CENTER_WORKFLOW_TIMINGS[identity] || CENTER_WORKFLOW_TIMINGS.ARRIVE
}

export function centerWorkflowEventType(stageKey = 'ARRIVE') {
  return centerWorkflowStage(stageKey).eventType
}

const clamp = value => Math.max(0, Math.min(1, Number(value) || 0))
const ease = value => 1 - Math.pow(1 - clamp(value), 3)

export function centerWorkflowLocalProgress(stageKey, eventProgress, identity = '') {
  const progress = clamp(eventProgress)
  if (identity === 'CHECK_CHARGE' && stageKey === 'CHECK') {
    return clamp(progress / CENTER_WORKFLOW_TIMINGS.CHECK_CHARGE_SPLIT)
  }
  if (identity === 'CHECK_CHARGE' && stageKey === 'CHARGE') {
    return clamp((progress - CENTER_WORKFLOW_TIMINGS.CHECK_CHARGE_SPLIT) / (1 - CENTER_WORKFLOW_TIMINGS.CHECK_CHARGE_SPLIT))
  }
  return progress
}

export function centerWorkflowDevicePose(stageKey, progress) {
  const keyframes = CENTER_WORKFLOW_SCENE.paths[stageKey] || CENTER_WORKFLOW_SCENE.paths.ARRIVE
  const amount = clamp(progress)
  let left = keyframes[0]
  let right = keyframes[keyframes.length - 1]
  for (let index = 1; index < keyframes.length; index += 1) {
    if (amount <= keyframes[index].at) {
      left = keyframes[index - 1]
      right = keyframes[index]
      break
    }
  }
  const span = Math.max(0.0001, right.at - left.at)
  const ratio = ease((amount - left.at) / span)
  const value = key => Number(left[key]) + (Number(right[key]) - Number(left[key])) * ratio
  return Object.freeze({ x: value('x'), y: value('y'), scale: value('scale'), rotate: value('rotate') })
}
