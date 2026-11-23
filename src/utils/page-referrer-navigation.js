export function createPageReferrerNavigation(themeRoot, storageKey) {
  function onLoad(options) {
    if (options?.from) uni.setStorageSync('tempReferrer', options.from)
  }

  function setupPageReferrer() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      const previousRoute = pages[pages.length - 2].route || ''
      const referrer = ['home', 'profile', 'scan'].find(page => previousRoute.includes(page)) || 'home'
      uni.setStorageSync(storageKey, referrer)
      return
    }
    uni.setStorageSync(storageKey, uni.getStorageSync('tempReferrer') || 'home')
    uni.removeStorageSync('tempReferrer')
  }

  function handleBackupNavigation() {
    const referrer = uni.getStorageSync(storageKey)
    if (referrer) uni.removeStorageSync(storageKey)
    const routes = {
      home: `${themeRoot}/home/home`,
      profile: `${themeRoot}/profile/profile`,
      scan: '/pages-nonTheme/scan'
    }
    const url = Object.prototype.hasOwnProperty.call(routes, referrer) ? routes[referrer] : routes.home
    setTimeout(() => uni.reLaunch({ url }), 500)
  }

  function goBack() {
    if (getCurrentPages().length > 1) {
      uni.navigateBack({ delta: 1, fail: handleBackupNavigation })
    } else {
      handleBackupNavigation()
    }
  }

  return { onLoad, setupPageReferrer, goBack }
}
