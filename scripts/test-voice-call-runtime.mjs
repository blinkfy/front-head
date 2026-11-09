import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { createVoiceCallController } from '../src/utils/voice-call-core.mjs'
import { sharedVoiceCallRuntime } from '../src/utils/voice-call-runtime.mjs'
const require = createRequire(import.meta.url)
const { preprocess } = require('@dcloudio/uni-cli-shared/lib/preprocess')
const source = fs.readFileSync(new URL('../src/utils/voice-call.js', import.meta.url), 'utf8')
const realm = {}, navigations = [], sent = [], opened = []
const owner = 'runtime-test-account'
const uni = { getStorageSync: key => key === 'token' ? owner : { id: 1 }, $emit() {}, navigateTo: options => { navigations.push(options.url); options.complete() } }
function loadRevision(revision) {
  const media = { supported: () => true, supportsVideo: () => true, canRouteAudio: () => false,
    cancel() {}, permission: async () => {}, prepareOutgoing: async () => {},
    open: async options => { opened.push({ revision, id: options.callId }); return { close() {}, control() {}, signal() {} } } }
  const context = { window: {}, console: { info() {} }, uni, media, reactive: value => value, createVoiceCallController,
    sharedVoiceCallRuntime: create => sharedVoiceCallRuntime(create, realm),
    recordingConfiguration: () => null, updateWebCallAlert() {}, areUiSoundsEnabled: () => false,
    setUiSoundBlocked() {}, setChatFeedbackBlocked() {}, stopAndroidIncomingAlert() {},
    consumeAndroidIncomingAcceptance: () => false, androidRealtimeAvailable: () => false,
    webCallsAvailable: () => true, receiveChatFeedback() {}, getCurrentPages: () => [],
    document: { querySelectorAll: () => [] }, Promise, Object }
  const code = preprocess(source, { H5: true }, { type: 'js' }).replace(/^import .*$/gm, '').replace(/^export /gm, '')
  vm.runInNewContext(code + '\nglobalThis.result = runtime', context)
  return context.result
}
const first = loadRevision('shell')
first.installVoiceCallSender(event => { sent.push(event); return true })
first.voiceCalls.setActive(true); first.voiceCalls.connection(true, 1, 1)
first.voiceCalls.handle({ type: 'voice.ready', version: 1, video: true })
first.voiceCalls.start({ id: 2, name: '视频联系人' }, 'video')
await new Promise(resolve => setImmediate(resolve))
const id = first.voiceCallState.callId
const pageRevision = loadRevision('lazy-page')
assert.equal(pageRevision.voiceCalls, first.voiceCalls)
assert.equal(pageRevision.voiceCallState, first.voiceCallState)
assert.equal(pageRevision.voiceCallMedia, first.voiceCallMedia, 'video mounting uses the media driver that owns the call')
assert.equal(pageRevision.voiceCallState.phase, 'calling')
pageRevision.voiceCalls.handle({ type: 'voice.accepted', callId: id, cameraToggle: true })
await new Promise(resolve => setImmediate(resolve))
pageRevision.voiceCalls.handle({ type: 'voice.connected', callId: id })
assert.equal(first.voiceCallState.phase, 'connected')
assert.equal(first.voiceCallState.mode, 'video')
assert.deepEqual(opened, [{ revision: 'shell', id }], 'only the original media driver opens')
assert.equal(sent.filter(event => event.type === 'voice.invite').length, 1)
pageRevision.voiceCalls.end('hangup')
assert.equal(first.voiceCallState.phase, 'ended')
assert.equal(sent.filter(event => event.type === 'voice.end').length, 1)
assert.equal(navigations.length, 1, 'loading another revision does not duplicate navigation')
console.log('PASS shared H5 call controller, state, media and sender across lazy module revisions')
