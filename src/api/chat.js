/**
 * 聊天相关 API
 * 
 * 用于处理聊天消息的发送、接收和存储
 */

import request from './index.js'
import { baseUrl } from './settings.js'

// 获取基础URL
function getBaseUrl() {
  return baseUrl
}

// 获取token
function getToken() {
  try {
    return uni.getStorageSync('token') || ''
  } catch (e) {
    return ''
  }
}

/**
 * 发送文本消息
 * @param {Object} params - 消息参数
 * @param {string} params.chatId - 聊天ID
 * @param {string} params.targetUserId - 接收方用户ID
 * @param {string} params.content - 消息内容
 */
export function sendTextMessage(params) {
  return request({
    url: '/api/chat/send/text',
    method: 'POST',
    data: params,
    needAuth: true
  })
}

/**
 * 发送图片消息
 * @param {string} chatId - 聊天ID
 * @param {string} targetUserId - 接收方用户ID
 * @param {string} filePath - 图片本地路径
 */
export function sendImageMessage(chatId, targetUserId, filePath) {
  const token = getToken()
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: getBaseUrl() + '/api/chat/send/image' + (token ? `?token=${token}` : ''),
      filePath: filePath,
      name: 'file',
      formData: {
        chatId: chatId,
        targetUserId: targetUserId
      },
      success: (res) => {
        if (res.statusCode === 200) {
          const data = JSON.parse(res.data)
          if (data.code === 0) {
            resolve(data)
          } else {
            reject(new Error(data.msg || '上传失败'))
          }
        } else {
          reject(new Error('上传失败'))
        }
      },
      fail: reject
    })
  })
}

/**
 * 发送语音消息
 * @param {string} chatId - 聊天ID
 * @param {string} targetUserId - 接收方用户ID
 * @param {string} filePath - 语音文件路径
 * @param {number} duration - 语音时长（秒）
 */
export function sendVoiceMessage(chatId, targetUserId, filePath, duration) {
  const token = getToken()
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: getBaseUrl() + '/api/chat/send/voice' + (token ? `?token=${token}` : ''),
      filePath: filePath,
      name: 'file',
      formData: {
        chatId: chatId,
        targetUserId: targetUserId,
        duration: duration
      },
      success: (res) => {
        if (res.statusCode === 200) {
          const data = JSON.parse(res.data)
          if (data.code === 0) {
            resolve(data)
          } else {
            reject(new Error(data.msg || '上传失败'))
          }
        } else {
          reject(new Error('上传失败'))
        }
      },
      fail: reject
    })
  })
}

export function transcribeVoiceMessage(messageId) {
  return request({
    url: `/api/chat/voice/${messageId}/transcribe`,
    method: 'POST',
    needAuth: true
  })
}

/**
 * 发送视频消息
 * @param {string} chatId - 聊天ID
 * @param {string} targetUserId - 接收方用户ID
 * @param {string} filePath - 视频文件路径
 * @param {string} thumbnailPath - 视频封面路径
 * @param {number} duration - 视频时长（秒）
 * @param {function} onProgress - 上传进度回调
 */
export function sendVideoMessage(chatId, targetUserId, filePath, thumbnailPath, duration, onProgress) {
  const token = getToken()
  return new Promise((resolve, reject) => {
    const uploadTask = uni.uploadFile({
      url: getBaseUrl() + '/api/chat/send/video' + (token ? `?token=${token}` : ''),
      filePath: filePath,
      name: 'file',
      formData: {
        chatId: chatId,
        targetUserId: targetUserId,
        thumbnail: thumbnailPath,
        duration: duration
      },
      success: (res) => {
        if (res.statusCode === 200) {
          const data = JSON.parse(res.data)
          if (data.code === 0) {
            resolve(data)
          } else {
            reject(new Error(data.msg || '上传失败'))
          }
        } else {
          reject(new Error('上传失败'))
        }
      },
      fail: reject
    })
    
    // 监听上传进度
    if (onProgress && uploadTask.onProgressUpdate) {
      uploadTask.onProgressUpdate((res) => {
        onProgress(res.progress)
      })
    }
  })
}

