<template>
  <view class="publish-page" :class="{ 'dark-mode': isDark }">
    <!-- 动态背景 -->
    <view class="bg-effects">
      <view class="bg-circle c1"></view>
      <view class="bg-circle c2"></view>
    </view>

    <!-- 顶部导航 -->
    <view class="navbar">
      <view class="safe-area-top"></view>
      <view class="nav-content">
        <view class="nav-left" @click="handleCancel">
          <text class="cancel-text">取消</text>
        </view>
        <view class="nav-title-wrap">
          <view class="title-icon-pill small"><text>✏️</text></view>
          <text class="nav-title">发布信息</text>
        </view>
        <view
          v-if="!isWeixin"
          :class="['nav-right', 'publish-btn', submitting ? 'disabled' : '']"
          @click="handlePublish"
        >
          <text>发布</text>
        </view>
        <view v-else class="nav-right publish-btn disabled">
          <text>未开放</text>
        </view>
      </view>
    </view>

    <view class="content-wrapper" v-if="!isWeixin">
      <!-- 分类标签选择 -->
      <view class="section">
        <view class="section-title">选择分类</view>
        <view class="tag-list">
          <view
            v-for="tag in tagOptions"
            :key="tag"
            :class="['tag-item', selectedTag === tag ? 'active' : '']"
            @click="selectedTag = tag"
          >
            <text>{{ tag }}</text>
          </view>
        </view>
      </view>

      <!-- 多行文本输入 -->
      <view class="section">
        <view class="section-title">帖子内容</view>
        <view class="textarea-card">
          <textarea
            v-model="content"
            class="content-textarea"
            placeholder="分享你的环保心得、技巧或经验..."
            placeholder-class="textarea-placeholder"
            maxlength="2000"
            auto-height
          ></textarea>
          <view class="word-count">
            <text>{{ content.length }}/2000</text>
          </view>
        </view>
      </view>

      <view class="section" v-if="isAdmin">
        <view class="section-title">可见范围</view>
        <view class="scope-card">
          <view
            v-for="scope in visibilityOptions"
            :key="scope.value"
            :class="['scope-option', visibilityScope === scope.value ? 'active' : '']"
            @click="visibilityScope = scope.value"
          >
            <text class="scope-title">{{ scope.label }}</text>
            <text class="scope-desc">{{ scope.desc }}</text>
          </view>
        </view>
      </view>

      <!-- 图片上传区域 -->
      <view class="section">
        <view class="section-title">添加图片（选填，最多9张）</view>
        <view class="image-upload-area">
          <view class="upload-grid">
            <view v-for="(img, idx) in uploadedImages" :key="idx" class="upload-item">
              <image class="upload-img" :src="img" mode="aspectFill"></image>
              <view class="upload-delete" @click="removeImage(idx)">
                <text>×</text>
              </view>
            </view>
            <view v-if="uploadedImages.length < 9" class="upload-add" @click="chooseImage">
              <text class="add-icon">+</text>
              <text class="add-text">添加图片</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 预览提示 -->
      <view class="tips-card">
        <text class="tips-icon">💡</text>
        <view class="tips-content">
          <text class="tips-title">发布须知</text>
          <text class="tips-text">1. 请遵守社区规范，文明发言</text>
          <text class="tips-text">2. 图片大小不超过5MB</text>
          <text class="tips-text">3. 支持 jpg、png 格式</text>
        </view>
      </view>
    </view>

    <view class="content-wrapper unavailable-panel" v-else>
      <view class="tips-card unavailable-card">
        <text class="tips-icon">❗</text>
        <view class="tips-content">
          <text class="tips-title">该功能未开放</text>
          <text class="tips-text">暂不支持普通用户发布信息</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { createPost } from '@/api/community.js';
import { userinfo } from '@/api/user.js';
import { compressImageToBase64 } from '@/utils/avatar-handler.js';
import { baseUrl } from '@/api/settings';

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    uni.request({
      url,
      method: options.method || 'GET',
      header: options.header || {},
      data: options.data,
      success: (res) => resolve(res.data),
      fail: reject
    })
  })
}

