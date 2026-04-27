<template>
  <view :class="['edit-profile-container', { 'dark-theme': isDarkTheme }]">
    <!-- 隐藏的 Canvas 用于头像处理 -->
    <canvas id="avatar-canvas" style="display: none;"></canvas>

    <!-- 背景 -->
    <view class="bg-effects">
      <view class="bg-gradient"></view>
    </view>

    <!-- 返回按钮 -->
    <view class="back-btn" @click="goBack">
      <text>←</text>
    </view>

    <!-- 头部 -->
    <view class="edit-header">
      <text class="header-title">编辑个人资料</text>
    </view>

    <!-- 内容 -->
    <view class="edit-content">
      <!-- 头像编辑 -->
      <view class="avatar-section">
        <view class="section-label">头像</view>
        <view class="avatar-wrapper">
          <image :src="getAvatarUrl(formData.avatar || userInfo.avatar || '/static/person.jpeg', baseUrl)" class="avatar-image" mode="aspectFill"></image>
          <view class="avatar-overlay" @click="uploadAvatar">
            <text class="overlay-icon">📷</text>
            <text class="overlay-text">更换头像</text>
          </view>
        </view>
      </view>

      <!-- 表单区域 -->
      <view class="form-section">
        <!-- 用户名 -->
        <view class="form-group">
          <view class="form-label">
            <text class="label-text">用户名</text>
            <text class="label-required">*</text>
          </view>
          <input 
            v-model="formData.username" 
            type="text" 
            placeholder="请输入用户名"
            maxlength="20"
            class="form-input"
            @input="onUsernameInput"
          />
          <view class="input-hint">{{ formData.username?.length || 0 }}/20</view>
        </view>

        <!-- 个人简介 -->
        <view class="form-group">
          <view class="form-label">
            <text class="label-text">个人简介</text>
          </view>
          <textarea 
            v-model="formData.bio" 
            placeholder="请输入个人简介，介绍一下自己吧"
            maxlength="100"
            class="form-textarea"/>
          <view class="input-hint">{{ formData.bio?.length || 0 }}/100</view>
        </view>

        <!-- 联系电话 -->
        <view class="form-group">
          <view class="form-label">
            <text class="label-text">联系电话</text>
          </view>
          <input 
            v-model="formData.phone" 
            type="tel" 
            placeholder="请输入手机号码"
            maxlength="11"
            class="form-input"
          />
        </view>

        <!-- 邮箱 -->
        <view class="form-group">
          <view class="form-label">
            <text class="label-text">邮箱</text>
          </view>
          <input 
            v-model="formData.email" 
            type="email" 
            placeholder="请输入邮箱地址"
            maxlength="40"
            class="form-input"
          />
        </view>

        <!-- 收货地址 -->
        <view class="form-group">
          <view class="form-label">
            <text class="label-text">收货地址</text>
          </view>
          <view class="location-wrapper">
            <input
              v-model="formData.location"
              type="text"
              placeholder="点击定位或直接输入地址"
              class="form-input location-field"
            />
            <view class="location-action" @click="selectLocation">
              <text>📍</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 操作按钮 -->
      <view class="form-section">
        <view class="form-group">
          <view class="form-label">
            <text class="label-text">所属社区</text>
          </view>
          <picker mode="selector" :range="provinceOptions" range-key="name" :value="provinceIndex" @change="onProvinceChange">
            <view class="form-input picker-field">{{ selectedProvinceName || '请选择省份' }}</view>
          </picker>
          <picker mode="selector" :range="cityOptions" range-key="name" :value="cityIndex" @change="onCityChange">
            <view class="form-input picker-field">{{ selectedCityName || '请选择城市' }}</view>
          </picker>
          <picker mode="selector" :range="districtOptions" range-key="name" :value="districtIndex" @change="onDistrictChange">
            <view class="form-input picker-field">{{ selectedDistrictName || '请选择区县' }}</view>
          </picker>
          <picker mode="selector" :range="communityOptions" range-key="name" :value="communityIndex" @change="onCommunityChange">
            <view class="form-input picker-field">{{ selectedCommunityName || '请选择社区' }}</view>
          </picker>
        </view>
      </view>

      <view class="action-buttons">
        <view class="btn-cancel" @click="goBack">取消</view>
        <view class="btn-save" @click="saveProfile" :class="{ loading: isSaving }">
          <text v-if="!isSaving">保存修改</text>
          <text v-else>保存中...</text>
        </view>
      </view>
    </view>

    <!-- H5 地图选点弹窗 -->
    <view v-if="showMapPicker" class="map-picker-overlay" @click.self="closeMapPicker">
      <view class="map-picker-modal">
        <view class="map-picker-header">
          <text class="map-picker-title">选择位置</text>
          <text class="map-picker-close" @click="closeMapPicker">✕</text>
        </view>
        <view class="map-picker-search">
          <input
            v-model="mapSearchQuery"
            type="text"
            placeholder="搜索地址..."
            class="map-search-input"
            @confirm="searchAddress"
          />
          <text class="map-search-btn" @click="searchAddress">搜索</text>
        </view>
        <view class="map-picker-body">
          <view id="map-container" class="map-container"></view>
          <!-- 中心标记 -->
          <view class="map-center-marker">📍</view>
        </view>
        <view class="map-picker-footer">
          <view class="map-selected-addr">
            <text class="map-addr-label">已选：</text>
            <text class="map-addr-text">{{ mapSelectedAddress || '请在地图上点击选择位置' }}</text>
          </view>
          <view class="map-picker-actions">
            <view class="map-btn map-btn-cancel" @click="closeMapPicker">取消</view>
            <view class="map-btn map-btn-confirm" @click="confirmMapLocation">确认</view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import * as userApi from '@/api/user.js'
