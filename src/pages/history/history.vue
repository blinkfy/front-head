<template>
  <view class="history-bg">
    <!-- 自定义状态栏 -->
    <view class="custom-statusbar"></view>
    
    <!-- 科技背景动效元素 -->
    <view class="tech-bg">
      <view class="tech-grid"></view>
      <view class="floating-particles">
        <view class="particle" v-for="n in 4" :key="n" :style="getParticleStyle(n)"></view>
      </view>
      <!-- 蓝橙球形装饰 -->
      <view class="bg-circle circle-blue"></view>
      <view class="bg-circle circle-orange"></view>
      <view class="bg-circle circle-green"></view>
    </view>
    
    <!-- 主要内容区域 -->
    <view class="history-container">
      <!-- 页面标题栏 -->
      <view class="header-section">
        <view class="nav-header">
          <text class="back-btn" @click="goBack">←</text>
          <text class="page-title">识别历史</text>
          <view class="header-actions">
            <text class="action-btn" @click="toggleSelectMode">{{ selectMode ? '取消' : '编辑' }}</text>
          </view>
        </view>
        <!-- 筛选器 -->
        <view class="filter-section">
          <view class="filter-tabs">
            <text 
              class="filter-tab" 
              :class="{ active: activeFilter === 'all' }"
              @click="setFilter('all')"
            >全部</text>
            <text 
              class="filter-tab" 
              :class="{ active: activeFilter === 'online' }"
              @click="setFilter('online')"
            >在线识别</text>
            <text 
              class="filter-tab" 
              :class="{ active: activeFilter === 'device' }"
              @click="setFilter('device')"
            >设备识别</text>
          </view>
        </view>
      </view>
      
      <!-- 历史记录列表 -->
      <view class="history-content">
        <!-- 批量操作栏 -->
        <view v-if="selectMode" class="batch-actions">
          <view class="selected-info">
            <view class="select-all-section">
              <text class="select-all-btn" @click="toggleSelectAll">
                {{ isAllSelected ? '取消全选' : '全选' }}
              </text>
              <text class="selected-count">已选择 {{ selectedItems.length }}/{{ historyList.length }} 项</text>
            </view>
          </view>
          <view v-if="selectedItems.length > 0" class="batch-buttons">
            <text class="batch-btn delete-btn" @click="batchDelete">删除</text>
          </view>
        </view>
        
        <!-- 加载状态 -->
        <view v-if="loading && historyList.length === 0" class="loading-section">
          <view class="loading-spinner"></view>
          <text class="loading-text">加载中...</text>
        </view>
        
        <!-- 空状态 -->
        <view v-else-if="!loading && historyList.length === 0" class="empty-section">
          <text class="empty-icon">📋</text>
          <text class="empty-title">暂无历史记录</text>
          <text class="empty-desc">开始使用AI识别功能</text>
          <text class="empty-desc">记录将在这里显示</text>
        </view>
        
        <!-- 历史记录列表 -->
        <view v-else class="history-list">
          <view 
            v-for="item in historyList" 
            :key="item.id" 
            class="history-item"
            :class="{ selected: selectedItems.includes(item.id) }"
            @click="selectMode ? toggleSelect(item.id) : viewDetail(item)"
          >
            <!-- 选择框 -->
            <view v-if="selectMode" class="select-checkbox">
              <text class="checkbox-icon" :class="{ checked: selectedItems.includes(item.id) }">✓</text>
            </view>
            
            <!-- 记录内容 -->
            <view class="item-content">
              <view class="item-image">
                <image :src="item.image" mode="aspectFill" class="history-image" />
                <view class="source-badge" :class="item.source">
                  <text class="source-text">{{ getSourceLabel(item.source) }}</text>
                </view>
              </view>
              
              <view class="item-details">
                <view class="item-header">
                  <text class="category-name">{{ item.category }}</text>
                  <view class="confidence-badge">
                    <text class="confidence-text">{{ (item.confidence * 100).toFixed(1) }}%</text>
                  </view>
                </view>
                
                <text class="item-time">{{ formatTime(item.time) }}</text>
                <text v-if="item.source_name" class="source-name">{{ item.source_name }}</text>
              </view>
              
              <!-- 操作按钮 -->
              <view v-if="!selectMode" class="item-actions">
                <text class="action-icon" @click.stop="deleteItem(item.id)">🗑️</text>
              </view>
            </view>
          </view>
        </view>
        
        <!-- 加载更多 -->
        <view v-if="hasMore && !loading" class="load-more" @click="loadMore">
          <text class="load-more-text">加载更多</text>
        </view>
        
        <!-- 加载中 -->
        <view v-if="loading && historyList.length > 0" class="loading-more">
          <view class="loading-spinner small"></view>
          <text class="loading-text">加载中...</text>
        </view>
        <view class="loading-more2">
          <text v-if="!loading &&!hasMore" class="empty-desc2">识别记录仅保留45天</text>
        </view>
      </view>
    </view>
    
    <!-- 详情弹窗 -->
    <view v-if="detailVisible" class="detail-modal" @click="closeDetail">
      <view class="detail-content" @click.stop>
        <!-- 三色球形装饰 -->
        <view class="bg-circle-green"></view>
        
        <!-- 关闭按钮 -->
        <view class="detail-close" @click="closeDetail">
          <text class="close-icon">✕</text>
        </view>
        
        <!-- 图片区域 -->
        <view class="detail-image-section">
          <image :src="detailItem.image" mode="aspectFit" class="detail-image" />
        </view>
        
        <!-- 信息区域 -->
        <view class="detail-info">
          <view class="info-item">
            <text class="info-label">分类结果</text>
            <text class="info-value" :class="{ 
              'recyclable-blue': detailItem.category === '可回收垃圾',
              'harmful-red': detailItem.category === '有害垃圾',
              'kitchen-green': detailItem.category === '厨余垃圾'
            }">{{ detailItem.category }}</text>
          </view>
          
          <view class="info-item">
            <text class="info-label">置信度</text>
            <view class="confidence-bar">
              <view class="confidence-fill" :style="{ '--target-width': (detailItem.confidence * 100) + '%' }"></view>
              <text class="confidence-value">{{ (detailItem.confidence * 100).toFixed(1) }}%</text>
            </view>
          </view>
          
          <view class="info-item">
            <text class="info-label">识别时间</text>
            <text class="info-value">{{ formatTime(detailItem.time) }}</text>
          </view>
          
          <view class="info-item">
            <text class="info-label">识别来源</text>
            <text class="info-value">{{ getSourceLabel(detailItem.source) }}</text>
          </view>
          
          <view v-if="detailItem.source_name" class="info-item">
            <text class="info-label">设备信息</text>
            <text class="info-value">{{ detailItem.source_name }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { getRecognitionHistory, deleteHistoryRecord, batchDeleteHistoryRecords } from '@/api/history'

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

// 响应式数据
const historyList = ref([])
const loading = ref(false)
const selectMode = ref(false)
const selectedItems = ref([])
const activeFilter = ref('all')
const detailVisible = ref(false)
const detailItem = ref({
  id: null,
  image: '',
  category: '',
  confidence: 0,
  time: '',
  source: '',
  source_name: ''
})

// 分页数据
const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0
})

