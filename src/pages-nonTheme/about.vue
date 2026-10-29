<template>
  <view :class="['about-container', { 'dark-theme': isDarkTheme }]">
    <!-- 顶部安全区域占位 -->
    <view class="safe-area-top"></view>

    <!-- 背景效果 -->
    <view class="bg-effects">
      <view class="bg-grid"></view>
      <view class="floating-elements">
        <view class="float-item" v-for="n in 4" :key="n"></view>
      </view>
      <!-- 浅色模式：蓝橙绿球形装饰 -->
      <view v-if="!isDarkTheme" class="bg-circle circle-blue"></view>
      <view v-if="!isDarkTheme" class="bg-circle circle-orange"></view>
      <view v-if="!isDarkTheme" class="bg-circle circle-green"></view>
    </view>

    <!-- 主内容 -->
    <view class="content-wrapper">
      <!-- 应用信息卡片 -->
      <view class="info-card">
        <image class="app-icon" :src="appIconSource" mode="aspectFill" ></image>
        <text class="app-name">分投侠</text>
        <text class="app-slogan">智能垃圾分类助手</text>
        <text class="app-version">Version {{ currentVersion }}</text>
        <text class="app-slogan">让垃圾分类更智能，让环保更简单</text>
        <view class="version-actions">
          <!-- #ifdef APP-PLUS -->
          <view class="check-update" @click="checkAppUpdate({ manual: true })">检查更新</view>
          <!-- #endif -->
          <!-- #ifndef APP-PLUS -->
          <view class="check-update" @click="downloadApp">下载 APP</view>
          <!-- #endif -->
        </view>
      </view>

      <!-- 功能介绍 -->
      <view class="features-section">
        <text class="section-title">核心功能</text>
        <text class="section-intro">从分类查询到智能投放，记录每一步环保行动</text>
        <view class="feature-list">
          <view v-for="feature in features" :key="feature.name" class="feature-item">
            <view class="feature-symbol">
              <ManifestIcon class="feature-icon" :id="feature.icon" size="56rpx" />
            </view>
            <view class="feature-info">
              <text class="feature-name">{{ feature.name }}</text>
              <text class="feature-desc">{{ feature.desc }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 技术信息 -->
      <view class="tech-section">
        <text class="section-title">技术架构</text>
        <view class="tech-info">
          <view class="tech-item">
            <text class="tech-index">01</text>
            <view class="tech-copy">
              <text class="tech-label">双引擎视觉识别</text>
              <text class="tech-value">AI 图像理解结合 YOLO 目标检测，可按场景切换并在异常时回退</text>
            </view>
          </view>
          <view class="tech-item">
            <text class="tech-index">02</text>
            <view class="tech-copy">
              <text class="tech-label">上下文 AI 助手</text>
              <text class="tech-value">结合对话上下文，解答垃圾分类、设备投放与环保问题</text>
            </view>
          </view>
          <view class="tech-item">
            <text class="tech-index">03</text>
            <view class="tech-copy">
              <text class="tech-label">端云数据协同</text>
              <text class="tech-value">贯通分类识别、设备投放记录和积分状态，便于回看与追踪</text>
            </view>
          </view>
          <view class="tech-item">
            <text class="tech-index">04</text>
            <view class="tech-copy">
              <text class="tech-label">跨端应用架构</text>
              <text class="tech-value">以 Vue 3 与 uni-app 构建，同一套业务适配 H5、App 与小程序</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 开发信息 -->
      <view class="developer-section">
        <text class="developer-title">👨‍💻 开发团队</text>
        <text class="developer-name" @click="openProfileWebview">@xvan</text>
        <text class="developer-year">2025–{{ currentYear }}</text>
        <text class="developer-motto">用技术守护绿色地球 🌍</text>
      </view>

      <!-- 免责声明 -->
      <view class="disclaimer">
        <text class="disclaimer-text">
          * AI识别结果仅供参考，请结合实际情况进行分类
        </text>
      </view>
    </view>
  </view>
</template>
<script setup>
import { baseUrl } from '@/api/settings'
import { appDownloadUrl } from '@/utils/app-update-core.mjs'
// #ifdef APP-PLUS
import { checkAppUpdate } from '@/utils/app-update.js'
// #endif
import manifest from '@/manifest.json'
import { ref, onMounted } from 'vue'
import ManifestIcon from '@/components/ManifestIcon.vue'

let appIconSource = '/static/Icon.webp.png'
// #ifdef MP-WEIXIN
appIconSource = '/pages-nonTheme/static/Icon.webp.png'
// #endif

// 主题相关
const isDarkTheme = ref(uni.getStorageSync('app_theme') === 'dark')
const currentYear = new Date().getFullYear()
const features = [
  { icon: 'camera_scan', name: '拍照识别', desc: '拍照获取分类建议' },
  { icon: 'ai_assistant', name: 'AI 环保助手', desc: '查询分类与环保问题' },
  { icon: 'device_connect', name: '智能投放', desc: '查看设备投放与积分' },
  { icon: 'recognition_history', name: '分类记录', desc: '回看识别与投放历史' },
  { icon: 'nearby_map', name: '附近设备', desc: '查找附近分类设施' },
  { icon: 'store', name: '积分商城', desc: '浏览并兑换环保好物' },
  { icon: 'achievements', name: '挑战成就', desc: '答题挑战，记录成就' },
  { icon: 'community_home', name: '社区交流', desc: '分享环保行动' }
]

function checkTheme() {
  const theme = uni.getStorageSync('app_theme')
  isDarkTheme.value = theme === 'dark'
}

const currentVersion = manifest?.versionName || '1.4.6'

function downloadApp() {
  const url = appDownloadUrl(baseUrl)
  // #ifdef H5
  window.open(url, '_blank')
  // #endif
  // #ifndef H5 || APP-PLUS
  uni.setClipboardData({
    data: url,
    success: () => uni.showModal({ title: '下载 APP', content: '下载链接已复制，请在手机浏览器中打开，下载 Android 安装包。', showCancel: false }),
    fail: () => uni.showModal({ title: '下载 APP', content: `请在浏览器中打开：${url}`, showCancel: false })
  })
  // #endif
}

function openProfileWebview() {
  const targets = [
    'https://www.yuque.com/ssfzx',
    'https://blog.csdn.net/m0_55046343?type=blog',
    'https://github.com/blinkfy'
  ]
  const target = targets[Math.floor(Math.random() * targets.length)]
  if (target.includes('github')) {
    //分环境：
    // #ifdef H5
    window.open(target, '_blank')
    // #endif
    // #ifdef APP-PLUS
    if (typeof plus !== 'undefined' && plus.runtime && plus.runtime.openURL) {
      plus.runtime.openURL(target) // 使用系统浏览器打开
    } else {
      uni.navigateTo({ url: `/pages-nonTheme/webview?url=${encodeURIComponent(target)}` })
    }
    // #endif
    // #ifdef MP-WEIXIN
    uni.navigateTo({
      url: `/pages-nonTheme/webview?url=${encodeURIComponent(target)}`
    })
    // #endif
  } else {
    // App 和小程序环境可以尝试 web-view 或系统浏览器
    uni.navigateTo({
      url: `/pages-nonTheme/webview?url=${encodeURIComponent(target)}`
    })
  }
}

onMounted(() => {
  checkTheme()
})
</script>

<style scoped>
/* ===== 主容器 ===== */
.about-container {
  min-height: 100vh;
  background: linear-gradient(180deg, #f0fdf4 0%, #f5f7fa 30%, #f0f9ff 70%, #f5f7fa 100%);
  position: relative;
  overflow: hidden;
  padding: 0 0 80rpx 0;
  padding-bottom: env(safe-area-inset-bottom);
  transition: all 0.3s ease;
}

/* 暗色主题 */
.about-container.dark-theme {
  background: linear-gradient(135deg, #28285f 0%, #28346f 30%, #322c8a 70%, #442977 100%);
}

/* 安全区域占位 */
.safe-area-top {
  height: env(safe-area-inset-top);
  min-height: 44rpx;
}

/* ===== 背景效果 ===== */
.bg-effects {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  pointer-events: none;
}

.bg-grid {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  transition: all 0.3s ease;
}

/* 浅色模式背景 */
.about-container .bg-grid {
  background-image:
    radial-gradient(circle at 20% 30%, rgba(16, 185, 129, 0.08) 0%, transparent 50%),
    radial-gradient(circle at 80% 70%, rgba(52, 211, 153, 0.06) 0%, transparent 40%);
}

/* 暗色模式背景 */
.about-container.dark-theme .bg-grid {
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px);
  background-size: 50px 50px;
  animation: gridDrift 25s linear infinite;
}

@keyframes gridDrift {
  0% {
    transform: translate(0, 0);
  }

  100% {
    transform: translate(50px, 50px);
  }
}

.floating-elements {
  position: absolute;
  width: 100%;
  height: 100%;
}

.float-item {
  position: absolute;
  width: 8rpx;
  height: 8rpx;
  border-radius: 50%;
  animation: floatUp 12s ease-in-out infinite;
}

/* 浅色模式浮动粒子 */
.about-container .float-item {
  width: 8rpx;
  height: 8rpx;
  background: rgba(16, 185, 129, 0.3);
}

/* 暗色模式浮动粒子 */
.about-container.dark-theme .float-item {
  width: 6px;
  height: 6px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.6) 0%, transparent 70%);
}

