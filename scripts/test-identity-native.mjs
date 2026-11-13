import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { identityPhotoFileUrl } from '../src/utils/identity-photo-path.mjs'
import { createIdentityNativeFlow } from '../src/utils/identity-native-flow.mjs'
import { createIdentityBrightness } from '../src/utils/identity-brightness.mjs'
import { createWeixinIdentityLandmarks } from '../src/utils/identity-weixin-landmarks.mjs'
import { createWeixinIdentityDetector } from '../src/utils/identity-weixin-detector.mjs'
import { identityImageQualityHint, identityImageQualityIssue, identityQualityRegion, measureIdentityImageQuality } from '../src/utils/identity-image-quality.mjs'

const root = new URL('../', import.meta.url)
const video = { width: 640, height: 480 }, viewport = { width: 360, height: 640, guide: { width: .78, height: .82 } }
const CLEAR_QUALITY = { mean: 120, black: .02, dark: .08, clipped: 0, sharpness: 30, resolution: 80 }
const BAD_QUALITY = { mean: 0, black: 1, dark: 1, clipped: 0, sharpness: 0, resolution: 80 }
function face(cx = .5, cy = .5, width = .22, height = .55) {
  return [
    { x: cx - width / 2, y: cy - height / 2 }, { x: cx + width / 2, y: cy - height / 2 },
    { x: cx + width / 2, y: cy + height / 2 }, { x: cx - width / 2, y: cy + height / 2 }
  ]
}
const makeFrame = (overrides = {}) => ({ count: 1, points: face(), video, viewport, blink: 0, mouth: 0, color: [100, 100, 100], quality: CLEAR_QUALITY, ...overrides })
function completeAction(flow, order, first, time) {
  const active = action => action === 'blink' ? { blink: .8, mouth: 0 } : { blink: 0, mouth: .8 }
  let state
  for (let i = 0; i < 3; i++) state = flow.update(makeFrame(), time += 120)
  const signal = active(order[first])
  for (const frame of [signal, signal, {}, {}, {}]) {
    state = flow.update(makeFrame(frame), time += 120)
    if (state.progress > first) return { state, time }
  }
  throw new Error('action did not complete')
}
function completeActions(flow, order) {
  let time = 0, state
  for (let index = 0; index < order.length; index++) ({ state, time } = completeAction(flow, order, index, time))
  return { state, time }
}

// A bad image after both requested actions preserves progress, pauses capture,
// and requires three consecutive good neutral frames before the photo proceeds.
{
  const flow = createIdentityNativeFlow(['blink', 'mouth'])
  let { state, time } = completeActions(flow, ['blink', 'mouth'])
  assert.equal(state.progress, 2, 'both actions complete before image-quality gating')
  assert.equal(state.capture, undefined, 'actions alone never capture')

  // Color calibration must ignore exposure/blur metrics; its colored overlay
  // changes the measured pixels and should not produce a quality warning.
  for (let i = 0; i < 9; i++) {
    state = flow.update(makeFrame({ quality: BAD_QUALITY }), time += 300)
    assert.equal(state.title, '请保持不动', 'bad image metrics do not interrupt light calibration')
    if (i < 8) assert.match(state.detail, /柔光调整中/)
    else assert.doesNotMatch(state.detail, /请检查镜头|光线充足|强光和逆光|正在调整画面/,
      'finishing the last light stage does not mistake the overlay for poor capture quality')
    assert.equal(state.capture, undefined)
  }

  state = flow.update(makeFrame({ quality: BAD_QUALITY }), time += 900)
  assert.equal(state.ready, false, 'poor final-photo quality pauses the flow')
  assert.equal(state.title, '请检查镜头是否被遮挡')
  assert.equal(state.capture, undefined, 'poor quality never captures')
  assert.equal(state.progress, 2, 'poor quality does not discard completed actions')

  for (let i = 0; i < 2; i++) {
    state = flow.update(makeFrame({ quality: CLEAR_QUALITY }), time += 120)
    assert.equal(state.capture, undefined, 'fewer than three good frames cannot capture')
  }
  state = flow.update(makeFrame({ quality: undefined }), time += 120)
  assert.equal(state.ready, false, 'missing quality metrics cannot capture')
  assert.equal(state.title, '正在调整画面，请稍候')
  assert.equal(state.capture, undefined)
  assert.equal(state.progress, 2)

  for (let i = 0; i < 2; i++) {
    state = flow.update(makeFrame({ quality: CLEAR_QUALITY }), time += 120)
    assert.equal(state.capture, undefined, 'recovery counter restarts after missing metrics')
    assert.equal(state.progress, 2)
  }
  state = flow.update(makeFrame({ quality: CLEAR_QUALITY }), time += 120)
  assert.equal(state.capture, true, 'three consecutive good frames resume capture')
  assert.equal(state.progress, 2, 'capture retains completed action progress')
}

