import request from '@/api/index.js'

export async function recyclingRequest(url, method = 'GET', data = {}) {
  const response = await request({ url, method, data, needAuth: true })
  if (response?.code !== 0) throw Object.assign(new Error(response?.msg || response?.error || '操作失败，请重试'), { status: response?.code })
  return response.data
}
export const recyclingCatalog = () => recyclingRequest('/api/recycling/catalog')
export const collectorMe = () => recyclingRequest('/api/collector/me')
export const collectorApply = data => recyclingRequest('/api/collector/applications', 'POST', data)
export const collectorSettings = data => recyclingRequest('/api/collector/settings', 'PATCH', data)
export const collectorAvailability = data => recyclingRequest('/api/collector/availability', 'PUT', data)
export const collectorOrders = (kind, data) => recyclingRequest(`/api/collector/orders/${kind}`, 'GET', data)
export const collectorOrder = id => recyclingRequest(`/api/collector/orders/${id}`)
export const collectorAction = (id, action, data) => recyclingRequest(`/api/collector/orders/${id}/${action}`, 'POST', data)
export const recyclingOverview = (data = {}) => recyclingRequest('/api/admin/recycling/overview', 'GET', data)
export const recyclingAdmin = (path, data, method = 'POST') => recyclingRequest(`/api/admin/recycling/${path}`, method, data)
export const bookingChatContext = targetUserId => recyclingRequest('/api/booking/chat-context', 'GET', { targetUserId })
export const bookingStatusText = status => ({ pending: '待接单', confirmed: '已接单', picking: '上门中', completed: '已完成', cancelled: '已取消' }[status] || status || '')
export const collectorStatusText = status => ({ pending: '审核中', approved: '已通过', rejected: '未通过', suspended: '已停用' }[status] || '未申请')

export function mutationData(cache, key, payload = {}) {
  const digest = JSON.stringify(payload)
  if (cache[key]?.digest !== digest) cache[key] = { digest, requestId: `recycle_${Date.now()}_${Math.random().toString(36).slice(2, 12)}` }
  return { ...payload, requestId: cache[key].requestId }
}

export async function openBookingChat(order, cache = {}) {
  const data = await recyclingRequest(`/api/booking/orders/${order.id}/chat`, 'POST', mutationData(cache, `chat:${order.id}`, { version: order.version }))
  if (!/^\d+$/.test(String(data?.targetUserId || ''))) throw new Error('联系信息暂不可用，请刷新订单')
  uni.navigateTo({ url: `/pages-nonTheme/chat?chatId=${data.targetUserId}&userId=${data.targetUserId}&bookingOrderId=${order.id}&title=${encodeURIComponent(data.title || '预约联系')}&avatar=${encodeURIComponent(data.avatar || '')}` })
}

export async function openPlatformSupport() {
  const data = await recyclingRequest('/api/recycling/support')
  const user = data?.user
  if (!/^\d+$/.test(String(user?.id || ''))) throw new Error('暂无平台服务联系人，请稍后再试')
  uni.navigateTo({ url: `/pages-nonTheme/chat?chatId=${user.id}&userId=${user.id}&title=${encodeURIComponent(user.nickname || user.username || '平台服务')}&avatar=${encodeURIComponent(user.avatar || '')}` })
}

export function recycleBack() {
  if (getCurrentPages().length > 1) uni.navigateBack()
  else uni.reLaunch({ url: uni.getStorageSync('app_theme') === 'dark' ? '/pages-dark/profile/profile' : '/pages/profile/profile' })
}
