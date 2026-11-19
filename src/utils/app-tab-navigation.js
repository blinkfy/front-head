import { getAppTabShell, parseAppTabUrl } from './app-tab-context.js'

import { appVersionGuard } from './app-version-guard.js'

export const APP_TABS_ROUTE = 'pages/app-tabs/index'

export function installAppTabNavigation() {
  for (const method of ['navigateTo', 'redirectTo', 'reLaunch']) {
    const original = uni[method]
    if (!original || original.__appTabShell) continue
    const navigate = async function (options = {}) {
      const target = parseAppTabUrl(options.url)
      if (!target) return original.call(this, options)
      const shell = getAppTabShell()
      const pages = getCurrentPages()
      const shellIndex = shell ? pages.indexOf(shell.page) : -1
      if (shellIndex >= 0 && method !== 'reLaunch') {
        if (!await shell.switchTo(target)) return failNavigation(method, options)
        if (shellIndex < pages.length - 1) {
          const { url, ...backOptions } = options
          return uni.navigateBack({ ...backOptions, delta: pages.length - shellIndex - 1 })
        }
        const result = { errMsg: method + ':ok' }
        options.success?.(result)
        options.complete?.(result)
        return Promise.resolve(result)
      }
      if (!await appVersionGuard().ensure({ page: target.route })) return failNavigation(method, options)
      const url = '/' + APP_TABS_ROUTE + '?target=' + encodeURIComponent(options.url)
      return original.call(this, { ...options, url })
    }
    navigate.__appTabShell = true
    uni[method] = navigate
  }
  const scroll = uni.pageScrollTo
  uni.pageScrollTo = function (options) {
    const shell = getAppTabShell()
    if (getCurrentPages().slice(-1)[0] === shell?.page) return shell.scrollTo(options)
    return scroll.call(this, options)
  }
}

function failNavigation(method, options) {
  const error = { errMsg: method + ':fail navigation unavailable' }
  options.fail?.(error)
  options.complete?.(error)
  if (!options.fail && !options.complete && !options.success) throw error
}
