<template>
  <view :class="['layout', isDark ? 'dark-theme' : '']">

    <!-- ===== 顶部 panel ===== -->
    <view class="panel">
      <view class="top">
        <view>
          <view class="title">垃圾清运规划</view>
          <view class="sub">结合地理位置、当前满载率与历史趋势，自动生成"先清哪几个、何时清、如何走"。</view>
        </view>
        <view class="btns">
          <view class="btn" @tap="goBack">返回</view>
          <view class="btn blue" @tap="doLoadBins">刷新桶位</view>
          <view class="btn" @tap="doMockHistory">生成历史样本</view>
          <view class="btn primary" @tap="doCreatePlan">一键规划路线</view>
        </view>
      </view>
      <view class="metrics">
        <view class="metric"><view class="k">总桶位</view><view class="v">{{ metricTotal }}</view></view>
        <view class="metric"><view class="k">紧急桶位</view><view class="v">{{ metricUrgent }}</view></view>
        <view class="metric"><view class="k">平均满载率</view><view class="v">{{ metricAverage }}</view></view>
        <view class="metric"><view class="k">计划总里程</view><view class="v">{{ metricDistance }}</view></view>
      </view>
    </view>

    <!-- ===== 主体：左控制栏 + 右地图 ===== -->
    <view class="main">

      <!-- 左侧控制栏 -->
      <view class="panel controls">

        <!-- 规划参数 -->
        <view class="card">
          <view class="card-title">规划参数</view>
          <view class="form-grid">
            <view class="form-item">
              <text class="form-label">紧急阈值(%)</text>
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
              <text class="form-label">紧急阈值 (%)</text>
              <input class="form-input" type="number" :value="opts.urgentThreshold"
                @input="opts.urgentThreshold = toNumInput($event, 80)" />
            </view>
            <view class="form-item">
              <text class="form-label">预测窗口(小时)</text>
              <input class="form-input" type="number" :value="opts.planningHorizonHours"
                @input="opts.planningHorizonHours = toNumInput($event, 8)" />
            </view>
            <view class="form-item">
              <text class="form-label">车辆速度(km/h)</text>
              <input class="form-input" type="number" :value="opts.speedKmh"
                @input="opts.speedKmh = toNumInput($event, 25)" />
            </view>
            <view class="form-item">
              <text class="form-label">每站作业(分钟)</text>
              <input class="form-input" type="number" :value="opts.serviceMinutesPerStop"
                @input="opts.serviceMinutesPerStop = toNumInput($event, 6)" />
            </view>
            <view class="form-item">
              <text class="form-label">最多停靠点</text>
              <input class="form-input" type="number" :value="opts.maxStops"
                @input="opts.maxStops = toNumInput($event, 12)" />
            </view>
            <view class="form-item">
              <text class="form-label">最少停靠点</text>
              <input class="form-input" type="number" :value="opts.minStops"
                @input="opts.minStops = toNumInput($event, 3)" />
            </view>
          </view>
        </view>

        <!-- 车辆起点 -->
        <view class="card">
          <view class="card-title">车辆起点</view>
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
          <view class="btns" style="margin-top:8px;">
            <view class="btn" @tap="useMapCenter">使用地图中心</view>
            <view class="btn" @tap="doSaveSnapshots">保存当前快照</view>
          </view>
          <view :class="['status', statusCls]">{{ statusText }}</view>
        </view>

        <!-- 桶位列表 -->
        <view class="card">
          <view class="card-title">桶位调度列表</view>
          <view class="legend">
            <text><text class="legend-dot" style="background:#1fb57d"></text>低负载</text>
            <text><text class="legend-dot" style="background:#e0a100"></text>临界</text>
            <text><text class="legend-dot" style="background:#d06919"></text>高负载</text>
            <text><text class="legend-dot" style="background:#c63b3b"></text>紧急</text>
          </view>
          <scroll-view class="bin-list" scroll-y>
            <view v-if="!bins.length" class="empty">暂无桶位数据</view>
            <view
              v-for="(bin, index) in bins"
              :key="'bin-' + bin.id"
              class="bin-row"
              @tap="onBinRowTap(index)"
            >
              <view class="bin-head">
                <view style="display:flex;align-items:center;gap:6px;" @tap.stop>
                  <switch
                    :checked="bin.selected !== false"
                    style="transform:scale(0.7);margin-left:-8px;"
                    @change="onBinToggle(index, $event)"
                  />
                  <text>{{ bin.name || 'Unnamed Bin' }}</text>
                </view>
                <text :class="['chip', bin.currentFill >= 90 ? 'urgent' : bin.currentFill >= 80 ? 'warning' : '']">
                  {{ bin.currentFill >= 90 ? 'Urgent' : bin.currentFill >= 80 ? 'Warning' : 'Normal' }}
                </text>
              </view>
              <view class="bin-sub">
                满载率 {{ Number(bin.currentFill || 0).toFixed(1) }}% · 预计满载 {{ bin.hoursToFull == null ? '--' : bin.hoursToFull.toFixed(1) + 'h' }} · 斜率 {{ Number(bin.growthRatePctPerHour || 0).toFixed(2) }}%/h
              </view>
              <!-- 小程序用 slider 替代 range input -->
              <view class="bin-range" @tap.stop>
                <slider
                  class="fill-slider"
                  :value="Number(bin.currentFill || 0)"
                  :min="0" :max="100" :step="0.5"
                  activeColor="#2680eb"
                  @changing="onFillSliderChanging(index, $event)"
                  @change="onFillSliderChange(index, $event)"
                />
                <input
                  class="fill-input"
                  type="number"
                  :value="Number(bin.currentFill || 0).toFixed(1)"
                  @input="onFillInputChange(index, $event)"
                  @tap.stop
                />
              </view>
            </view>
          </scroll-view>
        </view>
      </view>

      <!-- 右侧地图 + 路线 -->
      <view class="panel map-wrap">
        <!-- #ifdef H5 -->
        <view id="map"></view>
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
          <view class="route-summary">{{ routeSummary }}</view>
          <scroll-view class="route-list" scroll-y>
            <view v-if="!routeStops.length" class="empty">请先点击"一键规划路线"。</view>
            <view
              v-for="stop in routeStops"
              :key="'stop-' + stop.order"
              class="route-item"
            >
              <view class="route-order">{{ stop.order }}</view>
              <view>
                <view style="font-weight:680;">{{ stop.name }}</view>
                <view style="color:#607487;margin-top:2px;">
                  ETA {{ fmtTime(stop.eta) }} · 满载率 {{ Number(stop.currentFill).toFixed(1) }}%
                </view>
              </view>
              <view style="text-align:right;color:#445d73;">
                <view>{{ Number(stop.travelKm).toFixed(2) }} km</view>
                <view style="font-size:11px;">优先级 {{ Number(stop.priorityScore).toFixed(3) }}</view>
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
import { describeApiFailure, redirectIfAccessDenied } from './access-guard.js'
import { resolveH5StandalonePath } from '@/utils/h5-route'

