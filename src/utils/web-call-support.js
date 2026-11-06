// Browser notifications are local to the existing signaling connection. No push
// subscription, polling, or additional server connection is created here.
let latest = null
let notification = null
let notifiedCall = ''
let originalTitle = null

export function webCallsAvailable() {
  // #ifdef H5
  return !!(globalThis.isSecureContext && globalThis.RTCPeerConnection && globalThis.navigator?.mediaDevices?.getUserMedia)
  // #endif
  // #ifndef H5
  return false
  // #endif
}

export function webCallNotificationsAvailable() {
  // #ifdef H5
  return webCallsAvailable() && typeof Notification !== 'undefined'
  // #endif
  // #ifndef H5
  return false
  // #endif
}

export async function requestWebCallNotifications() {
  // Must be called directly from an explicit button gesture.
  if (!webCallNotificationsAvailable()) return 'unsupported'
  try { return await Notification.requestPermission() } catch (_) { return 'denied' }
}

export function updateWebCallAlert(state, { sound = false, open = () => {} } = {}) {
  // #ifdef H5
  latest = { state, sound, open }
  if (notifiedCall && notifiedCall !== state.callId) {
    notification?.close(); notification = null; notifiedCall = ''
  }
  if (state.phase !== 'incoming') {
    notification?.close(); notification = null; notifiedCall = ''
    if (originalTitle !== null) { document.title = originalTitle; originalTitle = null }
    return
  }
  if (originalTitle === null) originalTitle = document.title
  document.title = `${state.mode === 'video' ? '视频' : '语音'}来电 · ${state.peer?.name || '联系人'}`
  if (!document.hidden || !webCallNotificationsAvailable() || Notification.permission !== 'granted' || notifiedCall === state.callId) return
  try {
    const callId = state.callId
    notification = new Notification('分投侠 · 来电', {
      body: `${state.peer?.name || '联系人'}邀请你${state.mode === 'video' ? '视频' : '语音'}通话`,
      tag: `voice-call-${callId}`, silent: !sound
    })
    notifiedCall = callId
    notification.onclick = () => {
      if (latest?.state.phase !== 'incoming' || latest.state.callId !== callId) return
      window.focus(); latest.open()
      notification?.close(); notification = null
    }
  } catch (_) {} // Some mobile browsers only support service-worker notifications.
  // #endif
}

export function refreshWebCallAlert() {
  if (latest) updateWebCallAlert(latest.state, latest)
}
