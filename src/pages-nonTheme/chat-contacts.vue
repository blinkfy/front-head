<template>
  <view class="contacts-page">
    <view class="contacts-header" :style="{ paddingTop: `${statusBarHeight}px` }">
      <view class="header-row">
        <view class="icon-button" @click="goBack"><ManifestIcon id="back" :scale="1.1" /></view>
        <text class="header-title">联系人</text>
      <view class="icon-button" @click="refreshAll"><ManifestIcon class="refresh-contact-icon" id="refresh" :scale="1.1" /></view>
      </view>
      <view class="contact-tabs">
        <view v-for="tab in tabs" :key="tab.key" class="contact-tab"
          :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">
          <ManifestIcon :id="tab.icon" size="30rpx" /><text>{{ tab.label }}</text>
          <view v-if="tab.key === 'requests' && pendingRequestCount" class="request-dot">{{ pendingRequestCount }}</view>
        </view>
      </view>
    </view>

    <scroll-view class="contacts-scroll" scroll-y>
      <view v-if="loading" class="loading-state"><text>正在加载...</text></view>

      <template v-else-if="activeTab === 'friends'">
        <view v-if="friends.length" class="contact-list">
          <view v-for="friend in friends" :key="friend.id" class="contact-row" @click="openDirectChat(friend)">
            <image class="contact-avatar" :src="avatarFor(friend)" mode="aspectFill" />
            <view class="contact-copy">
              <text class="contact-name">{{ friend.note || getDisplayName(friend) }}</text>
              <view class="contact-meta">
                <text class="relationship-tag" :class="relationshipClass(friend.relationship)">{{ relationshipLabel(friend.relationship) }}</text>
                <text class="contact-username">用户名：{{ friend.username }}</text>
              </view>
            </view>
            <ManifestIcon class="contact-chevron" id="chevron_right" :scale="1" />
          </view>
        </view>
        <view v-else class="empty-state"><ManifestIcon class="empty-icon" id="contacts" :scale="1" /><text>还没有联系人，去搜索添加吧</text></view>
      </template>

      <template v-else-if="activeTab === 'requests'">
        <view class="section-title">新的朋友</view>
        <view v-if="incomingRequests.length" class="contact-list">
          <view v-for="request in incomingRequests" :key="request.id" class="request-row">
            <image class="contact-avatar" :src="avatarFor(request.user)" mode="aspectFill" />
            <view class="contact-copy">
              <text class="contact-name">{{ getDisplayName(request.user) }}</text>
              <text class="contact-subtitle">{{ request.message || '请求添加你为好友' }}</text>
            </view>
            <view v-if="request.status === 'pending'" class="request-actions">
              <button class="small-btn ghost" :disabled="request.busy" @click.stop="handleFriendRequest(request, 'reject')">拒绝</button>
              <button class="small-btn primary" :disabled="request.busy" @click.stop="handleFriendRequest(request, 'accept')">同意</button>
            </view>
            <text v-else class="request-status">{{ requestStatusLabel(request.status) }}</text>
          </view>
        </view>
        <view v-else class="compact-empty">暂无新的好友申请</view>

        <view class="section-title">我发送的申请</view>
        <view v-if="outgoingRequests.length" class="contact-list">
          <view v-for="request in outgoingRequests" :key="request.id" class="request-row">
            <image class="contact-avatar" :src="avatarFor(request.user)" mode="aspectFill" />
            <view class="contact-copy">
              <text class="contact-name">{{ getDisplayName(request.user) }}</text>
              <text class="contact-subtitle">{{ request.message || '好友申请' }}</text>
            </view>
            <text class="request-status">{{ requestStatusLabel(request.status) }}</text>
          </view>
        </view>
        <view v-else class="compact-empty">暂无已发送的申请</view>
      </template>

      <template v-else-if="activeTab === 'find'">
        <view class="search-card">
          <input v-model="searchKeyword" class="user-search-input" placeholder="搜索昵称、用户名或用户ID" confirm-type="search" @confirm="searchUsers" />
          <button class="search-button" :loading="searching" @click="searchUsers">搜索</button>
        </view>
        <view v-if="searchResults.length" class="contact-list search-results">
          <view v-for="user in searchResults" :key="user.id" class="request-row">
            <image class="contact-avatar" :src="avatarFor(user)" mode="aspectFill" />
            <view class="contact-copy">
              <text class="contact-name">{{ getDisplayName(user) }}</text>
              <text class="contact-subtitle">{{ user.bio || `ID: ${user.id}` }}</text>
            </view>
            <text v-if="user.isFriend" class="request-status">已是联系人</text>
            <text v-else-if="user.requestStatus === 'pending'" class="request-status">已申请</text>
            <button v-else-if="user.requestStatus === 'incoming'" class="small-btn ghost" @click.stop="activeTab = 'requests'">待处理</button>
            <button v-else class="small-btn primary" :disabled="pendingFriendIds.includes(String(user.id))" :loading="pendingFriendIds.includes(String(user.id))" @click.stop="requestFriend(user)"><ManifestIcon id="chat_member_invite" size="26rpx" /> 添加</button>
          </view>
        </view>
        <view v-if="searchError" class="compact-empty">{{ searchError }}</view>
        <button v-if="searchHasMore" class="search-load-more" :loading="searching" :disabled="searching" @click="loadMoreUsers">加载更多</button>
        <view v-else-if="searching && !searchResults.length" class="compact-empty">正在搜索...</view>
        <view v-else-if="hasSearched && !searchResults.length && !searchError" class="compact-empty">没有找到匹配的用户</view>
      </template>

      <template v-else>
        <view class="create-group-card">
          <view class="card-title"><ManifestIcon id="chat_group_create" size="36rpx" /> 创建群聊</view>
          <input v-model="groupName" class="group-name-input" placeholder="填写群名称" maxlength="60" />
          <text class="select-tip">选择联系人加入群聊</text>
          <view v-if="groupContactCandidates.length" class="member-picker">
            <view v-for="friend in groupContactCandidates" :key="friend.id" class="picker-member" @click="toggleSelectedFriend(friend.id)">
              <image class="picker-avatar" :src="avatarFor(friend)" mode="aspectFill" />
              <text class="picker-name">{{ friend.note || getDisplayName(friend) }}</text>
              <view class="member-check" :class="{ selected: selectedFriendIds.includes(friend.id) }"><ManifestIcon v-if="selectedFriendIds.includes(friend.id)" id="confirm" :scale="1" /></view>
            </view>
          </view>
          <view v-else class="compact-empty">暂无可邀请的联系人</view>
          <button class="create-group-button" :loading="creatingGroup" :disabled="creatingGroup" @click="createNewGroup">创建群聊</button>
        </view>

        <view class="section-title">我加入的群聊</view>
        <view v-if="groups.length" class="contact-list">
          <view v-for="group in groups" :key="group.id" class="contact-row" @click="openGroupChat(group)">
            <image class="contact-avatar" :src="avatarFor(group)" mode="aspectFill" />
            <view class="contact-copy">
              <text class="contact-name">{{ group.name }}</text>
              <text class="contact-subtitle">{{ group.memberCount || 1 }} 位成员{{ group.latestContent ? ` · ${formatGroupMessage(group.latestContent)}` : '' }}</text>
            </view>
            <ManifestIcon class="contact-chevron" id="chevron_right" :scale="1" />
          </view>
        </view>
        <view v-else class="compact-empty">暂无群聊</view>
      </template>
    </scroll-view>
  </view>
