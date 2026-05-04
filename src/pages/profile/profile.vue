<template>
  <view class="profile-page">
    <!-- 背景装饰 -->
    <view class="bg-decoration">
      <view class="bg-circle circle-1"></view>
      <view class="bg-circle circle-2"></view>
      <view class="bg-circle circle-3"></view>
      <view class="bg-dots">
        <view class="dot-row" v-for="n in 8" :key="n">
          <view class="dot" v-for="m in 12" :key="m"></view>
        </view>
      </view>
    </view>
    
    <!-- 顶部绿色背景区域 -->
    <view class="profile-header">
      <view class="header-content">
        <view class="header-top">
          <text class="header-title">👤 个人中心</text>
          <view class="carbon-badge">
            <text class="carbon-icon">🍃</text>
            <text class="carbon-text">已减碳{{ calculateCarbonReduction(points || 0) }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 用户信息卡片 -->
    <view class="user-card">
      <view class="user-avatar-section">
        <view class="avatar-wrapper">
          <image class="user-avatar" :src="getAvatarUrl(userInfo.avatar || '/static/person.webp.png', baseUrl)" mode="aspectFill"></image>
          <view class="avatar-ring"></view>
        </view>
        <view class="user-level">
          <text class="level-badge">LV.{{ Math.floor((points || 0) / 100) + 1 }}</text>
          <text class="level-text">环保达人</text>
        </view>
      </view>
      
      <view class="user-info">
        <text class="username">{{ userInfo.username || username }}</text>
        <text class="user-id">ID: {{ (userInfo.username || username).toUpperCase() }}</text>
        <view class="user-badges">
          <text class="badge" v-if="(points || 0) >= 100">🌿 分类专家</text>
          <text class="badge" v-if="(points || 0) >= 300">♻️ 回收王者</text>
          <text class="badge" v-if="(points || 0) >= 500">🌍 地球守护者</text>
        </view>
      </view>
    </view>

    <!-- 统计数据卡片 -->
    <view class="stats-card">
      <view class="stats-header">
        <text class="stats-title">🌍 环保贡献</text>
        <view class="refresh-btn" @click="handleRefresh" :class="{ rotating: loading }">
          <text>♻️</text>
        </view>
      </view>
      
      <view class="stats-grid" v-if="!loading">
        <view class="stat-item" @click="showPointsInfo">
          <view class="stat-icon-wrapper green">
            <text class="stat-icon">🌟</text>
          </view>
          <view class="stat-data">
            <text class="stat-value">{{ points || 0 }}</text>
            <text class="stat-label">环保积分</text>
          </view>
        </view>

        <view class="stat-item" @click="showCarbonInfo">
          <view class="stat-icon-wrapper blue">
            <text class="stat-icon">🍃</text>
          </view>
          <view class="stat-data">
            <text class="stat-value">{{ calculateCarbonReduction(points || 0) }}</text>
            <text class="stat-label">减碳量</text>
          </view>
        </view>

        <view class="stat-item">
          <view class="stat-icon-wrapper orange">
            <text class="stat-icon">♻️</text>
          </view>
          <view class="stat-data">
            <text class="stat-value">{{ Math.floor((points || 0) / 8) }}</text>
            <text class="stat-label">回收贡献</text>
          </view>
        </view>
      </view>

      <view class="loading-state" v-else>
        <view class="loading-spinner"></view>
        <text class="loading-text">数据同步中...</text>
      </view>
    </view>

    <!-- 设备连接状态卡片-->
    <view v-if="hasConnection" class="device-card">
      <view class="device-header">
        <view class="device-title">
          <text class="device-icon">📱</text>
          <text>设备连接</text>
        </view>
        <view class="device-status">
          <view class="status-dot"></view>
          <text>在线</text>
        </view>
      </view>
      
      <view class="device-content" @click="goToDeviceConnection">
        <view class="device-info">
          <text class="device-name">{{ connectedDevice?.device_name || '智能垃圾分类设备' }}</text>
          <text class="device-id">ID: {{ connectedDevice?.device_id || connectedDevice?.id || 'N/A' }}</text>
        </view>
        <text class="device-arrow">›</text>
      </view>
      
      <view class="device-footer">
        <view class="device-stat">
          <text class="stat-label">连接时长</text>
          <text class="stat-value">{{ connectionDuration }}</text>
        </view>
        <view class="device-stat">
          <text class="stat-label">运行状态</text>
          <text class="stat-value">正常</text>
        </view>
      </view>
    </view>

    <!-- 功能菜单 -->
    <view class="menu-section">
      <view class="menu-title">功能服务</view>
      <view class="menu-grid">
        <view class="menu-item" @click="goHistory">
          <view class="menu-icon blue">📋</view>
          <text class="menu-text">识别历史</text>
        </view>
        <view class="menu-item" @click="goRanking">
          <view class="menu-icon orange">🏆</view>
          <text class="menu-text">排行榜</text>
        </view>
                <view class="menu-item" @click="goAchievements">
          <view class="menu-icon green">🏅</view>
          <text class="menu-text">成就系统</text>
        </view>
        <view class="menu-item" @click="goGuide">
          <view class="menu-icon purple">📚</view>
          <text class="menu-text">使用指南</text>
        </view>
        <view class="menu-item" @click="goSettings">
          <view class="menu-icon gray">⚙️</view>
          <text class="menu-text">用户设置</text>
        </view>
        <view class="menu-item" @click="goAbout">
          <view class="menu-icon cyan">ℹ️</view>
          <text class="menu-text">关于软件</text>
        </view>
      </view>
    </view>

    <!-- 管理员功能-->
    <view v-if="isAdmin" class="admin-section">
      <view class="menu-title">管理员功能</view>
      <view class="admin-grid">
        <view class="admin-item" @click="goFileManagement">📂 文件管理</view>
        <view class="admin-item" @click="go2048">🎲 2048后台</view>
        <view class="admin-item" @click="goDbMonitor">📊 数据库</view>
        <view class="admin-item" @click="goAPITest">🧪 接口测试</view>
        <view class="admin-item" @click="goAdminAISettings">⚙️ AI设置</view>
        <view class="admin-item" @click="goCollectionDashboard">🗺️ 清运仪表板</view>
        <view class="admin-item" @click="goCollectionPlanning">📋 清运规划</view>
        <view class="admin-item" @click="goCommunityDashboard">🏘️ 社区仪表板</view>
      </view>
    </view>

    <!-- 底部导航栏-->
    <view class="tabbar">
      <view class="tabbar-item" @click="goHome">
        <text class="tabbar-icon">🏠</text>
        <text class="tabbar-label">首页</text>
      </view>
      <view class="tabbar-item" @click="goMap">
        <text class="tabbar-icon">🗺️</text>
        <text class="tabbar-label">地图</text>
      </view>
      <view class="tabbar-item" @click="goShop">
        <text class="tabbar-icon">🛍️</text>
        <text class="tabbar-label">商城</text>
      </view>
      <view class="tabbar-item active">
        <text class="tabbar-icon">👤</text>
        <text class="tabbar-label">我的</text>
      </view>
    </view>

    <!-- 积分信息弹窗 -->
    <view v-if="showInfoModal" class="modal-overlay" @click="closePointsInfo">
      <view class="info-modal" @click.stop>
        <view class="modal-header">
          <text class="modal-title">💰 积分获取说明</text>
          <view class="modal-close" @click="closePointsInfo">✕</view>
        </view>
        <view class="modal-body">
          <view class="info-item">
            <view class="info-icon blue">🔍</view>
            <view class="info-content">
              <text class="info-title">在线识别</text>
              <text class="info-desc">每次识别垃圾可获得1积分</text>
              <text class="info-tag">每日上限：5积分</text>
            </view>
          </view>
          <view class="info-item">
            <view class="info-icon green">🗑️</view>
            <view class="info-content">
              <text class="info-title">智能分类装置</text>
              <text class="info-desc">使用分类装置投放垃圾</text>
              <text class="info-tag">每次获得1-3积分</text>
            </view>
          </view>
          <view class="info-item">
            <view class="info-icon orange">🎁</view>
            <view class="info-content">
              <text class="info-title">额外奖励</text>
              <text class="info-desc">连续登录、完美分类等可获得额外积分</text>
            </view>
          </view>
        </view>
        <view class="modal-footer">
          <text class="footer-tip">积分可在商城兑换精美礼品</text>
          <view class="footer-btn" @click="goToShop">前往商城</view>
        </view>
      </view>
    </view>

    <!-- 减碳信息弹窗 -->
    <view v-if="showCarbonModal" class="modal-overlay" @click="closeCarbonInfo">
      <view class="info-modal" @click.stop>
        <view class="modal-header">
          <text class="modal-title">🍃 减碳量计算说明</text>
          <view class="modal-close" @click="closeCarbonInfo">✕</view>
        </view>
        <view class="modal-body">
          <view class="info-item">
            <view class="info-icon blue">♻️</view>
            <view class="info-content">
              <text class="info-title">可回收垃圾分类</text>
              <text class="info-desc">每次正确分类可回收垃圾</text>
              <text class="info-tag">减排约36g CO₂</text>
            </view>
          </view>
          <view class="info-item">
            <view class="info-icon green">🍎</view>
            <view class="info-content">
              <text class="info-title">厨余垃圾分类</text>
              <text class="info-desc">避免厨余垃圾填埋产生甲烷</text>
              <text class="info-tag">减排约19g CO₂</text>
            </view>
          </view>
          <view class="info-item">
            <view class="info-icon red">☢️</view>
            <view class="info-content">
              <text class="info-title">有害垃圾分类</text>
              <text class="info-desc">专业处理避免环境污染</text>
              <text class="info-tag">减排约57g CO₂</text>
            </view>
          </view>
        </view>
        <view class="modal-footer">
          <text class="equivalent-title">您的减碳量相当于：</text>
          <view class="equivalent-list">
            <view class="equivalent-item">
              <text>🌳</text>
              <text>种植 {{ getCarbonEquivalents(points || 0).trees }} 棵树一年的吸碳量</text>
            </view>
            <view class="equivalent-item">
              <text>🚗</text>
              <text>减少 {{ getCarbonEquivalents(points || 0).carKm }} 公里汽车行驶</text>
            </view>
            <view class="equivalent-item">
              <text>💡</text>
              <text>节省 {{ getCarbonEquivalents(points || 0).electricity }} 度电的碳排放</text>
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { userinfo } from '@/api/user'
import { useDeviceConnection } from '@/utils/useDeviceConnection'
import { baseUrl } from '../../api/settings'
import { jumpToAdminPage } from '@/utils/admin-page-nav'
import { getAvatarUrl } from '@/utils/avatar-handler.js'

const username = ref('')
const userInfo = ref({})
const loading = ref(false)
const showInfoModal = ref(false)
const showCarbonModal = ref(false)
const isAdmin = ref(false)

const calculateCarbonReduction = (points) => {
  if (!points || points <= 0) return '0g'
  
  const CARBON_FACTORS = {
    recyclable: 0.036,
    kitchen: 0.019,
    hazardous: 0.57,
    other: 0.0075,
    base_classification: 0
  }
  
  const distribution = {
    recyclable: 0.40,
    kitchen: 0.30,
    other: 0.22,
    hazardous: 0.08
  }
  
  let totalReduction = 0
  totalReduction += points * CARBON_FACTORS.base_classification
  totalReduction += points * distribution.recyclable * CARBON_FACTORS.recyclable
  totalReduction += points * distribution.kitchen * CARBON_FACTORS.kitchen
  totalReduction += points * distribution.other * CARBON_FACTORS.other
  totalReduction += points * distribution.hazardous * CARBON_FACTORS.hazardous
  
  if (totalReduction < 0.01) return '0g'
  else if (totalReduction < 1) return `${Math.round(totalReduction * 1000)}g`
  else if (totalReduction < 1000) return `${Math.round(totalReduction * 100) / 100}kg`
  else return `${Math.round(totalReduction / 10) / 100}t`
}

const getCarbonEquivalents = (points) => {
  const carbonText = calculateCarbonReduction(points)
  let carbonKg = 0
  
  if (carbonText.includes('kg')) carbonKg = parseFloat(carbonText)
  else if (carbonText.includes('g')) carbonKg = parseFloat(carbonText) / 1000
  else if (carbonText.includes('t')) carbonKg = parseFloat(carbonText) * 1000
  
  return {
    trees: Math.round((carbonKg / 22) * 10) / 10,
    carKm: Math.round(carbonKg / 0.2),
    electricity: Math.round(carbonKg / 0.85)
  }
}

const { hasConnection, connectedDevice, goToDeviceConnection, points } = useDeviceConnection()

const connectionDuration = computed(() => {
  const connectionTime = uni.getStorageSync('connection')
  if (!connectionTime) return '0分钟'
  
  const now = Date.now()
  const diffMinutes = Math.floor((now - connectionTime) / (1000 * 60))
  
  if (diffMinutes < 1) return '刚刚连接'
  if (diffMinutes < 60) return `${diffMinutes}分钟`
  
  const hours = Math.floor(diffMinutes / 60)
  const minutes = diffMinutes % 60
  return minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`
})

const fetchUserInfo = async () => {
  try {
    loading.value = true
    const token = uni.getStorageSync('token')
    if (!token) {
      username.value = '游客'
      isAdmin.value = false
      uni.removeStorageSync('isAdmin')
      return false
    }
    const response = await userinfo()
    if (response.code === 0) {
      userInfo.value = response.data
      points.value = response.data.points || 0
      if (response.data.username) username.value = response.data.username
      const isAdminFromServer = !!(response.data && response.data.isAdmin === true)
      isAdmin.value = isAdminFromServer && uni.getStorageSync('isAdmin')
      try {
        if (isAdminFromServer) uni.setStorageSync('isAdmin', true)
        else uni.removeStorageSync('isAdmin')
        return true
      } catch (e) { return false }
    } else {
      uni.showToast({ title: response.data.msg || '获取用户信息失败', icon: 'none' })
      return false
    }
  } catch (error) {
    uni.showToast({ title: error?.msg || '网络错误', icon: 'none' })
    return false
  } finally {
    loading.value = false
  }
}
 
onMounted(async () => {
  const theme = uni.getStorageSync('app_theme')
  if(theme === 'dark'){
    uni.navigateTo({url:'/pages-dark/profile/profile'})
  }
  const savedUser = uni.getStorageSync('savedUser')?.username
  if (savedUser && uni.getStorageSync('autoLogin')) username.value = savedUser
  await fetchUserInfo()
  if (uni.getStorageSync('isAdmin') && !isAdmin.value) uni.removeStorageSync('isAdmin')
  
  // 添加统计项鼠标追踪效果
  if (typeof document !== 'undefined') {
    const statItems = document.querySelectorAll('.stat-item')
    statItems.forEach(item => {
      item.addEventListener('mousemove', (e) => {
        const rect = item.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 100
        const y = ((e.clientY - rect.top) / rect.height) * 100
        item.style.setProperty('--mouse-x', x + '%')
        item.style.setProperty('--mouse-y', y + '%')
      })
      
      item.addEventListener('touchmove', (e) => {
        const touch = e.touches[0]
        const rect = item.getBoundingClientRect()
        const x = ((touch.clientX - rect.left) / rect.width) * 100
        const y = ((touch.clientY - rect.top) / rect.height) * 100
        item.style.setProperty('--mouse-x', x + '%')
        item.style.setProperty('--mouse-y', y + '%')
      })
    })
    
    // 添加菜单项鼠标追踪效果
    const menuItems = document.querySelectorAll('.menu-item')
    menuItems.forEach(item => {
      item.addEventListener('mousemove', (e) => {
        const rect = item.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 100
        const y = ((e.clientY - rect.top) / rect.height) * 100
        item.style.setProperty('--mouse-x', x + '%')
        item.style.setProperty('--mouse-y', y + '%')
      })
      
      item.addEventListener('touchmove', (e) => {
        const touch = e.touches[0]
        const rect = item.getBoundingClientRect()
        const x = ((touch.clientX - rect.left) / rect.width) * 100
        const y = ((touch.clientY - rect.top) / rect.height) * 100
        item.style.setProperty('--mouse-x', x + '%')
        item.style.setProperty('--mouse-y', y + '%')
      })
    })
    
    // 添加用户卡片鼠标追踪效果
    const userCard = document.querySelector('.user-card')
    if (userCard) {
      userCard.addEventListener('mousemove', (e) => {
        const rect = userCard.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 100
        const y = ((e.clientY - rect.top) / rect.height) * 100
        userCard.style.setProperty('--mouse-x', x + '%')
        userCard.style.setProperty('--mouse-y', y + '%')
      })
      
      userCard.addEventListener('touchmove', (e) => {
        const touch = e.touches[0]
        const rect = userCard.getBoundingClientRect()
        const x = ((touch.clientX - rect.left) / rect.width) * 100
        const y = ((touch.clientY - rect.top) / rect.height) * 100
        userCard.style.setProperty('--mouse-x', x + '%')
        userCard.style.setProperty('--mouse-y', y + '%')
      })
    }
    
    // 添加统计卡片鼠标追踪效果
    const statsCard = document.querySelector('.stats-card')
    if (statsCard) {
      statsCard.addEventListener('mousemove', (e) => {
        const rect = statsCard.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 100
        const y = ((e.clientY - rect.top) / rect.height) * 100
        statsCard.style.setProperty('--mouse-x', x + '%')
        statsCard.style.setProperty('--mouse-y', y + '%')
      })
      
      statsCard.addEventListener('touchmove', (e) => {
        const touch = e.touches[0]
        const rect = statsCard.getBoundingClientRect()
        const x = ((touch.clientX - rect.left) / rect.width) * 100
        const y = ((touch.clientY - rect.top) / rect.height) * 100
        statsCard.style.setProperty('--mouse-x', x + '%')
        statsCard.style.setProperty('--mouse-y', y + '%')
      })
    }
    
    // 添加退出按钮鼠标追踪效果
    const logoutBtn = document.querySelector('.logout-btn')
    if (logoutBtn) {
      logoutBtn.addEventListener('mousemove', (e) => {
        const rect = logoutBtn.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 100
        const y = ((e.clientY - rect.top) / rect.height) * 100
        logoutBtn.style.setProperty('--mouse-x', x + '%')
        logoutBtn.style.setProperty('--mouse-y', y + '%')
      })
      
      logoutBtn.addEventListener('touchmove', (e) => {
        const touch = e.touches[0]
        const rect = logoutBtn.getBoundingClientRect()
        const x = ((touch.clientX - rect.left) / rect.width) * 100
        const y = ((touch.clientY - rect.top) / rect.height) * 100
        logoutBtn.style.setProperty('--mouse-x', x + '%')
        logoutBtn.style.setProperty('--mouse-y', y + '%')
      })
    }
  }
})

const handleRefresh = async () => {
  if (await fetchUserInfo()) uni.showToast({ title: '刷新成功', icon: 'success' })
}

const showPointsInfo = () => { showInfoModal.value = true }
const closePointsInfo = () => { showInfoModal.value = false }
const showCarbonInfo = () => { showCarbonModal.value = true }
const closeCarbonInfo = () => { showCarbonModal.value = false }
const goToShop = () => { closePointsInfo(); uni.redirectTo({ url: '/pages/shop/shop' }) }

function goHistory() { uni.navigateTo({ url: '/pages/history/history' }) }
function goRanking() { uni.navigateTo({ url: '/pages/ranking/ranking' }) }
function goSettings() { uni.navigateTo({ url: '/pages-nonTheme/settings' }) }
function goAbout() { uni.navigateTo({ url: '/pages-nonTheme/about' }) }
function goGuide() { uni.navigateTo({ url: '/pages/guide/guide' }) }
function goAchievements() { uni.navigateTo({ url: '/pages-nonTheme/achievements' })}

async function verifyAdminPermission() {
  const localAdminFlag = uni.getStorageSync('isAdmin')
  if (!localAdminFlag) {
    uni.showToast({ title: '无权限访问', icon: 'none' })
    return false
  }
  try {
    const response = await userinfo()
    if (response && response.data && response.data.isAdmin) return true
    else {
      uni.removeStorageSync('isAdmin')
      isAdmin.value = false
      uni.showToast({ title: '权限已过期', icon: 'none' })
      return false
    }
  } catch (err) {
    uni.showToast({ title: '权限验证失败', icon: 'none' })
    return false
  }
}

function goFileManagement() {
  verifyAdminPermission().then(hasPermission => {
    if (hasPermission) {
      const target = encodeURIComponent(baseUrl + '/files')
      uni.navigateTo({ url: `/pages-nonTheme/webview?url=${target}` })
    }
  })
}

function goDbMonitor() {
  verifyAdminPermission().then(hasPermission => {
    if (hasPermission) uni.navigateTo({ url: '/pages-nonTheme/database' })
  })
}

function goAPITest() {
  verifyAdminPermission().then(hasPermission => {
    if (hasPermission) uni.navigateTo({ url: '/pages-nonTheme/test' })
  })
}

function go2048() {
  verifyAdminPermission().then(hasPermission => {
    if (hasPermission) {
      const target = encodeURIComponent(baseUrl + '/2048/console')
      uni.navigateTo({ url: `/pages-nonTheme/webview?url=${target}` })
    } else {
      uni.showToast({ title: '仅访问用户界面', icon: 'none' })
      setTimeout(() => {
        const target = encodeURIComponent(baseUrl + '/2048')
        uni.navigateTo({ url: `/pages-nonTheme/webview?url=${target}` })
      }, 1000)
    }
  })
}

function goAdminAISettings() {
  verifyAdminPermission().then(hasPermission => {
    if (hasPermission) {
      uni.navigateTo({ url: '/pages-nonTheme/admin-ai-settings' })
    }
  })
}

function goCollectionDashboard() {
  verifyAdminPermission().then(hasPermission => {
    if (hasPermission) {
      jumpToAdminPage('collectionDashboard', { from: 'profile' })
    }
  })
}

function goCollectionPlanning() {
  verifyAdminPermission().then(hasPermission => {
    if (hasPermission) {
      jumpToAdminPage('collectionPlanning', { from: 'profile' })
    }
  })
}

function goCommunityDashboard() {
  verifyAdminPermission().then(hasPermission => {
    if (hasPermission) {
      jumpToAdminPage('communityDashboard', { from: 'profile' })
    }
  })
}

function goHome() { uni.redirectTo({ url: '/pages/home/home' }) }
function goMap() { uni.navigateTo({ url: '/pages/map/map' }) }
function goShop() { uni.redirectTo({ url: '/pages/shop/shop' }) }
</script>

<style scoped>
/* 页面基础 */
.profile-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #f0fdf4 0%, #f5f7fa 30%, #f0f9ff 70%, #f5f7fa 100%);
  padding-bottom: 140rpx;
  position: relative;
  overflow-x: hidden;
}

/* 背景装饰 */
.bg-decoration {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
  animation: bgLightShift 15s ease-in-out infinite;
}

/* 背景光影流动效果 */
@keyframes bgLightShift {
  0%, 100% {
    background: radial-gradient(ellipse at 80% 20%, rgba(16, 185, 129, 0.08) 0%, transparent 50%),
                radial-gradient(ellipse at 20% 60%, rgba(59, 130, 246, 0.06) 0%, transparent 40%),
                radial-gradient(ellipse at 70% 80%, rgba(245, 158, 11, 0.05) 0%, transparent 45%),
                linear-gradient(135deg, #f0fdf4 0%, #ffffff 50%, #ecfdf5 100%);
  }
  25% {
    background: radial-gradient(ellipse at 85% 25%, rgba(16, 185, 129, 0.1) 0%, transparent 55%),
                radial-gradient(ellipse at 15% 55%, rgba(59, 130, 246, 0.08) 0%, transparent 45%),
                radial-gradient(ellipse at 75% 75%, rgba(245, 158, 11, 0.07) 0%, transparent 50%),
                linear-gradient(135deg, #f0fdf4 0%, #ffffff 50%, #ecfdf5 100%);
  }
  50% {
    background: radial-gradient(ellipse at 75% 15%, rgba(16, 185, 129, 0.06) 0%, transparent 45%),
                radial-gradient(ellipse at 25% 65%, rgba(59, 130, 246, 0.1) 0%, transparent 50%),
                radial-gradient(ellipse at 65% 85%, rgba(245, 158, 11, 0.08) 0%, transparent 55%),
                linear-gradient(135deg, #f0fdf4 0%, #ffffff 50%, #ecfdf5 100%);
  }
  75% {
    background: radial-gradient(ellipse at 90% 30%, rgba(16, 185, 129, 0.09) 0%, transparent 50%),
                radial-gradient(ellipse at 10% 50%, rgba(59, 130, 246, 0.07) 0%, transparent 40%),
                radial-gradient(ellipse at 80% 70%, rgba(245, 158, 11, 0.06) 0%, transparent 45%),
                linear-gradient(135deg, #f0fdf4 0%, #ffffff 50%, #ecfdf5 100%);
  }
}

.bg-circle {
  position: absolute;
  border-radius: 50%;
  opacity: 0.15;
}

.circle-1 {
  width: 600rpx;
  height: 600rpx;
  background: linear-gradient(135deg, #10b981 0%, #34d399 100%);
  top: -200rpx;
  right: -200rpx;
  animation: float1 8s ease-in-out infinite;
}

.circle-2 {
  width: 400rpx;
  height: 400rpx;
  background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%);
  top: 400rpx;
  left: -150rpx;
  animation: float2 10s ease-in-out infinite;
}

.circle-3 {
  width: 500rpx;
  height: 500rpx;
  background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%);
  bottom: 300rpx;
  right: -200rpx;
  animation: float3 12s ease-in-out infinite;
}

/* 球形浮动动画 */
@keyframes float1 {
  0%, 100% {
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

@keyframes float2 {
  0%, 100% {
    transform: translate(0, 0) scale(1);
  }
  33% {
    transform: translate(-20rpx, 40rpx) scale(1.03);
  }
  66% {
    transform: translate(30rpx, -30rpx) scale(0.97);
  }
}

@keyframes float3 {
  0%, 100% {
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

.bg-dots {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  opacity: 0.03;
}

.dot-row {
  display: flex;
  gap: 60rpx;
  margin-bottom: 60rpx;
  padding: 0 30rpx;
}

.dot {
  width: 8rpx;
  height: 8rpx;
  background: #10b981;
  border-radius: 50%;
}

/* 顶部绿色背景 */
.profile-header {
  background: linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%);
  /* ifdef APP-PLUS || MP-WEIXIN || MP-ALIPAY || MP-BAIDU || MP-TOUTIAO || MP-QQ */
  padding: 60rpx 32rpx 80rpx;
  /* endif */
  /* #ifndef APP-PLUS && !MP-WEIXIN && !MP-ALIPAY && !MP-BAIDU && !MP-TOUTIAO && !MP-QQ */
  padding: 30rpx 32rpx 80rpx;
  /* #endif */
  position: relative;
  z-index: 1;
}

.profile-header::after {
  content: '';
  position: absolute;
  bottom: -20rpx;
  left: 0;
  right: 0;
  height: 40rpx;
  background: #f5f7fa;
  border-radius: 40rpx 40rpx 0 0;
}

.header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-title {
  font-size: 36rpx;
  font-weight: 700;
  color: #ffffff;
}

.carbon-badge {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.2);
  padding: 12rpx 20rpx;
  border-radius: 30rpx;
}

.carbon-icon {
  font-size: 24rpx;
  margin-right: 8rpx;
}

.carbon-text {
  font-size: 22rpx;
  color: #ffffff;
}

/* 用户信息卡片 */
.user-card {
  margin: -60rpx 32rpx 24rpx;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(236, 253, 245, 0.9) 30%, rgba(209, 250, 229, 0.85) 50%, rgba(236, 253, 245, 0.9) 70%, rgba(255, 255, 255, 0.95) 100%);
  border-radius: 24rpx;
  padding: 40rpx;
  box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.1), 0 2rpx 8rpx rgba(16, 185, 129, 0.08);
  position: relative;
  z-index: 10;
  backdrop-filter: blur(20rpx);
  border: 2rpx solid rgba(255, 255, 255, 0.6);
  overflow: hidden;
  transition: all 0.3s ease;
}

/* 玻璃材质质感 - 顶部高光 */
.user-card::before {
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
.user-card .ripple-effect {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(16, 185, 129, 0.03) 0%, transparent 50%);
  transform: translate(-50%, -50%);
  animation: userCardBreath 6s ease-in-out infinite;
  pointer-events: none;
}

@keyframes userCardBreath {
  0%, 100% {
    transform: translate(-50%, -50%) scale(0.8);
    opacity: 0.3;
  }
  50% {
    transform: translate(-50%, -50%) scale(1.2);
    opacity: 0.6;
  }
}

/* 第二层波纹- 错位 */
.user-card .ripple-effect-2 {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(52, 211, 153, 0.02) 0%, transparent 40%);
  transform: translate(-50%, -50%);
  animation: userCardBreath2 8s ease-in-out infinite;
  pointer-events: none;
}

@keyframes userCardBreath2 {
  0%, 100% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 0.2;
  }
  50% {
    transform: translate(-50%, -50%) scale(1.3);
    opacity: 0.5;
  }
}

/* 光感追随鼠标效果 */
.user-card::after {
  content: '';
  position: absolute;
  top: var(--mouse-y, 50%);
  left: var(--mouse-x, 50%);
  width: 300rpx;
  height: 300rpx;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.4) 0%, transparent 70%);
  transform: translate(-50%, -50%);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.user-card:hover::after,
.user-card:active::after {
  opacity: 1;
}

.user-card:active {
  transform: scale(0.98);
}

.user-avatar-section {
  display: flex;
  align-items: center;
  margin-bottom: 24rpx;
}

.avatar-wrapper {
  position: relative;
  width: 120rpx;
  height: 120rpx;
  margin-right: 24rpx;
}

.user-avatar {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

.avatar-ring {
  position: absolute;
  top: -6rpx;
  left: -6rpx;
  right: -6rpx;
  bottom: -6rpx;
  border: 4rpx solid #10b981;
  border-radius: 50%;
  border-top-color: transparent;
  animation: rotate 3s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.user-level {
  display: flex;
  flex-direction: column;
}

.level-badge {
  font-size: 32rpx;
  font-weight: 700;
  color: #10b981;
}

.level-text {
  font-size: 24rpx;
  color: #6b7280;
}

.user-info {
  text-align: center;
}

.username {
  display: block;
  font-size: 40rpx;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 8rpx;
}

.user-id {
  display: block;
  font-size: 24rpx;
  color: #9ca3af;
  margin-bottom: 16rpx;
}

.user-badges {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12rpx;
}

.badge {
  background: #ecfdf5;
  color: #059669;
  font-size: 22rpx;
  padding: 8rpx 16rpx;
  border-radius: 16rpx;
  font-weight: 500;
}

/* 统计数据卡片 */
.stats-card {
  margin: 0 32rpx 24rpx;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(236, 253, 245, 0.9) 30%, rgba(209, 250, 229, 0.85) 50%, rgba(236, 253, 245, 0.9) 70%, rgba(255, 255, 255, 0.95) 100%);
  border-radius: 24rpx;
  padding: 32rpx;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.1), 0 2rpx 8rpx rgba(16, 185, 129, 0.08);
  position: relative;
  z-index: 10;
  backdrop-filter: blur(20rpx);
  border: 2rpx solid rgba(255, 255, 255, 0.6);
  overflow: hidden;
  transition: all 0.3s ease;
}

/* 磨砂玻璃材质质感 */
.stats-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 40%;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.15) 60%, transparent 100%);
  pointer-events: none;
  border-radius: 24rpx 24rpx 0 0;
}

/* 柔和波纹呼吸效果 */
.stats-card .ripple-effect {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(16, 185, 129, 0.02) 0%, transparent 50%);
  transform: translate(-50%, -50%);
  animation: statsCardBreath 5s ease-in-out infinite;
  pointer-events: none;
}

@keyframes statsCardBreath {
  0%, 100% {
    transform: translate(-50%, -50%) scale(0.9);
    opacity: 0.2;
  }
  50% {
    transform: translate(-50%, -50%) scale(1.1);
    opacity: 0.5;
  }
}

/* 第二层波纹*/
.stats-card .ripple-effect-2 {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(52, 211, 153, 0.015) 0%, transparent 40%);
  transform: translate(-50%, -50%);
  animation: statsCardBreath2 7s ease-in-out infinite;
  pointer-events: none;
}

@keyframes statsCardBreath2 {
  0%, 100% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 0.15;
  }
  50% {
    transform: translate(-50%, -50%) scale(1.2);
    opacity: 0.4;
  }
}

/* 光感追随鼠标效果 */
.stats-card::after {
  content: '';
  position: absolute;
  top: var(--mouse-y, 50%);
  left: var(--mouse-x, 50%);
  width: 280rpx;
  height: 280rpx;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.4) 0%, transparent 70%);
  transform: translate(-50%, -50%);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.stats-card:hover::after,
.stats-card:active::after {
  opacity: 1;
}

.stats-card:active {
  transform: scale(0.98);
}

.stats-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24rpx;
}

.stats-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #1f2937;
}

.refresh-btn {
  width: 56rpx;
  height: 56rpx;
  background: #f3f4f6;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  color: #6b7280;
}

.refresh-btn.rotating {
  animation: rotate 1s linear infinite;
}

.stats-grid {
  display: flex;
  gap: 16rpx;
}

.stat-item {
  flex: 1;
  background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
  border-radius: 20rpx;
  padding: 24rpx 16rpx;
  text-align: center;
  border: 2rpx solid rgba(16, 185, 129, 0.15);
  position: relative;
  overflow: hidden;
  transition: all 0.3s ease;
}

/* 光感追随鼠标效果 */
.stat-item::after {
  content: '';
  position: absolute;
  top: var(--mouse-y, 50%);
  left: var(--mouse-x, 50%);
  width: 180rpx;
  height: 180rpx;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.6) 0%, transparent 70%);
  transform: translate(-50%, -50%);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.stat-item:hover::after,
.stat-item:active::after {
  opacity: 1;
}

.stat-item:active {
  transform: scale(0.95);
}

.stat-item:nth-child(2) {
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  border-color: rgba(59, 130, 246, 0.15);
}

.stat-item:nth-child(3) {
  background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%);
  border-color: rgba(249, 115, 22, 0.15);
}

.stat-icon-wrapper {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16rpx;
}

.stat-icon-wrapper.green { background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); }
.stat-icon-wrapper.blue { background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); }
.stat-icon-wrapper.orange { background: linear-gradient(135deg, #ffedd5 0%, #fed7aa 100%); }

.stat-icon {
  font-size: 36rpx;
  animation: statIconFloat 3s ease-in-out infinite;
}

@keyframes statIconFloat {
  0%, 100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(-4rpx) scale(1.1);
  }
}

.stat-value {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 4rpx;
}

.stat-label {
  font-size: 22rpx;
  color: #6b7280;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40rpx;
}

.loading-spinner {
  width: 48rpx;
  height: 48rpx;
  border: 4rpx solid #e5e7eb;
  border-top-color: #10b981;
  border-radius: 50%;
  animation: rotate 1s linear infinite;
  margin-bottom: 16rpx;
}

.loading-text {
  font-size: 26rpx;
  color: #6b7280;
}

/* 设备卡片 */
.device-card {
  margin: 0 32rpx 24rpx;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 24rpx;
  padding: 32rpx;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.06), 0 2rpx 8rpx rgba(16, 185, 129, 0.05);
  position: relative;
  z-index: 10;
  backdrop-filter: blur(10rpx);
  border: 1rpx solid rgba(255, 255, 255, 0.5);
}

.device-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
}

.device-title {
  display: flex;
  align-items: center;
  font-size: 30rpx;
  font-weight: 600;
  color: #1f2937;
}

.device-icon {
  font-size: 36rpx;
  margin-right: 12rpx;
}

.device-status {
  display: flex;
  align-items: center;
  background: #d1fae5;
  padding: 8rpx 16rpx;
  border-radius: 20rpx;
}

.status-dot {
  width: 12rpx;
  height: 12rpx;
  background: #10b981;
  border-radius: 50%;
  margin-right: 8rpx;
}

.device-status text {
  font-size: 22rpx;
  color: #059669;
  font-weight: 500;
}

.device-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f9fafb;
  padding: 24rpx;
  border-radius: 16rpx;
  margin-bottom: 20rpx;
}

.device-name {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 8rpx;
}

.device-id {
  font-size: 24rpx;
  color: #9ca3af;
}

.device-arrow {
  font-size: 36rpx;
  color: #10b981;
}

.device-footer {
  display: flex;
  gap: 24rpx;
}

.device-stat {
  flex: 1;
  text-align: center;
  padding: 16rpx;
  background: #f9fafb;
  border-radius: 12rpx;
}

.device-stat .stat-label {
  display: block;
  font-size: 22rpx;
  color: #9ca3af;
  margin-bottom: 4rpx;
}

.device-stat .stat-value {
  font-size: 28rpx;
  font-weight: 600;
  color: #10b981;
}

/* 功能菜单 */
.menu-section {
  margin: 0 32rpx 24rpx;
  position: relative;
  z-index: 10;
}

.menu-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 20rpx;
  padding-left: 8rpx;
}

.menu-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16rpx;
}

.menu-item {
  border-radius: 20rpx;
  padding: 32rpx 16rpx;
  text-align: center;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.06);
  backdrop-filter: blur(10rpx);
  border: 1rpx solid rgba(255, 255, 255, 0.6);
  position: relative;
  overflow: hidden;
  transition: all 0.3s ease;
}

/* 玻璃材质质感 - 顶部高光 */
.menu-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 45%;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.7) 0%, rgba(255, 255, 255, 0.2) 50%, transparent 100%);
  pointer-events: none;
  border-radius: 20rpx 20rpx 0 0;
}

/* 柔和波纹呼吸效果 */
.menu-item .ripple-effect {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 150%;
  height: 150%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, transparent 50%);
  transform: translate(-50%, -50%);
  animation: menuItemBreath 4s ease-in-out infinite;
  pointer-events: none;
}

@keyframes menuItemBreath {
  0%, 100% {
    transform: translate(-50%, -50%) scale(0.9);
    opacity: 0.3;
  }
  50% {
    transform: translate(-50%, -50%) scale(1.1);
    opacity: 0.6;
  }
}

/* 光感追随鼠标效果 */
.menu-item::after {
  content: '';
  position: absolute;
  top: var(--mouse-y, 50%);
  left: var(--mouse-x, 50%);
  width: 200rpx;
  height: 200rpx;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.5) 0%, transparent 70%);
  transform: translate(-50%, -50%);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.menu-item:hover::after,
.menu-item:active::after {
  opacity: 1;
}

.menu-item:active {
  transform: scale(0.95);
}

/* 识别历史 - 蓝色 */
.menu-item:nth-child(1) {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(219, 234, 254, 0.7) 50%, rgba(255, 255, 255, 0.95) 100%);
}

/* 排行榜- 橙色 */
.menu-item:nth-child(2) {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 237, 213, 0.7) 50%, rgba(255, 255, 255, 0.95) 100%);
}

/* 垃圾桶地图- 绿色 */
.menu-item:nth-child(3) {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(209, 250, 229, 0.7) 50%, rgba(255, 255, 255, 0.95) 100%);
}

/* 使用指南 - 紫色 */
.menu-item:nth-child(4) {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(243, 232, 255, 0.7) 50%, rgba(255, 255, 255, 0.95) 100%);
}

/* 账户安全 - 灰色 */
.menu-item:nth-child(5) {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(243, 244, 246, 0.7) 50%, rgba(255, 255, 255, 0.95) 100%);
}

/* 关于软件 - 青色 */
.menu-item:nth-child(6) {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(207, 250, 254, 0.7) 50%, rgba(255, 255, 255, 0.95) 100%);
}

.menu-icon {
  width: 80rpx;
  height: 80rpx;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16rpx;
  font-size: 40rpx;
  animation: menuIconPulse 2.5s ease-in-out infinite;
  position: relative;
}

@keyframes menuIconPulse {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.08);
  }
}

/* 菜单图标悬浮效果*/
.menu-item:hover .menu-icon,
.menu-item:active .menu-icon {
  animation: menuIconHoverBounce 0.6s ease;
}

@keyframes menuIconBounce {
  0% { transform: scale(1); }
  30% { transform: scale(1.2) rotate(-5deg); }
  60% { transform: scale(0.95) rotate(3deg); }
  100% { transform: scale(1) rotate(0deg); }
}

/* 鼠标悬停时的招呼动画*/
@keyframes menuIconHoverBounce {
  0% {
    transform: scale(1) rotate(0deg);
  }
  25% {
    transform: scale(1.25) rotate(-12deg);
  }
  40% {
    transform: scale(1.25) rotate(10deg);
  }
  55% {
    transform: scale(1.25) rotate(-6deg);
  }
  70% {
    transform: scale(1.25) rotate(0deg);
  }
  85% {
    transform: scale(0.95) rotate(0deg);
  }
  100% {
    transform: scale(1) rotate(0deg);
  }
}

.menu-icon.blue { background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); }
.menu-icon.orange { background: linear-gradient(135deg, #ffedd5 0%, #fed7aa 100%); }
.menu-icon.green { background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); }
.menu-icon.purple { background: linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%); }
.menu-icon.gray { background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%); }
.menu-icon.cyan { background: linear-gradient(135deg, #cffafe 0%, #a5f3fc 100%); }

.menu-text {
  font-size: 24rpx;
  color: #4b5563;
}

/* 管理员功能*/
.admin-section {
  margin: 0 32rpx 24rpx;
  position: relative;
  z-index: 10;
}

.admin-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16rpx;
}

.admin-item {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 16rpx;
  padding: 24rpx;
  text-align: center;
  font-size: 26rpx;
  color: #4b5563;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.06), 0 2rpx 8rpx rgba(16, 185, 129, 0.05);
  backdrop-filter: blur(10rpx);
  border: 1rpx solid rgba(255, 255, 255, 0.5);
}

/* 底部导航 */
.tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 120rpx;
  background: #ffffff;
  border-top: 2rpx solid #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: space-around;
  z-index: 100;
  padding-bottom: env(safe-area-inset-bottom);
}

.tabbar-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16rpx 0;
  position: relative;
  transition: all 0.3s ease;
}

.tabbar-item:active {
  transform: scale(0.92);
}

.tabbar-item.active .tabbar-icon {
  color: #10b981;
  transform: scale(1.15) translateY(-4rpx);
  filter: drop-shadow(0 4rpx 8rpx rgba(16, 185, 129, 0.4));
  animation: iconBounce 0.5s ease;
}

.tabbar-item.active .tabbar-label {
  color: #10b981;
  font-weight: 600;
  transform: scale(1.05);
}

.tabbar-icon {
  font-size: 40rpx;
  margin-bottom: 8rpx;
  color: #9ca3af;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  filter: grayscale(30%);
}

.tabbar-item.active .tabbar-icon {
  filter: grayscale(0%) brightness(1.1);
}

.tabbar-label {
  font-size: 20rpx;
  color: #9ca3af;
  transition: all 0.3s ease;
}

@keyframes iconBounce {
  0% { transform: scale(1) translateY(0); }
  40% { transform: scale(1.2) translateY(-8rpx); }
  70% { transform: scale(1.1) translateY(-2rpx); }
  100% { transform: scale(1.15) translateY(-4rpx); }
}

/* 弹窗 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
  animation: modalFadeIn 0.3s ease;
}

@keyframes modalFadeIn {
  0% { opacity: 0; }
  100% { opacity: 1; }
}

.info-modal {
  background: #ffffff;
  border-radius: 32rpx;
  max-width: 600rpx;
  width: 100%;
  max-height: 80vh;
  overflow: hidden;
  animation: modalSlideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes modalSlideUp {
  0% {
    opacity: 0;
    transform: translateY(60rpx) scale(0.9);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 32rpx;
  background: linear-gradient(145deg,
    rgba(255, 255, 255, 0.98) 0%,
    rgba(236, 253, 245, 0.95) 50%,
    rgba(209, 250, 229, 0.9) 100%);
  border-bottom: 1px solid rgba(52, 211, 153, 0.15);
  box-shadow:
    inset 0 2rpx 0 rgba(255, 255, 255, 0.9),
    0 2rpx 8rpx rgba(16, 185, 129, 0.08);
  animation: modalHeaderSlide 0.5s ease 0.1s both;
  position: relative;
  overflow: hidden;
}

/* 头部高光 */
.modal-header::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1rpx;
  background: linear-gradient(90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.9) 20%,
    rgba(255, 255, 255, 0.9) 80%,
    transparent 100%);
  pointer-events: none;
}

@keyframes modalHeaderSlide {
  0% {
    opacity: 0;
    transform: translateX(-30rpx);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
  }
}

.modal-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #1f2937;
}

.modal-close {
  width: 48rpx;
  height: 48rpx;
  background: #f3f4f6;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
  color: #6b7280;
}

.modal-body {
  padding: 24rpx 32rpx;
  max-height: 80vh;
  overflow-y: auto;
  background: linear-gradient(180deg,
    rgba(236, 253, 245, 0.4) 0%,
    rgba(209, 250, 229, 0.2) 50%,
    rgba(167, 243, 208, 0.1) 100%);
  position: relative;
}

/* 背景纹理增加纵深感*/
.modal-body::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background:
    radial-gradient(ellipse at 20% 30%, rgba(52, 211, 153, 0.08) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 70%, rgba(16, 185, 129, 0.06) 0%, transparent 40%);
  pointer-events: none;
}

.info-item {
  display: flex;
  align-items: flex-start;
  padding: 24rpx;
  margin-bottom: 16rpx;
  background: linear-gradient(145deg, 
    rgba(255, 255, 255, 0.95) 0%, 
    rgba(248, 250, 252, 0.9) 50%,
    rgba(241, 245, 249, 0.85) 100%);
  border-radius: 16rpx;
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 
    inset 0 1rpx 0 rgba(255, 255, 255, 0.9),
    inset 0 -1rpx 0 rgba(0, 0, 0, 0.03),
    0 4rpx 12rpx rgba(0, 0, 0, 0.04),
    0 1rpx 3rpx rgba(0, 0, 0, 0.02);
  opacity: 0;
  animation: infoItemSlide 0.5s ease forwards;
  position: relative;
  overflow: hidden;
}

/* 玻璃质感高光 */
.info-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1rpx;
  background: linear-gradient(90deg, 
    transparent 0%, 
    rgba(255, 255, 255, 0.8) 20%, 
    rgba(255, 255, 255, 0.8) 80%, 
    transparent 100%);
  pointer-events: none;
}

.info-item:nth-child(1) { animation-delay: 0.2s; }
.info-item:nth-child(2) { animation-delay: 0.35s; }
.info-item:nth-child(3) { animation-delay: 0.5s; }

@keyframes infoItemSlide {
  0% {
    opacity: 0;
    transform: translateX(-20rpx);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
  }
}

.info-item:last-child {
  margin-bottom: 0;
}

.info-icon {
  width: 64rpx;
  height: 64rpx;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 20rpx;
  font-size: 32rpx;
  flex-shrink: 0;
  animation: infoIconPop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.25s both;
  box-shadow: 
    inset 0 2rpx 0 rgba(255, 255, 255, 0.8),
    inset 0 -2rpx 0 rgba(0, 0, 0, 0.05),
    0 4rpx 8rpx rgba(0, 0, 0, 0.1);
  position: relative;
  overflow: hidden;
}

/* 图标顶部高光 */
.info-icon::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 50%;
  background: linear-gradient(180deg, 
    rgba(255, 255, 255, 0.4) 0%, 
    transparent 100%);
  pointer-events: none;
  border-radius: 16rpx 16rpx 0 0;
}

@keyframes infoIconPop {
  0% {
    opacity: 0;
    transform: scale(0) rotate(-45deg);
  }
  50% {
    transform: scale(1.3) rotate(10deg);
  }
  100% {
    opacity: 1;
    transform: scale(1) rotate(0deg);
  }
}

.info-icon.blue { 
  background: linear-gradient(145deg, #dbeafe 0%, #bfdbfe 50%, #93c5fd 100%);
  border: 1px solid rgba(59, 130, 246, 0.2);
}
.info-icon.green { 
  background: linear-gradient(145deg, #d1fae5 0%, #a7f3d0 50%, #6ee7b7 100%);
  border: 1px solid rgba(16, 185, 129, 0.2);
}
.info-icon.orange { 
  background: linear-gradient(145deg, #ffedd5 0%, #fed7aa 50%, #fdba74 100%);
  border: 1px solid rgba(245, 158, 11, 0.2);
}
.info-icon.red { 
  background: linear-gradient(145deg, #fee2e2 0%, #fecaca 50%, #fca5a5 100%);
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.info-content {
  flex: 1;
}

.info-title {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 8rpx;
}

.info-desc {
  display: block;
  font-size: 24rpx;
  color: #6b7280;
  margin-bottom: 8rpx;
}

.info-tag {
  display: inline-block;
  font-size: 22rpx;
  color: #10b981;
  background: #ecfdf5;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
}

.modal-footer {
  padding: 24rpx 32rpx 32rpx;
  background: linear-gradient(145deg,
    rgba(209, 250, 229, 0.9) 0%,
    rgba(236, 253, 245, 0.95) 50%,
    rgba(255, 255, 255, 0.98) 100%);
  border-top: 1px solid rgba(52, 211, 153, 0.15);
  box-shadow:
    inset 0 2rpx 0 rgba(255, 255, 255, 0.9),
    0 -2rpx 8rpx rgba(16, 185, 129, 0.06);
  text-align: center;
  animation: modalFooterSlide 0.5s ease 0.55s both;
  position: relative;
  overflow: hidden;
}

/* 底部高光 */
.modal-footer::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1rpx;
  background: linear-gradient(90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.8) 20%,
    rgba(255, 255, 255, 0.8) 80%,
    transparent 100%);
  pointer-events: none;
}

@keyframes modalFooterSlide {
  0% {
    opacity: 0;
    transform: translateY(30rpx);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

.footer-tip {
  display: block;
  font-size: 24rpx;
  color: #9ca3af;
  margin-bottom: 20rpx;
}

.footer-btn {
  display: inline-block;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 600;
  padding: 20rpx 48rpx;
  border-radius: 50rpx;
}

.equivalent-title {
  display: block;
  font-size: 24rpx;
  color: #059669;
  font-weight: 600;
  margin-bottom: 16rpx;
  text-align: center;
}

.equivalent-list {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  gap: 12rpx;
}

.equivalent-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
  padding: 16rpx 8rpx;
  background: linear-gradient(145deg,
    rgba(255, 255, 255, 0.95) 0%,
    rgba(236, 253, 245, 0.9) 50%,
    rgba(209, 250, 229, 0.85) 100%);
  border-radius: 12rpx;
  border: 1px solid rgba(52, 211, 153, 0.2);
  box-shadow:
    inset 0 2rpx 0 rgba(255, 255, 255, 0.9),
    inset 0 -2rpx 0 rgba(16, 185, 129, 0.1),
    0 4rpx 12rpx rgba(16, 185, 129, 0.15),
    0 2rpx 4rpx rgba(0, 0, 0, 0.05);
  position: relative;
  overflow: hidden;
  transform: translateY(0);
  transition: all 0.3s ease;
}

/* 卡片顶部高光 */
.equivalent-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1rpx;
  background: linear-gradient(90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.8) 20%,
    rgba(255, 255, 255, 0.8) 80%,
    transparent 100%);
  pointer-events: none;
}

/* 悬浮效果增加纵深感*/
.equivalent-item:hover {
  transform: translateY(-4rpx);
  box-shadow:
    inset 0 2rpx 0 rgba(255, 255, 255, 0.9),
    inset 0 -2rpx 0 rgba(16, 185, 129, 0.1),
    0 8rpx 20rpx rgba(16, 185, 129, 0.2),
    0 4rpx 8rpx rgba(0, 0, 0, 0.08);
}

.equivalent-item text:first-child {
  font-size: 32rpx;
}

.equivalent-item text:last-child {
  font-size: 20rpx;
  color: #4b5563;
  text-align: center;
  line-height: 1.3;
}

@media (max-width: 768px) {
  .profile-header {
    padding: 72rpx 20rpx 64rpx;
  }

  .user-card,
  .admin-section {
    margin-left: 20rpx;
    margin-right: 20rpx;
  }

  .menu-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14rpx;
  }

  .menu-item {
    padding: 24rpx 12rpx;
  }

  .menu-icon {
    width: 68rpx;
    height: 68rpx;
    font-size: 34rpx;
  }

  .menu-text {
    font-size: 22rpx;
  }

  .info-modal {
    width: calc(100vw - 40rpx);
    max-width: none;
  }

  .modal-header,
  .modal-body,
  .modal-footer {
    padding-left: 24rpx;
    padding-right: 24rpx;
  }

  .equivalent-list {
    flex-direction: column;
  }
}

@media (max-width: 420px) {
  .profile-header {
    padding: 64rpx 16rpx 56rpx;
  }

  .user-card,
  .admin-section {
    margin-left: 16rpx;
    margin-right: 16rpx;
  }

  .menu-item {
    padding: 20rpx 10rpx;
  }

  .menu-icon {
    width: 60rpx;
    height: 60rpx;
    font-size: 30rpx;
  }

  .info-modal {
    width: calc(100vw - 28rpx);
  }

  .modal-header,
  .modal-body,
  .modal-footer {
    padding-left: 20rpx;
    padding-right: 20rpx;
  }
}

@media (prefers-color-scheme: dark) {
  .profile-page {
    background: linear-gradient(180deg, #0f172a 0%, #111827 38%, #0b1120 100%);
  }

  .user-card {
    background: rgba(15, 23, 42, 0.9);
    border-color: rgba(148, 163, 184, 0.22);
    box-shadow: 0 10rpx 30rpx rgba(2, 6, 23, 0.5);
  }

  .username,
  .menu-title,
  .menu-text,
  .modal-title,
  .info-title {
    color: #e2e8f0;
  }

  .menu-item {
    border-color: rgba(148, 163, 184, 0.18);
    box-shadow: 0 8rpx 18rpx rgba(2, 6, 23, 0.45);
  }

  .menu-item:nth-child(1),
  .menu-item:nth-child(2),
  .menu-item:nth-child(3),
  .menu-item:nth-child(4),
  .menu-item:nth-child(5),
  .menu-item:nth-child(6) {
    background: linear-gradient(145deg, rgba(15, 23, 42, 0.92), rgba(30, 41, 59, 0.85));
  }

  .menu-icon.blue,
  .menu-icon.orange,
  .menu-icon.green,
  .menu-icon.purple,
  .menu-icon.gray,
  .menu-icon.cyan {
    background: linear-gradient(145deg, rgba(30, 41, 59, 0.92), rgba(51, 65, 85, 0.86));
  }

  .admin-item {
    background: rgba(15, 23, 42, 0.9);
    color: #cbd5e1;
    border-color: rgba(148, 163, 184, 0.2);
  }

  .info-modal {
    background: #0f172a;
    border: 1px solid rgba(148, 163, 184, 0.22);
  }

  .modal-header,
  .modal-footer {
    background: #111827;
    border-color: rgba(148, 163, 184, 0.22);
    box-shadow: none;
  }

  .modal-body {
    background: #0f172a;
  }

  .info-desc,
  .footer-tip,
  .equivalent-item text:last-child {
    color: #94a3b8;
  }

  .info-tag {
    background: rgba(20, 83, 45, 0.45);
    color: #6ee7b7;
  }

  .equivalent-item {
    background: linear-gradient(145deg, rgba(30, 41, 59, 0.86), rgba(15, 23, 42, 0.92));
    border-color: rgba(45, 212, 191, 0.24);
    box-shadow: none;
  }

  .tabbar {
    background: rgba(15, 23, 42, 0.9);
    border-top: 2rpx solid rgba(148, 163, 184, 0.22);
  }

  .tabbar-icon,
  .tabbar-label {
    color: #94a3b8;
  }
}
</style>

