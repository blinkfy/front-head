<template>
  <view class="call-page" :class="{ dark: darkTheme, 'video-mode': isVideo }">
    <text class="page-title">{{ isVideo ? '视频通话' : '语音通话' }}</text>
    <view class="peer">
      <view v-if="!videoActive" class="avatar"><text>{{ peerInitial }}</text></view>
      <text class="peer-name">{{ state.peer?.name || '语音通话' }}</text>
      <text class="status" aria-live="polite">{{ statusText }}</text>
      <text v-if="state.phase === 'connected'" class="route-hint">{{ routeAudio ? (state.speaker ? '免提播放' : '听筒 / 耳机播放') : '通过系统音频设备播放' }}</text>
      <text v-if="state.reason === 'connect_failed'" class="route-hint">可尝试切换 Wi-Fi 或移动网络后重试</text>
    </view>
    <!-- #ifdef H5 -->
    <view v-if="videoActive" class="video-stage">
      <view id="call-video-remote" class="remote-video" v-show="state.remoteCameraEnabled"></view>
      <text v-if="!state.remoteCameraEnabled" class="video-placeholder">对方已关闭摄像头</text>
      <view class="local-preview">
        <view id="call-video-local" class="local-video" v-show="state.cameraEnabled"></view>
        <text v-if="!state.cameraEnabled" class="video-placeholder local-placeholder">摄像头已关闭</text>
        <text v-else class="self-label">我</text>
      </view>
    </view>
    <!-- #endif -->
    <button v-if="state.playbackBlocked && ['connecting', 'connected'].includes(state.phase)" class="playback-button"
      @click="resumePlayback">{{ isVideo ? '点击播放声音和画面' : '点击播放通话声音' }}</button>
    <button v-if="canMinimize && state.phase === 'connected'" class="playback-button" @click="minimize">最小化，通话继续</button>
    <!-- #ifdef H5 -->
    <button v-if="isVideo && state.phase === 'connected' && canPip" class="playback-button" @click="pictureInPicture">视频小窗</button>
    <button v-if="canNotify && !notificationsGranted" class="playback-button" @click="enableNotifications">开启浏览器来电通知</button>
    <text v-if="webRealtime" class="route-hint">保持网页打开；浏览器休眠或关闭后无法接听</text>
    <!-- #endif -->
    <view class="controls">
      <template v-if="state.phase === 'incoming'">
        <view class="action"><button class="round danger" aria-label="拒绝通话" @click="end('rejected')"><VoiceCallIcon kind="hangup" /></button><text>拒绝</text></view>
        <view class="action"><button class="round accept" aria-label="接听通话" @click="accept"><VoiceCallIcon /></button><text>接听</text></view>
      </template>
      <template v-else-if="['connecting', 'connected'].includes(state.phase)">
        <view class="action"><button class="round neutral" :class="{ selected: state.muted }" :aria-label="state.muted ? '开启麦克风' : '关闭麦克风'" @click="toggleMute"><VoiceCallIcon kind="mic" :off="state.muted" /></button><text>{{ state.muted ? '麦克风已关闭' : '静音' }}</text></view>
        <view v-if="isVideo" class="action"><button class="round neutral" :class="{ selected: !state.cameraEnabled }" :disabled="state.phase !== 'connected'" :aria-label="state.cameraEnabled ? '关闭摄像头' : '开启摄像头'" @click="toggleCamera"><ManifestIcon id="chat_video_call" size="28px" /></button><text>{{ state.cameraEnabled ? '关闭摄像头' : '开启摄像头' }}</text></view>
        <view v-if="isVideo" class="action"><button class="round neutral" :disabled="state.phase !== 'connected' || !state.cameraEnabled" aria-label="切换摄像头" @click="switchCamera"><ManifestIcon id="refresh" size="28px" /></button><text>切换镜头</text></view>
        <view class="action"><button class="round danger" aria-label="挂断通话" @click="end('hangup')"><VoiceCallIcon kind="hangup" /></button><text>挂断</text></view>
        <view v-if="routeAudio" class="action"><button class="round neutral" :class="{ selected: state.speaker }" aria-label="切换免提" @click="toggleSpeaker"><VoiceCallIcon kind="speaker" /></button><text>{{ state.speaker ? '免提已开启' : '免提' }}</text></view>
      </template>
      <view v-else-if="state.phase === 'calling'" class="action"><button class="round danger" aria-label="取消呼叫" @click="end('cancelled')"><VoiceCallIcon kind="hangup" /></button><text>取消</text></view>
      <button v-else class="return-button" @click="back">返回聊天</button>
    </view>
  </view>
