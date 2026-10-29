<template>
  <view class="map-page" :class="[tabPageClass, { 'nearby-panel-open': showNearbyDisposal && nearbyPanelHeight > 0, 'nearby-panel-closing': nearbyPanelClosing }]" :style="{ '--nearby-panel-height': nearbyPanelHeight + 'px' }">
    <!-- 顶部导航栏 -->
    <view :animation="tabPageAnimation" class="map-header tab-page-motion" :style="{ paddingTop: (statusBarHeight + 10) + 'px' }">
      <view class="header-decoration">
        <view class="deco-circle c1"></view>
        <view class="deco-circle c2"></view>
        <view class="deco-circle c3"></view>
      </view>
      <view class="header-content">
        <view class="header-title"><ManifestIcon id="nearby_map" /> 垃圾桶地图</view>
        <text class="header-subtitle">查找附近的垃圾分类投放点</text>
      </view>
    </view>

    <!-- 地图容器 -->
    <view :animation="tabPageAnimation" class="map-container tab-page-motion">
      <div v-if="isH5" :id="mapContainerId" class="map-canvas"></div>
      <map v-else-if="!showAddModal"
        id="select-map"
        class="map-canvas"
        :latitude="center.latitude"
        :longitude="center.longitude"
        :scale="mapScale"
        :enable-satellite="satellite"
        @updated="onNativeMapUpdated"
        @error="onNativeMapError"
        :markers="markers"
        show-location
        @markertap="onMarkerTap"
        @tap="onMapTap"
        @click="onMapTap"
        @regionchange="onRegionChange"
      >
        <!-- App/小程序端控件：必须使用 cover-view 放在 map 内部 -->
        <!-- #ifndef APP-PLUS -->
        <!-- #ifndef MP-WEIXIN -->
        <NearbyDisposalPanel v-if="showNearbyDisposal" :points="nearbyDisposal" @heightchange="nearbyPanelHeight = $event" @closingchange="nearbyPanelClosing = $event" :native="true" @select="selectNearbyDisposal" @navigate="point => goNavigate({ ...point, title: point.name, desc: point.address || point.description })" />
        <!-- #endif -->
        <!-- #endif -->
        <cover-view class="basemap-switch basemap-switch-native" style="top: 24px">
          <cover-view class="basemap-option" :class="{ active: !satellite }" @click.stop="setBasemap(false)">普通</cover-view>
          <cover-view class="basemap-option" :class="{ active: satellite }" @click.stop="setBasemap(true)">{{ basemapLoading ? '加载中' : '卫星' }}</cover-view>
        </cover-view>
        <cover-view v-if="selectMode" class="center-pin">📍</cover-view>
        <cover-view v-if="selectMode" class="location-control" @click="moveToMyLocation"><cover-image :src="getManifestIconPath('map_location')" style="width: 24px; height: 24px;" /></cover-view>
        
        <!-- App/小程序端选择面板 (使用 cover-view) -->
        <cover-view v-if="selectMode" class="select-location-panel-native">
          <cover-view class="panel-box-native">
            <cover-view class="select-tips-native"><cover-image :src="getManifestIconPath('map_location')" style="width: 24px; height: 24px;" /> 移动地图选择中心位置</cover-view>
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
    </view>

    <!-- #ifdef H5 -->
    <view v-if="!showAddModal" class="basemap-switch" :style="{ top: (statusBarHeight + (selectMode ? 4 : 132)) + 'px', left: selectMode ? 'auto' : '6px', right: selectMode ? '6px' : 'auto' }" role="group" aria-label="地图类型">
      <button class="basemap-option" :class="{ active: !satellite }" :aria-pressed="!satellite" @click.stop="setBasemap(false)">普通</button>
      <button class="basemap-option" :class="{ active: satellite }" :aria-pressed="satellite" @click.stop="setBasemap(true)">{{ basemapLoading ? '加载中' : '卫星' }}</button>
    </view>
    <!-- #endif -->

    <!-- #ifdef APP-PLUS -->
    <AppNearbyDisposalPanel panel-id="nearby-disposal-light" :visible="showNearbyDisposal" :points="nearbyDisposal" @heightchange="nearbyPanelHeight = $event" @closingchange="nearbyPanelClosing = $event" @select="selectNearbyDisposal" @navigate="point => goNavigate({ ...point, title: point.name, desc: point.address || point.description })" />
    <!-- #endif -->

    <!-- #ifdef H5 || MP-WEIXIN -->
    <NearbyDisposalPanel v-if="showNearbyDisposal" :points="nearbyDisposal" @heightchange="nearbyPanelHeight = $event" @closingchange="nearbyPanelClosing = $event" @select="selectNearbyDisposal" @navigate="point => goNavigate({ ...point, title: point.name, desc: point.address || point.description })" />
    <!-- #endif -->

    <view v-if="nearbyLocationModalVisible && isH5" class="nearby-location-overlay" @click.self="closeNearbyLocationPicker">
      <view class="nearby-location-panel">
        <view class="nearby-location-header">
          <text class="nearby-location-title">选择发送地点</text>
          <ManifestIcon class="nearby-location-close" id="close" :scale="1" @click="closeNearbyLocationPicker" />
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

    <view v-if="isMapAdmin && !selectMode && !viewMode" class="admin-map-legend">{{ isH5 ? '灰：未通过 · 蓝：普通桶 · 绿：智能桶 · 橙色提示：有报错' : '灰色：未通过审核 · 橙色提示：有报错' }}</view>
    <!-- 底部信息卡（H5 与 小程序/APP 都用，非选择模式且非查看模式才显示） -->
    <view v-if="selectedMarker && !selectMode && !viewMode" class="info-card" :class="{ 'admin-info-card': isMapAdmin }">
      <view class="info-header">
        <view class="info-title-wrapper">
          <view class="info-icon" :class="selectedMarker.type === 'smart' ? 'smart' : 'normal'">
            <ManifestIcon v-if="selectedMarker.type === 'smart'" id="device_connect" />
            <ManifestIcon v-else id="normal_bin_marker" />
          </view>
          <view class="info-title-content">
            <text class="info-title">{{ selectedMarker.title }}</text>
            <text class="info-distance">{{ selectedMarker.distance || '附近' }}</text>
          </view>
        </view>
        <ManifestIcon class="info-close" id="close" @click="closeInfo" />
      </view>
      
      <view class="info-body">
        <text class="info-name">{{ selectedMarker.name }}</text>
        <text class="info-desc" v-if="selectedMarker.desc">{{ selectedMarker.desc }}</text>
      </view>
      
      <view class="info-actions">
        <button class="info-btn primary" @click="goNavigate(selectedMarker)">
          <ManifestIcon class="btn-icon" id="dark_navigation" />
          <text>导航</text>
        </button>
        <button class="info-btn secondary" @click="openHistoryImage(selectedMarker)">
          <ManifestIcon class="btn-icon" id="camera_scan" />
          <text>查看</text>
        </button>
        <button class="info-btn danger" @click="reportErrorMarker(selectedMarker)">
          <ManifestIcon class="btn-icon" id="dark_alert" />
          <text>报错</text>
        </button>
      </view>
      <MapBinAdminPanel v-if="isMapAdmin" :bin="selectedMarker" @updated="refreshAdminMarker" />
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
    
    <!-- 位置选择模式：显示选择按钮 (仅H5) -->
    <view v-if="selectMode && isH5" class="select-location-panel" :style="{ top: (statusBarHeight + 50) + 'px' }">
      <view class="select-header">
        <view class="select-icon-wrap">
          <ManifestIcon id="map_location" class="select-header-icon" />
        </view>
        <view class="select-header-text">
          <text class="select-title">地图选点</text>
          <text class="select-subtitle">点按地图落点，或拖动视野后选取中心点</text>
        </view>
      </view>
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
        <button class="select-btn secondary" @click="pickCenterLocation">选取中心点</button>
        <button class="select-btn confirm" @click="confirmSelect" :disabled="!selectedLocation">确定</button>
      </view>
    </view>
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
    <!-- 右下角扫码和新增连体按钮 -->
    <view
      v-if="!selectMode && !viewMode && !showAddModal"
      :class="[isH5 && !showDeviceScan ? 'add-btn-container' : 'floating-actions-container', { dragging: isDraggingFloatingActions }]"
      :style="{ transform: `translate3d(${floatingActionsOffset.x}px, ${floatingActionsOffset.y}px, 0)` }"
      @touchstart="startFloatingActionsDrag"
      @touchmove="moveFloatingActionsDrag"
      @touchend="endFloatingActionsDrag"
      @touchcancel="endFloatingActionsDrag"
    >
      <view v-if="isH5 && !showDeviceScan" class="add-btn" @click.stop="handleFloatingActionClick('add')">
        <ManifestIcon id="add" class="add-btn-icon" :scale="1" />
        <text class="add-btn-text">新增</text>
      </view>
      <template v-else>
        <view class="floating-action scan-action" @click.stop="handleFloatingActionClick('scan')">
          <ManifestIcon id="camera_scan" class="floating-action-icon" :scale="1" />
          <text class="floating-action-label">扫码</text>
        </view>
        <view class="floating-action add-action" @click.stop="handleFloatingActionClick('add')">
          <ManifestIcon id="add" class="floating-action-icon" :scale="1" />
          <text class="floating-action-label">新增</text>
        </view>
      </template>
    </view>

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
import { getManifestIconPath } from '../../utils/manifest-icons.js'
import { resolveTrashBinImage, previewTrashBinImage } from '../../utils/trash-bin-image'
import { ref, onMounted, computed, getCurrentInstance, nextTick } from 'vue'
import { onReady, onShow } from '@dcloudio/uni-app'
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
import { scanAndConnectDevice } from '@/utils/device-qr'
import { canShowDeviceScanEntry } from '@/utils/h5-scan-entry.mjs'
import { navigateBottomTab, useTabPageTransition } from '@/utils/tab-page-transition.js'

