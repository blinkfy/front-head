import { baseUrl } from './settings'
import request from '@/api/index.js'

export function fetchShopRecommendations({
  limit = 6,
  currentPoints = 0,
  candidateProducts = []
} = {}) {
  const token = uni.getStorageSync('token') || ''
  if (!token) return Promise.resolve(null)

  const url = `${baseUrl}/api/shop/recommendations?token=${encodeURIComponent(token)}`
  return new Promise((resolve) => {
    uni.request({
      url,
      method: 'POST',
      header: { 'Content-Type': 'application/json', Authorization: token },
      data: { limit, currentPoints, candidateProducts },
      success: (res) => {
        try {
          const payload = res && res.data ? res.data : null
          if (!payload || payload.code !== 0 || !payload.data) return resolve(null)
          const names = (Array.isArray(payload.data.recommendations) ? payload.data.recommendations : [])
            .map((item) => String((item && item.productName) || '').trim())
            .filter(Boolean)
          if (!names.length) return resolve(null)
          resolve({ source: String(payload.data.source || '').trim(), names })
        } catch (_) {
          resolve(null)
        }
      },
      fail: () => resolve(null)
    })
  })
}

export function createPurchaseRecord(data) {
  return request({
    url: '/api/shop/purchase-records',
    method: 'POST',
    data,
    needAuth: true
  })
}