import { getCommunityTree } from '@/api/community.js'
import { compressImageToBase64, getAvatarUrl, validateAvatarSize } from '@/utils/avatar-handler.js'
import { baseUrl } from '@/api/settings.js'

const isDarkTheme = ref(false)
const userInfo = ref({})
const isSaving = ref(false)
const isLoading = ref(false)
const communityTree = ref([])
const provinceOptions = ref([])
const cityOptions = ref([])
const districtOptions = ref([])
const communityOptions = ref([])
const provinceIndex = ref(0)
const cityIndex = ref(0)
const districtIndex = ref(0)
const communityIndex = ref(0)
const selectedProvinceName = ref('')
const selectedCityName = ref('')
const selectedDistrictName = ref('')
const selectedCommunityName = ref('')
const communitySelectionActive = ref(false)

// H5 地图选点
const showMapPicker = ref(false)
const mapSearchQuery = ref('')
const mapSelectedAddress = ref('')
const mapSelectedLat = ref(null)
const mapSelectedLng = ref(null)
let mapInstance = null
let mapMarker = null

const formData = reactive({
  username: '',
  avatar: '',
  bio: '',
  phone: '',
  email: '',
  location: '',
  provinceCode: '',
  cityCode: '',
  districtCode: '',
  communityCode: ''
})

function extractData(res) {
  return res && Object.prototype.hasOwnProperty.call(res, 'data') ? res.data : res
}

function syncSelectedCommunity() {
  const province = provinceOptions.value[provinceIndex.value] || null
  const city = cityOptions.value[cityIndex.value] || null
  const district = districtOptions.value[districtIndex.value] || null
  const community = communityOptions.value[communityIndex.value] || null
  if (!communitySelectionActive.value) {
    formData.provinceCode = ''
    formData.cityCode = ''
    formData.districtCode = ''
    formData.communityCode = ''
    selectedProvinceName.value = ''
    selectedCityName.value = ''
    selectedDistrictName.value = ''
    selectedCommunityName.value = ''
    return
  }
  formData.provinceCode = province ? province.code : ''
  formData.cityCode = city ? city.code : ''
  formData.districtCode = district ? district.code : ''
  formData.communityCode = community ? community.code : ''
  selectedProvinceName.value = province ? province.name : ''
  selectedCityName.value = city ? city.name : ''
  selectedDistrictName.value = district ? district.name : ''
  selectedCommunityName.value = community ? community.name : ''
}

