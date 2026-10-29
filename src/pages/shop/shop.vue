<template>
  <view class="shop-page" :class="tabPageClass">
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
    <view :animation="tabPageAnimation" class="shop-header tab-page-motion">
      <view class="header-decoration">
        <view class="deco-circle c1"></view>
        <view class="deco-circle c2"></view>
        <view class="deco-circle c3"></view>
      </view>
      <view class="header-content">
        <view class="header-title-row">
          <view class="header-title"><ManifestIcon id="store" /> 积分商城</view>
          <view class="orders-pill" @click="goToOrders">我的订单</view>
        </view>
        <text class="header-subtitle">环保积分 · 兑换好礼</text>
      </view>
    </view>

    <!-- 主内容区域-->
    <view :animation="tabPageAnimation" class="content-wrapper tab-page-motion">
      <!-- 积分卡片 -->
      <view class="points-card">
        <view class="points-icon-wrapper">
          <ManifestIcon id="points_coin" class="points-icon" />
        </view>
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
      </view>

      <!-- 积分提示 -->
      <view class="points-tips">
        <ManifestIcon id="points_info" class="tip-icon" />
        <view class="tip-text-wrapper">
          <view class="tip-text-track">
            <text class="tip-text">每次垃圾识别可获得1-3积分</text>
            <text class="tip-text">每次垃圾识别可获得1-3积分</text>
          </view>
        </view>
      </view>

      <!-- 商品分类选项卡-->
      <view class="category-tabs">
        <view 
          v-for="(category, index) in categories" 
          :key="index"
          :class="['tab-item', { active: currentCategory === index }]"
          @mousemove="updatePointerPosition"
          @touchmove.passive="updatePointerPosition"
          @click="switchCategory(index)"
        >
          <ManifestIcon class="tab-icon" :id="category.icon" />
          <text class="tab-text">{{ category.name }}</text>
        </view>
      </view>

      <!-- 商品列表 -->
      <view class="products-section">
        <view class="section-header">
          <ManifestIcon class="section-icon" :id="selectedCategory.icon" />
          <text class="section-title">{{ displayCategoryTitle }}</text>
          <text class="product-count">共{{ filteredProducts.length }} 件</text>
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
            @mousemove="updatePointerPosition"
            @touchmove.passive="updatePointerPosition"
            @click="showProductDetail(product)"
          >
            <view class="product-image-wrapper">
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
                <view class="product-stock" :class="{ low: product.stock <= 2 }">
                  <view class="stock-label"><ManifestIcon id="inventory" /> 库存 {{ product.stock }}</view>
                </view>
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 商品详情弹窗 -->
    <view v-if="showDetailModal" class="modal-overlay" @click="closeProductDetail">
      <view class="detail-modal" @click.stop="">
        <view class="modal-header">
          <image :src="selectedProduct.image" class="modal-image" mode="aspectFill" />
          <ManifestIcon id="close" class="modal-close" :scale="1.4" @click="closeProductDetail" />
        </view>
        
        <view class="modal-body">
          <text class="modal-name">{{ selectedProduct.name }}</text>
          <text class="modal-desc">{{ selectedProduct.description }}</text>
          
          <view class="modal-details">
            <view class="detail-row">
              <text class="detail-label">所需积分</text>
              <view class="detail-value points">
                <ManifestIcon id="points_coin" class="value-icon" />
                <text>{{ selectedProduct.points }}</text>
              </view>
            </view>
            <view class="detail-row">
              <text class="detail-label">剩余库存</text>
              <text class="detail-value">{{ selectedProduct.stock }} 件</text>
            </view>
            <view class="detail-row">
              <text class="detail-label">商品特点</text>
              <text class="detail-value">{{ selectedProduct.features }}</text>
            </view>
          </view>
        </view>
        
        <view class="modal-footer">
          <view 
            :class="['exchange-btn', { disabled: !canExchange }]"
            @click="exchangeProduct"
          >
            <ManifestIcon id="redeem_gift" class="btn-icon" />
            <text class="btn-text">{{ exchangeLabel }}</text>
          </view>
        </view>
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
import { updatePointerCssVariables } from '@/utils/pointer-position.mjs'
import { navigateBottomTab, useTabPageTransition } from '@/utils/tab-page-transition.js'
import {
  SHOP_RECOMMEND_LIMIT,
  buildCandidateProducts,
  filterProductsByRecommendation,
  getFallbackRecommendedNames,
  normalizeRecommendationResult,
  orderProductsByRecommendation
} from '@/utils/shop-recommendation'

