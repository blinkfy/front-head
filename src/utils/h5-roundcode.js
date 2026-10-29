import { resolveWechatQrImage, prepareWechatQrImage } from '@/api/device.js'
import { baseUrl } from '@/api/settings.js'
import { createRegistrationApi, createRegistrationDialogs } from './registration-relay.mjs'
import { roundCodeDebugText } from './scan-debug.mjs'
import { createWebRoundCodeResolver } from './h5-roundcode-core.mjs'

const runtime = { request: options => uni.request(options), showModal: options => uni.showModal(options) }
const api = createRegistrationApi({ runtime, baseUrl })
export function prepareWebRoundCode() {
  const token = uni.getStorageSync('token') || ''
  return token ? prepareWechatQrImage(token) : Promise.reject(new Error('请先登录再识别微信圆码'))
}
const resolverDependencies = {
  getToken: () => uni.getStorageSync('token') || '',
  getAccount: () => {
    const user = uni.getStorageSync('userInfo') || {}
    return user.nickname || user.username || String(user.id || '')
  },
  resolveImage: resolveWechatQrImage,
  scanApp: api.scanApp, authorizeApp: api.authorizeApp, cancelApp: api.cancelApp,
  confirm: createRegistrationDialogs(runtime).confirm,
  notify: title => uni.showToast({ title, icon: 'none' })
}
export const resolveWebRoundCode = createWebRoundCodeResolver(resolverDependencies)

// Inspect without confirming login or navigating. Reuse this exact response on acceptance.
export async function previewWebRoundCode(imageBase64, isActive = () => true) {
  const token = resolverDependencies.getToken()
  if (!token) throw new Error('请先登录，再识别微信圆码')
  const current = () => isActive() && resolverDependencies.getToken() === token
  const response = await resolveWechatQrImage(imageBase64, token)
  if (!current()) return null
  const text = roundCodeDebugText(response?.data)
  const proceed = createWebRoundCodeResolver({ ...resolverDependencies, resolveImage: async () => {
    if (!current()) throw new Error('扫码页面或账号已变化，请重新扫码')
    return response
  } })
  return { text, accept: () => current() ? proceed(imageBase64, current) : Promise.resolve(null) }
}