/**
 * 发送文件消息
 * @param {string} chatId - 聊天ID
 * @param {string} targetUserId - 接收方用户ID
 * @param {string} filePath - 文件路径
 * @param {string} fileName - 文件名
 * @param {number} fileSize - 文件大小（字节）
 * @param {function} onProgress - 上传进度回调
 */
export function sendFileMessage(chatId, targetUserId, filePath, fileName, fileSize, onProgress) {
  const token = getToken()
  return new Promise((resolve, reject) => {
    const uploadTask = uni.uploadFile({
      url: getBaseUrl() + '/api/chat/send/file' + (token ? `?token=${token}` : ''),
      filePath: filePath,
      name: 'file',
      formData: {
        chatId: chatId,
        targetUserId: targetUserId,
        fileName: fileName,
        fileSize: fileSize
      },
      success: (res) => {
        if (res.statusCode === 200) {
          const data = JSON.parse(res.data)
          if (data.code === 0) {
            resolve(data)
          } else {
            reject(new Error(data.msg || '上传失败'))
          }
        } else {
          reject(new Error('上传失败'))
        }
      },
      fail: reject
    })
    
    // 监听上传进度
    if (onProgress && uploadTask.onProgressUpdate) {
      uploadTask.onProgressUpdate((res) => {
        onProgress(res.progress)
      })
    }
  })
}

/**
 * 发送位置消息
 * @param {string} chatId - 聊天ID
 * @param {string} targetUserId - 接收方用户ID
 * @param {string} locationName - 位置名称
 * @param {string} locationAddress - 位置地址
 * @param {number} latitude - 纬度
 * @param {number} longitude - 经度
 */
export function sendLocationMessage(chatId, targetUserId, locationName, locationAddress, latitude, longitude) {
  return request({
    url: '/api/chat/send/location',
    method: 'POST',
    data: {
      chatId,
      targetUserId,
      locationName,
      locationAddress,
      latitude,
      longitude
    },
    needAuth: true
  })
}

/**
 * 获取聊天记录
 * @param {Object} params - 查询参数
 * @param {string} params.chatId - 聊天ID
 * @param {number} params.page - 页码
 * @param {number} params.pageSize - 每页数量
 * @param {string} params.lastMessageId - 最后一条消息ID（用于分页）
 */
export function getChatHistory(params) {
  return request({
    url: '/api/chat/history',
    method: 'GET',
    data: params,
    needAuth: true
  })
}

/**
 * 获取聊天用户列表
 * @param {Object} params - 查询参数
 * @param {number} params.page - 页码
 * @param {number} params.pageSize - 每页数量
 */
export function getChatUserList(params) {
  // 构建查询字符串
  const queryStr = Object.keys(params)
    .map(key => `${key}=${params[key]}`)
    .join('&')
  
  return request({
    url: `/api/chat/chatlist${queryStr ? '?' + queryStr : ''}`,
    method: 'GET',
    needAuth: true
  })
}

/**
 * 删除消息
 * @param {string} messageId - 消息ID
 */
export function deleteMessage(messageId) {
  return request({
    url: '/api/chat/message/' + messageId,
    method: 'DELETE',
    needAuth: true
  })
}

/**
 * 撤回消息
 * @param {string} messageId - 消息ID
 */
export function recallMessage(messageId) {
  return request({
    url: '/api/chat/recall/' + messageId,
    method: 'POST',
    needAuth: true
  })
}

/**
 * 标记消息已读
 * @param {string} chatId - 聊天ID
 */
export function markAsRead(chatId) {
  return request({
    url: '/api/chat/read/' + chatId,
    method: 'POST',
    needAuth: true
  })
}

/**
 * 清空聊天记录
 * @param {string} chatId - 聊天ID
 */
