<template>
  <view v-if="card" class="activity-message">
    <view class="activity-main" role="button" :aria-label="summary" @click.stop="$emit('open')">
      <view class="activity-symbol"><ManifestIcon :id="card.activity === 'location' ? 'map_location' : card.mode === 'video' ? 'chat_video_call' : 'chat_voice_call'" size="54rpx" /></view>
      <view class="activity-copy">
        <text class="activity-title">{{ card.activity === 'location' ? '实时位置共享' : card.mode === 'video' ? '视频通话' : '语音通话' }}</text>
        <text class="activity-detail">{{ detail }}</text>
        <text class="activity-action">{{ card.activity === 'location' ? '查看共享状态' : '再次呼叫' }}<text class="activity-arrow">›</text></text>
      </view>
    </view>
    <button v-if="recording" class="activity-recording" @click.stop="$emit('open-recording')">
      <ManifestIcon id="chat_voice_text" size="32rpx" />
      <text class="activity-recording-name">{{ recording.name }}</text><text v-if="recording.count > 1">等 {{ recording.count }} 条</text>
      <text class="activity-arrow">›</text>
    </button>
  </view>
</template>
<script>
import ManifestIcon from '@/components/ManifestIcon.vue'
import { realtimeActivitySummary } from '@/utils/realtime-activity.mjs'
export default {
  components: { ManifestIcon }, props: { card: Object, self: Boolean, recording: Object }, emits: ['open', 'open-recording'],
  computed: {
    summary() { return realtimeActivitySummary(this.card, this.self) },
    detail() { return this.card.activity === 'location' ? '发起了一次位置共享' : this.summary.split(' · ').slice(1).join(' · ') }
  }
}
</script>
<style scoped>
.activity-message { width: 450rpx; max-width: 100%; box-sizing: border-box; padding: 24rpx; color: var(--text-primary); background: var(--bg-secondary); }
.activity-main { display: flex; align-items: flex-start; gap: 20rpx; }
.activity-symbol { flex: none; padding-top: 4rpx; }
.activity-copy { flex: 1; min-width: 0; }
.activity-title, .activity-detail, .activity-action { display: block; }
.activity-title { font-size: 29rpx; font-weight: 600; line-height: 1.5; }
.activity-detail { margin-top: 10rpx; font-size: 25rpx; line-height: 1.5; overflow-wrap: anywhere; }
.activity-action { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; margin-top: 16rpx; padding-top: 14rpx; border-top: 1rpx solid var(--border-color, #e6ebe8); font-size: 23rpx; color: var(--text-secondary); }
.activity-arrow { font-size: 30rpx; }
.activity-recording { display: flex; align-items: center; gap: 10rpx; width: 100%; margin: 12rpx 0 0; padding: 8rpx 12rpx; background: var(--bg-primary); color: var(--text-primary); font-size: 23rpx; text-align: left; }
.activity-recording::after { border: 0; }
.activity-recording-name { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
</style>
