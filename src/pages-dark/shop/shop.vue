<template>
  <view class="shop-bg">
    <!-- 鑷畾涔夌姸鎬佹爮 -->
    <view class="custom-statusbar"></view>
    
    <!-- 绉戞妧鑳屾櫙鍔ㄦ晥鍏冪礌 -->
    <view class="tech-bg">
      <view class="tech-grid"></view>
      <view class="floating-particles">
        <view class="particle" v-for="n in 6" :key="n" :style="getParticleStyle(n)"></view>
      </view>
    </view>
    
    <!-- 涓昏鍐呭鍖哄煙 -->
    <view class="shop-container">
      <!-- 椤甸潰鏍囬 -->
      <view class="page-title">
        <view class="title-decoration">
          <view class="title-line left"></view>
          <view class="title-icon">馃泹锔?</view>
          <view class="title-line right"></view>
        </view>
        <text class="title-text">绉垎鍟嗗煄</text>
        <text class="title-subtitle">Points Mall</text>
        <view class="title-glow"></view>
      </view>
      
      <!-- 椤堕儴绉垎淇℃伅 -->
      <view class="points-header">
        <view class="points-card">
          <view class="points-icon">馃拵</view>
          <view class="points-info">
            <text class="points-label">鎴戠殑绉垎</text>
            <text class="points-value" v-if="!loading">{{ userPoints }}</text>
            <view class="loading-dots" v-else>
              <text class="dot"></text>
              <text class="dot"></text>
              <text class="dot"></text>
            </view>
          </view>
          <view class="points-refresh" @click="refreshPoints" :class="{ rotating: loading }">
            <text class="refresh-icon">鈾伙笍</text>
          </view>
          <view class="points-glow"></view>
        </view>
        <view class="points-tips">
          <text class="tip-icon">馃挕</text>
          <text class="tip-text">姣忔鍨冨溇璇嗗埆鍙幏寰?-3绉垎</text>
        </view>
      </view>
      
      <!-- 鍟嗗搧鍒嗙被閫夐」鍗?-->
      <view class="category-tabs">
        <view 
          v-for="(category, index) in categories" 
          :key="index"
          :class="['tab-item', { active: currentCategory === index }]"
          @click="switchCategory(index)"
        >
          <text class="tab-icon">{{ category.icon }}</text>
          <text class="tab-text">{{ category.name }}</text>
        </view>
      </view>
      
      <!-- 鍟嗗搧鍒楄〃 -->
      <view class="products-section">
        <view class="section-title">
          <text class="title-icon">{{ selectedCategory.icon }}</text>
          <text class="title-text">{{ displayCategoryTitle }}</text>
          <text class="product-count">({{ filteredProducts.length }}浠跺晢鍝?</text>
        </view>

        <view v-if="isRecommendCategory && recommendLoading" class="recommend-loading-mask">
          <text class="recommend-loading-text">AI 正在生成推荐，请稍候...</text>
        </view>
        
        <view class="products-grid">
          <view 
            v-for="product in filteredProducts" 
            :key="product.id"
            class="product-card"
            @click="showProductDetail(product)"
          >
            <view class="product-image-container">
              <image :src="product.image" class="product-image" mode="aspectFill" />
              <view v-if="isRecommendCategory" class="product-badge ai">AI推荐</view>
              <view v-if="product.hot" class="product-badge hot">馃敟 鐑棬</view>
              <view v-if="product.limited" class="product-badge limited">鈿?闄愰噺</view>
            </view>
            
            <view class="product-info">
              <text class="product-name">{{ product.name }}</text>
              <text class="product-desc">{{ product.description }}</text>
              
              <view class="product-footer">
                <view class="product-price">
                  <text class="price-icon">馃拵</text>
                  <text class="price-value">{{ product.points }}</text>
                </view>
                <view class="product-stock">
                  <text class="stock-text">搴撳瓨: {{ product.stock }}</text>
                </view>
              </view>
            </view>
            
            <view class="product-glow"></view>
          </view>
        </view>
      </view>
    </view>
    
    <!-- 鍟嗗搧璇︽儏寮圭獥 -->
    <view v-if="showDetailModal" class="detail-modal-overlay" @click="closeProductDetail">
      <view class="detail-modal" @click.stop="">
        <view class="modal-header">
          <image :src="selectedProduct.image" class="modal-product-image" mode="aspectFill" />
          <view class="modal-close" @click="closeProductDetail">鉁?</view>
          <view class="modal-image-glow"></view>
        </view>
        
        <view class="modal-content">
          <view class="modal-product-info">
            <text class="modal-product-name">{{ selectedProduct.name }}</text>
            <text class="modal-product-desc">{{ selectedProduct.description }}</text>
            
            <view class="modal-product-details">
              <view class="detail-item">
                <text class="detail-label">鎵€闇€绉垎:</text>
                <view class="detail-price">
                  <text class="price-icon">馃拵</text>
                  <text class="price-value">{{ selectedProduct.points }}</text>
                </view>
              </view>
              
              <view class="detail-item">
                <text class="detail-label">鍓╀綑搴撳瓨:</text>
                <text class="detail-value">{{ selectedProduct.stock }}浠?</text>
              </view>
              
              <view class="detail-item">
                <text class="detail-label">鍟嗗搧鐗圭偣:</text>
                <text class="detail-value">{{ selectedProduct.features }}</text>
              </view>
            </view>
          </view>
        </view>
        
        <view class="modal-footer">
          <view class="exchange-info">
            <text class="exchange-note">鍏戞崲鍚庣Н鍒嗗皢浠庤处鎴锋墸闄?</text>
          </view>
          <view 
            :class="['exchange-btn', { disabled: !canExchange }]"
            @click="exchangeProduct"
          >
            <text class="btn-icon">馃巵</text>
            <text class="btn-text">{{ userPoints >= selectedProduct.points ? (selectedProduct.stock > 0 ? '绔嬪嵆鍏戞崲' : '搴撳瓨涓嶈冻') : '绉垎涓嶈冻' }}</text>
          </view>
        </view>
        
        <view class="modal-glow"></view>
      </view>
    </view>
    
    <!-- 鍏戞崲鎴愬姛鎻愮ず寮圭獥 -->
    <view v-if="showSuccessModal" class="success-modal-overlay" @click="closeSuccessModal">
      <view class="success-modal" @click.stop="">
        <view class="success-animation">
          <view class="success-icon">馃帀</view>
          <view class="success-circle"></view>
        </view>
        <text class="success-title">鍏戞崲鎴愬姛锛?</text>
        <text class="success-desc">{{ exchangedProduct.name }} 宸叉坊鍔犲埌鎮ㄧ殑濂栧搧搴?</text>
        <view class="success-btn" @click="closeSuccessModal">
          <text class="success-btn-text">鏌ョ湅鎴戠殑濂栧搧</text>
        </view>
      </view>
    </view>
    
    <!-- 搴曢儴瀵艰埅鏍?-->
    <view class="tabbar">
      <view class="tabbar-item" @click="goHome">
        <text class="tabbar-icon">馃彔</text>
        <text class="tabbar-label">棣栭〉</text>
      </view>
      <view class="tabbar-item" @click="goMap">
        <text class="tabbar-icon">馃椇锔?</text>
        <text class="tabbar-label">鍦板浘</text>
      </view>
      <view class="tabbar-item active">
        <text class="tabbar-icon">馃泹锔?</text>
        <text class="tabbar-label">鍟嗗煄</text>
      </view>
      <view class="tabbar-item" @click="goProfile">
        <text class="tabbar-icon">馃懁</text>
        <text class="tabbar-label">鎴戠殑</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { userinfo } from '@/api/user'
import { fetchShopRecommendations } from '@/api/shop'
import {
  SHOP_RECOMMEND_LIMIT,
  buildCandidateProducts,
  filterProductsByRecommendation,
  getFallbackRecommendedNames,
  normalizeRecommendationResult,
  orderProductsByRecommendation
} from '@/utils/shop-recommendation'

// 响应式数据
const userPoints = ref(0)
const loading = ref(false)
const currentCategory = ref(0)
const showDetailModal = ref(false)
const showSuccessModal = ref(false)
const selectedProduct = ref({})
const exchangedProduct = ref({})
const recommendLoading = ref(false)
const recommendReady = ref(false)
const recommendSource = ref('rule-dom')
const recommendedNames = ref([])

// 鍟嗗搧鍒嗙被
const categories = ref([
  { name: '✨ 猜您喜欢', icon: '✨', type: 'recommend' },
  { name: '全部', icon: '🛍️', type: 'all' },
  { name: '环保用品', icon: '🌿', type: 'category', categoryId: 1 },
  { name: '数码配件', icon: '📱', type: 'category', categoryId: 2 },
  { name: '生活用品', icon: '🏠', type: 'category', categoryId: 3 },
  { name: '学习用品', icon: '📚', type: 'category', categoryId: 4 },
  { name: '美食券', icon: '🍜', type: 'category', categoryId: 5 }
])

// 模拟商品数据
const products = ref([
  // 鐜繚鐢ㄥ搧
  {
    id: 1,
    name: '环保购物袋',
    description: '鍙噸澶嶄娇鐢ㄧ殑鐜繚琚嬶紝鍑忓皯濉戞枡姹℃煋',
    image: 'https://image.made-in-china.com/226f3j00UTjleWhIhYoJ/Landscape-Recycle-Shopping-Bag.jpg',
    points: 50,
    stock: 10,
    category: 1,
    hot: true,
    features: '闃叉按鑰愮敤锛屽彲鎶樺彔鏀剁撼锛屾壙閲?0kg'
  },
  {
    id: 2,
    name: '绔瑰埗椁愬叿濂楄',
    description: '澶╃劧绔瑰埗锛岀幆淇濆仴搴风殑椁愬叿濂楄',
    image: 'https://gimg2.baidu.com/image_search/src=http%3A%2F%2Fcbu01.alicdn.com%2Fimg%2Fibank%2F2019%2F410%2F976%2F12755679014_1810685200.jpg&refer=http%3A%2F%2Fcbu01.alicdn.com&app=2002&size=f9999,10000&q=a80&n=0&g=0n&fmt=auto?sec=1760634083&t=513c5b5d5a41f80b92a119763c25a5b5',
    points: 120,
    stock: 2,
    category: 1,
    features: '天然抗菌，轻便易携带，包含筷勺叉'
  },
  {
    id: 3,
    name: '澶槼鑳藉厖鐢靛疂',
    description: '缁胯壊鑳芥簮锛岄殢鏃堕殢鍦颁负璁惧鍏呯數',
    image: 'https://gimg2.baidu.com/image_search/src=http%3A%2F%2Fcbu01.alicdn.com%2Fimg%2Fibank%2FO1CN01IxpKK61cUg42XsnKB_%21%216000000003604-0-cib.jpg&refer=http%3A%2F%2Fcbu01.alicdn.com&app=2002&size=f9999,10000&q=a80&n=0&g=0n&fmt=auto?sec=1760634273&t=d300edc54451f9aa092378e6bbd8dc02',
    points: 300,
    stock: 1,
    category: 1,
    limited: true,
    features: '10000mAh瀹归噺锛孖P65闃叉按锛屽弻USB杈撳嚭'
  },
  
  // 鏁扮爜閰嶄欢
  {
    id: 4,
    name: '鏃犵嚎钃濈墮鑰虫満',
    description: '高品质音效，佩戴舒适',
    image: 'https://gimg2.baidu.com/image_search/src=http%3A%2F%2Fcbu01.alicdn.com%2Fimg%2Fibank%2FO1CN01ARkqoe1lp8bxmr56x_%21%212207796144867-0-cib.jpg&refer=http%3A%2F%2Fcbu01.alicdn.com&app=2002&size=f9999,10000&q=a80&n=0&g=0n&fmt=auto?sec=1772604226&t=71875439063552b8fc4046a5bd82cece',
    points: 200,
    stock: 1,
    category: 2,
    limited: true,
    features: '降噪功能，续航8小时，快速充电'
  },
  {
    id: 5,
    name: '鎵嬫満鏀灦',
    description: '多角度调节，稳固不倒',
    image: 'https://gimg2.baidu.com/image_search/src=http%3A%2F%2Fimg.alicdn.com%2Fimgextra%2Fi3%2F91569647%2FO1CN01OquyGx2L8Nq5vUJJV_%21%2191569647.jpg&refer=http%3A%2F%2Fimg.alicdn.com&app=2002&size=f9999,10000&q=a80&n=0&g=0n&fmt=auto?sec=1760634468&t=daac5fec3acce16483095a3ffd96d104',
    points: 80,
    stock: 2,
    category: 2,
    hot: true,
    features: '铝合金材质，兼容4-10寸设备，可折叠'
  },
  {
    id: 6,
    name: '无线充电器',
    description: '蹇厖鎶€鏈紝鍛婂埆绾挎潗鏉熺細',
    image: 'https://gimg2.baidu.com/image_search/src=http%3A%2F%2Fcbu01.alicdn.com%2Fimg%2Fibank%2FO1CN014SwRCT1pepuKwekC3_%21%213686345386-0-cib.jpg&refer=http%3A%2F%2Fcbu01.alicdn.com&app=2002&size=f9999,10000&q=a80&n=0&g=0n&fmt=auto?sec=1760634522&t=5a627de7988d9f0c7e4eb95fd06fe510',
    points: 150,
    stock: 1,
    category: 2,
    features: '15W蹇厖锛屾櫤鑳借瘑鍒紝杩囩儹淇濇姢'
  },
  
  // 鐢熸椿鐢ㄥ搧
  {
    id: 7,
    name: '淇濇俯姘存澂',
    description: '316涓嶉攬閽紝24灏忔椂淇濇俯',
    image: 'https://static.airchina.com.cn/upload/t/ZmcLYCAzi6SjZv_Ye4NMk7k57SI=/670x670/img/store/296/1710832561739.jpg',
    points: 100,
    stock: 1,
    category: 3,
    features: '500ml容量，防漏设计，易清洗'
  },
  {
    id: 8,
    name: '香薰加湿器',
    description: '鍑€鍖栫┖姘旓紝鑸掔紦蹇冩儏',
    image: 'https://aimg8.dlssyht.cn/u/2061934/ueditor/image/1031/2061934/1736233837447324.jpg',
    points: 180,
    stock: 1,
    category: 3,
    limited: true,
    features: '超声波技术，7色氛围灯，定时功能'
  },
  
  // 瀛︿範鐢ㄥ搧
  {
    id: 9,
    name: '澶氬姛鑳界瑪璁版湰',
    description: '高质量纸张，多种规格可选',
    image: 'https://gimg2.baidu.com/image_search/src=http%3A%2F%2Fcbu01.alicdn.com%2Fimg%2Fibank%2FO1CN01GmVcgy1udzaV88fGu_%21%212211693156061-0-cib.jpg&refer=http%3A%2F%2Fcbu01.alicdn.com&app=2002&size=f9999,10000&q=a80&n=0&g=0n&fmt=auto?sec=1760634668&t=de5741858f3adee222381a7c22ee5bc8',
    points: 30,
    stock: 5,
    category: 4,
    features: 'A5尺寸，80页，方格/横线可选'
  },
  {
    id: 10,
    name: '鎶ょ溂鍙扮伅',
    description: 'LED护眼，智能调光',
    image: 'https://img0.baidu.com/it/u=2083889578,895933530&fm=253&fmt=auto&app=138&f=JPEG?w=825&h=500',
    points: 250,
    stock: 1,
    category: 4,
    limited: true,
    features: '无频闪，色温调节，触控开关'
  },
  
  // 缇庨鍒?
  {
    id: 11,
    name: '鏄熷反鍏嬪挅鍟″埜',
    description: '浠绘剰楗搧閫氱敤鍒革紝鏈夋晥鏈?涓湀',
    image: 'https://p6.itc.cn/q_70/images01/20210903/15249c7e53fb43d1bff2f80175dac604.jpeg',
    points: 80,
    stock: 5,
    category: 5,
    hot: true,
    features: '鍏ㄥ浗闂ㄥ簵閫氱敤锛屽彲鍙犲姞浣跨敤'
  },
  {
    id: 12,
    name: '鑲痉鍩哄椁愬埜',
    description: '指定套餐优惠券，美味不停',
    image: 'https://p6.itc.cn/q_70/images03/20211204/92f834b2ea8a4cb7b9bb993602b42279.jpeg',
    points: 120,
    stock: 0,
    category: 5,
    features: '澶氱濂楅鍙€夛紝閮ㄥ垎闂ㄥ簵閫傜敤'
  }
])

// 妫€娴嬪钩鍙扮被鍨?
onMounted(async () => {
  // 鑾峰彇绯荤粺鐘舵€佹爮楂樺害
  let statusBarHeight = 0
  try {
    const windowInfo = uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()
    statusBarHeight = windowInfo.statusBarHeight || 0
  } catch (e) {
    const systemInfo = uni.getSystemInfoSync()
    statusBarHeight = systemInfo.statusBarHeight || 0
  }
  
  // 璁剧疆CSS鍙橀噺
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.style.setProperty('--status-bar-height', statusBarHeight + 'px')
  }
  
  // 鑾峰彇鐢ㄦ埛鐪熷疄绉垎鏁版嵁
  await fetchUserPoints()
  if (currentCategory.value === 0) {
    await ensureRecommendations()
  }
})

