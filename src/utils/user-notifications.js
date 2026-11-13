import request from '@/api/index.js'

export const getUserNotifications = (data = {}) => request({ url: '/api/chat/notifications', method: 'GET', data, needAuth: true })
export const readUserNotifications = data => request({ url: '/api/chat/notifications/read', method: 'POST', data, needAuth: true })

export const getUserNotification = id => request({ url: `/api/chat/notifications/${id}`, method: 'GET', needAuth: true })

export function userNotificationUrl(item) {
  if (item?.kind === 'provider_quota') return '/pages-nonTheme/system-notifications'
  if (item?.target === 'collector_application' || item?.kind === 'collector') return '/pages-nonTheme/collector-apply'
  if (item?.target === 'recycling_admin' || item?.kind === 'recycling_admin') return '/pages-admin/recycling'
  if (item?.target === 'collector_workbench') return '/pages-nonTheme/collector-workbench'
  if (!/^\d+$/.test(String(item?.orderId || ''))) return ''
  if (item.target === 'collector_order') return `/pages-nonTheme/collector-order-detail?id=${item.orderId}`
  if (item.kind === 'shop') return `/pages-nonTheme/shop-order-detail?id=${item.orderId}`
  if (item.kind === 'booking') return `/pages-nonTheme/booking-orders?orderId=${item.orderId}`
  return ''
}
