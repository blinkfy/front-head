import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'
import { createIdentityActionSequence } from '../src/utils/identity-action-sequence.mjs'

const root = new URL('../', import.meta.url)
function conditional(source, target) {
  const stack = [true], result = []
  for (const line of source.split(/\r?\n/)) {
    const start = line.match(/(?:\/\/|<!--)\s*#(ifdef|ifndef)\s+(.+?)\s*$/)
    if (start) {
      const targets = start[2].split(/\s*\|\|\s*/).map(value => value.trim())
      const applies = start[1] === 'ifdef' ? targets.includes(target) : !targets.includes(target)
      stack.push(stack[stack.length - 1] && applies); continue
    }
    if (/(?:\/\/|<!--)\s*#endif/.test(line)) { stack.pop(); continue }
    if (stack[stack.length - 1]) result.push(line)
  }
  assert.equal(stack.length, 1)
  return result.join('\n')
}
for (const target of ['H5', 'APP-PLUS', 'MP-WEIXIN']) {
  for (const filename of ['src/pages-nonTheme/identity-verification.vue', 'src/pages-nonTheme/identity-camera.vue', 'src/pages-nonTheme/collector-apply.vue', 'src/pages-nonTheme/collector-workbench.vue', 'src/pages-nonTheme/edit-profile.vue']) {
    const source = conditional(readFileSync(new URL(filename, root), 'utf8'), target)
    const { descriptor, errors } = parse(source, { filename })
    assert.deepEqual(errors, [])
    compileScript(descriptor, { id: `${target}-identity` })
    assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename, id: `${target}-identity` }).errors, [])
    for (const style of descriptor.styles) assert.deepEqual(compileStyle({ source: style.content, filename, id: 'identity' }).errors, [])
  }
  const capture = conditional(readFileSync(new URL('src/utils/identity-capture.js', root), 'utf8'), target)
  if (target !== 'H5') {
    assert.equal(capture.includes('identity-camera-h5'), false, 'native bundles do not import client model runtime')
    assert.doesNotMatch(capture, /chooseImage|sourceType|album|FaceLandmarker|vision_bundle/, 'native path has no gallery bypass or H5 model runtime')
    if (target === 'APP-PLUS') assert.match(capture, /captureIdentityAppPhoto/)
    if (target === 'MP-WEIXIN') assert.match(capture, /navigateTo/)
  }
}

