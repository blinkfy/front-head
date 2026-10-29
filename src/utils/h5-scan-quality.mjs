const point = value => Number.isFinite(value) && value >= 0 && value <= 1

// Upgrade only when the browser exposes a usable range; never require HD.
export function videoConstraints(capabilities = {}, device = {}) {
  const w = capabilities.width, h = capabilities.height
  if (!(Number.isFinite(w?.max) && w.max > 0 && Number.isFinite(h?.max) && h.max > 0)) return null
  const memory = Number(device.deviceMemory), cores = Number(device.hardwareConcurrency)
  const large = memory >= 4 && cores >= 4
  const medium = !Number.isFinite(memory) && cores >= 6
  const width = Math.min(w.max, large ? 3840 : medium ? 2560 : 1920)
  const height = Math.min(h.max, large ? 2160 : medium ? 1440 : 1080)
  if (width < (w.min || 1) || height < (h.min || 1) || width < 640 || height < 480) return null
  return { width: { ideal: width, max: width }, height: { ideal: height, max: height } }
}

// Coordinates are relative to the visible frame; output remains in source pixels.
export function candidateFrame(frame, candidate) {
  if (!frame || !candidate || !point(candidate.x) || !point(candidate.y)
    || !(candidate.size > 0 && candidate.size <= 1.5) || !Number.isFinite(frame.width) || !Number.isFinite(frame.height)
    || !(frame.width > 0 && frame.height > 0) || !Number.isFinite(frame.left) || !Number.isFinite(frame.top)) return null
  const side = Math.max(1, Math.min(Math.floor(Math.min(frame.width, frame.height)),
    Math.ceil(candidate.size * Math.min(frame.width, frame.height) * 1.6)))
  return {
    left: frame.left + Math.max(0, Math.min(frame.width - side, Math.floor(candidate.x * frame.width - side / 2))),
    top: frame.top + Math.max(0, Math.min(frame.height - side, Math.floor(candidate.y * frame.height - side / 2))),
    width: side, height: side
  }
}

export function imageClarity(image) {
  const { data, width, height } = image || {}
  if (!(width >= 3 && height >= 3) || !data || data.length < width * height * 4) return 0
  const step = Math.max(1, Math.floor(Math.min(width, height) / 96))
  let sum = 0, count = 0
  for (let y = 1; y < height - 1; y += step) for (let x = 1; x < width - 1; x += step) {
    const i = (y * width + x) * 4 + 1
    sum += Math.abs(4 * data[i] - data[i - 4] - data[i + 4] - data[i - width * 4] - data[i + width * 4])
    count++
  }
  return count ? sum / count / 1020 : 0
}

// Reuse only a recent frame from the same source-pixel region. The capture
// timestamp must not advance when an older, sharper frame is selected again.
export function sharpFrameMatches(cached, frame, now) {
  return !!cached && !!frame && !!cached.frame && Number.isFinite(now)
    && now >= cached.at && now - cached.at <= 350
    && cached.frame.width === frame.width && cached.frame.height === frame.height
    && Math.abs(cached.frame.left - frame.left) <= Math.max(2, frame.width * 0.04)
    && Math.abs(cached.frame.top - frame.top) <= Math.max(2, frame.height * 0.04)
}

export function selectSharpFrame(previous, pixels, frame, now) {
  if (!pixels || !(pixels.width >= 3 && pixels.height >= 3) || !pixels.data
    || pixels.data.length !== pixels.width * pixels.height * 4 || !frame
    || !['left', 'top', 'width', 'height'].every(key => Number.isFinite(frame[key]))
    || frame.width <= 0 || frame.height <= 0 || !Number.isFinite(now)) return null
  const clarity = imageClarity(pixels)
  if (sharpFrameMatches(previous, frame, now) && previous.pixels.width === pixels.width
    && previous.pixels.height === pixels.height && previous.clarity > clarity) return previous
  return { pixels, clarity, frame: { ...frame }, at: now }
}

