<template>
  <view class="map-container app-tab-map-root" :class="[tabPageClass, { 'nearby-panel-open': showNearbyDisposal && nearbyPanelHeight > 0, 'nearby-panel-closing': nearbyPanelClosing }]" :style="{ '--nearby-panel-height': nearbyPanelHeight + 'px' }">
    <!-- #ifdef MP-WEIXIN -->
    <canvas type="2d" id="upload-image-canvas" style="position:fixed;left:-9999px;top:0;width:1px;height:1px;pointer-events:none;" />
    <!-- #endif -->
    <view class="map-header tab-page-motion" :style="{ paddingTop: (statusBarHeight + 14) + 'px' }">
      <view class="map-header-content">
        <button v-if="selectMode || viewMode" class="map-header-back" aria-label="返回" @click="selectMode ? cancelSelect() : handleBack()">‹</button>
        <ManifestIcon v-else id="nearby_map" class="map-header-icon" />
        <view class="map-header-copy">
          <text class="map-header-title">{{ selectMode ? '地图选点' : viewMode ? '查看位置' : '垃圾桶地图' }}</text>
          <text class="map-header-subtitle">{{ selectMode ? '选择并确认地图中的位置' : viewMode ? '查看地点详情与导航' : '查找附近的垃圾分类投放点' }}</text>
        </view>
      </view>
    </view>
    <view class="map-stage walking-map-viewport">
    <!-- #ifdef MP-WEIXIN -->
    <view class="map-motion-layer tab-page-motion">
    <!-- #endif -->
    <!-- H5端用div容器，微信小程序端用<map>组件 -->
    <div v-if="isH5" :id="mapContainerId" class="map-canvas"></div>
    <!-- #ifdef APP-PLUS -->
    <AppTencentMap :covered="showAddModal" ref="appMapRef" class="map-canvas" :latitude="center.latitude" :longitude="center.longitude" :scale="mapScale" :enable-satellite="satellite" :markers="markers" :user-location="walkingPosition || userLocation" :walking-route="walkingOverlay" :walking-polyline="walkingPolyline" @updated="onNativeMapUpdated" @error="onNativeMapError" @markertap="onMarkerTap" @regionchange="onRegionChange" />
    <!-- #endif -->
    <!-- #ifndef APP-PLUS -->
    <map v-if="!isH5 && !showAddModal"
      id="select-map"
      class="map-canvas"
      :latitude="center.latitude"
      :longitude="center.longitude"
      :scale="mapCameraScale"
      :enable-satellite="satellite"
      @updated="onNativeMapUpdated"
      @error="onNativeMapError"
      :markers="nativeWalkingMarkers"
      :polyline="walkingPolyline"
      show-location
      @markertap="onMarkerTap"
      @regionchange="onRegionChange"
    >
      <!-- App/小程序端控件：cover-view -->
      <!-- #ifndef APP-PLUS -->
      <!-- #ifndef MP-WEIXIN -->
      <NearbyDisposalPanel v-if="showNearbyDisposal" :points="nearbyDisposal" @heightchange="nearbyPanelHeight = $event" @closingchange="nearbyPanelClosing = $event" :dark="true" :native="true" @select="selectNearbyDisposal" @navigate="previewNearbyWalkingRoute" />
      <!-- #endif -->
      <!-- #endif -->
      <!-- #ifndef APP-PLUS -->
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

      <!-- #endif -->

      <cover-view v-if="nearbyLocationModalVisible && !isH5" class="nearby-location-cover">
        <cover-view class="nearby-location-cover-panel">
          <cover-view class="nearby-location-cover-header">
            <cover-view class="nearby-location-cover-title">选择发送地点</cover-view>
          <cover-image class="nearby-location-cover-close" :src="getManifestIconPath('close')" @click="closeNearbyLocationPicker" />
          </cover-view>
          <cover-view class="nearby-location-cover-search" @click="promptNearbyLocationSearch">搜索附近地点</cover-view>
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
          </cover-view>
          <cover-view class="nearby-location-cover-send" @click="sendPendingLocation">直接发送当前点</cover-view>
        </cover-view>
      </cover-view>
    </map>
    <!-- #endif -->
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
    <AppMapControls control-id="map-controls-dark" :visible="!showAddModal && !showReportModal && !nearbyLocationModalVisible" :select-mode="selectMode" dark :top="statusBarHeight + (selectMode ? 88 : 100)" :satellite="satellite" :loading="basemapLoading" :latitude="selectedLocation?.latitude" :longitude="selectedLocation?.longitude" @basemap="setBasemap" @cancel="cancelSelect" @confirm="confirmSelect" @center="pickCenterLocation" @locate="moveToMyLocation" />
    <AppNearbyDisposalPanel panel-id="nearby-disposal-dark" :visible="showNearbyDisposal" :points="nearbyDisposal" :dark="true" @heightchange="nearbyPanelHeight = $event" @closingchange="nearbyPanelClosing = $event" @select="selectNearbyDisposal" @navigate="previewNearbyWalkingRoute" />
    <!-- #endif -->

    <!-- #ifdef H5 || MP-WEIXIN -->
    <NearbyDisposalPanel v-if="showNearbyDisposal" :points="nearbyDisposal" @heightchange="nearbyPanelHeight = $event" @closingchange="nearbyPanelClosing = $event" :dark="true" @select="selectNearbyDisposal" @navigate="previewNearbyWalkingRoute" />
    <!-- #endif -->

    <view v-if="nearbyLocationModalVisible && (isH5 || appMapRef)" class="nearby-location-overlay" @click.self="closeNearbyLocationPicker">
      <view class="nearby-location-panel">
        <view class="nearby-location-header">
          <text class="nearby-location-title">选择发送地点</text>
          <ManifestIcon class="nearby-location-close" id="close" @click="closeNearbyLocationPicker" />
        </view>
        <view class="nearby-location-search">
          <input v-model="nearbyLocationKeyword" class="nearby-location-search-input" placeholder="搜索附近地点" confirm-type="search" @confirm="searchNearbyLocation" />
          <button class="nearby-location-search-button" @click="searchNearbyLocation">搜索</button>
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

    <!-- 右下角新增垃圾桶按钮（非选择模式且非查看模式才显示） -->
    <view v-if="!selectMode && !viewMode && !showAddModal && !walkingRoute" class="add-btn-container">
      <view class="add-btn" @click="openAddModal">
        <text class="add-btn-icon">+</text>
        <text class="add-btn-text">新增垃圾桶</text>
      </view>
    </view>

    <!-- 地图点选与聊天跳转共用同一张点位信息卡。 -->
    <view v-if="isMapAdmin && !selectMode && !viewMode" class="admin-map-legend">{{ isH5 ? '灰：未通过 · 蓝：普通桶 · 绿：智能桶 · 橙色提示：有报错' : '灰色：未通过审核 · 橙色提示：有报错' }}</view>
    <view v-if="selectedMarker && !selectMode" class="info-card" :class="{ 'admin-info-card': isMapAdmin && !viewMode && !walkingRoute, 'walking-info-card': walkingRoute }">
      <view class="info-header">
        <text class="info-title">{{ selectedMarker.title }}</text>
        <ManifestIcon class="info-close" id="close" @click="closeInfo" />
      </view>
      <view class="info-body">
        <text v-if="!selectedMarker.sharedLocation && selectedMarker.name" class="info-line">{{ selectedMarker.sourceKey?.startsWith('futian:') ? '位置：' : '' }}{{ selectedMarker.name }}</text>
        <text v-if="!walkingRoute" class="info-line">经纬度: {{ selectedMarker.latitude }}, {{ selectedMarker.longitude }}</text>
        <text v-if="selectedMarker.desc" class="info-line">{{ selectedMarker.desc }}</text>
      </view>
      <WalkingRoutePreview v-if="walkingRoute" :route="walkingRoute" dark :can-locate="!!walkingPosition" @locate="locateOnWalkingMap" @navigate="openWalkingNavigation" @photo="openHistoryImage(selectedMarker)" @close="closeWalkingRoute" />
      <view v-else class="info-actions">
        <button class="info-btn" @click="viewMode || selectedMarker.sharedLocation ? goNavigate(selectedMarker) : showWalkingRoute(selectedMarker)">{{ viewMode || selectedMarker.sharedLocation ? '导航到这里' : '步行路线' }}</button>
        <button v-if="!selectedMarker.sharedLocation" class="info-btn" @click="openHistoryImage(selectedMarker)">查看图片</button>
      </view>
      <view v-if="!selectedMarker.sharedLocation && !walkingRoute" class="info-feedback">
        <button class="info-feedback-link" @click="reportErrorMarker(selectedMarker)">信息有误？点我报错</button>
      </view>
      <MapBinAdminPanel v-if="isMapAdmin && !viewMode && !walkingRoute" :bin="selectedMarker" dark @updated="refreshAdminMarker" />
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
            <text class="report-point-name">{{ reportTarget?.name || reportTarget?.title || '垃圾桶点位' }}</text>
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
        <ReportPhotoPicker v-model:photos="reportPhotos" dark :disabled="reportSubmitting" @processing="reportPhotoProcessing = $event" />
        <view class="report-actions">
          <view class="report-cancel" @click="closeReportModal">取消</view>
          <view class="report-submit" :class="{ disabled: !reportReason.trim() || reportSubmitting || reportPhotoProcessing }" @click="submitReport">
            {{ reportPhotoProcessing ? '照片处理中…' : reportSubmitting ? '提交中…' : '提交反馈' }}
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
import { getUserLocationOnce as getSharedUserLocationOnce } from '@/utils/location.js'
import { ensureFeaturePermission } from '@/utils/feature-permission.js'
import { getManifestIconPath } from '../../utils/manifest-icons.js'
import { resolveTrashBinImage, previewTrashBinImage } from '../../utils/map/trash-bin-image'
import { ref, onMounted, onBeforeUnmount, computed, getCurrentInstance, nextTick, watch } from 'vue'
import { onLoad, onShow, onHide, onUnload } from '@/utils/app-tab-lifecycle.js'
import { mapConfig } from '../../api/map-config.js'
import { reportDeviceError, reverseGeocoder, searchPlaces, getTrashBinImage } from '../../api/map.js'
import AddTrashBinModal from '../../components/map/AddTrashBinModal.vue'
import ManifestIcon from '../../components/ManifestIcon.vue'
import MapBinAdminPanel from '@/components/map/MapBinAdminPanel.vue'
import ReportPhotoPicker from '@/components/map/ReportPhotoPicker.vue'
import NearbyDisposalPanel from '@/components/map/NearbyDisposalPanel.vue'
import WalkingRoutePreview from '@/components/map/WalkingRoutePreview.vue'
import { useMapWalkingPosition } from '@/utils/map/use-map-walking-position.js'
import { useMapWalkingRoute, walkingRouteCoordinates, walkingDestinationMarker } from '@/utils/map/use-map-walking-route.js'
// #ifdef H5
import { createTencentPositionLayer, createTencentWalkingLayer, getTencentFocusCenter } from '@/static/app-map/renderer.mjs'
// #endif
// #ifdef APP-PLUS
import AppNearbyDisposalPanel from '@/components/map/AppNearbyDisposalPanel.vue'
import AppMapControls from '@/components/map/AppMapControls.vue'
import AppTencentMap from '@/components/map/AppTencentMap.vue'
// #endif
import { nearbyDisposalPoints, validDisposalLocation } from '@/utils/map/nearby-disposal.mjs'
import { isBinLocationPicker } from '@/utils/map/map-basemap-core.mjs'
import { getPointFocusCenter, getWalkingMapLift } from '@/utils/map/map-point-focus.mjs'
// #ifdef MP-WEIXIN
import { offsetMapCenter } from '@/utils/map/map-point-focus.mjs'
// #endif
import { getViewLocationMarkers } from '@/utils/map/map-view-location.mjs'
import { resolveMapViewCard } from '@/utils/map/map-view-card.mjs'
import { mapPointDescription } from '@/utils/map/map-display-point.mjs'
import request from '@/api/index.js'
import { getLastMapLocation, saveLastMapLocation } from '@/utils/map/map-last-location.mjs'
import { useMapBasemap } from '@/utils/map/use-map-basemap'
import { useMapAdminBins, binMapLabel, binReportCount } from '@/utils/map/map-admin-bins'
import { createMapPointList, createMapZoomSetter } from '@/utils/map/point-list.mjs'
import { clusterMapMarkers } from '@/utils/map/marker-clusters.mjs'
import { createClusterMarker, clusterIcon, chooseClusterPoint, nativeBinMarkerStyle } from '@/utils/map/cluster-markers-ui.mjs'
import { useMapPointReport } from '@/utils/map/point-report.mjs'
import { navigateBottomTab, useTabPageTransition } from '@/utils/tab-page-transition.js'
/*
  如果不想引入 lodash，注释掉上面 import 并在需要时用简单 typeof/Array.isArray 校验
*/

