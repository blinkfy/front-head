import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createVoiceCallController } from '../src/utils/voice-call-core.mjs'

function setup({ ticket = '', permissionError = null, android = true, permissionPromise = null } = {}) {
  const calls = { permission: [], open: 0, sent: [], consumed: [], stoppedAlerts: [], feedbackAlerts: 0,
    controls: [], uiSound: [], feedback: [], ended: [], navigated: [] }
  let acceptedTicket = ticket
  let token = 'account-token'
  const self = { id: 7 }
  const media = {
    supported: () => true,
    supportsVideo: () => true,
    permission: async (id, mode) => {
      calls.permission.push({ id, mode })
      if (permissionPromise) await permissionPromise
      if (permissionError) throw permissionError
    },
    open: async () => { calls.open++; return { close() {}, control() {}, signal() {} } },
    cancel() {},
  }
  const context = {
    console: { info() {} },
    Promise,
    reactive: value => value,
    updateWebCallAlert() {},
    areUiSoundsEnabled: () => true,
    consumeAndroidIncomingAcceptance: id => {
      calls.consumed.push(id)
      if (acceptedTicket !== id) return false
      acceptedTicket = ''
      return true
    },
    androidRealtimeAvailable: () => android,
    stopAndroidIncomingAlert: id => calls.stoppedAlerts.push(id),
    controlAndroidAnsweredCall: (id, options) => calls.controls.push({ id, options }),
    createVoiceCallController,
    document: { querySelectorAll: () => [] },
    voiceCallMedia: media,
    setUiSoundBlocked: (...args) => calls.uiSound.push(args),
    setChatFeedbackBlocked: (...args) => calls.feedback.push(args),
    receiveChatFeedback: async () => { calls.feedbackAlerts++ },
    getCurrentPages: () => [{ route: 'pages-nonTheme/voice-call' }],
    uni: { getStorageSync: key => key === 'token' ? token : self, navigateTo: value => calls.navigated.push(value) },
  }
  let source = fs.readFileSync(new URL('../src/utils/voice-call.js', import.meta.url), 'utf8')
    .replace(/^import .* from .*$/gm, '')
    .replace(/\bexport const\b/g, 'const')
  source += '\nglobalThis.testVoiceCalls = { voiceCalls, voiceCallState, installVoiceCallSender };'
  vm.createContext(context)
  vm.runInContext(source, context)
  const { voiceCalls, installVoiceCallSender } = context.testVoiceCalls
  installVoiceCallSender(event => { calls.sent.push(event); return true })
  voiceCalls.setActive(true)
  voiceCalls.connection(true, 1, 1)
  voiceCalls.handle({ type: 'voice.ready', version: 1, video: true })
  return { calls, voiceCalls, voiceCallState: context.testVoiceCalls.voiceCallState, setToken: value => { token = value } }
}

const flushMicrotasks = async () => { await Promise.resolve(); await Promise.resolve(); await new Promise(resolve => setImmediate(resolve)) }

