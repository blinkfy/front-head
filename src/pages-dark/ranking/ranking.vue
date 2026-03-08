<template>
  <view class="ranking-container">
    <!-- 动态科技背景 -->
    <view class="tech-background">
      <view class="grid-overlay"></view>
      <view class="floating-particles">
        <view class="particle" v-for="n in 8" :key="n" :style="{ animationDelay: (n * 0.3) + 's' }"></view>
      </view>
      <view class="data-streams">
        <view class="stream" v-for="n in 4" :key="n"></view>
      </view>
    </view>

    <!-- 顶部导航栏 -->
    <view class="navbar">
      <!-- 顶部安全区域占位 -->
      <view class="safe-area-top"></view>
      <view class="nav-content">
        <view class="nav-left">
          <text class="back-btn" @click="goBack">←</text>
        </view>
        <text class="nav-title">环保排行榜</text>
        <view class="nav-right">
          <text class="refresh-btn" @click="refreshRanking" :class="{ rotating: loading }">♻️</text>
        </view>
      </view>
    </view>

    <!-- 时间范围显示 -->
    <view class="period-info" v-if="rankingData">
      <view class="period-card">
        <text class="period-icon">📊</text>
        <view class="period-content">
          <text class="period-title">统计周期</text>
          <text class="period-desc">过去30天 ({{ formatDate(rankingData.period_range.start) }} - {{ formatDate(rankingData.period_range.end) }})</text>
        </view>
      </view>
    </view>

    <!-- 排行榜内容 -->
    <view class="ranking-content">
      <view class="loading-section" v-if="loading">
        <view class="loading-spinner"></view>
        <text class="loading-text">加载排行榜中...</text>
      </view>

      <view v-else-if="rankingData && rankingData.ranking.length > 0" class="ranking-list">
        <!-- 前三名特殊展示 -->
        <view class="top-three">
          <view v-for="(user, index) in rankingData.ranking.slice(0, 3)" :key="user.rank" 
                class="top-item" :class="'rank-' + user.rank">
            <view class="rank-medal">
              <text class="medal-icon">{{ getMedalIcon(user.rank) }}</text>
              <view class="medal-glow"></view>
            </view>
            <view class="top-user-info">
              <text class="top-username">{{ user.username }}</text>
              <text class="top-points">{{ user.monthly_points }}分</text>
              <text class="top-total">总积分 {{ user.total_points }}</text>
            </view>
            <view class="podium-base"></view>
          </view>
        </view>

        <!-- 其他排名 -->
        <view class="ranking-table">
          <view class="table-header">
            <text class="header-rank">排名</text>
            <text class="header-user">用户</text>
            <text class="header-total">总积分</text>
            <text class="header-points">本月</text>
            <text class="header-count">次数</text>
          </view>
          
          <view v-for="(user, index) in rankingData.ranking.slice(3)" :key="user.rank" 
                class="table-row" :class="{ 'my-rank': isCurrentUser(user.username) }">
            <view class="rank-cell">
              <text class="rank-number">{{ user.rank }}</text>
            </view>
            <view class="user-cell">
              <view class="user-avatar">
                <text class="avatar-text">{{ user.username.charAt(0) }}</text>
              </view>
              <text class="username">{{ user.username }}</text>
            </view>
            <view class="total-cell">
              <text class="total-number">{{ user.total_points }}</text>
              <text class="total-unit">分</text>
            </view>
            <view class="points-cell">
              <text class="points-number">{{ user.monthly_points }}</text>
              <text class="points-unit">分</text>
            </view>
            <view class="count-cell">
              <text class="count-number">{{ user.monthly_count }}</text>
              <text class="count-unit">次</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 空状态 -->
      <view v-else class="empty-state">
        <text class="empty-icon">📊</text>
        <text class="empty-title">暂无排行榜数据</text>
        <text class="empty-desc">开始垃圾分类，争夺环保榜首！</text>
      </view>
    </view>

    <!-- 统计信息 -->
    <view class="stats-footer" v-if="rankingData">
      <view class="stats-card">
        <view class="stats-item">
          <text class="stats-value">{{ rankingData.total_users }}</text>
          <text class="stats-label">参与用户</text>
        </view>
        <view class="stats-divider"></view>
        <view class="stats-item">
          <text class="stats-value">{{ formatUpdateTime(rankingData.update_time) }}</text>
          <text class="stats-label">更新时间</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getRanking } from '@/api/ranking'