const { isMapAdmin, loadMapBins } = useMapAdminBins()
const { tabPageClass } = useTabPageTransition('pages-dark/map/map')
onShow(() => {
  if (isMapAdmin.value && !selectMode.value && !viewMode.value) loadTrashBinList()
})
const isH5 = process.env.UNI_PLATFORM === 'h5'
const isApp = ['app', 'app-plus'].includes(process.env.UNI_PLATFORM)
const appMapRef = ref(null)
const mapContext = ref(null)
const instance = getCurrentInstance()
const statusBarHeight = ref((uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()).statusBarHeight || 0)

// 位置选择模式
const selectMode = ref(false)
const selectedLocation = ref(null)
const nearbyLocationModalVisible = ref(false)
const nearbyLocationLoading = ref(false)
const nearbyLocationOptions = ref([])
const pendingLocationData = ref(null)
const nearbyLocationError = ref('')
const nearbyLocationKeyword = ref('')
let nearbyLocationRequestId = 0
const visibleNearbyLocationOptions = computed(() => nearbyLocationOptions.value.slice(0, 8))

// 查看位置模式（从聊天消息点击进入）
const viewMode = ref(false)
const viewLocationInfo = ref(null)
const viewPoint = ref(null)

// 优先使用上次设备定位，没有记录时使用青岛市中心。
const center = ref(getLastMapLocation() || { latitude: 36.067108, longitude: 120.382609 })
const userLocation = ref({ latitude: null, longitude: null, addr: '' })
const userMarker = ref(null)

