<template>
  <view class="scan-container scan-dark">
    <view class="light-eco-decor" aria-hidden="true">
      <text class="eco-symbol eco-leaf-one">🌿</text>
      <text class="eco-symbol eco-leaf-two">🍃</text>
      <text class="eco-symbol eco-recycle">♻️</text>
    </view>
    <view class="scan-topbar">
      <view class="back-btn" @click="goBack" aria-label="返回">
        <text class="back-icon">‹</text>
      </view>
      <view class="topbar-brand">
        <image class="brand-image" src="/static/colorful-bin.png" mode="aspectFit" />
        <view class="brand-copy">
          <text class="brand-title">智能设备连接</text>
          <text class="brand-subtitle">分投侠设备服务</text>
        </view>
      </view>
      <view class="topbar-state" :class="{ online: connected, pending: loading, offline: !connected && !loading }">
        <view class="state-dot"></view>
        <text>{{ connected ? '已连接' : loading ? '连接中' : '待连接' }}</text>
      </view>
    </view>

    <view class="content-wrapper">
      <view class="connection-overview">
        <view class="device-visual" :class="{ connected, loading, error: !connected && !loading }">
          <view class="visual-ring ring-one"></view>
          <view class="visual-ring ring-two"></view>
          <image class="device-visual-image" src="/static/colorful-bin.png" mode="aspectFit" />
          <view class="visual-status-mark">
            <text v-if="loading">···</text>
            <text v-else-if="connected">✓</text>
            <text v-else>!</text>
          </view>
        </view>
        <text class="overview-title">{{ connected ? '设备已准备就绪' : loading ? '正在验证设备' : '等待设备连接' }}</text>
        <text class="overview-desc">{{ connected ? '连接状态正常，分类数据将实时同步' : loading ? '正在校验设备身份与安全令牌' : '请返回后重新扫描设备二维码' }}</text>
        <view class="connection-steps">
          <view class="step-item active"><view class="step-dot"></view><text>设备</text></view>
          <view class="step-line" :class="{ active: loading || connected }"></view>
          <view class="step-item" :class="{ active: loading || connected }"><view class="step-dot"></view><text>验证</text></view>
          <view class="step-line" :class="{ active: connected }"></view>
          <view class="step-item" :class="{ active: connected }"><view class="step-dot"></view><text>完成</text></view>
        </view>
      </view>

      <view class="status-card">
        <view v-if="loading" class="status-section loading-section">
          <view class="section-kicker">连接状态</view>
          <text class="status-title">正在连接智能设备</text>
          <text class="status-desc">建立安全连接中，请稍候</text>
          <view class="device-info-card">
            <view class="device-info-row">
              <text class="device-label">设备 ID</text>
              <text class="device-value mono">{{ deviceId || '获取中' }}</text>
            </view>
          </view>
          <view class="progress-bar">
            <view class="progress-fill"></view>
          </view>
        </view>

        <view v-else-if="connected" class="status-section success-section">
          <view class="section-kicker success">连接成功</view>
          <text class="status-title">设备连接成功</text>
          <text class="status-desc">安全连接已建立，可以开始分类投放</text>
          <view class="device-info-card success">
            <view class="device-info-row">
              <text class="device-label">设备名称</text>
              <text class="device-value">{{ deviceName || '智能分类设备' }}</text>
            </view>
            <view class="device-info-row">
              <text class="device-label">设备 ID</text>
              <text class="device-value mono">{{ deviceId }}</text>
            </view>
          </view>
          <view class="action-group">
            <button class="action-btn primary" @click="goToMap">
              <text class="btn-text">查看地图</text>
            </button>
            <button class="action-btn danger" @click="endConnection">
              <text class="btn-text">结束连接</text>
            </button>
          </view>
          <view class="timeout-note"><text>5 分钟无投放记录时将自动断开</text></view>
        </view>

        <view v-else class="status-section error-section">
          <view class="section-kicker error">连接异常</view>
          <text class="status-title">连接暂时中断</text>
          <text class="status-desc">{{ errorMessage || '网络信号不稳定，请重试连接' }}</text>
          <view class="device-info-card error">
            <view class="device-info-row">
              <text class="device-label">设备 ID</text>
              <text class="device-value mono">{{ deviceId || '未获取到' }}</text>
            </view>
          </view>
          <view class="action-group">
            <button v-if="isH5" class="action-btn warning" @click="retryConnection">
              <text class="btn-text">重新连接</text>
            </button>
            <button v-if="isTokenError && !isH5" class="action-btn secondary" @click="startScan">
              <text class="btn-text">重新扫码</text>
            </button>
          </view>
        </view>
      </view>

      <view class="eco-tip">
        <view class="eco-dot"></view>
        <text class="tip-text">每次垃圾分类，都是对地球环境的一份贡献</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { getDeviceAPI, testDeviceAPI } from '@/utils/device-api-loader.js'
import { normalizeDeviceMode, resolveDeviceScanTarget, saveMockDeviceConnection } from '@/utils/device-qr.js'

// 使用安全的API加载器
let deviceAPI = null

// 初始化设备API
function initDeviceAPI() {
  try {
    deviceAPI = getDeviceAPI()
    console.log('设备API初始化:', {
      isValid: deviceAPI.isValid,
      error: deviceAPI.error,
      functions: {
        connectDevice: typeof deviceAPI.connectDevice,
        disconnectDevice: typeof deviceAPI.disconnectDevice,
        getConnectedDevices: typeof deviceAPI.getConnectedDevices
      }
    })
    return deviceAPI.isValid
  } catch (error) {
    console.error('设备API初始化失败:', error)
    return false
  }
}

const deviceId = ref('')
const deviceName = ref('')
const deviceMode = ref('bin')
const token = ref('')
const loading = ref(false)
const connected = ref(false)
const errorMessage = ref('')
const isTokenError = ref(false)
const isH5 = ref(false)
const connectedDevices = ref([])
const deviceCheckTimer = ref(null)

// 跨平台参数获取函数
function getPageParams() {
  let deviceIdParam = ''
  let deviceNameParam = ''
  let deviceModeParam = 'bin'
  let tokenParam = ''
  
  // 首先输出所有可能的调试信息
  console.log('=== 开始获取页面参数 ===')
  
  try {
    // 先检查是否为H5环境
    if (isH5.value && typeof window !== 'undefined' && window.location) {
      console.log('H5环境 - 当前URL:', window.location.href)
      // H5端：从URL获取参数
      let urlParams
      if (window.location.hash) {
        // hash 模式：从 hash 中提取参数
        const hashParts = window.location.hash.split('?')
        if (hashParts.length > 1) {
          urlParams = parseUrlParams(hashParts[1])
        } else {
          urlParams = {}
        }
      } else {
        // history 模式：从 search 中提取参数
        urlParams = parseUrlParams(window.location.search.substring(1))
      }
      
      deviceIdParam = urlParams.device_id || ''
      deviceNameParam = urlParams.device_name ? decodeURIComponent(urlParams.device_name) : ''
      deviceModeParam = normalizeDeviceMode(urlParams.device_mode || urlParams.deviceMode)
      tokenParam = urlParams.token || ''
    } else {
      // 小程序/APP端：从页面参数获取
      let pageParams = {}
      
      // 输出当前页面的完整信息
      try {
        if (typeof getCurrentPages === 'function') {
          const pages = getCurrentPages()
          if (pages.length > 0) {
            const currentPage = pages[pages.length - 1]
            console.log('APP/小程序端 - 当前页面完整信息:', {
              route: currentPage.route,
              options: currentPage.options,
              '$page存在': !!currentPage.$page,
              '$page内容': currentPage.$page ? {
                fullPath: currentPage.$page.fullPath,
                path: currentPage.$page.path,
                query: currentPage.$page.query,
                options: currentPage.$page.options
              } : null
            })
          }
        }
      } catch (e) {
        console.warn('获取页面调试信息失败:', e)
      }
      
      // 方法1：从getCurrentPages获取
      try {
        if (typeof getCurrentPages === 'function') {
          const pages = getCurrentPages()
          if (pages.length > 0) {
            const currentPage = pages[pages.length - 1]
            pageParams = currentPage.options || {}
            console.log('getCurrentPages获取的参数:', pageParams)
          }
        }
      } catch (e) {
        console.warn('getCurrentPages方法获取参数失败:', e)
      }
      
      // APP端特殊处理：如果getCurrentPages没有获取到参数，尝试从route获取
      if ((!pageParams.device_id && !pageParams.deviceId) && !isH5.value) {
        try {
          if (typeof getCurrentPages === 'function') {
            const pages = getCurrentPages()
            if (pages.length > 0) {
              const currentPage = pages[pages.length - 1]
              // 检查route属性
              if (currentPage.route) {
                console.log('当前页面route:', currentPage.route)
                // 如果route包含参数，尝试解析
                if (currentPage.route.includes('?')) {
                  const routeParts = currentPage.route.split('?')
                  if (routeParts.length > 1) {
                    const routeParams = parseUrlParams(routeParts[1])
                    console.log('从route解析的参数:', routeParams)
                    if (routeParams.device_id) pageParams.device_id = routeParams.device_id
                    if (routeParams.deviceId) pageParams.deviceId = routeParams.deviceId
                    if (routeParams.device_name) pageParams.device_name = routeParams.device_name
                    if (routeParams.token) pageParams.token = routeParams.token
                  }
                }
              }
              
              // 检查$page属性（APP端可能有这个属性）
              if (currentPage.$page && currentPage.$page.options) {
                console.log('从$page.options获取的参数:', currentPage.$page.options)
                const $pageParams = currentPage.$page.options
                if ($pageParams.device_id) pageParams.device_id = $pageParams.device_id
                if ($pageParams.deviceId) pageParams.deviceId = $pageParams.deviceId
                if ($pageParams.device_name) pageParams.device_name = $pageParams.device_name
                if ($pageParams.token) pageParams.token = $pageParams.token
              }
            }
          }
        } catch (e) {
          console.warn('APP端route参数获取失败:', e)
        }
      }
      
      // 方法2：如果方法1失败，尝试从uni对象获取（APP端）
      if (!pageParams.device_id && !pageParams.deviceId) {
        try {
          // APP端可能需要从不同地方获取参数
          if (typeof plus !== 'undefined' && plus.runtime) {
            // App端，尝试从启动参数获取 - 增加函数存在性检查
            if (typeof plus.runtime.getLaunchOptions === 'function') {
              const launchOptions = plus.runtime.getLaunchOptions()
              if (launchOptions && launchOptions.args) {
                console.log('App启动参数:', launchOptions.args)
                // 解析启动参数
                const args = launchOptions.args
                if (args.device_id) pageParams.device_id = args.device_id
                if (args.device_name) pageParams.device_name = args.device_name
                if (args.token) pageParams.token = args.token
              }
            } else {
              console.log('App端不支持 getLaunchOptions 方法')
              // 尝试其他APP端参数获取方式
              if (plus.runtime.arguments && plus.runtime.arguments.length > 0) {
                console.log('尝试从 plus.runtime.arguments 获取参数:', plus.runtime.arguments)
                // 解析命令行参数
                const args = plus.runtime.arguments.join(' ')
                const argMatches = {
                  device_id: args.match(/device_id[=:]([^&\s]+)/),
                  device_name: args.match(/device_name[=:]([^&\s]+)/),
                  token: args.match(/token[=:]([^&\s]+)/)
                }
                if (argMatches.device_id) pageParams.device_id = argMatches.device_id[1]
                if (argMatches.device_name) pageParams.device_name = decodeURIComponent(argMatches.device_name[1])
                if (argMatches.token) pageParams.token = argMatches.token[1]
              }
            }
          }
        } catch (e) {
          console.warn('App端参数获取失败:', e)
        }
      }
      
      // 方法3：检查全局数据或存储
      if (!pageParams.device_id && !pageParams.deviceId) {
        try {
          // 检查是否有临时存储的参数
          const tempParams = uni.getStorageSync('tempScanParams')
          if (tempParams) {
            pageParams = tempParams
            // 用完后清除
            uni.removeStorageSync('tempScanParams')
          }
        } catch (e) {
          console.warn('临时参数获取失败:', e)
        }
      }
      
      // 方法4：APP端特殊处理 - 检查全局变量或其他方式
      if (!pageParams.device_id && !pageParams.deviceId) {
        try {
          // APP端专用：尝试从uni.$router获取参数
          if (typeof uni !== 'undefined' && uni.$router && uni.$router.currentRoute) {
            console.log('从uni.$router获取参数:', uni.$router.currentRoute)
            const routeQuery = uni.$router.currentRoute.query || {}
            if (routeQuery.device_id) pageParams.device_id = routeQuery.device_id
            if (routeQuery.deviceId) pageParams.deviceId = routeQuery.deviceId
            if (routeQuery.device_name) pageParams.device_name = routeQuery.device_name
            if (routeQuery.token) pageParams.token = routeQuery.token
          }
          
          // 检查是否通过全局变量传递了参数
          if (typeof getApp === 'function') {
            const app = getApp()
            if (app && app.globalData && app.globalData.scanParams) {
              console.log('从全局数据获取参数:', app.globalData.scanParams)
              const globalParams = app.globalData.scanParams
              if (globalParams.device_id) pageParams.device_id = globalParams.device_id
              if (globalParams.device_name) pageParams.device_name = globalParams.device_name
              if (globalParams.token) pageParams.token = globalParams.token
              // 用完后清除
              delete app.globalData.scanParams
            }
          }
          
          // 检查uni的全局数据
          if (typeof uni !== 'undefined' && uni.$scanParams) {
            console.log('从uni全局数据获取参数:', uni.$scanParams)
            const uniParams = uni.$scanParams
            if (uniParams.device_id) pageParams.device_id = uniParams.device_id
            if (uniParams.device_name) pageParams.device_name = uniParams.device_name
            if (uniParams.token) pageParams.token = uniParams.token
            // 用完后清除
            delete uni.$scanParams
          }
          
          // APP端可能通过intent或其他方式传递参数
          if (typeof plus !== 'undefined' && plus.runtime && plus.runtime.arguments) {
            console.log('检查APP启动参数:', plus.runtime.arguments)
            // 将数组参数转换为字符串进行解析
            const argsString = plus.runtime.arguments.join(' ')
            if (argsString.includes('scan') || argsString.includes('device')) {
              console.log('发现包含扫描相关的启动参数:', argsString)
            }
          }
          
          // 最后的尝试：直接解析当前页面URL（APP端特有）
          if (!isH5.value && typeof plus !== 'undefined') {
            try {
              // 获取当前页面的完整路径
              const pages = getCurrentPages()
              if (pages.length > 0) {
                const currentPage = pages[pages.length - 1]
                let fullPath = ''
                
                // 尝试多种方式获取完整路径
                if (currentPage.$page && currentPage.$page.fullPath) {
                  fullPath = currentPage.$page.fullPath
                } else if (currentPage.route) {
                  fullPath = currentPage.route
                }
                
                console.log('尝试从完整路径解析参数:', fullPath)
                
                // 如果路径包含参数，直接解析
                if (fullPath && fullPath.includes('device_id=') && fullPath.includes('token=')) {
                  const urlParts = fullPath.split('?')
                  if (urlParts.length > 1) {
                    const params = parseUrlParams(urlParts[1])
                    console.log('从完整路径解析到的参数:', params)
                    if (params.device_id) pageParams.device_id = params.device_id
                    if (params.deviceId) pageParams.deviceId = params.deviceId
                    if (params.device_name) pageParams.device_name = params.device_name
                    if (params.token) pageParams.token = params.token
                  }
                }
              }
            } catch (e) {
              console.warn('APP端URL解析失败:', e)
            }
          }
        } catch (e) {
          console.warn('APP端特殊参数获取失败:', e)
        }
      }
      
      deviceIdParam = pageParams.device_id || pageParams.deviceId || ''
      deviceNameParam = pageParams.device_name || pageParams.deviceName || ''
      deviceModeParam = normalizeDeviceMode(pageParams.device_mode || pageParams.deviceMode)
      if (deviceNameParam) {
        try {
          deviceNameParam = decodeURIComponent(deviceNameParam)
        } catch (e) {
          // 解码失败时使用原值
        }
      }
      tokenParam = pageParams.token || ''
    }
  } catch (error) {
    console.warn('获取页面参数失败:', error)
  }
  
  const finalParams = {
    deviceId: deviceIdParam,
    deviceName: deviceNameParam,
    deviceMode: deviceModeParam,
    token: tokenParam
  }
  
  console.log('=== 页面参数获取完成 ===')
  console.log('最终获取的参数:', finalParams)
  console.log('参数有效性检查:', {
    'deviceId是否有值': !!deviceIdParam,
    'token是否有值': !!tokenParam,
    'deviceName是否有值': !!deviceNameParam
  })
  
  return finalParams
}

