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
      <!-- 蓝橙球形装饰 -->
      <view class="bg-circle circle-blue"></view>
      <view class="bg-circle circle-orange"></view>
      <view class="bg-circle circle-green"></view>
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
        <view class="ripple-effect"></view>
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
          uni.reLaunch({ url: '/pages/home/home' })
          break
        case 'profile':
          uni.reLaunch({ url: '/pages/profile/profile' })
          break
        case 'scan':
          uni.reLaunch({ url: '/pages/scan/scan' })
          break
        default:
          uni.reLaunch({ url: '/pages/home/home' })
          break
      }
    }, 500)
  } else {
    // 默认返回首页
    setTimeout(() => {
      uni.reLaunch({ url: '/pages/home/home' })
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
  background: linear-gradient(180deg, #f0fdf4 0%, #f5f7fa 30%, #f0f9ff 70%, #f5f7fa 100%);
  position: relative;
  overflow: hidden;
  padding: 0;
  padding-bottom: env(safe-area-inset-bottom);
}

/* 清新背景装饰 */
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
    radial-gradient(circle at 20% 30%, rgba(16, 185, 129, 0.08) 0%, transparent 50%),
    radial-gradient(circle at 80% 70%, rgba(52, 211, 153, 0.06) 0%, transparent 40%);
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
  width: 8rpx;
  height: 8rpx;
  background: rgba(16, 185, 129, 0.3);
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
  0%, 100% { transform: translateY(0) scale(1); opacity: 0.3; }
  50% { transform: translateY(-10px) scale(1.2); opacity: 0.6; }
}

.data-streams {
  display: none;
}

/* 蓝橙球形装饰 */
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

/* 导航栏 */
.navbar {
  position: relative;
  z-index: 10;
  background: linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%);
  padding-bottom: 20rpx;
}

.navbar::after {
  content: '';
  position: absolute;
  bottom: -20rpx;
  left: 0;
  right: 0;
  height: 40rpx;
  background: linear-gradient(180deg, #f0fdf4 0%, #f5f7fa 100%);
  border-radius: 40rpx 40rpx 0 0;
}

.safe-area-top {
  height: env(safe-area-inset-top);
  min-height: 44rpx;
}

.nav-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 40rpx 20rpx;
  position: relative;
  z-index: 1;
}

.nav-left, .nav-right {
  width: 80rpx;
}

.back-btn {
  color: #ffffff;
  font-size: 36rpx;
  font-weight: bold;
  padding: 10rpx;
}

.nav-title {
  color: #ffffff;
  font-size: 36rpx;
  font-weight: 600;
  letter-spacing: 2rpx;
  text-align: center;
}

.refresh-btn {
  color: #ffffff;
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
}

.period-card {
  margin: 40rpx 40rpx 20rpx;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(236, 253, 245, 0.9) 30%, rgba(209, 250, 229, 0.85) 50%, rgba(236, 253, 245, 0.9) 70%, rgba(255, 255, 255, 0.95) 100%);
  border-radius: 24rpx;
  padding: 30rpx 32rpx;
  box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.1), 0 2rpx 8rpx rgba(16, 185, 129, 0.08);
  position: relative;
  z-index: 10;
  backdrop-filter: blur(20rpx);
  border: 2rpx solid rgba(255, 255, 255, 0.6);
  overflow: hidden;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
}

/* 玻璃材质质感 - 顶部高光 */
.period-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 50%;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.2) 50%, transparent 100%);
  pointer-events: none;
  border-radius: 24rpx 24rpx 0 0;
}

/* 柔和波纹呼吸效果 */
.period-card .ripple-effect {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(16, 185, 129, 0.03) 0%, transparent 50%);
  transform: translate(-50%, -50%);
  animation: periodCardBreath 6s ease-in-out infinite;
  pointer-events: none;
}

@keyframes periodCardBreath {
  0%, 100% {
    transform: translate(-50%, -50%) scale(0.8);
    opacity: 0.3;
  }
  50% {
    transform: translate(-50%, -50%) scale(1.2);
    opacity: 0.6;
  }
}

.period-icon {
  font-size: 40rpx;
  margin-right: 20rpx;
  position: relative;
  z-index: 1;
}

.period-content {
  flex: 1;
  position: relative;
  z-index: 1;
}

.period-title {
  display: block;
  color: #10b981;
  font-size: 26rpx;
  font-weight: 600;
  margin-bottom: 6rpx;
}