// 计算属性
const hasMore = computed(() => pagination.page < pagination.totalPages)
const isAllSelected = computed(() => {
  return historyList.value.length > 0 && selectedItems.value.length === historyList.value.length
})

// 生成粒子动画样式
const getParticleStyle = (index) => {
  const positions = [
    { left: '15%', animationDelay: '0s' },
    { left: '75%', animationDelay: '1.5s' },
    { left: '45%', animationDelay: '3s' },
    { left: '85%', animationDelay: '4.5s' }
  ]
  return positions[index - 1] || positions[0]
}

// 设置页面来源信息
function setupPageReferrer() {
  // 获取页面栈信息
  const pages = getCurrentPages()
  
  // 如果有上一个页面，记录来源信息
  if (pages.length > 1) {
    const prevPage = pages[pages.length - 2]
    const prevRoute = prevPage.route || ''
    
    // 根据上一个页面的路径判断来源
    if (prevRoute.includes('home')) {
      uni.setStorageSync('historyReferrer', 'home')
    } else if (prevRoute.includes('profile')) {
      uni.setStorageSync('historyReferrer', 'profile')
    } else if (prevRoute.includes('scan')) {
      uni.setStorageSync('historyReferrer', 'scan')
    } else {
      // 默认来源为首页
      uni.setStorageSync('historyReferrer', 'home')
    }
  } else {
    // 没有上一个页面时，检查URL参数或默认设置
    // 可以通过 onLoad 方法传入的参数来判断
    const referrer = uni.getStorageSync('tempReferrer') || 'home'
    uni.setStorageSync('historyReferrer', referrer)
    uni.removeStorageSync('tempReferrer')
  }
}

