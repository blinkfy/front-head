import assert from 'node:assert/strict'
import { candidateFrame, imageClarity, PhotoGate, photoSettings, reprojectCandidate, ScanAutoZoom, selectSharpFrame, sharpFrameMatches, videoConstraints } from '../src/utils/h5-scan-quality.mjs'

function blurBox(source, width, height) {
  const blurred = new Uint8ClampedArray(source.length)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let sum = 0, count = 0
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const sx = x + dx, sy = y + dy
      if (sx < 0 || sx >= width || sy < 0 || sy >= height) continue
      const i = (sy * width + sx) * 4
      sum += source[i]; count++
    }
    const value = Math.round(sum / count)
    const i = (y * width + x) * 4
    blurred[i] = blurred[i + 1] = blurred[i + 2] = value; blurred[i + 3] = 255
  }
  return blurred
}

const highCaps = { width: { min: 640, max: 4000 }, height: { min: 480, max: 2400 } }
const high = videoConstraints(highCaps, { deviceMemory: 4, hardwareConcurrency: 4 })
assert.ok(high, 'known HD-capable camera should get bounded constraints')
assert.ok(high.width.ideal <= 3840 && high.height.ideal <= 2160)
assert.ok(high.width.max <= highCaps.width.max && high.height.max <= highCaps.height.max)
assert.ok(high.width.ideal >= highCaps.width.min && high.height.ideal >= highCaps.height.min)
assert.ok(high.width.ideal > 1920 || high.height.ideal > 1080, 'high-memory device should request an HD upgrade')

const medium = videoConstraints(highCaps, { hardwareConcurrency: 6 })
assert.ok(medium)
assert.ok(medium.width.ideal <= 2560 && medium.height.ideal <= 1440,
  'unknown-memory devices with six cores should use the medium ceiling')
const basic = videoConstraints(highCaps, { deviceMemory: 2, hardwareConcurrency: 2 })
assert.ok(basic)
assert.ok(basic.width.ideal <= 1920 && basic.height.ideal <= 1080,
  'constrained devices should stay at the base ceiling')
assert.equal(videoConstraints({ width: { min: 320 }, height: { max: 1080 } }, { deviceMemory: 8, hardwareConcurrency: 8 }), null,
  'missing maximum dimensions must not request an unsafe upgrade')

const frame = { width: 1920, height: 1080, left: 80, top: 40 }
const center = candidateFrame(frame, { x: 0.5, y: 0.5, size: 0.1 })
assert.ok(center)
assert.equal(center.width, center.height, 'candidate ROI must be square')
assert.ok(Math.abs(center.width - Math.ceil(0.1 * 1080 * 1.6)) <= 1, 'candidate ROI should include 1.6x padding')
assert.ok(Math.abs(center.left + center.width / 2 - (frame.left + frame.width / 2)) <= 1)
assert.ok(Math.abs(center.top + center.height / 2 - (frame.top + frame.height / 2)) <= 1)
assert.ok(center.left >= frame.left && center.top >= frame.top, 'ROI must retain the frame native offset')
const corner = candidateFrame(frame, { x: 1, y: 1, size: 0.2 })
assert.ok(corner)
assert.ok(corner.left + corner.width <= frame.left + frame.width)
assert.ok(corner.top + corner.height <= frame.top + frame.height)
assert.equal(candidateFrame(frame, null), null)
assert.equal(candidateFrame(frame, { x: NaN, y: 0.5, size: 0.1 }), null)

const zoomCandidate = { x: 0.55, y: 0.45, size: 0.1 }
const projected = reprojectCandidate(zoomCandidate, 1, 2)
assert.ok(Math.abs(projected.x - 0.6) < 1e-12 && Math.abs(projected.y - 0.4) < 1e-12
  && Math.abs(projected.size - 0.2) < 1e-12)
const restored = reprojectCandidate(projected, 2, 1)
assert.ok(Math.abs(restored.x - zoomCandidate.x) < 1e-12 && Math.abs(restored.y - zoomCandidate.y) < 1e-12
  && Math.abs(restored.size - zoomCandidate.size) < 1e-12, 'candidate mapping should round-trip')
for (const [candidate, before, after] of [
  [null, 1, 2], [{ x: NaN, y: 0.5, size: 0.1 }, 1, 2], [{ x: 1.01, y: 0.5, size: 0.1 }, 1, 2],
  [zoomCandidate, 0, 2], [zoomCandidate, 1, 3.01], [zoomCandidate, 1, NaN]
]) assert.equal(reprojectCandidate(candidate, before, after), null, 'invalid mapping should return null')

