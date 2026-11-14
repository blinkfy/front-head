// #ifdef APP-PLUS
import { realtimeAvailable, realtimeSocketAlive, realtimeBackgroundMask, realtimeVideoVisible, openRealtimeSocket,
  sendRealtimeSocket, closeRealtimeSocket, setRealtimeForeground, watchRealtimeLocation, clearRealtimeLocation,
  onRealtimeSocketEvent, onRealtimeLocationEvent, takeRealtimeRoute, incomingCallPresentation, openIncomingCallSettings, configureRealtimeMessaging, realtimeMessagingPaused, realtimeSocketSuspended, takeIncomingCallAcceptance, controlNativeAnsweredCall, stopIncomingCallAlert } from '@/uni_modules/ftx-voice-call'
import { unlockedIncomingCallAllowed, openUnlockedIncomingCallSettings, backgroundPopupPermission, openBackgroundPopupSettings } from '@/uni_modules/ftx-voice-call'
// #endif
import { getOrCreatePushInstallationId } from './chat-push-installation.mjs'
import { readBackgroundMessagesEnabled, BACKGROUND_MESSAGES_KEY, writeBackgroundMessagesEnabled } from './background-message-preference.mjs'
import { areUiSoundsEnabled } from './ui-sounds.js'
import { requestRealtimePermissions } from './realtime-permissions.js'
// #ifdef APP-PLUS
import { syncNativeRecordingConfiguration } from './call-recordings.js'
import { appVersionGuard } from './app-version-guard.js'
// #endif
let channelSequence = 0
export function syncAndroidMessagingPreference() {
  // #ifdef APP-PLUS
  if (androidRealtimeAvailable()) {
    try {
      syncNativeRecordingConfiguration()
      if (realtimeMessagingPaused() && readBackgroundMessagesEnabled()) {
        uni.setStorageSync(BACKGROUND_MESSAGES_KEY, false)
        uni.$emit('chat:background-messages-state', false)
      }
      configureRealtimeMessaging(JSON.stringify({ enabled: readBackgroundMessagesEnabled(), sound: areUiSoundsEnabled(),
        installationId: getOrCreatePushInstallationId(key => uni.getStorageSync(key), (key, value) => uni.setStorageSync(key, value)) }))
    } catch (_) { try { configureRealtimeMessaging(JSON.stringify({ enabled: false })) } catch (_) {} }
  }
  // #endif
}

export function androidRealtimeAvailable() {
  // #ifdef APP-PLUS
  try { return typeof plus !== 'undefined' && plus.os.name === 'Android' && realtimeAvailable() === true } catch (_) {}
  // #endif
  return false
}
export function androidIncomingCallPresentation() {
  // #ifdef APP-PLUS
  try { if (androidRealtimeAvailable()) return incomingCallPresentation(areUiSoundsEnabled()) } catch (_) {}
  // #endif
  return ''
}
export function openAndroidIncomingCallSettings() {
  // #ifdef APP-PLUS
  try { if (androidRealtimeAvailable()) return openIncomingCallSettings(areUiSoundsEnabled()) } catch (_) {}
  // #endif
  return false
}

export function androidUnlockedIncomingCallAllowed() {
  // #ifdef APP-PLUS
  try { if (androidRealtimeAvailable()) return unlockedIncomingCallAllowed() } catch (_) {}
  // #endif
  return false
}

export function openAndroidUnlockedIncomingCallSettings() {
  // #ifdef APP-PLUS
  try { if (androidRealtimeAvailable()) return openUnlockedIncomingCallSettings() } catch (_) {}
  // #endif
  return false
}

export function androidBackgroundPopupPermission() {
  // #ifdef APP-PLUS
  try { if (androidRealtimeAvailable()) return backgroundPopupPermission() } catch (_) { return 'unknown' }
  // #endif
  return 'not_required'
}

export function openAndroidBackgroundPopupSettings() {
  // #ifdef APP-PLUS
  try { if (androidRealtimeAvailable()) return openBackgroundPopupSettings() } catch (_) {}
  // #endif
  return false
}