async function run() {
  for (const mode of ['audio', 'video']) {
    const { calls, voiceCalls } = setup({ ticket: `accepted-${mode}` })
    const id = `accepted-${mode}`
    voiceCalls.handle({ type: 'voice.incoming', callId: id, mode, peer: { id: '42', name: 'Peer' } })
    await flushMicrotasks()
    assert.deepEqual(calls.consumed, [id], `${mode}: acceptance ticket is consumed for the exact incoming call`)
    assert.deepEqual(calls.permission, [{ id, mode }], `${mode}: native acceptance requests media permission exactly once`)
    assert.equal(calls.sent.filter(event => event.type === 'voice.accept' && event.callId === id).length, 1,
      `${mode}: native acceptance sends one voice.accept after permission succeeds`)
    voiceCalls.setActive(false)
  }

  {
    const { calls, voiceCalls } = setup()
    voiceCalls.handle({ type: 'voice.incoming', callId: 'no-ticket-0001', mode: 'audio', peer: { id: '42' } })
    await flushMicrotasks()
    assert.equal(calls.permission.length, 0, 'without native user-acceptance ticket no automatic permission prompt occurs')
    assert.equal(calls.sent.some(event => event.type === 'voice.accept'), false, 'without ticket no automatic acceptance is sent')
    assert.equal(calls.feedbackAlerts, 0, 'Android incoming alert does not add a repeated short feedback sound')
    voiceCalls.setActive(false)
  }

  {
    const { calls, voiceCalls } = setup({ android: false })
    voiceCalls.handle({ type: 'voice.incoming', callId: 'h5-feedback-0001', mode: 'audio', peer: { id: '42' } })
    await flushMicrotasks()
    assert.equal(calls.feedbackAlerts, 1, 'non-Android incoming calls retain the existing short feedback sound')
    voiceCalls.end('rejected')
    assert.ok(calls.stoppedAlerts.includes('h5-feedback-0001'), 'leaving incoming state stops the matching alert')
  }

  {
    let resolvePermission
    const permissionPromise = new Promise(resolve => { resolvePermission = resolve })
    const { calls, voiceCalls } = setup({ ticket: 'alert-accept-test01', permissionPromise })
    voiceCalls.handle({ type: 'voice.incoming', callId: 'alert-accept-test01', mode: 'audio', peer: { id: '42' } })
    await flushMicrotasks()
    assert.deepEqual(calls.permission, [{ id: 'alert-accept-test01', mode: 'audio' }], 'native gesture starts the existing permission flow')
    assert.ok(calls.stoppedAlerts.includes('alert-accept-test01'), 'alert stops before the permission promise resolves')
    assert.equal(calls.sent.some(event => event.type === 'voice.accept'), false, 'accept frame waits for granted media permission')
    resolvePermission()
    await flushMicrotasks()
    assert.equal(calls.sent.filter(event => event.type === 'voice.accept').length, 1)
    voiceCalls.setActive(false)
  }

  {
    const { calls, voiceCalls } = setup({ ticket: 'ended-before-microtask' })
    voiceCalls.handle({ type: 'voice.incoming', callId: 'ended-before-microtask', mode: 'audio', peer: { id: '42' } })
    voiceCalls.handle({ type: 'voice.ended', callId: 'ended-before-microtask', reason: 'cancelled' })
    await flushMicrotasks()
    assert.equal(calls.permission.length, 0, 'call ended before deferred acceptance does not prompt')
    assert.equal(calls.sent.some(event => event.type === 'voice.accept'), false, 'call ended before deferred acceptance sends no accept')
    assert.ok(calls.stoppedAlerts.includes('ended-before-microtask'), 'server-ended incoming call stops its alert')
    voiceCalls.setActive(false)
  }

  {
    const { calls, voiceCalls } = setup({ ticket: 'permission-denied-01', permissionError: { code: 'permission_denied' } })
    voiceCalls.handle({ type: 'voice.incoming', callId: 'permission-denied-01', mode: 'video', peer: { id: '42' } })
    await flushMicrotasks()
    assert.equal(calls.permission.length, 1)
    assert.equal(calls.sent.some(event => event.type === 'voice.accept'), false, 'permission rejection does not signal acceptance')
    assert.ok(calls.sent.some(event => event.type === 'voice.end' && event.reason === 'permission_denied'),
      'permission rejection follows the existing end/reject path')
    assert.ok(calls.stoppedAlerts.includes('permission-denied-01'), 'permission rejection stops the current incoming alert')
    voiceCalls.setActive(false)
  }

  {
    const { calls, voiceCalls } = setup()
    voiceCalls.handle({ type: 'voice.incoming', callId: 'incoming-timeout-01', mode: 'audio', peer: { id: '42' } })
    await flushMicrotasks()
    voiceCalls.handle({ type: 'voice.ended', callId: 'incoming-timeout-01', reason: 'timeout' })
    assert.ok(calls.stoppedAlerts.includes('incoming-timeout-01'), 'incoming timeout stops the current call alert')
    voiceCalls.setActive(false)
  }

  for (const mode of ['audio', 'video']) {
    const { calls, voiceCalls, voiceCallState } = setup()
    const snapshot = { type: 'voice.native', userId: 7, callId: `native-${mode}-call01`, mode,
      phase: 'connecting', peer: { id: '42', name: 'Native Peer' }, muted: true, speaker: mode === 'video',
      cameraEnabled: mode === 'video', remoteCameraEnabled: false }
    voiceCalls.handle(snapshot)
    assert.equal(voiceCallState.callId, snapshot.callId)
    assert.equal(voiceCallState.phase, 'connecting')
    assert.equal(voiceCallState.nativeOwned, true)
    assert.equal(calls.open, 0, `${mode}: native snapshot must not open a JS media peer`)
    assert.equal(calls.permission.length, 0, `${mode}: native snapshot must not request JS media permission`)
    assert.equal(calls.navigated.length, 0, `${mode}: native snapshot must not auto-navigate`)

    voiceCalls.setActive(false)
    voiceCalls.setActive(true)
    voiceCalls.connection(true, 1, 1)
    voiceCalls.handle({ type: 'voice.ready', version: 1, video: true })
    assert.equal(voiceCallState.callId, snapshot.callId, `${mode}: baseline controller events preserve native call`)
    assert.equal(voiceCallState.phase, 'connecting')

    voiceCalls.handle({ ...snapshot, userId: 999, phase: 'connected' })
    voiceCalls.handle({ ...snapshot, callId: 'native-other-call01', phase: 'connected' })
    assert.equal(voiceCallState.phase, 'connecting', `${mode}: wrong user or another call cannot replace native state`)

    voiceCalls.control({ muted: false, speaker: true })
    voiceCalls.end('hangup')
    assert.deepEqual(JSON.parse(JSON.stringify(calls.controls)), [
      { id: snapshot.callId, options: { muted: false, speaker: true } },
      { id: snapshot.callId, options: { hangup: true } },
    ], `${mode}: page controls and hangup are forwarded to the native answered call`)
    voiceCalls.handle({ ...snapshot, phase: 'connected' })
    assert.equal(voiceCallState.phase, 'connected', `${mode}: matching native call can advance its snapshot`)
    assert.throws(() => voiceCalls.start({ id: '43', name: 'Other Peer' }), /请先结束当前通话/,
      `${mode}: an active native call blocks a new JS-originated call`)
    voiceCalls.handle({ ...snapshot, phase: 'ended', reason: 'hangup' })
    assert.equal(voiceCallState.phase, 'ended', `${mode}: native ended snapshot clears ownership`)
    assert.equal(calls.uiSound.at(-1)[1], false, 'native call end releases sound blocking')
  }

  {
    const { calls, voiceCalls, voiceCallState } = setup()
    const snapshot = { type: 'voice.native', userId: 7, callId: 'native-replay-ended01', mode: 'video', phase: 'connected', peer: { id: '42' } }
    voiceCalls.handle(snapshot)
    voiceCalls.handle({ type: 'voice.ended', callId: 'native-other-ended01', reason: 'disconnected' })
    assert.equal(voiceCallState.callId, snapshot.callId, 'a different callId cannot release the native projection')
    assert.equal(voiceCallState.phase, 'connected')
    assert.equal(calls.uiSound.at(-1)[1], true, 'unrelated ended frame leaves native sound blocking active')
    voiceCalls.handle({ type: 'voice.ended', callId: snapshot.callId, reason: 'disconnected' })
    assert.equal(voiceCallState.phase, 'ended', 'matching replayed voice.ended releases the native projection')
    assert.equal(voiceCallState.reason, 'disconnected')
    assert.equal(calls.uiSound.at(-1)[1], false, 'matching ended frame releases sound blocking')
    assert.equal(calls.feedback.at(-1)[1], false, 'matching ended frame releases chat feedback blocking')
  }

  {
    const { calls, voiceCalls, voiceCallState } = setup()
    const snapshot = { type: 'voice.native', userId: 7, callId: 'native-disconnect-01', mode: 'audio', phase: 'connected', peer: { id: '42' } }
    voiceCalls.handle(snapshot)
    voiceCalls.connection(false)
    assert.equal(voiceCallState.phase, 'ended', 'transport disconnect clears native answered-call projection')
    assert.equal(voiceCallState.reason, 'disconnected')
    assert.equal(calls.uiSound.at(-1)[1], false)
    assert.equal(calls.feedback.at(-1)[1], false)
  }

  console.log('PASS native answered-call snapshots, controls, teardown, and incoming acceptance integration')
}

run().catch(error => { console.error(error); process.exitCode = 1 })