// 鑾峰彇鐢ㄦ埛绉垎淇℃伅
const fetchUserPoints = async () => {
  try {
    loading.value = true
    const token = uni.getStorageSync('token')
    if (!token) {
      userPoints.value = '未登录'
      return
    }
    
    const response = await userinfo()
    if (response.code === 0) {
      userPoints.value = response.data.points || 0
      console.log('鑾峰彇鐢ㄦ埛绉垎鎴愬姛:', userPoints.value)
    } else {
      console.error('鑾峰彇鐢ㄦ埛绉垎澶辫触:', response.msg)
      // 浣跨敤鏈湴瀛樺偍鐨勭Н鍒嗕綔涓哄鐢?
      const storedPoints = uni.getStorageSync('userPoints')
      userPoints.value = storedPoints || 0
    }
  } catch (error) {
    console.error('璇锋眰鐢ㄦ埛绉垎鍑洪敊:', error)
    // 缃戠粶閿欒鏃朵娇鐢ㄦ湰鍦板瓨鍌ㄧ殑绉垎
    const storedPoints = uni.getStorageSync('userPoints')
    userPoints.value = storedPoints || 0
    
    uni.showToast({
      title: '积分数据获取失败，显示缓存数据',
      icon: 'none',
      duration: 2000
    })
  } finally {
    loading.value = false
  }
}

