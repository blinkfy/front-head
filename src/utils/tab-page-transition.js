import { ref } from 'vue'
import { onHide, onReady, onShow, onUnload } from '@/utils/app-tab-lifecycle.js'

const STORAGE_KEY = 'bottomTabTransition'
const TAB_POSITIONS = { home: 0, map: 1, shop: 2, profile: 3 }
const TRANSITION_DURATION = 180
let activeTabTransitions = 0
// #ifdef APP-PLUS
import { createAppMapTabCache } from './app-map-retention.mjs'
import { playAppTabEntrance, prepareAppMapTabEntrance } from './app-tab-motion.js'
import { holdAppTabFrame } from './app-tab-handoff.js'
import { useAppMapPreloadPage } from './use-app-map-preload-page.js'
import { getAppTabShell, parseAppTabUrl, useAppTabContext } from './app-tab-context.js'
const appMapTabCache = createAppMapTabCache()
let preparingMapTab = false
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
const siblingPreloadJobs = new Set()
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

  if (siblingPreloadJobs.has(themePrefix)) return
  siblingPreloadJobs.add(themePrefix)
  const routes = Object.keys(TAB_PAGE_LOADERS).filter(route => route !== currentRoute && route.startsWith(themePrefix))
  const schedule = () => {
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(preloadNext, { timeout: 800 })
    } else setTimeout(preloadNext, 250)
  }
  const preloadNext = () => {
    // A previously queued idle callback can run during a later page switch.
    if (activeTabTransitions || getPendingTabTransition()) { schedule(); return }
    const route = routes.shift()
    if (!route) { siblingPreloadJobs.delete(themePrefix); return }
    const request = preloadedTabRoutes.has(route) ? Promise.resolve() : preloadTabPage(route)
    void request.catch(() => {}).finally(schedule)
  }
  schedule()
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

  const direction = toPosition > fromPosition ? 'left' : 'right'
  const storeTransition = (preparedByAppView = false, handoffId = '') => uni.setStorageSync(STORAGE_KEY, {
    targetRoute, direction, preparedByAppView, handoffId, createdAt: Date.now()
  })

  // #ifdef APP-PLUS
  const shell = getAppTabShell()
  if (shell?.page === getCurrentPages().slice(-1)[0]) {
    const target = parseAppTabUrl(url)
    if (target) { shell.switchTo(target); return }
  }
  if (preparingMapTab) return
  const pages = getCurrentPages()
  const plan = appMapTabCache.navigation({ pages, from, targetRoute,
    owner: uni.getStorageSync('token') || '', url: String(url) })
  let handoff
  const clearTransition = () => {
    handoff?.cancel()
    uni.removeStorageSync(STORAGE_KEY)
  }
  const fallback = nextMethod => {
    appMapTabCache.clear()
    storeTransition(false, handoff?.id)
    uni[nextMethod]({ url, fail: clearTransition })
  }
  if (plan?.method === 'navigateBack') {
    const sourcePage = pages[pages.length - 1]
    preparingMapTab = true
    prepareAppMapTabEntrance(pages[pages.length - 1 - plan.delta], direction, TRANSITION_DURATION, cancel => {
      preparingMapTab = false
      if (getCurrentPages().slice(-1)[0] !== sourcePage) {
        cancel?.()
        return
      }
      storeTransition(true)
      uni.navigateBack({ delta: plan.delta, animationType: 'none', animationDuration: 0,
        fail: () => { cancel?.(); fallback('reLaunch') } })
    })
    return
  }
  // WebView snapshots can omit the native/WebGL layers of the outgoing map.
  if (from !== 'map') handoff = holdAppTabFrame(pages[pages.length - 1])
  storeTransition(false, handoff?.id)
  const appMethod = plan?.method || method
  if (appMethod === 'navigateTo') {
    uni.navigateTo({ url, animationType: 'none', animationDuration: 0,
      fail: () => fallback('redirectTo') })
    return
  }
  if (plan) {
    uni[plan.method]({ url, fail: () => {
      appMapTabCache.clear()
      if (plan.method === 'redirectTo') clearTransition()
      else fallback('redirectTo')
    } })
    return
  }
  const navigateApp = typeof uni[method] === 'function' ? uni[method] : uni.redirectTo
  navigateApp.call(uni, { url, fail: clearTransition })
  // #endif

  // #ifndef APP-PLUS
  storeTransition()
  const navigate = typeof uni[method] === 'function' ? uni[method] : uni.redirectTo
  navigate.call(uni, { url, fail: () => uni.removeStorageSync(STORAGE_KEY) })
  // #endif
}

