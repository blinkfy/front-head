// #ifdef APP-PLUS
import { captureIdentityAppPhoto, cancelIdentityAppCapture } from './identity-camera-app.js'
import { identityPhotoFileUrl } from './identity-photo-path.mjs'
// #endif
let miniCapture = null
export function discardIdentityPhoto(photo) {
  // #ifdef APP-PLUS
  if (photo?.path) plus.io.resolveLocalFileSystemURL(identityPhotoFileUrl(photo.path), entry => entry.remove(() => {}, () => {}), () => {})
  // #endif
  // #ifdef MP-WEIXIN
  if (photo?.path) uni.getFileSystemManager().unlink({ filePath: photo.path, fail() {} })
  // #endif
}
export function cancelIdentityCapture() {
  // #ifdef APP-PLUS
  cancelIdentityAppCapture()
  // #endif
  miniCapture?.cancel()
}
export async function captureIdentityPhoto(options = {}) {
  // #ifdef H5
  const { captureIdentityWebPhoto } = await import('./identity-camera-h5.js')
  return captureIdentityWebPhoto(options)
  // #endif
  // #ifdef APP-PLUS
  return captureIdentityAppPhoto(options)
  // #endif
  // #ifdef MP-WEIXIN
  if (miniCapture) throw new Error('正在认证，请勿重复打开')
  return new Promise((resolve, reject) => {
    let closed = false, channel
    const finish = (photo, error) => {
      if (closed) { discardIdentityPhoto(photo); return }
      closed = true; miniCapture = null
      channel?.off('captured'); channel?.off('captureCancelled')
      error ? reject(error) : resolve(photo)
    }
    miniCapture = { cancel: () => { channel?.emit('cancelCapture'); finish(null, Object.assign(new Error('已取消认证'), { cancelled: true })) } }
    uni.navigateTo({ url: `/pages-nonTheme/identity-camera?order=${options.actions?.[0] === 'mouth' ? 'mouth' : 'blink'}`,
      events: { captured: photo => finish(photo), captureCancelled: info => finish(null, Object.assign(new Error(info?.message || '已取消认证'), { cancelled: !info?.message })) },
      success: res => { channel = res.eventChannel; if (closed) channel?.emit('cancelCapture') },
      fail: () => finish(null, new Error('无法打开认证页面，请重新尝试')) })
  })
  // #endif
  // #ifndef H5 || APP-PLUS || MP-WEIXIN
  throw new Error('当前端请通过安全网页完成动作认证')
  // #endif
}

// Decode the actual result before making a paid verification request. This is
// invisible to the user and never adds a separate confirmation step.
export async function ensureIdentityPhotoUsable(photo) {
  // #ifdef H5
  if (!photo?.file?.size) throw new Error('认证失败')
  await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(photo.file), image = new Image()
    const timer = setTimeout(() => done(false), 15000)
    const done = ok => {
      clearTimeout(timer); image.onload = null; image.onerror = null; URL.revokeObjectURL(url)
      ok ? resolve() : reject(new Error('认证失败'))
    }
    image.onload = () => done(image.naturalWidth > 0 && image.naturalHeight > 0)
    image.onerror = () => done(false)
    image.src = url
  })
  // #endif
  // #ifndef H5
  if (!photo?.path) throw new Error('认证失败')
  await new Promise((resolve, reject) => uni.getImageInfo({ src: photo.preview || photo.path,
    success: info => info.width > 0 && info.height > 0 ? resolve() : reject(new Error('认证失败')),
    fail: () => reject(new Error('认证失败')) }))
  // #endif
}
