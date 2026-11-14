import { baseUrl } from './settings'
import { beginMfaTransition } from '@/utils/mfa-session-transition.mjs'

// Login challenges must not invoke the shared authenticated-session redirect.
export function mfaRequest(path, data = {}, token = '', method = 'POST') {
  const finishTransition = ['setup', 'enable', 'totp/enable', 'disable'].includes(path) ? beginMfaTransition(token) : () => {}
  return new Promise((resolve, reject) => uni.request({
    url: `${baseUrl.replace(/\/$/, '')}/api/mfa/${path}`, method, data, timeout: 15000,
    header: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    success: response => response.statusCode === 200 && response.data?.code === 0
      ? resolve(response.data) : reject(new Error(response.data?.msg || '暂时无法完成验证，请稍后重试')),
    fail: () => reject(new Error('无法连接验证服务，请检查网络后重试'))
  })).finally(() => { setTimeout(finishTransition, 0) })
}

export function saveMfaSession(result, expectedToken) {
  if (!result?.token || uni.getStorageSync('token') !== expectedToken) return false
  uni.setStorageSync('token', result.token)
  const cached = uni.getStorageSync('userInfo') || {}
  uni.setStorageSync('userInfo', { ...cached, isAdmin: result.isAdmin === true, mfaEnabled: result.mfaEnabled === true })
  if (result.isAdmin === true) uni.setStorageSync('isAdmin', true)
  else uni.removeStorageSync('isAdmin')
  return true
}

export function userinfoForToken(token) {
  return new Promise((resolve, reject) => uni.request({
    url: `${baseUrl.replace(/\/$/, '')}/api/userinfo?avater=false`,
    header: { Authorization: `Bearer ${token}` }, timeout: 15000,
    success: response => response.statusCode === 200 && response.data?.code === 0
      ? resolve(response.data) : reject(new Error('暂时无法获取账号资料，请重新登录')),
    fail: () => reject(new Error('无法连接服务器，请重试'))
  }))
}