</template>

<script>
import * as chatApi from '@/pages-nonTheme/api/chat'
import { baseUrl } from '@/api/settings'
import { getAvatarUrl } from '@/utils/avatar-handler.js'
import ManifestIcon from '@/components/ManifestIcon.vue'
import { getDisplayName } from '@/utils/display-name.js'

export default {
  components: { ManifestIcon },
  data() {
    return {
      statusBarHeight: 20,
      activeTab: 'friends',
      tabs: [
        { key: 'friends', label: '联系人', icon: 'contacts' },
        { key: 'requests', label: '新朋友', icon: 'chat_friend_request' },
        { key: 'find', label: '找人', icon: 'search' },
        { key: 'groups', label: '群聊', icon: 'chat_group_create' }
      ],
      loading: false,
      searching: false,
      creatingGroup: false,
      friends: [],
      incomingRequests: [],
      outgoingRequests: [],
      groups: [],
      searchKeyword: '',
      searchResults: [],
      searchHasMore: false,
      searchCursor: null,
      searchVersion: 0,
      activeSearchKeyword: '',
      searchError: '',
      pendingFriendIds: [],
      hasSearched: false,
      groupName: '',
      selectedFriendIds: [],
      communityChatEnabled: true,
      accessDenied: false
    }
  },
  computed: {
    pendingRequestCount() {
      return this.incomingRequests.filter((item) => item.status === 'pending').length
    },
    groupContactCandidates() {
      return this.friends
    }
  },
  onLoad() {
    const systemInfo = uni.getSystemInfoSync()
    this.statusBarHeight = systemInfo.statusBarHeight || 20
  },
  onShow() {
    this.ensureCommunityChatAvailable().then((enabled) => {
      if (enabled) this.refreshAll()
    })
  },
  onHide() { this.searchVersion++; this.searching = false },
  onUnload() { this.searchVersion++; this.searching = false },
  methods: {
    getDisplayName,
    async ensureCommunityChatAvailable() {
      try {
        const response = await new Promise((resolve, reject) => {
          uni.request({
            url: `${baseUrl}/api/ai/settings`,
            success: resolve,
            fail: reject
          })
        })
        const payload = response?.data
        const settings = payload && payload.code === 0 ? payload.data : null
        if (settings && settings.communityChatEnabled === false) {
          this.communityChatEnabled = false
          this.loading = false
          if (!this.accessDenied) {
            this.accessDenied = true
            uni.navigateBack({
              fail: () => uni.reLaunch({ url: '/pages-nonTheme/chatlist' })
            })
          }
          return false
        }
      } catch (error) {
        console.warn('[chat-contacts] check community chat settings failed:', error)
      }
      this.communityChatEnabled = true
      this.accessDenied = false
      return true
    },
    async refreshAll() {
      this.loading = true
      try {
        const [friendsResult, incomingResult, outgoingResult, groupsResult] = await Promise.all([
          chatApi.getFriends(),
          chatApi.getFriendRequests('incoming'),
          chatApi.getFriendRequests('outgoing'),
          chatApi.getGroups()
        ])
        this.friends = friendsResult.data?.list || []
        const contactIds = new Set(this.groupContactCandidates.map((item) => item.id))
        this.selectedFriendIds = this.selectedFriendIds.filter((id) => contactIds.has(id))
        this.incomingRequests = incomingResult.data?.list || []
        this.outgoingRequests = outgoingResult.data?.list || []
        this.groups = groupsResult.data?.list || []
      } catch (error) {
        console.error('加载联系人失败:', error)
      } finally {
        this.loading = false
      }
    },
    async searchUsers(reset = true) {
      const fresh = reset !== false
      if (!fresh && (this.searching || !this.searchHasMore)) return
      const keyword = fresh ? this.searchKeyword.trim() : this.activeSearchKeyword
      if (!keyword) {
        uni.showToast({ title: '请输入昵称、用户名或用户ID', icon: 'none' })
        return
      }
      const version = fresh ? ++this.searchVersion : this.searchVersion
      if (fresh) {
        this.activeSearchKeyword = keyword
        this.searchResults = []
        this.searchCursor = null
        this.searchHasMore = false
      }
      const cursor = this.searchCursor
      this.searching = true
      this.searchError = ''
      this.hasSearched = true
      try {
        const result = await chatApi.searchChatUsers(keyword, { cursor: fresh ? null : cursor, pageSize: 20 })
        if (version !== this.searchVersion) return
        const rows = result.data?.list || []
        const combined = fresh ? rows : [...this.searchResults, ...rows]
        this.searchResults = [...new Map(combined.map(user => [String(user.id), user])).values()]
        this.searchCursor = result.data?.nextCursor ?? null
        this.searchHasMore = !!result.data?.hasMore && this.searchCursor != null && String(this.searchCursor) !== String(cursor)
      } catch (error) {
        if (version === this.searchVersion) this.searchError = fresh ? '搜索失败，请重试' : '加载失败，可再次点击加载更多'
      } finally {
        if (version === this.searchVersion) this.searching = false
      }
    },
    loadMoreUsers() { return this.searchUsers(false) },
    async requestFriend(user) {
      const id = String(user.id)
      if (user.isFriend || this.pendingFriendIds.includes(id)) return
      this.pendingFriendIds.push(id)
      try {
        const result = await new Promise(resolve => uni.showModal({ title: `添加 ${getDisplayName(user)}`, editable: true,
          placeholderText: '输入申请说明（可选）', success: resolve, fail: () => resolve({ confirm: false }) }))
        if (!result.confirm) return
        const response = await chatApi.sendFriendRequest(user.id, result.content || '')
        const status = response.data?.status || 'pending'
        user.isFriend = status === 'accepted'
        user.requestStatus = status === 'incoming' ? 'incoming' : status === 'accepted' ? '' : 'pending'
        if (status === 'incoming') this.activeTab = 'requests'
        uni.showToast({ title: status === 'incoming' ? '对方已申请添加你，请在新朋友中处理' : status === 'accepted' ? '已是联系人' : '好友申请已发送', icon: status === 'incoming' ? 'none' : 'success' })
        await this.refreshAll()
      } catch (error) { console.error('发送好友申请失败:', error) }
      finally { this.pendingFriendIds = this.pendingFriendIds.filter(value => value !== id) }
    },
    async handleFriendRequest(request, action) {
      if (request.busy || request.status !== 'pending') return
      request.busy = true
      try {
        await chatApi.respondToFriendRequest(request.id, action)
        request.status = action === 'accept' ? 'accepted' : 'rejected'
        const userId = request.user?.id || request.fromUserId
        const found = this.searchResults.find(user => String(user.id) === String(userId))
        if (found) { found.isFriend = action === 'accept'; found.requestStatus = '' }
        if (action === 'accept') await this.refreshAll()
        uni.showToast({ title: action === 'accept' ? '已添加好友' : '已拒绝申请', icon: 'success' })
      } catch (error) {
        console.error('处理好友申请失败:', error)
      } finally { request.busy = false }
    },
    toggleSelectedFriend(friendId) {
      const index = this.selectedFriendIds.indexOf(friendId)
      if (index === -1) this.selectedFriendIds.push(friendId)
      else this.selectedFriendIds.splice(index, 1)
    },
    async createNewGroup() {
      if (this.creatingGroup) return
      const name = this.groupName.trim()
      if (!name) {
        uni.showToast({ title: '请填写群名称', icon: 'none' })
        return
      }
      this.creatingGroup = true
      try {
        const result = await chatApi.createGroup({ name, memberIds: this.selectedFriendIds })
        this.groupName = ''
        this.selectedFriendIds = []
        await this.refreshAll()
        uni.showToast({ title: '群聊已创建', icon: 'success' })
        const group = result.data?.group
        if (group) this.openGroupChat(group)
      } catch (error) {
        console.error('创建群聊失败:', error)
      } finally {
        this.creatingGroup = false
      }
    },
    openDirectChat(friend) {
      uni.navigateTo({
        url: `/pages-nonTheme/chat?chatId=${friend.id}&userId=${friend.id}&title=${encodeURIComponent(friend.note || getDisplayName(friend))}&avatar=${encodeURIComponent(friend.avatar || '')}`
      })
    },
    openGroupChat(group) {
      uni.navigateTo({
        url: `/pages-nonTheme/chat?conversationType=group&groupId=${encodeURIComponent(group.id)}&chatId=group:${encodeURIComponent(group.id)}&title=${encodeURIComponent(group.name)}&avatar=${encodeURIComponent(group.avatar || '')}`
      })
    },
    requestStatusLabel(status) {
      return ({ pending: '等待验证', accepted: '已通过', rejected: '已拒绝', cancelled: '已取消' })[status] || '已处理'
    },
    relationshipLabel(relationship) {
      return ({ friend: '好友', customer_s: '客服', customer_c: '客户', stranger: '陌生人' })[relationship] || '联系人'
    },
    relationshipClass(relationship) {
      return `relationship-${relationship || 'stranger'}`
    },
    formatGroupMessage(message) {
      if (!message) return ''
      if (message.type === 'text') return String(message.content || '').slice(0, 24)
      return ({ image: '[图片]', voice: '[语音]', video: '[视频]', file: '[文件]', location: '[位置]' })[message.type] || '[消息]'
    },
    avatarFor(item) {
      const avatar = item?.avatar || ''
      if (avatar && typeof avatar === 'string' && !avatar.includes('default-avatar')) return getAvatarUrl(avatar, baseUrl)
      const name = item?.name || item?.note || getDisplayName(item, '群')
      return `https://ui-avatars.com/api/?name=${encodeURIComponent(name.slice(0, 1))}&background=0f9d74&color=fff&size=120`
    },
    goBack() {
      uni.navigateBack()
    }
  }
}
</script>

