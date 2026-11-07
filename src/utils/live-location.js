import { reactive } from 'vue'
import { createLiveLocationController } from './live-location-core.mjs'
import { liveLocationTracker } from './live-location-tracker.js'
let sender = () => false
export const liveLocationState = reactive({ supported: false, phase: 'idle', sessionId: '', peer: null, selfPoint: null,
  peerPoint: null, peerJoined: false, locating: false, paused: false, reason: '', offers: {} })
export const liveLocations = createLiveLocationController({
  send: value => sender(value), tracker: liveLocationTracker,
  getOwner: () => uni.getStorageSync('token') || '',
  getSelfId: () => { const user = uni.getStorageSync('userInfo') || {}; return user.id || user.userId || user.user?.id || user.data?.id },
  changed: value => Object.assign(liveLocationState, value)
})
export const installLiveLocationSender = value => { sender = value }
