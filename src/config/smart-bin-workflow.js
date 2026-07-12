export const SMART_BIN_WORKFLOW_CONFIG = Object.freeze({
  schemaVersion: 1,
  logicalSize: Object.freeze({ width: 900, height: 520 }),
  sourceBasis: Object.freeze([
    'digital-twin-park-v1/assets/06_evidence/hardware/smart_bin_internal_process.mp4',
    'E:/大学日志/2024.07/集训/工创/垃圾分类学长材料/机械/工训垃圾分类/智能分类垃圾箱.SLDASM',
    'digital-twin-park-v1/assets/03_smart-bin/candidates/v1-multiview/cad-extracted/smart-bin-interior-front-cad-v1.png',
    'digital-twin-park-v1/assets/03_smart-bin/爆炸视图.jpg',
    'digital-twin-park-v1/assets/06_evidence/cad/smart_bin_cad_promo.mp4'
  ]),
  visuals: Object.freeze({
    structure: '/static/digital-twin-replay/smart-bin-workflow/smart-bin-internal-frame-front-v1.png',
    carriage: '/static/digital-twin-replay/smart-bin-workflow/gantry-carriage-v1.svg',
    leftJaw: '/static/digital-twin-replay/smart-bin-workflow/gripper-left-jaw-v1.svg',
    rightJaw: '/static/digital-twin-replay/smart-bin-workflow/gripper-right-jaw-v1.svg',
    hopper: '/static/digital-twin-replay/smart-bin-workflow/receiving-hopper-v1.svg',
    foreground: '/static/digital-twin-replay/smart-bin-workflow/foreground-frame-v1.svg'
  }),
  phases: Object.freeze([
    Object.freeze({ key: 'intake', label: '进入投入口', durationMs: 720 }),
    Object.freeze({ key: 'detect', label: '识别确认', durationMs: 620 }),
    Object.freeze({ key: 'receive', label: '夹取接收', durationMs: 900 }),
    Object.freeze({ key: 'transfer', label: '滑台转运', durationMs: 1050 }),
    Object.freeze({ key: 'align', label: '导向对准', durationMs: 720 }),
    Object.freeze({ key: 'drop', label: '下落入仓', durationMs: 900 }),
    Object.freeze({ key: 'fill_update', label: '仓位更新', durationMs: 650 }),
    Object.freeze({ key: 'reset', label: '机构复位', durationMs: 850 })
  ]),
  mechanisms: Object.freeze({
    inlet: Object.freeze({ center: Object.freeze({ x: 450, y: 89 }), opening: Object.freeze({ x: 402, y: 82, width: 96, height: 24 }) }),
    receive: Object.freeze({ point: Object.freeze({ x: 450, y: 226 }), detectRadius: 34 }),
    gantry: Object.freeze({
      home: Object.freeze({ x: 450, y: 126 }),
      receive: Object.freeze({ x: 450, y: 146 }),
      liftY: 126,
      range: Object.freeze({ minX: 314, maxX: 586, minY: 120, maxY: 150 }),
      carriageSize: Object.freeze({ width: 126, height: 82 }),
      jawPivotY: 178,
      jawOpenDeg: 18,
      jawClosedDeg: 3
    }),
    hopper: Object.freeze({
      center: Object.freeze({ x: 450, y: 274 }),
      size: Object.freeze({ width: 282, height: 145 }),
      resetAngleDeg: 0,
      slotAngles: Object.freeze({ recyclable: -18, kitchen: -7, hazardous: 7, other: 18 })
    })
  }),
  slots: Object.freeze([
    Object.freeze({ key: 'recyclable', label: '可回收物', short: '可', color: '#2f80ed', centerX: 170, transferX: 330, entry: Object.freeze({ x: 170, y: 347 }) }),
    Object.freeze({ key: 'kitchen', label: '厨余垃圾', short: '厨', color: '#18a56b', centerX: 355, transferX: 410, entry: Object.freeze({ x: 355, y: 347 }) }),
    Object.freeze({ key: 'hazardous', label: '有害垃圾', short: '危', color: '#e34d59', centerX: 545, transferX: 490, entry: Object.freeze({ x: 545, y: 347 }) }),
    Object.freeze({ key: 'other', label: '其他垃圾', short: '其', color: '#7b8794', centerX: 730, transferX: 570, entry: Object.freeze({ x: 730, y: 347 }) })
  ]),
  paths: Object.freeze({
    intake: Object.freeze([
      Object.freeze({ x: 450, y: 38 }),
      Object.freeze({ x: 450, y: 106 }),
      Object.freeze({ x: 450, y: 226 })
    ]),
    drop: Object.freeze({
      recyclable: Object.freeze([Object.freeze({ x: 330, y: 205 }), Object.freeze({ x: 404, y: 269 }), Object.freeze({ x: 310, y: 310 }), Object.freeze({ x: 170, y: 425 })]),
      kitchen: Object.freeze([Object.freeze({ x: 410, y: 205 }), Object.freeze({ x: 432, y: 269 }), Object.freeze({ x: 395, y: 310 }), Object.freeze({ x: 355, y: 425 })]),
      hazardous: Object.freeze([Object.freeze({ x: 490, y: 205 }), Object.freeze({ x: 468, y: 269 }), Object.freeze({ x: 505, y: 310 }), Object.freeze({ x: 545, y: 425 })]),
      other: Object.freeze([Object.freeze({ x: 570, y: 205 }), Object.freeze({ x: 496, y: 269 }), Object.freeze({ x: 590, y: 310 }), Object.freeze({ x: 730, y: 425 })])
    })
  }),
  masks: Object.freeze({
    inletFront: Object.freeze({ x: 392, y: 67, width: 116, height: 30 }),
    hopperInterior: Object.freeze({ x: 342, y: 235, width: 216, height: 75 }),
    binFront: Object.freeze({ topY: 347, bottomY: 469, lipHeight: 17 })
  }),
  wasteVisuals: Object.freeze({
    banana: Object.freeze({ scaleMultiplier: 0.92, rotationOffset: 8 }),
    cardboard_box: Object.freeze({ scaleMultiplier: 0.82, rotationOffset: -6 }),
    battery: Object.freeze({ scaleMultiplier: 0.78, rotationOffset: 16 }),
    papercup: Object.freeze({ scaleMultiplier: 0.88, rotationOffset: 4 })
  })
})

export const SMART_BIN_PHASES = SMART_BIN_WORKFLOW_CONFIG.phases
export const SMART_BIN_TOTAL_DURATION = SMART_BIN_PHASES.reduce((sum, phase) => sum + phase.durationMs, 0)
