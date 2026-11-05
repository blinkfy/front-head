import request from '@/api/index.js'

export const getUserNotifications = (data = {}) => request({ url: '/api/chat/notifications', method: 'GET', data, needAuth: true })
export const readUserNotifications = data => request({ url: '/api/chat/notifications/read', method: 'POST', data, needAuth: true })

export function userNotificationUrl(item) {
  if (!/^\d+$/.test(String(item?.orderId || ''))) return ''
  if (item.kind === 'shop') return `/pages-nonTheme/shop-order-detail?id=${item.orderId}`
  if (item.kind === 'booking') return `/pages-nonTheme/booking-orders?orderId=${item.orderId}`
  return ''
}
