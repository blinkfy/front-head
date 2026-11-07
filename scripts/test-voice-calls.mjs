import assert from 'node:assert/strict'
import { createVoiceCallController } from '../src/utils/voice-call-core.mjs'
import { createChatEventsTransport } from '../src/utils/chat-events-transport.mjs'

function harness(overrides = {}) {
  let owner = 'token-a'
  let selfId = 1
  let busy = false
  let nextId = 0
  let now = 1000
  let nextTimer = 0
  const timers = new Map()
  const sent = [], opened = [], cancelled = [], changed = [], drivers = [], permissionCalls = [], permissionModes = []
  const media = {
    supported: () => true,
    supportsVideo: () => true,
    prepareOutgoing: (callId, mode) => media.permission(callId, mode),
    open: options => {
      opened.push(options)
      if (overrides.open) return overrides.open(options)
      const driver = { signals: [], controls: [], closeCount: 0,
        signal(event) { this.signals.push(event) }, control(value) { this.controls.push(value) }, close() { this.closeCount++ } }
      drivers.push(driver)
      return driver
    },
    cancel: id => cancelled.push(id),
    ...overrides.media,
    permission: async (callId, mode = 'audio') => {
      permissionCalls.push(callId); permissionModes.push({ callId, mode })
      return overrides.media?.permission?.(callId, mode)
    }
  }
  const controller = createVoiceCallController({ media, send: event => { sent.push({ ...event }); return overrides.send ? overrides.send(event) : true },
    getOwner: () => owner, getSelfId: () => selfId, isMediaBusy: () => busy, changed: state => changed.push(state),
    now: () => now, createId: () => `call-${++nextId}`,
    setTimer: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id },
    clearTimer: id => timers.delete(id) })
  return { controller, sent, opened, cancelled, changed, drivers, permissionCalls, permissionModes, timers,
    setOwner: value => { owner = value }, setSelfId: value => { selfId = value }, setBusy: value => { busy = value },
    advance: delay => { now += delay; for (const [id, timer] of [...timers]) if (timer.delay <= delay) { timers.delete(id); timer.callback() } },
    owner: () => owner }
}

const tick = () => new Promise(resolve => setImmediate(resolve))

async function testCapabilityAndCallFlow() {
  const h = harness()
  const c = h.controller
  c.setActive(true)
  c.connection(true, 0)
  assert.equal(c.state().supported, false, 'legacy server never enables calls')
  assert.equal(h.sent.some(event => event.type === 'voice.capability'), false, 'legacy server receives no capability signal')
  assert.throws(() => c.start({ id: 2 }), /新版客户端/)

  c.connection(true, 1)
  assert.deepEqual(h.sent.at(-1), { type: 'voice.capability', version: 1, available: true })
  c.handle({ type: 'voice.ready', version: 1 })
  assert.equal(c.state().supported, true)
  assert.equal(c.state().videoSupported, false, 'server without video capability keeps video disabled')
  c.start({ id: 2, name: 'Peer' })
  await tick()
  const callId = c.state().callId
  assert.equal(c.state().phase, 'calling')
  assert.deepEqual(h.sent.at(-1), { type: 'voice.invite', callId, peerId: '2' })
  c.handle({ type: 'voice.accepted', callId })
  await tick()
  assert.equal(h.opened.length, 1)
  assert.deepEqual(h.opened[0].stunUrls, ['stun:stun.cloudflare.com:3478'], 'controller exposes STUN only, with no TURN configuration')
  assert.equal(h.opened[0].offerer, true)
  h.opened[0].onEvent({ type: 'offer', sdp: 'offer-sdp' })
  h.opened[0].onEvent({ type: 'ice', candidate: { candidate: 'candidate:1 1 UDP 1 10.0.0.1 9 typ host' } })
  h.opened[0].onEvent({ type: 'ice', candidate: { candidate: 'candidate:2 1 UDP 1 10.0.0.2 9 typ relay' } })
  assert.ok(h.sent.some(event => event.type === 'voice.offer' && event.callId === callId))
  assert.ok(h.sent.some(event => event.type === 'voice.ice' && event.candidate.candidate.includes('typ host')))
  assert.equal(h.sent.some(event => event.candidate?.candidate?.includes('typ relay')), false, 'relay candidates are never sent')
  c.handle({ type: 'voice.answer', callId, sdp: 'answer-sdp' })
  c.handle({ type: 'voice.ice', callId, candidate: { candidate: 'remote-ice' } })
  assert.deepEqual(h.drivers[0].signals, [
    { type: 'answer', callId, sdp: 'answer-sdp' }, { type: 'ice', callId, candidate: { candidate: 'remote-ice' } }
  ])
  h.opened[0].onEvent({ type: 'state', state: 'connected' })
  assert.ok(h.sent.some(event => event.type === 'voice.connected'))
  c.handle({ type: 'voice.connected', callId })
  assert.equal(c.state().phase, 'connected')
  assert.ok(c.state().startedAt > 0)
  c.control({ muted: true, speaker: true })
  assert.equal(c.state().muted, true)
  assert.equal(c.state().speaker, true)
  assert.deepEqual(h.drivers[0].controls.at(-1), { mediaError: '', muted: true, speaker: true })
  c.end()
  assert.equal(c.state().phase, 'ended')
  assert.equal(h.drivers[0].closeCount, 1)
  assert.ok(h.sent.some(event => event.type === 'voice.end' && event.reason === 'hangup'))
}

