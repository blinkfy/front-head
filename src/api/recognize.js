import request from './index'
import { baseUrl } from './settings'

/**
 * 上传图片并进行垃圾分类识别（新版API，token通过Authorization header传递）
 * @param {File|String} file - 选择的图片文件对象或路径
 * @returns {Promise<Object>} 识别结果
 */
export function recognizeImage(file) {
  return new Promise((resolve, reject) => {
    const token = uni.getStorageSync('token') || ''
    
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
    if (isH5 && file instanceof File) {
      const formData = new FormData()
      formData.append('image', file)
      
      fetch(`${baseUrl}/api/recognize`, {
        method: 'POST',
        headers: {
          'Authorization': token
        },
        body: formData
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        return response.json()
      })
      .then(data => {
        if (data.code === 0) {
          resolve(data.data)
        } else {
          uni.showToast({ title: data.msg || '识别失败', icon: 'none' })
          reject(data)
        }
      })
      .catch(err => {
        console.error('H5 fetch上传失败:', err)
        uni.showToast({ title: '图片上传失败', icon: 'none' })
        reject(err)
      })
    } else {
      // 小程序环境或传入路径时，使用uni.uploadFile
      uni.uploadFile({
        url: `${baseUrl}/api/recognize`,
        filePath: typeof file === 'string' ? file : file.path,
        name: 'image', // 字段名必须为image
        formData: {},
        header: {
          'Authorization': token
        },
        success: (res) => {
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