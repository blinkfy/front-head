<template>
  <view class="call-page" :class="{ dark: darkTheme, 'video-mode': videoActive, 'video-controls-hidden': videoActive && videoControlsHidden, 'screen-sharing': screenShareLabel }">
    <text class="page-title">{{ (['connecting', 'connected'].includes(state.phase) ? videoActive : isVideo) ? '视频通话' : '语音通话' }}</text>
    <view class="peer">
      <ChatCachedAvatar v-if="!videoActive" class="avatar" :src="peerAvatar" :avatar-name="state.peer?.name || '聊'" :owner="avatarOwner" />
      <text class="peer-name">{{ state.peer?.name || '语音通话' }}</text>
      <text class="status" aria-live="polite">{{ statusText }}</text>
      <text v-if="state.phase === 'connected' && !videoActive" class="route-hint">{{ routeAudio ? (state.speaker ? '免提播放' : '听筒 / 耳机播放') : '通过系统音频设备播放' }}</text>
      <text v-if="state.reason === 'connect_failed'" class="route-hint">可尝试切换 Wi-Fi 或移动网络后重试</text>
    </view>
    <!-- #ifdef H5 -->
    <view v-if="cameraSupported && (outgoingVideoVisible || ['connecting', 'connected'].includes(state.phase))" v-show="videoActive" class="video-stage">
      <view class="video-pane" :class="{ 'video-preview': mainIsLocal }" v-show="remoteVideoVisible" role="button" tabindex="0"
        :aria-label="mainIsLocal && !screenShareLabel ? '将对方画面放大' : videoControlsHidden ? '显示通话控件' : '隐藏通话控件'"
        @click="tapVideo(false)" @keydown.enter.prevent="tapVideo(false)" @keydown.space.prevent="tapVideo(false)">
        <view id="call-video-remote" class="video-feed" :class="{ 'camera-off': !remoteVideoVisible }"></view>
      </view>
      <view class="video-pane" :class="{ 'video-preview': !mainIsLocal }" v-show="localVideoVisible" :role="outgoingVideoVisible ? 'img' : 'button'" :tabindex="outgoingVideoVisible ? -1 : 0"
        :aria-label="outgoingVideoVisible ? '本机摄像头预览' : !mainIsLocal && !screenShareLabel ? '将自己画面放大' : videoControlsHidden ? '显示通话控件' : '隐藏通话控件'"
        @click="tapVideo(true)" @keydown.enter.prevent="tapVideo(true)" @keydown.space.prevent="tapVideo(true)">
        <view id="call-video-local" class="video-feed" :class="{ 'camera-off': !localVideoVisible }"></view>
        <text v-if="!mainIsLocal" class="self-label">{{ state.screenSharing ? '我的屏幕' : '我' }}</text>
      </view>
    </view>
    <text v-if="videoActive && videoControlsHidden && state.recording" class="video-recording-badge">● 录音中 · {{ recordingTime }}</text>
    <text v-if="screenShareLabel" class="screen-share-badge" aria-live="polite">{{ screenShareLabel }}</text>
    <!-- #endif -->
    <button v-if="state.playbackBlocked && ['connecting', 'connected'].includes(state.phase)" class="playback-button"
      @click="resumePlayback">{{ isVideo ? '点击播放声音和画面' : '点击播放通话声音' }}</button>
    <button v-if="canMinimize && state.phase === 'connected'" class="playback-button" @click="minimize">{{ videoActive && canPip ? '最小化 · 视频小窗' : '最小化通话' }}</button>
    <button v-if="state.phase === 'connected' && state.recordingSupported" class="record-button" :class="{ recording: state.recording }" @click="toggleRecording">
      {{ state.recording ? '停止录音 · ' + recordingTime : '开始录音' }}
    </button>
    <text v-if="state.recordingError" class="route-hint">{{ state.recordingError }}</text>
    <text v-if="state.mediaError" class="route-hint" aria-live="polite">{{ state.mediaError }}</text>
    <!-- #ifdef H5 -->
    <button v-if="state.phase === 'incoming' && ringtoneState.blocked" class="playback-button" @click="enableRingtone">点击开启来电铃声</button>
    <button v-if="canNotify && !notificationsGranted && state.phase !== 'connected'" class="playback-button" @click="enableNotifications">开启浏览器来电通知</button>
    <text v-if="webRealtime && !videoActive" class="route-hint">保持网页打开；浏览器休眠或关闭后无法接听</text>
    <!-- #endif -->
    <view class="controls" :style="{ gridTemplateColumns: 'repeat(' + controlCount + ', minmax(0, 1fr))' }" :class="{ 'connected-controls': ['connecting', 'connected'].includes(state.phase), 'outgoing-controls': outgoingVideoVisible }">
      <template v-if="state.phase === 'incoming'">
        <view class="action"><button class="round danger" aria-label="拒绝通话" @click="end('rejected')"><VoiceCallIcon kind="hangup" /></button><text>拒绝</text></view>
        <view class="action"><button class="round accept" aria-label="接听通话" @click="accept"><VoiceCallIcon /></button><text>接听</text></view>
      </template>
      <template v-else-if="['connecting', 'connected'].includes(state.phase)">
        <view class="action"><button class="round neutral" :class="{ selected: state.muted }" :aria-label="state.muted ? '开启麦克风' : '关闭麦克风'" @click="toggleMute"><VoiceCallIcon kind="mic" :off="state.muted" /></button><text>{{ state.muted ? '麦克风已关闭' : '静音' }}</text></view>
        <view v-if="routeAudio" class="action"><button class="round neutral" :class="{ selected: state.speaker }" aria-label="切换免提" @click="toggleSpeaker"><VoiceCallIcon kind="speaker" /></button><text>{{ state.speaker ? '免提已开启' : '免提' }}</text></view>
        <view v-if="cameraSupported" class="action"><button class="round neutral" :class="{ selected: state.cameraEnabled && !state.screenSharing }" :disabled="state.phase !== 'connected' || state.screenSharing || state.screenSharePending" :aria-label="state.cameraEnabled ? '关闭摄像头' : '开启摄像头'" @click="toggleCamera"><VoiceCallIcon kind="camera" :off="!state.cameraEnabled || state.screenSharing" /></button><text>{{ state.cameraEnabled ? '关闭摄像头' : '开启摄像头' }}</text></view>
        <view v-if="showSwitchCamera" class="action"><button class="round neutral" :disabled="state.phase !== 'connected' || !state.cameraEnabled || state.screenSharePending" aria-label="切换摄像头" @click="switchCamera"><VoiceCallIcon kind="switch-camera" /></button><text>切换镜头</text></view>
        <view v-if="state.screenShareSupported && state.phase === 'connected'" class="action"><button class="round neutral" :class="{ selected: state.screenSharing }" :disabled="state.screenSharePending" :aria-label="shareActionLabel" @click="toggleScreenShare"><VoiceCallIcon kind="screen" /></button><text>{{ shareActionLabel }}</text></view>
        <view class="action hangup-action"><button class="round danger" aria-label="挂断通话" @click="end('hangup')"><VoiceCallIcon kind="hangup" /></button><text>挂断</text></view>
      </template>
      <view v-else-if="state.phase === 'calling'" class="action"><button class="round danger" aria-label="取消呼叫" @click="end('cancelled')"><VoiceCallIcon kind="hangup" /></button><text>取消</text></view>
      <button v-else class="return-button" @click="back">返回聊天</button>
    </view>
  </view>
