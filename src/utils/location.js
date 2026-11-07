import { ensureFeaturePermission } from './feature-permission.js'
import { wgs84ToGcj02 } from './live-location-coordinates.mjs'

// 共享定位工具：返回 Promise<{latitude, longitude}>，在 H5 环境回退到 navigator.geolocation
export async function getUserLocationOnce(coordType = null, { interactive = false, isCurrent = () => true, includeAccuracy = false } = {}) {
  if (interactive && !await ensureFeaturePermission('location', { isCurrent })) throw Object.assign(new Error('请允许定位权限后重试'), { code: 'permission_denied' })
  if (!isCurrent()) throw new Error('定位已取消')
  // 返回对象 { latitude, longitude } 或 抛错
  return new Promise((resolve, reject) => {
    const resolveCoordinates = (point, accuracy) => {
      if (!isCurrent()) { reject(Object.assign(new Error('定位已取消'), { code: 'cancelled' })); return }
      const metres = typeof accuracy === 'number' || typeof accuracy === 'string' && accuracy.trim() !== '' ? Number(accuracy) : NaN
      resolve({ ...point, ...(includeAccuracy && Number.isFinite(metres) && metres >= 0 ? { accuracy: metres } : {}) })
    }
    // 检测是否为H5环境
    // H5 也可能加载微信 JS SDK，不能通过 window.wx 判断是否为小程序。
    const isH5 = process.env.UNI_PLATFORM === 'h5'
    let isApp = ['app', 'app-plus'].includes(process.env.UNI_PLATFORM)
    
    // 检测平台信息，支付宝小程序不支持type参数
    let shouldSkipType = false
    try {
      const systemInfo = uni.getSystemInfoSync()
      isApp = isApp || ['app', 'app-plus'].includes(systemInfo.uniPlatform)
      if (systemInfo.uniPlatform === 'mp-alipay') {
        shouldSkipType = true
        console.log('检测到支付宝小程序，跳过type参数')
      }
    } catch (e) {
      console.warn('获取系统信息失败:', e)
    }
    
    try {
      // H5环境下先尝试使用浏览器原生API，避免坐标系转换问题
      if (isH5 && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => {
            resolveCoordinates({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }, pos.coords.accuracy)
          },
          (geoError) => {
            console.warn('浏览器定位失败，尝试uni.getLocation:', geoError)
            // 浏览器定位失败，尝试uni.getLocation
            fallbackToUniLocation()
          },
          { enableHighAccuracy: true, timeout: 10000 }
        )
      } else {
        // 非H5环境直接使用uni.getLocation
        fallbackToUniLocation()
      }
      
      function fallbackToUniLocation() {
        let retriedWithoutType = false
        const timer = setTimeout(() => reject(Object.assign(new Error('定位超时'), { code: 'LOCATION_TIMEOUT' })), 20000)
        const locationOptions = {
          success(res) {
            // 兼容不同平台的返回数据结构
            let latitude = res?.latitude
            let longitude = res?.longitude
            
            // 支付宝小程序可能返回字符串，需要转换
            if (typeof latitude === 'string') {
              latitude = parseFloat(latitude)
            }
            if (typeof longitude === 'string') {
              longitude = parseFloat(longitude)
            }
            
            if (res && typeof latitude === 'number' && typeof longitude === 'number' && 
                Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
              clearTimeout(timer)
              // App使用系统WGS84定位，地图/地址接口需要GCJ02时仅在本地转换一次。
              resolveCoordinates(isApp && coordType === 'gcj02' ? wgs84ToGcj02(latitude, longitude) : { latitude, longitude }, res.accuracy ?? res.horizontalAccuracy)
            } else {
              clearTimeout(timer)
              console.warn('定位返回数据格式异常')
              reject(new Error('定位返回数据异常'))
            }
          },
          fail(err) {
            // 如果是支付宝小程序不支持type的错误，重试不传type
            if (!retriedWithoutType && err?.errMsg?.includes('暂不支持 type') && locationOptions.type) {
              console.log('支付宝小程序不支持type参数，重试不传type')
              retriedWithoutType = true
              const retryOptions = { ...locationOptions }
              delete retryOptions.type
              try { uni.getLocation(retryOptions) } catch (error) { clearTimeout(timer); reject(error) }
              return
            }
            clearTimeout(timer)
            console.warn('[location] 获取坐标失败', { code: err?.errCode ?? err?.code, message: err?.errMsg || err?.message })
            reject(err || new Error('定位失败'))
          },
          timeout: 15000,
          highAccuracyExpireTime: 15000
        }
        
        // 只有指定了坐标系类型且不是支付宝小程序才添加type参数
        if ((coordType || isApp) && !shouldSkipType) {
          locationOptions.type = isApp ? 'wgs84' : coordType
        }
        
        try { uni.getLocation(locationOptions) } catch (error) { clearTimeout(timer); reject(error) }
      }
      
    } catch (e) {
      reject(e)
    }
  })
}
