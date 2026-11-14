import { biometricApi } from './biometric-login.js'
import { baseUrl } from '@/api/settings.js'
import { ThemeManager } from './theme.js'
import { createPlatformQuickLogin } from './platform-quick-login-core.mjs'
// #ifdef APP-PLUS
import { biometricLogin } from './biometric-login.js'
// #endif
// #ifdef H5
import { createPasskeyAdapter } from './passkey-client-core.mjs'
// #endif
// #ifdef MP-WEIXIN
import { createSoterAdapter } from './soter-client-core.mjs'
// #endif

const runtime = {
  getStorageSync: key => uni.getStorageSync(key), setStorageSync: (key, value) => uni.setStorageSync(key, value),
  removeStorageSync: key => uni.removeStorageSync(key),
  confirm: options => new Promise(resolve => uni.showModal({ ...options,
    confirmColor: ThemeManager.getTheme() === 'dark' ? '#5B8DEE' : '#059669',
    success: result => resolve(result.confirm === true), fail: () => resolve(false) }))
}
let instance, platform = 'other'
// #ifdef APP-PLUS
platform = 'app'
instance = biometricLogin
// #endif
// #ifdef H5
platform = 'web'
const webAdapter = createPasskeyAdapter({ api: biometricApi, environment: {
    isSecureContext: window.isSecureContext, navigator: window.navigator, PublicKeyCredential: window.PublicKeyCredential,
    AbortController: window.AbortController, atob: window.atob.bind(window), btoa: window.btoa.bind(window)
  } })
instance = createPlatformQuickLogin({ runtime, api: biometricApi, scope: `web:${baseUrl}:${window.location.origin}`, adapter: webAdapter })
// #endif
// #ifdef MP-WEIXIN
platform = 'weixin'
instance = createPlatformQuickLogin({ runtime, api: biometricApi, scope: `weixin:${baseUrl}`,
  adapter: createSoterAdapter({ runtime: uni, api: biometricApi }) })
// #endif
// #ifndef APP-PLUS || H5 || MP-WEIXIN
instance = { state: () => ({ enabled: false }), capability: async () => ({ supported: false, enrolled: false }),
  afterLogin: async () => {}, cancel() {}, forgetBinding: async () => {} }
// #endif
export function quickLoginForMfa(ticket, isActive, owner) {
  // #ifdef H5
  return webAdapter.login({ mfaTicket: ticket, isActive })
  // #endif
  // #ifndef H5
  return instance.login(isActive, owner)
  // #endif
}
export const quickLogin = instance
export const quickLoginPlatform = platform
export const quickLoginApi = (path, data, token, method) => path.startsWith('/userinfo') && instance.probeSession
  ? instance.probeSession(token) : biometricApi(path, data, token, method)
