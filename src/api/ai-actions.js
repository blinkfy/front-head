import request from '@/api/index.js'

const actionRequest = (url, options = {}) => request({
  url: `/api/ai/actions${url}`,
  needAuth: true,
  silent: true,
  ...options
})

export const fetchAiCapabilities = () => request({
  url: '/api/ai/chat/capabilities',
  needAuth: true,
  silent: true
})
export const fetchChatRuns = () => request({ url: '/api/ai/chat/runs', needAuth: true, silent: true })
export const findChatRun = requestId => request({ url: `/api/ai/chat/runs/by-request/${encodeURIComponent(requestId)}`, needAuth: true, silent: true })
export const cancelChatRun = id => request({ url: `/api/ai/chat/runs/${encodeURIComponent(id)}/cancel`, method: 'POST', data: {}, needAuth: true, silent: true })
export const createRedemptionDraft = data => actionRequest('', { method: 'POST', data: { type: 'redemption', ...data } })
export const createBookingDraft = data => actionRequest('', { method: 'POST', data: { ...data, type: 'booking' } })
export const createCommunityPostDraft = data => actionRequest('', { method: 'POST', data: { ...data, type: 'community_post' } })
export const communityPostSupported = response => response?.code === 0 && response?.data?.workflowVersion === 1 && response?.data?.actions?.community_post === true
export const rerecognizeHistory = data => request({ url: '/api/recognize/again', method: 'POST', data, needAuth: true, silent: true, timeout: 180000 })
export const bookingSupported = response => response?.code === 0 && response?.data?.workflowVersion === 1 && response?.data?.actions?.booking === true
export const fetchAiActions = (scope = 'pending', cursor = '') => actionRequest(`?scope=${encodeURIComponent(scope)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
export const cancelAiAction = (id, version) => actionRequest(`/${encodeURIComponent(id)}/cancel`, { method: 'POST', data: { version } })
export const fetchAiAction = id => actionRequest(`/${encodeURIComponent(id)}`)
export const updateAiAction = (id, data) => actionRequest(`/${encodeURIComponent(id)}`, { method: 'PATCH', data })
export const confirmAiAction = (id, data) => actionRequest(`/${encodeURIComponent(id)}/confirm`, { method: 'POST', data })

export function newActionRequestId() {
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.map(value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export const redemptionSupported = response => response?.code === 0 && response?.data?.workflowVersion === 1 && response?.data?.actions?.redemption === true
export const isCapabilityNotFound = error => Number(error?.statusCode || error?.status) === 404