// 解析URL参数的工具函数（兼容小程序环境）
function parseUrlParams(paramString) {
  const params = {}
  if (!paramString) return params
  
  try {
    const pairs = paramString.split('&')
    for (const pair of pairs) {
      const [key, value] = pair.split('=')
      if (key) {
        const decodedKey = decodeURIComponent(key)
        const decodedValue = value ? decodeURIComponent(value) : ''
        params[decodedKey] = decodedValue
      }
    }
  } catch (e) {
    console.warn('URL参数解析失败:', e, '原始参数:', paramString)
  }
  
  return params
}

// APP端参数设置函数（供其他页面调用）
function setScanParams(deviceId, deviceName, token) {
  try {
    // 方法1：存储到本地存储
    uni.setStorageSync('tempScanParams', {
      device_id: deviceId,
      device_name: deviceName,
      token: token
    })
    
    // 方法2：设置到全局应用数据
    if (typeof getApp === 'function') {
      const app = getApp()
      if (app && !app.globalData) {
        app.globalData = {}
      }
      if (app && app.globalData) {
        app.globalData.scanParams = {
          device_id: deviceId,
          device_name: deviceName,
          token: token
        }
      }
    }
    
    // 方法3：设置到uni全局数据
    if (typeof uni !== 'undefined') {
      uni.$scanParams = {
        device_id: deviceId,
        device_name: deviceName,
        token: token
      }
    }
    
    console.log('APP端参数已设置:', { deviceId, deviceName, token })
    return true
  } catch (e) {
    console.error('APP端参数设置失败:', e)
    return false
  }
}

// 导出函数供其他页面使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { setScanParams }
} else if (typeof window !== 'undefined') {
  window.setScanParams = setScanParams
}

// 生成浮动元素样式
function getFloatItemStyle(index) {
  const positions = [
    { left: '10%', animationDelay: '0s', animationDuration: '12s' },
    { left: '20%', animationDelay: '1.5s', animationDuration: '14s' },
    { left: '35%', animationDelay: '3s', animationDuration: '16s' },
    { left: '50%', animationDelay: '4.5s', animationDuration: '18s' },
    { left: '65%', animationDelay: '6s', animationDuration: '13s' },
    { left: '80%', animationDelay: '7.5s', animationDuration: '15s' },
    { left: '25%', animationDelay: '9s', animationDuration: '17s' },
    { left: '75%', animationDelay: '10.5s', animationDuration: '19s' }
  ]
  return positions[index - 1] || positions[0]
}

// 生成能量球样式
function getOrbStyle(index) {
  const positions = [
    { top: '15%', left: '10%', animationDelay: '0s' },
    { top: '25%', right: '15%', animationDelay: '2s' },
    { bottom: '30%', left: '20%', animationDelay: '4s' },
    { bottom: '20%', right: '25%', animationDelay: '6s' }
  ]
  return positions[index - 1] || positions[0]
}

onMounted(async () => {
  // 首先初始化设备API模块
  console.log('开始初始化设备API模块...')
  const apiInitialized = initDeviceAPI()
  console.log('API初始化结果:', apiInitialized)
  
  // APP端调试信息
  if (typeof plus !== 'undefined') {
    console.log('APP端环境调试信息:', {
      'plus版本': plus.runtime.version,
      'plus可用方法': Object.keys(plus.runtime),
      '启动参数': plus.runtime.arguments,
      '应用信息': {
        appid: plus.runtime.appid,
        channel: plus.runtime.channel,
        launcher: plus.runtime.launcher
      }
    })
    
    // 检查当前页面信息
    try {
      if (typeof getCurrentPages === 'function') {
        const pages = getCurrentPages()
        if (pages.length > 0) {
          const currentPage = pages[pages.length - 1]
          console.log('APP端当前页面信息:', {
            route: currentPage.route,
            options: currentPage.options,
            '$page': currentPage.$page ? {
              fullPath: currentPage.$page.fullPath,
              options: currentPage.$page.options,
              query: currentPage.$page.query
            } : 'not available'
          })
        }
      }
    } catch (e) {
      console.warn('无法获取页面信息:', e)
    }
    
    // 检查是否有intent数据
    if (plus.android && plus.android.runtimeMainActivity) {
      try {
        const main = plus.android.runtimeMainActivity()
        const intent = main.getIntent()
        if (intent) {
          console.log('APP Intent信息:', {
            action: intent.getAction(),
            data: intent.getDataString(),
            extras: intent.getExtras() ? 'has extras' : 'no extras'
          })
          
          // 尝试获取extras数据
          const extras = intent.getExtras()
          if (extras) {
            console.log('Intent Extras可用')
            // 这里可以根据实际的intent key来获取参数
          }
        }
      } catch (e) {
        console.log('无法获取Intent信息:', e.message)
      }
    }
  }
  
  // 检测当前平台是否为H5 - 使用更精确的检测逻辑
  let platform
  let uniPlatform
  
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
  
  // 更精确的H5平台检测
  isH5.value = (
    uniPlatform === 'web' || 
    (platform === 'devtools' && typeof window !== 'undefined' && window.location) ||
    (typeof document !== 'undefined' && typeof window !== 'undefined' && !window.wx && !window.my)
  )
    
  // 获取页面参数
  const params = getPageParams()
  deviceId.value = params.deviceId
  deviceName.value = params.deviceName
  deviceMode.value = normalizeDeviceMode(params.deviceMode)
  token.value = params.token
  
  console.log('页面参数获取结果:', {
    deviceId: deviceId.value,
    deviceName: deviceName.value,
    token: token.value,
    platform: platform,
    uniPlatform: uniPlatform,
    isH5: isH5.value
  })
  
  if(deviceName.value) {
    connected.value = true
  } else if (deviceId.value && token.value) {
    await attemptConnection()// 自动尝试连接
  } else {
    // APP端如果没有获取到参数，提供扫码选项
    if (!isH5.value) {
      errorMessage.value = '未获取到设备参数，请扫描设备二维码'
      uni.showModal({
        title: '设备连接',
        content: '未获取到设备参数，是否扫描设备二维码进行连接？',
        showCancel: true,
        cancelText: '返回',
        confirmText: '扫码',
        success: function(res) {
          if (res.confirm) {
            startScan()
          } else {
            uni.navigateBack()
          }
        }
      })
    } else {
      errorMessage.value = '缺少设备ID或令牌参数'
    }
  }
})

