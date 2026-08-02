import { resolveH5StandalonePath } from '@/utils/h5-route'
import { userinfo } from '@/api/user'
import { redirectToNoPermission } from '@/utils/access-guard.js'

export const ADMIN_SCREEN_REGISTRY = Object.freeze({
  collectionPlanning: {
    id: 'collectionPlanning',
    title: '分拣中心清运规划',
    shortTitle: '清运规划',
    icon: '⌁',
    navOrder: 10,
    access: 'admin',
    fallback: 'profile',
    prettyPath: '/collection-planning',
    spaPath: '/pages-admin/collection-planning'
  },
  collectionDashboard: {
    id: 'collectionDashboard',
    title: '垃圾清运可视化大屏',
    shortTitle: '清运大屏',
    icon: '◫',
    navOrder: 20,
    access: 'admin',
    fallback: 'profile',
    prettyPath: '/collection-dashboard',
    spaPath: '/pages-admin/collection-dashboard'
  },
  communityDashboard: {
    id: 'communityDashboard',
    title: '智慧城市社区治理大屏',
    shortTitle: '社区治理',
    icon: '◈',
    navOrder: 30,
    access: 'admin',
    fallback: 'profile',
    prettyPath: '/community-dashboard',
    spaPath: '/pages-admin/community-dashboard'
  },
  digitalTwinReplay: {
    id: 'digitalTwinReplay',
    title: '公园垃圾分类数字孪生回放',
    shortTitle: '数字孪生',
    icon: '◎',
    navOrder: 40,
    access: 'admin',
    fallback: 'collectionDashboard',
    prettyPath: '/digital-twin-replay',
    spaPath: '/pages-admin/digital-twin-replay'
  }
})

const ROUTES = {
  home: {
    prettyPath: '/',
    lightSpaPath: '/pages/home/home',
    darkSpaPath: '/pages-dark/home/home'
  },
  profile: {
    prettyPath: '',
    lightSpaPath: '/pages/profile/profile',
    darkSpaPath: '/pages-dark/profile/profile'
  },
  ...ADMIN_SCREEN_REGISTRY
}

function isH5Runtime() {
  return typeof window !== 'undefined'
}

function getThemeMode() {
  try {
    if (isH5Runtime() && typeof localStorage !== 'undefined') {
      return localStorage.getItem('app_theme') === 'dark' ? 'dark' : 'light'
    }
    return uni.getStorageSync('app_theme') === 'dark' ? 'dark' : 'light'
  } catch (_) {
    return 'light'
  }
}

function readStoredValue(key) {
  try {
    return isH5Runtime() && typeof localStorage !== 'undefined'
      ? localStorage.getItem(key)
      : uni.getStorageSync(key)
  } catch (_) {
    return null
  }
}

function decodeTokenPayload(token) {
  try {
    const encoded = String(token || '').split('.')[1]
    if (!encoded || typeof atob !== 'function') return null
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
    return JSON.parse(atob(padded))
  } catch (_) {
    return null
  }
}

function readAdminFlag() {
  const raw = readStoredValue('isAdmin')
  if (raw === true || raw === 1 || raw === '1' || raw === 'true') return true

  const cachedUser = readStoredValue('userInfo')
  try {
    const userInfo = typeof cachedUser === 'string' ? JSON.parse(cachedUser) : cachedUser
    if (userInfo?.isAdmin === true) return true
  } catch (_) {
    // Ignore malformed cached profile data and continue with the signed token hint.
  }

  // This is only a UI hint. The server still verifies the JWT and enforces
  // requireAdmin for every protected endpoint.
  const tokenPayload = decodeTokenPayload(readStoredValue('token'))
  return tokenPayload?.userId === 'adminID' || tokenPayload?.id === 'adminID' || tokenPayload?.isAdmin === true
}

function hasSessionToken() {
  if (readStoredValue('token')) return true
  if (!isH5Runtime() || typeof window === 'undefined') return false

  try {
    const search = new URLSearchParams(window.location.search || '')
    const hashQuery = String(window.location.hash || '').split('?')[1] || ''
    return Boolean(search.get('token') || new URLSearchParams(hashQuery).get('token'))
  } catch (_) {
    return false
  }
}

function writeVerifiedAdminFlag(isAdmin, userData) {
  try {
    if (isH5Runtime() && typeof localStorage !== 'undefined') {
      if (isAdmin) localStorage.setItem('isAdmin', 'true')
      else localStorage.removeItem('isAdmin')
      if (userData) localStorage.setItem('userInfo', JSON.stringify(userData))
      return
    }
    if (isAdmin) uni.setStorageSync('isAdmin', true)
    else uni.removeStorageSync('isAdmin')
    if (userData) uni.setStorageSync('userInfo', userData)
  } catch (_) {
    // The protected API remains the authoritative permission boundary.
  }
}

export function getAdminScreen(screenKey) {
  return ADMIN_SCREEN_REGISTRY[screenKey] || null
}

export function getAdminScreenList(options = {}) {
  const { onlyAccessible = false } = options
  return Object.values(ADMIN_SCREEN_REGISTRY)
    .filter((screen) => !onlyAccessible || canAccessAdminScreen(screen.id))
    .sort((a, b) => a.navOrder - b.navOrder)
}

export function getAdminScreenByPath(path) {
  const normalized = String(path || '').split('?')[0].trim()
  return Object.values(ADMIN_SCREEN_REGISTRY).find((screen) => (
    screen.prettyPath === normalized || screen.spaPath === normalized
  )) || null
}