// Native adapters now supply per-eye scores; the weaker lens must not erase
// a real bilateral blink, while both closure and reopening remain mandatory.
{
  const flow = createIdentityNativeFlow(['blink', 'mouth'])
  let time = 0, state
  for (let i = 0; i < 3; i++) flow.update(makeFrame({ blink: .1, blinkLeft: .1, blinkRight: .1 }), time += 120)
  for (let i = 0; i < 2; i++) state = flow.update(makeFrame({ blink: .25, blinkLeft: .80, blinkRight: .25 }), time += 120)
  assert.equal(state.progress, 0, 'closure alone does not finish the blink')
  for (let i = 0; i < 2; i++) state = flow.update(makeFrame({ blink: .1, blinkLeft: .1, blinkRight: .1 }), time += 120)
  assert.equal(state.progress, 1, 'the real native flow consumes both-eye scores with limited lens compensation')
}

{
  const flow = createIdentityNativeFlow(['blink', 'mouth'])
  let time = 0, state
  for (let i = 0; i < 4; i++) flow.update(makeFrame({ count: 0, points: [], blinkLeft: 0, blinkRight: 0 }), time += 120)
  for (let i = 0; i < 6; i++) state = flow.update(makeFrame({ blink: .03, blinkLeft: .03, blinkRight: .22 }), time += 120)
  for (let i = 0; i < 3; i++) flow.update(makeFrame({ blink: .22, blinkLeft: .95, blinkRight: .22 }), time += 120)
  for (let i = 0; i < 3; i++) state = flow.update(makeFrame({ blink: .03, blinkLeft: .03, blinkRight: .22 }), time += 120)
  assert.equal(state.progress, 0, 'no-face placeholder scores cannot establish the per-eye open baseline')
}

// A partially sampled blink must not combine across a short no-face gap.
{
  const flow = createIdentityNativeFlow(['blink', 'mouth'])
  let time = 0, state
  for (let i = 0; i < 3; i++) state = flow.update(makeFrame(), time += 120)
  state = flow.update(makeFrame({ blink: .8 }), time += 120)
  assert.equal(state.progress, 0, 'one closure frame is only a partial blink')
  flow.update(makeFrame({ count: 0, points: [] }), time += 120)
  for (let i = 0; i < 3; i++) state = flow.update(makeFrame(), time += 120)
  flow.update(makeFrame({ blink: .8 }), time += 120)
  flow.update(makeFrame(), time += 120); state = flow.update(makeFrame(), time += 120)
  assert.equal(state.progress, 0, 'the recovered eye opening cannot complete the pre-gap partial blink')
}

// Holding the mouth open completes its action immediately, then gets explicit
// neutral-expression guidance before a photo can be captured.
{
  const flow = createIdentityNativeFlow(['blink', 'mouth'])
  let { time } = completeAction(flow, ['blink', 'mouth'], 0, 0)
  let state = flow.update(makeFrame({ mouth: .8 }), time += 120)
  assert.equal(state.progress, 1, 'one open-mouth frame is insufficient')
  state = flow.update(makeFrame({ mouth: .8 }), time += 120)
  assert.equal(state.progress, 2, 'two valid open-mouth frames complete the action without closure')
  const expanded = face(.5, .5, .22, .86)
  for (let i = 0; i < 24; i++) {
    state = flow.update(makeFrame({ mouth: .8, points: expanded }), time += 120)
    assert.equal(state.progress, 2, 'a held-open mouth does not reset completed actions during lighting')
    assert.equal(state.capture, undefined, 'an open-mouth photo is never captured')
  }
  assert.equal(state.title, '请恢复自然表情', 'settle gives clear next instructions instead of staying on open-mouth')
  assert.match(state.detail, /自然闭嘴/)
  for (let i = 0; i < 10; i++) state = flow.update(makeFrame(), time += 120)
  assert.equal(state.capture, true, 'a neutral, strictly framed photo can finish after closing the mouth')
}
{
  const flow = createIdentityNativeFlow(['mouth', 'blink'])
  let time = 0, state
  for (let i = 0; i < 3; i++) flow.update(makeFrame(), time += 120)
  flow.update(makeFrame({ mouth: .8 }), time += 120)
  state = flow.update(makeFrame({ mouth: .8 }), time += 120)
  assert.equal(state.progress, 1)
  assert.equal(state.title, '请缓慢眨眼', 'the next instruction appears while the mouth is still open')
  for (let i = 0; i < 2; i++) flow.update(makeFrame({ blink: .8, mouth: .8 }), time += 120)
  for (let i = 0; i < 2; i++) state = flow.update(makeFrame({ mouth: .8 }), time += 120)
  assert.equal(state.progress, 2, 'the following blink step does not wait for mouth closure either')
}

