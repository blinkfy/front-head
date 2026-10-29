<template>
  <view class="shop-bg" :class="tabPageClass">
    <!-- 自定义状态栏 -->
    <view class="custom-statusbar"></view>
    
    <!-- 科技背景动效元素 -->
    <view class="tech-bg">
      <view class="tech-grid"></view>
      <view class="floating-particles">
        <view class="particle" v-for="n in 6" :key="n" :style="getParticleStyle(n)"></view>
      </view>
    </view>
    
    <!-- 主要内容区域 -->
    <view :animation="tabPageAnimation" class="shop-container tab-page-motion">
      <!-- 页面标题 -->
      <view class="page-title">
        <view class="orders-pill" @click="goToOrders">我的订单</view>
        <view class="title-decoration">
          <view class="title-line left"></view>
          <ManifestIcon id="store" class="title-icon" />
          <view class="title-line right"></view>
        </view>
        <text class="title-text">积分商城</text>
        <text class="title-subtitle">Points Mall</text>
        <view class="title-glow"></view>
      </view>
      
      <!-- 顶部积分信息 -->
      <view class="points-header">
        <view class="points-card">
          <ManifestIcon id="points_coin" class="points-icon" />
          <view class="points-info">
            <text class="points-label">我的积分</text>
            <text class="points-value" v-if="!loading">{{ userPoints }}</text>
            <view class="loading-dots" v-else>
              <text class="dot"></text>
              <text class="dot"></text>
              <text class="dot"></text>
            </view>
          </view>
          <view class="points-refresh" @click="refreshPoints" :class="{ rotating: loading }">
            <ManifestIcon id="refresh" class="refresh-icon" />
          </view>
          <view class="points-glow"></view>
        </view>
        <view class="points-tips">
          <ManifestIcon id="points_info" class="tip-icon" />
          <text class="tip-text">每次垃圾识别可获得1-3积分</text>
        </view>
      </view>
      
      <!-- 商品分类选项卡-->
      <view class="category-tabs">
        <view 
          v-for="(category, index) in categories" 
          :key="index"
          :class="['tab-item', { active: currentCategory === index }]"
          @click="switchCategory(index)"
        >
          <ManifestIcon class="tab-icon" :id="category.icon" />
          <text class="tab-text">{{ category.name }}</text>
        </view>
      </view>
      
      <!-- 商品列表 -->
      <view class="products-section">
        <view class="section-title">
          <ManifestIcon class="title2-icon" :id="selectedCategory.icon" />
          <text class="title2-text">{{ displayCategoryTitle }}</text>
          <text class="product-count">({{ filteredProducts.length }}件商品)</text>
        </view>

        <view v-if="isRecommendCategory && recommendLoading" class="recommend-loading-mask">
          <text class="recommend-loading-text">AI 正在生成推荐，请稍候...</text>
        </view>
        
        <view v-if="productsLoading" class="shop-catalog-state">正在加载商品...</view>
        <view v-else-if="productsError" class="shop-catalog-state">
          <text>{{ productsError }}</text><button class="shop-catalog-retry" @click="loadProducts">重新加载</button>
        </view>
        <view v-else-if="!filteredProducts.length" class="shop-catalog-state">暂无该分类商品</view>
        <view v-else class="products-grid">
          <view 
            v-for="product in filteredProducts" 
            :key="product.id"
            class="product-card"
            @click="showProductDetail(product)"
          >
            <view class="product-image-container">
              <image :src="product.image" class="product-image" mode="aspectFill" />
              <view v-if="isRecommendCategory" class="product-badge ai">AI推荐</view>
              <view v-if="product.hot" class="product-badge hot">热门</view>
              <view v-if="product.limited" class="product-badge limited"><ManifestIcon id="limited_offer" /> 限量</view>
            </view>
            
            <view class="product-info">
              <text class="product-name">{{ product.name }}</text>
              <text class="product-desc">{{ product.description }}</text>
              
              <view class="product-footer">
                <view class="product-price">
                  <ManifestIcon id="points_coin" class="price-icon" />
                  <text class="price-value">{{ product.points }}</text>
                </view>
                <view class="product-stock">
                  <view class="stock-text"><ManifestIcon id="inventory" /> 库存: {{ product.stock }}</view>
                </view>
              </view>
            </view>
            
            <view class="product-glow"></view>
          </view>
        </view>
      </view>
    </view>
    
    <!-- 商品详情弹窗 -->
    <view v-if="showDetailModal" class="detail-modal-overlay" @click="closeProductDetail">
      <view class="detail-modal" @click.stop="">
        <view class="modal-header">
          <image :src="selectedProduct.image" class="modal-product-image" mode="aspectFill" />
          <ManifestIcon id="close" class="modal-close" @click="closeProductDetail" />
          <view class="modal-image-glow"></view>
        </view>
        
        <view class="modal-content">
          <view class="modal-product-info">
            <text class="modal-product-name">{{ selectedProduct.name }}</text>
            <text class="modal-product-desc">{{ selectedProduct.description }}</text>
            
            <view class="modal-product-details">
              <view class="detail-item">
                <text class="detail-label">所需积分:</text>
                <view class="detail-price">
                  <ManifestIcon id="points_coin" class="price-icon" />
                  <text class="price-value">{{ selectedProduct.points }}</text>
                </view>
              </view>
              
              <view class="detail-item">
                <text class="detail-label">剩余库存:</text>
                <text class="detail-value">{{ selectedProduct.stock }}件</text>
              </view>
              
              <view class="detail-item">
                <text class="detail-label">商品特点:</text>
                <text class="detail-value">{{ selectedProduct.features }}</text>
              </view>
            </view>
          </view>
        </view>
        
        <view class="modal-footer">
          <view class="exchange-info">
            <text class="exchange-note">请在确认页填写收货信息后提交兑换</text>
          </view>
          <view 
            :class="['exchange-btn', { disabled: !canExchange }]"
            @click="exchangeProduct"
          >
            <ManifestIcon id="redeem_gift" class="btn-icon" />
            <text class="btn-text">{{ exchangeLabel }}</text>
          </view>
        </view>
        
        <view class="modal-glow"></view>
      </view>
    </view>
    
    <!-- 底部导航栏-->
    <view class="tabbar">
      <view class="tabbar-item" @click="goHome">
        <ManifestIcon id="home" class="tabbar-icon" />
        <text class="tabbar-label">首页</text>
      </view>
      <view class="tabbar-item" @click="goMap">
        <ManifestIcon id="map_location" class="tabbar-icon" />
        <text class="tabbar-label">地图</text>
      </view>
      <view class="tabbar-item active">
        <ManifestIcon id="store" class="tabbar-icon" />
        <text class="tabbar-label">商城</text>
      </view>
      <view class="tabbar-item" @click="goProfile">
        <ManifestIcon id="user_profile" class="tabbar-icon" />
        <text class="tabbar-label">我的</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { userinfo } from '@/api/user'
