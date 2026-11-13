import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  IDENTITY_LIGHT_COLORS,
  createIdentityFramingGuard,
  identityCheekColor,
  identityFaceFrame,
  identityLightResponse,
  shuffledIdentityLights
} from '../src/utils/identity-camera-checks.mjs'
import { identityBlinkScore, createIdentityBlinkTracker } from '../src/utils/identity-blink.mjs'
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
// The inner native oval and checks share the exact normalized guide size.
const nativeViewport = { width: 312, height: 400, guide: { width: .78, height: .82 } }
const portrait = { width: 312, height: 400 }
assert.equal(identityFaceFrame(face(.5, .5, .60, .70), portrait, nativeViewport).ready, true)
assert.equal(identityFaceFrame(face(.5, .5, .78, .85), portrait, nativeViewport).hint, '请稍微离远一点',
  'a face fitting only the outer preview is not treated as fitting the inner guide')
assert.equal(identityFaceFrame(face(.64, .5, .50, .60), portrait, nativeViewport).hint, '请将脸部移到框中央',
  'center displacement is mapped into the same inner guide coordinates')
// Use the actual native UI target ratios: filling the visible outline must
// pass the initial/final strict check without being told to move farther away.
const uiSource = readFileSync(new URL('../src/uni_modules/ftx-identity-capture/utssdk/app-android/IdentityCaptureUi.kt', import.meta.url), 'utf8')
const acceptedWidth = Number(uiSource.match(/val guideWidth = ([.\d]+)f/)[1])
const acceptedHeight = Number(uiSource.match(/val guideHeight = ([.\d]+)f/)[1])
const targetScale = Number(uiSource.match(/preview, guideWidth \* ([.\d]+)f, guideHeight \*/)[1])
const drawnViewport = { ...portrait, guide: { width: acceptedWidth, height: acceptedHeight } }
for (const oversize of [1, 1.05]) {
  assert.equal(identityFaceFrame(face(.5, .5, acceptedWidth * targetScale * oversize, acceptedHeight * targetScale * oversize), portrait, drawnViewport).ready, true,
    'a centered face matching or slightly exceeding the drawn oval fits the unchanged accepted bounds')
}
const guideJaw = face(.5, .5, .60, .87)
assert.equal(identityFaceFrame(guideJaw, portrait, nativeViewport).ready, false)
assert.equal(identityFaceFrame(guideJaw, portrait, nativeViewport, { tracking: true }).ready, true,
  'mouth movement still has a larger tracking allowance inside the smaller guide')
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

{
  const warm = baseline => {
    const sequence = createIdentityActionSequence(['blink'])
    let time = 0
    const tick = (left, right = left) => sequence.update(identityBlinkScore(left, right), 0, time += 120)
    for (let i = 0; i < 3; i++) tick(baseline)
    return { tick }
  }
  const glasses = warm(.10)
  assert.equal(glasses.tick(.75, .23).index, 0)
  assert.equal(glasses.tick(.75, .23).index, 0, 'a sustained asymmetric bilateral closure still needs reopening')
  assert.equal(glasses.tick(.10).index, 0)
  assert.equal(glasses.tick(.10).index, 1, 'a partly obscured eye can complete the full blink cycle')
  const elevatedEyes = createIdentityBlinkTracker()
  for (let i = 0; i < 3; i++) assert.equal(elevatedEyes.update(.30, .28), 0,
    'usable elevated open-eye scores normalize to neutral instead of blocking calibration')
  assert.equal(elevatedEyes.update(.30, .28), 0, 'final neutral gating uses the same per-eye baseline')
  assert.ok(elevatedEyes.update(.80, .78) > .38, 'bilateral motion is measured relative to the calibrated open eyes')
  const invalidEyes = createIdentityBlinkTracker()
  for (let i = 0; i < 4; i++) assert.ok(invalidEyes.update(.9, .9) >= .25,
    'starting with closed eyes cannot establish an open-eye baseline')
  const eyeBaseline = createIdentityBlinkTracker()
  for (let i = 0; i < 3; i++) eyeBaseline.update(.03, .22)
  const offset = createIdentityActionSequence(['blink'])
  let offsetTime = 0
  for (let i = 0; i < 3; i++) offset.update(eyeBaseline.update(.03, .22), 0, offsetTime += 120)
  for (let i = 0; i < 3; i++) offset.update(eyeBaseline.update(.95, .22), 0, offsetTime += 120)
  for (let i = 0; i < 3; i++) assert.equal(offset.update(eyeBaseline.update(.03, .22), 0, offsetTime += 120).index, 0,
    'an unchanged lens offset cannot stand in for second-eye closure')
  const quick = warm(.08)
  assert.equal(quick.tick(.85).index, 0, 'one strong peak does not itself complete a blink')
  assert.equal(quick.tick(.08).index, 0)
  assert.equal(quick.tick(.08).index, 1, 'a short clear closure followed by two open frames completes')
  const noise = warm(.18)
  for (let i = 0; i < 5; i++) assert.equal(noise.tick(.40).index, 0, 'a small rise from an elevated glasses baseline is insufficient')
  assert.equal(noise.tick(.18).index, 0)
  for (const pair of [[.95, .03], [.03, .95]]) {
    const wink = warm(.05)
    for (let i = 0; i < 3; i++) wink.tick(...pair)
    for (let i = 0; i < 3; i++) assert.equal(wink.tick(.05).index, 0, 'one-sided closure/reflection cannot complete a blink')
  }
  const spike = warm(.05)
  spike.tick(.46); spike.tick(.05); spike.tick(.05)
  assert.equal(spike.tick(.05).index, 0, 'a single moderate spike cannot count as a blink')
  const interrupted = createIdentityActionSequence(['blink'])
  let t = 0
  for (let i = 0; i < 3; i++) interrupted.update(.05, 0, t += 120)
  interrupted.update(.85, 0, t += 120); interrupted.pause()
  for (let i = 0; i < 5; i++) assert.equal(interrupted.update(.05, 0, t += 120).index, 0, 'a blink cannot combine closure and reopening across a framing interruption')
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
