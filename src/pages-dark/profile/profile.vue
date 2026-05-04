<template>
  <view class="profile-page">
  <!-- 科技背景（固定定位，不影响滚动） -->
    <view class="tech-background">
      <view class="grid-overlay"></view>
      <view class="floating-particles">
        <view class="particle" v-for="n in 12" :key="n" :style="{ animationDelay: (n * 0.5) + 's' }"></view>
      </view>
      <view class="circuit-lines">
        <view class="line horizontal"></view>
        <view class="line vertical"></view>
        <view class="line diagonal"></view>
      </view>
      <view class="data-streams">
        <view class="stream" v-for="n in 6" :key="n"></view>
      </view>
    </view>
    
    <!-- 可滚动内容区域-->
    <scroll-view 
      class="profile-scroll-container" 
      scroll-y 
      enable-back-to-top 
      :scroll-with-animation="true"
      :show-scrollbar="false"
      :enhanced="true"
      :bounces="true"
    >
      <view class="profile-container">

    <!-- 顶部状态栏 -->
    <view class="status-bar">
      <!-- 顶部安全区域占位 -->
      <view class="safe-area-top"></view>
      <view class="status-content">
        <view class="eco-indicator">
          <text class="eco-icon">🌱</text>
          <view class="indicator-pulse"></view>
        </view>
        <text class="title-text">个人中心</text>
        <view class="carbon-display">
          <text class="carbon-text">CO₂-{{ calculateCarbonReduction(points || 0) }}</text>
        </view>
      </view>
    </view>

    <!-- 用户信息主卡片-->
    <view class="user-main-card">
      <view class="hologram-border"></view>
      <view class="card-glow"></view>
      
      <!-- 用户头像区域 -->
      <view class="avatar-section">
        <view class="avatar-ring">
          <view class="avatar-inner">
            <image class="person-avatar" :src="getAvatarUrl(userInfo.avatar || '/static/person.webp.png', baseUrl)" mode="aspectFill"></image>
          </view>
          <!-- 四种垃圾桶围绕-->
          <view class="trash-bins">
            <view class="trash-bin recyclable">
              <view class="bin-content">
                <text class="bin-icon">♻️</text>
                <text class="bin-label">可回收</text>
              </view>
            </view>
            <view class="trash-bin harmful">
              <view class="bin-content">
                <text class="bin-icon">☢️</text>
                <text class="bin-label">有害垃圾</text>
              </view>
            </view>
            <view class="trash-bin kitchen">
              <view class="bin-content">
                <text class="bin-icon">🍎</text>
                <text class="bin-label">厨余垃圾</text>
              </view>
            </view>
            <view class="trash-bin other">
              <view class="bin-content">
                <text class="bin-icon">🗑️</text>
                <text class="bin-label">其他垃圾</text>
              </view>
            </view>
          </view>
          <view class="scanning-line"></view>
        </view>
      </view>

      <!-- 用户信息 -->
      <view class="user-info">
        <text class="username-display">{{ userInfo.username || username }}</text>
        <text class="user-id">ECO ID: {{ (userInfo.username || username).toUpperCase() }}</text>
        <text class="access-level">环保达人 · LEVEL {{ Math.floor((points || 0) / 100) + 1 }}</text>
        <view class="eco-badges">
          <text class="badge" v-if="(points || 0) >= 100">🌿 分类专家</text>
          <text class="badge" v-if="(points || 0) >= 300">♻️ 回收王者</text>
          <text class="badge" v-if="(points || 0) >= 500">🌍 地球守护者</text>
        </view>
      </view>
    </view>

    <!-- 积分统计卡片 -->
    <view class="stats-card" v-if="points !== undefined || loading">
      <view class="stats-header">
        <text class="stats-title"><text class="earth-icon">🌍</text> 环保贡献</text>
        <text class="refresh-btn" @click="handleRefresh" :class="{ rotating: loading }">♻️</text>
      </view>
      
      <view class="stats-content" v-if="!loading">
        <view class="stat-item points">
          <view class="stat-icon">
            <text class="icon-text">🌟</text>
            <view class="pulse-ring green"></view>
          </view>
          <view class="stat-info">
            <text class="stat-label">环保积分</text>
            <text class="stat-value">{{ points || 0 }}</text>
            <text class="stat-unit">ECO POINTS</text>
          </view>
          <view class="info-icon" @click="showPointsInfo">
            <text class="info-symbol">ℹ️</text>
          </view>
          <view class="progress-bar">
            <view class="progress-fill eco" :style="{ width: Math.min((points || 0) / 1000 * 100, 100) + '%' }"></view>
          </view>
        </view>

        <view class="stat-item carbon">
          <view class="stat-icon">
            <text class="icon-text">🍃</text>
            <view class="pulse-ring green"></view>
          </view>
          <view class="stat-info">
            <text class="stat-label">减碳量</text>
            <text class="stat-value">{{ calculateCarbonReduction(points || 0) }}</text>
            <text class="stat-unit">CO₂ SAVED</text>
          </view>
          <view class="info-icon" @click="showCarbonInfo">
            <text class="info-symbol">ℹ️</text>
          </view>
          <view class="progress-bar">
            <view class="progress-fill carbon" :style="{ width: Math.min(calculateCarbonProgress(points || 0), 100) + '%' }"></view>
          </view>
        </view>

        <view class="stat-item recycle">
          <view class="stat-icon">
            <text class="icon-text">♻️</text>
            <view class="pulse-ring green"></view>
          </view>
          <view class="stat-info">
            <text class="stat-label">回收贡献</text>
            <text class="stat-value">{{ Math.floor((points || 0) / 8) }}</text>
            <text class="stat-unit">ITEMS RECYCLED</text>
          </view>
          <view class="progress-bar">
            <view class="progress-fill recycle" style="width: 92%;"></view>
          </view>
        </view>
      </view>

      <view class="loading-display" v-else>
        <view class="loading-spinner eco"></view>
        <text class="loading-text">环保数据同步中...</text>
      </view>
    </view>

    <!-- 设备连接状态卡片-->
    <view v-if="hasConnection" class="device-status-card">
      <view class="device-status-header">
        <text class="device-status-title">
          <text class="device-icon">📱</text> 设备连接
        </text>
        <view class="status-indicator online">
          <view class="status-dot"></view>
          <text class="status-text">在线</text>
        </view>
      </view>
      
      <view class="device-info-section" @click="goToDeviceConnection">
        <view class="device-detail">
          <text class="device-name">{{ connectedDevice?.device_name || '智能垃圾分类设备' }}</text>
          <text class="device-id">ID: {{ connectedDevice?.device_id || connectedDevice?.id || 'N/A' }}</text>
        </view>
        <view class="device-action">
          <text class="action-text">管理连接</text>
          <text class="action-arrow">→</text>
        </view>
      </view>
      
      <view class="device-stats">
        <view class="device-stat-item">
          <text class="stat-label">连接时长</text>
          <text class="stat-value">{{ connectionDuration }}</text>
        </view>
        <view class="device-stat-item">
          <text class="stat-label">状态</text>
          <text class="stat-value">正常运行</text>
        </view>
      </view>
    </view>

    <!-- 功能操作区-->
    <view class="function-grid">
      <view class="function-row">
        <view class="function-item" @click="goHistory">
          <view class="function-icon">
            <text class="icon">📋</text>
            <view class="icon-glow green"></view>
          </view>
          <text class="function-title">识别历史</text>
          <text class="function-desc">查看记录</text>
          <view class="hover-effect"></view>
        </view>

        <view class="function-item" @click="goRanking">
          <view class="function-icon">
            <text class="icon">🏆</text>
            <view class="icon-glow green"></view>
          </view>
          <text class="function-title">环保排行榜</text>
          <text class="function-desc">比拼积分</text>
          <view class="hover-effect"></view>
        </view>

        
                <view class="function-item" @click="goAchievements">
          <view class="function-icon">
            <text class="icon">🏅</text>
            <view class="icon-glow green"></view>
          </view>
          <text class="function-title">成就系统</text>
          <text class="function-desc">任务与徽章</text>
          <view class="hover-effect"></view>
        </view>
      </view>

      <view class="function-row">
        <view class="function-item" @click="goGuide">
          <view class="function-icon">
            <text class="icon">📚</text>
            <view class="icon-glow green"></view>
          </view>
          <text class="function-title">分类指南</text>
          <text class="function-desc">学习环保</text>
          <view class="hover-effect"></view>
        </view>

        <view class="function-item" @click="goSettings">
          <view class="function-icon">
            <text class="icon">⚙️</text>
            <view class="icon-glow green"></view>
          </view>
          <text class="function-title">用户设置</text>
          <text class="function-desc">信息和偏好</text>
          <view class="hover-effect"></view>
        </view>

        <view class="function-item" @click="goAbout">
          <view class="function-icon">
            <text class="icon">ℹ️</text>
            <view class="icon-glow green"></view>
          </view>
          <text class="function-title">关于软件</text>
          <text class="function-desc">应用信息</text>
          <view class="hover-effect"></view>
        </view>
      </view>
    </view>

    <!-- 管理员专属功能-->
    <view v-if="isAdmin" class="admin-card">
      <view class="admin-header">&nbsp;<text style="font-size:large;"> 🔧 </text>&nbsp;<text>管理员功能</text></view>
      <view class="admin-buttons">
        <view class="admin-btn" @click="goFileManagement">📂 文件管理</view>
        <view class="admin-btn" @click="go2048">🎲 2048后台</view>
        <view class="admin-btn" @click="goDbMonitor">📊 数据库管理</view>
        <view class="admin-btn" @click="goAPITest">🧪 接口测试</view>
        <view class="admin-btn" @click="goAdminAISettings">⚙️ AI设置</view>
        <view class="admin-btn" @click="goCollectionDashboard">🗺️ 清运仪表板</view>
        <view class="admin-btn" @click="goCollectionPlanning">📋 清运规划</view>
        <view class="admin-btn" @click="goCommunityDashboard">🏘️ 社区仪表板</view>
      </view>
    </view>

    <!-- 底部导航 -->
    <view class="tech-tabbar">
      <view class="tabbar-bg"></view>
      <view class="tab-item" @click="goHome">
        <view class="tab-icon-container">
          <text class="tab-icon">🏠</text>
          <view class="tab-indicator"></view>
        </view>
        <text class="tab-label">首页</text>
      </view>
      <view class="tab-item" @click="goMap">
        <view class="tab-icon-container">
          <text class="tab-icon">🗺️</text>
          <view class="tab-indicator"></view>
        </view>
        <text class="tab-label">地图</text>
      </view>
      <view class="tab-item" @click="goShop">
        <view class="tab-icon-container">
          <text class="tab-icon">🛍️</text>
          <view class="tab-indicator"></view>
        </view>
        <text class="tab-label">商城</text>
      </view>
      <view class="tab-item active">
        <view class="tab-icon-container">
          <text class="tab-icon">👤</text>
          <view class="tab-indicator active"></view>
        </view>
        <text class="tab-label">我的</text>
      </view>
    </view>

    <!-- 积分信息弹窗 -->
    <!-- 信息弹窗：增加内部滚动与触摸事件拦截，避免背景页面滚动-->
    <view v-if="showInfoModal" class="info-modal-overlay" @click="closePointsInfo" @touchmove.stop.prevent>
      <view class="info-modal" @click.stop @touchmove.stop>
        <view class="info-modal-header">
          <text class="info-modal-title">💰 积分获取说明</text>
          <view class="info-modal-close" @click="closePointsInfo">✕</view>
        </view>
        <view class="info-modal-content">
          <view class="info-item">
            <view class="info-icon-wrapper online">
              <text class="info-emoji">🔍</text>
            </view>
            <view class="info-text">
              <text class="info-title">在线识别</text>
              <text class="info-desc">每次识别垃圾可获得1积分</text>
              <text class="info-limit">每日上限：5积分</text>
            </view>
          </view>
          
          <view class="info-item">
            <view class="info-icon-wrapper device">
              <text class="info-emoji">🗑️</text>
            </view>
            <view class="info-text">
              <text class="info-title">智能分类装置</text>
              <text class="info-desc">使用分类装置投放垃圾</text>
              <text class="info-limit">每次根据垃圾种类获得1-3积分</text>
            </view>
          </view>

          <view class="info-item bonus">
            <view class="info-icon-wrapper bonus">
              <text class="info-emoji">🎁</text>
            </view>
            <view class="info-text">
              <text class="info-title">额外奖励</text>
              <text class="info-desc">连续登录、完美分类等可获得额外积分</text>
            </view>
          </view>
        </view>
        
        <view class="info-modal-footer">
          <text class="info-footer-text">积分可在商城兑换精美礼品</text>
          <view class="info-footer-btn" @click="goToShop">
            <text class="footer-btn-text">前往商城</text>
          </view>
        </view>
        
        <view class="modal-glow-effect"></view>
      </view>
    </view>

    <!-- 减碳信息弹窗 -->
    <!-- 减碳信息弹窗：同样增加内部滚动与触摸拦截 -->
    <view v-if="showCarbonModal" class="info-modal-overlay" @click="closeCarbonInfo" @touchmove.stop.prevent>
      <view class="info-modal" @click.stop @touchmove.stop>
        <view class="info-modal-header">
          <text class="info-modal-title">🍃 减碳量计算说明</text>
          <view class="info-modal-close" @click="closeCarbonInfo">✕</view>
        </view>
        <view class="info-modal-content">
          <view class="info-item">
            <view class="info-icon-wrapper online">
              <text class="info-emoji">♻️</text>
            </view>
            <view class="info-text">
              <text class="info-title">可回收垃圾分类</text>
              <text class="info-desc">每次正确分类可回收垃圾</text>
              <text class="info-limit">减排约36g CO₂当量</text>
            </view>
          </view>
          
          <view class="info-item">
            <view class="info-icon-wrapper device">
              <text class="info-emoji">🍎</text>
            </view>
            <view class="info-text">
              <text class="info-title">厨余垃圾分类</text>
              <text class="info-desc">避免厨余垃圾填埋产生甲烷</text>
              <text class="info-limit">减排约19g CO₂当量</text>
            </view>
          </view>

          <view class="info-item">
            <view class="info-icon-wrapper hazardous">
              <text class="info-emoji">☢️</text>
            </view>
            <view class="info-text">
              <text class="info-title">有害垃圾分类</text>
              <text class="info-desc">专业处理避免环境污染</text>
              <text class="info-limit">减排约57g CO₂当量</text>
            </view>
          </view>

          <view class="info-item bonus">
            <view class="info-icon-wrapper bonus">
              <text class="info-emoji">🌍</text>
            </view>
            <view class="info-text">
              <text class="info-title">计算依据</text>
              <text class="info-desc">基于联合国IPCC报告和国内垃圾处理数据，综合考虑回收利用、堆肥处理和避免填埋的环境效益</text>
            </view>
          </view>
        </view>
        
        <view class="info-modal-footer">
          <view class="carbon-equivalents">
            <text class="equivalents-title">您的{{ calculateCarbonReduction(points || 0) }}减碳量相当于:</text>
            <view class="equivalent-item">
              <text class="equivalent-icon">🌳</text>
              <text class="equivalent-text">种植{{ getCarbonEquivalents(points || 0).trees }}棵树一年的吸碳量</text>
            </view>
            <view class="equivalent-item">
              <text class="equivalent-icon">🚗</text>
              <text class="equivalent-text">减少{{ getCarbonEquivalents(points || 0).carKm }}公里汽车行驶</text>
            </view>
            <view class="equivalent-item">
              <text class="equivalent-icon">💡</text>
              <text class="equivalent-text">节省{{ getCarbonEquivalents(points || 0).electricity }}度电的碳排放</text>
            </view>
          </view>
        </view>
        
        <view class="modal-glow-effect"></view>
      </view>
    </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { onMounted, ref, computed } from 'vue'
