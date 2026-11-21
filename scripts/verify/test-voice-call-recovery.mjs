import assert from 'node:assert/strict'
import { createVoiceCallController } from '../../src/utils/voice-call-core.mjs'

const TOKEN = 'a'.repeat(48)
const tick = () => new Promise(resolve => setImmediate(resolve))

function harness({ recovery = true, nativeTimeout = false, send = () => true, owner: initialOwner = 'account-a' } = {}) {
  let owner = initialOwner, now = 1000, nextTimer = 0, nextId = 0, sendAvailable = true
  const timers = new Map(), sent = [], opened = [], drivers = [], changed = []
  let opens = 0, closes = 0
  const media = {
    supported: () => true,
    supportsVideo: () => true,
    supportsRecovery: () => recovery,
    managesConnectionTimeout: () => nativeTimeout,
    open(options) {
      opens++
      opened.push(options)
      const driver = { signals: [], controls: [], closeCount: 0,
        signal(event) { this.signals.push({ ...event }) },
        control(value) { this.controls.push({ ...value }) },
        close() { this.closeCount++; closes++ } }
      drivers.push(driver)
      return driver
    },
    cancel() {}
  }
  const controller = createVoiceCallController({
    media,
    send(event) { sent.push({ ...event }); return sendAvailable && send(event) },
    getOwner: () => owner,
    getSelfId: () => 1,
    changed: state => changed.push(state),
    now: () => now,
    createId: () => `recovery-call-${++nextId}`,
    setTimer(callback, delay) {
      const id = ++nextTimer
      timers.set(id, { callback, due: now + delay, delay })
      return id
    },
    clearTimer(id) { timers.delete(id) }
  })
  function advance(ms) {
    const target = now + ms
    for (;;) {
      const next = [...timers.entries()].filter(([, timer]) => timer.due <= target)
        .sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0]
      if (!next) break
      const [id, timer] = next
      timers.delete(id)
      now = timer.due
      timer.callback()
    }
    now = target
  }
  return { controller, sent, opened, drivers, changed, timers, advance, recovery,
    setSendAvailable(value) { sendAvailable = value },
    setOwner(value) { owner = value }, getOwner: () => owner,
    get opens() { return opens }, get closes() { return closes } }
}

async function connectedCall(h, { acceptedRecovery = true } = {}) {
  const c = h.controller
  c.setActive(true)
  c.connection(true, 1, 1)
  assert.equal(h.sent.at(-1).type, 'voice.capability')
  assert.equal(h.sent.at(-1).recoveryVersion, h.recovery ? 1 : undefined)
  c.handle({ type: 'voice.ready', version: 1, video: true, recoveryVersion: 1 })
  c.start({ id: 2, name: 'Peer' }, 'video')
  const callId = c.state().callId
  await tick()
  c.handle({ type: 'voice.accepted', callId, cameraToggle: true,
    ...(acceptedRecovery ? { recoveryVersion: 1, resumeToken: TOKEN } : {}) })
  await tick()
  assert.equal(h.opened.length, 1)
  h.opened[0].onEvent({ type: 'state', state: 'connected' })
  c.handle({ type: 'voice.connected', callId })
  h.opened[0].onEvent({ type: 'recording', recording: true, recordingStartedAt: 777 })
  assert.equal(c.state().phase, 'connected')
  return { callId, startedAt: c.state().startedAt }
}

function resume(h, callId) {
  const c = h.controller
  h.setSendAvailable(true)
  c.connection(true, 1)
  c.handle({ type: 'voice.ready', version: 1, recoveryVersion: 1 })
  c.handle({ type: 'voice.resumed', callId })
}

async function testShortSignalingLossAndQueuedCamera() {
  const h = harness(), { callId, startedAt } = await connectedCall(h)
  h.setSendAvailable(false)
  h.controller.connection(false)
  assert.equal(h.controller.state().reconnecting, true)
  assert.equal(h.closes, 0, 'brief signaling loss retains the media driver')
  assert.equal(h.opens, 1, 'signaling recovery does not reopen or recapture media')

  h.opened[0].onEvent({ type: 'camera', cameraEnabled: false })
  assert.equal(h.sent.some(event => event.type === 'voice.media' && event.callId === callId), false,
    'camera updates wait in the recovery outbox while signaling is down')
  resume(h, callId)
  assert.equal(h.sent.at(-1).type, 'voice.media')
  assert.equal(h.sent.at(-1).cameraEnabled, false)
  assert.equal(h.controller.state().startedAt, startedAt, 'recovery preserves call start time')
  assert.equal(h.controller.state().recordingStartedAt, 777, 'recovery preserves recording state/time')
  assert.equal(h.opens, 1)
  assert.equal(h.closes, 0)
}