// A candidate ROI follows the same source pixels through a non-central digital zoom.
const originalRegion = candidateFrame({ left: 0, top: 0, width: 120, height: 120 }, { x: 0.55, y: 0.45, size: 0.1 })
const crop = { left: 30, top: 30, width: 60, height: 60 }
const zoomedCandidate = reprojectCandidate({ x: 0.55, y: 0.45, size: 0.1 }, 1, 2)
const zoomedRegion = candidateFrame(crop, zoomedCandidate)
assert.ok(originalRegion && zoomedRegion)
assert.ok(Math.abs(originalRegion.width - zoomedRegion.width) <= 1)
assert.ok(Math.abs(originalRegion.left - zoomedRegion.left) <= 1)
assert.ok(Math.abs(originalRegion.top - zoomedRegion.top) <= 1)

const autoZoom = new ScanAutoZoom()
autoZoom.reset(0)
const mediumCode = { x: 0.5, y: 0.5, size: 0.2 }
assert.ok(Number.isNaN(autoZoom.next(599, 3, 1, null)), 'auto zoom must wait at least 600ms')
assert.ok(Number.isNaN(autoZoom.next(600, 3, 1, mediumCode)), 'one candidate cannot trigger zoom')
assert.ok(Number.isNaN(autoZoom.next(779, 3, 1, mediumCode)), 'candidate observations need 180ms span')
assert.equal(autoZoom.next(780, 3, 1, mediumCode), 1.8, 'two stable observations should make a bounded 1.8x step')
assert.ok(Number.isNaN(autoZoom.next(1429, 3, 1.8, mediumCode)), 'zoom steps need a 650ms interval')
assert.equal(autoZoom.next(1430, 3, 1.8, mediumCode), 3, 'normal code remains bounded by the 3x maximum')

autoZoom.reset(0)
const tinyCode = { x: 0.5, y: 0.5, size: 0.1 }
autoZoom.next(600, 3, 1, tinyCode)
assert.equal(autoZoom.next(780, 3, 1, tinyCode), 2, 'tiny code may use one bounded 2x step')
autoZoom.reset(0)
autoZoom.next(600, 3.2, 2.5, mediumCode)
assert.equal(autoZoom.next(780, 3.2, 2.5, mediumCode), 3,
  'automatic zoom is capped at 3x even when hardware exposes a higher maximum')
autoZoom.reset(0)
assert.ok(Number.isNaN(autoZoom.next(600, 3, 1, null)), 'missing geometry must not cause blind zoom')
autoZoom.manual()
assert.ok(Number.isNaN(autoZoom.next(1200, 3, 1, mediumCode)), 'manual zoom locks automatic control')

const constructedAutoZoom = new ScanAutoZoom()
constructedAutoZoom.next(600, 3, 1, mediumCode)
assert.equal(constructedAutoZoom.next(780, 3, 1, mediumCode), 1.8,
  'constructor initializes the startup gate without an explicit reset')

const width = 64, height = 48
const flat = new Uint8ClampedArray(width * height * 4)
for (let i = 0; i < flat.length; i += 4) {
  flat[i] = flat[i + 1] = flat[i + 2] = 100; flat[i + 3] = 255
}
assert.equal(imageClarity({ width, height, data: flat }), 0, 'flat image clarity should be zero')
const sharp = new Uint8ClampedArray(flat)
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const i = (y * width + x) * 4
  const value = (x >> 2) % 2 ? 255 : 0
  sharp[i] = sharp[i + 1] = sharp[i + 2] = value
}
const sharpBefore = new Uint8ClampedArray(sharp)
const sharpScore = imageClarity({ width, height, data: sharp })
const blurredScore = imageClarity({ width, height, data: blurBox(sharp, width, height) })
assert.ok(sharpScore >= 0 && blurredScore >= 0)
assert.ok(sharpScore > blurredScore, 'sharper candidate image should score higher than its blur')
assert.deepEqual(sharp, sharpBefore, 'clarity scoring must not mutate image pixels')

