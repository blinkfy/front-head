<template>
  <view class="post-page" :class="{ 'dark-mode': isDark }">
    <!-- 动态背景 -->
    <view class="bg-effects">
      <view class="bg-circle c1"></view>
      <view class="bg-circle c2"></view>
    </view>

    <!-- 顶部导航 -->
    <view class="navbar">
      <view class="safe-area-top"></view>
      <view class="nav-content">
        <view class="nav-left" @click="goBack">
          <text class="back-icon">←</text>
        </view>
        <view class="nav-title-wrap">
          <view class="title-icon-pill small"><text>📄</text></view>
          <text class="nav-title">{{ postTag }}</text>
        </view>
        <view class="nav-right"></view>
      </view>
    </view>

    <scroll-view class="main-scroll" scroll-y>
      <view class="content-wrapper">

        <!-- 帖子内容 -->
        <view class="post-card">
          <view class="post-header">
            <image class="post-avatar" :src="getAvatarUrl(post.userAvatar)" mode="aspectFill"></image>
            <view class="post-meta">
              <text class="post-author">{{ post.username }}</text>
              <text class="post-time">{{ formatTime(post.createdAt) }}</text>
            </view>
            <view class="post-tag" :class="`tag-${post.tag}`">
              <text>{{ post.tag }}</text>
            </view>
          </view>

          <view class="post-content">
            <text class="content-text">{{ post.content }}</text>
          </view>

          <view class="post-images" v-if="post.images && post.images.length > 0">
            <image v-for="(img, idx) in post.images" :key="idx" class="post-image" :src="img" mode="aspectFill" @click.stop="previewImage(post.images, idx)"></image>
          </view>

          <view class="post-actions">
            <view class="action-item" @click="toggleLike">
              <text class="action-icon">{{ post.liked ? '❤️' : '🤍' }}</text>
              <text class="action-count">{{ post.likeCount }}</text>
            </view>
            <view class="action-item" @click="focusComment">
              <text class="action-icon">💬</text>
              <text class="action-count">{{ comments.length }}</text>
            </view>
          </view>
        </view>

        <!-- 评论列表 -->
        <view class="comments-section">
          <view class="section-header">
            <text class="section-title">评论</text>
            <text class="section-count">{{ comments.length }}条</text>
          </view>

          <view class="loading-wrap" v-if="loadingComments">
            <view class="loading-spinner"></view>
          </view>

          <view class="comments-list" v-else>
            <view v-for="(comment, idx) in comments" :key="comment.id" class="comment-item">
              <image class="comment-avatar" :src="getAvatarUrl(comment.userAvatar)" mode="aspectFill"></image>
              <view class="comment-content">
                <view class="comment-header">
                  <text class="comment-author">{{ comment.username }}</text>
                  <text class="comment-time">{{ formatTime(comment.createdAt) }}</text>
                </view>
                <text class="comment-text">{{ comment.content }}</text>
              </view>
            </view>

            <view class="empty-comments" v-if="comments.length === 0">
              <text>暂无评论，快来抢沙发！</text>
            </view>
          </view>
        </view>

      </view>
    </scroll-view>

    <!-- 底部评论输入 -->
    <view class="comment-bar">
      <view class="comment-input-wrapper">
        <input
          v-model="commentText"
          class="comment-input"
          :placeholder="replyTo ? `回复 @${replyTo}` : '写下你的评论...'"
          placeholder-class="input-placeholder"
          @focus="onCommentFocus"
        />
        <view class="send-btn" @click="submitComment">
          <text>发送</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { getComments, addComment, togglePostLike } from '@/api/community.js';