async function testAbsoluteSignalingDeadlineAndRecoveryCapability() {
  const h = harness(), { callId } = await connectedCall(h)
  h.setSendAvailable(false)
  h.controller.connection(false)
  h.advance(20000)
  h.controller.connection(false)
  h.advance(9999)
  assert.equal(h.controller.state().phase, 'connected', 'repeated disconnect does not extend the original deadline')
  h.advance(1)
  assert.equal(h.controller.state().reason, 'disconnected')
  assert.equal(h.closes, 1, 'signaling deadline closes the driver exactly once')

  const noRecovery = harness({ recovery: false })
  await connectedCall(noRecovery)
  noRecovery.controller.connection(false)
  assert.equal(noRecovery.controller.state().reason, 'disconnected', 'media without recovery support keeps legacy behavior')

  const oldReady = harness()
  await connectedCall(oldReady)
  oldReady.setSendAvailable(false)
  oldReady.controller.connection(false)
  oldReady.setSendAvailable(true)
  oldReady.controller.connection(true, 1)
  oldReady.controller.handle({ type: 'voice.ready', version: 1 })
  assert.equal(oldReady.controller.state().reason, 'disconnected', 'legacy server ready rejects recovery')

  const oldAccepted = harness()
  await connectedCall(oldAccepted, { acceptedRecovery: false })
  oldAccepted.controller.connection(false)
  assert.equal(oldAccepted.controller.state().reason, 'disconnected', 'accepted without a valid resume token stays legacy')
}

async function testMediaRecoveryRestartAndGeneration() {
  const h = harness(), { callId, startedAt } = await connectedCall(h)
  const mediaEvent = h.opened[0].onEvent
  mediaEvent({ type: 'state', state: 'disconnected' })
  h.advance(5000)
  mediaEvent({ type: 'state', state: 'disconnected' })
  assert.equal(h.controller.state().reconnecting, true)
  assert.equal(h.opens, 1, 'media recovery reuses the existing capture and peer')

  h.advance(1500)
  const restartRequests = h.sent.filter(event => event.type === 'voice.restart' && event.callId === callId)
  assert.equal(restartRequests.length, 1, 'first restart request waits 1500 ms')
  h.controller.handle({ type: 'voice.restart', callId, generation: 1, offerer: true })
  h.controller.handle({ type: 'voice.restart', callId, generation: 1, offerer: false })
  assert.deepEqual(h.drivers[0].signals.filter(event => event.type === 'restart'),
    [{ type: 'restart', generation: 1, offerer: true }], 'restart generation must increase monotonically')
  h.controller.handle({ type: 'voice.ice', callId, generation: 0, candidate: { candidate: 'stale' } })
  h.controller.handle({ type: 'voice.ice', callId, generation: 1, candidate: { candidate: 'current' } })
  assert.equal(h.drivers[0].signals.some(event => event.candidate?.candidate === 'stale'), false)
  assert.equal(h.drivers[0].signals.at(-1).candidate.candidate, 'current')

  h.advance(16000)
  assert.equal(h.sent.filter(event => event.type === 'voice.restart').length, 3, 'restart retries are capped at three')
  h.advance(3000)
  assert.equal(h.sent.filter(event => event.type === 'voice.restart').length, 3, 'no restart is sent after the cap')
  assert.equal(h.controller.state().phase, 'connected')
  assert.equal(h.closes, 0)
  assert.equal(h.controller.state().startedAt, startedAt)
  mediaEvent({ type: 'state', state: 'connected' })
  assert.equal(h.controller.state().reconnecting, false)
  h.advance(30000)
  assert.equal(h.controller.state().phase, 'connected', 'successful media recovery clears the fixed deadline')
}

async function testMediaDeadlineAndSingleClose() {
  const h = harness(), { callId } = await connectedCall(h)
  h.opened[0].onEvent({ type: 'state', state: 'failed' })
  h.advance(20000)
  h.opened[0].onEvent({ type: 'state', state: 'disconnected' })
  h.advance(9999)
  assert.equal(h.controller.state().phase, 'connected')
  h.advance(1)
  assert.equal(h.controller.state().reason, 'disconnected')
  assert.equal(h.closes, 1, '30 second media deadline closes only once')
  assert.ok(h.sent.some(event => event.type === 'voice.end' && event.callId === callId && event.reason === 'disconnected'))
}