.float-item:nth-child(1) {
  left: 10%;
  animation-delay: 0s;
}

.float-item:nth-child(2) {
  left: 30%;
  animation-delay: 3s;
}

.float-item:nth-child(3) {
  left: 60%;
  animation-delay: 6s;
}

.float-item:nth-child(4) {
  left: 85%;
  animation-delay: 9s;
}

@keyframes floatUp {
  0% {
    transform: translateY(100vh) scale(0);
    opacity: 0;
  }

  10% {
    opacity: 1;
  }

  90% {
    opacity: 1;
  }

  100% {
    transform: translateY(-10vh) scale(1);
    opacity: 0;
  }
}

/* ===== 蓝橙球形装饰（仅浅色模式） ===== */
.bg-circle {
  position: absolute;
  border-radius: 50%;
  opacity: 0.12;
  pointer-events: none;
}

.circle-blue {
  width: 500rpx;
  height: 500rpx;
  background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%);
  top: 300rpx;
  left: -200rpx;
  animation: circleFloat1 10s ease-in-out infinite;
}

.circle-orange {
  width: 450rpx;
  height: 450rpx;
  background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%);
  top: 600rpx;
  right: -180rpx;
  animation: circleFloat2 12s ease-in-out infinite;
}

.circle-green {
  width: 400rpx;
  height: 400rpx;
  background: linear-gradient(135deg, #10b981 0%, #34d399 100%);
  bottom: 200rpx;
  left: 100rpx;
  animation: circleFloat3 8s ease-in-out infinite;
}

@keyframes circleFloat1 {

  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }

  25% {
    transform: translate(30rpx, -20rpx) scale(1.02);
  }

  50% {
    transform: translate(20rpx, 30rpx) scale(0.98);
  }

  75% {
    transform: translate(-10rpx, 20rpx) scale(1.01);
  }
}

