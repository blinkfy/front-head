import manifest from '@/static/manifest.json'

const iconsById = new Map(manifest.map(icon => [icon.id, icon]))

export function getManifestIcons() {
  return manifest
}

export function getManifestIcon(id) {
  return iconsById.get(id) || null
}

export function getManifestIconPath(id) {
  const icon = getManifestIcon(id)
  if (!icon) return ''
  // #ifdef MP-WEIXIN
  // 这两枚表图标也用于抽奖、预约页面，其余表图标仅由管理分包使用。
  if (icon.id.endsWith('_table') && !['lottery_record_table', 'reservation_order_table'].includes(icon.id)) {
    return `/pages-admin/static/${icon.file}`
  }
  // #endif
  return `/static/${icon.file}`
}
