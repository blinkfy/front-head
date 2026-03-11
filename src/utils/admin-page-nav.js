import { resolveH5StandalonePath } from '@/utils/h5-route'

const REFERRER_KEY = 'admin_page_referrers_v1'

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
  collectionDashboard: {
    prettyPath: '/collection-dashboard',
    spaPath: '/pages-nonTheme/collection-dashboard'
  },
  collectionPlanning: {
    prettyPath: '/collection-planning',
    spaPath: '/pages-nonTheme/collection-planning'
  },
  communityDashboard: {
    prettyPath: '/community-dashboard',
    spaPath: '/pages-nonTheme/community-dashboard'
  }
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

function getStorageValue(key) {
  try {
    if (isH5Runtime() && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key) || ''
    }
    return uni.getStorageSync(key) || ''
  } catch (_) {
    return ''
  }
}

function setStorageValue(key, value) {
  try {
    if (isH5Runtime() && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value)
      return
    }
    uni.setStorageSync(key, value)
  } catch (_) {}
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

function readReferrerMap() {
  const raw = getStorageValue(REFERRER_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (_) {
    return {}
  }
}

function writeReferrerMap(value) {
  setStorageValue(REFERRER_KEY, JSON.stringify(value || {}))
}

function saveRouteReferrer(targetKey, fromKey) {
  if (!targetKey || !fromKey || targetKey === fromKey) return
  const next = readReferrerMap()
  next[targetKey] = fromKey
  writeReferrerMap(next)
}

function consumeRouteReferrer(routeKey) {
  if (!routeKey) return ''
  const next = readReferrerMap()
  const referrer = String(next[routeKey] || '').trim()
  if (referrer) {
    delete next[routeKey]
    writeReferrerMap(next)
  }
  return referrer
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
  const { from = '', mode = 'navigate', query = {} } = options
  const route = resolveRouteConfig(routeKey)
  if (from) saveRouteReferrer(routeKey, from)

  const finalQuery = { ...query }
  if (from && !finalQuery.from) finalQuery.from = from

  try {
    await callNavigation(mode, buildSpaUrl(route.spaPath, finalQuery))
  } catch (_) {
    await fallbackToBrowserRoute(route, finalQuery, mode)
  }
}

export function goBackFromAdminPage(currentRouteKey, options = {}) {
  const { fallback = 'home' } = options
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
  if (pages.length > 1) {
    consumeRouteReferrer(currentRouteKey)
    uni.navigateBack()
    return
  }

  const routeKey = consumeRouteReferrer(currentRouteKey) || fallback
  jumpToAdminPage(routeKey, {
    mode: routeKey === 'home' ? 'relaunch' : 'redirect'
  })
}
