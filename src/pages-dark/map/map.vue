<template>
  <view class="map-container">
    <!-- H5端用div容器，微信小程序端用<map>组件 -->
    <div v-if="isH5" id="container" class="map-canvas"></div>
    <map v-else
      id="select-map"
      class="map-canvas"
      :latitude="center.latitude"
      :longitude="center.longitude"
      :scale="12"
      :markers="markers"
      show-location
      @markertap="onMarkerTap"
      @regionchange="onRegionChange"
    >
      <!-- App/小程序端控件：cover-view -->
      <cover-view v-if="selectMode" class="center-pin">📍</cover-view>
      <cover-view v-if="selectMode" class="location-control" @click="moveToMyLocation">◎</cover-view>
      
      <!-- Native Dark 选择面板 -->
      <cover-view v-if="selectMode" class="select-location-panel-native">
        <cover-view class="panel-box-native">
          <cover-view class="select-tips-native">📍 移动地图选择中心位置</cover-view>
          <cover-view v-if="selectedLocation" class="selected-coords-native">
            {{ selectedLocation.latitude.toFixed(6) }}, {{ selectedLocation.longitude.toFixed(6) }}
          </cover-view>
          <cover-view class="select-actions-native">
            <cover-view class="btn-native cancel" @click="cancelSelect">取消</cover-view>
            <cover-view class="btn-native confirm" @click="confirmSelect">确定</cover-view>
          </cover-view>
        </cover-view>
      </cover-view>
    </map>

    <!-- H5端选择面板 -->
    <view v-if="selectMode && isH5" class="select-location-panel">
      <view class="select-tips">
        📍 点击地图或拖动选择位置
      </view>
      <view class="center-marker">📍</view>
      <view v-if="selectedLocation" class="selected-info">
        <text class="selected-text">已选择位置</text>
        <text class="selected-coords">{{ selectedLocation.latitude.toFixed(6) }}, {{ selectedLocation.longitude.toFixed(6) }}</text>
      </view>
      <view class="select-actions">
        <button class="select-btn cancel" @click="cancelSelect">取消</button>
        <button class="select-btn pick-center" @click="pickCenterLocation">选取中心点</button>
        <button class="select-btn confirm" @click="confirmSelect" :disabled="!selectedLocation">确定</button>
      </view>
    </view>

    <!-- 位置选择右下角辅助按钮 (H5) -->
    <view v-if="selectMode && isH5" class="location-control" @click="moveToMyLocation">◎</view>

    <!-- 查看位置模式：显示位置信息 -->
    <view v-if="viewMode && viewLocationInfo" class="view-location-panel">
      <view class="view-location-header">
        <text class="location-name">{{ viewLocationInfo.name }}</text>
        <text class="location-close" @click="handleBack">✕</text>
      </view>
      <view class="location-details">
        <text class="location-address">{{ viewLocationInfo.address }}</text>
        <text class="location-coords">{{ viewLocationInfo.latitude.toFixed(6) }}, {{ viewLocationInfo.longitude.toFixed(6) }}</text>
      </view>
      <view class="location-actions">
        <button class="location-btn navigate-btn" @click="navigateToLocation">导航到这里</button>
        <button class="location-btn back-btn" @click="handleBack">返回</button>
      </view>
    </view>

    <!-- 右下角新增垃圾桶按钮（非选择模式且非查看模式才显示） -->
    <view v-if="!selectMode && !viewMode" class="add-btn-container">
      <view class="add-btn" @click="openAddModal">
        <text class="add-btn-icon">+</text>
        <text class="add-btn-text">新增垃圾桶</text>
      </view>
    </view>

    <!-- 统一底部信息卡（H5 与 小程序/APP 都用，非选择模式且非查看模式才显示） -->
    <view v-if="selectedMarker && !selectMode && !viewMode" class="info-card">
      <view class="info-header">
        <text class="info-title">{{ selectedMarker.title }}</text>
        <text class="info-close" @click="closeInfo">✕</text>
      </view>
      <view class="info-body">
        <text class="info-line">经纬度: {{ selectedMarker.latitude }}, {{ selectedMarker.longitude }}</text>
        <text v-if="selectedMarker.desc" class="info-line">{{ selectedMarker.desc }}</text>
      </view>
      <view class="info-actions">
        <button class="info-btn" @click="goNavigate(selectedMarker)">导航到这里</button>
        <button class="info-btn" @click="openHistoryImage(selectedMarker)">查看图片</button>
        <button class="info-btn danger" @click="reportErrorMarker(selectedMarker)">报错</button>
      </view>
    </view>

    <!-- 新增垃圾桶弹窗 -->
    <AddTrashBinModal
      :visible="showAddModal"
      :userLocation="userLocation"
      @close="closeAddModal"
      @success="onAddSuccess"
    />
    
    <!-- 底部导航栏 -->
    <view class="tabbar">
      <view class="tabbar-item" @click="goHome">
        <text class="tabbar-icon">🏠</text>
        <text class="tabbar-label">首页</text>
      </view>
      <view class="tabbar-item active">
        <text class="tabbar-icon">🗺️</text>
        <text class="tabbar-label">地图</text>
      </view>
      <view class="tabbar-item" @click="goShop">
        <text class="tabbar-icon">🛍️</text>
        <text class="tabbar-label">商城</text>
      </view>
      <view class="tabbar-item" @click="goProfile">
        <text class="tabbar-icon">👤</text>
        <text class="tabbar-label">我的</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { config } from '../../api/config.js'
import { mapConfig } from '../../api/map-config.js'
import { reportDeviceError, getTrashBinList } from '../../api/map.js'
import AddTrashBinModal from '../../components/AddTrashBinModal.vue'
/*
  如果不想引入 lodash，注释掉上面 import 并在需要时用简单 typeof/Array.isArray 校验
*/

const isH5 = process.env.UNI_PLATFORM === 'h5'

// 位置选择模式
const selectMode = ref(false)
const selectedLocation = ref(null)

// 查看位置模式（从聊天消息点击进入）
const viewMode = ref(false)
const viewLocationInfo = ref(null)

// 青岛市中心点坐标
const center = ref({ latitude: 36.067108, longitude: 120.382609 })
const userLocation = ref({ latitude: null, longitude: null, addr: '' })
const userMarker = ref(null)

// 新增垃圾桶弹窗显示状态
const showAddModal = ref(false)

// 垃圾箱点位数据（从后端API获取，不再硬编码）
const trashPoints = ref([])

// 小程序/APP markers — 使用计算属性自动更新
const markers = computed(() => trashPoints.value.map(p => ({
  id: p.id,
  latitude: typeof p.latitude === 'number' ? p.latitude : parseFloat(p.latitude),
  longitude: typeof p.longitude === 'number' ? p.longitude : parseFloat(p.longitude),
  title: p.type === 'smart' ? '智能垃圾桶' : '普通垃圾桶', // 根据类型设置标题
  iconPath: (p.type === 'smart' ? '/static/smart-marker.png' : '/static/normal-marker.png'),
  width: 42,
  height: 46,
  anchor: { x: 0.5, y: 1 }, // 设置锚点，避免图标变形
  callout: {
    content: p.type === 'smart' ? '智能垃圾桶' : '普通垃圾桶', // 气泡显示类型
    color: '#ffffff',
    bgColor: '#6a7cfb',
    padding: 6,
    borderRadius: 6,
    display: 'BYCLICK' // 点击时显示
  }
})))

