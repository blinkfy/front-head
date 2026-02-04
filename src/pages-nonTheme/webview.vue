<template>
  <view class="webview-page">
    <!-- 渐变头部导航栏 - 在非 H5 平台显示 -->
    <view v-if="!isH5" class="webview-header">
      <view class="header-content">
        <view class="back-btn" @click="goBack">
          <text class="back-icon">←</text>
          <text class="back-text">返回</text>
        </view>
        <view v-if="isPdf" class="preview-btn" @click="previewPdf">
          <text v-if="!downloading">预览 PDF</text>
          <text v-else>下载中...</text>
        </view>
        <view class="title-section">
          <text class="webview-title">{{ title }}</text>
          <view class="title-indicator"></view>
        </view>
      </view>
    </view>

    <!-- 内容区域 -->
    <view class="webview-content">
      <!-- H5 环境使用 iframe，其他平台使用 web-view -->
      <iframe v-if="isH5 && src" :src="src" class="webview-iframe" @load="onLoad"></iframe>
      <web-view v-else-if="!isH5 && src" :src="src" class="webview-container" :webview-styles="webviewStyles"
        @load="onLoad"></web-view>

      <!-- 加载/错误状态 -->
      <view v-else class="webview-empty">
        <view class="empty-icon">
          <text v-if="!src">📭</text>
          <view v-else class="loading-spinner">
            <view class="spinner-ring"></view>
            <view class="spinner-ring"></view>
            <view class="spinner-ring"></view>
          </view>
        </view>
        <text class="empty-title">{{ src ? '正在加载...' : '无可用地址' }}</text>
        <text v-if="src" class="empty-subtitle">请稍候</text>
        <text v-if="!src" class="debug-info">未获取到有效 URL</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const src = ref('')
const title = ref('内嵌页面')
const isH5 = ref(false)
const loading = ref(true)
const isPdf = ref(false)
const downloading = ref(false)
const webviewStyles = ref({})

function goBack() {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack()
  } else {
    uni.reLaunch({
      url: '/pages/profile/profile'
    })
  }
}

function onLoad() {
  loading.value = false
  console.log('页面加载完成')
}

// 当为非 H5 且是 PDF 时，使用下载 + 打开文档的方式预览（适配 APP 等平台）
function previewPdf() {
  if (!src.value) return
  if (isH5.value) {
    // H5 下通常 iframe 已经在页面中显示，直接跳转新窗口以便于下载/打印
    window.open(src.value, '_blank')
    return
  }

  // 非 H5 平台：下载临时文件并用系统打开
  downloading.value = true
  uni.downloadFile({
    url: src.value,
    success(res) {
      if (res && res.tempFilePath) {
        uni.openDocument({
          filePath: res.tempFilePath,
          fileType: 'pdf',
          success() {
            console.log('打开文档成功')
          },
          fail(err) {
            console.error('打开文档失败', err)
            uni.showToast({ title: '打开失败，请下载后查看', icon: 'none' })
          },
          complete() {
            downloading.value = false
          }
        })
      } else {
        downloading.value = false
        uni.showToast({ title: '下载失败', icon: 'none' })
      }
    },
    fail(err) {
      downloading.value = false
      console.error('下载失败', err)
      uni.showToast({ title: '下载失败', icon: 'none' })
    }
  })
}

onMounted(() => {
  // 检测是否为 H5 环境
  // #ifdef H5
  isH5.value = true
  // #endif

  // 使用 uni-app 方式获取页面参数
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1]
  const options = currentPage.$page?.options || currentPage.options || {}

  console.log('webview 页面参数:', options)

  const url = options.url
  if (url) {
    try {
      const decodedUrl = decodeURIComponent(url)
      src.value = decodedUrl

      const lower = decodedUrl.toLowerCase()
      // 简单判定 PDF
      if (lower.endsWith('.pdf') || lower.includes('.pdf?') || lower.includes('file.pdf')) {
        isPdf.value = true
      }

      // 根据 URL 设置标题
      if (decodedUrl.includes('/files')) {
        title.value = '文件管理'
      } else if (decodedUrl.includes('/2048')) {
        title.value = '2048 游戏'
      } else if (decodedUrl.includes('/ssfzx') || decodedUrl.includes('/blinkfy') || decodedUrl.includes('/flynnxu') || decodedUrl.includes('/m0_55046343')) {
        title.value = '关于开发者'
      }

      console.log('解析后的 URL:', decodedUrl, 'isPdf=', isPdf.value)
    } catch (e) {
      src.value = url
      console.error('URL 解码失败:', e)
    }
  } else {
    console.warn('未获取到 url 参数')
  }

  // 计算头部高度并设置原生 webview 样式（App-Plus）
  function adjustWebviewTop(attempt = 0) {
    // H5 下不需要显示原生头部或调整 webview
    if (isH5.value) {
      webviewStyles.value = {}
      return
    }
    const MAX_ATTEMPTS = 6
    try {
      const pagesCtx = getCurrentPages()
      const pageCtx = pagesCtx[pagesCtx.length - 1]
      const query = uni.createSelectorQuery().in(pageCtx)
      query.select('.webview-header').boundingClientRect(rect => {
        const height = rect && rect.height ? rect.height : 0
        if (height > 0) {
          webviewStyles.value = { top: `${height}px`, bottom: '0px' }
        } else if (attempt < MAX_ATTEMPTS) {
          setTimeout(() => adjustWebviewTop(attempt + 1), 100)
        } else {
          // 兜底值，避免被遮挡
          webviewStyles.value = { top: '88px', bottom: '0px' }
        }
      }).exec()
    } catch (err) {
      if (attempt < 3) setTimeout(() => adjustWebviewTop(attempt + 1), 120)
    }
  }

  adjustWebviewTop()

  // 当 plus 就绪时再执行一次（兼容某些平台初始化顺序）
  if (typeof window !== 'undefined') {
    if (typeof window.plus !== 'undefined') {
      adjustWebviewTop()
    } else {
      document.addEventListener('plusready', () => adjustWebviewTop())
    }
  }

  // 额外延迟调整（兼容部分设备）
  setTimeout(() => adjustWebviewTop(), 300)
  setTimeout(() => adjustWebviewTop(), 800)

  // 监听窗口尺寸变化，重新计算
  try {
    window.addEventListener('resize', () => adjustWebviewTop())
  } catch (e) {
    // 某些小程序环境无 window
  }
})
</script>