.period-desc {
  color: #6b7280;
  font-size: 22rpx;
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
  border: 4rpx solid rgba(16, 185, 129, 0.3);
  border-top: 4rpx solid #10b981;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 20rpx;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.loading-text {
  color: #059669;
  font-size: 28rpx;
}

/* 前三名展示 */
.top-three {
  display: flex;
  justify-content: center;
  align-items: flex-end;
  margin-bottom: 40rpx;
  padding: 40rpx 0;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  border-radius: 24rpx;
  border: 1px solid rgba(16, 185, 129, 0.2);
  position: relative;
  overflow: hidden;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.06);
}

.top-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0 20rpx;
  position: relative;
  padding: 20rpx;
  border-radius: 20rpx;
  animation: topItemShow 0.8s ease-out forwards;
}

@keyframes topItemShow {
  0% {
    opacity: 0;
    transform: translateY(50rpx) scale(0.9);
  }
  60% {
    transform: translateY(-10rpx) scale(1.02);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.top-item.rank-1 { 
  order: 2; 
  margin-top: -20rpx; 
  width: 200rpx;
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.15) 0%, rgba(255, 215, 0, 0.05) 100%);
  border: 2rpx solid rgba(255, 215, 0, 0.3);
  box-shadow: 0 8rpx 32rpx rgba(255, 215, 0, 0.15);
}
.top-item.rank-2 { 
  order: 1; 
  margin-top: 0; 
  width: 200rpx;
  background: linear-gradient(135deg, rgba(192, 192, 192, 0.15) 0%, rgba(192, 192, 192, 0.05) 100%);
  border: 2rpx solid rgba(192, 192, 192, 0.3);
  box-shadow: 0 8rpx 32rpx rgba(192, 192, 192, 0.15);
}
.top-item.rank-3 { 
  order: 3; 
  margin-top: 10rpx; 
  width: 200rpx;
  background: linear-gradient(135deg, rgba(205, 127, 50, 0.15) 0%, rgba(205, 127, 50, 0.05) 100%);
  border: 2rpx solid rgba(205, 127, 50, 0.3);
  box-shadow: 0 8rpx 32rpx rgba(205, 127, 50, 0.15);
}

.rank-medal {
  position: relative;
  margin-bottom: 16rpx;
}

.medal-icon {
  font-size: 48rpx;
}

.medal-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 80rpx;
  height: 80rpx;
  background: radial-gradient(circle, rgba(16, 185, 129, 0.2) 0%, transparent 70%);
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
  color: #1f2937;
  font-size: 24rpx;
  font-weight: 600;
  margin-bottom: 8rpx;
}

.top-points {
  display: block;
  color: #059669;
  font-size: 32rpx;
  font-weight: 700;
  margin-bottom: 4rpx;
}

.top-total {
  color: #6b7280;
  font-size: 20rpx;
}

.top-count {
  color: #6b7280;
  font-size: 20rpx;
}

.podium-base {
  width: 80rpx;
  border-radius: 8rpx 8rpx 0 0;
  transform-origin: bottom;
  animation: podiumRise 1.2s ease-out forwards;
}

.top-item.rank-1 .podium-base { 
  height: 60rpx; 
  background: linear-gradient(135deg, #ffd700 0%, #ffed4a 50%, #ffd700 100%);
  box-shadow: 0 0 20rpx rgba(255, 215, 0, 0.4);
}
.top-item.rank-2 .podium-base { 
  height: 45rpx; 
  background: linear-gradient(135deg, #c0c0c0 0%, #e8e8e8 50%, #c0c0c0 100%);
  box-shadow: 0 0 20rpx rgba(192, 192, 192, 0.4);
}
.top-item.rank-3 .podium-base { 
  height: 30rpx; 
  background: linear-gradient(135deg, #cd7f32 0%, #daa520 50%, #cd7f32 100%);
  box-shadow: 0 0 20rpx rgba(205, 127, 50, 0.4);
}

@keyframes podiumRise {
  0% {
    transform: scaleY(0);
    opacity: 0;
  }
  40% {
    opacity: 0.6;
  }
  70% {
    transform: scaleY(1.05);
  }
  100% {
    transform: scaleY(1);
    opacity: 1;
  }
}

/* 排行榜表格 - 玻璃材质 */
.ranking-table {
  background: linear-gradient(145deg,
    rgba(255, 255, 255, 0.98) 0%,
    rgba(248, 250, 252, 0.95) 100%);
  backdrop-filter: blur(20rpx);
  border-radius: 20rpx;
  border: 1px solid rgba(52, 211, 153, 0.15);
  overflow: hidden;
  box-shadow:
    inset 0 2rpx 0 rgba(255, 255, 255, 0.9),
    inset 0 -2rpx 0 rgba(16, 185, 129, 0.05),
    0 8rpx 32rpx rgba(16, 185, 129, 0.08),
    0 2rpx 8rpx rgba(0, 0, 0, 0.03);
  position: relative;
}

/* 表格顶部高光 */
.ranking-table::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2rpx;
  background: linear-gradient(90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.9) 20%,
    rgba(255, 255, 255, 0.9) 80%,
    transparent 100%);
  pointer-events: none;
  z-index: 1;
}

.table-header {
  display: grid;
  grid-template-columns: 80rpx 1fr 100rpx 100rpx 80rpx;
  background: linear-gradient(145deg,
    rgba(236, 253, 245, 0.7) 0%,
    rgba(209, 250, 229, 0.5) 100%);
  border-bottom: 1px solid rgba(52, 211, 153, 0.12);
  padding: 24rpx 20rpx;
  position: relative;
}

/* 表头高光 */
.table-header::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1rpx;
  background: linear-gradient(90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.6) 20%,
    rgba(255, 255, 255, 0.6) 80%,
    transparent 100%);
  pointer-events: none;
}

