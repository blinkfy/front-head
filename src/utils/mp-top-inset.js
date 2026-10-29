// 微信小程序自定义导航栏下，页面内容需要避开状态栏并与右上角胶囊按钮同行。
// 非小程序端返回 0（不加额外内边距）。
export function getMiniProgramTopInset() {
  // #ifdef MP-WEIXIN
  try {
    const systemInfo = uni.getSystemInfoSync()
    const menuRect = typeof wx !== 'undefined' && wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null
    const statusBarHeight = Number(systemInfo.statusBarHeight) || 0
    const menuTop = Number(menuRect?.top) || 0
    return Math.max(statusBarHeight, menuTop > 0 ? (menuTop - 4) : statusBarHeight)
  } catch (e) {
    return 0
  }
  // #endif
  // #ifndef MP-WEIXIN
  return 0
  // #endif
}
