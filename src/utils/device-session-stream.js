import { baseUrl } from '@/api/settings.js'
import { createDeviceSessionTransport } from './device-session-transport.mjs'

const transport = createDeviceSessionTransport({
  getToken: () => uni.getStorageSync('token') || '',
  getBaseUrl: () => baseUrl,
  connectSocket: options => uni.connectSocket(options)
})

export const subscribeDeviceSession = (deviceId, listener) => transport.subscribe(deviceId, listener)
