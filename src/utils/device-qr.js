import { getDeviceQrScanContent, resolveDeviceQrPathTarget } from './device-qr-entry.mjs'
export { getDeviceQrScanContent } from './device-qr-entry.mjs'

export const MOCK_DEVICE = Object.freeze({
  device_id: 'FTX-MOCK-ROBOT-001',
  device_name: '分投侠演示机器人',
  device_mode: 'robot',
  mock: true
})

const MOCK_CONNECTION_KEY = 'mock_device_connection'

function decodeValue(value) {
  try {
    return decodeURIComponent(String(value || '').replace(/\+/g, ' '))
  } catch (e) {
    return String(value || '')
  }
}

export function parseDeviceQrParams(text) {
  const params = {}
  String(text || '').split('&').forEach((pair) => {
    if (!pair) return
    const index = pair.indexOf('=')
    const key = index >= 0 ? pair.slice(0, index) : pair
    const value = index >= 0 ? pair.slice(index + 1) : ''
    if (!key) return
    params[decodeValue(key)] = decodeValue(value)
  })
  return params
}

function isMockFlag(value) {
  return ['1', 'true', 'yes', 'mock'].includes(String(value || '').toLowerCase())
}

export function normalizeDeviceMode(value) {
  return String(value || '').toLowerCase() === 'robot' ? 'robot' : 'bin'
}

export function buildRobotControlUrl(deviceId, deviceName, isMock = false) {
  const query = [
    `device_id=${encodeURIComponent(deviceId || '')}`,
    `device_name=${encodeURIComponent(deviceName || '')}`
  ]
  if (isMock) query.push('mock=1')
  return `/pages-nonTheme/robot-control?${query.join('&')}`
}

export function resolveDeviceScanTarget(rawContent, scanPage = '/pages/scan/scan') {
  const raw = String(rawContent || '').trim()
  if (!raw) return { url: '', deviceId: '', deviceName: '', deviceMode: 'bin', token: '', isMock: false }

  let directPath = ''
  const hashIndex = raw.indexOf('#')
  if (hashIndex >= 0) {
    const hashPath = raw.slice(hashIndex + 1)
    directPath = hashPath.startsWith('/') ? hashPath : `/${hashPath}`
  } else if (raw.startsWith('/pages/') || raw.startsWith('/pages-nonTheme/') || raw.startsWith('/pages-dark/')) {
    directPath = raw
  }

  if (directPath) {
    const sceneTarget = resolveDeviceQrPathTarget(directPath, scanPage)
    if (sceneTarget) return sceneTarget

    const queryText = directPath.includes('?') ? directPath.split('?').slice(1).join('?') : ''
    const params = parseDeviceQrParams(queryText)
    const deviceMode = normalizeDeviceMode(params.device_mode || params.deviceMode || (directPath.includes('robot-control') ? 'robot' : 'bin'))
    return {
      url: directPath,
      deviceId: params.device_id || params.deviceId || '',
      deviceName: params.device_name || params.deviceName || '',
      deviceMode,
      token: params.token || '',
      isMock: isMockFlag(params.mock || params.demo)
    }
  }

  const queryText = raw.includes('?') ? raw.split('?').slice(1).join('?') : raw
  const params = parseDeviceQrParams(queryText)
  const deviceId = params.device_id || params.deviceId || ''
  const deviceName = params.device_name || params.deviceName || ''
  const deviceMode = normalizeDeviceMode(params.device_mode || params.deviceMode)
  const token = params.token || ''
  const isMock = isMockFlag(params.mock || params.demo)

  if (!deviceId && !raw.includes('=') && !raw.includes('?')) {
    return {
      url: `${scanPage}?device_id=${encodeURIComponent(raw)}&device_mode=bin`,
      deviceId: raw,
      deviceName: '',
      deviceMode: 'bin',
      token: '',
      isMock: false
    }
  }

  if (deviceId && (isMock || !token)) {
    return {
      url: deviceMode === 'robot'
        ? buildRobotControlUrl(deviceId, deviceName, isMock)
        : `${scanPage}?device_id=${encodeURIComponent(deviceId)}&device_name=${encodeURIComponent(deviceName)}&device_mode=bin${isMock ? '&mock=1' : ''}`,
      deviceId,
      deviceName,
      deviceMode,
      token,
      isMock
    }
  }

  if (!deviceId || !token) {
    return { url: '', deviceId, deviceName, deviceMode, token, isMock }
  }

  return {
    url: `${scanPage}?device_id=${encodeURIComponent(deviceId)}&token=${encodeURIComponent(token)}&device_name=${encodeURIComponent(deviceName)}&device_mode=${deviceMode}`,
    deviceId,
    deviceName,
    deviceMode,
    token,
    isMock: false
  }
}