for (const order of [['blink', 'mouth'], ['mouth', 'blink']]) {
  const flow = createIdentityNativeFlow(order)
  const complete = completeActions(flow, order)
  assert.equal(complete.state.capture, undefined, 'action completion cannot skip light calibration and settle')
  let time = complete.time
  // The current light stage must remain in the light phase until its time window elapses.
  for (let stage = 0; stage < 3; stage++) {
    let state = flow.update(makeFrame(), time += 400)
    assert.equal(state.capture, undefined, 'a light stage never captures directly')
    state = flow.update(makeFrame(), time += 400)
    assert.equal(state.capture, undefined, 'all light stages finish before settle')
  }
  let state = flow.update(makeFrame(), time += 899)
  assert.equal(state.capture, undefined, 'white settle requires 900 ms')
  state = flow.update(makeFrame(), time += 1)
  assert.equal(state.capture, undefined, 'settle also requires three neutral frames')
  state = flow.update(makeFrame(), time += 120)
  assert.equal(state.capture, undefined)
  state = flow.update(makeFrame(), time += 120)
  assert.equal(state.capture, true, `random order ${order.join(',')} completes only after light and stable settle`)
}

{
  const order = ['mouth', 'blink'], flow = createIdentityNativeFlow(order)
  let { state, time } = completeAction(flow, order, 0, 0)
  assert.equal(state.progress, 1, 'first action is complete before moving briefly out of frame')
  state = flow.update(makeFrame({ points: face(.61, .5) }), time += 120)
  assert.equal(state.ready, false, 'brief face displacement pauses the flow')
  assert.equal(state.progress, 1, 'a brief framing pause keeps completed action progress visible')
  state = flow.update(makeFrame({ count: 0, points: [] }), time += 120)
  assert.equal(state.detail, '请缓慢调整，保持脸部完整清晰', 'one missing frame preserves prior progress')
  flow.update(makeFrame(), time += 120)
  state = flow.update(makeFrame(), time += 120)
  assert.equal(state.progress, 1, 'completed action index is retained after two ready frames')
  for (let i = 0; i < 3; i++) state = flow.update(makeFrame(), time += 120)
  for (let i = 0; i < 2; i++) state = flow.update(makeFrame({ blink: .8 }), time += 120)
  for (let i = 0; i < 3; i++) state = flow.update(makeFrame(), time += 120)
  assert.equal(state.title, '请保持不动', 'the second action continues after the brief interruption')
}

{
  const order = ['mouth', 'blink'], flow = createIdentityNativeFlow(order)
  let { state, time } = completeAction(flow, order, 0, 0)
  assert.equal(state.progress, 1)
  state = flow.update(makeFrame({ count: 2, points: [] }), time += 120)
  assert.equal(state.detail, '调整后重新开始动作', 'multiple faces trigger an immediate reset')
  assert.equal(state.progress, 0, 'multiple faces immediately clear completed action progress')
  flow.update(makeFrame(), time += 120)
  state = flow.update(makeFrame(), time += 120)
  for (let i = 0; i < 3; i++) state = flow.update(makeFrame(), time += 120)
  assert.equal(state.progress, 0, 'reset starts the action sequence over')
}

{
  const callbacks = [], sets = []
  const api = {
    getScreenBrightness(options) { callbacks.push(options) },
    setScreenBrightness(options) { sets.push(options) }
  }
  const delayedGet = createIdentityBrightness(api)
  delayedGet.start(); delayedGet.close()
  callbacks[0].success({ value: .35 })
  assert.equal(sets.length, 0, 'a delayed brightness read after cancellation cannot brighten the page')

  const delayedSet = createIdentityBrightness(api)
  delayedSet.start(); callbacks[1].success({ value: .42 })
  assert.equal(sets[0].value, 1)
  delayedSet.close()
  assert.equal(sets[1].value, .42, 'cancellation restores the saved screen brightness')
  sets[0].success()
  assert.equal(sets[2].value, .42, 'a late brightness-set completion restores the old value again')
}