// 鍒锋柊鐢ㄦ埛绉垎
const refreshPoints = async () => {
  await fetchUserPoints()
  if (!loading.value) {
    uni.showToast({
      title: '绉垎鍒锋柊鎴愬姛',
      icon: 'success',
      duration: 1500
    })
  }
}

// 璁＄畻灞炴€э細杩囨护鍟嗗搧
const isRecommendCategory = computed(() => {
  const current = categories.value[currentCategory.value]
  return !!(current && current.type === 'recommend')
})

const selectedCategory = computed(() => {
  return categories.value[currentCategory.value] || categories.value[0] || { icon: '🛍️', name: '全部', type: 'all' }
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
    recommendedNames.value = Array.isArray(normalized.names) ? normalized.names : []
    recommendSource.value = normalized.source || 'rule-dom'
    recommendReady.value = true
  } catch (_) {
    recommendedNames.value = getFallbackRecommendedNames(products.value, userPoints.value, SHOP_RECOMMEND_LIMIT)
    recommendSource.value = 'rule-dom'
    recommendReady.value = true
  } finally {
    recommendLoading.value = false
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
  return products.value.filter(product => product.category === current.categoryId)
})

// 璁＄畻灞炴€э細鏄惁鍙互鍏戞崲
const canExchange = computed(() => {
  return userPoints.value >= selectedProduct.value.points && selectedProduct.value.stock > 0
})

