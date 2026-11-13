import assert from 'node:assert/strict'
import {
  IDENTITY_LIGHT_COLORS,
  createIdentityFramingGuard,
  identityCheekColor,
  identityFaceFrame,
  identityLightResponse,
  shuffledIdentityLights
} from '../src/utils/identity-camera-checks.mjs'
import { createIdentityActionSequence } from '../src/utils/identity-action-sequence.mjs'

const video = { width: 640, height: 480 }
// The 360x640 viewport crops the sides of the landscape camera feed with object-fit: cover.
const viewport = { width: 360, height: 640 }
function face(cx, cy, width, height) {
  return [
    { x: cx - width / 2, y: cy - height / 2 },
    { x: cx + width / 2, y: cy - height / 2 },
    { x: cx + width / 2, y: cy + height / 2 },
    { x: cx - width / 2, y: cy + height / 2 }
  ]
}
assert.equal(identityFaceFrame(face(.5, .5, .22, .55), video, viewport).ready, true,
  'a centered face is evaluated in the cropped viewport coordinate space')
assert.equal(identityFaceFrame(face(.5, .5, .10, .55), video, viewport).hint, '请稍微靠近一点',
  'a small face asks the user to move closer after cover cropping')
assert.equal(identityFaceFrame(face(.5, .5, .42, .55), video, viewport).hint, '请稍微离远一点',
  'a large face asks the user to move farther away after cover cropping')
assert.equal(identityFaceFrame(face(.58, .5, .22, .55), video, viewport).hint, '请将脸部移到框中央',
  'an off-center face is detected after horizontal crop mapping')
const jawExpanded = face(.5, .48, .22, .98)
assert.equal(identityFaceFrame(jawExpanded, video, viewport).ready, false,
  'initial alignment and final capture reject an expanded lower jaw outside strict bounds')
assert.equal(identityFaceFrame(jawExpanded, video, viewport, { tracking: true }).ready, true,
  'tracking tolerates lower-jaw expansion while the user performs an action')
assert.equal(identityFaceFrame(face(.5, .5, .22, .55), video, viewport, { tracking: true }).ready, true,
  'the centered face remains valid during action tracking')

{
  const guard = createIdentityFramingGuard()
  assert.deepEqual(guard.update(1, true, 0), { paused: false, reset: false, resumed: false })
  assert.deepEqual(guard.update(1, false, 120), { paused: true, reset: false, resumed: false },
    'a short single-face framing deviation pauses without resetting')
  assert.deepEqual(guard.update(1, true, 240), { paused: true, reset: false, resumed: false },
    'one ready frame is not enough to resume')
  assert.deepEqual(guard.update(1, true, 360), { paused: false, reset: false, resumed: true },
    'two consecutive ready frames resume tracking')

  const missing = createIdentityFramingGuard()
  missing.update(0, false, 100)
  assert.equal(missing.update(0, false, 1599).reset, false, 'a brief missing face preserves progress')
  assert.equal(missing.update(0, false, 1600).reset, true, 'a missing face resets after 1500 ms')
  assert.equal(missing.update(0, false, 1700).reset, false, 'a continuous interruption resets only once')

  const displaced = createIdentityFramingGuard()
  displaced.update(1, false, 100)
  assert.equal(displaced.update(1, false, 2599).reset, false, 'brief out-of-frame movement is tolerated')
  assert.equal(displaced.update(1, false, 2600).reset, true, 'sustained framing deviation resets after 2500 ms')
  assert.equal(createIdentityFramingGuard().update(2, false, 100).reset, true, 'multiple faces reset immediately')
}