async function attemptConnection() {
  loading.value = true
  connected.value = false
  errorMessage.value = ''
  
  try {
    // 确保API已初始化
    if (!deviceAPI || !deviceAPI.isValid) {
      const apiInitialized = initDeviceAPI()
      if (!apiInitialized) {
        throw new Error('无法初始化设备API模块')
      }
    }
    
    // 检查connectDevice函数是否存在
    if (!deviceAPI.connectDevice || typeof deviceAPI.connectDevice !== 'function') {
      throw new Error('connectDevice 函数不可用')
    }
    
    const Authorizetoken = uni.getStorageSync('token') || ''
    console.log('调用connectDevice:', { deviceId: deviceId.value, token: token.value })
    
    const result = await deviceAPI.connectDevice(deviceId.value, token.value, Authorizetoken)
    console.log('连接结果:', result)

    if (result && result.code === 0) {
      connected.value = true
      deviceName.value = result.data?.device_name || ''
      uni.setStorageSync('connection', Date.now())
      uni.setStorageSync('connected_device_mode', deviceMode.value)
      
      startDeviceCheckTimer()// 连接成功后启动定时器检查已连接设备
      uni.showToast({
        title: '设备连接成功',
        icon: 'success',
        duration: 2000
      })
      if (deviceMode.value === 'robot') {
        setTimeout(() => {
          uni.redirectTo({
            url: `/pages-nonTheme/robot-control?device_id=${encodeURIComponent(deviceId.value || '')}&device_name=${encodeURIComponent(deviceName.value || '')}&device_mode=robot`
          })
        }, 600)
      }
    } else {
      throw new Error(result?.message || '连接失败')
    }
  } catch (error) {
    console.error('设备连接失败:', error)
    
    // 安全地提取错误信息
    let errorMsg = '网络连接异常，请重试'
    if (error && typeof error === 'object') {
      if (error.msg) {
        errorMsg = error.msg
      } else if (error.data && error.data.msg) {
        errorMsg = error.data.msg
      } else if (error.message) {
        errorMsg = error.message
      }
    }
    
    errorMessage.value = errorMsg
    
    // 检查是否是token相关错误
    const errorText = errorMsg.toLowerCase()
    isTokenError.value = errorText.includes('token') || errorText.includes('令牌') || errorText.includes('过期')
    
    if (!uni.getStorageSync('token')) {
      uni.showToast({
        title: '请先登录',
        icon: 'none',
        duration: 2000
      })
        uni.navigateTo({
            url: '/pages-dark/index/index'
        })
    } else {
      uni.showToast({
        title: '连接失败',
        icon: 'none',
        duration: 2000
      })
    }
  } finally {
    loading.value = false
  }
}

// 启用测试模式（仅用于APP端调试）
function enableTestMode() {
  const testConfig = {
    deviceId: 'app_test_device_001',
    deviceName: 'APP测试设备',
    token: 'app_test_token_' + Date.now()
  }
  
  // 保存测试配置
  uni.setStorageSync('devTestMode', testConfig)
  
  // 设置当前参数
  deviceId.value = testConfig.deviceId
  deviceName.value = testConfig.deviceName  
  token.value = testConfig.token
  
  // 模拟连接成功
  connected.value = true
  
  uni.showToast({
    title: '测试模式已启用',
    icon: 'success',
    duration: 2000
  })
  
  console.log('测试模式已启用:', testConfig)
}

// 禁用测试模式
function disableTestMode() {
  uni.removeStorageSync('devTestMode')
  uni.showToast({
    title: '测试模式已关闭',
    icon: 'success'
  })
}

// 获取已连接的设备列表
async function fetchConnectedDevices() {
  try {
    // 确保API已初始化
    if (!deviceAPI || !deviceAPI.isValid) {
      const apiInitialized = initDeviceAPI()
      if (!apiInitialized) {
        console.warn('无法初始化设备API模块')
        return
      }
    }
    
    // 检查getConnectedDevices函数是否存在
    if (!deviceAPI.getConnectedDevices || typeof deviceAPI.getConnectedDevices !== 'function') {
      console.warn('getConnectedDevices 函数不可用')
      return
    }
    
    const result = await deviceAPI.getConnectedDevices()
    if (result && result.code === 0) {
      connectedDevices.value = result.data || []
      
      // 检查当前设备是否仍在连接列表中
      if (deviceId.value) {
        let currentDevice;
        for (const m in connectedDevices.value) {
          if(connectedDevices.value[m].device_id == deviceId.value || connectedDevices.value[m].id == deviceId.value) {
              currentDevice = connectedDevices.value[m]
          }
        }
        if (!currentDevice && connected.value) {
          // 当前设备已断开，更新状态
          connected.value = false
          errorMessage.value = '设备连接已断开'
          deviceId.value = ''
          deviceName.value = ''
          token.value = ''
          uni.removeStorageSync('connection')
          stopDeviceCheckTimer()
          uni.showToast({
            title: '设备连接已断开',
            icon: 'none',
            duration: 2000
          })
        }
      }
    } else {
      console.warn('获取已连接设备失败:', result?.msg || '未知错误')
    }
  } catch (error) {
    console.error('获取已连接设备失败:', error)
    // 不显示错误提示，避免频繁打扰用户
  }
}

// 启动定时器检查已连接设备
function startDeviceCheckTimer() {
  // 清除之前的定时器
  stopDeviceCheckTimer()
  // 立即获取一次
  fetchConnectedDevices()
  // 每5秒检查一次已连接设备
  deviceCheckTimer.value = setInterval(() => {
    fetchConnectedDevices()
  }, 5000)
}

// 停止定时器
function stopDeviceCheckTimer() {
  if (deviceCheckTimer.value) {
    clearInterval(deviceCheckTimer.value)
    deviceCheckTimer.value = null
  }
}

function retryConnection() {
  attemptConnection()
}

function goToMap() {
  uni.navigateTo({
    url: '/pages-dark/map/map'
  })
}

async function endConnection() {
  uni.showModal({
    title: '确认结束',
    content: '是否要结束与设备的连接？',
    success: async function(res) {
      if (res.confirm) {
        try {
          // 确保API已初始化
          if (!deviceAPI || !deviceAPI.isValid) {
            const apiInitialized = initDeviceAPI()
            if (!apiInitialized) {
              console.warn('无法初始化设备API模块')
            }
          }
          
          // 尝试调用断开连接API
          if (deviceAPI && deviceAPI.disconnectDevice && typeof deviceAPI.disconnectDevice === 'function') {
            const Authorizetoken = uni.getStorageSync('token') || ''
            const result = await deviceAPI.disconnectDevice(deviceId.value, Authorizetoken)
            console.log('断开连接结果:', result)
          }
        } catch (error) {
          console.error('断开连接失败:', error)
        }
        
        // 清除连接状态
        connected.value = false
        deviceId.value = ''
        deviceName.value = ''
        token.value = ''
        errorMessage.value = '设备连接已断开'
        uni.removeStorageSync('connection')
        stopDeviceCheckTimer()// 停止定时器
        
        uni.showToast({
          title: '已结束连接',
          icon: 'success',
          duration: 2000
        })
        
        // 返回上一页或首页
        setTimeout(() => {
          uni.redirectTo({url: '/pages-dark/home/home'})
        }, 2000)
      }
    }
  })
}

function handleDeviceScanContent(rawContent) {
  const target = resolveDeviceScanTarget(rawContent, '/pages-dark/scan/scan')
  if (!target.url || !target.deviceId) {
    uni.showToast({ title: '二维码不正确', icon: 'none' })
    return
  }

  if (target.isMock) {
    const connection = saveMockDeviceConnection({
      device_id: target.deviceId,
      device_name: target.deviceName,
      device_mode: target.deviceMode
    })
    deviceId.value = connection.device_id
    deviceName.value = connection.device_name
    deviceMode.value = normalizeDeviceMode(connection.device_mode)
    token.value = ''
    connected.value = true
    uni.showToast({ title: '模拟设备已连接', icon: 'success' })
    setTimeout(() => {
      uni.redirectTo({ url: target.url })
    }, 350)
    return
  }

  deviceId.value = target.deviceId
  deviceMode.value = normalizeDeviceMode(target.deviceMode)
  token.value = target.token
  if (deviceId.value && token.value) {
    attemptConnection()
    return
  }
  uni.showToast({ title: '设备ID和令牌不正确', icon: 'none' })
}

function startScan() {
  // 检查当前平台 - 使用与onMounted相同的逻辑
  let platform
  let uniPlatform
  let isH5 = false
  
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
  
  // 更精确的H5平台检测
  isH5 = (
    uniPlatform === 'web' || 
    (platform === 'devtools' && typeof window !== 'undefined' && window.location) ||
    (typeof document !== 'undefined' && typeof window !== 'undefined' && !window.wx && !window.my)
  )
  
  console.log('scanDeviceQR - Platform:', { platform, uniPlatform, isH5 })
  
  if (isH5) {
    // H5端使用输入框替代扫码
    uni.showModal({
      title: '连接设备',
      content: '请输入设备ID（H5端暂不支持扫码）',
      editable: true,
      placeholderText: '请输入设备ID',
      success: function(res) {
        if (res.confirm && res.content) {
          handleDeviceScanContent(res.content)
        }
      }
    })
  } else {
    // 小程序/APP端使用扫码功能
    uni.scanCode({
      scanType: ['qrCode'],
      success: function(res) {
        handleDeviceScanContent(res.result)
      },
      fail: function(err) {
        console.log('扫码失败:', err)
        uni.showToast({
          title: '扫码失败，请重试',
          icon: 'none'
        })
      }
    })
  }
}

// 组件卸载时清理定时器
onUnmounted(() => {
  stopDeviceCheckTimer()
})

function goBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      uni.navigateBack()
    } else {
      uni.reLaunch({
        url: '/pages-dark/home/home'
      })
    }
}
</script>

<style scoped>
/* 主容器 */
.scan-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #0d224e 0%, #1a0b3d 25%, #220f58 50%, #0a1a3a 75%, #044868 100%);
  position: relative;
  overflow: hidden;
  padding: 0;
}

/* 背景特效 */
.bg-effects {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  pointer-events: none;
}

.bg-grid {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: 
    linear-gradient(rgba(64, 224, 255, 0.15) 1px, transparent 1px),
    linear-gradient(90deg, rgba(64, 224, 255, 0.15) 1px, transparent 1px),
    radial-gradient(circle at 20% 20%, rgba(64, 224, 255, 0.1) 2px, transparent 2px),
    radial-gradient(circle at 80% 80%, rgba(16, 185, 129, 0.1) 2px, transparent 2px);
  background-size: 60px 60px, 60px 60px, 100px 100px, 120px 120px;
  animation: gridFloat 25s linear infinite;
}

@keyframes gridFloat {
  0% { transform: translate(0, 0) rotate(0deg); }
  100% { transform: translate(60px, 60px) rotate(360deg); }
}

.floating-elements {
  position: absolute;
  width: 100%;
  height: 100%;
}

.float-item {
  position: absolute;
  width: 12rpx;
  height: 12rpx;
  background: radial-gradient(circle, rgba(64, 224, 255, 0.9) 0%, rgba(16, 185, 129, 0.6) 50%, transparent 100%);
  border-radius: 50%;
  animation: floatUp 15s ease-in-out infinite;
  box-shadow: 
    0 0 20rpx rgba(64, 224, 255, 0.5),
    0 0 40rpx rgba(16, 185, 129, 0.3);
}

.float-item:nth-child(1) { left: 15%; animation-delay: 0s; }
.float-item:nth-child(2) { left: 35%; animation-delay: 2.5s; }
.float-item:nth-child(3) { left: 55%; animation-delay: 5s; }
.float-item:nth-child(4) { left: 75%; animation-delay: 7.5s; }
.float-item:nth-child(5) { left: 25%; animation-delay: 10s; }
.float-item:nth-child(6) { left: 65%; animation-delay: 12.5s; }
.float-item:nth-child(7) { left: 45%; animation-delay: 15s; }
.float-item:nth-child(8) { left: 85%; animation-delay: 17.5s; }