// 页面初始化
onMounted(() => {
  // 设置当前页面的来源信息（用于智能返回）
  setupPageReferrer()

  // 只在H5环境中设置状态栏高度
  if (typeof document !== 'undefined' && document.documentElement) {
    let statusBarHeight = 0
    try {
      const windowInfo = uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()
      statusBarHeight = windowInfo.statusBarHeight || 0
    } catch (e) {
      const systemInfo = uni.getSystemInfoSync()
      statusBarHeight = systemInfo.statusBarHeight || 0
    }
    document.documentElement.style.setProperty('--status-bar-height', statusBarHeight + 'px')
  }

  // 加载历史记录
  loadHistoryData()

  // 添加鼠标光感追踪效果
  if (typeof document !== 'undefined') {
    setTimeout(() => {
      // 为筛选标签添加鼠标追踪
      const filterTabs = document.querySelectorAll('.filter-tab')
      filterTabs.forEach(tab => {
        tab.addEventListener('mousemove', (e) => {
          const rect = tab.getBoundingClientRect()
          const x = ((e.clientX - rect.left) / rect.width) * 100
          const y = ((e.clientY - rect.top) / rect.height) * 100
          tab.style.setProperty('--mouse-x', x + '%')
          tab.style.setProperty('--mouse-y', y + '%')
        })
      })

      // 为历史记录项添加鼠标追踪
      const historyItems = document.querySelectorAll('.history-item')
      historyItems.forEach(item => {
        item.addEventListener('mousemove', (e) => {
          const rect = item.getBoundingClientRect()
          const x = ((e.clientX - rect.left) / rect.width) * 100
          const y = ((e.clientY - rect.top) / rect.height) * 100
          item.style.setProperty('--mouse-x', x + '%')
          item.style.setProperty('--mouse-y', y + '%')
        })
      })

      // 为编辑按钮添加鼠标追踪
      const actionBtns = document.querySelectorAll('.action-btn')
      actionBtns.forEach(btn => {
        btn.addEventListener('mousemove', (e) => {
          const rect = btn.getBoundingClientRect()
          const x = ((e.clientX - rect.left) / rect.width) * 100
          const y = ((e.clientY - rect.top) / rect.height) * 100
          btn.style.setProperty('--mouse-x', x + '%')
          btn.style.setProperty('--mouse-y', y + '%')
        })
      })
    }, 500)
  }
})

// 加载历史数据
async function loadHistoryData(isLoadMore = false) {
  if (loading.value) return
  
  try {
    loading.value = true
    
    const params = {
      page: isLoadMore ? pagination.page + 1 : 1,
      pageSize: pagination.pageSize,
      source: activeFilter.value === 'all' ? undefined : activeFilter.value
    }
    
    const response = await getRecognitionHistory(params)
    const { data, pagination: paginationData } = response || { data: [], pagination: {} }

    if (isLoadMore) {
      historyList.value = [...historyList.value, ...data]
      pagination.page += 1
    } else {
      historyList.value = data
      pagination.page = paginationData.page
    }
    
    pagination.total = paginationData.total
    pagination.totalPages = paginationData.totalPages
    
  } catch (error) {
    console.error('加载历史记录失败:', error)
    uni.showToast({
      title: error.msg || '加载失败',
      icon: 'none'
    })
  } finally {
    loading.value = false
  }
}

// 设置筛选条件
function setFilter(filter) {
  if (activeFilter.value === filter) return
  
  activeFilter.value = filter
  pagination.page = 1
  selectedItems.value = []
  selectMode.value = false
  loadHistoryData()
}

// 加载更多
function loadMore() {
  if (hasMore.value && !loading.value) {
    loadHistoryData(true)
  }
}

// 切换选择模式
function toggleSelectMode() {
  selectMode.value = !selectMode.value
  selectedItems.value = []
}

// 切换选择项
function toggleSelect(id) {
  const index = selectedItems.value.indexOf(id)
  if (index > -1) {
    selectedItems.value.splice(index, 1)
  } else {
    selectedItems.value.push(id)
  }
}

// 全选/取消全选
function toggleSelectAll() {
  if (isAllSelected.value) {
    // 取消全选
    selectedItems.value = []
  } else {
    // 全选
    selectedItems.value = historyList.value.map(item => item.id)
  }
}