// 选中的 marker 数据（用于底部信息卡）
const selectedMarker = ref(null)

// 生成粒子动画样式
const getParticleStyle = (index) => {
  const positions = [
    { left: '15%', top: '10%', animationDelay: '0s', animationDuration: '6s' },
    { left: '85%', top: '20%', animationDelay: '1s', animationDuration: '8s' },
    { left: '25%', top: '70%', animationDelay: '2s', animationDuration: '7s' },
    { left: '75%', top: '80%', animationDelay: '3s', animationDuration: '9s' },
    { left: '45%', top: '15%', animationDelay: '1.5s', animationDuration: '6.5s' },
    { left: '65%', top: '60%', animationDelay: '2.5s', animationDuration: '7.5s' },
    { left: '10%', top: '50%', animationDelay: '4s', animationDuration: '8.5s' },
    { left: '90%', top: '45%', animationDelay: '0.5s', animationDuration: '6.8s' }
  ]
  return positions[index - 1] || positions[0]
}

// H5 端 map 引用
let tmapInstance = null
let tmapMarkers = [] // 存放 H5 创建的 marker 对象与相关信息

// 处理页面参数
const pages = getCurrentPages()
const currentPage = pages[pages.length - 1]
const pageOptions = currentPage?.$page?.options || {}

// 检查是否为位置选择模式
if (pageOptions.mode === 'select') {
  selectMode.value = true
}

// 位置选择相关方法
function cancelSelect() {
  uni.removeStorageSync('selectedLocation') // 清理缓存，防止误操作
  uni.navigateBack()
}

function onRegionChange(e) {
  if (!selectMode.value) return
  // 每当区域变化（用户拖动地图）时，更新中心坐标
  if (e && e.detail && e.detail.centerLocation) {
    const loc = e.detail.centerLocation
    selectedLocation.value = {
      latitude: typeof loc.latitude === 'number' ? loc.latitude : parseFloat(loc.latitude),
      longitude: typeof loc.longitude === 'number' ? loc.longitude : parseFloat(loc.longitude),
      name: '选中的位置',
      address: `${typeof loc.latitude === 'number' ? loc.latitude.toFixed(6) : parseFloat(loc.latitude).toFixed(6)}, ${typeof loc.longitude === 'number' ? loc.longitude.toFixed(6) : parseFloat(loc.longitude).toFixed(6)}`
    }
  }
}

let mapContextInitialized = false

function ensureMapContext() {
  if (mapContextInitialized) return
  const instance = getCurrentInstance()
  if (!instance || !instance.proxy) {
    console.warn('无法获取Vue实例')
    return
  }
  mapContextInitialized = true
  console.log('mapContext已初始化')
}

function pickCenterLocation() {
  console.log('pickCenterLocation 被调用')
  if (selectedLocation.value) {
    uni.showToast({ 
      title: `已选择: ${selectedLocation.value.latitude.toFixed(6)}, ${selectedLocation.value.longitude.toFixed(6)}`, 
      icon: 'none',
      duration: 2000
    })
  } else {
    uni.showToast({ title: '请先拖动地图选择位置', icon: 'none' })
  }
}

function moveToMyLocation() {
  console.log('moveToMyLocation 被调用')
  uni.showToast({ title: '正在定位...', icon: 'loading', duration: 2000 })
  getUserLocationOnce('gcj02').then(loc => {
    center.value = { latitude: loc.latitude, longitude: loc.longitude }
    selectedLocation.value = {
      latitude: loc.latitude,
      longitude: loc.longitude,
      name: '我的位置',
      address: ''
    }
    uni.showToast({ title: '已定位到我的位置', icon: 'success', duration: 1000 })
  }).catch(err => {
    console.error('定位失败:', err)
    uni.showToast({ title: '定位失败', icon: 'none', duration: 1000 })
  })
}

function confirmSelect() {
  console.log('confirmSelect 被触发了')
  console.log('selectedLocation:', selectedLocation.value)
  
  if (!selectedLocation.value) {
    uni.showToast({ title: '请先选择位置', icon: 'none' })
    return
  }
  
  const locationData = {
    latitude: selectedLocation.value.latitude,
    longitude: selectedLocation.value.longitude,
    name: selectedLocation.value.name || '位置分享',
    address: selectedLocation.value.address || ''
  }
  
  console.log('locationData:', locationData)
  uni.setStorageSync('selectedLocation', locationData)
  console.log('已存储selectedLocation到本地存储')
  
  // 2. EventChannel (Fallback for App)
  // #ifndef H5
  try {
     // 增加类型检查
    if (typeof uni.getOpenerEventChannel === 'function') {
        const eventChannel = uni.getOpenerEventChannel()
        if (eventChannel && eventChannel.emit) {
            console.log('EventChannel 存在，发送位置数据')
            eventChannel.emit('selectLocation', locationData)
        }
    } else {
        const instance = getCurrentInstance()
        if (instance && instance.proxy && instance.proxy.getOpenerEventChannel) {
             const eventChannel = instance.proxy.getOpenerEventChannel()
             if (eventChannel && eventChannel.emit) {
                 eventChannel.emit('selectLocation', locationData)
             }
        }
    }
  } catch (e) {
    console.warn('EventChannel error:', e)
  }
  // #endif
  
  console.log('开始导航回上一页')
  uni.navigateBack({ 
    success: () => console.log('导航成功'),
    fail: (err) => console.error('导航失败:', err)
  })
}

