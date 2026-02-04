<template>
  <view class="map-page">
    <!-- 顶部导航栏 -->
    <view class="map-header" :style="{ paddingTop: (statusBarHeight + 10) + 'px' }">
      <view class="header-decoration">
        <view class="deco-circle c1"></view>
        <view class="deco-circle c2"></view>
        <view class="deco-circle c3"></view>
      </view>
      <view class="header-content">
        <text class="header-title">🗺️ 垃圾桶地图</text>
        <text class="header-subtitle">查找附近的垃圾分类投放点</text>
      </view>
    </view>

    <!-- 地图容器 -->
    <view class="map-container">
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
        @tap="onMapTap"
        @click="onMapTap"
        @regionchange="onRegionChange"
      >
        <!-- App/小程序端控件：必须使用 cover-view 放在 map 内部 -->
        <cover-view v-if="selectMode" class="center-pin">📍</cover-view>
        <cover-view v-if="selectMode" class="location-control" @click="moveToMyLocation">◎</cover-view>
        
        <!-- App/小程序端选择面板 (使用 cover-view) -->
        <cover-view v-if="selectMode" class="select-location-panel-native">
          <cover-view class="panel-box-native">
            <cover-view class="select-tips-native">📍 移动地图选择中心位置</cover-view>
            <cover-view v-if="selectedLocation" class="selected-coords-native">
              {{ selectedLocation.latitude.toFixed(6) }}, {{ selectedLocation.longitude.toFixed(6) }}
            </cover-view>
            <cover-view class="select-actions-native">
              <!-- 使用 cover-view 模拟按钮 -->
              <cover-view class="btn-native cancel" @click="cancelSelect">取消</cover-view>
              <cover-view class="btn-native confirm" @click="confirmSelect">确定</cover-view>
            </cover-view>
          </cover-view>
        </cover-view>
      </map>
    </view>

    <!-- 底部信息卡（H5 与 小程序/APP 都用，非选择模式且非查看模式才显示） -->
    <view v-if="selectedMarker && !selectMode && !viewMode" class="info-card">
      <view class="info-header">
        <view class="info-title-wrapper">
          <view class="info-icon" :class="selectedMarker.type === 'smart' ? 'smart' : 'normal'">
            <text>{{ selectedMarker.type === 'smart' ? '🤖' : '🗑️' }}</text>
          </view>
          <view class="info-title-content">
            <text class="info-title">{{ selectedMarker.title }}</text>
            <text class="info-distance">{{ selectedMarker.distance || '附近' }}</text>
          </view>
        </view>
        <text class="info-close" @click="closeInfo">✕</text>
      </view>
      
      <view class="info-body">
        <text class="info-name">{{ selectedMarker.name }}</text>
        <text class="info-desc" v-if="selectedMarker.desc">{{ selectedMarker.desc }}</text>
      </view>
      
      <view class="info-actions">
        <button class="info-btn primary" @click="goNavigate(selectedMarker)">
          <text class="btn-icon">🧭</text>
          <text>导航</text>
        </button>
        <button class="info-btn secondary" @click="openHistoryImage(selectedMarker)">
          <text class="btn-icon">📷</text>
          <text>查看</text>
        </button>
        <button class="info-btn danger" @click="reportErrorMarker(selectedMarker)">
          <text class="btn-icon">⚠️</text>
          <text>报错</text>
        </button>
      </view>
    </view>
    
    <!-- 位置选择模式：显示选择按钮 (仅H5) -->
    <view v-if="selectMode && isH5" class="select-location-panel" :style="{ top: (statusBarHeight + 50) + 'px' }">
      <view class="select-tips">拖动地图到目标位置，或点击“选取中心点”</view>
      <view v-if="selectedLocation" class="selected-info">
        <text class="selected-text">已选择位置</text>
        <text class="selected-coords">{{ selectedLocation.latitude.toFixed(6) }}, {{ selectedLocation.longitude.toFixed(6) }}</text>
      </view>
      <view class="select-actions">
        <button class="select-btn cancel" @click="cancelSelect">取消</button>
        <button class="select-btn secondary" @click="pickCenterLocation">选取中心点</button>
        <button class="select-btn confirm" @click="confirmSelect" :disabled="!selectedLocation">确定</button>
      </view>
    </view>
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
        <text class="add-btn-text">新增</text>
      </view>
    </view>

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

    <!-- 新增垃圾桶弹窗 -->
    <AddTrashBinModal
      :visible="showAddModal"
      :userLocation="userLocation"
      @close="closeAddModal"
      @success="onAddSuccess"
    />
  </view>
