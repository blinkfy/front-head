const freeze = value => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(freeze)
  return Object.freeze(value)
}

export const SMART_BIN_INTERNAL_SCENE = freeze({
  width: 1200,
  height: 620,
  view: 'cad_left_front_three_quarter',
  source: 'unified_scene_root_1200x620'
})

export const SMART_BIN_INTERNAL_DEVICE = freeze({
  nativeWidth: 591,
  nativeHeight: 702,
  x: 378,
  y: 42,
  width: 444,
  height: 528,
  scale: 528 / 702
})

export const SMART_BIN_INTERNAL_LAYER_ORDER = Object.freeze([
  'sceneBackdrop',
  'rearFrame',
  'fixedCadStructure',
  'xyRails',
  'carriageShadow',
  'movingCarriage',
  'liftAndGripper',
  'wasteObject',
  'guideHopperRear',
  'targetBins',
  'guideHopperFrontLip',
  'binFrontPanels',
  'frontFrameOcclusion',
  'stageEffectsAndHud'
])

const BASE = '/static/digital-twin-replay/smart-bin-workflow/'

export const SMART_BIN_INTERNAL_LAYER_REGISTRY = freeze({
  rearFrame: {
    src: `${BASE}rear-frame-v2.svg`,
    nativeSize: { width: 591, height: 702 },
    drawBox: { x: 0, y: 0, width: 591, height: 702 },
    opacity: 0.22,
    material: 'cold_graphite_aluminium'
  },
  fixedCadStructure: {
    src: `${BASE}smart-bin-internal-frame-front-v1.png`,
    nativeSize: { width: 591, height: 702 },
    drawBox: { x: 0, y: 0, width: 591, height: 702 },
    opacity: 0.26,
    material: 'desaturated_cad_reference'
  },
  xyRails: {
    src: `${BASE}xy-rails-v2.svg`,
    nativeSize: { width: 591, height: 702 },
    drawBox: { x: 0, y: 0, width: 591, height: 702 },
    opacity: 0.92,
    shadow: { offsetX: 3, offsetY: 4, blur: 4, opacity: 0.22 }
  },
  movingCarriage: {
    src: `${BASE}moving-carriage-v2.svg`,
    nativeSize: { width: 118, height: 84 },
    anchor: { x: 59, y: 26 },
    opacity: 1,
    shadow: { offsetX: 3, offsetY: 5, blur: 5, opacity: 0.28 }
  },
  liftColumn: {
    src: `${BASE}lift-column-v2.svg`,
    nativeSize: { width: 34, height: 104 },
    anchor: { x: 17, y: 6 },
    opacity: 1,
    shadow: { offsetX: 2, offsetY: 4, blur: 4, opacity: 0.24 }
  },
  leftJaw: {
    src: `${BASE}gripper-left-jaw-v2.svg`,
    nativeSize: { width: 38, height: 76 },
    anchor: { x: 30, y: 8 },
    opacity: 1
  },
  rightJaw: {
    src: `${BASE}gripper-right-jaw-v2.svg`,
    nativeSize: { width: 38, height: 76 },
    anchor: { x: 8, y: 8 },
    opacity: 1
  },
  guideHopperRear: {
    src: `${BASE}guide-hopper-rear-v2.svg`,
    nativeSize: { width: 396, height: 174 },
    anchor: { x: 198, y: 87 },
    opacity: 0.9,
    shadow: { offsetX: 5, offsetY: 8, blur: 8, opacity: 0.22 }
  },
  targetBins: {
    src: `${BASE}target-bins-v2.svg`,
    nativeSize: { width: 591, height: 702 },
    drawBox: { x: 0, y: 0, width: 591, height: 702 },
    opacity: 0.82
  },
  guideHopperFrontLip: {
    src: `${BASE}guide-hopper-front-lip-v2.svg`,
    nativeSize: { width: 396, height: 174 },
    anchor: { x: 198, y: 87 },
    opacity: 0.98
  },
  binFrontPanels: {
    src: `${BASE}bin-front-panels-v2.svg`,
    nativeSize: { width: 591, height: 702 },
    drawBox: { x: 0, y: 0, width: 591, height: 702 },
    opacity: 0.92
  },
  frontFrameOcclusion: {
    src: `${BASE}front-frame-occlusion-v2.svg`,
    nativeSize: { width: 591, height: 702 },
    drawBox: { x: 0, y: 0, width: 591, height: 702 },
    opacity: 0.96
  }
})

export const SMART_BIN_INTERNAL_GEOMETRY = freeze({
  inlet: {
    center: { x: 295, y: 56 },
    opening: [[258, 45], [333, 49], [335, 67], [255, 63]],
    frontOcclusion: [[246, 61], [342, 67], [337, 84], [251, 78]]
  },
  receive: { point: { x: 294, y: 235 }, detectBox: { width: 66, height: 54 } },
  gantry: {
    home: { x: 294, y: 151 },
    receiveY: 178,
    liftY: 151,
    jawAnchorOffsetY: 84,
    jawOpenDeg: 19,
    jawClosedDeg: 4,
    transferX: { recyclable: 183, kitchen: 252, hazardous: 337, other: 408 }
  },
  hopper: {
    center: { x: 294, y: 337 },
    resetAngleDeg: 0,
    slotAngles: { recyclable: -17, kitchen: -7, hazardous: 7, other: 17 }
  },
  bins: {
    rearTopY: 456,
    fillBottomY: 654,
    fillMaxHeight: 138,
    slots: {
      recyclable: { centerX: 135, entry: { x: 135, y: 500 }, clip: [[65, 474], [190, 459], [205, 657], [62, 681]] },
      kitchen: { centerX: 244, entry: { x: 244, y: 500 }, clip: [[180, 462], [282, 454], [292, 652], [198, 657]] },
      hazardous: { centerX: 350, entry: { x: 350, y: 500 }, clip: [[290, 454], [403, 461], [395, 661], [294, 652]] },
      other: { centerX: 462, entry: { x: 462, y: 500 }, clip: [[405, 462], [535, 480], [535, 681], [394, 661]] }
    }
  },
  occlusion: {
    crossBeam: [[28, 238], [551, 260], [548, 282], [25, 258]],
    hopperFrontLip: [[103, 337], [486, 337], [402, 405], [188, 405]],
    binMouthTopY: 482,
    binFrontTopY: 524
  }
})

