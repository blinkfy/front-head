import { baseUrl } from '@/api/settings'
import manifest from '@/manifest.json'
import { createAppVersionGuard } from './app-version-guard-core.mjs'

let guard

export function installAppVersionGuard() {
  // #ifdef APP-PLUS
  if (guard) return guard
  const info = uni.getSystemInfoSync()
  // Preserve the actual uni object: assigning a spread copy would not wrap APIs.
  const runtime = uni
  runtime.currentRoute = () => getCurrentPages().slice(-1)[0]?.route || ''
  runtime.pageCount = () => getCurrentPages().length
  runtime.homeUrl = () => {
    const prefix = uni.getStorageSync('app_theme') === 'dark' ? '/pages-dark' : '/pages'
    return `${prefix}/${uni.getStorageSync('token') ? 'home/home' : 'index/index'}`
  }
  guard = createAppVersionGuard({ runtime, baseUrl, version: manifest.versionName,
    platform: String(info.platform || '').toLowerCase(), openURL: url => plus.runtime.openURL(url) })
  guard.install()
  try {
    plus.runtime.getProperty(plus.runtime.appid, value => guard.setVersion(value?.version))
  } catch (_) { /* The packaged manifest is available during early startup. */ }
  return guard
  // #endif
}

export function appVersionGuard() { return guard || installAppVersionGuard() }
