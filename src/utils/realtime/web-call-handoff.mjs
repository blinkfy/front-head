// A shadow peer shares capture tracks, never their lifetime. The active peer
// remains untouched until the server commits both participants' ready reports.
export function createWebCallHandoff({ createPeer, tracks, stream, video, emit, committed }) {
  let current = null
  const dispose = stage => {
    stage.peer.onicecandidate = stage.peer.ontrack = stage.peer.onconnectionstatechange = stage.peer.oniceconnectionstatechange = null
    stage.peer.close()
    for (const track of stage.remote) track.stop()
  }
  const cancel = () => { const stage = current; current = null; if (stage) dispose(stage) }
  const active = stage => current === stage
  function report(stage, kind, extra = {}) { if (active(stage)) emit({ type: 'handoff', transferId: stage.id, kind, ...extra }) }
  function prepare(event) {
    cancel()
    const stage = { id: event.transferId, generation: event.generation, peer: createPeer(), remote: [], queued: [], remoteSet: false, ready: false, chain: Promise.resolve() }
    current = stage
    const source = tracks()
    stage.audioSender = source.audio ? stage.peer.addTrack(source.audio, stream) : null
    stage.videoSender = video ? (source.video ? stage.peer.addTrack(source.video, stream) : stage.peer.addTransceiver('video', { direction: 'sendrecv' }).sender) : null
    stage.peer.ontrack = ({ track }) => {
      if (!active(stage)) return
      if (track.kind === 'audio') track.enabled = false
      stage.remote.push(track)
    }
    stage.peer.onicecandidate = ({ candidate }) => {
      if (candidate && !/ typ relay(?: |$)/.test(candidate.candidate)) report(stage, 'ice', { candidate: candidate.toJSON() })
    }
    const connection = () => {
      const state = stage.peer.connectionState || stage.peer.iceConnectionState
      if (state === 'connected' || state === 'completed') {
        if (!stage.ready) { stage.ready = true; report(stage, 'connected') }
      } else if (state === 'failed' || state === 'closed') report(stage, 'failed')
    }
    stage.peer.onconnectionstatechange = stage.peer.oniceconnectionstatechange = connection
    stage.chain = Promise.resolve().then(async () => {
      if (!active(stage)) return
      const offer = await stage.peer.createOffer()
      if (!active(stage)) return
      await stage.peer.setLocalDescription(offer)
      report(stage, 'offer', { sdp: stage.peer.localDescription.sdp })
    }).catch(() => report(stage, 'failed'))
  }
  return {
    get pending() { return !!current },
    signal(event) {
      if (event.type === 'handoff-prepare') { try { prepare(event) } catch (_) { if (current) report(current, 'failed'); cancel() }; return }
      const stage = current
      if (!stage || stage.id !== event.transferId) return
      if (event.type === 'handoff-cancel') { cancel(); return }
      if (event.type === 'handoff-commit') {
        current = null
        stage.peer.onicecandidate = stage.peer.ontrack = stage.peer.onconnectionstatechange = stage.peer.oniceconnectionstatechange = null
        for (const track of stage.remote) if (track.kind === 'audio') track.enabled = true
        committed(stage)
        return
      }
      stage.chain = stage.chain.then(async () => {
        if (!active(stage)) return
        if (event.kind === 'ice') {
          if (/ typ relay(?: |$)/.test(event.candidate?.candidate || '')) return
          if (stage.remoteSet) await stage.peer.addIceCandidate(event.candidate)
          else if (stage.queued.length < 64) stage.queued.push(event.candidate)
        } else if (event.kind === 'answer') {
          await stage.peer.setRemoteDescription({ type: 'answer', sdp: event.sdp })
          if (!active(stage)) return
          stage.remoteSet = true
          for (const candidate of stage.queued.splice(0)) await stage.peer.addIceCandidate(candidate)
        }
      }).catch(() => report(stage, 'failed'))
    },
    cancel
  }
}