function rgbaPattern(width, height, sharpPattern) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const value = sharpPattern ? (x % 2 ? 255 : 0) : 100
    const i = (y * width + x) * 4
    data[i] = data[i + 1] = data[i + 2] = value; data[i + 3] = 255
  }
  return { width, height, data }
}
const roi = { left: 40, top: 30, width: 100, height: 80 }
const sharpPixels = rgbaPattern(40, 32, true)
const softPixels = rgbaPattern(40, 32, false)
const cachedSharp = selectSharpFrame(null, sharpPixels, roi, 1000)
assert.ok(cachedSharp && cachedSharp.clarity > 0 && cachedSharp.at === 1000)
assert.equal(selectSharpFrame(cachedSharp, softPixels, roi, 1200), cachedSharp,
  'a less clear frame must not replace a recent, matching sharp frame')
assert.equal(cachedSharp.at, 1000, 'reusing the selected frame must preserve its original timestamp')
assert.equal(sharpFrameMatches(cachedSharp, roi, 1350), true, 'cache remains valid through 350ms')
assert.equal(sharpFrameMatches(cachedSharp, roi, 1351), false, 'cache expires based on the selected frame time')
assert.equal(sharpFrameMatches(cachedSharp, { ...roi, left: roi.left + 4 }, 1200), true,
  'small ROI motion within four percent is tolerated')
assert.equal(sharpFrameMatches(cachedSharp, { ...roi, left: roi.left + 5 }, 1200), false,
  'larger horizontal ROI motion invalidates the cache')
assert.equal(sharpFrameMatches(cachedSharp, { ...roi, top: roi.top + 4 }, 1200), false,
  'vertical motion beyond four percent invalidates the cache')
assert.equal(sharpFrameMatches(cachedSharp, { ...roi, width: roi.width + 1 }, 1200), false,
  'ROI size change invalidates the cache')
assert.equal(sharpFrameMatches(cachedSharp, roi, 999), false, 'future cache timestamps are invalid')
assert.equal(selectSharpFrame(cachedSharp, { width: 40, height: 32, data: new Uint8ClampedArray(2) }, roi, 1200), null,
  'malformed pixel data is rejected')
assert.equal(selectSharpFrame(cachedSharp, sharpPixels, { ...roi, left: NaN }, 1200), null,
  'malformed ROI is rejected')

const gate = new PhotoGate()
assert.equal(gate.enabled, true)
assert.equal(gate.busy(), false)
assert.equal(gate.start(0), true, 'first photo attempt should be admitted')
assert.equal(gate.busy(), true)
assert.equal(gate.start(1), false, 'in-flight photo must exclude concurrent attempts')
gate.finish()
assert.equal(gate.busy(), false)
assert.equal(gate.start(11999), false, 'photo cooldown must last 12 seconds')
assert.equal(gate.start(12000), true)
gate.finish()
assert.equal(gate.start(24000), true)
gate.finish()
assert.equal(gate.start(36000), false, 'photo gate must cap attempts at three')

const disabledGate = new PhotoGate()
assert.equal(disabledGate.start(10), true)
disabledGate.disable()
assert.equal(disabledGate.enabled, false)
assert.equal(disabledGate.busy(), true, 'disabling must not clear an active photo')
assert.equal(disabledGate.start(12010), false, 'disabled gate must refuse future photos')
disabledGate.finish()
assert.equal(disabledGate.busy(), false)

const videoSettings = { width: 1920, height: 1080 }
const photo = photoSettings({ imageWidth: { min: 640, max: 5000 }, imageHeight: { min: 480, max: 4000 } }, videoSettings)
assert.ok(photo, 'high-resolution photo capability should be selected')
assert.ok(photo.imageWidth >= videoSettings.width * 1.4 || photo.imageHeight >= videoSettings.height * 1.4)
assert.ok(photo.imageWidth <= 3840 && photo.imageHeight <= 2160, 'photo dimensions must respect global bounds')
assert.ok(photo.imageWidth <= 5000 && photo.imageHeight <= 4000, 'photo dimensions must respect device maxima')
assert.equal(photoSettings({ imageWidth: { min: 640, max: 2500 }, imageHeight: { min: 480, max: 1080 } }, videoSettings), null,
  'photo too close to live video resolution should be rejected')
assert.equal(photoSettings({ imageWidth: { min: 640, max: 3840 } }, videoSettings), null,
  'missing image-size capability should be rejected')
assert.equal(photoSettings({ imageWidth: { min: 3000, max: 2000 }, imageHeight: { min: 1000, max: 2160 } }, videoSettings), null,
  'invalid capability ranges should be rejected')

console.log('PASS H5 video constraints, candidate ROI, image clarity, PhotoGate and bounded photo settings')
