// Device-side capture quality feedback, never an identity or liveness verdict.
export function identityFaceFrame(points, video, viewport, { tracking = false } = {}) {
  if (!points?.length || !video.width || !video.height || !viewport.width || !viewport.height) return { ready: false, hint: '请将脸部放入框内' }
  let left = 1, right = 0, top = 1, bottom = 0
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return { ready: false, hint: '请正对镜头' }
    left = Math.min(left, point.x); right = Math.max(right, point.x)
    top = Math.min(top, point.y); bottom = Math.max(bottom, point.y)
  }
  const scale = Math.max(viewport.width / video.width, viewport.height / video.height)
  const sx = video.width * scale / viewport.width, sy = video.height * scale / viewport.height
  const width = (right - left) * sx, height = (bottom - top) * sy
  const x = ((left + right) / 2 - .5) * sx + .5, y = ((top + bottom) / 2 - .5) * sy + .5
  // Once aligned, jaw movement must not be mistaken for a new head position.
  // Initial alignment and the final photo still use the tighter bounds.
  if (width > (tracking ? 1.06 : .94) || height > (tracking ? 1.12 : .94)) return { ready: false, hint: '请稍微离远一点' }
  if (width < (tracking ? .28 : .36) || height < (tracking ? .32 : .38)) return { ready: false, hint: '请稍微靠近一点' }
  const margin = tracking ? -.10 : .02
  if (Math.abs(x - .5) > (tracking ? .21 : .16) || Math.abs(y - .5) > (tracking ? .23 : .18) || x - width / 2 < margin || x + width / 2 > 1 - margin || y - height / 2 < margin || y + height / 2 > 1 - margin) return { ready: false, hint: '请将脸部移到框中央' }
  return { ready: true, hint: '请保持正对镜头' }
}

export function createIdentityFramingGuard() {
  let interruptedAt = null, missingAt = null, readyFrames = 0, resetIssued = false
  return {
    update(faceCount, ready, timestamp) {
      if (faceCount === 1 && ready) {
        readyFrames++
        if (interruptedAt !== null && readyFrames < 2) return { paused: true, reset: false, resumed: false }
        const resumed = interruptedAt !== null
        interruptedAt = null; missingAt = null; resetIssued = false
        return { paused: false, reset: false, resumed }
      }
      readyFrames = 0
      if (interruptedAt === null) interruptedAt = timestamp
      if (faceCount === 0) { if (missingAt === null) missingAt = timestamp } else missingAt = null
      const reset = !resetIssued && (faceCount > 1 || timestamp - interruptedAt >= 2500 || (missingAt !== null && timestamp - missingAt >= 1500))
      if (reset) resetIssued = true
      return { paused: true, reset, resumed: false }
    }
  }
}

export function identityCheekColor(image, points) {
  if (!image?.data || !points?.[50] || !points?.[280]) return null
  const { data, width, height } = image
  const radius = Math.max(1, Math.round(width * .025))
  const sum = [0, 0, 0]; let count = 0
  for (const index of [50, 280]) {
    const point = points[index]
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null
    const cx = Math.round(point.x * (width - 1)), cy = Math.round(point.y * (height - 1))
    for (let y = Math.max(0, cy - radius); y <= Math.min(height - 1, cy + radius); y++) {
      for (let x = Math.max(0, cx - radius); x <= Math.min(width - 1, cx + radius); x++) {
        const offset = (y * width + x) * 4, r = data[offset], g = data[offset + 1], b = data[offset + 2]
        if (r + g + b < 45 || Math.min(r, g, b) > 245) continue
        sum[0] += r; sum[1] += g; sum[2] += b; count++
      }
    }
  }
  return count >= 8 ? sum.map(value => value / count) : null
}

export const IDENTITY_LIGHT_COLORS = [
  { id: 'rose', fill: '#ff8fa3', vector: [255, 143, 163] },
  { id: 'mint', fill: '#83ffb3', vector: [131, 255, 179] },
  { id: 'sky', fill: '#85cfff', vector: [133, 207, 255] }
]
export function shuffledIdentityLights(random = Math.random) {
  const colors = IDENTITY_LIGHT_COLORS.slice()
  for (let i = colors.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)); [colors[i], colors[j]] = [colors[j], colors[i]]
  }
  return colors
}
const chroma = rgb => {
  const total = rgb.reduce((sum, value) => sum + value, 0)
  return total > 0 ? rgb.map(value => value / total) : null
}
const mean = samples => samples.length ? samples[0].map((_, channel) => samples.reduce((sum, rgb) => sum + rgb[channel], 0) / samples.length) : null
export function identityLightResponse(baseline, stages) {
  const base = mean(baseline)
  if (!base || baseline.length < 3 || stages.length !== 3 || stages.some(stage => stage.samples.length < 3)) return { status: 'unclear' }
  const normalized = chroma(base)
  if (!normalized) return { status: 'unclear' }
  let matched = 0
  for (const stage of stages) {
    const observed = chroma(mean(stage.samples)), expected = chroma(stage.color.vector)
    const delta = observed.map((value, i) => value - normalized[i]), target = expected.map(value => value - 1 / 3)
    const magnitude = Math.hypot(...delta), targetMagnitude = Math.hypot(...target)
    const agreement = delta.reduce((sum, value, i) => sum + value * target[i], 0) / (magnitude * targetMagnitude || 1)
    if (magnitude >= .003 && agreement > .45) matched++
  }
  // Camera white balance, ambient light and display size make this inconclusive on many devices.
  return { status: matched >= 2 ? 'observed' : 'unclear' }
}