// ─── 常量 ─────────────────────────────────────────────
const QQ_MAP_KEYS = [mapConfig.qqMapKey, mapConfig.qqMapKeyBackup].filter(Boolean)
const DEFAULT_CENTER = { latitude: 36.0671, longitude: 120.3826 }
const ROUTE_STRATEGY_KEY = 'collection_route_strategy'

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
function clamp(v, min, max) {
  const n = Number(v); if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
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
function colorByFill(fill) {
  if (fill >= 90) return '#c63b3b'; if (fill >= 80) return '#d06919'
  if (fill >= 65) return '#e0a100'; return '#1fb57d'
}
function getBinStyleId(bin) {
  if (bin.selected === false) return 'muted'
  const fill = Number(bin.currentFill) || 0
  if (fill >= 90) return 'urgent'; if (fill >= 80) return 'high'
  if (fill >= 65) return 'warning'; return 'normal'
}
function authHeaders() {
  const token = getStorage('token') || ''
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = token
  return headers
}

function navigateStandaloneH5(prettyPath, spaPath, query = '') {
  const target = resolveH5StandalonePath(prettyPath, spaPath, query)
  window.location.assign(target)
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
  urgentThreshold: 80,
  planningHorizonHours: 8,
  speedKmh: 25,
  serviceMinutesPerStop: 6,
  maxStops: 12,
  minStops: 3
})