</template>

<script setup>
import { ref, onMounted, computed, getCurrentInstance, nextTick } from 'vue'
import { onReady } from '@dcloudio/uni-app'
import { config } from '../../api/config.js'
import { mapConfig } from '../../api/map-config.js'
import { reportDeviceError, getTrashBinList } from '../../api/map.js'
import AddTrashBinModal from '../../components/AddTrashBinModal.vue'

const isH5 = process.env.UNI_PLATFORM === 'h5'
// 位置选择模式
const selectMode = ref(false)
const selectedLocation = ref(null)

// 查看位置模式（从聊天消息点击进入）
const viewMode = ref(false)
const viewLocationInfo = ref(null)

// 状态栏高度
const statusBarHeight = ref(uni.getSystemInfoSync().statusBarHeight || 0)

// 地图上下文（小程序/APP）
const mapContext = ref(null)
const instance = getCurrentInstance()

// 青岛市中心点坐标
const center = ref({ latitude: 36.067108, longitude: 120.382609 })
const userLocation = ref({ latitude: null, longitude: null, addr: '' })
const userMarker = ref(null)
// 新增垃圾桶弹窗显示状态
const showAddModal = ref(false)
// 垃圾箱点位数据（从后端API获取，不再硬编码）
const trashPoints = ref([])
const selectedMarker = ref(null)

// 小程序/APP markers
const markers = computed(() => {
  const list = trashPoints.value.map(p => ({
    id: p.id,
    latitude: typeof p.latitude === 'number' ? p.latitude : parseFloat(p.latitude),
    longitude: typeof p.longitude === 'number' ? p.longitude : parseFloat(p.longitude),
    title: p.type === 'smart' ? '智能垃圾桶' : '普通垃圾桶',
    iconPath: (p.type === 'smart' ? '/static/smart-marker.png' : '/static/normal-marker.png'),
    width: 42,
    height: 46,
    anchor: { x: 0.5, y: 1 },
    callout: {
      content: p.type === 'smart' ? '智能垃圾桶' : '普通垃圾桶',
      color: '#ffffff',
      bgColor: '#10b981',
      padding: 6,
      borderRadius: 6,
      display: 'BYCLICK'
    }
  }));

  // 选择模式下增加选点标记
  if (selectMode.value && selectedLocation.value) {
    list.push({
      id: 999999,
      latitude: selectedLocation.value.latitude,
      longitude: selectedLocation.value.longitude,
      title: '选择位置',
      iconPath: '/static/smart-marker.png',
      width: 48,
      height: 52,
      anchor: { x: 0.5, y: 1 },
      callout: {
        content: '选中的位置',
        color: '#ffffff',
        bgColor: '#667eea',
        padding: 8,
        borderRadius: 8,
        display: 'ALWAYS'
      }
    });
  }
  
  return list;
})

let tmapInstance = null
let tmapMarkers = []

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
  // 取消时，清除可能存在的 selectedLocation 缓存，防止上一个页面误读
  try {
     uni.removeStorageSync('selectedLocation')
  } catch(e) {}
  uni.navigateBack()
}

function ensureMapContext() {
  if (isH5) return
  if (!mapContext.value) {
    // 再次调整：在 APP 端页面级调用通常不建议传 instance，直接传 ID 查找页面内组件
    mapContext.value = uni.createMapContext('select-map')
  }
}

// 实时记录地图中心点
const currentCenter = ref(null)