// 新增垃圾桶弹窗显示状态
const showAddModal = ref(false)
const { showReportModal, reportTarget, reportReason, reportSubmitting, reportPhotos, reportPhotoProcessing,
  reportErrorMarker, resetReport, closeReportModal, submitReport } = useMapPointReport({
  sendReport: reportDeviceError,
  onSubmitted() {
    if (isMapAdmin.value) loadTrashBinList()
    selectedMarker.value = null
  },
  onError: error => console.error('report error failed', error),
})

// 垃圾箱点位数据（从后端API获取，不再硬编码）
const trashPoints = ref([])

// 小程序/APP markers — 选择模式下不显示垃圾桶点位
function appSelectionMarkers() {
  // #ifdef APP-PLUS
  if (selectMode.value && validDisposalLocation(selectedLocation.value)) return [{
    id: -1, latitude: Number(selectedLocation.value.latitude), longitude: Number(selectedLocation.value.longitude),
    iconPath: '/static/normal-marker.png', width: 36, height: 40, anchor: { x: .5, y: 1 }
  }]
  // #endif
  return []
}

const mapPointGroups = computed(() => clusterMapMarkers(trashPoints.value, mapScale.value))
const markers = computed(() => viewMode.value ? getViewLocationMarkers(viewLocationInfo.value) : selectMode.value ? appSelectionMarkers() : mapPointGroups.value.map((group, index) => group.type === 'cluster' ? createClusterMarker(group, index) : ((p) => ({
  id: p.id,
  latitude: typeof p.latitude === 'number' ? p.latitude : parseFloat(p.latitude),
  longitude: typeof p.longitude === 'number' ? p.longitude : parseFloat(p.longitude),
  title: binMapLabel(p), // 根据类型设置标题
  ...nativeBinMarkerStyle(p),
  callout: {
    content: binMapLabel(p), // 气泡显示类型
    color: '#ffffff',
    bgColor: p.adminRecord && !p.review ? '#6b7280' : binReportCount(p) ? '#c26912' : '#6a7cfb',
    padding: 6,
    borderRadius: 6,
    display: p.adminRecord && binReportCount(p) ? 'ALWAYS' : 'BYCLICK' // 点击时显示
  }
}))(group.point)))

// 选中的 marker 数据（用于底部信息卡）
const selectedMarker = ref(null)
const { walkingRoute, walkingOverlay, walkingPolyline, closeWalkingRoute, showWalkingRoute } =
  useMapWalkingRoute()
const { position: walkingPosition } = useMapWalkingPosition(walkingRoute)
watch([selectMode, viewMode, () => selectedMarker.value?.id, () => selectedMarker.value?.latitude, () => selectedMarker.value?.longitude],
  closeWalkingRoute, { flush: 'sync' })