import { fetchShopProducts, fetchShopRecommendations } from '@/api/shop'
import ManifestIcon from '@/components/ManifestIcon.vue'
import { navigateBottomTab, useTabPageTransition } from '@/utils/tab-page-transition.js'
import {
  SHOP_RECOMMEND_LIMIT,
  buildCandidateProducts,
  filterProductsByRecommendation,
  getFallbackRecommendedNames,
  normalizeRecommendationResult,
  orderProductsByRecommendation
} from '@/utils/shop-recommendation'

const { tabPageClass, tabPageAnimation } = useTabPageTransition('pages-dark/shop/shop')
// 响应式数据
const userPoints = ref(0) // 用户当前积分
const loading = ref(false) // 加载状态
const currentCategory = ref(0) // 当前选中的分类
const showDetailModal = ref(false) // 显示商品详情弹窗
const exchangeSubmitting = ref(false)
const selectedProduct = ref({}) // 选中的商品
const recommendLoading = ref(false)
const recommendReady = ref(false)
const recommendSource = ref('rule-dom')
const recommendedNames = ref([])
let pageDisposed = false

// 商品分类
const categories = ref([
  { name: '猜您喜欢', icon: 'ai_recommend', type: 'recommend' },
  { name: '全部', icon: 'category_all', type: 'all' },
  { name: '环保用品', icon: 'eco_products', type: 'category', categoryId: 1 },
  { name: '数码配件', icon: 'digital_accessories', type: 'category', categoryId: 2 },
  { name: '生活用品', icon: 'home_living', type: 'category', categoryId: 3 },
  { name: '学习用品', icon: 'learning_supplies', type: 'category', categoryId: 4 },
  { name: '美食券', icon: 'food_coupon', type: 'category', categoryId: 5 }
])

// 服务端商品数据
const products = ref([])
const productsLoading = ref(false)
const productsError = ref('')

const loadProducts = async () => {
  if (productsLoading.value || pageDisposed) return
  productsLoading.value = true
  productsError.value = ''
  try {
    const response = await fetchShopProducts()
    const list = Array.isArray(response.data) ? response.data : response.data?.products
    if (!Array.isArray(list)) throw new Error('商品数据异常，请重试')
    if (pageDisposed) return
    products.value = list.filter(product => product.status === 'active')
    recommendReady.value = false
    if (isRecommendCategory.value) await ensureRecommendations()
  } catch (error) {
    if (!pageDisposed) productsError.value = error?.msg || error?.message || '商品加载失败，请重试'
  } finally {
    if (!pageDisposed) productsLoading.value = false
  }
}

// 检测平台类型
onShow(async () => {
  pageDisposed = false
  // 获取系统状态栏高度
  let statusBarHeight = 0
  try {
    const windowInfo = uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()
    statusBarHeight = windowInfo.statusBarHeight || 0
  } catch (e) {
    const systemInfo = uni.getSystemInfoSync()
    statusBarHeight = systemInfo.statusBarHeight || 0
  }
  
  // 设置CSS变量
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.style.setProperty('--status-bar-height', statusBarHeight + 'px')
  }
  
  // 获取用户真实积分数据
  await Promise.all([fetchUserPoints(), loadProducts()])
  if (pageDisposed) return
  if (currentCategory.value === 0) {
    await ensureRecommendations()
  }
  if (pageDisposed) return
})