// 批量删除
async function batchDelete() {
  if (selectedItems.value.length === 0) return
  
  try {
    uni.showModal({
      title: '确认删除',
      content: `确定要删除选中的 ${selectedItems.value.length} 条记录吗？`,
      success: async (res) => {
        if (res.confirm) {
          uni.showLoading({ title: '删除中...' })
          const res=await batchDeleteHistoryRecords(selectedItems.value)
          if (res.code!==0){
            uni.hideLoading()
            uni.showToast({
              title: res.msg || '删除失败',
              icon: 'none'
            })
            return
          }
          // 从列表中移除已删除的项
          historyList.value = historyList.value.filter(
            item => !selectedItems.value.includes(item.id)
          )
          
          selectedItems.value = []
          selectMode.value = false
          uni.hideLoading()
          uni.showToast({
            title: '删除成功',
            icon: 'success'
          })
        }
      }
    })
  } catch (error) {
    console.error('删除历史记录失败:', error)
    uni.hideLoading()
    uni.showToast({
      title: error.msg || '删除失败',
      icon: 'none'
    })
  }
}

// 删除单个项目
async function deleteItem(id) {
  try {
    uni.showModal({
      title: '确认删除',
      content: '确定要删除这条记录吗？',
      success: async (res) => {
        if (res.confirm) {
          uni.showLoading({ title: '删除中...' })
          const res=await deleteHistoryRecord(id)
          if(res.code!==0){
            uni.hideLoading()
            uni.showToast({
              title: res.msg || '删除失败',
              icon: 'none'
            })
            return
          }
          // 从列表中移除
          historyList.value = historyList.value.filter(item => item.id !== id)
          uni.hideLoading()
          uni.showToast({
            title: '删除成功',
            icon: 'success'
          })
        }
      }
    })
  } catch (error) {
    console.error('删除历史记录失败:', error)
    uni.hideLoading()
    uni.showToast({
      title: error.msg || '删除失败',
      icon: 'none'
    })
  }
}

// 查看详情
function viewDetail(item) {
  detailItem.value = { ...item }
  detailVisible.value = true
}

// 关闭详情弹窗
function closeDetail() {
  detailVisible.value = false
}

// 获取来源标签
function getSourceLabel(source) {
  const labels = {
    'online': '在线识别',
    'device': '设备识别'
  }
  return labels[source] || '未知来源'
}

// 格式化时间
function formatTime(timeString) {
  const date = new Date(timeString)
  const now = new Date()
  const diff = now - date
  
  // 小于1分钟
  if (diff < 60 * 1000) {
    return '刚刚'
  }
  
  // 小于1小时
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000))
    return `${minutes}分钟前`
  }
  
  // 小于1天
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000))
    return `${hours}小时前`
  }
  
  // 小于7天
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = Math.floor(diff / (24 * 60 * 60 * 1000))
    return `${days}天前`
  }
  
  // 格式化为日期
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 智能返回上一页
function goBack() {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack({
      delta: 1,
      fail: () => {
        handleBackupNavigation()
      }
    })
  } else {
    handleBackupNavigation()
  }
}

// 备选导航方案
function handleBackupNavigation() {
  // 检查是否是从特定页面进入的（通过页面参数或存储）
  const referrerPage = uni.getStorageSync('historyReferrer')
  
  if (referrerPage) {
    // 清除存储的来源页面信息
    uni.removeStorageSync('historyReferrer')
    
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
    setTimeout(() => {
      uni.reLaunch({ url: '/pages/home/home' })
    }, 500)
  }
}
</script>

<style scoped>
/* 主背景 */
.history-bg {
  min-height: 100vh;
  background: linear-gradient(180deg, #f0fdf4 0%, #f5f7fa 30%, #f0f9ff 70%, #f5f7fa 100%);
  position: relative;
  overflow: hidden;
}

/* 自定义状态栏 */
.custom-statusbar {
  height: var(--status-bar-height);
  background: transparent;
  position: relative;
  z-index: 10;
}

/* 清新背景装饰 */
.tech-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  pointer-events: none;
}

.tech-grid {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: 
    radial-gradient(circle at 20% 30%, rgba(16, 185, 129, 0.08) 0%, transparent 50%),
    radial-gradient(circle at 80% 70%, rgba(52, 211, 153, 0.06) 0%, transparent 40%);
}

/* 浮动装饰 */
.floating-particles {
  position: absolute;
  width: 100%;
  height: 100%;
}

.particle {
  position: absolute;
  width: 8rpx;
  height: 8rpx;
  background: rgba(16, 185, 129, 0.3);
  border-radius: 50%;
  animation: float 6s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0px) scale(1); opacity: 0.3; }
  50% { transform: translateY(-10px) scale(1.2); opacity: 0.6; }
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

/* 主容器 */
.history-container {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - var(--status-bar-height));
}

/* 标题区域 */
.header-section {
  background: linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%);
  padding: 0rpx 32rpx 40rpx;
  position: relative;
}

