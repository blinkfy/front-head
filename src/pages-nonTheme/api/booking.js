/**
 * 预约回收 API
 */
import request from '@/api/index.js';
import { baseUrl } from '@/api/settings.js';
import { compressUploadImageBlob, compressNativeUploadImage, discardUploadImage, uploadImageExtension } from '@/utils/upload-image.js';

export function getWasteTypes() {
  return request({
    url: '/api/booking/types',
    method: 'GET',
    needAuth: true
  });
}

export function estimatePrice(items) {
  return request({
    url: '/api/booking/estimate',
    method: 'POST',
    data: { items },
    needAuth: true
  });
}

export function createBooking(data) {
  return request({
    url: '/api/booking/create',
    method: 'POST',
    data,
    needAuth: true
  });
}

export function getBookingList(status = null, page = 1, limit = 20) {
  const data = { page, limit }
  if (status !== null && status !== undefined && String(status).trim() !== '' && String(status) !== 'all') {
    data.status = status
  }
  return request({
    url: '/api/booking/list',
    method: 'GET',
    data,
    needAuth: true
  });
}

export function getBookingDetail(orderId) {
  return request({
    url: `/api/booking/detail/${orderId}`,
    method: 'GET',
    needAuth: true
  });
}

export function cancelBooking(orderId, reason = '', options = {}) {
  return request({
    url: '/api/booking/cancel',
    method: 'POST',
    data: { orderId, reason, ...options },
    needAuth: true
  });
}

export function getAvailableTimeSlots(date, serviceAreaId, typeIds = [], address = {}) {
  return request({
    url: '/api/booking/time-slots',
    method: 'GET',
    data: { date, serviceAreaId, ...address, ...(typeIds.length ? { typeIds: typeIds.join(',') } : {}) },
    needAuth: true
  });
}


export function bookingUnitText(unit) {
  return ({ kg: '公斤', piece: '件', unit: '台', bag: '袋' })[unit] || '公斤'
}

export function bookingQuantityText(item = {}) {
  const quantity = item.quantity ?? item.weight
  return quantity == null || quantity === '' ? '数量待现场确认' : `${quantity}${bookingUnitText(item.quantityUnit || item.unit || 'kg')}`
}

export function bookingPhotoUrl(url) {
  if (!url || /^(?:https?:|blob:|data:)/i.test(url)) return url || ''
  return `${baseUrl.replace(/\/$/, '')}/${String(url).replace(/^\//, '')}`
}

export function confirmBookingQuote(orderId, data) {
  return request({ url: `/api/booking/orders/${orderId}/confirm-quote`, method: 'POST', data, needAuth: true })
}

export async function uploadBookingPhoto(filePath) {
  const token = uni.getStorageSync('token') || ''
  if (!token) throw new Error('请先登录后上传图片')
  let path = filePath
  try {
    // #ifdef H5
    const blob = await compressUploadImageBlob(filePath, .8, 1280)
    const form = new FormData()
    form.append('file', blob, `booking_${Date.now()}.${uploadImageExtension(blob.type)}`)
    const response = await fetch(`${baseUrl}/api/recycling/photos`, { method: 'POST', headers: { Authorization: token }, body: form })
    const result = await response.json()
    if (!response.ok || result?.code !== 0 || !result.data?.id) throw new Error(result?.msg || '图片上传失败，请重试')
    return { ...result.data, url: bookingPhotoUrl(result.data.url) }
    // #endif
    // #ifndef H5
    path = await compressNativeUploadImage(filePath, 80, 1280)
    return await new Promise((resolve, reject) => uni.uploadFile({
      url: `${baseUrl}/api/recycling/photos`, filePath: path, name: 'file', timeout: 60000, header: { Authorization: token },
      success(response) {
        let result = response.data
        try { if (typeof result === 'string') result = JSON.parse(result) } catch (_) {}
        if (response.statusCode >= 200 && response.statusCode < 300 && result?.code === 0 && result.data?.id) resolve({ ...result.data, url: bookingPhotoUrl(result.data.url) })
        else reject(new Error(result?.msg || '图片上传失败，请重试'))
      },
      fail: () => reject(new Error('图片上传失败，请检查网络后重试'))
    }))
    // #endif
  } finally {
    // #ifndef H5
    discardUploadImage(path, filePath)
    // #endif
  }
}