// 鐢熸垚绮掑瓙鍔ㄧ敾鏍峰紡
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

// 鍒囨崲鍟嗗搧鍒嗙被
const switchCategory = async (index) => {
  currentCategory.value = index
  if (categories.value[index] && categories.value[index].type === 'recommend') {
    await ensureRecommendations()
  }
}

// 鏄剧ず鍟嗗搧璇︽儏
const showProductDetail = (product) => {
  selectedProduct.value = product
  showDetailModal.value = true
}

// 鍏抽棴鍟嗗搧璇︽儏
const closeProductDetail = () => {
  showDetailModal.value = false
  selectedProduct.value = {}
}

// 鍏戞崲鍟嗗搧
const exchangeProduct = async () => {
  if (!canExchange.value) {
    uni.showToast({
      title: '积分不足或商品售罄',
      icon: 'none'
    })
    return
  }
  
  // 鎵ｉ櫎绉垎
  userPoints.value -= selectedProduct.value.points
  
  // 鍑忓皯搴撳瓨
  const productIndex = products.value.findIndex(p => p.id === selectedProduct.value.id)
  if (productIndex !== -1) {
    products.value[productIndex].stock -= 1
  }
  
  // 淇濆瓨绉垎鍒版湰鍦板瓨鍌紙浣滀负缂撳瓨锛?
  uni.setStorageSync('userPoints', userPoints.value)
  
  // 璁板綍鍏戞崲鐨勫晢鍝?
  exchangedProduct.value = { ...selectedProduct.value }
  
  // 鍏抽棴璇︽儏寮圭獥锛屾樉绀烘垚鍔熷脊绐?
  showDetailModal.value = false
  showSuccessModal.value = true
  
  // 妯℃嫙淇濆瓨鍒板厬鎹㈣褰?
  const exchangeRecord = {
    id: Date.now(),
    product: exchangedProduct.value,
    exchangeTime: new Date().toLocaleString(),
    status: '已兑换'
  }
  
  let exchangeHistory = uni.getStorageSync('exchangeHistory') || []
  exchangeHistory.unshift(exchangeRecord)
  uni.setStorageSync('exchangeHistory', exchangeHistory)
  
  // 鍏戞崲鎴愬姛鍚庡埛鏂扮Н鍒嗘暟鎹紙纭繚涓庢湇鍔″櫒鍚屾锛?//   setTimeout(() => {
//     fetchUserPoints()
//   }, 1000)
}

