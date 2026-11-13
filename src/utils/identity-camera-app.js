import { baseUrl } from '@/api/settings.js'
import { onIdentityCaptureEvent, openIdentityCapture, updateIdentityCapture, closeIdentityCapture } from '@/uni_modules/ftx-identity-capture'
import { createIdentityNativeFlow } from './identity-native-flow.mjs'

let active = null
const MODEL_KEY = 'identity-face-model-0.10.21'
async function modelPath() {
  const saved = uni.getStorageSync(MODEL_KEY)
  if (saved) {
    try { await new Promise((resolve, reject) => plus.io.resolveLocalFileSystemURL(saved, resolve, reject)); return plus.io.convertLocalFileSystemURL(saved) } catch { uni.removeStorageSync(MODEL_KEY) }
  }
  const download = await new Promise((resolve, reject) => uni.downloadFile({ url: `${baseUrl}/identity-assets/0.10.21/face_landmarker.task`, timeout: 45000,
    success: res => res.statusCode === 200 && !Object.entries(res.header || {}).some(([key, value]) => key.toLowerCase() === 'content-type' && /text\/html/i.test(value))
      ? resolve(res.tempFilePath) : reject(new Error('认证拍摄暂不可用，请稍后重试')), fail: () => reject(new Error('拍摄资源下载失败，请检查网络')) }))
  const info = await new Promise((resolve, reject) => uni.getFileInfo({ filePath: download, success: resolve, fail: () => reject(new Error('无法读取拍摄资源，请重试')) }))
  if (info.size < 1024 * 1024 || info.size > 8 * 1024 * 1024) throw new Error('认证拍摄暂不可用，请稍后重试')
  const file = await new Promise((resolve, reject) => uni.saveFile({ tempFilePath: download, success: res => resolve(res.savedFilePath), fail: () => reject(new Error('无法保存拍摄资源，请检查存储空间')) }))
  uni.setStorageSync(MODEL_KEY, file)
  return plus.io.convertLocalFileSystemURL(file)
}
export function cancelIdentityAppCapture() { active?.cancel() }
export function captureIdentityAppPhoto({ actions } = {}) {
  if (active) return Promise.reject(new Error('正在拍摄，请勿重复打开'))
  return new Promise((resolve, reject) => {
    const id = `identity-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const flow = createIdentityNativeFlow(actions)
    let closed = false, timer, lightFeedback = 'not_run'
    const hidden = () => finish(null, Object.assign(new Error('已取消拍摄'), { cancelled: true }))
    const finish = (result, error) => {
      if (closed) return
      closed = true; clearTimeout(timer)
      uni.offAppHide?.(hidden)
      try { closeIdentityCapture(id) } catch { /* A missing custom base still rejects cleanly. */ }
      active = null
      error ? reject(error) : resolve(result)
    }
    active = { cancel: () => finish(null, Object.assign(new Error('已取消拍摄'), { cancelled: true })) }
    uni.onAppHide?.(hidden)
    timer = setTimeout(() => finish(null, new Error('拍摄超时，请重新开始')), 120000)
    try { onIdentityCaptureEvent(raw => {
      try {
        const event = JSON.parse(raw)
        if (closed || event.id !== id) {
          if (event.type === 'photo' && event.path) plus.io.resolveLocalFileSystemURL(event.path, entry => entry.remove(() => {}, () => {}), () => {})
          return
        }
        if (event.type === 'frame') {
          const state = flow.update(event, Date.now())
          if (state.capture) lightFeedback = state.lightFeedback
          updateIdentityCapture(JSON.stringify({ id, frameId: event.frameId, ...state }))
        } else if (event.type === 'light') updateIdentityCapture(JSON.stringify({ id, ...flow.toggleLight(Date.now()) }))
        else if (event.type === 'photo') finish({ path: event.path, assist: 'client_actions', lightFeedback })
        else if (event.type === 'cancel') active.cancel()
        else if (event.type === 'error') { if (event.code === 'MODEL') uni.removeStorageSync(MODEL_KEY); finish(null, new Error(event.message || '无法准备拍摄，请检查相机权限')) }
      } catch { finish(null, new Error('拍摄未完成，请重新开始')) }
    }) } catch { finish(null, new Error('请更新 App 安装包后重试端内拍摄')); return }
    ;(async () => {
      try {
        const path = await modelPath()
        if (!closed) {
          // Once its Activity/controller is open, native lifecycle owns background cancellation.
          uni.offAppHide?.(hidden)
          openIdentityCapture(JSON.stringify({ id, modelPath: path, actions }))
        }
      }
      catch (e) { finish(null, new Error(e.message || '请更新 App 安装包后重试端内拍摄')) }
    })()
  })
}
