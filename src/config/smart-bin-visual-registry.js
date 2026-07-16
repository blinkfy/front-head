import { digitalTwinAssetUrl } from '@/utils/digital-twin-assets.js'

const SMART_BIN_EXTERIOR = digitalTwinAssetUrl('digital-twin-replay/sprites/smart-bin-v2.png')
const SMART_BIN_CUTAWAY = digitalTwinAssetUrl('digital-twin-replay/smart-bin-workflow/cutaway-raster-v8/fixed-four-panels-user-corrected.png')
const SMART_BIN_INTERNAL_FRAME = digitalTwinAssetUrl('digital-twin-replay/smart-bin-workflow/smart-bin-internal-frame-front-v1.png')

const EXTERIOR_45 = Object.freeze({
  src: SMART_BIN_EXTERIOR,
  source: SMART_BIN_EXTERIOR,
  referenceSources: Object.freeze([
    SMART_BIN_EXTERIOR
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
    src: SMART_BIN_CUTAWAY,
    fallbackSrc: SMART_BIN_CUTAWAY,
    layerRegistry: 'cutaway-raster-v8-fixed-structure-separated',
    source: SMART_BIN_CUTAWAY,
    referenceSources: Object.freeze([
      SMART_BIN_INTERNAL_FRAME,
      SMART_BIN_CUTAWAY
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