// 鍏抽棴鍏戞崲鎴愬姛寮圭獥
const closeSuccessModal = () => {
  showSuccessModal.value = false
  exchangedProduct.value = {}
  // 鍙互璺宠浆鍒板鍝侀〉闈?  // uni.navigateTo({ url: '/pages-dark/rewards/rewards' })
}

// 椤甸潰璺宠浆
const goHome = () => {
  uni.redirectTo({ url: '/pages-dark/home/home' })
}
const goMap = () => {
  uni.redirectTo({ url: '/pages-dark/map/map' })
}
const goProfile = () => {
  uni.redirectTo({ url: '/pages-dark/profile/profile' })
}
</script>

<style scoped>
/* 涓昏儗鏅?*/
.shop-bg {
  min-height: 100vh;
  background: linear-gradient(135deg, #0a0e27 0%, #1a1f3a 25%, #2d1b69 50%, #0f0f23 100%);
  position: relative;
  overflow: hidden;
}

/* 鑷畾涔夌姸鎬佹爮 */
.custom-statusbar {
  height: var(--status-bar-height);
  background: transparent;
  position: relative;
  z-index: 10;
}

/* 绉戞妧鑳屾櫙鍏冪礌 */
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

/* 娴姩绮掑瓙 */
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

/* 涓诲鍣?*/
.shop-container {
  position: relative;
  z-index: 2;
  padding: 20rpx 32rpx 140rpx 32rpx;
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - var(--status-bar-height));
}