const { tabPageClass, tabPageAnimation } = useTabPageTransition('pages/shop/shop')
const userPoints = ref(0)
const loading = ref(false)
const currentCategory = ref(0)
const showDetailModal = ref(false)
const exchangeSubmitting = ref(false)
const selectedProduct = ref({})
const recommendLoading = ref(false)
const recommendReady = ref(false)
const recommendSource = ref('rule-dom')
const recommendedNames = ref([])
let pageDisposed = false

function updatePointerPosition(event) {
  const element = event?.currentTarget
  if (!element || typeof element.getBoundingClientRect !== 'function') return false
  return updatePointerCssVariables(event)
}

const categories = ref([
  { name: '猜您喜欢', icon: 'ai_recommend', type: 'recommend' },
  { name: '全部', icon: 'category_all', type: 'all' },
  { name: '环保用品', icon: 'eco_products', type: 'category', categoryId: 1 },
  { name: '数码配件', icon: 'digital_accessories', type: 'category', categoryId: 2 },
  { name: '生活用品', icon: 'home_living', type: 'category', categoryId: 3 },
  { name: '学习用品', icon: 'learning_supplies', type: 'category', categoryId: 4 },
  { name: '美食券', icon: 'food_coupon', type: 'category', categoryId: 5 }
])

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

onShow(async () => {
  await Promise.all([fetchUserPoints(), loadProducts()])
  if (pageDisposed) return
  if (currentCategory.value === 0) {
    await ensureRecommendations()
  }
  if (pageDisposed) return
})

onBeforeUnmount(() => {
  pageDisposed = true
  // Pointer effects use Vue event bindings, so dynamic cards and tabs are
  // released automatically with their component nodes.
})

const fetchUserPoints = async (notifyError = true) => {
  if (pageDisposed) return false
  try {
    loading.value = true
    const token = uni.getStorageSync('token')
    if (!token) {
      if (pageDisposed) return false
      userPoints.value = 0
      return false
    }
    
    const response = await userinfo("false")
    if (pageDisposed) return false
    if (response.code === 0) {
      userPoints.value = response.data.points || 0
      return true
    } else {
      const storedPoints = uni.getStorageSync('userPoints')
      userPoints.value = storedPoints || 0
      if (notifyError) uni.showToast({ title: response.msg || '积分获取失败，当前显示缓存数据', icon: 'none' })
      return false
    }
  } catch (error) {
    if (pageDisposed) return false
    const storedPoints = uni.getStorageSync('userPoints')
    userPoints.value = storedPoints || 0
    if (notifyError) uni.showToast({ title: '积分获取失败，当前显示缓存数据', icon: 'none' })
    return false
  } finally {
    if (!pageDisposed) loading.value = false
  }
}

const refreshPoints = async () => {
  const success = await fetchUserPoints(false)
  if (pageDisposed) return
  uni.showToast({
    title: success ? '积分已刷新' : '积分刷新失败，当前显示缓存数据',
    icon: success ? 'success' : 'none',
    duration: 1500
  })
}

const isRecommendCategory = computed(() => {
  const current = categories.value[currentCategory.value]
  return !!(current && current.type === 'recommend')
})

const selectedCategory = computed(() => {
  return categories.value[currentCategory.value] || categories.value[0] || { icon: 'category_all', name: '全部', type: 'all' }
})