import { userinfo } from '@/api/user'
import { useDeviceConnection } from '@/utils/useDeviceConnection'
import { baseUrl } from '../../api/settings'
import { jumpToAdminPage } from '@/utils/admin-page-nav'
import { getAvatarUrl } from '@/utils/avatar-handler.js'

const username = ref('')
const userInfo = ref({})
const loading = ref(false)
const showInfoModal = ref(false) // 控制积分信息弹窗显示
const showCarbonModal = ref(false) // 控制减碳信息弹窗显示
const isAdmin = ref(false)

// 科学的减碳量计算逻辑
const calculateCarbonReduction = (points) => {
  if (!points || points <= 0) return '0g'
  
  // 基于科学数据的减碳系数
  const CARBON_FACTORS = {
    // 垃圾分类行为的平均减排效果 (kg CO₂/次)
    recyclable: 0.036,     // 可回收垃圾分类：减少新材料生产
    kitchen: 0.019,        // 厨余垃圾分类：避免填埋产生甲烷
    hazardous: 0.57,       // 有害垃圾分类：避免环境污染的间接效益
    other: 0.0075,          // 其他垃圾分类：基础减排
    base_classification: 0  // 基础分类行为减排
  }
  
  // 根据积分估算垃圾分类分布（基于实际使用数据）
  const distribution = {
    recyclable: 0.40,     // 40% 可回收垃圾
    kitchen: 0.30,        // 30% 厨余垃圾
    other: 0.22,          // 20% 其他垃圾
    hazardous: 0.08       // 10% 有害垃圾
  }
  
  // 计算总减排量
  let totalReduction = 0
  
  // 基础分类减排
  totalReduction += points * CARBON_FACTORS.base_classification
  
  // 分类别减排计算
  totalReduction += points * distribution.recyclable * CARBON_FACTORS.recyclable
  totalReduction += points * distribution.kitchen * CARBON_FACTORS.kitchen
  totalReduction += points * distribution.other * CARBON_FACTORS.other
  totalReduction += points * distribution.hazardous * CARBON_FACTORS.hazardous
  
  // 格式化显示
  if (totalReduction < 0.01) {
    return '0g'
  } else if (totalReduction < 1) {
    return `${Math.round(totalReduction * 1000)}g`
  } else if (totalReduction < 1000) {
    return `${Math.round(totalReduction * 100) / 100}kg`
  } else {
    return `${Math.round(totalReduction / 10) / 100}t`
  }
}

