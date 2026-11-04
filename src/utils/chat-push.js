import { baseUrl } from '@/api/settings.js'
import { createPushRegistration } from './chat-push-registration.mjs'

let registration
export function installChatPush(getToken, deleteToken) {
  const key = 'chat:huawei-push-binding'
  registration = createPushRegistration({
    getToken: callback => getToken(raw => {
      // Only an authenticated Huawei device reaches the Android 13 permission prompt.
      let result
      try { result = JSON.parse(raw) } catch (_) { callback(raw); return }
      if (!result.token || typeof plus === 'undefined' || !plus.android) { callback(raw); return }
      try {
        const version = plus.android.importClass('android.os.Build$VERSION')
        if (Number(version.SDK_INT) < 33) { callback(raw); return }
        plus.android.requestPermissions(['android.permission.POST_NOTIFICATIONS'], permission => {
          callback(permission.granted?.includes('android.permission.POST_NOTIFICATIONS') ? raw : '{"error":"NOTIFICATIONS_DISABLED"}')
        }, () => callback('{"error":"NOTIFICATIONS_DISABLED"}'))
      } catch (_) { callback('{"error":"NOTIFICATIONS_UNAVAILABLE"}') }
    }), deleteToken,
    readBinding: () => uni.getStorageSync(key) || null,
    writeBinding: value => value ? uni.setStorageSync(key, value) : uni.removeStorageSync(key),
    request: (method, path, jwt, data) => new Promise((resolve, reject) => uni.request({
      url: `${baseUrl}${path}`, method, data, header: { Authorization: `Bearer ${jwt}` }, timeout: 7000,
      success: res => res.statusCode === 200 && res.data?.code === 0 ? resolve(res.data.data) : reject(new Error('Push unavailable')),
      fail: reject
    }))
  })
}
export function syncChatPush(jwt, force = false) { return registration?.sync(jwt, force) }
export function clearChatPush() { return registration?.logout() }