// 监听地图视野变化
function onRegionChange(e) {
  // 打印事件详情，确认是否可以直接获取 centerLocation（APP端部分平台支持）
  console.log('Region Change:', e)
  
  if (selectMode.value) {
    // 无论是拖动中还是拖动结束，只要有坐标就更新 selectedLocation
    // 这样用户在任何时候点击"确定"都已经是最新位置
    let loc = null
    
    // 1. 优先从事件中获取
    if (e.detail && e.detail.centerLocation) {
      loc = e.detail.centerLocation
    } 
    // 2. 其次如果是 end 事件，尝试读取 mapContext (通过 updateCenterLocation)
    // 但这里不要阻塞，先直接用事件里的坐标更新最快
    
    if (loc) {
      currentCenter.value = loc
      selectedLocation.value = {
        latitude: loc.latitude,
        longitude: loc.longitude,
        name: '选中的位置',
        address: `${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}`
      }
    }
  }
  
  // 尝试从事件对象直接获取中心点（作为兜底）
  if (e.detail && e.detail.centerLocation) {
    currentCenter.value = e.detail.centerLocation
  }
  
  // 视野变化结束时更新中心点记录
  if (e.type === 'end' || e.type === 'regionchange') {
    updateCenterLocation()
  }
}

function updateCenterLocation() {
  ensureMapContext()
  if (!mapContext.value) return
  
  mapContext.value.getCenterLocation({
    success: (res) => {
      // 增加有效性检查，防止空对象覆盖有效的 cached center
      if (res && res.latitude && res.longitude) {
        currentCenter.value = {
          latitude: res.latitude,
          longitude: res.longitude
        }
        
        // 如果是选择模式，同步更新 selectedLocation
        if (selectMode.value) {
          selectedLocation.value = {
            latitude: res.latitude,
            longitude: res.longitude,
            name: '选中的位置',
            address: `${res.latitude.toFixed(6)}, ${res.longitude.toFixed(6)}`
          }
        }
      }
    },
    fail: (err) => console.log('Update center fail:', err)
  })
}

function pickCenterLocation() {
  if (!selectMode.value || isH5) return
  
  // 1. 优先使用监听到的最新中心点（内存缓存）
  if (currentCenter.value && currentCenter.value.latitude) {
    console.log('Using cached center:', currentCenter.value)
    onMapClick(currentCenter.value.latitude, currentCenter.value.longitude)
    return
  }
  
  // 2. 如果没有监听到，则主动获取
  ensureMapContext()
  if (!mapContext.value) {
    uni.showToast({ title: '地图正在初始化', icon: 'none' })
    return
  }
  
  mapContext.value.getCenterLocation({
    success: (res) => {
      console.log('Active getCenter res:', res)
      if (res && res.latitude !== undefined) {
        onMapClick(res.latitude, res.longitude)
      } else {
        // 如果 API 获取失败，尝试使用页面的 center 属性作为最后的兜底
        if (center.value && center.value.latitude) {
           console.log('Using default center as fallback')
           onMapClick(center.value.latitude, center.value.longitude)
           uni.showToast({ title: '使用默认中心点', icon: 'none' })
        } else {
           uni.showToast({ title: '无法获取坐标', icon: 'none' })
        }
      }
    },
    fail: (err) => {
      console.error('Pick center fail:', err)
      uni.showToast({ title: '获取坐标失败', icon: 'none' })
    }
  })
}

// 定位到当前位置
function moveToMyLocation() {
  ensureMapContext()
  if (mapContext.value) {
    mapContext.value.moveToLocation({
      success: () => {
        console.log('定位命令发送成功')
        // 定位后延迟更新一下中心点
        setTimeout(updateCenterLocation, 1000)
      },
      fail: (err) => {
        console.error('定位失败', err)
        uni.showToast({ title: '定位失败', icon: 'none' })
      }
    })
  }
}

