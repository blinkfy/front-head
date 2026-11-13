import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'
import { identityAgeError } from '../src/utils/identity-age.mjs'
import { normalizeIdentityName, identityNameError } from '../src/utils/identity-name.mjs'
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
assert.match(identityPage, /请按提示完成人脸认证/)
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
assert.match(settleSource, /timestamp - settleStarted < 900\) \{ settledFrames = 0; return \}[\s\S]*?if \(settledFrames >= 3\) capture\(points\)/,
  'automatic capture waits 900 ms, then three stable white-light frames')
assert.match(cameraSource, /else if \(phase === 'settle'\) beginSettle\(performance\.now\(\)\)/,
  'changing light during settle restarts the timer and neutral-frame count')
assert.match(cameraSource, /identityFaceFrame\(points,[\s\S]*?\{ tracking: trackingReady && \(phase !== 'settle' \|\| !neutralFace\) \}\)/,
  'jaw expansion is tolerated after initial alignment until the neutral final-photo check')
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
  assert.equal(tick(...neutral).done, true, 'the requested random action order remains required')
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
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const allowance = (remaining = 3) => ({ remaining, limit: 3, blocked: remaining === 0, cooldownDays: 7, blockedUntil: remaining === 0 ? '2026-11-20T12:00:00Z' : null })
function pageHarness(overrides = {}) {
  const h = { posts: 0, cameras: 0, discards: 0, cancellations: 0, checks: 0, tasks: 0,
    response: { verified: false, available: true, retry: allowance() }, actions: deferred(), decode: deferred() }
  const context = vm.createContext({ identityAgeError, normalizeIdentityName, identityNameError, RecyclingShell: {},
    identityStatus: async () => h.response,
    identityChallenge: async () => ({ id: `task-${++h.tasks}`, consentVersion: 'offline', actions: ['blink', 'mouth'] }),
    captureIdentityPhoto: async options => { h.cameras++; assert.deepEqual(Array.from(options.actions), ['blink', 'mouth']); return h.actions.promise },
    ensureIdentityPhotoUsable: async () => { h.checks++; return h.decode.promise },
    submitIdentity: async (fields, photo) => { h.posts++; h.fields = fields; assert.ok(photo); h.response = { verified: true, available: true, retry: allowance(), maskedName: '测*' }; return { verified: true, status: 'matched', retry: allowance(), identity: h.response } },
    recycleBack() {}, cancelIdentityCapture() { h.cancellations++ }, discardIdentityPhoto(photo) { if (photo) h.discards++ },
    clearTimeout, setTimeout, uni: { getStorageSync: () => '', showToast() {} },
    identityWebContext: () => null, exchangeIdentityWebSession: async () => ({}), clearIdentityWebSession() {},
    createIdentityWebSession: async () => ({}), baseUrl: 'https://identity.test',
    history: { state: null, replaceState() {} }, location: { pathname: '/', search: '' }, ...overrides })
  vm.runInContext(script, context)
  h.component = context.component
  h.page = { ...h.component.data(), ...h.component.methods, identity: h.response }
  for (const [name, getter] of Object.entries(h.component.computed)) Object.defineProperty(h.page, name, { get: () => getter.call(h.page) })
  h.fill = () => Object.assign(h.page, { name: '测试姓名', number: '110101199001010015', consented: true })
  return h
}
{
  const h = pageHarness(), p = h.page
  p.loading = false
  assert.equal(p.canStartVerification, false, 'empty form keeps start disabled without showing field errors')
  assert.equal(p.fieldErrors.name, ''); assert.equal(p.fieldErrors.number, '')
  h.fill(); p.consented = false
  assert.equal(p.canStartVerification, false, 'valid fields still require explicit consent')
  p.consented = true
  assert.equal(p.canStartVerification, true)
  p.name = '张三123'
  assert.equal(p.canStartVerification, false, 'current invalid name disables immediately, even before blur')
  p.editField('name', { detail: { value: '张😀' } })
  assert.equal(p.fieldErrors.name, '')
  assert.equal(p.canStartVerification, false, 'clearing a displayed warning does not make invalid data valid')
  p.name = '阿布都·热合曼'; p.number = '110101199001010016'
  assert.equal(p.canStartVerification, false, 'wrong identity checksum disables start')
  p.number = '110101'
  assert.equal(p.canStartVerification, false, 'incomplete identity number disables start')
  p.number = '110101199001010015'
  assert.equal(p.canStartVerification, true)
  p.consented = false; assert.equal(p.canStartVerification, false, 'withdrawing consent immediately disables start')
  p.consented = true
  for (const key of ['loading', 'capturing', 'submitting', 'handoffFailed']) {
    p[key] = true; assert.equal(p.canStartVerification, false, `${key} still blocks verification`); p[key] = false
  }
  p.identity.available = false; assert.equal(p.canStartVerification, false); p.identity.available = true
  p.identity.retry = allowance(0); assert.equal(p.canStartVerification, false); p.identity.retry = allowance()
  p.identity.attempt = { state: 'processing' }; assert.equal(p.canStartVerification, false); p.identity.attempt = null
  assert.equal(p.canStartVerification, true)
  assert.equal(h.tasks, 0); assert.equal(h.cameras, 0); assert.equal(h.posts, 0, 'button readiness has no API or camera side effects')
}
assert.equal((identityPage.match(/:disabled="!canStartVerification"/g) || []).length, 2, 'start and retry share the same eligibility rule')
{
  const h = pageHarness(), p = h.page
  await p.capture(); assert.equal(h.cameras, 0)
  h.fill()
  for (const name of ['张三123', '张😀', '阿布··热合曼', '张 三']) {
    p.name = name; await p.capture()
    assert.equal(h.tasks, 0, 'invalid names do not request a challenge')
    assert.equal(h.cameras, 0); assert.equal(h.posts, 0)
    assert.equal(p.identity.retry.remaining, 3)
  }
  h.fill(); p.consented = false; await p.capture(); assert.equal(h.cameras, 0, 'consent is explicit')
  p.consented = true
  const minorYear = new Date(Date.now() + 8 * 3600000).getUTCFullYear() - 17
  p.number = (() => { const body = `110101${minorYear}0101001`; const sum = [...body].reduce((value, digit) => (value + Number(digit)) * 2 % 11, 0); const check = (12 - sum) % 11; return body + (check === 10 ? 'X' : check); })(); await p.capture()
  assert.equal(h.cameras, 0); assert.equal(p.fieldErrors.number, '实名认证需年满18周岁')
  p.number = '110101199001010016'; await p.capture()
  assert.equal(h.cameras, 0, 'a wrong identity checksum cannot start the face flow')
  assert.equal(p.fieldErrors.number, '身份证号码校验未通过，请核对后重新填写')
  h.fill()
  const flow = p.capture(); await tick()
  assert.equal(h.posts, 0); assert.equal(p.photo, null)
  h.actions.resolve({ file: { size: 6000 } }); await tick()
  assert.equal(h.checks, 1); assert.equal(h.posts, 0, 'image must decode before automatic submission')
  await p.capture(); assert.equal(h.cameras, 1, 'double clicking cannot open a second flow')
  h.decode.resolve(); await flow
  assert.equal(h.posts, 1, 'a usable image automatically submits with no second click')
  assert.equal(h.fields.name, '测试姓名'); assert.equal(p.identity.verified, true)
  assert.equal(p.name, ''); assert.equal(p.number, ''); assert.equal(p.photo, null); assert.equal(h.discards, 1)
  await p.submit(); assert.equal(h.posts, 1)
  h.component.onUnload.call(p); assert.equal(h.cancellations, 1)
}
{
  const h = pageHarness(), p = h.page
  assert.equal(p.fieldErrors.name, ''); assert.equal(p.fieldErrors.number, '', 'untouched inputs have no warnings')
  p.validateField('name', { detail: { value: '张三123' } })
  assert.ok(p.fieldErrors.name, 'invalid name is reported on blur without pressing start')
  assert.equal(p.error, '', 'field validation never appears as a page-level error')
  p.validateField('number', { detail: { value: '1101' } })
  const numberError = p.fieldErrors.number
  assert.ok(numberError, 'incomplete identity number is reported on blur')
  p.editField('name', { detail: { value: '张' } })
  assert.equal(p.fieldErrors.name, '', 'editing clears the previous field warning')
  assert.equal(p.fieldErrors.number, numberError, 'editing one field preserves the other warning')
  p.validateField('name', { detail: { value: '  阿布都•热合曼  ' } })
  assert.equal(p.name, '阿布都·热合曼'); assert.equal(p.fieldErrors.name, '')
  p.editField('number', { detail: { value: '110101199001010016' } })
  assert.equal(p.fieldErrors.number, '身份证号码校验未通过，请核对后重新填写', 'an 18-character identity number is checked immediately')
  p.editField('number', { detail: { value: '11010519491231002x' } })
  assert.equal(p.number, '11010519491231002X'); assert.equal(p.fieldErrors.number, '')
  assert.equal(h.tasks, 0); assert.equal(h.cameras, 0); assert.equal(h.posts, 0, 'blur/input validation never starts verification')
  p.name = ''; p.number = ''; p.consented = true
  assert.equal(p.valid(), false)
  assert.ok(p.fieldErrors.name && p.fieldErrors.number, 'submit fallback checks both fields instead of stopping at the first')
  assert.equal(p.error, '')
  h.component.onUnload.call(p)
  p.validateField('name', { detail: { value: '迟到姓名' } })
  p.editField('number', { detail: { value: '110101199001010015' } })
  assert.equal(p.name, ''); assert.equal(p.number, '', 'late input events cannot restore private fields after unload')
}
{
  const h = pageHarness(); h.fill(); h.page.name = '  阿布都•热合曼  '
  h.actions.resolve({ file: { size: 6000 } }); h.decode.resolve()
  await h.page.capture()
  assert.equal(h.fields.name, '阿布都·热合曼', 'minority name separator is standardised before automatic submission')
  assert.equal(h.posts, 1)
}
for (const stage of ['challenge', 'actions', 'decode']) {
  const task = deferred()
  const h = pageHarness(stage === 'challenge' ? { identityChallenge: () => task.promise } : {})
  h.fill(); const flow = h.page.capture(); await tick()
  if (stage === 'decode') { h.actions.resolve({ file: { size: 6000 } }); await tick() }
  h.component.onUnload.call(h.page)
  if (stage === 'challenge') task.resolve({ id: 'late', actions: ['blink', 'mouth'] })
  else if (stage === 'actions') h.actions.resolve({ file: { size: 6000 } })
  else h.decode.resolve()
  await flow
  assert.equal(h.posts, 0, `leaving during ${stage} prevents automatic submission`)
  assert.equal(h.cancellations, 1)
  assert.equal(h.discards, stage === 'challenge' ? 0 : 1)
}
for (const stage of ['actions', 'decode', 'cancel']) {
  const h = pageHarness(); h.fill()
  const flow = h.page.capture(); await tick()
  if (stage === 'decode') { h.actions.resolve({ file: { size: 6000 } }); await tick(); h.decode.reject(new Error('invalid image')) }
  else h.actions.reject(Object.assign(new Error('internal details'), { cancelled: stage === 'cancel' }))
  await flow
  assert.equal(h.posts, 0); assert.equal(h.page.identity.retry.remaining, 3)
  assert.equal(h.page.verificationFailed, stage !== 'cancel')
  if (stage !== 'cancel') assert.equal(h.page.captureFailure, '认证失败')
  assert.equal(h.page.photo, null); assert.equal(h.page.challenge, null)
}
{
  const h = pageHarness({ captureIdentityPhoto: async () => { h.cameras++; throw Object.assign(new Error('请在手机微信中完成人脸认证。'), { unavailable: true }) } })
  h.fill(); const before = h.page.identity.retry.remaining
  await h.page.capture()
  assert.equal(h.page.captureNotice, '请在手机微信中完成人脸认证。', 'device capability failure shows guidance')
  assert.equal(h.page.captureFailure, '', 'capability failure does not show an identity failure card')
  assert.equal(h.page.verificationFailed, false)
  assert.equal(h.posts, 0); assert.equal(h.page.identity.retry.remaining, before, 'capability failure does not consume an attempt')
  await h.component.onShow.call(h.page)
  assert.equal(h.page.captureNotice, '请在手机微信中完成人脸认证。', 'status refresh preserves capability guidance')
  assert.equal(h.page.verificationFailed, false); assert.equal(h.posts, 0)
}
{
  const h = pageHarness({ submitIdentity: async () => { h.posts++; return { verified: false, status: 'failed', finalFailure: true, retry: allowance(2) } } })
  h.fill(); h.actions.resolve({ file: { size: 6000 } }); h.decode.resolve()
  await h.page.capture()
  assert.equal(h.posts, 1); assert.equal(h.page.verificationFailed, true); assert.equal(h.page.identity.retry.remaining, 2)
  assert.equal(h.page.number, '110101199001010015', 'failed verification retains inputs for retry')
  await h.page.retryVerification(); assert.equal(h.posts, 2, 'explicit retry starts a new flow and automatically submits')
  h.page.identity.retry = allowance(0)
  await h.page.capture(); await h.page.retryVerification(); assert.equal(h.posts, 2)
  assert.equal(h.page.verificationFailed, true); assert.ok(h.page.retryDate.includes('2026-11-20'))
  assert.equal(h.page.identity.attempt.finalFailure, true)
}
for (const state of ['processing', 'unknown']) {
  const h = pageHarness({ submitIdentity: async () => { h.posts++; return { verified: false, status: state, retry: allowance(2) } } })
  h.fill(); h.actions.resolve({ file: { size: 6000 } }); h.decode.resolve()
  await h.page.capture(); await tick()
  assert.equal(h.posts, 1, 'pending/unknown results are never automatically resubmitted')
  assert.equal(h.page.identity.retry.remaining, 2); assert.equal(h.page.verificationFailed, false)
}
{
  const h = pageHarness({ submitIdentity: async () => { h.posts++; throw new Error('network') } })
  h.fill(); h.actions.resolve({ file: { size: 6000 } }); h.decode.resolve()
  await h.page.capture()
  assert.equal(h.posts, 1); assert.equal(h.page.identity.retry.remaining, 3)
  assert.equal(h.page.identity.attempt.state, 'unknown'); assert.equal(h.page.photo, null)
}
{
  const stale = deferred(), h = pageHarness({ identityStatus: () => stale.promise })
  h.fill(); const refresh = h.page.refresh()
  h.actions.resolve({ file: { size: 6000 } }); h.decode.resolve(); await h.page.capture()
  stale.resolve({ verified: false, retry: allowance(1) }); await refresh
  assert.equal(h.page.identity.verified, true, 'old status response cannot overwrite the completed automatic submission')
}
{
  let calls = 0
  const h = pageHarness({ identityChallenge: async () => { throw Object.assign(new Error('cooldown'), { retry: allowance(0) }) },
    identityStatus: async () => ({ available: true, verified: false, retry: allowance(0) }),
    captureIdentityPhoto: async () => { calls++ } })
  h.fill(); await h.page.capture()
  assert.equal(h.page.retryBlocked, true); assert.equal(calls, 0)
}
{
  let statusCalls = 0, exchangeCalls = []
  const h = pageHarness({ identityStatus: async () => { statusCalls++; return {} },
    identityWebContext: () => ({ account: '浏览器已有账号', token: 'browser-token' }),
    exchangeIdentityWebSession: async code => { exchangeCalls.push(code); throw new Error('handoff无效') } })
  await h.component.onLoad.call(h.page, { handoff: '' })
  assert.deepEqual(exchangeCalls, ['']); assert.equal(h.page.handoffFailed, true)
  assert.equal(h.page.handoffAccount, ''); assert.equal(statusCalls, 0, 'invalid handoff never falls back to browser login')
  assert.equal(h.page.error, '认证入口暂不可用，请重新进入。')
}
// Exercise the actual invisible decode gate, including resource cleanup.
for (const target of ['H5', 'APP-PLUS', 'MP-WEIXIN']) {
  let valid = true, revoked = 0
  class ImageStub {
    set src(value) { queueMicrotask(() => { this.naturalWidth = valid ? 400 : 0; this.naturalHeight = 400; this.onload?.() }) }
  }
  const capture = conditional(readFileSync(new URL('src/utils/identity-capture.js', root), 'utf8'), target)
    .replace(/^import .*$/gm, '').replace(/^export /gm, '')
  const context = vm.createContext({ Image: ImageStub, URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => revoked++ },
    setTimeout, clearTimeout, uni: { getImageInfo: options => options.success({ width: valid ? 400 : 0, height: 400 }) } })
  vm.runInContext(`${capture}\nglobalThis.decode = ensureIdentityPhotoUsable`, context)
  const photo = target === 'H5' ? { file: { size: 6000 } } : { path: '/test/identity.jpg' }
  await context.decode(photo); valid = false; await assert.rejects(context.decode(photo), /认证失败/)
  await assert.rejects(context.decode({}), /认证失败/)
  if (target === 'H5') assert.equal(revoked, 2, 'decoded and rejected image URLs are both revoked')
}
const failureMarkup = identityPage.match(/<view v-if="verificationFailed"[\s\S]*?<\/view>/)[0]
assert.match(failureMarkup, /认证失败/); assert.match(failureMarkup, /重新认证/)
assert.match(failureMarkup, /您还有/); assert.match(failureMarkup, /retryBlocked/)
assert.doesNotMatch(failureMarkup, /failureHint|captureFailure|resultCode/, 'failure UI never exposes diagnostic reasons')
assert.doesNotMatch(identityPage, /@click="submit"|<image\b|previewLoaded/, 'no image preview confirmation or second submit step')
for (const file of ['src/pages-nonTheme/identity-verification.vue', 'src/pages-nonTheme/identity-camera.vue',
  'src/utils/identity-camera-h5.js', 'src/utils/identity-native-flow.mjs',
  'src/uni_modules/ftx-identity-capture/utssdk/app-android/IdentityCaptureUi.kt',
  'src/uni_modules/ftx-identity-capture/utssdk/app-ios/IdentityCaptureBridge.swift']) {
  assert.doesNotMatch(readFileSync(new URL(file, root), 'utf8'), /拍摄/, `${file} uses verification wording`)
}
console.log('Identity frontend passed: three-target SFC compilation, automatic usable-image submission, remaining attempts/cooldown, unknown results, lifecycle cleanup and handoff isolation. No live calls.')