// 计算减碳进度条百分比
const calculateCarbonProgress = (points) => {
  const rawReduction = parseFloat(calculateCarbonReduction(points))
  if (isNaN(rawReduction)) return 0
  
  // 设定目标为100kg减排，计算进度
  return Math.min((rawReduction / 100) * 100, 100)
}

// 计算减碳当量，便于理解的对比
const getCarbonEquivalents = (points) => {
  const carbonText = calculateCarbonReduction(points)
  let carbonKg = 0
  
  // 解析减碳量数值
  if (carbonText.includes('kg')) {
    carbonKg = parseFloat(carbonText)
  } else if (carbonText.includes('g')) {
    carbonKg = parseFloat(carbonText) / 1000
  } else if (carbonText.includes('t')) {
    carbonKg = parseFloat(carbonText) * 1000
  }
  
  return {
    trees: Math.round((carbonKg / 22) * 10) / 10, // 一棵树年吸收约22kg CO₂
    carKm: Math.round(carbonKg / 0.2), // 小汽车每公里排放约 0.2kg CO₂
    electricity: Math.round(carbonKg / 0.85) // 每度电约产生0.85kg CO₂
  }
}

// 使用设备连接状态管理
const { hasConnection, connectedDevice, goToDeviceConnection, points } = useDeviceConnection()

// 计算连接时长
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

// 获取用户信息包括积分
const fetchUserInfo = async () => {
  try {
    loading.value = true
    const token = uni.getStorageSync('token')
    if (!token) {
      username.value = '游客'
      // 无 token 时清除所有权限相关标记
      isAdmin.value = false
      uni.removeStorageSync('isAdmin')
      return false
    }
    const response = await userinfo()
    if (response.code === 0) {
      userInfo.value = response.data
      points.value = response.data.points || 0
      // 同时更新 username，避免本地存储不是最新值
      if (response.data.username) {
        username.value = response.data.username
      }
      // 后端会返回 isAdmin 字段，保存到本地以便全局读取
      // 严格安全检查：只有后端明确返回 isAdmin=true，才赋予管理员权限
      const isAdminFromServer = !!(response.data && response.data.isAdmin === true)
      isAdmin.value = isAdminFromServer&&uni.getStorageSync('isAdmin')
      try {
        if (isAdminFromServer) {
          uni.setStorageSync('isAdmin', true)
        } else {
          // 若后端返回 isAdmin=false 或缺失，立即清除本地标记
          uni.removeStorageSync('isAdmin')
        }
        return true
      } catch (e) {
        // ignore storage errors
        return false
      }
    } else {
      console.error('获取用户信息失败:', response.msg)
      uni.showToast({
        title: response.data.msg || '获取用户信息失败',
        icon: 'none'
      })
      return false
    }
  } catch (error) {
    console.error('请求用户信息出错:', error)
    uni.showToast({
      title: error.msg || '网络错误，请稍后重试',
      icon: 'none'
    })
    return false
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  const theme = uni.getStorageSync('app_theme')
  if(theme === 'light'){
    uni.navigateTo({url:'/pages/profile/profile'})
  }
  const savedUser = uni.getStorageSync('savedUser')?.username
  if (!(savedUser && uni.getStorageSync('autoLogin'))) {
    
  } else {
    username.value = savedUser
  }
  
  // 获取完整的用户信息（包括积分和权限）
  await fetchUserInfo()
  
  // 安全防护：验证本地存储的 isAdmin 是否仍有服务端权限
  // 若本地有 isAdmin 但服务端返回无权限，立即清除本地标记
  if (uni.getStorageSync('isAdmin') && !isAdmin.value) {
    uni.removeStorageSync('isAdmin')
  }
})

