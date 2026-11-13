<template>
  <view class="notice-page" :class="{ dark: isDark }">
    <view class="notice-header" :style="{ paddingTop: statusBarHeight + 'px' }">
      <view class="notice-nav">
        <view class="notice-back" @click="goBack"><ManifestIcon id="back" /></view>
        <text>系统通知</text>
        <button :disabled="!items.length || !unreadCount || reading" @click="readAll">全部已读</button>
      </view>
    </view>
    <scroll-view class="notice-list" scroll-y @scrolltolower="loadMore">
      <view v-for="item in items" :key="item.id" class="notice-card" :class="{ unread: !item.readAt }" @click="openOrder(item)">
        <view class="notice-title"><text>{{ item.title }}</text><view v-if="!item.readAt" class="notice-dot" /></view>
        <text class="notice-content">{{ item.content }}</text>
        <view class="notice-meta"><text>{{ timeLabel(item.createdAt) }}</text><text>{{ item.kind === 'provider_quota' ? (item.readAt ? '已读' : '点击标为已读') : '查看详情 ›' }}</text></view>
      </view>
      <view v-if="error" class="notice-status" @click="loadMore">{{ error }}</view>
      <view v-else-if="loading" class="notice-status">加载中…</view>
      <view v-else-if="!items.length" class="notice-status">暂无系统通知</view>
      <view v-else-if="hasMore" class="notice-status" @click="loadMore">加载更多</view>
    </scroll-view>
  </view>
</template>
<script>
import ManifestIcon from '@/components/ManifestIcon.vue'
import { messageBus } from '@/utils/message-event-bus.js'
import { getUserNotifications, readUserNotifications, userNotificationUrl } from './utils/user-notifications.js'
export default {
  components: { ManifestIcon },
  data: () => ({ items: [], unreadCount: 0, loading: false, reading: false, opening: false, hasMore: true, error: '',
    statusBarHeight: 20, isDark: false, active: false, version: 0, account: '', listener: null, timer: null }),
  onLoad() { this.statusBarHeight = (uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()).statusBarHeight || 20 },
  onShow() {
    this.isDark = uni.getStorageSync('app_theme') === 'dark'; this.account = uni.getStorageSync('token') || ''; this.active = true
    if (!this.account) { uni.navigateTo({ url: '/pages/index/index' }); return }
    this.listener = () => { clearTimeout(this.timer); this.timer = setTimeout(() => { if (this.active) this.reload() }, 200) }
    messageBus.on('notification.changed', this.listener); messageBus.on('chat.reconnected', this.listener)
    this.reload()
  },
  onHide() { this.stop() },
  onUnload() { this.stop() },
  methods: {
    valid(version) { return this.active && version === this.version && this.account === (uni.getStorageSync('token') || '') },
    stop() {
      this.active = false; this.version++; clearTimeout(this.timer)
      if (this.listener) { messageBus.off('notification.changed', this.listener); messageBus.off('chat.reconnected', this.listener); this.listener = null }
    },
    goBack() { if (getCurrentPages().length > 1) uni.navigateBack(); else uni.reLaunch({ url: '/pages-nonTheme/chatlist' }) },
    timeLabel(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` },
    reload() { this.version++; this.items = []; this.loading = false; this.error = ''; this.hasMore = true; return this.loadMore() },
    async loadMore() {
      if (!this.active || !this.account || this.loading || !this.hasMore) return
      const version = this.version; this.loading = true
      try {
        const beforeId = this.items[this.items.length - 1]?.id
        const res = await getUserNotifications(beforeId ? { beforeId } : {})
        if (!this.valid(version)) return
        if (res?.code !== 0) throw new Error(res?.msg || '加载失败，点击重试')
        this.items.push(...(res.data?.items || [])); this.hasMore = Boolean(res.data?.hasMore)
        this.unreadCount = Number(res.data?.unreadCount || 0); this.error = ''
      } catch (e) { if (this.valid(version)) this.error = e.message || '加载失败，点击重试' }
      finally { if (version === this.version) this.loading = false }
    },
    async readAll() {
      if (this.reading || !this.items.length) return
      const version = this.version; this.reading = true
      try {
        const res = await readUserNotifications({ throughId: this.items[0].id })
        if (res?.code !== 0) throw new Error(res?.msg || '操作失败')
        if (this.valid(version)) { this.items.forEach(item => { item.readAt = new Date().toISOString() }); this.unreadCount = 0; messageBus.emit('notification.changed', {}) }
      } catch (e) { if (this.valid(version)) uni.showToast({ title: e.message || '操作失败', icon: 'none' }) }
      finally { this.reading = false }
    },
    async openOrder(item) {
      if (this.opening || !this.valid(this.version)) return
      const url = item.kind === 'provider_quota' ? '' : userNotificationUrl(item), account = this.account
      if (!url && item.kind !== 'provider_quota') return
      this.opening = true
      try {
        if (!item.readAt) {
          const res = await readUserNotifications({ ids: [item.id] })
          if (res?.code === 0 && this.active && account === (uni.getStorageSync('token') || '')) { item.readAt = new Date().toISOString(); messageBus.emit('notification.changed', {}) }
        }
      } catch (_) { /* The order remains available when marking as read fails. */ }
      if (url && this.active && this.account === account && account === (uni.getStorageSync('token') || '')) uni.navigateTo({ url })
      this.opening = false
    }
  }
}
</script>
<style scoped>
.notice-page { display: flex; flex-direction: column; height: 100vh; background: #f3f5f4; color: #25342e; }
.notice-header { flex: none; background: #16845b; color: #fff; }
.notice-nav { position: relative; display: flex; align-items: center; justify-content: center; height: 44px; font-size: 17px; font-weight: 600; }
.notice-back { position: absolute; left: 15px; display: flex; align-items: center; width: 40px; height: 44px; filter: brightness(0) invert(1); }
.notice-nav button { position: absolute; right: 15px; margin: 0; padding: 0 12rpx; font-size: 24rpx; line-height: 56rpx; color: #fff; background: transparent; }
.notice-nav button::after { border: none; }
.notice-nav button[disabled] { color: #ffffff80; }
.notice-list { flex: 1; height: 0; min-height: 0; }
.notice-card { margin: 20rpx; padding: 28rpx; border-radius: 16rpx; background: #fff; border-left: 5rpx solid transparent; }
.notice-card.unread { border-left-color: #16845b; }
.notice-title { display: flex; align-items: center; gap: 14rpx; font-size: 30rpx; font-weight: 600; }
.notice-dot { width: 12rpx; height: 12rpx; border-radius: 50%; background: #e34b4b; flex: none; }
.notice-content { display: block; margin: 20rpx 0; font-size: 27rpx; line-height: 1.7; overflow-wrap: anywhere; }
.notice-meta { display: flex; justify-content: space-between; gap: 20rpx; color: #7b8881; font-size: 23rpx; }
.notice-status { padding: 50rpx 24rpx; text-align: center; color: #7b8881; font-size: 27rpx; }
.dark { background: #101b16; color: #e5efe9; }
.dark .notice-header { background: #182c23; }
.dark .notice-card { background: #1c2d24; }
.dark .notice-meta, .dark .notice-status { color: #a0b4a7; }
</style>