function confirmSelect() {
  console.log('confirmSelect 被触发了')
  console.log('selectedLocation:', selectedLocation.value)
  
  if (!selectedLocation.value) {
    uni.showToast({ title: '请先选择位置', icon: 'none' })
    return
  }
  
  console.log('确认选择位置:', selectedLocation.value)
  
  const locationData = {
    latitude: selectedLocation.value.latitude,
    longitude: selectedLocation.value.longitude,
    name: selectedLocation.value.name || '位置分享',
    address: selectedLocation.value.address || ''
  }
  
  console.log('locationData:', locationData)
  
  // 存储到本地存储，供上一页读取
  uni.setStorageSync('selectedLocation', locationData)
  console.log('已存储位置数据,返回上一页:', locationData)
  
  // APP端同时也尝试通过事件通道（双重保险）
  // #ifndef H5
  try {
    // 增加类型检查，防止 uni.getOpenerEventChannel 不存在导致报错中断
    if (typeof uni.getOpenerEventChannel === 'function') {
      const eventChannel = uni.getOpenerEventChannel()
      if (eventChannel && eventChannel.emit) {
        console.log('发送 EventChannel')
        eventChannel.emit('selectLocation', locationData)
      }
    } else {
        // 如果 uni 上没有，尝试从 currentInstance 获取 (Vue3 特性)
        const instance = getCurrentInstance()
        if (instance && instance.proxy && instance.proxy.getOpenerEventChannel) {
            const eventChannel = instance.proxy.getOpenerEventChannel()
             if (eventChannel && eventChannel.emit) {
                console.log('从 instance 发送 EventChannel')
                eventChannel.emit('selectLocation', locationData)
            }
        }
    }
  } catch (e) {
    console.warn('EventChannel error (ignored):', e)
  }
  // #endif
  
  console.log('开始导航回上一页')
  uni.navigateBack({
    success: () => console.log('导航成功'),
    fail: (err) => console.error('导航失败:', err)
  })
}

// 小程序/APP 地图点击
function onMapTap(e) {
  if (!selectMode.value) return
  
  // 兼容不同平台和事件类型的经纬度获取
  let lat, lng;
  if (e.detail && e.detail.latitude !== undefined) {
    lat = e.detail.latitude;
    lng = e.detail.longitude;
  } else if (e.latitude !== undefined) {
    lat = e.latitude;
    lng = e.longitude;
  }
  
  if (lat !== undefined && lng !== undefined) {
    console.log('地图点击坐标:', lat, lng)
    onMapClick(lat, lng)
  }
}

