import { baseUrl } from '@/api/settings.js'
import { createBiometricLoginManager } from './biometric-login-core.mjs'
// #ifdef APP-PLUS
import { biometricRequest } from '@/uni_modules/ftx-biometric-login'
// #endif

function native(options) {
  return new Promise((resolve, reject) => {
    // #ifdef APP-PLUS
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { biometricRequest(JSON.stringify({ operation: 'cancel' }), () => {}) } catch (_) {}
      reject({ error: 'CANCELLED' })
    }, 65000)
    try {
      biometricRequest(JSON.stringify(options), raw => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        try {
          const result = JSON.parse(raw)
          if (result.error) reject(result)
          else resolve(result)
        } catch (_) { reject({ error: 'UNAVAILABLE' }) }
      })
    } catch (_) { clearTimeout(timer); reject({ error: 'UNAVAILABLE' }) }
    // #endif
    // #ifndef APP-PLUS
    reject({ error: 'UNAVAILABLE' })
    // #endif
  })
}

// Login probes must not trigger the shared 401 redirect/toast while this page is already logging in.
export function biometricApi(path, data = {}, token = '', method = 'POST') {
  return new Promise((resolve, reject) => {
    uni.request({ url: `${baseUrl.replace(/\/$/, '')}/api${path}`, method, data, timeout: 15000,
      header: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      success: response => {
        if (response.statusCode === 200 && response.data?.code === 0) resolve(response.data)
        else reject({ ...response.data, msg: response.data?.msg || '登录服务暂不可用，请稍后再试' })
      },
      fail: () => reject({ msg: '无法连接登录服务，请检查网络后重试' })
    })
  })
}
const runtime = {
  getStorageSync: key => uni.getStorageSync(key),
  setStorageSync: (key, value) => uni.setStorageSync(key, value),
  removeStorageSync: key => uni.removeStorageSync(key),
  confirm: options => new Promise(resolve => uni.showModal({ ...options,
    success: result => resolve(result.confirm === true), fail: () => resolve(false) }))
}
export const biometricLogin = createBiometricLoginManager({ runtime, native, api: biometricApi, scope: baseUrl.replace(/\/$/, '') })