@keyframes floatUp {
  0% { transform: translateY(100vh) scale(0) rotate(0deg); opacity: 0; }
  10% { opacity: 1; }
  50% { transform: translateY(50vh) scale(1) rotate(180deg); opacity: 1; }
  90% { opacity: 1; }
  100% { transform: translateY(-10vh) scale(0) rotate(360deg); opacity: 0; }
}

.scan-lines {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: 
    linear-gradient(90deg, transparent 49%, rgba(52, 211, 153, 0.4) 50%, transparent 51%),
    linear-gradient(0deg, transparent 49%, rgba(64, 224, 255, 0.3) 50%, transparent 51%),
    radial-gradient(circle at 30% 40%, rgba(139, 92, 246, 0.2) 1px, transparent 1px);
  background-size: 200px 200px, 200px 200px, 80px 80px;
  animation: scanMove 10s linear infinite;
}

@keyframes scanMove {
  0% { transform: translate(0, 0) rotate(0deg); }
  100% { transform: translate(200px, 200px) rotate(180deg); }
}

/* 能量球效果 */
.energy-orbs {
  position: absolute;
  width: 100%;
  height: 100%;
}

.energy-orb {
  position: absolute;
  width: 80rpx;
  height: 80rpx;
  background: radial-gradient(circle, rgba(64, 224, 255, 0.3) 0%, rgba(16, 185, 129, 0.2) 50%, transparent 100%);
  border-radius: 50%;
  animation: orbFloat 8s ease-in-out infinite;
  filter: blur(2rpx);
}

@keyframes orbFloat {
  0%, 100% { 
    transform: translateY(0px) scale(1); 
    opacity: 0.3; 
  }
  50% { 
    transform: translateY(-40rpx) scale(1.2); 
    opacity: 0.7; 
  }
}

/* 科技波纹效果 */
.tech-waves {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 200rpx;
}

.wave {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 60rpx;
  background: linear-gradient(90deg, transparent, rgba(64, 224, 255, 0.1), transparent);
  animation: waveMove 6s ease-in-out infinite;
}

.wave:nth-child(1) { animation-delay: 0s; }
.wave:nth-child(2) { animation-delay: 2s; }
.wave:nth-child(3) { animation-delay: 4s; }

@keyframes waveMove {
  0% { transform: translateX(-100%) scaleX(1); opacity: 0; }
  50% { transform: translateX(0%) scaleX(1.5); opacity: 0.6; }
  100% { transform: translateX(100%) scaleX(1); opacity: 0; }
}

/* 返回按钮 */
.back-btn {
  position: absolute;
  top: 60rpx;
  left: 40rpx;
  width: 90rpx;
  height: 90rpx;
  background: rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(20px);
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  cursor: pointer;
  box-shadow: 
    0 8rpx 32rpx rgba(0, 0, 0, 0.1),
    0 0 20rpx rgba(64, 224, 255, 0.3);
}

.back-btn:active {
  transform: scale(0.85);
  background: rgba(255, 255, 255, 0.4);
  box-shadow: 
    0 4rpx 16rpx rgba(0, 0, 0, 0.2),
    0 0 30rpx rgba(64, 224, 255, 0.6);
}

.back-btn:hover {
  transform: translateY(-4rpx);
  box-shadow: 
    0 12rpx 48rpx rgba(0, 0, 0, 0.15),
    0 0 40rpx rgba(64, 224, 255, 0.5);
}

.back-icon {
  color: #ffffff;
  font-size: 36rpx;
  font-weight: bold;
  filter: drop-shadow(0 0 10rpx rgba(64, 224, 255, 0.8));
}

/* 内容包装器 */
.content-wrapper {
  position: relative;
  z-index: 10;
  min-height: 100vh;
  padding: 120rpx 40rpx 40rpx;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 20rpx;
}

/* 标题区域 */
.title-section {
  text-align: center;
  margin-bottom: 40rpx;
  position: relative;
}

.title-decoration {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16rpx;
}

.title-particles {
  position: absolute;
  width: 200rpx;
  height: 200rpx;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.particle {
  position: absolute;
  width: 6rpx;
  height: 6rpx;
  background: radial-gradient(circle, rgba(64, 224, 255, 0.8) 0%, transparent 70%);
  border-radius: 50%;
  animation: particleOrbit 8s linear infinite;
}

.particle:nth-child(1) { animation-delay: 0s; }
.particle:nth-child(2) { animation-delay: 1.3s; }
.particle:nth-child(3) { animation-delay: 2.6s; }
.particle:nth-child(4) { animation-delay: 3.9s; }
.particle:nth-child(5) { animation-delay: 5.2s; }
.particle:nth-child(6) { animation-delay: 6.5s; }

@keyframes particleOrbit {
  0% { 
    transform: rotate(0deg) translateX(80rpx) rotate(0deg); 
    opacity: 0.3; 
  }
  50% { 
    opacity: 1; 
  }
  100% { 
    transform: rotate(360deg) translateX(80rpx) rotate(-360deg); 
    opacity: 0.3; 
  }
}

.title-icon {
  font-size: 64rpx;
  filter: drop-shadow(0 0 30rpx rgba(64, 224, 255, 0.8));
  animation: titleIconPulse 3s ease-in-out infinite;
  z-index: 2;
}

@keyframes titleIconPulse {
  0%, 100% { 
    transform: scale(1) rotate(0deg); 
    filter: drop-shadow(0 0 30rpx rgba(64, 224, 255, 0.8)); 
  }
  50% { 
    transform: scale(1.1) rotate(5deg); 
    filter: drop-shadow(0 0 40rpx rgba(16, 185, 129, 0.9)); 
  }
}

.main-title {
  display: block;
  font-size: 46rpx;
  font-weight: 800;
  background: linear-gradient(135deg, #40e0ff 0%, #4ecdc4 50%, #10b981 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
  margin-bottom: 20rpx;
  text-shadow: 0 0 30rpx rgba(64, 224, 255, 0.5);
  letter-spacing: 3rpx;
  animation: titleShimmer 4s ease-in-out infinite;
}

@keyframes titleShimmer {
  0%, 100% { 
    filter: brightness(1) saturate(1);
    transform: scale(1);
  }
  50% { 
    filter: brightness(1.3) saturate(1.5);
    transform: scale(1.02);
  }
}

.sub-title {
  display: block;
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.8);
  letter-spacing: 4rpx;
  font-weight: 300;
  text-transform: uppercase;
  margin-bottom: 20rpx;
  animation: subtitleFade 3s ease-in-out infinite alternate;
}

@keyframes subtitleFade {
  0% { opacity: 0.6; }
  100% { opacity: 0.9; }
}

.title-underline {
  display: flex;
  justify-content: center;
  gap: 8rpx;
}

.underline-segment {
  width: 60rpx;
  height: 4rpx;
  background: linear-gradient(45deg, #40e0ff, #4ecdc4);
  border-radius: 2rpx;
  animation: underlineGlow 2s ease-in-out infinite;
}

.underline-segment:nth-child(1) { animation-delay: 0s; }
.underline-segment:nth-child(2) { animation-delay: 0.3s; }
.underline-segment:nth-child(3) { animation-delay: 0.6s; }

@keyframes underlineGlow {
  0%, 100% { 
    transform: scaleX(1); 
    opacity: 0.6; 
    box-shadow: 0 0 10rpx rgba(64, 224, 255, 0.3);
  }
  50% { 
    transform: scaleX(1.2); 
    opacity: 1; 
    box-shadow: 0 0 20rpx rgba(64, 224, 255, 0.8);
  }
}

/* 状态卡片 */
.status-card {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(25px);
  border-radius: 35rpx;
  padding: 50rpx 40rpx;
  box-shadow: 
    0 25rpx 80rpx rgba(0, 0, 0, 0.15),
    0 0 60rpx rgba(64, 224, 255, 0.1),
    inset 0 2rpx 0 rgba(255, 255, 255, 0.8);
  border: 2px solid rgba(255, 255, 255, 0.3);
  position: relative;
  overflow: hidden;
  margin-bottom: 10rpx;
}

.status-card::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: conic-gradient(
    from 0deg,
    transparent 0deg,
    rgba(64, 224, 255, 0.1) 60deg,
    transparent 120deg,
    rgba(16, 185, 129, 0.1) 180deg,
    transparent 240deg,
    rgba(139, 92, 246, 0.1) 300deg,
    transparent 360deg
  );
  animation: cardRotate 20s linear infinite;
  z-index: -1;
}

@keyframes cardRotate {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.status-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24rpx;
}

/* 状态图标包装器 */
.status-icon-wrapper {
  position: relative;
  width: 100rpx;
  height: 100rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  margin-bottom: 16rpx;
}

.status-icon {
  font-size: 50rpx;
  z-index: 2;
}

/* 加载状态 */
.loading-section .status-icon-wrapper {
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
}

.loading-ring {
  position: absolute;
  width: 120rpx;
  height: 120rpx;
  border: 4rpx solid rgba(59, 130, 246, 0.2);
  border-top: 4rpx solid #3b82f6;
  border-radius: 50%;
  animation: spin 2s linear infinite;
  z-index: 1;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 成功状态 */
.success-section .status-icon-wrapper {
  background: linear-gradient(135deg, #10b981, #059669);
}

.success-ring {
  position: absolute;
  width: 120rpx;
  height: 120rpx;
  border: 4rpx solid rgba(16, 185, 129, 0.3);
  border-radius: 50%;
  animation: successPulse 2s ease-in-out infinite;
  z-index: 1;
}

@keyframes successPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.1); opacity: 0.7; }
}

/* 错误状态 */
.error-section .status-icon-wrapper {
  background: linear-gradient(135deg, #f59e0b, #d97706);
}

.error-pulse {
  position: absolute;
  width: 120rpx;
  height: 120rpx;
  border: 4rpx solid rgba(245, 158, 11, 0.4);
  border-radius: 50%;
  animation: errorPulse 2s ease-in-out infinite;
  z-index: 1;
}

@keyframes errorPulse {
  0% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.15); opacity: 0.3; }
  100% { transform: scale(1); opacity: 0.6; }
}

/* 状态标题和描述 */
.status-title {
  font-size: 36rpx;
  font-weight: 700;
  color: #1f2937;
  text-align: center;
  line-height: 1.2;
}

.status-desc {
  font-size: 26rpx;
  color: #6b7280;
  text-align: center;
  line-height: 1.4;
  max-width: 550rpx;
}

/* 设备信息卡片 */
.device-info-card {
  background: #f8fafc;
  border-radius: 12rpx;
  padding: 16rpx 20rpx;
  width: 80%;
  max-width: 400rpx;
  margin: 0 auto;
  border-left: 3rpx solid #3b82f6;
  transition: all 0.3s ease;
}

.device-info-card.success {
  background: #f0fdf4;
  border-left-color: #10b981;
}

.device-info-card.error {
  background: #fefbf3;
  border-left-color: #f59e0b;
}

.device-label {
  display: block;
  font-size: 22rpx;
  color: #6b7280;
  margin-bottom: 6rpx;
  font-weight: 500;
}

.device-value {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: #1f2937;
  font-family: 'Courier New', monospace;
  word-break: break-all;
}

/* 进度条 */
.progress-bar {
  width: 100%;
  height: 8rpx;
  background: #e5e7eb;
  border-radius: 4rpx;
  overflow: hidden;
  margin-top: 20rpx;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #1d4ed8);
  border-radius: 4rpx;
  animation: progressMove 2s ease-in-out infinite;
}

@keyframes progressMove {
  0% { width: 0%; }
  50% { width: 70%; }
  100% { width: 100%; }
}

