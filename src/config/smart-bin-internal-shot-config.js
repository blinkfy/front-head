import { SMART_BIN_INTERNAL_SCENE } from '@/config/smart-bin-internal-layer-registry.js'

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number(value) || 0))
const lerp = (start, end, amount) => start + (end - start) * amount
const easeOut = value => 1 - (1 - clamp(value)) ** 3

export const SMART_BIN_INTERNAL_SHOTS = Object.freeze({
  intake: Object.freeze({ stage: 'intake', cameraScale: 1, cameraOffsetX: 0, cameraOffsetY: 0, focusTarget: [600, 310], transitionDuration: 360, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }),
  detect: Object.freeze({ stage: 'detect', cameraScale: 1.02, cameraOffsetX: 0, cameraOffsetY: -4, focusTarget: [600, 310], transitionDuration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }),
  receive: Object.freeze({ stage: 'receive', cameraScale: 1.05, cameraOffsetX: 0, cameraOffsetY: -7, focusTarget: [600, 310], transitionDuration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }),
  transfer: Object.freeze({ stage: 'transfer', cameraScale: 1.02, cameraOffsetX: 0, cameraOffsetY: -3, focusTarget: [600, 310], transitionDuration: 300, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }),
  align: Object.freeze({ stage: 'align', cameraScale: 1.05, cameraOffsetX: 0, cameraOffsetY: 2, focusTarget: [600, 310], transitionDuration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }),
  drop: Object.freeze({ stage: 'drop', cameraScale: 1.06, cameraOffsetX: 0, cameraOffsetY: 6, focusTarget: [600, 310], transitionDuration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }),
  fill_update: Object.freeze({ stage: 'fill_update', cameraScale: 1.04, cameraOffsetX: 0, cameraOffsetY: 6, focusTarget: [600, 310], transitionDuration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }),
  reset: Object.freeze({ stage: 'reset', cameraScale: 1, cameraOffsetX: 0, cameraOffsetY: 0, focusTarget: [600, 310], transitionDuration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })
})

const ORDER = Object.freeze(['intake', 'detect', 'receive', 'transfer', 'align', 'drop', 'fill_update', 'reset'])

export function resolveSmartBinInternalShot(phaseKey, localProgress = 0) {
  const key = SMART_BIN_INTERNAL_SHOTS[phaseKey] ? phaseKey : ORDER[0]
  const index = ORDER.indexOf(key)
  const current = SMART_BIN_INTERNAL_SHOTS[key]
  const previous = index > 0 ? SMART_BIN_INTERNAL_SHOTS[ORDER[index - 1]] : current
  const transitionWindow = key === 'reset' ? 0.58 : 0.42
  const amount = easeOut(clamp(localProgress / transitionWindow))
  const focusX = clamp(lerp(previous.focusTarget[0] + previous.cameraOffsetX, current.focusTarget[0] + current.cameraOffsetX, amount), 0, SMART_BIN_INTERNAL_SCENE.width)
  const focusY = clamp(lerp(previous.focusTarget[1] + previous.cameraOffsetY, current.focusTarget[1] + current.cameraOffsetY, amount), 0, SMART_BIN_INTERNAL_SCENE.height)
  return {
    ...current,
    cameraScale: lerp(previous.cameraScale, current.cameraScale, amount),
    focus: [focusX, focusY],
    transitionProgress: amount
  }
}
