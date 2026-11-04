import assert from 'node:assert/strict'
import test from 'node:test'
import { captureSatelliteReference } from '../src/utils/bin-satellite-reference.mjs'

// Plain container/canvas doubles: no browser, SDK, or virtual DOM.
function captureFixture(point = { x: 440, y: 280 }) {
  const calls = { draws: [], arcs: [], created: 0, fills: [], strokes: [] }
  const source = { width: 2000, height: 1500,
    getBoundingClientRect: () => ({ left: 110, top: 60, width: 800, height: 600 }) }
  const container = {
    getBoundingClientRect: () => ({ left: 120, top: 80, width: 800, height: 600 }),
    querySelectorAll(selector) { assert.equal(selector, 'canvas'); return [source] }
  }
  const context = {
    drawImage(...args) { calls.draws.push(args) },
    getImageData(_x, _y, width, height) {
      const data = new Uint8ClampedArray(width * height * 4)
      for (let i = 0; i < data.length; i += 4) {
        data[i] = data[i + 1] = data[i + 2] = (i / 4) % 2 ? 192 : 32
        data[i + 3] = 255
      }
      return { data }
    },
    beginPath() {}, arc(...args) { calls.arcs.push(args) },
    fill() { calls.fills.push(this.fillStyle) },
    stroke() { calls.strokes.push([this.strokeStyle, this.lineWidth]) }
  }
  const output = { width: 0, height: 0, getContext: () => context,
    toDataURL: () => 'data:image/jpeg;base64,/9j/AAAA' }
  const location = { latitude: 25.03123456789, longitude: 121.56123456789 }
  const options = { container, location, satellite: true, loading: false,
    map: { projectToContainer(value) { assert.equal(value, location); return point } },
    toLatLng: value => value,
    createCanvas: () => { calls.created++; return output } }
  return { calls, options, output, source, location, context }
}

test('default satellite crop uses the SDK container point and canvas bounds', () => {
  const point = { x: 440, y: 280 }
  const { options, calls, source, location } = captureFixture(point)
  const reference = captureSatelliteReference(options)
  assert.deepEqual(reference, { image: 'data:image/jpeg;base64,/9j/AAAA', ...location })
  assert.deepEqual(point, { x: 440, y: 280 }, 'SDK point is not mutated')
  assert.equal(calls.created, 1)
  assert.deepEqual(calls.draws, [[source, 375, 50, 1500, 1500, 0, 0, 600, 600]])
  assert.deepEqual(calls.arcs[0].slice(0, 3), [300, 280, 7])
})

test('edge locations clamp the crop and keep the red dot at the selected point', () => {
  for (const [point, cropX, dotX] of [
    [{ x: 10, y: 10 }, 25, 10],
    [{ x: 790, y: 590 }, 525, 590]
  ]) {
    const { options, calls, source } = captureFixture(point)
    assert.ok(captureSatelliteReference(options))
    assert.deepEqual(calls.draws, [[source, cropX, 50, 1500, 1500, 0, 0, 600, 600]])
    assert.deepEqual(calls.arcs[0].slice(0, 3), [dotX, point.y, 7])
    assert.deepEqual(calls.fills, ['#ef4444'])
    assert.deepEqual(calls.strokes, [['#ffffff', 3]])
  }
})

test('points outside the visible container are rejected before allocating a canvas', () => {
  for (const point of [
    { x: -1, y: 280 }, { x: 801, y: 280 },
    { x: 440, y: -1 }, { x: 440, y: 601 }
  ]) {
    const { options, calls } = captureFixture(point)
    assert.equal(captureSatelliteReference(options), null)
    assert.equal(calls.created, 0)
    assert.equal(calls.draws.length, 0)
  }
})

test('temporary canvas is released after success, early return, or export failure', () => {
  for (const mode of ['success', 'no-context', 'blank', 'tainted', 'invalid-export']) {
    const { options, output, context, calls } = captureFixture()
    if (mode === 'no-context') output.getContext = () => null
    if (mode === 'blank') context.getImageData = () => ({ data: new Uint8ClampedArray(600 * 600 * 4) })
    if (mode === 'tainted') output.toDataURL = () => { throw new Error('tainted canvas') }
    if (mode === 'invalid-export') output.toDataURL = () => 'data:,'
    const reference = captureSatelliteReference(options)
    if (mode === 'success') assert.ok(reference)
    else assert.equal(reference, null, mode)
    assert.equal(calls.created, 1, mode)
    assert.equal(output.width, 0, `${mode}: width released`)
    assert.equal(output.height, 0, `${mode}: height released`)
  }
})
