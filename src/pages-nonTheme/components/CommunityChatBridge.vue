<template>
  <view v-if="author" class="community-connect-mask" @click="!busy && (author = null)">
    <view class="community-connect-card" @click.stop>
      <text class="community-connect-title">{{ getDisplayName(author) }}</text>
      <text class="community-connect-subtitle">{{ author.username ? `账号：${author.username}` : '社区成员' }}</text>
      <button class="community-connect-primary" :disabled="busy" @click="openChat">发消息</button>
      <button v-if="authorContactState === 'new'" :disabled="busy" @click="addFriend">添加好友</button>
      <text v-else-if="authorContactState === 'loading'" class="community-connect-subtitle">正在确认联系人…</text>
      <button v-else-if="authorContactState === 'error'" :disabled="busy" @click="loadAuthorContact(author)">确认失败，点击重试</button>
      <button :disabled="busy" @click="author = null">取消</button>
    </view>
  </view>
  <ChatSelectionDialog :open="!!post" title="分享帖子到" :items="items" :busy="busy" :loading="loading"
    :has-more="hasMore" remote-search @search="search" @load-more="loadMore" @close="closeShare" @confirm="confirmShare" />
</template>

<script>
import ChatSelectionDialog from './ChatSelectionDialog.vue'
import { getDisplayName } from '@/utils/display-name.js'
import { getChatUserList, getContactSettings, sendFriendRequest } from '@/pages-nonTheme/api/chat.js'
import { communitySocialEnabled, shareCommunityPost } from '../utils/community-social.js'

