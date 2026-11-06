// #ifdef APP-PLUS
import { voiceRtcAvailable, videoRtcAvailable, onVoicePeerEvent, openVoicePeer, signalVoicePeer, controlVoicePeer, closeVoicePeer, showVoicePeerVideo } from '@/uni_modules/ftx-voice-call'
// #endif
import { androidRealtimeAvailable } from './android-realtime.js'

const stopped = new Set()
const streams = new Map()
const peers = new Map()
const videoHosts = new Map()
const pendingNative = new Map()
const nativeCallbacks = new Map()
let nativeListenerInstalled = false
const permissionError = () => Object.assign(new Error('Microphone unavailable'), { code: 'permission_denied' })
const closeTracks = stream => stream?.getTracks().forEach(track => track.stop())
const cameraConstraints = facingMode => ({ facingMode: facingMode === 'user' ? 'user' : { exact: facingMode },
  width: { ideal: 640, max: 960 }, height: { ideal: 480, max: 720 }, frameRate: { ideal: 24, max: 24 } })

export const voiceCallMedia = {
  managesConnectionTimeout() { return androidRealtimeAvailable() },
  supported() {
    // #ifdef APP-PLUS
    try { return typeof plus !== 'undefined' && plus.os.name === 'Android' && voiceRtcAvailable() === true } catch (_) { return false }
    // #endif
    // #ifdef H5
    return !!(globalThis.isSecureContext && globalThis.RTCPeerConnection && navigator.mediaDevices?.getUserMedia)
    // #endif
    // #ifndef APP-PLUS || H5
    return false
    // #endif
  },
  supportsVideo() {
    // #ifdef APP-PLUS
    try { return this.supported() && typeof videoRtcAvailable === 'function' && videoRtcAvailable() === true } catch (_) { return false }
    // #endif
    // #ifdef H5
    return this.supported()
    // #endif
    // #ifndef APP-PLUS || H5
    return false
    // #endif
  },
  canRouteAudio() {
    // #ifdef APP-PLUS
    return true
    // #endif
    // #ifndef APP-PLUS
    return false
    // #endif
  },
  async permission(callId, mode = 'audio') {
    // #ifdef APP-PLUS
    await new Promise((resolve, reject) => {
      try {
        const permissions = ['android.permission.RECORD_AUDIO', ...(mode === 'video' ? ['android.permission.CAMERA'] : [])]
        plus.android.requestPermissions([...permissions, 'android.permission.POST_NOTIFICATIONS'], result => {
          if (permissions.every(permission => result.granted?.includes(permission))) resolve()
          else reject(permissionError())
        }, () => reject(permissionError()))
      } catch (_) { reject(permissionError()) }
    })
    // #endif
    // #ifdef H5
    if (!streams.has(callId)) {
      const promise = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: mode === 'video' ? cameraConstraints('user') : false })
        .then(stream => {
          if (stopped.has(callId)) { closeTracks(stream); throw permissionError() }
          return stream
        }).catch(error => { streams.delete(callId); throw Object.assign(error, {
          code: mode === 'video' && ['NotFoundError', 'NotReadableError', 'OverconstrainedError'].includes(error.name) ? 'camera_unavailable' : 'permission_denied' }) })
      streams.set(callId, promise)
    }
    await streams.get(callId)
    // #endif
  },
  async open(options) {
    const { callId, onEvent, isCurrent } = options
    const video = options.mode === 'video'
    if (!this.supported()) throw Object.assign(new Error('Unsupported'), { code: 'unsupported' })
    if (video && !this.supportsVideo()) throw Object.assign(new Error('Unsupported video'), { code: 'unsupported' })
    // #ifdef APP-PLUS
    await this.permission(callId, options.mode)
    if (!nativeListenerInstalled) {
      onVoicePeerEvent(json => {
        try { const event = JSON.parse(json); nativeCallbacks.get(event.callId)?.(event) } catch (_) {}
      })
      nativeListenerInstalled = true
    }
    if (!isCurrent()) throw new Error('Cancelled')
    return new Promise((resolve, reject) => {
      const driver = { signal: event => signalVoicePeer(callId, JSON.stringify(event)),
        control: value => controlVoicePeer(callId, JSON.stringify(value)), close: () => this.cancel(callId) }
      const timer = setTimeout(() => { this.cancel(callId); reject(new Error('Native peer unavailable')) }, 12000)
      pendingNative.set(callId, () => { clearTimeout(timer); reject(new Error('Cancelled')) })
      try {
        nativeCallbacks.set(callId, event => {
          if (!isCurrent()) { this.cancel(callId); return }
          if (event.type === 'ready') { clearTimeout(timer); pendingNative.delete(callId); resolve(driver) }
          else onEvent(event.type === 'error' && event.reason === 'unavailable' ? { ...event, reason: 'failed' } : event)
        })
        openVoicePeer(JSON.stringify({ callId, offerer: options.offerer,
          ...(video ? { mode: 'video', peerName: String(options.peerName || '联系人').slice(0, 80) } : {}),
          stunUrls: options.stunUrls.filter(url => /^stuns?:/.test(url)).slice(0, 3) }))
      } catch (error) { clearTimeout(timer); pendingNative.delete(callId); nativeCallbacks.delete(callId); reject(error) }
    })
    // #endif
    // #ifdef H5
    await this.permission(callId, options.mode)
    const stream = await streams.get(callId)
    if (!isCurrent()) { this.cancel(callId); throw new Error('Cancelled') }
    const peer = new RTCPeerConnection({ iceServers: options.stunUrls.filter(url => /^stuns?:/.test(url)).slice(0, 3).map(urls => ({ urls })) })
    const audio = document.createElement(video ? 'video' : 'audio')
    audio.autoplay = true; audio.setAttribute('playsinline', ''); audio.dataset.voiceCallAudio = 'true'
    if (video) { audio.dataset.callVideo = 'remote'; audio.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#101916' }
    else { audio.style.display = 'none'; document.body.appendChild(audio) }
    const local = video ? document.createElement('video') : null
    if (local) {
      local.autoplay = true; local.muted = true; local.setAttribute('playsinline', ''); local.dataset.callVideo = 'local'
      local.style.cssText = 'width:100%;height:100%;object-fit:cover;transform:scaleX(-1)'; local.srcObject = stream
      void local.play().catch(() => {})
    }
    let remoteSet = false, closed = false, chain = Promise.resolve()
    let videoSender = null, cameraEnabled = true, cameraDesired = true, facingMode = 'user', requestedFacing = 'user'
    let cameraRevision = 0, cameraChain = Promise.resolve()
    const pendingCameras = new Set()
    const remoteStream = new MediaStream()
    // Audio and video arrive as separate track events. Keep one srcObject;
    // replacing it on every event aborts an already pending play() promise.
    audio.srcObject = remoteStream
    const queued = []
    const emit = event => { if (!closed && isCurrent()) onEvent(event) }
    const playRemote = () => {
      void audio.play().then(() => emit({ type: 'playback', blocked: false })).catch(error => {
        if (error.name !== 'AbortError') emit({ type: 'playback', blocked: true })
      })
    }
    const replaceCamera = async (facing, revision) => {
      const current = () => !closed && isCurrent() && cameraDesired && revision === cameraRevision
      if (!current()) return
      const replacement = await navigator.mediaDevices.getUserMedia({ audio: false, video: cameraConstraints(facing) })
      pendingCameras.add(replacement)
      if (!current()) { closeTracks(replacement); pendingCameras.delete(replacement); return }
      const track = replacement.getVideoTracks()[0]
      let adopted = false
      try {
        if (!track) throw new Error('Camera unavailable')
        await videoSender.replaceTrack(track)
        if (!current() || track.readyState === 'ended') return
        stream.getVideoTracks().forEach(old => { stream.removeTrack(old); old.stop() })
        stream.addTrack(track); adopted = true; cameraEnabled = true; facingMode = facing
        local.srcObject = stream; local.style.transform = facing === 'user' ? 'scaleX(-1)' : ''
        void local.play().catch(() => {})
        emit({ type: 'camera', frontFacing: facing === 'user', cameraEnabled: true })
      } finally {
        if (!adopted) closeTracks(replacement)
        pendingCameras.delete(replacement)
      }
    }
    const reconcileCamera = async () => {
      if (closed || !isCurrent()) return
      const revision = cameraRevision
      try {
        if (!cameraDesired) {
          await videoSender.replaceTrack(null)
        } else if (!cameraEnabled || videoSender.track?.readyState !== 'live' || facingMode !== requestedFacing) {
          await replaceCamera(requestedFacing, revision)
        }
      } catch (_) {
        if (!closed && isCurrent() && revision === cameraRevision) {
          cameraEnabled = stream.getVideoTracks().some(track => track.readyState === 'live')
          requestedFacing = facingMode
          emit({ type: 'control_error', cameraEnabled })
        }
      }
    }
    const driver = {
      signal(event) {
        chain = chain.then(async () => {
          if (closed || !isCurrent()) return
          if (event.type === 'ice') {
            if (/ typ relay(?: |$)/.test(event.candidate?.candidate || '')) return
            if (remoteSet) await peer.addIceCandidate(event.candidate)
            else if (queued.length < 64) queued.push(event.candidate)
          } else if (event.type === 'offer' || event.type === 'answer') {
            await peer.setRemoteDescription({ type: event.type, sdp: event.sdp })
            if (closed || !isCurrent()) return
            remoteSet = true
            for (const candidate of queued.splice(0)) await peer.addIceCandidate(candidate)
            if (event.type === 'offer') {
              const answer = await peer.createAnswer(); await peer.setLocalDescription(answer)
              emit({ type: 'answer', sdp: peer.localDescription.sdp })
            }
          }
        }).catch(() => emit({ type: 'error', reason: 'connect_failed' }))
      },
      control(value) {
        if (typeof value.muted === 'boolean') stream.getAudioTracks().forEach(track => { track.enabled = !value.muted })
        if (value.resumePlayback) playRemote()
        if (!video || (!Object.prototype.hasOwnProperty.call(value, 'cameraEnabled') && !value.switchCamera)) return
        if (typeof value.cameraEnabled === 'boolean' && cameraDesired !== value.cameraEnabled) {
          cameraDesired = value.cameraEnabled; cameraRevision++
        }
        if (value.cameraEnabled === false) {
          // Do not wait behind an in-flight camera switch to honor privacy.
          cameraEnabled = false
          stream.getVideoTracks().forEach(track => { track.stop(); stream.removeTrack(track) })
          for (const pending of pendingCameras) closeTracks(pending)
        }
        if (value.switchCamera) { requestedFacing = requestedFacing === 'user' ? 'environment' : 'user'; cameraRevision++ }
        // Reconcile the latest intent, never an obsolete queued off/on action.
        cameraChain = cameraChain.then(reconcileCamera)
      },
      close() {
        if (closed) return
        closed = true; peer.onicecandidate = null; peer.ontrack = null; peer.onconnectionstatechange = null
        for (const pending of pendingCameras) closeTracks(pending)
        pendingCameras.clear()
        peer.close(); closeTracks(stream); closeTracks(remoteStream); streams.delete(callId); peers.delete(callId); videoHosts.delete(callId)
        audio.srcObject = null; audio.remove()
        if (local) { local.srcObject = null; local.remove() }
      }
    }
    try {
      peer.onicecandidate = ({ candidate }) => { if (candidate && !/ typ relay(?: |$)/.test(candidate.candidate)) emit({ type: 'ice', candidate: candidate.toJSON() }) }
      peer.onconnectionstatechange = () => emit({ type: 'state', state: peer.connectionState })
      peer.ontrack = event => {
        if (!remoteStream.getTracks().some(track => track.id === event.track.id)) remoteStream.addTrack(event.track)
        playRemote()
      }
      for (const track of stream.getTracks()) {
        const sender = peer.addTrack(track, stream)
        if (track.kind === 'video') {
          videoSender = sender
          const parameters = sender.getParameters()
          if (parameters.encodings?.length) {
            parameters.encodings[0].maxBitrate = 700000; parameters.encodings[0].maxFramerate = 24
            void sender.setParameters(parameters).catch(() => {})
          }
        }
      }
      if (video) { peers.set(callId, { local, remote: audio, driver }); this.mountVideo(callId) }
      if (options.offerer) {
        const offer = await peer.createOffer(); await peer.setLocalDescription(offer)
        emit({ type: 'offer', sdp: peer.localDescription.sdp })
      }
      return driver
    } catch (error) { driver.close(); throw error }
    // #endif
  },
  mountVideo(callId) {
    // #ifdef APP-PLUS
    try { showVoicePeerVideo(callId) } catch (_) {}
    // #endif
    // #ifdef H5
    const local = document.getElementById('call-video-local'), remote = document.getElementById('call-video-remote')
    if (local && remote) videoHosts.set(callId, { local, remote })
    const hosts = videoHosts.get(callId), peer = peers.get(callId)
    if (hosts && peer) {
      peer.local.style.display = ''; peer.remote.style.display = ''
      hosts.local.appendChild(peer.local); hosts.remote.appendChild(peer.remote)
    }
    // #endif
  },
  unmountVideo(callId) {
    // #ifdef H5
    videoHosts.delete(callId)
    const peer = peers.get(callId)
    // Keep the remote media element connected so sound/PiP survives page navigation.
    if (peer) {
      peer.local.style.display = 'none'; peer.remote.style.display = 'none'
      document.body.appendChild(peer.local); document.body.appendChild(peer.remote)
    }
    // #endif
  },
  canPictureInPicture() {
    // #ifdef H5
    return !!document.pictureInPictureEnabled && typeof HTMLVideoElement !== 'undefined' && typeof HTMLVideoElement.prototype.requestPictureInPicture === 'function'
    // #endif
    // #ifndef H5
    return false
    // #endif
  },
  async pictureInPicture(callId) {
    // #ifdef H5
    const peer = peers.get(callId)
    if (!peer || !this.canPictureInPicture()) throw new Error('当前浏览器不支持视频小窗')
    await peer.remote.requestPictureInPicture()
    // #endif
  },
  cancel(callId) {
    stopped.add(callId)
    if (stopped.size > 32) stopped.delete(stopped.values().next().value)
    pendingNative.get(callId)?.(); pendingNative.delete(callId)
    nativeCallbacks.delete(callId)
    // #ifdef APP-PLUS
    try { closeVoicePeer(callId) } catch (_) {}
    // #endif
    // #ifdef H5
    videoHosts.delete(callId)
    peers.get(callId)?.driver.close()
    const pending = streams.get(callId)
    streams.delete(callId)
    if (pending) void pending.then(closeTracks).catch(() => {})
    // #endif
  }
}