function rebuildCommunityPickers() {
  const province = provinceOptions.value[provinceIndex.value] || null
  cityOptions.value = province && Array.isArray(province.children) ? province.children : []
  if (cityIndex.value >= cityOptions.value.length) cityIndex.value = 0
  const city = cityOptions.value[cityIndex.value] || null
  districtOptions.value = city && Array.isArray(city.children) ? city.children : []
  if (districtIndex.value >= districtOptions.value.length) districtIndex.value = 0
  const district = districtOptions.value[districtIndex.value] || null
  communityOptions.value = district && Array.isArray(district.children) ? district.children : []
  if (communityIndex.value >= communityOptions.value.length) communityIndex.value = 0
  syncSelectedCommunity()
}

function onProvinceChange(e) {
  communitySelectionActive.value = true
  provinceIndex.value = Number(e.detail.value || 0)
  cityIndex.value = 0
  districtIndex.value = 0
  communityIndex.value = 0
  rebuildCommunityPickers()
}

function onCityChange(e) {
  communitySelectionActive.value = true
  cityIndex.value = Number(e.detail.value || 0)
  districtIndex.value = 0
  communityIndex.value = 0
  rebuildCommunityPickers()
}

function onDistrictChange(e) {
  communitySelectionActive.value = true
  districtIndex.value = Number(e.detail.value || 0)
  communityIndex.value = 0
  rebuildCommunityPickers()
}

function onCommunityChange(e) {
  communitySelectionActive.value = true
  communityIndex.value = Number(e.detail.value || 0)
  syncSelectedCommunity()
}

function applyCommunitySelectionByCode(communityCode) {
  const target = String(communityCode || '').trim()
  if (!target) {
    communitySelectionActive.value = false
    rebuildCommunityPickers()
    return
  }
  for (let p = 0; p < provinceOptions.value.length; p += 1) {
    const province = provinceOptions.value[p]
    const cities = province.children || []
    for (let c = 0; c < cities.length; c += 1) {
      const city = cities[c]
      const districts = city.children || []
      for (let d = 0; d < districts.length; d += 1) {
        const district = districts[d]
        const communities = district.children || []
        const m = communities.findIndex(item => String(item.code || '') === target)
        if (m >= 0) {
          communitySelectionActive.value = true
          provinceIndex.value = p
          cityIndex.value = c
          districtIndex.value = d
          communityIndex.value = m
          rebuildCommunityPickers()
          return
        }
      }
    }
  }
  communitySelectionActive.value = false
  rebuildCommunityPickers()
}

async function loadCommunityTree(currentCommunityCode = '') {
  try {
    const res = await getCommunityTree()
    communityTree.value = extractData(res) || []
    provinceOptions.value = communityTree.value
    applyCommunitySelectionByCode(currentCommunityCode)
  } catch (error) {
    console.error('load community tree failed:', error)
    provinceOptions.value = []
    cityOptions.value = []
    districtOptions.value = []
    communityOptions.value = []
    syncSelectedCommunity()
  }
}

function checkTheme() {
  const theme = uni.getStorageSync('app_theme')
  isDarkTheme.value = theme === 'dark'
}

function goBack() {
  const pages = getCurrentPages()
    if (pages.length > 1) {
      uni.navigateBack()
    } else {
      uni.reLaunch({url: '/pages-nonTheme/settings'})
    }
}

function onUsernameInput() {
  // 只允许字母、数字、中文
  formData.username = formData.username.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '')
}