export default {
  components: { ChatSelectionDialog },
  data: () => ({ author: null, authorContactState: 'loading', post: null, items: [], busy: false, loading: false, hasMore: false,
    page: 0, keyword: '', version: 0, attempt: null, account: '', searchTimer: null }),
  beforeUnmount() { clearTimeout(this.searchTimer); this.version++ },
  methods: {
    getDisplayName,
    async allowed() {
      const enabled = await communitySocialEnabled(true)
      if (!enabled) uni.showToast({ title: '社区互动与聊天关联已关闭', icon: 'none' })
      return enabled
    },
    ownId() {
      const user = uni.getStorageSync('userInfo') || {}
      return user.id || user.userId || user.user?.id || user.data?.id
    },
    async openAuthor(value) {
      const version = ++this.version, account = uni.getStorageSync('token') || ''
      if (!value?.userId || !await this.allowed() || version !== this.version || account !== (uni.getStorageSync('token') || '')) return
      if (String(value.userId) === String(this.ownId())) return
      this.account = uni.getStorageSync('token') || ''
      this.post = null
      this.author = { ...value, id: value.userId, avatar: value.userAvatar || '' }
      await this.loadAuthorContact(this.author)
    },
    async loadAuthorContact(author) {
      if (!author) return
      const account = this.account
      this.authorContactState = 'loading'
      try {
        const res = await getContactSettings({ userId: author.id })
        if (author !== this.author || account !== (uni.getStorageSync('token') || '')) return
        if (res?.code !== 0 || typeof res.data?.isContact !== 'boolean') throw new Error('联系人状态暂不可用')
        this.authorContactState = res.data.isContact ? 'existing' : 'new'
      } catch (_) {
        if (author === this.author && account === (uni.getStorageSync('token') || '')) this.authorContactState = 'error'
      }
    },
    async openChat() {
      const selected = this.author
      if (this.busy || !selected || !await this.allowed() || selected !== this.author) return
      if (this.account !== (uni.getStorageSync('token') || '')) { this.author = null; return }
      const user = this.author
      this.author = null
      uni.navigateTo({ url: `/pages-nonTheme/chat?chatId=${user.id}&userId=${user.id}&title=${encodeURIComponent(getDisplayName(user))}&avatar=${encodeURIComponent(user.avatar)}` })
    },
    async addFriend() {
      const selected = this.author
      if (this.busy || this.authorContactState !== 'new' || !selected || !await this.allowed() || selected !== this.author) return
      if (this.account !== (uni.getStorageSync('token') || '')) { this.author = null; return }
      this.busy = true
      try {
        const res = await sendFriendRequest(this.author.id, '来自社区')
        if (res?.code !== 0) throw new Error(res?.msg || '申请失败')
        uni.showToast({ title: res.data?.status === 'accepted' ? '已是联系人' : res.data?.status === 'incoming' ? '对方已发来好友申请' : '好友申请已发送', icon: 'none' })
        this.author = null
      } catch (e) { uni.showToast({ title: e.message || '申请失败', icon: 'none' }) }
      finally { this.busy = false }
    },
    async share(value) {
      const version = ++this.version, account = uni.getStorageSync('token') || ''
      if (!value?.id || !await this.allowed() || version !== this.version || account !== (uni.getStorageSync('token') || '')) return
      this.author = null
      this.version++; this.post = value; this.items = []; this.page = 0; this.keyword = ''; this.attempt = null
      this.account = uni.getStorageSync('token') || ''
      this.loading = false
      await this.loadMore()
    },
    closeShare() { if (this.busy) return; this.post = null; this.version++; clearTimeout(this.searchTimer) },
    search(keyword) {
      clearTimeout(this.searchTimer); this.keyword = keyword; this.version++; this.items = []; this.page = 0; this.loading = false
      this.searchTimer = setTimeout(() => this.loadMore(), 250)
    },
    async loadMore() {
      if (!this.post || this.loading || (this.page && !this.hasMore)) return
      const version = this.version, page = this.page + 1
      this.loading = true
      try {
        const res = await getChatUserList({ page, pageSize: 30, keyword: this.keyword })
        if (version !== this.version || this.account !== (uni.getStorageSync('token') || '')) return
        if (res?.code !== 0) throw new Error(res?.msg || '加载失败')
        const data = res.data || {}, rows = Array.isArray(data) ? data : data.list || []
        this.items.push(...rows.map(row => ({ id: row.conversationType === 'group' ? `group:${row.groupId}` : String(row.otherId || row.id),
          label: row.note || row.name || getDisplayName(row), subtitle: row.conversationType === 'group' ? '群聊' : row.username || '私聊' })))
        this.page = page; this.hasMore = typeof data.hasMore === 'boolean' ? data.hasMore : rows.length === 30
      } catch (e) { if (version === this.version) uni.showToast({ title: e.message || '加载会话失败', icon: 'none' }) }
      finally { if (version === this.version) this.loading = false }
    },
    async confirmShare(selected) {
      const post = this.post, version = this.version
      if (this.busy || !post || !selected[0] || !await this.allowed() || post !== this.post || version !== this.version) return
      if (this.account !== (uni.getStorageSync('token') || '')) { this.closeShare(); return }
      const target = String(selected[0]), group = target.startsWith('group:')
      if (!this.attempt || this.attempt.target !== target) this.attempt = { target, key: `post_${Date.now()}_${Math.random().toString(36).slice(2, 12)}` }
      this.busy = true
      try {
        const res = await shareCommunityPost(post.id, { conversationType: group ? 'group' : 'direct', targetId: group ? target.slice(6) : target, clientMessageId: this.attempt.key })
        if (res?.code !== 0) throw new Error(res?.msg || '分享失败')
        this.$emit('shared', this.post.id); this.post = null; this.version++
        uni.showToast({ title: '已分享到聊天', icon: 'success' })
      } catch (e) { uni.showToast({ title: e.message || '分享失败，请重试', icon: 'none' }) }
      finally { this.busy = false }
    }
  }
}
</script>

<style scoped>
.community-connect-mask { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 10002; padding: 40rpx; background: #0006; display: flex; align-items: center; justify-content: center; }
.community-connect-card { width: 100%; max-width: 520rpx; padding: 36rpx; border-radius: 20rpx; background: #fff; color: #25342e; }
.community-connect-title, .community-connect-subtitle { display: block; overflow-wrap: anywhere; }
.community-connect-title { font-size: 34rpx; font-weight: 600; }
.community-connect-subtitle { margin: 12rpx 0 28rpx; font-size: 25rpx; color: #7b8881; }
.community-connect-card button { margin-top: 16rpx; font-size: 28rpx; background: #f1f4f2; }
.community-connect-card .community-connect-primary { background: #16845b; color: #fff; }
</style>