export default {
  data() {
    return {
      communityId: 0,
      selectedTag: '心得',
      content: '',
      uploadedImages: [],
      submitting: false,
      tagOptions: ['心得', '技巧', '活动', '求助', '晒单'],
      visibilityScope: 'community',
      visibilityOptions: [
        { value: 'community', label: '本社区可见', desc: '只展示在当前社区' },
        { value: 'all', label: '全社区可见', desc: '展示到所有社区列表' }
      ],
      isDark: false,
      isWeixin: true,
      isAdmin: false
    };
  },
  onLoad(options) {
    this.checkTheme();
    this.checkAdmin();
    // #ifdef MP-WEIXIN
    this.isWeixin = true;
    this.checkAvailability();
    // #endif
    // #ifndef MP-WEIXIN
    this.isWeixin = false;
    // #endif
    if (options && options.token) {
      try {
        uni.setStorageSync('token', options.token);
      } catch (error) {
        // ignore storage errors
      }
    }

    const fallbackToken = this.getTokenFromLocation();
    if (fallbackToken) {
      try {
        uni.setStorageSync('token', fallbackToken);
      } catch (error) {
        // ignore storage errors
      }
    }

    this.communityId = Number(options.communityId) || 0;
    if (!this.communityId) {
      this.communityId = Number(this.getQueryValue('communityId')) || 0;
    }
  },
  onShow() {
    this.checkTheme();
    this.checkAdmin();
  },
  methods: {
    checkTheme() {
      const theme = uni.getStorageSync('app_theme');
      this.isDark = theme === 'dark';
    },
    async checkAvailability() {
      try {
        const payload = await requestJson(`${baseUrl}/api/ai/settings`)
        const settings = payload && payload.code === 0 ? payload.data : null
        if (!settings || settings.aiEnabled !== false) {
          this.isWeixin = false
        }
      } catch (err) {
        console.warn('[community-publish] check Availability failed:', err)
      }
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
        this.visibilityScope = 'community';
      }
    },
    getQueryValue(key) {
      try {
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href)
          const searchValue = url.searchParams.get(key)
          if (searchValue) return searchValue

          const hash = String(window.location.hash || '')
          const hashQuery = hash.includes('?') ? hash.split('?')[1] : ''
          if (hashQuery) {
            const hashParams = new URLSearchParams(hashQuery)
            return hashParams.get(key) || ''
          }
        }
      } catch (error) {
        // ignore URL parsing errors
      }
      return ''
    },
    getTokenFromLocation() {
      return this.getQueryValue('token') || ''
    },
    handleCancel() {
      if (this.content.trim() || this.uploadedImages.length > 0) {
        uni.showModal({
          title: '提示',
          content: '确定放弃编辑吗？',
          success: (res) => {
            if (res.confirm) {
              uni.navigateBack();
            }
          }
        });
      } else {
        uni.navigateBack();
      }
    },
    async handlePublish() {
      if (this.submitting) return;
      if (!this.content.trim()) {
        uni.showToast({ title: '请输入帖子内容', icon: 'none' });
        return;
      }
      this.submitting = true;
      try {
        const images = await this.getPersistentImages();
        await createPost(
          this.communityId,
          this.content.trim(),
          images,
          this.selectedTag,
          this.isAdmin ? this.visibilityScope : 'community'
        );
        uni.showToast({ title: '发布成功!', icon: 'success' });
        setTimeout(() => {
          uni.navigateBack();
        }, 1500);
      } catch (e) {
        console.error('发布失败:', e);
        uni.showToast({ title: e.message || '发布失败', icon: 'none' });
      } finally {
        this.submitting = false;
      }
    },
    chooseImage() {
      if (this.uploadedImages.length >= 9) {
        uni.showToast({ title: '最多上传9张图片', icon: 'none' });
        return;
      }
      const count = 9 - this.uploadedImages.length;
      uni.chooseImage({
        count: count,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const tempPaths = res.tempFilePaths || [];
          this.uploadedImages = [...this.uploadedImages, ...tempPaths].slice(0, 9);
        }
      });
    },
    removeImage(index) {
      this.uploadedImages.splice(index, 1);
    },
    async getPersistentImages() {
      const tasks = this.uploadedImages.map(async (image) => {
        if (typeof image !== 'string') return '';
        if (image.startsWith('data:image/') || image.startsWith('http://') || image.startsWith('https://')) {
          return image;
        }
        return compressImageToBase64(image, 960, 960, 0.76);
      });
      return (await Promise.all(tasks)).filter(Boolean);
    }
  }
};
</script>