async function testPermissionPendingLifecycle() {
  let resolvePermission
  const pending = harness({ media: { prepareOutgoing: () => new Promise(resolve => { resolvePermission = resolve }) } })
  pending.controller.setActive(true); pending.controller.connection(true, 1); pending.controller.handle({ type: 'voice.ready', version: 1 })
  pending.controller.start({ id: 2 })
  const callId = pending.controller.state().callId
  await tick()
  assert.equal(pending.sent.some(event => event.type === 'voice.invite'), false, 'outgoing invite waits for the system permission callback')
  assert.equal(pending.timers.size, 0, 'ring timeout does not start while the permission sheet is open')
  pending.advance(60000)
  assert.equal(pending.controller.state().phase, 'calling', 'long permission wait does not end the outgoing call')
  resolvePermission()
  await tick()
  assert.ok(pending.sent.some(event => event.type === 'voice.invite' && event.callId === callId), 'grant sends the invite')

  let resolveCancelled
  const cancelled = harness({ media: { prepareOutgoing: () => new Promise(resolve => { resolveCancelled = resolve }) } })
  cancelled.controller.setActive(true); cancelled.controller.connection(true, 1); cancelled.controller.handle({ type: 'voice.ready', version: 1 })
  cancelled.controller.start({ id: 2 }); const cancelledId = cancelled.controller.state().callId
  await tick(); cancelled.controller.end('cancelled'); resolveCancelled(); await tick()
  assert.equal(cancelled.sent.some(event => event.type === 'voice.invite' && event.callId === cancelledId), false,
    'late permission grant after explicit cancellation cannot send an invite')

  let resolveAccountPermission
  const account = harness({ media: { prepareOutgoing: () => new Promise(resolve => { resolveAccountPermission = resolve }) } })
  account.controller.setActive(true); account.controller.connection(true, 1); account.controller.handle({ type: 'voice.ready', version: 1 })
  account.controller.start({ id: 2 }); const accountCallId = account.controller.state().callId
  await tick(); account.setOwner('token-b'); account.controller.setActive(false); resolveAccountPermission(); await tick()
  assert.equal(account.sent.some(event => event.type === 'voice.invite' && event.callId === accountCallId), false,
    'permission result from a previous account cannot send its pending invite')

  let resolveIncomingPermission
  const incoming = harness({ media: { permission: () => new Promise(resolve => { resolveIncomingPermission = resolve }) } })
  incoming.controller.setActive(true); incoming.controller.connection(true, 1); incoming.controller.handle({ type: 'voice.ready', version: 1 })
  incoming.controller.handle({ type: 'voice.incoming', callId: 'permission-wait-incoming', peer: { id: '2' } })
  const accepting = incoming.controller.accept()
  assert.equal(incoming.controller.state().phase, 'connecting')
  assert.equal(incoming.timers.size, 0, 'accept clears the incoming-ring timeout before opening permission')
  incoming.advance(60000)
  assert.equal(incoming.controller.state().phase, 'connecting', 'long permission wait does not time out an accepted call')
  resolveIncomingPermission(); await accepting
  assert.ok(incoming.sent.some(event => event.type === 'voice.accept' && event.callId === 'permission-wait-incoming'))
}