.table-header text {
  color: #10b981;
  font-size: 24rpx;
  font-weight: 600;
  text-align: center;
}

.header-user {
  text-align: left !important;
  padding-left: 52rpx;
}

.table-row {
  display: grid;
  grid-template-columns: 80rpx 1fr 100rpx 100rpx 80rpx;
  padding: 20rpx;
  border-bottom: 1px solid rgba(52, 211, 153, 0.08);
  transition: all 0.3s ease;
  position: relative;
}

/* 浅绿白交替效果 */
.table-row:nth-child(even) {
  background: rgba(236, 253, 245, 0.4);
}

.table-row:nth-child(odd) {
  background: rgba(255, 255, 255, 0.6);
}

/* 行悬浮效果 */
.table-row:hover {
  background: rgba(255, 255, 255, 0.8);
}

.table-row:last-child {
  border-bottom: none;
}

.table-row.my-rank {
  background: linear-gradient(145deg,
    rgba(236, 253, 245, 0.8) 0%,
    rgba(209, 250, 229, 0.6) 100%);
  border: 1px solid rgba(52, 211, 153, 0.2);
  border-radius: 12rpx;
  margin: 8rpx;
  padding: 20rpx 16rpx;
  box-shadow:
    inset 0 1rpx 0 rgba(255, 255, 255, 0.5),
    0 2rpx 8rpx rgba(16, 185, 129, 0.08);
}

.rank-cell {
  display: flex;
  align-items: center;
  justify-content: center;
}

.rank-number {
  color: #1f2937;
  font-size: 28rpx;
  font-weight: 600;
}

.user-cell {
  display: flex;
  align-items: center;
}

.user-avatar {
  width: 40rpx;
  height: 40rpx;
  background: linear-gradient(135deg, #10b981 0%, #34d399 100%);
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
  color: #1f2937;
  font-size: 26rpx;
  font-weight: 500;
}

.points-cell, .count-cell, .total-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.points-number, .count-number, .total-number {
  color: #059669;
  font-size: 26rpx;
  font-weight: 600;
  line-height: 1;
}

.points-unit, .count-unit, .total-unit {
  color: #9ca3af;
  font-size: 18rpx;
  margin-top: 2rpx;
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 80rpx 40rpx;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 20rpx;
  border: 1px solid rgba(16, 185, 129, 0.2);
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.06);
}

.empty-icon {
  font-size: 80rpx;
  display: block;
  margin-bottom: 24rpx;
  opacity: 0.6;
}

.empty-title {
  display: block;
  color: #059669;
  font-size: 32rpx;
  font-weight: 600;
  margin-bottom: 16rpx;
}

.empty-desc {
  color: #6b7280;
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
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(15px);
  border-radius: 16rpx;
  border: 1px solid rgba(16, 185, 129, 0.2);
  padding: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.06);
}

.stats-item {
  flex: 1;
  text-align: center;
}

.stats-value {
  display: block;
  color: #059669;
  font-size: 28rpx;
  font-weight: 600;
  margin-bottom: 6rpx;
}

.stats-label {
  color: #6b7280;
  font-size: 22rpx;
}

.stats-divider {
  width: 1px;
  height: 40rpx;
  background: rgba(16, 185, 129, 0.2);
  margin: 0 20rpx;
}
</style>
