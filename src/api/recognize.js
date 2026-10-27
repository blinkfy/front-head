import request from './index'
import { baseUrl } from './settings'

/**
 * 上传图片并进行垃圾分类识别（新版API，token通过Authorization header传递）
 * @param {File|String} file - 选择的图片文件对象或路径
 * @returns {Promise<Object>} 识别结果
 */
function newProgressId() {
  const bytes = new Uint8Array(16)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return `rec_${Date.now()}_${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`
}

export function recognizeImage(file, { onProgress, bboxRenderer } = {}) {
  return new Promise((resolve, reject) => {
    const token = uni.getStorageSync('token') || ''
    const progressId = typeof onProgress === 'function' ? newProgressId() : ''
    let polling = Boolean(progressId)
    let pollTimer = null
    let lastRevision = -1

    const stopPolling = () => {
      polling = false
      if (pollTimer) clearTimeout(pollTimer)
      pollTimer = null
    }
    const schedulePoll = (delay = 700) => {
      if (!polling) return
      pollTimer = setTimeout(() => {
        if (!polling) return
        if ((uni.getStorageSync('token') || '') !== token) {
          stopPolling()
          return
        }
        uni.request({
          url: `${baseUrl}/api/recognition-progress/${encodeURIComponent(progressId)}`,
          method: 'GET',
          header: { Authorization: token },
          timeout: 5000,
          success: response => {
            if (!polling || (uni.getStorageSync('token') || '') !== token) return
            if (response?.statusCode === 404) return // Multipart upload may not have reached the controller yet.
            if (response?.statusCode !== 200 || response?.data?.code !== 0) {
              stopPolling() // Progress is optional; the original recognition request remains authoritative.
              return
            }
            const snapshot = response?.data?.code === 0 ? response.data.data : null
            if (snapshot && Number.isInteger(snapshot.revision) && snapshot.revision > lastRevision) {
              lastRevision = snapshot.revision
              try { onProgress(snapshot) } catch (error) { console.warn('识别进度更新失败:', error) }
            }
            if (snapshot?.status === 'failed' || snapshot?.status === 'succeeded') stopPolling()
          },
          fail: stopPolling,
          complete: () => { if (polling) schedulePoll() }
        })
      }, delay)
    }
    if (polling) schedulePoll(450)
    
    // 检测当前环境
    let isH5 = false
    try {
      const deviceInfo = uni.getDeviceInfo ? uni.getDeviceInfo() : uni.getSystemInfoSync()
      const appBaseInfo = uni.getAppBaseInfo ? uni.getAppBaseInfo() : uni.getSystemInfoSync()
      const platform = deviceInfo.platform
      const uniPlatform = appBaseInfo.uniPlatform
      
      isH5 = (
        uniPlatform === 'web' || 
        (platform === 'devtools' && typeof window !== 'undefined' && window.location) ||
        (typeof document !== 'undefined' && typeof window !== 'undefined' && !window.wx && !window.my)
      )
    } catch (e) {
      isH5 = typeof window !== 'undefined' && typeof document !== 'undefined'
    }
    
    // H5环境且传入的是File对象时，使用fetch上传
    if (isH5 && typeof File !== 'undefined' && file instanceof File) {
      const formData = new FormData()
      formData.append('image', file)
      if (bboxRenderer === 'client') formData.append('bboxRenderer', 'client')
      if (progressId) formData.append('progressId', progressId)
      
      fetch(`${baseUrl}/api/recognize`, {
        method: 'POST',
        headers: {
          'Authorization': token
        },
        body: formData
      })
      .then(async response => {
        if (!response.ok) {
          let message = ''
          try {
            const data = await response.json()
            message = data && data.msg ? String(data.msg) : ''
          } catch (e) {}
          const error = new Error(`HTTP ${response.status}: ${response.statusText}`)
          error.status = response.status
          if (message) error.msg = message
          throw error
        }
        return response.json()
      })
      .then(data => {
        if (data.code === 0) {
          stopPolling()
          resolve(data.data)
        } else {
          stopPolling()
          uni.showToast({ title: data.msg || '识别失败', icon: 'none' })
          reject(data)
        }
      })
      .catch(err => {
        stopPolling()
        console.error('H5 fetch上传失败:', err)
        uni.showToast({ title: err.msg || '图片上传失败', icon: 'none' })
        reject(err)
      })
    } else {
      // 小程序环境或传入路径时，使用uni.uploadFile
      uni.uploadFile({
        url: `${baseUrl}/api/recognize`,
        filePath: typeof file === 'string' ? file : file.path,
        name: 'image', // 字段名必须为image
        timeout: 600000, // 包含排队、上传和 AI 处理时间。
        formData: { ...(progressId ? { progressId } : {}), ...(bboxRenderer === 'client' ? { bboxRenderer: 'client' } : {}) },
        header: {
          'Authorization': token
        },
        success: (res) => {
          stopPolling()
          let data = res.data
          if (typeof data === 'string') {
            try { data = JSON.parse(data) } catch (e) {}
          }
          if (data.code === 0) {
            resolve(data.data)
          } else {
            uni.showToast({ title: data.msg || '识别失败', icon: 'none' })
            reject(data)
          }
        },
        fail: (err) => {
          stopPolling()
          console.error('uni.uploadFile上传失败:', err)
          uni.showToast({ title: '图片上传失败', icon: 'none' })
          reject(err)
        }
      })
    }
  })
}

export function getHistory(params = {}) {
  return request({
    url: '/api/history',
    method: 'GET',
    data: params,
    needAuth: true
  })
}

export function deleteHistory(id) {
  return request({
    url: `/api/history/${id}`,
    method: 'DELETE',
    needAuth: true
  })
}