// 地图点击事件（选择位置）
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
  if (!isH5) {
    nextTick(() => ensureMapContext())
  }
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
    const script = document.createElement('script')
    script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${mapConfig.qqMapKey}`
    script.onerror = () => {
      uni.showToast({ title: '地图加载失败', icon: 'none', duration: 3000 })
    }
    script.onload = () => initTMap()
    document.head.appendChild(script)
  }
  // 如果是查看位置模式，跳过定位和加载垃圾桶列表
  if (viewMode.value) {
    return
  }
  try {
    const loc = await getUserLocationOnce('gcj02')
    if (loc && typeof loc.latitude === 'number') {
      center.value = { latitude: loc.latitude, longitude: loc.longitude }
      userLocation.value = { latitude: loc.latitude, longitude: loc.longitude }
      userMarker.value = {
        id: 'me',
        latitude: loc.latitude,
        longitude: loc.longitude,
        iconPath: '/static/person.png',
        width: 30,
        height: 46,
        anchor: { x: 0.5, y: 1 },
        title: '我的位置'
      }
      if (isH5 && typeof window !== 'undefined' && window.TMap && tmapInstance) {
        tmapInstance.setCenter(new window.TMap.LatLng(loc.latitude, loc.longitude))
        tmapInstance.setZoom && tmapInstance.setZoom(12)
      }
      await loadTrashBinList()
    }
  } catch (err) {
    await loadTrashBinList()
  }
})

onReady(() => {
  if (!isH5) {
    ensureMapContext()
  }
})

async function getUserLocationOnce(coordType = 'gcj02') {
  return new Promise((resolve, reject) => {
    let actualCoordType = coordType
    try {
      const systemInfo = uni.getSystemInfoSync()
      const uniPlatform = systemInfo.uniPlatform
      if (uniPlatform === 'mp-alipay') actualCoordType = null
    } catch (e) {}
    
    const tryGetLocation = (type, fallback = false) => {
      const locationParams = {
        success(res) {
          let latitude = res.latitude
          let longitude = res.longitude
          if (typeof latitude === 'string') latitude = parseFloat(latitude)
          if (typeof longitude === 'string') longitude = parseFloat(longitude)
          
          if (res && typeof latitude === 'number' && typeof longitude === 'number' && 
              !isNaN(latitude) && !isNaN(longitude)) {
            resolve({ latitude, longitude })
          } else {
            if (!fallback && type === 'gcj02') tryGetLocation('wgs84', true)
            else reject(new Error('定位返回数据异常'))
          }
        },
        fail(err) {
          if (!fallback && type === 'gcj02' && err.errMsg && err.errMsg.includes('not support gcj02')) {
            tryGetLocation('wgs84', true)
            return
          }
          if (!fallback && err.errMsg && err.errMsg.includes('暂不支持 type')) {
            tryGetLocation(null, true)
            return
          }
          if (isH5 && typeof navigator !== 'undefined' && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
              () => reject(err || new Error('浏览器定位失败')),
              { enableHighAccuracy: true, timeout: 15000 }
            )
            return
          }
          reject(err || new Error('定位失败'))
        },
        timeout: 15000
      }
      if (type && actualCoordType !== null) locationParams.type = type
      uni.getLocation(locationParams)
    }
    tryGetLocation(actualCoordType)
  })
}

function initTMap() {
  if (!window.TMap && !window.tmap) {
    uni.showToast({ title: '地图初始化失败', icon: 'none', duration: 3000 })
    return
  }
  
  try {
    const map = new window.TMap.Map('container', {
      rotation: 0,
      pitch: 0,
      zoom: 10,
      center: new window.TMap.LatLng(center.value.latitude, center.value.longitude),
      mapStyleId: 'style1'
    })
    
    // 隐藏腾讯地图Logo和版权信息
    const style = document.createElement('style')
    style.innerHTML = `
      .tmap-logo-container,
      .tmap-logo,
      .tmap-copyright-container,
      .tmap-copyright,
      .logo-text,
      img[src*="mapapi.qq.com"],
      div[class*="logo"] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
      }
    `
    document.head.appendChild(style)
    
    // 监听地图点击事件（用于位置选择）
    if (selectMode.value) {
      map.on('click', (evt) => {
        if (evt.latLng) {
          onMapClick(evt.latLng.getLat(), evt.latLng.getLng())
        }
      })
    }
    tmapInstance = map
    initH5Markers()
  } catch (error) {
    uni.showToast({ title: '地图初始化失败', icon: 'none', duration: 3000 })
  }
}

function getH5Icon(type) {
  const color = type === 'smart' ? '#10b981' : '#6b7280'
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='36' height='36' viewBox='0 0 24 24'>
    <path d='M12 2c-1.1 0-2 .9-2 2v1H8c-1.1 0-2 .9-2 2v7c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2h-2V4c0-1.1-.9-2-2-2z' fill='${color}' stroke='#fff' stroke-width='0.5'/>
    <circle cx='12' cy='15.5' r='1.5' fill='#ffffff'/>
  </svg>`
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}

function onH5MarkerClicked(index, point) {
  selectedMarker.value = {
    id: point.id,
    title: point.type === 'smart' ? '智能垃圾桶' : '普通垃圾桶',
    name: point.name,
    type: point.type,
    latitude: point.latitude,
    longitude: point.longitude,
    desc: point.description || '',
    imageUrl: point.image
  }
}

function onMarkerTap(e) {
  const markerId = e && (e.markerId || e.markerId === 0 ? e.markerId : e.detail?.markerId);
  const point = trashPoints.value.find(p => p.id === markerId);
  if (!point) return;
  selectedMarker.value = {
    id: point.id,
    title: point.type === 'smart' ? '智能垃圾桶' : '普通垃圾桶',
    name: point.name,
    type: point.type,
    latitude: point.latitude,
    longitude: point.longitude,
    desc: point.description || '',
    imageUrl: point.image
  };
}

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
function goNavigate(m) {
  if (!m) return
  if (isH5) {
    const url = `https://uri.amap.com/marker?position=${m.longitude},${m.latitude}&name=${encodeURIComponent(m.title)}&src=yourAppName`
    window.open(url, '_blank')
    return
  }
  const latitude = typeof m.latitude === 'number' ? m.latitude : parseFloat(m.latitude)
  const longitude = typeof m.longitude === 'number' ? m.longitude : parseFloat(m.longitude)
  if (isNaN(latitude) || isNaN(longitude)) {
    uni.showToast({ title: '位置信息无效', icon: 'none' })
    return
  }
  uni.openLocation({ latitude, longitude, name: m.title, address: m.desc || '' })
}

