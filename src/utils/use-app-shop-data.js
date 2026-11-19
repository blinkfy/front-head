import { ref, shallowRef } from 'vue'
import { fetchShopProducts } from '@/api/shop'
import { userinfo } from '@/api/user'
import { appShopCatalog, appShopPoints } from './app-shop-cache.mjs'
import { getAppCachedProfile } from './app-offline-session.js'

const currentOwner = () => uni.getStorageSync('token') || ''

function requireOwner(owner) {
  if (currentOwner() !== owner) throw new Error('登录状态已变更')
}

export function useAppShopData({ isDisposed, onDataChange, signedOutPoints = 0 }) {
  let owner = currentOwner()
  const products = shallowRef(appShopCatalog.peek(owner) ?? [])
  const userPoints = ref(appShopPoints.peek(owner) ?? (owner ? 0 : signedOutPoints))
  const catalogReady = ref(appShopCatalog.peek(owner) !== undefined)
  const productsLoading = ref(false), productsError = ref(''), loading = ref(false)
  let catalogRequest, pointsRequest

  function applyPoints(points) {
    if (userPoints.value !== points) onDataChange()
    userPoints.value = points
  }

  function syncOwner() {
    const token = currentOwner()
    if (token !== owner) {
      owner = token
      products.value = appShopCatalog.peek(owner) ?? []
      userPoints.value = appShopPoints.peek(owner) ?? (owner ? 0 : signedOutPoints)
      catalogReady.value = appShopCatalog.peek(owner) !== undefined
      productsError.value = ''
      productsLoading.value = loading.value = false
      catalogRequest = pointsRequest = null
      onDataChange()
    }
    return token
  }

  async function loadProducts(force) {
    const key = syncOwner()
    if (isDisposed()) return
    if (!key) {
      productsError.value = '请登录后查看商品'
      return
    }
    productsLoading.value = true
    productsError.value = ''
    const request = appShopCatalog.read(async () => {
      requireOwner(key)
      const response = await fetchShopProducts()
      const list = Array.isArray(response.data) ? response.data : response.data?.products
      if (!Array.isArray(list)) throw new Error('商品数据异常，请重试')
      return list.filter(product => product.status === 'active')
    }, { key, force })
    catalogRequest = request
    try {
      const list = await request
      if (isDisposed() || currentOwner() !== key || catalogRequest !== request) return
      if (products.value !== list) onDataChange()
      products.value = list
      catalogReady.value = true
    } catch (error) {
      if (!isDisposed() && currentOwner() === key && catalogRequest === request && !catalogReady.value) {
        productsError.value = error?.msg || error?.message || '商品加载失败，请重试'
      }
    } finally {
      if (catalogRequest === request) {
        catalogRequest = null
        if (!isDisposed()) productsLoading.value = false
      }
    }
  }

  async function fetchPoints(force) {
    const key = syncOwner()
    if (!key || isDisposed()) return false
    loading.value = force || appShopPoints.peek(key) === undefined
    const request = appShopPoints.read(async () => {
      requireOwner(key)
      const response = await userinfo('false', { silent: true })
      if (response.code !== 0) throw new Error(response.msg || '积分获取失败')
      return response.data.points || 0
    }, { key, force })
    pointsRequest = request
    try {
      const points = await request
      if (isDisposed() || currentOwner() !== key) return false
      if (pointsRequest === request) applyPoints(points)
      return true
    } catch (_) {
      if (!isDisposed() && currentOwner() === key && pointsRequest === request && appShopPoints.peek(key) === undefined) {
        applyPoints(getAppCachedProfile()?.points || 0)
      }
      return false
    } finally {
      if (pointsRequest === request) {
        pointsRequest = null
        if (!isDisposed()) loading.value = false
      }
    }
  }

  return { products, userPoints, catalogReady, productsLoading, productsError, loading, loadProducts, fetchPoints,
    refreshing: () => !!(catalogRequest || pointsRequest) }
}
