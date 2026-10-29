import assert from 'node:assert/strict'
import { photoDimensions, preparePhotoCapture } from '../src/utils/h5-photo-capture.mjs'

function png(width, height, length = 24) {
  const bytes = new Uint8Array(length)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82])
  if (length >= 24) {
    const view = new DataView(bytes.buffer)
    view.setUint32(16, width); view.setUint32(20, height)
  }
  return bytes
}

function jpeg(width, height) {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, height >> 8, height & 255,
    width >> 8, width & 255, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0,
  ])
}

function profile({ width = 3840, height = 2160 } = {}) {
  return {
    imageWidth: { min: 1, max: width },
    imageHeight: { min: 1, max: height },
  }
}

function makeTrack({ caps = profile(), video = { width: 1280, height: 720 }, blob = new Blob([png(2400, 1600)]) } = {}) {
  const calls = []
  const track = { getSettings: () => video }
  class Capture {
    async getPhotoCapabilities() {
      calls.push('capabilities')
      if (caps instanceof Error) throw caps
      return caps
    }
    async takePhoto(settings) { calls.push(settings); return blob }
  }
  return { track, Capture, calls }
}

assert.deepEqual(photoDimensions(png(2400, 1600)), { width: 2400, height: 1600 })
assert.deepEqual(photoDimensions(jpeg(3200, 1800)), { width: 3200, height: 1800 })
assert.equal(photoDimensions(png(5000, 4000)), null, 'rejects images over 16 megapixels')
assert.equal(photoDimensions(png(9000, 1000)), null, 'rejects images over the maximum edge')
assert.equal(photoDimensions(png(10, 10, 23)), null, 'rejects truncated PNG headers')
assert.equal(photoDimensions(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])), null, 'rejects unknown formats')
assert.equal(photoDimensions(new Uint8Array(256 * 1024 + 1)), null, 'does not parse oversized headers')

assert.equal(await preparePhotoCapture({ getSettings() {} }, {}), null, 'unsupported runtime returns null')

{
  const { track, Capture } = makeTrack({ caps: new Error('unavailable') })
  assert.equal(await preparePhotoCapture(track, { ImageCapture: Capture, createImageBitmap() {} }), null,
    'capability rejection disables optional capture')
}
{
  const { track, Capture } = makeTrack({ caps: profile({ width: 1280, height: 720 }) })
  assert.equal(await preparePhotoCapture(track, { ImageCapture: Capture, createImageBitmap() {} }), null,
    'no higher-resolution profile returns null')
}

{
  const { track, Capture, calls } = makeTrack()
  const timeouts = []
  const bitmap = { width: 2400, height: 1600, closed: 0, close() { this.closed++ } }
  const runtime = {
    ImageCapture: Capture,
    createImageBitmap(blob) {
      assert.equal(this, runtime, 'createImageBitmap is called with its runtime receiver')
      assert.ok(blob instanceof Blob)
      return bitmap
    },
  }
  const adapter = await preparePhotoCapture(track, runtime, async (promise, ms) => {
    timeouts.push(ms); return promise
  })
  assert.ok(adapter)
  const result = await adapter.capture()
  assert.equal(result, bitmap)
  assert.equal(bitmap.closed, 0)
  assert.deepEqual(calls, ['capabilities', { imageWidth: 3840, imageHeight: 2160 }])
  assert.deepEqual(timeouts, [2500, 6000, 1000, 4000])
}

{
  let active = true, bitmapCalls = 0
  const { track, Capture } = makeTrack()
  const adapter = await preparePhotoCapture(track, {
    ImageCapture: Capture,
    createImageBitmap() { bitmapCalls++; return { width: 2400, height: 1600 } },
  }, promise => promise, () => active)
  const original = track
  original.takePhoto = undefined
  // Session identity may change after photo bytes arrive; do not start a decode then.
  const capture = adapter.capture
  const origTakePhoto = Capture.prototype.takePhoto
  Capture.prototype.takePhoto = async function(settings) {
    const result = await origTakePhoto.call(this, settings)
    active = false
    return result
  }
  assert.equal(await capture(), null)
  assert.equal(bitmapCalls, 0)
}

{
  let active = true
  const { track, Capture } = makeTrack()
  const bitmap = { width: 2400, height: 1600, closed: 0, close() { this.closed++ } }
  const adapter = await preparePhotoCapture(track, {
    ImageCapture: Capture,
    createImageBitmap() { active = false; return bitmap },
  }, promise => promise, () => active)
  assert.equal(await adapter.capture(), null)
  assert.equal(bitmap.closed, 1, 'closes bitmap if session becomes inactive during decode')
}

{
  let bitmapCalls = 0
  const { track, Capture } = makeTrack({ blob: new Blob([png(9000, 1000)]) })
  const adapter = await preparePhotoCapture(track, {
    ImageCapture: Capture,
    createImageBitmap() { bitmapCalls++; return {} },
  })
  await assert.rejects(adapter.capture(), /INVALID_PHOTO_DIMENSIONS/)
  assert.equal(bitmapCalls, 0, 'rejects oversized dimensions before bitmap decoding')
}

console.log('H5 photo capture tests passed')
