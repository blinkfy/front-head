import { baseUrl } from './settings.js'
const IDENTITY_CONSENT_VERSION = 'identity-2026-11-v2'
let webSession = null
let sessionGeneration = 0
// #ifdef H5
try { webSession = JSON.parse(sessionStorage.getItem('identity-web-session') || 'null') } catch { /* Storage may be unavailable. */ }
// #endif
export const identityWebContext = () => webSession
export function clearIdentityWebSession() {
  sessionGeneration++
  webSession = null
  // #ifdef H5
  try { sessionStorage.removeItem('identity-web-session') } catch { /* Memory is cleared regardless. */ }
  // #endif
}
function headers() {
  if (webSession) {
    if (!webSession.token || !(Date.parse(webSession.expiresAt) > Date.now())) throw new Error('网页认证已过期，请返回原应用重新打开')
    return { Authorization: `Identity ${webSession.token}` }
  }
  const token = uni.getStorageSync('token')
  if (!token) throw new Error('请先登录')
  return { Authorization: `Bearer ${token}` }
}
function request(path, method = 'GET', data, anonymous = false) {
  return new Promise((resolve, reject) => uni.request({
    url: `${baseUrl}/api/identity/${path}`, method, data, header: anonymous ? {} : headers(), timeout: 15000,
    success: res => res.data?.code === 0 ? resolve(res.data.data) : reject(new Error(res.data?.msg || '认证请求失败，请稍后重试')),
    fail: () => reject(new Error('网络连接失败，请稍后刷新认证状态'))
  }))
}
export const identityStatus = () => request('status')
export const identityChallenge = () => request('challenges', 'POST', { mode: 'photo', consentVersion: IDENTITY_CONSENT_VERSION })
export const createIdentityWebSession = () => request('web-session', 'POST')
export async function exchangeIdentityWebSession(code) {
  const generation = ++sessionGeneration
  // Fail closed: a bad handoff must never fall back to the browser's other logged-in account.
  webSession = { token: '', expiresAt: '', account: '' }
  // #ifdef H5
  try { sessionStorage.setItem('identity-web-session', JSON.stringify(webSession)) } catch { /* Keep the one-time link in the URL if storage is unavailable. */ }
  // #endif
  const result = await request('web-session/exchange', 'POST', { code }, true)
  if (generation !== sessionGeneration) throw Object.assign(new Error('已离开认证页面'), { cancelled: true })
  webSession = result
  let persisted = false
  // #ifdef H5
  try { sessionStorage.setItem('identity-web-session', JSON.stringify(result)); persisted = true } catch { /* Current page still works without persistence. */ }
  // #endif
  return { ...result, persisted }
}

export async function submitIdentity(fields, capture) {
  const authorization = headers()
  let response
  // #ifdef H5
  const form = new FormData()
  Object.entries(fields).forEach(([key, value]) => form.append(key, value))
  form.append('file', capture.file, 'capture.jpg')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)
  try {
    const res = await fetch(`${baseUrl}/api/identity/verify`, { method: 'POST', headers: authorization, body: form, signal: controller.signal })
    response = await res.json()
  } catch { throw new Error('未取得认证结果，请刷新认证状态，勿重复提交') }
  finally { clearTimeout(timer) }
  // #endif
  // #ifndef H5
  response = await new Promise((resolve, reject) => uni.uploadFile({
    url: `${baseUrl}/api/identity/verify`, filePath: capture.path, name: 'file', formData: fields,
    header: authorization, timeout: 30000,
    success: res => { try { resolve(JSON.parse(res.data)) } catch { reject(new Error('未取得认证结果，请刷新认证状态，勿重复提交')) } },
    fail: () => reject(new Error('未取得认证结果，请刷新认证状态，勿重复提交'))
  }))
  // #endif
  if (response?.code !== 0) throw new Error(response?.msg || '认证未完成，请刷新状态')
  return response.data
}
