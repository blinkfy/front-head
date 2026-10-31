// Transport for generated-code tasks; no native decoder or browser polyfill here.
export function readGeneratedCodeTask(headers, decodeBase64, now = Date.now) {
  const key = Object.keys(headers || {}).find(name => name.toLowerCase() === 'x-round-code-task')
  const value = key && headers[key]
  if (typeof value !== 'string' || value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value)) return null
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
    const task = JSON.parse(decodeBase64(padded))
    if (typeof task.id !== 'string' || !/^rq_[a-f0-9]{24}$/.test(task.id)
      || !/^[a-f0-9]{64}$/.test(task.ticket || '') || !Number.isFinite(task.expiresAt) || task.expiresAt <= now()) return null
    return { id: task.id, ticket: task.ticket, expiresAt: task.expiresAt }
  } catch (_) { return null }
}

export function isGeneratedCodeUrl(url, baseUrl) {
  const root = String(baseUrl || '').replace(/\/$/, '')
  if (!root || typeof url !== 'string' || !url.startsWith(root + '/api/registration/')) return false
  const path = url.slice(root.length).split('?')[0]
  return path === '/api/registration/wechat-qrcode' || /^\/api\/registration\/sessions\/r_[a-f0-9]{24}\/qrcode$/.test(path)
}

export function createRoundCodeTransport({ runtime, baseUrl }) {
  const root = String(baseUrl).replace(/\/$/, '')
  const post = (path, data, headers = {}) => new Promise((resolve, reject) => {
    runtime.request({ url: root + '/api/device/wechat-qr/' + path, method: 'POST', data,
      timeout: 10000, header: { 'Content-Type': 'application/json', ...headers },
      success(response) {
        const body = response.data
        if (response.statusCode >= 200 && response.statusCode < 300 && body?.code === 0) resolve(body)
        else reject(Object.assign(new Error('圆码协作暂不可用'), { httpStatus: response.statusCode,
          reason: body?.reason, code: body?.code }))
      },
      fail() { reject(new Error('ROUND_CODE_NETWORK_UNAVAILABLE')) }
    })
  })
  return {
    claim: token => post('decode-task/claim', {}, { Authorization: 'Bearer ' + token }).catch(error => {
      // The legacy admin middleware uses HTTP 200 + code 1 for a permission denial.
      if (error.httpStatus === 200 && error.code === 1) error.httpStatus = 403
      throw error
    }),
    register: data => post('register-generated', data),
    image: url => new Promise((resolve, reject) => {
      if (!isGeneratedCodeUrl(url, root)) { reject(new Error('INVALID_QR_IMAGE_URL')); return }
      runtime.request({ url, method: 'GET', responseType: 'arraybuffer', timeout: 10000,
        success(response) {
          if (response.statusCode === 200 && response.data instanceof ArrayBuffer
            && response.data.byteLength > 0 && response.data.byteLength <= 512 * 1024) resolve(response)
          else reject(new Error('INVALID_QR_IMAGE'))
        }, fail() { reject(new Error('ROUND_CODE_NETWORK_UNAVAILABLE')) }
      })
    })
  }
}
