import { getUserNotification, readUserNotifications, userNotificationUrl } from '@/utils/user-notifications.js'
import { onAppPageReady } from './app-page-ready.mjs'

const pendingKey = 'recycling:pending-notification'
let installed = false
let opening = false
let lastRuntimeId = ''
const safeId = value => /^\d{1,16}$/.test(String(value || '')) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? String(value) : ''

export function businessNotificationId(value) {
  const match = /^fentouxia:\/\/notification\/(\d{1,16})(?:[?#].*)?$/.exec(String(value || ''))
  return match ? safeId(match[1]) : ''
}

export function queueBusinessNotification(value) {
  const id = safeId(value?.notificationId || value?.id || value)
  if (!id) return
  uni.setStorageSync(pendingKey, id)
  onAppPageReady(() => { void resumeBusinessNotification() })
}

export async function resumeBusinessNotification() {
  const id = safeId(uni.getStorageSync(pendingKey))
  const account = uni.getStorageSync('token') || ''
  if (!id || !account || opening) return
  opening = true
  try {
    const response = await getUserNotification(id)
    if (account !== (uni.getStorageSync('token') || '')) return
    if (response?.code !== 0 || !response.data) throw new Error('通知不存在或当前账号无权查看')
    const url = userNotificationUrl(response.data) || '/pages-nonTheme/system-notifications'
    if (String(uni.getStorageSync(pendingKey)) !== id) return
    uni.removeStorageSync(pendingKey)
    await readUserNotifications({ ids: [id] }).catch(() => {})
    if (account === (uni.getStorageSync('token') || '')) uni.navigateTo({ url })
  } catch (_) {
    if (account === (uni.getStorageSync('token') || '') && String(uni.getStorageSync(pendingKey)) === id) {
      uni.removeStorageSync(pendingKey)
      uni.navigateTo({ url: '/pages-nonTheme/system-notifications' })
    }
  } finally { opening = false }
}

function captureRuntimeIntent(force = false) {
  // #ifdef APP-PLUS
  try {
    let id = businessNotificationId(plus.runtime.arguments)
    if (plus.android) {
      const intent = plus.android.runtimeMainActivity().getIntent()
      id = safeId(intent.getStringExtra('ftxNotificationId')) || businessNotificationId(intent.getDataString()) || id
    }
    if (id && (force || id !== lastRuntimeId)) { lastRuntimeId = id; queueBusinessNotification(id) }
  } catch (_) {}
  // #endif
}

export function initBusinessNotificationNavigation() {
  // #ifdef APP-PLUS
  if (typeof plus === 'undefined') return
  if (!installed) {
    installed = true
    plus.globalEvent.addEventListener('newintent', () => captureRuntimeIntent(true))
    // A notification opened while signed out is resolved after login navigation.
    for (const name of ['reLaunch', 'redirectTo']) uni.addInterceptor(name, { success() { onAppPageReady(() => { setTimeout(() => { void resumeBusinessNotification() }, 0) }) } })
    onAppPageReady(() => { void resumeBusinessNotification() })
  }
  captureRuntimeIntent()
  // #endif
}
