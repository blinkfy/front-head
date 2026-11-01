<template>
  <view class="post-page" :class="{ 'dark-mode': isDark }">
    <!-- #ifdef MP-WEIXIN -->
    <canvas canvas-id="post-image-trim" class="post-image-trim-canvas"></canvas>
    <!-- #endif -->
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
          <ManifestIcon class="back-icon" id="back" :scale="1" />
        </view>
        <view class="nav-title-wrap">
          <view class="title-icon-pill small"><ManifestIcon id="post_edit" /></view>
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
              <text class="post-author">{{ getDisplayName(post) }}</text>
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

          <view class="image-loading-card" v-if="loadingImages">
            <view class="image-loading-spinner"></view>
            <text>图片加载中...</text>
          </view>

          <view class="post-images" v-else-if="post.images && post.images.length > 0">
            <view
              v-for="(row, rowIndex) in imageRows"
              :key="`row-${rowIndex}`"
              class="post-image-row"
              :class="row.className"
            >
              <image
                v-for="item in row.items"
                :key="item.index"
                class="post-image"
                :class="getImageCardClass(item.index)"
                :style="getImageCardStyle(item.index, row.className)"
                :src="item.src"
                mode="aspectFill"
                @load="onPostImageLoad(item.index, $event)"
                @tap.stop="previewImage(post.images, item.index)"
                :data-idx="item.index"
                :data-src="item.src"
              ></image>
            </view>
          </view>

          <view class="post-actions">
            <view class="action-item" @click="toggleLike">
              <ManifestIcon id="thumbs_up" class="action-icon" />
              <text class="action-count">{{ post.likeCount }}</text>
            </view>
            <view class="action-item" @click="focusComment">
              <ManifestIcon id="comment" class="action-icon" />
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
                    <text class="comment-author">{{ getDisplayName(comment) }}</text>
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
    <view class="comment-bar" v-if="!isWeixin">
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

    <view v-if="imagePreviewVisible" class="community-preview" role="dialog" aria-modal="true" aria-label="图片预览">
      <scroll-view class="community-preview-scroll" :scroll-x="previewImageSize.width > previewViewportWidth" :scroll-y="previewImageSize.height > previewViewportHeight" :scroll-left="previewScrollLeft" :scroll-top="previewScrollTop" :key="previewIndex">
        <view class="community-preview-canvas" :style="previewCanvasStyle" @click.self="closeImagePreview">
          <image class="community-preview-image" :style="previewImageStyle" :src="previewImages[previewIndex]" mode="aspectFit" @load="onPreviewImageLoad" />
        </view>
      </scroll-view>
      <view class="community-preview-count">{{ previewIndex + 1 }} / {{ previewImages.length }}</view>
      <button class="community-preview-close" type="button" aria-label="关闭图片预览" @click="closeImagePreview">×</button>
      <button v-if="previewIndex > 0" class="community-preview-prev" type="button" aria-label="上一张图片" @click="changePreview(-1)">‹</button>
      <button v-if="previewIndex < previewImages.length - 1" class="community-preview-next" type="button" aria-label="下一张图片" @click="changePreview(1)">›</button>
      <view class="community-preview-zoom">
        <view class="community-zoom-btn" :class="{ disabled: previewZoom <= 0.5 }" role="button" aria-label="缩小图片" @tap.stop="zoomPreview(-1)">−</view>
        <text>{{ Math.round(previewZoom * 100) }}%</text>
        <view class="community-zoom-btn" :class="{ disabled: previewZoom >= 3 }" role="button" aria-label="放大图片" @tap.stop="zoomPreview(1)">＋</view>
      </view>
    </view>

  </view>
</template>