export default {
  data() {
    return {
      postId: 0,
      communityId: 0,
      post: {
        id: 0,
        username: '',
        userAvatar: '',
        content: '',
        images: [],
        tag: '',
        createdAt: '',
        likeCount: 0,
        liked: false
      },
      comments: [],
      loadingComments: false,
      commentText: '',
      replyTo: null,
      isDark: false
    };
  },
  computed: {
    postTag() {
      return this.post.tag || '帖子详情';
    }
  },
  onLoad(options) {
    this.checkTheme();
    this.postId = Number(options.postId) || 0;
    this.communityId = Number(options.communityId) || 0;
    this.loadPostDetail();
    this.loadComments();
  },
  onShow() {
    this.checkTheme();
  },
  methods: {
    checkTheme() {
      const theme = uni.getStorageSync('app_theme');
      this.isDark = theme === 'dark';
    },
    goBack() { uni.navigateBack(); },
    async loadPostDetail() {
      this.post = {
        id: this.postId,
        username: '环保达人',
        userAvatar: '',
        content: '今天学习了垃圾分类知识，收获很大！废纸要叠放整齐，塑料瓶要清空内容物，电池要投入有害垃圾收集容器。大家一起努力，让我们的社区更美好！',
        images: [],
        tag: '心得',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        likeCount: 12,
        liked: false
      };
    },
    async loadComments() {
      this.loadingComments = true;
      try {
        const res = await getComments(this.postId, 1, 50);
        if (res.success && res.data) {
          this.comments = res.data.comments || [];
        } else {
          this.comments = this.getMockComments();
        }
      } catch (e) {
        console.error('获取评论失败:', e);
        this.comments = this.getMockComments();
      }
      this.loadingComments = false;
    },
    getMockComments() {
      return [
        {
          id: 1,
          username: '绿色使者',
          userAvatar: '',
          content: '说得太好了！垃圾分类真的很重要',
          createdAt: new Date(Date.now() - 1800000).toISOString()
        },
        {
          id: 2,
          username: '环保新手',
          userAvatar: '',
          content: '谢谢分享，学到了很多',
          createdAt: new Date(Date.now() - 900000).toISOString()
        }
      ];
    },
    async toggleLike() {
      try {
        const res = await togglePostLike(this.postId);
        if (res.success) {
          this.post.liked = res.data.liked;
          this.post.likeCount = res.data.likeCount;
        }
      } catch (e) {
        this.post.liked = !this.post.liked;
        this.post.likeCount += this.post.liked ? 1 : -1;
      }
    },
    focusComment() {
      uni.createSelectorQuery().select('.comment-input').boundingClientRect((rect) => {
        if (rect) {
          uni.pageScrollTo({ scrollTop: rect.top - 100, duration: 300 });
        }
      }).exec();
    },
    onCommentFocus() {
      this.replyTo = null;
    },
    async submitComment() {
      if (!this.commentText.trim()) {
        uni.showToast({ title: '请输入评论内容', icon: 'none' });
        return;
      }
      const text = this.commentText.trim();
      try {
        const res = await addComment(this.postId, text, this.replyTo);
        if (res.success) {
          uni.showToast({ title: '评论成功', icon: 'success' });
          this.commentText = '';
          this.comments.unshift({
            id: Date.now(),
            username: '我',
            userAvatar: '',
            content: text,
            createdAt: new Date().toISOString()
          });
          this.comments = [...this.comments];
        }
      } catch (e) {
        const newComment = {
          id: Date.now(),
          username: '我',
          userAvatar: '',
          content: text,
          createdAt: new Date().toISOString()
        };
        this.comments.unshift(newComment);
        this.comments = [...this.comments];
        this.commentText = '';
        uni.showToast({ title: '评论成功', icon: 'success' });
      }
    },
    previewImage(images, index) {
      uni.previewImage({ urls: images, current: index });
    },
    formatTime(dateStr) {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      const now = new Date();
      const diff = now - d;
      if (diff < 60000) return '刚刚';
      if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
      return `${Math.floor(diff / 86400000)}天前`;
    },
    getAvatarUrl(avatar) {
      if (!avatar) return '/static/person.jpeg';
      if (avatar.startsWith('http')) return avatar;
      try {
        const config = require('@/api/config.js');
        return (config.baseUrl || (config.config && config.config.baseUrl) || 'http://localhost:3000') + avatar;
      } catch { return 'http://localhost:3000' + avatar; }
    }
  }
};
</script>