{
  const inits = [], stops = []
  const detector = createWeixinIdentityDetector({
    initFaceDetect(options) { inits.push(options) },
    stopFaceDetect(options) { stops.push(options); options.complete() }
  })
  const oldAcquire = detector.acquire('old-page')
  const newAcquire = detector.acquire('new-page')
  detector.release('old-page')
  inits[0].success()
  assert.equal(await oldAcquire, false, 'an old page cannot retain detector ownership after a newer acquire')
  assert.equal(await newAcquire, true, 'the newest page acquires the shared detector')
  assert.equal(stops.length, 0, 'a late old-page release does not stop the new page detector')
  detector.release('new-page')
  assert.equal(stops.length, 1, 'the current owner stops the detector on release')
  await new Promise(resolve => setTimeout(resolve, 0))

  const closingAcquire = detector.acquire('closing-page')
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(inits.length, 2, 'a detector stopped by its owner is initialized for the next owner')
  detector.release('closing-page')
  inits[1].success()
  assert.equal(await closingAcquire, false, 'release during initialization prevents acquisition')
  assert.equal(stops.length, 2, 'release during initialization waits for init and then stops the detector')
}

function syntheticWeixinFace(action = 'neutral', mirrored = false, pose = 'neutral', mouthThickness = null) {
  // Unassigned landmarks follow the face outline, away from the eye and mouth patches.
  const points = Array.from({ length: 106 }, (_, i) => {
    const angle = 2 * Math.PI * i / 106
    return { x: .5 + .32 * Math.cos(angle), y: .5 + .39 * Math.sin(angle) }
  })
  points[104] = { x: .4, y: .35 }; points[105] = { x: .6, y: .35 }
  points[45] = { x: .5, y: .52 }; points[98] = { x: .5, y: .68 }
  const put = (point, index) => { points[index] = point }
  let index = 0
  for (const center of [.4, .6]) for (let i = 0; i < 8; i++) {
    const column = i % 4, row = Math.floor(i / 4)
    while ([45, 98, 104, 105].includes(index)) index++
    const eyeOpen = action === 'blink'
    put({ x: center + (column - 1.5) * .025, y: .35 + (row - .5) * (eyeOpen ? .006 : .03) }, index++)
  }
  for (let i = 0; i < 19; i++) {
    const column = i % 7, row = Math.floor(i / 7)
    while ([45, 98, 104, 105].includes(index)) index++
    const mouthOpen = action === 'mouth'
    const verticalSpread = mouthOpen ? .11 : mouthThickness ?? .0001
    put({ x: .5 + (column - 3) * .025, y: .68 + (row - 1) * verticalSpread }, index++)
  }
  if (pose === 'tilted') for (const point of points) {
    const dx = point.x - .5, dy = point.y - .5, angle = .4
    point.x = .5 + dx * Math.cos(angle) - dy * Math.sin(angle)
    point.y = .5 + dx * Math.sin(angle) + dy * Math.cos(angle)
  }
  if (mirrored) for (const point of points) point.x = 1 - point.x
  return points
}
function calibratedLandmarks() {
  const landmarks = createWeixinIdentityLandmarks()
  let result
  for (let i = 0; i < 7; i++) result = landmarks.update(syntheticWeixinFace('neutral'), 640, 480)
  return { landmarks, result }
}
{
  const { landmarks, result } = calibratedLandmarks()
  assert.equal(result.calibrated, true, 'synthetic neutral face calibrates from stable landmarks')
  assert.equal(result.mouth, 0, 'an extremely thin closed-mouth contour remains a valid neutral baseline')
  const opened = landmarks.update(syntheticWeixinFace('mouth'), 640, 480)
  assert.ok(opened?.calibrated && opened.mouth > .5, 'calibrated mouth geometry detects an open-mouth action')
  assert.equal(landmarks.update(syntheticWeixinFace('neutral').slice(0, 105), 640, 480), null,
    'unknown landmark layout is rejected instead of progressing')
  assert.equal(landmarks.update(syntheticWeixinFace('neutral'), 640, 480).calibrated, false,
    'rejecting a layout resets neutral calibration')

  const recovery = createWeixinIdentityLandmarks()
  const tilted = recovery.update(syntheticWeixinFace('neutral', false, 'tilted'), 640, 480)
  assert.equal(tilted?.calibrated, false, 'a temporary pose mismatch pauses calibration without being treated as a foreign layout')
  assert.equal(recovery.getIssue(), 'face-alignment', 'diagnostics retain only a reason code for pose mismatch')
  let recovered
  for (let i = 0; i < 7; i++) recovered = recovery.update(syntheticWeixinFace('neutral'), 640, 480)
  assert.equal(recovered?.calibrated, true, 'the same landmark tracker recovers after the face returns to a usable pose')
  assert.equal(recovery.getIssue(), 'ready', 'successful recovery clears the prior pose reason')
  const recoveredOpen = recovery.update(syntheticWeixinFace('mouth'), 640, 480)
  assert.ok(recoveredOpen?.calibrated && recoveredOpen.mouth > .5, 'mouth action detection resumes after pose recovery')

  const mirrored = createWeixinIdentityLandmarks()
  let mirroredResult
  for (let i = 0; i < 7; i++) mirroredResult = mirrored.update(syntheticWeixinFace('neutral', true), 640, 480)
  assert.equal(mirroredResult.calibrated, true, 'a mirrored neutral face calibrates after folding the pupil-axis angle')
  const mirroredOpen = mirrored.update(syntheticWeixinFace('mouth', true), 640, 480)
  assert.ok(mirroredOpen?.calibrated && mirroredOpen.mouth > .5, 'a mirrored face still detects the mouth action')
}