export function useTabPageTransition(pageRoute) {
  const tabPageClass = ref('')
  // #ifdef APP-PLUS
  if (useAppTabContext()) {
    if (/\/(shop|profile)\/\1$/.test(pageRoute)) useAppMapPreloadPage()
    return { tabPageClass }
  }
  // #endif
  let transitionResetTimer = null
  let transitionActive = false, pageReady = false, hidden = false
  let pendingPreloadRoute = ''
  // #ifdef APP-PLUS
  if (/^(pages|pages-dark)\/(shop|profile)\/\2$/.test(pageRoute)) useAppMapPreloadPage()
  let appEntranceDirection = ''
  let appHandoffId = ''
  const playAppEntrance = () => {
    if (appEntranceDirection && playAppTabEntrance(getCurrentPages().slice(-1)[0], appEntranceDirection, TRANSITION_DURATION, appHandoffId)) {
      appEntranceDirection = ''
      appHandoffId = ''
    }
  }
  // #endif

  const resetTransition = () => {
    clearTimeout(transitionResetTimer)
    transitionResetTimer = null
    tabPageClass.value = ''
    // #ifdef APP-PLUS
    appEntranceDirection = ''
    appHandoffId = ''
    // #endif
    if (transitionActive) activeTabTransitions--
    transitionActive = false
  }
  const finishTransition = () => {
    resetTransition()
    const route = pendingPreloadRoute
    pendingPreloadRoute = ''
    if (!hidden && route) preloadSiblingTabPages(route)
  }
  const armTransitionEnd = () => {
    clearTimeout(transitionResetTimer)
    let delay = TRANSITION_DURATION + 40
    // #ifdef APP-PLUS
    // The WebView controls first paint; a service timer is only a cleanup fallback.
    delay += 900
    // #endif
    transitionResetTimer = setTimeout(finishTransition, delay)
  }
  const applyPendingTransition = () => {
    const currentRoute = pageRoute || getCurrentPages().slice(-1)[0]?.route || ''
    const transition = getPendingTabTransition(currentRoute)
    if (!transition) return
    uni.removeStorageSync(STORAGE_KEY)
    resetTransition()
    // #ifdef APP-PLUS
    if (transition.preparedByAppView) return
    appEntranceDirection = transition.direction
    appHandoffId = transition.handoffId || ''
    // #endif
    transitionActive = true
    activeTabTransitions++
    tabPageClass.value = `tab-page-enter-${transition.direction}`
    if (pageReady) armTransitionEnd()
  }
  const hide = () => {
    hidden = true
    resetTransition()
    pendingPreloadRoute = ''
  }

  onHide(hide)
  onUnload(hide)

  // Keep the existing horizontal CSS entrance, but apply its offset before
  // the first render so pages do not briefly appear at their final position.
  applyPendingTransition()
  onReady(() => {
    pageReady = true
    // #ifdef APP-PLUS
    playAppEntrance()
    // #endif
    if (transitionActive) armTransitionEnd()
  })

  onShow(() => {
    if (typeof uni === 'undefined') return
    hidden = false
    applyPendingTransition()
    // #ifdef APP-PLUS
    playAppEntrance()
    // #endif
    const currentRoute = pageRoute || getCurrentPages().slice(-1)[0]?.route || ''
    if (transitionActive) pendingPreloadRoute = currentRoute
    else preloadSiblingTabPages(currentRoute)
  })

  return { tabPageClass }
}