// 地图拖动时更新中心坐标（新的中心点检测方式）
function onMapClick(lat, lng) {
  if (!selectMode.value) return
  
  selectedLocation.value = {
    latitude: lat,
    longitude: lng,
    name: '选中的位置',
    address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`
  }
  
  // 如果是H5，在地图上标记选中位置
  if (isH5 && tmapInstance && window.TMap) {
    // 清除之前的选择标记
    if (window.selectLocationMarker) {
      window.selectLocationMarker.setMap(null)
    }
    
    // 添加新的选择标记
    window.selectLocationMarker = new window.TMap.MultiMarker({
      map: tmapInstance,
      styles: {
        selected: new window.TMap.MarkerStyle({
          width: 30,
          height: 40,
          anchor: { x: 15, y: 40 },
          src: '/static/location-marker.png'
        })
      },
      geometries: [{
        id: 'selected',
        styleId: 'selected',
        position: new window.TMap.LatLng(lat, lng)
      }]
    })
  }
}

onMounted(async () => {
  // 获取页面参数
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1]
  const options = currentPage.options || {}
  
  // 检查是否为选择位置模式
  if (options.mode === 'select') {
    selectMode.value = true
  }
  
  // 检查是否为查看位置模式
  if (options.mode === 'view' && options.lat && options.lng) {
    viewMode.value = true
    const lat = parseFloat(options.lat)
    const lng = parseFloat(options.lng)
    const name = decodeURIComponent(options.name || '位置')
    const address = decodeURIComponent(options.address || '')
    
    viewLocationInfo.value = {
      latitude: lat,
      longitude: lng,
      name: name,
      address: address
    }
    
    // 设置地图中心到该位置
    center.value = { latitude: lat, longitude: lng }
    
    // 设置页面标题为"查看位置"
    uni.setNavigationBarTitle({
      title: '查看位置'
    })
  }
  
  if (isH5) {
    // 动态加载腾讯地图 GL JS
    const script = document.createElement('script')
    script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${mapConfig.qqMapKey}`
    script.onerror = (error) => {
      console.error('加载地图脚本失败:', error)
      uni.showToast({ title: '地图加载失败，请刷新重试', icon: 'none', duration: 3000 })
      
      // 如果有备用密钥，尝试使用备用密钥
      if (mapConfig.qqMapKeyBackup) {
        console.log('尝试使用备用密钥加载地图')
        const backupScript = document.createElement('script')
        backupScript.src = `https://map.qq.com/api/gljs?v=1.exp&key=${mapConfig.qqMapKeyBackup}`
        backupScript.onload = () => {
          initTMap()
        }
        backupScript.onerror = () => {
          console.error('备用密钥也无法加载地图')
          uni.showToast({ title: '地图服务暂时不可用', icon: 'none', duration: 3000 })
        }
        document.head.appendChild(backupScript)
      }
    }
    script.onload = () => {
      initTMap()
    }
    document.head.appendChild(script)
  }
  
  // 如果是查看位置模式，跳过定位和加载垃圾桶列表
  if (viewMode.value) {
    return
  }
  
  try {
    // APP端可能需要先尝试gcj02，失败后自动降级到wgs84
    const loc = await getUserLocationOnce('gcj02')
    if (loc && typeof loc.latitude === 'number') {
      // 成功：更新中心与用户标记
      center.value = { latitude: loc.latitude, longitude: loc.longitude }
      userLocation.value = { latitude: loc.latitude, longitude: loc.longitude }

      // 若你使用的是小程序/APP 的 <map>，需要把 marker 放入 markers 中
      // 例如把 userMarker 合并到 markers.value（假定你有 markers ref）
      userMarker.value = {
        id: 'me',
        latitude: loc.latitude,
        longitude: loc.longitude,
        iconPath: '/static/person.png',
        width: 30,
        height: 46,
        anchor: { x: 0.5, y: 1 }, // 设置锚点，避免图标变形
        title: '我的位置'
      }
      // 如果你已有 markers 列表，记得合并： markers.value = [...otherMarkers, userMarker.value]
      // H5: 如需将 map 居中到用户，调用 tmapInstance.setCenter(...)（在初始化后）
      if (isH5 && typeof window !== 'undefined' && window.TMap && tmapInstance) {
        tmapInstance.setCenter(new window.TMap.LatLng(loc.latitude, loc.longitude))
        tmapInstance.setZoom && tmapInstance.setZoom(12)
      }
      
      // 定位成功后加载附近的垃圾桶
      await loadTrashBinList()
    } else {
      throw new Error('定位结果不完整')
    }
  } catch (err) {
    console.warn('getLocation failed', err)
    // 给用户友好的提示
    let msg = '定位失败'
    if (err && err.errMsg) {
      if (err.errMsg.includes('not support gcj02')) {
        msg = 'APP端定位系统不支持GCJ02坐标，已尝试其他坐标系'
      } else {
        msg = err.errMsg
      }
    } else if (err && err.message) {
      msg = err.message
    }
    
    uni.showToast({ title: '定位失败：' + msg, icon: 'none', duration: 2500 })

    // 如果是权限被拒绝，给出引导
    if (err && err.errMsg && (String(err.errMsg).toLowerCase().includes('user denied')||String(err.errMsg).toLowerCase().includes('secure'))) {
      // H5：提示用户在浏览器地址栏 / 设置中开启位置权限
      if (isH5) {
        uni.showToast({ title: '定位失败：权限不足', icon: 'none', duration: 2500 })
      } else {
        // 小程序/APP：可以引导打开设置
        uni.showModal({
          title: '需要定位权限',
          content: '请在设置中允许定位权限，以便查看附近的垃圾箱。是否前往设置？',
          success(res) {
            if (res.confirm) {
              // 小程序/APP平台下打开设置
              try { uni.openSetting() } catch (e) { console.warn('openSetting not available', e) }
            }
          }
        })
      }
    } else if (err && err.errMsg && err.errMsg.includes('not support gcj02')) {
      // APP端坐标系不支持的特殊处理
      uni.showModal({
        title: '定位系统提示',
        content: 'APP端使用了备用定位方案，地图显示可能有轻微偏差，但不影响正常使用。',
        showCancel: false
      })
    }
    await loadTrashBinList()
  }
})
async function getUserLocationOnce(coordType = 'gcj02') {
  // 返回对象 { latitude, longitude } 或 抛错
  return new Promise((resolve, reject) => {
    // 检测当前平台，APP端可能不支持gcj02，支付宝小程序不支持type参数
    let actualCoordType = coordType
    
    // 获取平台信息
    try {
      const systemInfo = uni.getSystemInfoSync()
      const platform = systemInfo.platform
      const uniPlatform = systemInfo.uniPlatform
      
      // APP端降级处理：如果是APP端且不支持gcj02，使用wgs84
      if (uniPlatform === 'app' || uniPlatform === 'app-plus' || 
          (platform !== 'devtools' && platform !== 'android' && platform !== 'ios' && typeof window === 'undefined')) {
        // APP端优先尝试gcj02，失败后自动降级到wgs84
        console.log('检测到APP端，准备定位')
      }
      
      // 支付宝小程序不支持type参数，需要特殊处理
      if (uniPlatform === 'mp-alipay') {
        console.log('检测到支付宝小程序，不传递type参数')
        actualCoordType = null // 支付宝小程序不传type参数
      }
    } catch (e) {
      console.warn('获取系统信息失败:', e)
    }
    
    // 统一使用 uni.getLocation 的回调形式，保证在所有平台兼容
    const tryGetLocation = (type, fallback = false) => {
      try {
        // 构建请求参数，支付宝小程序不传type
        const locationParams = {
          success(res) {
            // 支付宝小程序返回的数据结构可能不同，需要兼容处理
            let latitude = res.latitude
            let longitude = res.longitude
            
            // 兼容不同平台的返回数据结构
            if (typeof latitude === 'string') {
              latitude = parseFloat(latitude)
            }
            if (typeof longitude === 'string') {
              longitude = parseFloat(longitude)
            }
            
            if (res && typeof latitude === 'number' && typeof longitude === 'number' && 
                !isNaN(latitude) && !isNaN(longitude)) {
              console.log(`定位成功 (${type || 'default'}):`, latitude, longitude)
              resolve({ latitude, longitude })
            } else {
              console.warn('定位返回数据格式异常:', res)
              // 如果 res 不含坐标，认为失败
              if (!fallback && type === 'gcj02') {
                console.log('gcj02定位失败，尝试wgs84')
                tryGetLocation('wgs84', true)
              } else {
                reject(new Error('定位返回数据异常'))
              }
            }
          },
          fail(err) {
            console.warn(`定位失败 (${type || 'default'}):`, err)
            
            // APP端gcj02失败时，尝试wgs84
            if (!fallback && type === 'gcj02' && err.errMsg && err.errMsg.includes('not support gcj02')) {
              console.log('gcj02不支持，尝试wgs84坐标系')
              tryGetLocation('wgs84', true)
              return
            }
            
            // 支付宝小程序特殊错误处理
            if (!fallback && err.errMsg && err.errMsg.includes('暂不支持 type')) {
              console.log('支付宝小程序不支持type参数，尝试不传type')
              tryGetLocation(null, true)
              return
            }
            
            // 如果是 H5 且 browser geolocation 可用，尝试回退
            if (isH5 && typeof navigator !== 'undefined' && navigator.geolocation) {
              navigator.geolocation.getCurrentPosition(
                pos => {
                  console.log('浏览器定位成功:', pos.coords.latitude, pos.coords.longitude)
                  resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
                },
                (e) => {
                  // 最终失败，带 err 信息
                  reject(err || e || new Error('浏览器定位失败'))
                },
                { enableHighAccuracy: true, timeout: 15000 }
              )
              return
            }
            reject(err || new Error('定位失败'))
          },
          timeout: 15000
        }
        
        // 只有非支付宝小程序才传递type参数
        if (type && actualCoordType !== null) {
          locationParams.type = type
        }
        
        uni.getLocation(locationParams)
      } catch (e) {
        // uni.getLocation 本身抛异常时的兜底
        if (!fallback && actualCoordType === 'gcj02') {
          tryGetLocation('wgs84', true)
        } else {
          reject(e)
        }
      }
    }
    
    // 开始定位
    tryGetLocation(actualCoordType)
  })
}

