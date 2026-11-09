import { reactive } from 'vue'
import { createMiniCallInbox } from './mini-call-inbox.mjs'
import { baseUrl } from '@/api/settings.js'
import { embeddedWebCallUrl, requestWebCallTicket } from './web-call-entry.mjs'
import { appendRecordingBridge } from './call-recordings.js'
import { receiveChatFeedback } from './chat-feedback.js'

let sender = () => false
const identity = () => {
  const user = uni.getStorageSync('userInfo') || {}
  return { token: uni.getStorageSync('token') || '', id: user.id || user.userId || user.user?.id || user.data?.id }
}
export const miniIncomingState = reactive({ callId: '', peer: null, mode: 'audio', opening: false, error: '' })
const appCallFallback = '网页通话暂不可用，请使用分投侠 App 接听。'
export const miniIncomingCalls = createMiniCallInbox({ state: miniIncomingState, identity, send: value => sender(value),
  notify: () => { void receiveChatFeedback().catch(() => {}) },
  show: fail => uni.navigateTo({ url: '/pages-nonTheme/incoming-call', fail }),
  entry: async offer => {
    const account = identity(), ticket = await requestWebCallTicket(uni, baseUrl, account.token)
    if (account.token !== identity().token) return ''
    if (!ticket) throw new Error(appCallFallback)
    const url = embeddedWebCallUrl(baseUrl, { peerId: offer.peer.id, selfId: account.id, name: offer.peer.name, mode: offer.mode }, ticket)
    if (!url) throw new Error(appCallFallback)
    return appendRecordingBridge(url + `&incomingCallId=${encodeURIComponent(offer.callId)}`)
  },
  open: url => new Promise((resolve, reject) => uni.redirectTo({ url: `/pages-nonTheme/webview?url=${encodeURIComponent(url)}`, success: resolve, fail: () => reject(new Error(appCallFallback)) })),
})
export const installMiniIncomingSender = value => { sender = value }
