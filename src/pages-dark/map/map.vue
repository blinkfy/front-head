<template>
  <view class="map-container" :class="[tabPageClass, { 'nearby-panel-open': showNearbyDisposal && nearbyPanelHeight > 0, 'nearby-panel-closing': nearbyPanelClosing }]" :style="{ '--nearby-panel-height': nearbyPanelHeight + 'px' }">
    <view :animation="tabPageAnimation" class="map-header tab-page-motion" :style="{ paddingTop: (statusBarHeight + 14) + 'px' }">
      <view class="map-header-content">
        <button v-if="selectMode || viewMode" class="map-header-back" aria-label="返回" @click="selectMode ? cancelSelect() : handleBack()">‹</button>
        <ManifestIcon v-else id="nearby_map" class="map-header-icon" />
        <view class="map-header-copy">
          <text class="map-header-title">{{ selectMode ? '地图选点' : viewMode ? '查看位置' : '垃圾桶地图' }}</text>
          <text class="map-header-subtitle">{{ selectMode ? '选择并确认地图中的位置' : viewMode ? '查看地点详情与导航' : '查找附近的垃圾分类投放点' }}</text>
        </view>
      </view>
    </view>
    <view class="map-stage">
    <!-- #ifdef MP-WEIXIN -->
    <view class="map-motion-layer tab-page-motion" :animation="tabPageAnimation">
    <!-- #endif -->
    <!-- H5端用div容器，微信小程序端用<map>组件 -->
    <div v-if="isH5" :id="mapContainerId" class="map-canvas tab-page-motion"></div>
    <map v-else-if="!showAddModal"
      id="select-map"
      class="map-canvas tab-page-motion"
      :latitude="center.latitude"
      :longitude="center.longitude"
      :scale="mapScale"
      :enable-satellite="satellite"
      @updated="onNativeMapUpdated"
      @error="onNativeMapError"
      :markers="markers"
      show-location
      @markertap="onMarkerTap"
      @regionchange="onRegionChange"
    >
      <!-- App/小程序端控件：cover-view -->
      <!-- #ifndef APP-PLUS -->
      <!-- #ifndef MP-WEIXIN -->
      <NearbyDisposalPanel v-if="showNearbyDisposal" :points="nearbyDisposal" @heightchange="nearbyPanelHeight = $event" @closingchange="nearbyPanelClosing = $event" :dark="true" :native="true" @select="selectNearbyDisposal" @navigate="point => goNavigate({ ...point, title: point.name, desc: point.address || point.description })" />
      <!-- #endif -->
      <!-- #endif -->
      <cover-view class="basemap-switch basemap-switch-native basemap-switch-dark" style="top: 16px">
        <cover-view class="basemap-option" :class="{ active: !satellite }" @click.stop="setBasemap(false)">普通</cover-view>
        <cover-view class="basemap-option" :class="{ active: satellite }" @click.stop="setBasemap(true)">{{ basemapLoading ? '加载中' : '卫星' }}</cover-view>
      </cover-view>
      <cover-view v-if="selectMode" class="center-pin">📍</cover-view>
      <cover-view v-if="selectMode" class="location-control" @click="moveToMyLocation"><cover-image :src="getManifestIconPath('map_location')" style="width: 24px; height: 24px;" /></cover-view>
      
      <!-- Native Dark 选择面板 -->
      <cover-view v-if="selectMode" class="select-location-panel-native">
        <cover-view class="panel-box-native">
          <cover-view class="select-tips-native"><cover-image :src="getManifestIconPath('map_location')" style="width: 24px; height: 24px; vertical-align: middle;" /><cover-view>移动地图选择中心位置</cover-view></cover-view>
          <cover-view v-if="selectedLocation" class="selected-coords-native">
            {{ selectedLocation.latitude.toFixed(6) }}, {{ selectedLocation.longitude.toFixed(6) }}
          </cover-view>
          <cover-view class="select-actions-native">
            <cover-view class="btn-native cancel" @click="cancelSelect">取消</cover-view>
            <cover-view class="btn-native confirm" @click="confirmSelect">确定</cover-view>
          </cover-view>
        </cover-view>
      </cover-view>

      <cover-view v-if="nearbyLocationModalVisible && !isH5" class="nearby-location-cover">
        <cover-view class="nearby-location-cover-panel">
          <cover-view class="nearby-location-cover-header">
            <cover-view class="nearby-location-cover-title">选择发送地点</cover-view>
          <cover-image class="nearby-location-cover-close" :src="getManifestIconPath('close')" @click="closeNearbyLocationPicker" />
          </cover-view>
          <cover-view v-if="nearbyLocationLoading" class="nearby-location-cover-state">正在加载附近地点...</cover-view>
          <cover-view v-else>
            <cover-view v-if="nearbyLocationError" class="nearby-location-cover-state">{{ nearbyLocationError }}</cover-view>
            <cover-view
              v-for="(item, index) in visibleNearbyLocationOptions"
              :key="`${item.name}_${item.address}_${index}`"
              class="nearby-location-cover-item"
              @click="selectNearbyLocationOption(item)"
            >
              <cover-view class="nearby-location-cover-name">{{ item.name || '位置分享' }}</cover-view>
              <cover-view class="nearby-location-cover-address">{{ item.address || '无详细地址' }}</cover-view>
            </cover-view>
            <cover-view class="nearby-location-cover-send" @click="sendPendingLocation">直接发送当前点</cover-view>
          </cover-view>
        </cover-view>
      </cover-view>
    </map>
    <!-- #ifdef MP-WEIXIN -->
    </view>
    <!-- #endif -->

    </view>

    <!-- #ifdef H5 -->
    <view v-if="!showAddModal" class="basemap-switch basemap-switch-dark" :style="{ top: (statusBarHeight + (selectMode ? 4 : 132)) + 'px', left: selectMode ? 'auto' : '6px', right: selectMode ? '6px' : 'auto' }" role="group" aria-label="地图类型">
      <button class="basemap-option" :class="{ active: !satellite }" :aria-pressed="!satellite" @click.stop="setBasemap(false)">普通</button>
      <button class="basemap-option" :class="{ active: satellite }" :aria-pressed="satellite" @click.stop="setBasemap(true)">{{ basemapLoading ? '加载中' : '卫星' }}</button>
    </view>
    <!-- #endif -->

    <!-- #ifdef APP-PLUS -->
    <AppNearbyDisposalPanel panel-id="nearby-disposal-dark" :visible="showNearbyDisposal" :points="nearbyDisposal" :dark="true" @heightchange="nearbyPanelHeight = $event" @closingchange="nearbyPanelClosing = $event" @select="selectNearbyDisposal" @navigate="point => goNavigate({ ...point, title: point.name, desc: point.address || point.description })" />
    <!-- #endif -->

    <!-- #ifdef H5 || MP-WEIXIN -->
    <NearbyDisposalPanel v-if="showNearbyDisposal" :points="nearbyDisposal" @heightchange="nearbyPanelHeight = $event" @closingchange="nearbyPanelClosing = $event" :dark="true" @select="selectNearbyDisposal" @navigate="point => goNavigate({ ...point, title: point.name, desc: point.address || point.description })" />
    <!-- #endif -->

    <view v-if="nearbyLocationModalVisible && isH5" class="nearby-location-overlay" @click.self="closeNearbyLocationPicker">
      <view class="nearby-location-panel">
        <view class="nearby-location-header">
          <text class="nearby-location-title">选择发送地点</text>
          <ManifestIcon class="nearby-location-close" id="close" @click="closeNearbyLocationPicker" />
        </view>
        <view class="nearby-location-body">
          <view v-if="nearbyLocationLoading" class="nearby-location-state">正在加载附近地点...</view>
          <view v-else>
            <view v-if="nearbyLocationError" class="nearby-location-state">{{ nearbyLocationError }}</view>
            <scroll-view class="nearby-location-list" scroll-y>
              <view
                v-for="(item, index) in nearbyLocationOptions"
                :key="`${item.name}_${item.address}_${index}`"
                class="nearby-location-item"
                @click="selectNearbyLocationOption(item)"
              >
                <text class="nearby-location-name">{{ item.name || '位置分享' }}</text>
                <text class="nearby-location-address">{{ item.address || '无详细地址' }}</text>
                <text class="nearby-location-coords">{{ Number(item.latitude).toFixed(6) }}, {{ Number(item.longitude).toFixed(6) }}</text>
              </view>
            </scroll-view>
          </view>
        </view>
        <view class="nearby-location-actions">
          <button class="nearby-location-button secondary" @click="sendPendingLocation">直接发送当前点</button>
        </view>
      </view>
    </view>

    <!-- H5端选择面板 -->
    <view v-if="selectMode && isH5" class="select-location-panel" :style="{ top: (statusBarHeight + 94) + 'px' }">
      <view class="select-header">
        <view class="select-icon-wrap">
          <ManifestIcon id="map_location" class="select-header-icon" />
        </view>
        <view class="select-header-text">
          <text class="select-title">地图选点</text>
          <text class="select-subtitle">点按地图落点，或拖动视野后选取中心点</text>
        </view>
      </view>
      <view class="center-marker">📍</view>
      <view class="selected-info" :class="{ 'is-empty': !selectedLocation }">
        <view class="selected-label-row">
          <view class="selected-dot"></view>
          <text class="selected-text">{{ selectedLocation ? '已选坐标' : '待选坐标' }}</text>
        </view>
        <text class="selected-coords">
          {{ selectedLocation ? `${selectedLocation.latitude.toFixed(6)}, ${selectedLocation.longitude.toFixed(6)}` : '请在地图上点击或选取中心点' }}
        </text>
      </view>
      <view class="select-actions">
        <button class="select-btn cancel" @click="cancelSelect">取消</button>
        <button class="select-btn pick-center" @click="pickCenterLocation">选取中心点</button>
        <button class="select-btn confirm" @click="confirmSelect" :disabled="!selectedLocation">确定</button>
      </view>
    </view>

    <!-- 位置选择右下角辅助按钮 (H5) -->
    <view v-if="selectMode && isH5" class="location-control" @click="moveToMyLocation"><ManifestIcon id="map_location" /></view>

    <!-- 查看位置模式：显示位置信息 -->
    <view v-if="viewMode && viewLocationInfo" class="view-location-panel">
      <view class="view-location-header">
        <text class="location-name">{{ viewLocationInfo.name }}</text>
        <ManifestIcon class="location-close" id="close" @click="handleBack" />
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
    <view :animation="tabPageAnimation" v-if="!selectMode && !viewMode && !showAddModal" class="add-btn-container tab-page-motion">
      <view class="add-btn" @click="openAddModal">
        <text class="add-btn-icon">+</text>
        <text class="add-btn-text">新增垃圾桶</text>
      </view>
    </view>

    <!-- 统一底部信息卡（H5 与 小程序/APP 都用，非选择模式且非查看模式才显示） -->
    <view v-if="isMapAdmin && !selectMode && !viewMode" class="admin-map-legend">{{ isH5 ? '灰：未通过 · 蓝：普通桶 · 绿：智能桶 · 橙色提示：有报错' : '灰色：未通过审核 · 橙色提示：有报错' }}</view>
    <view v-if="selectedMarker && !selectMode && !viewMode" class="info-card" :class="{ 'admin-info-card': isMapAdmin }">
      <view class="info-header">
        <text class="info-title">{{ selectedMarker.title }}</text>
        <ManifestIcon class="info-close" id="close" @click="closeInfo" />
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
      <MapBinAdminPanel v-if="isMapAdmin" :bin="selectedMarker" dark @updated="refreshAdminMarker" />
    </view>

    <!-- 垃圾桶问题上报弹窗 -->
    <view v-if="showReportModal" class="report-overlay" @click="closeReportModal">
      <view class="report-dialog" @click.stop>
        <view class="report-header">
          <view class="report-heading-icon"><ManifestIcon id="dark_alert" /></view>
          <view class="report-heading-copy">
            <text class="report-title">反馈点位问题</text>
            <text class="report-subtitle">帮助我们及时核实并更新地图信息</text>
          </view>
          <ManifestIcon id="close" class="report-close" @click="closeReportModal" />
        </view>
        <view class="report-point">
          <ManifestIcon id="normal_bin_marker" class="report-point-icon" />
          <view class="report-point-copy">
            <text class="report-point-label">反馈点位</text>
            <text class="report-point-name">{{ reportTarget?.title || '垃圾桶点位' }}</text>
          </view>
        </view>
        <view class="report-reason-heading">
          <text>问题描述</text><text class="report-required">必填</text>
        </view>
        <textarea
          v-model="reportReason"
          class="report-textarea"
          maxlength="200"
          placeholder="例如：点位已迁移、设备损坏或分类信息有误"
          placeholder-class="report-placeholder"
          :auto-height="false"
        />
        <text class="report-counter">{{ reportReason.length }}/200</text>
        <view class="report-actions">
          <view class="report-cancel" @click="closeReportModal">取消</view>
          <view class="report-submit" :class="{ disabled: !reportReason.trim() || reportSubmitting }" @click="submitReport">
            {{ reportSubmitting ? '提交中…' : '提交反馈' }}
          </view>
        </view>
      </view>
    </view>

    <!-- 新增垃圾桶弹窗 -->
    <AddTrashBinModal
      :visible="showAddModal"
      :dark="true"
      :userLocation="userLocation"
      @close="closeAddModal"
      @success="onAddSuccess"
    />
    
    <!-- 底部导航栏 -->
    <view class="tabbar">
      <view class="tabbar-item" @click="goHome">
        <ManifestIcon class="tabbar-icon" id="home" />
        <text class="tabbar-label">首页</text>
      </view>
      <view class="tabbar-item active">
        <ManifestIcon class="tabbar-icon" id="map_location" />
        <text class="tabbar-label">地图</text>
      </view>
      <view class="tabbar-item" @click="goShop">
        <ManifestIcon class="tabbar-icon" id="store" />
        <text class="tabbar-label">商城</text>
      </view>
      <view class="tabbar-item" @click="goProfile">
        <ManifestIcon class="tabbar-icon" id="user_profile" />
        <text class="tabbar-label">我的</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { getManifestIconPath } from '../../utils/manifest-icons.js'