</template>

<script>
import { webCallsAvailable, webCallNotificationsAvailable, requestWebCallNotifications, refreshWebCallAlert } from '@/utils/web-call-support.js'
import { voiceCallMedia } from '@/utils/voice-call-media.js'
import VoiceCallIcon from '@/components/VoiceCallIcon.vue'
import ManifestIcon from '@/components/ManifestIcon.vue'
import { voiceCalls, voiceCallState, canRouteVoiceAudio, mountCallVideo, unmountCallVideo } from '@/utils/voice-call.js'
import { VOICE_END_LABELS } from '@/utils/voice-call-core.mjs'
import { ThemeManager } from '@/utils/theme.js'
import { androidRealtimeAvailable, androidBackgroundMask } from '@/utils/android-realtime.js'

export default {
  components: { VoiceCallIcon, ManifestIcon },
  data() { return { state: voiceCallState, now: Date.now(), tick: null, darkTheme: ThemeManager.getTheme() === 'dark', routeAudio: canRouteVoiceAudio(), appRealtime: androidRealtimeAvailable(), webRealtime: webCallsAvailable(), canNotify: webCallNotificationsAvailable(), notificationsGranted: false, canPip: voiceCallMedia.canPictureInPicture(), minimized: false, incomingCallId: '', incomingOpenedAt: 0, incomingListener: null } },
  computed: {
    canMinimize() { return this.appRealtime || this.webRealtime },
    isVideo() { return this.state.mode === 'video' },
    videoActive() { return this.isVideo && ['connecting', 'connected'].includes(this.state.phase) },
    peerInitial() { return (this.state.peer?.name || '聊').slice(0, 1) },
    statusText() {
      if (this.incomingCallId && this.state.callId !== this.incomingCallId && ['idle', 'ended'].includes(this.state.phase))
        return this.now - this.incomingOpenedAt < 10000 ? '正在确认来电…' : '此来电已结束或暂时无法连接'
      if (this.state.phase === 'connected') {
        const seconds = Math.max(0, Math.floor((this.now - this.state.startedAt) / 1000))
        return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
      }
      return { idle: '暂无进行中的通话', calling: '正在呼叫…', incoming: this.isVideo ? '邀请你视频通话' : '邀请你语音通话', connecting: '正在连接…', ended: VOICE_END_LABELS[this.state.reason] || '通话已结束' }[this.state.phase]
    }
  },
  watch: {
    'state.phase'() { this.attachVideo() },
    'state.mediaError'(value) { if (value) uni.showToast({ title: value, icon: 'none' }) }
  },
  onLoad(options) {
    // #ifdef H5
    this.notificationsGranted = typeof Notification !== 'undefined' && Notification.permission === 'granted'
    // #endif
    this.incomingListener = id => { if (/^[A-Za-z0-9_-]{12,80}$/.test(id || '')) { this.incomingCallId = id; this.incomingOpenedAt = Date.now() } }
    this.incomingListener(options?.incomingCallId)
    uni.$on('voice-call:notification-opened', this.incomingListener)
  },
  onReady() { this.attachVideo() },
  onShow() { this.minimized = false; this.now = Date.now(); if (!this.tick) this.tick = setInterval(() => { this.now = Date.now() }, 1000); this.attachVideo() },
  onHide() { clearInterval(this.tick); this.tick = null; unmountCallVideo(this.state.callId); if (this.videoActive && !this.canMinimize) voiceCalls.end('background') },
  onUnload() { uni.$off('voice-call:notification-opened', this.incomingListener); clearInterval(this.tick); this.tick = null; unmountCallVideo(this.state.callId); if (!this.minimized) voiceCalls.end(this.state.phase === 'calling' ? 'cancelled' : this.state.phase === 'incoming' ? 'rejected' : 'hangup') },
  onBackPress() { if (this.minimized) return false; if (this.state.phase === 'connected' && this.canMinimize) { this.minimize(); return true }; if (['calling', 'incoming', 'connecting', 'connected'].includes(this.state.phase)) { this.end(this.state.phase === 'calling' ? 'cancelled' : this.state.phase === 'incoming' ? 'rejected' : 'hangup'); return true }; return false },
  methods: {
    attachVideo() { this.$nextTick(() => { if (this.videoActive) mountCallVideo(this.state.callId) }) },
    async enableNotifications() {
      const permission = await requestWebCallNotifications()
      this.notificationsGranted = permission === 'granted'
      refreshWebCallAlert()
      if (!this.notificationsGranted) uni.showToast({ title: '可在浏览器网站设置中允许通知', icon: 'none' })
    },
    async pictureInPicture() {
      try { await voiceCallMedia.pictureInPicture(this.state.callId) }
      catch (_) { uni.showToast({ title: '暂时无法开启小窗，请等待画面后重试', icon: 'none' }) }
    },
    accept() { void voiceCalls.accept() },
    end(reason) { voiceCalls.end(reason) },
    toggleMute() { voiceCalls.control({ muted: !this.state.muted }) },
    toggleSpeaker() { voiceCalls.control({ speaker: !this.state.speaker }) },
    toggleCamera() { voiceCalls.control({ cameraEnabled: !this.state.cameraEnabled }) },
    switchCamera() { voiceCalls.control({ switchCamera: true }) },
    resumePlayback() { voiceCalls.control({ resumePlayback: true }) },
    back() { if (getCurrentPages().length > 1) uni.navigateBack(); else uni.redirectTo({ url: '/pages-nonTheme/chatlist' }) },
    minimize() {
      if (this.appRealtime && !(androidBackgroundMask() & 1)) { uni.showToast({ title: '后台通话服务尚未就绪', icon: 'none' }); return }
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
.dark { background: #17231f; color: #e5eee8; }
.dark .avatar { background: #284337; color: #b9d9c5; }
.dark .neutral { background: #2c3d34; border-color: #42554a; color: #dce9e0; }
.dark .neutral.selected { background: #345c45; }
.video-mode { padding-left: 16px; padding-right: 16px; }
.video-mode .peer { padding-top: 20px; padding-bottom: 20px; }
.video-mode .peer-name { margin-top: 14px; }
.video-mode .controls { padding-top: 26px; gap: 8px; flex-wrap: wrap; }
.video-mode .action { width: 64px; font-size: 12px; gap: 10px; }
.video-mode .round { width: 54px; height: 54px; }
.round[disabled] { opacity: 0.45; }
.video-stage { position: relative; width: 100%; height: 52vh; min-height: 240px; max-height: 520px; flex: none; border-radius: 20px; overflow: hidden; background: #101916; }
.remote-video, .local-video { position: absolute; inset: 0; }
.local-preview { position: absolute; right: 12px; top: 12px; width: 96px; height: 128px; border: 1px solid rgba(255,255,255,0.25); border-radius: 12px; overflow: hidden; background: #283b31; }
.video-placeholder { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #e2ece5; font-size: 15px; }
.local-placeholder { font-size: 12px; }
.self-label { position: absolute; left: 8px; bottom: 6px; color: white; font-size: 12px; text-shadow: 0 1px 3px #000; }
</style>
