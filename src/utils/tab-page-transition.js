import { ref } from 'vue'
import { onReady, onShow } from '@dcloudio/uni-app'

const STORAGE_KEY = 'bottomTabTransition'
const TAB_POSITIONS = { home: 0, map: 1, shop: 2, profile: 3 }
const TRANSITION_DURATION = 180

// #ifdef H5
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
const preloadedTabRoutes = new Set()
// #endif

function normalizeRoute(url = '') {
  return String(url).split('?')[0].replace(/^\//, '')
}

function preloadSiblingTabPages(currentRoute) {
  // #ifdef H5
  const isDarkTheme = currentRoute.startsWith('pages-dark/')
  const themePrefix = isDarkTheme ? 'pages-dark/' : 'pages/'
  if (!TAB_PAGE_LOADERS[currentRoute]) return

  const preload = () => {
    Object.entries(TAB_PAGE_LOADERS).forEach(([route, loadPage]) => {
      if (route === currentRoute || !route.startsWith(themePrefix) || preloadedTabRoutes.has(route)) return
      preloadedTabRoutes.add(route)
      loadPage().catch(() => preloadedTabRoutes.delete(route))
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
  if (!transition || Date.now() - transition.createdAt > 2000) return null
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

  const navigate = typeof uni[method] === 'function' ? uni[method] : uni.redirectTo
  navigate.call(uni, { url })
}

export function useTabPageTransition(pageRoute) {
  const tabPageClass = ref('')
  let transitionResetTimer = null
  let transitionStartTimer = null
  let pageReady = false
  let pendingFirstTransition = null

  // #ifdef MP-WEIXIN
  onReady(() => {
    pageReady = true
    if (!pendingFirstTransition) return
    transitionStartTimer = setTimeout(pendingFirstTransition, 16)
    pendingFirstTransition = null
  })
  // #endif

  onShow(() => {
    if (typeof uni === 'undefined') return

    const currentRoute = pageRoute || getCurrentPages().slice(-1)[0]?.route || ''
    preloadSiblingTabPages(currentRoute)
    // #ifdef MP-WEIXIN
    const transition = getPendingTabTransition()
    // #endif
    // #ifndef MP-WEIXIN
    const transition = getPendingTabTransition(currentRoute)
    // #endif
    if (!transition) return

    uni.removeStorageSync(STORAGE_KEY)
    clearTimeout(transitionStartTimer)
    clearTimeout(transitionResetTimer)
    pendingFirstTransition = null
    tabPageClass.value = ''

    const startTransition = () => {
      transitionStartTimer = null
      tabPageClass.value = `tab-page-enter-${transition.direction}`
      transitionResetTimer = setTimeout(() => {
        tabPageClass.value = ''
        transitionResetTimer = null
      }, TRANSITION_DURATION + 40)
    }

    // #ifdef MP-WEIXIN
    if (pageReady) transitionStartTimer = setTimeout(startTransition, 16)
    else pendingFirstTransition = startTransition
    // #endif
    // #ifndef MP-WEIXIN
    startTransition()
    // #endif
  })

  return tabPageClass
}