const rankingData = ref(null)
const loading = ref(false)
const currentUsername = ref('')

// 页面参数接收
const onLoad = (options) => {
  // 如果有传入来源参数，存储起来
  if (options && options.from) {
    uni.setStorageSync('tempReferrer', options.from)
  }
}

// 暴露 onLoad 函数供 uni-app 调用
defineExpose({
  onLoad
})

// 设置页面来源信息
const setupPageReferrer = () => {
  // 获取页面栈信息
  const pages = getCurrentPages()
  
  // 如果有上一个页面，记录来源信息
  if (pages.length > 1) {
    const prevPage = pages[pages.length - 2]
    const prevRoute = prevPage.route || ''
    
    // 根据上一个页面的路径判断来源
    if (prevRoute.includes('home')) {
      uni.setStorageSync('rankingReferrer', 'home')
    } else if (prevRoute.includes('profile')) {
      uni.setStorageSync('rankingReferrer', 'profile')
    } else if (prevRoute.includes('scan')) {
      uni.setStorageSync('rankingReferrer', 'scan')
    } else {
      // 默认来源为首页
      uni.setStorageSync('rankingReferrer', 'home')
    }
  } else {
    // 没有上一个页面时，检查URL参数或默认设置
    // 可以通过 onLoad 方法传入的参数来判断
    const referrer = uni.getStorageSync('tempReferrer') || 'home'
    uni.setStorageSync('rankingReferrer', referrer)
    uni.removeStorageSync('tempReferrer')
  }
}

onMounted(async () => {
  // 设置当前页面的来源信息（用于智能返回）
  setupPageReferrer()
  
  // 获取当前用户名
  const savedUser = uni.getStorageSync('savedUser')
  if (savedUser && savedUser.username) {
    currentUsername.value = savedUser.username
  }
  
  await loadRanking()
})

// 加载排行榜数据
const loadRanking = async () => {
  try {
    loading.value = true
    const response = await getRanking()
    
    if (response.code === 0) {
      rankingData.value = response.data
    } else {
      uni.showToast({
        title: response.msg || '获取排行榜失败',
        icon: 'none'
      })
    }
  } catch (error) {
    console.error('加载排行榜失败:', error)
    uni.showToast({
      title: '网络错误，请稍后重试',
      icon: 'none'
    })
  } finally {
    loading.value = false
  }
}

// 刷新排行榜
const refreshRanking = async () => {
  await loadRanking()
  uni.showToast({
    title: '刷新成功',
    icon: 'success'
  })
}

// 智能返回上一页
const goBack = () => {
  // 获取页面栈信息
  const pages = getCurrentPages()
  
  // 如果页面栈中有多于1个页面，说明可以正常返回
  if (pages.length > 1) {
    uni.navigateBack({
      delta: 1,
      fail: () => {
        // 返回失败时的备选方案
        console.log('navigateBack failed, using backup navigation')
        handleBackupNavigation()
      }
    })
  } else {
    // 页面栈中只有当前页面，执行备选导航方案
    console.log('No previous page in stack, using backup navigation')
    handleBackupNavigation()
  }
}

// 备选导航方案
const handleBackupNavigation = () => {  
  // 检查是否是从特定页面进入的（通过页面参数或存储）
  const referrerPage = uni.getStorageSync('rankingReferrer')
  
  if (referrerPage) {
    // 清除存储的来源页面信息
    uni.removeStorageSync('rankingReferrer')
    
    // 延迟一下再跳转，让用户看到提示
    setTimeout(() => {
      // 根据来源页面进行导航
      switch (referrerPage) {
        case 'home':
          uni.reLaunch({ url: '/pages-dark/home/home' })
          break
        case 'profile':
          uni.reLaunch({ url: '/pages-dark/profile/profile' })
          break
        case 'scan':
          uni.reLaunch({ url: '/pages-dark/scan/scan' })
          break
        default:
          uni.reLaunch({ url: '/pages-dark/home/home' })
          break
      }
    }, 500)
  } else {
    // 默认返回首页
    setTimeout(() => {
      uni.reLaunch({ url: '/pages-dark/home/home' })
    }, 500)
  }
}

