const EXTERIOR_45 = Object.freeze({
  src: '/static/digital-twin-replay/sprites/smart-bin-v2.png',
  source: 'digital-twin-park-v1/assets/03_smart-bin/bin2.png',
  referenceSources: Object.freeze([
    'digital-twin-park-v1/assets/06_evidence/hardware/smart_bin_real_photo.jpg',
    'E:/大学日志/2024.07/集训/工创/垃圾分类学长材料/机械/工训垃圾分类/智能分类垃圾箱.SLDASM'
  ]),
  method: 'user_selected_transparent_render',
  status: 'formal',
  cadReplacementRequired: false,
  view: 'front_three_quarter',
  geometry: Object.freeze({ inletX: 0.5, inletY: 0.28, screenX: 0.73, screenY: 0.18 })
})

export const SMART_BIN_VISUAL_REGISTRY = Object.freeze({
  map: EXTERIOR_45,
  sortingPlace: EXTERIOR_45,
  interiorCutaway: Object.freeze({
    src: '/static/digital-twin-replay/smart-bin-workflow/cutaway-raster-v8/fixed-four-panels-user-corrected.png',
    fallbackSrc: '/static/digital-twin-replay/smart-bin-workflow/cutaway-raster-v8/fixed-four-panels-user-corrected.png',
    layerRegistry: 'cutaway-raster-v8-fixed-structure-separated',
    source: 'digital-twin-park-v1/assets/03_smart-bin/candidates/v12-fixed-structure-separated/',
    referenceSources: Object.freeze([
      'digital-twin-park-v1/assets/03_smart-bin/爆炸视图.jpg',
      'digital-twin-park-v1/assets/06_evidence/hardware/smart_bin_internal_process.mp4',
      'E:/大学日志/2024.07/集训/工创/垃圾分类学长材料/机械/工训垃圾分类/智能分类垃圾箱.SLDASM'
    ]),
    method: 'approved_closed_raster_with_fixed_hinge_true_open_panel_frames_and_fixed_structure_separation',
    status: 'formal_cutaway_raster_v8_conditional_hidden_geometry',
    cadReplacementRequired: true,
    view: 'orthographic_high_isometric_square_footprint',
    geometry: Object.freeze({ inletX: 0.4875, inletY: 0.221, receiveX: 0.4817, receiveY: 0.474 })
  })
})

export function resolveSmartBinVisual(use = 'map') {
  return SMART_BIN_VISUAL_REGISTRY[use] || SMART_BIN_VISUAL_REGISTRY.map
}
