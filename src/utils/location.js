// 共享定位工具：返回 Promise<{latitude, longitude}>，在 H5 环境回退到 navigator.geolocation
export function getUserLocationOnce(coordType = null) {
  // 返回对象 { latitude, longitude } 或 抛错
  return new Promise((resolve, reject) => {
    // 检测是否为H5环境
    const isH5 = typeof window !== 'undefined' && !window.wx && !window.my && !window.swan
    
    // 检测平台信息，支付宝小程序不支持type参数
    let shouldSkipType = false
    try {
      const systemInfo = uni.getSystemInfoSync()
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
            resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
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
        const locationOptions = {
          success(res) {
            // 兼容不同平台的返回数据结构
            let latitude = res.latitude
            let longitude = res.longitude
            
            // 支付宝小程序可能返回字符串，需要转换
            if (typeof latitude === 'string') {
              latitude = parseFloat(latitude)
            }
            if (typeof longitude === 'string') {
              longitude = parseFloat(longitude)
            }
            
            if (res && typeof latitude === 'number' && typeof longitude === 'number' && 
                !isNaN(latitude) && !isNaN(longitude)) {
              resolve({ latitude, longitude })
            } else {
              console.warn('定位返回数据格式异常:', res)
              reject(new Error('定位返回数据异常'))
            }
          },
          fail(err) {
            // 如果是支付宝小程序不支持type的错误，重试不传type
            if (err.errMsg && err.errMsg.includes('暂不支持 type') && coordType) {
              console.log('支付宝小程序不支持type参数，重试不传type')
              const retryOptions = { ...locationOptions }
              delete retryOptions.type
              uni.getLocation(retryOptions)
              return
            }
            reject(err || new Error('定位失败'))
          },
          timeout: 15000
        }
        
        // 只有指定了坐标系类型且不是支付宝小程序才添加type参数
        if (coordType && !shouldSkipType) {
          locationOptions.type = coordType
        }
        
        uni.getLocation(locationOptions)
      }
      
    } catch (e) {
      reject(e)
    }
  })
}
