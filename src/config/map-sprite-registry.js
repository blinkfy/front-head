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

// 地图垃圾物体沿用机器人/桶内流程已使用的正式透明渲染图；
// 不从类别颜色反推物体，优先依据回放/实时事件传入的 garbageId。
export const MAP_WASTE_SPRITES = Object.freeze({
  banana: Object.freeze({
    key: 'banana', aliases: Object.freeze(['banana', 'banana_peel', 'low-poly_banana', 'garbage_banana_01']), label: '香蕉皮', category: 'kitchen', categoryLabel: '厨余垃圾', targetSlot: 'kitchen',
    src: '/static/sorting-robot/objects/banana.png', sourceModel: 'digital-twin-park-v1/assets/02_waste/glb/low-poly_banana.glb', sourceUsd: 'digital-twin-park-v1/assets/02_waste/usd/low-poly_banana.usd',
    status: 'formal', view: 'model_render_left_front', transparent: true, size: Object.freeze([32, 22]), rotation: -12, groundShadowScale: 1.05
  }),
  cardboard_box: Object.freeze({
    key: 'cardboard_box', aliases: Object.freeze(['cardboard', 'cardboard_box', 'paper', 'garbage_cardboard_01']), label: '纸箱', category: 'recyclable', categoryLabel: '可回收物', targetSlot: 'recyclable',
    src: '/static/sorting-robot/objects/cardboard_box.png', sourceModel: 'digital-twin-park-v1/assets/02_waste/glb/cardboard_box.glb', sourceUsd: 'digital-twin-park-v1/assets/02_waste/usd/cardboard_box.usd',
    status: 'formal', view: 'model_render_left_front', transparent: true, size: Object.freeze([29, 25]), rotation: 6, groundShadowScale: 1
  }),
  battery: Object.freeze({
    key: 'battery', aliases: Object.freeze(['battery', 'battery_low_poly', 'garbage_battery_01']), label: '废电池', category: 'hazardous', categoryLabel: '有害垃圾', targetSlot: 'hazardous',
    src: '/static/sorting-robot/objects/battery.png', sourceModel: 'digital-twin-park-v1/assets/02_waste/glb/battery_low_poly.glb', sourceUsd: 'digital-twin-park-v1/assets/02_waste/usd/battery_low_poly.usd',
    status: 'formal', view: 'model_render_left_front', transparent: true, size: Object.freeze([28, 18]), rotation: -18, groundShadowScale: .74
  }),
  papercup: Object.freeze({
    key: 'papercup', aliases: Object.freeze(['papercup', 'paper_cup', 'simple-paper-cup', 'garbage_paper_cup_01']), label: '纸杯', category: 'other', categoryLabel: '其他垃圾', targetSlot: 'other',
    src: '/static/sorting-robot/objects/papercup.png', sourceModel: 'digital-twin-park-v1/assets/02_waste/glb/simple-paper-cup.glb', sourceUsd: 'digital-twin-park-v1/assets/02_waste/usd/simple-paper-cup.usd',
    status: 'formal', view: 'model_render_left_front', transparent: true, size: Object.freeze([21, 27]), rotation: -8, groundShadowScale: .82
  })
})

const MAP_WASTE_CATEGORY_FALLBACK = Object.freeze({ kitchen: 'banana', recyclable: 'cardboard_box', hazardous: 'battery', other: 'papercup' })

function wasteIdentityValues(value = {}) {
  if (typeof value === 'string') return [value]
  return [value.garbageType, value.templateGarbageId, value.garbageId, value.type, value.id, value.category, value.garbageCategory].filter(Boolean)
}

export function resolveMapWasteSprite(value = {}) {
  const identities = wasteIdentityValues(value).map(item => String(item).toLowerCase())
  const matched = Object.values(MAP_WASTE_SPRITES)
    .map(sprite => ({ sprite, score: Math.max(0, ...identities.flatMap(identity => sprite.aliases.filter(alias => identity.includes(alias)).map(alias => alias.length)))}))
    .sort((left, right) => right.score - left.score)[0]
  if (matched?.score) return matched.sprite
  const category = String(value?.garbageCategory || value?.category || '').toLowerCase()
  return MAP_WASTE_SPRITES[MAP_WASTE_CATEGORY_FALLBACK[category]] || MAP_WASTE_SPRITES.papercup
}

export function mapWasteDisplayName(value = {}) {
  const sprite = resolveMapWasteSprite(value)
  return `${sprite.label}（${sprite.categoryLabel}）`
}

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
