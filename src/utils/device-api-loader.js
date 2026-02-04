// 设备API安全加载器
import * as deviceAPI from '@/api/device.js'

export function getDeviceAPI() {
  try {
    console.log('检查设备API模块:', {
      connectDevice: typeof deviceAPI.connectDevice,
      disconnectDevice: typeof deviceAPI.disconnectDevice,
      getConnectedDevices: typeof deviceAPI.getConnectedDevices
    })
    
    return {
      connectDevice: deviceAPI.connectDevice,
      disconnectDevice: deviceAPI.disconnectDevice,
      getConnectedDevices: deviceAPI.getConnectedDevices,
      isValid: !!(deviceAPI.connectDevice && deviceAPI.disconnectDevice && deviceAPI.getConnectedDevices)
    }
  } catch (error) {
    console.error('设备API加载失败:', error)
    return {
      connectDevice: null,
      disconnectDevice: null,
      getConnectedDevices: null,
      isValid: false,
      error: error.message
    }
  }
}

// 测试API可用性
export function testDeviceAPI() {
  const api = getDeviceAPI()
  console.log('设备API测试结果:', api)
  return api.isValid
}