<script>
import { getComments, addComment, togglePostLike, getCommunityPosts, getCommunityPostImages, deleteCommunityPost, deleteCommunityComment } from '@/pages-nonTheme/api/community.js';
import { userinfo } from '@/api/user.js';
import { baseUrl } from '@/api/settings.js';
import { getAvatarUrl as resolveAvatarUrl } from '@/utils/avatar-handler.js';
import { getManifestIconPath } from '@/utils/manifest-icons.js';
import { getCachedCommunityImage, normalizeCommunityImages, setCachedCommunityImage, takeCommunityPostSnapshot } from '@/pages-nonTheme/utils/community-image.js';
import ManifestIcon from '@/components/ManifestIcon.vue';
import { getDisplayName } from '@/utils/display-name.js';
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
  components: { ManifestIcon },
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
      loadingImages: false,
      commentText: '',
      replyTo: null,
      isDark: false,
      isAdmin: false,
      isWeixin: false,
      imagePreviewVisible: false,
      previewImages: [],
      previewIndex: 0,
      previewZoom: 1,
      previewViewportWidth: 0,
      previewViewportHeight: 0,
      previewImageWidth: 0,
      previewImageHeight: 0,
      previewScrollLeft: 0,
      previewScrollTop: 0,
      postImageMeta: {}
    };
  },
  computed: {
    previewImageSize() {
      const viewportWidth = this.previewViewportWidth || 1;
      const viewportHeight = this.previewViewportHeight || 1;
      if (!this.previewImageWidth || !this.previewImageHeight) return { width: 0, height: 0 };
      const fit = Math.min(viewportWidth / this.previewImageWidth, viewportHeight / this.previewImageHeight);
      return {
        width: this.previewImageWidth * fit * this.previewZoom,
        height: this.previewImageHeight * fit * this.previewZoom
      };
    },
    previewCanvasStyle() {
      return {
        width: `${Math.max(this.previewViewportWidth, this.previewImageSize.width)}px`,
        height: `${Math.max(this.previewViewportHeight, this.previewImageSize.height)}px`
      };
    },
    previewImageStyle() {
      return {
        width: `${this.previewImageSize.width}px`,
        height: `${this.previewImageSize.height}px`
      };
    },
    postTag() {
      return this.post.tag || '帖子详情';
    },
    imageRows() {
      const images = Array.isArray(this.post.images) ? this.post.images : [];
      const rows = [];
      let index = 0;
      while (index < images.length) {
        const kind = this.getImageKind(index, images.length);
        const nextKind = this.getImageKind(index + 1, images.length);
        if (kind === 'tall' && nextKind === 'tall') {
          rows.push({
            className: 'pair-row',
            items: [
              { src: images[index], index },
              { src: images[index + 1], index: index + 1 }
            ]
          });
          index += 2;
          continue;
        }
        if (kind === 'normal' && nextKind === 'normal') {
          rows.push({
            className: 'pair-row',
            items: [
              { src: images[index], index },
              { src: images[index + 1], index: index + 1 }
            ]
          });
          index += 2;
          continue;
        }
        rows.push({
          className: kind === 'wide' ? 'wide-row' : kind === 'tall' ? 'tall-row' : 'single-row',
          items: [{ src: images[index], index }]
        });
        index += 1;
      }
      return rows;
    }
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
    this.postId = Number(options.postId) || 0;
    this.communityId = Number(options.communityId) || 0;
    const snapshot = takeCommunityPostSnapshot(this.communityId, this.postId);
    if (snapshot) {
      this.post = { ...this.post, ...snapshot };
      if (this.post.images.length) {
        this._postImagesRequested = true;
        this.loadPostImages();
      }
    }
    this.loadPostDetail();
    this.loadComments();
  },
  onUnload() {
    // #ifdef H5
    window.removeEventListener('keydown', this.handlePreviewKeydown);
    // #endif
  },
  onShow() {
    this.checkTheme();
    this.checkAdmin();
  },
  methods: {
    getDisplayName,
    extractData(res) {
      return res && Object.prototype.hasOwnProperty.call(res, 'data') ? res.data : res;
    },
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
            images: this._postImagesRequested ? this.post.images : normalizeCommunityImages(found.images, baseUrl),
            imageCount: Number(found.imageCount || (found.images && found.images.length) || 0)
          };
          if (!this._postImagesRequested) {
            this._postImagesRequested = true;
            this.loadPostImages();
          }
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
      this.loadingImages = !this.post.images.length;
      try {
        let images = this.post.images.length ? [...this.post.images] : await getCachedCommunityImage('post', this.postId);
        if (!images || !images.length) {
          const res = await getCommunityPostImages(this.postId);
          const data = this.extractData(res) || {};
          images = normalizeCommunityImages(data.images || [], baseUrl);
          if (images.length) setCachedCommunityImage('post', this.postId, images);
        }
        this.postImageMeta = {};
        this.post.images = images;
        this.post.imageCount = Math.max(this.post.imageCount || 0, images.length);
        this.loadingImages = false;
        for (let index = 0; index < images.length; index++) {
          let trimmed = images[index];
          // #ifdef H5
          trimmed = await this.trimPreviewPadding(trimmed);
          // #endif
          // #ifdef MP-WEIXIN
          trimmed = await this.trimMiniProgramImage(trimmed);
          // #endif
          if (trimmed !== images[index] && this.post.images[index] === images[index]) {
            this.post.images.splice(index, 1, trimmed);
          }
        }
      } catch (e) {
        // 图片加载失败不影响帖子内容展示
      } finally {
        this.loadingImages = false;
      }
    },
    onPostImageLoad(index, event) {
      const detail = event && event.detail ? event.detail : {};
      const width = Number(detail.width || 0);
      const height = Number(detail.height || 0);
      if (!width || !height) return;
      this.postImageMeta = {
        ...this.postImageMeta,
        [index]: { width, height, ratio: width / height }
      };
    },
    getImageKind(index, total) {
      if (index < 0 || index >= total) return '';
      const ratio = this.postImageMeta[index] && this.postImageMeta[index].ratio;
      if (ratio) {
        if (ratio < 0.78) return 'tall';
        if (ratio > 1.28) return 'wide';
        return 'normal';
      }
      if (total === 3) return index < 2 ? 'tall' : 'wide';
      return 'normal';
    },
    getImageCardClass(index) {
      return `image-${this.getImageKind(index, (this.post.images || []).length) || 'normal'}`;
    },
    getImageCardStyle(index, rowClassName) {
      const meta = this.postImageMeta[index];
      const ratio = meta && meta.ratio ? Number(meta.ratio) : 0;
      let height = 360;
      if (rowClassName === 'pair-row') {
        height = ratio && ratio > 1.15 ? 260 : 420;
      } else if (rowClassName === 'wide-row') {
        height = ratio ? Math.round(640 / ratio) : 280;
        height = Math.max(220, Math.min(360, height));
      } else if (rowClassName === 'tall-row') {
        height = 520;
      } else if (ratio) {
        height = Math.round(640 / ratio);
        height = Math.max(280, Math.min(460, height));
      }
      return { height: `${height}rpx` };
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
    async previewImage(images, index) {
      let urls = normalizeCommunityImages(images, baseUrl);
      if (!urls.length) {
        uni.showToast({ title: '暂无可预览图片', icon: 'none' });
        return;
      }

      // #ifdef H5
      // 历史社区图片由 960×960 画布生成，长图两侧可能有透明留白。
      urls = await Promise.all(urls.map(url => this.trimPreviewPadding(url)));
      // #endif

      this.previewImages = urls;
      const { windowWidth = 0, windowHeight = 0 } = uni.getSystemInfoSync();
      this.previewViewportWidth = windowWidth;
      this.previewViewportHeight = windowHeight;
      // #ifdef H5
      this.previewViewportWidth = window.innerWidth || windowWidth;
      this.previewViewportHeight = window.innerHeight || windowHeight;
      // #endif
      this.previewImageWidth = 0;
      this.previewImageHeight = 0;
      this.previewIndex = Math.min(Math.max(Number(index) || 0, 0), urls.length - 1);
      this.previewZoom = 1;
      this.previewScrollLeft = 0;
      this.previewScrollTop = 0;
      this.imagePreviewVisible = true;
      // #ifdef H5
      window.addEventListener('keydown', this.handlePreviewKeydown);
      // #endif
    },
    // #ifdef H5
    trimPreviewPadding(url) {
      if (!url.startsWith('data:image/png;base64,')) return Promise.resolve(url);
      return new Promise(resolve => {
        const image = new Image();
        image.onload = () => {
          try {
            // 只处理社区旧版上传生成的固定尺寸画布，保留其他图片的透明边缘。
            if (image.naturalWidth !== 960 || image.naturalHeight !== 960) return resolve(url);
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0);
            const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
            for (let y = 0; y < canvas.height; y++) {
              for (let x = 0; x < canvas.width; x++) {
                if (pixels[(y * canvas.width + x) * 4 + 3] !== 0) {
                  left = Math.min(left, x); right = Math.max(right, x);
                  top = Math.min(top, y); bottom = Math.max(bottom, y);
                }
              }
            }
            if (right < left || (left === 0 && top === 0 && right === 959 && bottom === 959)) return resolve(url);
            const cropped = document.createElement('canvas');
            cropped.width = right - left + 1;
            cropped.height = bottom - top + 1;
            cropped.getContext('2d').drawImage(canvas, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
            resolve(cropped.toDataURL('image/png'));
          } catch (_) {
            resolve(url);
          }
        };
        image.onerror = () => resolve(url);
        image.src = url;
      });
    },
    // #endif
    // #ifdef MP-WEIXIN
    async trimMiniProgramImage(url) {
      if (!url.startsWith('data:image/png;base64,')) return url;
      const fs = uni.getFileSystemManager();
      const name = `post_trim_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      let sourcePath = '';
      try {
        sourcePath = await this.saveBase64ToTemp(url, name);
        const info = await new Promise((resolve, reject) => uni.getImageInfo({ src: sourcePath, success: resolve, fail: reject }));
        if (info.width !== 960 || info.height !== 960) return url;
        const context = uni.createCanvasContext('post-image-trim', this);
        context.clearRect(0, 0, 960, 960);
        context.drawImage(sourcePath, 0, 0, 960, 960);
        await new Promise(resolve => context.draw(false, resolve));
        const image = await new Promise((resolve, reject) => uni.canvasGetImageData({
          canvasId: 'post-image-trim', x: 0, y: 0, width: 960, height: 960, success: resolve, fail: reject
        }, this));
        let left = 960, top = 960, right = -1, bottom = -1;
        for (let y = 0; y < 960; y++) {
          for (let x = 0; x < 960; x++) {
            if (image.data[(y * 960 + x) * 4 + 3] !== 0) {
              left = Math.min(left, x); right = Math.max(right, x);
              top = Math.min(top, y); bottom = Math.max(bottom, y);
            }
          }
        }
        if (right < left || (left === 0 && top === 0 && right === 959 && bottom === 959)) return url;
        const width = right - left + 1, height = bottom - top + 1;
        const result = await new Promise((resolve, reject) => uni.canvasToTempFilePath({
          canvasId: 'post-image-trim', x: left, y: top, width, height,
          destWidth: width, destHeight: height, fileType: 'png', success: resolve, fail: reject
        }, this));
        const data = await new Promise((resolve, reject) => fs.readFile({
          filePath: result.tempFilePath, encoding: 'base64', success: resolve, fail: reject
        }));
        return `data:image/png;base64,${data.data}`;
      } catch (_) {
        return url;
      } finally {
        if (sourcePath) fs.unlink({ filePath: sourcePath, fail() {} });
      }
    },
    // #endif
    closeImagePreview() {
      this.imagePreviewVisible = false;
      // #ifdef H5
      window.removeEventListener('keydown', this.handlePreviewKeydown);
      // #endif
    },
    handlePreviewKeydown(event) {
      if (!this.imagePreviewVisible) return;
      if (event.key === 'Escape') this.closeImagePreview();
      else if (event.key === 'ArrowLeft') this.changePreview(-1);
      else if (event.key === 'ArrowRight') this.changePreview(1);
    },
    changePreview(direction) {
      const index = this.previewIndex + direction;
      if (index < 0 || index >= this.previewImages.length) return;
      this.previewIndex = index;
      this.previewZoom = 1;
      this.previewImageWidth = 0;
      this.previewImageHeight = 0;
      this.previewScrollLeft = 0;
      this.previewScrollTop = 0;
    },
    zoomPreview(direction) {
      this.previewZoom = Math.max(0.5, Math.min(3, Math.round((this.previewZoom + direction * 0.25) * 100) / 100));
      this.$nextTick(() => {
        this.previewScrollLeft = Math.max(0, (this.previewImageSize.width - this.previewViewportWidth) / 2);
        this.previewScrollTop = Math.max(0, (this.previewImageSize.height - this.previewViewportHeight) / 2);
      });
    },
    onPreviewImageLoad(event) {
      this.previewImageWidth = Number(event?.detail?.width) || 0;
      this.previewImageHeight = Number(event?.detail?.height) || 0;
    },
    saveBase64ToTemp(base64Data, name) {
      return new Promise((resolve, reject) => {
        // #ifdef APP-PLUS
        // Ensure name is clean
        const fileName = `${name.replace(/[^a-z0-9]/gi, '_')}.png`;
        const bitmap = new plus.nativeObj.Bitmap(name);
        bitmap.loadBase64Data(base64Data, () => {
          // Use _doc path which is standard for App-Plus temporary files
          const savePath = `_doc/${fileName}`;
          bitmap.save(savePath, { overwrite: true }, (event) => {
            // event.target is the absolute local path like file:///...
            resolve(event.target);
            // Bitmap should be cleared from memory after saving
            bitmap.clear();
          }, (err) => {
            bitmap.clear();
            reject(err);
          });
        }, (err) => {
          reject(err);
        });
        // #endif

        // #ifdef MP-WEIXIN
        const fs = uni.getFileSystemManager();
        const parts = base64Data.split(',');
        const extMatch = parts[0].match(/data:image\/(\w+);base64/);
        const ext = extMatch ? extMatch[1] : 'png';
        const filePath = `${uni.env.USER_DATA_PATH}/${name}.${ext}`;
        fs.writeFile({
          filePath: filePath,
          data: parts[1],
          encoding: 'base64',
          success: () => resolve(filePath),
          fail: (err) => reject(err)
        });
        // #endif

        // #ifndef APP-PLUS || MP-WEIXIN
        resolve(base64Data);
        // #endif
      });
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
      const fallbackAvatar = getManifestIconPath('profile_user');
      if (!avatar) return fallbackAvatar;
      if (typeof avatar !== 'string') return fallbackAvatar;
      if (avatar.startsWith('blob:')) return fallbackAvatar;
      const resolved = resolveAvatarUrl(avatar, baseUrl);
      if (resolved !== fallbackAvatar) return resolved;
      if (avatar.startsWith('/')) return `${baseUrl}${avatar}`;
      return `${baseUrl}/${avatar}`;
    }
  }
};
</script>

<style scoped>
.post-image-trim-canvas { position: fixed; left: -9999px; top: 0; width: 960px; height: 960px; }
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
.dark-mode .back-icon { color: #fff; filter: brightness(0) invert(1); }
.nav-left, .nav-right { flex: 0 0 80rpx; }
.nav-right { display: flex; justify-content: flex-end; }
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
.content-wrapper {
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  padding: 32rpx;
  padding-bottom: 140rpx;
  box-sizing: border-box;
}

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
.image-loading-card {
  height: 160rpx;
  border-radius: 16rpx;
  margin-bottom: 24rpx;
  background: rgba(16, 185, 129, 0.06);
  border: 1rpx dashed rgba(16, 185, 129, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14rpx;
}
.image-loading-card text {
  color: #6b7280;
  font-size: 24rpx;
  font-weight: 600;
}
.dark-mode .image-loading-card {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.12);
}
.dark-mode .image-loading-card text { color: rgba(255, 255, 255, 0.72); }
.image-loading-spinner {
  width: 32rpx;
  height: 32rpx;
  border-radius: 50%;
  border: 4rpx solid rgba(16, 185, 129, 0.18);
  border-top-color: #10b981;
  animation: spin 1s linear infinite;
}
.post-images {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  margin-bottom: 24rpx;
}
.post-image-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14rpx;
}
.post-image-row.pair-row {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.post-image-row.wide-row,
.post-image-row.tall-row,
.post-image-row.single-row {
  grid-template-columns: 1fr;
}
.post-image {
  width: 100%;
  border-radius: 14rpx;
  background: rgba(0, 0, 0, 0.04);
  display: block;
}
.post-image.image-wide {
  border-radius: 16rpx;
}
.post-image.image-tall {
  background: rgba(16, 185, 129, 0.05);
}
.dark-mode .post-image {
  background: rgba(255, 255, 255, 0.08);
}

.community-preview { position: fixed; inset: 0; z-index: 10000; background: rgba(0, 0, 0, .88); }
.community-preview-scroll { width: 100%; height: 100%; overscroll-behavior: contain; }
.community-preview-canvas { display: flex; align-items: center; justify-content: center; }
.community-preview-image { display: block; flex: none; }
.community-preview-count { position: absolute; top: calc(16px + env(safe-area-inset-top)); left: 16px; color: #fff; font-size: 14px; }
.community-preview-close, .community-preview-prev, .community-preview-next { position: absolute; z-index: 1; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; margin: 0; padding: 0; border: 0; border-radius: 50%; background: rgba(0, 0, 0, .45); color: #fff; font-size: 30px; line-height: 1; cursor: pointer; }
.community-preview-close { top: calc(8px + env(safe-area-inset-top)); right: 8px; }
.community-preview-prev, .community-preview-next { top: 50%; transform: translateY(-50%); }
.community-preview-prev { left: 8px; }
.community-preview-next { right: 8px; }
.community-preview-zoom { position: absolute; bottom: calc(20px + env(safe-area-inset-bottom)); left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 12px; padding: 4px 10px; border-radius: 28px; background: rgba(0, 0, 0, .65); color: #fff; font-size: 14px; }
.community-zoom-btn { display: flex; flex: none; align-items: center; justify-content: center; width: 36px; height: 36px; color: #fff; font-size: 25px; line-height: 1; cursor: pointer; }
.community-zoom-btn.disabled { opacity: .4; }

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
.comment-input-wrapper {
  display: flex;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  gap: 16rpx;
  align-items: center;
}
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