// 获取奖牌图标
const getMedalIcon = (rank) => {
  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' }
  return medals[rank] || '🏅'
}

// 判断是否为当前用户
const isCurrentUser = (username) => {
  return username === currentUsername.value
}

// 格式化日期
const formatDate = (dateString) => {
  const date = new Date(dateString)
  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric'
  })
}

// 格式化更新时间
const formatUpdateTime = (dateString) => {
  const date = new Date(dateString)
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<style scoped>
/* 主容器 */
.ranking-container {
  min-height: 100vh;
  background: radial-gradient(ellipse at center, #0a1a2f 0%, #051015 70%, #000508 100%);
  position: relative;
  overflow: hidden;
  padding: 0; /* 取消根容器顶部 env 填充，避免与自定义导航重复 */
  padding-bottom: env(safe-area-inset-bottom);
}

/* 动态科技背景 */
.tech-background {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  pointer-events: none;
}

.grid-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: 
    linear-gradient(rgba(64, 224, 255, 0.1) 1px, transparent 1px),
    linear-gradient(90deg, rgba(64, 224, 255, 0.1) 1px, transparent 1px);
  background-size: 40px 40px;
  animation: gridMove 25s linear infinite;
}

@keyframes gridMove {
  0% { transform: translate(0, 0); }
  100% { transform: translate(40px, 40px); }
}

.floating-particles {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.particle {
  position: absolute;
  width: 3px;
  height: 3px;
  background: radial-gradient(circle, #40e0ff 0%, transparent 70%);
  border-radius: 50%;
  animation: floatParticle 6s ease-in-out infinite;
}

.particle:nth-child(1) { top: 15%; left: 20%; }
.particle:nth-child(2) { top: 35%; left: 70%; }
.particle:nth-child(3) { top: 55%; left: 15%; }
.particle:nth-child(4) { top: 75%; left: 85%; }
.particle:nth-child(5) { top: 25%; left: 50%; }
.particle:nth-child(6) { top: 65%; left: 40%; }
.particle:nth-child(7) { top: 85%; left: 60%; }
.particle:nth-child(8) { top: 45%; left: 90%; }

@keyframes floatParticle {
  0%, 100% { transform: translateY(0) scale(1); opacity: 0.4; }
  50% { transform: translateY(-25px) scale(1.3); opacity: 1; }
}

.data-streams {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.stream {
  position: absolute;
  width: 1px;
  height: 100%;
  background: linear-gradient(0deg, 
    transparent 0%, 
    #40e0ff 20%, 
    transparent 40%, 
    transparent 60%, 
    #00ff88 80%, 
    transparent 100%);
  animation: streamFlow 5s linear infinite;
}

.stream:nth-child(1) { left: 25%; animation-delay: 0s; }
.stream:nth-child(2) { left: 50%; animation-delay: 1s; }
.stream:nth-child(3) { left: 75%; animation-delay: 2s; }
.stream:nth-child(4) { left: 90%; animation-delay: 1.5s; }

@keyframes streamFlow {
  0% { transform: translateY(-100%); opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { transform: translateY(100%); opacity: 0; }
}

/* 导航栏 */
.navbar {
  position: relative;
  z-index: 10;
  background: rgba(0, 25, 45, 0.9);
  backdrop-filter: blur(15px);
  border-bottom: 1px solid rgba(64, 224, 255, 0.3);
  /* 不直接在容器上加 env(safe-area-inset-top)，统一用 .safe-area-top 占位 */
}

.safe-area-top {
  height: env(safe-area-inset-top); /* iOS 刘海或状态栏高度；Android 通常为0 */
  min-height: 44rpx; /* 兜底的状态栏视觉高度 */
}

.nav-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* 原50rpx 顶部 + 多层 safe-area 导致 iOS 顶部空间过大，调低 */
  padding: 20rpx 40rpx 20rpx;
}

.nav-left, .nav-right {
  width: 80rpx;
}

.back-btn {
  color: #40e0ff;
  font-size: 36rpx;
  font-weight: bold;
  padding: 10rpx;
}

.nav-title {
  color: #40e0ff;
  font-size: 36rpx;
  font-weight: 600;
  letter-spacing: 2rpx;
  text-align: center;
}

.refresh-btn {
  color: #00ff88;
  font-size: 32rpx;
  padding: 10rpx;
  transition: transform 0.3s ease;
}

.refresh-btn.rotating {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 时间范围信息 */
.period-info {
  position: relative;
  z-index: 10;
  margin: 20rpx 40rpx;
}

.period-card {
  background: rgba(0, 30, 55, 0.9);
  backdrop-filter: blur(15px);
  border-radius: 16rpx;
  border: 1px solid rgba(64, 224, 255, 0.3);
  padding: 20rpx 24rpx;
  display: flex;
  align-items: center;
}

.period-icon {
  font-size: 32rpx;
  margin-right: 16rpx;
  filter: drop-shadow(0 0 8rpx rgba(64, 224, 255, 0.6));
}

.period-content {
  flex: 1;
}

.period-title {
  display: block;
  color: #40e0ff;
  font-size: 24rpx;
  font-weight: 600;
  margin-bottom: 4rpx;
}

.period-desc {
  color: rgba(255, 255, 255, 0.7);
  font-size: 20rpx;
  font-family: 'Courier New', monospace;
}

/* 排行榜内容 */
.ranking-content {
  position: relative;
  z-index: 10;
  margin: 20rpx 40rpx;
  flex: 1;
}

/* 加载状态 */
.loading-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80rpx 0;
}

.loading-spinner {
  width: 60rpx;
  height: 60rpx;
  border: 4rpx solid rgba(64, 224, 255, 0.3);
  border-top: 4rpx solid #40e0ff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 20rpx;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.loading-text {
  color: #40e0ff;
  font-size: 28rpx;
}

/* 前三名展示 */
.top-three {
  display: flex;
  justify-content: center;
  align-items: flex-end;
  margin-bottom: 40rpx;
  padding: 40rpx 0;
  background: rgba(0, 25, 45, 0.9);
  backdrop-filter: blur(20px);
  border-radius: 24rpx;
  border: 1px solid rgba(64, 224, 255, 0.3);
  position: relative;
  overflow: hidden;
}

.top-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0 20rpx;
  position: relative;
}

.top-item.rank-1 { order: 2; margin-top: -20rpx; }
.top-item.rank-2 { order: 1; margin-top: 0; }
.top-item.rank-3 { order: 3; margin-top: 10rpx; }

.rank-medal {
  position: relative;
  margin-bottom: 16rpx;
}

.medal-icon {
  font-size: 48rpx;
  filter: drop-shadow(0 0 15rpx rgba(255, 215, 0, 0.8));
}

.medal-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 80rpx;
  height: 80rpx;
  background: radial-gradient(circle, rgba(255, 215, 0, 0.3) 0%, transparent 70%);
  transform: translate(-50%, -50%);
  border-radius: 50%;
  animation: medalGlow 2s ease-in-out infinite;
}

@keyframes medalGlow {
  0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(1); }
  50% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
}

.top-user-info {
  text-align: center;
  margin-bottom: 16rpx;
}

.top-username {
  display: block;
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 600;
  margin-bottom: 8rpx;
  text-shadow: 0 0 10rpx rgba(64, 224, 255, 0.5);
}

.top-points {
  display: block;
  color: #00ff88;
  font-size: 32rpx;
  font-weight: 700;
  margin-bottom: 4rpx;
  text-shadow: 0 0 12rpx rgba(0, 255, 136, 0.6);
}

.top-count {
  display: block;
  color: rgba(255, 255, 255, 0.6);
  font-size: 20rpx;
  font-family: 'Courier New', monospace;
  margin-bottom: 4rpx;
}

.top-total {
  display: block;
  color: #40e0ff;
  font-size: 18rpx;
  font-family: 'Courier New', monospace;
  opacity: 0.8;
}

.podium-base {
  width: 80rpx;
  background: linear-gradient(45deg, #40e0ff, #00ff88);
  border-radius: 8rpx 8rpx 0 0;
  box-shadow: 0 0 20rpx rgba(64, 224, 255, 0.4);
}

.top-item.rank-1 .podium-base { height: 60rpx; }
.top-item.rank-2 .podium-base { height: 45rpx; }
.top-item.rank-3 .podium-base { height: 30rpx; }

/* 排行榜表格 */
.ranking-table {
  background: rgba(0, 25, 45, 0.9);
  backdrop-filter: blur(20px);
  border-radius: 20rpx;
  border: 1px solid rgba(64, 224, 255, 0.3);
  overflow: hidden;
}

.table-header {
  display: grid;
  grid-template-columns: 60rpx 1fr 90rpx 90rpx 70rpx;
  background: rgba(64, 224, 255, 0.1);
  border-bottom: 1px solid rgba(64, 224, 255, 0.3);
  padding: 24rpx 20rpx;
}

.table-header text {
  color: #40e0ff;
  font-size: 22rpx;
  font-weight: 600;
  text-align: center;
}

.header-user {
  text-align: left !important;
  padding-left: 52rpx;
}

.table-row {
  display: grid;
  grid-template-columns: 60rpx 1fr 90rpx 90rpx 70rpx;
  padding: 20rpx;
  border-bottom: 1px solid rgba(64, 224, 255, 0.1);
  transition: all 0.3s ease;
}

.table-row:last-child {
  border-bottom: none;
}

.table-row.my-rank {
  background: rgba(0, 255, 136, 0.1);
  border: 1px solid rgba(0, 255, 136, 0.3);
  border-radius: 12rpx;
  margin: 8rpx;
  padding: 20rpx 16rpx;
}

.rank-cell {
  display: flex;
  align-items: center;
  justify-content: center;
}

.rank-number {
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 600;
  font-family: 'Courier New', monospace;
}

.user-cell {
  display: flex;
  align-items: center;
}

.user-avatar {
  width: 40rpx;
  height: 40rpx;
  background: linear-gradient(45deg, #40e0ff, #00ff88);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12rpx;
}

.avatar-text {
  color: #ffffff;
  font-size: 18rpx;
  font-weight: 600;
}

.username {
  color: #ffffff;
  font-size: 26rpx;
  font-weight: 500;
}

.points-cell, .total-cell, .count-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.points-number, .count-number {
  color: #00ff88;
  font-size: 24rpx;
  font-weight: 600;
  line-height: 1;
}

.total-number {
  color: #40e0ff;
  font-size: 24rpx;
  font-weight: 600;
  line-height: 1;
}

.points-unit, .total-unit, .count-unit {
  color: rgba(255, 255, 255, 0.5);
  font-size: 18rpx;
  margin-top: 2rpx;
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 80rpx 40rpx;
  background: rgba(0, 25, 45, 0.8);
  border-radius: 20rpx;
  border: 1px solid rgba(64, 224, 255, 0.2);
}

.empty-icon {
  font-size: 80rpx;
  display: block;
  margin-bottom: 24rpx;
  filter: grayscale(50%);
}

.empty-title {
  display: block;
  color: rgba(255, 255, 255, 0.8);
  font-size: 32rpx;
  font-weight: 600;
  margin-bottom: 16rpx;
}

.empty-desc {
  color: rgba(255, 255, 255, 0.5);
  font-size: 24rpx;
  line-height: 1.5;
}

/* 统计信息 */
.stats-footer {
  position: relative;
  z-index: 10;
  margin: 20rpx 40rpx 40rpx;
}

.stats-card {
  background: rgba(0, 25, 45, 0.9);
  backdrop-filter: blur(15px);
  border-radius: 16rpx;
  border: 1px solid rgba(64, 224, 255, 0.3);
  padding: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stats-item {
  flex: 1;
  text-align: center;
}

.stats-value {
  display: block;
  color: #40e0ff;
  font-size: 28rpx;
  font-weight: 600;
  margin-bottom: 6rpx;
  text-shadow: 0 0 10rpx rgba(64, 224, 255, 0.5);
}

.stats-label {
  color: rgba(255, 255, 255, 0.6);
  font-size: 22rpx;
}

.stats-divider {
  width: 1px;
  height: 40rpx;
  background: rgba(64, 224, 255, 0.3);
  margin: 0 20rpx;
}
</style>
