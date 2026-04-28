import { mapConfig } from './map-config'
import request from './index'

  // 地点搜索API（兼容H5跨域问题）
  export function searchPlaces(keyword, latitude, longitude, radius = 5000) {
    return request({
      url: '/api/map/search-places',
      method: 'GET',
      data: {
        keyword,
        latitude,
        longitude,
        radius
      },
      needAuth: true
    })
  }

  // 逆地址解析API（兼容H5跨域问题）
  export function reverseGeocoder(latitude, longitude) {
    return request({
      url: '/api/map/reverse-geocoder',
      method: 'GET',
      data: {
        latitude,
        longitude
      },
      needAuth: true
    })
  }

  // 周边搜索API（兼容H5跨域问题）
  export function searchNearby(category, latitude, longitude, radius = 5000) {
    return request({
      url: '/api/map/search-nearby',
      method: 'GET',
      data: {
        category,
        latitude,
        longitude,
        radius
      },
      needAuth: true
    })
  }

  // 获取API密钥
  export function getMapApiKey() {
    return mapConfig.qqMapKey || mapConfig.qqMapKeyBackup || ''
  }

  // 检查API密钥是否已配置
  export function isApiKeyConfigured() {
    return !!getMapApiKey() && getMapApiKey() !== 'YOUR_TENCENT_MAP_KEY'
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