</template>

<script>
import { webCallRingtoneState, primeWebCallRingtone } from '@/utils/web-call-ringtone.js'
import { webCallsAvailable, webCallNotificationsAvailable, requestWebCallNotifications, refreshWebCallAlert } from '@/utils/web-call-support.js'
import VoiceCallIcon from '@/components/VoiceCallIcon.vue'
import ChatCachedAvatar from './components/ChatCachedAvatar.vue'
import { voiceCalls, voiceCallState, voiceCallMedia, canRouteVoiceAudio, mountCallVideo, unmountCallVideo } from '@/utils/voice-call.js'
import { callAvatarUrl, VOICE_END_LABELS } from '@/utils/voice-call-core.mjs'
import { recordingIdentity } from '@/utils/call-recording-preference.mjs'
import { baseUrl } from '@/api/settings.js'
import { ThemeManager } from '@/utils/theme.js'
import { androidRealtimeAvailable, androidBackgroundMask } from '@/utils/android-realtime.js'

export default {
  components: { VoiceCallIcon, ChatCachedAvatar },
  data() { return { state: voiceCallState, ringtoneState: webCallRingtoneState, now: Date.now(), tick: null, darkTheme: ThemeManager.getTheme() === 'dark', routeAudio: canRouteVoiceAudio(), appRealtime: androidRealtimeAvailable(), webRealtime: webCallsAvailable(), canNotify: webCallNotificationsAvailable(), notificationsGranted: false, canPip: voiceCallMedia.canPictureInPicture(), minimized: false, incomingCallId: '', incomingOpenedAt: 0, incomingListener: null, minimizeListener: null, selfIsMain: false, videoControlsHidden: false, pageCallId: '', pageOwner: '', pageVisible: false, leaving: false } },
  computed: {
    recordingTime() {
      const seconds = Math.max(0, Math.floor((this.now - this.state.recordingStartedAt) / 1000))
      return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
    },
    controlCount() { return 1 + Number(this.routeAudio) + Number(this.cameraSupported) + Number(this.showSwitchCamera) + Number(this.state.screenShareSupported && this.state.phase === 'connected') },
    canMinimize() { return this.appRealtime || this.webRealtime },
    isVideo() { return this.state.mode === 'video' },
    cameraSupported() { return this.state.cameraSupported || this.isVideo },
    showSwitchCamera() { return this.cameraSupported && this.state.canSwitchCamera && !this.state.screenSharing },
    shareActionLabel() { return this.state.screenSharing ? '停止共享' : this.state.screenSharePending ? '等待授权' : '共享屏幕' },
    outgoingVideoVisible() { return this.webRealtime && this.state.phase === 'calling' && this.state.outgoingPreview === true },
    localVideoVisible() { return this.state.phase === 'calling' ? this.outgoingVideoVisible : !!(this.state.cameraEnabled || this.state.screenSharing) },
    remoteVideoVisible() { return this.state.phase !== 'calling' && !!(this.state.remoteCameraEnabled || this.state.remoteScreenSharing) },
    screenShareLabel() {
      if (this.state.phase !== 'connected') return ''
      if (this.state.screenAudioSharing) return '正在共享屏幕和声音'
      if (this.state.remoteScreenSharing) return this.state.screenSharing ? '双方正在共享屏幕' : '对方正在共享屏幕'
      return this.state.screenSharing ? '正在共享屏幕' : ''
    },
    videoActive() { return this.outgoingVideoVisible || (this.cameraSupported && (this.localVideoVisible || this.remoteVideoVisible) && ['connecting', 'connected'].includes(this.state.phase)) },
    mainIsLocal() {
      return this.localVideoVisible && (!this.remoteVideoVisible || (!this.state.remoteScreenSharing && (this.state.screenSharing || this.selfIsMain)))
    },
    peerAvatar() { return callAvatarUrl(this.state.peer?.avatar, baseUrl) },
    avatarOwner() { return this.pageOwner ? recordingIdentity().owner : '' },
    statusText() {
      if (this.incomingCallId && this.state.callId !== this.incomingCallId && ['idle', 'ended'].includes(this.state.phase))
        return this.now - this.incomingOpenedAt < 10000 ? '正在确认来电…' : '此来电已结束或暂时无法连接'
      if (this.state.phase === 'connected') {
        const seconds = Math.max(0, Math.floor((this.now - this.state.startedAt) / 1000))
        return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
      }
      return { idle: '暂无进行中的通话', calling: this.outgoingVideoVisible ? '等待对方接听 · 本机预览' : '正在呼叫…', incoming: this.isVideo ? '邀请你视频通话' : '邀请你语音通话', connecting: '正在连接…', ended: VOICE_END_LABELS[this.state.reason] || '通话已结束' }[this.state.phase]
    }
  },
  watch: {
    'state.phase'() { this.attachVideo() },
    'state.outgoingPreview'() { this.attachVideo() },
    'state.callId'(id) {
      if (!this.pageVisible || this.leaving) return
      this.pageCallId = id
      if (id && id !== this.incomingCallId) { this.incomingCallId = ''; this.incomingOpenedAt = 0 }
      this.attachVideo()
    },
    videoActive(active) {
      if (!active) { this.selfIsMain = false; this.videoControlsHidden = false }
    },
    'state.mediaError'(value) { if (value) uni.showToast({ title: value, icon: 'none' }) }
  },
  onLoad(options) {
    this.pageCallId = this.state.callId
    this.pageOwner = uni.getStorageSync('token') || ''
    // #ifdef H5
    this.notificationsGranted = typeof Notification !== 'undefined' && Notification.permission === 'granted'
    // #endif
    this.incomingListener = id => { if (/^[A-Za-z0-9_-]{12,80}$/.test(id || '')) { this.incomingCallId = id; this.incomingOpenedAt = Date.now() } }
    this.incomingListener(options?.incomingCallId)
    uni.$on('voice-call:notification-opened', this.incomingListener)
    this.minimizeListener = id => { if (this.pageVisible && !this.leaving && this.ownsCurrentCall() && id === this.state.callId && !this.minimized) { this.minimized = true; this.back() } }
    uni.$on('voice-call:minimize', this.minimizeListener)
    // Explicit page entry may restore native fullscreen; lifecycle onShow must not.
    if (['connecting', 'connected'].includes(this.state.phase)) voiceCallMedia.showNativeVideo(this.state.callId)
  },
  onReady() { this.attachVideo() },
  onShow() { this.pageVisible = true; this.leaving = false; this.pageCallId = this.state.callId; this.pageOwner = uni.getStorageSync('token') || ''; this.minimized = false; this.now = Date.now(); if (!this.tick) this.tick = setInterval(() => { this.now = Date.now() }, 1000); this.attachVideo() },
  onHide() { this.pageVisible = false; clearInterval(this.tick); this.tick = null; unmountCallVideo(this.pageCallId); if (this.ownsCurrentCall() && this.videoActive && !this.canMinimize) voiceCalls.end('background') },
  onUnload() {
    this.leaving = true; this.pageVisible = false
    uni.$off('voice-call:minimize', this.minimizeListener); uni.$off('voice-call:notification-opened', this.incomingListener)
    clearInterval(this.tick); this.tick = null; unmountCallVideo(this.pageCallId)
    // Navigation can finish after another call arrives. Only tear down this
    // page's session; supported clients keep active calls in the return entry.
    if (this.ownsCurrentCall() && !this.minimized && !this.canMinimize)
      voiceCalls.end(this.state.phase === 'calling' ? 'cancelled' : this.state.phase === 'incoming' ? 'rejected' : 'hangup')
  },
  onBackPress() {
    if (this.minimized || !this.ownsCurrentCall()) { this.leaving = true; return false }
    if (this.canMinimize && ['calling', 'incoming', 'connecting', 'connected'].includes(this.state.phase)) {
      if (this.state.phase === 'connected') { this.minimize(); return true }
      this.minimized = true; this.leaving = true; return false
    }
    if (['calling', 'incoming', 'connecting', 'connected'].includes(this.state.phase)) { this.end(this.state.phase === 'calling' ? 'cancelled' : this.state.phase === 'incoming' ? 'rejected' : 'hangup'); return true }
    this.leaving = true; return false
  },
  methods: {
    ownsCurrentCall() { return !!this.pageCallId && this.pageCallId === this.state.callId && this.pageOwner === (uni.getStorageSync('token') || '') },
    tapVideo(local) {
      if (this.outgoingVideoVisible) return
      if (local === this.mainIsLocal || this.screenShareLabel) this.videoControlsHidden = !this.videoControlsHidden
      else this.selfIsMain = local
    },
    enableRingtone() { primeWebCallRingtone() },
    attachVideo() {
      const callId = this.pageCallId
      this.$nextTick(() => { if (this.pageVisible && !this.leaving && this.ownsCurrentCall() && callId === this.state.callId && this.cameraSupported) mountCallVideo(callId) })
    },
    async enableNotifications() {
      const permission = await requestWebCallNotifications()
      this.notificationsGranted = permission === 'granted'
      refreshWebCallAlert()
      if (!this.notificationsGranted) uni.showToast({ title: '可在浏览器网站设置中允许通知', icon: 'none' })
    },
    accept() { if (!this.leaving && this.ownsCurrentCall()) void voiceCalls.accept(this.pageCallId) },
    end(reason) { if (!this.leaving && this.ownsCurrentCall()) voiceCalls.end(reason) },
    controlCall(options) { if (!this.leaving && this.ownsCurrentCall()) voiceCalls.control(options) },
    toggleMute() { this.controlCall({ muted: !this.state.muted }) },
    toggleRecording() { this.controlCall({ recordingEnabled: !this.state.recording }) },
    toggleSpeaker() { this.controlCall({ speaker: !this.state.speaker }) },
    toggleCamera() { this.controlCall({ cameraEnabled: !this.state.cameraEnabled }) },
    switchCamera() { this.controlCall({ switchCamera: true }) },
    toggleScreenShare() { this.controlCall({ screenSharing: !this.state.screenSharing }) },
    resumePlayback() { this.controlCall({ resumePlayback: true }) },
    back() { this.leaving = true; this.pageVisible = false; if (getCurrentPages().length > 1) uni.navigateBack(); else uni.redirectTo({ url: '/pages-nonTheme/chatlist' }) },
    async minimize() {
      if (this.minimized || this.leaving || !this.ownsCurrentCall()) return
      const callId = this.pageCallId
      if (this.appRealtime && !(androidBackgroundMask() & 1)) { uni.showToast({ title: '后台通话服务尚未就绪', icon: 'none' }); return }
      if (this.appRealtime && this.cameraSupported) { voiceCallMedia.minimizeNativeVideo(this.state.callId); return }
      // Request PiP while the tap still carries browser user activation.
      if (this.videoActive && this.canPip) {
        try { await voiceCallMedia.pictureInPicture(callId) }
        catch (_) { uni.showToast({ title: '视频小窗暂不可用，通话继续', icon: 'none' }) }
      }
      if (this.leaving || callId !== this.pageCallId || !this.ownsCurrentCall() || this.state.phase !== 'connected') return
      this.minimized = true; this.back()
    }
  }
}
</script>

