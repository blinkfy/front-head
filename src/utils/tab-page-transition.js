import { getCurrentInstance, ref } from 'vue'
import { onHide, onReady, onShow, onUnload } from '@dcloudio/uni-app'

const STORAGE_KEY = 'bottomTabTransition'
const TAB_POSITIONS = { home: 0, map: 1, shop: 2, profile: 3 }
const TRANSITION_DURATION = 180
const MP_TRANSITION_DURATION = 200

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

  const navigate = typeof uni[method] === 'function' ? uni[method] : uni.redirectTo
  navigate.call(uni, { url })
}

export function useTabPageTransition(pageRoute) {
  const tabPageClass = ref('')
  const tabPageAnimation = ref(null)
  const pageInstance = getCurrentInstance()
  let transitionResetTimer = null
  let transitionVersion = 0
  let pageReady = false
  let pendingFirstTransition = null

  const resetTransition = () => {
    transitionVersion += 1
    clearTimeout(transitionResetTimer)
    transitionResetTimer = null
    pendingFirstTransition = null
    tabPageClass.value = ''
    tabPageAnimation.value = null
  }

  onHide(resetTransition)
  onUnload(resetTransition)

  // #ifdef MP-WEIXIN
  onReady(() => {
    pageReady = true
    if (!pendingFirstTransition) return
    pendingFirstTransition()
    pendingFirstTransition = null
  })
  // #endif

  onShow(() => {
    if (typeof uni === 'undefined') return

    const currentRoute = pageRoute || getCurrentPages().slice(-1)[0]?.route || ''
    preloadSiblingTabPages(currentRoute)
    const transition = getPendingTabTransition(currentRoute)
    if (!transition) return

    uni.removeStorageSync(STORAGE_KEY)
    resetTransition()

    const startTransition = () => {
      // #ifdef MP-WEIXIN
      // 两个 step 随动画数据一起送到视图层。
      const offset = uni.upx2px(96) * (transition.direction === 'left' ? 1 : -1)
      const animation = uni.createAnimation({ duration: MP_TRANSITION_DURATION, timingFunction: 'ease-out' })
      animation.translateX(offset).opacity(0.88).step({ duration: 0 })
      animation.translateX(0).opacity(1).step({ duration: MP_TRANSITION_DURATION })
      tabPageAnimation.value = animation.export()

      // 等小程序 setData 提交后计时；只保留归零帧，异步刷新不会重放初始偏移。
      const version = transitionVersion
      pageInstance.proxy.$nextTick(() => {
        if (version !== transitionVersion) return
        transitionResetTimer = setTimeout(() => {
          transitionResetTimer = null
          if (version !== transitionVersion) return
          const settled = uni.createAnimation({ duration: 1, timingFunction: 'linear' })
          settled.translateX(0).opacity(1).step({ duration: 1 })
          tabPageAnimation.value = settled.export()
        }, MP_TRANSITION_DURATION + 40)
      })
      // #endif
      // #ifndef MP-WEIXIN
      tabPageClass.value = `tab-page-enter-${transition.direction}`
      transitionResetTimer = setTimeout(() => {
        tabPageClass.value = ''
        transitionResetTimer = null
      }, TRANSITION_DURATION + 40)
      // #endif
    }

    // #ifdef MP-WEIXIN
    if (pageReady) startTransition()
    else pendingFirstTransition = startTransition
    // #endif
    // #ifndef MP-WEIXIN
    startTransition()
    // #endif
  })

  return { tabPageClass, tabPageAnimation }
}