const bins = ref([])            // { ...binData, selected: boolean }
const routeStops = ref([])
const routeSummary = ref('还未生成路线。')

const metricTotal = ref('0')
const metricUrgent = ref('0')
const metricAverage = ref('0%')
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
  const binsArr = bins.value
  const total = binsArr.length
  const urgent = binsArr.filter(b => b.isUrgent).length
  const average = total > 0 ? binsArr.reduce((s, b) => s + (Number(b.currentFill) || 0), 0) / total : 0
  metricTotal.value = String(total)
  metricUrgent.value = String(urgent)
  metricAverage.value = `${average.toFixed(1)}%`
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

// ─── 桶位列表交互 ──────────────────────────────────────
function onBinToggle(index, event) {
  const bin = bins.value[index]
  if (!bin) return
  bin.selected = !!event.detail.value
  buildMpMapData()
  // #ifdef H5
  drawH5Map()
  // #endif
}
function onFillSliderChanging(index, event) {
  const bin = bins.value[index]
  if (!bin) return
  bin.currentFill = clamp(event.detail.value, 0, 100)
}
function onFillSliderChange(index, event) {
  updateBinFill(index, event.detail.value)
}
function onFillInputChange(index, event) {
  updateBinFill(index, toNumInput(event, bins.value[index]?.currentFill ?? 0))
}
function updateBinFill(index, value) {
  const bin = bins.value[index]
  if (!bin) return
  bin.currentFill = clamp(value, 0, 100)
  if (bin.hoursToFull != null && Number(bin.growthRatePctPerHour) > 0.05) {
    bin.hoursToFull = (100 - bin.currentFill) / Number(bin.growthRatePctPerHour)
  }
  bin.isUrgent = Number(bin.currentFill) >= Number(opts.urgentThreshold)
  updateMetrics(null)
  buildMpMapData()
  // #ifdef H5
  drawH5Map()
  // #endif
}
function onBinRowTap(index) {
  const bin = bins.value[index]
  if (!bin) return
  // #ifdef H5
  if (_map.instance) {
    _map.instance.setCenter(new window.TMap.LatLng(bin.latitude, bin.longitude))
    if (_map.instance.getZoom && _map.instance.getZoom() < 14 && _map.instance.setZoom) _map.instance.setZoom(14)
    showInfoWindow(bin.latitude, bin.longitude,
      `<div style="font-size:12px;line-height:1.5"><b>${bin.name || 'Unnamed Bin'}</b><br/>满载率 ${Number(bin.currentFill || 0).toFixed(1)}%<br/>预计满载: ${bin.hoursToFull == null ? '--' : Number(bin.hoursToFull).toFixed(1) + 'h'}<br/>优先级 ${Number(bin.priorityScore || 0).toFixed(3)}</div>`)
  }
  // #endif
  // #ifndef H5
  mapCenter.value = { latitude: bin.latitude, longitude: bin.longitude }
  mapScale.value = 14
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
async function doLoadBins() {
  setStatus('正在读取桶位数据...')
  try {
    const data = await apiRequest('/api/planning/bins')
    bins.value = (data.bins || []).map(b => ({ ...b, selected: true }))
    routeStops.value = []
    routeSummary.value = '还未生成路线。'
    _currentPlan = null

    if (!startPoint.value && bins.value.length) {
      startPoint.value = { name: '默认起点', latitude: bins.value[0].latitude, longitude: bins.value[0].longitude }
    }
    updateMetrics(null)
    buildMpMapData()
    // #ifdef H5
    drawH5Map()
    // #endif
    setStatus(`已加载 ${bins.value.length} 个桶位`, 'ok')
  } catch (err) {
    setStatus(err && err.message ? err.message : String(err), 'err')
  }
}

let _currentPlan = null

async function doCreatePlan() {
  if (!startPoint.value && bins.value.length) {
    startPoint.value = { name: '默认起点', latitude: bins.value[0].latitude, longitude: bins.value[0].longitude }
  }
  setStatus('正在计算清运路线...')
  try {
    const payload = {
      start: startPoint.value,
      options: { ...opts, routeStrategy: routeStrategy.value, startTime: new Date().toISOString() },
      bins: bins.value.map(bin => ({
        id: bin.id, selected: bin.selected !== false,
        name: bin.name, type: bin.type, status: bin.status,
        latitude: bin.latitude, longitude: bin.longitude,
        currentFill: bin.currentFill, history: bin.history || []
      }))
    }
    const plan = await apiRequest('/api/planning/plan', { method: 'POST', body: JSON.stringify(payload) })
    _currentPlan = plan
    if (plan && plan.options && plan.options.routeStrategy) {
      routeStrategy.value = normalizeStrategy(plan.options.routeStrategy)
      setStorage(ROUTE_STRATEGY_KEY, routeStrategy.value)
    }
    const planBinMap = new Map((plan.bins || []).map(item => [String(item.id), item]))
    bins.value = bins.value.map(bin => {
      const computed = planBinMap.get(String(bin.id))
      return computed ? { ...bin, ...computed, selected: bin.selected !== false } : bin
    })
    routeStops.value = plan.route && Array.isArray(plan.route.stops) ? plan.route.stops : []
    if (plan.route && plan.route.stops && plan.route.stops.length) {
      const r = plan.route
      routeSummary.value = `${routeStrategyLabel.value} | Stops ${r.stops.length}, distance ${Number(r.totalDistanceKm || 0).toFixed(2)} km, total ${Number(r.totalMinutes || 0).toFixed(1)} min.`
    } else {
      routeSummary.value = 'No route generated yet.'
    }
    updateMetrics(plan)
    buildMpMapData()
    // #ifdef H5
    drawH5Map()
    // #endif
    setStatus('规划完成', 'ok')
  } catch (err) {
    setStatus(err && err.message ? err.message : String(err), 'err')
  }
}

async function doSaveSnapshots() {
  const targets = bins.value.filter(b => b.selected !== false)
  if (!targets.length) { setStatus('Select at least one bin first.', 'err'); return }
  setStatus('正在保存满载率快照...')
  try {
    for (const bin of targets) {
      await apiRequest('/api/planning/snapshot', {
        method: 'POST',
        body: JSON.stringify({ binId: bin.id, fillLevel: bin.currentFill, timestamp: new Date().toISOString(), source: 'web-manual', syncOverride: true })
      })
    }
    setStatus(`Saved snapshots for ${targets.length} bins.`, 'ok')
  } catch (err) {
    setStatus(err && err.message ? err.message : String(err), 'err')
  }
}

async function doMockHistory() {
  const targets = bins.value.filter(b => b.selected !== false).map(b => b.id)
  if (!targets.length) { setStatus('请先选择桶位后再生成历史', 'err'); return }
  setStatus('正在生成历史样本...')
  try {
    await apiRequest('/api/planning/mock-history', {
      method: 'POST',
      body: JSON.stringify({ binIds: targets, days: 7, pointsPerDay: 4, urgentThreshold: opts.urgentThreshold, planningHorizonHours: opts.planningHorizonHours })
    })
    await doLoadBins()
    setStatus('历史样本已生成并刷新', 'ok')
  } catch (err) {
    setStatus(err && err.message ? err.message : String(err), 'err')
  }
}

function useMapCenter() {
  // #ifdef H5
  if (_map.instance) {
    const center = _map.instance.getCenter()
    const lat = typeof center?.getLat === 'function' ? center.getLat() : center?.lat
    const lng = typeof center?.getLng === 'function' ? center.getLng() : center?.lng
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      startPoint.value = { name: 'Map Center Start', latitude: lat, longitude: lng }
      drawH5Map()
    }
  }
  // #endif
  // #ifndef H5
  startPoint.value = { name: '地图中心起点', latitude: mapCenter.value.latitude, longitude: mapCenter.value.longitude }
  // #endif
}

