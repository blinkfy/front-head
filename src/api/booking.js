/**
 * 预约回收 API
 */
import request from '@/api/index.js';

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
  return request({
    url: '/api/booking/list',
    method: 'GET',
    data: { status, page, limit },
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

export function cancelBooking(orderId, reason = '') {
  return request({
    url: '/api/booking/cancel',
    method: 'POST',
    data: { orderId, reason },
    needAuth: true
  });
}

export function getAvailableTimeSlots(date) {
  return request({
    url: '/api/booking/time-slots',
    method: 'GET',
    data: { date },
    needAuth: true
  });
}