// H5 初始化地图并添加 marker
function initTMap() {
  if (!window.TMap && !window.tmap) {
    console.warn('TMap 未加载或 API 版本不兼容')
    uni.showToast({ title: '地图组件初始化失败', icon: 'none', duration: 3000 })
    return
  }
  
  try {
    // 使用 window.TMap.Map（GL JS）
    const map = new window.TMap.Map('container', {
      rotation: 0,
      pitch: 0,
      zoom: 10,
      center: new window.TMap.LatLng(center.value.latitude, center.value.longitude)
    })
    
    // 监听地图瓦片错误
    map.on('error', (error) => {
      console.error('地图加载错误:', error)
      uni.showToast({ title: '地图数据加载异常', icon: 'none', duration: 3000 })
    })
    
    // 监听地图点击事件（用于位置选择）
    if (selectMode.value) {
      map.on('click', (evt) => {
        if (evt.latLng) {
          onMapClick(evt.latLng.getLat(), evt.latLng.getLng())
        }
      })
    }

    tmapInstance = map

    // 初始化所有标记
    initH5Markers()
  } catch (error) {
    console.error('初始化地图时发生错误:', error)
    uni.showToast({ title: '地图初始化失败，请刷新重试', icon: 'none', duration: 3000 })
  }
}

// helper: 生成 H5 使用的 SVG data URL（只修改颜色）
function getH5Icon(type) {
  const color = type === 'smart' ? '#2ecc71' : '#ff6b6b' // 智能：绿，普通：红（根据要求仅改颜色）
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='36' height='36' viewBox='0 0 24 24'>
    <path d='M12 2c-1.1 0-2 .9-2 2v1H8c-1.1 0-2 .9-2 2v7c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2h-2V4c0-1.1-.9-2-2-2z' fill='${color}' stroke='#fff' stroke-width='0.5'/>
    <circle cx='12' cy='15.5' r='1.5' fill='#ffffff'/>
  </svg>`
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}

// H5 点击时的统一处理：设置 selectedMarker 并显示底部卡片 - 使用新API数据结构
function onH5MarkerClicked(index, point) {
  selectedMarker.value = {
    id: point.id,
    title: point.type === 'smart' ? '智能垃圾桶' : '普通垃圾桶',
    latitude: point.latitude,
    longitude: point.longitude,
    desc: `名称: ${point.name}\n说明: ${point.description || ''}`,
    imageUrl: point.image
  }
}

// 小程序/APP：点击 marker 的处理（map 组件触发 markertap） - 使用新API数据结构
function onMarkerTap(e) {
  const markerId = e && (e.markerId || e.markerId === 0 ? e.markerId : e.detail?.markerId);
  const point = trashPoints.value.find(p => p.id === markerId);
  if (!point) return;

  selectedMarker.value = {
    id: point.id,
    title: point.type === 'smart' ? '智能垃圾桶' : '普通垃圾桶', // 显示类型作为标题
    latitude: point.latitude,
    longitude: point.longitude,
    desc: `名称: ${point.name}\n说明: ${point.description || ''}`, // 名称放到详细信息中
    imageUrl: point.image
  };
}

// 关闭信息卡
function closeInfo() {
  selectedMarker.value = null
}

// 返回上一页
function handleBack() {
  uni.navigateBack()
}

// 导航到查看的位置
function navigateToLocation() {
  if (!viewLocationInfo.value) return
  
  const location = {
    latitude: viewLocationInfo.value.latitude,
    longitude: viewLocationInfo.value.longitude,
    title: viewLocationInfo.value.name,
    name: viewLocationInfo.value.name,
    desc: viewLocationInfo.value.address
  }
  
  goNavigate(location)
}

// 示例动作：导航（会根据不同平台采用不同方式）
function goNavigate(m) {
  if (!m) return
  // H5：可以打开高德/腾讯/百度地图的 web 跳转（这里简单用高德）
  if (isH5) {
    const url = `https://uri.amap.com/marker?position=${m.longitude},${m.latitude}&name=${encodeURIComponent(m.title)}&src=yourAppName`
    window.open(url, '_blank')
    return
  }
  // 小程序/APP：使用 uni.openLocation 跳转到系统地图
  // 确保经纬度是数字类型
  const latitude = typeof m.latitude === 'number' ? m.latitude : parseFloat(m.latitude)
  const longitude = typeof m.longitude === 'number' ? m.longitude : parseFloat(m.longitude)
  
  // 验证经纬度有效性
  if (isNaN(latitude) || isNaN(longitude)) {
    uni.showToast({
      title: '位置信息无效',
      icon: 'none'
    })
    return
  }
  
  uni.openLocation({
    latitude: latitude,
    longitude: longitude,
    name: m.title,
    address: m.desc || ''
  })
}

// 示例动作：查看历史图片（如果存在 imageUrl）
function openHistoryImage(m) {
  if (!m || !m.imageUrl) {
    uni.showToast({ title: '没有图片', icon: 'none' })
    return
  }
  // // H5: 新窗口打开或使用图片预览库
  // if (isH5) {
  //   window.open(m.imageUrl, '_blank')
  //   return
  // }
  // 小程序/APP 预览
  uni.previewImage({
    urls: [m.imageUrl],
  })
  selectedMarker.value = null
}