// 手动刷新用户信息
const handleRefresh = async () => {
  if (await fetchUserInfo()) {
    uni.showToast({
      title: '刷新成功',
      icon: 'success'
    })
  }
}

// 显示积分信息弹窗
const showPointsInfo = () => {
  showInfoModal.value = true
}

// 关闭积分信息弹窗
const closePointsInfo = () => {
  showInfoModal.value = false
}

// 显示减碳信息弹窗
const showCarbonInfo = () => {
  showCarbonModal.value = true
}

// 关闭减碳信息弹窗
const closeCarbonInfo = () => {
  showCarbonModal.value = false
}

// 前往商城
const goToShop = () => {
  closePointsInfo()
  uni.redirectTo({ url: '/pages-dark/shop/shop' })
}

function goHistory() {uni.navigateTo({ url: '/pages-dark/history/history' })}
function goRanking() {uni.navigateTo({ url: '/pages-dark/ranking/ranking' })}
function goSettings() { uni.navigateTo({ url: '/pages-nonTheme/settings' }) }
function goAbout() {uni.navigateTo({ url: '/pages-nonTheme/about' })}
function goGuide() {uni.navigateTo({ url: '/pages-dark/guide/guide' })}
function goAchievements() { uni.navigateTo({ url: '/pages-nonTheme/achievements' })}

// 权限验证函数：在导航前验证用户是否真正拥有管理员权限
async function verifyAdminPermission() {
  // 1. 本地快速检查
  const localAdminFlag = uni.getStorageSync('isAdmin')
  if (!localAdminFlag) {
    uni.showToast({ title: '无权限访问', icon: 'none' })
    return false
  }
  // 2. 向后端验证权限
  try {
    const response = await userinfo()
    if (response && response.data && response.data.isAdmin){
      return true
    } else {
      // 权限验证失败，清除本地伪造的 isAdmin 标记
      uni.removeStorageSync('isAdmin')
      isAdmin.value = false
      uni.showToast({ title: '权限已过期或被撤销', icon: 'none' })
      return false
    }
  } catch (err) {
    console.error('权限验证失败:', err)
    uni.showToast({ title: '权限验证失败，请重新登录', icon: 'none' })
    return false
  }
}

function goFileManagement() {
  verifyAdminPermission().then(hasPermission => {
    if (hasPermission) {
      // 在应用内使用 webview 打开文件管理，避免显示浏览器地址栏
      const target = encodeURIComponent(baseUrl + '/files')
      uni.navigateTo({ url: `/pages-nonTheme/webview?url=${target}` })
    }
  })
}

function goDbMonitor() {
  verifyAdminPermission().then(hasPermission => {
    if (hasPermission) {
      uni.navigateTo({ url: '/pages-nonTheme/database' }).catch(() => {
        uni.showToast({ title: '无权限访问', icon: 'none' })
      })
    }
  })
}

function goAPITest() {
  verifyAdminPermission().then(hasPermission => {
    if (hasPermission) {
      uni.navigateTo({ url: '/pages-nonTheme/test' })
    }
  })
}

