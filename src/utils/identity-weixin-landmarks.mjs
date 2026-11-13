import { identityBlinkScore } from './identity-blink.mjs'
// XRFrame's face example labels the pupil anchors 104/105, nose 45 and mouth 98:
// https://github.com/dtysky/xr-frame-demo/blob/master/miniprogram/components/xr-ar-face/index.wxml
// Select nearby contours by geometry rather than borrowing MediaPipe's point order.
// Device/API layouts which fail these anatomical checks must not complete actions.
const span = (points, axis) => Math.max(...points.map(p => p[axis])) - Math.min(...points.map(p => p[axis]))
const clamp = n => Math.max(0, Math.min(1, n))
export function createWeixinIdentityLandmarks() {
  let groups = null, calibration = [], baseline = null
  const reset = () => { groups = null; calibration = []; baseline = null }
  function measure(points, ids) {
    const selected = ids.map(i => points[i]), width = span(selected, 'x')
    return width > .01 ? span(selected, 'y') / width : NaN
  }
  return {
    reset,
    update(input, width, height) {
      if (!Array.isArray(input) || input.length !== 106 || !(width > 0 && height > 0)) { reset(); return null }
      let points = input.map(p => ({ x: Number(p.x), y: Number(p.y) }))
      if (points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) { reset(); return null }
      if (points.some(p => Math.abs(p.x) > 2 || Math.abs(p.y) > 2)) points = points.map(p => ({ x: p.x / width, y: p.y / height }))
      if (points.some(p => p.x < -.1 || p.x > 1.1 || p.y < -.1 || p.y > 1.1)) { reset(); return null }
      const eyeA = points[104], eyeB = points[105], nose = points[45], mouth = points[98]
      // Rotate the measurement space to the line between pupils; keep original points for framing.
      const angle = Math.atan(Math.tan(Math.atan2(eyeB.y - eyeA.y, (eyeB.x - eyeA.x) * width / height)))
      const roll = Math.abs(angle)
      const eyeDistance = Math.hypot((eyeB.x - eyeA.x) * width / height, eyeB.y - eyeA.y)
      if (roll > .25 || eyeDistance < .07 || eyeDistance > .65 || mouth.y <= Math.max(eyeA.y, eyeB.y) + .06 || nose.y <= Math.min(eyeA.y, eyeB.y) || nose.y >= mouth.y) { reset(); return null }
      const cos = Math.cos(angle), sin = Math.sin(angle)
      const aligned = points.map(p => ({ x: p.x * width / height * cos + p.y * sin, y: -p.x * width / height * sin + p.y * cos }))
      if (!groups) {
        const nearest = (anchor, count, allowed = () => true) => aligned.map((p, index) => ({ index, d: Math.hypot(p.x - aligned[anchor].x, p.y - aligned[anchor].y) }))
          .filter(p => p.index !== 104 && p.index !== 105 && p.index !== anchor && allowed(aligned[p.index]))
          .sort((a, b) => a.d - b.d).slice(0, count).map(p => p.index)
        const lowerNose = aligned[45].y + eyeDistance * .12
        groups = [nearest(104, 8), nearest(105, 8), nearest(98, 19, p => p.y > lowerNose && Math.abs(p.x - aligned[98].x) < eyeDistance * .8).concat(98)]
        if (groups[2].length !== 20 || groups[0].some(i => groups[1].includes(i))) { reset(); return null }
      }
      const ratios = groups.map(ids => measure(aligned, ids))
      if (ratios.some(n => !Number.isFinite(n))) { reset(); return null }
      if (!baseline) {
        if (ratios[0] < .12 || ratios[1] < .12 || ratios[0] > .65 || ratios[1] > .65 || ratios[2] > .42 || ratios[2] < .05) { calibration = []; return { points, blink: 0, mouth: 0, calibrated: false } }
        calibration.push(ratios)
        if (calibration.length >= 6) baseline = ratios.map((_, i) => calibration.reduce((sum, row) => sum + row[i], 0) / calibration.length)
        return { points, blink: 0, mouth: 0, calibrated: false }
      }
      const blink = identityBlinkScore(clamp((1 - ratios[0] / baseline[0]) / .65), clamp((1 - ratios[1] / baseline[1]) / .65))
      const open = clamp((ratios[2] - baseline[2]) / .28)
      return { points, blink, mouth: open, calibrated: true }
    }
  }
}