.header-section::after {
  content: '';
  position: absolute;
  bottom: -20rpx;
  left: 0;
  right: 0;
  height: 40rpx;
  background: linear-gradient(180deg, #f0fdf4 0%, #f5f7fa 100%);
  border-radius: 40rpx 40rpx 0 0;
}

.nav-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  margin-top: 64rpx;
}

.back-btn {
  font-size: 48rpx;
  color: #ffffff;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.back-btn:active {
  transform: scale(0.9);
  opacity: 0.8;
}

.page-title {
  font-size: 36rpx;
  font-weight: 600;
  color: #ffffff;
}

.header-actions {
  display: flex;
  align-items: center;
}

.action-btn {
  font-size: 28rpx;
  color: #ffffff;
  padding: 16rpx 24rpx;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 20rpx;
  border: 1px solid rgba(255, 255, 255, 0.3);
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

/* 鼠标光感追踪效果 */
.action-btn::before {
  content: '';
  position: absolute;
  top: var(--mouse-y, 50%);
  left: var(--mouse-x, 50%);
  width: 80rpx;
  height: 80rpx;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.4) 0%, transparent 70%);
  transform: translate(-50%, -50%);
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
  z-index: 1;
}

.action-btn:hover::before {
  opacity: 1;
}

.action-btn:active {
  background: rgba(255, 255, 255, 0.3);
  transform: scale(0.95);
}

/* 筛选器 */
.filter-section {
  margin-top: 24rpx;
}

.filter-tabs {
  display: flex;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 24rpx;
  padding: 8rpx;
  border: 1px solid rgba(255, 255, 255, 0.2);
  position: relative;
  overflow: hidden;
}

.filter-tab {
  flex: 1;
  text-align: center;
  padding: 16rpx 24rpx;
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.8);
  border-radius: 18rpx;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

/* 鼠标光感追踪效果 - 玻璃质感 */
.filter-tab::before {
  content: '';
  position: absolute;
  top: var(--mouse-y, 50%);
  left: var(--mouse-x, 50%);
  width: 150rpx;
  height: 150rpx;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.5) 0%, transparent 70%);
  transform: translate(-50%, -50%);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.filter-tab:hover::before {
  opacity: 1;
}

/* 玻璃材质质感 */
.filter-tab {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%);
  backdrop-filter: blur(10rpx);
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.filter-tab.active {
  background: rgba(255, 255, 255, 0.9);
  color: #059669;
  font-weight: 600;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.5);
}

/* 内容区域 */
.history-content {
  flex: 1;
  padding: 32rpx;
}

/* 批量操作栏 */
.batch-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  padding: 24rpx 32rpx;
  border-radius: 16rpx;
  border: 1px solid rgba(16, 185, 129, 0.2);
  margin-bottom: 32rpx;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.06);
}

.selected-info {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.select-all-section {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.select-all-btn {
  color: #059669;
  font-size: 26rpx;
  font-weight: 600;
  padding: 8rpx 16rpx;
  background: rgba(16, 185, 129, 0.1);
  border-radius: 16rpx;
  border: 1px solid rgba(16, 185, 129, 0.3);
  cursor: pointer;
  transition: all 0.3s ease;
}

.select-all-btn:active {
  background: rgba(16, 185, 129, 0.2);
  transform: scale(0.95);
}

.selected-count {
  color: #059669;
  font-size: 28rpx;
  font-weight: 600;
}

.batch-buttons {
  display: flex;
  gap: 16rpx;
}

.batch-btn {
  padding: 16rpx 32rpx;
  border-radius: 20rpx;
  font-size: 26rpx;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.delete-btn {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.delete-btn:active {
  background: rgba(239, 68, 68, 0.2);
  transform: scale(0.95);
}

/* 加载状态 */
.loading-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 100rpx 0;
}

.loading-spinner {
  width: 60rpx;
  height: 60rpx;
  border: 4rpx solid rgba(16, 185, 129, 0.2);
  border-top: 4rpx solid #10b981;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 24rpx;
}

.loading-spinner.small {
  width: 40rpx;
  height: 40rpx;
  border-width: 3rpx;
  margin-bottom: 16rpx;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.loading-text {
  color: #6b7280;
  font-size: 26rpx;
}

/* 空状态 */
.empty-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120rpx 40rpx;
  text-align: center;
}

.empty-icon {
  font-size: 120rpx;
  margin-bottom: 32rpx;
  opacity: 0.6;
}

.empty-title {
  font-size: 36rpx;
  color: #059669;
  font-weight: 600;
  margin-bottom: 24rpx;
}

.empty-desc {
  font-size: 28rpx;
  color: #6b7280;
  line-height: 1.6;
}
.empty-desc2 {
  font-size: 22rpx;
  color: #9ca3af;
  line-height: 1.6;
  font-style: italic;
  text-align: center;
}
/* 历史记录列表 */
.history-list {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.history-item {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(240, 253, 244, 0.95) 50%, rgba(255, 255, 255, 0.98) 100%);
  backdrop-filter: blur(20px);
  border-radius: 20rpx;
  border: 1px solid rgba(16, 185, 129, 0.2);
  overflow: hidden;
  transition: all 0.3s ease;
  cursor: pointer;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.06);
  position: relative;
  animation: historyItemBreath 4s ease-in-out infinite;
}

/* 呼吸感动画 */
@keyframes historyItemBreath {
  0%, 100% {
    box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.06), 0 0 0 rgba(16, 185, 129, 0);
    transform: translateY(0);
  }
  50% {
    box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.08), 0 0 20rpx rgba(16, 185, 129, 0.1);
    transform: translateY(-2rpx);
  }
}

