import { ref, onMounted, onUnmounted } from 'vue'
import { getConnectedDevices } from '../api/device.js'

/**
 * 设备连接状态管理组合式函数
 * @returns {Object} 包含连接状态和相关方法的对象
 */
export function useDeviceConnection() {
  const hasConnection = ref(false)
  const connectedDevice = ref(null)
  const checkTimer = ref(null)
  const isChecking = ref(false)
  const points= ref(null);

  // 检查设备连接状态
  async function checkDeviceConnection() {
    // 检查本地存储的连接标记
    const connectionTime = uni.getStorageSync('connection')
    if (!connectionTime) {
      hasConnection.value = false
      connectedDevice.value = null
      return
    }

    // 检查连接时间是否过期（超过10分钟自动清除）
    const now = Date.now()
    const timeDiff = now - connectionTime
    if (timeDiff > 10 * 60 * 1000) { // 10分钟
      clearConnectionStorage()
      return
    }

    // 防止重复检查
    if (isChecking.value) return
    if(!uni.getStorageSync('token')){
      clearConnectionStorage()
      return
    }
    try {
      isChecking.value = true
      const result = await getConnectedDevices()
      
      if (result && result.code === 0 && result.data && result.data.length > 0) {
        // 有设备连接
        hasConnection.value = true
        connectedDevice.value = result.data[0] // 取第一个连接的设备
        points.value = result.points || null
        console.log('检测到已连接设备')
      } else {
        // 没有设备连接，清除本地存储
        clearConnectionStorage()
      }
    } catch (error) {
      console.error('检查设备连接失败:', error)
      // 网络错误时不清除连接状态，避免误判
    } finally {
      isChecking.value = false
    }
  }

  // 清除连接相关存储
  function clearConnectionStorage() {
    hasConnection.value = false
    connectedDevice.value = null
    uni.removeStorageSync('connection')
    console.log('已清除设备连接状态')
  }

  // 启动定时检查
  function startConnectionCheck() {
    // 清除之前的定时器
    stopConnectionCheck()
    
    // 立即检查一次
    checkDeviceConnection()
    
    // ÿ5秒检查一次
    checkTimer.value = setInterval(() => {
      checkDeviceConnection()
    }, 5000)
  }

  // 停止定时检查
  function stopConnectionCheck() {
    if (checkTimer.value) {
      clearInterval(checkTimer.value)
      checkTimer.value = null
    }
  }

  // 跳转到设备连接页面
  function goToDeviceConnection() {
    if (connectedDevice.value) {
      // 如果有具体设备信息，可以传递参数
      const deviceId = connectedDevice.value.device_id || connectedDevice.value.id
      const deviceName = connectedDevice.value.device_name || connectedDevice.value.name
      
      uni.navigateTo({
        url: `/pages/scan/scan?connected=true&device_id=${deviceId}&device_name=${encodeURIComponent(deviceName || '')}`
      })
    } else {
      // 直接跳转到连接页面
      uni.navigateTo({
        url: '/pages/scan/scan'
      })
    }
  }

  // 组件挂载时启动检查
  onMounted(() => {
    const connectionTime = uni.getStorageSync('connection')
    if (connectionTime) {
      startConnectionCheck()
    }
  })

  // 组件卸载时清理资源
  onUnmounted(() => {
    stopConnectionCheck()
  })

  return {
    hasConnection,
    connectedDevice,
    isChecking,
    points,
    checkDeviceConnection,
    clearConnectionStorage,
    startConnectionCheck,
    stopConnectionCheck,
    goToDeviceConnection
  }
}