export function clearChatHistory(chatId) {
  return request({
    url: '/api/chat/clear/' + chatId,
    method: 'DELETE',
    needAuth: true
  })
}

/**
 * 获取联系人设置
 * @param {Object} params - 参数
 * @param {string} params.userId - 用户ID
 */
export function getContactSettings(params) {
  return request({
    url: '/api/chat/contact/settings',
    method: 'GET',
    data: params,
    needAuth: true
  })
}

/**
 * 更新联系人备注
 * @param {Object} params - 参数
 * @param {string} params.userId - 用户ID
 * @param {string} params.note - 备注名
 */
export function updateContactNote(params) {
  return request({
    url: '/api/chat/contact/note',
    method: 'PUT',
    data: params,
    needAuth: true
  })
}

/**
 * 更新联系人关系
 * @param {Object} params - 参数
 * @param {string} params.userId - 用户ID
 * @param {string} params.relationship - 关系
 */
export function updateContactRelationship(params) {
  return request({
    url: '/api/chat/contact/relationship',
    method: 'PUT',
    data: params,
    needAuth: true
  })
}

/**
 * 更新联系人免打扰设置
 * @param {Object} params - 参数
 * @param {string} params.userId - 用户ID
 * @param {boolean} params.mute - 是否免打扰
 */
export function updateContactMute(params) {
  return request({
    url: '/api/chat/contact/mute',
    method: 'PUT',
    data: params,
    needAuth: true
  })
}

/**
 * 更新联系人置顶设置
 * @param {Object} params - 参数
 * @param {string} params.userId - 用户ID
 * @param {boolean} params.top - 是否置顶
 */
export function updateContactTop(params) {
  return request({
    url: '/api/chat/contact/top',
    method: 'PUT',
    data: params,
    needAuth: true
  })
}

/**
 * 删除联系人
 * @param {Object} params - 参数
 * @param {string} params.userId - 用户ID
 */
export function deleteContact(params) {
  return request({
    url: '/api/chat/contact/delete',
    method: 'DELETE',
    data: params,
    needAuth: true
  })
}

// Friend request APIs
export function searchChatUsers(keyword) {
  return request({
    url: `/api/chat/users/search?keyword=${encodeURIComponent(keyword || '')}`,
    method: 'GET',
    needAuth: true
  })
}

export function getFriends() {
  return request({ url: '/api/chat/friends', method: 'GET', needAuth: true })
}

export function sendFriendRequest(userId, message = '') {
  return request({
    url: '/api/chat/friend-requests',
    method: 'POST',
    data: { userId, message },
    needAuth: true
  })
}

export function getFriendRequests(direction = 'incoming') {
  return request({
    url: `/api/chat/friend-requests?direction=${encodeURIComponent(direction)}`,
    method: 'GET',
    needAuth: true
  })
}

export function respondToFriendRequest(requestId, action) {
  return request({
    url: `/api/chat/friend-requests/${requestId}/respond`,
    method: 'POST',
    data: { action },
    needAuth: true
  })
}

export function deleteFriend(userId) {
  return request({
    url: `/api/chat/friends/${userId}`,
    method: 'DELETE',
    needAuth: true
  })
}

// Group chat APIs
export function createGroup(data) {
  return request({ url: '/api/chat/groups', method: 'POST', data, needAuth: true })
}

export function getGroups() {
  return request({ url: '/api/chat/groups', method: 'GET', needAuth: true })
}

export function getGroupDetail(groupId) {
  return request({ url: `/api/chat/groups/${groupId}`, method: 'GET', needAuth: true })
}

export function updateGroup(groupId, data) {
  return request({ url: `/api/chat/groups/${groupId}`, method: 'PATCH', data, needAuth: true })
}

export function addGroupMembers(groupId, memberIds) {
  return request({
    url: `/api/chat/groups/${groupId}/members`,
    method: 'POST',
    data: { memberIds },
    needAuth: true
  })
}