@keyframes circleFloat2 {

  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }

  33% {
    transform: translate(-20rpx, 40rpx) scale(1.03);
  }

  66% {
    transform: translate(30rpx, -30rpx) scale(0.97);
  }
}

@keyframes circleFloat3 {

  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }

  20% {
    transform: translate(40rpx, 10rpx) scale(1.02);
  }

  40% {
    transform: translate(20rpx, -40rpx) scale(0.99);
  }

  60% {
    transform: translate(-30rpx, -20rpx) scale(1.01);
  }

  80% {
    transform: translate(-20rpx, 30rpx) scale(0.98);
  }
}

/* ===== 内容容器 ===== */
.content-wrapper {
  position: relative;
  z-index: 10;
  max-width: 900px;
  margin: 0 auto;
  padding: 20rpx 40rpx 0;
  display: flex;
  flex-direction: column;
  gap: 40rpx;
}

/* ===== 应用信息卡片 ===== */
.info-card {
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(20px);
  border-radius: 30rpx;
  padding: 50rpx 40rpx;
  text-align: center;
  box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.about-container.dark-theme .info-card {
  background: rgba(30, 30, 50, 0.78);
  box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, 0.4);
}

.app-icon {
  width: 220rpx;
  height: 220rpx;
  margin: 0 auto 20rpx auto;
  display: block;
  border-radius: 20rpx;
  object-fit: cover;
  animation: iconBounce 3s ease-in-out infinite;
}

