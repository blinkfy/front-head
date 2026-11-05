import { baseUrl } from '@/api/settings.js'
import { syncChatPush } from './chat-push.js'
import { messageBus, triggerMessageNotification } from './message-event-bus.js'
import { initChatNotificationNavigation } from './notification.js'
import { createChatEventsTransport } from './chat-events-transport.mjs'
import { showNotification } from './notification.js'
import { userNotificationUrl } from '@/pages-nonTheme/utils/user-notifications.js'

let foreground = false
let currentConversation = ''
const seen = new Map()
const token = () => {
    const jwt = uni.getStorageSync('token') || ''
    syncChatPush(jwt)
    return jwt
}

export function setActiveChatConversation(id = '') { currentConversation = String(id) }

export function notifyChatEvent(event) {
    if (!foreground || event.kind !== 'message' || event.muted || event.isSelf) return
    const message = event.message || {}
    const user = uni.getStorageSync('userInfo') || {}
    const ownId = user.id || user.userId || user.user?.id || user.data?.id
    if (String(message.senderId) === String(ownId) || String(event.conversationId) === currentConversation) return
    const key = `${token()}:${event.conversationId}:${message.id}`
    if (message.isWithdraw || !message.id || seen.has(key)) return
    seen.set(key, true)
    if (seen.size > 500) seen.delete(seen.keys().next().value)
    let content = message.content || ''
    try { if (message.type !== 'text' && typeof content === 'string') content = JSON.parse(content) } catch (_) {}
    triggerMessageNotification({
        senderName: event.title || event.sender?.nickname || event.sender?.username || '新消息',
        content: typeof content === 'string' ? content : '', type: message.type,
        fileName: content?.fileName || content?.name,
        conversationId: event.conversationId, groupId: event.groupId, otherId: event.otherId
    }).catch(() => {})
}

const transport = createChatEventsTransport({
    getToken: token, getBaseUrl: () => baseUrl, connectSocket: options => uni.connectSocket(options),
    onEvent(event) {
        if (event.type === 'notification.changed') {
            messageBus.emit('notification.changed', event)
            const item = event.notification
            const account = token()
            const key = `${account}:notification:${item?.id}`
            if (foreground && item?.id && !seen.has(key)) {
                seen.set(key, true)
                if (seen.size > 500) seen.delete(seen.keys().next().value)
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
    onConnected(event) {
        if (event.reconnected) messageBus.emit('chat.reconnected', {})
    }
})

export function isChatEventsConnected() { return transport.isConnected() }

export function setChatEventsActive(active) {
    foreground = !!active
    initChatNotificationNavigation()
    transport.setActive(foreground)
    if (!foreground) currentConversation = ''
}
