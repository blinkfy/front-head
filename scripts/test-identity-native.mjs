import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { createIdentityNativeFlow } from '../src/utils/identity-native-flow.mjs'
import { createIdentityBrightness } from '../src/utils/identity-brightness.mjs'
import { createWeixinIdentityLandmarks } from '../src/utils/identity-weixin-landmarks.mjs'
import { createWeixinIdentityDetector } from '../src/utils/identity-weixin-detector.mjs'

const root = new URL('../', import.meta.url)
const video = { width: 640, height: 480 }, viewport = { width: 360, height: 640 }
function face(cx = .5, cy = .5, width = .22, height = .55) {
  return [
    { x: cx - width / 2, y: cy - height / 2 }, { x: cx + width / 2, y: cy - height / 2 },
    { x: cx + width / 2, y: cy + height / 2 }, { x: cx - width / 2, y: cy + height / 2 }
  ]
}
const makeFrame = (overrides = {}) => ({ count: 1, points: face(), video, viewport, blink: 0, mouth: 0, color: [100, 100, 100], ...overrides })
function completeAction(flow, order, first, time) {
  const active = action => action === 'blink' ? { blink: .8, mouth: 0 } : { blink: 0, mouth: .8 }
  let state
  for (let i = 0; i < 3; i++) state = flow.update(makeFrame(), time += 120)
  const signal = active(order[first])
  state = flow.update(makeFrame(signal), time += 120)
  state = flow.update(makeFrame(signal), time += 120)
  for (let i = 0; i < 3; i++) state = flow.update(makeFrame(), time += 120)
  return { state, time }
}
function completeActions(flow, order) {
  let time = 0
  for (let index = 0; index < order.length; index++) time = completeAction(flow, order, index, time).time
  // The sequence reports done on the first neutral frame after its last recovery.
  return { state: flow.update(makeFrame(), time += 120), time }
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

function syntheticWeixinFace(action = 'neutral', mirrored = false) {
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
    put({ x: .5 + (column - 3) * .025, y: .68 + (row - 1) * (mouthOpen ? .11 : .012) }, index++)
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
  const opened = landmarks.update(syntheticWeixinFace('mouth'), 640, 480)
  assert.ok(opened?.calibrated && opened.mouth > .5, 'calibrated mouth geometry detects an open-mouth action')
  assert.equal(landmarks.update(syntheticWeixinFace('neutral').slice(0, 105), 640, 480), null,
    'unknown landmark layout is rejected instead of progressing')
  assert.equal(landmarks.update(syntheticWeixinFace('neutral'), 640, 480).calibrated, false,
    'rejecting a layout resets neutral calibration')

  const mirrored = createWeixinIdentityLandmarks()
  let mirroredResult
  for (let i = 0; i < 7; i++) mirroredResult = mirrored.update(syntheticWeixinFace('neutral', true), 640, 480)
  assert.equal(mirroredResult.calibrated, true, 'a mirrored neutral face calibrates after folding the pupil-axis angle')
  const mirroredOpen = mirrored.update(syntheticWeixinFace('mouth', true), 640, 480)
  assert.ok(mirroredOpen?.calibrated && mirroredOpen.mouth > .5, 'a mirrored face still detects the mouth action')
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

{
  const source = conditional(readFileSync(new URL('src/utils/identity-camera-app.js', root), 'utf8'), 'APP-PLUS')
    .replace(/^import .*$/gm, '').replace(/^export /gm, '')
  let eventHandler, downloadSuccess, nextDownload = 'deferred', openCount = 0, activeOptions
  const removed = [], updates = [], closes = []
  const context = vm.createContext({ baseUrl: 'https://identity.test', createIdentityNativeFlow: () => ({ update: () => ({}), toggleLight: () => ({}) }),
    clearTimeout, setTimeout,
    uni: {
      getStorageSync: () => '', setStorageSync() {}, removeStorageSync() {}, onAppHide() {}, offAppHide() {},
      downloadFile(options) {
        if (nextDownload === 'html') options.success({ statusCode: 200, tempFilePath: '/tmp/html', header: { 'Content-Type': 'text/html; charset=utf-8' } })
        else if (nextDownload === 'immediate' || nextDownload === 'small') options.success({ statusCode: 200, tempFilePath: '/tmp/model' })
        else downloadSuccess = options.success
      },
      getFileInfo(options) { options.success({ size: nextDownload === 'small' ? 9950 : 3758596 }) },
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
  assert.deepEqual(removed, ['/tmp/old-photo'], 'a photo event from an old session is deleted')
  assert.equal(closes.length, 1, 'an old-session event cannot close the current capture')
  eventHandler(JSON.stringify({ id: currentId, type: 'photo', path: '/tmp/current-photo' }))
  assert.equal((await currentCapture).path, '/tmp/current-photo', 'the current session photo still resolves')
  assert.equal(openCount, 1)
  nextDownload = 'html'
  await assert.rejects(context.captureApp({}), /认证拍摄暂不可用/, 'HTTP 200 HTML fallback cannot open the camera or be cached as a model')
  nextDownload = 'small'
  await assert.rejects(context.captureApp({}), /认证拍摄暂不可用/, 'HTML fallback with missing response headers is rejected by file size')
  assert.equal(openCount, 1)
}

console.log('Identity native checks passed: shared action flow, delayed brightness cleanup, Weixin landmarks, and authenticated upload handling.')
