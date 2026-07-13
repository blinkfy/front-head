import { resolveSmartBinVisual } from './smart-bin-visual-registry.js'

const smartBinMapVisual = resolveSmartBinVisual('map')

const patrolRobotMapSprite = Object.freeze({
  src: '/static/digital-twin-replay/sprites/patrol-robot-v1.webp',
  status: 'formal',
  source: 'back-end/images/lejv.webp',
  view: 'left_front_35_45',
  transparent: true,
  groundAnchor: Object.freeze([0.5, 0.965]),
  headingMode: 'chassis_indicator',
  directionalAssetStatus: 'single_verified_view'
})

export const MAP_HEADING_DIRECTIONS = Object.freeze([
  Object.freeze({ key: 'east', headingDeg: 0 }),
  Object.freeze({ key: 'southEast', headingDeg: 45 }),
  Object.freeze({ key: 'south', headingDeg: 90 }),
  Object.freeze({ key: 'southWest', headingDeg: 135 }),
  Object.freeze({ key: 'west', headingDeg: 180 }),
  Object.freeze({ key: 'northWest', headingDeg: -135 }),
  Object.freeze({ key: 'north', headingDeg: -90 }),
  Object.freeze({ key: 'northEast', headingDeg: -45 })
])

export const MAP_SPRITE_REGISTRY = Object.freeze({
  robot: Object.freeze({
    default: patrolRobotMapSprite,
    active: patrolRobotMapSprite,
    directions: Object.freeze(Object.fromEntries(MAP_HEADING_DIRECTIONS.map(direction => [
      direction.key,
      Object.freeze({
        ...patrolRobotMapSprite,
        direction: direction.key,
        headingDeg: direction.headingDeg
      })
    ])))
  }),
  bin: Object.freeze({
    default: Object.freeze({
      src: smartBinMapVisual.src,
      status: smartBinMapVisual.status,
      source: smartBinMapVisual.source,
      view: 'left_front_35_45',
      transparent: true,
      groundAnchor: Object.freeze([0.5, 0.96])
    })
  }),
  center: Object.freeze({
    default: Object.freeze({
      src: '/static/digital-twin-replay/sprites/center-ops-v1.png',
      status: 'formal',
      source: 'E:/大学日志/2024.07/集训/网挑/答辩.pptx#ppt/media/image8.png',
      view: 'left_front_35_45',
      transparent: true,
      groundAnchor: Object.freeze([0.5, 0.94])
    })
  }),
  station: Object.freeze({
    unload: Object.freeze({
      src: '/static/digital-twin-replay/sprites/station-unload-v1.png',
      status: 'temporary',
      source: 'front-head/src/static/sorting-center/facility-intake.png',
      view: 'left_front_35_45',
      transparent: true
    }),
    wash: Object.freeze({
      src: '/static/digital-twin-replay/sprites/station-wash-v1.png',
      status: 'temporary',
      source: 'front-head/src/static/sorting-center/facility-washing.png',
      view: 'left_front_35_45',
      transparent: true
    }),
    charge: Object.freeze({
      src: '/static/digital-twin-replay/sprites/station-charge-inspection-v1.png',
      status: 'temporary_inspection_reference',
      source: 'front-head/src/static/sorting-center/facility-inspection.png',
      view: 'left_front_35_45',
      transparent: true
    }),
    default: Object.freeze({ src: '', status: 'missing', source: '' })
  })
})

export const CENTER_WORKFLOW_SPRITES = Object.freeze({
  arrival: Object.freeze({ src: '/static/sorting-center/facility-digital-twin.png', status: 'temporary', source: 'front-head/src/static/sorting-center/facility-digital-twin.png' }),
  waiting: Object.freeze({ src: '/static/sorting-center/facility-digital-twin.png', status: 'temporary', source: 'front-head/src/static/sorting-center/facility-digital-twin.png' }),
  unloading: Object.freeze({ src: '/static/sorting-center/facility-intake.png', status: 'temporary', source: 'front-head/src/static/sorting-center/facility-intake.png' }),
  cleaning: Object.freeze({ src: '/static/sorting-center/facility-washing.png', status: 'temporary', source: 'front-head/src/static/sorting-center/facility-washing.png' }),
  charging: Object.freeze({ src: '/static/sorting-center/facility-inspection.png', status: 'temporary_inspection_reference', source: 'front-head/src/static/sorting-center/facility-inspection.png' }),
  status_check: Object.freeze({ src: '/static/sorting-center/facility-inspection.png', status: 'temporary', source: 'front-head/src/static/sorting-center/facility-inspection.png' }),
  standby: Object.freeze({ src: '/static/sorting-center/facility-digital-twin.png', status: 'temporary', source: 'front-head/src/static/sorting-center/facility-digital-twin.png' })
})

export function resolveMapSprite(kind, variant = 'default', direction = '') {
  const group = MAP_SPRITE_REGISTRY[kind] || {}
  if (kind === 'robot' && direction && group.directions?.[direction]) return group.directions[direction]
  return group[variant] || group.default || { src: '', status: 'missing', source: '' }
}

export function resolveMapHeadingDirection(headingDeg = 0) {
  const normalized = ((Number(headingDeg) || 0) % 360 + 360) % 360
  const index = Math.round(normalized / 45) % MAP_HEADING_DIRECTIONS.length
  return MAP_HEADING_DIRECTIONS[index]
}

export function resolveCenterWorkflowSprite(stage = 'waiting') {
  return CENTER_WORKFLOW_SPRITES[stage] || CENTER_WORKFLOW_SPRITES.waiting
}
