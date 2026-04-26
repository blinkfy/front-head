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
            <view class="post-tag" :class="getTagClass(post.tag)">
              <text>{{ post.tag }}</text>
            </view>
            <view v-if="isAdmin" class="post-admin-delete" @click.stop="confirmDeletePost">删除帖子</view>
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
                  <view class="comment-meta-left">
                    <text class="comment-author">{{ comment.username }}</text>
                    <text class="comment-time">{{ formatTime(comment.createdAt) }}</text>
                  </view>
                  <view v-if="isAdmin" class="comment-admin-delete" @click.stop="confirmDeleteComment(comment)">删除</view>
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
        <textarea
          id="comment-input-field"
          name="comment-input-field"
          autocomplete="off"
          v-model="commentText"
          class="comment-input"
          placeholder="写下你的评论..."
          placeholder-class="input-placeholder"
          :auto-height="true"
          :show-confirm-bar="false"
          :adjust-position="true"
          cursor-spacing="20"
        />
        <view class="send-btn" @click="submitComment">
          <text>发送</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { getComments, addComment, togglePostLike, getCommunityPosts, getCommunityPostImages, deleteCommunityPost, deleteCommunityComment } from '@/api/community.js';
import { userinfo } from '@/api/user.js';
import { baseUrl } from '@/api/settings.js';
import { getAvatarUrl as resolveAvatarUrl } from '@/utils/avatar-handler.js';
import { getCachedCommunityImage, normalizeCommunityImages, setCachedCommunityImage } from '@/utils/community-image.js';

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
      isDark: false,
      isAdmin: false
    };
  },
  computed: {
    postTag() {
      return this.post.tag || '帖子详情';
    }
  },
  onLoad(options) {
    this.checkTheme();
    this.checkAdmin();
    this.postId = Number(options.postId) || 0;
    this.communityId = Number(options.communityId) || 0;
    this.loadPostDetail();
    this.loadComments();
  },
  onShow() {
    this.checkTheme();
    this.checkAdmin();
  },
  methods: {
    extractData(res) {
      return res && Object.prototype.hasOwnProperty.call(res, 'data') ? res.data : res;
    },
    checkTheme() {
      const theme = uni.getStorageSync('app_theme');
      this.isDark = theme === 'dark';
    },
    async checkAdmin() {
      const cached = !!uni.getStorageSync('isAdmin');
      if (cached) {
        this.isAdmin = true;
        return;
      }
      try {
        const res = await userinfo('false');
        this.isAdmin = !!(res && res.code === 0 && res.data && res.data.isAdmin);
        if (this.isAdmin) uni.setStorageSync('isAdmin', true);
      } catch (e) {
        this.isAdmin = false;
      }
    },
    goBack() {
      const pages = getCurrentPages()
      if (pages.length > 1) {
        uni.navigateBack()
      } else {
        uni.reLaunch({url: '/pages-nonTheme/community' })
      }
    },
    async loadPostDetail() {
      if (!this.postId || !this.communityId) return;
      try {
        const res = await getCommunityPosts(this.communityId, null, 'latest', 1, 50, false);
        const data = this.extractData(res) || {};
        const list = Array.isArray(data.posts) ? data.posts : [];
        const found = list.find((item) => Number(item.id) === Number(this.postId));
        if (found) {
          this.post = {
            ...this.post,
            ...found,
            images: normalizeCommunityImages(found.images, baseUrl),
            imageCount: Number(found.imageCount || (found.images && found.images.length) || 0)
          };
          this.loadPostImages();
        } else {
          uni.showToast({ title: '帖子不存在或已删除', icon: 'none' });
        }
      } catch (e) {
        console.error('获取帖子详情失败:', e);
      }
    },
    async loadComments() {
      this.loadingComments = true;
      try {
        const res = await getComments(this.postId, 1, 50);
        const data = this.extractData(res) || {};
        this.comments = data.comments || [];
      } catch (e) {
        console.error('获取评论失败:', e);
        this.comments = [];
      }
      this.loadingComments = false;
    },
    async loadPostImages() {
      if (!this.postId || this.post.imageCount <= 0) return;
      const cachedImages = getCachedCommunityImage('post', this.postId);
      if (cachedImages && cachedImages.length) {
        this.post.images = cachedImages;
        this.post.imageCount = Math.max(this.post.imageCount || 0, cachedImages.length);
        return;
      }
      try {
        const res = await getCommunityPostImages(this.postId);
        const data = this.extractData(res) || {};
        this.post.images = normalizeCommunityImages(data.images || [], baseUrl);
        if (this.post.images.length) setCachedCommunityImage('post', this.postId, this.post.images);
        this.post.imageCount = Math.max(this.post.imageCount || 0, this.post.images.length);
      } catch (e) {
        // 图片加载失败不影响帖子内容展示
      }
    },
    async toggleLike() {
      try {
        const res = await togglePostLike(this.postId);
        const data = this.extractData(res) || {};
        this.post.liked = !!data.liked;
        this.post.likeCount = Number(data.likeCount || 0);
      } catch (e) {
        uni.showToast({ title: '操作失败', icon: 'none' });
      }
    },
    focusComment() {
      uni.createSelectorQuery().select('.comment-input').boundingClientRect((rect) => {
        if (rect) {
          uni.pageScrollTo({ scrollTop: rect.top - 100, duration: 300 });
        }
      }).exec();
    },
    async submitComment() {
      if (!this.commentText.trim()) {
        uni.showToast({ title: '请输入评论内容', icon: 'none' });
        return;
      }
      const text = this.commentText.trim();
      try {
        await addComment(this.postId, text, this.replyTo);
        uni.showToast({ title: '评论成功', icon: 'success' });
        this.commentText = '';
        await this.loadComments();
      } catch (e) {
        uni.showToast({ title: e.message || '评论失败', icon: 'none' });
      }
    },
    previewImage(images, index) {
      uni.previewImage({ urls: images, current: index });
    },
    confirmDeletePost() {
      uni.showModal({
        title: '删除帖子',
        content: '确认删除这条帖子吗？删除后无法恢复。',
        confirmColor: '#ef4444',
        success: async (res) => {
          if (!res.confirm) return;
          try {
            await deleteCommunityPost(this.postId);
            uni.showToast({ title: '已删除', icon: 'success' });
            setTimeout(() => {
              uni.navigateBack({ delta: 1 });
            }, 300);
          } catch (e) {
            uni.showToast({ title: e.message || '删除失败', icon: 'none' });
          }
        }
      });
    },
    confirmDeleteComment(comment) {
      uni.showModal({
        title: '删除评论',
        content: '确认删除这条评论吗？删除后无法恢复。',
        confirmColor: '#ef4444',
        success: async (res) => {
          if (!res.confirm) return;
          try {
            await deleteCommunityComment(comment.id);
            this.comments = this.comments.filter((item) => item.id !== comment.id);
            uni.showToast({ title: '已删除', icon: 'success' });
          } catch (e) {
            uni.showToast({ title: e.message || '删除失败', icon: 'none' });
          }
        }
      });
    },
    getTagClass(tag) {
      const map = {
        '技巧': 'tag-skill',
        '活动': 'tag-event',
        '求助': 'tag-help',
        '晒单': 'tag-share'
      };
      return map[tag] || 'tag-note';
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
      if (typeof avatar !== 'string') return '/static/person.jpeg';
      if (avatar.startsWith('blob:')) return '/static/person.jpeg';
      const resolved = resolveAvatarUrl(avatar, baseUrl);
      if (resolved !== '/static/person.jpeg') return resolved;
      if (avatar.startsWith('/')) return `${baseUrl}${avatar}`;
      return `${baseUrl}/${avatar}`;
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
  background:
    radial-gradient(circle at 16% 8%, rgba(16, 185, 129, 0.2) 0%, transparent 34%),
    radial-gradient(circle at 88% 18%, rgba(56, 189, 248, 0.15) 0%, transparent 32%),
    radial-gradient(circle at 66% 82%, rgba(168, 85, 247, 0.12) 0%, transparent 36%),
    linear-gradient(180deg, #07111f 0%, #0f172a 50%, #111827 100%);
}

/* ===== 背景效果 ===== */
.bg-effects { position: fixed; inset: 0; z-index: 1; pointer-events: none; overflow: hidden; }
.post-page.dark-mode .bg-effects::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(148, 163, 184, 0.045) 1rpx, transparent 1rpx),
    linear-gradient(90deg, rgba(148, 163, 184, 0.035) 1rpx, transparent 1rpx);
  background-size: 64rpx 64rpx;
  -webkit-mask-image: linear-gradient(180deg, rgba(0,0,0,0.52), rgba(0,0,0,0.08));
  mask-image: linear-gradient(180deg, rgba(0,0,0,0.52), rgba(0,0,0,0.08));
}
.bg-circle {
  position: absolute; border-radius: 50%; opacity: 0.08; transition: all 0.3s;
}
.post-page:not(.dark-mode) .bg-circle { background: #10b981; }
.post-page.dark-mode .bg-circle { opacity: 0.18; filter: blur(10rpx); }
.post-page.dark-mode .c1 { background: rgba(16, 185, 129, 0.48); }
.post-page.dark-mode .c2 { background: rgba(56, 189, 248, 0.32); }
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
.post-header { display: flex; align-items: center; flex-wrap: wrap; gap: 12rpx; margin-bottom: 24rpx; }
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
.post-tag.tag-skill { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
.post-tag.tag-event { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
.post-tag.tag-help { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
.post-tag.tag-share { background: rgba(168, 85, 247, 0.1); color: #a855f7; }

.post-admin-delete,
.comment-admin-delete {
  border-radius: 999rpx;
  padding: 8rpx 14rpx;
  font-size: 22rpx;
  font-weight: 700;
  color: #dc2626;
  background: rgba(239, 68, 68, 0.08);
  border: 1rpx solid rgba(239, 68, 68, 0.18);
  flex-shrink: 0;
}
.dark-mode .post-admin-delete,
.dark-mode .comment-admin-delete {
  color: #fca5a5;
  background: rgba(248, 113, 113, 0.12);
  border-color: rgba(248, 113, 113, 0.22);
}

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

.comment-item {
  display: flex;
  padding: 24rpx 0;
  border-bottom: 1rpx solid rgba(0, 0, 0, 0.04);
}
.dark-mode .comment-item { border-bottom-color: rgba(255, 255, 255, 0.06); }
.comment-item:last-child { border-bottom: none; }
.comment-avatar { width: 64rpx; height: 64rpx; border-radius: 50%; margin-right: 16rpx; flex-shrink: 0; border: 2rpx solid rgba(16, 185, 129, 0.2); }
.comment-content { flex: 1; }
.comment-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12rpx; margin-bottom: 10rpx; }
.comment-meta-left { min-width: 0; flex: 1; }
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
  padding: 20rpx 32rpx;
  padding-bottom: calc(20rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(20rpx + env(safe-area-inset-bottom, 0px));
  z-index: 9999;
  border-top: 1rpx solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 -4rpx 16rpx rgba(0, 0, 0, 0.04);
}
.dark-mode .comment-bar { background: rgba(40, 40, 95, 1); border-top-color: rgba(255, 255, 255, 0.1); }
.comment-input-wrapper { display: flex; gap: 16rpx; align-items: center; }
.comment-input {
  flex: 1;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 40rpx;
  padding: 20rpx 28rpx;
  color: #1f2937;
  font-size: 26rpx;
  pointer-events: auto;
  user-select: text;
  -webkit-user-select: text;
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