/* 顶部高光质感 */
.history-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 40%;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.3) 50%, transparent 100%);
  pointer-events: none;
  border-radius: 20rpx 20rpx 0 0;
}

/* 鼠标光感追踪效果 */
.history-item::after {
  content: '';
  position: absolute;
  top: var(--mouse-y, 50%);
  left: var(--mouse-x, 50%);
  width: 300rpx;
  height: 300rpx;
  background: radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, transparent 70%);
  transform: translate(-50%, -50%);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.4s ease;
}

.history-item:hover::after {
  opacity: 1;
}

.history-item:active {
  transform: translateY(2rpx);
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.1);
}

.history-item.selected {
  border-color: #10b981;
  box-shadow: 0 0 20rpx rgba(16, 185, 129, 0.2);
}

.item-content {
  display: flex;
  align-items: center;
  padding: 24rpx;
}

/* 选择框 */
.select-checkbox {
  margin-right: 24rpx;
}

.checkbox-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48rpx;
  height: 48rpx;
  border: 2rpx solid rgba(16, 185, 129, 0.3);
  border-radius: 50%;
  color: transparent;
  font-size: 24rpx;
  font-weight: 600;
  transition: all 0.3s ease;
}

.checkbox-icon.checked {
  background: linear-gradient(135deg, #10b981 0%, #34d399 100%);
  color: #ffffff;
  border-color: #10b981;
}

/* 记录图片 */
.item-image {
  position: relative;
  width: 120rpx;
  height: 120rpx;
  margin-right: 24rpx;
}

.history-image {
  width: 100%;
  height: 100%;
  border-radius: 12rpx;
  object-fit: cover;
}

.source-badge {
  position: absolute;
  top: -8rpx;
  right: -8rpx;
  padding: 8rpx 16rpx;
  border-radius: 20rpx;
  font-size: 20rpx;
  font-weight: 600;
}

.source-badge.online {
  background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%);
  color: #ffffff;
}

.source-badge.device {
  background: linear-gradient(135deg, #10b981 0%, #34d399 100%);
  color: #ffffff;
}

.source-text {
  font-size: 20rpx;
}

/* 记录详情 */
.item-details {
  flex: 1;
}

.item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}

.category-name {
  font-size: 32rpx;
  font-weight: 600;
  color: #059669;
}