export function saveMockDeviceConnection(device = MOCK_DEVICE) {
  const connection = {
    device_id: device.device_id || MOCK_DEVICE.device_id,
    device_name: device.device_name || MOCK_DEVICE.device_name,
    device_mode: normalizeDeviceMode(device.device_mode || MOCK_DEVICE.device_mode),
    mock: true,
    connected_at: Date.now()
  }
  uni.setStorageSync('connection', connection.connected_at)
  uni.setStorageSync(MOCK_CONNECTION_KEY, connection)
  return connection
}

export function scanAndConnectDevice(onMockConnected) {
  let platform, uniPlatform, isH5 = false

  try {
    const deviceInfo = uni.getDeviceInfo ? uni.getDeviceInfo() : uni.getSystemInfoSync()
    platform = deviceInfo.platform
  } catch (e) {
    platform = uni.getSystemInfoSync().platform
  }

  try {
    const appBaseInfo = uni.getAppBaseInfo ? uni.getAppBaseInfo() : uni.getSystemInfoSync()
    uniPlatform = appBaseInfo.uniPlatform
  } catch (e) {
    uniPlatform = 'unknown'
  }

  isH5 = (
    uniPlatform === 'web' ||
    (platform === 'devtools' && typeof window !== 'undefined' && window.location) ||
    (typeof document !== 'undefined' && typeof window !== 'undefined' && !window.wx && !window.my)
  )

  const connectDevice = (rawContent) => {
    const target = resolveDeviceScanTarget(rawContent, '/pages/scan/scan')
    if (!target.url) {
      uni.showToast({ title: target.invalidScene ? '二维码已过期或异常，请重新扫码' : '设备ID不能为空', icon: 'none' })
      return
    }
    if (target.isMock) {
      saveMockDeviceConnection({
        device_id: target.deviceId,
        device_name: target.deviceName,
        device_mode: target.deviceMode
      })
      onMockConnected?.()
    }
    uni.navigateTo({ url: target.url })
  }

  if (isH5) {
    uni.showModal({
      title: '连接设备',
      content: '请输入设备ID（H5端暂不支持扫码）',
      editable: true,
      placeholderText: '请输入设备ID',
      success: (res) => {
        if (res.confirm && res.content) connectDevice(res.content)
      }
    })
  } else {
    // #ifdef MP-WEIXIN
    uni.scanCode({
      success: (res) => connectDevice(getDeviceQrScanContent(res)),
      fail: () => uni.showToast({ title: '扫码失败', icon: 'none' })
    })
    // #endif
    // #ifndef MP-WEIXIN
    uni.scanCode({
      scanType: ['qrCode'],
      success: (res) => connectDevice(getDeviceQrScanContent(res)),
      fail: () => uni.showToast({ title: '扫码失败', icon: 'none' })
    })
    // #endif
  }
}

export function getMockDeviceConnection() {
  const connection = uni.getStorageSync(MOCK_CONNECTION_KEY)
  return connection && connection.mock ? connection : null
}

export function clearMockDeviceConnection() {
  uni.removeStorageSync(MOCK_CONNECTION_KEY)
}