/* 操作按钮组 */
.action-group {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  width: 100%;
  margin-top: 20rpx;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  padding: 20rpx 40rpx;
  border-radius: 20rpx;
  border: none;
  font-size: 32rpx;
  font-weight: 600;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.action-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  transition: left 0.5s;
}

.action-btn:active::before {
  left: 100%;
}

.btn-icon {
  font-size: 36rpx;
}

.btn-text {
  color: inherit;
}

.action-btn.primary {
  background: linear-gradient(135deg, #10b981, #059669);
  color: #ffffff;
  box-shadow: 0 10rpx 30rpx rgba(16, 185, 129, 0.3);
}

.action-btn.primary:active {
  transform: translateY(2rpx);
  box-shadow: 0 5rpx 15rpx rgba(16, 185, 129, 0.4);
}

.action-btn.danger {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: #ffffff;
  box-shadow: 0 10rpx 30rpx rgba(239, 68, 68, 0.3);
}

.action-btn.danger:active {
  transform: translateY(2rpx);
  box-shadow: 0 5rpx 15rpx rgba(239, 68, 68, 0.4);
}

.action-btn.warning {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #ffffff;
  box-shadow: 0 10rpx 30rpx rgba(245, 158, 11, 0.3);
}

.action-btn.warning:active {
  transform: translateY(2rpx);
  box-shadow: 0 5rpx 15rpx rgba(245, 158, 11, 0.4);
}

.action-btn.secondary {
  background: linear-gradient(135deg, #8b5cf6, #7c3aed);
  color: #ffffff;
  box-shadow: 0 10rpx 30rpx rgba(139, 92, 246, 0.3);
}

.action-btn.secondary:active {
  transform: translateY(2rpx);
  box-shadow: 0 5rpx 15rpx rgba(139, 92, 246, 0.4);
}

/* 环保提示 */
.eco-tip {
  display: flex;
  align-items: center;
  gap: 20rpx;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(15px);
  border-radius: 25rpx;
  padding: 28rpx 32rpx;
  border: 2px solid rgba(16, 185, 129, 0.3);
  box-shadow: 
    0 15rpx 40rpx rgba(0, 0, 0, 0.1),
    0 0 30rpx rgba(16, 185, 129, 0.2);
  position: relative;
  overflow: hidden;
}

.eco-tip::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, 
    transparent, 
    rgba(16, 185, 129, 0.1), 
    transparent);
  animation: tipShine 4s ease-in-out infinite;
}

@keyframes tipShine {
  0%, 100% { left: -100%; }
  50% { left: 100%; }
}

.tip-icon {
  font-size: 36rpx;
  flex-shrink: 0;
  animation: tipGlow 4s ease-in-out infinite;
  filter: drop-shadow(0 0 15rpx rgba(16, 185, 129, 0.6));
  z-index: 2;
}

@keyframes tipGlow {
  0%, 100% { 
    transform: scale(1) rotate(0deg); 
    filter: drop-shadow(0 0 15rpx rgba(16, 185, 129, 0.6));
  }
  50% { 
    transform: scale(1.15) rotate(5deg); 
    filter: drop-shadow(0 0 25rpx rgba(16, 185, 129, 0.9));
  }
}