.confidence-badge {
  background: rgba(16, 185, 129, 0.1);
  padding: 8rpx 16rpx;
  border-radius: 16rpx;
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.confidence-text {
  color: #10b981;
  font-size: 22rpx;
  font-weight: 600;
}

.item-time {
  color: #6b7280;
  font-size: 24rpx;
  margin-bottom: 8rpx;
}

.source-name {
  color: #9ca3af;
  font-size: 22rpx;
  font-style: italic;
}

/* 操作按钮 */
.item-actions {
  display: flex;
  align-items: center;
  margin-left: 24rpx;
}

.action-icon {
  font-size: 36rpx;
  padding: 16rpx;
  cursor: pointer;
  transition: all 0.3s ease;
  opacity: 0.6;
}

.action-icon:active {
  transform: scale(0.9);
  opacity: 1;
}

/* 加载更多 */
.load-more {
  text-align: center;
  padding: 40rpx;
  cursor: pointer;
}

.load-more-text {
  color: #059669;
  font-size: 28rpx;
}

.loading-more {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40rpx;
}
.loading-more2 {
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 详情弹窗 */
.detail-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  z-index: 1000;
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(100%);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.detail-content {
  width: 100%;
  background: linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%);
  backdrop-filter: blur(20px);
  border-radius: 24rpx 24rpx 0 0;
  border-top: 2rpx solid rgba(16, 185, 129, 0.2);
  padding: 24rpx;
  padding-bottom: calc(24rpx + env(safe-area-inset-bottom));
  max-height: 75vh;
  overflow-y: auto;
  box-shadow: 0 -8rpx 32rpx rgba(0, 0, 0, 0.15);
  position: relative;
}

/* 三色球形装饰效果 - 调整位置避免被遮挡 */
.detail-content::before {
  content: '';
  position: absolute;
  top: 60rpx;
  right: 20rpx;
  width: 120rpx;
  height: 120rpx;
  background: linear-gradient(135deg, #93c5fd 0%, #60a5fa 50%, #3b82f6 100%);
  border-radius: 50%;
  opacity: 0.1;
  pointer-events: none;
  z-index: 0;
}

.detail-content::after {
  content: '';
  position: absolute;
  bottom: 100rpx;
  left: -20rpx;
  width: 160rpx;
  height: 160rpx;
  background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%);
  border-radius: 50%;
  opacity: 0.08;
  pointer-events: none;
  z-index: 0;
}

/* 绿色球形装饰 */
.detail-content .bg-circle-green {
  position: absolute;
  top: 400rpx;
  right: 20rpx;
  width: 100rpx;
  height: 100rpx;
  background: linear-gradient(135deg, #86efac 0%, #4ade80 50%, #22c55e 100%);
  border-radius: 50%;
  opacity: 0.06;
  pointer-events: none;
  z-index: 0;
}

/* 关闭按钮 */
.detail-close {
  position: absolute;
  top: 16rpx;
  right: 16rpx;
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(16, 185, 129, 0.1);
  border-radius: 50%;
  border: 2rpx solid rgba(16, 185, 129, 0.3);
  cursor: pointer;
  transition: all 0.3s ease;
  z-index: 1001;
}

.detail-close:active {
  background: rgba(16, 185, 129, 0.2);
  transform: scale(0.9);
}

.close-icon {
  color: #059669;
  font-size: 28rpx;
  font-weight: 600;
}

/* 图片区域 */
.detail-image-section {
  width: 100%;
  background: rgba(16, 185, 129, 0.05);
  border-radius: 16rpx;
  border: 2rpx solid rgba(16, 185, 129, 0.15);
  padding: 16rpx;
  margin-bottom: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 280rpx;
  max-height: 350rpx;
  overflow: hidden;
}

.detail-image {
  max-width: 100%;
  max-height: 320rpx;
  border-radius: 12rpx;
}

/* 信息区域 */
.detail-info {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.95) 30%, rgba(241, 245, 249, 0.92) 70%, rgba(226, 232, 240, 0.9) 100%);
  padding: 16rpx 20rpx;
  border-radius: 12rpx;
  border: 1rpx solid rgba(148, 163, 184, 0.2);
  box-shadow: 
    inset 0 1rpx 0 rgba(255, 255, 255, 0.8),
    inset 0 -1rpx 0 rgba(148, 163, 184, 0.1),
    0 4rpx 12rpx rgba(0, 0, 0, 0.06),
    0 1rpx 3rpx rgba(0, 0, 0, 0.04);
  position: relative;
  overflow: hidden;
}

/* 玻璃/陶瓷质感 - 顶部高光 */
.info-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 40%;
  background: linear-gradient(180deg, 
    rgba(255, 255, 255, 0.9) 0%, 
    rgba(255, 255, 255, 0.5) 40%, 
    rgba(255, 255, 255, 0.1) 70%,
    transparent 100%);
  pointer-events: none;
  border-radius: 16rpx 16rpx 0 0;
}

/* 底部阴影质感 */
.info-item::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 30%;
  background: linear-gradient(0deg, 
    rgba(148, 163, 184, 0.08) 0%, 
    rgba(148, 163, 184, 0.03) 50%,
    transparent 100%);
  pointer-events: none;
  border-radius: 0 0 16rpx 16rpx;
}

.info-label {
  font-size: 26rpx;
  color: #6b7280;
  font-weight: 500;
  position: relative;
  z-index: 1;
}

.info-value {
  font-size: 30rpx;
  color: #059669;
  font-weight: 600;
  padding: 12rpx 16rpx;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(52, 211, 153, 0.12) 100%);
  border-radius: 12rpx;
  border-left: 4rpx solid #10b981;
  position: relative;
  z-index: 1;
}

