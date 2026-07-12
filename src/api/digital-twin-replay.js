import { baseUrl } from './settings.js'

export function fetchParkReplay(mode = 'sim', scene = 'baseline') {
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${baseUrl}/api/digital-twin/park-replay`,
      method: 'GET',
      data: { mode, scene },
      header: { 'Content-Type': 'application/json' },
      success: (res) => {
        const body = res.data || {}
        if (res.statusCode === 200 && body.code === 0 && body.data) {
          resolve(body.data)
          return
        }
        const error = new Error(body.msg || `HTTP ${res.statusCode}`)
        error.availableModes = body.data?.availableModes || []
        reject(error)
      },
      fail: reject
    })
  })
}