// 示例动作：删除标记（仅前端移除，生产应调用后端）
function deleteMarker(m) {
  if (!m) return
  
  // H5环境使用自定义确认对话框，以避免事件冲突问题
  if (isH5) {
    // 创建一个自定义确认对话框
    const customDialog = document.createElement('div')
    customDialog.style.position = 'fixed'
    customDialog.style.top = '0'
    customDialog.style.left = '0'
    customDialog.style.width = '100vw'
    customDialog.style.height = '100vh'
    customDialog.style.backgroundColor = 'rgba(0,0,0,0.5)'
    customDialog.style.zIndex = '10000'
    customDialog.style.display = 'flex'
    customDialog.style.justifyContent = 'center'
    customDialog.style.alignItems = 'center'
    customDialog.id = 'custom-dialog'
    
    // 对话框内容
    const dialogContent = document.createElement('div')
    dialogContent.style.backgroundColor = 'white'
    dialogContent.style.padding = '20px'
    dialogContent.style.borderRadius = '10px'
    dialogContent.style.width = '80%'
    dialogContent.style.maxWidth = '300px'
    dialogContent.style.textAlign = 'center'
    
    // 标题
    const title = document.createElement('h3')
    title.textContent = '删除'
    title.style.marginTop = '0'
    title.style.marginBottom = '15px'
    
    // 内容
    const content = document.createElement('p')
    content.textContent = `确认要删除 ${m.title} 吗？`
    content.style.marginBottom = '20px'
    
    // 按钮容器
    const buttonContainer = document.createElement('div')
    buttonContainer.style.display = 'flex'
    buttonContainer.style.justifyContent = 'space-around'
    
    // 取消按钮
    const cancelButton = document.createElement('button')
    cancelButton.textContent = '取消'
    cancelButton.style.padding = '8px 16px'
    cancelButton.style.backgroundColor = '#f0f0f0'
    cancelButton.style.border = 'none'
    cancelButton.style.borderRadius = '4px'
    cancelButton.style.cursor = 'pointer'
    
    // 确认按钮
    const confirmButton = document.createElement('button')
    confirmButton.textContent = '确认'
    confirmButton.style.padding = '8px 16px'
    confirmButton.style.backgroundColor = '#6a7cfb'
    confirmButton.style.color = 'white'
    confirmButton.style.border = 'none'
    confirmButton.style.borderRadius = '4px'
    confirmButton.style.cursor = 'pointer'
    
    // 添加事件监听器
    cancelButton.addEventListener('click', () => {
      document.body.removeChild(customDialog)
      console.log('删除操作已取消')
    })
    
    confirmButton.addEventListener('click', () => {
      document.body.removeChild(customDialog)
      performDelete(m)
      console.log('确认删除')
    })
    
    // 组装对话框
    buttonContainer.appendChild(cancelButton)
    buttonContainer.appendChild(confirmButton)
    dialogContent.appendChild(title)
    dialogContent.appendChild(content)
    dialogContent.appendChild(buttonContainer)
    customDialog.appendChild(dialogContent)
    
    // 添加到页面
    document.body.appendChild(customDialog)
  } else {
    // 小程序/APP使用原生对话框
    uni.showModal({
      title: '删除',
      content: `确认要删除 ${m.title} 吗？`,
      success: (res) => {
        if (res.confirm) {
          performDelete(m)
        }
      }
    })
  }
}

// 执行删除操作的具体逻辑，从UI中抽离出来 - 使用新API数据结构
function performDelete(m) {
  // 从数据中移除
  const idx = trashPoints.value.findIndex(p => p.id === m.id)
  if (idx !== -1) {
    trashPoints.value.splice(idx, 1)
  }
  // markers 是计算属性，会自动更新
  
  // H5: 若需在地图上移除 marker，需调用对应 tmap API
  if (isH5 && tmapInstance && tmapMarkers.length > 0) {
    // 找到相关 tmapMarkers 项并 remove
    const tIdx = tmapMarkers.findIndex(tm => tm.id === m.id)
    if (tIdx !== -1) {
      const item = tmapMarkers[tIdx]
      try {
        if (item.multiMarker && typeof item.multiMarker.remove === 'function') {
          item.multiMarker.remove()
        } else if (item.multiMarker && typeof item.multiMarker.destroy === 'function') {
          item.multiMarker.destroy()
        } else {
          console.warn('无法通过 MultiMarker API 删除 marker，请参考 TMap 版本文档')
        }
      } catch (e) {
        console.warn('删除 H5 marker 出错', e)
      }
      tmapMarkers.splice(tIdx, 1)
    }
  }

  // 关闭 info 卡
  selectedMarker.value = null
  uni.showToast({ title: '删除成功', icon: 'success' })
}

// 用户上报垃圾桶信息错误（报错按钮）
function reportErrorMarker(m) {
  if (!m) return
  // H5 提示输入原因
  const reason = isH5
    ? window.prompt(`上报 ${m.title} 的错误信息，请具体描述：`, '')
    : '';

  if (!isH5) {
    // 小程序/APP 使用输入框获取原因
    uni.showModal({
      title: '上报错误',
      content: `请输入上报 ${m.title} 的错误信息：`,
      editable: true,
      success(res) {
        if (res.confirm && res.content) {
          callReport(m, res.content);
        } else {
          uni.showToast({ title: '上报取消或未填写原因', icon: 'none' });
        }
      }
    });
    return;
  }

  if (reason === null || reason.trim() === '') {
    // 用户取消或未填写原因
    uni.showToast({ title: '上报取消或未填写原因', icon: 'none' });
    return;
  }

  callReport(m, reason);
}

async function callReport(m, reason = '') {
  try {
    // 优先使用 deviceId 字段，否则发送经纬度作为标识
    const deviceId = m.deviceId || m.id || `${m.latitude},${m.longitude}`
    await reportDeviceError(deviceId, reason)
    uni.showToast({ title: '上报成功，感谢反馈', icon: 'success' })
    selectedMarker.value = null
  } catch (err) {
    console.error('report error failed', err)
    const msg = (err && err.msg) ? err.msg : (err && err.message) ? err.message : '上报失败'
    uni.showToast({ title: msg, icon: 'none' })
  }
}

// 打开新增垃圾桶弹窗
function openAddModal() {
  showAddModal.value = true
}

// 关闭新增垃圾桶弹窗
function closeAddModal() {
  showAddModal.value = false
}