export function androidBackgroundMask() {
  // #ifdef APP-PLUS
  try { return androidRealtimeAvailable() ? realtimeBackgroundMask() : 0 } catch (_) {}
  // #endif
  return 0
}
export function androidVideoVisible() {
  // #ifdef APP-PLUS
  try { return androidRealtimeAvailable() && realtimeVideoVisible() } catch (_) {}
  // #endif
  return false
}
export function setAndroidRealtimeForeground(value) {
  // #ifdef APP-PLUS
  if (androidRealtimeAvailable()) setRealtimeForeground(value)
  // #endif
}
export function connectChatEventsSocket(options) {
  // #ifdef APP-PLUS
  options = { ...options, url: appVersionGuard().socketUrl(options.url) }
  if (androidRealtimeAvailable()) {
    let message, close, error, disposed = false
    const channel = `socket_${++channelSequence}`
    onRealtimeSocketEvent(json => {
      if (disposed) return
      try {
        const envelope = JSON.parse(json)
        if (envelope.channel !== channel) return
        const event = JSON.parse(envelope.event)
        if (event.type === 'message') {
          appVersionGuard().handleUpgrade(event.data)
          message?.({ data: event.data })
        }
        else if (event.type === 'close') close?.({ code: event.code })
        else if (event.type === 'status') {
          console.info('[chat-push]', { stage: 'background-receiver', status: event.data })
          if (['SERVICE_UNAVAILABLE', 'PAUSED'].includes(event.data)) {
            writeBackgroundMessagesEnabled(false)
            if (event.data === 'SERVICE_UNAVAILABLE') uni.showToast({ title: '后台接收服务未能启动，已关闭此模式', icon: 'none' })
          }
        }
      } catch (_) { error?.({}) }
    })
    syncAndroidMessagingPreference()
    openRealtimeSocket(options.url, channel)
    return { onMessage: fn => { message = fn }, onClose: fn => { close = fn }, onError: fn => { error = fn },
      isAlive: () => !disposed && realtimeSocketAlive(),
      isSuspended: () => !disposed && realtimeSocketSuspended(),
      send({ data, fail }) { if (disposed) fail?.(); else sendRealtimeSocket(data) },
      close() { if (!disposed) { disposed = true; closeRealtimeSocket() } } }
  }
  // #endif
  return uni.connectSocket(options)
}
export function watchAndroidRealtimeLocation(success, failure) {
  let stopped = false, id = null
  const channel = `location_${++channelSequence}`
  // #ifdef APP-PLUS
  const permissions = ['android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION']
  requestRealtimePermissions(permissions).then(result => {
    if (stopped) return
    if (!permissions.some(permission => result.granted?.includes(permission))) { failure({ code: 1 }); return }
    try {
      onRealtimeLocationEvent(json => {
        if (stopped) return
        try {
          const envelope = JSON.parse(json)
          if (envelope.channel !== channel) return
          const value = JSON.parse(envelope.event)
          if (value.error) failure({ code: value.error }); else success({ coords: value })
        }
        catch (_) { failure({ code: 2 }) }
      })
      const watchId = watchRealtimeLocation(channel)
      if (watchId > 0) {
        if (stopped) clearRealtimeLocation(watchId)
        else id = watchId
      }
      else failure({ code: 2 })
    } catch (_) { failure({ code: 2 }) }
  }, () => { if (!stopped) failure({ code: 1 }) })
  // #endif
  return () => {
    stopped = true
    // #ifdef APP-PLUS
    if (id !== null) clearRealtimeLocation(id)
    // #endif
  }
}
export function handleAndroidRealtimeReturn() {
  // #ifdef APP-PLUS
  if (androidRealtimeAvailable()) {
    const route = takeRealtimeRoute()
    if (/^\/pages-nonTheme\/(voice-call|live-location|chat|chatlist|system-notifications|settings)(\?|$)/.test(route)) {
      const pages = getCurrentPages()
      const page = pages[pages.length - 1]
      const path = route.split('?')[0].replace(/^\//, '')
      const query = Object.fromEntries((route.split('?')[1] || '').split('&').filter(Boolean).map(part => {
        const separator = part.indexOf('=')
        const key = separator < 0 ? part : part.slice(0, separator)
        const value = separator < 0 ? '' : part.slice(separator + 1)
        try { return [key, decodeURIComponent(value)] } catch (_) { return [key, value] }
      }))
      if (page?.route === path && path === 'pages-nonTheme/voice-call') {
        if (query.incomingCallId) uni.$emit('voice-call:notification-opened', query.incomingCallId)
      } else if (page?.route !== path || Object.keys(query).some(key => String((page.$page?.options || page.options)?.[key] ?? '') !== query[key])) {
        uni.navigateTo({ url: route })
      }
    }
  }
  // #endif
}

export function consumeAndroidIncomingAcceptance(callId) {
  // #ifdef APP-PLUS
  try { return androidRealtimeAvailable() && takeIncomingCallAcceptance(callId) === true } catch (_) {}
  // #endif
  return false
}

export function controlAndroidAnsweredCall(callId, options) {
  // #ifdef APP-PLUS
  if (androidRealtimeAvailable()) controlNativeAnsweredCall(callId, JSON.stringify(options))
  // #endif
}

export function stopAndroidIncomingAlert(callId) {
  // #ifdef APP-PLUS
  if (androidRealtimeAvailable() && callId) stopIncomingCallAlert(callId)
  // #endif
}
