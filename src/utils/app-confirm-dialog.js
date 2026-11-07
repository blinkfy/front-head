// APP 页面挂载统一弹窗后使用；其他平台及尚未接入的页面保持原生行为。
export function showAppModal(page, options = {}) {
  // #ifdef APP-PLUS
  const dialog = page?.$refs?.appConfirmDialog
  if (dialog && typeof dialog.open === 'function') return dialog.open(options)
  // #endif
  return uni.showModal(options)
}