onBeforeUnmount(() => {
  pageDisposed = true
})

// 获取用户积分信息
const fetchUserPoints = async (notifyError = true) => {
  if (pageDisposed) return false
  try {
    loading.value = true
    const token = uni.getStorageSync('token')
    if (!token) {
      if (pageDisposed) return false
      userPoints.value = '未登录'
      return false
    }
    
    const response = await userinfo("false")
    if (pageDisposed) return false
    if (response.code === 0) {
      userPoints.value = response.data.points || 0
      console.log('获取用户积分成功:', userPoints.value)
      return true
    } else {
      console.error('获取用户积分失败:', response.msg)
      // 使用本地存储的积分作为备用
      const storedPoints = uni.getStorageSync('userPoints')
      userPoints.value = storedPoints || 0
      if (notifyError) uni.showToast({ title: response.msg || '积分获取失败，当前显示缓存数据', icon: 'none' })
      return false
    }
  } catch (error) {
    if (pageDisposed) return false
    console.error('请求用户积分出错:', error)
    // 网络错误时使用本地存储的积分
    const storedPoints = uni.getStorageSync('userPoints')
    userPoints.value = storedPoints || 0
    if (notifyError) uni.showToast({ title: '积分获取失败，当前显示缓存数据', icon: 'none', duration: 2000 })
    return false
  } finally {
    if (!pageDisposed) loading.value = false
  }
}

// 刷新用户积分
const refreshPoints = async () => {
  const success = await fetchUserPoints(false)
  if (pageDisposed) return
  uni.showToast({
    title: success ? '积分刷新成功' : '积分刷新失败，当前显示缓存数据',
    icon: success ? 'success' : 'none',
    duration: 1500
  })
}

// 计算属性：过滤商品
const isRecommendCategory = computed(() => {
  const current = categories.value[currentCategory.value]
  return !!(current && current.type === 'recommend')
})

const selectedCategory = computed(() => {
  return categories.value[currentCategory.value] || categories.value[0] || { icon: 'category_all', name: '全部', type: 'all' }
})

const displayCategoryTitle = computed(() => {
  return isRecommendCategory.value ? 'AI推荐 ' : selectedCategory.value.name
})

function getProductsByRecommendedNames(names) {
  const sourceNames = Array.isArray(names) ? names : []
  const matched = filterProductsByRecommendation(products.value, sourceNames)
  const ordered = orderProductsByRecommendation(matched, sourceNames)
  return ordered.slice(0, SHOP_RECOMMEND_LIMIT)
}

async function ensureRecommendations(force = false) {
  if (pageDisposed) return
  if (recommendLoading.value) return
  if (recommendReady.value && !force) return

  recommendLoading.value = true
  try {
    const apiResult = await fetchShopRecommendations({
      limit: SHOP_RECOMMEND_LIMIT,
      currentPoints: Number(userPoints.value || 0),
      candidateProducts: buildCandidateProducts(products.value)
    })

    const normalized = normalizeRecommendationResult(
      apiResult,
      products.value,
      userPoints.value,
      SHOP_RECOMMEND_LIMIT
    )
    if (pageDisposed) return
    recommendedNames.value = Array.isArray(normalized.names) ? normalized.names : []
    recommendSource.value = normalized.source || 'rule-dom'
    recommendReady.value = true
  } catch (_) {
    if (pageDisposed) return
    recommendedNames.value = getFallbackRecommendedNames(products.value, userPoints.value, SHOP_RECOMMEND_LIMIT)
    recommendSource.value = 'rule-dom'
    recommendReady.value = true
  } finally {
    if (!pageDisposed) recommendLoading.value = false
  }
}

const recommendProducts = computed(() => {
  const fromApi = getProductsByRecommendedNames(recommendedNames.value)
  if (fromApi.length) return fromApi

  const fallbackNames = getFallbackRecommendedNames(products.value, userPoints.value, SHOP_RECOMMEND_LIMIT)
  const fromFallback = getProductsByRecommendedNames(fallbackNames)
  if (fromFallback.length) return fromFallback

  return products.value.slice(0, SHOP_RECOMMEND_LIMIT)
})

const filteredProducts = computed(() => {
  const current = selectedCategory.value
  if (current.type === 'recommend') return recommendProducts.value
  if (current.type === 'all') return products.value
  return products.value.filter(product => (String(product.category) === String(current.categoryId) || product.category === current.name))
})

// 计算属性：是否可以兑换
const canExchange = computed(() => !exchangeSubmitting.value && selectedProduct.value.type === 'physical' && selectedProduct.value.status === 'active' && Number(selectedProduct.value.stock) > 0)
const exchangeLabel = computed(() => {
  if (selectedProduct.value.type !== 'physical') return '暂不支持兑换'
  if (selectedProduct.value.status !== 'active') return '商品已下架'
  if (Number(selectedProduct.value.stock) <= 0) return '库存不足'
  return '立即兑换'
})

