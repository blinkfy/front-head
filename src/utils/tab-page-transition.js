import { ref } from 'vue'
import { onHide, onReady, onShow, onUnload } from '@dcloudio/uni-app'

const STORAGE_KEY = 'bottomTabTransition'
const TAB_POSITIONS = { home: 0, map: 1, shop: 2, profile: 3 }
const TRANSITION_DURATION = 180
// #ifdef APP-PLUS
import { createAppMapTabCache } from './app-map-retention.mjs'
const appMapTabCache = createAppMapTabCache()
// #endif

// #ifdef H5
import { markH5PagePreloaded } from './h5-page-preload-state.mjs'
const TAB_PAGE_LOADERS = {
  'pages/home/home': () => import('@/pages/home/home.vue'),
  'pages/map/map': () => import('@/pages/map/map.vue'),
  'pages/shop/shop': () => import('@/pages/shop/shop.vue'),
  'pages/profile/profile': () => import('@/pages/profile/profile.vue'),
  'pages-dark/home/home': () => import('@/pages-dark/home/home.vue'),
  'pages-dark/map/map': () => import('@/pages-dark/map/map.vue'),
  'pages-dark/shop/shop': () => import('@/pages-dark/shop/shop.vue'),
  'pages-dark/profile/profile': () => import('@/pages-dark/profile/profile.vue')
}
const preloadedTabRoutes = new Map()
// #endif

function normalizeRoute(url = '') {
  return String(url).split('?')[0].replace(/^\//, '')
}

export function preloadTabPage(url) {
  // #ifdef H5
  const route = normalizeRoute(url)
  const loadPage = TAB_PAGE_LOADERS[route]
  if (!loadPage) return Promise.resolve()
  if (!preloadedTabRoutes.has(route)) {
    const request = loadPage().then(page => {
      markH5PagePreloaded(route)
      return page
    }).catch(error => {
      preloadedTabRoutes.delete(route)
      throw error
    })
    preloadedTabRoutes.set(route, request)
  }
  return preloadedTabRoutes.get(route)
  // #endif
}

export function preloadSiblingTabPages(currentRoute) {
  // #ifdef H5
  const isDarkTheme = currentRoute.startsWith('pages-dark/')
  const themePrefix = isDarkTheme ? 'pages-dark/' : 'pages/'
  if (!TAB_PAGE_LOADERS[currentRoute]) return

  const preload = () => {
    Object.keys(TAB_PAGE_LOADERS).forEach(route => {
      if (route === currentRoute || !route.startsWith(themePrefix) || preloadedTabRoutes.has(route)) return
      void preloadTabPage(route).catch(() => {})
    })
  }

  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(preload, { timeout: 800 })
  } else {
    setTimeout(preload, 250)
  }
  // #endif
}

export function getPendingTabTransition(url) {
  if (typeof uni === 'undefined') return null

  const transition = uni.getStorageSync(STORAGE_KEY)
  let maxAge = 2000
  // #ifdef MP-WEIXIN
  // 首次打开分包可能超过两秒，不能在目标页就绪前丢弃动画。
  maxAge = 10000
  // #endif
  if (!transition || !['left', 'right'].includes(transition.direction) || Date.now() - transition.createdAt > maxAge) return null
  if (url && transition.targetRoute !== normalizeRoute(url)) return null
  return transition
}

export function navigateBottomTab(from, to, url, method = 'redirectTo') {
  if (typeof uni === 'undefined' || from === to) return

  const fromPosition = TAB_POSITIONS[from]
  const toPosition = TAB_POSITIONS[to]
  const targetRoute = normalizeRoute(url)
  if (fromPosition === undefined || toPosition === undefined || !targetRoute) return

  uni.setStorageSync(STORAGE_KEY, {
    targetRoute,
    direction: toPosition > fromPosition ? 'left' : 'right',
    createdAt: Date.now()
  })

  // #ifdef APP-PLUS
  const plan = appMapTabCache.navigation({ pages: getCurrentPages(), from, targetRoute,
    owner: uni.getStorageSync('token') || '', url: String(url) })
  if (plan) {
    if (plan.method === 'navigateBack') {
      // Reusing an earlier page must still follow tab order, not the native back direction.
      uni.navigateBack({ delta: plan.delta, animationType: toPosition > fromPosition ? 'slide-out-left' : 'slide-out-right',
        animationDuration: TRANSITION_DURATION, fail: () => { appMapTabCache.clear(); uni.reLaunch({ url }) } })
    } else {
      const animation = plan.method === 'navigateTo'
        ? { animationType: toPosition > fromPosition ? 'slide-in-right' : 'slide-in-left', animationDuration: TRANSITION_DURATION } : {}
      uni[plan.method]({ url, ...animation, fail: () => { appMapTabCache.clear(); uni.redirectTo({ url }) } })
    }
    return
  }
  // #endif
  const navigate = typeof uni[method] === 'function' ? uni[method] : uni.redirectTo
  navigate.call(uni, { url })
}

export function useTabPageTransition(pageRoute) {
  const tabPageClass = ref('')
  let transitionResetTimer = null

  const resetTransition = () => {
    clearTimeout(transitionResetTimer)
    transitionResetTimer = null
    tabPageClass.value = ''
  }

  onHide(resetTransition)
  onUnload(resetTransition)

  // #ifdef MP-WEIXIN
  // Set the class before the first render so the destination starts at the sliding offset.
  const transition = getPendingTabTransition(pageRoute)
  if (transition) {
    uni.removeStorageSync(STORAGE_KEY)
    tabPageClass.value = `tab-page-enter-${transition.direction}`
  }
  onReady(() => {
    if (tabPageClass.value) transitionResetTimer = setTimeout(resetTransition, TRANSITION_DURATION + 40)
  })
  // #endif

  // #ifndef MP-WEIXIN
  onShow(() => {
    if (typeof uni === 'undefined') return

    const currentRoute = pageRoute || getCurrentPages().slice(-1)[0]?.route || ''
    preloadSiblingTabPages(currentRoute)
    const transition = getPendingTabTransition(currentRoute)
    if (!transition) return

    uni.removeStorageSync(STORAGE_KEY)
    resetTransition()
    tabPageClass.value = `tab-page-enter-${transition.direction}`
    transitionResetTimer = setTimeout(resetTransition, TRANSITION_DURATION + 40)
  })
  // #endif

  return { tabPageClass }
}
