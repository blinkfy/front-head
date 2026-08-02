import DIGITAL_TWIN_VISUAL_SYSTEM from '@/config/digital-twin-visual-system.js'
import { digitalTwinAssetUrl, digitalTwinWebpAssetUrl } from '@/utils/digital-twin-assets.js'

const freeze = value => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(freeze)
  return Object.freeze(value)
}

export const PARK_SCENE_ASSETS = freeze({
  formalBackground: digitalTwinWebpAssetUrl(
    'digital-twin-replay/park-overview-user-layout-v1.webp',
    'digital-twin-replay/park-overview-user-layout-v1.png'
  ),
  candidateBackground: digitalTwinWebpAssetUrl(
    'digital-twin-replay/park-overview-user-layout-v1.webp',
    'digital-twin-replay/park-overview-user-layout-v1.png'
  ),
  roadOverlay: digitalTwinAssetUrl('digital-twin-replay/park-road-overlay.svg'),
  formalStatus: 'active_user_provided',
  candidateStatus: 'disabled_superseded_archive'
})

export const PARK_SCENE_LAYER_ORDER = freeze([
  'environmentBack',
  'ground',
  'staticStructures',
  'groundDetails',
  'dynamicUnderlay',
  'dynamicEntities',
  'foregroundOcclusion',
  'atmosphere',
  'calibration'
])

export const PARK_SCENE_LAYERS = freeze({
  environmentBack: {
    zIndex: 0,
    background: '#061522',
    farFieldDarkening: 0.28
  },
  ground: {
    zIndex: 1,
    source: PARK_SCENE_ASSETS.formalBackground,
    fit: 'contain',
    nativeSize: { width: 1672, height: 941 }
  },
  staticStructures: {
    zIndex: 3,
    anchors: ['centerFacility', 'centerBays', 'centerStations', 'servicePointBases', 'parkEntrance']
  },
  groundDetails: {
    zIndex: 2,
    // 用户提供底图已经包含地面材质与接触阴影，避免重复叠加旧场景阴影。
    items: []
  },
  foregroundOcclusion: {
    zIndex: 8,
    source: PARK_SCENE_ASSETS.formalBackground
  },
  atmosphere: {
    zIndex: 4,
    keyLightDirection: DIGITAL_TWIN_VISUAL_SYSTEM.lighting.main.screenDirection,
    shadowDirection: DIGITAL_TWIN_VISUAL_SYSTEM.shadow.screenDirection,
    overlay: [
      'linear-gradient(135deg, rgba(214,240,255,.08) 0%, rgba(117,166,189,.018) 35%, rgba(0,17,29,.12) 100%)',
      'radial-gradient(ellipse at 50% 42%, rgba(55,118,134,.025), rgba(0,14,26,.18) 94%)'
    ]
  },
  calibration: {
    zIndex: 14,
    devOnly: true,
    candidateOpacity: 0.48
  }
})

export const PARK_SCENE_DEV_QUERY = freeze({
  calibration: 'parkCalibration',
  compare: 'parkCompare',
  candidate: 'parkCandidate',
  hideDynamics: 'parkHideDynamics',
  showOcclusion: 'parkOcclusion'
})

function collectDevQuery() {
  if (typeof window === 'undefined') return new URLSearchParams()
  const search = new URLSearchParams(window.location.search || '')
  const hashQuery = String(window.location.hash || '').split('?')[1] || ''
  const hashSearch = new URLSearchParams(hashQuery)
  hashSearch.forEach((value, key) => search.set(key, value))
  return search
}

export function readParkSceneDevFlags() {
  const disabled = { calibration: false, compare: false, candidate: false, hideDynamics: false, showOcclusion: true }
  if (!import.meta.env.DEV || typeof window === 'undefined') return disabled
  const query = collectDevQuery()
  const enabled = key => ['1', 'true', 'on'].includes(String(query.get(key) || '').toLowerCase())
  const explicitlyDisabled = key => ['0', 'false', 'off'].includes(String(query.get(key) || '').toLowerCase())
  return {
    calibration: enabled(PARK_SCENE_DEV_QUERY.calibration) || enabled(PARK_SCENE_DEV_QUERY.compare),
    compare: enabled(PARK_SCENE_DEV_QUERY.compare),
    candidate: enabled(PARK_SCENE_DEV_QUERY.candidate),
    hideDynamics: enabled(PARK_SCENE_DEV_QUERY.hideDynamics),
    showOcclusion: !explicitlyDisabled(PARK_SCENE_DEV_QUERY.showOcclusion)
  }
}

export default PARK_SCENE_LAYERS