const displayCategoryTitle = computed(() => {
  return isRecommendCategory.value ? 'AI推荐' : selectedCategory.value.name
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

const canExchange = computed(() => !exchangeSubmitting.value && selectedProduct.value.type === 'physical' && selectedProduct.value.status === 'active' && Number(selectedProduct.value.stock) > 0)
const exchangeLabel = computed(() => {
  if (selectedProduct.value.type !== 'physical') return '暂不支持兑换'
  if (selectedProduct.value.status !== 'active') return '商品已下架'
  if (Number(selectedProduct.value.stock) <= 0) return '库存不足'
  return '立即兑换'
})

const switchCategory = async (index) => {
  currentCategory.value = index
  if (categories.value[index] && categories.value[index].type === 'recommend') {
    await ensureRecommendations()
  }
}

const showProductDetail = (product) => {
  selectedProduct.value = product
  showDetailModal.value = true
}

const closeProductDetail = () => {
  showDetailModal.value = false
  selectedProduct.value = {}
}

function goToOrders() { uni.navigateTo({ url: '/pages-nonTheme/shop-orders' }) }

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
  navigateBottomTab('shop', 'home', '/pages/home/home')
}

const goMap = () => {
  navigateBottomTab('shop', 'map', '/pages/map/map')
}

const goProfile = () => {
  navigateBottomTab('shop', 'profile', '/pages/profile/profile')
}
</script>

<style scoped>
.shop-catalog-state { padding: 60rpx 20rpx; text-align: center; color: #64748b; line-height: 1.8; }
.shop-catalog-retry { margin: 24rpx auto 0; width: 240rpx; border-radius: 999rpx; background: #00aa83; color: white; font-size: 26rpx; }

/* 页面基础 */
.shop-page {
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
.shop-header {
  background: linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%);
  padding: 32rpx 32rpx 64rpx;
  position: relative;
  overflow: hidden;
  z-index: 1;
}

.shop-header .header-decoration {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  pointer-events: none;
}

.shop-header .deco-circle {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
}

.shop-header .deco-circle.c1 {
  width: 200rpx;
  height: 200rpx;
  top: -80rpx;
  right: -60rpx;
}

.shop-header .deco-circle.c2 {
  width: 120rpx;
  height: 120rpx;
  bottom: -40rpx;
  left: 20%;
}

.shop-header .deco-circle.c3 {
  width: 80rpx;
  height: 80rpx;
  top: 20%;
  right: 25%;
  background: rgba(255, 255, 255, 0.15);
}

.shop-header::after {
  content: '';
  position: absolute;
  bottom: -20rpx;
  left: 0;
  right: 0;
  height: 40rpx;
  background: #f5f7fa;
  border-radius: 40rpx 40rpx 0 0;
}

.header-content {
  position: relative;
  z-index: 1;
}

.header-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-title {
  display: flex;
  align-items: center;
  font-size: 40rpx;
  font-weight: 700;
  color: #ffffff;
  margin-bottom: 8rpx;
}

.orders-pill {
  padding: 10rpx 18rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.55);
  border-radius: 999rpx;
  color: #fff;
  font-size: 23rpx;
  line-height: 1.2;
  background: rgba(255, 255, 255, 0.16);
}

.header-subtitle {
  display: block;
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.8);
}

/* 主内容区域*/
.content-wrapper {
  padding: 0 32rpx;
  margin-top: -40rpx;
  position: relative;
  z-index: 2;
}

/* 积分卡片 */
.points-card {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(220, 252, 231, 0.9) 30%, rgba(187, 247, 208, 0.85) 50%, rgba(220, 252, 231, 0.9) 70%, rgba(255, 255, 255, 0.98) 100%);
  border-radius: 24rpx;
  padding: 32rpx;
  display: flex;
  align-items: center;
  box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.08), 0 4rpx 16rpx rgba(16, 185, 129, 0.1);
  margin-bottom: 20rpx;
  backdrop-filter: blur(10rpx);
  border: 1rpx solid rgba(255, 255, 255, 0.8);
}

.points-icon-wrapper {
  width: 88rpx;
  height: 88rpx;
  background: transparent;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 24rpx;
}

.points-icon {
  font-size: 44rpx;
  position: relative;
  display: inline-block;
  animation: diamondGlow 3s ease-in-out infinite;
  filter: drop-shadow(0 2rpx 4rpx rgba(0, 0, 0, 0.1));
}

.points-icon::before {
  content: '';
  position: absolute;
  top: 8rpx;
  right: 6rpx;
  width: 12rpx;
  height: 12rpx;
  background: radial-gradient(circle, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 0.8) 40%, transparent 70%);
  border-radius: 50%;
  opacity: 0;
  animation: whiteSparkle 2s ease-in-out infinite;
}

.points-icon::after {
  content: '';
  position: absolute;
  top: 16rpx;
  left: 10rpx;
  width: 8rpx;
  height: 8rpx;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0.6) 50%, transparent 80%);
  border-radius: 50%;
  opacity: 0;
  animation: whiteSparkle 2s ease-in-out infinite 1s;
}

