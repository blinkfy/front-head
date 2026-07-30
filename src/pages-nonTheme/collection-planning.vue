<template>
  <view :class="['layout', isDark ? 'dark-theme' : 'light-theme', { 'admin-light-theme': !isDark }]">

    <!-- ===== 顶部 panel ===== -->
    <view class="panel header-panel">
      <view class="top">
        <view class="page-intro">
          <view class="title">分拣中心清运规划</view>
          <view class="sub">选择需要到访的分拣中心，按地理位置与调度策略生成中心间清运路线。</view>
        </view>
        <view class="btns">
          <AdminScreenHeader screen-key="collectionPlanning" :tone="isDark ? 'dark' : 'light'" @back="goBack">
          <view class="btn secondary" @tap="doLoadCenters">刷新中心</view>
          <view :class="['btn', 'primary', { 'is-disabled': planning }]" @tap="doCreatePlan">{{ planning ? '规划中…' : '一键规划路线' }}</view>
          </AdminScreenHeader>
        </view>
      </view>
      <view class="metrics">
        <view class="metric"><view class="k">分拣中心</view><view class="v">{{ metricTotal }}</view></view>
        <view class="metric"><view class="k">已选中心</view><view class="v">{{ metricUrgent }}</view></view>
        <view class="metric"><view class="k">运行中</view><view class="v">{{ metricAverage }}</view></view>
        <view class="metric"><view class="k">计划总里程</view><view class="v">{{ metricDistance }}</view></view>
      </view>
    </view>

    <!-- ===== 主体：左控制栏 + 右地图 ===== -->
    <view class="main">

      <!-- 左侧控制栏 -->
      <view class="panel controls">

        <!-- 规划参数 -->
        <view class="card planning-card">
          <view class="card-heading">
            <view class="card-title">规划参数</view>
            <view class="card-note">调度规则</view>
          </view>
          <view class="form-grid">
            <view class="form-item">
              <text class="form-label">规划策略</text>
              <picker
                mode="selector"
                :range="routeStrategyOptions"
                range-key="label"
                :value="routeStrategyIndex"
                @change="onRouteStrategyChange"
              >
                <view class="form-picker">{{ routeStrategyLabel }}</view>
              </picker>
            </view>
            <view class="form-item">
              <text class="form-label">车辆速度(km/h)</text>
              <input class="form-input" type="number" :value="opts.speedKmh"
                @input="opts.speedKmh = toNumInput($event, 25)" />
            </view>
            <view class="form-item">
              <text class="form-label">每中心作业(分钟)</text>
              <input class="form-input" type="number" :value="opts.serviceMinutesPerStop"
                @input="opts.serviceMinutesPerStop = toNumInput($event, 6)" />
            </view>
          </view>
        </view>

        <!-- 车辆起点 -->
        <view class="card start-card">
          <view class="card-heading">
            <view class="card-title">车辆起点</view>
            <view class="card-note">地图选点</view>
          </view>
          <view class="form-grid">
            <view class="form-item">
              <text class="form-label">纬度</text>
              <input class="form-input" type="number" :value="startLatStr"
                placeholder="点击地图选择"
                @input="onStartLatInput($event)" />
            </view>
            <view class="form-item">
              <text class="form-label">经度</text>
              <input class="form-input" type="number" :value="startLngStr"
                placeholder="点击地图选择"
                @input="onStartLngInput($event)" />
            </view>
          </view>
          <view class="btns inline-actions">
            <view class="btn" @tap="useMapCenter">使用地图中心</view>
          </view>
          <view :class="['status', statusCls]">{{ statusText }}</view>
        </view>

        <!-- 分拣中心列表 -->
        <view class="card bins-card">
          <view class="card-heading">
            <view class="card-title">分拣中心列表</view>
            <view class="card-note">已选 {{ selectedSortingCenterCount }} 个</view>
          </view>
          <scroll-view class="bin-list sorting-center-list" scroll-y>
            <view
              v-for="center in bins"
              :key="center.id"
              :class="['bin-row', 'sorting-center-row', center.selected ? 'is-selected' : '']"
            >
              <view class="sorting-center-icon">分</view>
              <view class="sorting-center-copy">
                <view class="bin-head">
                  <view class="sorting-center-select" @tap.stop>
                    <switch
                      :checked="center.selected"
                      style="transform:scale(0.72);margin-left:-7px;"
                      @change="onSortingCenterToggle(center.id, $event)"
                    />
                    <text>{{ center.name }}</text>
                  </view>
                  <text class="chip center-running">运行中</text>
                </view>
                <view class="bin-sub">{{ center.location }} · 编号 {{ center.id }}</view>
                <view class="sorting-center-entry" role="button" @tap.stop="openSortingCenter(center)">
                  查看分拣清洗实时进度 <text>→</text>
                </view>
              </view>
            </view>
          </scroll-view>
        </view>
      </view>

      <!-- 右侧地图 + 路线 -->
      <view class="panel map-wrap">
        <!-- #ifdef H5 -->
        <view class="map-stage">
          <view id="map" :class="{ 'is-ready': h5MapReady }"></view>
          <view v-if="!h5MapReady" class="map-placeholder">
            <text class="map-placeholder-title">{{ h5MapError ? '地图暂不可用' : '地图加载中' }}</text>
            <text class="map-placeholder-desc">
              {{ h5MapError || (h5MapLoading ? '分拣中心与路线信息会先展示，地图初始化完成后自动出现。' : '正在准备地图画布。') }}
            </text>
          </view>
        </view>
        <!-- #endif -->
        <!-- #ifndef H5 -->
        <map
          class="mp-map"
          :latitude="mapCenter.latitude"
          :longitude="mapCenter.longitude"
          :scale="mapScale"
          :markers="mapMarkers"
          :polyline="mapPolyline"
          show-location
          @tap="onMapTap"
          @markertap="onMarkerTap"
        ></map>
        <!-- #endif -->

        <view class="route">
          <view class="route-header">
            <view>
              <view class="route-title">最优路线</view>
              <view class="route-summary">{{ routeSummary }}</view>
            </view>
            <view v-if="routeStops.length" class="route-count">{{ routeStops.length }} 个分拣中心</view>
          </view>
          <scroll-view class="route-list" scroll-y>
            <view v-if="!routeStops.length" class="empty">请先选择分拣中心并点击"一键规划路线"。</view>
            <view
              v-for="stop in routeStops"
              :key="'stop-' + stop.order"
              class="route-item"
            >
              <view class="route-order">{{ stop.order }}</view>
              <view>
                <view style="font-weight:680;">{{ stop.name }}</view>
                <view style="color:#607487;margin-top:2px;">
                  ETA {{ fmtTime(stop.eta) }} · 作业 {{ Number(stop.serviceMinutes || 0).toFixed(0) }} 分钟
                </view>
              </view>
              <view style="text-align:right;color:#445d73;">
                <view>{{ Number(stop.travelKm).toFixed(2) }} km</view>
                <view style="font-size:11px;">分拣中心停靠</view>
              </view>
            </view>
          </scroll-view>
        </view>
      </view>

    </view><!-- end .main -->

  </view><!-- end .layout -->
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { baseUrl } from '@/api/settings'
import { mapConfig } from '@/api/map-config'
import { describeApiFailure, redirectIfAccessDenied } from '@/utils/access-guard.js'
import { ensureAdminScreenAccess, goBackFromAdminPage, jumpToAdminPage } from '@/utils/admin-page-nav'
import AdminScreenHeader from '@/components/AdminScreenHeader.vue'
import '@/styles/admin-light-theme.css'

// ─── 常量 ─────────────────────────────────────────────
const QQ_MAP_KEYS = [mapConfig.qqMapKey, mapConfig.qqMapKeyBackup].filter(Boolean)
const DEFAULT_CENTER = { latitude: 36.0671, longitude: 120.3826 }
const ROUTE_STRATEGY_KEY = 'collection_route_strategy'
const DEMO_SORTING_CENTERS = Object.freeze([
  Object.freeze({ id: 'center-main', name: '中山公园分拣中心', location: '中山公园北侧', latitude: 36.0684, longitude: 120.3478 }),
  Object.freeze({ id: 'center-west-lake', name: '小西湖分拣中心', location: '小西湖东侧', latitude: 36.0652, longitude: 120.3415 }),
  Object.freeze({ id: 'center-sakura', name: '樱花大道分拣中心', location: '樱花大道北段', latitude: 36.0626, longitude: 120.3476 })
])

// ─── 工具函数 ──────────────────────────────────────────
function getStorage(key) {
  // #ifdef H5
  return localStorage.getItem(key)
  // #endif
  // #ifndef H5
  const result = uni.getStorageSync(key)
  return result || null
  // #endif
}
function setStorage(key, value) {
  // #ifdef H5
  localStorage.setItem(key, value)
  // #endif
  // #ifndef H5
  uni.setStorageSync(key, value)
  // #endif
}

function toNum(v, fallback = null) {
  const n = Number(v); return Number.isFinite(n) ? n : fallback
}
/** 用于 @input 事件取值并转数字 */
function toNumInput(event, fallback = 0) {
  const v = event && event.detail ? event.detail.value : event
  const n = Number(v); return Number.isFinite(n) ? n : fallback
}
function normalizeStrategy(value) {
  return String(value || '').trim().toLowerCase() === 'shortest_distance'
    ? 'shortest_distance'
    : 'shortest_time'
}
function fmtTime(value) {
  const d = value ? new Date(value) : new Date()
  if (Number.isNaN(d.getTime())) return '--:--'
  return d.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })
}
function getBinStyleId(bin) {
  return bin.selected === false ? 'muted' : 'normal'
}
function authHeaders() {
  const token = getStorage('token') || ''
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = token
  return headers
}