<style scoped>
/* ===== 主容器 ===== */
.publish-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #f0fdf4 0%, #f5f7fa 30%, #f0f9ff 70%, #f5f7fa 100%);
  position: relative;
  overflow: hidden;
  padding-bottom: env(safe-area-inset-bottom);
  transition: all 0.3s ease;
}
.publish-page.dark-mode {
  background: linear-gradient(135deg, #28285f 0%, #28346f 30%, #322c8a 70%, #442977 100%);
}

/* ===== 背景效果 ===== */
.bg-effects { position: fixed; inset: 0; z-index: 1; pointer-events: none; }
.bg-circle { position: absolute; border-radius: 50%; opacity: 0.08; transition: all 0.3s; }
.publish-page:not(.dark-mode) .bg-circle { background: #10b981; }
.publish-page.dark-mode .bg-circle { background: rgba(255, 255, 255, 0.1); }
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
.cancel-text { color: #6b7280; font-size: 28rpx; font-weight: 500; }
.dark-mode .cancel-text { color: rgba(255, 255, 255, 0.7); }
.nav-title-wrap { display: flex; align-items: center; gap: 12rpx; flex: 1; justify-content: center; }
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
.publish-btn {
  background: linear-gradient(135deg, #10b981, #059669);
  padding: 12rpx 32rpx;
  border-radius: 40rpx;
  box-shadow: 0 4rpx 16rpx rgba(16, 185, 129, 0.3);
  transition: all 0.3s;
}
.publish-btn.disabled { opacity: 0.5; }
.publish-btn:active:not(.disabled) { transform: scale(0.95); }
.publish-btn text { color: #fff; font-size: 26rpx; font-weight: 700; }
.publish-btn.disabled text { color: #fff; opacity: 0.8; }

/* ===== 主内容区 ===== */
.content-wrapper { position: relative; z-index: 10; padding: 32rpx; }

/* ===== 区块 ===== */
.section { margin-bottom: 40rpx; }
.section-title {
  display: flex; align-items: center; gap: 12rpx;
  color: #1f2937; font-size: 28rpx; font-weight: 700;
  margin-bottom: 20rpx;
}
.dark-mode .section-title { color: #fff; }
.section-title::before {
  content: '';
  width: 6rpx; height: 28rpx;
  background: linear-gradient(180deg, #10b981, #34d399);
  border-radius: 3rpx;
}

.tag-list { display: flex; flex-wrap: wrap; gap: 16rpx; }
.tag-item {
  padding: 16rpx 28rpx;
  border-radius: 40rpx;
  background: #fff;
  border: 2rpx solid rgba(16, 185, 129, 0.12);
  transition: all 0.3s;
}
.dark-mode .tag-item { background: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.1); }
.tag-item text { color: #6b7280; font-size: 26rpx; font-weight: 500; }
.dark-mode .tag-item text { color: rgba(255, 255, 255, 0.7); }
.tag-item.active {
  background: rgba(16, 185, 129, 0.1);
  border-color: #10b981;
  box-shadow: 0 4rpx 12rpx rgba(16, 185, 129, 0.2);
}
.tag-item.active text { color: #10b981; font-weight: 700; }
.dark-mode .tag-item.active text { color: #34d399; }

.textarea-card {
  background: #fff;
  border-radius: 24rpx;
  padding: 28rpx;
  border: 1rpx solid rgba(16, 185, 129, 0.08);
  box-shadow: 0 4rpx 16rpx rgba(16, 185, 129, 0.06);
}
.dark-mode .textarea-card { background: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.1); }
.content-textarea {
  width: 100%;
  min-height: 320rpx;
  color: #1f2937;
  font-size: 28rpx;
  line-height: 1.8;
}
.dark-mode .content-textarea { color: #fff; }
.textarea-placeholder { color: #9ca3af; }
.dark-mode .textarea-placeholder { color: rgba(255, 255, 255, 0.5); }
.word-count { text-align: right; margin-top: 12rpx; }
.word-count text { color: #9ca3af; font-size: 22rpx; }
.dark-mode .word-count text { color: rgba(255, 255, 255, 0.5); }

.scope-card {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
}
.scope-option {
  background: #fff;
  border: 2rpx solid rgba(16, 185, 129, 0.12);
  border-radius: 20rpx;
  padding: 24rpx;
  transition: all 0.2s;
}
.dark-mode .scope-option {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.12);
}
.scope-option.active {
  background: rgba(16, 185, 129, 0.1);
  border-color: #10b981;
  box-shadow: 0 4rpx 12rpx rgba(16, 185, 129, 0.16);
}
.scope-title {
  display: block;
  color: #1f2937;
  font-size: 26rpx;
  font-weight: 800;
  margin-bottom: 8rpx;
}
.dark-mode .scope-title { color: #fff; }
.scope-option.active .scope-title { color: #10b981; }
.dark-mode .scope-option.active .scope-title { color: #34d399; }
.scope-desc {
  display: block;
  color: #6b7280;
  font-size: 22rpx;
  line-height: 1.5;
}
.dark-mode .scope-desc { color: rgba(255, 255, 255, 0.65); }

.upload-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16rpx; }
.upload-item { position: relative; aspect-ratio: 1; }
.upload-img { width: 100%; height: 100%; border-radius: 16rpx; }
.upload-delete {
  position: absolute; top: -10rpx; right: -10rpx;
  width: 40rpx; height: 40rpx;
  background: rgba(239, 68, 68, 0.9);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
}
.upload-delete text { color: #fff; font-size: 24rpx; line-height: 1; font-weight: bold; }
.upload-add {
  aspect-ratio: 1;
  background: #fff;
  border: 2rpx dashed rgba(16, 185, 129, 0.2);
  border-radius: 16rpx;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  transition: all 0.3s;
}
.upload-add:active { background: rgba(16, 185, 129, 0.04); }
.dark-mode .upload-add { background: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.2); }
.add-icon { color: rgba(16, 185, 129, 0.5); font-size: 48rpx; line-height: 1; }
.add-text { color: #9ca3af; font-size: 22rpx; margin-top: 8rpx; }
.dark-mode .add-text { color: rgba(255, 255, 255, 0.5); }

.tips-card {
  background: #fff;
  border-radius: 24rpx;
  padding: 28rpx;
  display: flex; gap: 20rpx;
  box-shadow: 0 4rpx 16rpx rgba(16, 185, 129, 0.06);
  border: 1rpx solid rgba(16, 185, 129, 0.06);
}
.dark-mode .tips-card { background: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.1); }
.tips-icon { font-size: 40rpx; flex-shrink: 0; }
.tips-content { flex: 1; }
.tips-title { display: block; color: #1f2937; font-size: 26rpx; font-weight: 700; margin-bottom: 12rpx; }
.dark-mode .tips-title { color: #fff; }
.tips-text { display: block; color: #6b7280; font-size: 22rpx; line-height: 2; }
.dark-mode .tips-text { color: rgba(255, 255, 255, 0.7); }

.unavailable-panel {
  display: flex;
  align-items: flex-start;
}

.unavailable-card {
  width: 100%;
}
</style>