// 新增垃圾桶成功回调 - 使用新API数据结构
function onAddSuccess(newTrashBin) {
  console.log('新增垃圾桶成功:', newTrashBin)
  
  // 添加到本地数据 - 使用新的API数据结构
  let imageUrl = newTrashBin.image || ''
  // 如果是相对路径，拼接完整URL
  if (imageUrl && !imageUrl.startsWith('http') && !imageUrl.startsWith('data:')) {
    imageUrl = imageUrl.startsWith('/') ? 
      `${config.baseUrl}${imageUrl}` : 
      `${config.baseUrl}/${imageUrl}`
  } else if (!imageUrl) {
    // 如果没有图片，使用默认图片
    imageUrl = `${config.baseUrl}/static/smart-bin.png`
  }
  
  const newPoint = {
    id: Date.now(), // 临时使用时间戳作为ID，实际应使用后端返回的ID
    name: newTrashBin.name,
    description: newTrashBin.description,
    latitude: typeof newTrashBin.latitude === 'number' ? newTrashBin.latitude : parseFloat(newTrashBin.latitude),
    longitude: typeof newTrashBin.longitude === 'number' ? newTrashBin.longitude : parseFloat(newTrashBin.longitude),
    image: imageUrl,
    createdAt: new Date().toISOString(),
    type: newTrashBin.type || 'normal' // 默认 normal
  }
  
  trashPoints.value.push(newPoint)
  
  // markers现在是计算属性，会自动更新，无需手动push
  
  // 如果是H5端，添加到地图上
  if (isH5 && tmapInstance && window.TMap) {
    try {
      const iconUrl = getH5Icon(newPoint.type)

      const multi = new window.TMap.MultiMarker({
        id: 'trash' + newPoint.id,
        map: tmapInstance,
        geometries: [{
          id: 'trash-geo-' + newPoint.id,
          position: new window.TMap.LatLng(newPoint.latitude, newPoint.longitude),
          icon: iconUrl,
          title: newPoint.type === 'smart' ? '智能垃圾桶' : '普通垃圾桶',
          width: 36,
          height: 36
        }]
      })

      // 把对应业务数据保存到数组
      tmapMarkers.push({
        id: newPoint.id,
        pointData: newPoint,
        multiMarker: multi
      })

      // 绑定点击事件
      if (typeof multi.on === 'function') {
        multi.on('click', (evt) => {
          onH5MarkerClicked(trashPoints.value.length - 1, newPoint)
        })
      }

      // 将地图中心移动到新添加的点位
      tmapInstance.setCenter(new window.TMap.LatLng(newPoint.latitude, newPoint.longitude))
      if (tmapInstance.setZoom) {
        tmapInstance.setZoom(12)
      }
    } catch (e) {
      console.warn('H5地图添加新标记失败:', e)
    }
  }
  
  // 在小程序/APP中，将地图中心移动到新添加的点位
  if (!isH5) {
    center.value = {
      latitude: newPoint.latitude,
      longitude: newPoint.longitude
    }
  }
  
  uni.showToast({
    title: '垃圾桶已提交审核',
    icon: 'success',
    duration: 2000
  })
}

// 从后端获取垃圾桶列表
async function loadTrashBinList() {
  try {
    let latitude, longitude;
    if(userLocation.value.latitude && userLocation.value.longitude){
      latitude=userLocation.value.latitude;
      longitude=userLocation.value.longitude;
    }else{
      latitude=36.0671;
      longitude=120.3826;
    }
    if (latitude && longitude) {
      const result = await getTrashBinList({
        latitude:latitude,
        longitude: longitude,
        radius: 5000, // 5km半径
        page: 1,
        pageSize: 100
      });

      if (result && result.code === 0 && result.data && Array.isArray(result.data)) {
        // 直接使用后端返回的数据结构，处理图片路径
        trashPoints.value = result.data.map(item => {
          let imageUrl = item.image || '';
          // 如果是相对路径，拼接完整URL
          if (imageUrl && !imageUrl.startsWith('http') && !imageUrl.startsWith('data:')) {
            imageUrl = imageUrl.startsWith('/') ? 
              `${config.baseUrl}${imageUrl}` : 
              `${config.baseUrl}/${imageUrl}`;
          } else if (!imageUrl) {
            // 如果没有图片，使用默认图片
            imageUrl = `${config.baseUrl}/static/normal-bin.png`;
          }

          return {
            id: item.id,
            name: item.name,
            description: item.description,
            latitude: typeof item.latitude === 'number' ? item.latitude : parseFloat(item.latitude),
            longitude: typeof item.longitude === 'number' ? item.longitude : parseFloat(item.longitude),
            image: imageUrl,
            createdAt: item.createdAt,
            type: item.type // 新增 type 属性
          };
        });

        console.log(`成功加载 ${trashPoints.value.length} 个垃圾桶标记`)
        console.log(trashPoints.value)
        
        // 如果是H5，需要重新初始化地图标记
        if (isH5 && tmapInstance) {
          // 清除旧标记
          tmapMarkers.forEach(item => {
            try {
              if (item.multiMarker && typeof item.multiMarker.remove === 'function') {
                item.multiMarker.remove();
              }
            } catch (e) {
              console.warn('移除旧标记失败:', e);
            }
          });
          tmapMarkers = [];
          
          // 重新添加所有标记
          initH5Markers()
        }
      } else {
        console.warn('获取垃圾桶列表响应格式异常:', result)
      }
    } else {
      console.warn('用户位置信息不完整，无法加载垃圾桶列表')
    }
  } catch (error) {
    console.warn('获取垃圾桶列表失败:', error)
    // 如果API失败，可以提供一些默认的示例数据（可选）
    // 或者显示错误提示给用户
    uni.showToast({
      title: '加载垃圾桶信息失败'+error,
      icon: 'none',
      duration: 2000
    })
  }
}

// H5端初始化所有标记 - 使用新API数据结构
function initH5Markers() {
  if (!isH5 || !tmapInstance || !window.TMap) return
  
  // 如果是查看位置模式，只显示该位置的标记
  if (viewMode.value && viewLocationInfo.value) {
    try {
      const locationIcon = `data:image/svg+xml;utf8,${encodeURIComponent(`
        <svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 24 24'>
          <path d='M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z' fill='#6a7cfb' stroke='#fff' stroke-width='1'/>
        </svg>
      `)}`
      
      const multi = new window.TMap.MultiMarker({
        id: 'view-location',
        map: tmapInstance,
        geometries: [{
          id: 'view-location-geo',
          position: new window.TMap.LatLng(viewLocationInfo.value.latitude, viewLocationInfo.value.longitude),
          icon: locationIcon,
          title: viewLocationInfo.value.name,
          width: 48,
          height: 48
        }]
      })
      
      tmapMarkers.push({
        id: 'view-location',
        multiMarker: multi
      })
      
      // 设置地图中心到该位置
      tmapInstance.setCenter(new window.TMap.LatLng(viewLocationInfo.value.latitude, viewLocationInfo.value.longitude))
      tmapInstance.setZoom && tmapInstance.setZoom(15)
    } catch (e) {
      console.warn('创建查看位置标记时出错', e)
    }
    return
  }
  
  // 正常模式：显示所有垃圾桶标记
  trashPoints.value.forEach((p, i) => {
    try {
      const iconUrl = getH5Icon(p.type)

      const multi = new window.TMap.MultiMarker({
        id: 'trash' + p.id,
        map: tmapInstance,
        geometries: [{
          id: 'trash-geo-' + p.id,
          position: new window.TMap.LatLng(p.latitude, p.longitude),
          icon: iconUrl,
          title: p.type === 'smart' ? '智能垃圾桶' : '普通垃圾桶',
          width: 36,
          height: 36
        }]
      })

      tmapMarkers.push({
        id: p.id,
        pointData: p,
        multiMarker: multi
      })

      if (typeof multi.on === 'function') {
        multi.on('click', (evt) => {
          onH5MarkerClicked(i, p)
        })
      }
    } catch (e) {
      console.warn('创建或绑定 marker 时出错', e)
    }
  })
}
function goHome() {
  uni.redirectTo({ url: '/pages-dark/home/home' })
}

