const EXTERIOR_45 = Object.freeze({
  src: '/static/digital-twin-replay/sprites/smart-bin-v1.png',
  source: 'digital-twin-park-v1/assets/03_smart-bin/bin.png',
  referenceSources: Object.freeze([
    'digital-twin-park-v1/assets/06_evidence/hardware/smart_bin_real_photo.jpg',
    'E:/大学日志/2024.07/集训/工创/垃圾分类学长材料/机械/工训垃圾分类/智能分类垃圾箱.SLDASM'
  ]),
  method: 'existing_transparent_render_verified_against_real_device_and_cad',
  status: 'formal',
  cadReplacementRequired: false,
  view: 'left_front_45',
  geometry: Object.freeze({ inletX: 0.5, inletY: 0.14, screenX: 0.65, screenY: 0.075 })
})

export const SMART_BIN_VISUAL_REGISTRY = Object.freeze({
  map: EXTERIOR_45,
  sortingPlace: EXTERIOR_45,
  interiorCutaway: Object.freeze({
    src: '/static/digital-twin-replay/smart-bin-workflow/cutaway-raster-v3/fixed-cutaway-back-v3.png',
    fallbackSrc: '/static/digital-twin-replay/smart-bin-workflow/cutaway-raster-v3/assembled-poster-v3.png',
    layerRegistry: 'cutaway-raster-v3',
    source: 'digital-twin-park-v1/assets/03_smart-bin/candidates/v5-internal-cutaway-square-four-visible-ai/',
    referenceSources: Object.freeze([
      'digital-twin-park-v1/assets/03_smart-bin/爆炸视图.jpg',
      'digital-twin-park-v1/assets/06_evidence/hardware/smart_bin_internal_process.mp4',
      'E:/大学日志/2024.07/集训/工创/垃圾分类学长材料/机械/工训垃圾分类/智能分类垃圾箱.SLDASM'
    ]),
    method: 'approved_square_footprint_raster_with_same_mother_pixel_extractions',
    status: 'formal_cutaway_raster_v3_conditional_hidden_geometry',
    cadReplacementRequired: true,
    view: 'orthographic_high_isometric_square_footprint',
    geometry: Object.freeze({ inletX: 0.4875, inletY: 0.221, receiveX: 0.4817, receiveY: 0.474 })
  })
})

export function resolveSmartBinVisual(use = 'map') {
  return SMART_BIN_VISUAL_REGISTRY[use] || SMART_BIN_VISUAL_REGISTRY.map
}
