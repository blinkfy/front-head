import { mapConfig } from './map-config'
import request from './index'
import { baseUrl } from './settings'
import { compressTrashBinImage } from '@/utils/trash-bin-image'
import { toMapDisplayPoint } from '@/utils/map-display-point.mjs'

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
        image: data.image // 压缩后的 Base64 图片（兼容旧图片地址）
      },
      needAuth: true
    })
  }

  // 获取垃圾桶列表（支持中心点+半径，或矩形 bbox 增量查询）
  export function getTrashBinList(params = {}) {
    const hasBbox = [params.minLat, params.maxLat, params.minLng, params.maxLng].every((value) => value != null)
    // 只携带本次查询用到的参数：uni 会把 undefined 序列化成空串，会干扰后端"是否传参"的判断
    const data = {
      page: params.page || 1,
      pageSize: params.pageSize || 20
    }
    if (hasBbox) {
      data.minLat = params.minLat
      data.maxLat = params.maxLat
      data.minLng = params.minLng
      data.maxLng = params.maxLng
    } else {
      if (params.latitude != null) data.latitude = params.latitude
      if (params.longitude != null) data.longitude = params.longitude
      data.radius = params.radius || 5000 // 默认5km半径
    }
    return request({
      url: '/api/trash-bin/list',
      method: 'GET',
      data
    }).then(result => Array.isArray(result?.data)
      ? { ...result, data: result.data.map(toMapDisplayPoint) } : result)
  }

  // 单点按需取图（列表只带图片标识，查看图片时才拉取完整图片内容）
  export function getTrashBinImage(id) {
    return request({
      url: `/api/trash-bin/${id}/image`,
      method: 'GET'
    })
  }

  // 在客户端压缩，随新增请求直接提交 Base64 图片。
  export async function uploadTrashBinImage(filePath) {
    const image = await compressTrashBinImage(filePath)
    return { url: image, path: image }
  }

// Capability probing keeps newer clients compatible with servers without AI pre-review.
export function getBinPreReviewCapability() {
  return request({ url: '/api/trash-bin/pre-review/capability', method: 'GET', needAuth: true, silent: true })
}

export function getBinSatelliteReference(latitude, longitude) {
  return request({ url: '/api/map/satellite-reference', method: 'GET', data: { latitude, longitude }, needAuth: true, silent: true })
}

export function preReviewTrashBin(data, { onProgress, isActive = () => true } = {}) {
  if (typeof onProgress !== 'function') return request({ url: '/api/trash-bin/pre-review', method: 'POST', data, needAuth: true, silent: true })
  // As with recognition, the model streams on the server while every client platform reads small snapshots.
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('')
  const progressId = `bin_${Date.now()}_${bytes}`
  const token = uni.getStorageSync('token') || ''
  let polling = true, pollTimer = null, revision = -1, polls = 0
  const stop = () => { polling = false; if (pollTimer) clearTimeout(pollTimer); pollTimer = null }
  const active = () => polling && isActive() && (uni.getStorageSync('token') || '') === token
  const schedule = (delay = polls < 8 ? 250 : 450) => {
    if (!active()) { stop(); return }
    pollTimer = setTimeout(() => {
      if (!active()) { stop(); return }
      polls++
      uni.request({
        url: `${baseUrl}/api/trash-bin/pre-review/progress/${encodeURIComponent(progressId)}`,
        method: 'GET', header: token ? { Authorization: token } : {}, timeout: 5000,
        success: response => {
          if (!active()) return
          if (response.statusCode === 404) return // The source request may still be uploading.
          const snapshot = response.statusCode === 200 && response.data?.code === 0 ? response.data.data : null
          if (!snapshot) { stop(); return } // The original POST remains authoritative.
          if (Number.isInteger(snapshot.revision) && snapshot.revision > revision) {
            revision = snapshot.revision
            try { onProgress(snapshot) } catch (_) { /* Presentation callbacks cannot fail the submission. */ }
          }
          if (snapshot.status === 'failed' || snapshot.status === 'succeeded') stop()
        },
        fail: stop,
        complete: () => { if (active()) schedule(); else stop() }
      })
    }, delay)
  }
  const pending = request({ url: '/api/trash-bin/pre-review', method: 'POST', data: { ...data, progressId }, needAuth: true, silent: true })
  schedule(150)
  return pending.finally(stop)
}