function goShop() {
  uni.navigateTo({ url: '/pages-dark/shop/shop' })
}

function goProfile() {
  uni.redirectTo({ url: '/pages-dark/profile/profile' })
}
</script>

<style scoped>
/* 主容器 - 科技感设计 */
.map-container {
  width: 100vw;
  height: 100vh;
  margin: 0;
  padding: 0;
  position: relative;
  background: linear-gradient(135deg, #0a1a2f 0%, #1a2847 25%, #2d4a6b 50%, #1a2847 75%, #0a1a2f 100%);
  overflow: hidden;
}

/* 地图画布样式 */
.map-canvas {
  width: 100vw;
  height: 100vh;
  position: relative;
  z-index: 2;
  border-radius: 0;
  box-shadow: inset 0 0 100px rgba(0, 0, 0, 0.1);
}

/* 位置选择面板样式 */
.select-location-panel {
  position: fixed;
  top: 20rpx;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  max-width: 600rpx;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.95) 0%, rgba(118, 75, 162, 0.95) 100%);
  backdrop-filter: blur(20rpx);
  border-radius: 24rpx;
  padding: 24rpx;
  box-shadow: 0 8rpx 32rpx rgba(102, 126, 234, 0.3), 0 4rpx 16rpx rgba(0, 0, 0, 0.2);
  z-index: 9999;
  border: 2px solid rgba(255, 255, 255, 0.2);
}

.select-tips {
  color: #fff;
  font-size: 28rpx;
  text-align: center;
  margin-bottom: 20rpx;
  font-weight: 500;
  text-shadow: 0 2rpx 4rpx rgba(0, 0, 0, 0.2);
}

.selected-info {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 12rpx;
  padding: 16rpx;
  margin-bottom: 20rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.selected-text {
  color: #fff;
  font-size: 24rpx;
  font-weight: 500;
}

.selected-coords {
  color: rgba(255, 255, 255, 0.85);
  font-size: 22rpx;
  font-family: monospace;
}

.select-actions {
  display: flex;
  gap: 16rpx;
}

.select-btn {
  flex: 1;
  height: 72rpx;
  border-radius: 12rpx;
  border: none;
  font-size: 28rpx;
  font-weight: 500;
  transition: all 0.3s;
}

.select-btn.cancel {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.select-btn.cancel:active {
  background: rgba(255, 255, 255, 0.15);
  transform: scale(0.98);
}

.select-btn.pick-center {
  background: rgba(255, 200, 87, 0.8);
  color: #333;
}

.select-btn.pick-center:active {
  background: rgba(255, 200, 87, 0.6);
  transform: scale(0.98);
}

.select-btn.confirm {
  background: linear-gradient(135deg, #fff 0%, #f0f0f0 100%);
  color: #667eea;
}

.select-btn.confirm:active {
  background: linear-gradient(135deg, #f0f0f0 0%, #e0e0e0 100%);
  transform: scale(0.98);
}

.select-btn.confirm:disabled {
  background: rgba(255, 255, 255, 0.3);
  color: rgba(255, 255, 255, 0.5);
}

/* 中心标记 */
.center-marker {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 60rpx;
  z-index: 5000;
  pointer-events: none;
}

/* 位置控制按钮 */
.location-control {
  position: fixed;
  right: 30rpx;
  bottom: 200rpx;
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40rpx;
  color: #fff;
  z-index: 9000;
  box-shadow: 0 4rpx 12rpx rgba(102, 126, 234, 0.4);
}

/* 查看位置面板样式 */
.view-location-panel {
  position: fixed;
  bottom: 40rpx;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  max-width: 600rpx;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.95) 0%, rgba(118, 75, 162, 0.95) 100%);
  backdrop-filter: blur(20rpx);
  border-radius: 24rpx;
  padding: 24rpx;
  box-shadow: 0 8rpx 32rpx rgba(102, 126, 234, 0.3), 0 4rpx 16rpx rgba(0, 0, 0, 0.2);
  z-index: 9999;
  border: 2px solid rgba(255, 255, 255, 0.2);
}

.view-location-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
  padding-bottom: 16rpx;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.location-name {
  color: #fff;
  font-size: 32rpx;
  font-weight: 600;
  text-shadow: 0 2rpx 4rpx rgba(0, 0, 0, 0.2);
}

.location-close {
  color: #fff;
  font-size: 40rpx;
  font-weight: 300;
  cursor: pointer;
  width: 48rpx;
  height: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  transition: all 0.3s;
}

.location-close:active {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(0.95);
}

.location-details {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 12rpx;
  padding: 16rpx;
  margin-bottom: 20rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.location-address {
  color: #fff;
  font-size: 26rpx;
  line-height: 1.5;
}

.location-coords {
  color: rgba(255, 255, 255, 0.85);
  font-size: 22rpx;
  font-family: monospace;
}

.location-actions {
  display: flex;
  gap: 16rpx;
}

.location-btn {
  flex: 1;
  height: 72rpx;
  border-radius: 12rpx;
  border: none;
  font-size: 28rpx;
  font-weight: 500;
  transition: all 0.3s;
}

.location-btn.navigate-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
}

.location-btn.navigate-btn:active {
  background: linear-gradient(135deg, #5568d3 0%, #65408b 100%);
  transform: scale(0.98);
}

.location-btn.back-btn {
  background: linear-gradient(135deg, #fff 0%, #f0f0f0 100%);
  color: #667eea;
}

.location-btn.back-btn:active {
  background: linear-gradient(135deg, #f0f0f0 0%, #e0e0e0 100%);
  transform: scale(0.98);
}

/* 右下角新增按钮容器 - 高级UI设计 */
.add-btn-container {
  position: fixed;
  right: 30rpx;
  bottom: 120rpx;
  z-index: 9998;
}

.add-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #6a7cfb 100%);
  color: white;
  padding: 20rpx 32rpx;
  border-radius: 50rpx;
  box-shadow: 
    0 8rpx 32rpx rgba(102, 126, 234, 0.4),
    0 4rpx 16rpx rgba(0, 0, 0, 0.1),
    inset 0 1rpx 0 rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  gap: 12rpx;
  min-width: 200rpx;
  justify-content: center;
  transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  border: 2px solid rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  position: relative;
  overflow: hidden;
}

.add-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
  transition: left 0.6s;
}

.add-btn:active::before {
  left: 100%;
}

.add-btn:active {
  background: linear-gradient(135deg, #5a6cf8 0%, #6b4ba8 50%, #7c3aed 100%);
  transform: scale(0.96) translateY(2rpx);
  box-shadow: 
    0 4rpx 16rpx rgba(102, 126, 234, 0.6),
    0 2rpx 8rpx rgba(0, 0, 0, 0.2),
    inset 0 2rpx 4rpx rgba(0, 0, 0, 0.1);
}

.add-btn-icon {
  font-size: 32rpx;
  font-weight: bold;
  line-height: 1;
  text-shadow: 0 2rpx 4rpx rgba(0, 0, 0, 0.3);
}

.add-btn-text {
  font-size: 28rpx;
  font-weight: 600;
  white-space: nowrap;
  text-shadow: 0 1rpx 2rpx rgba(0, 0, 0, 0.2);
  letter-spacing: 0.5rpx;
}

/* 在小屏设备上的响应式设计 */
@media (max-width: 360px) {
  .add-btn {
    width: 120rpx;
    height: 120rpx;
    border-radius: 50%;
    min-width: auto;
    padding: 0;
  }
  
  .add-btn-text {
    display: none;
  }
  
  .add-btn-icon {
    font-size: 48rpx;
  }
}

/* 底部信息卡 - 玻璃拟态设计 */
.info-card {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: 80rpx;
  width: calc(90vw);
  max-width: 720rpx;
  background: rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(20px) saturate(1.5);
  border-radius: 32rpx;
  box-shadow: 
    0 16rpx 64rpx rgba(0, 0, 0, 0.15),
    0 8rpx 32rpx rgba(0, 0, 0, 0.1),
    inset 0 2rpx 0 rgba(255, 255, 255, 0.2),
    inset 0 0 0 1rpx rgba(255, 255, 255, 0.1);
  padding: 32rpx;
  z-index: 9999;
  border: 1px solid rgba(255, 255, 255, 0.2);
  animation: cardSlideUp 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

@keyframes cardSlideUp {
  from {
    transform: translateX(-50%) translateY(100px);
    opacity: 0;
  }
  to {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
  }
}

.info-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
  padding-bottom: 16rpx;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.info-title { 
  font-weight: 700; 
  font-size: 32rpx; 
  color: #ffffff;
  text-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.3);
  letter-spacing: 0.5rpx;
}

.info-close { 
  font-size: 36rpx; 
  color: rgba(255, 255, 255, 0.8); 
  cursor: pointer;
  transition: all 0.3s ease;
  width: 60rpx;
  height: 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
}

.info-close:active {
  background: rgba(255, 255, 255, 0.2);
  color: #ffffff;
  transform: scale(0.9);
}

.info-body { 
  font-size: 26rpx; 
  color: rgba(255, 255, 255, 0.9); 
  margin-bottom: 24rpx;
  line-height: 1.6;
}

.info-line { 
  display: block; 
  margin-bottom: 8rpx;
  text-shadow: 0 1rpx 3rpx rgba(0, 0, 0, 0.2);
}

.info-actions { 
  display: flex; 
  gap: 16rpx; 
  justify-content: flex-end;
  flex-wrap: wrap;
}

.info-btn { 
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #ffffff; 
  border-radius: 20rpx; 
  padding: 16rpx 28rpx; 
  border: none; 
  font-size: 26rpx;
  font-weight: 600;
  transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  box-shadow: 
    0 4rpx 16rpx rgba(102, 126, 234, 0.3),
    inset 0 1rpx 0 rgba(255, 255, 255, 0.2);
  cursor: pointer;
  position: relative;
  overflow: hidden;
}

.info-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
  transition: left 0.5s;
}

.info-btn:active::before {
  left: 100%;
}

.info-btn:active {
  transform: scale(0.96);
  box-shadow: 
    0 2rpx 8rpx rgba(102, 126, 234, 0.4),
    inset 0 2rpx 4rpx rgba(0, 0, 0, 0.1);
}

.info-btn.danger { 
  background: linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%);
  box-shadow: 
    0 4rpx 16rpx rgba(255, 107, 107, 0.3),
    inset 0 1rpx 0 rgba(255, 255, 255, 0.2);
}

.info-btn.danger:active {
  box-shadow: 
    0 2rpx 8rpx rgba(255, 107, 107, 0.4),
    inset 0 2rpx 4rpx rgba(0, 0, 0, 0.1);
}

/* 底部导航 */
.tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 120rpx;
  background: rgba(15, 15, 35, 0.95);
  backdrop-filter: blur(20px);
  border-top: 1px solid rgba(64, 224, 255, 0.3);
  box-shadow: 
    0 -8rpx 24rpx rgba(0, 0, 0, 0.3),
    0 0 40rpx rgba(64, 224, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: space-around;
  z-index: 100;
}

.tabbar-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.6);
  font-size: 24rpx;
  padding: 16rpx 0;
  transition: all 0.3s ease;
  position: relative;
}