function go2048() {
  verifyAdminPermission().then(hasPermission => {
    if (hasPermission) {
      // 在应用内使用 webview 打开 2048 管理台
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
function goHome() {
  uni.redirectTo({ url: '/pages-dark/home/home' })
}
function goMap() {
  uni.navigateTo({ url: '/pages-dark/map/map' })
}
function goShop() {
  uni.redirectTo({ url: '/pages-dark/shop/shop' })
}
</script>

<style scoped>
/* 确保页面和body可以滚动 */
page {
  height: auto;
  overflow: visible;
  -webkit-overflow-scrolling: touch;
}

/* 针对H5的body样式 */
/* #ifndef APP-PLUS */
body {
  height: auto;
  overflow: visible;
  -webkit-overflow-scrolling: touch;
}
/* #endif */

/* 页面根容器*/
.profile-page {
  height: 100vh;
  position: relative;
  overflow: hidden;
}

/* 滚动容器 - 小程序使用scroll-view */
.profile-scroll-container {
  height: 100vh;
  width: 100%;
  position: relative;
}

/* 内容容器 */
.profile-container {
  min-height: 100vh;
  background: radial-gradient(ellipse at center, #0a1a2f 0%, #051015 70%, #000508 100%);
  position: relative;
  padding: 0; /* 顶部安全区只在自定义导航内部处理，避免 iOS 多重 env(safe-area-inset-top) 叠加 */
  padding-bottom: max(160rpx, calc(140rpx + env(safe-area-inset-bottom)));
  box-sizing: border-box;
}

/* H5环境下的兼容处理 */
/* #ifdef H5 */
.profile-page {
  height: 100vh;
  overflow: hidden;
}

.profile-scroll-container {
  height: 100vh;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  scroll-behavior: smooth;
  touch-action: pan-y pinch-zoom;
}
/* #endif */

/* 科技背景样式 */
.tech-background {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  pointer-events: none;
}

/* 小程序环境下的背景定位调整 */
/* #ifdef MP */
.tech-background {
  position: absolute;
}
/* #endif */

.grid-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: 
    linear-gradient(rgba(64, 224, 255, 0.12) 1px, transparent 1px),
    linear-gradient(90deg, rgba(64, 224, 255, 0.12) 1px, transparent 1px);
  background-size: 50px 50px;
  animation: gridMove 20s linear infinite;
}

@keyframes gridMove {
  0% { transform: translate(0, 0); }
  100% { transform: translate(50px, 50px); }
}

/* 浮动粒子效果 */
.floating-particles {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.particle {
  position: absolute;
  width: 4px;
  height: 4px;
  background: radial-gradient(circle, #40e0ff 0%, transparent 70%);
  border-radius: 50%;
  animation: floatParticle 8s ease-in-out infinite;
}

.particle:nth-child(odd) { animation-direction: alternate; }
.particle:nth-child(2) { top: 20%; left: 10%; animation-duration: 6s; }
.particle:nth-child(3) { top: 60%; left: 80%; animation-duration: 10s; }
.particle:nth-child(4) { top: 80%; left: 20%; animation-duration: 7s; }
.particle:nth-child(5) { top: 40%; left: 70%; animation-duration: 9s; }
.particle:nth-child(6) { top: 10%; left: 60%; animation-duration: 8s; }

@keyframes floatParticle {
  0%, 100% { transform: translateY(0) scale(1); opacity: 0.3; }
  50% { transform: translateY(-30px) scale(1.5); opacity: 1; }
}

/* 电路线条效果 */
.circuit-lines {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.line {
  position: absolute;
  background: linear-gradient(90deg, transparent 0%, #40e0ff 50%, transparent 100%);
  opacity: 0.6;
}

.line.horizontal {
  top: 30%;
  left: 0;
  width: 100%;
  height: 2px;
  animation: lineFlowH 6s ease-in-out infinite;
}

.line.vertical {
  top: 0;
  right: 20%;
  width: 2px;
  height: 100%;
  background: linear-gradient(0deg, transparent 0%, #40e0ff 50%, transparent 100%);
  animation: lineFlowV 8s ease-in-out infinite;
}

.line.diagonal {
  top: 10%;
  left: 10%;
  width: 200px;
  height: 2px;
  transform: rotate(45deg);
  animation: lineFlowD 10s ease-in-out infinite;
}

@keyframes lineFlowH {
  0%, 100% { opacity: 0.3; transform: scaleX(1); }
  50% { opacity: 0.8; transform: scaleX(1.2); }
}

@keyframes lineFlowV {
  0%, 100% { opacity: 0.3; transform: scaleY(1); }
  50% { opacity: 0.8; transform: scaleY(1.2); }
}

@keyframes lineFlowD {
  0%, 100% { opacity: 0.2; transform: rotate(45deg) scale(1); }
  50% { opacity: 0.6; transform: rotate(45deg) scale(1.1); }
}

/* 数据流效果*/
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
    #40e0ff 10%, 
    transparent 20%, 
    transparent 80%, 
    #00ff88 90%, 
    transparent 100%);
  animation: streamFlow 4s linear infinite;
}

.stream:nth-child(1) { left: 15%; animation-delay: 0s; }
.stream:nth-child(2) { left: 35%; animation-delay: 1s; }
.stream:nth-child(3) { left: 55%; animation-delay: 2s; }
.stream:nth-child(4) { left: 75%; animation-delay: 0.5s; }
.stream:nth-child(5) { left: 85%; animation-delay: 1.5s; }
.stream:nth-child(6) { left: 95%; animation-delay: 2.5s; }

@keyframes streamFlow {
  0% { transform: translateY(-100%); opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { transform: translateY(100%); opacity: 0; }
}

/* 混合科技状态栏 */
.status-bar {
  position: relative;
  z-index: 10;
  background: rgba(0, 25, 45, 0.9);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(64, 224, 255, 0.4);
  /* 这里不再叠加 env(safe-area-inset-top)，统一用 .safe-area-top 占位，避免 iOS 顶部空白过大 */
}

.safe-area-top {
  /* 单一安全区占位：iOS 刘海区高度；Android 通常为 0 */
  height: env(safe-area-inset-top);
  min-height: 44rpx; /* 兜底的状态栏视觉高度 */
}

.status-content {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60rpx 40rpx 20rpx;
  position: relative;
}

.eco-indicator {
  position: absolute;
  left: 40rpx;
}

.eco-indicator {
  position: absolute;
  left: 40rpx;
  display: flex;
  align-items: center;
}

.carbon-display {
  position: absolute;
  right: 40rpx;
  background: rgba(0, 255, 136, 0.2);
  padding: 8rpx 16rpx;
  border-radius: 20rpx;
  border: 1px solid rgba(0, 255, 136, 0.4);
}

.eco-icon {
  font-size: 35rpx;
  margin-right: 8rpx;
}

.indicator-pulse {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 20rpx #10b981;
  animation: ecoGlow 2s ease-in-out infinite;
}

@keyframes ecoGlow {
  0%, 100% { opacity: 0.6; transform: scale(1); box-shadow: 0 0 20rpx #00ff88; }
  50% { opacity: 1; transform: scale(1.2); box-shadow: 0 0 30rpx #00ff88, 0 0 40rpx rgba(0, 255, 136, 0.5); }
}

.title-text {
  color: #40e0ff;
  font-size: 32rpx;
  font-weight: 700;
  letter-spacing: 2rpx;
  font-family: 'Courier New', monospace;
}
.status-text {
  color: #40e0ff;
  font-size: 22rpx;
  font-weight: 600;
  letter-spacing: 2rpx;
  font-family: 'Courier New', monospace;
}
.carbon-text {
  color: #00ff88;
  font-size: 20rpx;
  font-weight: 600;
  font-family: 'Courier New', monospace;
}

/* 用户主卡片 */
.user-main-card {
  position: relative;
  z-index: 10;
  margin: 30rpx 40rpx 30rpx;
  background: rgba(0, 35, 65, 0.95);
  backdrop-filter: blur(20px);
  border-radius: 30rpx;
  border: 2px solid rgba(64, 224, 255, 0.5);
  padding: 60rpx 40rpx;
  overflow: hidden;
}

.hologram-border {
  position: absolute;
  top: -2px;
  left: -2px;
  right: -2px;
  bottom: -2px;
  border-radius: 30rpx;
  background: linear-gradient(45deg, 
    transparent 0%, 
    rgba(64, 224, 255, 0.8) 25%, 
    transparent 50%, 
    rgba(0, 255, 136, 0.8) 75%, 
    transparent 100%);
  animation: hologramRotate 4s linear infinite;
  z-index: -1;
}

@keyframes hologramRotate {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.card-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(64, 224, 255, 0.15) 0%, transparent 70%);
  transform: translate(-50%, -50%);
  animation: glowPulse 3s ease-in-out infinite;
}

@keyframes glowPulse {
  0%, 100% { opacity: 0.3; transform: translate(-50%, -50%) scale(1); }
  50% { opacity: 0.6; transform: translate(-50%, -50%) scale(1.1); }
}

/* 头像区域 */
.avatar-section {
  display: flex;
  justify-content: center;
  margin-bottom: 50rpx;
  padding: 15rpx 0;
}

.avatar-ring {
  position: relative;
  width: 200rpx;
  height: 200rpx;
  border: 3px solid rgba(64, 224, 255, 0.7);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-inner {
  width: 150rpx;
  height: 150rpx;
  border-radius: 50%;
  overflow: hidden;
  background: rgba(64, 224, 255, 0.1);
  z-index: 10;
  position: relative;
}

.person-avatar {
  width: 100%;
  height: 100%;
  border-radius: 50%;
}

/* 垃圾桶围绕动画*/
.trash-bins {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  animation: trashBinsRotate 20s linear infinite;
}

.trash-bin {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 60rpx;
  height: 80rpx;
}

.trash-bin:nth-child(1) { /* 可回收*/
  transform: translate(-50%, -50%) rotate(0deg) translateY(-120rpx) rotate(0deg);
}

.trash-bin:nth-child(2) { /* 有害垃圾 */
  transform: translate(-50%, -50%) rotate(90deg) translateY(-120rpx) rotate(-90deg);
}

.trash-bin:nth-child(3) { /* 厨余垃圾 */
  transform: translate(-50%, -50%) rotate(180deg) translateY(-120rpx) rotate(-180deg);
}

.trash-bin:nth-child(4) { /* 其他垃圾 */
  transform: translate(-50%, -50%) rotate(270deg) translateY(-120rpx) rotate(-270deg);
}

.bin-content {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 12rpx;
  border: 2px solid;
  animation: keepUpright 20s linear infinite reverse;
}

.trash-bin.recyclable .bin-content {
  border-color: #22c55e;
  background: rgba(34, 197, 94, 0.2);
}

.trash-bin.harmful .bin-content {
  border-color: #ef4444;
  background: rgba(239, 68, 68, 0.2);
}

.trash-bin.kitchen .bin-content {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.2);
}

.trash-bin.other .bin-content {
  border-color: #6b7280;
  background: rgba(107, 114, 128, 0.2);
}

.bin-icon {
  font-size: 24rpx;
  line-height: 1;
  margin-bottom: 4rpx;
}

.bin-label {
  font-size: 14rpx;
  color: #ffffff;
  font-weight: 500;
  text-align: center;
  line-height: 1;
  letter-spacing: 0.5rpx;
}

@keyframes trashBinsRotate {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes keepUpright {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.scanning-line {
  position: absolute;
  top: -3px;
  left: -3px;
  right: -3px;
  bottom: -3px;
  border-radius: 50%;
  background: conic-gradient(from 0deg, transparent, #40e0ff, transparent);
  animation: scanRotate 3s linear infinite;
  z-index: 5;
}

@keyframes scanRotate {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 用户信息 */
.user-info {
  text-align: center;
}

.username-display {
  display: block;
  color: #ffffff;
  font-size: 48rpx;
  font-weight: 700;
  margin-bottom: 16rpx;
  text-shadow: 0 0 20rpx rgba(64, 224, 255, 0.9);
  letter-spacing: 2rpx;
}

.user-id {
  display: block;
  color: #40e0ff;
  font-size: 28rpx;
  font-family: 'Courier New', monospace;
  margin-bottom: 10rpx;
  letter-spacing: 3rpx;
}

.access-level {
  display: block;
  color: #00ff88;
  font-size: 24rpx;
  font-family: 'Courier New', monospace;
  letter-spacing: 2rpx;
  margin-bottom: 15rpx;
}

.eco-badges {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12rpx;
  margin-top: 15rpx;
}

.badge {
  background: rgba(0, 255, 136, 0.2);
  color: #00ff88;
  font-size: 20rpx;
  padding: 6rpx 12rpx;
  border-radius: 16rpx;
  border: 1px solid rgba(0, 255, 136, 0.4);
  font-weight: 500;
}

/* 统计卡片 */
.stats-card {
  position: relative;
  z-index: 10;
  margin: 0 40rpx 24rpx;
  background: rgba(0, 30, 55, 0.95);
  backdrop-filter: blur(15px);
  border-radius: 20rpx;
  border: 1px solid rgba(64, 224, 255, 0.4);
  padding: 28rpx;
  overflow: hidden;
}

.stats-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.stats-title {
  color: #40e0ff;
  font-size: 32rpx;
  font-weight: 600;
  letter-spacing: 2rpx;
  display: flex;
  align-items: center;
}

.earth-icon {
  font-size: 40rpx;
  margin-right: 12rpx;
}

.refresh-btn {
  color: #00ff88;
  font-size: 36rpx;
  padding: 10rpx;
  border-radius: 50%;
  background: rgba(0, 255, 136, 0.15);
  transition: all 0.3s ease;
}

.refresh-btn.rotating {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.stats-content {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.stat-item {
  display: flex;
  align-items: center;
  padding: 22rpx;
  background: rgba(34, 197, 94, 0.08);
  border-radius: 16rpx;
  border: 1px solid rgba(34, 197, 94, 0.3);
  position: relative;
  overflow: hidden;
}

.stat-icon {
  position: relative;
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 20rpx;
}

.icon-text {
  color: #22c55e;
  font-size: 32rpx;
  z-index: 2;
  position: relative;
}

.pulse-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 50rpx;
  height: 50rpx;
  border: 2px solid #22c55e;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  animation: pulseRing 2s ease-out infinite;
}

.pulse-ring.green {
  border-color: #16a34a;
}

.stat-unit {
  color: rgba(34, 197, 94, 0.7);
  font-size: 18rpx;
  font-family: 'Courier New', monospace;
  letter-spacing: 1rpx;
  margin-top: 2rpx;
}

@keyframes pulseRing {
  0% { transform: translate(-50%, -50%) scale(0.8); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
}

.stat-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.stat-label {
  color: rgba(255, 255, 255, 0.8);
  font-size: 24rpx;
  margin-bottom: 6rpx;
}

.info-icon {
  position: relative;
  width: 32rpx;
  height: 32rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(64, 224, 255, 0.2);
  border: 1px solid rgba(64, 224, 255, 0.4);
  cursor: pointer;
  transition: all 0.3s ease;
}

.info-icon:active {
  transform: scale(0.9);
  background: rgba(64, 224, 255, 0.3);
}

.info-symbol {
  font-size: 18rpx;
  color: #40e0ff;
  z-index: 2;
}

.info-pulse {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 2px solid rgba(64, 224, 255, 0.6);
  animation: infoPulse 2s ease-in-out infinite;
}

@keyframes infoPulse {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

.stat-value {
  color: #ffffff;
  font-size: 36rpx;
  font-weight: 700;
  text-shadow: 0 0 15rpx rgba(34, 197, 94, 0.7);
}

.progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 6rpx;
  background: rgba(34, 197, 94, 0.25);
}

.progress-fill.eco {
  background: linear-gradient(90deg, #22c55e, #16a34a);
  box-shadow: 0 0 10rpx rgba(34, 197, 94, 0.5);
}

.progress-fill.carbon {
  background: linear-gradient(90deg, #10b981, #059669);
  box-shadow: 0 0 10rpx rgba(16, 185, 129, 0.5);
}

.progress-fill.recycle {
  background: linear-gradient(90deg, #16a34a, #15803d);
  box-shadow: 0 0 10rpx rgba(22, 163, 74, 0.5);
}

@keyframes progressFlow {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 1; }
}

/* 加载状态 */
.loading-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40rpx 0;
}

.loading-spinner {
  width: 60rpx;
  height: 60rpx;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 20rpx;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.loading-spinner.eco {
  border: 4rpx solid rgba(64, 224, 255, 0.3);
  border-top: 4rpx solid #40e0ff;
}

.loading-text {
  color: #40e0ff;
  font-size: 28rpx;
}

/* 设备连接状态卡片*/
.device-status-card {
  position: relative;
  z-index: 10;
  margin: 0 40rpx 30rpx;
  background: rgba(0, 35, 20, 0.95);
  backdrop-filter: blur(15px);
  border-radius: 24rpx;
  border: 1px solid rgba(16, 185, 129, 0.4);
  padding: 40rpx;
  overflow: hidden;
}

.device-status-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 30rpx;
}

.device-status-title {
  color: #10b981;
  font-size: 32rpx;
  font-weight: 600;
  letter-spacing: 2rpx;
  display: flex;
  align-items: center;
}

.device-icon {
  font-size: 40rpx;
  margin-right: 12rpx;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 6rpx 14rpx;
  border-radius: 20rpx;
  background: rgba(16, 185, 129, 0.2);
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.status-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 16rpx #10b981;
  animation: statusPulse 2s ease-in-out infinite;
}

@keyframes statusPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.2); }
}

.device-info-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 32rpx;
  background: rgba(16, 185, 129, 0.08);
  border-radius: 20rpx;
  border: 1px solid rgba(16, 185, 129, 0.2);
  margin-bottom: 24rpx;
  transition: all 0.3s ease;
  cursor: pointer;
}

.device-info-section:active {
  transform: scale(0.98);
  background: rgba(16, 185, 129, 0.12);
}

.device-detail {
  flex: 1;
}

.device-name {
  display: block;
  color: #ffffff;
  font-size: 32rpx;
  font-weight: 600;
  margin-bottom: 8rpx;
}

.device-id {
  display: block;
  color: rgba(255, 255, 255, 0.7);
  font-size: 24rpx;
  font-family: 'Courier New', monospace;
}

.device-action {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.action-text {
  color: #10b981;
  font-size: 28rpx;
  font-weight: 600;
}

.action-arrow {
  color: #10b981;
  font-size: 32rpx;
  font-weight: bold;
}

.device-stats {
  display: flex;
  gap: 32rpx;
}

.device-stat-item {
  flex: 1;
  text-align: center;
  padding: 24rpx 16rpx;
  background: rgba(16, 185, 129, 0.05);
  border-radius: 16rpx;
  border: 1px solid rgba(16, 185, 129, 0.15);
}

.device-stat-item .stat-label {
  display: block;
  color: rgba(255, 255, 255, 0.6);
  font-size: 24rpx;
  margin-bottom: 8rpx;
}

.device-stat-item .stat-value {
  display: block;
  color: #10b981;
  font-size: 28rpx;
  font-weight: 600;
}

/* 功能网格 */
.function-grid {
  position: relative;
  z-index: 10;
  margin: 0 40rpx 10rpx;
}

.function-row {
  display: flex;
  gap: 16rpx;
  margin-bottom: 16rpx;
}

.function-row:last-child {
  margin-bottom: 0;
}

.function-item {
  flex: 1;
  background: rgba(5, 35, 20, 0.85);
  backdrop-filter: blur(10px);
  border-radius: 16rpx;
  border: 1px solid rgba(34, 197, 94, 0.4);
  padding: 16rpx 20rpx;
  text-align: center;
  position: relative;
  overflow: hidden;
  gap: 16rpx;
  transition: all 0.3s ease;
}

.function-item:active {
  transform: scale(0.95);
}

.function-icon {
  position: relative;
  margin-bottom: 12rpx;
}

.icon {
  font-size: 40rpx;
  display: block;
}

.icon-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 60rpx;
  height: 60rpx;
  background: radial-gradient(circle, rgba(34, 197, 94, 0.4) 0%, transparent 70%);
  transform: translate(-50%, -50%);
  border-radius: 50%;
  animation: iconGlow 2s ease-in-out infinite;
}

.icon-glow.green {
  background: radial-gradient(circle, rgba(34, 197, 94, 0.4) 0%, transparent 70%);
}

.icon-glow.red {
  background: radial-gradient(circle, rgba(239, 68, 68, 0.4) 0%, transparent 70%);
}

@keyframes iconGlow {
  0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(1); }
  50% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
}

.function-title {
  display: block;
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 600;
  margin-bottom: 5rpx;
  letter-spacing: 1rpx;
}

.function-desc {
  display: block;
  color: rgba(255, 255, 255, 0.7);
  font-size: 22rpx;
}

.hover-effect {
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
  transition: left 0.5s ease;
}

.function-item:hover .hover-effect {
  left: 0;
}

/* 科技底部导航 */
.tech-tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 120rpx;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-around;
  background: rgba(0, 20, 40, 0.95);
  backdrop-filter: blur(20px);
  border-top: 1px solid rgba(64, 224, 255, 0.4);
}

.tabbar-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, 
    rgba(64, 224, 255, 0.08) 0%, 
    rgba(0, 255, 136, 0.08) 50%, 
    rgba(64, 224, 255, 0.08) 100%);
  animation: tabbarFlow 5s ease-in-out infinite;
}

@keyframes tabbarFlow {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.6; }
}

.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: 20rpx 0;
}

.tab-icon-container {
  position: relative;
  margin-bottom: 8rpx;
}

.tab-icon {
  font-size: 44rpx;
  filter: grayscale(100%);
  transition: all 0.3s ease;
}

.tab-item.active .tab-icon {
  filter: grayscale(0%);
  transform: scale(1.1);
  text-shadow: 0 0 20rpx #40e0ff;
}

.tab-indicator {
  position: absolute;
  bottom: -8rpx;
  left: 50%;
  width: 60rpx;
  height: 6rpx;
  background: transparent;
  transform: translateX(-50%);
  border-radius: 3rpx;
  transition: all 0.3s ease;
}

.tab-indicator.active {
  background: linear-gradient(90deg, #40e0ff, #00ff88);
  box-shadow: 0 0 20rpx rgba(64, 224, 255, 0.8);
}

.tab-label {
  color: rgba(255, 255, 255, 0.6);
  font-size: 20rpx;
  font-weight: 500;
  letter-spacing: 1rpx;
  transition: color 0.3s ease;
}

.tab-item.active .tab-label {
  color: #40e0ff;
  text-shadow: 0 0 10rpx rgba(64, 224, 255, 0.7);
}

/* 脉冲动画 */
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.1); }
}

/* 积分信息弹窗 */
.info-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(10px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  0% { opacity: 0; }
  100% { opacity: 1; }
}

.info-modal {
  background: rgba(0, 30, 55, 0.98);
  backdrop-filter: blur(25px);
  border-radius: 32rpx;
  border: 2px solid rgba(64, 224, 255, 0.5);
  max-width: 650rpx;
  width: 100%;
  /* 在不同平台优先使用 80vh，兼容部分小程序对 vh 支持差异，再限制一个像素高度 */
  max-height: min(90vh, 1200rpx);
  display: flex;
  flex-direction: column;
  overflow: hidden; /* 外层不滚动，内部内容区滚动 */
  animation: modalSlideIn 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  position: relative;
  box-shadow: 
    0 20rpx 60rpx rgba(0, 0, 0, 0.5),
    0 0 80rpx rgba(64, 224, 255, 0.3);
}

@keyframes modalSlideIn {
  0% { 
    opacity: 0; 
    transform: scale(0.8) translateY(40rpx); 
  }
  100% { 
    opacity: 1; 
    transform: scale(1) translateY(0); 
  }
}

.info-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 40rpx 40rpx 20rpx;
  border-bottom: 1px solid rgba(64, 224, 255, 0.2);
}

.info-modal-title {
  color: #40e0ff;
  font-size: 36rpx;
  font-weight: 700;
  text-shadow: 0 0 20rpx rgba(64, 224, 255, 0.6);
}

.info-modal-close {
  width: 48rpx;
  height: 48rpx;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.info-modal-close:active {
  transform: scale(0.9);
  background: rgba(255, 255, 255, 0.2);
}

.info-modal-content {
  padding: 10rpx 40rpx 20rpx;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  flex: 1; /* 占据可滚动区域 */
  min-height: 0; /* 解决 flex 子项在部分小程序中无法收缩导致不能滚动的问题 */
}

/* H5环境下隐藏滚动条 */
/* #ifdef H5 */
.info-modal-content::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

.info-modal-content {
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE 10+ */
}
/* #endif */

/* 在极小屏（高度 < 600px）时，适当减小内边距与圆角，保障可视内容 */
@media screen and (max-height: 600px) {
  .info-modal { border-radius: 24rpx; }
  .info-modal-header { padding: 30rpx 30rpx 16rpx; }
  .info-modal-content { padding: 10rpx 30rpx 16rpx; }
  .info-modal-footer { padding: 16rpx 30rpx 30rpx; }
}

.info-item {
  display: flex;
  align-items: flex-start;
  gap: 24rpx;
  padding: 24rpx 0;
  border-bottom: 1px solid rgba(64, 224, 255, 0.1);
}

.info-item:last-child {
  border-bottom: none;
}

.info-item.bonus {
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.05) 0%, rgba(255, 193, 7, 0.05) 100%);
  border-radius: 16rpx;
  padding: 24rpx 16rpx;
  margin-top: 10rpx;
  border: 1px solid rgba(255, 215, 0, 0.2);
}

.info-icon-wrapper {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  flex-shrink: 0;
}

.info-icon-wrapper.online {
  background: linear-gradient(135deg, rgba(64, 224, 255, 0.2) 0%, rgba(52, 211, 153, 0.2) 100%);
  border: 2px solid rgba(64, 224, 255, 0.4);
}

.info-icon-wrapper.device {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.2) 100%);
  border: 2px solid rgba(16, 185, 129, 0.4);
}

