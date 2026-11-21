import assert from 'node:assert/strict'
import { createVoiceCallController } from '../../src/utils/voice-call-core.mjs'

const TOKEN = 'b'.repeat(48)
const TRANSFER = 'c'.repeat(36)
const tick = () => new Promise(resolve => setImmediate(resolve))
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }

function harness({ handoff = true, observer = false, permission = async () => {}, recording = () => null } = {}) {
  let now = 1000, timerId = 0, callId = 0
  const timers = new Map(), sent = [], opened = [], drivers = [], changes = []
  const media = {
    supported: () => true, supportsVideo: () => true, supportsRecovery: () => true,
    supportsHandoff: () => handoff, supportsHandoffObserver: () => observer,
    permission, prepareHandoff() {},
    open(options) {
      opened.push(options)
      const driver = { signals: [], controls: [], closeCount: 0,
        signal(event) { this.signals.push({ ...event }) },
        control(event) { this.controls.push({ ...event }) },
        close() { this.closeCount++ } }
      driver.options = options
      drivers.push(driver)
      return driver
    }, cancel() {}
  }
  const controller = createVoiceCallController({ media,
    send(event) { sent.push({ ...event }); return true },
    getOwner: () => 'account-a', getSelfId: () => 1, getRecording: recording,
    changed: state => changes.push(state), now: () => now,
    createId: () => `call-${++callId}`,
    setTimer(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay, due: now + delay }); return id },
    clearTimer(id) { timers.delete(id) }
  })
  async function ready() {
    controller.setActive(true)
    controller.connection(true, 1, 1)
    controller.handle({ type: 'voice.ready', version: 1, video: true, recoveryVersion: 1, handoffVersion: 1 })
    await tick()
  }
  function advance(ms) {
    const target = now + ms
    for (;;) {
      const next = [...timers.entries()].filter(([, timer]) => timer.due <= target)
        .sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0]
      if (!next) break
      const [id, timer] = next
      timers.delete(id); now = timer.due; timer.callback()
    }
    now = target
  }
  return { controller, media, sent, opened, drivers, changes, timers, ready, advance,
    get now() { return now }, setNow(value) { now = value } }
}

function ongoing(h, id = 'server-call-1') {
  h.controller.handle({ type: 'voice.ongoing', callId: id, mode: 'video', cameraEnabled: true,
    peer: { id: '2', name: 'Peer' }, startedAt: 1234, recording: true, recordingStartedAt: 1500 })
}

function candidate(h, id = 'server-call-1', transferId = TRANSFER, generation = 4) {
  h.controller.handle({ type: 'voice.handoff.prepare', role: 'candidate', callId: id,
    transferId, generation, mode: 'video', peer: { id: '2', name: 'Peer' }, cameraEnabled: true, remoteCameraEnabled: true })
}

async function testCapabilityObserverAndPermissionFailure() {
  const observer = harness({ handoff: false, observer: true })
  await observer.ready()
  assert.equal(observer.sent[0].handoffVersion, 1)
  assert.equal(observer.sent[0].handoffObserver, true)
  ongoing(observer)
  assert.equal(observer.controller.state().ongoing.callId, 'server-call-1', 'observer receives ongoing calls')
  await assert.rejects(observer.controller.takeover(), /无法切换/)
  assert.equal(observer.sent.some(event => event.type === 'voice.handoff.request'), false)

  const observerWithOldReady = harness({ handoff: false, observer: true })
  observerWithOldReady.controller.setActive(true)
  observerWithOldReady.controller.connection(true, 1, 1)
  observerWithOldReady.controller.handle({ type: 'voice.ready', version: 0, video: false })
  ongoing(observerWithOldReady)
  assert.equal(observerWithOldReady.controller.state().ongoing.callId, 'server-call-1',
    'observer publishes ongoing even when the server does not enable the handoff protocol')
  await assert.rejects(observerWithOldReady.controller.takeover(), /无法切换/)

  const denied = harness({ permission: async () => { throw new Error('permission denied') } })
  await denied.ready(); ongoing(denied)
  await denied.controller.takeover()
  assert.equal(denied.controller.state().handoffPending, false)
  assert.ok(denied.controller.state().handoffError)
  assert.equal(denied.sent.some(event => event.type === 'voice.handoff.request'), false)
  assert.equal(denied.sent.some(event => event.type === 'voice.end'), false, 'permission rejection never ends the server call')
}