.tabbar-item.active {
  color: #40e0ff;
  font-weight: 600;
  transform: translateY(-4rpx);
}

.tabbar-item.active::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 60rpx;
  height: 6rpx;
  background: linear-gradient(45deg, #40e0ff, #4ecdc4);
  border-radius: 3rpx;
  box-shadow: 0 0 12rpx rgba(64, 224, 255, 0.6);
}

.tabbar-icon {
  font-size: 48rpx;
  margin-bottom: 8rpx;
  filter: drop-shadow(0 0 8px rgba(64, 224, 255, 0.3));
}

.tabbar-item.active .tabbar-icon {
  filter: drop-shadow(0 0 12px rgba(64, 224, 255, 0.8));
  animation: iconGlow 2s ease-in-out infinite;
}

@keyframes iconGlow {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

.tabbar-label {
  font-size: 22rpx;
  letter-spacing: 1rpx;
}

/* App/小程序 原生选择面板样式 (深色) */
.select-location-panel-native {
  position: absolute;
  top: 180rpx;
  left: 30rpx;
  right: 30rpx;
  z-index: 1000;
}

.panel-box-native {
  background-color: rgba(30, 41, 59, 0.95);
  border-radius: 20rpx;
  padding: 30rpx;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.select-tips-native {
  font-size: 32rpx;
  color: #e2e8f0;
  text-align: center;
  margin-bottom: 20rpx;
  font-weight: 500;
}

.selected-coords-native {
  font-size: 24rpx;
  color: #94a3b8;
  text-align: center;
  margin-bottom: 30rpx;
  margin-top: -10rpx;
}

.select-actions-native {
  flex-direction: row;
  justify-content: space-between;
  display: flex;
  margin-top: 10rpx;
}

.btn-native {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 44rpx;
  text-align: center;
  font-size: 30rpx;
  font-weight: 600;
  margin: 0 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.btn-native.cancel {
  background-color: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.btn-native.confirm {
  background-color: #6a7cfb;
  color: #ffffff;
}

.center-pin {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%); /* cover-view 支持 transform */
  /* 如果 transform 不支持，可以用 margin-left/margin-top 负值 */
  width: 60rpx;
  height: 60rpx;
  text-align: center;
  line-height: 60rpx;
  font-size: 60rpx;
  color: #ef4444;
  pointer-events: none;
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>
