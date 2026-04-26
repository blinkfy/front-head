/**
 * 数据库管理 API
 * 用于管理员操作数据库表数据
 */

  import request from './index'

  // ==================== Users 表相关 API ====================

  /**
   * 获取用户列表
   * @param {Object} params - 查询参数
   * @param {number} params.page - 页码（可选）
   * @param {number} params.pageSize - 每页数量（可选）
   * @returns {Promise}
   */
  export function getUsersList(params = {}) {
    return request({
      url: '/api/admin/users',
      method: 'GET',
      data: params,
      needAuth: true
    })
  }

  /**
   * 创建用户
   * @param {Object} data - 用户数据
   * @param {string} data.username - 用户名（必填，唯一）
   * @param {string} data.password - 密码（必填）
   * @param {string} data.avatar - 头像URL（可选）
   * @param {number} data.points - 积分（可选，默认0）
   * @returns {Promise}
   */
  export function createUser(data) {
    return request({
      url: '/api/admin/users',
      method: 'POST',
      data,
      needAuth: true
    })
  }

  /**
   * 更新用户信息
   * @param {number} id - 用户ID
   * @param {Object} data - 要更新的用户数据
   * @returns {Promise}
   */
  export function updateUser(id, data) {
    return request({
      url: `/api/admin/users/${id}`,
      method: 'PUT',
      data,
      needAuth: true
    })
  }

  /**
   * 删除用户
   * @param {number} id - 用户ID
   * @returns {Promise}
   */
  export function deleteUser(id) {
    return request({
      url: `/api/admin/users/${id}`,
      method: 'DELETE',
      needAuth: true
    })
  }

  // ==================== Bin 表相关 API ====================

  /**
   * 获取垃圾桶列表（包含未审核）
   * @param {Object} params - 查询参数
   * @param {number} params.page - 页码（可选）
   * @param {number} params.pageSize - 每页数量（可选）
   * @param {string} params.status - 状态过滤（可选：'online'/'offline'）
   * @param {string} params.type - 类型过滤（可选：'smart'/'normal'）
   * @param {boolean} params.review - 审核状态过滤（可选：true/false）
   * @returns {Promise}
   */
  export function getBinsList(params = {}) {
    return request({
      url: '/api/admin/bins',
      method: 'GET',
      data: params,
      needAuth: true
    })
  }

  /**
   * 创建垃圾桶
   * @param {Object} data - 垃圾桶数据
   * @param {string} data.name - 垃圾桶名称（必填）
   * @param {string} data.describe - 描述（可选）
   * @param {string} data.type - 类型（必填：'smart'/'normal'，默认'normal'）
   * @param {string} data.imagePath - 图片路径（可选）
   * @param {number} data.latitude - 纬度（可选）
   * @param {number} data.longitude - 经度（可选）
   * @param {boolean} data.review - 审核状态（可选，默认false）
   * @param {string} data.status - 状态（可选：'online'/'offline'，默认'offline'）
   * @param {string} data.callback_url - 设备回调地址（可选）
   * @returns {Promise}
   */
  export function createBin(data) {
    return request({
      url: '/api/admin/bins',
      method: 'POST',
      data,
      needAuth: true
    })
  }

  /**
   * 更新垃圾桶信息
   * @param {number} id - 垃圾桶ID
   * @param {Object} data - 要更新的垃圾桶数据
   * @returns {Promise}
   */
  export function updateBin(id, data) {
    return request({
      url: `/api/admin/bins/${id}`,
      method: 'PUT',
      data,
      needAuth: true
    })
  }

  /**
   * 删除垃圾桶
   * @param {number} id - 垃圾桶ID
   * @returns {Promise}
   */
  export function deleteBin(id) {
    return request({
      url: `/api/admin/bins/${id}`,
      method: 'DELETE',
      needAuth: true
    })
  }

  /**
   * 审核通过垃圾桶
   * @param {number} id - 垃圾桶ID
   * @returns {Promise}
   */
  export function approveBin(id) {
    return request({
      url: `/api/admin/bins/${id}/approve`,
      method: 'PUT',
      needAuth: true
    })
  }

  /**
   * 拒绝审核垃圾桶
   * @param {number} id - 垃圾桶ID
   * @returns {Promise}
   */
  export function rejectBin(id) {
    return request({
      url: `/api/admin/bins/${id}/reject`,
      method: 'PUT',
      needAuth: true
    })
  }

  /**
   * 获取垃圾桶错误报告
   * @param {number} id - 垃圾桶ID
   * @returns {Promise}
   */
  export function getBinErrorReports(id) {
    return request({
      url: `/api/admin/bins/${id}/error-reports`,
      method: 'GET',
      needAuth: true
    })
  }

  /**
   * 清除垃圾桶错误报告
   * @param {number} id - 垃圾桶ID
   * @returns {Promise}
   */
  export function clearBinErrorReports(id) {
    return request({
      url: `/api/admin/bins/${id}/error-reports`,
      method: 'DELETE',
      needAuth: true
    })
  }

  // ==================== UserDevice 表相关 API ====================

  /**
   * 获取用户设备连接列表
   * @param {Object} params - 查询参数
   * @param {number} params.page - 页码（可选）
   * @param {number} params.pageSize - 每页数量（可选）
   * @param {number} params.userId - 用户ID过滤（可选）
   * @param {number} params.deviceId - 设备ID过滤（可选，注意是Bin的ID）
   * @returns {Promise}
   */
  export function getUserDevicesList(params = {}) {
    return request({
      url: '/api/admin/user-devices',
      method: 'GET',
      data: params,
      needAuth: true
    })
  }

  /**
   * 创建用户设备连接
   * @param {Object} data - 连接数据
   * @param {number} data.userId - 用户ID（必填）
   * @param {number} data.deviceId - 设备ID（必填，Bin表的ID）
   * @returns {Promise}
   */
  export function createUserDevice(data) {
    return request({
      url: '/api/admin/user-devices',
      method: 'POST',
      data,
      needAuth: true
    })
  }

  /**
   * 更新用户设备连接
   * @param {number} userId - 用户ID（联合主键之一）
   * @param {number} deviceId - 设备ID（联合主键之一）
   * @param {Object} data - 要更新的连接数据
   * @returns {Promise}
   */
  export function updateUserDevice(userId, deviceId, data) {
    return request({
      url: `/api/admin/user-devices/${userId}/${deviceId}`,
      method: 'PUT',
      data,
      needAuth: true
    })
  }

  /**
   * 删除用户设备连接
   * @param {number} userId - 用户ID（联合主键之一）
   * @param {number} deviceId - 设备ID（联合主键之一）
   * @returns {Promise}
   */
  export function deleteUserDevice(userId, deviceId) {
    return request({
      url: `/api/admin/user-devices/${userId}/${deviceId}`,
      method: 'DELETE',
      needAuth: true
    })
  }

  // ==================== History 表相关 API ====================

  /**
   * 获取历史记录列表（包含用户软删除的记录）
   * @param {Object} params - 查询参数
   * @param {number} params.page - 页码（可选）
   * @param {number} params.pageSize - 每页数量（可选）
   * @param {number} params.userId - 用户ID过滤（可选）
   * @param {string} params.category - 垃圾分类过滤（可选）
   * @param {string} params.source - 来源过滤（可选：'online'/'device'）
   * @param {boolean} params.userDeleted - 是否只显示用户删除的记录（可选）
   * @param {string} params.startDate - 开始日期（可选）
   * @param {string} params.endDate - 结束日期（可选）
   * @returns {Promise}
   */
  export function getHistoryList(params = {}) {
    return request({
      url: '/api/admin/history',
      method: 'GET',
      data: params,
      needAuth: true
    })
  }

  /**
   * 创建历史记录
   * @param {Object} data - 历史记录数据
   * @param {number} data.userId - 用户ID（必填）
   * @param {string} data.category - 垃圾分类（必填）
   * @param {string} data.imageUrl - Base64图片字符串（可选）
   * @param {number} data.confidence - 识别置信度（可选，0-1）
   * @param {string} data.source - 来源（可选：'online'/'device'，默认'online'）
   * @returns {Promise}
   */
  export function createHistory(data) {
    return request({
      url: '/api/admin/history',
      method: 'POST',
      data,
      needAuth: true
    })
  }

  /**
   * 更新历史记录
   * @param {number} id - 历史记录ID
   * @param {Object} data - 要更新的历史记录数据
   * @returns {Promise}
   */
  export function updateHistory(id, data) {
    return request({
      url: `/api/admin/history/${id}`,
      method: 'PUT',
      data,
      needAuth: true
    })
  }

  /**
   * 删除历史记录（硬删除，管理员操作）
   * @param {number} id - 历史记录ID
   * @returns {Promise}
   */
  export function deleteHistory(id) {
    return request({
      url: `/api/admin/history/${id}`,
      method: 'DELETE',
      needAuth: true
    })
  }

  /**
   * 恢复用户软删除的历史记录
   * @param {number} id - 历史记录ID
   * @returns {Promise}
   */
  export function restoreHistory(id) {
    return request({
      url: `/api/admin/history/${id}/restore`,
      method: 'PUT',
      needAuth: true
    })
  }

  // ==================== Messages 表相关 API ====================

  /**
   * 获取消息列表
   * @param {Object} params - 查询参数
   * @param {number} params.page - 页码（可选）
   * @param {number} params.pageSize - 每页数量（可选）
   * @param {number} params.senderId - 发送者ID（可选）
   * @param {number} params.receiverId - 接收者ID（可选）
   * @param {string} params.type - 消息类型过滤（可选：'text'/'image'/'voice'/'video'/'location'/'link'/'system'）
   * @param {boolean} params.isRead - 已读状态过滤（可选：true/false）
   * @param {boolean} params.isWithdraw - 撤回状态过滤（可选：true/false）
   * @param {boolean} params.senderDeleted - 发送者删除过滤（可选：true/false）
   * @param {boolean} params.receiverDeleted - 接收者删除过滤（可选：true/false）
   * @returns {Promise}
   */
  export function getMessagesList(params = {}) {
    return request({
      url: '/api/admin/messages',
      method: 'GET',
      data: params,
      needAuth: true
    })
  }

  /**
   * 创建消息
   * @param {Object} data - 消息数据
   * @param {number} data.senderId - 发送者ID（必填）
   * @param {number} data.receiverId - 接收者ID（必填）
   * @param {string} data.type - 消息类型（必填）
   * @param {string} data.content - 消息内容（可选）
   * @returns {Promise}
   */
  export function createMessage(data) {
    return request({
      url: '/api/admin/messages',
      method: 'POST',
      data,
      needAuth: true
    })
  }

  /**
   * 更新消息
   * @param {number} id - 消息ID
   * @param {Object} data - 要更新的消息数据
   * @returns {Promise}
   */
  export function updateMessage(id, data) {
    return request({
      url: `/api/admin/messages/${id}`,
      method: 'PUT',
      data,
      needAuth: true
    })
  }

  /**
   * 删除消息
   * @param {number} id - 消息ID
   * @returns {Promise}
   */
  export function deleteMessage(id) {
    return request({
      url: `/api/admin/messages/${id}`,
      method: 'DELETE',
      needAuth: true
    })
  }

  // ==================== Chat 表相关 API ====================

  /**
   * 获取聊天列表
   * @param {Object} params - 查询参数
   * @param {number} params.page - 页码（可选）
   * @param {number} params.pageSize - 每页数量（可选）
   * @param {number} params.userId - 用户ID（可选）
   * @param {string} params.relationship - 关系类型过滤（可选：'friend'/'customer_s'/'customer_c'/'stranger'）
   * @param {boolean} params.mute - 免打扰状态过滤（可选：true/false）
   * @param {boolean} params.top - 置顶状态过滤（可选：true/false）
   * @returns {Promise}
   */
  export function getChatList(params = {}) {
    return request({
      url: '/api/admin/chats',
      method: 'GET',
      data: params,
      needAuth: true
    })
  }

  /**
   * 创建聊天记录
   * @param {Object} data - 聊天数据
   * @param {number} data.userId - 用户ID（必填）
   * @param {number} data.otherId - 另一方用户ID（必填）
   * @param {string} data.relationship - 关系类型（可选）
   * @param {string} data.note - 备注（可选，最多40字）
   * @returns {Promise}
   */
  export function createChat(data) {
    return request({
      url: '/api/admin/chats',
      method: 'POST',
      data,
      needAuth: true
    })
  }

  /**
   * 更新聊天信息
   * @param {number} userId - 用户ID
   * @param {number} otherId - 另一方用户ID
   * @param {Object} data - 要更新的聊天数据
   * @returns {Promise}
   */
  export function updateChat(userId, otherId, data) {
    return request({
      url: `/api/admin/chats/${userId}/${otherId}`,
      method: 'PUT',
      data,
      needAuth: true
    })
  }

  /**
   * 删除聊天记录
   * @param {number} userId - 用户ID
   * @param {number} otherId - 另一方用户ID
   * @returns {Promise}
   */
  export function deleteChat(userId, otherId) {
    return request({
      url: `/api/admin/chats/${userId}/${otherId}`,
      method: 'DELETE',
      needAuth: true
    })
  }

  // ==================== 统计信息 API ====================

  /**
   * 获取数据库统计信息
   * @returns {Promise} 返回各表的记录数量
   */
  export function getDatabaseStats() {
    return request({
      url: '/api/admin/database/stats',
      method: 'GET',
      needAuth: true
    })
  }

  /**
   * 获取通用表列表
   * @param {string} tableName
   * @param {Object} params
   */
  export function getGenericTableList(tableName, params = {}) {
    return request({
      url: `/api/admin/tables/${tableName}`,
      method: 'GET',
      data: params,
      needAuth: true
    })
  }

  export function createGenericTableRecord(tableName, data) {
    return request({
      url: `/api/admin/tables/${tableName}`,
      method: 'POST',
      data,
      needAuth: true
    })
  }

  export function updateGenericTableRecord(tableName, id, data) {
    return request({
      url: `/api/admin/tables/${tableName}/${id}`,
      method: 'PUT',
      data,
      needAuth: true
    })
  }

  export function deleteGenericTableRecord(tableName, id) {
    return request({
      url: `/api/admin/tables/${tableName}/${id}`,
      method: 'DELETE',
      needAuth: true
    })
  }
