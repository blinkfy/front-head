// #ifdef H5
import { beginH5LoginLoading } from './h5-login-loading.mjs'
// #endif
// Explicit uni API calls are retained by the H5 production API compiler.
// Passing the uni namespace into helpers does not retain these implementations.
export const loginNavigationRuntime = {
  // #ifdef H5
  beginPageLoading: beginH5LoginLoading,
  // #endif
  reLaunch: options => uni.reLaunch(options),
  redirectTo: options => uni.redirectTo(options),
  navigateBack: options => uni.navigateBack(options),
  showToast: options => uni.showToast(options),
  getStorageSync: key => uni.getStorageSync(key),
  removeStorageSync: key => uni.removeStorageSync(key)
}
