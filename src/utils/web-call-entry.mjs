export const WEB_CALL_RETURN_KEY = 'chat:web-call-return:v1'
const id = value => /^[1-9]\d{0,9}$/.test(String(value || ''))
export function webCallTarget(value) {
  if (!id(value?.peerId) || !id(value?.selfId) || String(value.peerId) === String(value.selfId) || !['audio', 'video'].includes(value.mode)) return null
  return { peerId: String(value.peerId), selfId: String(value.selfId), mode: value.mode, name: String(value.name || '联系人').slice(0, 80) }
}
export function webCallPath(value) {
  const target = webCallTarget(value)
  if (!target) return ''
  return '/pages-nonTheme/web-call?' + Object.entries(target).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')
}
export function webCallUrl(baseUrl, value, ticket = '') {
  const path = webCallPath(value), base = String(baseUrl || '').replace(/\/+$/, '')
  if (!/^https:\/\/[^/?#]+(?:\/[^?#]*)?$/.test(base) || !path) return ''
  return `${base}/web/#${path}${/^[a-f0-9]{64}$/.test(ticket) ? `&ticket=${ticket}` : ''}`
}
export function embeddedWebCallUrl(baseUrl, value, ticket = '') {
  const legacy = webCallUrl(baseUrl, value, ticket)
  return legacy.replace('/web/#/pages-nonTheme/web-call?', '/web/call/index.html#?')
}
// Raw requests deliberately keep old-server failures local to this entry page.
function post(runtime, base, path, data, token = '') {
  return new Promise((resolve, reject) => runtime.request({
    url: `${String(base).replace(/\/+$/, '')}/api/web-call/${path}`, method: 'POST', data, timeout: 8000,
    header: token ? { Authorization: `Bearer ${token}` } : {},
    success: response => response.statusCode === 200 && response.data?.code === 0 ? resolve(response.data) : reject(new Error('entry unavailable')),
    fail: reject
  }))
}
export async function requestWebCallTicket(runtime, base, token) {
  try { return (await post(runtime, base, 'ticket', {}, token)).ticket || '' } catch (_) { return '' }
}
export async function redeemWebCallTicket(runtime, base, ticket, selfId) {
  if (!/^[a-f0-9]{64}$/.test(ticket || '')) throw new Error('invalid ticket')
  const result = await post(runtime, base, 'login', { ticket, selfId })
  if (!result.token || String(result.userInfo?.id) !== String(selfId)) throw new Error('account mismatch')
  return result
}
export function stripWebCallTicket(href) {
  return String(href).replace(/([?&])ticket=[^&#]*&?/, (match, separator) => match.endsWith('&') ? separator : '')
}
export function pendingWebCallPath(record, now = Date.now()) {
  if (!record || !Number.isFinite(record.at) || now < record.at || now - record.at > 300000) return ''
  return webCallPath(record.target)
}