async function testVideoCapabilityAndControls() {
  const legacyServer = harness()
  legacyServer.controller.setActive(true); legacyServer.controller.connection(true, 1, 1)
  assert.deepEqual(legacyServer.sent.at(-1), { type: 'voice.capability', version: 1, available: true, video: true, cameraToggle: true })
  legacyServer.controller.handle({ type: 'voice.ready', version: 1 })
  assert.equal(legacyServer.controller.state().supported, true)
  assert.equal(legacyServer.controller.state().videoSupported, false, 'legacy ready without video keeps video disabled')
  assert.throws(() => legacyServer.controller.start({ id: 2 }, 'video'), /视频通话/)
  legacyServer.controller.handle({ type: 'voice.incoming', callId: 'forged-video', mode: 'video', peer: { id: '2' } })
  assert.ok(legacyServer.sent.some(event => event.type === 'voice.end' && event.callId === 'forged-video' && event.reason === 'failed'))
  assert.deepEqual(legacyServer.permissionCalls, [], 'unsupported forged incoming video never requests camera or microphone permission')

  const mediaWithoutVideo = harness({ media: { supportsVideo: () => false } })
  mediaWithoutVideo.controller.setActive(true); mediaWithoutVideo.controller.connection(true, 1, 1)
  assert.deepEqual(mediaWithoutVideo.sent.at(-1), { type: 'voice.capability', version: 1, available: true, video: false, cameraToggle: false })
  mediaWithoutVideo.controller.handle({ type: 'voice.ready', version: 1, video: true })
  assert.equal(mediaWithoutVideo.controller.state().videoSupported, false, 'server support cannot override a media adapter without video')

  const h = harness()
  const c = h.controller
  c.setActive(true); c.connection(true, 1, 1)
  c.handle({ type: 'voice.ready', version: 1, video: true })
  assert.equal(c.state().videoSupported, true)
  assert.equal(c.state().cameraSupported, false, 'camera support is call-scoped and false before video negotiation')
  c.start({ id: 2, name: 'Peer' }, 'video')
  await tick()
  const callId = c.state().callId
  assert.deepEqual(h.sent.at(-1), { type: 'voice.invite', callId, peerId: '2', mode: 'video' })
  c.handle({ type: 'voice.accepted', callId }); await tick()
  assert.equal(h.opened[0].mode, 'video')
  assert.equal(h.opened[0].cameraEnabled, true, 'video-mode call keeps its existing camera-on default')
  assert.equal(c.state().cameraSupported, true, 'video negotiation enables camera controls')
  assert.deepEqual(h.drivers[0].controls[0], { muted: false, speaker: true, cameraEnabled: true, remoteCameraEnabled: true })
  h.opened[0].onEvent({ type: 'camera', frontFacing: false, cameraEnabled: true })
  assert.equal(c.state().facingMode, 'environment', 'local camera status is reflected in call state')
  assert.equal(c.state().cameraEnabled, true, 'native camera event still mirrors local camera state')
  assert.deepEqual(h.sent.at(-1), { type: 'voice.media', callId, cameraEnabled: true }, 'native camera event still announces camera state')

  const connectingControls = h.drivers[0].controls.length
  const connectingSignals = h.drivers[0].signals.length
  const connectingSent = h.sent.length
  c.handle({ type: 'voice.local-control', callId, muted: true, speaker: false, cameraEnabled: false })
  assert.deepEqual({ muted: c.state().muted, speaker: c.state().speaker, cameraEnabled: c.state().cameraEnabled },
    { muted: true, speaker: false, cameraEnabled: false }, 'same-call native local controls mirror while connecting')
  assert.equal(h.drivers[0].controls.length, connectingControls, 'connecting local-control does not control the JS driver again')
  assert.equal(h.drivers[0].signals.length, connectingSignals, 'connecting local-control does not signal the JS driver')
  assert.equal(h.sent.length, connectingSent, 'connecting local-control does not send duplicate signaling')

  c.handle({ type: 'voice.connected', callId })
  const connectedControls = h.drivers[0].controls.length
  const connectedSignals = h.drivers[0].signals.length
  const connectedSent = h.sent.length
  c.handle({ type: 'voice.local-control', callId, muted: false, speaker: true, cameraEnabled: true })
  assert.deepEqual({ muted: c.state().muted, speaker: c.state().speaker, cameraEnabled: c.state().cameraEnabled },
    { muted: false, speaker: true, cameraEnabled: true }, 'same-call native local controls mirror while connected')
  assert.equal(h.drivers[0].controls.length, connectedControls, 'connected local-control does not control the JS driver again')
  assert.equal(h.drivers[0].signals.length, connectedSignals, 'connected local-control does not signal the JS driver')
  assert.equal(h.sent.length, connectedSent, 'connected local-control does not send duplicate signaling')

  c.handle({ type: 'voice.local-control', callId: 'different-call', muted: true, speaker: false, cameraEnabled: false })
  assert.deepEqual({ muted: c.state().muted, speaker: c.state().speaker, cameraEnabled: c.state().cameraEnabled },
    { muted: false, speaker: true, cameraEnabled: true }, 'local controls for another call are ignored')

  c.control({ cameraEnabled: false })
  assert.equal(c.state().cameraEnabled, false)
  assert.deepEqual(h.sent.at(-1), { type: 'voice.media', callId, cameraEnabled: false })
  assert.deepEqual(h.drivers[0].controls.at(-1), { mediaError: '', cameraEnabled: false })
  c.control({ switchCamera: true })
  assert.deepEqual(h.drivers[0].controls.at(-1), { mediaError: '', switchCamera: true })
  c.handle({ type: 'voice.media', callId, cameraEnabled: false })
  assert.equal(c.state().remoteCameraEnabled, false)
  assert.deepEqual(h.drivers[0].controls.at(-1), { remoteCameraEnabled: false })
  c.end()
  assert.deepEqual(h.cancelled, [callId], 'ending video also releases video media resources')
  const endedState = { muted: c.state().muted, speaker: c.state().speaker, cameraEnabled: c.state().cameraEnabled }
  c.handle({ type: 'voice.local-control', callId, muted: true, speaker: false, cameraEnabled: true })
  assert.deepEqual({ muted: c.state().muted, speaker: c.state().speaker, cameraEnabled: c.state().cameraEnabled }, endedState,
    'late local controls after call end are ignored')

  const audio = harness()
  audio.controller.setActive(true); audio.controller.connection(true, 1, 1)
  audio.controller.handle({ type: 'voice.ready', version: 1, video: true })
  audio.controller.start({ id: 2 }, 'audio'); const audioId = audio.controller.state().callId
  audio.controller.handle({ type: 'voice.accepted', callId: audioId }); await tick()
  audio.controller.handle({ type: 'voice.local-control', callId: audioId, muted: true, speaker: true, cameraEnabled: false })
  assert.deepEqual({ muted: audio.controller.state().muted, speaker: audio.controller.state().speaker,
    cameraEnabled: audio.controller.state().cameraEnabled }, { muted: true, speaker: true, cameraEnabled: false },
  'audio local-control mirrors audio fields and ignores camera state')

  const incoming = harness()
  incoming.controller.setActive(true); incoming.controller.connection(true, 1, 1)
  incoming.controller.handle({ type: 'voice.ready', version: 1, video: true })
  incoming.controller.handle({ type: 'voice.incoming', callId: 'incoming-audio-old-peer', peer: { id: '2' } })
  assert.equal(incoming.controller.state().cameraSupported, false, 'old peer without cameraToggle remains audio-only')
  await incoming.controller.accept()
  incoming.controller.handle({ type: 'voice.accepted', callId: 'incoming-audio-old-peer' }); await tick()
  assert.equal(incoming.opened[0].mode, 'audio', 'old peer acceptance does not pre-negotiate video')
  assert.equal(incoming.controller.state().cameraSupported, false)

  const cameraToggleIncoming = harness()
  cameraToggleIncoming.controller.setActive(true); cameraToggleIncoming.controller.connection(true, 1, 1)
  cameraToggleIncoming.controller.handle({ type: 'voice.ready', version: 1, video: true })
  cameraToggleIncoming.controller.handle({ type: 'voice.incoming', callId: 'incoming-audio-toggle', cameraToggle: true, peer: { id: '2' } })
  assert.equal(cameraToggleIncoming.controller.state().cameraSupported, true, 'cameraToggle incoming enables video negotiation')
  await cameraToggleIncoming.controller.accept()
  cameraToggleIncoming.controller.handle({ type: 'voice.accepted', callId: 'incoming-audio-toggle', cameraToggle: true }); await tick()
  assert.deepEqual(cameraToggleIncoming.permissionModes, [{ callId: 'incoming-audio-toggle', mode: 'audio' }],
    'camera-toggle audio call still requires microphone permission only at acceptance')
  assert.equal(cameraToggleIncoming.opened[0].mode, 'video', 'cameraToggle incoming pre-negotiates a video transceiver')
  assert.equal(cameraToggleIncoming.opened[0].cameraEnabled, false, 'camera-toggle audio starts with both cameras disabled')

  const acceptedToggle = harness()
  acceptedToggle.controller.setActive(true); acceptedToggle.controller.connection(true, 1, 1)
  acceptedToggle.controller.handle({ type: 'voice.ready', version: 1, video: true })
  acceptedToggle.controller.start({ id: 2 }, 'audio'); const acceptedToggleId = acceptedToggle.controller.state().callId
  await tick()
  acceptedToggle.controller.handle({ type: 'voice.accepted', callId: acceptedToggleId, cameraToggle: true }); await tick()
  assert.equal(acceptedToggle.controller.state().cameraSupported, true, 'accepted cameraToggle enables video controls')
  assert.equal(acceptedToggle.opened[0].mode, 'video', 'accepted cameraToggle pre-negotiates video for audio call')
  assert.equal(acceptedToggle.opened[0].cameraEnabled, false, 'accepted audio cameraToggle leaves the local camera off')
  assert.deepEqual(acceptedToggle.drivers[0].controls[0].cameraEnabled, false)

  let resolveVideoOpen
  const videoRace = harness({ open: () => new Promise(resolve => { resolveVideoOpen = resolve }) })
  videoRace.controller.setActive(true); videoRace.controller.connection(true, 1, 1)
  videoRace.controller.handle({ type: 'voice.ready', version: 1, video: true })
  videoRace.controller.start({ id: 2 }, 'video'); const videoRaceId = videoRace.controller.state().callId
  videoRace.controller.handle({ type: 'voice.accepted', callId: videoRaceId }); await tick()
  videoRace.controller.end('cancelled')
  const lateVideoDriver = { closeCount: 0, close() { this.closeCount++ }, signal() {}, control() {} }
  resolveVideoOpen(lateVideoDriver); await tick()
  assert.equal(lateVideoDriver.closeCount, 1, 'video driver resolving after hangup is immediately closed')
  assert.deepEqual(videoRace.cancelled, [videoRaceId], 'video hangup cancels pending camera/media resources')
}

