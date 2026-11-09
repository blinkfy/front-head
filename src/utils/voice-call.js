import { updateWebCallAlert, webCallsAvailable } from './web-call-support.js'
import { reactive } from 'vue'
import { consumeAndroidIncomingAcceptance, controlAndroidAnsweredCall, androidRealtimeAvailable, stopAndroidIncomingAlert } from './android-realtime.js'
import { createVoiceCallController } from './voice-call-core.mjs'
import { voiceCallMedia as media } from './voice-call-media.js'
import { sharedVoiceCallRuntime } from './voice-call-runtime.mjs'
import { setUiSoundBlocked, areUiSoundsEnabled } from './ui-sounds.js'
import { receiveChatFeedback, setChatFeedbackBlocked } from './chat-feedback.js'
import { recordingConfiguration } from './call-recording-preference.mjs'

// Lazy pages and a cached application shell can temporarily load different
// chunk revisions. They must still control the same media session in this realm.
function createRuntime() {
  const voiceCallMedia = media
  const voiceCallState = reactive({ phase: 'idle', supported: false, videoSupported: false, mode: 'audio', peer: null, callId: '', muted: false, speaker: false,
    outgoingPreview: false,
    cameraSupported: false, canSwitchCamera: false, cameraEnabled: false, remoteCameraEnabled: false, facingMode: 'user', playbackBlocked: false, mediaError: '', startedAt: 0, endedAt: 0, reason: '',
    screenShareSupported: false, screenSharing: false, screenAudioSharing: false, screenSharePending: false, remoteScreenSharing: false })
  let sender = () => false
  let previousPhase = 'idle'
  let openingPage = false
  let nativeState = null
  let nativeOwner = ''
  const getOwner = () => uni.getStorageSync('token') || ''
  const ownsNativeCall = () => nativeState && nativeOwner === getOwner()
  const pages = () => { try { return getCurrentPages() } catch (_) { return [] } }
  const openVoiceCallPage = () => {
    if (openingPage) return
    // #ifdef APP-PLUS
    if (voiceCallState.cameraSupported && ['connecting', 'connected'].includes(voiceCallState.phase)) {
      voiceCallMedia.showNativeVideo(voiceCallState.callId)
      return
    }
    // #endif
    const stack = pages()
    const index = stack.findIndex(page => page.route === 'pages-nonTheme/voice-call')
    if (index === stack.length - 1 && index >= 0) return
    openingPage = true
    const complete = () => { openingPage = false }
    if (index >= 0) uni.navigateBack({ delta: stack.length - index - 1, complete })
    else uni.navigateTo({ url: '/pages-nonTheme/voice-call', complete })
  }
  const busyMedia = () => {
    if (ownsNativeCall()) return true
    if (pages().some(page => page.route === 'pages-nonTheme/voice-scan' || page.$vm?.isRecording || page.$vm?.playingVoiceId)) return true
    // #ifdef H5
    if ([...document.querySelectorAll('audio,video')].some(media => !media.paused && !media.ended && !media.muted && !media.dataset.voiceCallAudio && !media.dataset.callVideo)) return true
    // #endif
    return false
  }
  const controller = createVoiceCallController({
    media: voiceCallMedia, send: event => sender(event),
    getOwner,
    getSelfId: () => { const user = uni.getStorageSync('userInfo') || {}; return user.id || user.userId || user.user?.id || user.data?.id },
    getRecording: recordingConfiguration,
    onRecordingSaved: () => uni.$emit('call-recordings:changed'),
    isMediaBusy: busyMedia,
    changed(state) {
      if (ownsNativeCall()) {
        Object.assign(voiceCallState, state, nativeState)
        return
      }
      const transitioned = previousPhase !== state.phase
      previousPhase = state.phase
      if (transitioned && state.phase !== 'incoming') stopAndroidIncomingAlert(state.callId)
      if (transitioned) console.info('[voice-call]', { phase: state.phase, reason: state.reason || undefined })
      Object.assign(voiceCallState, state)
      // #ifdef H5
      updateWebCallAlert(state, { sound: areUiSoundsEnabled(), open: () => {
        openVoiceCallPage()
      } })
      // #endif
      const usingAudio = ['connecting', 'connected'].includes(state.phase)
      setUiSoundBlocked('voice-call', usingAudio)
      setChatFeedbackBlocked('voice-call', usingAudio)
      if (transitioned && state.phase === 'incoming') {
        // Defer until begin() has assigned the controller session; only a native
        // user gesture for this exact account/call can skip a second Accept tap.
        Promise.resolve().then(() => {
          const current = voiceCalls.state()
          if (current.phase !== 'incoming' || current.callId !== state.callId) return
          if (consumeAndroidIncomingAcceptance(state.callId)) void voiceCalls.accept(state.callId)
          else if (!androidRealtimeAvailable() && !webCallsAvailable()) void receiveChatFeedback()
        })
      }
      if (['calling', 'incoming'].includes(state.phase) && !openingPage && pages().slice(-1)[0]?.route !== 'pages-nonTheme/voice-call') {
        openingPage = true
        uni.navigateTo({ url: '/pages-nonTheme/voice-call', complete: () => { openingPage = false } })
      }
    }
  })
  // Native-answered calls own their signaling/media for their whole lifetime.
  // The existing page is a projection with controls, never a second WebRTC peer.
  const voiceCalls = {
    ...controller,
    state() { return ownsNativeCall() ? { ...voiceCallState } : controller.state() },
    handle(event) {
      if (event.type === 'voice.minimized') { uni.$emit('voice-call:minimize', event.callId); return }
      if (event.type === 'voice.ended' && nativeState?.callId === event.callId)
        event = { ...nativeState, ...event, type: 'voice.native', phase: 'ended' }
      if (event.type !== 'voice.native') { controller.handle(event); return }
      const user = uni.getStorageSync('userInfo') || {}
      const self = user.id || user.userId || user.user?.id || user.data?.id
      if (String(event.userId) !== String(self) || !/^[A-Za-z0-9_-]{12,80}$/.test(event.callId || '') ||
          !['connecting', 'connected', 'ended'].includes(event.phase)) return
      if (event.phase === 'ended') {
        if (nativeState?.callId !== event.callId) return
        nativeState = null; nativeOwner = ''
        Object.assign(voiceCallState, controller.state(), { phase: 'ended', callId: event.callId, mode: event.mode,
          peer: event.peer, reason: event.reason || 'hangup', endedAt: Date.now(), recording: false, recordingStartedAt: 0 })
        setUiSoundBlocked('voice-call', false); setChatFeedbackBlocked('voice-call', false)
        return
      }
      if (nativeState && nativeState.callId !== event.callId) return
      nativeOwner = getOwner()
      nativeState = { ...event, nativeOwned: true }
      Object.assign(voiceCallState, controller.state(), nativeState)
      setUiSoundBlocked('voice-call', true); setChatFeedbackBlocked('voice-call', true)
    },
    end(reason) {
      if (ownsNativeCall()) { controlAndroidAnsweredCall(nativeState.callId, { hangup: true }); return }
      controller.end(reason)
    },
    control(options) {
      if (ownsNativeCall()) { controlAndroidAnsweredCall(nativeState.callId, options); return }
      controller.control(options)
    },
    connection(value, ...versions) {
      if (nativeState && (!value || !ownsNativeCall())) {
        const ended = ownsNativeCall() && { ...nativeState, phase: 'ended', reason: 'disconnected', endedAt: Date.now(), recording: false, recordingStartedAt: 0,
          screenShareSupported: false, screenSharing: false, screenAudioSharing: false, screenSharePending: false, remoteScreenSharing: false }
        nativeState = null; nativeOwner = ''
        controller.connection(value, ...versions)
        if (ended) Object.assign(voiceCallState, ended)
        setUiSoundBlocked('voice-call', false); setChatFeedbackBlocked('voice-call', false)
        return
      }
      controller.connection(value, ...versions)
    }
  }
  const installVoiceCallSender = send => { sender = send }
  const canRouteVoiceAudio = () => voiceCallMedia.canRouteAudio()
  const mountCallVideo = callId => voiceCallMedia.mountVideo?.(callId)
  const unmountCallVideo = callId => voiceCallMedia.unmountVideo?.(callId)
  return { voiceCallState, voiceCalls, voiceCallMedia, openVoiceCallPage, installVoiceCallSender,
    canRouteVoiceAudio, mountCallVideo, unmountCallVideo }
}
let runtime
// #ifdef H5
runtime = typeof window === 'undefined' ? createRuntime() : sharedVoiceCallRuntime(createRuntime)
// #endif
// #ifndef H5
runtime = createRuntime()
// #endif
export const { voiceCallState, voiceCalls, voiceCallMedia, openVoiceCallPage, installVoiceCallSender,
  canRouteVoiceAudio, mountCallVideo, unmountCallVideo } = runtime
