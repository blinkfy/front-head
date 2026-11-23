import { computed, onBeforeUnmount, ref } from 'vue'
import { userinfo } from '@/api/user'
import { fetchShopProducts, fetchShopRecommendations } from '@/api/shop'
import { useAppTabContext } from './app-tab-context.js'
import { getAppCachedProfile } from './app-offline-session.js'
import { useAppShopData } from './use-app-shop-data.js'
import {
  SHOP_RECOMMEND_LIMIT,
  buildCandidateProducts,
  filterProductsByRecommendation,
  getFallbackRecommendedNames,
  normalizeRecommendationResult,
  orderProductsByRecommendation
} from './shop-recommendation.js'

const currentToken = () => uni.getStorageSync('token') || ''

export function useShopPage({ signedOutPoints = 0, refreshSuccessText = '积分已刷新' } = {}) {
  const currentCategory = ref(0)
  const recommendLoading = ref(false)
  const recommendedNames = ref([])
  let pageDisposed = false
  let recommendReady = false
  let recommendationRequest = null
  let pointsRequest = 0
  let session = { token: currentToken(), knownPoints: undefined }

  function invalidateRecommendations() {
    recommendReady = false
    recommendedNames.value = []
  }

  const appShop = useAppTabContext() ? useAppShopData({
    isDisposed: () => pageDisposed,
    onDataChange: invalidateRecommendations,
    signedOutPoints
  }) : null
  const userPoints = appShop?.userPoints ?? ref(0)
  const loading = appShop?.loading ?? ref(false)
  const products = appShop?.products ?? ref([])
  const catalogReady = appShop?.catalogReady ?? false
  const productsLoading = appShop?.productsLoading ?? ref(false)
  const productsError = appShop?.productsError ?? ref('')

  const categories = ref([
    { name: '猜您喜欢', icon: 'ai_recommend', type: 'recommend' },
    { name: '全部', icon: 'category_all', type: 'all' },
    { name: '环保用品', icon: 'eco_products', type: 'category', categoryId: 1 },
    { name: '数码配件', icon: 'digital_accessories', type: 'category', categoryId: 2 },
    { name: '生活用品', icon: 'home_living', type: 'category', categoryId: 3 },
    { name: '学习用品', icon: 'learning_supplies', type: 'category', categoryId: 4 },
    { name: '美食券', icon: 'food_coupon', type: 'category', categoryId: 5 }
  ])
  const selectedCategory = computed(() => categories.value[currentCategory.value] || categories.value[0])
  const isRecommendCategory = computed(() => selectedCategory.value.type === 'recommend')
  const displayCategoryTitle = computed(() => isRecommendCategory.value ? 'AI推荐' : selectedCategory.value.name)

  onBeforeUnmount(() => { pageDisposed = true })

  function syncSession() {
    const token = currentToken()
    if (session.token !== token) {
      session = { token, knownPoints: undefined }
      invalidateRecommendations()
      recommendationRequest = null
      recommendLoading.value = false
      if (appShop) {
        appShop.syncOwner()
      } else {
        products.value = []
        userPoints.value = token ? 0 : signedOutPoints
        productsError.value = ''
        productsLoading.value = loading.value = false
      }
    }
    return session
  }

  function isCurrent(activeSession) {
    return !pageDisposed && session === activeSession && currentToken() === activeSession.token
  }

  async function loadProducts(force = true) {
    if (pageDisposed) return
    const activeSession = syncSession()
    if (appShop) {
      await appShop.loadProducts(force)
    } else {
      if (productsLoading.value) return
      productsLoading.value = true
      productsError.value = ''
      try {
        const response = await fetchShopProducts()
        if (!isCurrent(activeSession)) return
        const list = Array.isArray(response?.data) ? response.data : response?.data?.products
        if (!Array.isArray(list)) throw new Error('商品数据异常，请重试')
        products.value = list.filter(product => product.status === 'active')
        invalidateRecommendations()
      } catch (error) {
        if (isCurrent(activeSession)) productsError.value = error?.msg || error?.message || '商品加载失败，请重试'
      } finally {
        if (isCurrent(activeSession)) productsLoading.value = false
      }
    }
    if (force && isCurrent(activeSession) && isRecommendCategory.value) await ensureRecommendations()
  }

  function applyPoints(points) {
    if (userPoints.value !== points) invalidateRecommendations()
    userPoints.value = points
  }

  async function fetchPoints(force) {
    if (pageDisposed) return false
    const activeSession = syncSession()
    if (appShop) return appShop.fetchPoints(force)
    const request = ++pointsRequest
    const isLatest = () => isCurrent(activeSession) && request === pointsRequest
    if (!activeSession.token) {
      applyPoints(signedOutPoints)
      return false
    }

    loading.value = true
    let failureMessage = '积分获取失败，当前显示缓存数据'
    try {
      const response = await userinfo('false')
      if (!isLatest()) return false
      if (response.code === 0) {
        activeSession.knownPoints = response.data.points || 0
        applyPoints(activeSession.knownPoints)
        return true
      }
      failureMessage = response.msg || failureMessage
    } catch (error) {
      // #ifdef APP-PLUS
      if (error?.networkUnavailable) return false
      // #endif
    } finally {
      if (isLatest()) loading.value = false
    }

    if (!isLatest()) return false
    applyPoints(activeSession.knownPoints ?? getAppCachedProfile()?.points ?? 0)
    if (!force) uni.showToast({ title: failureMessage, icon: 'none' })
    return false
  }

  async function refreshShop() {
    if (pageDisposed) return
    const activeSession = syncSession()
    await Promise.all([fetchPoints(false), loadProducts(false)])
    if (isCurrent(activeSession) && isRecommendCategory.value) await ensureRecommendations()
  }

  async function refreshPoints() {
    if (pageDisposed) return
    const activeSession = syncSession()
    const success = await fetchPoints(true)
    if (!isCurrent(activeSession)) return
    if (isRecommendCategory.value) void ensureRecommendations()
    uni.showToast({
      title: success ? refreshSuccessText : '积分刷新失败，当前显示缓存数据',
      icon: success ? 'success' : 'none',
      duration: 1500
    })
  }

  async function ensureRecommendations() {
    if (pageDisposed) return
    const activeSession = syncSession()
    if (!isCurrent(activeSession) || !activeSession.token || !products.value.length) return
    if (recommendationRequest || recommendReady || (appShop ? appShop.refreshing() : loading.value || productsLoading.value)) return

    const request = { products: products.value, points: userPoints.value }
    const inputsChanged = () => products.value !== request.products || userPoints.value !== request.points
    recommendationRequest = request
    recommendLoading.value = true
    try {
      const apiResult = await fetchShopRecommendations({
        limit: SHOP_RECOMMEND_LIMIT,
        currentPoints: Number(request.points) || 0,
        candidateProducts: buildCandidateProducts(request.products)
      })

      if (!isCurrent(activeSession) || inputsChanged()) return
      const normalized = normalizeRecommendationResult(apiResult, request.products, request.points, SHOP_RECOMMEND_LIMIT)
      recommendedNames.value = Array.isArray(normalized.names) ? normalized.names : []
      recommendReady = true
    } catch (_) {
      if (!isCurrent(activeSession) || inputsChanged()) return
      recommendedNames.value = getFallbackRecommendedNames(request.products, request.points, SHOP_RECOMMEND_LIMIT)
      recommendReady = true
    } finally {
      if (recommendationRequest === request) {
        recommendationRequest = null
        if (!pageDisposed) {
          recommendLoading.value = false
          if (isCurrent(activeSession) && inputsChanged() && isRecommendCategory.value) void ensureRecommendations()
        }
      }
    }
  }

  function getProductsByRecommendedNames(names) {
    const matched = filterProductsByRecommendation(products.value, names)
    return orderProductsByRecommendation(matched, names).slice(0, SHOP_RECOMMEND_LIMIT)
  }

  const recommendProducts = computed(() => {
    const fromApi = getProductsByRecommendedNames(recommendedNames.value)
    if (fromApi.length) return fromApi
    const fallbackNames = getFallbackRecommendedNames(products.value, userPoints.value, SHOP_RECOMMEND_LIMIT)
    const fromFallback = getProductsByRecommendedNames(fallbackNames)
    return fromFallback.length ? fromFallback : products.value.slice(0, SHOP_RECOMMEND_LIMIT)
  })

  const filteredProducts = computed(() => {
    const current = selectedCategory.value
    if (current.type === 'recommend') return recommendProducts.value
    if (current.type === 'all') return products.value
    return products.value.filter(product => String(product.category) === String(current.categoryId) || product.category === current.name)
  })

  async function switchCategory(index) {
    currentCategory.value = index
    if (isRecommendCategory.value) await ensureRecommendations()
  }

  return {
    appShop, userPoints, loading, currentCategory, recommendLoading, recommendedNames, categories,
    catalogReady, productsLoading, productsError, isRecommendCategory, selectedCategory, displayCategoryTitle,
    filteredProducts, refreshShop, loadProducts, refreshPoints, switchCategory
  }
}
