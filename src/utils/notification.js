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
export function showNotification(options = {}) {
  const {
    title = '新消息',
    content = '',
    icon = '💬',
    duration = 3000,
    onTap = null
  } = options

  uni.showToast({
    title: `${icon} ${title}`,
    icon: 'none',
    duration: Math.ceil(duration / 1000),
    mask: false
  })

  // 如果有点击回调，添加监听
  if (onTap && typeof onTap === 'function') {
    // uni.showToast 不支持直接点击回调，但可以通过其他方式处理
    // 这里预留接口供其他处理方式使用
    console.log('点击回调已预留，可通过其他途径调用:', onTap)
  }
}

/**
 * 显示系统通知（模态框风格）- iOS/Android 系统通知
 * @param {Object} options - 配置选项
 * @param {string} options.title - 通知标题
 * @param {string} options.content - 通知内容
 * @param {string} options.username - 发送者用户名
 */
export function showSystemNotification(options = {}) {
  const {
    title = '新消息',
    content = '',
    username = ''
  } = options

  // 优先使用本地通知（能在系统中显示）
  try {
    // #ifndef H5
    // 调用原生通知接口
    if (typeof plus !== 'undefined' && plus.push) {
      plus.push.createLocalNotification({
        title: username || title,
        content: content || '新消息',
        payload: {
          type: 'message'
        }
      })
      return
    }
    // #endif
  } catch (e) {
    console.warn('原生通知失败:', e)
  }

  // 备选方案：使用 uni 的系统通知
  uni.showToast({
    title: `${username || title}: ${content || ''}`,
    icon: 'none',
    duration: 2
  })
}

/**
 * 播放通知声音
 * @param {string} type - 声音类型：'default'(默认) / 'bell'(铃声) / 'chime'(提示音)
 */
export async function playNotificationSound(type = 'default') {
  try {
    // 创建音频上下文
    const soundFiles = {
      default: 'https://cdn.jsdelivr.net/npm/notification-sounds@latest/sound-1.mp3',
      bell: 'https://cdn.jsdelivr.net/npm/notification-sounds@latest/bell.mp3',
      chime: 'https://cdn.jsdelivr.net/npm/notification-sounds@latest/chime.mp3'
    }

    const soundUrl = soundFiles[type] || soundFiles.default

    // 使用 uni 的音频播放
    const innerAudioContext = uni.createInnerAudioContext()
    innerAudioContext.src = soundUrl
    innerAudioContext.volume = 1

    return new Promise((resolve, reject) => {
      innerAudioContext.onPlay(() => {
        console.log('通知声音播放中...')
        resolve()
      })
      innerAudioContext.onError(() => {
        console.warn('通知声音播放失败，可能是网络问题或浏览器限制')
        resolve() // 不拒绝，继续流程
      })

      try {
        innerAudioContext.play()
      } catch (e) {
        console.warn('播放通知声音异常:', e)
        resolve()
      }

      // 3秒后停止（防止持续播放）
      setTimeout(() => {
        innerAudioContext.stop()
        resolve()
      }, 3000)
    })
  } catch (e) {
    console.warn('播放通知声音失败:', e)
  }
}

/**
 * 振动反馈
 * @param {number} pattern - 振动模式
 *   0: 短振 (10ms)
 *   1: 长振 (100ms)
 *   2: 双击 (50ms + 50ms)
 */
export function vibrateNotification(pattern = 0) {
  try {
    const patterns = {
      0: [10], // 短振
      1: [100], // 长振
      2: [50, 50, 50] // 双击
    }

    const duration = patterns[pattern] || patterns[0]

    // 使用 uni 的振动接口
    uni.vibrate({
      duration: duration[0] || 10
    })

    // 多次振动可通过多次调用实现
    if (duration.length > 1) {
      let delay = duration[0]
      for (let i = 1; i < duration.length; i++) {
        setTimeout(() => {
          uni.vibrate({
            duration: duration[i]
          })
        }, delay + 50) // 间隔 50ms
        delay += duration[i] + 50
      }
    }
  } catch (e) {
    console.warn('振动反馈不可用:', e)
  }
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

  // 优先使用系统通知（如果启用且在APP中）
  if (useSystemNotification) {
    const platform = uni.getSystemInfoSync().platform
    if (platform !== 'web') {
      // APP环境，尝试显示系统通知
      try {
        showSystemNotification({
          title: senderName,
          content: displayContent
        })
      } catch (e) {
        console.warn('系统通知显示失败，回退到 toast:', e)
        if (show) {
          showNotification({
            title: senderName,
            content: displayContent,
            icon: '💬',
            duration: 3000
          })
        }
      }
    } else {
      // 浏览器环境，显示 toast
      if (show) {
        showNotification({
          title: senderName,
          content: displayContent,
          icon: '💬',
          duration: 3000
        })
      }
    }
  } else {
    // 显示 toast 通知
    if (show) {
      showNotification({
        title: senderName,
        content: displayContent,
        icon: '💬',
        duration: 3000
      })
    }
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