export function smartBinInternalAssetSources(structureOverride = '') {
  return Object.entries(SMART_BIN_INTERNAL_LAYER_REGISTRY).reduce((result, [key, value]) => {
    result[key] = key === 'fixedCadStructure' && structureOverride ? structureOverride : value.src
    return result
  }, {})
}

export const SMART_BIN_INTERNAL_LEGACY_VISUALS = freeze({
  structure: '/static/digital-twin-replay/smart-bin-workflow/smart-bin-internal-frame-front-v1.png',
  carriage: '/static/digital-twin-replay/smart-bin-workflow/gantry-carriage-v1.svg',
  leftJaw: '/static/digital-twin-replay/smart-bin-workflow/gripper-left-jaw-v1.svg',
  rightJaw: '/static/digital-twin-replay/smart-bin-workflow/gripper-right-jaw-v1.svg',
  hopper: '/static/digital-twin-replay/smart-bin-workflow/receiving-hopper-v1.svg',
  foreground: '/static/digital-twin-replay/smart-bin-workflow/foreground-frame-v1.svg'
})

const RASTER_V3_BASE = '/static/digital-twin-replay/smart-bin-workflow/cutaway-raster-v3/'

export const SMART_BIN_CUTAWAY_RASTER_V3 = freeze({
  version: 'cutaway-raster-v3',
  sourceSize: { width: 1254, height: 1254 },
  sceneRoot: { width: 1200, height: 620 },
  motherDrawBox: { x: 308, y: 18, width: 584, height: 584 },
  sourceToSceneScale: 584 / 1254,
  panelOcclusion: {
    enabled: true,
    status: 'passed_downward_fold_mother',
    requiredKinematics: 'four_panels_fold_down_around_outer_hinges',
    rejectedCandidateRegistered: false
  },
  layers: {
    fixedMother: {
      src: `${RASTER_V3_BASE}fixed-cutaway-back-v3.png`,
      sourceSize: { width: 1254, height: 1254 },
      sourceBbox: [0, 0, 1254, 1254],
      order: 10
    },
    assembledPoster: {
      src: `${RASTER_V3_BASE}assembled-poster-v3.png`,
      sourceSize: { width: 1254, height: 1254 },
      sourceBbox: [0, 0, 1254, 1254],
      order: 10
    },
    panelsOpenMother: {
      src: `${RASTER_V3_BASE}fixed-cutaway-panels-down-v3.png`,
      sourceSize: { width: 1254, height: 1254 },
      sourceBbox: [0, 0, 1254, 1254],
      order: 11,
      reviewStatus: 'passed_downward_fold_kinematics'
    },
    carriageLift: {
      src: `${RASTER_V3_BASE}carriage-lift-v3.png`,
      sourceSize: { width: 155, height: 111 },
      sourceBbox: [535, 373, 690, 484],
      order: 30
    },
    leftJaw: {
      src: `${RASTER_V3_BASE}gripper-jaw-left-v3.png`,
      sourceSize: { width: 47, height: 116 },
      sourceBbox: [532, 471, 579, 587],
      closeDeltaX: 8,
      order: 40
    },
    rightJaw: {
      src: `${RASTER_V3_BASE}gripper-jaw-right-v3.png`,
      sourceSize: { width: 57, height: 123 },
      sourceBbox: [567, 466, 624, 589],
      closeDeltaX: -8,
      order: 40
    }
  },
  mechanism: {
    home: { x: 593, y: 192 },
    gripAnchor: { x: 578, y: 291 },
    inlet: { x: 585, y: 137 },
    receive: { x: 578, y: 294 },
    transferX: { recyclable: 540, kitchen: 632, hazardous: 558, other: 704 },
    liftScale: 1.05
  },
  slots: {
    recyclable: { label: '可回收物', color: '#4f8fca', position: 'front_left', center: { x: 518, y: 388 }, hideY: 405, radius: { x: 54, y: 20 } },
    kitchen: { label: '厨余垃圾', color: '#5c9c7d', position: 'front_right', center: { x: 632, y: 412 }, hideY: 429, radius: { x: 55, y: 20 } },
    hazardous: { label: '有害垃圾', color: '#bd6870', position: 'rear_left', center: { x: 550, y: 350 }, hideY: 367, radius: { x: 47, y: 17 } },
    other: { label: '其他垃圾', color: '#b89a55', position: 'rear_right', center: { x: 725, y: 356 }, hideY: 373, radius: { x: 48, y: 17 } }
  },
  drawOrder: ['fixedMother', 'targetEffect', 'carriageLift', 'leftJaw', 'rightJaw', 'wasteObject', 'stageEffects', 'pendingRealMotherOcclusion']
})

export function smartBinCutawayRasterV3Sources() {
  return Object.entries(SMART_BIN_CUTAWAY_RASTER_V3.layers).reduce((result, [key, layer]) => {
    result[key] = layer.src
    return result
  }, {})
}