const { isMapAdmin, loadMapBins } = useMapAdminBins()
const { tabPageClass, tabPageAnimation } = useTabPageTransition('pages/map/map')
onShow(() => {
  if (isMapAdmin.value && !selectMode.value && !viewMode.value) loadTrashBinList()
})
const isH5 = process.env.UNI_PLATFORM === 'h5'
const showDeviceScan = canShowDeviceScanEntry()
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

// 状态栏高度
const statusBarHeight = ref((uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()).statusBarHeight || 0)

// 地图上下文（小程序/APP）
const mapContext = ref(null)
const instance = getCurrentInstance()

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
const floatingActionsOffset = ref({ x: 0, y: 0 })
const floatingActionsDragStart = ref(null)
const isDraggingFloatingActions = ref(false)
const suppressFloatingActionClick = ref(false)
// 垃圾箱点位数据（从后端API获取，不再硬编码）
const trashPoints = ref([])
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

// 小程序/APP markers
const markers = computed(() => {
  const list = selectMode.value ? [] : trashPoints.value.map(p => ({
    id: p.id,
    latitude: typeof p.latitude === 'number' ? p.latitude : parseFloat(p.latitude),
    longitude: typeof p.longitude === 'number' ? p.longitude : parseFloat(p.longitude),
    title: binMapLabel(p),
  iconPath: p.adminRecord && !p.review ? '/static/pending-bin-marker.png' : (p.type === 'smart' ? '/static/smart-marker.png' : '/static/normal-marker.png'),
    width: 42,
    height: 46,
    anchor: { x: 0.5, y: 1 },
    callout: {
      content: binMapLabel(p),
      color: '#ffffff',
      bgColor: p.adminRecord && !p.review ? '#6b7280' : p.errorReport?.length ? '#c26912' : '#10b981',
      padding: 6,
      borderRadius: 6,
      display: p.adminRecord && p.errorReport?.length ? 'ALWAYS' : 'BYCLICK'
    }
  }));

  return list;
})

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
  if (!selectMode.value) return

  if (isH5) {
    let lat
    let lng
    if (tmapInstance && typeof tmapInstance.getCenter === 'function') {
      const mapCenter = tmapInstance.getCenter()
      if (mapCenter) {
        lat = typeof mapCenter.getLat === 'function' ? mapCenter.getLat() : Number(mapCenter.lat)
        lng = typeof mapCenter.getLng === 'function' ? mapCenter.getLng() : Number(mapCenter.lng)
      }
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      const fallback = (currentCenter.value && Number.isFinite(currentCenter.value.latitude))
        ? currentCenter.value
        : center.value
      if (fallback && Number.isFinite(Number(fallback.latitude)) && Number.isFinite(Number(fallback.longitude))) {
        lat = Number(fallback.latitude)
        lng = Number(fallback.longitude)
      }
    }
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      currentCenter.value = { latitude: lat, longitude: lng }
      onMapClick(lat, lng)
      uni.showToast({ title: '已选取当前视野中心', icon: 'none', duration: 1400 })
    } else {
      uni.showToast({ title: '无法获取中心坐标', icon: 'none' })
    }
    return
  }
  
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
  
  console.log('确认选择位置:', selectedLocation.value)
  
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
    const requestedOrigin = { latitude: options.lat, longitude: options.lng }
    const loc = (options.mode === 'nearby' || (options.mode === 'select' && options.purpose === 'bin')) && validDisposalLocation(requestedOrigin)
      ? { latitude: Number(options.lat), longitude: Number(options.lng) }
      : await getUserLocationOnce('gcj02')
    if (loc && typeof loc.latitude === 'number') {
      center.value = { latitude: loc.latitude, longitude: loc.longitude }
      if (selectMode.value) onMapClick(loc.latitude, loc.longitude)
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
        tmapInstance.setZoom && tmapInstance.setZoom(mapScale.value)
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
      const systemInfo = uni.getAppBaseInfo ? uni.getAppBaseInfo() : uni.getSystemInfoSync()
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
    const map = new window.TMap.Map(mapContainerId, {
      rotation: 0,
      pitch: 0,
      zoom: mapScale.value,
      renderOptions: { preserveDrawingBuffer: pageOptions.purpose === 'bin' && selectMode.value },
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
      map.on('panend', () => {
        if (typeof map.getCenter === 'function') {
          const c = map.getCenter()
          if (c && typeof c.getLat === 'function') {
            currentCenter.value = { latitude: c.getLat(), longitude: c.getLng() }
          }
        }
      })
    }
    tmapInstance = map
    if (selectMode.value) {
      const point = selectedLocation.value || center.value
      onMapClick(point.latitude, point.longitude)
    }
    bindH5Map(map)
    initH5Markers()
  } catch (error) {
    uni.showToast({ title: '地图初始化失败', icon: 'none', duration: 3000 })
  }
}

