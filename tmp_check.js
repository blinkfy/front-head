
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
    name: '鐜繚璐墿琚?,
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
    features: '澶╃劧鎶楄弻锛岃交渚挎槗鎼哄甫锛屽寘鍚瀛愬嫼瀛愬弶瀛?
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
    description: '楂樺搧璐ㄩ煶鏁堬紝鑸掗€備僵鎴翠綋楠?,
    image: 'https://gimg2.baidu.com/image_search/src=http%3A%2F%2Fcbu01.alicdn.com%2Fimg%2Fibank%2FO1CN01ARkqoe1lp8bxmr56x_%21%212207796144867-0-cib.jpg&refer=http%3A%2F%2Fcbu01.alicdn.com&app=2002&size=f9999,10000&q=a80&n=0&g=0n&fmt=auto?sec=1772604226&t=71875439063552b8fc4046a5bd82cece',
    points: 200,
    stock: 1,
    category: 2,
    limited: true,
    features: '闄嶅櫔鍔熻兘锛岀画鑸?灏忔椂锛屽揩閫熷厖鐢?
  },
  {
    id: 5,
    name: '鎵嬫満鏀灦',
    description: '澶氳搴﹁皟鑺傦紝绋冲浐涓嶅€?,
    image: 'https://gimg2.baidu.com/image_search/src=http%3A%2F%2Fimg.alicdn.com%2Fimgextra%2Fi3%2F91569647%2FO1CN01OquyGx2L8Nq5vUJJV_%21%2191569647.jpg&refer=http%3A%2F%2Fimg.alicdn.com&app=2002&size=f9999,10000&q=a80&n=0&g=0n&fmt=auto?sec=1760634468&t=daac5fec3acce16483095a3ffd96d104',
    points: 80,
    stock: 2,
    category: 2,
    hot: true,
    features: '閾濆悎閲戞潗璐紝鍏煎4-10瀵歌澶囷紝鍙姌鍙?
  },
  {
    id: 6,
    name: '鏃犵嚎鍏呯數鍣?,
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
    features: '500ml瀹归噺锛岄槻婕忚璁★紝鏄撴竻娲?
  },
  {
    id: 8,
    name: '棣欒柊鍔犳箍鍣?,
    description: '鍑€鍖栫┖姘旓紝鑸掔紦蹇冩儏',
    image: 'https://aimg8.dlssyht.cn/u/2061934/ueditor/image/1031/2061934/1736233837447324.jpg',
    points: 180,
    stock: 1,
    category: 3,
    limited: true,
    features: '瓒呭０娉㈡妧鏈紝7鑹叉皼鍥寸伅锛屽畾鏃跺姛鑳?
  },
  
  // 瀛︿範鐢ㄥ搧
  {
    id: 9,
    name: '澶氬姛鑳界瑪璁版湰',
    description: '楂樿川閲忕焊寮狅紝澶氱瑙勬牸鍙€?,
    image: 'https://gimg2.baidu.com/image_search/src=http%3A%2F%2Fcbu01.alicdn.com%2Fimg%2Fibank%2FO1CN01GmVcgy1udzaV88fGu_%21%212211693156061-0-cib.jpg&refer=http%3A%2F%2Fcbu01.alicdn.com&app=2002&size=f9999,10000&q=a80&n=0&g=0n&fmt=auto?sec=1760634668&t=de5741858f3adee222381a7c22ee5bc8',
    points: 30,
    stock: 5,
    category: 4,
    features: 'A5灏哄锛?80椤碉紝鏂规牸/妯嚎鍙€?
  },
  {
    id: 10,
    name: '鎶ょ溂鍙扮伅',
    description: 'LED鎶ょ溂锛屾櫤鑳借皟鍏?,
    image: 'https://img0.baidu.com/it/u=2083889578,895933530&fm=253&fmt=auto&app=138&f=JPEG?w=825&h=500',
    points: 250,
    stock: 1,
    category: 4,
    limited: true,
    features: '鏃犻闂紝鑹叉俯璋冭妭锛岃Е鎺у紑鍏?
  },
  
  // 缇庨鍒?  {
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
    description: '鎸囧畾濂楅浼樻儬鍒革紝缇庡懗浜笉鍋?,
    image: 'https://p6.itc.cn/q_70/images03/20211204/92f834b2ea8a4cb7b9bb993602b42279.jpeg',
    points: 120,
    stock: 0,
    category: 5,
    features: '澶氱濂楅鍙€夛紝閮ㄥ垎闂ㄥ簵閫傜敤'
  }
])

// 妫€娴嬪钩鍙扮被鍨?onMounted(async () => {
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
      userPoints.value = '鏈櫥褰?
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
      title: '绉垎鏁版嵁鑾峰彇澶辫触锛屾樉绀虹紦瀛樻暟鎹?,
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
      title: '绉垎涓嶈冻鎴栧晢鍝佸敭缃?,
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
    status: '宸插厬鎹?
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