@keyframes iconBounce {

  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-10rpx);
  }
}

.app-name {
  display: block;
  font-size: 48rpx;
  font-weight: 700;
  color: #2d3748;
  margin-bottom: 1rpx;
  letter-spacing: 1rpx;
  transition: color 0.3s ease;
}

.about-container.dark-theme .app-name {
  color: #e0e0e0;
}

.app-version {
  display: block;
  font-size: 24rpx;
  color: #718096;
  margin-bottom: 16rpx;
  font-family: 'Courier New', monospace;
  transition: color 0.3s ease;
}

.about-container.dark-theme .app-version {
  color: #a0a0c0;
}

.app-slogan {
  display: block;
  font-size: 28rpx;
  color: #4a5568;
  line-height: 1.5;
  font-weight: 500;
  margin-bottom: 8rpx;
  transition: color 0.3s ease;
}

.version-actions {
  display: flex;
  justify-content: center;
  margin-top: 18rpx;
}

.check-update {
  padding: 12rpx 28rpx;
  border-radius: 999rpx;
  border: 2rpx solid rgba(16, 185, 129, 0.24);
  background: rgba(16, 185, 129, 0.08);
  color: #047857;
  font-size: 24rpx;
  cursor: pointer;
}

.check-update.checking { opacity: 0.55; }

.about-container.dark-theme .check-update {
  color: #bbf7d0;
  border-color: rgba(187, 247, 208, 0.25);
  background: rgba(16, 185, 129, 0.15);
}

.about-container.dark-theme .app-slogan {
  color: #b0b0d0;
}

.info-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  margin-top: 18rpx;
}

.version-block {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.update-message {
  font-size: 20rpx;
  color: #2d3748;
  padding: 6rpx 10rpx;
  background: rgba(16, 185, 129, 0.08);
  border-radius: 8rpx;
  cursor: pointer;
  transition: all 0.3s ease;
}

.about-container.dark-theme .update-message {
  background: rgba(64, 224, 255, 0.06);
}

.update-message.highlight {
  animation: highlightPulse 1.2s ease-in-out;
}

@keyframes highlightPulse {
  0% {
    box-shadow: 0 0 0rpx rgba(16, 185, 129, 0.0);
    transform: scale(1);
  }

  20% {
    box-shadow: 0 0 18rpx rgba(16, 185, 129, 0.22);
    transform: scale(1.02);
  }

  60% {
    box-shadow: 0 0 10rpx rgba(16, 185, 129, 0.12);
    transform: scale(1.01);
  }

  100% {
    box-shadow: 0 0 0rpx rgba(16, 185, 129, 0.0);
    transform: scale(1);
  }
}

.new-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4rpx 8rpx;
  margin-left: 8rpx;
  background: linear-gradient(90deg, #ff8a65, #ff6b6b);
  color: #fff;
  font-size: 18rpx;
  border-radius: 12rpx;
  box-shadow: 0 6rpx 18rpx rgba(255, 107, 107, 0.12);
}

.new-badge.shake {
  animation: badgeShake 0.6s cubic-bezier(.36, .07, .19, .97) 0s both;
}

@keyframes badgeShake {

  10%,
  90% {
    transform: translateX(-1rpx);
  }

  20%,
  80% {
    transform: translateX(2rpx);
  }

  30%,
  50%,
  70% {
    transform: translateX(-4rpx);
  }

  40%,
  60% {
    transform: translateX(4rpx);
  }
}

/* ===== 功能介绍 ===== */
.features-section {
  background: rgba(255, 255, 255, 0.74);
  backdrop-filter: blur(15px);
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 22rpx;
  padding: 28rpx 22rpx;
  box-shadow: 0 8rpx 28rpx rgba(30, 70, 55, 0.06);
  transition: all 0.3s ease;
}

.about-container.dark-theme .features-section {
  background: rgba(30, 30, 50, 0.72);
  border-color: rgba(255, 255, 255, 0.06);
  box-shadow: 0 8rpx 28rpx rgba(0, 0, 0, 0.22);
}

.section-title {
  display: block;
  font-size: 36rpx;
  font-weight: 600;
  color: #2d3748;
  margin-bottom: 30rpx;
  text-align: center;
  transition: color 0.3s ease;
}

.section-intro {
  display: block;
  margin: -14rpx 0 24rpx;
  color: #64748b;
  font-size: 24rpx;
  line-height: 1.5;
  text-align: center;
}

.about-container.dark-theme .section-intro { color: #aeb9d6; }

.about-container.dark-theme .section-title {
  color: #e0e0e0;
}

.features-section .section-title {
  position: relative;
  margin-bottom: 28rpx;
  padding-left: 18rpx;
  text-align: left;
}

.features-section .section-title::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  width: 5rpx;
  height: 32rpx;
  border-radius: 4rpx;
  background: #10b981;
  transform: translateY(-50%);
}

.features-section .section-intro {
  margin: -14rpx 0 24rpx 18rpx;
  text-align: left;
}

.feature-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
}