async function testIncomingQueueAndOutcomes() {
  const h = harness()
  const c = h.controller
  c.setActive(true); c.connection(true, 1); c.handle({ type: 'voice.ready', version: 1 })
  c.handle({ type: 'voice.incoming', callId: 'incoming-1', peer: { id: '2', name: 'Peer' } })
  assert.equal(c.state().phase, 'incoming')
  c.handle({ type: 'voice.offer', callId: 'incoming-1', sdp: 'remote-offer' })
  c.handle({ type: 'voice.ice', callId: 'incoming-1', candidate: { candidate: 'remote-early-ice' } })
  await c.accept()
  assert.deepEqual(h.permissionCalls, ['incoming-1'], 'accept passes the active call ID to the permission/media owner')
  assert.deepEqual(h.permissionModes, [{ callId: 'incoming-1', mode: 'audio' }], 'legacy incoming voice acceptance requests audio permission only')
  assert.ok(h.sent.some(event => event.type === 'voice.accept' && event.callId === 'incoming-1'))
  c.handle({ type: 'voice.accepted', callId: 'incoming-1' })
  await tick()
  assert.deepEqual(h.drivers[0].signals, [
    { type: 'offer', callId: 'incoming-1', sdp: 'remote-offer' },
    { type: 'ice', callId: 'incoming-1', candidate: { candidate: 'remote-early-ice' } }
  ], 'remote offer and ICE wait until the media driver is ready')
  c.handle({ type: 'voice.ended', callId: 'incoming-1', reason: 'rejected' })
  assert.equal(c.state().reason, 'rejected')
  assert.equal(h.drivers[0].closeCount, 1)

  const busy = harness(); busy.controller.setActive(true); busy.controller.connection(true, 1)
  busy.controller.handle({ type: 'voice.ready', version: 1 }); busy.controller.start({ id: 2 })
  busy.controller.handle({ type: 'voice.incoming', callId: 'incoming-2', peer: { id: '3' } })
  assert.ok(busy.sent.some(event => event.type === 'voice.end' && event.callId === 'incoming-2' && event.reason === 'busy'))

  const timeout = harness(); timeout.controller.setActive(true); timeout.controller.connection(true, 1)
  timeout.controller.handle({ type: 'voice.ready', version: 1 }); timeout.controller.start({ id: 2 }); await tick()
  timeout.advance(35000)
  assert.equal(timeout.controller.state().reason, 'timeout')
  assert.ok(timeout.sent.some(event => event.type === 'voice.end' && event.reason === 'timeout'))

  const denied = harness({ media: { permission: async () => { throw new Error('denied') } } })
  denied.controller.setActive(true); denied.controller.connection(true, 1); denied.controller.handle({ type: 'voice.ready', version: 1 })
  denied.controller.handle({ type: 'voice.incoming', callId: 'denied', peer: { id: '2' } })
  await denied.controller.accept()
  assert.equal(denied.controller.state().reason, 'permission_denied')
  assert.deepEqual(denied.permissionCalls, ['denied'])
  assert.ok(denied.sent.some(event => event.type === 'voice.end' && event.reason === 'permission_denied'))
  assert.deepEqual(denied.cancelled, ['denied'])
}