.info-icon-wrapper.bonus {
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.2) 0%, rgba(255, 193, 7, 0.2) 100%);
  border: 2px solid rgba(255, 215, 0, 0.4);
}

.info-icon-wrapper.hazardous {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.2) 100%);
  border: 2px solid rgba(239, 68, 68, 0.4);
}

.carbon-equivalents {
  text-align: center;
}

.equivalents-title {
  display: block;
  color: rgba(255, 255, 255, 0.7);
  font-size: 24rpx;
  margin-bottom: 20rpx;
}

.equivalent-item {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  margin-bottom: 12rpx;
  padding: 12rpx 20rpx;
  background: rgba(0, 255, 136, 0.1);
  border-radius: 20rpx;
  border: 1px solid rgba(0, 255, 136, 0.2);
}

.equivalent-icon {
  font-size: 24rpx;
}

.equivalent-text {
  color: #00ff88;
  font-size: 22rpx;
  font-weight: 500;
}

.info-emoji {
  font-size: 36rpx;
  filter: drop-shadow(0 0 10rpx rgba(64, 224, 255, 0.6));
}

.info-text {
  flex: 1;
}

.info-title {
  display: block;
  color: #ffffff;
  font-size: 32rpx;
  font-weight: 600;
  margin-bottom: 8rpx;
  text-shadow: 0 0 15rpx rgba(64, 224, 255, 0.4);
}