<style lang="scss" scoped>
.contacts-page {
  min-height: 100vh;
  background: #f5f7f8;
  color: #1f2937;
}

.contacts-header {
  position: sticky;
  top: 0;
  z-index: 5;
  background: #ffffff;
  border-bottom: 1rpx solid #e8ecec;
}

.header-row {
  height: 88rpx;
  padding: 0 24rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-title { font-size: 34rpx; font-weight: 700; }
.icon-button { width: 80rpx; height: 80rpx; display: flex; align-items: center; justify-content: center; font-size: 44rpx; color: #365260; }
.refresh-contact-icon { transform: scale(0.72); }
.contact-tabs { display: flex; padding: 0 18rpx; }
.contact-tab { gap: 8rpx; position: relative; flex: 1; height: 70rpx; display: flex; align-items: center; justify-content: center; font-size: 26rpx; color: #7a8790; }
.contact-tab.active { color: #068a68; font-weight: 700; }
.contact-tab.active::after { content: ''; position: absolute; bottom: 0; width: 48rpx; height: 6rpx; border-radius: 6rpx; background: #0aa77a; }
.request-dot { min-width: 28rpx; height: 28rpx; padding: 0 6rpx; margin-left: 6rpx; border-radius: 14rpx; background: #ef4444; color: #fff; font-size: 18rpx; line-height: 28rpx; text-align: center; }

.contacts-scroll { height: calc(100vh - 160rpx - env(safe-area-inset-top)); box-sizing: border-box; padding: 20rpx 24rpx calc(32rpx + env(safe-area-inset-bottom)); }
.loading-state, .empty-state, .compact-empty { color: #94a3b8; text-align: center; }
.loading-state { padding: 110rpx 0; }
.empty-state { display: flex; flex-direction: column; align-items: center; gap: 16rpx; padding: 120rpx 0; font-size: 28rpx; }
.empty-icon { font-size: 80rpx; }
.compact-empty { padding: 28rpx 0 42rpx; font-size: 25rpx; }
.section-title { padding: 22rpx 6rpx 14rpx; color: #64748b; font-size: 24rpx; font-weight: 600; }

.contact-list, .create-group-card, .search-card { background: #fff; border: 1rpx solid #e8eeee; border-radius: 12rpx; overflow: hidden; }
.contact-row, .request-row { min-height: 108rpx; padding: 16rpx 20rpx; display: flex; align-items: center; gap: 18rpx; border-bottom: 1rpx solid #eef2f2; }
.contact-row:last-child, .request-row:last-child { border-bottom: 0; }
.contact-avatar { width: 72rpx; height: 72rpx; border-radius: 12rpx; background: #e4eceb; flex-shrink: 0; }
.contact-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8rpx; }
.contact-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 29rpx; font-weight: 600; color: #24313d; }
.contact-subtitle { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 23rpx; color: #8996a2; }
.contact-meta { min-width: 0; display: flex; align-items: center; gap: 10rpx; overflow: hidden; }
.relationship-tag { flex-shrink: 0; padding: 2rpx 10rpx; border-radius: 6rpx; font-size: 21rpx; line-height: 30rpx; }
.relationship-friend { background: #e6f7f0; color: #05835f; }
.relationship-customer_s { background: #e8f2ff; color: #2877bb; }
.relationship-customer_c { background: #fff2df; color: #b76a13; }
.relationship-stranger { background: #f0f3f5; color: #73808a; }
.contact-username { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 23rpx; color: #8996a2; }
.contact-chevron { font-size: 38rpx; color: #aab5bc; }
.request-actions { display: flex; gap: 12rpx; }
.small-btn { margin: 0; min-width: 94rpx; height: 54rpx; padding: 0 16rpx; border-radius: 8rpx; font-size: 23rpx; line-height: 54rpx; }
.small-btn::after { border: 0; }
.small-btn.primary { background: #16845b; color: #fff; }
.small-btn.ghost { background: #edf5f3; color: #4b6470; }
.request-status { color: #8b98a2; font-size: 23rpx; white-space: nowrap; }

.search-card { display: flex; gap: 14rpx; padding: 16rpx; }
.user-search-input, .group-name-input { flex: 1; height: 70rpx; box-sizing: border-box; padding: 0 18rpx; border: 1rpx solid #d9e3e1; border-radius: 8rpx; font-size: 26rpx; background: #fbfdfc; }
.search-button { width: 116rpx; height: 70rpx; margin: 0; border: 0; border-radius: 8rpx; background: #16845b; color: #fff; font-size: 26rpx; line-height: 70rpx; }
.search-button::after, .create-group-button::after { border: 0; }
.search-results { margin-top: 18rpx; }
.search-load-more { margin: 24rpx auto; color: #0a8965; font-size: 26rpx; }

.create-group-card { padding: 24rpx; }
.card-title { display: block; margin-bottom: 18rpx; font-size: 30rpx; font-weight: 700; }
.select-tip { display: block; margin: 24rpx 0 12rpx; color: #687783; font-size: 24rpx; }
.member-picker { max-height: 420rpx; overflow-y: auto; border-top: 1rpx solid #eef2f2; }
.picker-member { min-height: 82rpx; display: flex; align-items: center; gap: 14rpx; border-bottom: 1rpx solid #eef2f2; }
.picker-avatar { width: 54rpx; height: 54rpx; border-radius: 10rpx; }
.picker-name { flex: 1; font-size: 26rpx; }
.member-check { width: 32rpx; height: 32rpx; border: 2rpx solid #cbd5d9; border-radius: 50%; color: #fff; font-size: 22rpx; text-align: center; line-height: 30rpx; }
.member-check.selected { background: #0aa77a; border-color: #0aa77a; }
.create-group-button { margin-top: 26rpx; height: 78rpx; border-radius: 8rpx; background: #16845b; color: #fff; font-size: 28rpx; line-height: 78rpx; }
</style>
