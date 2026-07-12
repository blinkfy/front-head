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
    src: '/static/digital-twin-replay/sprites/smart-bin-interior-cad-v1.png',
    source: 'digital-twin-park-v1/assets/03_smart-bin/bin_cad.png',
    referenceSources: Object.freeze([
      'digital-twin-park-v1/assets/03_smart-bin/爆炸视图.jpg',
      'digital-twin-park-v1/assets/06_evidence/hardware/smart_bin_internal_process.mp4',
      'E:/大学日志/2024.07/集训/工创/垃圾分类学长材料/机械/工训垃圾分类/智能分类垃圾箱.SLDASM'
    ]),
    method: 'existing_cad_render_with_logic_path_and_slot_overlays',
    status: 'temporary_cad_reference',
    cadReplacementRequired: true,
    view: 'front_internal_reference',
    geometry: Object.freeze({ inletX: 0.5, inletY: 0.12, receiveX: 0.5, receiveY: 0.31 })
  })
})

export function resolveSmartBinVisual(use = 'map') {
  return SMART_BIN_VISUAL_REGISTRY[use] || SMART_BIN_VISUAL_REGISTRY.map
}
