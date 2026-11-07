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
export const miniIncomingCalls = createMiniCallInbox({ state: miniIncomingState, identity, send: value => sender(value),
  notify: () => { void receiveChatFeedback().catch(() => {}) },
  show: fail => uni.navigateTo({ url: '/pages-nonTheme/incoming-call', fail }),
  entry: async offer => {
    const account = identity(), ticket = await requestWebCallTicket(uni, baseUrl, account.token)
    if (account.token !== identity().token) return ''
    if (!ticket) throw new Error('无法登录通话，请检查网络或更新服务')
    const url = embeddedWebCallUrl(baseUrl, { peerId: offer.peer.id, selfId: account.id, name: offer.peer.name, mode: offer.mode }, ticket)
    return url ? appendRecordingBridge(url + `&incomingCallId=${encodeURIComponent(offer.callId)}`) : ''
  },
  open: url => new Promise((resolve, reject) => uni.redirectTo({ url: `/pages-nonTheme/webview?url=${encodeURIComponent(url)}`, success: resolve, fail: () => reject(new Error('通话页面打开失败，请重试')) })),
})
export const installMiniIncomingSender = value => { sender = value }