// ─── 主题 ──────────────────────────────────────────────
const isDark = ref(getStorage('app_theme') === 'dark')

// ─── 响应式状态 ────────────────────────────────────────
const statusText = ref('')
const statusCls = ref('')
const routeStrategyOptions = [
  { label: '最短时间', value: 'shortest_time' },
  { label: '最短距离', value: 'shortest_distance' }
]
const routeStrategy = ref(normalizeStrategy(getStorage(ROUTE_STRATEGY_KEY)))
const routeStrategyIndex = computed(() => {
  const index = routeStrategyOptions.findIndex((item) => item.value === routeStrategy.value)
  return index >= 0 ? index : 0
})
const routeStrategyLabel = computed(() => routeStrategyOptions[routeStrategyIndex.value]?.label || routeStrategyOptions[0].label)

const opts = reactive({
  speedKmh: 25,
  serviceMinutesPerStop: 6
})

const bins = ref([])
const routeStops = ref([])
const routeSummary = ref('还未生成路线。')
const planning = ref(false)
const selectedSortingCenterCount = computed(() => bins.value.filter(center => center.selected).length)
const metricTotal = ref('0')
const metricUrgent = ref('0')
const metricAverage = ref('0')
const metricDistance = ref('0 km')

// 起点
const startPoint = ref(null)
const startLatStr = computed(() => startPoint.value ? Number(startPoint.value.latitude).toFixed(6) : '')
const startLngStr = computed(() => startPoint.value ? Number(startPoint.value.longitude).toFixed(6) : '')

// 地图（小程序端）
const mapCenter = ref({ ...DEFAULT_CENTER })
const mapScale = ref(12)
const mapMarkers = ref([])
const mapPolyline = ref([])
const h5MapReady = ref(false)
const h5MapLoading = ref(false)
const h5MapError = ref('')

// H5 地图内部状态（不响应式）
const _map = {
  instance: null,
  ready: false,
  binMarkers: null,
  routePolyline: null,
  sequenceMarkers: null,
  startMarker: null,
  infoWindow: null,
  iconCache: new Map()
}

// ─── 状态 ──────────────────────────────────────────────
function setStatus(text, type) {
  statusText.value = text || ''; statusCls.value = type || ''
}

function onRouteStrategyChange(event) {
  const index = Number(event?.detail?.value)
  const next = routeStrategyOptions[index] || routeStrategyOptions[0]
  routeStrategy.value = next.value
  setStorage(ROUTE_STRATEGY_KEY, next.value)
}

// ─── 指标更新 ──────────────────────────────────────────
function updateMetrics(plan) {
  const centers = bins.value
  const total = centers.length
  const selected = centers.filter(center => center.selected !== false).length
  const running = centers.filter(center => center.status === 'online').length
  metricTotal.value = String(total)
  metricUrgent.value = String(selected)
  metricAverage.value = String(running)
  metricDistance.value = plan && plan.route
    ? `${Number(plan.route.totalDistanceKm || 0).toFixed(2)} km` : '0 km'
}

// ─── 起点输入 ──────────────────────────────────────────
function onStartLatInput(event) {
  const v = toNumInput(event, null)
  if (Number.isFinite(v)) {
    startPoint.value = { ...(startPoint.value || { longitude: DEFAULT_CENTER.longitude }), name: '手动起点', latitude: v }
  }
}
function onStartLngInput(event) {
  const v = toNumInput(event, null)
  if (Number.isFinite(v)) {
    startPoint.value = { ...(startPoint.value || { latitude: DEFAULT_CENTER.latitude }), name: '手动起点', longitude: v }
  }
}

// ─── 分拣中心列表交互 ──────────────────────────────────
function onSortingCenterToggle(centerId, event) {
  const center = bins.value.find(item => item.id === centerId)
  if (!center) return
  center.selected = !!event?.detail?.value
  routeStops.value = []
  routeSummary.value = '还未生成路线。'
  _currentPlan = null
  updateMetrics(null)
  buildMpMapData()
  // #ifdef H5
  drawH5Map()
  // #endif
}

// ─── API ───────────────────────────────────────────────
function apiRequest(path, options) {
  return new Promise((resolve, reject) => {
    const url = path.startsWith('/') ? `${baseUrl}${path}` : path
    const opts2 = options || {}
    // #ifdef H5
    fetch(url, { ...opts2, headers: { ...authHeaders(), ...(opts2.headers || {}) } })
      .then(async (r) => {
        let json = null
        try {
          json = await r.json()
        } catch (_) {}
        if (!json || json.code !== 0 || !r.ok) {
          if (redirectIfAccessDenied(json, r)) {
            throw new Error(describeApiFailure(json, r))
          }
          throw new Error(describeApiFailure(json, r))
        }
        resolve(json.data)
      }).catch(reject)
    // #endif
    // #ifndef H5
    uni.request({
      url, method: opts2.method || 'GET',
      data: opts2.body ? JSON.parse(opts2.body) : undefined,
      header: { ...authHeaders(), ...(opts2.headers || {}) },
      success: res => {
        const json = res.data
        if (!json || json.code !== 0) { reject(new Error((json && json.msg) || `HTTP ${res.statusCode}`)); return }
        resolve(json.data)
      },
      fail: err => reject(new Error(err && err.errMsg ? err.errMsg : String(err)))
    })
    // #endif
  })
}

// ─── 业务操作 ──────────────────────────────────────────
async function doLoadCenters() {
  bins.value = DEMO_SORTING_CENTERS.map(center => ({
    ...center,
    type: 'sorting_center',
    status: 'online',
    selected: true,
    currentFill: 0,
    growthRatePctPerHour: 0,
    history: []
  }))
  routeStops.value = []
  routeSummary.value = '还未生成路线。'
  _currentPlan = null
  if (!startPoint.value) {
    startPoint.value = { name: '清运车辆起点', ...DEFAULT_CENTER }
  }
  updateMetrics(null)
  buildMpMapData()
  // #ifdef H5
  drawH5Map()
  // #endif
  setStatus(`已加载 ${bins.value.length} 个分拣中心`, 'ok')
}

let _currentPlan = null

async function doCreatePlan() {
  if (planning.value) return
  const selectedCenters = bins.value.filter(center => center.selected !== false)
  if (!selectedCenters.length) {
    setStatus('请至少选择一个分拣中心', 'err')
    return
  }
  if (!startPoint.value) {
    startPoint.value = { name: '清运车辆起点', ...DEFAULT_CENTER }
  }
  planning.value = true
  setStatus('正在计算分拣中心清运路线...')
  try {
    const payload = {
      targetType: 'sorting_center',
      start: startPoint.value,
      options: {
        ...opts,
        routeStrategy: routeStrategy.value,
        minStops: selectedCenters.length,
        maxStops: selectedCenters.length,
        startTime: new Date().toISOString()
      },
      centers: selectedCenters.map(center => ({
        id: center.id,
        selected: true,
        name: center.name,
        type: 'sorting_center',
        status: center.status,
        latitude: center.latitude,
        longitude: center.longitude,
        currentFill: 0,
        growthRatePctPerHour: 0,
        history: []
      }))
    }
    const plan = await apiRequest('/api/planning/plan', { method: 'POST', body: JSON.stringify(payload) })
    _currentPlan = plan
    if (plan && plan.options && plan.options.routeStrategy) {
      routeStrategy.value = normalizeStrategy(plan.options.routeStrategy)
      setStorage(ROUTE_STRATEGY_KEY, routeStrategy.value)
    }
    const planCenterMap = new Map((plan.centers || plan.bins || []).map(item => [String(item.id), item]))
    bins.value = bins.value.map(center => {
      const computed = planCenterMap.get(String(center.id))
      return computed ? { ...center, ...computed, selected: center.selected !== false } : center
    })
    routeStops.value = plan.route && Array.isArray(plan.route.stops) ? plan.route.stops : []
    if (plan.route && plan.route.stops && plan.route.stops.length) {
      const r = plan.route
      routeSummary.value = `${routeStrategyLabel.value}｜分拣中心 ${r.stops.length} 个，里程 ${Number(r.totalDistanceKm || 0).toFixed(2)} km，预计 ${Number(r.totalMinutes || 0).toFixed(1)} min`
    } else {
      routeSummary.value = '未生成分拣中心路线。'
    }
    updateMetrics(plan)
    buildMpMapData()
    // #ifdef H5
    drawH5Map()
    // #endif
    setStatus('分拣中心路线规划完成', 'ok')
  } catch (err) {
    setStatus(err && err.message ? err.message : String(err), 'err')
  } finally {
    planning.value = false
  }
}

function useMapCenter() {
  // #ifdef H5
  if (_map.instance) {
    const center = _map.instance.getCenter()
    const lat = typeof center?.getLat === 'function' ? center.getLat() : center?.lat
    const lng = typeof center?.getLng === 'function' ? center.getLng() : center?.lng
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      startPoint.value = { name: '地图中心起点', latitude: lat, longitude: lng }
      drawH5Map()
    }
  }
  // #endif
  // #ifndef H5
  startPoint.value = { name: '地图中心起点', latitude: mapCenter.value.latitude, longitude: mapCenter.value.longitude }
  // #endif
}

// ─── 导航 ──────────────────────────────────────────────
function openSortingCenter(center) {
  if (!center) return
  jumpToAdminPage('collectionDashboard', {
    from: 'collectionPlanning',
    query: {
      view: 'sorting',
      centerId: center.id,
      centerName: center.name
    }
  })
}

function goBack() {
  goBackFromAdminPage('collectionPlanning')
}