function uploadAvatar() {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: async (res) => {
      const tempFilePath = res.tempFilePaths[0]
      
      try {
        uni.showLoading({ title: '压缩头像中...' })
        
        // 压缩图片到 64x64 并转换为 Base64
        const base64Avatar = await compressImageToBase64(tempFilePath, 64, 64, 0.8)
        
        // 验证头像大小
        const validation = validateAvatarSize(base64Avatar)
        if (!validation.isValid) {
          uni.hideLoading()
          uni.showToast({
            title: validation.message,
            icon: 'none'
          })
          return
        }
        
        // 更新表单数据
        formData.avatar = base64Avatar
        
        uni.hideLoading()
        uni.showToast({
          title: `头像已更新 (${Math.round(validation.size / 1024)}KB)`,
          icon: 'success'
        })
      } catch (error) {
        uni.hideLoading()
        console.error('头像处理失败:', error)
        uni.showToast({
          title: '头像处理失败，请重试',
          icon: 'none'
        })
      }
    },
    fail: () => {
      uni.showToast({
        title: '选择图片失败',
        icon: 'none'
      })
    }
  })
}

function formatLocationResult(res) {
  const address = res && res.address
  if (typeof address === 'string' && address.trim()) return address.trim()
  if (address && typeof address === 'object') {
    const detail = [
      address.province,
      address.city,
      address.district,
      address.street,
      address.streetNum,
      address.poiName
    ].filter(Boolean).join('')
    if (detail) return detail
  }
  const name = String((res && (res.name || res.addressName)) || '').trim()
  if (name) return name
  if (res && res.latitude && res.longitude) return `${res.latitude},${res.longitude}`
  return ''
}

function fillCurrentLocation() {
  if (typeof uni.getLocation !== 'function') {
    uni.showToast({ title: '当前环境不支持定位，请手动输入', icon: 'none' })
    return
  }
  uni.showLoading({ title: '定位中...' })
  uni.getLocation({
    type: 'gcj02',
    geocode: true,
    success: (res) => {
      const locationText = formatLocationResult(res)
      if (locationText) {
        formData.location = locationText
        uni.showToast({ title: '地址已更新', icon: 'success' })
      } else {
        uni.showToast({ title: '定位成功，请补充详细地址', icon: 'none' })
      }
    },
    fail: (err) => {
      console.warn('获取当前位置失败:', err)
      uni.showToast({ title: '定位失败，请手动输入', icon: 'none' })
    },
    complete: () => {
      uni.hideLoading()
    }
  })
}

function selectLocation() {
  const systemInfo = uni.getSystemInfoSync()
  const uniPlatform = systemInfo.uniPlatform

  // H5环境：打开地图选点弹窗（Leaflet + OpenStreetMap，无需 key）
  if (uniPlatform === 'web') {
    openMapPicker()
    return
  }

  if (uniPlatform === 'app' || uniPlatform === 'app-plus') {
    fillCurrentLocation()
    return
  }

  // 小程序端使用 uni 自带的地图选择
  if (typeof uni.chooseLocation === 'function') {
    uni.chooseLocation({
      success: (res) => {
        formData.location = res.address || res.name || `${res.latitude},${res.longitude}`
      },
      fail: () => {
        uni.showToast({ title: '定位失败，请手动输入', icon: 'none' })
      }
    })
  } else {
    uni.showToast({ title: '当前环境不支持地图选址，请手动输入', icon: 'none' })
  }
}

// ===== H5 地图选点弹窗 =====
function openMapPicker() {
  showMapPicker.value = true
  mapSearchQuery.value = ''
  mapSelectedAddress.value = formData.location || ''
  mapSelectedLat.value = null
  mapSelectedLng.value = null

  // 等待 DOM 渲染完成后初始化地图
  setTimeout(() => {
    initMap()
  }, 300)
}

function closeMapPicker() {
  showMapPicker.value = false
  // 销毁地图实例
  if (mapInstance) {
    mapInstance.remove()
    mapInstance = null
    mapMarker = null
  }
}

