import { ref, onMounted, onUnmounted } from 'vue'
import { onLoad, onShow, onHide } from '@dcloudio/uni-app'
import { getDeviceAPI } from '@/utils/device-api-loader.js'
import { normalizeDeviceMode, resolveDeviceScanTarget, saveMockDeviceConnection, getDeviceQrScanContent } from '@/utils/device-qr.js'
import { resolveWechatQrScene } from '@/api/device.js'
import { appendPageQuery, clearPendingDeviceQrScene, isValidDeviceQrScene, normalizeDeviceQrScene, savePendingDeviceQrScene } from '@/utils/device-qr-entry.mjs'

// APP端参数设置函数（供其他页面调用）
export function setScanParams(deviceId, deviceName, token) {
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

// 每次调用独立持有连接状态、API 和定时器；须在页面 setup 中同步调用。
export function useDeviceScanPage({ dark = false } = {}) {
  const pageRoot = dark ? '/pages-dark' : '/pages'
  const pagePaths = {
    login: `${pageRoot}/index/index`,
    map: `${pageRoot}/map/map`,
    home: `${pageRoot}/home/home`,
    scan: `${pageRoot}/scan/scan`
  }

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
  const pageVisible = ref(true)
  const sessionSyncState = ref('pending')
  const routeScene = ref('')
  const activeScene = ref('')
  const connectionError = ref(null)
  let pageActive = true
  onLoad(options => {
    routeScene.value = String(options?.scene || '')
    if (isValidDeviceQrScene(routeScene.value)) savePendingDeviceQrScene(uni, routeScene.value)
  })
  onShow(() => { pageVisible.value = true })
  onHide(() => { pageVisible.value = false })

  function handleSessionDisconnected(message) {
    connected.value = false
    errorMessage.value = message
    uni.removeStorageSync('connection')
    uni.removeStorageSync('connected_device_mode')
    stopDeviceCheckTimer()
  }

  // 跨平台参数获取函数
  function getPageParams() {
    let deviceIdParam = ''
    let deviceNameParam = ''
    let deviceModeParam = 'bin'
    let tokenParam = ''
    let sceneParam = ''

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
        sceneParam = routeScene.value || urlParams.scene || ''
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
        sceneParam = routeScene.value || pageParams.scene || ''
      }
    } catch (error) {
      console.warn('获取页面参数失败:', error)
    }

    const finalParams = {
      deviceId: deviceIdParam,
      deviceName: deviceNameParam,
      deviceMode: deviceModeParam,
      token: tokenParam,
      scene: sceneParam
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

  // 保留 H5 的兼容入口，参数设置同时作为具名 ESM 导出供其他页面复用。
  if (typeof window !== 'undefined') {
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
    pageActive = true
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

    if (params.scene) {
      await resolveSceneAndConnect(params.scene)
      return
    }

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

  function isUnauthorizedDeviceError(error) {
    const code = Number(error?.code || error?.data?.code)
    const statusCode = Number(error?.statusCode || error?.data?.statusCode)
    const message = String(error?.msg || error?.message || error?.error || '').toLowerCase()
    return code === 401 || statusCode === 401 || message.includes('unauthorized') || message.includes('请重新登录') || message.includes('未登录')
  }

  function redirectToLoginWithScene(scene) {
    let dark = uni.getStorageSync('app_theme') === 'dark'
    try {
      const pages = getCurrentPages()
      dark = String(pages[pages.length - 1]?.route || '').startsWith('pages-dark/') || dark
    } catch (error) {
      // Use the stored theme when page stack details are unavailable.
    }
    const loginPath = dark ? '/pages-dark/index/index' : '/pages/index/index'
    uni.reLaunch({ url: appendPageQuery(loginPath, { scene }) })
  }

  async function resolveSceneAndConnect(sceneValue) {
    const scene = normalizeDeviceQrScene(sceneValue)
    if (!scene) {
      clearPendingDeviceQrScene(uni)
      errorMessage.value = '二维码已过期或异常，请重新扫码'
      isTokenError.value = true
      return false
    }

    savePendingDeviceQrScene(uni, scene)
    if (!uni.getStorageSync('token')) {
      errorMessage.value = '请先登录，登录后将继续连接设备'
      isTokenError.value = true
      uni.showToast({ title: '请先登录', icon: 'none' })
      redirectToLoginWithScene(scene)
      return false
    }

    loading.value = true
    errorMessage.value = ''
    activeScene.value = scene
    try {
      const result = await resolveWechatQrScene(scene)
      if (!pageActive) return false
      const resolvedDevice = result?.data || {}
      if (result?.code !== 0 || !resolvedDevice.device_id || !resolvedDevice.token) {
        throw new Error(result?.msg || '二维码已过期或异常')
      }

      deviceId.value = String(resolvedDevice.device_id)
      deviceName.value = ''
      deviceMode.value = normalizeDeviceMode(resolvedDevice.device_mode)
      token.value = String(resolvedDevice.token)
      connectionError.value = null
      const didConnect = await attemptConnection()
      if (!pageActive) return false
      if (didConnect && connected.value) {
        if (!deviceName.value) deviceName.value = String(resolvedDevice.device_name || '')
        clearPendingDeviceQrScene(uni)
        isTokenError.value = false
        return true
      }
      if (isUnauthorizedDeviceError(connectionError.value) || !uni.getStorageSync('token')) {
        savePendingDeviceQrScene(uni, scene)
        return false
      }
      clearPendingDeviceQrScene(uni)
      errorMessage.value = '二维码已过期或连接异常，请重新扫码'
      isTokenError.value = true
      uni.showToast({ title: errorMessage.value, icon: 'none' })
      return false
    } catch (error) {
      if (!pageActive) return false
      if (isUnauthorizedDeviceError(error) || !uni.getStorageSync('token')) {
        savePendingDeviceQrScene(uni, scene)
        return false
      }
      clearPendingDeviceQrScene(uni)
      deviceId.value = ''
      deviceName.value = ''
      token.value = ''
      connected.value = false
      errorMessage.value = '二维码已过期或连接异常，请重新扫码'
      isTokenError.value = true
      uni.showToast({ title: errorMessage.value, icon: 'none' })
      return false
    } finally {
      activeScene.value = ''
      loading.value = false
    }
  }

  async function attemptConnection() {
    if (loading.value && !activeScene.value) return false
    loading.value = true
    connected.value = false
    errorMessage.value = ''
    connectionError.value = null

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
        return true
      } else {
        throw new Error(result?.message || '连接失败')
      }
    } catch (error) {
      connectionError.value = error
      console.error('设备连接失败:', error)
      if (activeScene.value && (isUnauthorizedDeviceError(error) || !uni.getStorageSync('token'))) {
        savePendingDeviceQrScene(uni, activeScene.value)
        return false
      }

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
        if (activeScene.value) {
          savePendingDeviceQrScene(uni, activeScene.value)
          redirectToLoginWithScene(activeScene.value)
          return false
        }
        uni.showToast({
          title: '请先登录',
          icon: 'none',
          duration: 2000
        })
          uni.navigateTo({
              url: pagePaths.login
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
    // The bin panel reads connection and records together.
    if (deviceMode.value === 'bin') return
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
      url: pagePaths.map
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
            uni.redirectTo({url: pagePaths.home})
          }, 2000)
        }
      }
    })
  }

  function handleDeviceScanContent(rawContent) {
    const target = resolveDeviceScanTarget(rawContent, pagePaths.scan)
    if (target.invalidScene) {
      errorMessage.value = '二维码已过期或异常，请重新扫码'
      isTokenError.value = true
      uni.showToast({ title: errorMessage.value, icon: 'none' })
      return
    }
    if (target.scene) {
      savePendingDeviceQrScene(uni, target.scene)
      uni.redirectTo({ url: target.url })
      return
    }
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
        // #ifndef MP-WEIXIN
        scanType: ['qrCode'],
        // #endif
        success: function(res) {
          handleDeviceScanContent(getDeviceQrScanContent(res))
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
    pageActive = false
    stopDeviceCheckTimer()
  })

  function goBack() {
      const pages = getCurrentPages()
      if (pages.length > 1) {
        uni.navigateBack()
      } else {
        uni.reLaunch({
          url: pagePaths.home
        })
      }
  }

  return {
    deviceId,
    deviceName,
    deviceMode,
    loading,
    connected,
    errorMessage,
    isTokenError,
    isH5,
    pageVisible,
    sessionSyncState,
    handleSessionDisconnected,
    retryConnection,
    goToMap,
    endConnection,
    startScan,
    goBack
  }
}