@keyframes diamondGlow {
  0%, 100% {
    filter: brightness(1) drop-shadow(0 0 0 rgba(255, 255, 255, 0)) drop-shadow(0 2rpx 4rpx rgba(0, 0, 0, 0.1));
    transform: scale(1);
  }
  25% {
    filter: brightness(1.15) drop-shadow(0 0 12rpx rgba(255, 255, 255, 0.8)) drop-shadow(0 2rpx 4rpx rgba(0, 0, 0, 0.1));
  }
  50% {
    filter: brightness(1.3) drop-shadow(0 0 20rpx rgba(255, 255, 255, 1)) drop-shadow(0 0 40rpx rgba(255, 255, 255, 0.5)) drop-shadow(0 2rpx 4rpx rgba(0, 0, 0, 0.1));
    transform: scale(1.02);
  }
  75% {
    filter: brightness(1.15) drop-shadow(0 0 12rpx rgba(255, 255, 255, 0.8)) drop-shadow(0 2rpx 4rpx rgba(0, 0, 0, 0.1));
  }
}

@keyframes whiteSparkle {
  0%, 100% {
    opacity: 0;
    transform: scale(0.5);
  }
  30% {
    opacity: 0;
    transform: scale(0.5);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
  70% {
    opacity: 0;
    transform: scale(0.5);
  }
}

.points-info {
  flex: 1;
}

.points-label {
  display: block;
  font-size: 24rpx;
  color: #6b7280;
  margin-bottom: 8rpx;
}

.points-value {
  display: block;
  font-size: 48rpx;
  font-weight: 700;
  color: #f59e0b;
}

.loading-dots {
  display: flex;
  gap: 8rpx;
  height: 48rpx;
  align-items: center;
}

.dot {
  width: 12rpx;
  height: 12rpx;
  background: #f59e0b;
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

.points-refresh {
  width: 64rpx;
  height: 64rpx;
  background: #f3f4f6;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.refresh-icon {
  font-size: 28rpx;
  color: #6b7280;
}

.rotating .refresh-icon {
  animation: refreshSpin 1s linear infinite;
}

@keyframes refreshSpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 积分提示 */
.points-tips {
  display: flex;
  align-items: center;
  background: #ecfdf5;
  padding: 20rpx 24rpx;
  border-radius: 16rpx;
  margin-bottom: 32rpx;
  overflow: hidden;
}

.tip-icon {
  font-size: 28rpx;
  margin-right: 12rpx;
  flex-shrink: 0;
}

.tip-text-wrapper {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  position: relative;
}

.tip-text-track {
  display: inline-flex;
  animation: scrollTrack 12s linear infinite;
}

.tip-text {
  font-size: 24rpx;
  color: #059669;
  white-space: nowrap;
  flex-shrink: 0;
  padding-right: 100rpx;
}

@keyframes scrollTrack {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-50%);
  }
}

/* 分类选项卡*/
.category-tabs {
  display: flex;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(240, 253, 244, 0.95) 50%, rgba(255, 255, 255, 0.98) 100%);
  border-radius: 20rpx;
  padding: 12rpx;
  margin-bottom: 32rpx;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.06), 0 2rpx 8rpx rgba(16, 185, 129, 0.05);
  overflow-x: auto;
  backdrop-filter: blur(10rpx);
  border: 1rpx solid rgba(255, 255, 255, 0.8);
}

.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20rpx 16rpx;
  border-radius: 16rpx;
  transition: all 0.3s ease;
  min-width: 120rpx;
  position: relative;
  overflow: hidden;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.9) 0%, rgba(245, 247, 250, 0.85) 100%);
  box-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.04), inset 0 1rpx 0 rgba(255, 255, 255, 0.8);
  border: 1rpx solid rgba(255, 255, 255, 0.5);
}

/* 塑料质感光泽 */
.tab-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 50%;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.7) 0%, rgba(255, 255, 255, 0.2) 100%);
  pointer-events: none;
  border-radius: 16rpx 16rpx 0 0;
}

/* 光感追随鼠标效果 */
.tab-item::after {
  content: '';
  position: absolute;
  top: var(--mouse-y, 50%);
  left: var(--mouse-x, 50%);
  width: 150rpx;
  height: 150rpx;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.6) 0%, transparent 70%);
  transform: translate(-50%, -50%);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.tab-item:hover::after,
.tab-item:active::after {
  opacity: 1;
}