function initMap() {
  const containerId = 'map-container'
  // 确保容器存在
  const container = document.getElementById(containerId)
  if (!container) return

  // 如果已有实例先销毁
  if (mapInstance) {
    mapInstance.remove()
    mapInstance = null
    mapMarker = null
  }

  // 动态加载 Leaflet CSS
  if (!document.querySelector('link[href*="leaflet.css"]')) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)
  }

  // 动态加载 Leaflet JS
  if (typeof window.L === 'undefined') {
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => {
      createMap(container)
    }
    document.head.appendChild(script)
  } else {
    createMap(container)
  }
}

function createMap(container) {
  // 默认中心：中国
  const defaultCenter = [35.86, 104.19]
  let initialCenter = defaultCenter
  let initialZoom = 5

  // 如果已有地址坐标，定位到该位置
  if (formData.location) {
    const coords = parseCoordsFromAddress(formData.location)
    if (coords) {
      initialCenter = coords
      initialZoom = 15
    }
  }

  mapInstance = window.L.map(container, {
    center: initialCenter,
    zoom: initialZoom,
    zoomControl: true
  })

  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(mapInstance)

  // 点击地图选点
  mapInstance.on('click', (e) => {
    const { lat, lng } = e.latlng
    placeMarker(lat, lng)
    reverseGeocode(lat, lng)
  })

  // 如果已有地址，尝试搜索并标记
  if (formData.location && !parseCoordsFromAddress(formData.location)) {
    mapSearchQuery.value = formData.location
    setTimeout(() => searchAddress(), 500)
  }
}

function placeMarker(lat, lng) {
  if (mapMarker) {
    mapInstance.removeLayer(mapMarker)
  }
  mapMarker = window.L.marker([lat, lng], { draggable: true })
    .addTo(mapInstance)
    .bindPopup('所选位置')
    .openPopup()

  mapSelectedLat.value = lat
  mapSelectedLng.value = lng

  // 拖拽结束更新
  mapMarker.on('dragend', () => {
    const pos = mapMarker.getLatLng()
    mapSelectedLat.value = pos.lat
    mapSelectedLng.value = pos.lng
    reverseGeocode(pos.lat, pos.lng)
  })
}

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=zh`,
      { headers: { 'User-Agent': 'FenTouXia/1.0' } }
    )
    const data = await res.json()
    mapSelectedAddress.value = data.display_name || `${lat},${lng}`
  } catch {
    mapSelectedAddress.value = `${lat},${lng}`
  }
}

async function searchAddress() {
  const query = mapSearchQuery.value.trim()
  if (!query || !mapInstance) return

  uni.showLoading({ title: '搜索中...' })
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&accept-language=zh`,
      { headers: { 'User-Agent': 'FenTouXia/1.0' } }
    )
    const results = await res.json()
    uni.hideLoading()

    if (results && results.length > 0) {
      const r = results[0]
      const lat = parseFloat(r.lat)
      const lng = parseFloat(r.lon)
      mapInstance.setView([lat, lng], 16)
      placeMarker(lat, lng)
      mapSelectedAddress.value = r.display_name
    } else {
      uni.showToast({ title: '未找到该地址', icon: 'none' })
    }
  } catch {
    uni.hideLoading()
    uni.showToast({ title: '搜索失败，请重试', icon: 'none' })
  }
}

function parseCoordsFromAddress(addr) {
  if (!addr) return null
  const match = addr.match(/([-+]?\d+\.?\d+)\s*,\s*([-+]?\d+\.?\d+)/)
  if (match) {
    return [parseFloat(match[1]), parseFloat(match[2])]
  }
  return null
}

function confirmMapLocation() {
  if (mapSelectedAddress.value) {
    formData.location = mapSelectedAddress.value
  } else if (mapSelectedLat.value && mapSelectedLng.value) {
    formData.location = `${mapSelectedLat.value},${mapSelectedLng.value}`
  }
  closeMapPicker()
  uni.showToast({ title: '地址已更新', icon: 'success' })
}