function openHistoryImage(m) {
  if (!m || !m.imageUrl) {
    uni.showToast({ title: '没有图片', icon: 'none' })
    return
  }
  uni.previewImage({ urls: [m.imageUrl] })
  selectedMarker.value = null
}

function reportErrorMarker(m) {
  if (!m) return
  if (!isH5) {
    uni.showModal({
      title: '上报错误',
      content: `请输入上报 ${m.title} 的错误信息：`,
      editable: true,
      success(res) {
        if (res.confirm && res.content) callReport(m, res.content);
        else uni.showToast({ title: '上报取消', icon: 'none' });
      }
    });
    return;
  }
  const reason = window.prompt(`上报 ${m.title} 的错误信息：`, '');
  if (reason === null || reason.trim() === '') {
    uni.showToast({ title: '上报取消', icon: 'none' });
    return;
  }
  callReport(m, reason);
}

async function callReport(m, reason = '') {
  try {
    const deviceId = m.deviceId || m.id || `${m.latitude},${m.longitude}`
    await reportDeviceError(deviceId, reason)
    uni.showToast({ title: '上报成功，感谢反馈', icon: 'success' })
    selectedMarker.value = null
  } catch (err) {
    const msg = (err && err.msg) ? err.msg : (err && err.message) ? err.message : '上报失败'
    uni.showToast({ title: msg, icon: 'none' })
  }
}

function openAddModal() {
  showAddModal.value = true
}

function closeAddModal() {
  showAddModal.value = false
}

function onAddSuccess(newTrashBin) {
  let imageUrl = newTrashBin.image || ''
  if (imageUrl && !imageUrl.startsWith('http') && !imageUrl.startsWith('data:')) {
    imageUrl = imageUrl.startsWith('/') ? `${config.baseUrl}${imageUrl}` : `${config.baseUrl}/${imageUrl}`
  } else if (!imageUrl) {
    imageUrl = `${config.baseUrl}/static/smart-bin.png`
  }
  
  const newPoint = {
    id: Date.now(),
    name: newTrashBin.name,
    description: newTrashBin.description,
    latitude: typeof newTrashBin.latitude === 'number' ? newTrashBin.latitude : parseFloat(newTrashBin.latitude),
    longitude: typeof newTrashBin.longitude === 'number' ? newTrashBin.longitude : parseFloat(newTrashBin.longitude),
    image: imageUrl,
    createdAt: new Date().toISOString(),
    type: newTrashBin.type || 'normal'
  }
  
  trashPoints.value.push(newPoint)
  
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
      tmapMarkers.push({ id: newPoint.id, pointData: newPoint, multiMarker: multi })
      if (typeof multi.on === 'function') {
        multi.on('click', () => onH5MarkerClicked(trashPoints.value.length - 1, newPoint))
      }
      tmapInstance.setCenter(new window.TMap.LatLng(newPoint.latitude, newPoint.longitude))
      if (tmapInstance.setZoom) tmapInstance.setZoom(12)
    } catch (e) {}
  }
  
  if (!isH5) center.value = { latitude: newPoint.latitude, longitude: newPoint.longitude }
  uni.showToast({ title: '垃圾桶已提交审核', icon: 'success', duration: 2000 })
}

async function loadTrashBinList() {
  try {
    let latitude = userLocation.value.latitude || 36.0671
    let longitude = userLocation.value.longitude || 120.3826
    
    const result = await getTrashBinList({
      latitude, longitude, radius: 5000, page: 1, pageSize: 100
    });

    if (result && result.code === 0 && result.data && Array.isArray(result.data)) {
      trashPoints.value = result.data.map(item => {
        let imageUrl = item.image || '';
        if (imageUrl && !imageUrl.startsWith('http') && !imageUrl.startsWith('data:')) {
          imageUrl = imageUrl.startsWith('/') ? `${config.baseUrl}${imageUrl}` : `${config.baseUrl}/${imageUrl}`;
        } else if (!imageUrl) {
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
          type: item.type
        };
      });
      
      if (isH5 && tmapInstance) {
        tmapMarkers.forEach(item => {
          try { if (item.multiMarker && typeof item.multiMarker.remove === 'function') item.multiMarker.remove(); } catch (e) {}
        });
        tmapMarkers = [];
        initH5Markers()
      }
    }
  } catch (error) {
    uni.showToast({ title: '加载垃圾桶信息失败', icon: 'none', duration: 2000 })
  }
}

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
      tmapMarkers.push({ id: p.id, pointData: p, multiMarker: multi })
      if (typeof multi.on === 'function') multi.on('click', () => onH5MarkerClicked(i, p))
    } catch (e) {}
  })
}