.info-desc {
  display: block;
  color: rgba(255, 255, 255, 0.8);
  font-size: 26rpx;
  line-height: 1.5;
  margin-bottom: 6rpx;
}

.info-limit {
  display: block;
  color: #40e0ff;
  font-size: 24rpx;
  font-weight: 500;
  background: rgba(64, 224, 255, 0.1);
  padding: 6rpx 12rpx;
  border-radius: 12rpx;
  display: inline-block;
  border: 1px solid rgba(64, 224, 255, 0.3);
}

.info-modal-footer {
  padding: 20rpx 40rpx 40rpx;
  text-align: center;
  border-top: 1px solid rgba(64, 224, 255, 0.2);
}

.info-footer-text {
  display: block;
  color: rgba(255, 255, 255, 0.7);
  font-size: 24rpx;
  margin-bottom: 20rpx;
}

.info-footer-btn {
  background: linear-gradient(135deg, #40e0ff 0%, #4ecdc4 100%);
  border-radius: 50rpx;
  padding: 24rpx 48rpx;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 8rpx 24rpx rgba(64, 224, 255, 0.3);
  display: inline-block;
}

.info-footer-btn:active {
  transform: scale(0.98) translateY(2rpx);
  box-shadow: 0 4rpx 12rpx rgba(64, 224, 255, 0.4);
}

.footer-btn-text {
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 600;
  text-shadow: 0 0 10rpx rgba(0, 0, 0, 0.5);
}

.modal-glow-effect {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(64, 224, 255, 0.1) 0%, transparent 70%);
  animation: modalGlow 3s ease-in-out infinite;
  pointer-events: none;
  z-index: -1;
}

