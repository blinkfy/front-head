import { baseUrl } from './settings.js'

let commandSequence = 0

function readAuthorizationToken() {
  try {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      return localStorage.getItem('token') || ''
    }
  } catch (_) {
    // Fall through to the native storage implementation.
  }

  try {
    return uni.getStorageSync('token') || ''
  } catch (_) {
    return ''
  }
}

function createResponseError(body, statusCode) {
  const error = new Error(body.msg || body.message || body.error || `HTTP ${statusCode}`)
  error.payload = body
  error.response = { status: statusCode }
  return error
}

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const token = readAuthorizationToken()
    uni.request({
      url: `${baseUrl}${url}`,
      method: options.method || 'GET',
      data: options.data,
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: token } : {})
      },
      success: (res) => {
        const body = res.data || {}
        if (res.statusCode >= 200 && res.statusCode < 300 && body.code === 0) return resolve(body.data)
        reject(createResponseError(body, res.statusCode))
      },
      fail: reject
    })
  })
}

export function fetchParkSimulationState() {
  return request('/api/digital-twin/simulation/state')
}

export function fetchAlgorithmStatus(refresh = false) {
  return request(`/api/digital-twin/algorithm/status${refresh ? '?refresh=true' : ''}`)
}

export function submitParkSimulationCommand(type, payload = {}) {
  return request('/api/digital-twin/simulation/commands', {
    method: 'POST',
    data: { type, payload, commandId: `${Date.now()}-${++commandSequence}` }
  })
}

export function exportParkSimulationSnapshot() {
  return request('/api/digital-twin/simulation/snapshot')
}

export function restoreParkSimulationSnapshot(snapshot) {
  return request('/api/digital-twin/simulation/snapshot/restore', {
    method: 'POST',
    data: { snapshot }
  })
}

export function connectParkSimulationStream(handlers = {}) {
  const token = readAuthorizationToken()
  const baseStreamUrl = `${baseUrl.replace(/^http/i, 'ws')}/ws/digital-twin/simulation`
  const url = token ? `${baseStreamUrl}?token=${encodeURIComponent(token)}` : baseStreamUrl
  let authorizationReported = false
  const reportAuthorizationFailure = (event = {}) => {
    if (authorizationReported) return
    authorizationReported = true
    const status = Number(event?.code) === 1008 ? 403 : 401
    const error = new Error(event?.reason || (status === 401 ? '未登录或登录已过期' : '无管理员权限'))
    error.payload = { code: status, message: error.message }
    error.response = { status }
    handlers.onError?.(error)
  }
  const onClose = (event) => {
    if (Number(event?.code) === 1008) {
      reportAuthorizationFailure(event)
    } else if (Number(event?.code) === 1011) {
      const error = new Error(event?.reason || '实时事件流鉴权服务暂时不可用')
      error.response = { status: 500 }
      handlers.onError?.(error)
    }
    handlers.onClose?.(event)
  }
  const onMessage = (raw) => handleStreamMessage(raw, {
    ...handlers,
    onAuthorizationError: reportAuthorizationFailure
  })
  if (typeof WebSocket !== 'undefined') {
    const socket = new WebSocket(url)
    socket.addEventListener('open', () => handlers.onOpen?.())
    socket.addEventListener('message', (message) => onMessage(message.data))
    socket.addEventListener('error', (error) => handlers.onError?.(error))
    socket.addEventListener('close', onClose)
    return () => socket.close()
  }
  const socket = uni.connectSocket({
    url,
    header: token ? { Authorization: token } : {}
  })
  socket.onOpen?.(() => handlers.onOpen?.())
  socket.onMessage?.((message) => {
    onMessage(message.data)
  })
  socket.onError?.((error) => handlers.onError?.(error))
  socket.onClose?.(onClose)
  return () => socket.close?.()
}

function handleStreamMessage(raw, handlers) {
  try {
    const body = JSON.parse(raw)
    if (body.type === 'event') handlers.onEvent?.(body.data)
    else if (body.type === 'snapshot') handlers.onSnapshot?.(body.data)
    else if (body.type === 'state') handlers.onState?.(body.data)
    else if (body.type === 'error') {
      const error = new Error(body.message || '实时事件流异常')
      const status = Number(body.status || body.code)
      if (status === 401 || status === 403) {
        error.payload = { ...body, code: status }
        error.response = { status }
        handlers.onAuthorizationError?.(error)
      } else {
        handlers.onError?.(error)
      }
    }
  } catch (error) {
    handlers.onError?.(error)
  }
}
