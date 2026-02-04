import request from './index.js'
/**
 * 获取用户识别历史记录
 * @param {Object} params - 查询参数
 * @param {number} params.page - 页码（默认1）
 * @param {number} params.pageSize - 每页数量（默认20）
 * @param {string} params.source - 来源筛选（online/device，可选）
 * @returns {Promise} API响应
 */
export async function getRecognitionHistory(params = {}) {
  try {
    return await request({
      url: '/api/recognition_history',
      method: 'GET',
      data: {
        page: params.page || 1,
        pageSize: params.pageSize || 20,
        source: params.source || undefined
      },
      header: {
        'Authorization': `Bearer ${uni.getStorageSync('token')}`,
        'Content-Type': 'application/json'
      }
    })
  } catch (error) {
    if(error && error.msg) {
      uni.showToast({ title: error.msg, icon: 'none' })
    } else {
      uni.showToast({ title: '历史记录获取失败', icon: 'none' })
    }
  }
}

/**
 * 删除历史记录
 * @param {number} id - 记录ID
 * @returns {Promise} API响应
 */
export async function deleteHistoryRecord(id) {
    return await request({
      url: `/api/delete_history/${id}`,
      method: 'DELETE',
      header: {
        'Authorization': `Bearer ${uni.getStorageSync('token')}`,
        'Content-Type': 'application/json'
      }
    })
}

/**
 * 批量删除历史记录
 * @param {Array<number>} ids - 记录ID数组
 * @returns {Promise} API响应
 */
export async function batchDeleteHistoryRecords(ids) {
    return await request({
      url: '/api/batch_delete_history',
      method: 'DELETE',
      data: { ids },
      header: {
        'Authorization': `Bearer ${uni.getStorageSync('token')}`,
        'Content-Type': 'application/json'
      }
    })
}