@keyframes modalGlow {
  0%, 100% { 
    opacity: 0.3; 
    transform: scale(1) rotate(0deg); 
  }
  50% { 
    opacity: 0.6; 
    transform: scale(1.1) rotate(180deg); 
  }
}

/* 管理员面板样式，增加间距与触控友好区域 */
.admin-card {
  position: relative;
  z-index: 10;
  margin: 20rpx 40rpx 0rpx;
  background: rgba(5, 20, 40, 0.92);
  backdrop-filter: blur(8px);
  padding: 20rpx;
  border-radius: 16rpx;
  border: 1px solid rgba(64, 224, 255, 0.08);
}
.admin-header {
  text-align: left;
  color: #40e0ff;
  font-size: 30rpx;
  font-weight: 700;
  margin-bottom: 12rpx;
}
.admin-buttons {
  display: flex;
  gap: 14rpx;
  flex-wrap: wrap;
  justify-content: space-between;
}
.admin-btn {
  flex: 1 1 calc(50% - 7rpx);
  min-width: 160rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  padding: 18rpx 12rpx;
  background: linear-gradient(1deg, rgba(64, 223, 255, 0.182), rgba(0, 255, 136, 0.023));
  border-radius: 12rpx;
  border: 1px solid rgba(64, 224, 255, 0.08);
  font-size: 28rpx;
  color: #ffffff;
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
  text-align: center;
}
.admin-btn text {
  font-size: 26rpx;
}
.admin-btn:active {
  transform: translateY(2rpx) scale(0.99);
  box-shadow: inset 0 0 8rpx rgba(0, 0, 0, 0.12);
}

@media screen and (max-width: 768px) {
  .function-grid {
    margin: 0 20rpx 10rpx;
  }

  .function-row {
    gap: 12rpx;
    margin-bottom: 12rpx;
  }

  .function-item {
    padding: 14rpx 12rpx;
  }

  .function-title {
    font-size: 24rpx;
  }

  .function-desc {
    font-size: 20rpx;
  }

  .tab-item {
    padding: 16rpx 0;
  }

  .tab-icon {
    font-size: 40rpx;
  }

  .tab-label {
    font-size: 20rpx;
  }

  .info-modal {
    width: calc(100vw - 40rpx);
  }

  .info-modal-header {
    padding: 26rpx 24rpx 16rpx;
  }

  .info-modal-content {
    padding: 10rpx 24rpx 14rpx;
  }

  .info-modal-footer {
    padding: 14rpx 24rpx 24rpx;
  }

  .admin-card {
    margin: 16rpx 20rpx 0;
    padding: 18rpx;
  }

  .admin-btn {
    padding: 16rpx 10rpx;
    font-size: 24rpx;
  }

  .admin-btn text {
    font-size: 22rpx;
  }
}

@media screen and (max-width: 420px) {
  .function-grid {
    margin-left: 16rpx;
    margin-right: 16rpx;
  }

  .function-row {
    flex-wrap: wrap;
  }

  .function-item {
    flex: 1 1 calc(50% - 6rpx);
    min-width: 0;
  }

  .info-modal {
    width: calc(100vw - 28rpx);
  }

  .admin-btn {
    flex: 1 1 100%;
    min-width: 0;
  }
}
</style>


