import { resolveWechatQrImage, prepareWechatQrImage } from '@/api/device.js'
import { baseUrl } from '@/api/settings.js'
import { createRegistrationApi, createRegistrationDialogs } from './registration-relay.mjs'
import { createWebRoundCodeResolver } from './h5-roundcode-core.mjs'

const runtime = { request: options => uni.request(options), showModal: options => uni.showModal(options) }
const api = createRegistrationApi({ runtime, baseUrl })
export function prepareWebRoundCode() {
  const token = uni.getStorageSync('token') || ''
  return token ? prepareWechatQrImage(token) : Promise.reject(new Error('请先登录再识别微信圆码'))
}
export const resolveWebRoundCode = createWebRoundCodeResolver({
  getToken: () => uni.getStorageSync('token') || '',
  getAccount: () => {
    const user = uni.getStorageSync('userInfo') || {}
    return user.nickname || user.username || String(user.id || '')
  },
  resolveImage: resolveWechatQrImage,
  scanApp: api.scanApp, authorizeApp: api.authorizeApp, cancelApp: api.cancelApp,
  confirm: createRegistrationDialogs(runtime).confirm,
  notify: title => uni.showToast({ title, icon: 'none' })
})