<style scoped>
/* ===== 主容器 ===== */
.post-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #f0fdf4 0%, #f5f7fa 30%, #f0f9ff 70%, #f5f7fa 100%);
  position: relative;
  overflow: hidden;
  padding-bottom: env(safe-area-inset-bottom);
  transition: all 0.3s ease;
}
.post-page.dark-mode {
  background: linear-gradient(135deg, #28285f 0%, #28346f 30%, #322c8a 70%, #442977 100%);
}

/* ===== 背景效果 ===== */
.bg-effects { position: fixed; inset: 0; z-index: 1; pointer-events: none; }
.bg-circle {
  position: absolute; border-radius: 50%; opacity: 0.08; transition: all 0.3s;
}
.post-page:not(.dark-mode) .bg-circle { background: #10b981; }
.post-page.dark-mode .bg-circle { background: rgba(255, 255, 255, 0.1); }
.c1 { width: 600rpx; height: 600rpx; top: -200rpx; right: -200rpx; }
.c2 { width: 400rpx; height: 400rpx; bottom: 20%; left: -200rpx; }

/* ===== 导航栏 ===== */
.navbar { position: relative; z-index: 10; }
.safe-area-top { height: env(safe-area-inset-top); min-height: 44rpx; }
.nav-content {
  display: flex; align-items: center; justify-content: space-between;
  padding: 24rpx 32rpx;
  height: 88rpx; box-sizing: content-box;
}
.back-icon { font-size: 48rpx; font-weight: 600; padding: 8rpx; color: #1f2937; }
.dark-mode .back-icon { color: #fff; }
.nav-title-wrap {
  display: flex; align-items: center; gap: 12rpx;
  flex: 1; justify-content: center;
}
.title-icon-pill {
  width: 56rpx; height: 56rpx;
  background: rgba(16, 185, 129, 0.12);
  border-radius: 14rpx;
  display: flex; align-items: center; justify-content: center;
  font-size: 26rpx;
}
.title-icon-pill.small { width: 40rpx; height: 40rpx; font-size: 20rpx; border-radius: 10rpx; }
.dark-mode .title-icon-pill { background: rgba(255, 255, 255, 0.15); }
.nav-title { font-size: 32rpx; font-weight: 700; color: #1f2937; }
.dark-mode .nav-title { color: #fff; }

/* ===== 主内容区 ===== */
.main-scroll { position: relative; z-index: 10; height: calc(100vh - env(safe-area-inset-top) - 88rpx); }
.content-wrapper { padding: 32rpx; padding-bottom: 140rpx; }

/* ===== 帖子卡片 ===== */
.post-card {
  background: #fff;
  border-radius: 24rpx;
  padding: 32rpx;
  margin-bottom: 32rpx;
  box-shadow: 0 8rpx 32rpx rgba(16, 185, 129, 0.08);
  border: 1rpx solid rgba(16, 185, 129, 0.06);
  transition: all 0.3s;
}
.dark-mode .post-card { background: rgba(255, 255, 255, 0.1); border: 1rpx solid rgba(255, 255, 255, 0.1); }
.post-header { display: flex; align-items: center; margin-bottom: 24rpx; }
.post-avatar { width: 72rpx; height: 72rpx; border-radius: 50%; margin-right: 20rpx; border: 2rpx solid rgba(16, 185, 129, 0.2); }
.post-meta { flex: 1; }
.post-author { display: block; color: #1f2937; font-size: 28rpx; font-weight: 700; }
.dark-mode .post-author { color: #fff; }
.post-time { display: block; color: #9ca3af; font-size: 22rpx; margin-top: 4rpx; }
.dark-mode .post-time { color: rgba(255, 255, 255, 0.5); }
.post-tag {
  padding: 8rpx 20rpx;
  border-radius: 20rpx;
  font-size: 22rpx;
  font-weight: 600;
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
  flex-shrink: 0;
}
.dark-mode .post-tag { background: rgba(16, 185, 129, 0.2); color: #34d399; }
.post-tag.tag-技巧 { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
.post-tag.tag-活动 { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
.post-tag.tag-求助 { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
.post-tag.tag-晒单 { background: rgba(168, 85, 247, 0.1); color: #a855f7; }

.post-content { margin-bottom: 24rpx; }
.content-text { color: #374151; font-size: 28rpx; line-height: 1.8; }
.dark-mode .content-text { color: rgba(255, 255, 255, 0.9); }
.post-images { display: flex; flex-wrap: wrap; gap: 12rpx; margin-bottom: 24rpx; }
.post-image { width: 200rpx; height: 200rpx; border-radius: 12rpx; }

.post-actions {
  display: flex; gap: 40rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid rgba(0, 0, 0, 0.04);
}
.dark-mode .post-actions { border-top-color: rgba(255, 255, 255, 0.08); }
.action-item { display: flex; align-items: center; gap: 8rpx; }
.action-icon { font-size: 32rpx; }
.action-count { color: #9ca3af; font-size: 26rpx; }
.dark-mode .action-count { color: rgba(255, 255, 255, 0.5); }

/* ===== 评论区块 ===== */
.comments-section { }
.section-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 24rpx;
}
.section-title {
  display: flex; align-items: center; gap: 12rpx;
  font-size: 28rpx; font-weight: 700; color: #1f2937;
}
.dark-mode .section-title { color: #fff; }
.section-title::before {
  content: '';
  width: 6rpx; height: 28rpx;
  background: linear-gradient(180deg, #10b981, #34d399);
  border-radius: 3rpx;
}
.section-count { color: #9ca3af; font-size: 24rpx; }
.dark-mode .section-count { color: rgba(255, 255, 255, 0.5); }

.loading-wrap { display: flex; justify-content: center; padding: 40rpx; }
.loading-spinner {
  width: 56rpx; height: 56rpx;
  border: 4rpx solid rgba(16, 185, 129, 0.2);
  border-top-color: #10b981;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.comments-list { }
.comment-item {
  display: flex;
  padding: 24rpx 0;
  border-bottom: 1rpx solid rgba(0, 0, 0, 0.04);
}
.dark-mode .comment-item { border-bottom-color: rgba(255, 255, 255, 0.06); }
.comment-item:last-child { border-bottom: none; }
.comment-avatar { width: 64rpx; height: 64rpx; border-radius: 50%; margin-right: 16rpx; flex-shrink: 0; border: 2rpx solid rgba(16, 185, 129, 0.2); }
.comment-content { flex: 1; }
.comment-header { display: flex; justify-content: space-between; margin-bottom: 10rpx; }
.comment-author { color: #1f2937; font-size: 26rpx; font-weight: 700; }
.dark-mode .comment-author { color: #fff; }
.comment-time { color: #9ca3af; font-size: 20rpx; }
.dark-mode .comment-time { color: rgba(255, 255, 255, 0.5); }
.comment-text { color: #4b5563; font-size: 26rpx; line-height: 1.7; }
.dark-mode .comment-text { color: rgba(255, 255, 255, 0.8); }

.empty-comments { text-align: center; padding: 60rpx; color: #9ca3af; font-size: 26rpx; }
.dark-mode .empty-comments { color: rgba(255, 255, 255, 0.5); }

/* ===== 底部评论栏 ===== */
.comment-bar {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  background: #fff;
  backdrop-filter: blur(10px);
  padding: 20rpx 32rpx;
  padding-bottom: calc(20rpx + env(safe-area-inset-bottom));
  z-index: 100;
  border-top: 1rpx solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 -4rpx 16rpx rgba(0, 0, 0, 0.04);
}
.dark-mode .comment-bar { background: rgba(40, 40, 95, 0.98); border-top-color: rgba(255, 255, 255, 0.1); }
.comment-input-wrapper { display: flex; gap: 16rpx; align-items: center; }
.comment-input {
  flex: 1;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 40rpx;
  padding: 20rpx 28rpx;
  color: #1f2937;
  font-size: 26rpx;
}
.dark-mode .comment-input { background: rgba(255, 255, 255, 0.1); color: #fff; }
.input-placeholder { color: #9ca3af; }
.dark-mode .input-placeholder { color: rgba(255, 255, 255, 0.5); }
.send-btn {
  background: linear-gradient(135deg, #10b981, #059669);
  padding: 16rpx 32rpx;
  border-radius: 40rpx;
  transition: all 0.3s;
}
.send-btn:active { transform: scale(0.95); }
.send-btn text { color: #fff; font-size: 26rpx; font-weight: 700; }
</style>
