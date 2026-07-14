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
      // Start the reviewed detail layer before the close-up reaches its final
      // scale, so it is already established when the transport scene changes.
      blend: { startScale: 1.65, endScale: 2.85, maxOpacity: 0.72 }
    },
    ground: {
      material: 'park_stone_walkway_and_grass_edge',
      horizonShade: 'rgba(3, 18, 25, 0.06)',
      contactTone: 'rgba(2, 19, 24, 0.18)'
    },
    foregroundOcclusion: [
      { x: 435, y: 611, radiusX: 77, radiusY: 47, feather: 20 },
      { x: 1101, y: 555, radiusX: 54, radiusY: 72, feather: 20 }
    ],
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
      // Keep the formal background underneath and introduce this local detail
      // early; the detail is an overlay, never a replacement background.
      blend: { startScale: 1.65, endScale: 2.85, maxOpacity: 0.68 }
    },
    ground: {
      material: 'dining_deck_edge_and_service_paving',
      horizonShade: 'rgba(3, 18, 25, 0.08)',
      contactTone: 'rgba(2, 19, 24, 0.20)'
    },
    foregroundOcclusion: [
      { x: 1239, y: 614, radiusX: 185, radiusY: 32, feather: 22 },
      { x: 1572, y: 513, radiusX: 56, radiusY: 97, feather: 22 }
    ],
    serviceBerth: {
      x: 1212,
      y: 562,
      width: 113,
      height: 53,
      stroke: 'rgba(137, 205, 214, 0.32)',
      fill: 'rgba(39, 104, 108, 0.06)'
    },
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

export function robotTaskSceneAssets() {
  return [...new Set(Object.values(ROBOT_TASK_SCENE_REGISTRY).flatMap(scene => [
    scene.backgroundEnvironment.src,
    scene.detailEnvironment?.src
  ]).filter(Boolean))]
}

export default ROBOT_TASK_SCENE_REGISTRY
