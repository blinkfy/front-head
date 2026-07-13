<template>
  <view class="contacts-page">
    <view class="contacts-header" :style="{ paddingTop: `${statusBarHeight}px` }">
      <view class="header-row">
        <view class="icon-button" @click="goBack"><text>‹</text></view>
        <text class="header-title">联系人</text>
        <view class="icon-button" @click="refreshAll"><text>↻</text></view>
      </view>
      <view class="contact-tabs">
        <view v-for="tab in tabs" :key="tab.key" class="contact-tab"
          :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">
          <text>{{ tab.label }}</text>
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
              <text class="contact-name">{{ friend.note || friend.username }}</text>
              <view class="contact-meta">
                <text class="relationship-tag" :class="relationshipClass(friend.relationship)">{{ relationshipLabel(friend.relationship) }}</text>
                <text class="contact-username">用户名：{{ friend.username }}</text>
              </view>
            </view>
            <text class="contact-chevron">›</text>
          </view>
        </view>
        <view v-else class="empty-state"><text class="empty-icon">👥</text><text>还没有联系人，去搜索添加吧</text></view>
      </template>

      <template v-else-if="activeTab === 'requests'">
        <view class="section-title">新的朋友</view>
        <view v-if="incomingRequests.length" class="contact-list">
          <view v-for="request in incomingRequests" :key="request.id" class="request-row">
            <image class="contact-avatar" :src="avatarFor(request.user)" mode="aspectFill" />
            <view class="contact-copy">
              <text class="contact-name">{{ request.user?.username || '用户' }}</text>
              <text class="contact-subtitle">{{ request.message || '请求添加你为好友' }}</text>
            </view>
            <view v-if="request.status === 'pending'" class="request-actions">
              <button class="small-btn ghost" @click.stop="handleFriendRequest(request, 'reject')">拒绝</button>
              <button class="small-btn primary" @click.stop="handleFriendRequest(request, 'accept')">同意</button>
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
              <text class="contact-name">{{ request.user?.username || '用户' }}</text>
              <text class="contact-subtitle">{{ request.message || '好友申请' }}</text>
            </view>
            <text class="request-status">{{ requestStatusLabel(request.status) }}</text>
          </view>
        </view>
        <view v-else class="compact-empty">暂无已发送的申请</view>
      </template>

      <template v-else-if="activeTab === 'find'">
        <view class="search-card">
          <input v-model="searchKeyword" class="user-search-input" placeholder="输入用户名搜索用户" confirm-type="search" @confirm="searchUsers" />
          <button class="search-button" :loading="searching" @click="searchUsers">搜索</button>
        </view>
        <view v-if="searchResults.length" class="contact-list search-results">
          <view v-for="user in searchResults" :key="user.id" class="request-row">
            <image class="contact-avatar" :src="avatarFor(user)" mode="aspectFill" />
            <view class="contact-copy">
              <text class="contact-name">{{ user.username }}</text>
              <text class="contact-subtitle">{{ user.bio || `ID: ${user.id}` }}</text>
            </view>
            <text v-if="user.isFriend" class="request-status">已是好友</text>
            <text v-else-if="user.requestStatus === 'pending'" class="request-status">已申请</text>
            <button v-else-if="user.requestStatus === 'incoming'" class="small-btn ghost" @click.stop="activeTab = 'requests'">待处理</button>
            <button v-else class="small-btn primary" @click.stop="requestFriend(user)">添加</button>
          </view>
        </view>
        <view v-else-if="hasSearched" class="compact-empty">没有找到匹配的用户</view>
      </template>

      <template v-else>
        <view class="create-group-card">
          <text class="card-title">创建群聊</text>
          <input v-model="groupName" class="group-name-input" placeholder="填写群名称" maxlength="60" />
          <text class="select-tip">选择联系人加入群聊</text>
          <view v-if="groupContactCandidates.length" class="member-picker">
            <view v-for="friend in groupContactCandidates" :key="friend.id" class="picker-member" @click="toggleSelectedFriend(friend.id)">
              <image class="picker-avatar" :src="avatarFor(friend)" mode="aspectFill" />
              <text class="picker-name">{{ friend.note || friend.username }}</text>
              <view class="member-check" :class="{ selected: selectedFriendIds.includes(friend.id) }"><text v-if="selectedFriendIds.includes(friend.id)">✓</text></view>
            </view>
          </view>
          <view v-else class="compact-empty">暂无可邀请的联系人</view>
          <button class="create-group-button" :loading="creatingGroup" @click="createNewGroup">创建群聊</button>
        </view>

        <view class="section-title">我加入的群聊</view>
        <view v-if="groups.length" class="contact-list">
          <view v-for="group in groups" :key="group.id" class="contact-row" @click="openGroupChat(group)">
            <image class="contact-avatar" :src="avatarFor(group)" mode="aspectFill" />
            <view class="contact-copy">
              <text class="contact-name">{{ group.name }}</text>
              <text class="contact-subtitle">{{ group.memberCount || 1 }} 位成员{{ group.latestContent ? ` · ${formatGroupMessage(group.latestContent)}` : '' }}</text>
            </view>
            <text class="contact-chevron">›</text>
          </view>
        </view>
        <view v-else class="compact-empty">暂无群聊</view>
      </template>
    </scroll-view>
  </view>
