import request from '@/api/index.js'

// 共用登录态和错误处理；业务失败不能进入保存/发货成功分支。
async function adminRequest(options) {
  const response = await request({ ...options, needAuth: true, silent: true })
  if (response?.code !== 0) {
    const error = new Error(response?.msg || response?.message || response?.error || '商城操作失败，请重试')
    error.code = response?.code
    throw error
  }
  return response.data
}

export function fetchAdminProducts({ page = 1, pageSize = 20 } = {}) {
  return adminRequest({ url: '/api/shop/admin/products', params: { page, pageSize } })
}

export function createAdminProduct(data) {
  return adminRequest({ url: '/api/shop/admin/products', method: 'POST', data })
}

export function updateAdminProduct(id, data) {
  return adminRequest({ url: `/api/shop/admin/products/${encodeURIComponent(id)}`, method: 'PUT', data })
}

export function fetchAdminOrders({ status = '', q = '', page = 1 } = {}) {
  return adminRequest({ url: '/api/shop/admin/orders', params: { status, q, page, pageSize: 20 } })
}

export function fetchAdminOrder(id) {
  return adminRequest({ url: `/api/shop/admin/orders/${encodeURIComponent(id)}` })
}

export function shipAdminOrder(id, { logisticsCompany, trackingNumber }) {
  return adminRequest({
    url: `/api/shop/admin/orders/${encodeURIComponent(id)}/ship`,
    method: 'POST',
    data: { logisticsCompany, trackingNumber }
  })
}