// ─── 小程序地图数据 ────────────────────────────────────
function buildMpMapData() {
  const centers = bins.value
  const markers = centers.map((center, i) => ({
    id: i,
    latitude: Number(center.latitude) || 0,
    longitude: Number(center.longitude) || 0,
    title: center.name,
    width: 26, height: 26,
    callout: { content: `${center.name}\n${center.selected === false ? '未选择' : '已选择参与规划'}`, display: 'BYCLICK', color: '#17324a', fontSize: 12, borderRadius: 6, bgColor: '#fff', padding: 6 },
    iconPath: ''
  }))
  const polylineArr = []
  if (_currentPlan && _currentPlan.route && Array.isArray(_currentPlan.route.polyline) && _currentPlan.route.polyline.length > 1) {
    polylineArr.push({
      points: _currentPlan.route.polyline.map(p => ({ latitude: p[0], longitude: p[1] })),
      color: isDark.value ? '#2f6ff0cc' : '#18a77ccc', width: 6
    })
  }
  mapMarkers.value = markers
  mapPolyline.value = polylineArr
  if (startPoint.value) mapCenter.value = { latitude: startPoint.value.latitude, longitude: startPoint.value.longitude }
  else if (centers.length) mapCenter.value = { latitude: Number(centers[0].latitude) || DEFAULT_CENTER.latitude, longitude: Number(centers[0].longitude) || DEFAULT_CENTER.longitude }
}

function onMapTap(event) {
  // #ifndef H5
  const lat = event?.detail?.latitude
  const lng = event?.detail?.longitude
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    startPoint.value = { name: '地图选定起点', latitude: lat, longitude: lng }
  }
  // #endif
}
function onMarkerTap(event) {
  const i = event?.detail?.markerId
  if (!Number.isFinite(i)) return
  const center = bins.value[i]
  if (!center) return
  mapCenter.value = { latitude: Number(center.latitude), longitude: Number(center.longitude) }
  mapScale.value = 14
}

// ─── H5 腾讯地图 ───────────────────────────────────────
// #ifdef H5
function getIconSrc(key, fillColor, label) {
  if (_map.iconCache.has(key)) return _map.iconCache.get(key)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="14" fill="${fillColor}" stroke="#ffffff" stroke-width="3"></circle><text x="22" y="26" text-anchor="middle" font-size="13" font-weight="700" fill="#fff" font-family="Arial">${label || ''}</text></svg>`
  const src = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
  _map.iconCache.set(key, src); return src
}
function clearH5MapOverlays() {
  if (_map.binMarkers) { _map.binMarkers.setMap(null); _map.binMarkers = null }
  if (_map.routePolyline) { _map.routePolyline.setMap(null); _map.routePolyline = null }
  if (_map.sequenceMarkers) { _map.sequenceMarkers.setMap(null); _map.sequenceMarkers = null }
  if (_map.startMarker) { _map.startMarker.setMap(null); _map.startMarker = null }
}
function showInfoWindow(lat, lng, html) {
  if (!window.TMap || !_map.instance) return
  const pos = new window.TMap.LatLng(lat, lng)
  if (!_map.infoWindow) { _map.infoWindow = new window.TMap.InfoWindow({ map: _map.instance, position: pos, content: html }); return }
  _map.infoWindow.setMap(_map.instance); _map.infoWindow.setPosition(pos); _map.infoWindow.setContent(html)
}
function drawH5Map() {
  if (!_map.instance || !window.TMap) return
  clearH5MapOverlays()
  const TMap = window.TMap
  const centers = bins.value
  const bounds = new TMap.LatLngBounds(); let hasBounds = false

  const binStyles = {
    normal: new TMap.MarkerStyle({ width: 26, height: 26, anchor: { x: 13, y: 13 }, src: getIconSrc('bin-normal', '#1fb57d', '') }),
    warning: new TMap.MarkerStyle({ width: 26, height: 26, anchor: { x: 13, y: 13 }, src: getIconSrc('bin-warning', '#e0a100', '') }),
    high: new TMap.MarkerStyle({ width: 26, height: 26, anchor: { x: 13, y: 13 }, src: getIconSrc('bin-high', '#d06919', '') }),
    urgent: new TMap.MarkerStyle({ width: 26, height: 26, anchor: { x: 13, y: 13 }, src: getIconSrc('bin-urgent', '#c63b3b', '') }),
    muted: new TMap.MarkerStyle({ width: 24, height: 24, anchor: { x: 12, y: 12 }, src: getIconSrc('bin-muted', '#8ea1b5', '') })
  }
  const binGeos = centers.map((center, i) => {
    const p = new TMap.LatLng(center.latitude, center.longitude); bounds.extend(p); hasBounds = true
    return { id: 'center-' + i, styleId: getBinStyleId(center), title: center.name || ('分拣中心-' + (i + 1)), position: p }
  })
  if (binGeos.length) {
    _map.binMarkers = new TMap.MultiMarker({ id: 'planning-sorting-centers', map: _map.instance, styles: binStyles, geometries: binGeos })
    _map.binMarkers.on('click', evt => {
      const id = evt?.geometry?.id || ''
      const i = Number(String(id).replace('center-', ''))
      const center = centers[i]; if (!center) return
      showInfoWindow(center.latitude, center.longitude, `<div style="font-size:12px;line-height:1.5"><b>${center.name || '未命名分拣中心'}</b><br/>位置：${center.location || '--'}<br/>规划状态：${center.selected === false ? '未选择' : '已选择'}</div>`)
    })
  }

  if (startPoint.value) {
    const sp = new TMap.LatLng(startPoint.value.latitude, startPoint.value.longitude)
    _map.startMarker = new TMap.MultiMarker({ id: 'planning-start', map: _map.instance, styles: { start: new TMap.MarkerStyle({ width: 34, height: 34, anchor: { x: 17, y: 17 }, src: getIconSrc('start', isDark.value ? '#2f6ff0' : '#18a77c', 'S') }) }, geometries: [{ id: 'start-point', styleId: 'start', position: sp }] })
    bounds.extend(sp); hasBounds = true
  }

  if (_currentPlan?.route && Array.isArray(_currentPlan.route.polyline) && _currentPlan.route.polyline.length > 1) {
    const paths = _currentPlan.route.polyline.map(p => new TMap.LatLng(p[0], p[1]))
    _map.routePolyline = new TMap.MultiPolyline({ id: 'planning-route', map: _map.instance, styles: { route: new TMap.PolylineStyle({ color: isDark.value ? '#2f6ff0' : '#18a77c', width: 6, borderWidth: 2, borderColor: '#ffffff', lineCap: 'round' }) }, geometries: [{ id: 'route-main', styleId: 'route', paths }] })
    paths.forEach(p => { bounds.extend(p); hasBounds = true })
    const stopStyles = {}; const stopGeos = (_currentPlan.route.stops || []).map((stop, idx) => {
      const sid = 'stop-' + stop.order
      if (!stopStyles[sid]) stopStyles[sid] = new TMap.MarkerStyle({ width: 26, height: 26, anchor: { x: 13, y: 13 }, src: getIconSrc(sid, isDark.value ? '#1f62db' : '#18a77c', String(stop.order)) })
      return { id: 'stop-' + idx, styleId: sid, position: new TMap.LatLng(stop.latitude, stop.longitude) }
    })
    if (stopGeos.length) _map.sequenceMarkers = new TMap.MultiMarker({ id: 'planning-stop-seq', map: _map.instance, styles: stopStyles, geometries: stopGeos })
  }
  if (hasBounds && _map.instance.fitBounds) _map.instance.fitBounds(bounds, { padding: 70 })
}
async function loadTMapSdk() {
  if (window.TMap) return
  for (const key of QQ_MAP_KEYS) {
    try {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script'); s.src = `https://map.qq.com/api/gljs?v=1.exp&key=${key}`
        s.async = true; s.onload = resolve; s.onerror = () => reject(new Error(`failed key ${key}`))
        document.head.appendChild(s)
      })
      if (window.TMap) return
    } catch (e) { console.warn('[planning-map] sdk load failed:', e?.message) }
  }
  throw new Error('腾讯地图 SDK 加载失败')
}
async function initH5Map() {
  await loadTMapSdk()
  _map.instance = new window.TMap.Map('map', { center: new window.TMap.LatLng(DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude), zoom: 12, viewMode: '2D' })
  _map.ready = true
  _map.instance.on('click', evt => {
    const lat = typeof evt?.latLng?.getLat === 'function' ? evt.latLng.getLat() : null
    const lng = typeof evt?.latLng?.getLng === 'function' ? evt.latLng.getLng() : null
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    startPoint.value = { name: '地图选定起点', latitude: lat, longitude: lng }
    drawH5Map()
  })
}
// #endif

// ─── 生命周期 ──────────────────────────────────────────
onMounted(async () => {
  if (!await ensureAdminScreenAccess('collectionPlanning')) return
  isDark.value = getStorage('app_theme') === 'dark'
  // #ifdef H5
  const onStorage = () => { isDark.value = getStorage('app_theme') === 'dark' }
  window.addEventListener('storage', onStorage)
  // #endif
  const loadCentersPromise = doLoadCenters().catch((error) => {
    setStatus(error?.message || String(error), 'err')
  })
  // #ifdef H5
  h5MapLoading.value = true
  h5MapError.value = ''
  initH5Map()
    .then(() => {
      h5MapReady.value = true
      h5MapLoading.value = false
      drawH5Map()
    })
    .catch((error) => {
      h5MapLoading.value = false
      h5MapError.value = error && error.message ? error.message : '地图加载失败'
      console.error('[collection-planning] map init failed:', error)
    })
  // #endif
  await loadCentersPromise
  // #ifdef H5
  window._planningOnStorage = onStorage
  // 挂载清理函数（onBeforeUnmount 不能捕获 onStorage 闭包，用全局变量中转）
  window._planningOnStorage = onStorage
  // #endif
})

