// Both eyes must contribute. A clearer eye may compensate for a partly
// obscured lens, but a wink/one-sided reflection is capped below blink entry.
export function identityBlinkScore(left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return NaN
  const lo = Math.max(0, Math.min(1, Math.min(left, right)))
  const hi = Math.max(0, Math.min(1, Math.max(left, right)))
  return Math.min((lo + hi) / 2, lo + .30)
}

// Calibrate each eye independently so a lens-related open-eye offset cannot
// substitute for movement in the weaker eye. No backend work is involved.
export function createIdentityBlinkTracker() {
  let samples = [], baseline = null
  return {
    reset() { samples = []; baseline = null },
    update(left, right) {
      if (!Number.isFinite(left) || !Number.isFinite(right)) return NaN
      if (!baseline) {
        if (left < 0 || right < 0 || left > .35 || right > .35) { samples = []; return .35 }
        samples.push([left, right])
        if (samples.length >= 3) baseline = [0, 1].map(i => samples.reduce((sum, row) => sum + row[i], 0) / samples.length)
        return 0
      }
      return identityBlinkScore(Math.max(0, left - baseline[0]), Math.max(0, right - baseline[1]))
    }
  }
}