@media (min-width: 800px) {
  .feature-list { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}

.feature-item {
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 26rpx 14rpx;
  border: 0;
  border-bottom: 1px solid rgba(16, 100, 75, 0.12);
  transition: all 0.3s ease;
}

.feature-item:nth-child(odd) {
  border-right: 1px solid rgba(16, 100, 75, 0.12);
}

.feature-item:nth-last-child(-n + 2) {
  border-bottom: 0;
}

@media (min-width: 800px) {
  .feature-item:nth-child(odd) { border-right: 0; }
  .feature-item:nth-child(4n + 1),
  .feature-item:nth-child(4n + 2),
  .feature-item:nth-child(4n + 3) { border-right: 1px solid rgba(16, 100, 75, 0.12); }
  .feature-item:nth-last-child(-n + 4) { border-bottom: 0; }
}

/* 浅色模式功能项 */
.about-container .feature-item {
  background: transparent;
}

/* 暗色模式功能项 */
.about-container.dark-theme .feature-item {
  background: transparent;
  border-color: rgba(255, 255, 255, 0.1);
}

.feature-symbol {
  display: flex;
  flex: 0 0 64rpx;
  align-items: center;
  justify-content: center;
  width: 64rpx;
  height: 64rpx;
  margin-right: 12rpx;
  border-radius: 18rpx;
  background: rgba(16, 185, 129, 0.08);
}

.about-container.dark-theme .feature-symbol {
  background: rgba(102, 126, 234, 0.14);
}

.feature-icon {
  filter: saturate(0.78);
  opacity: 0.9;
}

.feature-info {
  flex: 1;
  min-width: 0;
}

.feature-name {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: #2d3748;
  margin-bottom: 4rpx;
  transition: color 0.3s ease;
}

.about-container.dark-theme .feature-name {
  color: #e0e0e0;
}

.feature-desc {
  display: block;
  font-size: 21rpx;
  color: #718096;
  line-height: 1.4;
  transition: color 0.3s ease;
}

@media (max-width: 600px) {
  .features-section { padding: 32rpx 20rpx; }
  .feature-item { padding: 24rpx 10rpx; }
  .feature-symbol { flex-basis: 60rpx; width: 60rpx; height: 60rpx; margin-right: 10rpx; }
}

.about-container.dark-theme .feature-desc {
  color: #a0a0c0;
}

/* ===== 技术信息 ===== */
.tech-section {
  background: rgba(255, 255, 255, 0.74);
  backdrop-filter: blur(15px);
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 22rpx;
  padding: 26rpx 26rpx;
  box-shadow: 0 8rpx 28rpx rgba(30, 70, 55, 0.06);
  transition: all 0.3s ease;
}

.about-container.dark-theme .tech-section {
  background: rgba(30, 30, 50, 0.72);
  border-color: rgba(255, 255, 255, 0.06);
  box-shadow: 0 8rpx 28rpx rgba(0, 0, 0, 0.22);
}

.tech-info {
  display: flex;
  flex-direction: column;
}

.tech-section .section-title {
  margin-bottom: 12rpx;
  text-align: left;
}

.tech-item {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 14rpx;
  padding: 12rpx 4rpx;
  border-bottom: 1px solid rgba(16, 100, 75, 0.12);
  transition: all 0.3s ease;
}

.tech-item:last-child { border-bottom: 0; }

/* 浅色模式技术项 */
.about-container .tech-item {
  background: transparent;
}

/* 暗色模式技术项 */
.about-container.dark-theme .tech-item {
  background: transparent;
  border-color: rgba(255, 255, 255, 0.1);
}

.tech-index {
  flex: 0 0 34rpx;
  padding-top: 4rpx;
  color: #8ab8a9;
  font-size: 22rpx;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.4;
}

.about-container.dark-theme .tech-index {
  color: #7ca99b;
}

.tech-copy {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
}

.tech-label {
  font-size: 28rpx;
  font-weight: 600;
  color: #168469;
  margin-bottom: 2rpx;
  transition: color 0.3s ease;
}

.about-container.dark-theme .tech-label {
  color: #b0b0d0;
}

.tech-value {
  font-size: 23rpx;
  color: #2d3748;
  line-height: 1.45;
  transition: color 0.3s ease;
}

.about-container.dark-theme .tech-value {
  color: #d0d0e0;
}

/* ===== 开发者信息 ===== */
.developer-section {
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(15px);
  border-radius: 25rpx;
  padding: 40rpx;
  text-align: center;
  box-shadow: 0 15rpx 45rpx rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
}

.about-container.dark-theme .developer-section {
  background: rgba(30, 30, 50, 0.72);
  box-shadow: 0 15rpx 45rpx rgba(0, 0, 0, 0.3);
}

.developer-title {
  display: block;
  font-size: 32rpx;
  font-weight: 600;
  color: #2d3748;
  margin-bottom: 20rpx;
  transition: color 0.3s ease;
}

.about-container.dark-theme .developer-title {
  color: #e0e0e0;
}

.developer-name {
  display: block;
  font-size: 2vh;
  font-weight: 700;
  color: #667eea;
  margin-bottom: 8rpx;
  font-family: 'Courier New', monospace;
  cursor: pointer;
  transition: color 0.3s ease;
}

.about-container.dark-theme .developer-name {
  color: #5B8DEE;
}

.developer-year {
  display: block;
  font-size: 24rpx;
  color: #718096;
  margin-bottom: 20rpx;
  transition: color 0.3s ease;
}

.about-container.dark-theme .developer-year {
  color: #a0a0c0;
}

.developer-motto {
  display: block;
  font-size: 28rpx;
  color: #4a5568;
  font-style: italic;
  line-height: 1.5;
  transition: color 0.3s ease;
}

.about-container.dark-theme .developer-motto {
  color: #b0b0d0;
}

/* ===== 免责声明 ===== */
.disclaimer {
  margin-top: -20rpx;
  padding: 0 8rpx;
  transition: all 0.3s ease;
}

.about-container.dark-theme .disclaimer {
  background: transparent;
}

.disclaimer-text {
  font-size: 20rpx;
  color: #8a9691;
  line-height: 1.4;
  text-align: center;
  transition: color 0.3s ease;
}

.about-container.dark-theme .disclaimer-text {
  color: #8f99aa;
}

/* 响应式设计 */
@media (max-width: 420px) {
  .info-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .content-wrapper {
    padding: 20rpx 20rpx 0;
  }
}
</style>