const nativeWalkingMarkers = computed(() => walkingOverlay.value
  ? [...markers.value, walkingDestinationMarker(walkingOverlay.value.destination)] : markers.value)

function previewNearbyWalkingRoute(point) {
  if (!validDisposalLocation(point)) return
  onH5MarkerClicked(0, point)
  void showWalkingRoute(selectedMarker.value)
}
const nearbyPanelHeight = ref(0)
const nearbyPanelClosing = ref(false)
const nearbyDisposal = computed(() => nearbyDisposalPoints(trashPoints.value, userLocation.value))
const showNearbyDisposal = computed(() => !selectMode.value && !viewMode.value &&
  !selectedMarker.value && !nearbyLocationModalVisible.value && !showAddModal.value && !showReportModal.value && nearbyDisposal.value.length > 0)

async function selectNearbyDisposal(point) {
  if (!validDisposalLocation(point)) return
  onH5MarkerClicked(0, point)
  await nextTick()
  const location = await getPointFocusCenter(point, 16, instance)
  if (String(selectedMarker.value?.id) !== String(point.id)) return
  center.value = location
  setMapZoom(16)
  if (isH5 && tmapInstance && window.TMap) {
    tmapInstance.setCenter(new window.TMap.LatLng(location.latitude, location.longitude))
    tmapInstance.setZoom?.(16)
  } else {
    // Explicit camera commands also work when the same point is selected again after panning.
    ensureMapContext()
    mapContext.value?.moveToLocation({ ...location })
  }
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
// #ifdef H5
let h5WalkingLayer, h5PositionLayer
function syncH5WalkingPosition(point) {
  if (!tmapInstance || !window.TMap || (!h5PositionLayer && !point)) return
  h5PositionLayer ||= createTencentPositionLayer({ sdk: window.TMap, map: tmapInstance })
  h5PositionLayer.update(point)
}
watch(walkingPosition, syncH5WalkingPosition, { flush: 'post' })
function syncH5WalkingRoute(route) {
  if (!tmapInstance || !window.TMap || (!h5WalkingLayer && !route)) return
  h5WalkingLayer ||= createTencentWalkingLayer({
    sdk: window.TMap, map: tmapInstance, container: document.getElementById(mapContainerId)
  })
  h5WalkingLayer.update(route)
}
// #endif

watch(walkingOverlay, route => {
  // #ifdef H5
  syncH5WalkingRoute(route)
  // #endif
  // #ifndef H5 || APP-PLUS
  if (!route) return
  nextTick(() => {
    if (walkingOverlay.value !== route) return
    ensureMapContext()
    mapContext.value?.includePoints?.({ points: [...route.points, route.destination], padding: [56, 32, 208, 32] })
  })
  // #endif
}, { flush: 'post' })
let h5SdkScript = null, h5Disposed = false, tmapSelectionMarker = null
function disposeH5Map() {
  if (!isH5 || h5Disposed) return
  h5Disposed = true
  if (h5SdkScript) { h5SdkScript.onload = h5SdkScript.onerror = null; h5SdkScript.remove() }
  // #ifdef H5
  h5WalkingLayer?.update(null)
  h5WalkingLayer = null
  h5PositionLayer?.update(null)
  h5PositionLayer = null
  // #endif
  try { tmapInstance?.destroy() } finally {
    tmapInstance = tmapBinLayer = tmapSelectionMarker = null
    tmapMarkers = []
  }
}
onBeforeUnmount(disposeH5Map)
onUnload(disposeH5Map)
let tmapMarkers = [] // 存放 H5 创建的辅助 marker（如查看位置标记）
let tmapBinLayer = null // 垃圾桶点位单一 MultiMarker 图层（避免每点一个图层）

// 处理页面参数
const pageOptions = {}
let mapPageDisposed = false
let mapViewEpoch = 0
let viewLookupScope = '', viewOwner = null, viewInvalidated = false
function mapViewOwner() {
  try { return String(uni.getStorageSync('token') || '') } catch (_) { return '' }
}
function mapViewScope() { return `${mapViewEpoch}|${mapViewOwner()}` }
onHide(() => { mapViewEpoch++ })
function disposeMapPage() {
  mapPageDisposed = true
  closeWalkingRoute()
  cancelViewportReload()
}
onUnload(disposeMapPage)
onBeforeUnmount(disposeMapPage)
const mapScale = ref(14)
let isWechatDevtools = false
// #ifdef MP-WEIXIN
isWechatDevtools = (uni.getDeviceInfo?.().platform || uni.getSystemInfoSync().platform) === 'devtools'
// #endif
// The simulator can replay an old scale if gesture readings are bound back to the map.
const mapCameraScale = isWechatDevtools ? ref(mapScale.value) : mapScale
const setMapZoom = createMapZoomSetter(mapScale, mapCameraScale, nextTick)
const { cancelViewportReload, scheduleViewportReload, syncNativeViewport, watchDevtoolsZoom, loadTrashBinList, refreshAdminMarker: refreshSelectedPoint } = createMapPointList({
  points: trashPoints,
  userLocation,
  mapScale,
  getWebMap: () => isH5 ? tmapInstance : null,
  getNativeMap: () => {
    ensureMapContext()
    return mapContext.value
  },
  isNavigationMode: () => selectMode.value || viewMode.value,
  loadMapBins,
  resolveImage: resolveTrashBinImage,
  onUpdate() {
    if (isH5 && tmapInstance) initH5Markers()
  },
  skipZeroCenter: true,
  onError(error) {
    console.warn('获取垃圾桶列表失败:', error)
    uni.showToast({ title: '加载垃圾桶信息失败' + error, icon: 'none', duration: 2000 })
  }
})
// #ifdef MP-WEIXIN
let stopDevtoolsZoom
onShow(() => {
  if (!isWechatDevtools || stopDevtoolsZoom) return
  stopDevtoolsZoom = watchDevtoolsZoom(() => !mapPageDisposed && !showAddModal.value)
})
function stopDevtoolsZoomWatch() {
  if (!stopDevtoolsZoom) return
  stopDevtoolsZoom()
  stopDevtoolsZoom = null
  cancelViewportReload()
}
onHide(stopDevtoolsZoomWatch)
onBeforeUnmount(stopDevtoolsZoomWatch)
// #endif
const { satellite, basemapLoading, setBasemap, bindH5Map, getSatelliteReference, onNativeMapUpdated, onNativeMapError, onNativeMapRegionChange } = useMapBasemap({ isH5, options: pageOptions, appWebMap: true, suspended: () => showAddModal.value })

// 小程序 setup 阶段可能还没有路由参数，以 onLoad 收到的参数为准。
onLoad(options => {
  Object.assign(pageOptions, options || {})
  if (isBinLocationPicker(pageOptions)) {
    setMapZoom(18)
    setBasemap(true)
  }
  if (pageOptions.mode === 'select') {
    selectMode.value = true
    const origin = { latitude: pageOptions.lat, longitude: pageOptions.lng }
    if (validDisposalLocation(origin)) center.value = { latitude: Number(origin.latitude), longitude: Number(origin.longitude) }
    onMapClick(center.value.latitude, center.value.longitude)
  }
})

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
    } else if (isApp && (e.type === 'end' || detail.type === 'end')) {
      selectNativeMapCenter()
    }
    return
  }
  const epoch = mapViewEpoch
  syncNativeViewport(e, () => epoch === mapViewEpoch && !mapPageDisposed && !showAddModal.value)
}

