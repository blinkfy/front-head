let warming = null

export function warmSmartSortRobot() {
  // #ifdef H5
  // Load bytes and runtime during entry/login, without creating a GPU context.
  if (!warming) {
    warming = import('../components/smart-sort-robot-engine.mjs').then(runtime =>
      runtime.preloadSmartSortRobot(`${import.meta.env.BASE_URL || '/'}static/web/robot_3d/smart_sort_robot_v34_animated.glb`)
    ).catch(() => { warming = null })
  }
  return warming
  // #endif
}