// ─── 导航 ──────────────────────────────────────────────
function goBack() {
  const pages = getCurrentPages()
  if (pages.length > 1) { uni.navigateBack(); return }
  // #ifdef H5
  navigateStandaloneH5('/', '/pages/home/home')
  return
  // #endif
  const theme = getStorage('app_theme')
  if (theme === 'light') uni.reLaunch({ url: '/pages/home/home' })
  else uni.reLaunch({ url: '/pages-dark/home/home' })
}

// ─── 小程序地图数据 ────────────────────────────────────
function buildMpMapData() {
  const binsArr = bins.value
  const colorMap = { normal: '#1fb57d', warning: '#e0a100', high: '#d06919', urgent: '#c63b3b', muted: '#8ea1b5' }
  const markers = binsArr.map((bin, i) => ({
    id: i,
    latitude: Number(bin.latitude) || 0,
    longitude: Number(bin.longitude) || 0,
    title: bin.name,
    width: 26, height: 26,
    callout: { content: `${bin.name}\n满载率 ${Number(bin.currentFill || 0).toFixed(1)}%`, display: 'BYCLICK', color: '#17324a', fontSize: 12, borderRadius: 6, bgColor: '#fff', padding: 6 },
    iconPath: ''
  }))
  const polylineArr = []
  if (_currentPlan && _currentPlan.route && Array.isArray(_currentPlan.route.polyline) && _currentPlan.route.polyline.length > 1) {
    polylineArr.push({
      points: _currentPlan.route.polyline.map(p => ({ latitude: p[0], longitude: p[1] })),
      color: '#2f6ff0cc', width: 6
    })
  }
  mapMarkers.value = markers
  mapPolyline.value = polylineArr
  if (startPoint.value) mapCenter.value = { latitude: startPoint.value.latitude, longitude: startPoint.value.longitude }
  else if (binsArr.length) mapCenter.value = { latitude: Number(binsArr[0].latitude) || DEFAULT_CENTER.latitude, longitude: Number(binsArr[0].longitude) || DEFAULT_CENTER.longitude }
}

