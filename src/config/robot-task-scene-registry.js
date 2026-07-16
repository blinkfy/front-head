const PARK_BACKGROUND = Object.freeze({
  src: '/static/digital-twin-replay/park-overview-user-layout-v1.png',
  source: 'digital-twin-park-v1/assets/04_map/park-background/park-overview-user-layout-v1.png',
  view: 'orthographic_2_5d',
  lighting: 'top_left_to_bottom_right',
  status: 'formal_reuse'
})

const freeze = value => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(freeze)
  return Object.freeze(value)
}

export const ROBOT_TASK_SCENE_SIZE = Object.freeze({ width: 1672, height: 941 })

export function fitRobotTaskSceneSize(containerWidth, containerHeight) {
  const width = Math.max(0, Number(containerWidth) || 0)
  const height = Math.max(0, Number(containerHeight) || 0)
  if (!width || !height) return { width: 0, height: 0 }
  const sceneRatio = ROBOT_TASK_SCENE_SIZE.width / ROBOT_TASK_SCENE_SIZE.height
  const fittedWidth = width / height > sceneRatio ? height * sceneRatio : width
  return { width: fittedWidth, height: fittedWidth / sceneRatio }
}

export const ROBOT_TASK_SCENE_REGISTRY = freeze({
  walkway_rest: {
    key: 'walkway_rest',
    label: '公园步道',
    purpose: 'rest_area_and_walkway_pickup',
    backgroundEnvironment: PARK_BACKGROUND,
    crop: { x: 410, y: 240, width: 720, height: 405 },
    detailEnvironment: {
      src: '/static/digital-twin-replay/robot-task-scenes/walkway-rest-detail-v1.png',
      source: 'AI super-resolution edit of the registered official park crop',
      reference: PARK_BACKGROUND.source,
      view: 'exact_crop_detail_overlay',
      method: 'conservative_super_resolution_with_original_geometry_reference',
      status: 'reviewed_detail_overlay',
      // Preserve the close-up asset, then finish its fade before handing the
      // responsive overview back to the map renderer.
      // The detail crop replaces the matching map pixels at close range. It
      // must become fully opaque; a permanent partial alpha exposes both the
      // global map and this crop, producing doubled shrubs and visitor ghosts.
      blend: {
        startScale: 1.65,
        endScale: 2.85,
        maxOpacity: 1,
        returnFade: { start: 0.38, end: 0.54 }
      }
    },
    ground: {
      material: 'park_stone_walkway_and_grass_edge',
      horizonShade: 'rgba(3, 18, 25, 0.06)',
      contactTone: 'rgba(2, 19, 24, 0.18)'
    },
    // This task area is an open walking surface. The old elliptical masks were
    // repainted after the actors and therefore cut through robots and bins.
    foregroundOcclusion: [],
    serviceBerth: null,
    review: {
      source: PARK_BACKGROUND.source,
      use: 'SCAN_APPROACH_GRASP_and_TRANSPORT_departure',
      view: 'official_park_crop_central_walkway_close',
      status: 'formal_reuse_with_reviewed_detail_overlay'
    }
  },
  food_service: {
    key: 'food_service',
    label: '餐饮服务区',
    purpose: 'smart_bin_service_berth_and_delivery',
    backgroundEnvironment: PARK_BACKGROUND,
    crop: { x: 870, y: 220, width: 720, height: 405 },
    detailEnvironment: {
      src: '/static/digital-twin-replay/robot-task-scenes/food-service-detail-v1.png',
      source: 'AI super-resolution edit of the registered official park crop',
      reference: PARK_BACKGROUND.source,
      view: 'exact_crop_detail_overlay',
      method: 'conservative_super_resolution_with_original_geometry_reference',
      status: 'reviewed_detail_overlay',
      // Use the registered close-up as an opaque replacement once the local
      // camera reaches it; blending two independently rendered backgrounds
      // leaves foliage and global actors visible as semi-transparent ghosts.
      blend: {
        startScale: 1.65,
        endScale: 2.85,
        maxOpacity: 1,
        returnFade: { start: 0.38, end: 0.54 }
      }
    },
    ground: {
      material: 'dining_deck_edge_and_service_paving',
      horizonShade: 'rgba(3, 18, 25, 0.08)',
      contactTone: 'rgba(2, 19, 24, 0.20)'
    },
    // The service deck is an open work surface. Do not repaint any elliptical
    // background masks above the robot or smart bin in this local scene.
    foregroundOcclusion: [],
    // The formal deck already defines the service position. A second rounded
    // berth outline becomes a large oval-like arc under close camera scales.
    serviceBerth: null,
    review: {
      source: PARK_BACKGROUND.source,
      use: 'TRANSPORT_arrival_PLACE_RETURN',
      view: 'official_park_crop_food_service_deck_close',
      status: 'formal_reuse_with_reviewed_detail_overlay'
    }
  }
})

export function resolveRobotTaskScene(sceneKey = 'walkway_rest') {
  return ROBOT_TASK_SCENE_REGISTRY[sceneKey] || ROBOT_TASK_SCENE_REGISTRY.walkway_rest
}

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0))
const smoothstep = value => {
  const progress = clamp01(value)
  return progress * progress * (3 - 2 * progress)
}

export function robotTaskSceneDetailOpacity(sceneKey, stage, progress, cameraScale) {
  const scene = resolveRobotTaskScene(sceneKey)
  const blend = scene.detailEnvironment?.blend
  if (!blend) return 0

  const scaleRange = Math.max(.001, Number(blend.endScale) - Number(blend.startScale))
  const scaleProgress = smoothstep((Number(cameraScale) - Number(blend.startScale)) / scaleRange)
  let opacity = scaleProgress * clamp01(blend.maxOpacity)

  if (stage === 'return' && blend.returnFade) {
    const start = clamp01(blend.returnFade.start)
    const end = Math.max(start + .001, clamp01(blend.returnFade.end))
    opacity *= 1 - smoothstep((clamp01(progress) - start) / (end - start))
  }
  return clamp01(opacity)
}

export function robotTaskSceneDetailVisuals(shot, stage, progress, cameraScale) {
  if (!shot) return []
  const transition = shot.sceneTransition
  let sceneLayers = [{ sceneKey: shot.scene, alpha: 1 }]
  if (transition) {
    const range = Math.max(.001, Number(transition.end) - Number(transition.start))
    const blend = smoothstep((clamp01(progress) - Number(transition.start)) / range)
    sceneLayers = [
      { sceneKey: transition.from, alpha: 1 - blend },
      { sceneKey: transition.to, alpha: blend }
    ]
  }

  return sceneLayers.map(layer => {
    const scene = resolveRobotTaskScene(layer.sceneKey)
    return {
      sceneKey: scene.key,
      src: scene.detailEnvironment?.src || '',
      crop: { ...scene.crop },
      opacity: clamp01(layer.alpha) * robotTaskSceneDetailOpacity(
        scene.key,
        stage,
        progress,
        cameraScale
      )
    }
  }).filter(detail => detail.src && detail.opacity > 0)
}

export function robotTaskSceneAssets() {
  return [...new Set(Object.values(ROBOT_TASK_SCENE_REGISTRY).flatMap(scene => [
    scene.backgroundEnvironment.src,
    scene.detailEnvironment?.src
  ]).filter(Boolean))]
}

export default ROBOT_TASK_SCENE_REGISTRY
