<template>
  <view v-if="enabled" class="community-activity-entry" @click="open">
    <ManifestIcon id="comment" size="48rpx" />
    <view class="community-activity-copy"><text>社区互动</text><text class="community-activity-note">评论、回复与点赞</text></view>
    <text v-if="unreadCount" class="community-activity-badge">{{ unreadCount > 99 ? '99+' : unreadCount }}</text>
    <ManifestIcon id="chevron_right" size="28rpx" />
  </view>
</template>
<script>
import ManifestIcon from '@/components/ManifestIcon.vue'
import { messageBus } from '@/utils/message-event-bus.js'
import { getCommunityNotifications } from '../utils/community-social.js'
export default {
  components: { ManifestIcon },
  props: { enabled: Boolean, active: Boolean },
  data: () => ({ unreadCount: 0, version: 0, timer: null, listener: null }),
  watch: { enabled() { this.refresh() }, active() { this.version++; this.unreadCount = 0; this.refresh() } },
  mounted() {
    this.listener = () => { clearTimeout(this.timer); this.timer = setTimeout(() => this.refresh(), 250) }
    messageBus.on('community.changed', this.listener)
    messageBus.on('chat.reconnected', this.listener)
    this.refresh()
  },
  beforeUnmount() {
    this.version++; clearTimeout(this.timer)
    messageBus.off('community.changed', this.listener); messageBus.off('chat.reconnected', this.listener)
  },
  methods: {
    async refresh() {
      const version = ++this.version, account = uni.getStorageSync('token') || ''
      if (!this.enabled || !this.active || !account) { this.unreadCount = 0; return }
      try {
        const res = await getCommunityNotifications({ countOnly: true })
        if (version === this.version && account === (uni.getStorageSync('token') || '')) this.unreadCount = res?.code === 0 ? Number(res.data?.unreadCount || 0) : 0
      } catch (_) { if (version === this.version) this.unreadCount = 0 }
    },
    open() { uni.navigateTo({ url: '/pages-nonTheme/community-notifications' }) }
  }
}
</script>
<style scoped>
.community-activity-entry { display: flex; align-items: center; gap: 20rpx; padding: 24rpx 30rpx; border-bottom: 1rpx solid var(--border-color, #e6ebe8); background: var(--bg-secondary, #fff); color: var(--text-primary, #25342e); }
.community-activity-copy { flex: 1; display: flex; flex-direction: column; gap: 6rpx; font-size: 29rpx; }
.community-activity-note { font-size: 23rpx; color: #819088; }
.community-activity-badge { padding: 2rpx 12rpx; border-radius: 18rpx; background: #e34b4b; color: #fff; font-size: 23rpx; }
</style>