<style scoped>
/* 页面容器 */
.webview-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  overflow: hidden;
  position: relative;
}

/* 头部导航栏 - 确保在所有平台显示 */
.webview-header {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.95) 0%, rgba(118, 75, 162, 0.95) 100%);
  backdrop-filter: blur(20rpx);
  box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.15);
  position: relative;
  z-index: 10000;
  /* 防止被 web-view 遮挡 */
  flex-shrink: 0;
  width: 100%;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 16rpx 24rpx;
  margin-top: 14px;
  padding-top: calc(16rpx + env(safe-area-inset-top));
}

/* 返回按钮 */
.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  padding: 10rpx 20rpx;
  height: 48rpx;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 20rpx;
  color: #fff;
  border: 2rpx solid rgba(255, 255, 255, 0.18);
  font-size: 24rpx;
  transition: all 0.3s ease;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.08);
  cursor: pointer;
  /* 确保在所有平台都能点击 */
  -webkit-tap-highlight-color: transparent;
}

.back-btn:active {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(0.96);
}

.back-icon {
  font-size: 28rpx;
  font-weight: bold;
}

.back-text {
  font-size: 26rpx;
  font-weight: 600;
}

/* 预览按钮 */
.preview-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10rpx 18rpx;
  height: 56rpx;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 18rpx;
  color: #fff;
  border: 2rpx solid rgba(255, 255, 255, 0.18);
  font-size: 24rpx;
  cursor: pointer;
}

.preview-btn:active {
  transform: scale(0.98);
}

/* 标题区域 */
.title-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.webview-title {
  font-size: 32rpx;
  font-weight: 800;
  color: #fff;
  text-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.15);
}

.title-indicator {
  width: 60rpx;
  height: 4rpx;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.8), transparent);
  border-radius: 2rpx;
}

/* 内容区域 */
.webview-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #f5f7fb;
  overflow: hidden;
  position: relative;
  /* 确保内容区域不会覆盖头部 */
  width: 100%;
  height: 0;
  /* 配合 flex: 1 使用，确保不超出 */
}

.webview-container,
.webview-iframe {
  flex: 1;
  width: 100%;
  height: 100%;
  border: none;
  background: #fff;
  /* App 端 web-view 需要明确尺寸 */
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

/* 空状态/加载状态 */
.webview-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #f5f7fb 0%, #e8ecf5 100%);
  gap: 28rpx;
  padding: 80rpx 40rpx;
}

.empty-icon {
  font-size: 120rpx;
  margin-bottom: 20rpx;
}

.empty-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #333;
}

.empty-subtitle {
  font-size: 26rpx;
  color: #999;
}

.debug-info {
  font-size: 22rpx;
  color: #999;
  word-break: break-all;
  text-align: center;
  padding: 20rpx;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 12rpx;
  margin-top: 20rpx;
}

/* 加载动画 */
.loading-spinner {
  position: relative;
  width: 120rpx;
  height: 120rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.spinner-ring {
  position: absolute;
  width: 80rpx;
  height: 80rpx;
  border: 6rpx solid transparent;
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite;
}

.spinner-ring:nth-child(1) {
  animation-delay: -0.45s;
  border-top-color: #667eea;
}

.spinner-ring:nth-child(2) {
  animation-delay: -0.3s;
  border-top-color: #764ba2;
  width: 60rpx;
  height: 60rpx;
}

.spinner-ring:nth-child(3) {
  animation-delay: -0.15s;
  border-top-color: #5cb0ff;
  width: 40rpx;
  height: 40rpx;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

/* 响应式优化 */
@media (max-width: 750px) {
  .header-content {
    padding: 14rpx 20rpx;
  }

  .webview-title {
    font-size: 28rpx;
  }
}
</style>
