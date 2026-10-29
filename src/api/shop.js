import request from '@/api/index.js'

export async function fetchShopRecommendations({
  limit = 6,
  currentPoints = 0,
  candidateProducts = []
} = {}) {
  const token = uni.getStorageSync('token') || ''
  if (!token) return null
  try {
    const payload = await request({
      url: '/api/shop/recommendations',
      method: 'POST',
      needAuth: true,
      silent: true,
      data: { limit, currentPoints, candidateProducts }
    })
    if (payload.code !== 0 || !payload.data) return null
    const names = (Array.isArray(payload.data.recommendations) ? payload.data.recommendations : [])
      .map(item => String(item?.productName || '').trim()).filter(Boolean)
    return names.length ? { source: String(payload.data.source || '').trim(), names } : null
  } catch (_) {
    return null
  }
}

const shopRequest = (url, options = {}) => request({ url: `/api/shop${url}`, needAuth: true, silent: true, ...options })
export const fetchShopProducts = () => shopRequest('/products')
export const fetchShopProduct = id => shopRequest(`/products/${encodeURIComponent(id)}`)
export const createShopOrder = data => shopRequest('/orders', { method: 'POST', data })
export const fetchShopOrders = (status = '', page = 1) => shopRequest('/orders', { params: { status, page, pageSize: 20 } })
export const fetchShopOrder = id => shopRequest(`/orders/${encodeURIComponent(id)}`)
export const cancelShopOrder = id => shopRequest(`/orders/${encodeURIComponent(id)}/cancel`, { method: 'POST' })
export const receiveShopOrder = id => shopRequest(`/orders/${encodeURIComponent(id)}/receive`, { method: 'POST' })
