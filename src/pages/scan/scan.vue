<template>
  <view class="scan-container">
    <!-- 背景特效 -->
    <view class="bg-effects">
      <view class="bg-grid"></view>
      <view class="floating-elements">
        <view class="float-item" v-for="n in 8" :key="n" :style="getFloatItemStyle(n)"></view>
      </view>
      <view class="scan-lines"></view>
      <view class="energy-orbs">
        <view class="energy-orb" v-for="n in 4" :key="'orb' + n" :style="getOrbStyle(n)"></view>
      </view>
      <view class="tech-waves">
        <view class="wave" v-for="n in 3" :key="'wave' + n"></view>
      </view>
    </view>

    <!-- 返回按钮 -->
    <view class="back-btn" @click="goBack">
      <text class="back-icon">←</text>
    </view>
    
    <!-- 主内容 -->
    <view class="content-wrapper">
      <!-- 标题区域 -->
      <view class="title-section">
        <view class="title-decoration">
          <view class="title-particles">
            <view class="particle" v-for="n in 6" :key="'particle' + n"></view>
          </view>
          <text class="title-icon">🌱</text>
        </view>
        <text class="main-title">智能设备连接</text>
        <text class="sub-title">Green Tech · Smart Future</text>
        <view class="title-underline">
          <view class="underline-segment" v-for="n in 3" :key="'seg' + n"></view>
        </view>
      </view>
      
      <!-- 连接状态卡片 -->
      <view class="status-card">
        <!-- 加载状态 -->
        <view v-if="loading" class="status-section loading-section">
          <view class="status-icon-wrapper">
            <view class="loading-ring"></view>
            <text class="status-icon">🔄</text>
          </view>
          <text class="status-title">正在连接智能设备</text>
          <text class="status-desc">建立安全连接中，请稍候...</text>
          <view class="device-info-card">
            <text class="device-label">设备标识</text>
            <text class="device-value">{{ deviceId || '获取中...' }}</text>
          </view>
          <view class="progress-bar">
            <view class="progress-fill"></view>
          </view>
        </view>
        
        <!-- 连接成功状态 -->
        <view v-else-if="connected" class="status-section success-section">
          <view class="status-icon-wrapper success">
            <text class="status-icon">🎯</text>
            <view class="success-ring"></view>
          </view>
          <text class="status-title">设备连接成功!</text>
          <text class="status-desc">已建立安全连接，开始环保之旅</text>
          <view class="device-info-card success">
            <text class="device-label">已连接设备</text>
            <text v-if="deviceName" class="device-value">{{ "ID"+deviceId+":"+deviceName }}</text>
            <text v-else class="device-value">{{ deviceId }}</text>
          </view>
          
          <!-- 功能按钮组 -->
          <view class="action-group">
            <button class="action-btn primary" @click="goToMap">
              <text class="btn-icon">🗺️</text>
              <text class="btn-text">查看地图</text>
            </button>
            <button class="action-btn danger" @click="endConnection">
              <text class="btn-icon">🔌</text>
              <text class="btn-text">结束连接</text>
            </button>
          </view>
          <text class="status-desc">5分钟内未检测到垃圾投放将自动断开连接</text>
        </view>
        
        <!-- 连接失败状态 -->
        <view v-else class="status-section error-section">
          <view class="status-icon-wrapper error">
            <text class="status-icon">🔄</text>
            <view class="error-pulse"></view>
          </view>
          <text class="status-title">连接暂时中断</text>
          <text class="status-desc">{{ errorMessage || '网络信号不稳定，请重试连接' }}</text>
          <view class="device-info-card error">
            <text class="device-label">设备ID</text>
            <text class="device-value">{{ deviceId || '未获取到' }}</text>
          </view>
          
          <!-- 操作按钮组 -->
          <view class="action-group">
            <button v-if="isH5" class="action-btn warning" @click="retryConnection">
              <text class="btn-icon">🔄</text>
              <text class="btn-text">重新连接</text>
            </button>
            <button v-if="isTokenError && !isH5" class="action-btn secondary" @click="startScan">
              <text class="btn-icon">📱</text>
              <text class="btn-text">重新扫码</text>
            </button>
          </view>
        </view>
      </view>
      
      <!-- 环保提示 -->
      <view class="eco-tip">
        <text class="tip-icon">🌍</text>
        <text class="tip-text">每次垃圾分类，都是对地球环境的一份贡献</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { getDeviceAPI, testDeviceAPI } from '@/utils/device-api-loader.js'

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
      
      startDeviceCheckTimer()// 连接成功后启动定时器检查已连接设备
      uni.showToast({
        title: '设备连接成功',
        icon: 'success',
        duration: 2000
      })
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
            url: '/pages/index/index'
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
  // ÿ5秒检查一次已连接设备
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
    url: '/pages/map/map'
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
          uni.redirectTo({url: '/pages/home/home'})
        }, 2000)
      }
    }
  })
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
          if (!res.content || res.content.trim() === '') {
            uni.showToast({
              title: '设备ID不能为空',
              icon: 'none'
            })
            return
          }
          const urlParams = parseUrlParams(res.content.split('?')[1] || '')
          deviceId.value = urlParams.deviceId || urlParams.device_id || ''
          token.value = urlParams.token || ''
          if(deviceId.value&&token.value) {
            attemptConnection()
          }else{
            uni.showToast({
              title: '设备ID和令牌不正确',
              icon: 'none'
            })
          }
        }
      }
    })
  } else {
    // 小程序/APP端使用扫码功能
    uni.scanCode({
      scanType: ['qrCode'],
      success: function(res) {
        if (!res.result || res.result.trim() === '') {
          uni.showToast({
            title: '设备ID不能为空',
            icon: 'none'
          })
          return
        }
        const urlParams = parseUrlParams(res.result.split('?')[1] || '')
        deviceId.value = urlParams.deviceId || urlParams.device_id || ''
        token.value = urlParams.token || ''
        if(deviceId.value && token.value) {
          attemptConnection()
        } else {
          uni.showToast({
            title: '二维码不正确',
            icon: 'none'
          })
        }
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
        url: '/pages/home/home'
      })
    }
}
</script>