async function saveProfile() {
  // 验证必填项
  if (!formData.username || formData.username.trim() === '') {
    uni.showToast({
      title: '用户名不能为空',
      icon: 'none'
    })
    return
  }

  if (formData.username.length < 2) {
    uni.showToast({
      title: '用户名至少2个字符',
      icon: 'none'
    })
    return
  }

  isSaving.value = true

  try {
    // 调用 API 保存用户资料
    const payload = {
      username: formData.username,
      avatar: formData.avatar || userInfo.value.avatar,
      bio: formData.bio,
      phone: formData.phone,
      email: formData.email,
      location: formData.location
    }
    if (provinceOptions.value.length && communitySelectionActive.value) {
      payload.provinceCode = formData.provinceCode
      payload.cityCode = formData.cityCode
      payload.districtCode = formData.districtCode
      payload.communityCode = formData.communityCode
    }
    const response = await userApi.updateUserProfile(payload)

    // 更新本地存储的 userInfo
    const updatedUserInfo = {
      ...userInfo.value,
      username: formData.username,
      avatar: formData.avatar || userInfo.value.avatar
    }
    
    // 保存到本地存储
    uni.setStorageSync('userInfo', updatedUserInfo)
    userInfo.value = updatedUserInfo

    uni.showToast({
      title: '保存成功',
      icon: 'success'
    })

    setTimeout(() => {
      goBack()
    }, 500)
  } catch (error) {
    console.error('保存用户资料失败:', error)
    uni.showToast({
      title: error?.msg || '保存失败，请重试',
      icon: 'none'
    })
  } finally {
    isSaving.value = false
  }
}

function loadUserInfo() {
  isLoading.value = true
  userApi.getUserProfile()
    .then(response => {
      // 假设服务器返回的数据结构为: { code: 0, data: {...} }
      const data = response.data || response
      userInfo.value = data
      
      // 更新表单数据
      formData.username = data.username || ''
      formData.avatar = data.avatar || ''
      formData.bio = data.bio || ''
      formData.phone = data.phone || ''
      formData.email = data.email || ''
      formData.location = data.location || ''
      loadCommunityTree(data.communityCode || '')
    })
    .catch(error => {
        console.error('获取用户资料失败:', error)
        uni.showToast({
            title: error?.msg || '加载用户资料失败',
            icon: 'none'
        })
    })
    .finally(() => {
      isLoading.value = false
    })
}

onMounted(() => {
  checkTheme()
  loadUserInfo()
})
</script>

