import assert from 'node:assert/strict'
import {
  identityImageQualityIssue,
  identityQualityMetrics,
  identityQualityRegion,
  measureIdentityImageQuality
} from '../src/utils/identity-image-quality.mjs'

function rgba(width, height, sample) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [r, g, b] = sample(x, y)
    const offset = (y * width + x) * 4
    data[offset] = r; data[offset + 1] = g; data[offset + 2] = b; data[offset + 3] = 255
  }
  return data
}
function solid(value) { return [value, value, value] }
function patterned(base) {
  return (x, y) => solid(base + (((x >> 3) + (y >> 3)) & 1 ? 28 : -28))
}
function measured(data, points = []) {
  return measureIdentityImageQuality({ data, width: 128, height: 128 }, points)
}

const black = identityImageQualityIssue(measured(rgba(128, 128, () => solid(0))))
assert.equal(black, 'black', 'a fully black image is rejected')
assert.equal(identityImageQualityIssue(measured(rgba(128, 128, () => solid(30)))), 'dark', 'an underexposed image is rejected')
assert.equal(identityImageQualityIssue(measured(rgba(128, 128, () => solid(250)))), 'bright', 'an overexposed image is rejected')

const clear = measured(rgba(128, 128, patterned(120)))
assert.ok(clear.sharpness >= 14, `synthetic in-focus detail has usable sharpness (${clear.sharpness})`)
assert.equal(identityImageQualityIssue(clear), null, 'normal clear image passes')
const brightClear = measured(rgba(128, 128, patterned(188)))
assert.equal(identityImageQualityIssue(brightClear), null, 'a bright but unclipped and detailed image passes')

// A clear patterned background surrounds a featureless inner face ROI.
const points = [{ x: .1, y: .1 }, { x: .9, y: .9 }]
const roi = identityQualityRegion(points, 128, 128)
const faceBlurred = rgba(128, 128, (x, y) =>
  x >= roi.left && x < roi.left + roi.width && y >= roi.top && y < roi.top + roi.height
    ? solid(130) : patterned(120)(x, y))
const faceMetrics = measured(faceBlurred, points)
assert.equal(identityImageQualityIssue(faceMetrics), 'blur', 'a sharp background cannot hide a blurred face ROI')

assert.equal(measureIdentityImageQuality({ data: new Uint8Array(12), width: 2, height: 2 }), null, 'malformed pixel buffers are unavailable')
assert.equal(identityQualityMetrics(new Float64Array(64 * 64 - 1), 64), null, 'wrong metric sample count is rejected')
assert.equal(identityImageQualityIssue(null), 'unavailable', 'missing metrics are unavailable')
assert.equal(identityImageQualityIssue({ mean: NaN, black: 0, dark: 0, clipped: 0, sharpness: 30, resolution: 64 }), 'unavailable')
assert.equal(identityImageQualityIssue({ mean: 100, black: 1.1, dark: 0, clipped: 0, sharpness: 30, resolution: 64 }), 'unavailable')

console.log('Identity image quality passed: black, dark, overexposed, blur, clear/bright captures and unavailable metrics.')
