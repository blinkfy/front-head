import { realtimeActivityCard } from './realtime-activity.mjs'
import { webCallsAvailable, refreshWebCallAlert } from './web-call-support.js'
import { baseUrl } from '@/api/settings.js'
import { syncChatPush } from './chat-push.js'
import { messageBus, triggerMessageNotification } from './message-event-bus.js'
import { initChatNotificationNavigation } from './notification.js'
import { createChatEventsTransport } from './chat-events-transport.mjs'
import { showNotification } from './notification.js'
import { userNotificationUrl } from '@/utils/user-notifications.js'
import { createNotificationCatchup } from './notification-catchup.mjs'
import { receiveChatFeedback, setChatFeedbackActive } from './chat-feedback.js'
import { voiceCalls, installVoiceCallSender } from './voice-call.js'
import { liveLocations, liveLocationState, installLiveLocationSender } from './live-location.js'
import { realtimePermissionPending } from './realtime-permissions.js'
import { webLocationAvailable } from './live-location-tracker.js'
import { connectChatEventsSocket, androidBackgroundMask, androidVideoVisible, setAndroidRealtimeForeground, handleAndroidRealtimeReturn, syncAndroidMessagingPreference } from './android-realtime.js'

let activityMessages = false
let delegated = false
let requestedActive = false
let foreground = false
let currentConversation = ''
const seen = new Map()
const token = () => {
    const jwt = uni.getStorageSync('token') || ''
    if (foreground) syncChatPush(jwt)
    return jwt
}
const catchup = createNotificationCatchup({
    getToken: () => uni.getStorageSync('token') || '',
    readState: key => uni.getStorageSync(key), writeState: (key, value) => uni.setStorageSync(key, value),
    request: account => new Promise((resolve, reject) => uni.request({
        url: `${baseUrl}/api/chat/notifications/summary`, method: 'GET',
        header: { Authorization: `Bearer ${account}` }, timeout: 7000,
        success: res => res.statusCode === 200 && res.data?.code === 0 ? resolve(res.data.data) : reject(new Error('Summary unavailable')),
        fail: reject
    })),
    notify: ({ chat, system, account }) => {
      if (chat) void receiveChatFeedback({ quiet: !!currentConversation, vibrate: !currentConversation })
      showNotification({
        title: '未读消息提醒', content: chat && system ? '有新的未读聊天和系统通知' : system ? '有新的未读系统通知' : '有新的未读聊天消息',
        icon: '', duration: 5000,
        onTap: () => {
            if (account !== (uni.getStorageSync('token') || '')) return
            uni.navigateTo({ url: !chat && system ? '/pages-nonTheme/system-notifications' : '/pages-nonTheme/chatlist' })
        }
      })
    }
})

export function setActiveChatConversation(id = '') { currentConversation = String(id) }

export function notifyChatEvent(event) {
    if (!foreground || event.kind !== 'message' || event.muted || event.isSelf) return
    const message = event.message || {}
    const user = uni.getStorageSync('userInfo') || {}
    const ownId = user.id || user.userId || user.user?.id || user.data?.id
    if (String(message.senderId) === String(ownId)) return
    const inConversation = String(event.conversationId) === currentConversation
    const key = `${token()}:${event.conversationId}:${message.id}`
    if (message.isWithdraw || !message.id || seen.has(key)) return
    const shouldNotify = catchup.seen(ownId, event.groupId ? 'group' : 'direct', message.id)
    seen.set(key, true)
    if (seen.size > 500) seen.delete(seen.keys().next().value)
    if (!shouldNotify) return
    let content = message.content || ''
    try { if (message.type !== 'text' && typeof content === 'string') content = JSON.parse(content) } catch (_) {}
    triggerMessageNotification({
        senderName: event.title || event.sender?.nickname || event.sender?.username || '新消息',
        content: realtimeActivityCard(message) ? (event.notificationBody || message.content) : typeof content === 'string' ? content : '', type: message.type,
        fileName: content?.fileName || content?.name,
        conversationId: event.conversationId, groupId: event.groupId, otherId: event.otherId
    }, { showNotification: !inConversation, vibrate: !inConversation, quiet: inConversation }).catch(() => {})
}

