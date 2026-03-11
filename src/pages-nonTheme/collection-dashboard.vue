<template>
  <view :class="['screen', isLightTheme ? 'light-theme' : 'dark-theme']">

    <!-- ===== 顶部 panel ===== -->
    <view class="top panel">
      <view class="row">
        <view>
          <view class="title">垃圾清运可视化大屏</view>
          <view class="sub">Tencent Map + 清运路径实时调度</view>
        </view>
        <view class="actions">
          <view class="clock">{{ clockText }}</view>
          <view :class="['status', statusCls]">{{ statusText }}</view>
          <view class="strategy">
            <view
              v-for="s in strategyOptions"
              :key="s.value"
              :class="['strategy-btn', routeStrategy === s.value ? 'active' : '']"
              @tap="onStrategyTap(s.value)"
            >{{ s.label }}</view>
          </view>
          <view class="btn ghost nav-link-btn" @tap="goToCommunity">🏙 社区治理大屏</view>
          <view class="btn blue" @tap="doRefresh">立即刷新</view>
          <view class="btn ghost" @tap="goBack">返回</view>
        </view>
      </view>

      <!-- 指标卡片 -->
      <view class="cards">
        <view class="card">
          <view class="k">桶位总数</view>
          <view class="v">{{ metrics.total }}</view>
          <view class="delta">
            <text v-for="(tag, i) in metricDeltas.total" :key="i" :class="['tag', tag.cls]">{{ tag.label }}</text>
          </view>
        </view>
        <view class="card">
          <view class="k">紧急桶位</view>
          <view class="v">{{ metrics.urgent }}</view>
          <view class="delta">
            <text v-for="(tag, i) in metricDeltas.urgent" :key="i" :class="['tag', tag.cls]">{{ tag.label }}</text>
          </view>
        </view>
        <view class="card">
          <view class="k">平均满载率</view>
          <view class="v">{{ metrics.averageStr }}</view>
          <view class="delta">
            <text v-for="(tag, i) in metricDeltas.average" :key="i" :class="['tag', tag.cls]">{{ tag.label }}</text>
          </view>
        </view>
        <view class="card">
          <view class="k">本次路线里程</view>
          <view class="v">{{ metrics.distanceStr }}</view>
          <view class="delta">
            <text v-for="(tag, i) in metricDeltas.distance" :key="i" :class="['tag', tag.cls]">{{ tag.label }}</text>
          </view>
        </view>
        <view class="card">
          <view class="k">预计完工时长</view>
          <view class="v">{{ metrics.durationStr }}</view>
          <view class="delta">
            <text v-for="(tag, i) in metricDeltas.duration" :key="i" :class="['tag', tag.cls]">{{ tag.label }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- ===== 主体三列 ===== -->
    <view class="main">

      <!-- 左列 -->
      <view class="col left">
        <view class="panel block">
          <view class="block-title">风险桶位排行 <text class="note">高负载 > 临界 > 正常</text></view>
          <scroll-view class="list" scroll-y>
            <view v-if="!riskBins.length" class="empty">暂无桶位数据</view>
            <view
              v-for="(bin, index) in riskBins"
              :key="'risk-' + bin.id"
              :class="['risk', selectedBinId === String(bin.id) ? 'active' : '']"
              @tap="focusBin(bin.id)"
            >
              <view class="risk-top">
                <view class="rank">{{ index + 1 }}</view>
                <view class="name">{{ bin.name }}</view>
                <view :class="['chip', sev(bin.currentFill)]">{{ sevLabel(bin.currentFill) }}</view>
              </view>
              <view class="subline">
                <text>满载率 {{ clampFill(bin.currentFill).toFixed(1) }}%</text>
                <text>优先级 {{ n(bin.priorityScore, 0).toFixed(3) }}</text>
              </view>
              <view class="subline">
                <text>增长 {{ n(bin.growthRatePctPerHour, 0).toFixed(2) }}%/h</text>
                <text>{{ countdownToFull(bin.hoursToFull) }}</text>
              </view>
            </view>
          </scroll-view>
        </view>

        <view class="panel block">
          <view class="block-title">2小时风险预测 <text class="note">Top 6</text></view>
          <view class="bars">
            <view v-if="!forecastBins.length" class="empty" style="flex:1">暂无预测数据</view>
            <view v-for="bin in forecastBins" :key="'bar-' + bin.id" class="bar">
              <view class="bar-shell">
                <view
                  :class="['bar-fill', bin.predictedFillInHorizon >= 85 ? 'alert' : '']"
                  :style="{ height: clamp(bin.predictedFillInHorizon, 0, 100).toFixed(1) + '%' }"
                ></view>
              </view>
              <text class="bar-val">{{ clamp(bin.predictedFillInHorizon, 0, 100).toFixed(1) }}%</text>
              <text class="bar-name">{{ String(bin.name || '').slice(0, 4) || '点位' }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 中列（地图 + 时间轴） -->
      <view class="col center">
        <view class="panel map-wrap">
          <!-- #ifdef H5 -->
          <view class="map-stage">
            <view id="map" :class="{ 'is-ready': h5MapReady }"></view>
            <view v-if="!h5MapReady" class="map-placeholder">
              <text class="map-placeholder-title">{{ h5MapError ? '地图暂不可用' : '地图加载中' }}</text>
              <text class="map-placeholder-desc">
                {{ h5MapError || (h5MapLoading ? '清运数据会先展示，地图初始化完成后自动出现。' : '正在准备地图画布。') }}
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
            @markertap="onMarkerTap"
          ></map>
          <!-- #endif -->
          <view class="brief">
            <text class="brief-title">路线概览</text>
            <text v-for="(line, i) in briefLines" :key="i" class="brief-line">{{ line }}</text>
          </view>
        </view>

        <view class="panel timeline">
          <view class="block-title">清运时间轴 <text class="note">按停靠顺序展示 ETA</text></view>
          <scroll-view class="line" scroll-x>
            <view v-if="!timelineStops.length" class="tl-empty">暂无路线时间轴</view>
            <view
              v-for="stop in timelineStops"
              :key="'tl-' + stop.order"
              :class="['stop', selectedStopOrder === stop.order ? 'active' : '']"
              @tap="focusStop(stop.order)"
            >
              <text class="stop-o">#{{ stop.order }}</text>
              <text class="stop-n">{{ stop.name }}</text>
              <text class="stop-t">ETA {{ fmtTime(stop.eta) }}</text>
            </view>
          </scroll-view>
        </view>
      </view>

      <!-- 右列 -->
      <view class="col right">
        <view class="panel block">
          <view class="block-title">实时告警流 <text class="note">单车处置闭环</text></view>
          <scroll-view class="list" scroll-y>
            <view v-if="!alertBins.length" class="empty">当前无告警</view>
            <view
              v-for="bin in alertBins"
              :key="'alert-' + bin.id"
              :class="['alert', selectedBinId === String(bin.id) ? 'active' : '']"
              @tap="focusBin(bin.id)"
            >
              <view class="alert-top">
                <text>{{ bin.name }}</text>
                <text :class="['state-chip', handlingByBin.get(String(bin.id)) || 'pending']">
                  {{ handlingLabel(handlingByBin.get(String(bin.id)) || 'pending') }}
                </text>
              </view>
              <view class="alert-sub">
                <text>当前 {{ clampFill(bin.currentFill).toFixed(1) }}%</text>
                <text>预测 {{ n(bin.predictedFillInHorizon, 0).toFixed(1) }}%</text>
              </view>
              <view class="alert-sub">
                <text>{{ countdownToFull(bin.hoursToFull) }}</text>
                <text>{{ sevLabel(bin.currentFill) }}</text>
              </view>
            </view>
          </scroll-view>
        </view>

        <view class="panel block">
          <view class="block-title">车辆调度明细 <text class="note">仅 1 辆清运车</text></view>
          <scroll-view class="list" scroll-y>
            <view v-if="!dispatchStops.length" class="empty">暂无调度任务</view>
            <view
              v-for="stop in dispatchStops"
              :key="'dispatch-' + stop.order"
              :class="['dispatch', selectedStopOrder === stop.order ? 'active' : '']"
              @tap="focusStop(stop.order)"
            >
              <view class="dispatch-top">
                <text>#{{ stop.order }} {{ stop.name }}</text>
                <text>{{ fmtTime(stop.eta) }}</text>
              </view>
              <view class="dispatch-sub">
                <text>{{ fmtKm(stop.travelKm) }} / {{ fmtMin(stop.travelMinutes) }}</text>
                <text>满载率 {{ n(stop.currentFill, 0).toFixed(1) }}%</text>
              </view>
              <view class="dispatch-sub">
                <text>优先级 {{ n(stop.priorityScore, 0).toFixed(3) }}</text>
                <view v-if="stop.navUrl" class="nav-btn" @tap.stop="openNav(stop.navUrl)">导航</view>
              </view>
            </view>
          </scroll-view>
        </view>
      </view>

    </view><!-- end .main -->

  </view><!-- end .screen -->
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { baseUrl } from '@/api/settings'
import { mapConfig } from '@/api/map-config'
import { describeApiFailure, redirectIfAccessDenied } from '@/utils/access-guard.js'
import { goBackFromAdminPage, jumpToAdminPage } from '@/utils/admin-page-nav'
import { applyStoredTheme, bindThemeStorageSync } from '@/utils/theme'

// ─── 常量 ─────────────────────────────────────────────
const QQ_MAP_KEYS = [mapConfig.qqMapKey, mapConfig.qqMapKeyBackup].filter(Boolean)
const DEFAULT_CENTER = { latitude: 36.0671, longitude: 120.3826 }
const KPI_HISTORY_KEY = 'collection_dashboard_kpi_history_v2'

// ─── 工具函数 ──────────────────────────────────────────
function n(v, fallback = 0) {
  const value = Number(v)
  return Number.isFinite(value) ? value : fallback
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, n(v, min))) }
function clampFill(v) { return clamp(v, 0, 100) }