function getH5Icon(type, pending = false, reported = false) {
  const color = pending ? '#9ca3af' : type === 'selected' ? '#ef4444' : type === 'smart' ? '#10b981' : '#3b82f6'
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='36' height='36' viewBox='0 0 24 24'>
    <path d='M12 23C10 20 3 13.5 3 9a9 9 0 0 1 18 0c0 4.5-7 11-9 14z' fill='${color}' stroke='#fff' stroke-width='1'/>
    <circle cx='12' cy='9' r='3.5' fill='#ffffff'/>
    ${reported ? "<circle cx='18' cy='5' r='4' fill='#c26912' stroke='#fff'/><path d='M18 2.8v2.5m0 1v.8' stroke='#fff' stroke-width='1.3'/>" : ''}
  </svg>`
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}

function onH5MarkerClicked(index, point) {
  selectedMarker.value = {
    ...point,
    id: point.id,
    title: binMapLabel(point),
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
  const point = trashPoints.value.find(p => String(p.id) === String(markerId));
  if (!point) return;
  selectedMarker.value = {
    ...point,
    id: point.id,
    title: binMapLabel(point),
    name: point.name,
    type: point.type,
    latitude: point.latitude,
    longitude: point.longitude,
    desc: point.description || '',
    imageUrl: point.image
  };
}

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
    const deviceId = m.deviceId || m.id || `${m.latitude},${m.longitude}`
    await reportDeviceError(deviceId, reason)
    uni.showToast({ title: '上报成功，感谢反馈', icon: 'success' })
    if (isMapAdmin.value) loadTrashBinList()
    selectedMarker.value = null
    showReportModal.value = false
    reportTarget.value = null
    reportReason.value = ''
  } catch (err) {
    const msg = (err && err.msg) ? err.msg : (err && err.message) ? err.message : '上报失败'
    uni.showToast({ title: msg, icon: 'none' })
  } finally {
    reportSubmitting.value = false
  }
}

function startFloatingActionsDrag(event) {
  const touch = event.touches?.[0]
  if (!touch) return
  floatingActionsDragStart.value = {
    x: touch.clientX,
    y: touch.clientY,
    offsetX: floatingActionsOffset.value.x,
    offsetY: floatingActionsOffset.value.y
  }
  isDraggingFloatingActions.value = false
}

function moveFloatingActionsDrag(event) {
  if (!floatingActionsDragStart.value) return
  const touch = event.touches?.[0]
  if (!touch) return

  const dx = touch.clientX - floatingActionsDragStart.value.x
  const dy = touch.clientY - floatingActionsDragStart.value.y
  if (!isDraggingFloatingActions.value && Math.hypot(dx, dy) < 6) return

  isDraggingFloatingActions.value = true
  event.preventDefault?.()
  event.stopPropagation?.()
  const { windowWidth, windowHeight, statusBarHeight = 0, safeAreaInsets } = uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()
  const rpx = windowWidth / 750
  const controlWidth = (isH5 && !showDeviceScan ? 112 : 116) * rpx
  const controlHeight = (isH5 && !showDeviceScan ? 112 : 224) * rpx
  const edge = 8
  const tabbarHeight = 120 * rpx + (safeAreaInsets?.bottom || 0)
  const defaultLeft = windowWidth - 32 * rpx - controlWidth
  const defaultTop = windowHeight - 280 * rpx - controlHeight
  const left = Math.min(windowWidth - controlWidth - edge, Math.max(edge, defaultLeft + floatingActionsDragStart.value.offsetX + dx))
  const top = Math.min(windowHeight - controlHeight - tabbarHeight, Math.max(statusBarHeight + edge, defaultTop + floatingActionsDragStart.value.offsetY + dy))

  floatingActionsOffset.value = { x: left - defaultLeft, y: top - defaultTop }
}

function endFloatingActionsDrag() {
  if (!floatingActionsDragStart.value) return
  if (isDraggingFloatingActions.value) {
    suppressFloatingActionClick.value = true
    setTimeout(() => { suppressFloatingActionClick.value = false }, 350)
  }
  floatingActionsDragStart.value = null
  isDraggingFloatingActions.value = false
}

function handleFloatingActionClick(action) {
  if (suppressFloatingActionClick.value) {
    suppressFloatingActionClick.value = false
    return
  }
  if (action === 'scan') scanDeviceQR()
  else openAddModal()
}

function openAddModal() {
  showAddModal.value = true
}

function scanDeviceQR() {
  scanAndConnectDevice()
}

function closeAddModal() {
  mapContext.value = null
  showAddModal.value = false
}

function onAddSuccess() {
  if (isMapAdmin.value) loadTrashBinList()
  uni.showToast({ title: '已提交，审核通过后展示并奖励积分', icon: 'none', duration: 2500 })
}

async function loadTrashBinList(centerOverride, scaleOverride) {
  try {
    const override = centerOverride && Number.isFinite(Number(centerOverride.latitude)) && Number.isFinite(Number(centerOverride.longitude))
      ? centerOverride : null;
    let latitude, longitude;
    if (override) {
      latitude = override.latitude;
      longitude = override.longitude;
    } else if (userLocation.value.latitude && userLocation.value.longitude) {
      latitude = userLocation.value.latitude;
      longitude = userLocation.value.longitude;
    } else {
      latitude = 36.0671;
      longitude = 120.3826;
    }

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
          type: item.type
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
  } catch (error) {
    uni.showToast({ title: '加载垃圾桶信息失败', icon: 'none', duration: 2000 })
  }
}

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
  navigateBottomTab('map', 'home', '/pages/home/home')
}

function goShop() {
  navigateBottomTab('map', 'shop', '/pages/shop/shop', 'navigateTo')
}

function goProfile() {
  navigateBottomTab('map', 'profile', '/pages/profile/profile')
}
</script>

<style scoped>
@import '../../styles/map-basemap.css';
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
  width: calc(100% - 48rpx);
  max-width: 680rpx;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 24rpx;
  padding: 24rpx 26rpx;
  box-shadow: 0 12rpx 36rpx rgba(15, 23, 42, 0.12), 0 2rpx 8rpx rgba(15, 23, 42, 0.05);
  z-index: 9999;
  border: 1px solid rgba(16, 185, 129, 0.18);
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
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
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
  color: #0f172a;
  font-size: 28rpx;
  font-weight: 600;
  line-height: 1.3;
}

.select-subtitle {
  color: #64748b;
  font-size: 22rpx;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.selected-info {
  background: #f0fdf4;
  border: 1px solid rgba(16, 185, 129, 0.22);
  border-radius: 14rpx;
  padding: 14rpx 18rpx;
  margin-bottom: 20rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.selected-info.is-empty {
  background: #f8fafc;
  border-color: #e2e8f0;
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
  box-shadow: 0 0 0 4rpx rgba(16, 185, 129, 0.18);
}

.selected-info.is-empty .selected-dot {
  background: #94a3b8;
  box-shadow: none;
}

.selected-text {
  color: #065f46;
  font-size: 24rpx;
  font-weight: 600;
}

.selected-info.is-empty .selected-text {
  color: #64748b;
}

.selected-coords {
  color: #047857;
  font-size: 23rpx;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-weight: 500;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selected-info.is-empty .selected-coords {
  color: #94a3b8;
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
  background: #f1f5f9;
  color: #475569;
}

.select-btn.cancel:active {
  background: #e2e8f0;
  transform: scale(0.98);
}

.select-btn.secondary {
  flex: 1.45;
  background: #ecfdf5;
  color: #059669;
  border: 1px solid rgba(16, 185, 129, 0.32);
}

.select-btn.secondary:active {
  background: #d1fae5;
  transform: scale(0.98);
}

.select-btn.confirm {
  flex: 1.05;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #ffffff;
  box-shadow: 0 4rpx 12rpx rgba(16, 185, 129, 0.25);
}

.select-btn.confirm:active {
  opacity: 0.92;
  transform: scale(0.98);
}

.select-btn.confirm:disabled,
.select-btn.confirm[disabled] {
  background: #e2e8f0;
  color: #94a3b8;
  box-shadow: none;
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
  height: 80rpx;
  border-radius: 44rpx;
  text-align: center;
  vertical-align: middle;
  font-size: 30rpx;
  font-weight: 600;
  margin: 0 12rpx;
  align-items: center;
  justify-content: center;
  padding-bottom: 0;
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
.admin-map-legend { position: fixed; top: 180rpx; left: 24rpx; z-index: 50; padding: 10rpx 18rpx; border-radius: 12rpx; background: rgba(255,255,255,.92); color: #374151; font-size: 22rpx; pointer-events: none; }
.info-card.admin-info-card { bottom: calc(140rpx + env(safe-area-inset-bottom)); max-height: 60vh; overflow-y: auto; }
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

/* 扫码与新增连体悬浮按钮 */
.add-btn-container {
  position: fixed;
  right: 32rpx;
  bottom: 280rpx;
  z-index: 9999;
  width: 112rpx;
  height: 112rpx;
  pointer-events: auto;
  touch-action: none;
}

.add-btn-container .add-btn {
  width: 100%;
  height: 100%;
  border-radius: 50%;
}

.add-btn-container.dragging .add-btn {
  transition: none;
}

.floating-actions-container {
  position: fixed;
  right: 32rpx;
  bottom: 280rpx;
  z-index: 9999;
  width: 116rpx;
  height: 224rpx;
  border-radius: 58rpx;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  pointer-events: auto;
  touch-action: none;
  box-shadow: 0 8rpx 24rpx rgba(16, 70, 120, 0.3);
}

.floating-action {
  width: 100%;
  height: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.scan-action {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.78) 0%, rgba(37, 99, 235, 0.78) 100%);
}

.add-action {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.78) 0%, rgba(5, 150, 105, 0.78) 100%);
}

.floating-actions-container.dragging .floating-action {
  transition: none;
}

.floating-action-icon {
  font-size: 48rpx;
}

.floating-action-label {
  margin-top: 4rpx;
  color: #ffffff;
  font-size: 20rpx;
}

.add-btn-icon {
  font-size: 48rpx;
  color: #ffffff;
  line-height: 1;
}

.add-btn-text {
  margin-top: 4rpx;
  color: #ffffff;
  font-size: 20rpx;
}

.add-btn {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.88) 0%, rgba(5, 150, 105, 0.88) 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 24rpx rgba(16, 185, 129, 0.4);
  cursor: pointer;
  pointer-events: auto;
}

.floating-action:active {
  filter: brightness(0.94);
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
  opacity: 1;
  filter: grayscale(0%) brightness(1.1) saturate(1);
}

.tabbar-item:not(.active) .tabbar-icon {
  opacity: 0.6;
  filter: grayscale(30%) saturate(0.7);
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

.nearby-location-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(17, 24, 39, 0.45);
  display: flex;
  align-items: flex-end;
}

.nearby-location-panel {
  width: 100%;
  max-height: 72vh;
  background: #ffffff;
  border-radius: 24rpx 24rpx 0 0;
  overflow: hidden;
}

.nearby-location-header,
.nearby-location-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28rpx 32rpx;
  border-bottom: 1rpx solid #eef2f7;
}

.nearby-location-actions {
  border-top: 1rpx solid #eef2f7;
  border-bottom: 0;
}

.nearby-location-title {
  font-size: 34rpx;
  color: #111827;
  font-weight: 700;
}

.nearby-location-close {
  width: 56rpx;
  height: 56rpx;
  line-height: 56rpx;
  text-align: center;
  color: #6b7280;
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
  color: #6b7280;
  font-size: 28rpx;
}

.nearby-location-item {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding: 24rpx 32rpx;
  border-bottom: 1rpx solid #f3f4f6;
}

.nearby-location-item:active {
  background: #f9fafb;
}

.nearby-location-name {
  color: #111827;
  font-size: 30rpx;
  font-weight: 600;
}

.nearby-location-address,
.nearby-location-coords {
  color: #6b7280;
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
  background: #ecfdf5;
  color: #059669;
}

.nearby-location-cover {
  position: absolute;
  left: 24rpx;
  right: 24rpx;
  bottom: 40rpx;
  z-index: 2000;
}

.nearby-location-cover-panel {
  background-color: rgba(255, 255, 255, 0.98);
  border-radius: 24rpx;
  padding: 24rpx;
  box-shadow: 0 12rpx 36rpx rgba(15, 23, 42, 0.22);
}

.nearby-location-cover-header {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
}

.nearby-location-cover-title {
  color: #111827;
  font-size: 32rpx;
  font-weight: 700;
}

.nearby-location-cover-close {
  width: 56rpx;
  height: 56rpx;
  line-height: 56rpx;
  text-align: center;
  color: #6b7280;
  font-size: 44rpx;
}

.nearby-location-cover-state {
  color: #6b7280;
  font-size: 26rpx;
  padding: 16rpx 0;
}

.nearby-location-cover-item {
  padding: 18rpx 0;
  border-bottom: 1rpx solid rgba(229, 231, 235, 0.9);
}

.nearby-location-cover-name {
  color: #111827;
  font-size: 28rpx;
  font-weight: 600;
  line-height: 1.35;
}

.nearby-location-cover-address {
  color: #6b7280;
  font-size: 23rpx;
  line-height: 1.35;
  margin-top: 6rpx;
}

.nearby-location-cover-send {
  margin-top: 18rpx;
  height: 72rpx;
  line-height: 72rpx;
  text-align: center;
  color: #059669;
  background-color: #ecfdf5;
  border-radius: 36rpx;
  font-size: 28rpx;
  font-weight: 600;
}

.report-overlay {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 12000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32rpx;
  background: rgba(15, 23, 42, 0.48);
  backdrop-filter: blur(8px);
}
.report-dialog {
  width: 620rpx;
  max-width: calc(100vw - 64rpx);
  padding: 32rpx;
  border-radius: 28rpx;
  background: #ffffff;
  box-shadow: 0 24rpx 72rpx rgba(15, 23, 42, 0.24);
}
.report-header, .report-point, .report-actions { display: flex; align-items: center; }
.report-header { gap: 18rpx; margin-bottom: 28rpx; }
.report-heading-icon {
  width: 76rpx; height: 76rpx; flex: 0 0 76rpx; border-radius: 22rpx;
  display: flex; align-items: center; justify-content: center;
  color: #e65c4f; background: #fff1ef; font-size: 42rpx;
}
.report-heading-copy { flex: 1; min-width: 0; }
.report-title { display: block; color: #172033; font-size: 32rpx; font-weight: 700; }
.report-subtitle { display: block; margin-top: 6rpx; color: #8490a2; font-size: 22rpx; }
.report-close { width: 40rpx; height: 40rpx; color: #94a3b8; }
.report-point {
  gap: 16rpx; padding: 20rpx; margin-bottom: 28rpx; border-radius: 18rpx;
  background: #f5f8fb; border: 1rpx solid #e8edf3;
}
.report-point-icon { width: 48rpx; height: 48rpx; color: #0eaa78; }
.report-point-copy { min-width: 0; flex: 1; }
.report-point-label { display: block; color: #8792a2; font-size: 21rpx; }
.report-point-name { display: block; margin-top: 4rpx; color: #263244; font-size: 26rpx; font-weight: 600; }
.report-reason-heading { display: flex; justify-content: space-between; margin-bottom: 12rpx; color: #273449; font-size: 25rpx; font-weight: 600; }
.report-required { color: #e65c4f; font-size: 21rpx; font-weight: 500; }
.report-textarea {
  width: 100%; height: 190rpx; padding: 18rpx 20rpx; box-sizing: border-box;
  border: 1rpx solid #dce4ed; border-radius: 16rpx; background: #fbfcfe;
  color: #263244; font-size: 24rpx; line-height: 1.55;
}
.report-placeholder { color: #a3adba; font-size: 23rpx; }
.report-counter { display: block; margin-top: 8rpx; text-align: right; color: #9aa5b3; font-size: 20rpx; }
.report-actions { gap: 16rpx; margin-top: 28rpx; }
.report-cancel, .report-submit {
  height: 82rpx; flex: 1; display: flex; align-items: center; justify-content: center;
  border-radius: 42rpx; font-size: 26rpx; font-weight: 600;
}
.report-cancel { color: #5c6878; background: #f1f4f7; }
.report-submit { color: #ffffff; background: linear-gradient(135deg, #12b981, #07966e); }
.report-submit.disabled { opacity: 0.45; }
.nearby-panel-closing .add-btn-container, .nearby-panel-closing .floating-actions-container { transition: bottom 280ms cubic-bezier(.22, 1, .36, 1); }
.nearby-panel-open .add-btn-container, .nearby-panel-open .floating-actions-container {
  bottom: calc(var(--nearby-panel-height) + 86px + env(safe-area-inset-bottom));
}
@media (min-width: 900px) {
  .nearby-panel-open .add-btn-container, .nearby-panel-open .floating-actions-container { bottom: 140px; }
}
</style>