async function testCandidateWaitsForCommitAndCancelCanRetry() {
  const h = harness({ recording: () => ({ recording: true, recordingStartedAt: 1500 }) })
  await h.ready(); ongoing(h)
  await h.controller.takeover()
  assert.ok(h.sent.some(event => event.type === 'voice.handoff.request' && event.callId === 'server-call-1'))
  candidate(h)
  await tick(); await tick()
  assert.equal(h.controller.state().phase, 'connecting')
  assert.equal(h.controller.state().callId, 'server-call-1')
  assert.equal(h.opened.length, 1)
  assert.equal(h.opened[0].handoffCandidate, true)
  h.opened[0].onEvent({ type: 'state', state: 'connected' })
  h.opened[0].onEvent({ type: 'recording', recording: true, recordingStartedAt: 1900 })
  assert.equal(h.sent.some(event => event.type === 'voice.connected'), false)
  assert.equal(h.sent.some(event => event.type === 'voice.local-recording'), false)
  assert.equal(h.controller.state().phase, 'connecting', 'candidate never becomes active before server commit')
  assert.equal(h.controller.state().recording, false, 'candidate does not start recording before commit')
  assert.equal(h.controller.state().recordingStartedAt, 0, 'candidate does not inherit the old device recording clock')
  assert.ok(h.sent.some(event => event.type === 'voice.handoff.ready' && event.callId === 'server-call-1'))

  h.controller.handle({ type: 'voice.handoff.commit', callId: 'server-call-1', transferId: TRANSFER,
    generation: 5, resumeToken: TOKEN, startedAt: 1234 })
  assert.equal(h.controller.state().phase, 'connecting', 'commit with a generation other than prepare is ignored')
  assert.equal(h.controller.state().handoffPending, true)

  h.controller.handle({ type: 'voice.handoff.cancelled', callId: 'server-call-1', transferId: TRANSFER })
  assert.equal(h.drivers[0].closeCount, 1, 'cancellation closes its candidate driver')
  assert.equal(h.sent.some(event => event.type === 'voice.end'), false, 'cancellation does not end the ongoing call')
  assert.equal(h.controller.state().phase, 'idle')

  ongoing(h)
  await h.controller.takeover()
  const retryTransfer = 'd'.repeat(36)
  candidate(h, 'server-call-1', retryTransfer, 4)
  await tick(); await tick()
  assert.equal(h.opened.length, 2, 'the same call identity can be retried after cancellation')
  assert.equal(h.opened[1].callId, 'server-call-1')
  h.controller.handle({ type: 'voice.handoff.commit', callId: 'server-call-1', transferId: retryTransfer,
    generation: 4, resumeToken: TOKEN, startedAt: 1234 })
  assert.equal(h.controller.state().phase, 'connected')
  assert.equal(h.controller.state().startedAt, 1234)
  h.opened[1].onEvent({ type: 'recording', recording: true, recordingStartedAt: 1900 })
  assert.equal(h.controller.state().recording, true)
  assert.equal(h.controller.state().recordingStartedAt, 1900, 'new recording clock starts only when committed')
  h.controller.handle({ type: 'voice.ice', callId: 'server-call-1', generation: 3, candidate: { candidate: 'stale' } })
  h.controller.handle({ type: 'voice.ice', callId: 'server-call-1', generation: 4, candidate: { candidate: 'current' } })
  assert.equal(h.drivers[1].signals.some(event => event.candidate?.candidate === 'stale'), false)
  assert.equal(h.drivers[1].signals.at(-1).candidate.candidate, 'current')
  h.controller.connection(false)
  h.controller.connection(true, 1, 1)
  assert.equal(h.sent.at(-1).resumeToken, TOKEN, 'commit installs the resume token on the existing call identity')
  assert.equal(h.sent.some(event => event.type === 'voice.connected'), false)
}

async function testStaleCandidateFramesAndPeerShadowFailure() {
  const h = harness()
  await h.ready()
  h.controller.start({ id: '2', name: 'Peer' }, 'audio')
  const call = h.controller.state().callId
  h.controller.handle({ type: 'voice.accepted', callId: call, recoveryVersion: 1, resumeToken: TOKEN })
  await tick(); await tick()
  h.opened[0].onEvent({ type: 'state', state: 'connected' })
  h.controller.handle({ type: 'voice.connected', callId: call })
  h.controller.handle({ type: 'voice.handoff.prepare', role: 'peer', callId: call, transferId: TRANSFER, generation: 1 })
  h.opened[0].onEvent({ type: 'handoff', kind: 'failed', transferId: TRANSFER })
  assert.equal(h.controller.state().phase, 'connected')
  assert.equal(h.controller.state().callId, call)
  assert.equal(h.drivers[0].closeCount, 0, 'shadow peer failure keeps the active call driver')
  assert.equal(h.controller.state().handoffPending, false)
  assert.ok(h.drivers[0].signals.some(event => event.type === 'handoff-cancel'))
  h.controller.handle({ type: 'voice.ice', callId: call, generation: 99, candidate: { candidate: 'stale-generation' } })
  assert.equal(h.drivers[0].signals.some(event => event.candidate?.candidate === 'stale-generation'), false)
}