export function canAccessAdminScreen(screenKey) {
  const screen = getAdminScreen(screenKey)
  return Boolean(screen) && (screen.access !== 'admin' || readAdminFlag())
}

export async function ensureAdminScreenAccess(screenKey) {
  const screen = getAdminScreen(screenKey)
  if (!screen || screen.access !== 'admin') return true

  const redirectDenied = (reason) => {
    redirectToNoPermission({ from: screen.spaPath, reason })
    return false
  }

  if (!hasSessionToken()) return redirectDenied('请先登录管理员账号后再访问该大屏。')

  try {
    const response = await userinfo('false')
    const userData = response?.data || null
    if (userData?.isAdmin === true) {
      writeVerifiedAdminFlag(true, userData)
      return true
    }
    writeVerifiedAdminFlag(false, userData)
    return redirectDenied('当前账号没有该大屏的访问权限。')
  } catch (_) {
    // Keep an already verified session usable during a transient profile request
    // failure; every page data endpoint still enforces server-side admin access.
    if (readAdminFlag()) return true
    return redirectDenied('管理员权限验证失败，请重新登录后重试。')
  }
}

function resolveRouteConfig(routeKey) {
  const config = ROUTES[routeKey]
  if (!config) {
    throw new Error(`Unknown route key: ${routeKey}`)
  }

  if (config.spaPath) {
    return {
      routeKey,
      prettyPath: config.prettyPath || '',
      spaPath: config.spaPath
    }
  }

  const theme = getThemeMode()
  return {
    routeKey,
    prettyPath: config.prettyPath || '',
    spaPath: theme === 'dark' ? config.darkSpaPath : config.lightSpaPath
  }
}

function toQueryString(query = {}) {
  const parts = []
  Object.keys(query).forEach((key) => {
    const value = query[key]
    if (value === undefined || value === null || value === '') return
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
  })
  return parts.join('&')
}

function buildSpaUrl(spaPath, query = {}) {
  const normalized = String(spaPath || '').trim()
  if (!normalized) return ''
  const queryString = toQueryString(query)
  return queryString ? `${normalized}?${queryString}` : normalized
}

function normalizeReturnTo(routeKey) {
  const value = String(routeKey || '').trim()
  return ROUTES[value] ? value : ''
}

function parseQueryString(rawQuery) {
  const query = String(rawQuery || '').replace(/^\?/, '')
  if (!query) return {}
  return query.split('&').reduce((params, part) => {
    if (!part) return params
    const [rawKey, ...rawValue] = part.split('=')
    const key = decodeURIComponent(String(rawKey || '').replace(/\+/g, ' '))
    const value = decodeURIComponent(rawValue.join('=').replace(/\+/g, ' '))
    if (key) params[key] = value
    return params
  }, {})
}

function readCurrentRouteQuery() {
  if (isH5Runtime() && typeof window !== 'undefined') {
    const search = window.location?.search || ''
    const hashQuery = String(window.location?.hash || '').split('?')[1] || ''
    return { ...parseQueryString(hashQuery), ...parseQueryString(search) }
  }

  try {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    const current = pages[pages.length - 1]
    return current?.options || {}
  } catch (_) {
    return {}
  }
}

function callNavigation(method, url) {
  return new Promise((resolve, reject) => {
    const fn =
      method === 'redirect'
        ? uni.redirectTo
        : method === 'relaunch'
          ? uni.reLaunch
          : uni.navigateTo

    fn({
      url,
      success: resolve,
      fail: reject
    })
  })
}

function fallbackToBrowserRoute(route, query = {}, method = 'navigate') {
  if (!isH5Runtime()) {
    return callNavigation(method === 'navigate' ? 'redirect' : method, buildSpaUrl(route.spaPath, query))
  }

  const target = resolveH5StandalonePath(route.prettyPath || route.spaPath, route.spaPath, toQueryString(query))
  if (method === 'redirect' || method === 'relaunch') {
    window.location.replace(target)
  } else {
    window.location.assign(target)
  }
  return Promise.resolve()
}

export async function jumpToAdminPage(routeKey, options = {}) {
  const { from = '', returnTo = '', mode = 'navigate', query = {} } = options
  const route = resolveRouteConfig(routeKey)

  const finalQuery = { ...query }
  const safeReturnTo = normalizeReturnTo(returnTo || from)
  if (safeReturnTo && !finalQuery.returnTo) finalQuery.returnTo = safeReturnTo

  try {
    await callNavigation(mode, buildSpaUrl(route.spaPath, finalQuery))
  } catch (_) {
    await fallbackToBrowserRoute(route, finalQuery, mode)
  }
  return true
}

export function navigateAdminScreen(routeKey, options = {}) {
  return jumpToAdminPage(routeKey, options)
}

export function goBackFromAdminPage(currentRouteKey, options = {}) {
  const currentScreen = getAdminScreen(currentRouteKey)
  const { fallback = currentScreen?.fallback || 'home' } = options
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
  if (pages.length > 1) {
    uni.navigateBack()
    return
  }

  const query = readCurrentRouteQuery()
  const returnTo = normalizeReturnTo(query.returnTo || query.from)
  if (returnTo) {
    jumpToAdminPage(returnTo, {
      mode: returnTo === 'home' ? 'relaunch' : 'redirect'
    })
    return
  }

  const routeKey = normalizeReturnTo(fallback) || 'home'
  jumpToAdminPage(routeKey, {
    mode: routeKey === 'home' ? 'relaunch' : 'redirect'
  })
}
