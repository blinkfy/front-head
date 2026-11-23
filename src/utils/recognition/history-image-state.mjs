export const HISTORY_IMAGE_RETENTION_DAYS = 180

// 仅在没有图片或加载失败时判断保留期限，仍能加载的旧图片继续展示。
export function getHistoryImageState(item, failed = false, now = Date.now()) {
  if (item?.hasImage && !failed) return 'available'
  const time = item?.time ? new Date(item.time).getTime() : NaN
  if (Number.isFinite(time) && now - time > HISTORY_IMAGE_RETENTION_DAYS * 86400000) {
    return 'cleared'
  }
  return failed ? 'error' : 'none'
}

export function getHistoryImageLabel(state) {
  return {
    cleared: '图片已清理',
    error: '加载失败，点击重试',
    none: '暂无图片'
  }[state] || ''
}
