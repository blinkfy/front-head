<template>
  <view class="community-page" :class="{ 'dark-mode': isDark }">
    <!-- 动态背景 -->
    <view class="bg-effects">
      <view class="bg-circle c1"></view>
      <view class="bg-circle c2"></view>
      <view class="bg-circle c3"></view>
    </view>

    <!-- 顶部导航 -->
    <view class="navbar">
      <view class="safe-area-top"></view>
      <view class="nav-content">
        <view class="nav-left" @click="goBack">
          <text class="back-icon">←</text>
        </view>
        <view class="nav-title-wrap">
          <view class="title-icon-pill"><text>🏘️</text></view>
          <text class="nav-title">环保社区</text>
        </view>
        <view class="nav-right">
          <view class="action-icon-btn" @click="goToPublish">
            <text>📝</text>
          </view>
        </view>
      </view>
    </view>

    <scroll-view class="main-scroll" scroll-y>
      <view class="content-wrapper">

        <!-- 我的社区卡片 -->
        <view class="my-community-card" v-if="myCommunity">
          <view class="community-cover" :style="getCoverStyle()">
            <view class="cover-overlay"></view>
          </view>
          <view class="community-info">
            <text class="community-name">{{ myCommunity.name }}</text>
            <text class="community-location">{{ myCommunity.district }} · {{ myCommunity.street }}</text>
            <view class="community-stats">
              <view class="stat-item">
                <text class="stat-num">{{ myCommunity.memberCount }}</text>
                <text class="stat-label">户参与</text>
              </view>
              <view class="stat-item">
                <text class="stat-num highlight">{{ myCommunity.monthlyRate }}%</text>
                <text class="stat-label">分类率</text>
              </view>
              <view class="stat-item">
                <text class="stat-num up">{{ myCommunity.monthlyRateChange > 0 ? '↑' : '' }}{{ myCommunity.monthlyRateChange }}%</text>
                <text class="stat-label">环比</text>
              </view>
            </view>
          </view>
        </view>

        <!-- 未加入社区 -->
        <view class="join-prompt" v-if="!myCommunity && !loading">
          <text class="prompt-icon">🏠</text>
          <text class="prompt-text">加入社区，与邻居一起环保</text>
          <view class="join-btn" @click="showCommunityPicker = true">
            <text>选择社区</text>
          </view>
        </view>

        <!-- 社区排行榜 -->
        <view class="ranking-section">
          <view class="section-title-row">
            <view class="title-icon-pill small"><text>📊</text></view>
            <text class="section-title">社区排行榜</text>
          </view>
          <text class="section-sub">一季度环保优秀小区评选中</text>
          <view class="ranking-cards">
            <view v-for="(item, index) in communityRanking.slice(0, 3)" :key="item.id" class="ranking-card" :class="`rank-${index + 1}`">
              <text class="rank-medal">{{ index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉' }}</text>
              <text class="rank-name">{{ item.name }}</text>
              <text class="rank-rate">{{ item.monthlyRate }}%</text>
            </view>
          </view>
        </view>

        <!-- 帖子筛选（横向滚动） -->
        <view class="filter-bar">
          <view class="filter-tabs">
            <view class="filter-tab" :class="{ active: currentTag === '' }" @click="currentTag = ''; loadPosts()">
              <text>最新</text>
            </view>
            <view class="filter-tab" :class="{ active: currentTag === '心得' }" @click="currentTag = '心得'; loadPosts()">
              <text>心得</text>
            </view>
            <view class="filter-tab" :class="{ active: currentTag === '技巧' }" @click="currentTag = '技巧'; loadPosts()">
              <text>技巧</text>
            </view>
            <view class="filter-tab" :class="{ active: currentTag === '活动' }" @click="currentTag = '活动'; loadPosts()">
              <text>活动</text>
            </view>
            <view class="filter-tab" :class="{ active: currentTag === '求助' }" @click="currentTag = '求助'; loadPosts()">
              <text>求助</text>
            </view>
            <view class="filter-tab" :class="{ active: currentTag === '晒单' }" @click="currentTag = '晒单'; loadPosts()">
              <text>晒单</text>
            </view>
          </view>
        </view>

        <!-- 帖子列表 -->
        <view class="posts-list">
          <view class="loading-wrap" v-if="loading && posts.length === 0">
            <view class="loading-spinner"></view>
            <text class="loading-text">加载中...</text>
          </view>

          <view v-for="post in posts" :key="post.id" class="post-card" @click="goToPostDetail(post)">
            <view class="post-header">
              <image class="post-avatar" :src="getAvatarUrl(post.userAvatar)" mode="aspectFill"></image>
              <view class="post-meta">
                <text class="post-author">{{ post.username }}</text>
                <text class="post-time">{{ formatTime(post.createdAt) }}</text>
              </view>
              <view class="post-tag" :class="getTagClass(post.tag)">
                <text>{{ post.tag }}</text>
              </view>
              <view v-if="isAdmin" class="post-admin-delete" @click.stop="confirmDeletePost(post)">删除</view>
            </view>

            <view class="post-content">
              <text class="content-text">{{ post.content }}</text>
            </view>

            <view class="post-images" v-if="post.imageCount > 0">
              <image v-for="(img, idx) in post.images.slice(0, 3)" :key="idx" class="post-image" :src="img" mode="aspectFill" @click.stop="previewImage(post.images, idx)"></image>
              <view class="image-placeholder" v-if="!post.images || post.images.length === 0">
                <text>{{ post.imageCount }}图</text>
              </view>
              <view class="image-more" v-if="post.images && post.images.length > 0 && post.imageCount > 3">
                <text>+{{ post.imageCount - 3 }}</text>
              </view>
            </view>

            <view class="post-actions">
              <view class="action-item" @click.stop="toggleLike(post)">
                <text class="action-icon">{{ post.liked ? '❤️' : '🤍' }}</text>
                <text class="action-count">{{ post.likeCount }}</text>
              </view>
              <view class="action-item" @click.stop="goToPostDetail(post)">
                <text class="action-icon">💬</text>
                <text class="action-count">{{ post.commentCount }}</text>
              </view>
              <view class="action-item" @click.stop="sharePost(post)">
                <text class="action-icon">🔗</text>
                <text class="action-count">{{ post.shareCount }}</text>
              </view>
            </view>
          </view>

          <view class="empty-posts" v-if="!loading && posts.length === 0">
            <text class="empty-icon">📝</text>
            <text class="empty-text">暂无帖子，快来发布第一条吧！</text>
          </view>

          <view class="load-more" v-if="posts.length > 0 && hasMore" @click="loadMorePosts">
            <text>{{ loadingMore ? '加载中...' : '加载更多' }}</text>
          </view>
        </view>

      </view>
    </scroll-view>

    <!-- 社区选择弹窗 -->
    <view class="picker-modal" v-if="showCommunityPicker" @click="showCommunityPicker = false">
      <view class="picker-content" @click.stop>
        <view class="picker-header">
          <text class="picker-title">选择社区</text>
          <text class="picker-close" @click="showCommunityPicker = false">×</text>
        </view>
        <scroll-view class="picker-list" scroll-y>
          <view v-for="c in allCommunities" :key="c.id" class="picker-item" @click="joinCommunity(c.id)">
            <view class="picker-info">
              <text class="picker-name">{{ c.name }}</text>
              <text class="picker-location">{{ c.district }} · {{ c.street }}</text>
            </view>
            <text class="picker-members">{{ c.memberCount }} 户</text>
          </view>
        </scroll-view>
      </view>
    </view>

    <!-- 发布 FAB 按钮 -->
    <view class="fab" @click="goToPublish" v-if="myCommunity">
      <text class="fab-icon">+</text>
    </view>
  </view>
</template>

<script>
import { getCommunityList, getMyCommunity, getCommunityCover, joinCommunity, getCommunityPosts, getCommunityPostImages, getCommunityRanking, togglePostLike, deleteCommunityPost } from '@/api/community.js';
import { userinfo } from '@/api/user.js';
import { baseUrl } from '@/api/settings.js';
import { getAvatarUrl as resolveAvatarUrl } from '@/utils/avatar-handler.js';
import { getCachedCommunityImage, normalizeCommunityImages, normalizeCommunityImageUrl, setCachedCommunityImage } from '@/utils/community-image.js';

export default {
  data() {
    return {
      loading: false,
      loadingMore: false,
      myCommunity: null,
      allCommunities: [],
      communityRanking: [],
      posts: [],
      currentTag: '',
      currentPage: 1,
      hasMore: false,
      showCommunityPicker: false,
      isDark: false,
      isAdmin: false
    };
  },
  onLoad() {
    this.checkTheme();
    this.checkAdmin();
    this.loadData();
  },
  onShow() {
    this.checkTheme();
    this.checkAdmin();
    if (this.myCommunity) this.loadPosts();
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
        if (this.isDark) {
          uni.reLaunch({url: '/pages-dark/home/home'})
        } else {
          uni.reLaunch({url: '/pages/home/home'})
        }
      }
    },
    async loadData() {
      this.loading = true;
      try {
        await this.loadMyCommunity();
        await Promise.all([
          this.loadRanking(),
          this.loadAllCommunities(),
          this.loadPosts()
        ]);
      } catch (e) {
        console.error('加载失败:', e);
      }
      this.loading = false;
    },
    async loadMyCommunity() {
      try {
        const res = await getMyCommunity();
        this.myCommunity = this.extractData(res) || null;
        this.loadMyCommunityCover();
      } catch (e) {
        console.error('获取我的社区失败:', e);
        this.myCommunity = null;
      }
    },
    async loadRanking() {
      try {
        const res = await getCommunityRanking();
        this.communityRanking = this.extractData(res) || [];
      } catch (e) {
        console.error('获取排行榜失败:', e);
        this.communityRanking = [];
      }
    },
    async loadAllCommunities() {
      try {
        const res = await getCommunityList();
        this.allCommunities = this.extractData(res) || [];
      } catch (e) {
        console.error('获取社区列表失败:', e);
        this.allCommunities = [];
      }
    },
    async loadPosts() {
      if (!this.myCommunity) {
        this.posts = [];
        this.hasMore = false;
        return;
      }
      this.loading = true;
      this.currentPage = 1;
      try {
        const communityId = this.myCommunity.id;
        const res = await getCommunityPosts(communityId, this.currentTag || null, 'latest', 1, 20);
        const data = this.extractData(res) || {};
        this.posts = this.normalizePosts(data.posts || []);
        this.loadVisiblePostImages(this.posts);
        this.hasMore = (data.page || 1) < (data.totalPages || 1);
      } catch (e) {
        console.error('获取帖子失败:', e);
        this.posts = [];
        this.hasMore = false;
      }
      this.loading = false;
    },
    async loadMorePosts() {
      if (this.loadingMore || !this.hasMore) return;
      if (!this.myCommunity) return;
      this.loadingMore = true;
      this.currentPage++;
      try {
        const communityId = this.myCommunity.id;
        const res = await getCommunityPosts(communityId, this.currentTag || null, 'latest', this.currentPage, 20);
        const data = this.extractData(res) || {};
        const newPosts = this.normalizePosts(data.posts || []);
        this.posts = [...this.posts, ...newPosts];
        this.loadVisiblePostImages(newPosts);
        this.hasMore = (data.page || 1) < (data.totalPages || 1);
      } catch (e) {
        this.currentPage--;
      }
      this.loadingMore = false;
    },
    async joinCommunity(communityId) {
      try {
        await joinCommunity(communityId);
        uni.showToast({ title: '加入成功!', icon: 'success' });
        this.showCommunityPicker = false;
        await this.loadMyCommunity();
        await this.loadPosts();
      } catch (e) {
        uni.showToast({ title: e.message || '加入失败', icon: 'none' });
      }
    },
    async toggleLike(post) {
      try {
        const res = await togglePostLike(post.id);
        const data = this.extractData(res) || {};
        post.liked = !!data.liked;
        post.likeCount = Number(data.likeCount || 0);
      } catch (e) {
        uni.showToast({ title: '操作失败', icon: 'none' });
      }
    },
    goToPostDetail(post) {
      uni.navigateTo({ url: `/pages-nonTheme/community-post?postId=${post.id}&communityId=${this.myCommunity ? this.myCommunity.id : 0}` });
    },
    confirmDeletePost(post) {
      uni.showModal({
        title: '删除帖子',
        content: '确认删除这条帖子吗？删除后无法恢复。',
        confirmColor: '#ef4444',
        success: async (res) => {
          if (!res.confirm) return;
          try {
            await deleteCommunityPost(post.id);
            this.posts = this.posts.filter((item) => item.id !== post.id);
            uni.showToast({ title: '已删除', icon: 'success' });
          } catch (e) {
            uni.showToast({ title: e.message || '删除失败', icon: 'none' });
          }
        }
      });
    },
    goToPublish() {
      if (!this.myCommunity) {
        uni.showToast({ title: '请先加入社区', icon: 'none' });
        return;
      }
      uni.navigateTo({ url: `/pages-nonTheme/community-publish?communityId=${this.myCommunity.id}` });
    },
    previewImage(images, index) {
      uni.previewImage({ urls: images, current: index });
    },
    normalizePosts(posts) {
      return (posts || []).map((post) => ({
        ...post,
        images: normalizeCommunityImages(post.images, baseUrl),
        imageCount: Number(post.imageCount || (post.images && post.images.length) || 0)
      }));
    },
    async loadMyCommunityCover() {
      if (!this.myCommunity || !this.myCommunity.id || !this.myCommunity.hasCoverImage) return;
      const cachedCover = getCachedCommunityImage('cover', this.myCommunity.id);
      if (cachedCover) {
        this.myCommunity = {
          ...this.myCommunity,
          coverImage: cachedCover
        };
        return;
      }
      try {
        const res = await getCommunityCover(this.myCommunity.id);
        const data = this.extractData(res) || {};
        const coverImage = data.coverImage || '';
        if (coverImage) setCachedCommunityImage('cover', this.myCommunity.id, coverImage);
        this.myCommunity = {
          ...this.myCommunity,
          coverImage
        };
      } catch (e) {
        // 封面加载失败不影响社区内容展示
      }
    },
    async loadVisiblePostImages(posts) {
      const targets = (posts || []).filter(post => post.imageCount > 0 && (!post.images || post.images.length === 0));
      targets.forEach(async (post) => {
        const cachedImages = getCachedCommunityImage('post', post.id);
        if (cachedImages && cachedImages.length) {
          const index = this.posts.findIndex(item => item.id === post.id);
          if (index >= 0) {
            this.posts.splice(index, 1, {
              ...this.posts[index],
              images: cachedImages,
              imageCount: Math.max(this.posts[index].imageCount || 0, cachedImages.length)
            });
          }
          return;
        }
        try {
          const res = await getCommunityPostImages(post.id);
          const data = this.extractData(res) || {};
          const images = normalizeCommunityImages(data.images || [], baseUrl);
          if (images.length) setCachedCommunityImage('post', post.id, images);
          const index = this.posts.findIndex(item => item.id === post.id);
          if (index >= 0) {
            this.posts.splice(index, 1, {
              ...this.posts[index],
              images,
              imageCount: Math.max(this.posts[index].imageCount || 0, images.length)
            });
          }
        } catch (e) {
          // 图片加载失败不影响帖子内容展示
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
    sharePost(post) {
      uni.showToast({ title: '分享功能开发中', icon: 'none' });
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
    },
    getCoverStyle() {
      const coverImage = this.myCommunity ? this.myCommunity.coverImage : '';
      const resolved = normalizeCommunityImageUrl(coverImage, baseUrl);
      if (resolved) {
        return { backgroundImage: `url(${resolved})`, backgroundSize: 'cover', backgroundPosition: 'center' };
      }
      // 无图片时使用纯色兜底
      const colors = ['#4CAF50', '#8BC34A', '#009688', '#00BCD4', '#4DB6AC'];
      const idx = Math.abs(this.myCommunity ? this.myCommunity.id : 0) % colors.length;
      return { background: colors[idx] };
    }
  }
};
</script>

<style scoped>
/* ===== 主容器 ===== */
.community-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #f0fdf4 0%, #f5f7fa 30%, #f0f9ff 70%, #f5f7fa 100%);
  position: relative;
  overflow: hidden;
  padding-bottom: env(safe-area-inset-bottom);
  transition: all 0.3s ease;
}
.community-page.dark-mode {
  background:
    radial-gradient(circle at 18% 8%, rgba(16, 185, 129, 0.22) 0%, transparent 34%),
    radial-gradient(circle at 86% 20%, rgba(56, 189, 248, 0.16) 0%, transparent 32%),
    radial-gradient(circle at 72% 82%, rgba(245, 158, 11, 0.1) 0%, transparent 34%),
    linear-gradient(180deg, #07111f 0%, #0f172a 48%, #101827 100%);
}

/* ===== 背景效果 ===== */
.bg-effects { position: fixed; inset: 0; z-index: 1; pointer-events: none; overflow: hidden; }
.community-page.dark-mode .bg-effects::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(148, 163, 184, 0.05) 1rpx, transparent 1rpx),
    linear-gradient(90deg, rgba(148, 163, 184, 0.04) 1rpx, transparent 1rpx);
  background-size: 64rpx 64rpx;
  -webkit-mask-image: linear-gradient(180deg, rgba(0,0,0,0.58), rgba(0,0,0,0.1));
  mask-image: linear-gradient(180deg, rgba(0,0,0,0.58), rgba(0,0,0,0.1));
}
.community-page.dark-mode .bg-effects::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 50% 0%, rgba(16, 185, 129, 0.08), transparent 48%),
    linear-gradient(180deg, rgba(15, 23, 42, 0) 0%, rgba(15, 23, 42, 0.18) 100%);
}
.bg-circle {
  position: absolute; border-radius: 50%; opacity: 0.08; transition: all 0.3s;
}
.community-page:not(.dark-mode) .bg-circle { background: #10b981; }
.community-page.dark-mode .bg-circle { opacity: 0.18; filter: blur(10rpx); }
.community-page.dark-mode .c1 { background: rgba(16, 185, 129, 0.52); }
.community-page.dark-mode .c2 { background: rgba(56, 189, 248, 0.34); }
.community-page.dark-mode .c3 { background: rgba(245, 158, 11, 0.24); }
.c1 { width: 600rpx; height: 600rpx; top: -200rpx; right: -200rpx; }
.c2 { width: 400rpx; height: 400rpx; bottom: 20%; left: -200rpx; }
.c3 { width: 300rpx; height: 300rpx; top: 30%; right: -100rpx; }

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
.title-icon-pill.small {
  width: 40rpx; height: 40rpx;
  font-size: 20rpx; border-radius: 10rpx;
}
.dark-mode .title-icon-pill { background: rgba(255, 255, 255, 0.15); }
.nav-title {
  font-size: 32rpx; font-weight: 700; letter-spacing: 1rpx; color: #1f2937;
}
.dark-mode .nav-title { color: #fff; }
.action-icon-btn {
  width: 64rpx; height: 64rpx;
  border-radius: 50%;
  background: rgba(16, 185, 129, 0.12);
  display: flex; align-items: center; justify-content: center;
  font-size: 28rpx;
  transition: all 0.3s;
}
.action-icon-btn:active { transform: scale(0.92); }
.dark-mode .action-icon-btn { background: rgba(255, 255, 255, 0.15); }

/* ===== 主内容区 ===== */
.main-scroll { position: relative; z-index: 10; height: calc(100vh - env(safe-area-inset-top) - 88rpx); }
.content-wrapper { padding: 32rpx; padding-bottom: 160rpx; }

/* ===== 我的社区卡片 ===== */
.my-community-card {
  background: #fff;
  border-radius: 24rpx;
  overflow: hidden;
  margin-bottom: 32rpx;
  box-shadow: 0 8rpx 32rpx rgba(16, 185, 129, 0.08);
  border: 1rpx solid rgba(16, 185, 129, 0.06);
  transition: all 0.3s;
}
.dark-mode .my-community-card {
  background: linear-gradient(135deg, rgba(40, 40, 95, 0.8) 0%, rgba(50, 45, 135, 0.9) 100%);
  box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.3);
  border: 1rpx solid rgba(255, 255, 255, 0.1);
}
.community-cover { height: 160rpx; position: relative; }
.cover-overlay { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.25); }
.community-info { padding: 28rpx; }
.community-name {
  display: block;
  color: #1f2937;
  font-size: 32rpx;
  font-weight: 800;
  margin-bottom: 8rpx;
}
.dark-mode .community-name { color: #fff; }
.community-location {
  display: block;
  color: #9ca3af;
  font-size: 24rpx;
  margin-bottom: 20rpx;
}
.dark-mode .community-location { color: rgba(255, 255, 255, 0.7); }
.community-stats { display: flex; justify-content: space-around; }
.stat-item { text-align: center; }
.stat-num {
  display: block;
  color: #1f2937;
  font-size: 36rpx;
  font-weight: 800;
}
.dark-mode .stat-num { color: #fff; }
.stat-num.highlight { color: #10b981; }
.dark-mode .stat-num.highlight { color: #34d399; }
.stat-num.up { color: #f59e0b; }
.dark-mode .stat-num.up { color: #fbbf24; }
.stat-label { display: block; color: #9ca3af; font-size: 22rpx; }
.dark-mode .stat-label { color: rgba(255, 255, 255, 0.6); }

/* ===== 加入提示 ===== */
.join-prompt {
  text-align: center;
  padding: 48rpx;
  background: #fff;
  border-radius: 24rpx;
  margin-bottom: 32rpx;
  box-shadow: 0 4rpx 16rpx rgba(16, 185, 129, 0.06);
  border: 1rpx solid rgba(16, 185, 129, 0.06);
}
.dark-mode .join-prompt {
  background: rgba(255, 255, 255, 0.1);
  border: 1rpx solid rgba(255, 255, 255, 0.1);
}
.prompt-icon { font-size: 72rpx; display: block; margin-bottom: 16rpx; }
.prompt-text {
  display: block;
  color: #6b7280;
  font-size: 28rpx;
  margin-bottom: 24rpx;
}
.dark-mode .prompt-text { color: rgba(255, 255, 255, 0.8); }
.join-btn {
  display: inline-block;
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff;
  padding: 16rpx 40rpx;
  border-radius: 40rpx;
  font-size: 28rpx;
  font-weight: 700;
  box-shadow: 0 4rpx 16rpx rgba(16, 185, 129, 0.3);
  transition: all 0.3s;
}
.join-btn:active { transform: scale(0.96); }

/* ===== 排行榜区块 ===== */
.ranking-section { margin-bottom: 32rpx; }
.section-title-row {
  display: flex; align-items: center; gap: 12rpx;
  margin-bottom: 8rpx;
}
.section-title {
  font-size: 28rpx; font-weight: 700; color: #1f2937;
}
.dark-mode .section-title { color: #fff; }
.section-title::before {
  content: '';
  width: 6rpx; height: 28rpx;
  background: linear-gradient(180deg, #10b981, #34d399);
  border-radius: 3rpx;
  margin-right: 8rpx;
}
.section-sub {
  display: block;
  color: #f59e0b;
  font-size: 22rpx;
  margin-bottom: 20rpx;
  font-weight: 600;
}
.dark-mode .section-sub { color: #fbbf24; }
.ranking-cards { display: flex; gap: 16rpx; }
.ranking-card {
  flex: 1;
  background: #fff;
  border-radius: 20rpx;
  padding: 24rpx 12rpx;
  text-align: center;
  box-shadow: 0 4rpx 16rpx rgba(16, 185, 129, 0.06);
  border: 1rpx solid rgba(16, 185, 129, 0.06);
  transition: all 0.3s;
}
.ranking-card:active { transform: scale(0.97); }
.dark-mode .ranking-card { background: rgba(255, 255, 255, 0.1); border: 1rpx solid rgba(255, 255, 255, 0.1); }
.ranking-card.rank-1 { border-color: rgba(245, 158, 11, 0.4); background: linear-gradient(135deg, rgba(251, 191, 36, 0.1) 0%, rgba(245, 158, 11, 0.05) 100%); }
.ranking-card.rank-2 { border-color: rgba(156, 163, 175, 0.3); }
.ranking-card.rank-3 { border-color: rgba(217, 119, 6, 0.3); }
.rank-medal { font-size: 40rpx; display: block; margin-bottom: 8rpx; }
.rank-name {
  display: block;
  color: #1f2937;
  font-size: 22rpx;
  font-weight: 700;
  margin-bottom: 6rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dark-mode .rank-name { color: #fff; }
.rank-rate {
  display: block;
  color: #10b981;
  font-size: 26rpx;
  font-weight: 800;
}
.dark-mode .rank-rate { color: #34d399; }

/* ===== 筛选栏（横向滚动） ===== */
.filter-bar { margin-bottom: 24rpx; }
.filter-tabs {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10rpx;
  width: 100%;
}
.filter-tab {
  flex: 1;
  min-width: 0;
  height: 64rpx;
  border-radius: 40rpx;
  font-size: 24rpx;
  font-weight: 600;
  color: #6b7280;
  background: rgba(0, 0, 0, 0.04);
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
}
.dark-mode .filter-tab { color: rgba(255, 255, 255, 0.7); background: rgba(255, 255, 255, 0.1); }
.filter-tab.active {
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff;
  box-shadow: 0 4rpx 12rpx rgba(16, 185, 129, 0.3);
}
.filter-tab:active { transform: scale(0.95); }

/* ===== 帖子卡片列表 ===== */
.post-card {
  background: #fff;
  border-radius: 20rpx;
  padding: 28rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 4rpx 16rpx rgba(16, 185, 129, 0.06);
  border: 1rpx solid rgba(16, 185, 129, 0.06);
  transition: all 0.3s;
}
.post-card:active { transform: scale(0.99); }
.dark-mode .post-card { background: rgba(255, 255, 255, 0.1); border: 1rpx solid rgba(255, 255, 255, 0.1); }
.post-header { display: flex; align-items: center; margin-bottom: 20rpx; }
.post-avatar { width: 64rpx; height: 64rpx; border-radius: 50%; margin-right: 16rpx; border: 2rpx solid rgba(16, 185, 129, 0.2); }
.post-meta { flex: 1; }
.post-author { display: block; color: #1f2937; font-size: 26rpx; font-weight: 700; }
.dark-mode .post-author { color: #fff; }
.post-time { display: block; color: #9ca3af; font-size: 20rpx; margin-top: 4rpx; }
.dark-mode .post-time { color: rgba(255, 255, 255, 0.5); }
.post-tag {
  padding: 6rpx 16rpx;
  border-radius: 20rpx;
  font-size: 20rpx;
  font-weight: 600;
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
  flex-shrink: 0;
}
.dark-mode .post-tag { background: rgba(16, 185, 129, 0.2); color: #34d399; }
.post-tag.tag-skill { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
.dark-mode .post-tag.tag-skill { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
.post-tag.tag-event { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
.dark-mode .post-tag.tag-event { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
.post-tag.tag-help { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
.dark-mode .post-tag.tag-help { background: rgba(239, 68, 68, 0.2); color: #f87171; }
.post-tag.tag-share { background: rgba(168, 85, 247, 0.1); color: #a855f7; }
.dark-mode .post-tag.tag-share { background: rgba(168, 85, 247, 0.2); color: #c084fc; }

.post-admin-delete {
  margin-left: 12rpx;
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 700;
  color: #dc2626;
  background: rgba(239, 68, 68, 0.08);
  border: 1rpx solid rgba(239, 68, 68, 0.18);
  flex-shrink: 0;
}
.dark-mode .post-admin-delete {
  color: #fca5a5;
  background: rgba(248, 113, 113, 0.12);
  border-color: rgba(248, 113, 113, 0.22);
}

.post-content { margin-bottom: 16rpx; }
.content-text {
  color: #374151;
  font-size: 26rpx;
  line-height: 1.7;
  line-clamp: 3;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}
.dark-mode .content-text { color: rgba(255, 255, 255, 0.9); }

.post-images { display: flex; gap: 8rpx; margin-bottom: 16rpx; }
.post-image { width: 160rpx; height: 160rpx; border-radius: 12rpx; flex-shrink: 0; }
.image-more, .image-placeholder {
  width: 160rpx; height: 160rpx;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 12rpx;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.dark-mode .image-more, .dark-mode .image-placeholder { background: rgba(255, 255, 255, 0.1); }
.image-more text, .image-placeholder text { color: #6b7280; font-size: 28rpx; font-weight: 700; }
.dark-mode .image-more text, .dark-mode .image-placeholder text { color: rgba(255, 255, 255, 0.8); }

.post-actions { display: flex; gap: 40rpx; }
.action-item { display: flex; align-items: center; gap: 8rpx; }
.action-icon { font-size: 28rpx; }
.action-count { color: #9ca3af; font-size: 24rpx; }
.dark-mode .action-count { color: rgba(255, 255, 255, 0.5); }

.loading-wrap { text-align: center; padding: 80rpx; }
.loading-spinner {
  width: 64rpx; height: 64rpx;
  border: 4rpx solid rgba(16, 185, 129, 0.2);
  border-top-color: #10b981;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 16rpx;
}
@keyframes spin { to { transform: rotate(360deg); } }
.loading-text { color: #9ca3af; font-size: 26rpx; }
.dark-mode .loading-text { color: rgba(255, 255, 255, 0.5); }
.empty-posts { text-align: center; padding: 80rpx; }
.empty-icon { font-size: 72rpx; display: block; margin-bottom: 16rpx; opacity: 0.4; }
.empty-text { color: #9ca3af; font-size: 26rpx; }
.dark-mode .empty-text { color: rgba(255, 255, 255, 0.5); }
.load-more {
  text-align: center;
  padding: 28rpx;
  color: #10b981;
  font-size: 26rpx;
  font-weight: 600;
}
.dark-mode .load-more { color: #34d399; }

/* ===== 社区选择弹窗 ===== */
.picker-modal {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: flex-end;
  z-index: 1000;
  backdrop-filter: blur(2px);
}
.picker-content {
  background: #fff;
  border-radius: 24rpx 24rpx 0 0;
  width: 100%;
  max-height: 70vh;
}
.dark-mode .picker-content { background: rgba(40, 40, 95, 0.98); }
.picker-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 32rpx;
  border-bottom: 1rpx solid rgba(0, 0, 0, 0.06);
}
.dark-mode .picker-header { border-bottom-color: rgba(255, 255, 255, 0.1); }
.picker-title { color: #1f2937; font-size: 30rpx; font-weight: 700; }
.dark-mode .picker-title { color: #fff; }
.picker-close { color: #9ca3af; font-size: 40rpx; font-weight: 300; padding: 8rpx; }
.dark-mode .picker-close { color: rgba(255, 255, 255, 0.6); }
.picker-list { max-height: calc(70vh - 120rpx); }
.picker-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 28rpx 32rpx;
  border-bottom: 1rpx solid rgba(0, 0, 0, 0.04);
  transition: background 0.2s;
}
.dark-mode .picker-item { border-bottom-color: rgba(255, 255, 255, 0.06); }
.picker-item:active { background: rgba(16, 185, 129, 0.04); }
.picker-info { flex: 1; }
.picker-name { display: block; color: #1f2937; font-size: 28rpx; font-weight: 700; }
.dark-mode .picker-name { color: #fff; }
.picker-location { display: block; color: #9ca3af; font-size: 22rpx; margin-top: 4rpx; }
.dark-mode .picker-location { color: rgba(255, 255, 255, 0.6); }
.picker-members { color: #10b981; font-size: 24rpx; font-weight: 700; }
.dark-mode .picker-members { color: #34d399; }

/* ===== 发布 FAB 按钮 ===== */
.fab {
  position: fixed;
  right: 32rpx;
  bottom: calc(60rpx + env(safe-area-inset-bottom));
  width: 100rpx; height: 100rpx;
  background: linear-gradient(135deg, #10b981, #059669);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 8rpx 32rpx rgba(16, 185, 129, 0.4);
  z-index: 100;
  transition: all 0.3s;
}
.fab:active { transform: scale(0.92); }
.fab-icon { color: #fff; font-size: 48rpx; font-weight: 300; }
</style>