onBeforeUnmount(() => {
  // #ifdef H5
  if (window._planningOnStorage) { window.removeEventListener('storage', window._planningOnStorage); delete window._planningOnStorage }
  clearH5MapOverlays()
  if (_map.infoWindow) { _map.infoWindow.setMap(null); _map.infoWindow = null }
  if (_map.instance) { try { _map.instance.destroy() } catch (_) {} _map.instance = null }
  // #endif
})
</script>

<style scoped>
/* ─── box-sizing 通用 ─────────────────────────────────── */
/* #ifdef H5 */
* { box-sizing: border-box; }
/* #endif */
/* #ifndef H5 */
page,view,text,scroll-view,swiper,button,form,input,textarea,
label,navigator,image,div,span { box-sizing: border-box; }
/* #endif */

/* ===== 命名空间隔离：所有选择器须在 .layout 根节点下 ===== */

/* ─── CSS 变量（浅色主题默认） ─────────────────────────── */
.layout {
  --bg-1: #f6f9ff;
  --bg-2: #eef6f0;
  --card: rgba(255,255,255,0.86);
  --line: #dce7ef;
  --text: #17232f;
  --sub: #5f7284;
  --blue: #1e5dd8;
  --green: #0f9a66;
  --amber: #e0a100;
  --orange: #d06919;
  --red: #c63b3b;
  --shadow: 0 16px 42px rgba(15,37,63,0.08);
  --accent: #2f6ff0;
  --input-bg: #fcfeff;
  --input-border: #cbdbe8;
}
.layout.dark-theme {
  --bg-1: #0f1823;
  --bg-2: #101b27;
  --card: rgba(18,31,45,0.86);
  --line: #36526a;
  --text: #d4e4f1;
  --sub: #9eb4c6;
  --blue: #4a86f6;
  --green: #1ab57d;
  --amber: #e9b247;
  --orange: #e0893d;
  --red: #e26262;
  --shadow: 0 16px 42px rgba(0,0,0,0.36);
  --input-bg: #132435;
  --input-border: #3c5d78;
}

