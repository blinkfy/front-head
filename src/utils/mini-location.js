import { chooseMiniPoint, chooseMiniShippingAddress, createMiniLocationWatcher } from './mini-location-core.mjs'
import { openFeaturePermissionSettings } from './feature-permission.js'
export { isLocationCancelled, isLocationDenied } from './mini-location-core.mjs'
const preferenceKey = 'mini-location-enhanced-v1'
export function miniLocationAvailable() {
  // #ifdef MP-WEIXIN
  return typeof wx !== 'undefined' && typeof wx.getLocation === 'function'
  // #endif
  // #ifndef MP-WEIXIN
  return false
  // #endif
}
export function readMiniLocationEnhanced() {
  try { return uni.getStorageSync(preferenceKey) !== false } catch (_) { return true }
}
export function writeMiniLocationEnhanced(enabled) {
  uni.setStorageSync(preferenceKey, !!enabled)
  uni.$emit('location:mode-changed')
  return !!enabled
}
const api = () => typeof wx !== 'undefined' ? wx : uni
export function chooseMiniLocation(options = {}) {
  return chooseMiniPoint(api(), { ...options, enhanced: readMiniLocationEnhanced() })
}
export async function chooseMiniAddress(options = {}) {
  const native = api()
  const settings = await new Promise(resolve => {
    try { native.getSetting({ success: resolve, fail: () => resolve(null) }) } catch (_) { resolve(null) }
  })
  if (options.isCurrent && !options.isCurrent()) throw Object.assign(new Error('操作已取消'), { code: 'cancelled' })
  if (settings?.authSetting?.['scope.address'] === false) {
    const granted = await openFeaturePermissionSettings('address', options)
    if (!granted) throw Object.assign(new Error('操作已取消'), { code: 'cancelled' })
  }
  return chooseMiniShippingAddress(native, options)
}
let watch
export function watchMiniLocation(success, failure) {
  watch ||= createMiniLocationWatcher({ api: api(), enhanced: readMiniLocationEnhanced })
  return watch(success, failure)
}