export class PhotoGate {
  enabled = true
  running = false
  attempts = 0
  nextAt = 0
  start(now) {
    if (!this.enabled || this.running || this.attempts >= 3 || now < this.nextAt || !Number.isFinite(now) || now < 0) return false
    this.running = true; this.attempts++; this.nextAt = now + 12000
    return true
  }
  finish() { this.running = false }
  disable() { this.enabled = false }
  busy() { return this.running }
}

function photoDimension(range, limit) {
  if (!(Number.isFinite(range?.max) && range.max > 0)) return 0
  const max = Math.min(limit, range.max), min = range.min || 1, step = range.step > 0 ? range.step : 1
  return max >= min ? Math.floor((max - min) / step) * step + min : 0
}

export function photoSettings(capabilities = {}, video = {}) {
  const imageWidth = photoDimension(capabilities.imageWidth, 3840)
  const imageHeight = photoDimension(capabilities.imageHeight, 2160)
  if (!imageWidth || !imageHeight || !(video.width > 0 && video.height > 0)
    || imageWidth * imageHeight < video.width * video.height * 1.4) return null
  return { imageWidth, imageHeight }
}

export function reprojectCandidate(candidate, before, after) {
  if (!candidate || !point(candidate.x) || !point(candidate.y) || !(candidate.size > 0 && candidate.size <= 1.5)
    || !Number.isFinite(before) || !Number.isFinite(after) || before < 1 || before > 3 || after < 1 || after > 3) return null
  const ratio = after / before
  const x = 0.5 + (candidate.x - 0.5) * ratio, y = 0.5 + (candidate.y - 0.5) * ratio, size = candidate.size * ratio
  return point(x) && point(y) && size <= 1.5 ? { x, y, size } : null
}

// Only repeatable small-code geometry can request zoom; no blind timer ramp.
export class ScanAutoZoom {
  constructor() { this.reset(0) }
  reset(now) { this.previous = null; this.stable = 0; this.manualMode = false; this.nextAt = now + 600; this.lastSeen = 0 }
  manual() { this.manualMode = true; this.previous = null; this.stable = 0 }
  isManual() { return !!this.manualMode }
  defer(now) { this.nextAt = now + 650 }
  next(now, maximum, actual, candidate, decoded = false) {
    if (this.manualMode || !Number.isFinite(now) || !Number.isFinite(maximum) || !Number.isFinite(actual) || maximum <= 1.05 || actual < 1) return NaN
    if (decoded) { this.previous = null; this.stable = 0; this.defer(now); return NaN }
    if (!candidate) {
      if (now - this.lastSeen > 700) { this.previous = null; this.stable = 0 }
      return NaN
    }
    if (!(candidate.size >= 0.025 && candidate.size < 0.36) || !point(candidate.x) || !point(candidate.y)
      || candidate.x < 0.3 || candidate.x > 0.7 || candidate.y < 0.3 || candidate.y > 0.7) {
      this.previous = null; this.stable = 0; return NaN
    }
    const same = this.previous && now - this.lastSeen <= 1200
      && Math.hypot(this.previous.x - candidate.x, this.previous.y - candidate.y) <= 0.06
      && Math.abs(this.previous.size - candidate.size) <= this.previous.size * 0.4
    if (!same) this.since = now
    this.stable = same ? this.stable + 1 : 1; this.previous = candidate; this.lastSeen = now
    if (this.stable < 2 || now - this.since < 180 || now < this.nextAt) return NaN
    const offset = Math.max(Math.abs(candidate.x - 0.5), Math.abs(candidate.y - 0.5))
    const factor = Math.min(candidate.size < 0.12 ? 2 : 1.8, 0.40 / candidate.size, 0.46 / (offset + candidate.size * 0.7))
    const next = Math.min(3, maximum, actual * factor)
    if (next <= actual + 0.04) return NaN
    this.stable = 0; this.nextAt = now + 650
    return next
  }
}