async function testLateResourcesAndSessionInvalidation() {
  let resolveOpen
  const lateOpen = harness({ open: () => new Promise(resolve => { resolveOpen = resolve }) })
  lateOpen.controller.setActive(true); lateOpen.controller.connection(true, 1); lateOpen.controller.handle({ type: 'voice.ready', version: 1 })
  lateOpen.controller.start({ id: 2 }); const id = lateOpen.controller.state().callId
  lateOpen.controller.handle({ type: 'voice.accepted', callId: id }); await tick()
  lateOpen.controller.end('cancelled')
  const driver = { closeCount: 0, close() { this.closeCount++ }, signal() {}, control() {} }
  resolveOpen(driver); await tick()
  assert.equal(driver.closeCount, 1, 'media.open resolving after hangup immediately closes its late driver')
  assert.deepEqual(lateOpen.cancelled, [id])
  const oldSignalCount = lateOpen.sent.length
  lateOpen.opened[0].onEvent({ type: 'offer', sdp: 'late-offer' })
  lateOpen.opened[0].onEvent({ type: 'state', state: 'connected' })
  assert.equal(lateOpen.sent.length, oldSignalCount, 'late driver callbacks cannot send signaling after hangup')

  let resolvePermission
  const latePermission = harness({ media: { permission: () => new Promise(resolve => { resolvePermission = resolve }) } })
  latePermission.controller.setActive(true); latePermission.controller.connection(true, 1); latePermission.controller.handle({ type: 'voice.ready', version: 1 })
  latePermission.controller.handle({ type: 'voice.incoming', callId: 'permission-late', peer: { id: '2' } })
  const pendingAccept = latePermission.controller.accept()
  latePermission.controller.end('cancelled'); resolvePermission(); await pendingAccept
  assert.equal(latePermission.sent.some(event => event.type === 'voice.accept'), false, 'late permission resolution sends no accept for an ended call')

  const ownerChange = harness()
  ownerChange.controller.setActive(true); ownerChange.controller.connection(true, 1); ownerChange.controller.handle({ type: 'voice.ready', version: 1 })
  ownerChange.controller.handle({ type: 'voice.incoming', callId: 'old-owner', peer: { id: '2' } })
  ownerChange.setOwner('token-b')
  await ownerChange.controller.accept()
  assert.equal(ownerChange.sent.some(event => event.type === 'voice.accept'), false, 'account change invalidates pending permission work')
  ownerChange.controller.end()
  assert.equal(ownerChange.sent.some(event => event.type === 'voice.end' && event.callId === 'old-owner'), false, 'no signaling is sent using a different token')

  let resolveOldOwnerOpen
  const oldOwnerOpen = harness({ open: () => new Promise(resolve => { resolveOldOwnerOpen = resolve }) })
  oldOwnerOpen.controller.setActive(true); oldOwnerOpen.controller.connection(true, 1); oldOwnerOpen.controller.handle({ type: 'voice.ready', version: 1 })
  oldOwnerOpen.controller.start({ id: 2 }); const oldOwnerCallId = oldOwnerOpen.controller.state().callId
  oldOwnerOpen.controller.handle({ type: 'voice.accepted', callId: oldOwnerCallId }); await tick()
  oldOwnerOpen.setOwner('token-b')
  oldOwnerOpen.controller.end('cancelled')
  assert.equal(oldOwnerOpen.sent.some(event => event.type === 'voice.end' && event.callId === oldOwnerCallId), false,
    'account switch never sends end for the previous account session')
  const oldOwnerDriver = { closeCount: 0, close() { this.closeCount++ }, signal() {}, control() {} }
  resolveOldOwnerOpen(oldOwnerDriver); await tick()
  oldOwnerOpen.opened[0].onEvent({ type: 'offer', sdp: 'old-account-offer' })
  assert.equal(oldOwnerDriver.closeCount, 1, 'late media from the old account is immediately released')
  assert.deepEqual(oldOwnerOpen.cancelled, [oldOwnerCallId])
  assert.equal(oldOwnerOpen.sent.some(event => event.type.startsWith('voice.') && event.callId === oldOwnerCallId && event.type !== 'voice.invite'), false,
    'late media from the old account sends no stale signaling')

  const background = harness()
  background.controller.setActive(true); background.controller.connection(true, 1); background.controller.handle({ type: 'voice.ready', version: 1 })
  background.controller.start({ id: 2 }); const bgId = background.controller.state().callId
  background.controller.setActive(false)
  assert.equal(background.controller.state().reason, 'background')
  assert.deepEqual(background.cancelled, [bgId])
  assert.equal(background.sent.filter(event => event.type === 'voice.end' && event.callId === bgId && event.reason === 'background').length, 1,
    'same-account background sends one end signal so the peer and server can release the call')
  const backgroundOpen = harness({ open: () => new Promise(resolve => { resolveOpen = resolve }) })
  backgroundOpen.controller.setActive(true); backgroundOpen.controller.connection(true, 1); backgroundOpen.controller.handle({ type: 'voice.ready', version: 1 })
  backgroundOpen.controller.start({ id: 2 }); const backgroundId = backgroundOpen.controller.state().callId
  backgroundOpen.controller.handle({ type: 'voice.accepted', callId: backgroundId }); await tick()
  const beforeBackground = backgroundOpen.sent.length
  backgroundOpen.controller.setActive(false)
  const backgroundDriver = { closeCount: 0, close() { this.closeCount++ }, signal() {}, control() {} }
  resolveOpen(backgroundDriver); await tick()
  backgroundOpen.opened[0].onEvent({ type: 'answer', sdp: 'late-answer' })
  backgroundOpen.opened[0].onEvent({ type: 'ice', candidate: { candidate: 'late-ice' } })
  backgroundOpen.opened[0].onEvent({ type: 'state', state: 'connected' })
  assert.equal(backgroundDriver.closeCount, 1, 'background cleanup closes a media driver that resolves late')
  assert.equal(backgroundOpen.sent.length, beforeBackground + 1, 'late background callbacks send nothing after the single end signal')
  assert.deepEqual(backgroundOpen.sent.at(-1), { type: 'voice.end', callId: backgroundId, reason: 'background' })

  const disconnected = harness()
  disconnected.controller.setActive(true); disconnected.controller.connection(true, 1); disconnected.controller.handle({ type: 'voice.ready', version: 1 })
  disconnected.controller.handle({ type: 'voice.incoming', callId: 'disconnect', peer: { id: '2' } })
  disconnected.controller.connection(false)
  assert.equal(disconnected.controller.state().reason, 'disconnected')
  assert.deepEqual(disconnected.cancelled, ['disconnect'])
}

