// 腾讯位置服务API配置
// 请替换为您的腾讯位置服务API密钥
const MAP_API_KEY = 'RZPBZ-AXLY3-ENO3Q-O3AZU-JGX4Q-KTFZU'

// 腾讯位置服务API基础URL
const MAP_BASE_URL = 'https://apis.map.qq.com/ws'

  import request from './index'

  // 地点搜索API（兼容H5跨域问题）
  export function searchPlaces(keyword, latitude, longitude, radius = 5000) {
    const params = {
      keyword: keyword,
      boundary: `nearby(${latitude},${longitude},${radius})`,
      key: MAP_API_KEY,
      page_size: 20,
      page_index: 1
    }
    
    const queryString = Object.keys(params)
      .map(key => `${key}=${encodeURIComponent(params[key])}`)
      .join('&')
      
    return new Promise((resolve, reject) => {
      // 检测是否为H5环境
      const isH5 = typeof window !== 'undefined' && !window.wx && !window.my && !window.swan
      
      if (isH5) {
        // H5环境使用JSONP方式避免跨域问题
        const callbackName = `searchPlacesCallback_${Date.now()}`
        const script = document.createElement('script')
        const jsonpUrl = `${MAP_BASE_URL}/place/v1/search?${queryString}&output=jsonp&callback=${callbackName}`
        
        // 设置全局回调函数
        window[callbackName] = function(data) {
          // 清理
          document.head.removeChild(script)
          delete window[callbackName]
          
          if (data.status === 0) {
            resolve(data)
          } else {
            reject(new Error(data.message || '搜索失败'))
          }
        }
        
        script.onerror = function() {
          // 清理
          document.head.removeChild(script)
          delete window[callbackName]
          reject(new Error('网络请求失败'))
        }
        
        script.src = jsonpUrl
        document.head.appendChild(script)
        
        // 设置超时
        setTimeout(() => {
          if (window[callbackName]) {
            document.head.removeChild(script)
            delete window[callbackName]
            reject(new Error('请求超时'))
          }
        }, 10000)
      } else {
        // 非H5环境使用uni.request
        uni.request({
          url: `${MAP_BASE_URL}/place/v1/search?${queryString}`,
          method: 'GET',
          success: (res) => {
            if (res.data.status === 0) {
              resolve(res.data)
            } else {
              reject(new Error(res.data.message || '搜索失败'))
            }
          },
          fail: (err) => {
            reject(err)
          }
        })
      }
    })
  }

  // 逆地址解析API（兼容H5跨域问题）
  export function reverseGeocoder(latitude, longitude) {
    const params = {
      location: `${latitude},${longitude}`,
      key: MAP_API_KEY
    }
    
    const queryString = Object.keys(params)
      .map(key => `${key}=${encodeURIComponent(params[key])}`)
      .join('&')
      
    return new Promise((resolve, reject) => {
      // 检测是否为H5环境
      const isH5 = typeof window !== 'undefined' && !window.wx && !window.my && !window.swan
      
      if (isH5) {
        // H5环境使用JSONP方式避免跨域问题
        const callbackName = `reverseGeocoderCallback_${Date.now()}`
        const script = document.createElement('script')
        const jsonpUrl = `${MAP_BASE_URL}/geocoder/v1/?${queryString}&output=jsonp&callback=${callbackName}`
        
        // 设置全局回调函数
        window[callbackName] = function(data) {
          // 清理
          document.head.removeChild(script)
          delete window[callbackName]
          
          if (data.status === 0) {
            resolve(data)
          } else {
            reject(new Error(data.message || '地址解析失败'))
          }
        }
        
        script.onerror = function() {
          // 清理
          document.head.removeChild(script)
          delete window[callbackName]
          reject(new Error('网络请求失败'))
        }
        
        script.src = jsonpUrl
        document.head.appendChild(script)
        
        // 设置超时
        setTimeout(() => {
          if (window[callbackName]) {
            document.head.removeChild(script)
            delete window[callbackName]
            reject(new Error('请求超时'))
          }
        }, 10000)
      } else {
        // 非H5环境使用uni.request
        uni.request({
          url: `${MAP_BASE_URL}/geocoder/v1/?${queryString}`,
          method: 'GET',
          success: (res) => {
            if (res.data.status === 0) {
              resolve(res.data)
            } else {
              reject(new Error(res.data.message || '地址解析失败'))
            }
          },
          fail: (err) => {
            reject(err)
          }
        })
      }
    })
  }

  // 周边搜索API（兼容H5跨域问题）
  export function searchNearby(category, latitude, longitude, radius = 5000) {
    const params = {
      category: category,
      boundary: `nearby(${latitude},${longitude},${radius})`,
      key: MAP_API_KEY,
      page_size: 20,
      page_index: 1
    }
    
    const queryString = Object.keys(params)
      .map(key => `${key}=${encodeURIComponent(params[key])}`)
      .join('&')
      
    return new Promise((resolve, reject) => {
      // 检测是否为H5环境
      const isH5 = typeof window !== 'undefined' && !window.wx && !window.my && !window.swan
      
      if (isH5) {
        // H5环境使用JSONP方式避免跨域问题
        const callbackName = `searchNearbyCallback_${Date.now()}`
        const script = document.createElement('script')
        const jsonpUrl = `${MAP_BASE_URL}/place/v1/search?${queryString}&output=jsonp&callback=${callbackName}`
        
        // 设置全局回调函数
        window[callbackName] = function(data) {
          // 清理
          document.head.removeChild(script)
          delete window[callbackName]
          
          if (data.status === 0) {
            resolve(data)
          } else {
            reject(new Error(data.message || '周边搜索失败'))
          }
        }
        
        script.onerror = function() {
          // 清理
          document.head.removeChild(script)
          delete window[callbackName]
          reject(new Error('网络请求失败'))
        }
        
        script.src = jsonpUrl
        document.head.appendChild(script)
        
        // 设置超时
        setTimeout(() => {
          if (window[callbackName]) {
            document.head.removeChild(script)
            delete window[callbackName]
            reject(new Error('请求超时'))
          }
        }, 10000)
      } else {
        // 非H5环境使用uni.request
        uni.request({
          url: `${MAP_BASE_URL}/place/v1/search?${queryString}`,
          method: 'GET',
          success: (res) => {
            if (res.data.status === 0) {
              resolve(res.data)
            } else {
              reject(new Error(res.data.message || '周边搜索失败'))
            }
          },
          fail: (err) => {
            reject(err)
          }
        })
      }
    })
  }

  // 获取API密钥
  export function getMapApiKey() {
    return MAP_API_KEY
  }

  // 检查API密钥是否已配置
  export function isApiKeyConfigured() {
    return MAP_API_KEY !== 'YOUR_TENCENT_MAP_KEY'
  }

  // 上报设备信息错误（用于用户报错垃圾桶位置/信息）
  export function reportDeviceError(deviceId, reason = '') {
    // 使用项目统一请求封装，需后端实现 /api/device/report_error
    return request({
      url: '/api/device/report_error',
      method: 'POST',
      data: {
        device_id: deviceId,
        reason
      },
      needAuth: true
    })
  }

  // 新增垃圾桶 - 使用新的API数据结构
  export function addTrashBin(data) {
    // 使用项目统一请求封装，需后端实现 /api/trash-bin/add
    return request({
      url: '/api/trash-bin/add',
      method: 'POST',
      data: {
        name: data.name,
        description: data.description,
        latitude: data.latitude,
        longitude: data.longitude,
        image: data.image // 图片文件或URL
      },
      needAuth: true
    })
  }

  // 获取垃圾桶列表
  export function getTrashBinList(params = {}) {
    return request({
      url: '/api/trash-bin/list',
      method: 'GET',
      data: {
        latitude: params.latitude,
        longitude: params.longitude,
        radius: params.radius || 5000, // 默认5km半径
        page: params.page || 1,
        pageSize: params.pageSize || 20
      }
    })
  }

  // 上传垃圾桶图片
  export function uploadTrashBinImage(filePath) {
    return new Promise((resolve, reject) => {
      // 从settings中获取baseUrl
      import('./settings').then(settings => {
        const uploadUrl = settings.baseUrl + '/api/upload/trash-bin-image'
        
        uni.uploadFile({
          url: uploadUrl,
          filePath: filePath,
          name: 'file',
          header: {
            'Authorization': uni.getStorageSync('token') ? `Bearer ${uni.getStorageSync('token')}` : ''
          },
          success: (res) => {
            try {
              const data = JSON.parse(res.data)
              if (data.code === 200 || data.code === 0) {
                resolve(data.data)
              } else {
                reject(new Error(data.message || data.msg || '上传失败'))
              }
            } catch (e) {
              reject(new Error('上传响应解析失败'))
            }
          },
          fail: (err) => {
            reject(err)
          }
        })
      }).catch(() => {
        reject(new Error('无法获取上传配置'))
      })
    })
  }