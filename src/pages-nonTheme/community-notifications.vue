<template>
  <view class="community-inbox" :class="{ 'dark-theme': isDarkTheme }">
    <view class="community-inbox-header" :style="{ paddingTop: statusBarHeight + 'px' }">
      <view class="community-inbox-nav">
        <view class="community-inbox-back" @click="goBack"><ManifestIcon id="back" class="community-inbox-back-icon" /></view>
        <text class="community-inbox-title">社区互动</text>
        <button :disabled="!items.length || !unreadCount || reading" @click="readAll">全部已读</button>
      </view>
    </view>
    <scroll-view class="community-inbox-list" scroll-y @scrolltolower="loadMore">
      <view v-for="item in displayItems" :key="item.id" class="community-inbox-item" :class="{ unread: !item.read }" @click="openPost(item)">
        <view class="community-inbox-line"><text class="community-inbox-actor">{{ getDisplayName(item.actor) }}{{ item.likeActors > 1 ? `等${item.likeActors}人` : '' }}</text><text>{{ actionLabel(item.kind) }}</text><text v-if="!item.read" class="community-inbox-dot"></text></view>
        <text v-if="item.content" class="community-inbox-content">{{ item.content }}</text>
        <text class="community-inbox-preview">{{ item.postPreview || '查看帖子' }}</text>
        <text class="community-inbox-time">{{ timeLabel(item.createdAt) }}</text>
      </view>
      <view v-if="error" class="community-inbox-status" @click="loadMore">{{ error }}</view>
      <view v-else-if="loading" class="community-inbox-status">加载中…</view>
      <view v-else-if="!items.length" class="community-inbox-status">暂无互动消息</view>
      <view v-else-if="hasMore" class="community-inbox-status" @click="loadMore">加载更多</view>
    </scroll-view>
  </view>