<style scoped>
.call-page { min-height: 100vh; box-sizing: border-box; padding: calc(var(--status-bar-height, 28px) + 24px) 24px calc(env(safe-area-inset-bottom, 0px) + 40px); background: #f3f6f4; color: #243730; display: flex; flex-direction: column; align-items: center; }
.page-title { font-size: 15px; color: #73837b; }
.peer { padding-top: 12vh; display: flex; flex-direction: column; align-items: center; text-align: center; width: 100%; }
.avatar { width: 88px; height: 88px; border-radius: 28px; background: #deebe3; color: #32684e; display: flex; align-items: center; justify-content: center; font-size: 36px; }
.peer-name { margin-top: 24px; font-size: 24px; font-weight: 600; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status { margin-top: 14px; font-size: 16px; line-height: 1.6; max-width: 340px; font-variant-numeric: tabular-nums; }
.route-hint { margin-top: 14px; font-size: 12px; color: #788980; line-height: 1.6; }
.controls { margin-top: auto; padding-top: 80px; display: flex; justify-content: center; gap: 24px; width: 100%; max-width: 400px; }
.action { width: 80px; display: flex; flex-direction: column; align-items: center; gap: 14px; font-size: 13px; }
.round { width: 66px; height: 66px; border: 0; border-radius: 50%; padding: 0; margin: 0; display: flex; align-items: center; justify-content: center; }
button::after { border: 0; }
.danger { background: #c84f4b; color: #fff; }
.accept { background: #19835f; color: #fff; }
.neutral { background: #fff; color: #40554b; border: 1px solid #e0e8e2; }
.neutral.selected { background: #d4e9dc; color: #196440; border-color: #b5d5c2; }
.return-button { width: 200px; border-radius: 10px; background: #19835f; color: #fff; font-size: 15px; }
.playback-button { margin: 14px auto 0; padding: 0 18px; border-radius: 10px; background: #19835f; color: white; font-size: 14px; }
.record-button { margin: 12px auto 0; padding: 0 16px; border-radius: 10px; background: #e0ede5; color: #286046; font-size: 14px; }
.record-button.recording { background: #f5e5e3; color: #9d3834; }
.dark { background: #17231f; color: #e5eee8; }
.dark .avatar { background: #284337; color: #b9d9c5; }
.dark .neutral { background: #2c3d34; border-color: #42554a; color: #dce9e0; }
.dark .neutral.selected { background: #345c45; }
.video-mode { height: 100dvh; padding-left: 16px; padding-right: 16px; }
.video-mode .peer { padding-top: 12px; padding-bottom: 12px; }
.video-mode .peer-name { margin-top: 0; }
.video-mode .status { margin-top: 6px; }
.connected-controls { display: grid; gap: 24px 12px; padding-top: 32px; }
.connected-controls .action { width: auto; min-width: 0; font-size: 12px; gap: 12px; }
.connected-controls .round { width: 60px; height: 60px; }
.connected-controls .hangup-action { grid-column: 1 / -1; padding-top: 4px; }
.connected-controls .danger { width: 68px; height: 68px; }
.round[disabled] { opacity: 0.45; }
/* #ifdef H5 */
.call-page.video-mode { position: fixed; inset: 0; height: auto; min-height: 0; z-index: 10; padding: calc(env(safe-area-inset-top, 0px) + 16px) 12px calc(env(safe-area-inset-bottom, 0px) + 12px); background: #101916; color: #fff; }
.video-mode .page-title, .video-mode .peer, .video-mode .route-hint { position: relative; color: #fff; text-shadow: 0 1px 4px #000, 0 1px 10px #000; pointer-events: none; }
.video-mode .page-title, .video-mode .peer, .video-mode .route-hint, .video-mode .playback-button, .video-mode .record-button, .video-mode .connected-controls { z-index: 1; }
.video-mode .peer { margin-bottom: auto; padding: 4px 0; }
.video-mode.screen-sharing .page-title { margin-top: 22px; }
.video-mode .peer-name { max-width: min(55vw, 340px); font-size: 20px; }
.video-mode .status { margin-top: 4px; }
.video-mode .playback-button, .video-mode .record-button { position: relative; margin-top: 6px; }
.video-mode .connected-controls { position: relative; display: flex; justify-content: center; gap: 8px; padding-top: 12px; margin-top: 0; max-width: 480px; pointer-events: none; }
.video-mode .outgoing-controls { position: relative; z-index: 1; padding-top: 12px; }
.video-mode .action { flex: 1 1 0; gap: 4px; text-shadow: 0 1px 4px #000, 0 1px 8px #000; }
.video-mode .hangup-action { padding-top: 0; }
.video-mode .round { width: 46px; height: 46px; pointer-events: auto; }
.video-mode .neutral { background: rgba(16, 25, 22, .56); border-color: rgba(255,255,255,.24); color: #fff; }
.video-mode .neutral.selected { background: rgba(25, 99, 69, .85); }
.video-mode.video-controls-hidden > :not(.video-stage):not(.video-recording-badge):not(.screen-share-badge) { display: none; }
.video-stage, .video-pane, .video-feed { position: absolute; inset: 0; }
.video-pane { overflow: hidden; background: #101916; cursor: pointer; }
.video-pane:focus-visible { outline: 2px solid #95dfba; outline-offset: -3px; }
.video-preview { inset: calc(env(safe-area-inset-top, 0px) + 12px) 12px auto auto; z-index: 2; width: min(clamp(78px, 22vw, 136px), calc(30dvh * var(--call-video-ratio, .75))); aspect-ratio: var(--call-video-ratio, .75); border: 1px solid rgba(255,255,255,.3); border-radius: 12px; background: #283b31; }
.video-feed { pointer-events: none; }
.video-feed.camera-off { visibility: hidden; }
.self-label { position: absolute; left: 8px; bottom: 6px; color: white; font-size: 12px; text-shadow: 0 1px 3px #000; }
.screen-share-badge { position: absolute; z-index: 1; top: calc(env(safe-area-inset-top, 0px) + 12px); left: 12px; padding: 5px 8px; border-radius: 8px; background: rgba(20, 26, 23, .72); color: #d6f6e4; font-size: 12px; pointer-events: none; }
.video-recording-badge + .screen-share-badge { top: calc(env(safe-area-inset-top, 0px) + 42px); }
.video-recording-badge { position: absolute; z-index: 1; top: calc(env(safe-area-inset-top, 0px) + 12px); left: 12px; padding: 5px 8px; border-radius: 8px; background: rgba(20, 26, 23, .62); color: #ffcccc; font-size: 12px; pointer-events: none; }
/* #endif */
</style>