const transport = createChatEventsTransport({
    getToken: token, getBaseUrl: () => baseUrl, connectSocket: connectChatEventsSocket,
    onEvent(event) {
        if (String(event.type || '').startsWith('voice.')) { voiceCalls.handle(event); return }
        if (String(event.type || '').startsWith('location.')) {
            const known = liveLocationState.offers[String(event.from?.id)]?.sessionId === event.sessionId
            liveLocations.handle(event)
            if (event.type === 'location.offer' && (event.messageFallback === true || (!activityMessages && !known)) && foreground &&
                liveLocationState.offers[String(event.from?.id)]?.sessionId === event.sessionId &&
                String(event.from.id) !== currentConversation) {
                const account = uni.getStorageSync('token') || ''
                const key = `${account}:location-offer:${event.sessionId}`
                if (seen.has(key)) return
                seen.set(key, true)
                if (seen.size > 500) seen.delete(seen.keys().next().value)
                showNotification({ title: `${event.from.name || '联系人'}正在共享位置`, content: '点击进入，同时共享我的位置', icon: '',
                    onTap: () => {
                        if ((uni.getStorageSync('token') || '') !== account) return
                        uni.navigateTo({ url: `/pages-nonTheme/live-location?peerId=${encodeURIComponent(event.from.id)}&name=${encodeURIComponent(event.from.name || '联系人')}&sessionId=${encodeURIComponent(event.sessionId)}` })
                    } })
            }
            return
        }
        if (event.type === 'notification.changed') {
            messageBus.emit('notification.changed', event)
            const item = event.notification
            const account = token()
            const key = `${account}:notification:${item?.id}`
            if (foreground && item?.id && !seen.has(key)) {
                const shouldNotify = catchup.seen(item.recipientId, 'system', item.id)
                seen.set(key, true)
                if (seen.size > 500) seen.delete(seen.keys().next().value)
                if (!shouldNotify) return
                showNotification({ title: item.title, content: item.content, icon: '', onTap: () => {
                    if (token() !== account) return
                    const url = userNotificationUrl(item)
                    if (url) uni.navigateTo({ url })
                } })
            }
            return
        }
        if (event.type === 'community.changed') { messageBus.emit('community.changed', event); return }
        messageBus.emit('chat.changed', event)
        notifyChatEvent(event)
    },
    onDisconnected() { activityMessages = false; voiceCalls.connection(false); liveLocations.connection(false) },
    onConnected(event) {
        activityMessages = event.activityMessagesVersion === 1
        voiceCalls.connection(true, event.voiceCallVersion, event.videoCallVersion)
        liveLocations.connection(true, event.liveLocationVersion)
        void catchup.check()
        if (event.reconnected) messageBus.emit('chat.reconnected', {})
    }
})

installVoiceCallSender(event => transport.send(event))
installLiveLocationSender(event => transport.send(event))

export function isChatEventsConnected() { return transport.isConnected() }

export function setChatEventsDelegated(value) {
    delegated = !!value
    setChatEventsActive(requestedActive)
}

export function setChatEventsActive(active) {
    requestedActive = !!active
    active = requestedActive && !delegated
    foreground = !!active || androidVideoVisible() || (!delegated && realtimePermissionPending())
    syncAndroidMessagingPreference()
    const background = foreground ? 0 : androidBackgroundMask()
    setAndroidRealtimeForeground(foreground)
    voiceCalls.setActive(foreground || webCallsAvailable() || !!(background & 1))
    liveLocations.setActive(foreground || webLocationAvailable() || !!(background & 2))
    setChatFeedbackActive(foreground)
    catchup.setActive(foreground)
    initChatNotificationNavigation()
    transport.setActive(foreground || webCallsAvailable() || webLocationAvailable() || !!background)
    if (active) handleAndroidRealtimeReturn()
    if (!foreground) currentConversation = ''
}

uni.$on('chat:background-messages-changed', () => { syncAndroidMessagingPreference() })
uni.$on('realtime:permission-changed', () => setChatEventsActive(requestedActive))

// #ifdef H5
if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        setChatEventsActive(!document.hidden)
        liveLocations.setVisible(!document.hidden)
        refreshWebCallAlert()
    })
    window.addEventListener('pagehide', event => {
        voiceCalls.setActive(false)
        if (event?.persisted) liveLocations.setVisible(false)
        else liveLocations.setActive(false)
        transport.setActive(false)
    })
    window.addEventListener('pageshow', () => {
        setChatEventsActive(!document.hidden)
        liveLocations.setVisible(!document.hidden)
    })
}
// #endif
