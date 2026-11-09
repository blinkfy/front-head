// #ifdef APP-PLUS
import { voiceRtcAvailable, videoRtcAvailable, screenShareRtcAvailable, onVoicePeerEvent, openVoicePeer, signalVoicePeer, controlVoicePeer, closeVoicePeer, showVoicePeerVideo, minimizeVoicePeerVideo, showOutgoingVideoPreview, closeOutgoingVideoPreview } from '@/uni_modules/ftx-voice-call'
// #endif
import { androidRealtimeAvailable } from './android-realtime.js'
import { ensureFeaturePermission, isPermissionDenied, openFeaturePermissionSettings } from './feature-permission.js'
// #ifdef APP-PLUS
import { baseUrl } from '@/api/settings.js'
import { callAvatarUrl } from './voice-call-core.mjs'
// #endif
// #ifdef H5
import { createWebCallRecording, webRecordingSupported } from './web-call-recording.mjs'
import { webRecordingStorage } from './web-recording-storage.mjs'
// #endif

const stopped = new Set()
const streams = new Map()
const nativePermissions = new Map()
const peers = new Map()
const videoHosts = new Map()
const pendingNative = new Map()
const nativeCallbacks = new Map()
const outgoingPreviews = new Map()
// #ifdef H5
const recordingContexts = new Map()
// #endif
let nativeListenerInstalled = false
const permissionError = () => Object.assign(new Error('Microphone unavailable'), { code: 'permission_denied' })
const closeTracks = stream => stream?.getTracks().forEach(track => track.stop())
const cameraConstraints = facingMode => ({ facingMode: facingMode === 'user' ? 'user' : { exact: facingMode },
  width: { ideal: 640, max: 960 }, height: { ideal: 480, max: 720 }, frameRate: { ideal: 24, max: 24 } })

// #ifdef H5
function updateVideoAspect(video) {
  if (video?.videoWidth > 0 && video.videoHeight > 0) {
    const pane = video.parentNode?.parentNode
    if (pane?.classList?.contains('video-pane')) pane.style.setProperty('--call-video-ratio', String(video.videoWidth / video.videoHeight))
  }
}
function createLocalVideo(stream) {
  const video = document.createElement('video')
  video.autoplay = true; video.muted = true; video.setAttribute('playsinline', ''); video.dataset.callVideo = 'local'
  video.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#101916;transform:scaleX(-1)'
  video.srcObject = stream
  void video.play().catch(() => {})
  return video
}
// #endif