/* ─── 根布局 ─────────────────────────────────────────── */
.layout {
  min-height: 100vh;
  font-family: "Source Han Sans SC","Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif;
  color: var(--text);
  background:
    radial-gradient(980px 500px at 88% -8%, rgba(30,93,216,0.16), transparent 58%),
    radial-gradient(880px 420px at -16% 18%, rgba(15,154,102,0.18), transparent 57%),
    linear-gradient(155deg, var(--bg-1), var(--bg-2));
  padding: 18px;
  display: grid;
  gap: 14px;
  animation: riseIn 0.45s ease both;
}
.layout.dark-theme {
  background:
    radial-gradient(980px 500px at 88% -8%, rgba(74,134,246,0.16), transparent 58%),
    radial-gradient(880px 420px at -16% 18%, rgba(26,181,125,0.14), transparent 57%),
    linear-gradient(155deg, var(--bg-1), var(--bg-2));
}
@keyframes riseIn {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ─── 面板 ───────────────────────────────────────────── */
.layout .panel {
  background: var(--card);
  border: 1px solid rgba(255,255,255,0.95);
  border-radius: 18px;
  box-shadow: var(--shadow);
  backdrop-filter: blur(7px);
}
.layout.dark-theme .panel { border-color: rgba(74,107,133,0.36); }

/* ─── 顶部 ───────────────────────────────────────────── */
.layout .top {
  padding: 10px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.layout .title { font-size: 18px; font-weight: 780; letter-spacing: 0.3px; }
.layout .sub { margin-top: 2px; color: var(--sub); font-size: 12px; }

/* ─── 按钮 ───────────────────────────────────────────── */
.layout .btns { display: flex; flex-wrap: wrap; gap: 8px; }
.layout .btn {
  border: 0; border-radius: 12px; padding: 10px 12px; font-size: 13px;
  cursor: pointer; background: #edf2f8; color: #2a4357;
}
.layout.dark-theme .btn { background: #1a2d3f; color: #c4daee; }
.layout .btn.primary {
  background: linear-gradient(135deg, var(--green), #1fb57d);
  color: #fff; box-shadow: 0 10px 24px rgba(15,154,102,0.25);
}
.layout .btn.blue {
  background: linear-gradient(135deg, var(--blue), #4f86ef);
  color: #fff; box-shadow: 0 10px 24px rgba(30,93,216,0.24);
}

/* ─── 指标 ───────────────────────────────────────────── */
.layout .metrics {
  display: grid; grid-template-columns: repeat(4, minmax(0,1fr));
  gap: 8px; padding: 0 12px 10px;
}
.layout .metric {
  border: 1px solid var(--line); border-radius: 10px;
  padding: 7px 10px; background: rgba(255,255,255,0.85);
}
.layout.dark-theme .metric { background: rgba(17,29,43,0.85); }
.layout .metric .k { font-size: 11px; color: var(--sub); }
.layout .metric .v { margin-top: 3px; font-weight: 760; font-size: 18px; }

/* ─── 主区域 ─────────────────────────────────────────── */
.layout .main {
  display: grid;
  grid-template-columns: 370px 1fr;
  gap: 12px;
}

/* ─── 左侧控制栏 ─────────────────────────────────────── */
.layout .controls { padding: 12px; display: grid; gap: 10px; min-height: 78vh; }

/* ─── 卡片 ───────────────────────────────────────────── */
.layout .card {
  border: 1px solid var(--line); border-radius: 14px;
  padding: 11px; background: rgba(255,255,255,0.86);
}
.layout.dark-theme .card { background: rgba(18,31,45,0.86); }
.layout .card-title { margin: 0 0 8px; font-size: 14px; font-weight: 700; }

/* ─── 表单 ───────────────────────────────────────────── */
.layout .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
.layout .form-item { display: grid; gap: 3px; font-size: 12px; color: #344f65; }
.layout .form-label { font-size: 12px; color: var(--sub); }
.layout .form-input {
  display: block; width: 100%; height: 36px; line-height: 36px;
  border: 1px solid var(--input-border); border-radius: 9px;
  padding: 0 9px; font-size: 13px; outline: none;
  background: var(--input-bg); color: var(--text);
  box-sizing: border-box;
}
.layout.dark-theme .form-input { color: var(--text); }

/* ─── 状态 ───────────────────────────────────────────── */
.layout .status { font-size: 12px; color: var(--sub); min-height: 16px; margin-top: 6px; }
.layout .status.ok { color: #198754; }
.layout .status.err { color: #c63b3b; }

/* ─── 图例 ───────────────────────────────────────────── */
.layout .legend {
  display: flex; flex-wrap: wrap; gap: 8px 10px;
  font-size: 12px; color: #365065; padding: 0 2px 6px;
}
.layout .legend-dot {
  display: inline-block; width: 10px; height: 10px;
  border-radius: 50%; margin-right: 4px;
  vertical-align: middle;
}

/* ─── 桶位列表 ───────────────────────────────────────── */
.layout .bin-list {
  border: 1px solid var(--line); border-radius: 12px;
  max-height: 50vh; overflow: auto;
  background: rgba(247,251,255,0.72); padding: 6px; display: grid; gap: 6px;
  scrollbar-width: thin;
  scrollbar-color: #4a86f6 rgba(47,111,240,0.08);
}
.layout .bin-list::-webkit-scrollbar { width: 6px; }
.layout .bin-list::-webkit-scrollbar-track { background: rgba(47,111,240,0.06); border-radius: 3px; }
.layout .bin-list::-webkit-scrollbar-thumb { background: linear-gradient(180deg,#4a86f6,#2f6ff0); border-radius: 3px; }
.layout .bin-list::-webkit-scrollbar-button { display: none; }
.layout.dark-theme .bin-list { background: rgba(17,30,44,0.72); }

.layout .bin-row {
  border: 1px solid #d7e5f1; border-radius: 11px; padding: 8px;
  background: #fff; display: grid; gap: 6px;
}
.layout.dark-theme .bin-row { border-color: #355069; background: #142436; }
.layout .bin-head {
  display: flex; justify-content: space-between; align-items: center;
  gap: 8px; font-size: 13px; font-weight: 630;
}
.layout .bin-sub { color: var(--sub); font-size: 11px; line-height: 1.4; }
.layout .chip {
  border-radius: 999px; padding: 2px 8px; font-size: 11px;
  color: #fff; background: #7d93a8;
}
.layout .chip.urgent { background: linear-gradient(135deg,#da4a4a,#ee6b4a); }
.layout .chip.warning { background: linear-gradient(135deg,#d08625,#ecb73e); }

.layout .bin-range {
  display: grid; grid-template-columns: 1fr 68px;
  align-items: center; gap: 7px;
}
.layout .fill-slider { width: 100%; }
.layout .fill-input {
  display: block; width: 68px; height: 28px; line-height: 28px;
  text-align: center;
  border: 1px solid var(--input-border); border-radius: 8px;
  background: var(--input-bg); color: var(--text); font-size: 12px;
  box-sizing: border-box; padding: 0 4px;
}

.layout .empty { text-align: center; color: #6f8395; font-size: 13px; padding: 24px 6px; }

/* ─── 右侧地图区 ─────────────────────────────────────── */
.layout .map-wrap {
  padding: 12px; display: grid;
  grid-template-rows: 56vh 1fr; gap: 10px;
}
/* #ifdef H5 */
.layout .map-stage { position: relative; width: 100%; height: 100%; }
#map {
  width: 100%; height: 100%;
  border-radius: 14px; border: 1px solid var(--line); overflow: hidden;
  opacity: 0; transition: opacity .24s ease;
}
#map.is-ready { opacity: 1; }
.layout .map-placeholder {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; padding: 20px;
  border: 1px dashed var(--line);
  border-radius: 14px;
  background: rgba(247, 251, 255, 0.92);
  text-align: center;
}
.layout.dark-theme .map-placeholder { background: rgba(18, 31, 45, 0.92); }
.layout .map-placeholder-title {
  font-size: 15px; font-weight: 700; color: var(--text);
}
.layout .map-placeholder-desc {
  max-width: 320px; font-size: 12px; line-height: 1.6; color: var(--sub);
}
/* #endif */
.layout .mp-map { width: 100%; height: 100%; border-radius: 14px; border: 1px solid var(--line); overflow: hidden; }

/* ─── 路线面板 ───────────────────────────────────────── */
.layout .route {
  border: 1px solid var(--line); border-radius: 14px;
  background: rgba(255,255,255,0.88); padding: 10px;
  display: grid; gap: 8px; min-height: 25vh;
}
.layout.dark-theme .route { background: rgba(18,31,45,0.88); }
.layout .route-summary { font-size: 13px; color: #254052; }

.layout .route-list {
  max-height: 26vh; overflow: auto; display: grid; gap: 6px;
  scrollbar-width: thin;
  scrollbar-color: #4a86f6 rgba(47,111,240,0.08);
}
.layout .route-list::-webkit-scrollbar { width: 6px; }
.layout .route-list::-webkit-scrollbar-track { background: rgba(47,111,240,0.06); border-radius: 3px; }
.layout .route-list::-webkit-scrollbar-thumb { background: linear-gradient(180deg,#4a86f6,#2f6ff0); border-radius: 3px; }
.layout .route-list::-webkit-scrollbar-button { display: none; }

.layout .route-item {
  border: 1px solid #d7e5f0; border-radius: 10px; padding: 8px;
  background: #fff; display: grid; grid-template-columns: 40px 1fr auto;
  gap: 7px; align-items: center; font-size: 12px;
}
.layout.dark-theme .route-item { border-color: #355069; background: #142436; }

.layout .route-order {
  width: 28px; height: 28px; border-radius: 50%;
  background: linear-gradient(135deg,#2e68de,#4e87ec);
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 12px;
}

/* ─── CSS 变量（浅色主题默认） ─────────────────────────── */
.layout {
  --bg-1: #f6f9ff;
  --bg-2: #eef6f0;
  --panel: rgba(255,255,255,0.82);
  --panel-border: rgba(200,218,255,0.6);
  --text: #17324a;
  --text-2: #4a637c;
  --accent: #2f6ff0;
  --accent-2: #0f9a66;
  --shadow: 0 4px 20px rgba(47,111,240,0.10);
  --input-bg: rgba(240,246,255,0.9);
  --input-border: rgba(170,198,248,0.7);
  --tag-bg: rgba(47,111,240,0.10);
  --ok: #1c9c58;
  --err: #c63b3b;
  --warn: #cc7e00;
  --urgent: #c63b3b;
  --high: #d06919;
  --warning: #e0a100;
  --normal: #1fb57d;
  --muted: #8ea1b5;
}
.layout.dark-theme {
  --bg-1: #10192a;
  --bg-2: #0e1c14;
  --panel: rgba(22,36,56,0.88);
  --panel-border: rgba(47,111,240,0.22);
  --text: #d8eaff;
  --text-2: #7a9ec8;
  --accent: #4a86f6;
  --accent-2: #1ab57d;
  --shadow: 0 4px 24px rgba(0,0,0,0.36);
  --input-bg: rgba(20,32,54,0.9);
  --input-border: rgba(47,111,240,0.35);
  --tag-bg: rgba(47,111,240,0.18);
}

/* ─── 顶栏 ───────────────────────────────────────────── */
.layout .top {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.layout .back-btn {
  width: 34px; height: 34px;
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  font-size: 18px;
  color: var(--text);
}
.layout .page-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
  flex: 1;
}
.layout .status-bar {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 12px;
  background: var(--tag-bg);
  color: var(--text-2);
}
.layout .status-bar.ok { color: var(--ok); }
.layout .status-bar.err { color: var(--err); }

/* ─── 指标卡 ─────────────────────────────────────────── */
.layout .metrics {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.layout .metric-card {
  flex: 1;
  min-width: 80px;
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  padding: 10px 12px;
  box-shadow: var(--shadow);
}
.layout .metric-label {
  font-size: 11px;
  color: var(--text-2);
  margin-bottom: 4px;
}
.layout .metric-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--accent);
}

/* ─── 主区域 ─────────────────────────────────────────── */
.layout .main {
  display: flex;
  gap: 12px;
  flex: 1;
}

/* ─── 左侧控制面板 ───────────────────────────────────── */
.layout .controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 380px;
  min-width: 280px;
}

/* ─── 卡片 ───────────────────────────────────────────── */
.layout .card {
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: 14px;
  padding: 14px;
  box-shadow: var(--shadow);
}
.layout .card-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 10px;
  letter-spacing: 0.02em;
}

/* ─── 表单网格 ───────────────────────────────────────── */
.layout .form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.layout .form-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.layout .form-label {
  font-size: 11px;
  color: var(--text-2);
}
.layout .form-input {
  display: block;
  width: 100%;
  height: 34px;
  line-height: 34px;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 8px;
  color: var(--text);
  font-size: 13px;
  padding: 0 10px;
  box-sizing: border-box;
}
.layout .form-picker {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid var(--input-border);
  border-radius: 8px;
  background: var(--input-bg);
  color: var(--text);
  font-size: 13px;
  box-sizing: border-box;
}
.layout .form-2col {
  display: flex;
  gap: 8px;
}
.layout .form-2col .form-row {
  flex: 1;
}

/* ─── 起点行 ─────────────────────────────────────────── */
.layout .start-row {
  display: flex;
  align-items: flex-end;
  gap: 6px;
}
.layout .start-row .form-input {
  flex: 1;
  font-size: 12px;
}
.layout .btn-sm {
  height: 34px;
  line-height: 34px;
  padding: 0 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  white-space: nowrap;
  background: var(--accent);
  color: #fff;
}
.layout .btn-sm:active { opacity: 0.8; }

/* ─── 操作按钮 ───────────────────────────────────────── */
.layout .actions {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.layout .btn-primary {
  display: block;
  width: 100%;
  height: 38px;
  line-height: 38px;
  text-align: center;
  background: linear-gradient(90deg, var(--accent), #5587f8);
  color: #fff;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  box-shadow: 0 3px 12px rgba(47,111,240,0.28);
}
.layout .btn-primary:active { opacity: 0.85; }
.layout .btn-secondary {
  display: block;
  width: 100%;
  height: 36px;
  line-height: 36px;
  text-align: center;
  background: var(--input-bg);
  color: var(--text-2);
  border: 1px solid var(--input-border);
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.layout .btn-secondary:active { opacity: 0.8; }

/* ─── 桶位列表 ───────────────────────────────────────── */
.layout .bin-list {
  flex: 1;
  overflow-y: auto;
  max-height: 420px;
  scrollbar-width: thin;
  scrollbar-color: #4a86f6 rgba(47,111,240,0.08);
}
.layout .bin-list::-webkit-scrollbar { width: 6px; }
.layout .bin-list::-webkit-scrollbar-track { background: rgba(47,111,240,0.06); border-radius: 3px; }
.layout .bin-list::-webkit-scrollbar-thumb { background: linear-gradient(180deg,#4a86f6,#2f6ff0); border-radius: 3px; }
.layout .bin-list::-webkit-scrollbar-button { display: none; }

.layout .bin-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--panel-border);
}
.layout .bin-item:last-child { border-bottom: none; }

.layout .bin-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
  margin-top: 4px;
  flex-shrink: 0;
}
.layout .bin-dot.normal { background: var(--normal); }
.layout .bin-dot.warning { background: var(--warning); }
.layout .bin-dot.high { background: var(--high); }
.layout .bin-dot.urgent { background: var(--urgent); }
.layout .bin-dot.muted { background: var(--muted); }

.layout .bin-main { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.layout .bin-name { font-size: 12px; font-weight: 600; color: var(--text); }
.layout .bin-meta { font-size: 11px; color: var(--text-2); }
.layout .bin-fill-control { display: flex; align-items: center; gap: 6px; }
.layout .bin-slider { flex: 1; }
.layout .bin-fill-input {
  width: 44px; height: 26px; line-height: 26px;
  text-align: center;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 6px;
  color: var(--text);
  font-size: 11px;
  display: block;
  box-sizing: border-box;
}

/* ─── 中间地图区 ─────────────────────────────────────── */
.layout .map-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.layout .map-wrap {
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: var(--shadow);
  flex: 1;
  min-height: 360px;
  position: relative;
}
/* #ifdef H5 */
#map {
  width: 100%; height: 100%;
  min-height: 360px;
}
/* #endif */
.layout .map-comp { width: 100%; height: 100%; min-height: 360px; }

/* ─── 路线列表 ───────────────────────────────────────── */
.layout .route-card {
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: 14px;
  padding: 14px;
  box-shadow: var(--shadow);
}
.layout .route-summary {
  font-size: 12px;
  color: var(--text-2);
  margin-bottom: 8px;
}
.layout .route-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #4a86f6 rgba(47,111,240,0.08);
}
.layout .route-list::-webkit-scrollbar { width: 6px; }
.layout .route-list::-webkit-scrollbar-track { background: rgba(47,111,240,0.06); border-radius: 3px; }
.layout .route-list::-webkit-scrollbar-thumb { background: linear-gradient(180deg,#4a86f6,#2f6ff0); border-radius: 3px; }
.layout .route-list::-webkit-scrollbar-button { display: none; }

.layout .route-stop {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
}
.layout .stop-order {
  width: 22px; height: 22px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}

/* ─── 响应式适配（≤900px 平板/横屏手机） ─────────────── */
@media (max-width: 900px) {
  .layout .main { flex-direction: column; }
  .layout .controls { width: 100%; min-width: unset; min-height: auto; }
  .layout .map-wrap { min-height: 52vh; }
  .layout .metrics { flex-wrap: wrap; }
}

/* ─── 手机端适配（≤640px） ──────────────────────────── */
@media (max-width: 640px) {
  .layout { padding: 10px; }
  .layout .top { margin-bottom: 10px; }
  .layout .metrics { gap: 6px; margin-bottom: 10px; }
  .layout .metric-card { min-width: calc(50% - 3px); padding: 8px 10px; }
  .layout .metric-value { font-size: 16px; }
  .layout .page-title { font-size: 16px; }
  .layout .main { flex-direction: column; gap: 10px; }
  .layout .controls { width: 100%; min-width: unset; }
  .layout .form-grid { grid-template-columns: 1fr; gap: 6px; }
  .layout .form-input { height: 38px; line-height: 38px; font-size: 13px; }
  .layout .bin-list { max-height: 45vh; }
  .layout .map-wrap { min-height: 260px; }
  .layout .route-list { max-height: 180px; }
}

/* ─── 超小屏（≤380px） ──────────────────────────────── */
@media (max-width: 380px) {
  .layout { padding: 8px; }
  .layout .page-title { font-size: 14px; }
  .layout .metric-card { min-width: calc(50% - 3px); }
  .layout .metric-value { font-size: 14px; }
  .layout .map-wrap { min-height: 220px; }
  .layout .bin-list { max-height: 38vh; }
}

/* ─── Collection planning visual refresh ─────────────────────────────── */
.layout {
  --canvas: #f4f7fb;
  --surface: #ffffff;
  --surface-soft: #f8fbff;
  --line: #dfe8f3;
  --line-strong: #c8d8ea;
  --text: #18324c;
  --sub: #6b8198;
  --accent: #1769e0;
  --accent-soft: #eaf2ff;
  --success: #139b68;
  --shadow: 0 10px 28px rgba(34, 68, 111, 0.08);
  min-height: 100vh;
  box-sizing: border-box;
  padding: 18px;
  gap: 10px;
  background: var(--canvas);
  color: var(--text);
  font-family: Inter, "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
}

.layout.dark-theme {
  --canvas: #101a28;
  --surface: #162333;
  --surface-soft: #1b2b3e;
  --line: #2e465f;
  --line-strong: #3b5877;
  --text: #e6f0fb;
  --sub: #93aac1;
  --accent: #5d9cff;
  --accent-soft: #203d67;
  --success: #49c995;
  --shadow: 0 12px 30px rgba(0, 0, 0, 0.2);
}

.layout .panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
  box-shadow: var(--shadow);
}

.layout .header-panel {
  position: relative;
  z-index: 100;
  overflow: visible;
  padding: 16px 18px 12px;
  margin-bottom: 6px;
}

.layout .top {
  min-height: 44px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin: 0 0 14px;
}

.layout .page-intro { min-width: 0; }
.layout .title {
  color: var(--text);
  font-size: clamp(20px, 1.35vw, 26px);
  line-height: 1.25;
  font-weight: 750;
  letter-spacing: -0.02em;
}
.layout .sub {
  max-width: 680px;
  margin-top: 5px;
  color: var(--sub);
  font-size: 12px;
  line-height: 1.55;
}

.layout .btns {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.layout .btn {
  display: inline-flex;
  height: var(--admin-screen-control-height, 36px);
  min-height: var(--admin-screen-control-height, 36px);
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: var(--admin-screen-control-radius, 8px);
  background: var(--surface);
  color: #486179;
  font-size: var(--admin-screen-control-font-size, 13px);
  font-weight: var(--admin-screen-control-font-weight, 650);
  line-height: 1;
  transition: border-color .18s ease, background-color .18s ease, color .18s ease, transform .18s ease;
  cursor: pointer;
  white-space: nowrap;
}
.layout .btn:hover { border-color: #9dbce5; background: var(--accent-soft); color: var(--accent); }
.layout .btn:active { transform: translateY(1px); }
.layout .btn.is-disabled,
.layout .btn.is-disabled:hover,
.layout .btn.is-disabled:active {
  cursor: wait;
  opacity: .62;
  transform: none;
  filter: saturate(.72);
}
.layout .btn.secondary {
  border-color: #a7c4eb;
  background: var(--surface);
  color: var(--accent);
}
.layout .btn.secondary:hover { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
.layout .btn.primary {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
  box-shadow: 0 5px 12px rgba(23, 105, 224, .18);
}
.layout .btn.primary:hover { border-color: #0f59c4; background: #0f59c4; color: #fff; }

.layout .metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(104px, 1fr));
  width: min(560px, 100%);
  margin: 0;
  gap: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-soft);
}
.layout .metric {
  position: relative;
  min-width: 0;
  padding: 9px 14px 10px;
  background: transparent;
  border: 0;
  box-shadow: none;
}
.layout .metric + .metric::before {
  position: absolute;
  top: 10px;
  bottom: 10px;
  left: 0;
  width: 1px;
  background: var(--line);
  content: '';
}
.layout .metric .k { color: var(--sub); font-size: 11px; line-height: 1.35; }
.layout .metric .v { margin-top: 2px; color: var(--text); font-size: 18px; font-weight: 750; line-height: 1.2; }
.layout .metric:nth-child(2) .v { color: #d54b48; }
.layout .metric:nth-child(4) .v { color: var(--accent); }

.layout .main {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
  min-height: 0;
}

.layout .controls {
  display: flex;
  width: auto;
  min-width: 0;
  min-height: 0;
  padding: 10px;
  gap: 10px;
  overflow: hidden;
}

.layout .card {
  border: 1px solid var(--line);
  border-radius: 11px;
  padding: 12px;
  background: var(--surface);
  box-shadow: none;
}
.layout .card-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.layout .card-title {
  margin: 0;
  color: var(--text);
  font-size: 13px;
  font-weight: 730;
  letter-spacing: .01em;
}
.layout .card-note { color: var(--sub); font-size: 11px; white-space: nowrap; }
.layout .form-grid { gap: 8px; }
.layout .form-item { gap: 4px; color: var(--sub); }
.layout .form-label { color: var(--sub); font-size: 11px; line-height: 1.3; }
.layout .form-input,
.layout .form-picker {
  min-height: 32px;
  height: 32px;
  padding: 0 9px;
  border: 1px solid var(--line-strong);
  border-radius: 7px;
  background: var(--surface-soft);
  color: var(--text);
  font-size: 12px;
  line-height: 30px;
}
.layout .form-input:focus,
.layout .form-picker:focus { border-color: var(--accent); }
.layout .inline-actions { justify-content: flex-start; margin-top: 10px; }
.layout .inline-actions .btn { min-height: 30px; padding: 0 10px; font-size: 11px; }
.layout .status { min-height: 16px; margin-top: 8px; font-size: 11px; line-height: 1.45; }
.layout .status.ok { color: var(--success); }

.layout .bins-card {
  display: flex;
  flex: 0 0 auto;
  min-height: 0;
  flex-direction: column;
}
.layout .legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 9px;
  padding: 0 0 8px;
  color: var(--sub);
  font-size: 11px;
  line-height: 1.3;
}
.layout .legend-dot { width: 7px; height: 7px; margin-right: 3px; }
.layout .bin-list {
  display: grid;
  flex: 0 0 auto;
  height: clamp(260px, 32vh, 340px);
  min-height: 0;
  max-height: none;
  padding: 5px;
  gap: 5px;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-soft);
  scrollbar-width: thin;
  scrollbar-color: #98bce8 transparent;
}
.layout .bin-list::-webkit-scrollbar { width: 5px; }
.layout .bin-list::-webkit-scrollbar-track { background: transparent; }
.layout .bin-list::-webkit-scrollbar-thumb { background: #98bce8; border-radius: 8px; }
.layout .bin-row {
  padding: 8px;
  gap: 5px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: var(--surface);
  transition: border-color .18s ease, background-color .18s ease;
}
.layout .bin-row:hover { border-color: #b7cff0; background: #fbfdff; }
.layout .sorting-center-list {
  align-content: start;
  height: auto;
  min-height: 230px;
}
.layout .sorting-center-row {
  min-height: 70px;
  padding: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}
.layout .sorting-center-row.is-selected {
  border-color: rgba(24, 167, 124, 0.48);
  background: rgba(24, 167, 124, 0.07);
}
.layout .sorting-center-row:not(.is-selected) {
  opacity: 0.68;
}
.layout .sorting-center-icon {
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  color: #fff;
  background: linear-gradient(145deg, var(--success), #3bc596);
  font-size: 17px;
  font-weight: 760;
}
.layout .sorting-center-copy { flex: 1; min-width: 0; }
.layout .sorting-center-select {
  min-width: 0;
  display: flex;
  align-items: center;
}
.layout .sorting-center-select text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.layout .sorting-center-entry {
  margin-top: 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 6px;
  border-radius: 6px;
  background: rgba(24, 167, 124, 0.08);
  color: var(--success);
  font-size: 10px;
  font-weight: 650;
  cursor: pointer;
}
.layout .chip.center-running {
  color: #fff;
  background: var(--success);
}
.layout .bin-head { color: var(--text); font-size: 12px; font-weight: 720; }
.layout .bin-sub { color: var(--sub); font-size: 10px; line-height: 1.45; }
.layout .chip {
  padding: 2px 6px;
  border-radius: 5px;
  background: #7c91a5;
  color: #fff;
  font-size: 10px;
  font-weight: 650;
  line-height: 1.25;
}
.layout .chip.urgent { background: #d84e4b; }
.layout .chip.warning { background: #e69a20; }
.layout .bin-range { grid-template-columns: 1fr 55px; gap: 6px; }
.layout .fill-input {
  width: 55px;
  height: 25px;
  line-height: 23px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: var(--accent-soft);
  color: #496985;
  font-size: 11px;
}

.layout .map-wrap {
  display: grid;
  grid-template-rows: minmax(300px, 1fr) auto;
  min-width: 0;
  min-height: 0;
  height: min(700px, calc(100vh - 230px));
  padding: 10px;
  gap: 10px;
  overflow: hidden;
}
.layout .map-stage {
  position: relative; z-index: 0; isolation: isolate;
  min-width: 0; min-height: 0; overflow: hidden; border-radius: 11px;
}
#map,
.layout .mp-map {
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 1px solid var(--line);
  border-radius: 11px;
  overflow: hidden;
}
.layout .map-placeholder {
  border: 1px dashed var(--line-strong);
  border-radius: 11px;
  background: var(--surface-soft);
}
.layout .map-placeholder-title { color: var(--text); font-size: 14px; }
.layout .map-placeholder-desc { color: var(--sub); font-size: 12px; }

.layout .route {
  display: flex;
  min-height: 0;
  max-height: 350px;
  padding: 10px;
  gap: 8px;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--surface);
}
.layout .route-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 0 2px 8px;
  border-bottom: 1px solid var(--line);
}
.layout .route-title { color: var(--text); font-size: 13px; font-weight: 730; line-height: 1.35; }
.layout .route-summary { margin-top: 2px; color: var(--sub); font-size: 11px; line-height: 1.45; }
.layout .route-count { padding: 3px 7px; border-radius: 5px; background: var(--accent-soft); color: var(--accent); font-size: 10px; font-weight: 700; white-space: nowrap; }
.layout .route-list {
  display: grid;
  flex: none;
  min-height: 0;
  max-height: 285px;
  gap: 5px;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: #98bce8 transparent;
}
.layout .route-list::-webkit-scrollbar { width: 5px; }
.layout .route-list::-webkit-scrollbar-track { background: transparent; }
.layout .route-list::-webkit-scrollbar-thumb { background: #98bce8; border-radius: 8px; }
.layout .route-item {
  grid-template-columns: 30px minmax(0, 1fr) auto;
  min-height: 42px;
  padding: 7px 8px;
  gap: 8px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface);
  color: var(--text);
  font-size: 11px;
}
.layout .route-item > view:nth-child(2) { min-width: 0; }
.layout .route-item > view:nth-child(3) { color: var(--sub) !important; font-size: 10px; }
.layout .route-item > view:nth-child(2) > view:first-child { font-size: 12px; }
.layout .route-item > view:nth-child(2) > view:last-child { color: var(--sub) !important; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.layout .route-order {
  width: 23px;
  height: 23px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  font-size: 11px;
}
.layout .empty { color: var(--sub); font-size: 12px; padding: 20px 6px; }

.layout.dark-theme .card,
.layout.dark-theme .bin-row,
.layout.dark-theme .route,
.layout.dark-theme .route-item { background: var(--surface); border-color: var(--line); }
.layout.dark-theme .bin-list,
.layout.dark-theme .map-placeholder { background: var(--surface-soft); }
.layout.dark-theme .form-input,
.layout.dark-theme .form-picker { background: var(--surface-soft); color: var(--text); border-color: var(--line-strong); }
.layout.dark-theme .btn { background: var(--surface); color: var(--sub); border-color: var(--line); }
.layout.dark-theme .btn.secondary { border-color: rgba(93, 156, 255, .58); background: var(--surface); color: #b6d3ff; }
.layout.dark-theme .btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.layout.dark-theme .route-summary,
.layout.dark-theme .route-item > view:nth-child(2) > view:last-child,
.layout.dark-theme .route-item > view:nth-child(3) { color: var(--sub) !important; }

@media (max-width: 1440px) and (min-width: 901px) {
  .layout .top { gap: 14px; }
  .layout .btns { flex-wrap: nowrap; gap: 8px; }
  .layout .sub { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
}

@media (max-width: 1100px) {
  .layout { padding: 12px; }
  .layout .main { grid-template-columns: 300px minmax(0, 1fr); }
  .layout .top { gap: 12px; }
  .layout .btn { padding: 0 10px; }
}

@media (max-width: 900px) {
  .layout .main { grid-template-columns: 1fr; min-height: auto; }
  .layout .controls { min-height: auto; }
  .layout .bins-card { min-height: 300px; }
  .layout .map-wrap { height: auto; min-height: 720px; }
}

@media (max-width: 640px) {
  .layout { padding: 10px; }
  .layout .header-panel { padding: 14px; }
  .layout .top { flex-direction: column; gap: 12px; }
  .layout .btns { justify-content: flex-start; }
  .layout .metrics { width: 100%; grid-template-columns: 1fr 1fr; }
  .layout .metric:nth-child(3)::before { display: none; }
  .layout .metric:nth-child(n + 3) { border-top: 1px solid var(--line); }
  .layout .main { gap: 10px; }
  .layout .controls { padding: 8px; }
  .layout .form-grid { grid-template-columns: 1fr 1fr; }
  .layout .map-wrap { min-height: 560px; grid-template-rows: minmax(280px, 1fr) auto; }
}

@media (max-width: 380px) {
  .layout .form-grid { grid-template-columns: 1fr; }
  .layout .btn { padding: 0 9px; }
  .layout .map-wrap { min-height: 520px; }
}

/* ─── 浅色两栏运营规划工作台 ─── */
.layout.light-theme.admin-light-theme {
  --canvas: var(--admin-light-bg);
  --surface: var(--admin-light-surface);
  --surface-soft: var(--admin-light-surface-soft);
  --line: var(--admin-light-border);
  --line-strong: var(--admin-light-border-strong);
  --text: var(--admin-light-text);
  --sub: var(--admin-light-text-secondary);
  --accent: var(--admin-light-primary);
  --accent-soft: var(--admin-light-primary-soft);
  --success: var(--admin-light-success);
  --shadow: var(--admin-light-shadow);
  width: 100%;
  height: 100vh;
  min-height: 720px;
  padding: 12px;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 10px;
  overflow: hidden;
  background: var(--admin-light-bg);
}
.layout.light-theme.admin-light-theme .panel {
  border: 1px solid var(--admin-light-border);
  border-radius: var(--admin-light-radius-panel);
  background: var(--admin-light-surface);
  box-shadow: var(--admin-light-shadow);
  backdrop-filter: none;
}
.layout.light-theme.admin-light-theme .header-panel {
  padding: 10px 14px;
  margin: 0;
}
.layout.light-theme.admin-light-theme .top {
  min-height: 36px;
  margin: 0 0 8px;
  align-items: center;
  gap: 14px;
}
.layout.light-theme.admin-light-theme .title {
  color: var(--admin-light-text);
  font-size: clamp(20px, 1.25vw, 24px);
  font-weight: 740;
  letter-spacing: 0;
}
.layout.light-theme.admin-light-theme .sub {
  margin-top: 2px;
  color: var(--admin-light-text-secondary);
  line-height: 1.4;
}
.layout.light-theme.admin-light-theme :deep(.admin-screen-header) {
  --admin-screen-control-height: 34px;
  --admin-screen-control-font-size: 12px;
  gap: 6px;
}
.layout.light-theme.admin-light-theme .btns { gap: 6px; }
.layout.light-theme.admin-light-theme .btn {
  min-height: 34px;
  height: 34px;
  padding: 0 11px;
  border: 1px solid var(--admin-light-border-strong);
  border-radius: var(--admin-light-radius-control);
  color: var(--admin-light-text-secondary);
  background: var(--admin-light-surface);
  box-shadow: none;
}
.layout.light-theme.admin-light-theme .btn:hover {
  color: var(--admin-light-primary);
  border-color: #9abbe1;
  background: var(--admin-light-primary-soft);
}
.layout.light-theme.admin-light-theme .btn.secondary {
  color: var(--admin-light-primary);
  border-color: #acc8e9;
  background: var(--admin-light-surface);
}
.layout.light-theme.admin-light-theme .btn.primary {
  color: #fff;
  border-color: var(--admin-light-primary);
  background: var(--admin-light-primary);
  box-shadow: 0 3px 8px rgba(24, 167, 124, .2);
}
.layout.light-theme.admin-light-theme .btn.primary:hover {
  color: #fff;
  border-color: var(--admin-light-primary-hover);
  background: var(--admin-light-primary-hover);
}
.layout.light-theme.admin-light-theme .metrics {
  width: min(520px, 100%);
  border-color: var(--admin-light-border);
  border-radius: 9px;
  background: var(--admin-light-surface-soft);
}
.layout.light-theme.admin-light-theme .metric {
  min-height: 54px;
  padding: 7px 12px;
}
.layout.light-theme.admin-light-theme .metric + .metric::before { top: 8px; bottom: 8px; background: var(--admin-light-border); }
.layout.light-theme.admin-light-theme .metric .k { color: var(--admin-light-text-secondary); }
.layout.light-theme.admin-light-theme .metric .v { color: var(--admin-light-text); font-size: 18px; }
.layout.light-theme.admin-light-theme .metric:nth-child(2) .v { color: var(--admin-light-danger); }
.layout.light-theme.admin-light-theme .metric:nth-child(4) .v { color: var(--admin-light-primary); }
.layout.light-theme.admin-light-theme .main {
  min-height: 0;
  height: 100%;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 10px;
  align-items: stretch;
}
.layout.light-theme.admin-light-theme .controls {
  width: 300px;
  height: 100%;
  min-height: 0;
  padding: 9px;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 8px;
  overflow: hidden;
  box-shadow: none;
}
.layout.light-theme.admin-light-theme .card {
  padding: 10px;
  border: 1px solid var(--admin-light-border);
  border-radius: 10px;
  background: var(--admin-light-surface);
  box-shadow: none;
}
.layout.light-theme.admin-light-theme .card-heading {
  min-height: 22px;
  margin-bottom: 8px;
  padding: 0 0 7px 9px;
  border-bottom: 1px solid var(--admin-light-border);
  position: relative;
}
.layout.light-theme.admin-light-theme .card-heading::before {
  position: absolute;
  top: 1px;
  bottom: 7px;
  left: 0;
  width: 3px;
  border-radius: 2px;
  background: var(--admin-light-primary);
  content: '';
}
.layout.light-theme.admin-light-theme .card-title { color: var(--admin-light-text); font-size: 13px; }
.layout.light-theme.admin-light-theme .card-note { color: var(--admin-light-text-muted); }
.layout.light-theme.admin-light-theme .form-grid { gap: 7px; }
.layout.light-theme.admin-light-theme .form-item,
.layout.light-theme.admin-light-theme .form-label { color: var(--admin-light-text-secondary); }
.layout.light-theme.admin-light-theme .form-input,
.layout.light-theme.admin-light-theme .form-picker {
  height: 31px;
  min-height: 31px;
  padding: 0 8px;
  border-color: var(--admin-light-border-strong);
  border-radius: 7px;
  color: var(--admin-light-text);
  background: var(--admin-light-surface-soft);
  line-height: 29px;
}
.layout.light-theme.admin-light-theme .form-input:focus,
.layout.light-theme.admin-light-theme .form-picker:focus { border-color: var(--admin-light-primary); }
.layout.light-theme.admin-light-theme .inline-actions { margin-top: 8px; gap: 5px; }
.layout.light-theme.admin-light-theme .inline-actions .btn { min-height: 30px; height: 30px; padding: 0 8px; }
.layout.light-theme.admin-light-theme .status { margin-top: 6px; color: var(--admin-light-text-secondary); }
.layout.light-theme.admin-light-theme .status.ok { color: var(--admin-light-success); }
.layout.light-theme.admin-light-theme .status.err { color: var(--admin-light-danger); }
.layout.light-theme.admin-light-theme .bins-card {
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.layout.light-theme.admin-light-theme .legend {
  padding-bottom: 6px;
  color: var(--admin-light-text-secondary);
  font-size: 10px;
}
.layout.light-theme.admin-light-theme .bin-list {
  flex: 1;
  height: auto;
  min-height: 0;
  max-height: none;
  padding: 4px;
  border: 1px solid var(--admin-light-border);
  border-radius: 8px;
  background: var(--admin-light-surface-soft);
}
.layout.light-theme.admin-light-theme .bin-row {
  padding: 7px;
  border: 1px solid var(--admin-light-border);
  border-radius: 8px;
  background: var(--admin-light-surface);
}
.layout.light-theme.admin-light-theme .bin-row:hover { border-color: #a8c4e3; background: #fbfdff; }
.layout.light-theme.admin-light-theme .sorting-center-row:hover {
  border-color: #8bc9b3;
  background: var(--admin-light-primary-soft);
}
.layout.light-theme.admin-light-theme .sorting-center-row.is-selected {
  border-color: #8bc9b3;
  background: var(--admin-light-primary-soft);
}
.layout.light-theme.admin-light-theme .sorting-center-icon {
  background: linear-gradient(145deg, var(--admin-light-primary), #43ba91);
}
.layout.light-theme.admin-light-theme .sorting-center-entry { color: var(--admin-light-primary); }
.layout.light-theme.admin-light-theme .bin-head { color: var(--admin-light-text); }
.layout.light-theme.admin-light-theme .bin-sub { color: var(--admin-light-text-secondary); }
.layout.light-theme.admin-light-theme .chip {
  color: var(--admin-light-text-secondary);
  background: #edf2f6;
}
.layout.light-theme.admin-light-theme .chip.urgent { color: #aa3f47; background: var(--admin-light-danger-soft); }
.layout.light-theme.admin-light-theme .chip.warning { color: #986017; background: var(--admin-light-warning-soft); }
.layout.light-theme.admin-light-theme .chip.center-running {
  color: #117b5d;
  background: var(--admin-light-success-soft);
}
.layout.light-theme.admin-light-theme .fill-input { color: var(--admin-light-text-secondary); border-color: var(--admin-light-border-strong); background: var(--admin-light-primary-soft); }
.layout.light-theme.admin-light-theme .map-wrap {
  min-width: 0;
  min-height: 0;
  height: 100%;
  padding: 9px;
  display: grid;
  grid-template-rows: minmax(340px, 1.65fr) minmax(180px, .75fr);
  gap: 9px;
  overflow: hidden;
  border-color: var(--admin-light-border-strong);
  box-shadow: var(--admin-light-shadow-map);
}
.layout.light-theme.admin-light-theme .map-stage {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--admin-light-border-strong);
  border-radius: 10px;
  box-shadow: 0 3px 10px rgba(31, 58, 82, .08);
}
.layout.light-theme.admin-light-theme #map,
.layout.light-theme.admin-light-theme .mp-map {
  border: 0;
  border-radius: 9px;
}
.layout.light-theme.admin-light-theme .map-placeholder {
  border: 0;
  border-radius: 9px;
  background: var(--admin-light-surface-soft);
}
.layout.light-theme.admin-light-theme .route {
  min-height: 0;
  max-height: none;
  padding: 9px;
  gap: 7px;
  border: 1px solid var(--admin-light-border);
  border-radius: 10px;
  background: var(--admin-light-surface);
}
.layout.light-theme.admin-light-theme .route-header { padding: 0 2px 7px; border-color: var(--admin-light-border); }
.layout.light-theme.admin-light-theme .route-title { color: var(--admin-light-text); }
.layout.light-theme.admin-light-theme .route-summary { color: var(--admin-light-text-secondary); }
.layout.light-theme.admin-light-theme .route-count { color: var(--admin-light-primary); background: var(--admin-light-primary-soft); }
.layout.light-theme.admin-light-theme .route-list {
  flex: 1;
  min-height: 0;
  max-height: none;
  gap: 5px;
}
.layout.light-theme.admin-light-theme .route-item {
  min-height: 40px;
  padding: 6px 8px;
  border-color: var(--admin-light-border);
  border-radius: 7px;
  color: var(--admin-light-text);
  background: var(--admin-light-surface-soft);
}
.layout.light-theme.admin-light-theme .route-order { background: var(--admin-light-primary); }
.layout.light-theme.admin-light-theme .route-item > view:nth-child(2) > view:last-child,
.layout.light-theme.admin-light-theme .route-item > view:nth-child(3) { color: var(--admin-light-text-secondary) !important; }
.layout.light-theme.admin-light-theme .empty {
  min-height: 58px;
  padding: 12px 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--admin-light-text-secondary);
  border: 0;
  border-radius: 8px;
  background: var(--admin-light-surface-soft);
}
.layout.light-theme.admin-light-theme .bin-list,
.layout.light-theme.admin-light-theme .route-list {
  scrollbar-color: var(--admin-light-scroll-thumb) var(--admin-light-scroll-track);
}
.layout.light-theme.admin-light-theme .bin-list::-webkit-scrollbar-track,
.layout.light-theme.admin-light-theme .route-list::-webkit-scrollbar-track { background: var(--admin-light-scroll-track); }
.layout.light-theme.admin-light-theme .bin-list::-webkit-scrollbar-thumb,
.layout.light-theme.admin-light-theme .route-list::-webkit-scrollbar-thumb { background: var(--admin-light-scroll-thumb); }

@media (max-width: 1100px) and (min-width: 901px) {
  .layout.light-theme.admin-light-theme .main { grid-template-columns: 286px minmax(0, 1fr); }
  .layout.light-theme.admin-light-theme .controls { width: 286px; }
}

@media (max-width: 900px) {
  .layout.light-theme.admin-light-theme {
    height: auto;
    min-height: 100vh;
    overflow: auto;
  }
  .layout.light-theme.admin-light-theme .main { height: auto; grid-template-columns: 1fr; }
  .layout.light-theme.admin-light-theme .controls { width: auto; height: auto; overflow: visible; }
  .layout.light-theme.admin-light-theme .bins-card { min-height: 320px; }
  .layout.light-theme.admin-light-theme .bin-list { height: 320px; flex: none; }
  .layout.light-theme.admin-light-theme .map-wrap { height: auto; min-height: 720px; grid-template-rows: minmax(400px, 1fr) minmax(220px, auto); }
}

@media (max-width: 640px) {
  .layout.light-theme.admin-light-theme { padding: 8px; }
  .layout.light-theme.admin-light-theme .header-panel { padding: 10px; }
  .layout.light-theme.admin-light-theme .top { align-items: flex-start; }
  .layout.light-theme.admin-light-theme .metrics { grid-template-columns: 1fr 1fr; }
  .layout.light-theme.admin-light-theme .map-wrap { min-height: 620px; grid-template-rows: minmax(340px, 1fr) minmax(220px, auto); }
}
</style>