function sev(fill) {
  const f = clampFill(fill)
  if (f >= 90) return 'red'; if (f >= 80) return 'orange'
  if (f >= 65) return 'amber'; return 'green'
}
function sevRank(fill) {
  const f = clampFill(fill)
  if (f >= 90) return 3; if (f >= 80) return 2; if (f >= 65) return 1; return 0
}
function sevLabel(fill) {
  const f = clampFill(fill)
  if (f >= 90) return '紧急'; if (f >= 80) return '高负载'; if (f >= 65) return '临界'; return '正常'
}
function countdownToFull(hoursToFull) {
  const h = n(hoursToFull, NaN)
  if (!Number.isFinite(h)) return '预计满载时间未知'
  const mins = Math.max(0, Math.round(h * 60))
  const hh = Math.floor(mins / 60); const mm = mins % 60
  if (hh === 0) return `预计 ${mm} 分钟满载`
  return `预计 ${hh}h ${mm}m 满载`
}
function fmtTime(value, withSeconds = false) {
  const d = value ? new Date(value) : new Date()
  if (Number.isNaN(d.getTime())) return withSeconds ? '--:--:--' : '--:--'
  return d.toLocaleTimeString('zh-CN', {
    hour12: false, hour: '2-digit', minute: '2-digit',
    second: withSeconds ? '2-digit' : undefined
  })
}
function fmtKm(v) { return `${n(v, 0).toFixed(2)} km` }
function fmtMin(v) { return `${n(v, 0).toFixed(1)} min` }

function normalizeStrategy(value) {
  const v = String(value || '').trim().toLowerCase()
  if (v === 'shortest_distance') return 'shortest_distance'
  return 'shortest_time'
}
function strategyLabel(strategy) {
  if (strategy === 'shortest_distance') return '最短距离'
  return '最短时间'
}
function handlingLabel(status) {
  if (status === 'processing') return '处理中'
  if (status === 'dispatched') return '已派单'
  return '未处理'
}

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

function seededRatio(seed) {
  const text = String(seed || 'seed'); let hash = 0
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  return (hash % 1000) / 1000
}

// ─── 响应式状态 ────────────────────────────────────────
const clockText = ref('--:--:--')
const statusText = ref('准备就绪')
const statusCls = ref('')
const isLightTheme = ref(false)

const strategyOptions = [
  { label: '最短距离', value: 'shortest_distance' },
  { label: '最短时间', value: 'shortest_time' }
]
const routeStrategy = ref(normalizeStrategy(getStorage('collection_route_strategy')))

const metrics = ref({ total: 0, urgent: 0, averageStr: '0%', distanceStr: '0 km', durationStr: '0 min' })
const metricDeltas = ref({ total: [], urgent: [], average: [], distance: [], duration: [] })
const briefLines = ref(['等待数据...'])

const riskBins = ref([])
const forecastBins = ref([])
const alertBins = ref([])
const dispatchStops = ref([])
const timelineStops = ref([])
const selectedBinId = ref(null)
const selectedStopOrder = ref(null)
const handlingByBin = ref(new Map())

// 地图（小程序端用 <map> 组件）
const mapCenter = ref({ ...DEFAULT_CENTER })
const mapScale = ref(12)
const mapMarkers = ref([])
const mapPolyline = ref([])
const h5MapReady = ref(false)
const h5MapLoading = ref(false)
const h5MapError = ref('')

// 内部 state（不需要响应式）
const _state = {
  bins: [],
  plan: null,
  startPoint: null,
  manualStartPoint: null,
  loading: false,
  mapInstance: null,       // H5 TMap 实例
  mapReady: false,
  iconCache: new Map(),
  lastMapSignature: '',
  infoWindow: null,
  binMarkers: null,
  routePolyline: null,
  sequenceMarkers: null,
  startMarker: null,
  focusPolyline: null,
  kpiSeries: []
}