{
  const actions = createIdentityActionSequence(['mouth', 'blink'])
  let timestamp = 0
  const tick = (blink, mouth) => actions.update(blink, mouth, timestamp += 120)
  for (let i = 0; i < 3; i++) tick(0, 0)
  tick(0, .8); tick(0, .8); tick(0, 0); tick(0, 0)
  assert.equal(tick(0, 0).index, 1, 'first action completes before a brief framing interruption')

  const guard = createIdentityFramingGuard()
  let result = guard.update(1, false, timestamp)
  assert.equal(result.paused, true); actions.pause()
  timestamp += 120
  result = guard.update(0, false, timestamp)
  assert.equal(result.reset, false, 'one missing frame does not discard a completed action')
  actions.pause()
  timestamp += 120
  result = guard.update(1, true, timestamp)
  assert.equal(result.resumed, false); actions.pause()
  timestamp += 120
  result = guard.update(1, true, timestamp)
  assert.equal(result.resumed, true)
  for (let i = 0; i < 3; i++) tick(0, 0)
  tick(.8, 0); tick(.8, 0); tick(0, 0); tick(0, 0)
  assert.equal(tick(0, 0).index, 2, 'the next action remains available after a brief deviation and one lost frame')
}

{
  const actions = createIdentityActionSequence(['mouth'])
  let timestamp = 0
  const tick = (blink, mouth) => actions.update(blink, mouth, timestamp += 120)
  for (let i = 0; i < 3; i++) tick(0, 0)
  assert.equal(tick(0, .8).index, 0, 'one partial active frame is insufficient')
  actions.pause()
  for (let i = 0; i < 3; i++) tick(0, 0)
  assert.equal(tick(0, .8).index, 0, 'partial actions on opposite sides of a pause cannot be combined')
  tick(0, .8); tick(0, 0); tick(0, 0)
  assert.equal(tick(0, 0).index, 1, 'a fresh complete action can progress after a pause')
}

const cheekPoints = Array.from({ length: 281 }, () => ({ x: .5, y: .5 }))
cheekPoints[50] = { x: .3, y: .5 }
cheekPoints[280] = { x: .7, y: .5 }
function solidImage(rgb, width = 32, height = 32) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255
  }
  return { data, width, height }
}
assert.equal(identityCheekColor(solidImage([0, 0, 0]), cheekPoints), null, 'black cheek patches provide no usable color sample')
assert.equal(identityCheekColor(solidImage([255, 255, 255]), cheekPoints), null, 'overexposed cheek patches provide no usable color sample')
assert.deepEqual(identityCheekColor(solidImage([120, 80, 60]), cheekPoints), [120, 80, 60], 'valid cheek patches produce a color sample')

const baseline = Array.from({ length: 4 }, () => [100, 100, 100])
const stagesFor = sample => IDENTITY_LIGHT_COLORS.map(color => ({ color, samples: Array.from({ length: 4 }, () => sample(color)) }))
const directed = identityLightResponse(baseline, stagesFor(color => color.vector))
assert.equal(directed.status, 'observed', 'three distinct directional light colors produce an observed response')
assert.equal(identityLightResponse(baseline, stagesFor(() => [150, 150, 150])).status, 'unclear',
  'static uniform brightness or equal-channel brightening is not a directional response')
assert.equal(identityLightResponse(baseline, [
  ...IDENTITY_LIGHT_COLORS.slice(0, 2).map(color => ({ color, samples: Array.from({ length: 4 }, () => color.vector) })),
  { color: IDENTITY_LIGHT_COLORS[2], samples: [[220, 220, 220], [220, 220, 220]] }
]).status, 'unclear', 'too few samples in a light stage are inconclusive')
assert.equal(identityLightResponse(baseline.slice(0, 2), stagesFor(color => color.vector)).status, 'unclear',
  'too few baseline samples are inconclusive')

const randomized = shuffledIdentityLights(() => .37)
assert.equal(randomized.length, 3)
assert.equal(new Set(randomized.map(color => color.id)).size, 3, 'randomized light order contains no repeated color')
assert.deepEqual(new Set(randomized.map(color => color.id)), new Set(IDENTITY_LIGHT_COLORS.map(color => color.id)))

console.log('Identity camera checks passed: object-fit cover framing, usable cheek samples, directional light response, and randomized nonrepeating colors.')