function onMapTap(event) {
  // #ifndef H5
  const lat = event?.detail?.latitude
  const lng = event?.detail?.longitude
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    startPoint.value = { name: 'Map Selected Start', latitude: lat, longitude: lng }
  }
  // #endif
}
function onMarkerTap(event) {
  const i = event?.detail?.markerId
  if (!Number.isFinite(i)) return
  const bin = bins.value[i]
  if (!bin) return
  mapCenter.value = { latitude: Number(bin.latitude), longitude: Number(bin.longitude) }
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
  const binsArr = bins.value
  const bounds = new TMap.LatLngBounds(); let hasBounds = false

  const binStyles = {
    normal: new TMap.MarkerStyle({ width: 26, height: 26, anchor: { x: 13, y: 13 }, src: getIconSrc('bin-normal', '#1fb57d', '') }),
    warning: new TMap.MarkerStyle({ width: 26, height: 26, anchor: { x: 13, y: 13 }, src: getIconSrc('bin-warning', '#e0a100', '') }),
    high: new TMap.MarkerStyle({ width: 26, height: 26, anchor: { x: 13, y: 13 }, src: getIconSrc('bin-high', '#d06919', '') }),
    urgent: new TMap.MarkerStyle({ width: 26, height: 26, anchor: { x: 13, y: 13 }, src: getIconSrc('bin-urgent', '#c63b3b', '') }),
    muted: new TMap.MarkerStyle({ width: 24, height: 24, anchor: { x: 12, y: 12 }, src: getIconSrc('bin-muted', '#8ea1b5', '') })
  }
  const binGeos = binsArr.map((bin, i) => {
    const p = new TMap.LatLng(bin.latitude, bin.longitude); bounds.extend(p); hasBounds = true
    return { id: 'bin-' + i, styleId: getBinStyleId(bin), title: bin.name || ('Bin-' + (i + 1)), position: p }
  })
  if (binGeos.length) {
    _map.binMarkers = new TMap.MultiMarker({ id: 'planning-bins', map: _map.instance, styles: binStyles, geometries: binGeos })
    _map.binMarkers.on('click', evt => {
      const id = evt?.geometry?.id || ''
      const i = Number(String(id).replace('bin-', ''))
      const bin = binsArr[i]; if (!bin) return
      showInfoWindow(bin.latitude, bin.longitude, `<div style="font-size:12px;line-height:1.5"><b>${bin.name || 'Unnamed Bin'}</b><br/>Fill: ${Number(bin.currentFill || 0).toFixed(1)}%<br/>Hours to full: ${bin.hoursToFull == null ? '--' : Number(bin.hoursToFull).toFixed(1) + 'h'}<br/>Priority: ${Number(bin.priorityScore || 0).toFixed(3)}</div>`)
    })
  }

  if (startPoint.value) {
    const sp = new TMap.LatLng(startPoint.value.latitude, startPoint.value.longitude)
    _map.startMarker = new TMap.MultiMarker({ id: 'planning-start', map: _map.instance, styles: { start: new TMap.MarkerStyle({ width: 34, height: 34, anchor: { x: 17, y: 17 }, src: getIconSrc('start', '#2f6ff0', 'S') }) }, geometries: [{ id: 'start-point', styleId: 'start', position: sp }] })
    bounds.extend(sp); hasBounds = true
  }

  if (_currentPlan?.route && Array.isArray(_currentPlan.route.polyline) && _currentPlan.route.polyline.length > 1) {
    const paths = _currentPlan.route.polyline.map(p => new TMap.LatLng(p[0], p[1]))
    _map.routePolyline = new TMap.MultiPolyline({ id: 'planning-route', map: _map.instance, styles: { route: new TMap.PolylineStyle({ color: '#2f6ff0', width: 6, borderWidth: 2, borderColor: '#ffffff', lineCap: 'round' }) }, geometries: [{ id: 'route-main', styleId: 'route', paths }] })
    paths.forEach(p => { bounds.extend(p); hasBounds = true })
    const stopStyles = {}; const stopGeos = (_currentPlan.route.stops || []).map((stop, idx) => {
      const sid = 'stop-' + stop.order
      if (!stopStyles[sid]) stopStyles[sid] = new TMap.MarkerStyle({ width: 26, height: 26, anchor: { x: 13, y: 13 }, src: getIconSrc(sid, '#1f62db', String(stop.order)) })
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
  setStatus('Loading Tencent map...')
  await loadTMapSdk()
  _map.instance = new window.TMap.Map('map', { center: new window.TMap.LatLng(DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude), zoom: 12, viewMode: '2D' })
  _map.ready = true
  _map.instance.on('click', evt => {
    const lat = typeof evt?.latLng?.getLat === 'function' ? evt.latLng.getLat() : null
    const lng = typeof evt?.latLng?.getLng === 'function' ? evt.latLng.getLng() : null
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    startPoint.value = { name: 'Map Selected Start', latitude: lat, longitude: lng }
    drawH5Map()
  })
  setStatus('Map ready', 'ok')
}
// #endif

// ─── 生命周期 ──────────────────────────────────────────
onMounted(async () => {
  isDark.value = getStorage('app_theme') === 'dark'
  // #ifdef H5
  const onStorage = () => { isDark.value = getStorage('app_theme') === 'dark' }
  window.addEventListener('storage', onStorage)
  // #endif
  // #ifdef H5
  try { await initH5Map() } catch (e) { setStatus(e?.message || String(e), 'err'); return }
  // #endif
  try { await doLoadBins() } catch (e) { setStatus(e?.message || String(e), 'err') }
  // #ifdef H5
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
#map { width: 100%; height: 100%; border-radius: 14px; border: 1px solid var(--line); overflow: hidden; }
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
</style>