<style scoped>
/* 主容器 */
.scan-container {
  min-height: 100vh;
  background: linear-gradient(180deg, #f0fdf4 0%, #f5f7fa 30%, #f0f9ff 70%, #f5f7fa 100%);
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
    radial-gradient(circle at 20% 30%, rgba(16, 185, 129, 0.08) 0%, transparent 50%),
    radial-gradient(circle at 80% 70%, rgba(52, 211, 153, 0.06) 0%, transparent 40%);
}

.floating-elements {
  position: absolute;
  width: 100%;
  height: 100%;
}

.float-item {
  position: absolute;
  width: 8rpx;
  height: 8rpx;
  background: rgba(16, 185, 129, 0.3);
  border-radius: 50%;
  animation: floatUp 15s ease-in-out infinite;
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
  0% { transform: translateY(100vh) scale(0); opacity: 0; }
  10% { opacity: 1; }
  50% { transform: translateY(50vh) scale(1); opacity: 0.6; }
  90% { opacity: 1; }
  100% { transform: translateY(-10vh) scale(0); opacity: 0; }
}

.scan-lines {
  display: none;
}

/* 能量球效果 */
.energy-orbs {
  position: absolute;
  width: 100%;
  height: 100%;
}

.energy-orb {
  position: absolute;
  width: 60rpx;
  height: 60rpx;
  background: rgba(16, 185, 129, 0.15);
  border-radius: 50%;
  animation: orbFloat 8s ease-in-out infinite;
}

@keyframes orbFloat {
  0%, 100% { 
    transform: translateY(0px) scale(1); 
    opacity: 0.2; 
  }
  50% { 
    transform: translateY(-30rpx) scale(1.1); 
    opacity: 0.4; 
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
  background: linear-gradient(90deg, transparent, rgba(16, 185, 129, 0.08), transparent);
  animation: waveMove 6s ease-in-out infinite;
}

.wave:nth-child(1) { animation-delay: 0s; }
.wave:nth-child(2) { animation-delay: 2s; }
.wave:nth-child(3) { animation-delay: 4s; }

@keyframes waveMove {
  0% { transform: translateX(-100%) scaleX(1); opacity: 0; }
  50% { transform: translateX(0%) scaleX(1.5); opacity: 0.4; }
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