export const voiceCallMedia = {
  primeRecording(callId, recording) {
    // #ifdef H5
    if (!recording?.admin || !recording.auto || !webRecordingSupported() || recordingContexts.has(callId)) return
    try {
      const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext
      const context = new AudioContext()
      recordingContexts.set(callId, context)
      void context.resume().catch(() => {})
    } catch (_) {}
    // #endif
  },
  prepareOutgoing(callId, mode) { return this.permission(callId, mode) },
  async prepareOutgoingPreview(callId, peer, { isCurrent, onCancel, onUnavailable }) {
    // #ifdef APP-PLUS
    if (!await nativePermissions.get(callId) || !isCurrent() || typeof showOutgoingVideoPreview !== 'function') return false
    outgoingPreviews.set(callId, { options: JSON.stringify({ callId, peerName: peer.name }), onCancel, isCurrent })
    return true
    // #endif
    // #ifdef H5
    const track = streams.get(callId)?.stream?.getVideoTracks().find(track => track.readyState === 'live')
    if (!track || !isCurrent()) return false
    const video = createLocalVideo(new MediaStream([track]))
    const ended = () => {
      if (outgoingPreviews.get(callId)?.video !== video) return
      outgoingPreviews.delete(callId)
      video.srcObject = null; video.remove()
      onUnavailable()
    }
    track.addEventListener('ended', ended, { once: true })
    outgoingPreviews.set(callId, { video, detach: () => track.removeEventListener('ended', ended) })
    return true
    // #endif
    // #ifndef APP-PLUS || H5
    return false
    // #endif
  },
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
  supportsScreenShareReceive() {
    // #ifdef APP-PLUS
    try { return this.supportsVideo() && screenShareRtcAvailable() === true } catch (_) { return false }
    // #endif
    // #ifndef APP-PLUS
    return this.supportsVideo()
    // #endif
  },
  supportsScreenShare() {
    // #ifdef APP-PLUS
    return this.supportsScreenShareReceive()
    // #endif
    // #ifdef H5
    return this.supportsVideo() && typeof navigator.mediaDevices?.getDisplayMedia === 'function'
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
    if (stopped.has(callId)) throw permissionError()
    // #ifdef APP-PLUS
    if (!nativePermissions.has(callId)) nativePermissions.set(callId, (async () => {
      const isCurrent = () => !stopped.has(callId)
      if (!await ensureFeaturePermission('microphone', { isCurrent }) || !isCurrent()) throw permissionError()
      // Camera remains optional: a denied camera must not prevent audio connecting.
      return mode === 'video' && await ensureFeaturePermission('camera', { isCurrent })
    })().catch(error => { nativePermissions.delete(callId); throw error }))
    await nativePermissions.get(callId)
    // #endif
    // #ifdef H5
    if (!streams.has(callId)) {
      const capture = { stream: null, promise: null }
      const isCurrent = () => streams.get(callId) === capture
      streams.set(callId, capture)
      capture.promise = (async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })
        if (!isCurrent()) { closeTracks(stream); throw permissionError() }
        // The camera prompt can outlive the call. Retain the microphone stream
        // separately so cancel can release it immediately.
        capture.stream = stream
        if (mode === 'video') {
          try {
            const camera = await navigator.mediaDevices.getUserMedia({ audio: false, video: cameraConstraints('user') })
            if (!isCurrent()) { closeTracks(camera); throw permissionError() }
            camera.getVideoTracks().forEach(track => stream.addTrack(track))
          } catch (error) { if (!isCurrent()) throw error /* Keep audio when camera is denied/busy. */ }
        }
        return stream
      })().catch(async error => {
        if (isCurrent()) {
          try {
            if (isPermissionDenied(error)) await openFeaturePermissionSettings('microphone', { isCurrent })
          } finally {
            if (isCurrent()) streams.delete(callId)
          }
        }
        throw Object.assign(error, { code: 'permission_denied' })
      })
    }
    await streams.get(callId).promise
    // #endif
  },
  async open(options) {
    const { callId, onEvent, isCurrent } = options
    const video = options.mode === 'video'
    if (!this.supported()) throw Object.assign(new Error('Unsupported'), { code: 'unsupported' })
    if (video && !this.supportsVideo()) throw Object.assign(new Error('Unsupported video'), { code: 'unsupported' })
    if (!isCurrent()) throw new Error('Cancelled')
    // #ifdef APP-PLUS
    this.closeNativeOutgoingPreview(callId)
    await this.permission(callId, options.cameraEnabled === false ? 'audio' : options.mode)
    if (!nativeListenerInstalled) {
      onVoicePeerEvent(json => {
        try {
          const event = JSON.parse(json), callback = nativeCallbacks.get(event.callId)
          if (callback) callback(event)
          else if (event.type === 'recording' && event.saved) uni.$emit('call-recordings:changed')
        } catch (_) {}
      })
      nativeListenerInstalled = true
    }
    if (!isCurrent()) throw new Error('Cancelled')
    const cameraGranted = video ? await nativePermissions.get(callId) : true
    return new Promise((resolve, reject) => {
      let cameraRevision = 0
      const driver = { signal: event => signalVoicePeer(callId, JSON.stringify(event)),
        control: value => {
          if (typeof value.cameraEnabled === 'boolean') cameraRevision++
          const revision = cameraRevision
          if (value.cameraEnabled === true) {
            void ensureFeaturePermission('camera', { isCurrent: () => isCurrent() && !stopped.has(callId) && revision === cameraRevision }).then(granted => {
              if (!isCurrent() || stopped.has(callId) || revision !== cameraRevision) return
              if (granted) controlVoicePeer(callId, JSON.stringify(value))
              else onEvent({ type: 'control_error', reason: 'camera_unavailable', cameraEnabled: false })
            })
          } else controlVoicePeer(callId, JSON.stringify(value))
        }, close: () => this.cancel(callId) }
      const timer = setTimeout(() => { this.cancel(callId); reject(new Error('Native peer unavailable')) }, 12000)
      pendingNative.set(callId, () => { clearTimeout(timer); reject(new Error('Cancelled')) })
      try {
        nativeCallbacks.set(callId, event => {
          if (!isCurrent()) { this.cancel(callId); return }
          if (event.type === 'ready') { clearTimeout(timer); pendingNative.delete(callId); resolve(driver) }
          else onEvent(event.type === 'error' && event.reason === 'unavailable' ? { ...event, reason: 'failed' } : event)
        })
        openVoicePeer(JSON.stringify({ callId, offerer: options.offerer, entryMode: options.entryMode,
          ...(options.recording?.admin ? { recordingOwner: options.recording.owner,
            peerName: String(options.peerName || '联系人').slice(0, 80) } : {}),
          ...(video ? { mode: 'video', cameraEnabled: options.cameraEnabled !== false && cameraGranted !== false, cameraRequested: options.cameraEnabled !== false, remoteCameraEnabled: options.cameraEnabled !== false, speaker: options.cameraEnabled !== false, peerName: String(options.peerName || '联系人').slice(0, 80),
            ...(options.screenShareSupported ? { screenShareSupported: true } : {}),
            ...(options.peerAvatar ? { peerAvatar: callAvatarUrl(options.peerAvatar, baseUrl) } : {}) } : {}),
          stunUrls: options.stunUrls.filter(url => /^stuns?:/.test(url)).slice(0, 3) }))
      } catch (error) { clearTimeout(timer); pendingNative.delete(callId); nativeCallbacks.delete(callId); reject(error) }
    })
    // #endif
    // #ifdef H5
    await this.permission(callId, options.cameraEnabled === false ? 'audio' : options.mode)
    const stream = streams.get(callId)?.stream
    if (!stream || !isCurrent()) { this.cancel(callId); throw new Error('Cancelled') }
    const peer = new RTCPeerConnection({ iceServers: options.stunUrls.filter(url => /^stuns?:/.test(url)).slice(0, 3).map(urls => ({ urls })) })
    const audio = document.createElement('audio')
    audio.autoplay = true; audio.setAttribute('playsinline', ''); audio.dataset.voiceCallAudio = 'true'
    audio.style.display = 'none'; document.body.appendChild(audio)
    const remote = video ? document.createElement('video') : null
    if (remote) {
      remote.autoplay = true; remote.muted = true; remote.setAttribute('playsinline', ''); remote.dataset.callVideo = 'remote'
      remote.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#101916'
    }
    const preview = outgoingPreviews.get(callId)
    outgoingPreviews.delete(callId)
    preview?.detach()
    const local = video ? preview?.video || createLocalVideo(stream) : null
    if (preview?.video && local) {
      local.srcObject = stream
      void local.play().catch(() => {})
    }
    if (video) for (const element of [local, remote]) {
      element.onresize = element.onloadedmetadata = () => updateVideoAspect(element)
    }
    let remoteSet = false, closed = false, chain = Promise.resolve(), connectionState = ''
    let audioSender = null, videoSender = null, cameraEnabled = stream.getVideoTracks().some(track => track.readyState === 'live'), cameraDesired = cameraEnabled, facingMode = 'user', requestedFacing = 'user'
    let cameraRevision = 0, cameraChain = Promise.resolve()
    let videoChain = Promise.resolve()
    let audioChain = Promise.resolve()
    let screenShareSupported = options.screenShareSupported === true, screenRequest = null, screenStopping = false
    const updateVideoSender = action => {
      const result = videoChain.then(action)
      videoChain = result.catch(() => {})
      return result
    }
    const pendingCameras = new Set()
    const remoteStream = new MediaStream()
    const remoteVideoStream = remote ? new MediaStream() : null
    // Audio stays mounted even if the visible video is hidden or reparented.
    audio.srcObject = remoteStream
    if (remote) remote.srcObject = remoteVideoStream
    const queued = []
    const diagnose = (stage, error) => console.warn('[voice-call-media]', {
      stage, mode: options.mode || 'audio', offerer: !!options.offerer,
      error: error?.name || '', message: String(error?.message || '').slice(0, 360),
      signalingState: peer.signalingState, iceState: peer.iceConnectionState, connectionState: peer.connectionState
    })
    const emit = event => { if (!closed && isCurrent()) onEvent(event) }
    const recordingContext = recordingContexts.get(callId)
    recordingContexts.delete(callId)
    const recorder = options.recording?.admin ? createWebCallRecording({
      local: stream, remote: remoteStream, storage: webRecordingStorage,
      metadata: { ...options.recording, peerName: options.peerName, mode: options.entryMode, callId },
      isCurrent, changed: onEvent, initialContext: recordingContext
    }) : null
    let cameras = []
    const reportCameras = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices?.()
        cameras = (devices || []).filter(device => device.kind === 'videoinput' && device.deviceId)
        emit({ type: 'camera', canSwitchCamera: new Set(cameras.map(device => device.deviceId)).size > 1 })
      } catch (_) { emit({ type: 'camera', canSwitchCamera: false }) }
    }
    const playRemote = () => {
      if (remoteVideoStream?.getVideoTracks().length) void remote.play().catch(() => {})
      if (!remoteStream.getAudioTracks().length) return
      void audio.play().then(() => emit({ type: 'playback', blocked: false })).catch(error => {
        if (error.name !== 'AbortError') emit({ type: 'playback', blocked: true })
      })
    }
    const replaceCamera = async (facing, revision, preferredDevice) => {
      const current = () => !closed && isCurrent() && !screenRequest?.installing && cameraDesired && revision === cameraRevision
      if (!current()) return
      const constraints = cameraConstraints(facing)
      if (facing !== facingMode && cameras.length > 1) {
        const currentDevice = stream.getVideoTracks()[0]?.getSettings?.().deviceId
        const nextDevice = cameras.find(device => device.deviceId !== currentDevice)
        if (nextDevice) { delete constraints.facingMode; constraints.deviceId = { exact: nextDevice.deviceId } }
      }
      let replacement
      if (preferredDevice) {
        const preferred = { ...constraints, deviceId: { exact: preferredDevice } }
        delete preferred.facingMode
        try {
          replacement = await navigator.mediaDevices.getUserMedia({ audio: false, video: preferred })
        } catch (error) {
          if (!current() || isPermissionDenied(error)) throw error
        }
      }
      replacement ||= await navigator.mediaDevices.getUserMedia({ audio: false, video: constraints })
      pendingCameras.add(replacement)
      if (!current()) { closeTracks(replacement); pendingCameras.delete(replacement); return }
      const track = replacement.getVideoTracks()[0]
      let adopted = false
      try {
        if (!track) throw new Error('Camera unavailable')
        await updateVideoSender(async () => {
          if (!current()) return
          await videoSender.replaceTrack(track)
          if (!current() || track.readyState === 'ended') {
            if (!closed && isCurrent()) {
              const previous = stream.getVideoTracks().find(item => item.readyState === 'live')
              await videoSender.replaceTrack(cameraDesired ? previous || null : null)
            }
            return
          }
          stream.getVideoTracks().forEach(old => { stream.removeTrack(old); old.stop() })
          stream.addTrack(track); adopted = true; cameraEnabled = true; facingMode = facing
          showLocalVideo(stream, facing === 'user')
          emit({ type: 'camera', frontFacing: facing === 'user', cameraEnabled: true }); void reportCameras()
        })
      } finally {
        if (!adopted) closeTracks(replacement)
        pendingCameras.delete(replacement)
      }
    }
    const showLocalVideo = (source, mirrored) => {
      local.srcObject = source
      local.style.transform = mirrored ? 'scaleX(-1)' : ''
      void local.play().catch(() => {})
    }
    const reconcileCamera = async preferredDevice => {
      if (closed || !isCurrent() || !videoSender || screenRequest?.installing) return
      const revision = cameraRevision
      try {
        const track = stream.getVideoTracks().find(item => item.readyState === 'live')
        if (!cameraDesired || (cameraEnabled && facingMode === requestedFacing && track)) {
          await updateVideoSender(async () => {
            if (closed || !isCurrent() || screenRequest?.installing || revision !== cameraRevision) return
            const next = cameraDesired ? track : null
            if (videoSender.track !== next) await videoSender.replaceTrack(next)
          })
        } else {
          await replaceCamera(requestedFacing, revision, preferredDevice)
        }
      } catch (error) {
        if (!closed && isCurrent() && !screenRequest?.installing && revision === cameraRevision) {
          if (isPermissionDenied(error)) void openFeaturePermissionSettings('camera', { isCurrent: () => !closed && isCurrent() && revision === cameraRevision })
          cameraEnabled = stream.getVideoTracks().some(track => track.readyState === 'live')
          requestedFacing = facingMode
          emit({ type: 'control_error', cameraEnabled })
        }
      }
    }
    const releaseScreenAudio = (request, restore = true) => {
      const audio = request.audio
      if (!audio) return
      request.audio = null
      audio.source?.removeEventListener('ended', audio.ended)
      audio.source?.stop()
      audio.mixed?.stop()
      audio.context.onstatechange = null
      void audio.context.close().catch(() => {})
      if (restore && audio.mixed) {
        audioChain = audioChain.then(async () => {
          if (!closed && isCurrent() && audioSender.track === audio.mixed) await audioSender.replaceTrack(audio.microphone)
        }).catch(error => diagnose('screen-audio-restore', error))
      }
      if (audio.sending) emit({ type: 'screen_audio', screenAudioSharing: false })
    }
    const startScreenAudio = (request, restrictOwnAudio) => {
      const audio = request.audio
      const tracks = request.capture.getAudioTracks()
      const source = tracks.find(track => track.readyState === 'live')
      const microphone = stream.getAudioTracks()[0]
      // Do not send the other participant's own voice back through system loopback.
      const safe = audio && audioSender && microphone && source && (request.track.getSettings?.().displaySurface === 'browser' ||
        (restrictOwnAudio && source.getSettings?.().restrictOwnAudio === true))
      for (const track of tracks) if (!safe || track !== source) track.stop()
      if (!safe) { releaseScreenAudio(request); return }
      audio.source = source
      audio.microphone = microphone
      audio.ended = () => releaseScreenAudio(request)
      source.addEventListener('ended', audio.ended)
      void audio.resumed.then(() => {
        audioChain = audioChain.then(async () => {
          if (closed || !isCurrent() || screenRequest !== request || request.audio !== audio || source.readyState !== 'live') return
          if (audio.context.state !== 'running') { releaseScreenAudio(request); return }
          audio.context.onstatechange = () => {
            if (audio.context.state !== 'running') releaseScreenAudio(request)
          }
          const destination = audio.context.createMediaStreamDestination()
          destination.channelCount = 1
          const playbackGain = audio.context.createGain()
          playbackGain.gain.value = 0.65
          audio.context.createMediaStreamSource(new MediaStream([audio.microphone])).connect(destination)
          audio.context.createMediaStreamSource(new MediaStream([source])).connect(playbackGain)
          playbackGain.connect(destination)
          audio.mixed = destination.stream.getAudioTracks()[0]
          if (!audio.mixed) { releaseScreenAudio(request); return }
          await audioSender.replaceTrack(audio.mixed)
          if (request.audio === audio) { audio.sending = true; emit({ type: 'screen_audio', screenAudioSharing: true }) }
        }).catch(error => { diagnose('screen-audio-start', error); releaseScreenAudio(request) })
      })
    }
    const stopScreen = request => {
      if (screenRequest !== request) return
      screenRequest = null
      request.track?.removeEventListener('ended', request.ended)
      releaseScreenAudio(request)
      closeTracks(request.capture)
      if (!request.installing) { emit({ type: 'screen_pending', screenSharingPending: false }); return }
      screenStopping = true
      emit({ type: 'screen_pending', screenSharingPending: true })
      if (request.cameraTrack) request.cameraTrack.enabled = request.cameraTrackEnabled
      showLocalVideo(stream, facingMode === 'user')
      // Reuse the latest camera intent and wait behind an in-flight screen-track swap.
      void reconcileCamera(request.cameraDevice).finally(() => {
        screenStopping = false
        if (!closed && isCurrent() && cameraDesired && !stream.getVideoTracks().includes(videoSender.track)) {
          cameraDesired = false; cameraEnabled = false
          for (const track of stream.getVideoTracks()) { track.stop(); stream.removeTrack(track) }
          emit({ type: 'camera', cameraEnabled: false })
        }
        if (request.active) emit({ type: 'screen', screenSharing: false })
        emit({ type: 'screen_pending', screenSharingPending: false })
      })
    }
    const startScreen = async () => {
      if (screenRequest || screenStopping || closed || !isCurrent()) return
      if (!screenShareSupported || !videoSender || connectionState !== 'connected' || !this.supportsScreenShare()) {
        emit({ type: 'screen_error', reason: 'screen_unavailable' })
        return
      }
      const request = { capture: null, track: null, installing: false, active: false }
      const current = () => !closed && isCurrent() && screenRequest === request
      screenRequest = request
      emit({ type: 'screen_pending', screenSharingPending: true })
      if (!current()) return
      try {
        // Enter the browser picker directly from the button's user activation.
        const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext
        const restrictOwnAudio = navigator.mediaDevices.getSupportedConstraints?.()?.restrictOwnAudio === true
        const capture = navigator.mediaDevices.getDisplayMedia({
          audio: !!AudioContext && (restrictOwnAudio ? { restrictOwnAudio: true } : true),
          systemAudio: restrictOwnAudio ? 'include' : 'exclude',
          selfBrowserSurface: 'exclude',
          surfaceSwitching: 'exclude',
          video: { width: { max: 1920 }, height: { max: 1920 }, frameRate: { ideal: 12, max: 15 } }
        })
        if (AudioContext) {
          try {
            const context = new AudioContext()
            request.audio = { context, resumed: context.resume().catch(() => {}) }
          } catch (_) { /* Screen video remains available. */ }
        }
        request.capture = await capture
        if (!current()) { closeTracks(request.capture); return }
        request.track = request.capture.getVideoTracks()[0]
        if (!request.track || request.track.readyState === 'ended') { stopScreen(request); return }
        if ('contentHint' in request.track) request.track.contentHint = 'detail'
        request.ended = () => stopScreen(request)
        request.track.addEventListener('ended', request.ended)
        cameraRevision++
        cameraDesired = cameraEnabled
        requestedFacing = facingMode
        request.installing = true
        await updateVideoSender(async () => {
          if (!current()) return
          await videoSender.replaceTrack(request.track)
          if (!current()) return
          if (request.track.readyState === 'ended') { stopScreen(request); return }
          request.cameraTrack = stream.getVideoTracks()[0]
          if (request.cameraTrack) {
            request.cameraDevice = request.cameraTrack.getSettings?.().deviceId
            request.cameraTrackEnabled = request.cameraTrack.enabled
            request.cameraTrack.enabled = false
          }
          showLocalVideo(request.capture, false)
          request.active = true
          emit({ type: 'screen', screenSharing: true })
          emit({ type: 'screen_pending', screenSharingPending: false })
          startScreenAudio(request, restrictOwnAudio)
        })
      } catch (error) {
        if (!current()) return
        stopScreen(request)
        emit({ type: 'screen_error', reason: error?.name === 'NotAllowedError' ? 'screen_cancelled' : 'screen_unavailable' })
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
            if (video && event.type === 'offer' && !videoSender) {
              // Answerers must use the offered transceiver. A pre-created
              // addTransceiver sender is not associated with an incoming offer.
              const offeredVideo = peer.getTransceivers().find(item => item.mid !== null && item.receiver.track.kind === 'video')
              if (!offeredVideo) throw new Error('Video channel unavailable')
              offeredVideo.direction = 'sendrecv'; videoSender = offeredVideo.sender
              videoSender.setStreams?.(stream)
              await reconcileCamera()
              if (closed || !isCurrent()) return
            }
            remoteSet = true
            for (const candidate of queued.splice(0)) await peer.addIceCandidate(candidate)
            if (event.type === 'offer') {
              const answer = await peer.createAnswer(); await peer.setLocalDescription(answer)
              emit({ type: 'answer', sdp: peer.localDescription.sdp })
            }
          }
        }).catch(error => {
          if (closed || !isCurrent()) return
          diagnose(`signal-${event.type}`, error)
          emit({ type: 'error', reason: 'connect_failed' })
        })
      },
      control(value) {
        recorder?.control(value)
        if (typeof value.muted === 'boolean') stream.getAudioTracks().forEach(track => { track.enabled = !value.muted })
        if (value.resumePlayback) playRemote()
        if (typeof value.screenShareSupported === 'boolean') {
          screenShareSupported = value.screenShareSupported
          if (!screenShareSupported && screenRequest) stopScreen(screenRequest)
        }
        if (value.screenSharing === true) void startScreen()
        else if (value.screenSharing === false && screenRequest) stopScreen(screenRequest)
        if (screenRequest || screenStopping) return
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
        const saving = recorder?.close()
        closed = true; peer.onicecandidate = null; peer.ontrack = null; peer.onconnectionstatechange = null; peer.oniceconnectionstatechange = null
        if (screenRequest) {
          screenRequest.track?.removeEventListener('ended', screenRequest.ended)
          releaseScreenAudio(screenRequest, false)
          closeTracks(screenRequest.capture)
          screenRequest = null
        }
        for (const pending of pendingCameras) closeTracks(pending)
        pendingCameras.clear()
        peer.close(); closeTracks(stream); closeTracks(remoteStream); streams.delete(callId); peers.delete(callId); videoHosts.delete(callId)
        audio.srcObject = null; audio.remove()
        if (remote) { closeTracks(remoteVideoStream); remote.srcObject = null; remote.remove() }
        if (local) { local.srcObject = null; local.remove() }
        return saving
      }
    }
    try {
      peer.onicecandidate = ({ candidate }) => { if (candidate && !/ typ relay(?: |$)/.test(candidate.candidate)) emit({ type: 'ice', candidate: candidate.toJSON() }) }
      const reportConnection = () => {
        const state = peer.connectionState || peer.iceConnectionState
        const next = state === 'completed' ? 'connected' : state
        if (!next || next === connectionState) return
        connectionState = next
        if (next === 'failed') diagnose('peer-connection-failed')
        emit({ type: 'state', state: next })
      }
      peer.onconnectionstatechange = peer.oniceconnectionstatechange = reportConnection
      peer.ontrack = event => {
        const target = event.track.kind === 'video' ? remoteVideoStream : remoteStream
        if (!target || target.getTracks().some(track => track.id === event.track.id)) return
        target.addTrack(event.track)
        if (event.track.kind === 'audio') recorder?.trackReady()
        playRemote()
      }
      for (const track of stream.getTracks()) {
        // On the answering side bind video to the transceiver associated with
        // the remote m-line, even when the camera was granted during preflight.
        if (!options.offerer && track.kind === 'video') continue
        const sender = peer.addTrack(track, stream)
        if (track.kind === 'audio' && !audioSender) audioSender = sender
        if (track.kind === 'video') {
          videoSender = sender
          const parameters = sender.getParameters()
          if (parameters.encodings?.length) {
            parameters.encodings[0].maxBitrate = 700000; parameters.encodings[0].maxFramerate = 24
            void sender.setParameters(parameters).catch(() => {})
          }
        }
      }
      if (video && options.offerer && !videoSender) videoSender = peer.addTransceiver('video', { direction: 'sendrecv' }).sender
      if (video && !cameraEnabled) {
        emit({ type: 'camera', cameraEnabled: false })
        if (options.cameraEnabled !== false) emit({ type: 'control_error', cameraEnabled: false, reason: 'camera_unavailable' })
      }
      peers.set(callId, { local, remote, driver })
      if (video) { this.mountVideo(callId); void reportCameras() }
      if (options.offerer) {
        const offer = await peer.createOffer(); await peer.setLocalDescription(offer)
        emit({ type: 'offer', sdp: peer.localDescription.sdp })
      }
      return driver
    } catch (error) { diagnose('peer-setup', error); driver.close(); throw error }
    // #endif
  },
  mountVideo(callId) {
    // #ifdef APP-PLUS
    const pending = outgoingPreviews.get(callId)
    if (pending?.isCurrent()) {
      try { showOutgoingVideoPreview(pending.options, pending.onCancel) } catch (_) {}
    }
    // #endif
    // #ifdef H5
    const local = document.getElementById('call-video-local'), remote = document.getElementById('call-video-remote')
    if (local && remote) videoHosts.set(callId, { local, remote })
    const hosts = videoHosts.get(callId), peer = peers.get(callId)
    const preview = outgoingPreviews.get(callId)?.video
    if (hosts && preview && preview.parentNode !== hosts.local) hosts.local.appendChild(preview)
    if (hosts && peer?.local) {
      peer.local.style.display = ''; peer.remote.style.display = ''
      peer.remote.style.position = ''; peer.remote.style.left = ''; peer.remote.style.width = '100%'; peer.remote.style.height = '100%'
      if (peer.local.parentNode !== hosts.local) hosts.local.appendChild(peer.local)
      if (peer.remote.parentNode !== hosts.remote) hosts.remote.appendChild(peer.remote)
      if (peer.remote.srcObject?.getVideoTracks().length) void peer.remote.play().catch(() => {})
      updateVideoAspect(peer.local); updateVideoAspect(peer.remote)
    }
    // #endif
  },
  closeNativeOutgoingPreview(callId, forget = true) {
    // #ifdef APP-PLUS
    if (!outgoingPreviews.has(callId)) return
    if (forget) outgoingPreviews.delete(callId)
    try { closeOutgoingVideoPreview(callId) } catch (_) {}
    // #endif
  },
  minimizeNativeVideo(callId) {
    // #ifdef APP-PLUS
    try { minimizeVoicePeerVideo(callId) } catch (_) {}
    // #endif
  },
  showNativeVideo(callId) {
    // #ifdef APP-PLUS
    try { showVoicePeerVideo(callId) } catch (_) {}
    // #endif
  },
  unmountVideo(callId) {
    // #ifdef APP-PLUS
    this.closeNativeOutgoingPreview(callId, false)
    // #endif
    // #ifdef H5
    outgoingPreviews.get(callId)?.video.remove()
    const recordingContext = recordingContexts.get(callId)
    recordingContexts.delete(callId)
    if (recordingContext) void recordingContext.close().catch(() => {})
    videoHosts.delete(callId)
    const peer = peers.get(callId)
    // Keep the remote video element connected so PiP survives page navigation.
    if (peer?.local) {
      peer.local.style.display = 'none'
      const inPip = document.pictureInPictureElement === peer.remote
      peer.remote.style.display = inPip ? '' : 'none'
      if (inPip) { peer.remote.style.position = 'fixed'; peer.remote.style.left = '-10000px'; peer.remote.style.width = '1px'; peer.remote.style.height = '1px' }
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
    if (!peer?.local || !this.canPictureInPicture()) throw new Error('当前浏览器不支持视频小窗')
    await peer.remote.requestPictureInPicture()
    // #endif
  },
  cancel(callId) {
    if (stopped.has(callId)) return
    stopped.add(callId)
    if (stopped.size > 32) stopped.delete(stopped.values().next().value)
    pendingNative.get(callId)?.(); pendingNative.delete(callId)
    nativeCallbacks.delete(callId)
    nativePermissions.delete(callId)
    // #ifdef APP-PLUS
    this.closeNativeOutgoingPreview(callId)
    try { closeVoicePeer(callId) } catch (_) {}
    // #endif
    // #ifdef H5
    const recordingContext = recordingContexts.get(callId)
    recordingContexts.delete(callId)
    if (recordingContext) void recordingContext.close().catch(() => {})
    videoHosts.delete(callId)
    const preview = outgoingPreviews.get(callId)
    outgoingPreviews.delete(callId)
    if (preview) { preview.detach(); preview.video.srcObject = null; preview.video.remove() }
    peers.get(callId)?.driver.close()
    const capture = streams.get(callId)
    streams.delete(callId)
    closeTracks(capture?.stream)
    // #endif
  }
}