/* 可回收垃圾蓝色样式 */
.info-value.recyclable-blue {
  color: #3b82f6;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(96, 165, 250, 0.15) 100%);
  border-left: 4rpx solid #60a5fa;
  box-shadow: inset 0 1rpx 0 rgba(255, 255, 255, 0.5);
}

/* 可回收垃圾时，整个info-item呈淡蓝色玻璃质感 */
.info-item:has(.recyclable-blue) {
  background: linear-gradient(145deg, rgba(239, 246, 255, 0.98) 0%, rgba(224, 242, 254, 0.95) 30%, rgba(191, 219, 254, 0.92) 70%, rgba(147, 197, 253, 0.9) 100%);
  border: 1rpx solid rgba(96, 165, 250, 0.25);
  box-shadow: 
    inset 0 1rpx 0 rgba(255, 255, 255, 0.8),
    inset 0 -1rpx 0 rgba(96, 165, 250, 0.15),
    0 4rpx 16rpx rgba(59, 130, 246, 0.12),
    0 1rpx 4rpx rgba(59, 130, 246, 0.06);
}

/* 有害垃圾红色样式 */
.info-value.harmful-red {
  color: #ef4444;
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(248, 113, 113, 0.15) 100%);
  border-left: 4rpx solid #f87171;
  box-shadow: inset 0 1rpx 0 rgba(255, 255, 255, 0.5);
}

/* 有害垃圾时，整个info-item呈淡红色玻璃质感 */
.info-item:has(.harmful-red) {
  background: linear-gradient(145deg, rgba(254, 242, 242, 0.98) 0%, rgba(254, 226, 226, 0.95) 30%, rgba(254, 202, 202, 0.92) 70%, rgba(252, 165, 165, 0.9) 100%);
  border: 1rpx solid rgba(248, 113, 113, 0.25);
  box-shadow: 
    inset 0 1rpx 0 rgba(255, 255, 255, 0.8),
    inset 0 -1rpx 0 rgba(248, 113, 113, 0.15),
    0 4rpx 16rpx rgba(239, 68, 68, 0.12),
    0 1rpx 4rpx rgba(239, 68, 68, 0.06);
}

/* 厨余垃圾正绿色样式 - 与其他绿色区分 */
.info-value.kitchen-green {
  color: #10b981;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(52, 211, 153, 0.15) 100%);
  border-left: 4rpx solid #34d399;
  box-shadow: inset 0 1rpx 0 rgba(255, 255, 255, 0.5);
}

/* 厨余垃圾时，整个info-item呈正绿色玻璃质感 */
.info-item:has(.kitchen-green) {
  background: linear-gradient(145deg, rgba(236, 253, 245, 0.98) 0%, rgba(209, 250, 229, 0.95) 30%, rgba(167, 243, 208, 0.92) 70%, rgba(110, 231, 183, 0.9) 100%);
  border: 1rpx solid rgba(52, 211, 153, 0.25);
  box-shadow: 
    inset 0 1rpx 0 rgba(255, 255, 255, 0.8),
    inset 0 -1rpx 0 rgba(52, 211, 153, 0.15),
    0 4rpx 16rpx rgba(16, 185, 129, 0.12),
    0 1rpx 4rpx rgba(16, 185, 129, 0.06);
}

/* 置信度条 */
.confidence-bar {
  position: relative;
  width: 100%;
  height: 48rpx;
  background: rgba(16, 185, 129, 0.1);
  border-radius: 24rpx;
  border: 2rpx solid rgba(16, 185, 129, 0.2);
  overflow: hidden;
  display: flex;
  align-items: center;
  padding: 0 16rpx;
}

.confidence-fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  background: linear-gradient(90deg, #10b981, #34d399);
  border-radius: 24rpx;
  width: 0%;
  animation: confidenceFill 1s ease-out forwards;
}

@keyframes confidenceFill {
  0% {
    width: 0%;
  }
  100% {
    width: var(--target-width, 0%);
  }
}

/* 进度条流光效果 - 加载完成后停止 */
.confidence-fill::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(90deg, 
    transparent 0%, 
    rgba(255, 255, 255, 0.4) 50%, 
    transparent 100%);
  animation: shimmer 1.5s ease-in-out;
  animation-fill-mode: forwards;
}

@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

.confidence-value {
  position: relative;
  z-index: 2;
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 600;
}

/* 滚动条样式 */
.detail-content::-webkit-scrollbar {
  width: 6rpx;
}

.detail-content::-webkit-scrollbar-thumb {
  background: rgba(16, 185, 129, 0.3);
  border-radius: 3rpx;
}

.detail-content::-webkit-scrollbar-thumb:hover {
  background: rgba(16, 185, 129, 0.5);
}
</style>
