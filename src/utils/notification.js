import { vibrateHapticPattern } from './haptics.mjs'

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
        if (payload?.type === 'message') openChatNotification(payload)
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

/**
 * 使用 Web Audio API 生成通知声音（无需外部资源）
 * @param {string} type - 声音类型
 * @returns {Promise}
 */
function playGeneratedSound(type = 'default') {
  return new Promise((resolve) => {
    try {
      // #ifdef H5
      // 仅在 H5 环境使用 Web Audio API
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const now = audioContext.currentTime

      // 根据类型生成不同的音效
      let frequencies = []
      let durations = []

      if (type === 'bell') {
        // 铃声：高频 + 中频
        frequencies = [800, 600, 800]
        durations = [0.1, 0.1, 0.2]
      } else if (type === 'chime') {
        // 提示音：下降音阶
        frequencies = [800, 600, 400]
        durations = [0.15, 0.15, 0.15]
      } else {
        // 默认通知音：短促的高频音
        frequencies = [700]
        durations = [0.3]
      }

      let currentTime = now
      frequencies.forEach((freq, index) => {
        const osc = audioContext.createOscillator()
        const gain = audioContext.createGain()

        osc.connect(gain)
        gain.connect(audioContext.destination)

        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.3, currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, currentTime + durations[index])

        osc.start(currentTime)
        osc.stop(currentTime + durations[index])

        currentTime += durations[index] + 0.05 // 音符之间的间隔
      })

      // 播放完成后解决
      setTimeout(() => {
        audioContext.close().catch(() => {})
        resolve()
      }, (currentTime - now) * 1000)
      // #endif

      // #ifndef H5
      // 非 H5 环境直接返回
      resolve()
      // #endif
    } catch (e) {
      console.warn('生成通知声音失败:', e)
      resolve()
    }
  })
}

/**
 * 播放通知声音
 * @param {string} type - 声音类型：'default'(默认) / 'bell'(铃声) / 'chime'(提示音)
 */
export async function playNotificationSound(type = 'default') {
  try {
    // #ifdef H5
    await playGeneratedSound(type)
    return
    // #endif

    // 其他平台尝试使用本地或网络资源
    const soundFiles = {
      default: [
        // 微信小程序和 APP 使用 base64 编码的通知音（简单 wav 格式）
        // 这是一个 440Hz 正弦波 1 秒的 WAV 格式 base64 编码
        'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA=='
      ],
      bell: [
        'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA=='
      ],
      chime: [
        'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA=='
      ]
    }

    const soundUrl = soundFiles[type]?.[0] || soundFiles.default[0]

    const innerAudioContext = uni.createInnerAudioContext()
    innerAudioContext.src = soundUrl
    innerAudioContext.volume = 0.8

    return new Promise((resolve) => {
      let isResolved = false

      innerAudioContext.onPlay(() => {
        console.log('通知声音播放成功')
        if (!isResolved) {
          isResolved = true
          resolve()
        }
      })

      innerAudioContext.onError((err) => {
        console.warn('通知声音播放失败，已忽略:', err)
        if (!isResolved) {
          isResolved = true
          resolve()
        }
      })

      try {
        innerAudioContext.play()
      } catch (e) {
        console.warn('播放异常:', e)
        if (!isResolved) {
          isResolved = true
          resolve()
        }
      }

      // 3秒后停止
      setTimeout(() => {
        innerAudioContext.stop()
        if (!isResolved) {
          isResolved = true
          resolve()
        }
      }, 3000)
    })
  } catch (e) {
    console.warn('播放通知声音异常:', e)
  }
}

/**
 * 振动反馈
 * @param {number} pattern - 振动模式
 *   0: 单次轻量振动 (120ms)
 *   1: 单次较长振动 (160ms)
 *   2: 双击 (100ms + 100ms，中间留出间隔)
 */
export function vibrateNotification(pattern = 0) {
  void vibrateHapticPattern(pattern).catch(() => {})
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
 * @param {boolean} options.useSystemNotification - 是否使用系统通知 (默认 true)
 */
export async function notifyNewMessage(msgData, options = {}) {
  const {
    playSound = true,
    vibrate = true,
    showNotification: show = true,
    useSystemNotification = true
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

  // 播放声音
  if (playSound) {
    await playNotificationSound('default')
  }

  // 振动反馈
  if (vibrate) {
    vibrateNotification(0) // 短振
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
      notifyNewMessage(msgData, options)
      return true
    }
  } else {
    // 原生应用，始终显示通知
    notifyNewMessage(msgData, options)
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
