import { baseUrl } from './settings.js'

function getToken() {
  try {
    return uni.getStorageSync('token') || ''
  } catch (e) {
    return ''
  }
}

function silentRequest({ url, method = 'GET', data = {}, needAuth = false }) {
  const token = getToken()
  const header = {
    'Content-Type': 'application/json'
  }
  let finalUrl = baseUrl + url

  if (needAuth && token) {
    header.Authorization = token
    finalUrl += `${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
  }

  return new Promise((resolve, reject) => {
    uni.request({
      url: finalUrl,
      method,
      data,
      header,
      success: (res) => {
        const body = res.data || {}
        if (res.statusCode === 200 && (body.code === 0 || body.success === true || body.status === 'ok')) {
          resolve(body)
          return
        }
        reject(body)
      },
      fail: reject
    })
  })
}

export function fetchRobotControlSnapshot(deviceId) {
  return silentRequest({
    url: '/api/device/info',
    method: 'GET',
    data: deviceId ? { device_id: deviceId, deviceId } : { limit: 1 }
  })
}

export function fetchRobotTasks(params = {}) {
  return silentRequest({
    url: '/api/planning/tasks',
    method: 'GET',
    data: params,
    needAuth: true
  })
}

export function sendRobotTaskAction(taskId, action, payload = {}) {
  if (!taskId) {
    return Promise.reject(new Error('taskId is required'))
  }
  return silentRequest({
    url: `/api/planning/tasks/${taskId}/action`,
    method: 'POST',
    data: {
      ...payload,
      action
    },
    needAuth: true
  })
}

export function sendRobotDeviceCommand(deviceId, action, payload = {}) {
  if (!deviceId) {
    return Promise.reject(new Error('deviceId is required'))
  }
  return silentRequest({
    url: `/api/device/${encodeURIComponent(deviceId)}/command`,
    method: 'POST',
    data: {
      action,
      type: 'robot_control',
      payload
    },
    needAuth: true
  })
}

export function reportRobotExecution(deviceId, payload = {}) {
  const id = deviceId || payload.deviceId || payload.device_id || 'robot-01'
  return silentRequest({
    url: `/api/device/${encodeURIComponent(id)}/execution-result`,
    method: 'POST',
    data: payload
  })
}