.tab-item.active {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  box-shadow: 0 4rpx 12rpx rgba(16, 185, 129, 0.3), inset 0 1rpx 0 rgba(255, 255, 255, 0.3);
  border: 1rpx solid rgba(255, 255, 255, 0.3);
}

/* 激活状态的光泽 */
.tab-item.active::before {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.4) 0%, transparent 100%);
}

.tab-item.active .tab-text {
  color: #ffffff;
}

.tab-item:active {
  transform: scale(0.95);
}

.tab-icon {
  font-size: 32rpx;
  margin-bottom: 8rpx;
}

.tab-text {
  font-size: 22rpx;
  color: #6b7280;
  font-weight: 500;
}

/* 商品区域 */
.products-section {
  margin-bottom: 32rpx;
  position: relative;
}

.section-header {
  display: flex;
  align-items: center;
  margin-bottom: 24rpx;
}

.section-icon {
  font-size: 32rpx;
  margin-right: 12rpx;
}

.section-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #1f2937;
  margin-right: 16rpx;
}

.product-count {
  font-size: 24rpx;
  color: #9ca3af;
}

.recommend-loading-mask {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16rpx;
  padding: 16rpx 18rpx;
  margin-bottom: 18rpx;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(59, 130, 246, 0.1));
  border: 1rpx solid rgba(16, 185, 129, 0.2);
}

.recommend-loading-text {
  font-size: 24rpx;
  font-weight: 600;
  color: #0f766e;
}

/* 商品网格 */
.products-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24rpx;
}

.product-card {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.98) 0%, rgba(250, 252, 255, 0.95) 50%, rgba(255, 255, 255, 0.98) 100%);
  border-radius: 20rpx;
  overflow: hidden;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.06), 0 1rpx 3rpx rgba(0, 0, 0, 0.04);
  transition: all 0.3s ease;
  position: relative;
  border: 1rpx solid rgba(255, 255, 255, 0.6);
}

/* 纸质卡片质感 */
.product-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 40%;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.3) 60%, transparent 100%);
  pointer-events: none;
  border-radius: 20rpx 20rpx 0 0;
}

/* 光感追随鼠标效果 */
.product-card::after {
  content: '';
  position: absolute;
  top: var(--mouse-y, 50%);
  left: var(--mouse-x, 50%);
  width: 250rpx;
  height: 250rpx;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.5) 0%, transparent 70%);
  transform: translate(-50%, -50%);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: 5;
}

.product-card:hover::after,
.product-card:active::after {
  opacity: 1;
}

.product-card:active {
  transform: scale(0.98);
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
}

.product-image-wrapper {
  position: relative;
  height: 240rpx;
  overflow: hidden;
}

.product-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
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
}

