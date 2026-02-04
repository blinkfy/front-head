/**
 * 全局消息事件总线
 * 用于在应用任何地方触发和监听消息通知
 */

import { notifyNewMessage } from './notification.js'

/**
 * 事件监听器存储
 */
const listeners = {
  'message.received': [],    // 新消息接收
  'message.unread': [],      // 未读消息更新
  'chat.updated': [],        // 聊天更新
  'list.updated': []         // 列表更新
}

/**
 * 全局事件总线
 */
export const messageBus = {
  /**
   * 订阅事件
   * @param {string} eventName - 事件名称
   * @param {Function} callback - 回调函数
   */
  on(eventName, callback) {
    if (!listeners[eventName]) {
      listeners[eventName] = []
    }
    listeners[eventName].push(callback)
    console.log(`✅ 已订阅事件: ${eventName}`)
  },

  /**
   * 取消订阅事件
   * @param {string} eventName - 事件名称
   * @param {Function} callback - 回调函数
   */
  off(eventName, callback) {
    if (!listeners[eventName]) return

    const index = listeners[eventName].indexOf(callback)
    if (index > -1) {
      listeners[eventName].splice(index, 1)
      console.log(`❌ 已取消订阅事件: ${eventName}`)
    }
  },

  /**
   * 发出事件
   * @param {string} eventName - 事件名称
   * @param {*} data - 事件数据
   */
  emit(eventName, data) {
    if (!listeners[eventName]) return

    console.log(`📢 发出事件: ${eventName}`, data)
    listeners[eventName].forEach(callback => {
      try {
        callback(data)
      } catch (e) {
        console.error(`事件处理错误 (${eventName}):`, e)
      }
    })
  }
}

/**
 * 触发新消息通知
 * 这是应用中任何地方都可以调用的统一接口
 * 
 * @param {Object} msgData - 消息数据
 * @param {string} msgData.senderName - 发送者名称
 * @param {string} msgData.content - 消息内容
 * @param {string} msgData.type - 消息类型 ('text', 'image', 'voice', 'video', 'file', 'location')
 * @param {string} msgData.fileName - 文件名（仅 type='file' 时需要）
 * @param {Object} options - 通知选项
 * @param {boolean} options.playSound - 是否播放声音，默认 true
 * @param {boolean} options.vibrate - 是否振动，默认 true
 * @param {boolean} options.showNotification - 是否显示 toast，默认 true
 * @param {boolean} options.emit - 是否发出事件，默认 true
 */
export async function triggerMessageNotification(msgData, options = {}) {
  const {
    playSound = true,
    vibrate = true,
    showNotification = true,
    emit: shouldEmit = true
  } = options

  try {
    // 触发全局事件
    if (shouldEmit) {
      messageBus.emit('message.received', msgData)
    }

    // 调用通知函数
    await notifyNewMessage(msgData, {
      playSound,
      vibrate,
      showNotification
    })
  } catch (e) {
    console.error('触发消息通知失败:', e)
  }
}

/**
 * 触发未读消息更新事件
 * 当未读消息数量改变时调用
 * 
 * @param {Object} unreadData - 未读数据
 * @param {string} unreadData.userId - 用户ID
 * @param {number} unreadData.count - 未读消息数
 * @param {string} unreadData.userName - 用户名
 */
export function triggerUnreadUpdate(unreadData) {
  messageBus.emit('message.unread', unreadData)
  console.log('📊 未读消息更新:', unreadData)
}

/**
 * 触发聊天更新事件
 * 当聊天内容更新时调用
 * 
 * @param {Object} chatData - 聊天数据
 * @param {string} chatData.chatId - 聊天ID
 * @param {string} chatData.lastMessage - 最后一条消息
 * @param {number} chatData.timestamp - 时间戳
 */
export function triggerChatUpdate(chatData) {
  messageBus.emit('chat.updated', chatData)
  console.log('💬 聊天更新:', chatData)
}

/**
 * 触发列表更新事件
 * 当聊天列表更新时调用
 * 
 * @param {Object} listData - 列表数据
 * @param {Array} listData.list - 用户列表
 * @param {number} listData.total - 总数
 */
export function triggerListUpdate(listData) {
  messageBus.emit('list.updated', listData)
  console.log('📋 列表更新:', listData)
}

/**
 * 在 App.vue 中初始化全局事件监听
 * 这样可以在整个应用中监听事件
 */
export function initGlobalMessageBus() {
  console.log('🚀 全局消息总线已初始化')

  // 监听新消息
  messageBus.on('message.received', (msgData) => {
    console.log('🔔 全局事件: 新消息接收', msgData)
  })

  // 监听未读更新
  messageBus.on('message.unread', (unreadData) => {
    console.log('🔔 全局事件: 未读消息更新', unreadData)
  })

  // 监听聊天更新
  messageBus.on('chat.updated', (chatData) => {
    console.log('🔔 全局事件: 聊天更新', chatData)
  })

  // 监听列表更新
  messageBus.on('list.updated', (listData) => {
    console.log('🔔 全局事件: 列表更新', listData)
  })
}

export default {
  messageBus,
  triggerMessageNotification,
  triggerUnreadUpdate,
  triggerChatUpdate,
  triggerListUpdate,
  initGlobalMessageBus
}