</template>

<script>
import * as chatApi from '@/api/chat'
import { baseUrl } from '@/api/settings'
import { getAvatarUrl } from '@/utils/avatar-handler.js'

export default {
  data() {
    return {
      statusBarHeight: 20,
      activeTab: 'friends',
      tabs: [
        { key: 'friends', label: '联系人' },
        { key: 'requests', label: '新朋友' },
        { key: 'find', label: '找人' },
        { key: 'groups', label: '群聊' }
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
      hasSearched: false,
      groupName: '',
      selectedFriendIds: [],
      aiEnabled: true,
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
    this.ensureAiAvailable().then((enabled) => {
      if (enabled) this.refreshAll()
    })
  },
  methods: {
    async ensureAiAvailable() {
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
        if (settings && settings.aiEnabled === false) {
          this.aiEnabled = false
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
        console.warn('[chat-contacts] check AI settings failed:', error)
      }
      this.aiEnabled = true
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
    async searchUsers() {
      const keyword = this.searchKeyword.trim()
      if (!keyword) {
        uni.showToast({ title: '请输入用户名', icon: 'none' })
        return
      }
      this.searching = true
      this.hasSearched = true
      try {
        const result = await chatApi.searchChatUsers(keyword)
        this.searchResults = result.data?.list || []
      } catch (error) {
        console.error('搜索用户失败:', error)
      } finally {
        this.searching = false
      }
    },
    requestFriend(user) {
      uni.showModal({
        title: `添加 ${user.username}`,
        editable: true,
        placeholderText: '输入申请说明（可选）',
        success: async (result) => {
          if (!result.confirm) return
          try {
            await chatApi.sendFriendRequest(user.id, result.content || '')
            user.requestStatus = 'pending'
            uni.showToast({ title: '好友申请已发送', icon: 'success' })
            this.refreshAll()
          } catch (error) {
            console.error('发送好友申请失败:', error)
          }
        }
      })
    },
    async handleFriendRequest(request, action) {
      try {
        await chatApi.respondToFriendRequest(request.id, action)
        request.status = action === 'accept' ? 'accepted' : 'rejected'
        if (action === 'accept') await this.refreshAll()
        uni.showToast({ title: action === 'accept' ? '已添加好友' : '已拒绝申请', icon: 'success' })
      } catch (error) {
        console.error('处理好友申请失败:', error)
      }
    },
    toggleSelectedFriend(friendId) {
      const index = this.selectedFriendIds.indexOf(friendId)
      if (index === -1) this.selectedFriendIds.push(friendId)
      else this.selectedFriendIds.splice(index, 1)
    },
    async createNewGroup() {
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
        url: `/pages-nonTheme/chat?chatId=${friend.id}&userId=${friend.id}&title=${encodeURIComponent(friend.note || friend.username)}&avatar=${encodeURIComponent(friend.avatar || '')}`
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
      const name = item?.name || item?.note || item?.username || '群'
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
.icon-button { width: 56rpx; height: 56rpx; display: flex; align-items: center; justify-content: center; font-size: 44rpx; color: #365260; }
.contact-tabs { display: flex; padding: 0 18rpx; }
.contact-tab { position: relative; flex: 1; height: 70rpx; display: flex; align-items: center; justify-content: center; font-size: 26rpx; color: #7a8790; }
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
.small-btn.primary { background: #0aa77a; color: #fff; }
.small-btn.ghost { background: #edf5f3; color: #4b6470; }
.request-status { color: #8b98a2; font-size: 23rpx; white-space: nowrap; }

.search-card { display: flex; gap: 14rpx; padding: 16rpx; }
.user-search-input, .group-name-input { flex: 1; height: 70rpx; box-sizing: border-box; padding: 0 18rpx; border: 1rpx solid #d9e3e1; border-radius: 8rpx; font-size: 26rpx; background: #fbfdfc; }
.search-button { width: 116rpx; height: 70rpx; margin: 0; border: 0; border-radius: 8rpx; background: #0aa77a; color: #fff; font-size: 26rpx; line-height: 70rpx; }
.search-button::after, .create-group-button::after { border: 0; }
.search-results { margin-top: 18rpx; }

.create-group-card { padding: 24rpx; }
.card-title { display: block; margin-bottom: 18rpx; font-size: 30rpx; font-weight: 700; }
.select-tip { display: block; margin: 24rpx 0 12rpx; color: #687783; font-size: 24rpx; }
.member-picker { max-height: 420rpx; overflow-y: auto; border-top: 1rpx solid #eef2f2; }
.picker-member { min-height: 82rpx; display: flex; align-items: center; gap: 14rpx; border-bottom: 1rpx solid #eef2f2; }
.picker-avatar { width: 54rpx; height: 54rpx; border-radius: 10rpx; }
.picker-name { flex: 1; font-size: 26rpx; }
.member-check { width: 32rpx; height: 32rpx; border: 2rpx solid #cbd5d9; border-radius: 50%; color: #fff; font-size: 22rpx; text-align: center; line-height: 30rpx; }
.member-check.selected { background: #0aa77a; border-color: #0aa77a; }
.create-group-button { margin-top: 26rpx; height: 78rpx; border-radius: 8rpx; background: #0aa77a; color: #fff; font-size: 28rpx; line-height: 78rpx; }
</style>
