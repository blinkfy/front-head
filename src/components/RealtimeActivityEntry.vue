<template>
  <view v-if="hasEntries" class="realtime-entries">
    <!-- #ifdef H5 -->
    <button v-if="showNotificationSetting && webEnabled && canNotify && !notificationsGranted" class="realtime-entry" @click="enableNotifications">
      <view class="entry-copy"><text class="entry-title">开启浏览器来电通知</text><text class="entry-detail">网页保持打开时，在其他窗口也能看到来电提醒</text></view><text>›</text>
    </button>
    <!-- #endif -->
    <button v-if="callActive" class="realtime-entry" @click="openCall">
      <ManifestIcon :id="videoCall ? 'chat_video_call' : 'chat_voice_call'" size="25px" />
      <view class="entry-copy"><text class="entry-title">{{ callTitle }}</text><text class="entry-detail">{{ call.peer?.name || '联系人' }} · {{ call.phase === 'incoming' ? '点击接听或拒绝' : '点击返回通话' }}</text></view><text>›</text>
    </button>
    <button v-if="locationActive" class="realtime-entry" @click="openLocation">
      <ManifestIcon id="map_location" size="25px" />
      <view class="entry-copy"><text class="entry-title">{{ location.paused ? '位置更新已暂停' : '实时位置共享' }}</text><text class="entry-detail">{{ location.peer?.name || '联系人' }} · 点击查看位置状态</text></view><text>›</text>
    </button>
  </view>
</template>
<script>
import { webCallsAvailable, webCallNotificationsAvailable, requestWebCallNotifications, refreshWebCallAlert } from '@/utils/web-call-support.js'
import ManifestIcon from './ManifestIcon.vue'
import { voiceCallState, openVoiceCallPage } from '@/utils/voice-call.js'
import { liveLocationState } from '@/utils/live-location.js'
export default {
  props: { showLocation: { type: Boolean, default: true }, showNotificationSetting: { type: Boolean, default: false } },
  components: { ManifestIcon },
  data: () => ({ webEnabled: webCallsAvailable(), canNotify: webCallNotificationsAvailable(), notificationsGranted: false, call: voiceCallState, location: liveLocationState, openingLocation: false }),
  computed: {
    videoCall() { return this.call.mode === 'video' || ((this.call.cameraSupported || this.call.mode === 'video') && (this.call.cameraEnabled || this.call.remoteCameraEnabled)) },
    callActive() { return ['calling', 'incoming', 'connecting', 'connected'].includes(this.call.phase) },
    locationActive() { return this.showLocation && this.location.phase === 'sharing' },
    callTitle() {
      const kind = this.videoCall ? '视频' : '语音'
      return this.call.phase === 'incoming' ? `${kind}来电` : this.call.phase === 'calling' ? `正在呼叫 · ${kind}通话` : this.call.phase === 'connecting' ? `${kind}通话连接中` : `${kind}通话进行中`
    },
    hasEntries() { return this.callActive || this.locationActive ||
      (this.showNotificationSetting && this.webEnabled && this.canNotify && !this.notificationsGranted) }
  },
  mounted() {
    // #ifdef H5
    this.notificationsGranted = typeof Notification !== 'undefined' && Notification.permission === 'granted'
    // #endif
  },
  methods: {
    async enableNotifications() {
      this.notificationsGranted = (await requestWebCallNotifications()) === 'granted'
      refreshWebCallAlert()
      if (!this.notificationsGranted) uni.showToast({ title: '可在浏览器网站设置中允许通知', icon: 'none' })
    },
    openCall() { openVoiceCallPage() },
    openLocation() {
      const peer = this.location.peer
      if (!peer || this.openingLocation || !this.locationActive) return
      this.openingLocation = true
      uni.navigateTo({
        url: `/pages-nonTheme/live-location?peerId=${encodeURIComponent(peer.id)}&name=${encodeURIComponent(peer.name || '联系人')}&sessionId=${encodeURIComponent(this.location.sessionId)}`,
        complete: () => { this.openingLocation = false }
      })
    }
  }
}
</script>
<style scoped>
.realtime-entries { margin: 0 12px; flex: none; }
.realtime-entry { display: flex; align-items: center; gap: 12px; width: 100%; margin: 8px 0; padding: 12px 14px; border-radius: 10px; background: #e7f2ec; color: #168362; text-align: left; line-height: 1.5; }
.realtime-entry::after { border: 0; }.entry-copy { flex: 1; min-width: 0; }.entry-title, .entry-detail { display: block; }.entry-title { font-size: 14px; font-weight: 600; }.entry-detail { font-size: 12px; opacity: .8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
:global(.dark-theme) .realtime-entry { background: #244133; color: #a3d8bc; }
</style>