</template>
<script>
import ManifestIcon from '@/components/ManifestIcon.vue'
import { getDisplayName } from '@/utils/display-name.js'
import { messageBus } from '@/utils/message-event-bus.js'
import { communitySocialEnabled, getCommunityNotifications, readCommunityNotifications } from './utils/community-social.js'
export default {
  components: { ManifestIcon },
  data: () => ({ items: [], unreadCount: 0, loading: false, reading: false, opening: false, hasMore: true, error: '', enabled: false,
    statusBarHeight: 20, isDarkTheme: false, version: 0, active: false, listener: null, timer: null, account: '' }),
  computed: {
    displayItems() {
      const grouped = new Map(), rows = []
      for (const item of this.items) {
        if (item.kind !== 'like') { rows.push(item); continue }
        const key = String(item.postId), existing = grouped.get(key)
        if (existing) { existing.likeActors++; existing.read = existing.read && item.read }
        else { const row = { ...item, likeActors: 1 }; grouped.set(key, row); rows.push(row) }
      }
      return rows
    }
  },
  onLoad() { this.statusBarHeight = (uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()).statusBarHeight || 20 },
  async onShow() {
    this.isDarkTheme = uni.getStorageSync('app_theme') === 'dark'
    this.active = true; const version = ++this.version
    this.account = uni.getStorageSync('token') || ''
    this.items = []; this.loading = false; this.hasMore = true; this.error = ''
    if (!this.listener) {
      this.listener = () => {
        clearTimeout(this.timer)
        this.timer = setTimeout(() => { if (this.active) this.reload() }, 250)
      }
      messageBus.on('community.changed', this.listener)
      messageBus.on('chat.reconnected', this.listener)
    }
    this.enabled = await communitySocialEnabled(true)
    if (!this.active || version !== this.version) return
    if (!this.enabled) { this.error = '社区互动与聊天关联已关闭'; return }
    await this.loadMore()
  },
  onHide() { this.stop() },
  onUnload() { this.stop() },
  methods: {
    getDisplayName,
    stop() {
      this.active = false; this.version++; clearTimeout(this.timer)
      if (this.listener) { messageBus.off('community.changed', this.listener); messageBus.off('chat.reconnected', this.listener); this.listener = null }
    },
    goBack() { if (getCurrentPages().length > 1) uni.navigateBack(); else uni.reLaunch({ url: '/pages-nonTheme/chatlist' }) },
    actionLabel(kind) { return ({ like: '赞了你的帖子', comment: '评论了你的帖子', reply: '回复了你的评论' })[kind] || '与你互动' },
    timeLabel(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` },
    reload() { this.version++; this.items = []; this.hasMore = true; this.loading = false; return this.loadMore() },
    async loadMore() {
      if (!this.active || !this.enabled || this.loading || !this.hasMore) return
      this.loading = true; const version = this.version
      try {
        const res = await getCommunityNotifications({ beforeId: this.items[this.items.length - 1]?.id, limit: 20 })
        if (version !== this.version || this.account !== (uni.getStorageSync('token') || '')) return
        if (res?.code !== 0) throw new Error(res?.msg || '加载失败，点击重试')
        this.items.push(...(res.data?.items || [])); this.hasMore = Boolean(res.data?.hasMore)
        this.unreadCount = Number(res.data?.unreadCount || 0); this.error = ''
      } catch (e) { if (version === this.version) this.error = e.message || '加载失败，点击重试' }
      finally { if (version === this.version) this.loading = false }
    },
    async readAll() {
      if (this.reading || !this.items.length) return
      this.reading = true
      try {
        const res = await readCommunityNotifications(this.items[0].id)
        if (res?.code !== 0) throw new Error(res?.msg || '操作失败')
        if (this.active && this.account === (uni.getStorageSync('token') || '')) await this.reload()
      } catch (e) { uni.showToast({ title: e.message || '操作失败', icon: 'none' }) }
      finally { this.reading = false }
    },
    async openPost(item) {
      if (this.opening || this.account !== (uni.getStorageSync('token') || '')) return
      this.opening = true
      try { if (!item.read) await readCommunityNotifications(item.kind === 'like' ? { kind: 'like', postId: item.postId } : { ids: [item.id] }) } catch (_) { /* Reading the post is still available. */ }
      if (this.active && this.account === (uni.getStorageSync('token') || '')) uni.navigateTo({ url: `/pages-nonTheme/community-post?postId=${item.postId}&communityId=${item.communityId}&commentId=${item.commentId || ''}` })
      this.opening = false
    }
  }
}
</script>
<style scoped>
.community-inbox { display: flex; flex-direction: column; height: 100vh; background: #f3f5f4; color: #25342e; }
.community-inbox-header { flex: none; background: linear-gradient(135deg, #07c160 0%, #00a854 100%); box-shadow: 0 2px 12px rgba(0, 0, 0, .08); }
.dark-theme .community-inbox-header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); }
.community-inbox-nav { position: relative; display: flex; align-items: center; justify-content: center; height: 44px; padding: 0 15px; }
.community-inbox-back { position: absolute; left: 15px; top: 0; height: 100%; width: 40px; display: flex; align-items: center; }
.community-inbox-back-icon { filter: brightness(0) invert(1); }
.community-inbox-title { font-size: 17px; font-weight: 600; color: #fff; text-align: center; }
.dark-theme .community-inbox-title { color: #40e0ff; }
.community-inbox-header button { position: absolute; right: 15px; margin: 0; padding: 0 12rpx; font-size: 24rpx; line-height: 56rpx; color: #fff; background: rgba(255, 255, 255, .18); }
.community-inbox-header button[disabled] { color: rgba(255, 255, 255, .5); background: rgba(255, 255, 255, .1); }
.community-inbox-list { flex: 1; height: 0; min-height: 0; }
.community-inbox-item { margin: 16rpx 20rpx; padding: 26rpx; border-radius: 16rpx; background: #fff; }
.community-inbox-item.unread { border-left: 5rpx solid #16845b; }
.community-inbox-line { display: flex; align-items: center; gap: 10rpx; font-size: 26rpx; }
.community-inbox-actor { max-width: 260rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.community-inbox-dot { width: 12rpx; height: 12rpx; border-radius: 50%; background: #e34b4b; }
.community-inbox-content, .community-inbox-preview, .community-inbox-time { display: block; margin-top: 14rpx; font-size: 27rpx; overflow-wrap: anywhere; }
.community-inbox-preview { padding: 16rpx; border-radius: 8rpx; background: #f3f5f4; color: #7b8881; }
.community-inbox-time { color: #99a49d; font-size: 22rpx; }
.community-inbox-status { padding: 50rpx 24rpx; text-align: center; color: #7b8881; font-size: 27rpx; }
</style>
