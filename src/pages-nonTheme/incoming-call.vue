<template>
  <view class="incoming-page">
    <text class="call-kind">{{ state.mode === 'video' ? '视频通话邀请' : '语音通话邀请' }}</text>
    <ChatCachedAvatar class="avatar" :src="peerAvatar" :avatar-name="state.peer?.name || '聊'" :owner="avatarOwner" />
    <text class="peer-name">{{ state.peer?.name || '联系人' }}</text>
    <text class="status">{{ state.opening ? '正在接听…' : '邀请你通话' }}</text>
    <text v-if="state.error" class="error">{{ state.error }}</text>
    <view class="actions">
      <view class="action"><button class="round reject" :disabled="state.opening" aria-label="拒绝通话" @click="reject"><VoiceCallIcon kind="hangup" /></button><text>拒绝</text></view>
      <view class="action"><button class="round accept" :disabled="state.opening" aria-label="接听通话" @click="accept"><VoiceCallIcon :kind="state.mode === 'video' ? 'camera' : 'phone'" /></button><text>{{ state.opening ? '接听中' : '接听' }}</text></view>
    </view>
  </view>
</template>
<script>
import VoiceCallIcon from '@/components/VoiceCallIcon.vue'
import ChatCachedAvatar from './components/ChatCachedAvatar.vue'
import { callAvatarUrl } from '@/utils/voice-call-core.mjs'
import { recordingIdentity } from '@/utils/call-recording-preference.mjs'
import { baseUrl } from '@/api/settings.js'
import { miniIncomingState, miniIncomingCalls } from '@/utils/mini-call-incoming.js'
export default {
  components: { VoiceCallIcon, ChatCachedAvatar },
  data: () => ({ state: miniIncomingState, avatarOwner: recordingIdentity().owner, incomingId: '', leaving: false, handingOff: false, disposed: false }),
  computed: { peerAvatar() { return callAvatarUrl(this.state.peer?.avatar, baseUrl) } },
  watch: { 'state.callId'(id) { if (!id && !this.leaving && !this.handingOff) this.close() } },
  onLoad() { this.incomingId = this.state.callId; if (!this.incomingId) this.close() },
  onUnload() {
    this.disposed = true
    // Clearing an opening alert only invalidates the local handoff. If the
    // redirect already started, the web page can still claim the call.
    if (this.incomingId && this.incomingId === this.state.callId) miniIncomingCalls.reject()
  },
  methods: {
    async accept() {
      if (this.disposed || this.leaving || !this.incomingId || this.incomingId !== this.state.callId) return
      this.handingOff = true
      await miniIncomingCalls.accept()
      if (this.disposed) return
      this.handingOff = false
      if (!this.state.callId) this.close()
    },
    reject() {
      if (!this.disposed && !this.leaving && this.incomingId && this.incomingId === this.state.callId) miniIncomingCalls.reject()
    },
    close() { if (this.leaving) return; this.leaving = true; if (getCurrentPages().length > 1) uni.navigateBack(); else uni.redirectTo({ url: '/pages-nonTheme/chatlist' }) },
  },
}
</script>
<style scoped>
.incoming-page{min-height:100vh;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;padding:calc(var(--status-bar-height,28px) + 40px) 24px 64px;background:#f3f6f4;color:#243730}.call-kind{font-size:15px;color:#78867e}.avatar{display:flex;align-items:center;justify-content:center;width:104px;height:104px;margin-top:64px;border-radius:30px;background:#deebe3;color:#32684e;font-size:42px}.peer-name{font-size:27px;font-weight:600;margin-top:26px;text-align:center;overflow-wrap:anywhere}.status{margin-top:16px;font-size:15px;color:#677e71}.error{margin-top:20px;font-size:13px;color:#ac3f39;line-height:1.6}.actions{display:flex;gap:64px;margin-top:auto;padding-top:64px}.action{display:flex;flex-direction:column;align-items:center;gap:14px;font-size:14px}.round{display:flex;align-items:center;justify-content:center;width:68px;height:68px;padding:0;border:0;border-radius:50%;color:white}.round::after{border:0}.reject{background:#c84f4b}.accept{background:#19835f}.round[disabled]{opacity:.55}
</style>
