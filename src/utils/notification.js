import { receiveChatFeedback } from './chat-feedback.js'
import { queueBusinessNotification } from './business-notification.js'

/**
 * 系统消息通知工具
 * 模拟微信/QQ 的系统通知效果
 * 
 * ⚠️ 重要：微信小程序通知限制
 * ============================================
 * 微信小程序有严格的通知限制，无法发送系统通知（不支持）：
 * ❌ 不支持发送系统通知栏消息
 * ❌ 不支持后台通知
 * ❌ 不支持 LocalNotification API
 * 
 * ✅ 微信小程序可用的替代方案：
 * 1. 应用内 toast 提示（showToast）- 仅在小程序运行时显示
 * 2. 模态对话框（showModal）
 * 3. 加粗提示（showLoading）
 * 4. 通过服务端推送（需要用户主动打开小程序）
 * 
 * 平台支持对比：
 * ============================================
 * | 平台          | 系统通知 | 应用内提示 | 后台通知 |
 * |--------------|--------|----------|--------|
 * | Android App  | ✅     | ✅       | ✅     |
 * | iOS App      | ⚠️     | ✅       | ❌     |
 * | 微信小程序    | ❌     | ✅       | ❌     |
 * | H5 浏览器     | ⚠️     | ✅       | ❌     |
 * ============================================
 * 
 * 配置说明：
 * - APP 需要在 manifest.json 中配置推送和通知权限
 * - 微信小程序无需额外配置，仅支持应用内提示
 */

/**
 * 显示系统消息通知（toast 风格）
 * @param {Object} options - 配置选项
 * @param {string} options.title - 通知标题
 * @param {string} options.content - 通知内容
 * @param {string} options.icon - 图标或emoji
 * @param {number} options.duration - 显示时长（毫秒），默认3000ms
 * @param {Function} options.onTap - 点击回调
 */
let notificationTimer = null
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
  const { title = '新消息', content = '', icon = '💬', duration = 3000, onTap = null } = options
  // #ifdef H5
  if (typeof document !== 'undefined' && document.body) {
    document.getElementById('ftx-chat-notification')?.remove()
    if (notificationTimer) clearTimeout(notificationTimer)
    const banner = document.createElement('button')
    banner.id = 'ftx-chat-notification'
    banner.type = 'button'
    banner.textContent = `${icon} ${title}${content ? `：${content}` : ''}`
    banner.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top,0px) + 12px);left:16px;right:16px;max-width:440px;margin:auto;z-index:99999;padding:14px 18px;border:1px solid #e5e7eb;border-radius:14px;background:#fff;color:#1f2937;box-shadow:0 6px 24px #0002;font-size:14px;line-height:1.5;text-align:left;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
    banner.addEventListener('click', () => { banner.remove(); onTap?.() })
    document.body.appendChild(banner)
    notificationTimer = setTimeout(() => banner.remove(), duration)
    return
  }
  // #endif
  uni.showToast({ title: `${title}${content ? `：${content}` : ''}`, icon: 'none', duration, mask: false })
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
  showNotification({ title: username || title, content, duration: 3000, onTap })
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
 * @param {boolean} options.showNotification - 是否显示 toast (默认 true)
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

  // 截断长内容
  if (displayContent.length > 50) {
    displayContent = displayContent.substring(0, 50) + '...'
  }

  if (show) {
    const notification = {
      title: senderName,
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
