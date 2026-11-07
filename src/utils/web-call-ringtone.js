import { reactive } from 'vue'
import { areUiSoundsEnabled } from './ui-sounds.js'
import { createIncomingRingtone } from './incoming-ringtone-core.mjs'
// #ifdef H5
import incomingRingtoneUrl from '@/static/app/sounds/09-incoming-call.mp3?url'
import { createWebRingtoneDriver } from './web-ringtone-driver.mjs'
// #endif

export const webCallRingtoneState = reactive({ blocked: false })
let ringing = null, installed = false

// #ifdef H5
const driver = createWebRingtoneDriver({
  createContext() {
    const Context = window.AudioContext || window.webkitAudioContext
    if (!Context) throw new Error('Web Audio is unavailable')
    return new Context()
  },
  async loadBuffer(context) {
    const request = new AbortController(), timeout = setTimeout(() => request.abort(), 5000)
    try {
      // Bundle with H5 instead of depending on the backend's public directory.
      const response = await fetch(incomingRingtoneUrl, { signal: request.signal })
      if (!response.ok || /text\/html/i.test(response.headers.get('content-type') || '')) throw new Error('Incoming ringtone unavailable')
      return await context.decodeAudioData(await response.arrayBuffer())
    } finally { clearTimeout(timeout) }
  }
})
function controller() {
  if (!ringing) ringing = createIncomingRingtone({ driver,
    getOwner: () => uni.getStorageSync('token') || '', enabled: areUiSoundsEnabled,
    changed: state => { webCallRingtoneState.blocked = state.blocked }
  })
  return ringing
}
// #endif

export function initWebCallRingtone() {
  // #ifdef H5
  if (installed) return
  installed = true
  controller()
  for (const event of ['pointerdown', 'touchend', 'keydown', 'click']) document.addEventListener(event, primeWebCallRingtone, { capture: true, passive: true })
  document.addEventListener('WeixinJSBridgeReady', primeWebCallRingtone)
  window.addEventListener('pagehide', () => ringing.stop())
  // #endif
}
export function updateWebCallRingtone(state) {
  // #ifdef H5
  initWebCallRingtone()
  controller().update(state)
  // #endif
}
export function primeWebCallRingtone() {
  // #ifdef H5
  initWebCallRingtone()
  controller().retry()
  // #endif
}