function goHome() {
  uni.redirectTo({ url: '/pages/home/home' })
}

function goShop() {
  uni.navigateTo({ url: '/pages/shop/shop' })
}

function goProfile() {
  uni.redirectTo({ url: '/pages/profile/profile' })
}
</script>

<style scoped>
/* 页面基础 */
.map-page {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;
}

/* 顶部导航 */
.map-header {
  background: linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%);
  padding: 24rpx 32rpx;
  position: relative;
  overflow: hidden;
}

.header-decoration {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
}

.deco-circle {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
}

.deco-circle.c1 {
  width: 200rpx;
  height: 200rpx;
  top: -80rpx;
  right: -60rpx;
}

.deco-circle.c2 {
  width: 120rpx;
  height: 120rpx;
  bottom: -40rpx;
  left: 20%;
}

.deco-circle.c3 {
  width: 80rpx;
  height: 80rpx;
  top: 20%;
  right: 25%;
  background: rgba(255, 255, 255, 0.15);
}

.header-content {
  position: relative;
  z-index: 1;
}

.header-title {
  display: block;
  font-size: 40rpx;
  font-weight: 700;
  color: #ffffff;
  margin-bottom: 8rpx;
}

.header-subtitle {
  display: block;
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.8);
}

/* 地图容器 */
.map-container {
  flex: 1;
  position: relative;
  overflow: hidden;
  z-index: 1;
}

.center-pin {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -100%);
  font-size: 48rpx;
  text-shadow: 0 6rpx 12rpx rgba(0, 0, 0, 0.25);
  z-index: 10;
  pointer-events: none;
}

.location-control {
  position: absolute;
  right: 32rpx;
  bottom: 350rpx; /* 进一步向上调整 */
  width: 80rpx;
  height: 80rpx;
  background-color: #ffffff; /* 确保背景色 */
  border-radius: 40rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.2);
  z-index: 9000;
  /* cover-view 文字颜色需要显式指定 */
  color: #333333;
  line-height: 80rpx; /* 垂直居中 */
  text-align: center; /* 水平居中 */
}