export function removeGroupMember(groupId, userId) {
  return request({ url: `/api/chat/groups/${groupId}/members/${userId}`, method: 'DELETE', needAuth: true })
}

export function leaveGroup(groupId) {
  return request({ url: `/api/chat/groups/${groupId}/leave`, method: 'POST', needAuth: true })
}

export function updateGroupTop(groupId, top) {
  return request({ url: `/api/chat/groups/${groupId}/top`, method: 'PUT', data: { top }, needAuth: true })
}

export function getGroupHistory(groupId, params = {}) {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
  return request({
    url: `/api/chat/groups/${groupId}/history${query ? `?${query}` : ''}`,
    method: 'GET',
    needAuth: true
  })
}

export function sendGroupTextMessage(groupId, content, refId = null) {
  return request({
    url: `/api/chat/groups/${groupId}/messages/text`,
    method: 'POST',
    data: { content, refId },
    needAuth: true
  })
}

export function recallGroupMessage(groupId, messageId) {
  return request({
    url: `/api/chat/groups/${groupId}/messages/${messageId}/recall`,
    method: 'POST',
    needAuth: true
  })
}

function uploadGroupMessage(groupId, type, filePath, formData = {}, onProgress) {
  const token = getToken()
  return new Promise((resolve, reject) => {
    const uploadTask = uni.uploadFile({
      url: `${getBaseUrl()}/api/chat/groups/${groupId}/messages/${type}${token ? `?token=${encodeURIComponent(token)}` : ''}`,
      filePath,
      name: 'file',
      formData,
      success: (res) => {
        try {
          const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
          if (res.statusCode === 200 && data?.code === 0) resolve(data)
          else reject(new Error(data?.msg || '上传失败'))
        } catch (error) {
          reject(error)
        }
      },
      fail: reject
    })
    if (onProgress && uploadTask.onProgressUpdate) {
      uploadTask.onProgressUpdate((event) => onProgress(event.progress))
    }
  })
}

export const sendGroupImageMessage = (groupId, filePath, refId = null) =>
  uploadGroupMessage(groupId, 'image', filePath, { refId })

export const sendGroupVoiceMessage = (groupId, filePath, duration, refId = null) =>
  uploadGroupMessage(groupId, 'voice', filePath, { duration, refId })

export const sendGroupVideoMessage = (groupId, filePath, thumbnail, duration, refId = null, onProgress) =>
  uploadGroupMessage(groupId, 'video', filePath, { thumbnail, duration, refId }, onProgress)

export const sendGroupFileMessage = (groupId, filePath, fileName, fileSize, refId = null, onProgress) =>
  uploadGroupMessage(groupId, 'file', filePath, { fileName, fileSize, refId }, onProgress)

export function sendGroupLocationMessage(groupId, data) {
  return request({
    url: `/api/chat/groups/${groupId}/messages/location`,
    method: 'POST',
    data,
    needAuth: true
  })
}

export default {
  sendTextMessage,
  sendImageMessage,
  sendVoiceMessage,
  transcribeVoiceMessage,
  sendVideoMessage,
  sendFileMessage,
  sendLocationMessage,
  getChatHistory,
  getChatUserList,
  deleteMessage,
  recallMessage,
  markAsRead,
  clearChatHistory,
  getContactSettings,
  updateContactNote,
  updateContactRelationship,
  updateContactMute,
  updateContactTop,
  deleteContact,
  searchChatUsers,
  getFriends,
  sendFriendRequest,
  getFriendRequests,
  respondToFriendRequest,
  deleteFriend,
  createGroup,
  getGroups,
  getGroupDetail,
  updateGroup,
  addGroupMembers,
  removeGroupMember,
  leaveGroup,
  updateGroupTop,
  getGroupHistory,
  recallGroupMessage,
  sendGroupTextMessage,
  sendGroupImageMessage,
  sendGroupVoiceMessage,
  sendGroupVideoMessage,
  sendGroupFileMessage,
  sendGroupLocationMessage
}