// The calibration tolerates a thick but stable neutral contour, scores the
// same static contour as closed, and waits through unstable mouth geometry.
{
  const stableThick = createWeixinIdentityLandmarks()
  let state
  for (let i = 0; i < 7; i++) state = stableThick.update(syntheticWeixinFace('neutral', false, 'neutral', .08), 640, 480)
  assert.equal(state?.calibrated, true, 'a stable neutral contour above the old fixed .42 ratio can calibrate')
  assert.equal(state.mouth, 0, 'the learned thick baseline alone is not scored as an open mouth')
  state = stableThick.update(syntheticWeixinFace('neutral', false, 'neutral', .08), 640, 480)
  assert.equal(state?.calibrated, true); assert.equal(state.mouth, 0, 'identical frames remain neutral after calibration')
  const opened = stableThick.update(syntheticWeixinFace('mouth'), 640, 480)
  assert.ok(opened?.calibrated && opened.mouth > .5, 'additional mouth opening is detected relative to the learned baseline')

  const varying = createWeixinIdentityLandmarks()
  for (let i = 0; i < 12; i++) {
    state = varying.update(syntheticWeixinFace('neutral', false, 'neutral', i % 2 ? .04 : .08), 640, 480)
    assert.equal(state?.calibrated, false, 'a changing mouth contour cannot become the neutral baseline')
  }
  assert.equal(varying.getIssue(), 'neutral-mouth')
  for (let i = 0; i < 7; i++) state = varying.update(syntheticWeixinFace('neutral', false, 'neutral', .08), 640, 480)
  assert.equal(state?.calibrated, true, 'a stable contour can recover after neutral mouth movement settles')
}