import { resolveTrashBinImage, previewTrashBinImage } from '../../utils/trash-bin-image'
import { ref, onMounted, computed, getCurrentInstance } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { mapConfig } from '../../api/map-config.js'
import { reportDeviceError, reverseGeocoder, searchPlaces, getTrashBinImage } from '../../api/map.js'
import AddTrashBinModal from '../../components/AddTrashBinModal.vue'
import ManifestIcon from '../../components/ManifestIcon.vue'
import MapBinAdminPanel from '@/components/MapBinAdminPanel.vue'
import NearbyDisposalPanel from '@/components/NearbyDisposalPanel.vue'
// #ifdef APP-PLUS
import AppNearbyDisposalPanel from '@/components/AppNearbyDisposalPanel.vue'
// #endif
import { nearbyDisposalPoints, validDisposalLocation } from '@/utils/nearby-disposal.mjs'
import { isBinLocationPicker } from '@/utils/map-basemap-core.mjs'
import { useMapBasemap } from '@/utils/use-map-basemap'
import { useMapAdminBins, binMapLabel } from '@/utils/map-admin-bins'
import { navigateBottomTab, useTabPageTransition } from '@/utils/tab-page-transition.js'
/*
  如果不想引入 lodash，注释掉上面 import 并在需要时用简单 typeof/Array.isArray 校验
*/

