// Hysteresis avoids changing quality after isolated slow frames. Only sample
// consecutive active animation frames; idle/background gaps are ignored.
export function createRelationFrameBudget(desktop = false) {
  let level = desktop ? 3 : 1, slow = 0, fast = 0, previous = null
  return {
    resetClock() { previous = null; slow = 0; fast = 0 },
    observe(time, targetFps = 60) {
      if (!Number.isFinite(time)) return level
      if (previous !== null) {
        const elapsed = time - previous
        if (elapsed > 0 && elapsed < 200) {
          const slowThreshold = targetFps <= 30 ? 38 : 26
          const fastThreshold = targetFps <= 30 ? 30 : 19
          if (elapsed > slowThreshold) { slow++; fast = 0 }
          else if (elapsed < fastThreshold) { fast++; slow = 0 }
          else { slow = 0; fast = 0 }
          if (slow >= 5 && level > 0) { level--; slow = 0 }
          if (fast >= 40 && level < 3) { level++; fast = 0 }
        } else { slow = 0; fast = 0 }
      }
      previous = time
      return level
    },
    get level() { return level },
    get iterations() { return [55, 70, 85, 100][level] },
    get windows() { return level + 1 },
    get milliseconds() { return [3, 4, 6, 8][level] },
    get repulsionPeriod() { return [3, 2, 1, 1][level] },
    get routeInterval() { return [280, 220, 170, 140][level] }
  }
}
