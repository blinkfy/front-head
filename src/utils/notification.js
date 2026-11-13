import { receiveChatFeedback } from './chat-feedback.js'
import { queueBusinessNotification } from './business-notification.js'
import { foregroundNotifications, notificationAvatarUrl } from './foreground-notification.mjs'
import { baseUrl } from '@/api/settings.js'

/**
 * 前台统一使用可点击的顶部横幅，小程序由页面组件承载。
 * 后台系统通知沿用现有原生流程；提示音和振动仍交给共享反馈服务。
 */

/**
 * 显示前台顶部消息横幅
 * @param {Object} options - 配置选项
 * @param {string} options.title - 通知标题
 * @param {string} options.content - 通知内容
 * @param {string} options.icon - 无头像时的回退图标
 * @param {string} options.avatar - 发送者头像
 * @param {number} options.duration - 显示时长（毫秒），默认3000ms
 * @param {Function} options.onTap - 点击回调
 */
let nativeNavigationReady = false

export function openChatNotification(data = {}) {
  const groupId = data.groupId || (String(data.conversationId || '').startsWith('group:') ? String(data.conversationId).slice(6) : '')
  const otherId = data.otherId || data.conversationId
  if (!groupId && !otherId) return
  const query = groupId
    ? `conversationType=group&groupId=${encodeURIComponent(groupId)}&chatId=${encodeURIComponent(`group:${groupId}`)}`
    : `chatId=${encodeURIComponent(otherId)}&userId=${encodeURIComponent(otherId)}`
  uni.navigateTo({ url: `/pages-nonTheme/chat?${query}&title=${encodeURIComponent(data.senderName || data.title || '聊天')}` })
}

export function initChatNotificationNavigation() {
  // #ifdef APP-PLUS
  if (!nativeNavigationReady && typeof plus !== 'undefined' && plus.push) {
    nativeNavigationReady = true
    plus.push.addEventListener('click', (message) => {
      try {
        const payload = typeof message.payload === 'string' ? JSON.parse(message.payload) : message.payload
        if (payload?.type === 'business_notification' || payload?.notificationId) queueBusinessNotification(payload)
        else if (payload?.type === 'message') openChatNotification(payload)
      } catch (_) {}
    })
  }
  // #endif
}

export function showNotification(options = {}) {
  return foregroundNotifications.show({ ...options, avatar: notificationAvatarUrl(options.avatar, baseUrl) })
}

/**
 * 显示系统通知（模态框风格）- iOS/Android ϵͳ֪ͨ
 * @param {Object} options - 配置选项
 * @param {string} options.title - 通知标题
 * @param {string} options.content - 通知内容
 * @param {string} options.username - 发送者用户名
 */
export function showSystemNotification(options = {}) {
  const { title = '新消息', content = '', username = '', payload = {}, onTap } = options
  // #ifdef APP-PLUS
  try {
    if (typeof plus !== 'undefined' && plus.push) {
      initChatNotificationNavigation()
      plus.push.createMessage(content || '新消息', { ...payload, type: 'message' }, { title: username || title, cover: false })
      return
    }
  } catch (error) { console.warn('原生通知失败:', error) }
  // #endif
  showNotification({ title: username || title, content, avatar: options.avatar, duration: 3000, onTap })
}

// Chat feedback shares the existing sound switch and obeys the system policy.
export function playNotificationSound() {
  return receiveChatFeedback({ vibrate: false })
}

export function vibrateNotification() {
  return receiveChatFeedback({ sound: false })
}

/**
 * 完整的消息通知函数 - 模拟微信/QQ
 * @param {Object} msgData - 消息数据
 * @param {string} msgData.senderName - 发送者名称
 * @param {string} msgData.content - 消息内容
 * @param {string} msgData.type - 消息类型 ('text' / 'image' / 'voice' / 'file' 等)
 * @param {Object} options - 额外选项
 * @param {boolean} options.playSound - 是否播放声音 (默认 true)
 * @param {boolean} options.vibrate - 是否振动 (默认 true)
 * @param {boolean} options.showNotification - 是否显示顶部横幅 (默认 true)
 * @param {boolean} options.useSystemNotification - 是否使用系统通知 (默认 false；前台只显示应用内提示)
 */
export async function notifyNewMessage(msgData, options = {}) {
  const {
    playSound = true,
    vibrate = true,
    showNotification: show = true,
    useSystemNotification = false
  } = options

  const {
    senderName = '用户',
    content = '',
    type = 'text'
  } = msgData

  // 格式化消息内容
  let displayContent = content
  if (type === 'image') {
    displayContent = '[图片]'
  } else if (type === 'voice') {
    displayContent = '[语音]'
  } else if (type === 'video') {
    displayContent = '[视频]'
  } else if (type === 'file') {
    displayContent = `[文件: ${msgData.fileName || '未命名'}]`
  } else if (type === 'location') {
    displayContent = '[位置]'
  }

  if (msgData.senderLabel) displayContent = `${msgData.senderLabel}：${displayContent}`

  // 截断长内容
  if (displayContent.length > 50) {
    displayContent = displayContent.substring(0, 50) + '...'
  }

  if (show) {
    const notification = {
      title: senderName,
      avatar: msgData.senderAvatar || msgData.avatar,
      content: displayContent,
      duration: 3000,
      payload: { conversationId: msgData.conversationId, groupId: msgData.groupId, otherId: msgData.otherId, senderName },
      onTap: options.onTap || (() => openChatNotification(msgData))
    }
    if (useSystemNotification) showSystemNotification(notification)
    else showNotification(notification)
  }

  // Native system notifications own their alert; never play a second manual cue.
  if (!useSystemNotification || !show) {
    await receiveChatFeedback({ sound: playSound, vibrate, quiet: options.quiet })
  }
}

/**
 * 仅当应用在后台时显示通知
 * @param {Object} msgData - 消息数据
 */
export function notifyIfAppInBackground(msgData, options = {}) {
  // 获取应用状态
  const systemInfo = uni.getSystemInfoSync()

  // 在H5环境中，判断标签页是否可见
  if (systemInfo.platform === 'web') {
    if (document.hidden || document.webkitHidden) {
      // 应用在后台，显示通知
      notifyNewMessage(msgData, { ...options, useSystemNotification: true })
      return true
    }
  } else {
    // 原生应用，始终显示通知
    notifyNewMessage(msgData, { ...options, useSystemNotification: true })
    return true
  }

  return false
}

export default {
  showNotification,
  showSystemNotification,
  playNotificationSound,
  vibrateNotification,
  notifyNewMessage,
  notifyIfAppInBackground
}