// ─── KPI 历史 ──────────────────────────────────────────
function loadKpiSeries() {
  try {
    const raw = getStorage(KPI_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (_) { return [] }
}
function saveKpiSeries(list) {
  try { setStorage(KPI_HISTORY_KEY, JSON.stringify(list)) } catch (_) {}
}
function pushKpi(snapshot) {
  const now = Date.now()
  const range = 35 * 24 * 60 * 60 * 1000
  const next = _state.kpiSeries.filter(item => now - Number(item.ts) < range)
  next.push({ ts: now, ...snapshot })
  _state.kpiSeries = next.slice(-800)
  saveKpiSeries(_state.kpiSeries)
}
function nearestKpi(hoursAgo, current, seedTag) {
  const target = Date.now() - hoursAgo * 3600 * 1000
  let best = null; let bestDiff = Infinity
  for (const item of _state.kpiSeries) {
    const diff = Math.abs(Number(item.ts) - target)
    if (diff < bestDiff) { best = item; bestDiff = diff }
  }
  if (best) return best
  const ratio = 0.92 + seededRatio(`${seedTag}-${new Date().toDateString()}`) * 0.16
  return {
    total: Math.max(0, current.total / ratio),
    urgent: Math.max(0, current.urgent / ratio),
    average: clamp(current.average / ratio, 0, 100),
    distance: Math.max(0, current.distance / ratio),
    duration: Math.max(0, current.duration / ratio)
  }
}

// ─── delta 标签 ────────────────────────────────────────
function deltaTag(label, current, base, unit, lowerBetter) {
  const c = n(current, NaN); const b = n(base, NaN)
  if (!Number.isFinite(c) || !Number.isFinite(b)) return { label: `${label} --`, cls: 'flat' }
  const delta = c - b; const abs = Math.abs(delta)
  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→'
  let cls = 'flat'
  if (delta !== 0) cls = lowerBetter ? (delta < 0 ? 'up' : 'down') : (delta > 0 ? 'up' : 'down')
  return { label: `${label} ${arrow}${abs.toFixed(1)}${unit || ''}`, cls }
}

// ─── 数据排序 ──────────────────────────────────────────
function sortedRiskBins() {
  return (_state.bins || []).slice().sort((a, b) =>
    sevRank(clampFill(b.currentFill)) - sevRank(clampFill(a.currentFill)) ||
    n(b.priorityScore, 0) - n(a.priorityScore, 0) ||
    n(a.hoursToFull, Infinity) - n(b.hoursToFull, Infinity) ||
    String(a.id).localeCompare(String(b.id))
  )
}
function sortedAlertBins() {
  return sortedRiskBins().filter(item => clampFill(item.currentFill) >= 65).slice(0, 8)
}
function buildHandlingMap(alertBinsArr, routeStops) {
  const map = new Map()
  const route = Array.isArray(routeStops) ? routeStops : []
  const indexed = new Map(route.map(s => [String(s.id), s]))
  const now = Date.now()
  let processingId = null
  const etaSorted = route.slice().sort((a, b) => new Date(a.eta) - new Date(b.eta))
  for (const stop of etaSorted) {
    const eta = new Date(stop.eta).getTime()
    const etd = new Date(stop.etd || stop.eta).getTime()
    if (now >= eta - 5 * 60 * 1000 && now <= etd + 5 * 60 * 1000) { processingId = String(stop.id); break }
  }
  if (!processingId && etaSorted.length) processingId = String(etaSorted[0].id)
  alertBinsArr.forEach(bin => {
    const id = String(bin.id)
    if (processingId && id === processingId) map.set(id, 'processing')
    else if (indexed.has(id)) map.set(id, 'dispatched')
    else map.set(id, 'pending')
  })
  return map
}

// ─── 渲染（更新响应式数据）─────────────────────────────
function renderMetrics() {
  const bins = _state.bins || []
  const route = _state.plan && _state.plan.route
  const m = {
    total: bins.length,
    urgent: bins.filter(b => b.isUrgent).length,
    average: bins.length ? bins.reduce((s, b) => s + n(b.currentFill, 0), 0) / bins.length : 0,
    distance: route ? n(route.totalDistanceKm, 0) : 0,
    duration: route ? n(route.totalMinutes, 0) : 0
  }
  metrics.value = {
    total: m.total,
    urgent: m.urgent,
    averageStr: `${m.average.toFixed(1)}%`,
    distanceStr: `${m.distance.toFixed(2)} km`,
    durationStr: `${m.duration.toFixed(1)} min`
  }
  const day = nearestKpi(24, m, 'day')
  const week = nearestKpi(24 * 7, m, 'week')
  const target = {
    total: Math.max(12, Math.round(m.total * 0.9)),
    urgent: Math.max(1, Math.round(m.total * 0.12)),
    average: 72, distance: 9.5, duration: 42
  }
  metricDeltas.value = {
    total: [deltaTag('较昨日', m.total, day.total, '', false), deltaTag('较上周', m.total, week.total, '', false), deltaTag('目标差', m.total, target.total, '', false)],
    urgent: [deltaTag('较昨日', m.urgent, day.urgent, '', true), deltaTag('较上周', m.urgent, week.urgent, '', true), deltaTag('目标差', m.urgent, target.urgent, '', true)],
    average: [deltaTag('较昨日', m.average, day.average, '%', true), deltaTag('较上周', m.average, week.average, '%', true), deltaTag('目标差', m.average, target.average, '%', true)],
    distance: [deltaTag('较昨日', m.distance, day.distance, 'km', true), deltaTag('较上周', m.distance, week.distance, 'km', true), deltaTag('目标差', m.distance, target.distance, 'km', true)],
    duration: [deltaTag('较昨日', m.duration, day.duration, 'min', true), deltaTag('较上周', m.duration, week.duration, 'min', true), deltaTag('目标差', m.duration, target.duration, 'min', true)]
  }
  pushKpi(m)
}

function renderBrief() {
  const route = _state.plan && _state.plan.route
  if (!route) { briefLines.value = ['尚未生成路线']; return }
  const start = (_state.plan && _state.plan.start) || _state.startPoint || DEFAULT_CENTER
  const providerLine = route.provider === 'tencent'
    ? '路线来源：腾讯道路'
    : '路线来源：降级直线（当前未拿到腾讯道路）'
  briefLines.value = [
    `策略：${strategyLabel(routeStrategy.value)} | 车辆：1 台`,
    `起点：${start.name || '清运起点'} | 停靠：${route.stops.length} 个`,
    `总里程：${fmtKm(route.totalDistanceKm)} | 总耗时：${fmtMin(route.totalMinutes)}`,
    `开始：${fmtTime(route.startTime)} | 结束：${fmtTime(route.endTime)}`,
    providerLine
  ]
}

function renderLists() {
  const risk = sortedRiskBins().slice(0, 8)
  riskBins.value = risk

  const forecast = (_state.bins || []).slice()
    .sort((a, b) => n(b.predictedFillInHorizon, 0) - n(a.predictedFillInHorizon, 0))
    .slice(0, 6)
  forecastBins.value = forecast

  const alerts = sortedAlertBins()
  alertBins.value = alerts

  const route = _state.plan && _state.plan.route
  const stops = route && Array.isArray(route.stops) ? route.stops : []
  dispatchStops.value = stops
  timelineStops.value = stops.slice(0, 12)

  handlingByBin.value = buildHandlingMap(alerts, stops)
}

function renderAll() {
  renderMetrics()
  renderBrief()
  renderLists()
  // #ifdef H5
  if (_state.mapReady) drawMap(false)
  // #endif
  // #ifndef H5
  buildMpMapData()
  // #endif
}

// ─── 小程序端地图数据 ──────────────────────────────────
function buildMpMapData() {
  const bins = _state.bins || []
  const colorMap = { green: '#16c57c', amber: '#f5b648', orange: '#ff8b3d', red: '#ff5d66' }
  const markers = bins.map((bin, i) => ({
    id: i,
    latitude: n(bin.latitude, 0),
    longitude: n(bin.longitude, 0),
    title: bin.name,
    iconPath: '',
    label: { content: String(bin.name || '').slice(0, 4), color: '#fff', fontSize: 10, bgColor: colorMap[sev(bin.currentFill)] || '#2c8fff', padding: 3, borderRadius: 4 },
    width: 24, height: 24,
    callout: { content: `${bin.name}\n满载率 ${clampFill(bin.currentFill).toFixed(1)}%`, display: 'BYCLICK', color: '#17324a', fontSize: 12, borderRadius: 6, bgColor: '#fff', padding: 6 }
  }))

  const route = _state.plan && _state.plan.route
  const polylineArr = []
  if (route && Array.isArray(route.polyline) && route.polyline.length > 1) {
    polylineArr.push({
      points: route.polyline.map(p => ({ latitude: p[0], longitude: p[1] })),
      color: '#2dc6ffcc', width: 6
    })
  }

  mapMarkers.value = markers
  mapPolyline.value = polylineArr

  if (_state.startPoint) {
    mapCenter.value = { latitude: _state.startPoint.latitude, longitude: _state.startPoint.longitude }
  } else if (bins.length) {
    mapCenter.value = { latitude: n(bins[0].latitude, DEFAULT_CENTER.latitude), longitude: n(bins[0].longitude, DEFAULT_CENTER.longitude) }
  }
}

// ─── H5 腾讯地图 ───────────────────────────────────────
// #ifdef H5
function markerSvg(fillColor, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="14" fill="${fillColor}" stroke="#fff" stroke-width="3"></circle><text x="22" y="26" text-anchor="middle" font-size="13" font-weight="700" fill="#fff" font-family="Arial">${label}</text></svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}
function iconSrc(key, fillColor, label) {
  if (_state.iconCache.has(key)) return _state.iconCache.get(key)
  const src = markerSvg(fillColor, label)
  _state.iconCache.set(key, src); return src
}
function mapSignature() {
  const bins = (_state.bins || []).map(b => `${b.id}:${Math.round(n(b.currentFill, 0) * 10) / 10}`).join('|')
  const route = _state.plan && _state.plan.route
  const stops = route && Array.isArray(route.stops) ? route.stops.map(s => `${s.order}:${s.id}`).join('|') : 'none'
  const polyline = route && Array.isArray(route.polyline) ? route.polyline : []
  const polylineMeta = polyline.length
    ? `${polyline.length}:${polyline[0][0]},${polyline[0][1]}:${polyline[polyline.length - 1][0]},${polyline[polyline.length - 1][1]}`
    : 'none'
  const segmentMeta = route && Array.isArray(route.segments)
    ? route.segments.map(segment => Array.isArray(segment && segment.polyline) ? segment.polyline.length : 0).join(',')
    : 'none'
  const startMeta = _state.startPoint
    ? `${n(_state.startPoint.latitude, 0)},${n(_state.startPoint.longitude, 0)}`
    : 'none'
  const generatedAt = _state.plan && _state.plan.generatedAt ? String(_state.plan.generatedAt) : 'none'
  return `${bins}::${stops}::poly-${polylineMeta}::seg-${segmentMeta}::start-${startMeta}::gen-${generatedAt}::sel-${selectedBinId.value || ''}-${selectedStopOrder.value || ''}-${routeStrategy.value}`
}
function clearH5Map() {
  const s = _state
  if (s.binMarkers) { s.binMarkers.setMap(null); s.binMarkers = null }
  if (s.routePolyline) { s.routePolyline.setMap(null); s.routePolyline = null }
  if (s.sequenceMarkers) { s.sequenceMarkers.setMap(null); s.sequenceMarkers = null }
  if (s.startMarker) { s.startMarker.setMap(null); s.startMarker = null }
  if (s.focusPolyline) { s.focusPolyline.setMap(null); s.focusPolyline = null }
}
function showInfoWindow(lat, lng, html) {
  if (!window.TMap || !_state.mapInstance) return
  const point = new window.TMap.LatLng(lat, lng)
  if (!_state.infoWindow) {
    _state.infoWindow = new window.TMap.InfoWindow({ map: _state.mapInstance, position: point, content: html }); return
  }
  _state.infoWindow.setMap(_state.mapInstance)
  _state.infoWindow.setPosition(point)
  _state.infoWindow.setContent(html)
}
function drawMap(force) {
  if (!_state.mapInstance || !window.TMap) return
  const sig = mapSignature()
  if (!force && sig === _state.lastMapSignature) return
  _state.lastMapSignature = sig
  clearH5Map()

  const TMap = window.TMap
  const bins = _state.bins || []
  const bounds = new TMap.LatLngBounds()
  let hasBounds = false
  const colorMap = { green: '#16c57c', amber: '#f5b648', orange: '#ff8b3d', red: '#ff5d66', selected: '#2c8fff' }
  const styles = {}
  Object.entries(colorMap).forEach(([k, c]) => {
    styles[k] = new TMap.MarkerStyle({ width: k === 'selected' ? 30 : 24, height: k === 'selected' ? 30 : 24, anchor: { x: k === 'selected' ? 15 : 12, y: k === 'selected' ? 15 : 12 }, src: iconSrc(k, c, k === 'selected' ? 'X' : '') })
  })

  const geometries = bins.map((bin, i) => {
    const pos = new TMap.LatLng(n(bin.latitude, 0), n(bin.longitude, 0))
    bounds.extend(pos); hasBounds = true
    const styleId = selectedBinId.value && String(selectedBinId.value) === String(bin.id) ? 'selected' : sev(clampFill(bin.currentFill))
    return { id: `bin-${bin.id}-${i}`, styleId, position: pos, properties: { i } }
  })
  if (geometries.length) {
    _state.binMarkers = new TMap.MultiMarker({ id: 'db-bins', map: _state.mapInstance, styles, geometries })
    _state.binMarkers.on('click', evt => {
      const i = evt?.geometry?.properties?.i
      if (!Number.isFinite(i) || !bins[i]) return
      focusBin(bins[i].id, true)
    })
  }

  if (_state.startPoint) {
    const sp = new TMap.LatLng(_state.startPoint.latitude, _state.startPoint.longitude)
    _state.startMarker = new TMap.MultiMarker({ id: 'db-start', map: _state.mapInstance, styles: { s: new TMap.MarkerStyle({ width: 28, height: 28, anchor: { x: 14, y: 14 }, src: iconSrc('start', '#2c8fff', 'S') }) }, geometries: [{ id: 'start-1', styleId: 's', position: sp }] })
    bounds.extend(sp); hasBounds = true
  }

  const route = _state.plan && _state.plan.route
  if (route && Array.isArray(route.polyline) && route.polyline.length > 1) {
    const polyline = route.polyline.map(p => new TMap.LatLng(p[0], p[1]))
    _state.routePolyline = new TMap.MultiPolyline({ id: 'db-route', map: _state.mapInstance, styles: { route: new TMap.PolylineStyle({ color: '#2dc6ff', width: 6, borderWidth: 2, borderColor: '#fff', lineCap: 'round' }) }, geometries: [{ id: 'main', styleId: 'route', paths: polyline }] })
    polyline.forEach(p => { bounds.extend(p); hasBounds = true })

    const stopStyles = {}
    const stopGeos = (route.stops || []).map((stop, idx) => {
      const focused = selectedStopOrder.value === Number(stop.order)
      const sid = focused ? `focus-${stop.order}` : `stop-${stop.order}`
      if (!stopStyles[sid]) stopStyles[sid] = new TMap.MarkerStyle({ width: focused ? 28 : 24, height: focused ? 28 : 24, anchor: { x: focused ? 14 : 12, y: focused ? 14 : 12 }, src: iconSrc(sid, focused ? '#ff9f42' : '#1f7eff', String(stop.order)) })
      return { id: `stop-${idx}`, styleId: sid, position: new TMap.LatLng(stop.latitude, stop.longitude), properties: { order: stop.order } }
    })
    if (stopGeos.length) {
      _state.sequenceMarkers = new TMap.MultiMarker({ id: 'db-seq', map: _state.mapInstance, styles: stopStyles, geometries: stopGeos })
      _state.sequenceMarkers.on('click', evt => {
        const order = evt?.geometry?.properties?.order
        if (!Number.isFinite(order)) return
        focusStop(order, true)
      })
    }

    if (selectedStopOrder.value !== null) {
      const idx = (route.stops || []).findIndex(s => Number(s.order) === Number(selectedStopOrder.value))
      if (idx >= 0) {
        const stop = route.stops[idx]
        const segmentPoints = Array.isArray(stop.segmentPolyline) && stop.segmentPolyline.length > 1
          ? stop.segmentPolyline
          : (route.segments && Array.isArray(route.segments[idx] && route.segments[idx].polyline) && route.segments[idx].polyline.length > 1
            ? route.segments[idx].polyline
            : null)
        if (segmentPoints) {
          _state.focusPolyline = new TMap.MultiPolyline({
            id: 'db-focus',
            map: _state.mapInstance,
            styles: { focus: new TMap.PolylineStyle({ color: '#ffb04a', width: 7, borderWidth: 2, borderColor: '#fff', lineCap: 'round' }) },
            geometries: [{ id: 'focus', styleId: 'focus', paths: segmentPoints.map(p => new TMap.LatLng(p[0], p[1])) }]
          })
        }
      }
    }
  }
  if (hasBounds && _state.mapInstance.fitBounds) _state.mapInstance.fitBounds(bounds, { padding: 70 })
}
// #endif

// ─── 交互：聚焦 bin / stop ────────────────────────────
function focusBin(binId, forceMap) {
  const bin = (_state.bins || []).find(item => String(item.id) === String(binId))
  if (!bin) return
  selectedBinId.value = String(bin.id)
  selectedStopOrder.value = null
  renderLists()
  // #ifdef H5
  if (_state.mapReady && _state.mapInstance) {
    _state.mapInstance.setCenter(new window.TMap.LatLng(bin.latitude, bin.longitude))
    showInfoWindow(bin.latitude, bin.longitude, `<div style="min-width:180px;padding:2px 4px"><div style="font-size:13px;font-weight:700;color:#17324a">${bin.name}</div><div style="margin-top:4px;font-size:12px;color:#365066">满载率 ${n(bin.currentFill, 0).toFixed(1)}% · 预测 ${n(bin.predictedFillInHorizon, 0).toFixed(1)}%</div><div style="margin-top:2px;font-size:12px;color:#60778b">优先级 ${n(bin.priorityScore, 0).toFixed(3)}</div></div>`)
  }
  drawMap(!!forceMap)
  // #endif
  // #ifndef H5
  mapCenter.value = { latitude: n(bin.latitude, DEFAULT_CENTER.latitude), longitude: n(bin.longitude, DEFAULT_CENTER.longitude) }
  mapScale.value = 14
  buildMpMapData()
  // #endif
}
function focusStop(order, forceMap) {
  const route = _state.plan && _state.plan.route
  if (!route || !Array.isArray(route.stops)) return
  const stop = route.stops.find(item => Number(item.order) === Number(order))
  if (!stop) return
  selectedStopOrder.value = Number(stop.order)
  selectedBinId.value = String(stop.id)
  renderLists()
  // #ifdef H5
  if (_state.mapReady && _state.mapInstance) {
    _state.mapInstance.setCenter(new window.TMap.LatLng(stop.latitude, stop.longitude))
    showInfoWindow(stop.latitude, stop.longitude, `<div style="min-width:185px;padding:2px 4px"><div style="font-size:13px;font-weight:700;color:#17324a">#${stop.order} ${stop.name}</div><div style="margin-top:4px;font-size:12px;color:#365066">ETA ${fmtTime(stop.eta)} · ${fmtKm(stop.travelKm)}</div><div style="margin-top:2px;font-size:12px;color:#60778b">满载率 ${n(stop.currentFill, 0).toFixed(1)}%</div></div>`)
  }
  drawMap(!!forceMap)
  // #endif
  // #ifndef H5
  mapCenter.value = { latitude: n(stop.latitude, DEFAULT_CENTER.latitude), longitude: n(stop.longitude, DEFAULT_CENTER.longitude) }
  mapScale.value = 14
  buildMpMapData()
  // #endif
}

// ─── API ───────────────────────────────────────────────
function authHeaders() {
  const token = getStorage('token') || ''
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = token
  return headers
}

function apiRequest(path) {
  return new Promise((resolve, reject) => {
    const url = path.startsWith('/') ? `${baseUrl}${path}` : path
    // #ifdef H5
    fetch(url, { headers: authHeaders() })
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
      })
      .catch(reject)
    // #endif
    // #ifndef H5
    uni.request({
      url, header: authHeaders(),
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

function setStatus(text, cls) {
  statusText.value = text || ''
  statusCls.value = cls || ''
}

function buildDashboardSnapshotPath() {
  const params = [`routeStrategy=${encodeURIComponent(routeStrategy.value)}`]

  if (_state.manualStartPoint) {
    params.push(`startLat=${encodeURIComponent(String(n(_state.manualStartPoint.latitude, 0)))}`)
    params.push(`startLng=${encodeURIComponent(String(n(_state.manualStartPoint.longitude, 0)))}`)
    params.push(
      `startName=${encodeURIComponent(_state.manualStartPoint.name || '地图选择起点')}`
    )
  }

  return `/api/planning/dashboard-snapshot?${params.join('&')}`
}

function syncStartPointFromPlan() {
  if (_state.manualStartPoint) {
    _state.startPoint = { ..._state.manualStartPoint }
    return
  }

  if (_state.plan && _state.plan.start) {
    _state.startPoint = {
      name: _state.plan.start.name || '默认起点',
      latitude: _state.plan.start.latitude,
      longitude: _state.plan.start.longitude
    }
    return
  }

  if (_state.bins.length) {
    const first = _state.bins[0]
    _state.startPoint = { name: '默认起点', latitude: first.latitude, longitude: first.longitude }
    return
  }

  _state.startPoint = null
}

async function doRefresh(options) {
  const silent = !!(options && options.silent)
  if (_state.loading) return
  _state.loading = true
  if (!silent) setStatus(`正在刷新清运数据（${strategyLabel(routeStrategy.value)}）...`, 'warn')
  try {
    const data = await apiRequest(buildDashboardSnapshotPath())
    _state.bins = Array.isArray(data && data.bins) ? data.bins : []
    _state.plan = data && data.plan ? data.plan : null

    if (!_state.bins.length) {
      _state.plan = null; renderAll(); setStatus('暂无可用桶位数据', 'warn'); return
    }
    if (_state.plan && _state.plan.options && _state.plan.options.routeStrategy) {
      routeStrategy.value = normalizeStrategy(_state.plan.options.routeStrategy)
      setStorage('collection_route_strategy', routeStrategy.value)
    }
    syncStartPointFromPlan()

    const routeStops = _state.plan?.route?.stops || []
    if (selectedStopOrder.value !== null && !routeStops.some(s => Number(s.order) === Number(selectedStopOrder.value))) selectedStopOrder.value = null
    if (selectedBinId.value !== null && !_state.bins.some(b => String(b.id) === String(selectedBinId.value))) selectedBinId.value = null

    renderAll()
    setStatus(`刷新成功：${_state.bins.length} 个桶位，${routeStops.length} 个停靠点，策略 ${strategyLabel(routeStrategy.value)}`, 'ok')
  } catch (err) {
    console.error('[collection-dashboard] refresh failed:', err)
    setStatus(err && err.message ? err.message : String(err), 'err')
  } finally {
    _state.loading = false
  }
}

// ─── 策略切换 ──────────────────────────────────────────
function onStrategyTap(value) {
  const next = normalizeStrategy(value)
  if (next === routeStrategy.value) return
  routeStrategy.value = next
  setStorage('collection_route_strategy', next)
  doRefresh()
}

// ─── 导航 ──────────────────────────────────────────────
function openNav(url) {
  if (!url) return
  // #ifdef H5
  window.open(url, '_blank')
  // #endif
  // #ifndef H5
  uni.navigateTo({ url: `/pages-nonTheme/webview?url=${encodeURIComponent(url)}` })
  // #endif
}
function goToCommunity() {
  jumpToAdminPage('communityDashboard', { from: 'collectionDashboard' })
}
function goBack() {
  goBackFromAdminPage('collectionDashboard')
}
function onMarkerTap(e) {
  // 小程序 <map> 标记点击：e.detail.markerId 即 mapMarkers 中的 id（即 bins 索引）
  const i = e && e.detail && e.detail.markerId
  if (!Number.isFinite(i)) return
  const bin = _state.bins[i]
  if (bin) focusBin(bin.id)
}

// ─── 时钟 ──────────────────────────────────────────────
let clockTimer = null
function tick() { clockText.value = fmtTime(new Date(), true) }

// ─── 定时刷新 ──────────────────────────────────────────
let refreshTimer = null
let unbindThemeWatcher = null
let storageHandler = null

// ─── H5 地图初始化 ─────────────────────────────────────
// #ifdef H5
async function loadTMapSdk() {
  if (window.TMap) return window.TMap
  for (const key of QQ_MAP_KEYS) {
    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${key}`
        script.async = true; script.onload = resolve
        script.onerror = () => reject(new Error(`failed key ${key}`))
        document.head.appendChild(script)
      })
      if (window.TMap) return window.TMap
    } catch (e) { console.warn('[dashboard-map] sdk load failed:', e?.message) }
  }
  throw new Error('腾讯地图 SDK 加载失败')
}
async function initH5Map() {
  await loadTMapSdk()
  _state.mapInstance = new window.TMap.Map('map', {
    center: new window.TMap.LatLng(DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude),
    zoom: 12, viewMode: '2D'
  })
  _state.mapReady = true
  _state.mapInstance.on('click', evt => {
    const lat = typeof evt?.latLng?.getLat === 'function' ? evt.latLng.getLat() : null
    const lng = typeof evt?.latLng?.getLng === 'function' ? evt.latLng.getLng() : null
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    _state.manualStartPoint = { name: '地图选择起点', latitude: lat, longitude: lng }
    _state.startPoint = { ..._state.manualStartPoint }
    doRefresh()
  })
  window.addEventListener('resize', () => {
    requestAnimationFrame(() => {
      if (_state.mapInstance && typeof _state.mapInstance.resize === 'function') _state.mapInstance.resize()
      drawMap(true)
    })
  })
}
// #endif

// ─── 生命周期 ──────────────────────────────────────────
onMounted(async () => {
  const mode = applyStoredTheme()
  isLightTheme.value = mode === 'light'
  unbindThemeWatcher = bindThemeStorageSync()
  // #ifdef H5
  storageHandler = (event) => {
    if (!event || event.key === 'app_theme') {
      isLightTheme.value = getStorage('app_theme') !== 'dark'
    }
  }
  window.addEventListener('storage', storageHandler)
  // #endif

  _state.kpiSeries = loadKpiSeries()
  tick()
  clockTimer = setInterval(tick, 1000)

  const refreshPromise = doRefresh()

  // #ifdef H5
  h5MapLoading.value = true
  h5MapError.value = ''
  initH5Map()
    .then(() => {
      h5MapReady.value = true
      h5MapLoading.value = false
      drawMap(true)
    })
    .catch((error) => {
      h5MapLoading.value = false
      h5MapError.value = error && error.message ? error.message : '地图加载失败'
      console.error('[collection-dashboard] map init failed:', error)
    })
  // #endif

  await refreshPromise
  refreshTimer = setInterval(() => doRefresh({ silent: true }), 60000)
})

onBeforeUnmount(() => {
  if (clockTimer) clearInterval(clockTimer)
  if (refreshTimer) clearInterval(refreshTimer)
  if (typeof unbindThemeWatcher === 'function') unbindThemeWatcher()
  // #ifdef H5
  if (storageHandler) {
    window.removeEventListener('storage', storageHandler)
    storageHandler = null
  }
  // #endif
  // #ifdef H5
  clearH5Map()
  if (_state.infoWindow) { _state.infoWindow.setMap(null); _state.infoWindow = null }
  if (_state.mapInstance) { try { _state.mapInstance.destroy() } catch (_) {} _state.mapInstance = null }
  // #endif
})
</script>

<style scoped>
/* ===== CSS 变量（深色主题为默认，匹配原版） ===== */
page { background: linear-gradient(160deg, #071726, #0c2840); }
.screen {
  --bg: #071726; --bg2: #0c2840; --panel: rgba(7,27,43,.78); --line: rgba(116,197,255,.28);
  --text: #e8f8ff; --muted: #8fb1c4; --blue: #2c8fff; --cyan: #24d9ff;
  --green: #16c57c; --amber: #f5b648; --orange: #ff8b3d; --red: #ff5d66;

  min-height: 100vh;
  height: 100vh;
  width: 100%;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: var(--text);
  font-family: "Source Han Sans SC", "Microsoft YaHei", sans-serif;
  background:
    radial-gradient(900px 500px at -20% 20%, rgba(44,143,255,.22), transparent 55%),
    linear-gradient(160deg, var(--bg), var(--bg2));
  box-sizing: border-box;
  overflow: hidden;
}
.screen.light-theme {
  --bg: #092238;
  --bg2: #103552;
  --panel: rgba(9,36,56,.82);
  --line: rgba(118,201,255,.3);
  --text: #eaf8ff;
  --muted: #93b7cb;
  --blue: #3090ff;
  --cyan: #2ad8f7;
  --green: #19cb87;
  --amber: #ffbf57;
  --orange: #ff9a47;
  --red: #ff6f78;
}

/* ===== panel ===== */
.screen .panel {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 14px;
  backdrop-filter: blur(6px);
}

/* ===== 顶部 ===== */
.screen .top { padding: 8px 12px; display: flex; flex-direction: column; gap: 8px; }
.screen .row { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.screen .title { font-size: 26px; font-weight: 700; letter-spacing: 2px; text-shadow: 0 0 18px rgba(36,217,255,.4); }
.screen .sub { font-size: 12px; color: var(--muted); margin-top: 4px; }
.screen .actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.screen .clock {
  font-size: 20px; min-width: 150px; text-align: center;
  padding: 6px 10px; border: 1px solid rgba(132,212,255,.4);
  border-radius: 10px; background: rgba(6,35,54,.7);
}
.screen .status {
  font-size: 12px; min-width: 150px; text-align: center;
  padding: 7px 11px; border-radius: 999px;
  border: 1px solid rgba(151,217,255,.3);
  background: rgba(12,44,69,.7); color: #bde8ff;
}
.screen .status.ok { color: #9cf8cf; border-color: rgba(25,198,127,.5); background: rgba(13,64,46,.52); }
.screen .status.warn { color: #ffe6a7; border-color: rgba(245,181,66,.45); background: rgba(94,62,13,.5); }
.screen .status.err { color: #ffd0d2; border-color: rgba(255,93,102,.5); background: rgba(94,18,24,.5); }

/* ===== 策略按钮 ===== */
.screen .strategy {
  display: flex; gap: 4px; padding: 4px;
  border: 1px solid rgba(132,212,255,.3); border-radius: 11px;
  background: rgba(5,33,52,.7);
}
.screen .strategy-btn {
  border-radius: 8px; color: #9ec9db; font-size: 12px;
  padding: 5px 9px; white-space: nowrap;
}
.screen .strategy-btn.active {
  background: linear-gradient(135deg, #2378e7, #41a9ff); color: #fff;
}

/* ===== 按钮 ===== */
.screen .btn {
  border-radius: 10px; padding: 8px 12px; color: #fff;
  font-size: 12px; display: inline-flex; align-items: center; justify-content: center;
}
.screen .btn.blue { background: linear-gradient(135deg, #2378e7, #42abff); }
.screen .btn.ghost { background: rgba(255,255,255,.12); border: 1px solid rgba(151,217,255,.3); }
.screen .nav-link-btn { gap: 6px; }

/* ===== 指标卡片 ===== */
.screen .cards { display: flex; gap: 7px; flex-wrap: wrap; }
.screen .card {
  flex: 1; min-width: 130px;
  border: 1px solid rgba(134,206,255,.22); border-radius: 12px;
  padding: 6px 9px;
  background: linear-gradient(180deg, rgba(13,40,63,.7), rgba(10,28,44,.86));
}
.screen .card .k { font-size: 12px; color: #9ec9db; }
.screen .card .v { font-size: 24px; line-height: 1; margin-top: 5px; }
.screen .delta { font-size: 11px; color: #83afc5; display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px; }
.screen .delta .tag {
  display: inline-flex; align-items: center;
  padding: 1px 6px; border-radius: 999px;
  border: 1px solid rgba(144,211,255,.2);
  background: rgba(8,35,54,.65);
}
.screen .delta .tag.up { color: #86f7c3; border-color: rgba(22,197,124,.45); background: rgba(11,66,45,.45); }
.screen .delta .tag.down { color: #ffd3d5; border-color: rgba(255,93,102,.45); background: rgba(88,22,28,.45); }
.screen .delta .tag.flat { color: #c8dff0; }

/* ===== 主体三列 ===== */
.screen .main { flex: 1; min-height: 0; display: flex; gap: 10px; }
.screen .col { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.screen .col.left { width: 22%; min-width: 180px; }
.screen .col.center { flex: 1; min-width: 300px; }
.screen .col.right { width: 22%; min-width: 180px; }

/* ===== block ===== */
.screen .block {
  min-height: 0; padding: 10px;
  display: flex; flex-direction: column; gap: 8px; flex: 1;
}
.screen .block-title {
  font-size: 13px; font-weight: 600; letter-spacing: .8px;
  display: flex; justify-content: space-between; align-items: center;
}
.screen .note { font-size: 11px; color: #7ea8bb; }

/* ===== list ===== */
.screen .list {
  flex: 1; min-height: 0;
  scrollbar-width: thin;
  scrollbar-color: rgba(63,169,233,.72) rgba(6,28,44,.58);
}
.screen .list::-webkit-scrollbar { width: 6px; }
.screen .list::-webkit-scrollbar-track {
  background: rgba(6,28,44,.58);
  border-radius: 999px;
}
.screen .list::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, rgba(105,197,238,.82), rgba(44,132,213,.86));
  border: 1px solid rgba(98,198,238,.26);
  border-radius: 999px;
}
.screen .list::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
.screen .risk, .screen .dispatch, .screen .alert {
  border: 1px solid rgba(124,198,244,.2); border-radius: 10px;
  background: rgba(10,33,51,.74); padding: 8px 9px; margin-bottom: 7px;
}
.screen .risk.active, .screen .dispatch.active, .screen .alert.active {
  border-color: rgba(38,170,255,.9);
  box-shadow: 0 0 0 2px rgba(47,146,235,.35);
}
.screen .risk-top { display: flex; gap: 7px; align-items: center; }
.screen .rank {
  width: 22px; height: 22px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700;
  background: linear-gradient(135deg, rgba(45,126,230,.85), rgba(37,216,255,.85));
  flex-shrink: 0;
}
.screen .name { font-size: 13px; flex: 1; overflow: hidden; }
.screen .chip { font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid rgba(174,208,233,.22); flex-shrink: 0; }
.screen .green { background: rgba(12,110,72,.75); }
.screen .amber { background: rgba(124,82,8,.75); }
.screen .orange { background: rgba(122,62,18,.77); }
.screen .red { background: rgba(128,32,38,.8); }
.screen .subline { font-size: 11px; color: #87adc2; display: flex; justify-content: space-between; margin-top: 5px; }
.screen .empty {
  display: flex; align-items: center; justify-content: center;
  min-height: 60px; font-size: 12px; color: #7090a5;
  border: 1px dashed rgba(123,191,235,.25); border-radius: 10px;
  background: rgba(10,30,45,.48); padding: 12px; text-align: center;
}

/* ===== 预测柱状图 ===== */
.screen .bars { display: flex; gap: 8px; align-items: flex-end; flex: 1; min-height: 100px; }
.screen .bar { display: flex; flex-direction: column; align-items: center; gap: 5px; flex: 1; }
.screen .bar-shell {
  width: 100%; max-width: 34px; height: 100px;
  border: 1px solid rgba(129,197,242,.26); border-radius: 8px;
  background: linear-gradient(180deg, rgba(14,39,59,.84), rgba(8,25,41,.94));
  position: relative; overflow: hidden;
}
.screen .bar-fill {
  position: absolute; left: 0; right: 0; bottom: 0;
  background: linear-gradient(180deg, #24d9ff, #1f7eff);
  border-radius: 6px 6px 0 0;
  transition: height .4s ease;
}
.screen .bar-fill.alert { background: linear-gradient(180deg, #ff8f41, #ff5d66); }
.screen .bar-val { font-size: 12px; }
.screen .bar-name { font-size: 10px; color: #84acbf; max-width: 52px; overflow: hidden; text-align: center; }

/* ===== 地图区 ===== */
.screen .map-wrap {
  flex: 1; min-height: 0; padding: 10px;
  position: relative; display: flex; flex-direction: column;
}
/* #ifdef H5 */
.screen .map-stage { position: relative; flex: 1; min-height: 0; }
#map {
  flex: 1; min-height: 0; height: 100%;
  border-radius: 12px; border: 1px solid rgba(122,202,255,.32); overflow: hidden;
  opacity: 0; transition: opacity .24s ease;
}
#map.is-ready { opacity: 1; }
.screen .map-placeholder {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; padding: 20px;
  border: 1px dashed rgba(122,202,255,.28);
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(10, 29, 47, .82), rgba(8, 24, 38, .92));
  text-align: center;
}
.screen.light-theme .map-placeholder {
  background: linear-gradient(180deg, rgba(241, 248, 255, .96), rgba(233, 244, 255, .92));
  border-color: rgba(44, 143, 255, .18);
}
.screen .map-placeholder-title {
  font-size: 15px; font-weight: 700; color: var(--text);
}
.screen .map-placeholder-desc {
  max-width: 320px; font-size: 12px; line-height: 1.6; color: var(--muted);
}
/* #endif */
.screen .mp-map { flex: 1; min-height: 300px; border-radius: 12px; }
.screen .brief {
  position: absolute; left: 22px; top: 20px; z-index: 8;
  min-width: 200px; max-width: 72%;
  padding: 9px 10px; border-radius: 10px;
  border: 1px solid rgba(144,211,255,.36);
  background: rgba(5,22,35,.76);
  font-size: 12px; display: flex; flex-direction: column; gap: 4px;
  pointer-events: none;
}
.screen .brief-title { color: #8ce6ff; font-size: 13px; font-weight: 600; }
.screen .brief-line { color: var(--text); font-size: 12px; line-height: 1.5; }

/* ===== 时间轴 ===== */
.screen .timeline {
  padding: 8px; display: flex; flex-direction: column; gap: 6px;
  min-height: 100px; flex: 0 0 auto;
}
.screen .line {
  flex: 1; white-space: nowrap; overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(63,169,233,.72) rgba(6,28,44,.58);
}
.screen .line::-webkit-scrollbar { height: 6px; }
.screen .line::-webkit-scrollbar-track {
  background: rgba(6,28,44,.58);
  border-radius: 999px;
}
.screen .line::-webkit-scrollbar-thumb {
  background: linear-gradient(90deg, rgba(105,197,238,.82), rgba(44,132,213,.86));
  border: 1px solid rgba(98,198,238,.26);
  border-radius: 999px;
}
.screen .line::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
.screen .stop {
  display: inline-flex; flex-direction: column; gap: 4px;
  min-width: 140px; min-height: 62px;
  border: 1px solid rgba(129,197,242,.28);
  background: rgba(9,31,48,.86); border-radius: 10px;
  padding: 6px 7px; margin-right: 6px; vertical-align: top;
}
.screen .stop.active { border-color: rgba(38,170,255,.9); box-shadow: 0 0 0 2px rgba(47,146,235,.35); }
.screen .stop-o { font-size: 14px; color: #9ddcff; }
.screen .stop-n { font-size: 11px; overflow: hidden; }
.screen .stop-t { font-size: 11px; color: #86adbf; }
.screen .tl-empty {
  display: inline-flex; align-items: center; font-size: 12px; color: #7090a5; padding: 12px;
}

/* ===== 告警 / 调度 ===== */
.screen .alert { border-color: rgba(255,113,96,.3); background: linear-gradient(180deg, rgba(65,19,24,.66), rgba(33,12,17,.74)); }
.screen .alert-top { display: flex; justify-content: space-between; gap: 6px; font-size: 12px; color: #ffd4d7; }
.screen .alert-sub { display: flex; justify-content: space-between; gap: 6px; font-size: 11px; color: #ffd4d7; margin-top: 5px; }
.screen .dispatch-top { display: flex; justify-content: space-between; gap: 6px; font-size: 12px; }
.screen .dispatch-sub { display: flex; justify-content: space-between; gap: 6px; font-size: 11px; color: #88afc2; margin-top: 5px; }
.screen .state-chip {
  font-size: 10px; padding: 2px 7px;
  border-radius: 999px; border: 1px solid rgba(255,255,255,.22);
}
.screen .state-chip.pending { background: rgba(105,120,132,.7); }
.screen .state-chip.processing { background: rgba(255,144,61,.75); }
.screen .state-chip.dispatched { background: rgba(49,139,255,.72); }
.screen .nav-btn {
  border: 1px solid rgba(88,165,255,.45); background: rgba(28,96,191,.45);
  color: #d5ecff; font-size: 11px; padding: 2px 7px; border-radius: 999px;
}

/* ===== 手机端适配（≤768px） ===== */
@media (max-width: 768px) {
  .screen {
    height: auto;
    min-height: 100vh;
    overflow: auto;
    padding: 8px;
    gap: 8px;
  }
  .screen .top { padding: 8px 10px; }
  .screen .row { flex-direction: column; align-items: flex-start; gap: 8px; }
  .screen .title { font-size: 18px; letter-spacing: 0.5px; }
  .screen .actions { width: 100%; gap: 6px; flex-wrap: wrap; }
  .screen .clock { font-size: 14px; min-width: unset; flex: 1; padding: 5px 8px; }
  .screen .status { font-size: 11px; min-width: unset; flex: 1; padding: 5px 8px; }
  .screen .strategy { padding: 3px; }
  .screen .strategy-btn { font-size: 11px; padding: 4px 7px; }
  .screen .btn { font-size: 11px; padding: 6px 10px; }
  .screen .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .screen .card { min-width: unset; }
  .screen .card .v { font-size: 18px; }
  .screen .delta { font-size: 10px; gap: 4px; }
  .screen .main { flex-direction: column; flex: none; gap: 8px; }
  .screen .col.left, .screen .col.center, .screen .col.right { width: 100%; min-width: unset; }
  .screen .map-wrap { flex: none; height: 300px; }
  .screen .mp-map { min-height: 240px; height: 240px; }
  .screen .brief { max-width: 90%; left: 10px; top: 10px; font-size: 11px; padding: 6px 8px; }
  .screen .timeline { flex: none; }
  .screen .block { flex: none; }
  .screen .list { height: 220px; }
  .screen .bars { overflow-x: auto; flex-wrap: nowrap; padding-bottom: 4px; scrollbar-width: thin; scrollbar-color: rgba(63,169,233,.72) rgba(6,28,44,.58); }
  .screen .bar { min-width: 48px; flex: 0 0 auto; }
}

/* ===== 超小屏（≤480px） ===== */
@media (max-width: 480px) {
  .screen { padding: 6px; }
  .screen .cards { grid-template-columns: 1fr 1fr; gap: 5px; }
  .screen .card .v { font-size: 16px; }
  .screen .title { font-size: 16px; }
  .screen .list { height: 180px; }
  .screen .map-wrap { height: 260px; }
  .screen .mp-map { height: 200px; min-height: 200px; }
}
</style>
