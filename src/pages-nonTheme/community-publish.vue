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
          <text class="nav-title">发布帖子</text>
        </view>
        <view
          :class="['nav-right', 'publish-btn', submitting ? 'disabled' : '']"
          @click="handlePublish"
        >
          <text>发布</text>
        </view>
      </view>
    </view>

    <view class="content-wrapper">
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
  </view>
</template>

<script>
import { createPost } from '@/api/community.js';

export default {
  data() {
    return {
      communityId: 0,
      selectedTag: '心得',
      content: '',
      uploadedImages: [],
      submitting: false,
      tagOptions: ['心得', '技巧', '活动', '求助', '晒单'],
      isDark: false
    };
  },
  onLoad(options) {
    this.checkTheme();
    this.communityId = Number(options.communityId) || 0;
  },
  onShow() {
    this.checkTheme();
  },
  methods: {
    checkTheme() {
      const theme = uni.getStorageSync('app_theme');
      this.isDark = theme === 'dark';
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
        await createPost(this.communityId, this.content.trim(), this.uploadedImages, this.selectedTag);
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

.image-upload-area { }
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
</style>
