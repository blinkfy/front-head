import { createAppQrScanner } from './app-qr-scanner-core.mjs'
import { createRegistrationApi, createRegistrationDialogs } from './registration-relay.mjs'
import { resolveWechatQrRaw } from '@/api/device.js'
import { baseUrl } from '@/api/settings.js'
import { createScanDebugAccess } from './scan-debug.mjs'
import { vibrateScan } from './haptics.mjs'
// #ifdef APP-PLUS
import { startScan, startScanWithDiagnostics, isAvailable } from '@/uni_modules/ftx-qbar'
// #endif

let scanner
function getScanner() {
  if (scanner) return scanner
  const runtime = { request: options => uni.request(options), showModal: options => uni.showModal(options) }
  const api = createRegistrationApi({ runtime, baseUrl })
  const dialogs = createRegistrationDialogs(runtime)
  scanner = createAppQrScanner({
    nativeScan: () => new Promise((resolve, reject) => {
      // #ifdef APP-PLUS
      try {
        if (typeof isAvailable !== 'function' || isAvailable() !== true) { resolve({ error: 'UNAVAILABLE' }); return }
        const diagnostics = createScanDebugAccess(uni)
        const scan = diagnostics() && typeof startScanWithDiagnostics === 'function' ? startScanWithDiagnostics : startScan
        scan(value => {
          let result
          try { result = JSON.parse(value) } catch (error) { reject(error); return }
          if (!result?.error && (result?.scanType === 'QR_CODE' || result?.scanType === 'WX_CODE')) {
            void vibrateScan()
          }
          resolve(result)
        })
      } catch (error) { reject(error) }
      // #endif
      // #ifndef APP-PLUS
      resolve({ error: 'UNSUPPORTED' })
      // #endif
    }),
    standardScan: () => new Promise((resolve, reject) => uni.scanCode({ scanType: ['qrCode'], success: resolve,
      fail: error => /cancel/i.test(error?.errMsg || '') ? resolve(null) : reject(error) })),
    resolveRaw: resolveWechatQrRaw,
    scanApp: api.scanApp,
    authorizeApp: api.authorizeApp,
    cancelApp: api.cancelApp,
    getToken: () => uni.getStorageSync('token') || '',
    getAccount: () => {
      const user = uni.getStorageSync('userInfo') || {}
      return user.nickname || user.username || String(user.id || '')
    },
    confirm: dialogs.confirm,
    fallback: message => new Promise(resolve => uni.showModal({ title: '圆码识别提示', content: message,
      confirmText: '普通扫码', cancelText: '取消', success: answer => resolve(answer.confirm === true), fail: () => resolve(false) })),
    notify: title => uni.showToast({ title, icon: 'none' })
  })
  return scanner
}

export function scanWithAppQbar(options = {}) {
  void getScanner().scan().then(result => {
    if (result) options.success?.(result)
    options.complete?.(result || { handled: true })
  }).catch(error => { options.fail?.(error); options.complete?.(error) })
}
