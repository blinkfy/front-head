const LIMIT = 1920
const MAX_EDGE = 640
const COARSE_EDGE = 256
const AMBIGUOUS = Symbol('ambiguous')

/**
 * Find a conservative, geometry-only candidate for a centered WeChat round code.
 * This does not decode content. Coordinates use the full frame; size is the code
 * span divided by the frame's shorter edge.
 */
export function detectRoundCodeCandidate(imageData) {
  const { data, width, height } = imageData || {}
  if (!(data instanceof Uint8ClampedArray) || !Number.isInteger(width) || !Number.isInteger(height)
    || width < 24 || height < 24 || width > LIMIT || height > LIMIT
    || data.length !== width * height * 4) return null

  const whole = detectRegion(data, width, 0, 0, width, height)
  if (whole === AMBIGUOUS) {
    // Full-frame codes can expose logo/ring texture as extra locators. A
    // bounded half-scale pass suppresses that detail; only a frame-filling
    // candidate is eligible for this recovery path.
    if (width <= MAX_EDGE && height <= MAX_EDGE) {
      const coarse = detectCoarse(data, width, height)
      return coarse && coarse !== AMBIGUOUS && coarse.size >= 0.55 ? coarse : null
    }
    return null
  }
  if (whole) {
    if (whole.size < 0.55) return whole
    const coarse = detectCoarse(data, width, height)
    if (!coarse || coarse === AMBIGUOUS || coarse.size < 0.55
      || Math.hypot(whole.x - coarse.x, whole.y - coarse.y) > 0.08
      || Math.abs(whole.size - coarse.size) > whole.size * 0.25) return null
    return coarse
  }

  const side = Math.min(MAX_EDGE, Math.round(Math.min(width, height) * 0.55))
  if (side < 24 || (width <= MAX_EDGE && height <= MAX_EDGE)) return null
  const left = Math.floor((width - side) / 2)
  const top = Math.floor((height - side) / 2)
  const local = detectRegion(data, width, left, top, side, side)
  if (!local || local === AMBIGUOUS) return null
  return {
    x: (left + local.x * side) / width,
    y: (top + local.y * side) / height,
    size: local.size * side / Math.min(width, height)
  }
}

function detectCoarse(data, width, height) {
  const scale = COARSE_EDGE / Math.max(width, height)
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  const reduced = new Uint8ClampedArray(w * h * 4)
  const scaleX = width / w
  const scaleY = height / h
  for (let y = 0; y < h; y++) {
    const y0 = y * scaleY
    const y1 = (y + 1) * scaleY
    const firstY = Math.floor(y0)
    const lastY = Math.ceil(y1)
    for (let x = 0; x < w; x++) {
      const x0 = x * scaleX
      const x1 = (x + 1) * scaleX
      const firstX = Math.floor(x0)
      const lastX = Math.ceil(x1)
      let r = 0, g = 0, b = 0, area = 0
      for (let sy = firstY; sy < lastY; sy++) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy)
        for (let sx = firstX; sx < lastX; sx++) {
          const wx = Math.min(x1, sx + 1) - Math.max(x0, sx)
          const weight = wx * wy
          const i = (sy * width + sx) * 4
          r += data[i] * weight
          g += data[i + 1] * weight
          b += data[i + 2] * weight
          area += weight
        }
      }
      const i = (y * w + x) * 4
      reduced[i] = Math.round(r / area)
      reduced[i + 1] = Math.round(g / area)
      reduced[i + 2] = Math.round(b / area)
      reduced[i + 3] = 255
    }
  }
  return detectRegion(reduced, w, 0, 0, w, h)
}

