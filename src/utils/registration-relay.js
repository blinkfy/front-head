import { baseUrl } from '@/api/settings.js'
import { getWechatLoginCode } from '@/utils/wechat-login.mjs'
import { createRegistrationApi, createMiniRegistrationRelay } from './registration-relay.mjs'

export const registrationApi = createRegistrationApi({ runtime: uni, baseUrl })
const modal = options => new Promise(resolve => uni.showModal({ ...options,
  success: answer => resolve(answer.confirm), fail: () => resolve(false) }))
export const miniRegistrationRelay = createMiniRegistrationRelay({
  api: registrationApi,
  getCode: () => getWechatLoginCode(uni),
  confirm: (account, sessionId) => modal({ title: '确认登录网页',
    content: `是否使用当前账号${account ? '“' + account + '”' : ''}登录刚才扫码的分投侠网页（${sessionId.slice(-6)}）？请仅确认您本人打开的网页。`,
    confirmText: '确认登录', cancelText: '取消网页登录' }),
  onError: error => uni.showToast({ title: error.msg || error.message || '网页登录未完成，可单独重试', icon: 'none', duration: 3000 })
})

export function captureRegistrationEntry(options) {
  if (miniRegistrationRelay.capture(options?.query?.scene || options?.scene)) void miniRegistrationRelay.scan()
}

let confirmationRunning = false
let retryToken = ''
// Retrying only repeats WeChat verification/authorization, never registration, login or merge.
export async function confirmRegistrationLogin(token, account, isActive = () => true) {
  if (confirmationRunning || !token || !miniRegistrationRelay.getPending()) return
  confirmationRunning = true
  retryToken = token
  let needsRetry = false
  try {
    const result = await miniRegistrationRelay.authorize(token, account,
      () => isActive() && token === uni.getStorageSync('token'))
    needsRetry = result === false && Boolean(miniRegistrationRelay.getPending()) && isActive()
  } finally { confirmationRunning = false }
  if (needsRetry) void offerRegistrationRetry(account)
}

let retryPromptRunning = false
export async function offerRegistrationRetry(account = '') {
  if (retryPromptRunning || !retryToken || retryToken !== uni.getStorageSync('token') || !miniRegistrationRelay.getPending()) return
  retryPromptRunning = true
  try {
    const retry = await modal({ title: '网页登录未完成', content: '您已在小程序登录成功。可单独重试网页登录，或继续使用小程序。',
      confirmText: '重试网页登录', cancelText: '继续小程序' })
    if (retry && retryToken === uni.getStorageSync('token')) void confirmRegistrationLogin(retryToken, account)
  } finally { retryPromptRunning = false }
}
