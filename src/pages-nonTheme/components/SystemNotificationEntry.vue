<template>
  <view class="system-entry" @click="open">
    <ManifestIcon id="notification" size="48rpx" />
    <view class="system-copy"><text>系统通知</text><text class="system-note">回收预约、商品发货与积分退回</text></view>
    <text v-if="unreadCount" class="system-badge">{{ unreadCount > 99 ? '99+' : unreadCount }}</text>
    <ManifestIcon id="chevron_right" size="28rpx" />
  </view>
</template>
<script>
import ManifestIcon from '@/components/ManifestIcon.vue'
import { messageBus } from '@/utils/message-event-bus.js'
import { getUserNotifications } from '../utils/user-notifications.js'
export default {
  components: { ManifestIcon },
  props: { active: Boolean },
  data: () => ({ unreadCount: 0, version: 0, timer: null, listener: null }),
  watch: { active() { this.version++; this.unreadCount = 0; this.schedule() } },
  mounted() {
    this.listener = () => this.schedule()
    messageBus.on('notification.changed', this.listener)
    messageBus.on('chat.reconnected', this.listener)
    this.schedule()
  },
  beforeUnmount() {
    this.version++; clearTimeout(this.timer)
    messageBus.off('notification.changed', this.listener); messageBus.off('chat.reconnected', this.listener)
  },
  methods: {
    schedule() { clearTimeout(this.timer); if (this.active) this.timer = setTimeout(() => this.refresh(), 200) },
    async refresh() {
      const version = ++this.version, account = uni.getStorageSync('token') || ''
      if (!this.active || !account) { this.unreadCount = 0; return }
      try {
        const res = await getUserNotifications({ countOnly: true })
        if (version === this.version && this.active && account === (uni.getStorageSync('token') || '')) this.unreadCount = res?.code === 0 ? Number(res.data?.unreadCount || 0) : 0
      } catch (_) { if (version === this.version) this.unreadCount = 0 }
    },
    open() { uni.navigateTo({ url: '/pages-nonTheme/system-notifications' }) }
  }
}
</script>
<style scoped>
.system-entry { display: flex; align-items: center; gap: 20rpx; padding: 24rpx 30rpx; border-bottom: 1rpx solid var(--border-color, #e6ebe8); background: var(--bg-secondary, #fff); color: var(--text-primary, #25342e); }
.system-copy { flex: 1; display: flex; flex-direction: column; gap: 6rpx; font-size: 29rpx; }
.system-note { font-size: 23rpx; color: #819088; }
.system-badge { padding: 2rpx 12rpx; border-radius: 18rpx; background: #e34b4b; color: #fff; font-size: 23rpx; }
</style>