const { isMapAdmin, loadMapBins } = useMapAdminBins()
const { tabPageClass, tabPageAnimation } = useTabPageTransition('pages-dark/map/map')
onShow(() => {
  if (isMapAdmin.value && !selectMode.value && !viewMode.value) loadTrashBinList()
})
const isH5 = process.env.UNI_PLATFORM === 'h5'
const statusBarHeight = ref((uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()).statusBarHeight || 0)

// 位置选择模式
const selectMode = ref(false)
const selectedLocation = ref(null)
const nearbyLocationModalVisible = ref(false)
const nearbyLocationLoading = ref(false)
const nearbyLocationOptions = ref([])
const pendingLocationData = ref(null)
const nearbyLocationError = ref('')
const visibleNearbyLocationOptions = computed(() => nearbyLocationOptions.value.slice(0, 8))

// 查看位置模式（从聊天消息点击进入）
const viewMode = ref(false)
const viewLocationInfo = ref(null)

// 青岛市中心点坐标
const center = ref({ latitude: 36.067108, longitude: 120.382609 })
const userLocation = ref({ latitude: null, longitude: null, addr: '' })
const userMarker = ref(null)

// 新增垃圾桶弹窗显示状态
const showAddModal = ref(false)
const showReportModal = ref(false)
const reportTarget = ref(null)
const reportReason = ref('')
const reportSubmitting = ref(false)

// 垃圾箱点位数据（从后端API获取，不再硬编码）
const trashPoints = ref([])

// 小程序/APP markers — 选择模式下不显示垃圾桶点位
const markers = computed(() => selectMode.value ? [] : trashPoints.value.map(p => ({
  id: p.id,
  latitude: typeof p.latitude === 'number' ? p.latitude : parseFloat(p.latitude),
  longitude: typeof p.longitude === 'number' ? p.longitude : parseFloat(p.longitude),
  title: binMapLabel(p), // 根据类型设置标题
  iconPath: p.adminRecord && !p.review ? '/static/pending-bin-marker.png' : (p.type === 'smart' ? '/static/smart-marker.png' : '/static/normal-marker.png'),
  width: 42,
  height: 46,
  anchor: { x: 0.5, y: 1 }, // 设置锚点，避免图标变形
  callout: {
    content: binMapLabel(p), // 气泡显示类型
    color: '#ffffff',
    bgColor: p.adminRecord && !p.review ? '#6b7280' : p.errorReport?.length ? '#c26912' : '#6a7cfb',
    padding: 6,
    borderRadius: 6,
    display: p.adminRecord && p.errorReport?.length ? 'ALWAYS' : 'BYCLICK' // 点击时显示
  }
})))

// 选中的 marker 数据（用于底部信息卡）
const selectedMarker = ref(null)
const nearbyPanelHeight = ref(0)
const nearbyPanelClosing = ref(false)
const nearbyDisposal = computed(() => nearbyDisposalPoints(trashPoints.value, userLocation.value))
const showNearbyDisposal = computed(() => !selectMode.value && !viewMode.value &&
  !selectedMarker.value && !nearbyLocationModalVisible.value && !showAddModal.value && !showReportModal.value && nearbyDisposal.value.length > 0)

function selectNearbyDisposal(point) {
  center.value = { latitude: point.latitude, longitude: point.longitude }
  if (isH5 && tmapInstance && window.TMap) {
    tmapInstance.setCenter(new window.TMap.LatLng(point.latitude, point.longitude))
    tmapInstance.setZoom?.(16)
  }
  onH5MarkerClicked(0, point)
  selectedMarker.value.title = point.name
}

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
const mapContainerId = `trash-map-${Math.random().toString(36).slice(2)}`
let tmapInstance = null
let tmapMarkers = [] // 存放 H5 创建的辅助 marker（如查看位置标记）
let tmapBinLayer = null // 垃圾桶点位单一 MultiMarker 图层（避免每点一个图层）

// 按视野防抖加载：中心移动超过 500m 或缩放变化时重新拉取点位
let viewportReloadTimer = null
let lastLoadCenter = null
let lastLoadScale = null
let lastLoadBbox = null // 上次加载覆盖的视野矩形，平移时用于增量查询新露出区域
const VIEWPORT_RELOAD_MIN_MOVE = 500

