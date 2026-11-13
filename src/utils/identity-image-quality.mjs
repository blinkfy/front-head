// Bounded, device-side heuristics. These are image-quality checks, not proof of liveness.
export const IDENTITY_QUALITY_SIZE = 64

export function identityQualityRegion(points, width, height) {
  const valid = (points || []).filter(p => Number.isFinite(p?.x) && Number.isFinite(p?.y))
  let left = .25, top = .2, right = .75, bottom = .8
  if (valid.length >= 2) {
    left = Math.min(...valid.map(p => p.x)); right = Math.max(...valid.map(p => p.x))
    top = Math.min(...valid.map(p => p.y)); bottom = Math.max(...valid.map(p => p.y))
    const dx = (right - left) * .1, dy = (bottom - top) * .1
    left += dx; right -= dx; top += dy; bottom -= dy
  }
  left = Math.max(0, Math.min(width - 1, Math.floor(left * width)))
  top = Math.max(0, Math.min(height - 1, Math.floor(top * height)))
  right = Math.max(left + 1, Math.min(width, Math.ceil(right * width)))
  bottom = Math.max(top + 1, Math.min(height, Math.ceil(bottom * height)))
  return { left, top, width: right - left, height: bottom - top }
}

// Sample the inner face rather than allowing a sharp background to hide a blurred face.
export function measureIdentityImageQuality({ data, width, height }, points, region) {
  if (!(width > 1 && height > 1) || data?.length !== width * height * 4) return null
  const roi = region || identityQualityRegion(points, width, height), size = IDENTITY_QUALITY_SIZE
  const luma = new Float64Array(size * size)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sx = Math.min(width - 2, roi.left + Math.floor((x + .5) * roi.width / size))
    const sy = Math.min(height - 2, roi.top + Math.floor((y + .5) * roi.height / size))
    let sum = 0
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const i = ((sy + dy) * width + sx + dx) * 4
      sum += .299 * data[i] + .587 * data[i + 1] + .114 * data[i + 2]
    }
    luma[y * size + x] = sum / 4
  }
  return identityQualityMetrics(luma, Math.min(roi.width, roi.height))
}

// Kept in sync with the two native bridges; only six scalar metrics cross the bridge.
export function identityQualityMetrics(luma, resolution) {
  const size = IDENTITY_QUALITY_SIZE
  if (luma?.length !== size * size) return null
  let sum = 0, black = 0, dark = 0, clipped = 0, edge = 0, square = 0
  for (let i = 0; i < luma.length; i++) {
    const v = luma[i]
    if (!Number.isFinite(v) || v < 0 || v > 255) return null
    sum += v; if (v < 12) black++; if (v < 40) dark++; if (v > 245) clipped++
  }
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
    const i = y * size + x, v = luma[i - 1] + luma[i + 1] + luma[i - size] + luma[i + size] - 4 * luma[i]
    edge += v; square += v * v
  }
  const count = (size - 2) ** 2
  return { mean: sum / luma.length, black: black / luma.length, dark: dark / luma.length,
    clipped: clipped / luma.length, sharpness: Math.max(0, square / count - (edge / count) ** 2), resolution }
}

export function identityImageQualityIssue(metrics, { checkSharpness = true } = {}) {
  if (!metrics || !['mean', 'black', 'dark', 'clipped', 'sharpness', 'resolution'].every(key => Number.isFinite(metrics[key])) ||
    metrics.mean < 0 || metrics.mean > 255 || metrics.sharpness < 0 || metrics.resolution < 1 ||
    ['black', 'dark', 'clipped'].some(key => metrics[key] < 0 || metrics[key] > 1)) return 'unavailable'
  if (metrics.mean < 10 || metrics.black > .98) return 'black'
  if (metrics.mean < 45 || metrics.dark > .6) return 'dark'
  if (metrics.mean > 225 || metrics.clipped > .6) return 'bright'
  if (checkSharpness && metrics.resolution < 64) return 'small'
  // Conservative threshold: reject obvious defocus, avoid judging normal skin texture.
  if (checkSharpness && metrics.sharpness < 14) return 'blur'
  return null
}

export function identityImageQualityHint(issue) {
  const title = { black: '请检查镜头是否被遮挡', dark: '请移到光线充足的位置', bright: '请避开强光和逆光',
    blur: '请保持手机平稳', small: '请稍微靠近镜头', unavailable: '正在调整画面，请稍候' }[issue]
  return { title, detail: issue === 'blur' ? '可擦拭镜头，待画面清晰后自动继续认证' : '保持脸部清晰，调整后将自动继续认证' }
}