.tip-text {
  font-size: 26rpx;
  color: #374151;
  line-height: 1.6;
  font-weight: 500;
  z-index: 2;
  background: linear-gradient(135deg, #374151 0%, #10b981 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
</style>

<style scoped>
page {
  min-height: 100%;
  background: #f6faf8;
}

.scan-container {
  --scan-primary: #10b981;
  --scan-primary-deep: #047857;
  --scan-primary-soft: #ecfdf5;
  --scan-text: #17201d;
  --scan-muted: #64716d;
  --scan-border: rgba(5, 150, 105, 0.16);
  --scan-surface: #ffffff;
  --scan-surface-soft: #f0fdf4;
  --scan-danger: #ef4444;
  --scan-danger-soft: #fff1f2;
  position: relative;
  isolation: isolate;
  box-sizing: border-box;
  width: 100%;
  min-height: 100vh;
  padding: 0 24px 48px;
  overflow: hidden;
  color: var(--scan-text);
  background:
    linear-gradient(180deg, transparent 0, transparent 286px, #f5f7fa 286px),
    linear-gradient(135deg, #10b981 0%, #059669 54%, #047857 100%);
}

.scan-container::before {
  content: "";
  position: absolute;
  z-index: -1;
  top: 0;
  left: 0;
  width: 100%;
  height: 286px;
  opacity: 0.18;
  background-image: radial-gradient(rgba(255, 255, 255, 0.85) 1px, transparent 1px);
  background-size: 24px 24px;
  pointer-events: none;
}

.scan-container::after {
  content: "";
  position: absolute;
  z-index: -1;
  top: 230px;
  left: -5%;
  width: 110%;
  height: 82px;
  border-radius: 50% 50% 0 0 / 35% 35% 0 0;
  background: #f5f7fa;
  pointer-events: none;
}

.scan-container.scan-dark {
  --scan-primary: #40e0ff;
  --scan-primary-deep: #4ecdc4;
  --scan-primary-soft: rgba(64, 224, 255, 0.1);
  --scan-text: #f4fbff;
  --scan-muted: rgba(230, 244, 251, 0.68);
  --scan-border: rgba(64, 224, 255, 0.28);
  --scan-surface: rgba(16, 26, 50, 0.9);
  --scan-surface-soft: rgba(64, 224, 255, 0.07);
  --scan-danger: #ff7b86;
  --scan-danger-soft: rgba(255, 76, 91, 0.12);
  background: linear-gradient(135deg, #0a0e27 0%, #141a35 38%, #231750 72%, #0f0f23 100%);
}

.scan-container.scan-dark::before {
  position: fixed;
  height: 100%;
  opacity: 1;
  background-image:
    linear-gradient(rgba(64, 224, 255, 0.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(64, 224, 255, 0.07) 1px, transparent 1px);
  background-size: 46px 46px;
  animation: scanGridMove 18s linear infinite;
}

.scan-container.scan-dark::after {
  display: none;
}

.scan-container,
.scan-container * {
  box-sizing: border-box;
}

.scan-topbar {
  position: relative;
  z-index: 4;
  width: 100%;
  max-width: 1080px;
  min-height: 76px;
  margin: 0 auto;
  padding: max(16px, env(safe-area-inset-top)) 0 10px;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.scan-topbar .back-btn {
  position: static;
  width: 42px;
  height: 42px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 12px;
  color: #ffffff;
  background: rgba(255, 255, 255, 0.15);
  box-shadow: 0 8px 20px rgba(4, 120, 87, 0.18);
  backdrop-filter: blur(12px);
  transition: transform 0.2s ease, background 0.2s ease;
}

.scan-topbar .back-btn:active {
  transform: scale(0.94);
  background: rgba(255, 255, 255, 0.24);
}

.back-icon {
  display: block;
  margin-top: -2px;
  font-size: 32px;
  line-height: 1;
  font-weight: 300;
}

.topbar-brand {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-image {
  flex: 0 0 auto;
  width: 38px;
  height: 38px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.14);
}

.brand-copy,
.device-info-row {
  min-width: 0;
}

.brand-title,
.brand-subtitle,
.overview-title,
.overview-desc,
.status-title,
.status-desc,
.device-label,
.device-value,
.timeout-note text,
.tip-text {
  display: block;
}

.brand-title {
  color: #ffffff;
  font-size: 17px;
  line-height: 1.25;
  font-weight: 700;
}

.brand-subtitle {
  margin-top: 2px;
  color: rgba(255, 255, 255, 0.72);
  font-size: 11px;
  line-height: 1.25;
}

.topbar-state {
  min-width: 74px;
  min-height: 34px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 17px;
  color: #ffffff;
  background: rgba(255, 255, 255, 0.13);
  font-size: 12px;
  backdrop-filter: blur(10px);
}

.state-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #d1fae5;
  box-shadow: 0 0 0 4px rgba(209, 250, 229, 0.12);
}

.topbar-state.pending .state-dot {
  background: #fbbf24;
}

.topbar-state.offline .state-dot {
  background: #fecaca;
}

.scan-dark .scan-topbar .back-btn,
.scan-dark .topbar-state {
  border-color: rgba(64, 224, 255, 0.26);
  background: rgba(10, 20, 42, 0.6);
  box-shadow: 0 0 18px rgba(64, 224, 255, 0.1);
}

.scan-dark .brand-title {
  color: #ffffff;
}

.scan-dark .brand-subtitle,
.scan-dark .topbar-state {
  color: rgba(222, 249, 255, 0.75);
}

.scan-dark .state-dot {
  background: #40e0ff;
  box-shadow: 0 0 12px rgba(64, 224, 255, 0.85);
}

.content-wrapper {
  position: relative;
  z-index: 2;
  width: 100%;
  max-width: 1080px;
  margin: 22px auto 0;
  padding: 0;
  display: grid;
  grid-template-columns: minmax(280px, 0.82fr) minmax(440px, 1.18fr);
  gap: 28px;
  align-items: center;
}

.connection-overview {
  width: 100%;
  max-width: 390px;
  min-height: 410px;
  margin: 0 auto;
  padding: 34px 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.18);
  box-shadow: 0 18px 48px rgba(4, 120, 87, 0.18);
  backdrop-filter: blur(18px);
}

.scan-dark .connection-overview {
  border: 1px solid rgba(64, 224, 255, 0.28);
  background: rgba(10, 19, 42, 0.66);
  box-shadow:
    0 0 0 1px rgba(78, 205, 196, 0.06) inset,
    0 18px 50px rgba(0, 0, 0, 0.28),
    0 0 28px rgba(64, 224, 255, 0.08);
}

.device-visual {
  position: relative;
  width: 136px;
  height: 136px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.visual-ring {
  position: absolute;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.5);
}

.ring-one {
  inset: 0;
  background: rgba(255, 255, 255, 0.14);
  animation: scanBreathe 3s ease-in-out infinite;
}

.ring-two {
  inset: 10px;
  border-style: dashed;
  animation: scanSpin 14s linear infinite;
}

.scan-dark .visual-ring {
  border-color: rgba(64, 224, 255, 0.42);
}

.scan-dark .ring-one {
  background: rgba(64, 224, 255, 0.06);
  box-shadow: 0 0 32px rgba(64, 224, 255, 0.12);
}

.device-visual-image {
  position: relative;
  z-index: 2;
  width: 94px;
  height: 94px;
  object-fit: contain;
  filter: drop-shadow(0 10px 13px rgba(3, 105, 75, 0.16));
}

.scan-dark .device-visual-image {
  filter: drop-shadow(0 0 12px rgba(64, 224, 255, 0.22));
}

.visual-status-mark {
  position: absolute;
  z-index: 3;
  right: 5px;
  bottom: 8px;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3px solid #ffffff;
  border-radius: 50%;
  color: #ffffff;
  background: #10b981;
  font-size: 17px;
  font-weight: 800;
  box-shadow: 0 6px 14px rgba(4, 120, 87, 0.26);
}

.scan-dark .visual-status-mark {
  border-color: #13203d;
  color: #07131d;
  background: #40e0ff;
  box-shadow: 0 0 18px rgba(64, 224, 255, 0.45);
}

.overview-title {
  margin-top: 24px;
  color: #ffffff;
  font-size: 24px;
  line-height: 1.35;
  font-weight: 750;
  text-align: center;
  text-shadow: 0 2px 8px rgba(4, 120, 87, 0.18);
}

.overview-desc {
  max-width: 320px;
  margin-top: 9px;
  color: rgba(255, 255, 255, 0.78);
  font-size: 13px;
  line-height: 1.6;
  text-align: center;
}

.scan-dark .overview-title {
  color: #eafdff;
  text-shadow: 0 0 18px rgba(64, 224, 255, 0.28);
}

.scan-dark .overview-desc {
  color: rgba(225, 246, 255, 0.68);
}

.connection-steps {
  width: 100%;
  margin-top: 28px;
  display: flex;
  align-items: flex-start;
}

.step-item {
  width: 42px;
  flex: 0 0 42px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  color: rgba(255, 255, 255, 0.52);
  font-size: 10px;
}

.step-dot {
  width: 10px;
  height: 10px;
  border: 2px solid rgba(255, 255, 255, 0.48);
  border-radius: 50%;
  background: transparent;
}

.step-item.active {
  color: #ffffff;
}

.step-item.active .step-dot {
  border-color: #ffffff;
  background: #ffffff;
  box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.12);
}

.step-line {
  height: 2px;
  flex: 1;
  margin-top: 4px;
  background: rgba(255, 255, 255, 0.22);
}

.step-line.active {
  background: rgba(255, 255, 255, 0.85);
}

.scan-dark .step-item {
  color: rgba(195, 235, 244, 0.45);
}

.scan-dark .step-dot {
  border-color: rgba(64, 224, 255, 0.35);
}

.scan-dark .step-item.active {
  color: #40e0ff;
}

.scan-dark .step-item.active .step-dot {
  border-color: #40e0ff;
  background: #40e0ff;
  box-shadow: 0 0 12px rgba(64, 224, 255, 0.72);
}

.scan-dark .step-line {
  background: rgba(64, 224, 255, 0.16);
}

.scan-dark .step-line.active {
  background: linear-gradient(90deg, #40e0ff, #4ecdc4);
  box-shadow: 0 0 8px rgba(64, 224, 255, 0.35);
}

.status-card {
  width: 100%;
  max-width: none;
  min-height: 410px;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid rgba(5, 150, 105, 0.12);
  border-radius: 20px;
  background: var(--scan-surface);
  box-shadow: 0 22px 56px rgba(15, 78, 60, 0.15);
  transform: none;
  backdrop-filter: none;
}

.scan-dark .status-card {
  border: 1px solid rgba(64, 224, 255, 0.38);
  background: rgba(14, 24, 48, 0.91);
  box-shadow:
    0 0 0 1px rgba(78, 205, 196, 0.08) inset,
    0 22px 60px rgba(0, 0, 0, 0.36),
    0 0 34px rgba(64, 224, 255, 0.1);
  backdrop-filter: blur(20px);
}

.status-section {
  width: 100%;
  min-height: 410px;
  padding: 42px 44px 34px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  text-align: left;
}

.section-kicker {
  display: inline-flex;
  align-self: flex-start;
  min-height: 26px;
  padding: 0 11px;
  align-items: center;
  border-radius: 13px;
  color: #047857;
  background: #d1fae5;
  font-size: 11px;
  font-weight: 700;
}

.section-kicker.error {
  color: #b91c1c;
  background: #fee2e2;
}

.scan-dark .section-kicker {
  border: 1px solid rgba(64, 224, 255, 0.34);
  color: #65eaff;
  background: rgba(64, 224, 255, 0.09);
  box-shadow: 0 0 14px rgba(64, 224, 255, 0.09);
}

.scan-dark .section-kicker.error {
  border-color: rgba(255, 123, 134, 0.34);
  color: #ff98a1;
  background: rgba(255, 76, 91, 0.1);
}

.status-title {
  margin-top: 18px;
  color: var(--scan-text);
  font-size: 29px;
  line-height: 1.3;
  font-weight: 800;
  text-align: left;
  text-shadow: none;
}

.scan-dark .status-title {
  background: linear-gradient(90deg, #ffffff 0%, #bdf6ff 54%, #4ecdc4 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.status-desc {
  margin-top: 9px;
  color: var(--scan-muted);
  font-size: 14px;
  line-height: 1.6;
  text-align: left;
}

.device-info-card,
.device-info-card.success,
.device-info-card.error {
  width: 100%;
  max-width: none;
  margin: 28px 0 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--scan-border);
  border-left: 4px solid var(--scan-primary);
  border-radius: 12px;
  background: var(--scan-surface-soft);
  box-shadow: none;
  transform: none;
}

.device-info-card.error {
  border-left-color: var(--scan-danger);
  background: var(--scan-danger-soft);
}

.scan-dark .device-info-card,
.scan-dark .device-info-card.success,
.scan-dark .device-info-card.error {
  border-color: rgba(64, 224, 255, 0.22);
  border-left-color: #40e0ff;
  background: rgba(64, 224, 255, 0.065);
}

.scan-dark .device-info-card.error {
  border-left-color: #ff7b86;
  background: rgba(255, 76, 91, 0.08);
}

.device-info-row {
  min-height: 62px;
  padding: 12px 16px;
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  align-items: center;
  gap: 14px;
  border-bottom: 1px solid var(--scan-border);
}

.device-info-row:last-child {
  border-bottom: 0;
}

.device-label,
.device-value {
  margin: 0;
  text-align: left;
}

.device-label {
  color: var(--scan-muted);
  font-size: 12px;
  line-height: 1.4;
  font-weight: 600;
}

.device-value {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--scan-text);
  font-size: 14px;
  line-height: 1.45;
  font-weight: 700;
}

.mono {
  font-family: "SFMono-Regular", Consolas, monospace;
  font-variant-numeric: tabular-nums;
}

.action-group {
  width: 100%;
  max-width: none;
  margin-top: 28px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.action-btn,
button.action-btn {
  width: 100%;
  min-width: 0;
  height: 48px;
  margin: 0;
  padding: 0 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1;
  font-weight: 700;
  letter-spacing: 0;
  box-shadow: none;
  transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
}

.action-btn::after {
  display: none;
}

.action-btn:active {
  transform: scale(0.98);
  filter: brightness(0.97);
}

.action-btn.primary {
  color: #ffffff;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  box-shadow: 0 9px 22px rgba(5, 150, 105, 0.25);
}

.action-btn.danger {
  border: 1px solid rgba(239, 68, 68, 0.32);
  color: #dc2626;
  background: #fff5f5;
  box-shadow: 0 8px 20px rgba(239, 68, 68, 0.1);
}

.action-btn.warning,
.action-btn.secondary {
  border: 1px solid var(--scan-border);
  color: var(--scan-primary-deep);
  background: var(--scan-primary-soft);
}

.scan-dark .action-btn.primary {
  color: #07131d;
  background: linear-gradient(135deg, #40e0ff 0%, #4ecdc4 100%);
  box-shadow: 0 0 22px rgba(64, 224, 255, 0.26);
}

.scan-dark .action-btn.danger {
  border-color: rgba(255, 123, 134, 0.42);
  color: #ff98a1;
  background: rgba(255, 76, 91, 0.11);
  box-shadow: 0 0 18px rgba(255, 76, 91, 0.11);
}

.scan-dark .action-btn.warning,
.scan-dark .action-btn.secondary {
  border-color: rgba(64, 224, 255, 0.34);
  color: #65eaff;
  background: rgba(64, 224, 255, 0.09);
}

.btn-text {
  color: inherit;
  font: inherit;
}

.timeout-note {
  margin-top: auto;
  padding-top: 22px;
  color: #8a9692;
  font-size: 11px;
  line-height: 1.45;
  text-align: center;
}

.scan-dark .timeout-note {
  color: rgba(207, 233, 239, 0.48);
}

.progress-bar {
  width: 100%;
  height: 6px;
  margin-top: 30px;
  overflow: hidden;
  border-radius: 3px;
  background: rgba(16, 185, 129, 0.12);
}

.progress-fill {
  width: 42%;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #10b981, #6ee7b7);
  animation: scanProgress 1.5s ease-in-out infinite alternate;
}

.scan-dark .progress-bar {
  background: rgba(64, 224, 255, 0.1);
}

.scan-dark .progress-fill {
  background: linear-gradient(90deg, #40e0ff, #4ecdc4);
  box-shadow: 0 0 10px rgba(64, 224, 255, 0.45);
}

.eco-tip {
  grid-column: 1 / -1;
  width: 100%;
  min-height: 48px;
  margin: 0;
  padding: 10px 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 1px solid rgba(5, 150, 105, 0.16);
  border-radius: 12px;
  color: #047857;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 8px 24px rgba(15, 78, 60, 0.08);
}

.eco-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 0 5px rgba(16, 185, 129, 0.1);
}

.tip-text {
  color: inherit;
  font-size: 12px;
  line-height: 1.5;
  font-weight: 600;
  text-align: center;
}

.scan-dark .eco-tip {
  border-color: rgba(64, 224, 255, 0.22);
  color: rgba(213, 246, 252, 0.7);
  background: rgba(10, 19, 42, 0.66);
  box-shadow: 0 0 24px rgba(64, 224, 255, 0.07);
}

.scan-dark .eco-dot {
  background: #40e0ff;
  box-shadow: 0 0 12px rgba(64, 224, 255, 0.65);
}

@keyframes scanGridMove {
  to { background-position: 46px 46px, 46px 46px; }
}

@keyframes scanBreathe {
  0%, 100% { transform: scale(0.98); opacity: 0.72; }
  50% { transform: scale(1.03); opacity: 1; }
}

@keyframes scanSpin {
  to { transform: rotate(360deg); }
}

@keyframes scanProgress {
  from { transform: translateX(-20%); }
  to { transform: translateX(150%); }
}

@media (max-width: 760px) {
  page {
    background: #f5f7fa;
  }

  .scan-container {
    min-height: 100vh;
    padding: 0 12px calc(26px + env(safe-area-inset-bottom));
    background:
      linear-gradient(180deg, transparent 0, transparent 252px, #f5f7fa 252px),
      linear-gradient(135deg, #10b981 0%, #059669 60%, #047857 100%);
  }

  .scan-container::before {
    height: 252px;
    background-size: 20px 20px;
  }

  .scan-container::after {
    top: 220px;
    height: 54px;
  }

  .scan-container.scan-dark {
    background: linear-gradient(135deg, #0a0e27 0%, #141a35 46%, #21164a 78%, #0f0f23 100%);
  }

  .scan-container.scan-dark::before {
    height: 100%;
    background-size: 38px 38px;
  }

  .scan-topbar {
    min-height: 70px;
    padding: max(14px, env(safe-area-inset-top)) 0 8px;
    grid-template-columns: 40px minmax(0, 1fr) 34px;
    gap: 9px;
  }

  .scan-topbar .back-btn {
    width: 38px;
    height: 38px;
    border-radius: 11px;
  }

  .back-icon {
    font-size: 29px;
  }

  .brand-image {
    width: 34px;
    height: 34px;
  }

  .brand-title {
    font-size: 15px;
  }

  .brand-subtitle {
    display: none;
  }

  .topbar-state {
    min-width: 34px;
    width: 34px;
    height: 34px;
    min-height: 34px;
    padding: 0;
    border-radius: 10px;
  }

  .topbar-state text {
    display: none;
  }

  .content-wrapper {
    margin-top: 10px;
    display: block;
  }

  .connection-overview {
    max-width: none;
    min-height: 146px;
    margin: 0;
    padding: 16px 8px 18px;
    display: grid;
    grid-template-columns: 78px minmax(0, 1fr);
    grid-template-rows: auto auto auto;
    column-gap: 14px;
    align-content: center;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    backdrop-filter: none;
  }

  .scan-dark .connection-overview {
    border: 0;
    background: transparent;
    box-shadow: none;
  }

  .device-visual {
    grid-row: 1 / 3;
    width: 78px;
    height: 78px;
  }

  .device-visual-image {
    width: 58px;
    height: 58px;
  }

  .visual-status-mark {
    right: -1px;
    bottom: 2px;
    width: 25px;
    height: 25px;
    border-width: 2px;
    font-size: 13px;
  }

  .overview-title {
    align-self: end;
    margin: 0;
    font-size: 19px;
    text-align: left;
  }

  .overview-desc {
    align-self: start;
    margin: 4px 0 0;
    font-size: 12px;
    line-height: 1.45;
    text-align: left;
  }

  .connection-steps {
    grid-column: 1 / -1;
    margin-top: 16px;
  }

  .status-card {
    min-height: 0;
    border-radius: 16px;
    box-shadow: 0 16px 38px rgba(15, 78, 60, 0.14);
  }

  .scan-dark .status-card {
    box-shadow:
      0 0 0 1px rgba(78, 205, 196, 0.06) inset,
      0 16px 40px rgba(0, 0, 0, 0.34),
      0 0 24px rgba(64, 224, 255, 0.09);
  }

  .status-section {
    min-height: 0;
    padding: 24px 16px 20px;
  }

  .section-kicker {
    min-height: 24px;
    padding: 0 10px;
  }

  .status-title {
    margin-top: 14px;
    font-size: 24px;
  }

  .status-desc {
    margin-top: 8px;
    font-size: 13px;
  }

  .device-info-card,
  .device-info-card.success,
  .device-info-card.error {
    margin-top: 22px;
    border-radius: 10px;
  }

  .device-info-row {
    min-height: 58px;
    padding: 10px 14px;
    grid-template-columns: 88px minmax(0, 1fr);
    gap: 10px;
  }

  .action-group {
    margin-top: 24px;
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .action-btn,
  button.action-btn {
    height: 46px;
    border-radius: 11px;
  }

  .timeout-note {
    padding-top: 18px;
  }

  .eco-tip {
    min-height: 46px;
    margin-top: 12px;
    border-radius: 12px;
  }
}

@media (max-width: 360px) {
  .scan-container {
    padding-right: 10px;
    padding-left: 10px;
  }

  .brand-title {
    font-size: 14px;
  }

  .overview-title {
    font-size: 18px;
  }

  .device-info-row {
    grid-template-columns: 78px minmax(0, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .scan-container::before,
  .ring-one,
  .ring-two,
  .progress-fill {
    animation: none !important;
  }
}

/* The legacy page keeps selectors with the same names. Theme-qualified rules
   ensure the light skin wins regardless of style-block compilation order. */
.scan-container:not(.scan-dark) {
  background:
    radial-gradient(ellipse 58% 32% at 86% 14%, rgba(16, 185, 129, 0.18) 0%, transparent 72%),
    radial-gradient(ellipse 46% 30% at 8% 57%, rgba(59, 130, 246, 0.11) 0%, transparent 74%),
    radial-gradient(ellipse 52% 28% at 80% 88%, rgba(245, 158, 11, 0.09) 0%, transparent 76%),
    linear-gradient(180deg, transparent 0, transparent 286px, #f0fdf4 286px, #f8fafc 62%, #eff6ff 100%),
    linear-gradient(135deg, #10b981 0%, #059669 54%, #047857 100%);
}

.light-eco-decor {
  position: absolute;
  z-index: 0;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.light-eco-decor::before {
  content: "";
  position: absolute;
  top: 238px;
  right: 0;
  bottom: 0;
  left: 0;
  background:
    radial-gradient(rgba(16, 185, 129, 0.25) 1px, transparent 1.2px) 0 0 / 28px 28px,
    linear-gradient(145deg, rgba(16, 185, 129, 0.075) 0%, transparent 38%),
    linear-gradient(28deg, transparent 54%, rgba(59, 130, 246, 0.08) 100%);
  opacity: 0.56;
}

.light-eco-decor::after {
  content: "";
  position: absolute;
  right: -13%;
  bottom: 9%;
  width: min(420px, 60vw);
  height: min(420px, 60vw);
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, rgba(16, 185, 129, 0.12) 0%, rgba(16, 185, 129, 0.045) 44%, transparent 72%);
  animation: scanAmbientFloat 12s ease-in-out infinite;
}

.scan-dark .light-eco-decor {
  display: none;
}

.eco-symbol {
  position: absolute;
  display: block;
  color: #ffffff;
  opacity: 0.16;
  filter: saturate(0.8);
  animation: ecoSymbolFloat 5s ease-in-out infinite;
}

.eco-leaf-one {
  top: 92px;
  left: max(5%, calc(50% - 650px));
  font-size: 34px;
  transform: rotate(-14deg);
}

.eco-leaf-two {
  top: 112px;
  right: max(6%, calc(50% - 640px));
  font-size: 29px;
  animation-delay: -1.8s;
}

.eco-recycle {
  top: 166px;
  right: max(15%, calc(50% - 490px));
  font-size: 38px;
  opacity: 0.11;
  animation-delay: -3s;
}

.scan-container:not(.scan-dark)::before {
  height: 286px;
  opacity: 0.18;
  background-image: radial-gradient(rgba(255, 255, 255, 0.85) 1px, transparent 1px);
  background-size: 24px 24px;
}

.scan-container:not(.scan-dark)::after {
  display: block;
  top: 230px;
  height: 82px;
  background: #f5f7fa;
}

.scan-container:not(.scan-dark) .scan-topbar .back-btn {
  border-color: rgba(255, 255, 255, 0.3);
  color: #ffffff;
  background: rgba(255, 255, 255, 0.15);
  box-shadow: 0 8px 20px rgba(4, 120, 87, 0.18);
}

.scan-container:not(.scan-dark) .brand-title,
.scan-container:not(.scan-dark) .overview-title {
  color: #ffffff;
}

.scan-container:not(.scan-dark) .brand-subtitle,
.scan-container:not(.scan-dark) .overview-desc {
  color: rgba(255, 255, 255, 0.78);
}

.scan-container:not(.scan-dark) .topbar-state {
  border-color: rgba(255, 255, 255, 0.25);
  color: #ffffff;
  background: rgba(255, 255, 255, 0.13);
}

.scan-container:not(.scan-dark) .connection-overview {
  border-color: rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.18);
  box-shadow: 0 18px 48px rgba(4, 120, 87, 0.18);
}

.scan-container:not(.scan-dark) .step-item {
  color: rgba(255, 255, 255, 0.52);
}

.scan-container:not(.scan-dark) .step-item.active {
  color: #ffffff;
}

.scan-container:not(.scan-dark) .step-item.active .step-dot {
  border-color: #ffffff;
  background: #ffffff;
}

.scan-container:not(.scan-dark) .step-line.active {
  background: rgba(255, 255, 255, 0.85);
}

@media (min-width: 761px) {
  .scan-container:not(.scan-dark) .connection-overview {
    border-color: rgba(255, 255, 255, 0.42);
    background: linear-gradient(145deg, rgba(5, 150, 105, 0.9) 0%, rgba(16, 185, 129, 0.82) 100%);
    box-shadow:
      0 18px 48px rgba(4, 120, 87, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
  }
}

@media (max-width: 760px) {
  .scan-container:not(.scan-dark) {
    background:
      radial-gradient(ellipse 78% 28% at 90% 13%, rgba(16, 185, 129, 0.16) 0%, transparent 74%),
      radial-gradient(ellipse 70% 26% at 6% 58%, rgba(59, 130, 246, 0.1) 0%, transparent 74%),
      radial-gradient(ellipse 80% 24% at 86% 88%, rgba(245, 158, 11, 0.08) 0%, transparent 78%),
      linear-gradient(180deg, transparent 0, transparent 252px, #f0fdf4 252px, #f8fafc 66%, #eff6ff 100%),
      linear-gradient(135deg, #10b981 0%, #059669 60%, #047857 100%);
  }

  .scan-container:not(.scan-dark)::before {
    height: 252px;
    background-size: 20px 20px;
  }

  .scan-container:not(.scan-dark)::after {
    top: 220px;
    height: 54px;
  }

  .scan-container:not(.scan-dark) .connection-overview {
    border: 0;
    background: transparent;
    box-shadow: none;
  }

  .eco-leaf-one {
    top: 74px;
    left: -4px;
    font-size: 25px;
  }

  .eco-leaf-two {
    top: 86px;
    right: 8px;
    font-size: 23px;
  }

  .eco-recycle {
    top: 154px;
    right: 42px;
    font-size: 28px;
  }

  .light-eco-decor::before {
    top: 214px;
    background:
      radial-gradient(rgba(16, 185, 129, 0.22) 1px, transparent 1.1px) 0 0 / 24px 24px,
      linear-gradient(150deg, rgba(16, 185, 129, 0.07) 0%, transparent 42%),
      linear-gradient(30deg, transparent 62%, rgba(59, 130, 246, 0.07) 100%);
  }

  .light-eco-decor::after {
    right: -34%;
    bottom: 6%;
    width: 92vw;
    height: 92vw;
  }
}

@keyframes ecoSymbolFloat {
  0%, 100% { translate: 0 0; }
  50% { translate: 0 -7px; }
}

@keyframes scanAmbientFloat {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  50% { transform: translate3d(-18px, -14px, 0) scale(1.05); }
}
</style>
<style scoped>
.scan-container {
  --scan-bg: #f3f7f6;
  --scan-surface: #ffffff;
  --scan-surface-soft: #f6faf8;
  --scan-text: #17211f;
  --scan-muted: #687673;
  --scan-subtle: #8a9794;
  --scan-border: #d9e3e0;
  --scan-border-strong: #c3d1cd;
  --scan-primary: #128b66;
  --scan-primary-strong: #087a59;
  --scan-primary-soft: #e6f5ef;
  --scan-danger: #d5443f;
  --scan-danger-soft: #fff1f0;
  --scan-warning: #b97818;
  --scan-shadow: 0 10px 30px rgba(24, 55, 48, 0.08);
  position: relative;
  min-height: 100vh;
  overflow-x: hidden;
  padding: max(env(safe-area-inset-top), 12px) 20px max(env(safe-area-inset-bottom), 24px);
  color: var(--scan-text);
  background: var(--scan-bg);
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
  letter-spacing: 0;
  box-sizing: border-box;
}

.scan-container.scan-dark {
  --scan-bg: #101716;
  --scan-surface: #17201f;
  --scan-surface-soft: #1d2927;
  --scan-text: #edf5f3;
  --scan-muted: #a7b7b3;
  --scan-subtle: #7f918d;
  --scan-border: #2d3d39;
  --scan-border-strong: #435651;
  --scan-primary: #42c897;
  --scan-primary-strong: #33b989;
  --scan-primary-soft: #173a30;
  --scan-danger: #ff7770;
  --scan-danger-soft: #402321;
  --scan-warning: #f0b45f;
  --scan-shadow: 0 12px 34px rgba(0, 0, 0, 0.28);
}

.bg-effects,
.title-section {
  display: none !important;
}

.scan-topbar {
  position: relative;
  z-index: 2;
  width: min(1040px, 100%);
  min-height: 64px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}

.scan-topbar .back-btn {
  position: static;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--scan-border);
  border-radius: 8px;
  color: var(--scan-text);
  background: var(--scan-surface);
  box-shadow: none;
}

.scan-topbar .back-btn:active {
  transform: scale(0.96);
  background: var(--scan-surface-soft);
}

.back-icon {
  color: inherit;
  font-size: 30px;
  line-height: 1;
  font-weight: 400;
}

.topbar-brand {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-image {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
}

.brand-copy,
.brand-title,
.brand-subtitle {
  display: block;
  min-width: 0;
}

.brand-title {
  color: var(--scan-text);
  font-size: 16px;
  line-height: 1.3;
  font-weight: 760;
}

.brand-subtitle {
  margin-top: 2px;
  color: var(--scan-muted);
  font-size: 11px;
  line-height: 1.3;
}

.topbar-state {
  min-height: 32px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--scan-border);
  border-radius: 8px;
  color: var(--scan-muted);
  background: var(--scan-surface);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.state-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--scan-subtle);
}

.topbar-state.online { color: var(--scan-primary); }
.topbar-state.online .state-dot { background: var(--scan-primary); }
.topbar-state.pending { color: var(--scan-warning); }
.topbar-state.pending .state-dot { background: var(--scan-warning); animation: scanPulse 1.3s ease-in-out infinite; }
.topbar-state.offline { color: var(--scan-danger); }
.topbar-state.offline .state-dot { background: var(--scan-danger); }

.content-wrapper {
  position: relative;
  z-index: 1;
  width: min(1040px, 100%);
  min-height: 0;
  margin: 18px auto 0;
  padding: 0;
  display: grid;
  grid-template-columns: minmax(260px, 0.78fr) minmax(420px, 1.22fr);
  grid-template-areas:
    "overview status"
    "tip tip";
  align-items: stretch;
  gap: 16px;
}

.connection-overview {
  grid-area: overview;
  min-width: 0;
  padding: 36px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.device-visual {
  position: relative;
  width: 168px;
  height: 168px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.device-visual-image {
  position: relative;
  z-index: 2;
  width: 106px;
  height: 106px;
  object-fit: contain;
  filter: drop-shadow(0 12px 20px rgba(18, 139, 102, 0.16));
}

.visual-ring {
  position: absolute;
  border: 1px solid color-mix(in srgb, var(--scan-primary) 34%, transparent);
  border-radius: 50%;
}

.ring-one { inset: 16px; }
.ring-two { inset: 34px; opacity: 0.7; }

.device-visual.loading .ring-one { animation: ringRotate 2.2s linear infinite; border-style: dashed; }
.device-visual.connected .ring-one { box-shadow: 0 0 0 12px color-mix(in srgb, var(--scan-primary) 8%, transparent); }
.device-visual.error .visual-ring { border-color: color-mix(in srgb, var(--scan-danger) 38%, transparent); }

.visual-status-mark {
  position: absolute;
  z-index: 4;
  right: 20px;
  bottom: 24px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3px solid var(--scan-bg);
  border-radius: 50%;
  color: #ffffff;
  background: var(--scan-primary);
  font-size: 16px;
  font-weight: 800;
}

.device-visual.loading .visual-status-mark { background: var(--scan-warning); font-size: 12px; }
.device-visual.error .visual-status-mark { background: var(--scan-danger); }

.overview-title {
  margin-top: 18px;
  color: var(--scan-text);
  font-size: 22px;
  line-height: 1.35;
  font-weight: 780;
}

.overview-desc {
  max-width: 280px;
  margin-top: 8px;
  color: var(--scan-muted);
  font-size: 13px;
  line-height: 1.7;
}

.connection-steps {
  width: min(280px, 100%);
  margin-top: 28px;
  display: grid;
  grid-template-columns: auto 1fr auto 1fr auto;
  align-items: start;
  gap: 8px;
}

.step-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--scan-subtle);
  font-size: 10px;
}

.step-dot {
  width: 9px;
  height: 9px;
  border: 2px solid var(--scan-border-strong);
  border-radius: 50%;
  background: var(--scan-bg);
}

.step-item.active { color: var(--scan-primary); }
.step-item.active .step-dot { border-color: var(--scan-primary); background: var(--scan-primary); }

.step-line {
  height: 2px;
  margin-top: 4px;
  background: var(--scan-border);
}

.step-line.active { background: var(--scan-primary); }

.status-card {
  grid-area: status;
  width: auto;
  min-width: 0;
  min-height: 430px;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--scan-border);
  border-radius: 8px;
  background: var(--scan-surface);
  box-shadow: var(--scan-shadow);
  backdrop-filter: none;
  animation: panelIn 260ms ease both;
}

.status-card::before,
.status-card::after {
  display: none !important;
  content: none !important;
}

.status-section {
  width: 100%;
  min-height: 430px;
  max-width: none;
  padding: 44px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  text-align: left;
  box-sizing: border-box;
}

.section-kicker {
  display: block;
  color: var(--scan-warning);
  font-size: 12px;
  line-height: 1.3;
  font-weight: 760;
}

.section-kicker.success { color: var(--scan-primary); }
.section-kicker.error { color: var(--scan-danger); }

.status-title {
  margin-top: 10px;
  color: var(--scan-text);
  font-size: 27px;
  line-height: 1.3;
  font-weight: 800;
  text-align: left;
  text-shadow: none;
}

.status-desc {
  margin-top: 8px;
  color: var(--scan-muted);
  font-size: 14px;
  line-height: 1.65;
  text-align: left;
}

.device-info-card {
  width: 100%;
  max-width: none;
  margin: 28px 0 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--scan-border);
  border-left: 3px solid var(--scan-primary);
  border-radius: 6px;
  background: var(--scan-surface-soft);
  box-shadow: none;
  transform: none;
}

.device-info-card.error { border-left-color: var(--scan-danger); }

.scan-container.scan-dark .device-info-card,
.scan-container.scan-dark .device-info-card.success,
.scan-container.scan-dark .device-info-card.error {
  border-color: var(--scan-border);
  background: var(--scan-surface-soft);
}

.scan-container.scan-dark .device-info-card.success {
  border-left-color: var(--scan-primary);
}

.scan-container.scan-dark .device-info-card.error {
  border-left-color: var(--scan-danger);
}

.device-info-row {
  min-height: 58px;
  padding: 11px 14px;
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  align-items: center;
  gap: 14px;
  border-bottom: 1px solid var(--scan-border);
}

.device-info-row:last-child { border-bottom: 0; }

.device-label,
.device-value {
  display: block;
  margin: 0;
  text-align: left;
}

.device-label {
  color: var(--scan-muted);
  font-size: 12px;
  font-weight: 600;
}

.device-value {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--scan-text);
  font-size: 14px;
  line-height: 1.45;
  font-weight: 720;
}

.mono {
  font-family: "SFMono-Regular", Consolas, monospace;
  font-variant-numeric: tabular-nums;
}

.action-group {
  width: 100%;
  max-width: none;
  margin-top: 24px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.action-btn {
  width: 100%;
  height: 44px;
  min-height: 44px;
  margin: 0;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--scan-border-strong);
  border-radius: 7px;
  color: var(--scan-text);
  background: var(--scan-surface);
  box-shadow: none;
  font-size: 14px;
  line-height: 1;
  font-weight: 760;
}

.action-btn::after { display: none; }
.action-btn:active { transform: scale(0.985); opacity: 0.9; }
.action-btn.primary { color: #ffffff; border-color: var(--scan-primary); background: var(--scan-primary); }
.action-btn.primary:active { background: var(--scan-primary-strong); }
.action-btn.danger { color: var(--scan-danger); border-color: color-mix(in srgb, var(--scan-danger) 42%, var(--scan-border)); background: var(--scan-danger-soft); }
.action-btn.warning { color: #ffffff; border-color: var(--scan-warning); background: var(--scan-warning); }
.action-btn.secondary { color: var(--scan-primary); border-color: var(--scan-primary); background: var(--scan-primary-soft); }

.btn-icon { display: none; }
.btn-text { color: inherit; font-size: inherit; font-weight: inherit; }

.timeout-note {
  width: 100%;
  margin-top: 14px;
  color: var(--scan-subtle);
  font-size: 11px;
  line-height: 1.5;
  text-align: center;
}

.progress-bar {
  width: 100%;
  max-width: none;
  height: 6px;
  margin-top: 24px;
  overflow: hidden;
  border-radius: 3px;
  background: var(--scan-border);
}

.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--scan-primary);
  animation: progressMove 1.5s ease-in-out infinite;
}

.eco-tip {
  grid-area: tip;
  width: 100%;
  max-width: none;
  min-height: 46px;
  margin: 0;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 1px solid var(--scan-border);
  border-radius: 8px;
  color: var(--scan-muted);
  background: var(--scan-surface);
  box-shadow: none;
  box-sizing: border-box;
}

.eco-tip::before,
.eco-tip::after { display: none !important; content: none !important; }

.eco-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--scan-primary);
}

.tip-icon { display: none; }

.tip-text {
  color: inherit;
  font-size: 12px;
  line-height: 1.5;
  font-weight: 600;
  text-shadow: none;
}

@keyframes scanPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.82); }
}

@keyframes ringRotate {
  to { transform: rotate(360deg); }
}

@keyframes progressMove {
  0% { width: 16%; transform: translateX(-100%); }
  60%, 100% { width: 48%; transform: translateX(220%); }
}

@keyframes panelIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 760px) {
  .scan-container {
    padding: max(env(safe-area-inset-top), 8px) 12px max(env(safe-area-inset-bottom), 18px);
  }

  .scan-topbar {
    min-height: 56px;
    grid-template-columns: 38px minmax(0, 1fr) auto;
    gap: 9px;
  }

  .scan-topbar .back-btn {
    width: 38px;
    height: 38px;
  }

  .brand-image { width: 32px; height: 32px; }
  .brand-title { font-size: 14px; }
  .brand-subtitle { display: none; }

  .topbar-state {
    min-height: 30px;
    padding: 0 8px;
    font-size: 11px;
  }

  .content-wrapper {
    margin-top: 12px;
    grid-template-columns: 1fr;
    grid-template-areas:
      "overview"
      "status"
      "tip";
    gap: 12px;
  }

  .connection-overview {
    padding: 18px 14px 12px;
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    grid-template-areas:
      "visual title"
      "visual desc"
      "steps steps";
    align-items: center;
    gap: 2px 14px;
    text-align: left;
  }

  .device-visual {
    grid-area: visual;
    width: 88px;
    height: 88px;
  }

  .device-visual-image { width: 58px; height: 58px; }
  .ring-one { inset: 6px; }
  .ring-two { inset: 18px; }

  .visual-status-mark {
    right: 2px;
    bottom: 5px;
    width: 25px;
    height: 25px;
    border-width: 2px;
    font-size: 13px;
  }

  .overview-title {
    grid-area: title;
    margin: 0;
    font-size: 18px;
  }

  .overview-desc {
    grid-area: desc;
    max-width: none;
    margin-top: 4px;
    font-size: 12px;
    line-height: 1.55;
  }

  .connection-steps {
    grid-area: steps;
    width: 100%;
    margin-top: 16px;
  }

  .status-card,
  .status-section {
    min-height: 0;
  }

  .status-section {
    padding: 24px 20px;
  }

  .status-title { font-size: 23px; }
  .status-desc { font-size: 13px; }
  .device-info-card { margin-top: 20px; }

  .device-info-row {
    min-height: 54px;
    grid-template-columns: 90px minmax(0, 1fr);
  }

  .action-group { margin-top: 20px; }
}

@media (max-width: 420px) {
  .topbar-state text { display: none; }
  .topbar-state { width: 32px; padding: 0; justify-content: center; }

  .connection-overview {
    grid-template-columns: 76px minmax(0, 1fr);
    gap: 2px 12px;
  }

  .device-visual { width: 72px; height: 72px; }
  .device-visual-image { width: 48px; height: 48px; }
  .visual-status-mark { width: 22px; height: 22px; }
  .overview-title { font-size: 17px; }

  .status-section { padding: 22px 16px; }

  .device-info-row {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .action-group { grid-template-columns: 1fr; }
  .eco-tip { padding: 10px 12px; text-align: left; }
}

@media (prefers-reduced-motion: reduce) {
  .device-visual.loading .ring-one,
  .topbar-state.pending .state-dot,
  .progress-fill,
  .status-card {
    animation: none !important;
  }
}
</style>