/* 椤甸潰鏍囬 */
.page-title {
  position: relative;
  text-align: center;
  margin-bottom: 2rpx;
  padding: 16rpx 0;
  overflow: hidden;
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
  font-size: 36rpx;
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
  font-size: 44rpx;
  font-weight: 800;
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
  font-size: 34rpx;
  color: rgba(255, 255, 255, 0.7);
  font-weight: 400;
  letter-spacing: 2rpx;
  text-transform: uppercase;
  opacity: 0.8;
  animation: titleSubtitleFade 2s ease-in-out infinite alternate;
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

/* 椤堕儴绉垎淇℃伅 */
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

/* 绉垎鍔犺浇鍔ㄧ敾 */
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

/* 鍒锋柊鎸夐挳 */
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
  font-size: 32rpx;
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

/* 鍒嗙被閫夐」鍗?*/
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

/* 鍟嗗搧鍖哄煙 */
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

.title-icon {
  font-size: 36rpx;
  margin-right: 16rpx;
  filter: drop-shadow(0 0 12rpx rgba(64, 224, 255, 0.6));
}

.title-text {
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

/* 鍟嗗搧缃戞牸 */
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

/* 鍟嗗搧璇︽儏寮圭獥 */
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

/* 鍏戞崲鎴愬姛寮圭獥 */
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

/* 搴曢儴瀵艰埅鏍?*/
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
  font-size: 48rpx;
  margin-bottom: 8rpx;
  filter: drop-shadow(0 0 8px rgba(64, 224, 255, 0.3));
}

.tabbar-item.active .tabbar-icon {
  filter: drop-shadow(0 0 12px rgba(64, 224, 255, 0.8));
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

  .products-grid {
    grid-template-columns: 1fr;
    gap: 18rpx;
  }

  .product-image-container {
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