function ensureMapContext() {
  if (isH5) return
  if (isApp) {
    mapContext.value = appMapRef.value
    return
  }
  if (!mapContext.value) mapContext.value = uni.createMapContext('select-map')
}

function selectNativeMapCenter(feedback = false) {
  if (!selectMode.value) return
  try {
    const map = appMapRef.value
    if (!map) {
      if (feedback) uni.showToast({ title: '地图正在初始化，请稍后再试', icon: 'none' })
      return
    }
    map.getCenterLocation({
      success: location => {
        if (!selectMode.value || !validDisposalLocation(location)) return
        onMapClick(Number(location.latitude), Number(location.longitude))
        if (feedback) uni.showToast({ title: '已选取当前视野中心', icon: 'none' })
      },
      fail: () => { if (feedback) uni.showToast({ title: '无法获取中心坐标，请重试', icon: 'none' }) }
    })
  } catch (_) { if (feedback) uni.showToast({ title: '地图尚未就绪，请稍后再试', icon: 'none' }) }
}

function pickCenterLocation() {
  if (!selectMode.value) return
  if (isApp) { selectNativeMapCenter(true); return }

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

async function moveToMyLocation() {
  const owner = uni.getStorageSync('token') || ''
  const isCurrent = () => !mapPageDisposed && owner === (uni.getStorageSync('token') || '')
  if (!await ensureFeaturePermission('location', { isCurrent }) || !isCurrent()) return
  console.log('moveToMyLocation 被调用')
  uni.showToast({ title: '正在定位...', icon: 'loading', duration: 2000 })
  getUserLocationOnce('gcj02').then(loc => {
      if (!isCurrent()) return
    center.value = { latitude: loc.latitude, longitude: loc.longitude }
    userLocation.value = { latitude: loc.latitude, longitude: loc.longitude }
    selectedLocation.value = {
      latitude: loc.latitude,
      longitude: loc.longitude,
      name: '我的位置',
      address: ''
    }
    uni.showToast({ title: '已定位到我的位置', icon: 'success', duration: 1000 })
  }).catch(err => {
      if (!isCurrent()) return
    console.error('定位失败:', err)
    uni.showToast({ title: '定位失败', icon: 'none', duration: 1000 })
  })
}

function extractReverseLocation(res, preferPoi = true) {
  const data = res && Object.prototype.hasOwnProperty.call(res, 'data') ? res.data : res
  const result = data && data.result ? data.result : data
  const poi = preferPoi ? extractReversePois(res)[0] : null
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

function selectedLocationData() {
  const source = selectedLocation.value || {}
  return {
    latitude: source.latitude,
    longitude: source.longitude,
    name: source.name || '位置分享',
    address: source.address || ''
  }
}

function hasSelectedLocationAddress(locationData) {
  const addressIsCoords = /^[-+]?\d+\.?\d+,\s*[-+]?\d+\.?\d+$/.test(String(locationData.address || '').trim())
  return locationData.name !== '位置分享' && locationData.name !== '选中的位置' && Boolean(locationData.address) && !addressIsCoords
}

async function resolveBinLocationData(locationData) {
  if (hasSelectedLocationAddress(locationData)) return
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
  const requestId = ++nearbyLocationRequestId
  pendingLocationData.value = baseLocation
  nearbyLocationKeyword.value = ''
  nearbyLocationOptions.value = [baseLocation]
  nearbyLocationError.value = ''
  nearbyLocationModalVisible.value = true
  nearbyLocationLoading.value = true

  try {
    const reverseResult = await reverseGeocoder(baseLocation.latitude, baseLocation.longitude, { includePois: true, poiPolicy: 5, silent: true })
    if (requestId !== nearbyLocationRequestId || !nearbyLocationModalVisible.value) return
    if (!hasSelectedLocationAddress(baseLocation)) {
      const resolved = extractReverseLocation(reverseResult, false)
      baseLocation = {
        ...baseLocation,
        name: resolved.name || baseLocation.name,
        address: resolved.address || baseLocation.address
      }
      pendingLocationData.value = baseLocation
    }
    const places = extractReversePois(reverseResult)
    nearbyLocationOptions.value = buildNearbyLocationOptions(baseLocation, places)
    if (places.length === 0) {
      nearbyLocationError.value = '未找到附近地点，可直接发送当前点'
    }
  } catch (error) {
    if (requestId !== nearbyLocationRequestId || !nearbyLocationModalVisible.value) return
    console.warn('load nearby locations failed:', error)
    nearbyLocationError.value = '附近地点加载失败，可直接发送当前点'
  } finally {
    if (requestId === nearbyLocationRequestId) nearbyLocationLoading.value = false
  }
}

function promptNearbyLocationSearch() {
  uni.showModal({
    title: '搜索附近地点',
    content: nearbyLocationKeyword.value,
    editable: true,
    placeholderText: '输入地点名称',
    success: result => { if (result.confirm) searchNearbyLocation(result.content) }
  })
}

async function searchNearbyLocation(eventOrKeyword) {
  const keyword = String(typeof eventOrKeyword === 'string' ? eventOrKeyword : nearbyLocationKeyword.value || '').trim()
  if (!keyword || !pendingLocationData.value) return
  nearbyLocationKeyword.value = keyword
  const requestId = ++nearbyLocationRequestId
  const base = pendingLocationData.value
  nearbyLocationLoading.value = true
  nearbyLocationError.value = ''
  try {
    const result = await searchPlaces(keyword, base.latitude, base.longitude, 1000)
    if (requestId !== nearbyLocationRequestId || !nearbyLocationModalVisible.value) return
    const places = Array.isArray(result && result.data) ? result.data : []
    nearbyLocationOptions.value = buildNearbyLocationOptions(base, places)
    if (!places.length) nearbyLocationError.value = '未找到附近地点，可直接发送当前点'
  } catch (error) {
    if (requestId !== nearbyLocationRequestId || !nearbyLocationModalVisible.value) return
    nearbyLocationError.value = '附近地点搜索失败，可直接发送当前点'
  } finally {
    if (requestId === nearbyLocationRequestId) nearbyLocationLoading.value = false
  }
}

function closeNearbyLocationPicker() {
  nearbyLocationModalVisible.value = false
  pendingLocationData.value = null
  nearbyLocationRequestId++
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
  
  const locationData = selectedLocationData()
  if (pageOptions.purpose === 'bin' && /^bin-location-[\w-]+$/.test(pageOptions.returnEvent || '')) {
    await resolveBinLocationData(locationData)
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
    if (tmapSelectionMarker) {
      tmapSelectionMarker.setMap(null)
    }
    
    // 添加新的选择标记
    tmapSelectionMarker = new window.TMap.MultiMarker({
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

function ensureH5Sdk() {
  if (!isH5 || h5Disposed || h5SdkScript) return
  // 动态加载腾讯地图 GL JS
  const script = document.createElement('script')
  h5SdkScript = script
  script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${mapConfig.qqMapKey}`
  script.onerror = (error) => {
    console.error('加载地图脚本失败:', error)
    uni.showToast({ title: '地图加载失败，请刷新重试', icon: 'none', duration: 3000 })
    
    // 如果有备用密钥，尝试使用备用密钥
    if (mapConfig.qqMapKeyBackup) {
      console.log('尝试使用备用密钥加载地图')
      const backupScript = document.createElement('script')
      h5SdkScript = backupScript
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

async function initializeViewedPoint() {
  if (mapPageDisposed || !viewMode.value || viewInvalidated) return
  const owner = mapViewOwner(), scope = mapViewScope()
  if (viewOwner !== null && owner !== viewOwner) {
    viewInvalidated = true
    viewPoint.value = null; viewLocationInfo.value = null; selectedMarker.value = null
    resetReport()
    uni.showToast({ title: '登录状态已变化，请重新打开点位', icon: 'none' })
    return
  }
  viewOwner = owner
  if (viewPoint.value || viewLookupScope === scope) return
  viewLookupScope = scope
  try {
    const result = await resolveMapViewCard(pageOptions, id => request({ url: `/api/ai/chat/disposal-point/${id}`, needAuth: true, silent: true, timeout: 6000 }))
    if (mapPageDisposed || scope !== mapViewScope()) return
    viewPoint.value = result.point
    viewLocationInfo.value = result.location
    center.value = { latitude: result.location.latitude, longitude: result.location.longitude }
    onH5MarkerClicked(0, result.point)
    if (result.reportRequested) reportErrorMarker(selectedMarker.value, result.reportReason)
  } catch (error) {
    if (mapPageDisposed || scope !== mapViewScope()) return
    uni.showToast({ title: error?.message || error?.msg || '地点暂不可用', icon: 'none' })
  } finally {
    if (viewLookupScope === scope) viewLookupScope = ''
  }
  if (mapPageDisposed || scope !== mapViewScope()) return
  uni.setNavigationBarTitle({ title: '查看位置' })
  ensureH5Sdk()
}
onShow(() => { if (viewMode.value) void initializeViewedPoint() })

onMounted(async () => {
  // 获取页面参数
  const options = pageOptions
  
  // 检查是否为选择位置模式
  if (options.mode === 'select') {
    selectMode.value = true
  }
  
  if (options.mode === 'view') {
    viewMode.value = true
    await initializeViewedPoint()
    return
  }
  ensureH5Sdk()
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
  // #ifdef APP-PLUS
  const location = await getSharedUserLocationOnce(coordType, { highAccuracy: true, includeAccuracy: true })
  console.info('[app-map-location] ' + JSON.stringify({ coordinateSystem: coordType, accuracy: location.accuracy ?? null }))
  return saveLastMapLocation(location)
  // #endif
  // #ifdef MP-WEIXIN
  return saveLastMapLocation(await getSharedUserLocationOnce(coordType))
  // #endif

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
              resolve(saveLastMapLocation({ latitude, longitude }))
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
                  resolve(saveLastMapLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }))
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
  if (h5Disposed) return
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
    tmapInstance = map
    
    // 监听地图瓦片错误
    map.on('error', (error) => {
      if (satellite.value) return
      console.error('地图加载错误:', error)
      uni.showToast({ title: '地图数据加载异常', icon: 'none', duration: 3000 })
    })

    // 视野变化后按视野防抖加载点位（中心移动 >500m 或缩放变化时）
    if (!selectMode.value && !viewMode.value) {
      const reloadFromView = () => {
        const zoom = Number(tmapInstance?.getZoom?.())
        if (Number.isFinite(zoom) && zoom > 0 && zoom !== mapScale.value) {
          mapScale.value = zoom
          renderH5BinMarkers()
        }
        const c = tmapInstance && typeof tmapInstance.getCenter === 'function' ? tmapInstance.getCenter() : null
        if (!c) return
        scheduleViewportReload({
          latitude: typeof c.getLat === 'function' ? c.getLat() : Number(c.lat),
          longitude: typeof c.getLng === 'function' ? c.getLng() : Number(c.lng)
        }, typeof tmapInstance.getZoom === 'function' ? tmapInstance.getZoom() : null)
      }
      map.on('dragend', reloadFromView)
      map.on('zoom', reloadFromView)
      map.on('bounds_changed', reloadFromView)
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
    bindH5Map(map, document.getElementById(mapContainerId))
    // #ifdef H5
    syncH5WalkingRoute(walkingOverlay.value)
    syncH5WalkingPosition(walkingPosition.value)
    // #endif

    // 初始化所有标记
    initH5Markers()
  } catch (error) {
    tmapInstance?.destroy()
    tmapInstance = null
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
    title: point.sharedLocation ? point.name : binMapLabel(point),
    latitude: point.latitude,
    longitude: point.longitude,
    desc: mapPointDescription(point),
    imageUrl: point.image
  }
}

// 小程序/APP：点击 marker 的处理（map 组件触发 markertap） - 使用新API数据结构
function handleClusterTap(group) {
  if (group.expansionZoom != null && mapScale.value < group.expansionZoom) {
    const zoom = Math.min(20, Math.max(mapScale.value + 1, group.expansionZoom))
    const location = { latitude: group.latitude, longitude: group.longitude }
    center.value = location
    setMapZoom(zoom)
    if (isH5 && tmapInstance && window.TMap) {
      tmapInstance.setCenter(new window.TMap.LatLng(location.latitude, location.longitude))
      tmapInstance.setZoom(zoom)
      renderH5BinMarkers()
    } else {
      // #ifdef MP-WEIXIN
      // DevTools only uses the bound center and scale for this camera change.
      if (isWechatDevtools) return
      // #endif
      ensureMapContext()
      mapContext.value?.moveToLocation(location)
    }
    return
  }
  chooseClusterPoint(group, point => point.name || binMapLabel(point), point => onH5MarkerClicked(0, point))
}

function onMarkerTap(e) {
  if (viewMode.value && viewPoint.value) { onH5MarkerClicked(0, viewPoint.value); return }
  const markerId = e && (e.markerId || e.markerId === 0 ? e.markerId : e.detail?.markerId);
  const clusterIndex = -2 - Number(markerId)
  if (Number.isInteger(clusterIndex) && clusterIndex >= 0) {
    const group = mapPointGroups.value[clusterIndex]
    if (group?.type === 'cluster') handleClusterTap(group)
    return
  }
  const point = trashPoints.value.find(p => String(p.id) === String(markerId));
  if (!point) return;

  selectedMarker.value = {
    ...point,
    id: point.id,
    title: binMapLabel(point), // 显示类型作为标题
    latitude: point.latitude,
    longitude: point.longitude,
    desc: mapPointDescription(point),
    imageUrl: point.image
  };
}

// 关闭信息卡
function refreshAdminMarker(id) {
  return refreshSelectedPoint(id, point => onH5MarkerClicked(0, point), closeInfo)
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
let walkingLocateRequest = 0
async function locateOnWalkingMap() {
  const origin = walkingRoute.value?.from
  if (!origin) return
  const epoch = mapViewEpoch
  const requestId = ++walkingLocateRequest
  const isCurrent = () => epoch === mapViewEpoch && requestId === walkingLocateRequest && walkingRoute.value?.from === origin
  // #ifdef MP-WEIXIN
  const nativePoint = await getSharedUserLocationOnce('gcj02', { isCurrent }).catch(() => origin)
  // #endif
  const lift = await getWalkingMapLift(instance)
  if (!isCurrent()) return
  // #ifdef H5
  if (tmapInstance && window.TMap) {
    tmapInstance.setCenter(getTencentFocusCenter(window.TMap, tmapInstance, walkingPosition.value, lift))
  }
  // #endif
  // #ifdef APP-PLUS
  ensureMapContext()
  mapContext.value?.moveToLocation({ ...walkingPosition.value, lift })
  // #endif
  // #ifdef MP-WEIXIN
  ensureMapContext()
  mapContext.value?.moveToLocation(offsetMapCenter(nativePoint, mapScale.value, lift))
  // #endif
  // #ifndef H5 || APP-PLUS || MP-WEIXIN
  ensureMapContext()
  mapContext.value?.moveToLocation({})
  // #endif
}

function openWalkingNavigation() {
  const marker = selectedMarker.value
  const destination = walkingRouteCoordinates(marker)
  if (!destination) {
    uni.showToast({ title: '点位坐标暂不可用', icon: 'none' })
    return
  }
  // #ifdef H5
  const from = walkingRoute.value?.from
  const fromParam = from ? '&from=' + [from.longitude, from.latitude].join(',') : ''
  const to = [destination.longitude, destination.latitude, encodeURIComponent(marker.title || '投放点')].join(',')
  window.open('https://uri.amap.com/navigation?mode=walk&callnative=1&src=fentouxia&to=' + to + fromParam, '_blank', 'noopener,noreferrer')
  // #endif
  // #ifndef H5
  goNavigate(marker)
  // #endif
}

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
    address: mapPointDescription(m, m.desc)
  })
}

// 示例动作：查看历史图片（如果存在 imageUrl）
const imagePreviewLoading = ref(false)
async function openHistoryImage(m) {
  if (imagePreviewLoading.value) return
  imagePreviewLoading.value = true
  let loadingShown = false
  const hidePreviewLoading = () => {
    if (!loadingShown) return
    loadingShown = false
    uni.hideLoading()
  }
  // #ifdef APP-PLUS
  uni.showLoading({ title: '图片加载中...', mask: true })
  loadingShown = true
  // #endif
  try {
    let value = m && m.imageUrl
    if (!value && m && m.hasImage && m.id !== undefined) {
      // 列表只带图片标识，按需拉取完整图片
      const result = await getTrashBinImage(m.id)
      if (result?.code === 0 && result.data?.image) value = result.data.image
    }
    if (!value) {
      hidePreviewLoading()
      uni.showToast({ title: '没有图片', icon: 'none' })
      return
    }
    await previewTrashBinImage(value, { onReady: hidePreviewLoading })
  } catch (error) {
    hidePreviewLoading()
    console.warn('[map-image-preview]', { stage: error?.stage, code: error?.code, detail: error?.detail || error?.errMsg || error?.message })
    uni.showToast({ title: error?.message || error?.errMsg || '图片加载失败，请重试', icon: 'none' })
  } finally {
    hidePreviewLoading()
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
// 新增垃圾桶成功回调 - 使用新API数据结构
function onAddSuccess() {
  if (isMapAdmin.value) loadTrashBinList()
  uni.showToast({ title: '已提交，审核通过后展示并奖励积分', icon: 'none', duration: 2500 })
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
      multi.on('click', () => { if (viewPoint.value) onH5MarkerClicked(0, viewPoint.value) })
      
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
  const targets = new Map()
  mapPointGroups.value.forEach((group, index) => {
    if (group.type === 'cluster') {
      const sample = group.members[0]
      const color = isMapAdmin.value && sample.adminRecord && !sample.review ? '#9ca3af' : sample.type === 'smart' ? '#10b981' : '#3b82f6'
      const styleKey = `cluster-${Math.min(group.count, 1000)}-${color}`
      if (!styles[styleKey]) styles[styleKey] = new window.TMap.MarkerStyle({
        width: 40, height: 40, anchor: { x: 18, y: 36 }, src: clusterIcon(group.count, color)
      })
      const id = `cluster-${index}`
      geometries.push({ id, styleId: styleKey, position: new window.TMap.LatLng(group.latitude, group.longitude), title: `${group.count} 个点位` })
      targets.set(id, { group })
      return
    }
    const p = group.point
    targets.set('trash-geo-' + p.id, { point: p })
    const pending = isMapAdmin.value && p.adminRecord && !p.review
    const reported = isMapAdmin.value && p.adminRecord && binReportCount(p) > 0
    const styleKey = `${p.type === 'smart' ? 'smart' : 'normal'}-${pending ? 'pending' : 'ok'}-${reported ? 'reported' : 'plain'}`
    if (!styles[styleKey]) {
      styles[styleKey] = new window.TMap.MarkerStyle({
        width: 34, height: 34, anchor: { x: 17, y: 33 },
        src: getH5Icon(p.type, pending, reported)
      })
    }
    geometries.push({
      id: 'trash-geo-' + p.id,
      styleId: styleKey,
      position: new window.TMap.LatLng(p.latitude, p.longitude),
      title: binMapLabel(p)
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
        const target = targets.get(gid)
        if (target?.group) handleClusterTap(target.group)
        else if (target?.point) onH5MarkerClicked(0, target.point)
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
.walking-info-card .info-line { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.info-card.walking-info-card { bottom: calc(140rpx + env(safe-area-inset-bottom)); z-index: 101; animation: none; background: #192437; }
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

.info-feedback {
  display: flex;
  justify-content: flex-end;
  margin-top: 8rpx;
}

.info-feedback-link {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 56rpx;
  margin: 0;
  padding: 8rpx 0 8rpx 20rpx;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  color: #94a3b8;
  font-size: 24rpx;
  font-weight: 400;
  line-height: 1.5;
}

.info-feedback-link::after {
  border: none;
}

.info-feedback-link:active {
  opacity: 0.65;
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

.nearby-location-search { display: flex; gap: 12rpx; padding: 8rpx 0 18rpx; }
.nearby-location-search-input { flex: 1; min-width: 0; height: 72rpx; padding: 0 20rpx; box-sizing: border-box; border-radius: 12rpx; background: rgba(255,255,255,.08); color: #f8fafc; font-size: 26rpx; }
.nearby-location-search-button { width: 112rpx; height: 72rpx; line-height: 72rpx; padding: 0; border: 0; border-radius: 12rpx; background: rgba(64,224,255,.14); color: #67e8f9; font-size: 26rpx; }

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

.nearby-location-cover-search { padding: 16rpx 20rpx; margin-bottom: 8rpx; border-radius: 12rpx; background: rgba(255,255,255,.08); color: #cbd5e1; font-size: 26rpx; }

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
  width: 620rpx; max-width: calc(100vw - 64rpx); max-height: calc(100vh - 64rpx); padding: 32rpx; box-sizing: border-box; overflow-y: auto; border-radius: 28rpx;
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