function detectRegion(data, strideWidth, left, top, width, height, maxEdge = MAX_EDGE) {
  if (width < 24 || height < 24) return null
  const step = Math.max(1, Math.floor((Math.max(width, height) + maxEdge - 1) / maxEdge))
  const w = Math.floor(width / step)
  const h = Math.floor(height / step)
  const pixels = new Uint8Array(w * h)
  const histogram = new Uint32Array(256)
  const offset = (y, x) => ((top + y) * strideWidth + left + x) * 4
  for (let y = 0; y < h; y++) {
    const sy = y * step + Math.floor(step / 2)
    for (let x = 0; x < w; x++) {
      const sx = x * step + Math.floor(step / 2)
      const i = offset(sy, sx)
      const value = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
      pixels[y * w + x] = value
      histogram[value]++
    }
  }

  let low = 0
  let high = 255
  while (low < 255 && histogram[low] === 0) low++
  while (high > low && histogram[high] === 0) high--
  if (high - low < 40) return null

  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * histogram[i]
  let sumLow = 0
  let countLow = 0
  let threshold = low
  let bestVariance = -1
  for (let i = low; i < high; i++) {
    countLow += histogram[i]
    sumLow += i * histogram[i]
    const countHigh = pixels.length - countLow
    if (!countLow || !countHigh) continue
    const delta = sumLow / countLow - (sum - sumLow) / countHigh
    const variance = countLow * countHigh * delta * delta
    if (variance > bestVariance) {
      bestVariance = variance
      threshold = i
    }
  }

  const dark = new Uint8Array(pixels.length)
  for (let i = 0; i < pixels.length; i++) dark[i] = pixels[i] <= threshold ? 1 : 0
  const finders = []
  const runs = new Int32Array(5)
  for (let y = 0; y < h; y++) {
    let x = 0
    while (x < w) {
      while (x < w && !dark[y * w + x]) x++
      if (x === w) break
      const start = x
      let cursor = x
      let total = 0
      for (let run = 0; run < 5; run++) {
        runs[run] = 0
        const expected = run % 2 === 0 ? 1 : 0
        while (cursor < w && dark[y * w + cursor] === expected) {
          cursor++
          runs[run]++
        }
        total += runs[run]
      }
      const type = roundFinderType(runs)
      if (type && total >= 7) {
        const centerX = start + runs[0] + runs[1] + Math.floor(runs[2] / 2)
        const vertical = crossRoundFinder(dark, w, h, centerX, y, total)
        if (vertical) {
          const diameter = (total + vertical[1]) / 2
          let merged = false
          for (const point of finders) {
            if (Math.hypot(point.x - centerX, point.y - vertical[0]) < diameter * 0.55) {
              const hits = point.hits
              point.x = (point.x * hits + centerX) / (hits + 1)
              point.y = (point.y * hits + vertical[0]) / (hits + 1)
              point.d = (point.d * hits + diameter) / (hits + 1)
              point.hits++
              merged = true
              break
            }
          }
          if (!merged) finders.push({ x: centerX, y: vertical[0], d: diameter, hits: 1 })
          if (finders.length > 40) return AMBIGUOUS
        }
      }
      x = start + Math.max(1, runs[0] + runs[1])
    }
  }

  let answer = null
  for (let i = 0; i < finders.length; i++) {
    for (let j = i + 1; j < finders.length; j++) {
      for (let k = j + 1; k < finders.length; k++) {
        let a = finders[i]
        let b = finders[j]
        let c = finders[k]
        if (a.hits < 2 || b.hits < 2 || c.hits < 2) continue
        const ab = distanceSquared(a, b)
        const ac = distanceSquared(a, c)
        const bc = distanceSquared(b, c)
        if (ab > ac && ab > bc) [a, c] = [c, a]
        else if (ac > bc) [a, b] = [b, a]
        const legB = Math.sqrt(distanceSquared(a, b))
        const legC = Math.sqrt(distanceSquared(a, c))
        const minDiameter = Math.min(a.d, b.d, c.d)
        const maxDiameter = Math.max(a.d, b.d, c.d)
        if (maxDiameter > minDiameter * 1.65 || Math.min(legB, legC) < maxDiameter * 1.4
          || Math.max(legB, legC) > minDiameter * 16 || legB / legC < 0.55 || legB / legC > 1.8) continue
        const cosine = ((b.x - a.x) * (c.x - a.x) + (b.y - a.y) * (c.y - a.y)) / (legB * legC)
        if (Math.abs(cosine) > 0.28) continue

        const fourthX = b.x + c.x - a.x
        const fourthY = b.y + c.y - a.y
        const pad = Math.min(legB, legC) * 0.35
        const boxLeft = Math.min(a.x, b.x, c.x, fourthX) - pad
        const boxRight = Math.max(a.x, b.x, c.x, fourthX) + pad
        const boxTop = Math.min(a.y, b.y, c.y, fourthY) - pad
        const boxBottom = Math.max(a.y, b.y, c.y, fourthY) + pad
        if (boxLeft < -2 || boxTop < -2 || boxRight > w + 2 || boxBottom > h + 2) continue

        const candidate = {
          x: (b.x + c.x) / (2 * w),
          y: (b.y + c.y) / (2 * h),
          size: Math.max(boxRight - boxLeft, boxBottom - boxTop) / Math.min(w, h)
        }
        if (answer && (Math.hypot(answer.x - candidate.x, answer.y - candidate.y) > 0.08
          || Math.abs(answer.size - candidate.size) > answer.size * 0.25)) return AMBIGUOUS
        answer = candidate
      }
    }
  }
  return answer
}

function distanceSquared(a, b) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

// Round-code locators use concentric rings; ordinary QR's square finder is excluded.
function roundFinderType(runs) {
  for (const run of runs) if (!run) return 0
  const outer = (runs[0] + runs[4]) / 2
  if (Math.abs(runs[0] - runs[4]) > outer * 0.8 || Math.abs(runs[1] - runs[3]) > outer * 0.8) return 0
  const white = (runs[1] + runs[3]) / 2
  return white >= outer * 1.15 && white <= outer * 2.8
    && runs[2] >= outer * 0.4 && runs[2] <= outer * 2.2 ? 2 : 0
}

function crossRoundFinder(dark, width, height, x, y, horizontal) {
  const runs = new Int32Array(5)
  let up = y
  let down = y + 1
  while (up >= 0 && dark[up * width + x]) { runs[2]++; up-- }
  const centerTop = up + 1
  while (down < height && dark[down * width + x]) { runs[2]++; down++ }
  const centerBottom = down - 1
  while (up >= 0 && !dark[up * width + x]) { runs[1]++; up-- }
  while (up >= 0 && dark[up * width + x]) { runs[0]++; up-- }
  while (down < height && !dark[down * width + x]) { runs[3]++; down++ }
  while (down < height && dark[down * width + x]) { runs[4]++; down++ }
  const total = runs[0] + runs[1] + runs[2] + runs[3] + runs[4]
  if (up < 0 || down >= height || roundFinderType(runs) !== 2 || Math.abs(total - horizontal) > horizontal * 0.5) return null
  return [(centerTop + centerBottom) / 2, total]
}
