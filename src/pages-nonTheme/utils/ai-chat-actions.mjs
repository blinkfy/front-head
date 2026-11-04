const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const STATUS_LABELS = { pending: '待确认', completed: '已提交', cancelled: '已取消', expired: '已过期' }
export const actionStatusLabel = status => typeof status === 'string' && Object.prototype.hasOwnProperty.call(STATUS_LABELS, status) ? STATUS_LABELS[status] : ''
export function normalizeActionSummaries(input) {
  const seen = new Set()
  return (Array.isArray(input) ? input : []).slice(0, 20).flatMap(item => {
    if (!item || !UUID.test(item.id || '') || !['booking', 'redemption', 'community_post'].includes(item.type) || !actionStatusLabel(item.status) || !Number.isInteger(item.version) || item.version < 1 || seen.has(item.id)) return []
    seen.add(item.id)
    return [{ id: item.id, type: item.type, status: item.status, version: item.version,
      title: typeof item.title === 'string' ? item.title.slice(0, 160) : (item.type === 'community_post' ? '社区帖子草稿' : item.type === 'booking' ? '回收预约' : '积分兑换'),
      createdAt: typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt)) ? item.createdAt : '' }]
  })
}
export function actionDetailUrl(item) {
  if (!UUID.test(item?.id || '') || !['booking', 'redemption', 'community_post'].includes(item?.type)) return ''
  const page = { booking: 'booking', redemption: 'shop-confirm', community_post: 'community-publish' }[item.type]
  return page ? `/pages-nonTheme/${page}?draftId=${encodeURIComponent(item.id)}` : ''
}
