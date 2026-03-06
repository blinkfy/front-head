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

    <!-- 返回按钮 -->
    <view class="back-btn" @click="goBack">
      <text class="back-icon">←</text>
    </view>

    <!-- 主内容 -->
    <view class="content-wrapper">
      <!-- 应用信息卡片 -->
      <view class="info-card">
        <image class="app-icon" src="/static/Icon.png" mode="aspectFill" @click="downloadAPK('')"></image>
        <text class="app-name">分投侠</text>
        <text class="app-slogan">智能垃圾分类助手</text>
        <text class="app-version">Version {{ currentVersion }}</text>
        <text class="app-slogan">让垃圾分类更智能，让环保更简单</text>

        <!-- info-card footer: compact update controls (only when update exists) -->
        <view class="info-footer" v-if="hasUpdate">
          <view class="version-block">
            <view v-if="showBadge" :class="['new-badge', { 'shake': badgeShake }]">新版本</view>
            <text :class="['update-message', { highlight: highlight }]" v-if="updateMessage" @click="latestUrl && downloadAPK(latestUrl)">{{ updateMessage }}</text>
          </view>
        </view>
      </view>

      <!-- 功能介绍 -->
      <view class="features-section">
        <text class="section-title">✨ 核心功能</text>
        <view class="feature-list">
          <view class="feature-item">
            <text class="feature-icon">📸</text>
            <view class="feature-info">
              <text class="feature-name">AI智能识别</text>
              <text class="feature-desc">拍照精确在线识别垃圾类别</text>
            </view>
          </view>
          <view class="feature-item">
            <text class="feature-icon">🗺️</text>
            <view class="feature-info">
              <text class="feature-name">垃圾桶地图</text>
              <text class="feature-desc">快速定位附近的分类垃圾桶</text>
            </view>
          </view>
          <view class="feature-item">
            <text class="feature-icon">📚</text>
            <view class="feature-info">
              <text class="feature-name">设备连接</text>
              <text class="feature-desc">连接智能分类设备自动分类</text>
            </view>
          </view>
          <view class="feature-item">
            <text class="feature-icon">🌱</text>
            <view class="feature-info">
              <text class="feature-name">环保积分</text>
              <text class="feature-desc">记录您的环保贡献和减碳量</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 技术信息 -->
      <view class="tech-section">
        <text class="section-title">🔬 技术支持</text>
        <view class="tech-info">
          <view class="tech-item">
            <text class="tech-label">AI模型：</text>
            <text class="tech-value">YOLO11图像识别</text>
          </view>
          <view class="tech-item">
            <text class="tech-label">框架：</text>
            <text class="tech-value">Node.js + Vue3 + uni-app + Python + MySQL + ultralytics</text>
          </view>
          <view class="tech-item">
            <text class="tech-label">数据来源：</text>
            <text class="tech-value">垃圾分类标准数据集·3万张（在线识别）<br/> 自研高质量数据集 · 1万张 （装置识别）</text>
          </view>
        </view>
      </view>

      <!-- 开发信息 -->
      <view class="developer-section">
        <text class="developer-title">👨‍💻 开发团队</text>
        <text class="developer-name" @click="openProfileWebview">@xvan</text>
        <text class="developer-year">2025</text>
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
import request from '@/api/index'
import manifest from '@/manifest.json'
import { ref, onMounted } from 'vue'

// 主题相关
const isDarkTheme = ref(false)

function checkTheme() {
  const theme = uni.getStorageSync('app_theme')
  isDarkTheme.value = theme === 'dark'
}

function goBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      uni.navigateBack()
    } else {
      uni.reLaunch({
        url: '/pages/home/home'
      })
    }
}

const currentVersion = manifest?.versionName || '1.3.4'

const checking = ref(false)
const updateMessage = ref('')
const latestUrl = ref('')
const hasUpdate = ref(false)
const highlight = ref(false)
const showBadge = ref(false)
const badgeShake = ref(false)