.map-canvas {
  width: 100%;
  height: 100%;
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

.select-btn.confirm {
  background: linear-gradient(135deg, #fff 0%, #f0f0f0 100%);
  color: #667eea;
}

.select-btn.secondary {
  background: rgba(255, 255, 255, 0.3);
  color: #fff;
}

.select-btn.secondary:active {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(0.98);
}

.select-btn.confirm:active {
  background: linear-gradient(135deg, #f0f0f0 0%, #e0e0e0 100%);
  transform: scale(0.98);
}

.select-btn.confirm:disabled {
  background: rgba(255, 255, 255, 0.3);
  color: rgba(255, 255, 255, 0.5);
}

/* App/小程序 原生选择面板样式 */
.select-location-panel-native {
  position: absolute;
  top: 180rpx; /* 避开顶部栏 */
  left: 30rpx;
  right: 30rpx;
  z-index: 1000;
}

.panel-box-native {
  background-color: #ffffff;
  border-radius: 20rpx;
  padding: 30rpx;
  border: 1px solid #e5e7eb;
}

.select-tips-native {
  font-size: 32rpx;
  color: #374151;
  text-align: center;
  margin-bottom: 20rpx;
  font-weight: 500;
}

.selected-coords-native {
  font-size: 24rpx;
  color: #6b7280;
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
  background-color: #f3f4f6;
  color: #4b5563;
}

.btn-native.confirm {
  background-color: #10b981;
  color: #ffffff;
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
/* 底部信息卡 */
.info-card {
  position: fixed;
  left: 32rpx;
  right: 32rpx;
  bottom: 240rpx;
  background: #ffffff;
  border-radius: 24rpx;
  padding: 32rpx;
  box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.12);
  z-index: 100;
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from { transform: translateY(100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.info-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20rpx;
}

.info-title-wrapper {
  display: flex;
  align-items: center;
  flex: 1;
}

.info-icon {
  width: 72rpx;
  height: 72rpx;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 20rpx;
}

.info-icon.smart {
  background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
}

.info-icon.normal {
  background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
}

.info-icon text {
  font-size: 36rpx;
}

.info-title-content {
  flex: 1;
}

.info-title {
  display: block;
  font-size: 32rpx;
  font-weight: 600;
  color: #1f2937;
}

.info-distance {
  display: block;
  font-size: 22rpx;
  color: #10b981;
  margin-top: 4rpx;
}

.info-close {
  width: 48rpx;
  height: 48rpx;
  background: #f3f4f6;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
  color: #6b7280;
}

.info-body {
  margin-bottom: 24rpx;
  padding-bottom: 20rpx;
  border-bottom: 2rpx solid #f3f4f6;
}

.info-name {
  display: block;
  font-size: 28rpx;
  font-weight: 500;
  color: #1f2937;
  margin-bottom: 8rpx;
}

.info-desc {
  display: block;
  font-size: 24rpx;
  color: #6b7280;
  line-height: 1.5;
}

.info-actions {
  display: flex;
  gap: 16rpx;
}

.info-btn {
  flex: 1;
  height: 72rpx;
  border-radius: 36rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  border: none;
  font-size: 26rpx;
  font-weight: 500;
}

.info-btn.primary {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #ffffff;
}

.info-btn.secondary {
  background: #f3f4f6;
  color: #4b5563;
}

.info-btn.danger {
  background: #fef2f2;
  color: #ef4444;
}

.btn-icon {
  font-size: 28rpx;
}

/* 新增按钮 */
.add-btn-container {
  position: fixed;
  right: 32rpx;
  bottom: 280rpx;
  z-index: 9999;
  pointer-events: auto;
}

.add-btn {
  width: 112rpx;
  height: 112rpx;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 24rpx rgba(16, 185, 129, 0.4);
  transition: all 0.3s ease;
  cursor: pointer;
  pointer-events: auto;
}

.add-btn:active {
  transform: scale(0.95);
}

.add-btn-icon {
  font-size: 40rpx;
  color: #ffffff;
  font-weight: 300;
  line-height: 1;
}

.add-btn-text {
  font-size: 20rpx;
  color: #ffffff;
  margin-top: 4rpx;
}

/* 底部导航 */
.tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 120rpx;
  background: #ffffff;
  border-top: 2rpx solid #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: space-around;
  z-index: 100;
  padding-bottom: env(safe-area-inset-bottom);
}

.tabbar-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16rpx 0;
  position: relative;
  transition: all 0.3s ease;
}

.tabbar-item:active {
  transform: scale(0.92);
}

.tabbar-item.active .tabbar-icon {
  color: #10b981;
  transform: scale(1.15) translateY(-4rpx);
  filter: drop-shadow(0 4rpx 8rpx rgba(16, 185, 129, 0.4));
  animation: iconBounce 0.5s ease;
}

.tabbar-item.active .tabbar-label {
  color: #10b981;
  font-weight: 600;
  transform: scale(1.05);
}

.tabbar-icon {
  font-size: 40rpx;
  margin-bottom: 8rpx;
  color: #9ca3af;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  filter: grayscale(30%);
}

.tabbar-item.active .tabbar-icon {
  filter: grayscale(0%) brightness(1.1);
}

.tabbar-label {
  font-size: 20rpx;
  color: #9ca3af;
  transition: all 0.3s ease;
}

@keyframes iconBounce {
  0% { transform: scale(1) translateY(0); }
  40% { transform: scale(1.2) translateY(-8rpx); }
  70% { transform: scale(1.1) translateY(-2rpx); }
  100% { transform: scale(1.15) translateY(-4rpx); }
}
</style>