// 生成粒子动画样式
const getParticleStyle = (index) => {
  const positions = [
    { left: '10%', animationDelay: '0s' },
    { left: '20%', animationDelay: '2s' },
    { left: '70%', animationDelay: '1s' },
    { left: '85%', animationDelay: '3s' },
    { left: '45%', animationDelay: '1.5s' },
    { left: '60%', animationDelay: '2.5s' }
  ]
  return positions[index - 1] || positions[0]
}

// 切换商品分类
const switchCategory = async (index) => {
  currentCategory.value = index
  if (categories.value[index] && categories.value[index].type === 'recommend') {
    await ensureRecommendations()
  }
}

// 显示商品详情
const showProductDetail = (product) => {
  selectedProduct.value = product
  showDetailModal.value = true
}

// 关闭商品详情
const closeProductDetail = () => {
  showDetailModal.value = false
  selectedProduct.value = {}
}

function goToOrders() { uni.navigateTo({ url: '/pages-nonTheme/shop-orders' }) }

// 兑换商品
const exchangeProduct = () => {
  if (!canExchange.value) return
  exchangeSubmitting.value = true
  uni.navigateTo({
    url: `/pages-nonTheme/shop-confirm?productId=${encodeURIComponent(selectedProduct.value.id)}`,
    success: () => { showDetailModal.value = false },
    complete: () => { exchangeSubmitting.value = false }
  })
}

const goHome = () => {
  navigateBottomTab('shop', 'home', '/pages-dark/home/home')
}
const goMap = () => {
  navigateBottomTab('shop', 'map', '/pages-dark/map/map')
}
const goProfile = () => {
  navigateBottomTab('shop', 'profile', '/pages-dark/profile/profile')
}
</script>