.product-badge.hot {
  background: linear-gradient(45deg, #f97316, #fb923c);
}

.product-badge.ai {
  left: 12rpx;
  right: auto;
  background: linear-gradient(45deg, #0ea5e9, #14b8a6);
  box-shadow: 0 4rpx 12rpx rgba(14, 165, 233, 0.35);
}

.product-badge.limited {
  background: linear-gradient(45deg, #8b5cf6, #a78bfa);
}

.product-info {
  padding: 20rpx;
}

.product-name {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 8rpx;
  line-height: 1.4;
}

.product-desc {
  display: block;
  font-size: 22rpx;
  color: #6b7280;
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
  margin-right: 4rpx;
}

.price-value {
  font-size: 28rpx;
  font-weight: 700;
  color: #f59e0b;
}

.product-stock {
  font-size: 20rpx;
  color: #10b981;
  background: #d1fae5;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
}

.product-stock.low {
  color: #ef4444;
  background: #fef2f2;
}

/* 弹窗遮罩 */
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
}

/* 商品详情弹窗 */
.detail-modal {
  background: #ffffff;
  border-radius: 32rpx;
  max-width: 600rpx;
  width: 100%;
  max-height: 80vh;
  overflow: hidden;
  animation: modalSlideIn 0.3s ease-out;
}

@keyframes modalSlideIn {
  0% { opacity: 0; transform: scale(0.9) translateY(20rpx); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}

.modal-header {
  position: relative;
  height: 300rpx;
  overflow: hidden;
}

.modal-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.modal-close {
  position: absolute;
  top: 20rpx;
  right: 20rpx;
  width: 56rpx;
  height: 56rpx;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 28rpx;
}

.modal-body {
  padding: 32rpx;
}

.modal-name {
  display: block;
  font-size: 36rpx;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 12rpx;
}

.modal-desc {
  display: block;
  font-size: 26rpx;
  color: #6b7280;
  line-height: 1.6;
  margin-bottom: 32rpx;
}

.modal-details {
  background: #f9fafb;
  border-radius: 16rpx;
  padding: 20rpx;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16rpx 0;
  border-bottom: 2rpx solid #f3f4f6;
}

.detail-row:last-child {
  border-bottom: none;
}

.detail-label {
  font-size: 26rpx;
  color: #6b7280;
}

.detail-value {
  font-size: 26rpx;
  color: #1f2937;
  font-weight: 500;
}

.detail-value.points {
  display: flex;
  align-items: center;
  color: #f59e0b;
  font-weight: 700;
}

.value-icon {
  font-size: 24rpx;
  margin-right: 4rpx;
}

.modal-footer {
  padding: 0 32rpx 32rpx;
}

.exchange-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border-radius: 50rpx;
  padding: 28rpx;
  gap: 12rpx;
}

.exchange-btn.disabled {
  background: #d1d5db;
}

.btn-icon {
  font-size: 32rpx;
}

.btn-text {
  color: #ffffff;
  font-size: 30rpx;
  font-weight: 600;
}

/* 兑换成功弹窗 */
.success-modal {
  background: #ffffff;
  border-radius: 32rpx;
  padding: 60rpx 40rpx 40rpx;
  text-align: center;
  max-width: 400rpx;
  width: 100%;
  animation: successSlideIn 0.4s ease-out;
}

@keyframes successSlideIn {
  0% { opacity: 0; transform: scale(0.9); }
  100% { opacity: 1; transform: scale(1); }
}

.success-icon-wrapper {
  width: 120rpx;
  height: 120rpx;
  background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 32rpx;
}

.success-icon {
  font-size: 64rpx;
}

.success-title {
  display: block;
  font-size: 36rpx;
  font-weight: 700;
  color: #059669;
  margin-bottom: 16rpx;
}

.success-desc {
  display: block;
  font-size: 26rpx;
  color: #6b7280;
  line-height: 1.5;
  margin-bottom: 40rpx;
}

.success-btn {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border-radius: 50rpx;
  padding: 24rpx 48rpx;
}

.success-btn text {
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 600;
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
  opacity: 1;
  filter: grayscale(0%) brightness(1.1) saturate(1);
}

.tabbar-item:not(.active) .tabbar-icon {
  opacity: 0.6;
  filter: grayscale(30%) saturate(0.7);
}

.tabbar-label {
  font-size: 20rpx;
  color: #9ca3af;
  transition: all 0.3s ease;
}

@media (max-width: 768px) {
  .content-wrapper {
    padding: 0 20rpx;
    margin-top: -28rpx;
  }

  .points-card {
    padding: 24rpx;
  }

  .points-icon-wrapper {
    width: 72rpx;
    height: 72rpx;
    margin-right: 16rpx;
  }

  .category-tabs {
    padding: 10rpx;
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

  .section-header {
    flex-wrap: wrap;
    gap: 8rpx;
    margin-bottom: 16rpx;
  }

  .section-title {
    font-size: 28rpx;
  }

  .recommend-loading-text {
    font-size: 22rpx;
    text-align: center;
    line-height: 1.5;
  }

  .products-grid {
    gap: 18rpx;
  }

  .product-image-wrapper {
    height: 280rpx;
  }

  .product-info {
    padding: 18rpx;
  }

  .product-name {
    font-size: 26rpx;
  }

  .product-desc {
    font-size: 22rpx;
  }
}

@media (max-width: 420px) {
  .content-wrapper {
    padding: 0 16rpx;
  }

  .points-card {
    padding: 20rpx;
  }

  .tab-item {
    min-width: 96rpx;
    padding: 14rpx 8rpx;
  }

  .product-image-wrapper {
    height: 240rpx;
  }

  .product-badge {
    font-size: 18rpx;
    padding: 4rpx 10rpx;
  }
}


@keyframes iconBounce {
  0% { transform: scale(1) translateY(0); }
  40% { transform: scale(1.2) translateY(-8rpx); }
  70% { transform: scale(1.1) translateY(-2rpx); }
  100% { transform: scale(1.15) translateY(-4rpx); }
}
</style>