async function testShadowRecoveryTimerCannotEndCommittedCall() {
  const h = harness()
  await h.ready()
  h.controller.start({ id: '2', name: 'Peer' }, 'audio')
  const call = h.controller.state().callId
  h.controller.handle({ type: 'voice.accepted', callId: call, recoveryVersion: 1, resumeToken: TOKEN })
  await tick(); await tick()
  h.opened[0].onEvent({ type: 'state', state: 'connected' })
  h.controller.handle({ type: 'voice.connected', callId: call })
  h.controller.handle({ type: 'voice.handoff.prepare', role: 'peer', callId: call,
    transferId: TRANSFER, generation: 1 })
  h.opened[0].onEvent({ type: 'state', state: 'disconnected' })
  assert.equal(h.controller.state().reconnecting, true)
  assert.ok([...h.timers.values()].some(timer => timer.delay === 30000), 'media loss starts its recovery deadline')

  h.controller.handle({ type: 'voice.handoff.commit', callId: call, transferId: TRANSFER,
    generation: 1, resumeToken: 'e'.repeat(48), startedAt: 1234 })
  assert.equal(h.controller.state().phase, 'connected')
  assert.equal(h.controller.state().reconnecting, false)
  h.advance(30000)
  assert.equal(h.controller.state().phase, 'connected', 'the old peer recovery timer cannot end a committed handoff')
  assert.equal(h.drivers[0].closeCount, 0, 'the committed call retains its existing active driver')
}

async function testPermissionRacesCandidateFailureAndStaleTimer() {
  const permission = deferred()
  const ended = harness({ permission: () => permission.promise })
  await ended.ready(); ongoing(ended)
  const request = ended.controller.takeover()
  await tick()
  ended.controller.handle({ type: 'voice.ongoing-ended', callId: 'server-call-1' })
  permission.resolve()
  await request
  assert.equal(ended.sent.some(event => event.type === 'voice.handoff.request'), false,
    'ongoing-ended while permission is pending prevents the handoff request')

  const userCancelPermission = deferred()
  const userCancel = harness({ permission: () => userCancelPermission.promise })
  await userCancel.ready(); ongoing(userCancel)
  const cancelledRequest = userCancel.controller.takeover()
  await tick()
  userCancel.controller.end()
  userCancelPermission.resolve()
  await cancelledRequest
  assert.equal(userCancel.sent.some(event => event.type === 'voice.handoff.request'), false,
    'user cancellation while permission is pending prevents the handoff request')
  assert.equal(userCancel.sent.some(event => event.type === 'voice.end'), false)

  const failed = harness()
  await failed.ready(); ongoing(failed); await failed.controller.takeover()
  candidate(failed)
  await tick(); await tick()
  failed.opened[0].onEvent({ type: 'state', state: 'failed' })
  assert.equal(failed.controller.state().phase, 'idle')
  assert.equal(failed.sent.some(event => event.type === 'voice.end'), false,
    'candidate media failure cancels only the handoff attempt')

  const timerRace = harness()
  await timerRace.ready(); ongoing(timerRace); await timerRace.controller.takeover()
  const staleTimer = [...timerRace.timers.values()].at(-1).callback
  timerRace.controller.end()
  assert.throws(() => timerRace.controller.start({ id: '3', name: 'New peer' }, 'audio'), /其它设备通话/)
  timerRace.controller.handle({ type: 'voice.ongoing-ended', callId: 'server-call-1' })
  timerRace.controller.start({ id: '3', name: 'New peer' }, 'audio')
  staleTimer()
  assert.equal(timerRace.controller.state().phase, 'calling', 'a cleared handoff timer cannot terminate a later call')
}

await testCapabilityObserverAndPermissionFailure()
await testCandidateWaitsForCommitAndCancelCanRetry()
await testStaleCandidateFramesAndPeerShadowFailure()
await testShadowRecoveryTimerCannotEndCommittedCall()
await testPermissionRacesCandidateFailureAndStaleTimer()
console.log('voice-call handoff controller tests passed')