async function testPendingEndOwnerAndExplicitDeactivation() {
  const h = harness(), { callId } = await connectedCall(h)
  h.setSendAvailable(false)
  h.controller.connection(false)
  h.controller.end('hangup')
  assert.equal(h.closes, 1)
  h.controller.connection(true, 1)
  const capability = h.sent.at(-1)
  assert.equal(capability.resumeCallId, callId, 'pending hangup carries the resume identity')
  assert.equal(capability.resumeToken, TOKEN)
  h.controller.handle({ type: 'voice.ready', version: 1, recoveryVersion: 1 })
  h.controller.handle({ type: 'voice.resumed', callId })
  assert.ok(h.sent.some(event => event.type === 'voice.end' && event.callId === callId && event.reason === 'hangup'),
    'resume flushes a hangup that could not be sent during the outage')

  const account = harness(), accountCall = await connectedCall(account)
  account.setOwner('account-b')
  account.setSendAvailable(false)
  account.controller.connection(false)
  assert.equal(account.controller.state().reason, 'disconnected', 'account switch ends the old session')
  account.controller.connection(true, 1)
  assert.equal(Object.hasOwn(account.sent.at(-1), 'resumeCallId'), false, 'new account never resumes old account call')

  const inactive = harness(), inactiveCall = await connectedCall(inactive)
  inactive.controller.setActive(false)
  assert.equal(inactive.controller.state().reason, 'background')
  inactive.controller.setActive(true)
  inactive.controller.connection(false)
  inactive.controller.connection(true, 1)
  assert.equal(Object.hasOwn(inactive.sent.at(-1), 'resumeCallId'), false, 'explicit deactivation clears recovery credentials')
  assert.notEqual(inactiveCall.callId, inactive.sent.at(-1).resumeCallId)
}

async function testOutboxBounds() {
  const countBound = harness(), { callId } = await connectedCall(countBound)
  countBound.setSendAvailable(false)
  countBound.controller.connection(false)
  for (let i = 0; i < 65 && countBound.controller.state().phase !== 'ended'; i++)
    countBound.opened[0].onEvent({ type: 'camera', cameraEnabled: i % 2 === 0 })
  assert.equal(countBound.controller.state().reason, 'disconnected', 'the 65th queued frame ends an overflowing outbox')
  assert.equal(countBound.closes, 1)
  assert.ok(countBound.sent.some(event => event.type === 'voice.end' && event.callId === callId))

  const byteBound = harness(), { callId: byteCall } = await connectedCall(byteBound)
  byteBound.setSendAvailable(false)
  byteBound.controller.connection(false)
  byteBound.opened[0].onEvent({ type: 'offer', sdp: 'x'.repeat(20000) })
  assert.equal(byteBound.controller.state().reason, 'disconnected', 'oversized signaling frame ends the bounded outbox')
  assert.equal(byteBound.closes, 1)
  assert.ok(byteBound.sent.some(event => event.type === 'voice.end' && event.callId === byteCall))
}

async function testNativeOwnsRecoveryTimers() {
  const h = harness({ nativeTimeout: true })
  const { callId } = await connectedCall(h)
  h.opened[0].onEvent({ type: 'state', state: 'disconnected' })
  assert.equal(h.controller.state().reconnecting, true)
  h.advance(31000)
  assert.equal(h.controller.state().phase, 'connected', 'suspended JS cannot terminate a call governed by native recovery deadline')
  assert.equal(h.sent.filter(event => event.type === 'voice.restart').length, 0, 'native owns ICE retries too')
  h.controller.handle({ type: 'voice.local-generation', callId, generation: 2 })
  h.controller.handle({ type: 'voice.restart', callId, generation: 2, offerer: true })
  assert.equal(h.drivers[0].signals.filter(event => event.type === 'restart').length, 0, 'background native negotiation is never re-applied by JS')
  h.opened[0].onEvent({ type: 'ice', generation: 2, candidate: { candidate: 'current-native' } })
  assert.ok(h.sent.some(event => event.type === 'voice.ice' && event.generation === 2))
  h.opened[0].onEvent({ type: 'state', state: 'connected' })
  assert.equal(h.controller.state().reconnecting, false, 'native current-state snapshot clears the UI loss flag')
  h.controller.end()
}

await testNativeOwnsRecoveryTimers()
await testShortSignalingLossAndQueuedCamera()
await testAbsoluteSignalingDeadlineAndRecoveryCapability()
await testMediaRecoveryRestartAndGeneration()
await testMediaDeadlineAndSingleClose()
await testPendingEndOwnerAndExplicitDeactivation()
await testOutboxBounds()
console.log('voice-call recovery tests passed')