function conditional(source, target) {
  const stack = [true], result = []
  for (const line of source.split(/\r?\n/)) {
    const start = line.match(/(?:\/\/|<!--)\s*#(ifdef|ifndef)\s+(.+?)\s*$/)
    if (start) {
      const targets = start[2].split(/\s*\|\|\s*/).map(value => value.trim())
      stack.push(stack[stack.length - 1] && (start[1] === 'ifdef' ? targets.includes(target) : !targets.includes(target)))
      continue
    }
    if (/(?:\/\/|<!--)\s*#endif/.test(line)) { stack.pop(); continue }
    if (stack.at(-1)) result.push(line)
  }
  assert.equal(stack.length, 1)
  return result.join('\n')
}

// Run the H5 adapter's actual final-canvas capture function with synthetic quality samples.
{
  const source = readFileSync(new URL('src/utils/identity-camera-h5.js', root), 'utf8')
  const start = source.indexOf('async function capture(points) {')
  const end = source.indexOf('\n    const sampleColor', start)
  assert.ok(start >= 0 && end > start, 'H5 final-capture implementation is present')
  const captureSource = source.slice(start, end)
  const clear = { mean: 120, black: .02, dark: .08, clipped: 0, sharpness: 30, resolution: 80 }
  const blurred = { mean: 130, black: 0, dark: 0, clipped: 0, sharpness: 0, resolution: 80 }
  let sample = blurred, sampledPoints, finished = [], retries = []
  const context = vm.createContext({
    video: { videoWidth: 128, videoHeight: 128 }, taking: false, closed: false, lightFeedback: 'not_run',
    footerHint: {}, settledFrames: 3,
    document: { createElement: () => ({ width: 0, height: 0,
      getContext: () => ({ drawImage() {} }), toBlob: callback => callback({ size: 100 }) }) },
    sampleQuality: (_canvas, points) => { sampledPoints = points; return sample },
    identityImageQualityIssue, identityImageQualityHint,
    showInstruction() {}, text() {},
    retryQuality(issue) { retries.push(issue); context.taking = false; context.settledFrames = 0 },
    finish(result, error) { finished.push({ result, error }); context.closed = true }
  })
  vm.runInContext(`${captureSource}\nglobalThis.runCapture = capture`, context)
  const points = [{ x: .2, y: .2 }, { x: .8, y: .8 }]
  await context.runCapture(points)
  assert.equal(sampledPoints, points, 'the latest face points define final-canvas quality sampling')
  assert.deepEqual(retries, ['blur'], 'a final canvas failing the still-quality check requests another image')
  assert.equal(context.taking, false); assert.equal(context.closed, false)
  assert.equal(finished.length, 0)

  sample = clear
  await context.runCapture(points)
  assert.equal(finished.length, 1, 'a clear final canvas returns the image')
  assert.equal(finished[0].result.file.size, 100)
  assert.equal(context.closed, true)
}
{
  const source = conditional(readFileSync(new URL('src/api/identity.js', root), 'utf8'), 'APP-PLUS')
    .replace(/^import .*$/gm, '').replace(/^export /gm, '')
  let uploadOptions, behavior
  const context = vm.createContext({ baseUrl: 'https://identity.test',
    uni: { getStorageSync: key => key === 'token' ? 'native-fake-token' : '', uploadFile(options) {
      uploadOptions = options
      if (behavior === 'success') options.success({ data: JSON.stringify({ code: 0, data: { verified: true } }) })
      if (behavior === 'bad-json') options.success({ data: 'not-json' })
      if (behavior === 'bad-response') options.success({ data: JSON.stringify({ code: 17, msg: 'mock rejected' }) })
      if (behavior === 'failure') options.fail(new Error('mock network failure'))
    } } })
  vm.runInContext(`${source}\nglobalThis.submitIdentityNative = submitIdentity`, context)
  const fields = { challengeId: 'offline-challenge', consentVersion: 'v2', name: '测试姓名', number: '110101199001010015' }
  behavior = 'success'
  const result = await context.submitIdentityNative(fields, { path: '/offline/captured.jpg' })
  assert.equal(result.verified, true)
  assert.equal(uploadOptions.url, 'https://identity.test/api/identity/verify')
  assert.equal(uploadOptions.filePath, '/offline/captured.jpg')
  assert.equal(uploadOptions.name, 'file')
  assert.deepEqual({ ...uploadOptions.formData }, fields)
  assert.equal(uploadOptions.header.Authorization, 'Bearer native-fake-token')
  assert.equal(uploadOptions.timeout, 30000)
  behavior = 'bad-json'
  await assert.rejects(context.submitIdentityNative(fields, { path: '/offline/captured.jpg' }), /未取得认证结果/)
  behavior = 'bad-response'
  await assert.rejects(context.submitIdentityNative(fields, { path: '/offline/captured.jpg' }), /mock rejected/)
  behavior = 'failure'
  await assert.rejects(context.submitIdentityNative(fields, { path: '/offline/captured.jpg' }), /未取得认证结果/)
}

// Exercise the Weixin adapter's actual encoded-still quality gate without a camera.
{
  const pageSource = readFileSync(new URL('src/pages-nonTheme/identity-camera.vue', root), 'utf8')
  const script = pageSource.match(/<script>([\s\S]*?)<\/script>/)[1]
  const isolated = conditional(script, 'MP-WEIXIN')
    .replace(/^import .*$/gm, '')
    .replace('export default {', 'globalThis.wxCameraComponent = {')
  let imagePath = '', drawnPath = '', unlinked = [], events = [], navigations = 0, releases = 0
  const rgba = (width, height, sample) => {
    const data = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const [r, g, b] = sample(x, y), i = (y * width + x) * 4
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255
    }
    return { data, width, height }
  }
  const context = vm.createContext({
    wx: { createOffscreenCanvas() {
      let currentPath = ''
      const image = { width: 128, height: 128, onload: null, onerror: null }
      Object.defineProperty(image, 'src', { set(value) { currentPath = value; image.path = value; queueMicrotask(() => image.onload?.()) } })
      const canvasContext = {
        drawImage(source) { drawnPath = source.path },
        getImageData(_x, _y, width, height) {
          return currentPath.includes('bad')
            ? rgba(width, height, () => [130, 130, 130])
            : rgba(width, height, (x, y) => { const v = ((x >> 3) + (y >> 3)) & 1 ? 148 : 92; return [v, v, v] })
        }
      }
      return { width: 1, height: 1, createImage: () => image, getContext: () => canvasContext }
    } },
    uni: {
      getFileSystemManager: () => ({ unlink: ({ filePath, fail }) => { unlinked.push(filePath); fail?.() } }),
      navigateBack: () => { navigations++ }
    },
    identityImageQualityHint, identityImageQualityIssue, identityQualityRegion, measureIdentityImageQuality,
    createIdentityNativeFlow: () => ({}), createWeixinIdentityLandmarks: () => ({}),
    createIdentityBrightness: () => ({}), createWeixinIdentityDetector: () => ({}),
    setTimeout, clearTimeout, Date, queueMicrotask
  })
  vm.runInContext(isolated, context)
  const methods = context.wxCameraComponent.methods
  const captured = [], retryCalls = []
  const page = {
    closed: false, taking: false, display: { progress: 2 }, camera: { takePhoto: options => captured.push(options) },
    channel: { emit: (...args) => events.push(args) },
    flow: { retryImage: time => retryCalls.push(time) },
    release: () => { releases++ }
  }
  page.photoQuality = methods.photoQuality
  page.retryQuality = methods.retryQuality
  page.notify = methods.notify
  page.finish = methods.finish
  const points = [{ x: .1, y: .1 }, { x: .9, y: .9 }]
  methods.takePhoto.call(page, points)
  await captured[0].success({ tempImagePath: '/synthetic/bad-still.jpg' })
  assert.equal(drawnPath, '/synthetic/bad-still.jpg', 'the actual still path is decoded for quality measurement')
  assert.deepEqual(unlinked, ['/synthetic/bad-still.jpg'], 'a rejected still is deleted')
  assert.equal(page.taking, false, 'a rejected still allows another capture attempt')
  assert.equal(page.closed, false, 'poor still quality does not end the camera flow')
  assert.equal(retryCalls.length, 1, 'poor still quality restarts the native flow settle gate')
  assert.equal(page.display.title, '请保持手机平稳', 'blur guidance is shown after rejecting the still')
  assert.equal(events.length, 0)

  methods.takePhoto.call(page, points)
  await captured[1].success({ tempImagePath: '/synthetic/clear-still.jpg' })
  assert.equal(drawnPath, '/synthetic/clear-still.jpg')
  assert.equal(page.closed, true, 'a good encoded still completes normally')
  assert.equal(events[0][0], 'captured')
  assert.equal(events[0][1].path, '/synthetic/clear-still.jpg')
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(navigations, 1); assert.equal(releases, 1)
}

{
  const source = conditional(readFileSync(new URL('src/utils/identity-camera-app.js', root), 'utf8'), 'APP-PLUS')
    .replace(/^import .*$/gm, '').replace(/^export /gm, '')
  let eventHandler, downloadSuccess, nextDownload = 'deferred', imageBehavior = 'success', imageCallback, openCount = 0, activeOptions
  const removed = [], updates = [], closes = []
  const context = vm.createContext({ identityPhotoFileUrl, baseUrl: 'https://identity.test', createIdentityNativeFlow: () => ({ update: () => ({}), toggleLight: () => ({}) }),
    clearTimeout, setTimeout,
    uni: {
      getStorageSync: () => '', setStorageSync() {}, removeStorageSync() {}, onAppHide() {}, offAppHide() {},
      downloadFile(options) {
        if (nextDownload === 'html') options.success({ statusCode: 200, tempFilePath: '/tmp/html', header: { 'Content-Type': 'text/html; charset=utf-8' } })
        else if (nextDownload === 'immediate' || nextDownload === 'small') options.success({ statusCode: 200, tempFilePath: '/tmp/model' })
        else downloadSuccess = options.success
      },
      getFileInfo(options) { options.success({ size: nextDownload === 'small' ? 9950 : 3758596 }) },
      getImageInfo(options) {
        assert.match(options.src, /^file:\/\//, 'the image reader receives a file URL')
        if (imageBehavior === 'deferred') imageCallback = options.success
        else if (imageBehavior === 'failure') options.fail({})
        else options.success({ width: 480, height: 640 })
      },
      saveFile(options) { options.success({ savedFilePath: '/saved/model' }) }
    },
    plus: { io: {
      resolveLocalFileSystemURL(path, success) { success({ path, remove: done => { removed.push(path); done?.() } }) },
      convertLocalFileSystemURL: path => path
    } },
    onIdentityCaptureEvent(handler) { eventHandler = handler },
    openIdentityCapture(serialized) { openCount++; activeOptions = JSON.parse(serialized) },
    updateIdentityCapture(serialized) { updates.push(JSON.parse(serialized)) },
    closeIdentityCapture(id) { closes.push(id) }
  })
  vm.runInContext(`${source}\nglobalThis.captureApp = captureIdentityAppPhoto; globalThis.cancelApp = cancelIdentityAppCapture`, context)
  const lateInit = context.captureApp({ actions: ['blink', 'mouth'] })
  await new Promise(resolve => setTimeout(resolve, 0))
  context.cancelApp()
  await assert.rejects(lateInit, error => error.cancelled === true)
  downloadSuccess({ statusCode: 200, tempFilePath: '/tmp/late-model' })
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(openCount, 0, 'resolving a model download after cancel cannot open the native camera')

  nextDownload = 'immediate'
  const currentCapture = context.captureApp({ actions: ['mouth', 'blink'] })
  await new Promise(resolve => setTimeout(resolve, 0))
  const currentId = activeOptions.id
  eventHandler(JSON.stringify({ id: 'identity-old-session', type: 'photo', path: '/tmp/old-photo' }))
  assert.deepEqual(removed, ['file:///tmp/old-photo'], 'a photo event from an old session is deleted')
  assert.equal(closes.length, 1, 'an old-session event cannot close the current capture')
  eventHandler(JSON.stringify({ id: currentId, type: 'photo', path: '/tmp/current-photo' }))
  const captured = await currentCapture
  assert.equal(captured.path, '/tmp/current-photo', 'the upload keeps the original filesystem path')
  assert.equal(captured.preview, 'file:///tmp/current-photo', 'the image view receives a displayable file URL')
  assert.equal(identityPhotoFileUrl(captured.preview), captured.preview, 'existing file URLs are not prefixed twice')
  imageBehavior = 'failure'
  const invalidPhoto = context.captureApp({})
  await new Promise(resolve => setTimeout(resolve, 0))
  eventHandler(JSON.stringify({ id: activeOptions.id, type: 'photo', path: '/tmp/unreadable-photo' }))
  await assert.rejects(invalidPhoto, /认证照片读取失败/, 'unreadable native photos cannot reach the form')
  assert.equal(removed.at(-1), 'file:///tmp/unreadable-photo', 'unreadable captures are cleaned up')
  imageBehavior = 'deferred'
  const cancelledRead = context.captureApp({})
  await new Promise(resolve => setTimeout(resolve, 0))
  eventHandler(JSON.stringify({ id: activeOptions.id, type: 'photo', path: '/tmp/late-read-photo' }))
  context.cancelApp()
  await assert.rejects(cancelledRead, error => error.cancelled === true)
  imageCallback({ width: 480, height: 640 })
  assert.equal(removed.at(-1), 'file:///tmp/late-read-photo', 'a photo read completing after cancellation is deleted')
  assert.equal(openCount, 3)
  nextDownload = 'html'
  await assert.rejects(context.captureApp({}), /认证暂不可用/, 'HTTP 200 HTML fallback cannot open the camera or be cached as a model')
  nextDownload = 'small'
  await assert.rejects(context.captureApp({}), /认证暂不可用/, 'HTML fallback with missing response headers is rejected by file size')
  assert.equal(openCount, 3)
}

console.log('Identity native checks passed: shared action flow, delayed brightness cleanup, Weixin landmarks, and authenticated upload handling.')