function testTransportVoiceAuthentication() {
  let token = 'token-a', timerCallback
  const sockets = [], events = [], disconnected = []
  const transport = createChatEventsTransport({ getToken: () => token, getBaseUrl: () => 'https://example.test',
    connectSocket: () => {
      const socket = { handlers: {}, sent: [], onMessage(fn) { this.handlers.message = fn }, onClose(fn) { this.handlers.close = fn },
        onError(fn) { this.handlers.error = fn }, close() {}, send(value) { this.sent.push(JSON.parse(value.data)) } }
      sockets.push(socket); return socket
    }, onEvent: event => events.push(event), onDisconnected: () => disconnected.push(true),
    setTimer: callback => { timerCallback = callback; return 1 }, clearTimer: () => { timerCallback = null } })
  transport.setActive(true)
  const socket = sockets[0]
  assert.equal(transport.send({ type: 'voice.invite' }), false, 'an unauthenticated socket cannot send voice signaling')
  socket.handlers.message({ data: JSON.stringify({ type: 'connected', voiceCallVersion: 1 }) })
  assert.equal(transport.send({ type: 'voice.invite', callId: 'a' }), true, 'authenticated same-token socket sends voice signaling')
  assert.deepEqual(socket.sent.at(-1), { type: 'voice.invite', callId: 'a' })
  const incoming = { type: 'voice.incoming', callId: 'b', peer: { id: '2' } }
  socket.handlers.message({ data: JSON.stringify(incoming) })
  assert.deepEqual(events, [incoming], 'voice events are passed through the transport')
  token = 'token-b'
  assert.equal(transport.send({ type: 'voice.end' }), false, 'token replacement immediately blocks sends on the old socket')
  assert.equal(transport.isConnected(), false)
  timerCallback()
  assert.ok(disconnected.length >= 1, 'transport reports the disconnected/account-invalidated state')
  transport.setActive(false)
  assert.equal(timerCallback, null)
}