function downloadAPK(apkUrl) {
  let apk = '/files/download/classfication.apk'
  if(apkUrl&&apkUrl!= '') apk = apkUrl
  // 分环境处理下载
  // #ifdef H5
    window.open(apk, '_blank')
  // #endif
  // #ifdef APP-PLUS
    uni.navigateTo({
      url: `/pages-nonTheme/webview?url=${encodeURIComponent(baseUrl + apk)}`
    })
  // #endif
  // #ifdef MP-WEIXIN
    uni.showToast({ title: '请在浏览器中下载 APK 文件', icon: 'none' })
    uni.navigateTo({
      url: `/pages-nonTheme/webview?url=${encodeURIComponent(baseUrl + apk)}`
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
  if(target.includes('github')) {
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

// 版本检查逻辑
function compareVersion(a = '0.0.0', b = '0.0.0') {
  const pa = String(a).split('.').map(n => parseInt(n || 0, 10))
  const pb = String(b).split('.').map(n => parseInt(n || 0, 10))
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

async function checkLatestVersion() {
  checking.value = true
  updateMessage.value = ''
  try {
    // 后端接口假定为 /api/app/version，返回结构可能为 { code:0, data: { versionName, versionCode, url } }
    const res = await request({ url: '/api/version', method: 'GET' })
    // request 返回的可能是 res.data 或直接 data
    const payload = res?.data || res || {}
    const latest = payload.versionName || payload.version || payload.latestVersion || (payload.data && payload.data.versionName) || ''
    const download = (payload.url || (payload.data && payload.data.url)) || ''
    if (!latest) {
      updateMessage.value = '未从服务器获取到版本信息'
      hasUpdate.value = false
    } else {
      if (compareVersion(latest, currentVersion) <= 0) {
        // 已是最新，隐藏更新控件
        updateMessage.value = ''
        latestUrl.value = ''
        hasUpdate.value = false
      } else {
        latestUrl.value = download
        updateMessage.value = `发现新版本 ${latest}，点击下载更新`
        hasUpdate.value = true
        // trigger short highlight animation
        highlight.value = true
        showBadge.value = false
        setTimeout(() => { 
          highlight.value = false; 
          showBadge.value = true
          // trigger a short shake animation
          badgeShake.value = true
          setTimeout(() => { badgeShake.value = false }, 600)
        }, 1200)
        // 在 App 或 H5 可直接使用 downloadAPK(latestUrl.value)；在小程序中引导打开浏览器
      }
    }
  } catch (e) {
    console.error('checkLatestVersion error', e)
    updateMessage.value = '检查失败，请稍后重试'
  } finally {
    checking.value = false
  }
}

onMounted(() => {
  checkTheme()
  // 页面打开时自动检测一次
  checkLatestVersion()
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
  0% { transform: translate(0, 0); }
  100% { transform: translate(50px, 50px); }
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

.float-item:nth-child(1) { left: 10%; animation-delay: 0s; }
.float-item:nth-child(2) { left: 30%; animation-delay: 3s; }
.float-item:nth-child(3) { left: 60%; animation-delay: 6s; }
.float-item:nth-child(4) { left: 85%; animation-delay: 9s; }

@keyframes floatUp {
  0% { transform: translateY(100vh) scale(0); opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { transform: translateY(-10vh) scale(1); opacity: 0; }
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
  0%, 100% { transform: translate(0, 0) scale(1); }
  25% { transform: translate(30rpx, -20rpx) scale(1.02); }
  50% { transform: translate(20rpx, 30rpx) scale(0.98); }
  75% { transform: translate(-10rpx, 20rpx) scale(1.01); }
}

@keyframes circleFloat2 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(-20rpx, 40rpx) scale(1.03); }
  66% { transform: translate(30rpx, -30rpx) scale(0.97); }
}

@keyframes circleFloat3 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  20% { transform: translate(40rpx, 10rpx) scale(1.02); }
  40% { transform: translate(20rpx, -40rpx) scale(0.99); }
  60% { transform: translate(-30rpx, -20rpx) scale(1.01); }
  80% { transform: translate(-20rpx, 30rpx) scale(0.98); }
}

/* ===== 返回按钮 ===== */
.back-btn {
  position: absolute;
  top: 20rpx;
  left: 20rpx;
  width: 80rpx;
  height: 80rpx;
  backdrop-filter: blur(10px);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  transition: all 0.3s ease;
  cursor: pointer;
}

/* 浅色模式返回按钮 */
.about-container .back-btn {
  background: rgba(16, 185, 129, 0.1);
  border: 2px solid rgba(16, 185, 129, 0.3);
}

.about-container .back-btn:active {
  transform: scale(0.9);
  background: rgba(16, 185, 129, 0.2);
}

/* 暗色模式返回按钮 */
.about-container.dark-theme .back-btn {
  background: rgba(137, 136, 136, 0.503);
  border: 2px solid rgba(255, 255, 255, 0.6);
}

.about-container.dark-theme .back-btn:active {
  background: rgba(255, 255, 255, 0.3);
}

.back-icon {
  font-size: 32rpx;
  font-weight: bold;
  transition: color 0.3s ease;
}

/* ǳɫģʽicon */
.about-container .back-icon {
  color: #059669;
}

/* 暗色模式icon */
.about-container.dark-theme .back-icon {
  color: #ffffff;
}

/* ===== 内容容器 ===== */
.content-wrapper {
  position: relative;
  z-index: 10;
  padding: 20rpx 40rpx 0;
  display: flex;
  flex-direction: column;
  gap: 40rpx;
}

/* ===== 应用信息卡片 ===== */
.info-card {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  border-radius: 30rpx;
  padding: 50rpx 40rpx;
  text-align: center;
  box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.about-container.dark-theme .info-card {
  background: rgba(30, 30, 50, 0.85);
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
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10rpx); }
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
  0% { box-shadow: 0 0 0rpx rgba(16, 185, 129, 0.0); transform: scale(1); }
  20% { box-shadow: 0 0 18rpx rgba(16, 185, 129, 0.22); transform: scale(1.02); }
  60% { box-shadow: 0 0 10rpx rgba(16, 185, 129, 0.12); transform: scale(1.01); }
  100% { box-shadow: 0 0 0rpx rgba(16, 185, 129, 0.0); transform: scale(1); }
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
  10%, 90% { transform: translateX(-1rpx); }
  20%, 80% { transform: translateX(2rpx); }
  30%, 50%, 70% { transform: translateX(-4rpx); }
  40%, 60% { transform: translateX(4rpx); }
}

/* ===== 功能介绍 ===== */
.features-section {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(15px);
  border-radius: 25rpx;
  padding: 40rpx 30rpx;
  box-shadow: 0 15rpx 45rpx rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
}

.about-container.dark-theme .features-section {
  background: rgba(30, 30, 50, 0.8);
  box-shadow: 0 15rpx 45rpx rgba(0, 0, 0, 0.3);
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

.about-container.dark-theme .section-title {
  color: #e0e0e0;
}

.feature-list {
  display: flex;
  flex-direction: column;
  gap: 25rpx;
}

.feature-item {
  display: flex;
  align-items: center;
  padding: 20rpx;
  border-radius: 20rpx;
  transition: all 0.3s ease;
  border-left: 6rpx solid;
}

/* 浅色模式功能项 */
.about-container .feature-item {
  background: rgba(16, 185, 129, 0.05);
  border-left-color: #10b981;
}

/* 暗色模式功能项 */
.about-container.dark-theme .feature-item {
  background: rgba(102, 126, 234, 0.15);
  border-left-color: #667eea;
}

.feature-icon {
  font-size: 40rpx;
  margin-right: 20rpx;
  flex-shrink: 0;
}

.feature-info {
  flex: 1;
}

.feature-name {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: #2d3748;
  margin-bottom: 6rpx;
  transition: color 0.3s ease;
}

.about-container.dark-theme .feature-name {
  color: #e0e0e0;
}

.feature-desc {
  display: block;
  font-size: 26rpx;
  color: #718096;
  line-height: 1.4;
  transition: color 0.3s ease;
}

.about-container.dark-theme .feature-desc {
  color: #a0a0c0;
}

/* ===== 技术信息 ===== */
.tech-section {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(15px);
  border-radius: 25rpx;
  padding: 40rpx 30rpx;
  box-shadow: 0 15rpx 45rpx rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
}

.about-container.dark-theme .tech-section {
  background: rgba(30, 30, 50, 0.8);
  box-shadow: 0 15rpx 45rpx rgba(0, 0, 0, 0.3);
}

.tech-info {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.tech-item {
  display: flex;
  align-items: center;
  padding: 15rpx 20rpx;
  border-radius: 15rpx;
  transition: all 0.3s ease;
}

/* 浅色模式技术项 */
.about-container .tech-item {
  background: rgba(16, 185, 129, 0.05);
}

/* 暗色模式技术项 */
.about-container.dark-theme .tech-item {
  background: rgba(102, 126, 234, 0.15);
}

.tech-label {
  font-size: 28rpx;
  font-weight: 600;
  color: #4a5568;
  min-width: 120rpx;
  transition: color 0.3s ease;
}

.about-container.dark-theme .tech-label {
  color: #b0b0d0;
}

.tech-value {
  font-size: 28rpx;
  color: #2d3748;
  flex: 1;
  transition: color 0.3s ease;
}

.about-container.dark-theme .tech-value {
  color: #d0d0e0;
}

/* ===== 开发者信息 ===== */
.developer-section {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(15px);
  border-radius: 25rpx;
  padding: 40rpx;
  text-align: center;
  box-shadow: 0 15rpx 45rpx rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
}

.about-container.dark-theme .developer-section {
  background: rgba(30, 30, 50, 0.8);
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
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
  border-radius: 20rpx;
  padding: 25rpx 30rpx;
  border: 2px solid rgba(255, 193, 7, 0.3);
  box-shadow: 0 10rpx 30rpx rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease;
}

.about-container.dark-theme .disclaimer {
  background: rgba(30, 30, 50, 0.8);
  border-color: rgba(255, 193, 7, 0.2);
  box-shadow: 0 10rpx 30rpx rgba(0, 0, 0, 0.3);
}

.disclaimer-text {
  font-size: 24rpx;
  color: #856404;
  line-height: 1.5;
  text-align: center;
  transition: color 0.3s ease;
}

.about-container.dark-theme .disclaimer-text {
  color: #d4a574;
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