<style scoped>
.edit-profile-container {
  min-height: 100vh;
  background: linear-gradient(180deg, #f0fdf4 0%, #f5f7fa 30%, #f0f9ff 70%, #f5f7fa 100%);
  position: relative;
  overflow: hidden;
  transition: all 0.3s ease;
}

.edit-profile-container.dark-theme {
  background: linear-gradient(135deg, #1a1a3e 0%, #15213a 30%, #1e2a5f 70%, #2d1b4e 100%);
}

.bg-effects {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  pointer-events: none;
}

.bg-gradient {
  width: 100%;
  height: 100%;
  background: inherit;
}

/* 返回按钮 */
.back-btn {
  position: fixed;
  top: 65rpx;
  left: 25rpx;
  width: 50rpx;
  height: 50rpx;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.back-btn:active {
  transform: scale(0.9);
}

.edit-profile-container.dark-theme .back-btn {
  background: rgba(137, 136, 136, 0.503);
  border: 2px solid rgba(255, 255, 255, 0.156);
}

.back-btn text {
  font-size: 32rpx;
  font-weight: bold;
  color: #059669;
}

.edit-profile-container.dark-theme .back-btn text {
  color: #5B8DEE;
}

/* 头部 */
.edit-header {
  position: relative;
  z-index: 10;
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
  padding: 60rpx 30rpx 20rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.1);
  text-align: center;
}

.edit-profile-container.dark-theme .edit-header {
  background: linear-gradient(135deg, #1a1a3e 0%, #16213e 100%);
}

.header-title {
  font-size: 36rpx;
  font-weight: 700;
  color: #fff;
  text-align: center;
}

.edit-profile-container.dark-theme .header-title {
  color: #e0e0e0;
}

/* 编辑内容 */
.edit-content {
  position: relative;
  z-index: 10;
  padding: 0 20rpx 100rpx;
}

/* 头像部分 */
.avatar-section {
  margin-bottom: 40rpx;
}

.section-label {
  font-size: 24rpx;
  font-weight: 600;
  color: #059669;
  margin-bottom: 15rpx;
  padding: 0 5rpx;
}

.edit-profile-container.dark-theme .section-label {
  color: #5B8DEE;
}

.avatar-wrapper {
  position: relative;
  width: 180rpx;
  height: 180rpx;
  margin: 0 auto;
  border-radius: 50%;
  overflow: hidden;
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.15);
}

.avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.avatar-wrapper:active .avatar-overlay {
  opacity: 1;
}

.overlay-icon {
  font-size: 48rpx;
}

.overlay-text {
  font-size: 24rpx;
  color: #fff;
  font-weight: 500;
}

/* 表单区域 */
.form-section {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 20rpx;
  padding: 30rpx;
  margin-bottom: 30rpx;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.08);
}

.edit-profile-container.dark-theme .form-section {
  background: rgba(30, 30, 50, 0.85);
}

.form-group {
  margin-bottom: 10rpx;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-label {
  display: flex;
  align-items: center;
  margin-bottom: 12rpx;
}

.label-text {
  font-size: 28rpx;
  font-weight: 600;
  color: #1f2937;
}

.edit-profile-container.dark-theme .label-text {
  color: #e0e0e0;
}

.label-required {
  color: #ef4444;
  margin-left: 4rpx;
}

.form-input,
.form-textarea {
  width: 100%;
  padding: 16rpx 20rpx;
  background: rgba(255, 255, 255, 0.8);
  border: 2rpx solid rgba(5, 150, 105, 0.2);
  border-radius: 12rpx;
  font-size: 28rpx;
  color: #1f2937;
  transition: all 0.3s ease;
  box-sizing: border-box;
}

.edit-profile-container.dark-theme .form-input,
.edit-profile-container.dark-theme .form-textarea {
  background: rgba(20, 20, 40, 0.6);
  border-color: rgba(91, 141, 238, 0.2);
  color: #e0e0e0;
}

.form-input:focus,
.form-textarea:focus {
  border-color: #059669;
  background: #fff;
  box-shadow: 0 0 0 3rpx rgba(5, 150, 105, 0.1);
}

.edit-profile-container.dark-theme .form-input:focus,
.edit-profile-container.dark-theme .form-textarea:focus {
  border-color: #5B8DEE;
  background: rgba(20, 20, 40, 0.8);
  box-shadow: 0 0 0 3rpx rgba(91, 141, 238, 0.15);
}
.form-input {
  min-height: 70rpx;
  display: block;
  box-sizing: border-box;
}

.picker-field {
  margin-bottom: 12rpx;
  display: flex;
  align-items: center;
}

.form-textarea {
  min-height: 60rpx;
  resize: vertical;
  font-family: inherit;
}

.input-hint {
  font-size: 20rpx;
  color: #9ca3af;
  margin-top: 8rpx;
  text-align: right;
}

.edit-profile-container.dark-theme .input-hint {
  color: #a0a0c0;
}

/* 位置输入 */
.location-wrapper {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.location-field {
  flex: 1;
}

.location-action {
  width: 68rpx;
  height: 68rpx;
  border-radius: 50%;
  background: #059669;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 28rpx;
  box-shadow: 0 4rpx 12rpx rgba(5, 150, 105, 0.3);
}

.location-action:active {
  transform: scale(0.95);
}

.edit-profile-container.dark-theme .location-action {
  background: #5B8DEE;
  box-shadow: 0 4rpx 12rpx rgba(91, 141, 238, 0.4);
}

/* 操作按钮 */
.action-buttons {
  display: flex;
  gap: 15rpx;
  padding: 0 20rpx;
}

.btn-cancel,
.btn-save {
  flex: 1;
  padding: 18rpx 30rpx;
  border-radius: 12rpx;
  font-size: 28rpx;
  font-weight: 600;
  text-align: center;
  transition: all 0.3s ease;
}

.btn-cancel {
  background: rgba(0, 0, 0, 0.05);
  color: #6b7280;
}

.edit-profile-container.dark-theme .btn-cancel {
  background: rgba(91, 141, 238, 0.1);
  color: #b0b0d0;
}

.btn-cancel:active {
  transform: scale(0.98);
}

.btn-save {
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
  color: #fff;
  box-shadow: 0 4rpx 12rpx rgba(5, 150, 105, 0.2);
}

.edit-profile-container.dark-theme .btn-save {
  background: linear-gradient(135deg, #5B8DEE 0%, #4c63d2 100%);
  box-shadow: 0 4rpx 12rpx rgba(91, 141, 238, 0.2);
}

.btn-save:active {
  transform: scale(0.98);
}

.btn-save.loading {
  opacity: 0.8;
}

/* ===== H5 地图选点弹窗 ===== */
.map-picker-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 30rpx;
}

.map-picker-modal {
  width: 100%;
  max-width: 700rpx;
  max-height: 85vh;
  background: #fff;
  border-radius: 24rpx;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, 0.3);
}

.map-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 30rpx;
  border-bottom: 1rpx solid #eee;
}

.map-picker-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #1f2937;
}