<style scoped>
.shop-catalog-state { padding: 60rpx 20rpx; text-align: center; color: #b9d4df; line-height: 1.8; }
.shop-catalog-retry { margin: 24rpx auto 0; width: 240rpx; border-radius: 999rpx; background: #00aa83; color: white; font-size: 26rpx; }

/* 主背景*/
.shop-bg {
  min-height: 100vh;
  background: linear-gradient(135deg, #0a0e27 0%, #1a1f3a 25%, #2d1b69 50%, #0f0f23 100%);
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

/* 科技背景元素 */
.tech-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
}

.tech-grid {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: 
    linear-gradient(rgba(64, 224, 255, 0.1) 1px, transparent 1px),
    linear-gradient(90deg, rgba(64, 224, 255, 0.1) 1px, transparent 1px);
  background-size: 50px 50px;
  animation: gridMove 20s linear infinite;
}

@keyframes gridMove {
  0% { transform: translate(0, 0); }
  100% { transform: translate(50px, 50px); }
}

/* 浮动粒子 */
.floating-particles {
  position: absolute;
  width: 100%;
  height: 100%;
}

.particle {
  position: absolute;
  width: 4px;
  height: 4px;
  background: linear-gradient(45deg, #40e0ff, #4ecdc4);
  border-radius: 50%;
  animation: float 6s ease-in-out infinite;
  box-shadow: 0 0 10px rgba(64, 224, 255, 0.5);
}

@keyframes float {
  0%, 100% { transform: translateY(0px) scale(1); opacity: 0.7; }
  50% { transform: translateY(-20px) scale(1.2); opacity: 1; }
}

/* 主容器*/
.shop-container {
  position: relative;
  z-index: 2;
  padding: 20rpx 32rpx 140rpx 32rpx;
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - var(--status-bar-height));
}

/* 页面标题 */
.page-title {
  position: relative;
  text-align: center;
  margin-bottom: 2rpx;
  padding: 16rpx 0;
  overflow: hidden;
}

.orders-pill {
  position: absolute;
  z-index: 2;
  top: 18rpx;
  right: 0;
  padding: 10rpx 18rpx;
  border: 1rpx solid rgba(64, 224, 255, 0.5);
  border-radius: 999rpx;
  color: #b9f8ff;
  font-size: 22rpx;
  line-height: 1.2;
  background: rgba(14, 48, 70, 0.72);
}

.title-decoration {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8rpx;
}

.title-line {
  height: 2px;
  width: 80rpx;
  background: linear-gradient(45deg, #40e0ff, #4ecdc4);
  position: relative;
}

.title-line.left {
  animation-delay: -1s;
}

.title-line.right {
  animation-delay: -0.5s;
}

@keyframes titleLinePulse {
  0%, 100% { 
    transform: scaleX(1); 
    opacity: 0.6; 
  }
  50% { 
    transform: scaleX(1.2); 
    opacity: 1; 
    box-shadow: 0 0 20rpx rgba(64, 224, 255, 0.6);
  }
}

.title-icon {
  font-size: 46rpx;
  margin: 0 20rpx;
  filter: drop-shadow(0 0 20rpx rgba(64, 224, 255, 0.8));
  animation: titleIconFloat 3s ease-in-out infinite;
}

@keyframes titleIconFloat {
  0%, 100% { 
    transform: translateY(0px) rotate(0deg) scale(1); 
  }
  50% { 
    transform: translateY(-8px) rotate(5deg) scale(1.1); 
  }
}

.title-text {
  display: block;
  font-size: 36rpx;
  font-weight: 600;
  background: linear-gradient(135deg, #40e0ff 0%, #4ecdc4 50%, #44a08d 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
  text-shadow: 0 0 30rpx rgba(64, 224, 255, 0.5);
  letter-spacing: 3rpx;
  margin-bottom: 4rpx;
  animation: titleTextShimmer 3s ease-in-out infinite;
}

@keyframes titleTextShimmer {
  0%, 100% { 
    transform: scale(1.5);
    filter: brightness(1);
  }
  50% { 
    transform: scale(1.52);
    filter: brightness(1.2) saturate(1.3);
  }
}

.title-subtitle {
  display: block;
  font-size: 30rpx;
  color: rgba(255, 255, 255, 0.7);
  font-weight: 400;
  letter-spacing: 2rpx;
  text-transform: uppercase;
  opacity: 0.8;
  animation: titleSubtitleFade 2s ease-in-out infinite alternate;
  margin-bottom: -10px;
}

@keyframes titleSubtitleFade {
  0% { opacity: 0.6; }
  100% { opacity: 0.9; }
}

.title-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 200rpx;
  height: 200rpx;
  background: radial-gradient(circle, rgba(64, 224, 255, 0.15) 0%, transparent 70%);
  border-radius: 50%;
  animation: titleGlow 4s ease-in-out infinite;
  pointer-events: none;
  z-index: -1;
}

@keyframes titleGlow {
  0%, 100% { 
    opacity: 0.3; 
    transform: translate(-50%, -50%) scale(1) rotate(0deg); 
  }
  50% { 
    opacity: 0.6; 
    transform: translate(-50%, -50%) scale(1.2) rotate(180deg); 
  }
}

/* 顶部积分信息 */
.points-header {
  margin-bottom: 30rpx;
}

.points-card {
  position: relative;
  background: linear-gradient(135deg, 
    rgba(255, 215, 0, 0.15) 0%, 
    rgba(255, 193, 7, 0.15) 50%, 
    rgba(255, 152, 0, 0.15) 100%);
  backdrop-filter: blur(20px);
  border: 2px solid rgba(255, 215, 0, 0.4);
  border-radius: 24rpx;
  padding: 20rpx 32rpx;
  display: flex;
  align-items: center;
  margin-bottom: 15rpx;
  overflow: hidden;
}

.points-glow {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(255, 215, 0, 0.2) 0%, transparent 70%);
  animation: pointsGlow 3s ease-in-out infinite;
  pointer-events: none;
}

@keyframes pointsGlow {
  0%, 100% { opacity: 0.3; transform: scale(1) rotate(0deg); }
  50% { opacity: 0.6; transform: scale(1.1) rotate(180deg); }
}

.points-icon {
  font-size: 64rpx;
  margin-right: 24rpx;
  filter: drop-shadow(0 0 20rpx rgba(255, 215, 0, 0.8));
  animation: pointsPulse 2s ease-in-out infinite;
}

@keyframes pointsPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

.points-info {
  flex: 1;
}

.points-label {
  display: block;
  color: rgba(255, 255, 255, 0.8);
  font-size: 28rpx;
  margin-bottom: 8rpx;
}

.points-value {
  display: block;
  color: #FFD700;
  font-size: 48rpx;
  font-weight: 700;
  text-shadow: 0 0 20rpx rgba(255, 215, 0, 0.6);
}

/* 积分加载动画 */
.loading-dots {
  display: flex;
  align-items: center;
  gap: 8rpx;
  height: 48rpx;
}

.dot {
  width: 12rpx;
  height: 12rpx;
  background: #FFD700;
  border-radius: 50%;
  animation: dotPulse 1.4s ease-in-out infinite both;
}

.dot:nth-child(1) { animation-delay: -0.32s; }
.dot:nth-child(2) { animation-delay: -0.16s; }
.dot:nth-child(3) { animation-delay: 0s; }

@keyframes dotPulse {
  0%, 80%, 100% { opacity: 0.3; transform: scale(1); }
  40% { opacity: 1; transform: scale(1.2); }
}

/* 刷新按钮 */
.points-refresh {
  margin-left: 16rpx;
  padding: 12rpx;
  border-radius: 50%;
  background: rgba(255, 215, 0, 0.1);
  border: 2px solid rgba(255, 215, 0, 0.3);
  cursor: pointer;
  transition: all 0.3s ease;
}

.points-refresh:hover {
  background: rgba(255, 215, 0, 0.2);
  border-color: rgba(255, 215, 0, 0.5);
  transform: scale(1.05);
}

.refresh-icon {
  font-size: 27rpx;
  color: #FFD700;
  filter: drop-shadow(0 0 8rpx rgba(255, 215, 0, 0.6));
}

.rotating .refresh-icon {
  animation: refreshSpin 1s linear infinite;
}

@keyframes refreshSpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.points-tips {
  display: flex;
  align-items: center;
  background: rgba(255, 215, 0, 0.1);
  padding: 16rpx 24rpx;
  border-radius: 16rpx;
  border: 1px solid rgba(255, 215, 0, 0.2);
}

.tip-icon {
  font-size: 24rpx;
  margin-right: 12rpx;
  filter: drop-shadow(0 0 8rpx rgba(255, 215, 0, 0.6));
}

.tip-text {
  color: rgba(255, 255, 255, 0.8);
  font-size: 24rpx;
}

/* 分类选项卡*/
.category-tabs {
  display: flex;
  background: rgba(15, 15, 35, 0.8);
  border-radius: 20rpx;
  padding: 8rpx;
  margin-bottom: 32rpx;
  border: 1px solid rgba(64, 224, 255, 0.2);
  backdrop-filter: blur(20px);
  overflow-x: auto;
}

.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20rpx 16rpx;
  border-radius: 16rpx;
  transition: all 0.3s ease;
  cursor: pointer;
  min-width: 120rpx;
}

.tab-item.active {
  background: linear-gradient(135deg, #40e0ff 0%, #4ecdc4 100%);
  box-shadow: 0 8rpx 24rpx rgba(64, 224, 255, 0.3);
  transform: translateY(-2rpx);
}

.tab-icon {
  font-size: 32rpx;
  margin-bottom: 8rpx;
  filter: drop-shadow(0 0 8rpx rgba(64, 224, 255, 0.5));
}

.tab-text {
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 600;
  text-shadow: 0 0 10rpx rgba(0, 0, 0, 0.5);
}

.tab-item:not(.active) .tab-text {
  color: rgba(255, 255, 255, 0.7);
}

/* 商品区域 */
.products-section {
  flex: 1;
  position: relative;
}

.section-title {
  display: flex;
  align-items: center;
  margin-bottom: 24rpx;
  padding: 0 8rpx;
}

.title2-icon {
  font-size: 36rpx;
  margin-right: 16rpx;
  filter: drop-shadow(0 0 12rpx rgba(64, 224, 255, 0.6));
}

.title2-text {
  color: #40e0ff;
  font-size: 32rpx;
  font-weight: 600;
  margin-right: 16rpx;
}

.product-count {
  color: rgba(255, 255, 255, 0.6);
  font-size: 24rpx;
}

.recommend-loading-mask {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16rpx;
  padding: 16rpx 18rpx;
  margin: 0 8rpx 18rpx;
  background: linear-gradient(135deg, rgba(64, 224, 255, 0.14), rgba(78, 205, 196, 0.16));
  border: 1px solid rgba(64, 224, 255, 0.3);
}

.recommend-loading-text {
  font-size: 24rpx;
  font-weight: 600;
  color: #aaf4ff;
}

/* 商品网格 */
.products-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24rpx;
}

.product-card {
  position: relative;
  background: rgba(15, 15, 35, 0.9);
  border-radius: 20rpx;
  overflow: hidden;
  border: 1px solid rgba(64, 224, 255, 0.2);
  backdrop-filter: blur(20px);
  transition: all 0.3s ease;
  cursor: pointer;
}

.product-card:active {
  transform: scale(0.98) translateY(2rpx);
  box-shadow: 0 8rpx 32rpx rgba(64, 224, 255, 0.2);
}

.product-glow {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(64, 224, 255, 0.1) 0%, transparent 70%);
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.product-card:hover .product-glow {
  opacity: 1;
  animation: productGlow 2s ease-in-out infinite;
}

@keyframes productGlow {
  0%, 100% { transform: scale(1) rotate(0deg); }
  50% { transform: scale(1.1) rotate(180deg); }
}

.product-image-container {
  position: relative;
  height: 240rpx;
  overflow: hidden;
}

.product-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.product-card:hover .product-image {
  transform: scale(1.1);
}

.product-badge {
  position: absolute;
  top: 12rpx;
  right: 12rpx;
  padding: 6rpx 12rpx;
  border-radius: 12rpx;
  font-size: 20rpx;
  font-weight: 600;
  color: #ffffff;
  text-shadow: 0 0 8rpx rgba(0, 0, 0, 0.8);
}

.product-badge.hot {
  background: linear-gradient(45deg, #ff6b35, #f7931e);
  box-shadow: 0 4rpx 12rpx rgba(255, 107, 53, 0.4);
}

.product-badge.ai {
  left: 12rpx;
  right: auto;
  background: linear-gradient(45deg, #00b4ff, #2ee6d6);
  box-shadow: 0 4rpx 12rpx rgba(0, 180, 255, 0.35);
}

.product-badge.limited {
  background: linear-gradient(45deg, #8e44ad, #9b59b6);
  box-shadow: 0 4rpx 12rpx rgba(142, 68, 173, 0.4);
}

.product-info {
  padding: 24rpx;
}

.product-name {
  display: block;
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 600;
  margin-bottom: 8rpx;
  line-height: 1.4;
}

.product-desc {
  display: block;
  color: rgba(255, 255, 255, 0.7);
  font-size: 22rpx;
  line-height: 1.4;
  margin-bottom: 16rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.product-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.product-price {
  display: flex;
  align-items: center;
}

.price-icon {
  font-size: 24rpx;
  margin-right: 6rpx;
  filter: drop-shadow(0 0 8rpx rgba(255, 215, 0, 0.8));
}

.price-value {
  color: #FFD700;
  font-size: 28rpx;
  font-weight: 700;
  text-shadow: 0 0 12rpx rgba(255, 215, 0, 0.6);
}

.product-stock {
  font-size: 20rpx;
  color: rgba(255, 255, 255, 0.6);
}

/* 商品详情弹窗 */
.detail-modal-overlay {
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

.detail-modal {
  position: relative;
  background: rgba(5, 25, 45, 0.95);
  backdrop-filter: blur(25px);
  border-radius: 32rpx;
  border: 2px solid rgba(64, 224, 255, 0.4);
  max-width: 600rpx;
  width: 100%;
  max-height: 80vh;
  overflow: hidden;
  animation: modalSlideIn 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  box-shadow: 
    0 20rpx 60rpx rgba(0, 0, 0, 0.5),
    0 0 40rpx rgba(64, 224, 255, 0.2);
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

.modal-header {
  position: relative;
  height: 300rpx;
  overflow: hidden;
}

.modal-product-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.modal-close {
  position: absolute;
  top: 24rpx;
  right: 24rpx;
  width: 48rpx;
  height: 48rpx;
  background: rgba(0, 0, 0, 0.6);
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
  backdrop-filter: blur(10px);
}

.modal-close:active {
  transform: scale(0.9);
  background: rgba(255, 255, 255, 0.2);
}

.modal-image-glow {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 100rpx;
  background: linear-gradient(to top, rgba(5, 25, 45, 0.95) 0%, transparent 100%);
}

.modal-content {
  padding: 32rpx;
}

.modal-product-name {
  display: block;
  color: #ffffff;
  font-size: 36rpx;
  font-weight: 700;
  margin-bottom: 16rpx;
  text-shadow: 0 0 20rpx rgba(64, 224, 255, 0.6);
}

.modal-product-desc {
  display: block;
  color: rgba(255, 255, 255, 0.8);
  font-size: 26rpx;
  line-height: 1.6;
  margin-bottom: 32rpx;
}

.modal-product-details {
  margin-bottom: 32rpx;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 1px solid rgba(64, 224, 255, 0.1);
}

.detail-item:last-child {
  border-bottom: none;
}

.detail-label {
  color: rgba(255, 255, 255, 0.7);
  font-size: 26rpx;
}

.detail-price {
  display: flex;
  align-items: center;
}

.detail-price .price-icon {
  font-size: 28rpx;
  margin-right: 8rpx;
}

.detail-price .price-value {
  color: #FFD700;
  font-size: 32rpx;
  font-weight: 700;
}

.detail-value {
  color: #ffffff;
  font-size: 26rpx;
  font-weight: 500;
  max-width: 300rpx;
  text-align: right;
  line-height: 1.4;
}

.modal-footer {
  padding: 0 32rpx 32rpx;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.exchange-info {
  text-align: center;
}

.exchange-note {
  color: rgba(255, 255, 255, 0.6);
  font-size: 22rpx;
}

.exchange-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #40e0ff 0%, #4ecdc4 50%, #44a08d 100%);
  border-radius: 50rpx;
  padding: 24rpx;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 
    0 8rpx 24rpx rgba(64, 224, 255, 0.3),
    inset 0 2rpx 0 rgba(255, 255, 255, 0.2);
}

.exchange-btn:active {
  transform: scale(0.98) translateY(2rpx);
}

.exchange-btn.disabled {
  background: linear-gradient(135deg, #666666 0%, #777777 100%);
  cursor: not-allowed;
  box-shadow: none;
}

.exchange-btn.disabled:active {
  transform: none;
}

.btn-icon {
  font-size: 32rpx;
  margin-right: 12rpx;
  filter: drop-shadow(0 0 8rpx rgba(255, 255, 255, 0.5));
}

.btn-text {
  color: #ffffff;
  font-size: 32rpx;
  font-weight: 700;
  text-shadow: 0 0 10rpx rgba(0, 0, 0, 0.5);
}

.modal-glow {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(64, 224, 255, 0.15) 0%, transparent 70%);
  animation: modalGlow 3s ease-in-out infinite;
  pointer-events: none;
  z-index: -1;
}

@keyframes modalGlow {
  0%, 100% { opacity: 0.3; transform: scale(1) rotate(0deg); }
  50% { opacity: 0.6; transform: scale(1.1) rotate(180deg); }
}

/* 兑换成功弹窗 */
.success-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(10px);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
  animation: fadeIn 0.3s ease-out;
}

.success-modal {
  background: rgba(5, 25, 45, 0.95);
  backdrop-filter: blur(25px);
  border-radius: 32rpx;
  border: 2px solid rgba(0, 255, 136, 0.4);
  padding: 60rpx 40rpx 40rpx;
  text-align: center;
  max-width: 400rpx;
  width: 100%;
  animation: successSlideIn 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

@keyframes successSlideIn {
  0% { 
    opacity: 0; 
    transform: scale(0.5) rotate(-10deg); 
  }
  100% { 
    opacity: 1; 
    transform: scale(1) rotate(0deg); 
  }
}

.success-animation {
  position: relative;
  width: 120rpx;
  height: 120rpx;
  margin: 0 auto 32rpx;
}

.success-icon {
  font-size: 80rpx;
  position: relative;
  z-index: 2;
  filter: drop-shadow(0 0 20rpx rgba(0, 255, 136, 0.8));
  animation: successBounce 0.6s ease-in-out;
}

@keyframes successBounce {
  0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
  40% { transform: translateY(-10rpx); }
  60% { transform: translateY(-5rpx); }
}

.success-circle {
  position: absolute;
  top: 0;
  left: 0;
  width: 120rpx;
  height: 120rpx;
  border: 3px solid rgba(0, 255, 136, 0.3);
  border-radius: 50%;
  animation: successRipple 1s ease-out infinite;
}

@keyframes successRipple {
  0% { 
    transform: scale(0.8); 
    opacity: 1; 
  }
  100% { 
    transform: scale(1.8); 
    opacity: 0; 
  }
}

.success-title {
  display: block;
  color: #00ff88;
  font-size: 36rpx;
  font-weight: 700;
  margin-bottom: 16rpx;
  text-shadow: 0 0 20rpx rgba(0, 255, 136, 0.6);
}

.success-desc {
  display: block;
  color: rgba(255, 255, 255, 0.8);
  font-size: 26rpx;
  line-height: 1.5;
  margin-bottom: 40rpx;
}

.success-btn {
  background: linear-gradient(135deg, #00ff88 0%, #00cc6a 100%);
  border-radius: 50rpx;
  padding: 20rpx 40rpx;
  cursor: pointer;
  transition: all 0.3s ease;
}

.success-btn:active {
  transform: scale(0.98);
}

.success-btn-text {
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 600;
  text-shadow: 0 0 10rpx rgba(0, 0, 0, 0.5);
}

/* 底部导航栏*/
.tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 120rpx;
  background: rgba(15, 15, 35, 0.95);
  backdrop-filter: blur(20px);
  border-top: 1px solid rgba(64, 224, 255, 0.3);
  box-shadow: 
    0 -8rpx 24rpx rgba(0, 0, 0, 0.3),
    0 0 40rpx rgba(64, 224, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: space-around;
  z-index: 100;
}

.tabbar-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.6);
  font-size: 24rpx;
  padding: 16rpx 0;
  transition: all 0.3s ease;
  position: relative;
  cursor: pointer;
}

.tabbar-item.active {
  color: #40e0ff;
  font-weight: 600;
  transform: translateY(-4rpx);
}

.tabbar-item.active::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 60rpx;
  height: 6rpx;
  background: linear-gradient(45deg, #40e0ff, #4ecdc4);
  border-radius: 3rpx;
  box-shadow: 0 0 12rpx rgba(64, 224, 255, 0.6);
}

.tabbar-icon {
  font-size: 40rpx;
  margin-bottom: 8rpx;
  opacity: 0.6;
  filter: saturate(0.7) drop-shadow(0 0 8px rgba(64, 224, 255, 0.3));
}

.tabbar-item.active .tabbar-icon {
  opacity: 1;
  filter: saturate(1) drop-shadow(0 0 12px rgba(64, 224, 255, 0.8));
  animation: iconGlow 2s ease-in-out infinite;
}

@keyframes iconGlow {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

.tabbar-label {
  font-size: 22rpx;
  letter-spacing: 1rpx;
}

@media (max-width: 768px) {
  .shop-container {
    padding: 0 20rpx 140rpx;
  }

  .page-title {
    margin-bottom: 20rpx;
  }

  .points-card {
    padding: 24rpx;
  }

  .category-tabs {
    padding: 6rpx;
    margin-bottom: 24rpx;
  }

  .tab-item {
    min-width: 106rpx;
    padding: 16rpx 10rpx;
  }

  .tab-icon {
    font-size: 28rpx;
  }

  .tab-text {
    font-size: 20rpx;
  }

  .section-title {
    flex-wrap: wrap;
    gap: 8rpx;
    margin-bottom: 16rpx;
  }

  .recommend-loading-text {
    font-size: 22rpx;
    text-align: center;
    line-height: 1.5;
  }

  .product-name {
    font-size: 26rpx;
  }

  .product-desc {
    font-size: 22rpx;
  }
}

@media (max-width: 420px) {
  .shop-container {
    padding: 0 16rpx 136rpx;
  }

  .tab-item {
    min-width: 96rpx;
    padding: 14rpx 8rpx;
  }

  .product-image-container {
    height: 240rpx;
  }

  .product-badge {
    font-size: 18rpx;
    padding: 4rpx 10rpx;
  }
}

@keyframes fadeIn {
  0% { opacity: 0; }
  100% { opacity: 1; }
}
</style>



