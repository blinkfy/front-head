import request from './index.js'

/**
 * 设备连接通知
 * @param {string} deviceId - 设备ID
 * @param {string} token - 设备令牌
 * @returns {Promise} API响应
 */
export function connectDevice(deviceId, devicetoken,Authorizetoken) {
  return request({
    url: '/api/device/connect',
    method: 'POST',
    data: {
      device_id: deviceId,
      token: devicetoken,
      timestamp: Date.now()
    },
    header: {
    'Authorization': Authorizetoken
    }
  })
}

/**
 * 获取设备状态
 * @param {string} deviceId - 设备ID
 * @returns {Promise} API响应
 */
export function getDeviceStatus(deviceId) {
  return request({
    url: '/api/device/status',
    method: 'GET',
    params: {
      device_id: deviceId
    }
  })
}

/**
 * 获取已连接的设备列表
 * @returns {Promise} API响应
 */
export function getConnectedDevices() {
  const token = uni.getStorageSync('token') || ''
  return request({
    url: '/api/user/connected-devices',
    method: 'GET',
    header: {'Authorization': token}
  })
}

/**
 * 断开设备连接
 * @param {string} deviceId - 设备ID
 * @returns {Promise} API响应
 */
export function disconnectDevice(deviceId, Authorizetoken) {
  return request({
    url: '/api/device/disconnect',
    method: 'POST',
    data: {
      device_id: deviceId,
      timestamp: Date.now()
    },
    header: {'Authorization': Authorizetoken}
  })
}

/**
 * 获取设备信息
 * @param {string} deviceId - 设备ID
 * @returns {Promise} API响应
 */
export function getDeviceInfo(deviceId) {
  return request({
    url: '/api/device/info',
    method: 'GET',
    params: {
      device_id: deviceId
    }
  })
}