.map-picker-close {
  font-size: 36rpx;
  color: #999;
  padding: 10rpx;
}

.map-picker-close:active {
  color: #333;
}

.map-picker-search {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 16rpx 30rpx;
  border-bottom: 1rpx solid #eee;
}

.map-search-input {
  flex: 1;
  height: 64rpx;
  padding: 0 20rpx;
  border: 2rpx solid #ddd;
  border-radius: 12rpx;
  font-size: 26rpx;
  color: #333;
  background: #f9f9f9;
}

.map-search-input:focus {
  border-color: #059669;
  background: #fff;
}

.map-search-btn {
  padding: 12rpx 24rpx;
  background: #059669;
  color: #fff;
  border-radius: 10rpx;
  font-size: 26rpx;
  font-weight: 500;
  white-space: nowrap;
}

.map-search-btn:active {
  opacity: 0.8;
}

.map-picker-body {
  position: relative;
  width: 100%;
  height: 600rpx;
  min-height: 400rpx;
}

.map-container {
  width: 100%;
  height: 100%;
}

.map-center-marker {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -100%);
  font-size: 48rpx;
  z-index: 1000;
  pointer-events: none;
  text-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.3);
}

.map-picker-footer {
  padding: 20rpx 30rpx;
  border-top: 1rpx solid #eee;
  background: #fafafa;
}

.map-selected-addr {
  display: flex;
  align-items: flex-start;
  gap: 8rpx;
  margin-bottom: 16rpx;
}

.map-addr-label {
  font-size: 24rpx;
  color: #666;
  white-space: nowrap;
  margin-top: 2rpx;
}

.map-addr-text {
  font-size: 24rpx;
  color: #333;
  line-height: 1.5;
  word-break: break-all;
}

.map-picker-actions {
  display: flex;
  gap: 16rpx;
}

.map-btn {
  flex: 1;
  padding: 16rpx 0;
  border-radius: 12rpx;
  font-size: 28rpx;
  font-weight: 600;
  text-align: center;
}

.map-btn-cancel {
  background: #f0f0f0;
  color: #666;
}

.map-btn-cancel:active {
  background: #e0e0e0;
}

.map-btn-confirm {
  background: linear-gradient(135deg, #059669, #047857);
  color: #fff;
}

.map-btn-confirm:active {
  opacity: 0.9;
}
</style>