function distanceMeters(a, b) {
  const toRad = d => d * Math.PI / 180
  const dLat = toRad(a.latitude - b.latitude)
  const dLng = toRad(a.longitude - b.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function scheduleViewportReload(centerPoint, scale) {
  if (selectMode.value || viewMode.value) return
  const latitude = Number(centerPoint && centerPoint.latitude)
  const longitude = Number(centerPoint && centerPoint.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return
  const moved = !lastLoadCenter || distanceMeters(lastLoadCenter, { latitude, longitude }) > VIEWPORT_RELOAD_MIN_MOVE
  const zoomChanged = scale != null && (lastLoadScale == null || Math.abs(Number(scale) - Number(lastLoadScale)) > 0.5)
  if (!moved && !zoomChanged) return
  if (viewportReloadTimer) clearTimeout(viewportReloadTimer)
  viewportReloadTimer = setTimeout(() => {
    viewportReloadTimer = null
    loadTrashBinList({ latitude, longitude }, scale)
  }, 300)
}

const MAX_LOAD_ROUNDS = 6 // 全量加载最多轮数（每轮 LOAD_PAGE_SIZE 条）
const INCR_LOAD_ROUNDS = 2 // 增量矩形加载最多轮数
const LOAD_PAGE_SIZE = 50
const MAX_CACHED_POINTS = 1000
const BBOX_SPAN_LIMIT = 0.45 // 单次查询矩形跨度上限（度），比后端 0.5 上限留余量

// 当前视野矩形（经纬度）：H5 用地图 bounds，小程序按中心 + scale 估算半屏
function viewportBbox(latitude, longitude) {
  try {
    if (isH5 && tmapInstance && typeof tmapInstance.getBounds === 'function') {
      const bounds = tmapInstance.getBounds()
      const ne = bounds && typeof bounds.getNorthEast === 'function' ? bounds.getNorthEast() : null
      const sw = bounds && typeof bounds.getSouthWest === 'function' ? bounds.getSouthWest() : null
      if (ne && sw) {
        const toPlain = (p) => ({
          latitude: Number(typeof p.getLat === 'function' ? p.getLat() : p.lat),
          longitude: Number(typeof p.getLng === 'function' ? p.getLng() : p.lng)
        })
        const a = toPlain(ne)
        const b = toPlain(sw)
        const box = {
          minLat: Math.min(a.latitude, b.latitude), maxLat: Math.max(a.latitude, b.latitude),
          minLng: Math.min(a.longitude, b.longitude), maxLng: Math.max(a.longitude, b.longitude)
        }
        if (Number.isFinite(box.minLat) && Number.isFinite(box.maxLat) && Number.isFinite(box.minLng) && Number.isFinite(box.maxLng) && box.maxLat > box.minLat && box.maxLng > box.minLng) {
          return clampBboxSpan(box)
        }
      }
    }
  } catch (e) { /* 忽略，走 scale 估算 */ }
  const scale = Number(mapScale.value) || 12
  const windowWidth = uni.getSystemInfoSync().windowWidth || 375
  const windowHeight = uni.getSystemInfoSync().windowHeight || 667
  const metersPerPixel = 156543.03 * Math.cos((latitude * Math.PI) / 180) / Math.pow(2, scale)
  const latDelta = (metersPerPixel * windowHeight / 2) / 111320
  const lngDelta = (metersPerPixel * windowWidth / 2) / (111320 * Math.max(0.01, Math.cos((latitude * Math.PI) / 180)))
  return clampBboxSpan({
    minLat: latitude - latDelta, maxLat: latitude + latDelta,
    minLng: longitude - lngDelta, maxLng: longitude + lngDelta
  })
}

// 单次查询矩形跨度截断：超大视野只覆盖中心区域，限制单次查询代价
function clampBboxSpan(box) {
  const latHalf = Math.min(box.maxLat - box.minLat, BBOX_SPAN_LIMIT) / 2
  const lngHalf = Math.min(box.maxLng - box.minLng, BBOX_SPAN_LIMIT) / 2
  const latCenter = (box.minLat + box.maxLat) / 2
  const lngCenter = (box.minLng + box.maxLng) / 2
  return {
    minLat: latCenter - latHalf, maxLat: latCenter + latHalf,
    minLng: lngCenter - lngHalf, maxLng: lngCenter + lngHalf
  }
}

// 新旧视野重叠率（交集 / 新视野面积）：比例够高时可只增量加载新露出的区域
function bboxOverlapRatio(a, b) {
  const iLat = Math.min(a.maxLat, b.maxLat) - Math.max(a.minLat, b.minLat)
  const iLng = Math.min(a.maxLng, b.maxLng) - Math.max(a.minLng, b.minLng)
  if (iLat <= 0 || iLng <= 0) return 0
  return (iLat * iLng) / ((a.maxLat - a.minLat) * (a.maxLng - a.minLng))
}

// 新视野减去已加载视野后露出的 L 形区域，拆成最多 2 个矩形；
// 拆不出（新视野已被完全覆盖或形状太复杂）时返回空数组，调用方退回整屏查询
function uncoveredRects(viewport, loaded) {
  const iLatMin = Math.max(viewport.minLat, loaded.minLat)
  const iLatMax = Math.min(viewport.maxLat, loaded.maxLat)
  const iLngMin = Math.max(viewport.minLng, loaded.minLng)
  const iLngMax = Math.min(viewport.maxLng, loaded.maxLng)
  if (iLatMax <= iLatMin || iLngMax <= iLngMin) return []
  const rects = []
  // 左右条带：贯穿新视野整个纬度范围
  if (viewport.minLng < iLngMin) rects.push({ minLat: viewport.minLat, maxLat: viewport.maxLat, minLng: viewport.minLng, maxLng: iLngMin })
  if (viewport.maxLng > iLngMax) rects.push({ minLat: viewport.minLat, maxLat: viewport.maxLat, minLng: iLngMax, maxLng: viewport.maxLng })
  // 上下条带：限制在重叠经度范围内，与左右条带不重叠
  if (viewport.minLat < iLatMin) rects.push({ minLat: viewport.minLat, maxLat: iLatMin, minLng: iLngMin, maxLng: iLngMax })
  if (viewport.maxLat > iLatMax) rects.push({ minLat: iLatMax, maxLat: viewport.maxLat, minLng: iLngMin, maxLng: iLngMax })
  return rects.length >= 1 && rects.length <= 2 ? rects : []
}

// 处理页面参数
const pages = getCurrentPages()
const currentPage = pages[pages.length - 1]
const pageOptions = currentPage?.$page?.options || currentPage?.options || {}
const mapScale = ref(isBinLocationPicker(pageOptions) ? 18 : 12)
const { satellite, basemapLoading, setBasemap, bindH5Map, getSatelliteReference, onNativeMapUpdated, onNativeMapError, onNativeMapRegionChange } = useMapBasemap({ isH5, options: pageOptions, suspended: () => showAddModal.value })

// 检查是否为位置选择模式
if (pageOptions.mode === 'select') {
  selectMode.value = true
  const origin = { latitude: pageOptions.lat, longitude: pageOptions.lng }
  if (validDisposalLocation(origin)) center.value = { latitude: Number(origin.latitude), longitude: Number(origin.longitude) }
  onMapClick(center.value.latitude, center.value.longitude)
}

// 位置选择相关方法
function cancelSelect() {
  uni.removeStorageSync('selectedLocation') // 清理缓存，防止误操作
  uni.navigateBack()
}

function onRegionChange(e) {
  onNativeMapRegionChange(e)
  const detail = e && e.detail ? e.detail : {}
  if (selectMode.value) {
    // 每当区域变化（用户拖动地图）时，更新中心坐标
    if (detail.centerLocation) {
      const loc = detail.centerLocation
      selectedLocation.value = {
        latitude: typeof loc.latitude === 'number' ? loc.latitude : parseFloat(loc.latitude),
        longitude: typeof loc.longitude === 'number' ? loc.longitude : parseFloat(loc.longitude),
        name: '选中的位置',
        address: `${typeof loc.latitude === 'number' ? loc.latitude.toFixed(6) : parseFloat(loc.latitude).toFixed(6)}, ${typeof loc.longitude === 'number' ? loc.longitude.toFixed(6) : parseFloat(loc.longitude).toFixed(6)}`
      }
    }
    return
  }
  // 普通模式：视野变化结束后按视野防抖加载点位
  const loc = detail.centerLocation || detail.center
  if (loc && (e.type === 'end' || detail.type === 'end')) {
    scheduleViewportReload({ latitude: Number(loc.latitude), longitude: Number(loc.longitude) }, detail.scale)
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
  if (!selectMode.value) return

  let lat
  let lng
  if (isH5 && tmapInstance && typeof tmapInstance.getCenter === 'function') {
    const mapCenter = tmapInstance.getCenter()
    if (mapCenter) {
      lat = typeof mapCenter.getLat === 'function' ? mapCenter.getLat() : Number(mapCenter.lat)
      lng = typeof mapCenter.getLng === 'function' ? mapCenter.getLng() : Number(mapCenter.lng)
    }
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    const fallback = (selectedLocation.value && Number.isFinite(Number(selectedLocation.value.latitude)))
      ? selectedLocation.value
      : center.value
    if (fallback && Number.isFinite(Number(fallback.latitude)) && Number.isFinite(Number(fallback.longitude))) {
      lat = Number(fallback.latitude)
      lng = Number(fallback.longitude)
    }
  }
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    onMapClick(lat, lng)
    uni.showToast({ title: '已选取当前视野中心', icon: 'none', duration: 1400 })
  } else {
    uni.showToast({ title: '无法获取中心坐标', icon: 'none' })
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

function extractReverseLocation(res) {
  const data = res && Object.prototype.hasOwnProperty.call(res, 'data') ? res.data : res
  const result = data && data.result ? data.result : data
  const pois = extractReversePois(res)
  const poi = pois[0] || null
  return {
    name: (poi && (poi.title || poi.name)) || (result && result.formatted_addresses && result.formatted_addresses.recommend) || '位置分享',
    address: (poi && poi.address) || (result && result.address) || ''
  }
}

function extractReversePois(res) {
  const data = res && Object.prototype.hasOwnProperty.call(res, 'data') ? res.data : res
  const result = data && data.result ? data.result : data
  return Array.isArray(result && result.pois) ? result.pois : []
}

async function buildSelectedLocationData() {
  const source = selectedLocation.value || {}
  const locationData = {
    latitude: source.latitude,
    longitude: source.longitude,
    name: source.name || '位置分享',
    address: source.address || ''
  }
  const addressIsCoords = /^[-+]?\d+\.?\d+,\s*[-+]?\d+\.?\d+$/.test(String(locationData.address || '').trim())
  if (locationData.name !== '位置分享' && locationData.name !== '选中的位置' && locationData.address && !addressIsCoords) {
    return locationData
  }
  try {
    uni.showLoading({ title: '解析位置...' })
    const resolved = extractReverseLocation(await reverseGeocoder(locationData.latitude, locationData.longitude))
    locationData.name = resolved.name || locationData.name
    locationData.address = resolved.address || locationData.address
  } catch (error) {
    console.warn('resolve selected location failed:', error)
  } finally {
    uni.hideLoading()
  }
  return locationData
}

function normalizePoiLocation(item, fallback) {
  const location = item && item.location ? item.location : {}
  return {
    latitude: Number(location.lat || item.latitude || fallback.latitude),
    longitude: Number(location.lng || item.longitude || fallback.longitude),
    name: (item && (item.title || item.name)) || fallback.name || '位置分享',
    address: (item && item.address) || fallback.address || ''
  }
}

function buildNearbyLocationOptions(baseLocation, places) {
  const options = []
  const seen = new Set()
  const pushUnique = (item) => {
    const key = `${item.name || ''}|${item.address || ''}|${Number(item.latitude).toFixed(6)}|${Number(item.longitude).toFixed(6)}`
    if (seen.has(key)) return
    seen.add(key)
    options.push(item)
  }

  pushUnique(baseLocation)
  ;(Array.isArray(places) ? places : []).forEach((place) => {
    const option = normalizePoiLocation(place, baseLocation)
    if (Number.isFinite(option.latitude) && Number.isFinite(option.longitude)) {
      pushUnique(option)
    }
  })
  return options
}

async function openNearbyLocationPicker(baseLocation) {
  pendingLocationData.value = baseLocation
  nearbyLocationOptions.value = [baseLocation]
  nearbyLocationError.value = ''
  nearbyLocationModalVisible.value = true
  nearbyLocationLoading.value = true

  try {
    const [reverseResult, searchResult] = await Promise.allSettled([
      reverseGeocoder(baseLocation.latitude, baseLocation.longitude),
      searchPlaces('小区', baseLocation.latitude, baseLocation.longitude, 1500)
    ])
    const reversePois = reverseResult.status === 'fulfilled' ? extractReversePois(reverseResult.value) : []
    const searchData = searchResult.status === 'fulfilled' ? searchResult.value : null
    const searchPlacesList = Array.isArray(searchData && searchData.data) ? searchData.data : []
    const places = reversePois.concat(searchPlacesList)
    nearbyLocationOptions.value = buildNearbyLocationOptions(baseLocation, places)
    if (places.length === 0) {
      nearbyLocationError.value = '未找到附近地点，可直接发送当前点'
    }
  } catch (error) {
    console.warn('load nearby locations failed:', error)
    nearbyLocationError.value = '附近地点加载失败，可直接发送当前点'
  } finally {
    nearbyLocationLoading.value = false
  }
}

function closeNearbyLocationPicker() {
  nearbyLocationModalVisible.value = false
}

function emitSelectedLocation(locationData) {
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

function selectNearbyLocationOption(item) {
  emitSelectedLocation(item)
}

function sendPendingLocation() {
  if (pendingLocationData.value) {
    emitSelectedLocation(pendingLocationData.value)
  }
}

async function confirmSelect() {
  console.log('confirmSelect 被触发了')
  console.log('selectedLocation:', selectedLocation.value)
  
  if (!selectedLocation.value) {
    uni.showToast({ title: '请先选择位置', icon: 'none' })
    return
  }
  
  const locationData = await buildSelectedLocationData()
  if (pageOptions.purpose === 'bin' && /^bin-location-[\w-]+$/.test(pageOptions.returnEvent || '')) {
    const reference = getSatelliteReference(locationData, mapContainerId)
    if (reference) locationData.satelliteReference = reference
    uni.$emit(pageOptions.returnEvent, locationData)
    uni.navigateBack()
    return
  }
  await openNearbyLocationPicker(locationData)
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
          src: getH5Icon('selected')
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
    const requestedOrigin = { latitude: options.lat, longitude: options.lng }
    const loc = (options.mode === 'nearby' || (options.mode === 'select' && options.purpose === 'bin')) && validDisposalLocation(requestedOrigin)
      ? { latitude: Number(options.lat), longitude: Number(options.lng) }
      : await getUserLocationOnce('gcj02')
    if (loc && typeof loc.latitude === 'number') {
      // 成功：更新中心与用户标记
      center.value = { latitude: loc.latitude, longitude: loc.longitude }
      if (selectMode.value) onMapClick(loc.latitude, loc.longitude)
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
        tmapInstance.setZoom && tmapInstance.setZoom(mapScale.value)
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
      const deviceInfo = uni.getDeviceInfo ? uni.getDeviceInfo() : uni.getSystemInfoSync()
      const appInfo = uni.getAppBaseInfo ? uni.getAppBaseInfo() : uni.getSystemInfoSync()
      const platform = deviceInfo.platform
      const uniPlatform = appInfo.uniPlatform
      
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
    const map = new window.TMap.Map(mapContainerId, {
      rotation: 0,
      pitch: 0,
      zoom: mapScale.value,
      renderOptions: { preserveDrawingBuffer: pageOptions.purpose === 'bin' && selectMode.value },
      center: new window.TMap.LatLng(center.value.latitude, center.value.longitude)
    })
    
    // 监听地图瓦片错误
    map.on('error', (error) => {
      if (satellite.value) return
      console.error('地图加载错误:', error)
      uni.showToast({ title: '地图数据加载异常', icon: 'none', duration: 3000 })
    })

    // 视野变化后按视野防抖加载点位（中心移动 >500m 或缩放变化时）
    if (!selectMode.value && !viewMode.value) {
      const reloadFromView = () => {
        const c = tmapInstance && typeof tmapInstance.getCenter === 'function' ? tmapInstance.getCenter() : null
        if (!c) return
        scheduleViewportReload({
          latitude: typeof c.getLat === 'function' ? c.getLat() : Number(c.lat),
          longitude: typeof c.getLng === 'function' ? c.getLng() : Number(c.lng)
        }, typeof tmapInstance.getZoom === 'function' ? tmapInstance.getZoom() : null)
      }
      map.on('dragend', reloadFromView)
      map.on('zoom', reloadFromView)
    }
    
    // 监听地图点击事件（用于位置选择）
    if (selectMode.value) {
      map.on('click', (evt) => {
        if (evt.latLng) {
          onMapClick(evt.latLng.getLat(), evt.latLng.getLng())
        }
      })
    }

    tmapInstance = map
    if (selectMode.value) {
      const point = selectedLocation.value || center.value
      onMapClick(point.latitude, point.longitude)
    }
    bindH5Map(map)

    // 初始化所有标记
    initH5Markers()
  } catch (error) {
    console.error('初始化地图时发生错误:', error)
    uni.showToast({ title: '地图初始化失败，请刷新重试', icon: 'none', duration: 3000 })
  }
}

// H5 管理员点位：大头针轮廓、审核状态颜色及报错角标
function getH5Icon(type, pending = false, reported = false) {
  const color = pending ? '#9ca3af' : type === 'selected' ? '#ef4444' : type === 'smart' ? '#10b981' : '#3b82f6'
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='36' height='36' viewBox='0 0 24 24'>
    <path d='M12 23C10 20 3 13.5 3 9a9 9 0 0 1 18 0c0 4.5-7 11-9 14z' fill='${color}' stroke='#fff' stroke-width='1'/>
    <circle cx='12' cy='9' r='3.5' fill='#ffffff'/>
    ${reported ? "<circle cx='18' cy='5' r='4' fill='#c26912' stroke='#fff'/><path d='M18 2.8v2.5m0 1v.8' stroke='#fff' stroke-width='1.3'/>" : ''}
  </svg>`
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}

// H5 点击时的统一处理：设置 selectedMarker 并显示底部卡片 - 使用新API数据结构
function onH5MarkerClicked(index, point) {
  selectedMarker.value = {
    ...point,
    id: point.id,
    title: binMapLabel(point),
    latitude: point.latitude,
    longitude: point.longitude,
    desc: `名称: ${point.name}\n说明: ${point.description || ''}`,
    imageUrl: point.image
  }
}

// 小程序/APP：点击 marker 的处理（map 组件触发 markertap） - 使用新API数据结构
function onMarkerTap(e) {
  const markerId = e && (e.markerId || e.markerId === 0 ? e.markerId : e.detail?.markerId);
  const point = trashPoints.value.find(p => String(p.id) === String(markerId));
  if (!point) return;

  selectedMarker.value = {
    ...point,
    id: point.id,
    title: binMapLabel(point), // 显示类型作为标题
    latitude: point.latitude,
    longitude: point.longitude,
    desc: `名称: ${point.name}\n说明: ${point.description || ''}`, // 名称放到详细信息中
    imageUrl: point.image
  };
}

// 关闭信息卡
async function refreshAdminMarker(id) {
  await loadTrashBinList()
  const point = trashPoints.value.find(p => String(p.id) === String(id))
  if (point) onH5MarkerClicked(0, point)
  else closeInfo()
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
const imagePreviewLoading = ref(false)
async function openHistoryImage(m) {
  if (imagePreviewLoading.value) return
  imagePreviewLoading.value = true
  try {
    let value = m && m.imageUrl
    if (!value && m && m.hasImage && m.id !== undefined) {
      // 列表只带图片标识，按需拉取完整图片
      const result = await getTrashBinImage(m.id)
      if (result?.code === 0 && result.data?.image) value = result.data.image
    }
    if (!value) {
      uni.showToast({ title: '没有图片', icon: 'none' })
      return
    }
    await previewTrashBinImage(value)
    if (selectedMarker.value === m) selectedMarker.value = null
  } catch (error) {
    console.warn('[map-image-preview]', { stage: error?.stage, code: error?.code, detail: error?.detail || error?.errMsg || error?.message })
    uni.showToast({ title: error?.message || error?.errMsg || '图片加载失败，请重试', icon: 'none' })
  } finally {
    imagePreviewLoading.value = false
  }
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
  
  // H5: 重建单一标记图层（点位已从 trashPoints 移除）
  if (isH5 && tmapInstance) {
    renderH5BinMarkers()
  }

  // 关闭 info 卡
  selectedMarker.value = null
  uni.showToast({ title: '删除成功', icon: 'success' })
}

// 用户上报垃圾桶信息错误（报错按钮）
function reportErrorMarker(m) {
  if (!m) return
  reportTarget.value = m
  reportReason.value = ''
  showReportModal.value = true
}

function closeReportModal() {
  if (reportSubmitting.value) return
  showReportModal.value = false
  reportTarget.value = null
  reportReason.value = ''
}

function submitReport() {
  const reason = reportReason.value.trim()
  if (!reason || reportSubmitting.value || !reportTarget.value) return
  callReport(reportTarget.value, reason)
}

async function callReport(m, reason = '') {
  reportSubmitting.value = true
  try {
    // 优先使用 deviceId 字段，否则发送经纬度作为标识
    const deviceId = m.deviceId || m.id || `${m.latitude},${m.longitude}`
    await reportDeviceError(deviceId, reason)
    uni.showToast({ title: '上报成功，感谢反馈', icon: 'success' })
    if (isMapAdmin.value) loadTrashBinList()
    selectedMarker.value = null
    showReportModal.value = false
    reportTarget.value = null
    reportReason.value = ''
  } catch (err) {
    console.error('report error failed', err)
    const msg = (err && err.msg) ? err.msg : (err && err.message) ? err.message : '上报失败'
    uni.showToast({ title: msg, icon: 'none' })
  } finally {
    reportSubmitting.value = false
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
function onAddSuccess() {
  if (isMapAdmin.value) loadTrashBinList()
  uni.showToast({ title: '已提交，审核通过后展示并奖励积分', icon: 'none', duration: 2500 })
}

async function loadTrashBinList(centerOverride, scaleOverride) {
  try {
    let latitude, longitude;
    const override = centerOverride && Number.isFinite(Number(centerOverride.latitude)) && Number.isFinite(Number(centerOverride.longitude))
      ? centerOverride : null;
    if (override) {
      latitude = override.latitude;
      longitude = override.longitude;
    } else if(userLocation.value.latitude && userLocation.value.longitude){
      latitude=userLocation.value.latitude;
      longitude=userLocation.value.longitude;
    }else{
      latitude=36.0671;
      longitude=120.3826;
    }
    if (latitude && longitude) {
      // 记录本次加载的视野，供拖动/缩放时判断是否需要重新加载
      lastLoadCenter = { latitude: Number(latitude), longitude: Number(longitude) };
      const scale = Number(
        scaleOverride != null
          ? scaleOverride
          : (isH5 && tmapInstance && typeof tmapInstance.getZoom === 'function' ? tmapInstance.getZoom() : mapScale.value)
      ) || null;
      const viewport = viewportBbox(latitude, longitude);
      // 平移（缩放不变、新旧视野重叠 ≥50%）只增量加载新露出的区域（≤2 个矩形），重叠区不重查；缩放变化或重叠不足则全量
      const incremental = Boolean(lastLoadBbox) && scale != null && lastLoadScale != null
        && Math.abs(scale - lastLoadScale) <= 0.5
        && bboxOverlapRatio(viewport, lastLoadBbox) >= 0.5;
      const newRects = incremental ? uncoveredRects(viewport, lastLoadBbox) : [];
      const queries = newRects.length
        ? newRects.map((rect) => ({ rect, rounds: INCR_LOAD_ROUNDS }))
        : [{ rect: viewport, rounds: MAX_LOAD_ROUNDS }];
      const fetched = [];
      for (const { rect, rounds } of queries) {
        // 每轮一页分批拉取；页未拉满说明密度低，该矩形即停
        for (let round = 1; round <= rounds; round++) {
          const result = await loadMapBins({
            minLat: rect.minLat,
            maxLat: rect.maxLat,
            minLng: rect.minLng,
            maxLng: rect.maxLng,
            page: round,
            pageSize: LOAD_PAGE_SIZE
          });
          if (!result || result.code !== 0 || !Array.isArray(result.data)) {
            console.warn('获取垃圾桶列表响应格式异常:', result);
            break;
          }
          fetched.push(...result.data);
          if (result.data.length < LOAD_PAGE_SIZE) break; // 密度低：范围内已取完
        }
      }
      lastLoadBbox = viewport;
      if (scale != null) lastLoadScale = scale;

      {
        // 按 id 合并已有点位：地图上已加载的点位不再消失，新数据覆盖同 id 旧数据
        const merged = new Map(trashPoints.value.map(p => [String(p.id), p]));
        fetched.forEach(item => {
          const imageUrl = item.hasImage === true && !(item.image || item.imagePath)
            ? ''
            : resolveTrashBinImage(item.image || item.imagePath, item.mapType || 'waste_basket');
          merged.set(String(item.id), {
            ...item,
            id: item.id,
            name: item.name,
            description: item.description,
            latitude: typeof item.latitude === 'number' ? item.latitude : parseFloat(item.latitude),
            longitude: typeof item.longitude === 'number' ? item.longitude : parseFloat(item.longitude),
            image: imageUrl,
            createdAt: item.createdAt,
            type: item.type // 新增 type 属性
          });
        });
        let mergedList = Array.from(merged.values());
        if (mergedList.length > MAX_CACHED_POINTS) {
          // 内存上限：超出时淘汰离当前视野中心最远的点位，优先保留视野内的
          mergedList.sort((a, b) => distanceMeters(a, { latitude, longitude }) - distanceMeters(b, { latitude, longitude }));
          mergedList = mergedList.slice(0, MAX_CACHED_POINTS);
        }
        trashPoints.value = mergedList;

        console.log(`成功加载 ${trashPoints.value.length} 个垃圾桶标记`)

        // 如果是H5，重建单一标记图层
        if (isH5 && tmapInstance) {
          initH5Markers()
        }
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
  if (selectMode.value) return
  
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
  
  // 正常模式：单一 MultiMarker 图层承载所有垃圾桶点位
  renderH5BinMarkers()
}

// H5 端垃圾桶点位：单一 MultiMarker 实例 + 多状态样式，避免每点创建一个图层
function renderH5BinMarkers() {
  if (!isH5 || !tmapInstance || !window.TMap) return
  if (selectMode.value || (viewMode.value && viewLocationInfo.value)) return
  // 清除旧图层
  if (tmapBinLayer) {
    try {
      if (typeof tmapBinLayer.setMap === 'function') tmapBinLayer.setMap(null)
      else if (typeof tmapBinLayer.destroy === 'function') tmapBinLayer.destroy()
    } catch (e) {
      console.warn('移除旧标记图层失败:', e)
    }
    tmapBinLayer = null
  }
  const styles = {}
  const geometries = []
  trashPoints.value.forEach((p) => {
    const pending = isMapAdmin.value && p.adminRecord && !p.review
    const reported = isMapAdmin.value && p.adminRecord && p.errorReport?.length > 0
    const styleKey = `${p.type === 'smart' ? 'smart' : 'normal'}-${pending ? 'pending' : 'ok'}-${reported ? 'reported' : 'plain'}`
    if (!styles[styleKey]) {
      styles[styleKey] = new window.TMap.MarkerStyle({
        width: 36, height: 36, anchor: { x: 18, y: 35 },
        src: getH5Icon(p.type, pending, reported)
      })
    }
    geometries.push({
      id: 'trash-geo-' + p.id,
      styleId: styleKey,
      position: new window.TMap.LatLng(p.latitude, p.longitude),
      title: isMapAdmin.value ? binMapLabel(p) : (p.type === 'smart' ? '智能垃圾桶' : '普通垃圾桶')
    })
  })
  if (!geometries.length) return
  try {
    tmapBinLayer = new window.TMap.MultiMarker({
      id: 'trash-bins',
      map: tmapInstance,
      styles,
      geometries
    })
    if (typeof tmapBinLayer.on === 'function') {
      tmapBinLayer.on('click', (evt) => {
        // GeometryOverlayEvent：点位数据在 evt.geometry（PointGeometry），几何 id 为 evt.geometry.id
        const gid = evt && evt.geometry ? evt.geometry.id : null
        const point = trashPoints.value.find(p => 'trash-geo-' + p.id === gid)
        if (point) onH5MarkerClicked(0, point)
      })
    }
  } catch (e) {
    console.warn('创建垃圾桶标记图层失败', e)
  }
}
function goHome() {
  navigateBottomTab('map', 'home', '/pages-dark/home/home')
}

function goShop() {
  navigateBottomTab('map', 'shop', '/pages-dark/shop/shop', 'navigateTo')
}

function goProfile() {
  navigateBottomTab('map', 'profile', '/pages-dark/profile/profile')
}
</script>

<style scoped>
@import '../../styles/map-basemap.css';
/* 主容器 - 科技感设计 */
.map-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  position: relative;
  background: linear-gradient(135deg, #0a1a2f 0%, #1a2847 25%, #2d4a6b 50%, #1a2847 75%, #0a1a2f 100%);
  overflow: hidden;
}

.map-header {
  flex-shrink: 0;
  position: relative;
  z-index: 10;
  padding: 14px 20px;
  background: linear-gradient(120deg, #102c3a, #15344c 60%, #1c3658);
  border-bottom: 1px solid rgba(64, 224, 255, .14);
}
.map-header-content { display: flex; align-items: center; gap: 10px; min-height: 46px; }
.map-header-copy { flex: 1; min-width: 0; }
.map-header-title { display: block; color: #edf9ff; font-size: 22px; font-weight: 700; line-height: 28px; }
.map-header-subtitle { display: block; color: #9fbcc9; font-size: 12px; line-height: 18px; margin-top: 3px; }
.map-header-icon { width: 28px; height: 28px; flex-shrink: 0; }
.map-header-back { width: 32px; height: 36px; padding: 0; margin: 0; line-height: 32px; font-size: 34px; color: #d8f6ff; background: rgba(255, 255, 255, .07); border-radius: 10px; flex-shrink: 0; }
.map-header-back::after { border: 0; }
.map-stage { flex: 1; min-height: 0; position: relative; overflow: hidden; }
/* #ifdef MP-WEIXIN */
.map-header { padding-right: 100px; }
/* #endif */

/* #ifdef MP-WEIXIN */
.map-motion-layer {
  width: 100%;
  height: 100%;
  position: relative;
  z-index: 2;
}
/* #endif */

/* 地图画布样式 */
.map-canvas {
  width: 100%;
  height: 100%;
  position: relative;
  z-index: 2;
  border-radius: 0;
  box-shadow: inset 0 0 100px rgba(0, 0, 0, 0.1);
}

/* 位置选择面板样式 */
.select-location-panel {
  position: fixed;
  top: 24rpx;
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - 48rpx);
  max-width: 680rpx;
  background: rgba(15, 23, 42, 0.94);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border-radius: 24rpx;
  padding: 24rpx 26rpx;
  box-shadow: 0 14rpx 40rpx rgba(0, 0, 0, 0.42), 0 2rpx 10rpx rgba(0, 0, 0, 0.25);
  z-index: 9999;
  border: 1px solid rgba(148, 163, 184, 0.2);
  box-sizing: border-box;
}

.select-header {
  display: flex;
  align-items: center;
  gap: 18rpx;
  margin-bottom: 18rpx;
}

.select-icon-wrap {
  width: 64rpx;
  height: 64rpx;
  border-radius: 16rpx;
  background: rgba(16, 185, 129, 0.16);
  color: #34d399;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 32rpx;
}

.select-header-text {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  min-width: 0;
  flex: 1;
}

.select-title {
  color: #f8fafc;
  font-size: 28rpx;
  font-weight: 600;
  line-height: 1.3;
}

.select-subtitle {
  color: #94a3b8;
  font-size: 22rpx;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.selected-info {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.28);
  border-radius: 14rpx;
  padding: 14rpx 18rpx;
  margin-bottom: 20rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.selected-info.is-empty {
  background: rgba(30, 41, 59, 0.72);
  border-color: rgba(148, 163, 184, 0.16);
}

.selected-label-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
  flex-shrink: 0;
}

.selected-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 0 4rpx rgba(16, 185, 129, 0.22);
}

.selected-info.is-empty .selected-dot {
  background: #64748b;
  box-shadow: none;
}

.selected-text {
  color: #a7f3d0;
  font-size: 24rpx;
  font-weight: 600;
}

.selected-info.is-empty .selected-text {
  color: #94a3b8;
}

.selected-coords {
  color: #6ee7b7;
  font-size: 23rpx;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-weight: 500;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selected-info.is-empty .selected-coords {
  color: #64748b;
  font-family: inherit;
  font-size: 22rpx;
  font-weight: 400;
}

.select-actions {
  display: flex;
  align-items: center;
  gap: 14rpx;
}

.select-btn {
  flex: 1;
  height: 72rpx;
  line-height: 72rpx;
  padding: 0 16rpx;
  border-radius: 14rpx;
  border: none;
  font-size: 26rpx;
  font-weight: 600;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.select-btn::after {
  border: none;
}

.select-btn.cancel {
  flex: 0.9;
  background: rgba(51, 65, 85, 0.85);
  color: #cbd5e1;
}

.select-btn.cancel:active {
  background: rgba(71, 85, 105, 0.9);
  transform: scale(0.98);
}

.select-btn.pick-center {
  flex: 1.45;
  background: rgba(16, 185, 129, 0.14);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.35);
}

.select-btn.pick-center:active {
  background: rgba(16, 185, 129, 0.24);
  transform: scale(0.98);
}

.select-btn.confirm {
  flex: 1.05;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #ffffff;
  box-shadow: 0 4rpx 12rpx rgba(16, 185, 129, 0.28);
}

.select-btn.confirm:active {
  opacity: 0.92;
  transform: scale(0.98);
}

.select-btn.confirm:disabled,
.select-btn.confirm[disabled] {
  background: rgba(51, 65, 85, 0.65);
  color: rgba(148, 163, 184, 0.45);
  box-shadow: none;
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
.admin-map-legend { position: fixed; top: 180rpx; left: 24rpx; z-index: 50; padding: 10rpx 18rpx; border-radius: 12rpx; background: rgba(255,255,255,.92); color: #374151; font-size: 22rpx; pointer-events: none; }
.info-card.admin-info-card { bottom: calc(140rpx + env(safe-area-inset-bottom)); max-height: 60vh; overflow-y: auto; }
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
  font-size: 40rpx;
  margin-bottom: 8rpx;
  opacity: 0.6;
  filter: saturate(0.7) drop-shadow(0 0 8px rgba(64, 224, 255, 0.3));
}

.tabbar-item.active .tabbar-icon {
  opacity: 1;
  filter: saturate(1) drop-shadow(0 0 12px rgba(64, 224, 255, 0.8));
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

.nearby-location-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: flex-end;
}

.nearby-location-panel {
  width: 100%;
  max-height: 72vh;
  background: #111827;
  border-radius: 24rpx 24rpx 0 0;
  overflow: hidden;
  border-top: 1rpx solid rgba(255, 255, 255, 0.12);
}

.nearby-location-header,
.nearby-location-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28rpx 32rpx;
  border-bottom: 1rpx solid rgba(255, 255, 255, 0.1);
}

.nearby-location-actions {
  border-top: 1rpx solid rgba(255, 255, 255, 0.1);
  border-bottom: 0;
}

.nearby-location-title {
  font-size: 34rpx;
  color: #f8fafc;
  font-weight: 700;
}

.nearby-location-close {
  width: 56rpx;
  height: 56rpx;
  line-height: 56rpx;
  text-align: center;
  color: #94a3b8;
  font-size: 44rpx;
}

.nearby-location-body {
  max-height: 52vh;
}

.nearby-location-list {
  max-height: 52vh;
}

.nearby-location-state {
  padding: 40rpx 32rpx;
  color: #94a3b8;
  font-size: 28rpx;
}

.nearby-location-item {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding: 24rpx 32rpx;
  border-bottom: 1rpx solid rgba(255, 255, 255, 0.08);
}

.nearby-location-item:active {
  background: rgba(255, 255, 255, 0.08);
}

.nearby-location-name {
  color: #f8fafc;
  font-size: 30rpx;
  font-weight: 600;
}

.nearby-location-address,
.nearby-location-coords {
  color: #94a3b8;
  font-size: 24rpx;
  line-height: 1.4;
}

.nearby-location-button {
  width: 100%;
  height: 80rpx;
  line-height: 80rpx;
  border-radius: 40rpx;
  font-size: 28rpx;
  border: 0;
}

.nearby-location-button.secondary {
  background: rgba(64, 224, 255, 0.14);
  color: #67e8f9;
}

.nearby-location-cover {
  position: absolute;
  left: 24rpx;
  right: 24rpx;
  bottom: 40rpx;
  z-index: 2000;
}

.nearby-location-cover-panel {
  background-color: rgba(15, 23, 42, 0.96);
  border-radius: 24rpx;
  padding: 24rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.12);
}

.nearby-location-cover-header {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
}

.nearby-location-cover-title {
  color: #f8fafc;
  font-size: 32rpx;
  font-weight: 700;
}

.nearby-location-cover-close {
  width: 56rpx;
  height: 56rpx;
  line-height: 56rpx;
  text-align: center;
  color: #94a3b8;
  font-size: 44rpx;
}

.nearby-location-cover-state {
  color: #94a3b8;
  font-size: 26rpx;
  padding: 16rpx 0;
}

.nearby-location-cover-item {
  padding: 18rpx 0;
  border-bottom: 1rpx solid rgba(255, 255, 255, 0.1);
}

.nearby-location-cover-name {
  color: #f8fafc;
  font-size: 28rpx;
  font-weight: 600;
  line-height: 1.35;
}

.nearby-location-cover-address {
  color: #94a3b8;
  font-size: 23rpx;
  line-height: 1.35;
  margin-top: 6rpx;
}

.nearby-location-cover-send {
  margin-top: 18rpx;
  height: 72rpx;
  line-height: 72rpx;
  text-align: center;
  color: #67e8f9;
  background-color: rgba(64, 224, 255, 0.14);
  border-radius: 36rpx;
  font-size: 28rpx;
  font-weight: 600;
}
.report-overlay {
  position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 12000; display: flex; align-items: center; justify-content: center;
  padding: 32rpx; background: rgba(2, 8, 23, 0.76); backdrop-filter: blur(10px);
}
.report-dialog {
  width: 620rpx; max-width: calc(100vw - 64rpx); padding: 32rpx; border-radius: 28rpx;
  background: linear-gradient(145deg, #10243c, #091626); border: 1rpx solid rgba(148, 190, 220, 0.18);
  box-shadow: 0 24rpx 72rpx rgba(0, 0, 0, 0.5);
}
.report-header, .report-point, .report-actions { display: flex; align-items: center; }
.report-header { gap: 18rpx; margin-bottom: 28rpx; }
.report-heading-icon {
  width: 76rpx; height: 76rpx; flex: 0 0 76rpx; border-radius: 22rpx; display: flex;
  align-items: center; justify-content: center; color: #ff8585; background: rgba(255, 100, 100, 0.14); font-size: 42rpx;
}
.report-heading-copy { flex: 1; min-width: 0; }
.report-title { display: block; color: #f1f8ff; font-size: 32rpx; font-weight: 700; }
.report-subtitle { display: block; margin-top: 6rpx; color: #8ca5ba; font-size: 22rpx; }
.report-close { width: 40rpx; height: 40rpx; color: #7f98ad; }
.report-point {
  gap: 16rpx; padding: 20rpx; margin-bottom: 28rpx; border-radius: 18rpx;
  background: rgba(64, 224, 255, 0.07); border: 1rpx solid rgba(64, 224, 255, 0.14);
}
.report-point-icon { width: 48rpx; height: 48rpx; color: #58e2c2; }
.report-point-copy { min-width: 0; flex: 1; }
.report-point-label { display: block; color: #8ca5ba; font-size: 21rpx; }
.report-point-name { display: block; margin-top: 4rpx; color: #e5f4ff; font-size: 26rpx; font-weight: 600; }
.report-reason-heading { display: flex; justify-content: space-between; margin-bottom: 12rpx; color: #dcebf6; font-size: 25rpx; font-weight: 600; }
.report-required { color: #ff8585; font-size: 21rpx; font-weight: 500; }
.report-textarea {
  width: 100%; height: 190rpx; padding: 18rpx 20rpx; box-sizing: border-box; border: 1rpx solid rgba(143, 180, 204, 0.2);
  border-radius: 16rpx; background: rgba(2, 12, 24, 0.6); color: #e5f4ff; font-size: 24rpx; line-height: 1.55;
}
.report-placeholder { color: #71889c; font-size: 23rpx; }
.report-counter { display: block; margin-top: 8rpx; text-align: right; color: #70889d; font-size: 20rpx; }
.report-actions { gap: 16rpx; margin-top: 28rpx; }
.report-cancel, .report-submit {
  height: 82rpx; flex: 1; display: flex; align-items: center; justify-content: center;
  border-radius: 42rpx; font-size: 26rpx; font-weight: 600;
}
.report-cancel { color: #b8cada; background: rgba(135, 165, 190, 0.12); }
.report-submit { color: #062032; background: linear-gradient(135deg, #5be6d2, #55c8f0); }
.report-submit.disabled { opacity: 0.42; }
.nearby-panel-closing .add-btn-container, .nearby-panel-closing .floating-actions-container { transition: bottom 280ms cubic-bezier(.22, 1, .36, 1); }
.nearby-panel-open .add-btn-container, .nearby-panel-open .floating-actions-container {
  bottom: calc(var(--nearby-panel-height) + 86px + env(safe-area-inset-bottom));
}
@media (min-width: 900px) {
  .nearby-panel-open .add-btn-container, .nearby-panel-open .floating-actions-container { bottom: 140px; }
}
</style>
