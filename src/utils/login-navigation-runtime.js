// Explicit uni API calls are retained by the H5 production API compiler.
// Passing the uni namespace into helpers does not retain these implementations.
export const loginNavigationRuntime = {
  reLaunch: options => uni.reLaunch(options),
  redirectTo: options => uni.redirectTo(options),
  navigateBack: options => uni.navigateBack(options),
  showToast: options => uni.showToast(options),
  getStorageSync: key => uni.getStorageSync(key),
  removeStorageSync: key => uni.removeStorageSync(key)
}
