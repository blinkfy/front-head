import assert from 'node:assert/strict'
import { createWebCallHandoff } from '../../src/utils/realtime/web-call-handoff.mjs'

const tick = () => new Promise(resolve => setImmediate(resolve))

function mockPeer({ offer } = {}) {
  const peer = { senders: [], addedCandidates: [], closed: 0, localDescription: null,
    addTrack(track, stream) { const sender = { track, stream }; this.senders.push(sender); return sender },
    addTransceiver(kind, options) { const sender = { track: null, kind, options }; this.senders.push(sender); return { sender } },
    createOffer: offer || (async () => ({ type: 'offer', sdp: 'offer-sdp' })),
    async setLocalDescription(description) { this.localDescription = description },
    async setRemoteDescription(description) { this.remoteDescription = description },
    async addIceCandidate(candidate) { this.addedCandidates.push(candidate) },
    close() { this.closed++ } }
  return peer
}

async function testShadowUsesCurrentTracksAndMutesRemoteAudioUntilCommit() {
  const oldAudio = { kind: 'audio', stopped: 0, stop() { this.stopped++ } }
  const oldVideo = { kind: 'video', stopped: 0, stop() { this.stopped++ } }
  const currentAudio = { kind: 'audio', stopped: 0, stop() { this.stopped++ } }
  const currentVideo = { kind: 'video', stopped: 0, stop() { this.stopped++ } }
  const stream = { id: 'existing-capture' }, peers = [], events = [], committed = []
  let selected = { audio: oldAudio, video: oldVideo }
  const handoff = createWebCallHandoff({ createPeer: () => { const peer = mockPeer(); peers.push(peer); return peer },
    tracks: () => selected, stream, video: true, emit: event => events.push(event), committed: stage => committed.push(stage) })
  selected = { audio: currentAudio, video: currentVideo }
  handoff.signal({ type: 'handoff-prepare', transferId: 'xfer-1', generation: 7 })
  await tick(); await tick()
  assert.equal(peers.length, 1)
  assert.equal(peers[0].senders[0].track, currentAudio, 'shadow reuses the current audio capture track')
  assert.equal(peers[0].senders[1].track, currentVideo, 'shadow reuses the current camera sender track')
  assert.equal(peers[0].senders[0].stream, stream)
  assert.ok(events.some(event => event.kind === 'offer' && event.sdp === 'offer-sdp'))

  const remoteAudio = { kind: 'audio', enabled: true, stopped: 0, stop() { this.stopped++ } }
  const remoteVideo = { kind: 'video', stopped: 0, stop() { this.stopped++ } }
  peers[0].ontrack({ track: remoteAudio })
  peers[0].ontrack({ track: remoteVideo })
  assert.equal(remoteAudio.enabled, false, 'candidate audio stays muted before commit')
  handoff.signal({ type: 'handoff-commit', transferId: 'xfer-1' })
  assert.equal(remoteAudio.enabled, true)
  assert.equal(committed.length, 1)
  assert.equal(handoff.pending, false)
  assert.equal(peers[0].closed, 0, 'committed shadow is retained for promotion')
  handoff.signal({ type: 'handoff-cancel', transferId: 'xfer-1' })
  assert.equal(remoteAudio.stopped, 0)
}

async function testCancelClosesShadowWithoutStoppingSharedCapture() {
  const audio = { kind: 'audio', stopped: 0, stop() { this.stopped++ } }
  const video = { kind: 'video', stopped: 0, stop() { this.stopped++ } }
  const remoteAudio = { kind: 'audio', enabled: true, stopped: 0, stop() { this.stopped++ } }
  const peer = mockPeer(), events = [], commits = []
  const handoff = createWebCallHandoff({ createPeer: () => peer, tracks: () => ({ audio, video }), stream: {}, video: true,
    emit: event => events.push(event), committed: stage => commits.push(stage) })
  handoff.signal({ type: 'handoff-prepare', transferId: 'xfer-2', generation: 1 })
  await tick(); await tick()
  peer.ontrack({ track: remoteAudio })
  handoff.signal({ type: 'handoff-cancel', transferId: 'xfer-2' })
  assert.equal(handoff.pending, false)
  assert.equal(peer.closed, 1)
  assert.equal(remoteAudio.stopped, 1, 'only tracks owned by the shadow peer are stopped')
  assert.equal(audio.stopped, 0, 'cancel leaves the existing microphone track alive')
  assert.equal(video.stopped, 0, 'cancel leaves the existing camera track alive')
  assert.equal(commits.length, 0)
  const count = events.length
  peer.onicecandidate?.({ candidate: { candidate: 'candidate:late', toJSON: () => ({ candidate: 'candidate:late' }) } })
  assert.equal(events.length, count, 'cancel detaches the shadow peer event handlers')
}

async function testLateOfferPromiseAfterCancelIsIgnored() {
  let resolveOffer
  const pendingOffer = new Promise(resolve => { resolveOffer = resolve })
  const peer = mockPeer({ offer: () => pendingOffer }), events = [], commits = []
  const handoff = createWebCallHandoff({ createPeer: () => peer,
    tracks: () => ({ audio: { kind: 'audio' }, video: null }), stream: {}, video: false,
    emit: event => events.push(event), committed: stage => commits.push(stage) })
  handoff.signal({ type: 'handoff-prepare', transferId: 'xfer-3', generation: 2 })
  await tick()
  assert.equal(handoff.pending, true)
  handoff.cancel()
  const count = events.length
  resolveOffer({ type: 'offer', sdp: 'too-late' })
  await tick(); await tick()
  assert.equal(peer.localDescription, null, 'stale asynchronous offer is never installed after cancellation')
  assert.equal(events.length, count, 'stale asynchronous offer emits no signaling events')
  assert.equal(commits.length, 0)
}

await testShadowUsesCurrentTracksAndMutesRemoteAudioUntilCommit()
await testCancelClosesShadowWithoutStoppingSharedCapture()
await testLateOfferPromiseAfterCancelIsIgnored()
console.log('web-call handoff media tests passed')
