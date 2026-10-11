import { baseUrl } from '@/api/settings.js'
import { getWechatLoginCode } from '@/utils/wechat-login.mjs'
import { createRegistrationApi, createMiniRegistrationRelay, createRegistrationDialogs } from './registration-relay.mjs'

// H5 production only includes APIs referenced as uni.<method>; passing the
// namespace itself to a helper does not retain request/storage implementations.
export const registrationRuntime = {
  request: options => uni.request(options),
  showModal: options => uni.showModal(options),
  getStorageSync: key => uni.getStorageSync(key),
  setStorageSync: (key, value) => uni.setStorageSync(key, value),
  removeStorageSync: key => uni.removeStorageSync(key)
}
export const registrationApi = createRegistrationApi({ runtime: registrationRuntime, baseUrl })
const dialogs = createRegistrationDialogs(registrationRuntime)
export const miniRegistrationRelay = createMiniRegistrationRelay({
  api: registrationApi,
  getCode: () => getWechatLoginCode(uni),
  confirm: dialogs.confirm,
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
    const retry = await dialogs.retry()
    if (retry && retryToken === uni.getStorageSync('token')) void confirmRegistrationLogin(retryToken, account)
  } catch (error) {
    uni.showToast({ title: error.message || '确认窗口未能打开，请重试网页登录', icon: 'none', duration: 3000 })
  } finally { retryPromptRunning = false }
}