const identityPage = conditional(readFileSync(new URL('src/pages-nonTheme/identity-verification.vue', root), 'utf8'), 'H5')
const cameraSource = readFileSync(new URL('src/utils/identity-camera-h5.js', root), 'utf8')
const framingChecks = readFileSync(new URL('src/utils/identity-camera-checks.mjs', root), 'utf8')
assert.doesNotMatch(identityPage, /<switch\b|actionAssist/, 'action detection cannot be switched off')
assert.match(identityPage, /按提示完成检测动作/)
assert.doesNotMatch(identityPage, /本机处理|关键点|模型/, 'implementation details are absent from the capture disclosure')
assert.match(identityPage, /v-if="!handoffFailed"/, 'failed handoff hides the normal identity form')
assert.doesNotMatch(cameraSource, /data-capture|data-shutter|button\.onclick\s*=\s*capture|addEventListener\(['"]click['"]\s*,\s*capture/, 'there is no manual shutter bypass')
const actionDoneIndex = cameraSource.indexOf('if (state.done)')
const lightPhaseIndex = cameraSource.indexOf("phase = 'light'", actionDoneIndex)
const lightBranchIndex = cameraSource.indexOf("else if (phase === 'light')", lightPhaseIndex)
const settleBranchIndex = cameraSource.indexOf("else if (phase === 'settle')", lightBranchIndex)
assert.ok(actionDoneIndex >= 0 && lightPhaseIndex > actionDoneIndex && lightBranchIndex > lightPhaseIndex && settleBranchIndex > lightBranchIndex,
  'completed actions must transition through the light phase before settle')
assert.doesNotMatch(cameraSource.slice(actionDoneIndex, lightBranchIndex), /capture\(\)/, 'action completion alone cannot create a photo')
const settleSource = cameraSource.slice(settleBranchIndex)
assert.match(settleSource, /timestamp - settleStarted < 900\) \{ settledFrames = 0; return \}[\s\S]*?if \(settledFrames >= 3\) capture\(\)/,
  'automatic capture waits 900 ms, then three stable white-light frames')
assert.match(cameraSource, /else if \(phase === 'settle'\) beginSettle\(performance\.now\(\)\)/,
  'changing light during settle restarts the timer and neutral-frame count')
assert.match(cameraSource, /identityFaceFrame\(points,[\s\S]*?\{ tracking: trackingReady && phase === 'actions' \}\)/,
  'relaxed framing applies only after initial alignment and during action tracking')
assert.match(cameraSource, /framingGuard\.update\(faceCount, framing\.ready, timestamp\)/)
assert.match(cameraSource, /if \(tracking\.paused\) \{[\s\S]*?sequence\.pause\(\);[\s\S]*?return\s*\}/,
  'a brief framing interruption pauses action detection and returns before light or capture logic')
assert.match(cameraSource, /if \(tracking\.reset\) reset\(framing\.hint\)/,
  'sustained framing loss and multiple faces invoke the existing reset path')
assert.match(cameraSource, /if \(phase === 'light'\) \{ lightStages\[lightIndex\]\.samples = \[\]; stageStarted = timestamp \}/,
  'interrupted light samples and their stage clock are discarded')
assert.match(cameraSource, /if \(phase === 'settle'\) \{ settleStarted = timestamp; settledFrames = 0 \}/,
  'interrupted settle time and stable frames are discarded')
assert.match(cameraSource, /if \(tracking\.resumed\) \{[\s\S]*?if \(phase === 'light'\)[\s\S]*?stageStarted = timestamp; lightStages\[lightIndex\]\.samples = \[\][\s\S]*?else if \(phase === 'settle'\) beginSettle\(timestamp\)/,
  'resuming requires a fresh light stage or a new settle interval')
assert.match(framingChecks, /timestamp - interruptedAt >= 2500/)
assert.match(framingChecks, /timestamp - missingAt >= 1500/)
assert.match(framingChecks, /faceCount > 1/)
for (const actions of [['blink', 'mouth'], ['mouth', 'blink']]) {
  let timestamp = 0
  const sequence = createIdentityActionSequence(actions)
  const tick = (blink, mouth) => sequence.update(blink, mouth, timestamp += 120)
  const active = action => action === 'blink' ? [.8, 0] : [0, .8]
  const neutral = [0, 0]
  for (let n = 0; n < 3; n++) tick(...neutral)
  assert.equal(tick(...active(actions[1])).index, 0, 'wrong first action does not progress')
  tick(...active(actions[0])); tick(...active(actions[0])); tick(...neutral); tick(...neutral)
  assert.equal(tick(...neutral).index, 1)
  tick(...active(actions[1])); tick(...active(actions[1])); tick(...neutral); tick(...neutral)
  assert.equal(tick(...neutral).done, true, 'the requested random action order and neutral recovery are required')
}

function identityApiHarness() {
  const calls = [], saved = new Map()
  const context = vm.createContext({ baseUrl: 'https://identity.test',
    sessionStorage: { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) },
    uni: { getStorageSync: () => 'browser-token', request: options => calls.push(options) } })
  const apiSource = conditional(readFileSync(new URL('src/api/identity.js', root), 'utf8'), 'H5')
    .replace(/^import .*$/gm, '').replace(/^export /gm, '')
  vm.runInContext(`${apiSource}\nglobalThis.api = { exchangeIdentityWebSession, clearIdentityWebSession, identityWebContext }`, context)
  return { api: context.api, calls, saved }
}
{
  const h = identityApiHarness()
  const stale = h.api.exchangeIdentityWebSession('cleared-code')
  h.api.clearIdentityWebSession()
  h.calls[0].success({ data: { code: 0, data: { token: 'stale-token', expiresAt: new Date(Date.now() + 60000).toISOString(), account: '旧账号' } } })
  await assert.rejects(stale, error => error.cancelled === true)
  assert.equal(h.api.identityWebContext(), null, 'a response arriving after clear cannot restore the session')
  assert.equal(h.saved.has('identity-web-session'), false)
}
{
  const h = identityApiHarness()
  const requestA = h.api.exchangeIdentityWebSession('code-a')
  const requestB = h.api.exchangeIdentityWebSession('code-b')
  const expiresAt = new Date(Date.now() + 60000).toISOString()
  h.calls[1].success({ data: { code: 0, data: { token: 'token-b', expiresAt, account: '账号B' } } })
  await requestB
  h.calls[0].success({ data: { code: 0, data: { token: 'token-a', expiresAt, account: '账号A' } } })
  await assert.rejects(requestA, error => error.cancelled === true)
  assert.equal(h.api.identityWebContext().token, 'token-b', 'an older exchange completing last cannot replace the newer session')
}

const source = identityPage
const script = source.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '').replace('export default', 'globalThis.component =')
let response = { verified: false, available: true }, posts = 0, captureCalls = 0, cancelCalls = 0, discardedPhotos = [], completeActions
const context = vm.createContext({ RecyclingShell: {}, identityStatus: async () => response,
  identityChallenge: async () => ({ id: 'offline-task', consentVersion: 'offline-consent', actions: ['blink', 'mouth'] }),
  captureIdentityPhoto: async options => {
    captureCalls++
    assert.deepEqual(Array.from(options.actions), ['blink', 'mouth'])
    return new Promise(resolve => { completeActions = () => resolve({ file: { fake: true } }) })
  },
  submitIdentity: async () => { posts++; response = { verified: true, maskedName: '测*' }; return response },
  recycleBack() {}, cancelIdentityCapture() { cancelCalls++ }, discardIdentityPhoto(photo) { if (photo) discardedPhotos.push(photo) },
  URL: { createObjectURL: () => 'blob:offline', revokeObjectURL() {} }, clearTimeout, setTimeout,
  uni: { getStorageSync: () => '' },
  identityWebContext: () => ({ account: '浏览器已有账号', token: 'browser-token' }),
  exchangeIdentityWebSession: async code => { throw new Error(`拒绝handoff:${String(code)}`) },
  createIdentityWebSession: async () => ({ code: 'one-time' }), clearIdentityWebSession() {}, baseUrl: 'https://identity.test',
  history: { state: null, replaceState() {} }, location: { pathname: '/', search: '' } })
vm.runInContext(script, context)
const component = context.component, page = { ...component.data(), ...component.methods }
for (const [name, getter] of Object.entries(component.computed)) Object.defineProperty(page, name, { get: () => getter.call(page) })
await page.capture()
assert.equal(captureCalls, 0, 'no camera task without identity details and consent')
page.name = '测试姓名'; page.number = '110101199001010015'
await page.capture()
assert.equal(captureCalls, 0, 'consent is explicit')
page.consented = true
const pendingCapture = page.capture()
await new Promise(resolve => setTimeout(resolve, 0))
assert.equal(captureCalls, 1)
assert.equal(page.photo, null, 'no photo exists before device action completion')
assert.equal(page.preview, '')
completeActions()
await pendingCapture
assert.equal(page.preview, 'blob:offline')
await page.submit()
assert.equal(posts, 1)
assert.equal(page.identity.verified, true)
assert.equal(page.photo, null)
assert.equal(page.number, '', 'sensitive input is cleared after success')
assert.equal(page.name, '')
assert.equal(discardedPhotos.length, 1, 'successful submit discards the photo after upload')
component.onUnload.call(page)
assert.equal(cancelCalls, 1, 'leaving the identity form cancels a native or web capture')
page.pageClosed = false; page.name = '测试姓名'; page.number = '110101199001010015'; page.consented = true
const lateCapture = page.capture()
await new Promise(resolve => setTimeout(resolve, 0))
component.onUnload.call(page)
completeActions()
await lateCapture
assert.equal(discardedPhotos.length, 2, 'both the submitted photo and a late photo are discarded')

let finishChallenge
const cameraCallsBeforeClosedChallenge = captureCalls
const closedChallengeContext = vm.createContext({ RecyclingShell: {}, identityStatus: async () => response,
  identityChallenge: () => new Promise(resolve => { finishChallenge = resolve }),
  captureIdentityPhoto: async () => { captureCalls++; throw new Error('capture must not run after close') },
  submitIdentity: async () => { throw new Error('submit must not run after close') }, recycleBack() {},
  cancelIdentityCapture() { cancelCalls++ }, discardIdentityPhoto(photo) { if (photo) discardedPhotos.push(photo) },
  URL: { createObjectURL: () => 'blob:closed', revokeObjectURL() {} }, clearTimeout, setTimeout,
  uni: { getStorageSync: () => '' }, identityWebContext: () => null, exchangeIdentityWebSession: async () => ({}),
  createIdentityWebSession: async () => ({}), clearIdentityWebSession() {}, baseUrl: 'https://identity.test',
  history: { state: null, replaceState() {} }, location: { pathname: '/', search: '' } })
vm.runInContext(script, closedChallengeContext)
const closedChallengeComponent = closedChallengeContext.component
const closedChallengePage = { ...closedChallengeComponent.data(), ...closedChallengeComponent.methods }
for (const [name, getter] of Object.entries(closedChallengeComponent.computed)) Object.defineProperty(closedChallengePage, name, { get: () => getter.call(closedChallengePage) })
closedChallengePage.name = '测试姓名'; closedChallengePage.number = '110101199001010015'; closedChallengePage.consented = true
const pendingChallenge = closedChallengePage.capture()
const cancelCallsBeforeClosedChallenge = cancelCalls
await new Promise(resolve => setTimeout(resolve, 0))
closedChallengeComponent.onUnload.call(closedChallengePage)
finishChallenge({ id: 'closed-task', consentVersion: 'offline-consent', actions: ['blink', 'mouth'] })
await pendingChallenge
assert.equal(captureCalls, cameraCallsBeforeClosedChallenge, 'a challenge returned after close does not open the camera')
assert.equal(cancelCalls, cancelCallsBeforeClosedChallenge + 1, 'closing during challenge still calls the capture cancellation hook')

let statusCalls = 0, exchangeCalls = []
const handoffContext = vm.createContext({ RecyclingShell: {}, identityStatus: async () => { statusCalls++; return { verified: false } },
  identityChallenge: async () => ({ id: 'must-not-run', actions: ['blink', 'mouth'] }), captureIdentityPhoto: async () => { throw new Error('capture must not run') },
  submitIdentity: async () => { throw new Error('submit must not run') }, recycleBack() {},
  identityWebContext: () => ({ account: '浏览器已有账号', token: 'browser-token' }),
  exchangeIdentityWebSession: async code => { exchangeCalls.push(code); throw new Error('handoff无效') },
  createIdentityWebSession: async () => ({ code: 'unused' }), clearIdentityWebSession() {}, baseUrl: 'https://identity.test',
  history: { state: null, replaceState() {} }, location: { pathname: '/', search: '' },
  URL: { createObjectURL: () => 'blob:handoff', revokeObjectURL() {} }, clearTimeout, setTimeout,
  uni: { getStorageSync: () => 'browser-token', showToast() {} } })
vm.runInContext(script, handoffContext)
const handoffComponent = handoffContext.component, failedHandoff = { ...handoffComponent.data(), ...handoffComponent.methods }
for (const [name, getter] of Object.entries(handoffComponent.computed)) Object.defineProperty(failedHandoff, name, { get: () => getter.call(failedHandoff) })
await handoffComponent.onLoad.call(failedHandoff, { handoff: '' })
assert.deepEqual(exchangeCalls, [''], 'an explicitly empty handoff is still exchanged and rejected')
assert.equal(failedHandoff.handoffFailed, true)
assert.equal(failedHandoff.handoffAccount, '', 'failed handoff does not fall back to the browser account')
assert.equal(failedHandoff.error, 'handoff无效')
assert.equal(statusCalls, 0, 'failed handoff never requests status using the browser login')
assert.equal(failedHandoff.webHandoff, true)
assert.match(source, /正在为账号「\{\{ handoffAccount \|\| '原应用账号' \}\}」认证/)
assert.match(source, /v-if="!handoffFailed"/, 'the normal bound identity form remains hidden after handoff failure')
console.log('Identity frontend passed: three-target SFC compilation, mandatory action sequence, framing pause/reset, consent, handoff isolation and sensitive-data cleanup.')