async function testNativeConnectionTimeoutOwnership() {
  const native = harness({ media: { managesConnectionTimeout: () => true } })
  native.controller.setActive(true); native.controller.connection(true, 1)
  native.controller.handle({ type: 'voice.ready', version: 1 })
  native.controller.start({ id: 2, name: 'Native peer' })
  await tick()
  const nativeId = native.controller.state().callId
  native.controller.handle({ type: 'voice.accepted', callId: nativeId })
  await tick()
  assert.equal(native.timers.size, 0, 'native media delegates its connection deadline and clears the JS invite timer')
  native.opened[0].onEvent({ type: 'state', state: 'disconnected' })
  assert.equal(native.timers.size, 0, 'native disconnected grace does not create a JS timer')
  native.advance(35000)
  assert.equal(native.controller.state().callId, nativeId, 'long native signaling delay does not trigger a JS timeout')
  native.controller.handle({ type: 'voice.ended', callId: nativeId, reason: 'connect_failed' })
  assert.equal(native.controller.state().phase, 'ended', 'server end event still releases a native call')

  const h5 = harness()
  h5.controller.setActive(true); h5.controller.connection(true, 1)
  h5.controller.handle({ type: 'voice.ready', version: 1 })
  h5.controller.start({ id: 3, name: 'Web peer' })
  await tick()
  const h5Id = h5.controller.state().callId
  h5.controller.handle({ type: 'voice.accepted', callId: h5Id })
  await tick()
  assert.equal([...h5.timers.values()].some(timer => timer.delay === 32000), true, 'H5 retains the JS connection deadline')
  h5.advance(32000)
  assert.equal(h5.controller.state().reason, 'connect_failed', 'H5 call still ends when its JS connection deadline expires')
}

async function main() {
  const cases = [
    ['capability and direct call flow', testCapabilityAndCallFlow],
    ['permission pending lifecycle', testPermissionPendingLifecycle],
    ['video capability, mode and camera controls', testVideoCapabilityAndControls],
    ['incoming queue and call outcomes', testIncomingQueueAndOutcomes],
    ['late resources and session invalidation', testLateResourcesAndSessionInvalidation],
    ['native and H5 connection timeout ownership', testNativeConnectionTimeoutOwnership],
    ['transport voice authentication', testTransportVoiceAuthentication]
  ]
  let failed = 0
  for (const [name, run] of cases) {
    try { await run(); console.log(`PASS ${name}`) }
    catch (error) { failed++; console.error(`FAIL ${name}: ${error.stack || error}`) }
  }
  if (failed) process.exitCode = 1
  else console.log('Voice-call controller tests passed.')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
