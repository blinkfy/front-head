import { mapConfig } from '../../api/map-config.js'

const QQ_MAP_KEYS = [mapConfig.qqMapKey, mapConfig.qqMapKeyBackup].filter(Boolean)
const DEFAULT_CENTER = { latitude: 36.0671, longitude: 120.3826 }
const ROUTE_STRATEGY_KEY = 'collection_route_strategy'
const KPI_HISTORY_KEY = 'collection_dashboard_kpi_history_v2'
const baseUrl = window.__APP_BASE_URL__ || ''

const refs = {
  clockText: document.getElementById('clockText'),
  statusText: document.getElementById('statusText'),
  strategySwitch: document.getElementById('strategySwitch'),
  metricTotal: document.getElementById('metricTotal'),
  metricUrgent: document.getElementById('metricUrgent'),
  metricAverage: document.getElementById('metricAverage'),
  metricDistance: document.getElementById('metricDistance'),
  metricDuration: document.getElementById('metricDuration'),
  metricTotalDelta: document.getElementById('metricTotalDelta'),
  metricUrgentDelta: document.getElementById('metricUrgentDelta'),
  metricAverageDelta: document.getElementById('metricAverageDelta'),
  metricDistanceDelta: document.getElementById('metricDistanceDelta'),
  metricDurationDelta: document.getElementById('metricDurationDelta'),
  routeBrief: document.getElementById('routeBrief'),
  riskList: document.getElementById('riskList'),
  forecastBars: document.getElementById('forecastBars'),
  alertList: document.getElementById('alertList'),
  dispatchList: document.getElementById('dispatchList'),
  routeTimeline: document.getElementById('routeTimeline')
}

const state = {
  bins: [],
  plan: null,
  startPoint: null,
  map: null,
  mapReady: false,
  loading: false,
  timer: null,
  infoWindow: null,
  binMarkers: null,
  routePolyline: null,
  sequenceMarkers: null,
  startMarker: null,
  focusPolyline: null,
  iconCache: new Map(),
  selectedBinId: null,
  selectedStopOrder: null,
  routeStrategy: normalizeStrategy(localStorage.getItem(ROUTE_STRATEGY_KEY))
}

function n(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, n(value, min)))
}

function esc(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeStrategy(value) {
  return String(value || '').trim().toLowerCase() === 'shortest_distance'
    ? 'shortest_distance'
    : 'shortest_time'
}

function strategyLabel(value) {
  return normalizeStrategy(value) === 'shortest_distance' ? '最短距离' : '最短时间'
}

function fmtKm(value) {
  return `${n(value, 0).toFixed(2)} km`
}

function fmtMin(value) {
  return `${n(value, 0).toFixed(1)} min`
}

function fmtTime(value, withSeconds) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return withSeconds ? '--:--:--' : '--:--'
  return date.toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: withSeconds ? '2-digit' : undefined
  })
}

function sev(fill) {
  if (fill >= 90) return 'red'
  if (fill >= 80) return 'orange'
  if (fill >= 65) return 'amber'
  return 'green'
}

function sevLabel(fill) {
  if (fill >= 90) return '紧急'
  if (fill >= 80) return '高负载'
  if (fill >= 65) return '临界'
  return '正常'
}

function applyTheme() {
  const theme = localStorage.getItem('app_theme') === 'light' ? 'light' : 'dark'
  document.body.classList.toggle('light-theme', theme === 'light')
}

function setStatus(text, cls) {
  refs.statusText.className = 'status' + (cls ? ` ${cls}` : '')
  refs.statusText.textContent = text || ''
}

function applyStrategyUI() {
  refs.strategySwitch.querySelectorAll('button[data-strategy]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.strategy === state.routeStrategy)
  })
}

function authHeaders() {
  const token = localStorage.getItem('token') || ''
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = token
  return headers
}

async function api(path, options = {}) {
  const fullPath = path.startsWith('/') ? `${baseUrl}${path}` : path
  const res = await fetch(fullPath, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) }
  })
  const json = await res.json()
  if (!json || json.code !== 0) throw new Error((json && json.msg) || `HTTP ${res.status}`)
  return json.data
}

function safeNavigate(path) {
  const target = String(path || '/')
  if (!target) return
  try {
    window.location.assign(target)
  } catch (_) {
    window.location.href = target
  }
}

function getHistory() {
  try {
    const raw = localStorage.getItem(KPI_HISTORY_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch (_) {
    return []
  }
}

function pushHistory(snapshot) {
  const next = getHistory().slice(-100)
  next.push({ ts: Date.now(), ...snapshot })
  localStorage.setItem(KPI_HISTORY_KEY, JSON.stringify(next))
  return next
}

function deltaText(current, previous, unit, lowerBetter) {
  if (!previous) return '<span class="tag flat">首次加载</span>'
  const delta = n(current, 0) - n(previous, 0)
  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→'
  const cls = delta === 0 ? 'flat' : (lowerBetter ? (delta < 0 ? 'up' : 'down') : (delta > 0 ? 'up' : 'down'))
  return `<span class="tag ${cls}">${arrow}${Math.abs(delta).toFixed(1)}${unit || ''}</span>`
}

function markerSvg(fill, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="14" fill="${fill}" stroke="#fff" stroke-width="3"></circle><text x="22" y="26" text-anchor="middle" font-size="13" font-weight="700" fill="#fff" font-family="Arial">${esc(label)}</text></svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function icon(key, fill, label) {
  if (state.iconCache.has(key)) return state.iconCache.get(key)
  const src = markerSvg(fill, label)
  state.iconCache.set(key, src)
  return src
}

async function loadTencentMapSdk() {
  if (window.TMap) return window.TMap
  for (const key of QQ_MAP_KEYS) {
    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${key}`
        script.async = true
        script.onload = resolve
        script.onerror = () => reject(new Error(`failed to load key ${key}`))
        document.head.appendChild(script)
      })
      if (window.TMap) return window.TMap
    } catch (error) {
      console.warn('[collection-dashboard] map sdk load failed:', error && error.message ? error.message : error)
    }
  }
  throw new Error('腾讯地图 SDK 加载失败')
}

function clearMap() {
  if (state.binMarkers) { state.binMarkers.setMap(null); state.binMarkers = null }
  if (state.routePolyline) { state.routePolyline.setMap(null); state.routePolyline = null }
  if (state.sequenceMarkers) { state.sequenceMarkers.setMap(null); state.sequenceMarkers = null }
  if (state.startMarker) { state.startMarker.setMap(null); state.startMarker = null }
  if (state.focusPolyline) { state.focusPolyline.setMap(null); state.focusPolyline = null }
}

function showInfo(lat, lng, content) {
  if (!window.TMap || !state.map) return
  const point = new window.TMap.LatLng(lat, lng)
  if (!state.infoWindow) {
    state.infoWindow = new window.TMap.InfoWindow({ map: state.map, position: point, content })
    return
  }
  state.infoWindow.setMap(state.map)
  state.infoWindow.setPosition(point)
  state.infoWindow.setContent(content)
}

function renderMetrics() {
  const route = state.plan && state.plan.route
  const current = {
    total: state.bins.length,
    urgent: state.bins.filter((bin) => bin.isUrgent).length,
    average: state.bins.length ? state.bins.reduce((sum, bin) => sum + n(bin.currentFill, 0), 0) / state.bins.length : 0,
    distance: route ? n(route.totalDistanceKm, 0) : 0,
    duration: route ? n(route.totalMinutes, 0) : 0
  }
  const history = pushHistory(current)
  const previous = history.length > 1 ? history[history.length - 2] : null

  refs.metricTotal.textContent = String(current.total)
  refs.metricUrgent.textContent = String(current.urgent)
  refs.metricAverage.textContent = `${current.average.toFixed(1)}%`
  refs.metricDistance.textContent = fmtKm(current.distance)
  refs.metricDuration.textContent = fmtMin(current.duration)
  refs.metricTotalDelta.innerHTML = deltaText(current.total, previous && previous.total, '', false)
  refs.metricUrgentDelta.innerHTML = deltaText(current.urgent, previous && previous.urgent, '', true)
  refs.metricAverageDelta.innerHTML = deltaText(current.average, previous && previous.average, '%', true)
  refs.metricDistanceDelta.innerHTML = deltaText(current.distance, previous && previous.distance, 'km', true)
  refs.metricDurationDelta.innerHTML = deltaText(current.duration, previous && previous.duration, 'min', true)
}

function renderBrief() {
  const route = state.plan && state.plan.route
  if (!route) {
    refs.routeBrief.innerHTML = '<strong>路线概览</strong><div>尚未生成路线</div>'
    return
  }
  const start = state.plan.start || state.startPoint || DEFAULT_CENTER
  refs.routeBrief.innerHTML = [
    '<strong>路线概览</strong>',
    `<div>策略：${esc(strategyLabel(state.routeStrategy))} | 车辆：1 台</div>`,
    `<div>起点：${esc(start.name || '默认起点')} | 停靠：${route.stops.length} 个</div>`,
    `<div>总里程：${fmtKm(route.totalDistanceKm)} | 总耗时：${fmtMin(route.totalMinutes)}</div>`,
    `<div>开始：${fmtTime(route.startTime)} | 结束：${fmtTime(route.endTime)}</div>`
  ].join('')
}

function sortedBins() {
  return state.bins.slice().sort((a, b) => (
    n(b.currentFill, 0) - n(a.currentFill, 0) ||
    n(b.priorityScore, 0) - n(a.priorityScore, 0)
  ))
}

function renderRiskList() {
  const bins = sortedBins().slice(0, 8)
  refs.riskList.innerHTML = bins.length ? bins.map((bin, index) => {
    const fill = clamp(bin.currentFill, 0, 100)
    const active = state.selectedBinId && String(state.selectedBinId) === String(bin.id) ? ' active' : ''
    return `<div class="risk${active}" data-bin-id="${esc(bin.id)}"><div class="top"><div class="rank">${index + 1}</div><div class="name" title="${esc(bin.name)}">${esc(bin.name)}</div><div class="chip ${sev(fill)}">${sevLabel(fill)}</div></div><div class="subline"><span>满载率 ${fill.toFixed(1)}%</span><span>优先级 ${n(bin.priorityScore, 0).toFixed(3)}</span></div><div class="subline"><span>增长 ${n(bin.growthRatePctPerHour, 0).toFixed(2)}%/h</span><span>${esc(bin.hoursToFull == null ? '预计时间未知' : `预计 ${n(bin.hoursToFull, 0).toFixed(1)}h 满载`)}</span></div></div>`
  }).join('') : '<div class="empty">暂无桶位数据</div>'
}

function renderForecastBars() {
  const bins = state.bins.slice().sort((a, b) => n(b.predictedFillInHorizon, 0) - n(a.predictedFillInHorizon, 0)).slice(0, 6)
  refs.forecastBars.innerHTML = bins.length ? bins.map((bin) => {
    const value = clamp(bin.predictedFillInHorizon, 0, 100)
    return `<div class="bar"><div class="bar-shell"><div class="bar-fill ${value >= 85 ? 'alert' : ''}" style="height:${value.toFixed(1)}%;"></div></div><div class="bar-val">${value.toFixed(1)}%</div><div class="bar-name" title="${esc(bin.name)}">${esc(String(bin.name || '').slice(0, 4) || '点位')}</div></div>`
  }).join('') : '<div class="empty" style="grid-column:1/-1;">暂无预测数据</div>'
}

function renderAlertList() {
  const routeStops = state.plan && state.plan.route && Array.isArray(state.plan.route.stops) ? state.plan.route.stops : []
  const dispatched = new Set(routeStops.map((stop) => String(stop.id)))
  refs.alertList.innerHTML = sortedBins().filter((bin) => n(bin.currentFill, 0) >= 65).slice(0, 8).map((bin) => {
    const active = state.selectedBinId && String(state.selectedBinId) === String(bin.id) ? ' active' : ''
    const status = dispatched.has(String(bin.id)) ? 'dispatched' : 'pending'
    return `<div class="alert${active}" data-bin-id="${esc(bin.id)}"><div class="top"><span>${esc(bin.name)}</span><span class="state-chip ${status}">${status === 'dispatched' ? '已派单' : '未处理'}</span></div><div class="sub"><span>当前 ${n(bin.currentFill, 0).toFixed(1)}%</span><span>预测 ${n(bin.predictedFillInHorizon, 0).toFixed(1)}%</span></div><div class="sub"><span>${esc(bin.hoursToFull == null ? '预计时间未知' : `预计 ${n(bin.hoursToFull, 0).toFixed(1)}h 满载`)}</span><span>${sevLabel(n(bin.currentFill, 0))}</span></div></div>`
  }).join('') || '<div class="empty">当前无告警</div>'
}

function renderDispatchList() {
  const route = state.plan && state.plan.route
  const stops = route && Array.isArray(route.stops) ? route.stops : []
  refs.dispatchList.innerHTML = stops.length ? stops.map((stop) => {
    const active = state.selectedStopOrder === Number(stop.order) ? ' active' : ''
    const nav = stop.navUrl ? `<button type="button" class="nav-btn" data-nav-url="${esc(stop.navUrl)}">导航</button>` : ''
    return `<div class="dispatch${active}" data-stop-order="${stop.order}" data-bin-id="${esc(stop.id)}"><div class="top"><span>#${stop.order} ${esc(stop.name)}</span><span>${fmtTime(stop.eta)}</span></div><div class="sub"><span>${fmtKm(stop.travelKm)} / ${fmtMin(stop.travelMinutes)}</span><span>满载率 ${n(stop.currentFill, 0).toFixed(1)}%</span></div><div class="sub"><span>优先级 ${n(stop.priorityScore, 0).toFixed(3)}</span><span>${nav}</span></div></div>`
  }).join('') : '<div class="empty">暂无调度任务</div>'
}

function renderTimeline() {
  const route = state.plan && state.plan.route
  const stops = route && Array.isArray(route.stops) ? route.stops.slice(0, 12) : []
  refs.routeTimeline.innerHTML = stops.length ? stops.map((stop) => {
    const active = state.selectedStopOrder === Number(stop.order) ? ' active' : ''
    return `<div class="stop${active}" data-stop-order="${stop.order}" data-bin-id="${esc(stop.id)}"><div class="o">#${stop.order}</div><div class="n" title="${esc(stop.name)}">${esc(stop.name)}</div><div class="t">ETA ${fmtTime(stop.eta)}</div></div>`
  }).join('') : '<div class="empty" style="grid-column:1/-1;">暂无路线时间轴</div>'
}

function buildSegmentPath(stop) {
  const route = state.plan && state.plan.route
  if (!route || !Array.isArray(route.segments)) return null
  const segment = route.segments.find((item) => Number(item.order) === Number(stop.order))
  if (!segment || !Array.isArray(segment.polyline) || segment.polyline.length < 2) return null
  return segment.polyline.map((point) => new window.TMap.LatLng(point[0], point[1]))
}

function drawMap(force) {
  if (!state.map || !window.TMap) return
  const signature = JSON.stringify({
    strategy: state.routeStrategy,
    selectedBinId: state.selectedBinId,
    selectedStopOrder: state.selectedStopOrder,
    bins: state.bins.map((bin) => [bin.id, n(bin.currentFill, 0)]),
    stops: state.plan && state.plan.route && Array.isArray(state.plan.route.stops) ? state.plan.route.stops.map((stop) => [stop.order, stop.id]) : []
  })
  if (!force && signature === state.lastMapSignature) return
  state.lastMapSignature = signature

  clearMap()
  const bounds = new window.TMap.LatLngBounds()
  let hasBounds = false
  const styles = {
    green: new window.TMap.MarkerStyle({ width: 24, height: 24, anchor: { x: 12, y: 12 }, src: icon('g', '#16c57c', '') }),
    amber: new window.TMap.MarkerStyle({ width: 24, height: 24, anchor: { x: 12, y: 12 }, src: icon('a', '#f5b648', '') }),
    orange: new window.TMap.MarkerStyle({ width: 24, height: 24, anchor: { x: 12, y: 12 }, src: icon('o', '#ff8b3d', '') }),
    red: new window.TMap.MarkerStyle({ width: 24, height: 24, anchor: { x: 12, y: 12 }, src: icon('r', '#ff5d66', '') }),
    selected: new window.TMap.MarkerStyle({ width: 30, height: 30, anchor: { x: 15, y: 15 }, src: icon('selected', '#2c8fff', 'X') })
  }

  const geometries = state.bins.map((bin, index) => {
    const position = new window.TMap.LatLng(n(bin.latitude, 0), n(bin.longitude, 0))
    bounds.extend(position)
    hasBounds = true
    return {
      id: `bin-${bin.id}-${index}`,
      styleId: state.selectedBinId && String(state.selectedBinId) === String(bin.id) ? 'selected' : sev(n(bin.currentFill, 0)),
      position,
      properties: { index }
    }
  })
  if (geometries.length) {
    state.binMarkers = new window.TMap.MultiMarker({ id: 'dashboard-bins', map: state.map, styles, geometries })
    state.binMarkers.on('click', (event) => {
      const index = event && event.geometry && event.geometry.properties ? event.geometry.properties.index : null
      if (!Number.isFinite(index) || !state.bins[index]) return
      focusBin(state.bins[index].id, true)
    })
  }

  if (state.startPoint) {
    const startPos = new window.TMap.LatLng(state.startPoint.latitude, state.startPoint.longitude)
    state.startMarker = new window.TMap.MultiMarker({
      id: 'dashboard-start',
      map: state.map,
      styles: { s: new window.TMap.MarkerStyle({ width: 28, height: 28, anchor: { x: 14, y: 14 }, src: icon('start', '#2c8fff', 'S') }) },
      geometries: [{ id: 'start-1', styleId: 's', position: startPos }]
    })
    bounds.extend(startPos)
    hasBounds = true
  }

  const route = state.plan && state.plan.route
  if (route && Array.isArray(route.polyline) && route.polyline.length > 1) {
    const polyline = route.polyline.map((point) => new window.TMap.LatLng(point[0], point[1]))
    state.routePolyline = new window.TMap.MultiPolyline({
      id: 'dashboard-route',
      map: state.map,
      styles: { route: new window.TMap.PolylineStyle({ color: '#2dc6ff', width: 6, borderWidth: 2, borderColor: '#fff', lineCap: 'round' }) },
      geometries: [{ id: 'main', styleId: 'route', paths: polyline }]
    })
    polyline.forEach((point) => {
      bounds.extend(point)
      hasBounds = true
    })

    const stopStyles = {}
    const stopGeometries = route.stops.map((stop, index) => {
      const focused = state.selectedStopOrder === Number(stop.order)
      const styleId = focused ? `focus-${stop.order}` : `stop-${stop.order}`
      if (!stopStyles[styleId]) {
        stopStyles[styleId] = new window.TMap.MarkerStyle({
          width: focused ? 28 : 24,
          height: focused ? 28 : 24,
          anchor: focused ? { x: 14, y: 14 } : { x: 12, y: 12 },
          src: icon(styleId, focused ? '#ff9f42' : '#1f7eff', String(stop.order))
        })
      }
      return { id: `stop-${index}`, styleId, position: new window.TMap.LatLng(stop.latitude, stop.longitude), properties: { order: stop.order } }
    })
    state.sequenceMarkers = new window.TMap.MultiMarker({ id: 'dashboard-seq', map: state.map, styles: stopStyles, geometries: stopGeometries })
    state.sequenceMarkers.on('click', (event) => {
      const order = event && event.geometry && event.geometry.properties ? event.geometry.properties.order : null
      if (!Number.isFinite(order)) return
      focusStop(order, true)
    })

    if (state.selectedStopOrder !== null) {
      const stop = route.stops.find((item) => Number(item.order) === Number(state.selectedStopOrder))
      const focusPath = stop ? buildSegmentPath(stop) : null
      if (focusPath && focusPath.length > 1) {
        state.focusPolyline = new window.TMap.MultiPolyline({
          id: 'dashboard-focus',
          map: state.map,
          styles: { focus: new window.TMap.PolylineStyle({ color: '#ffb04a', width: 7, borderWidth: 2, borderColor: '#fff', lineCap: 'round' }) },
          geometries: [{ id: 'focus', styleId: 'focus', paths: focusPath }]
        })
      }
    }
  }

  if (hasBounds && state.map.fitBounds) state.map.fitBounds(bounds, { padding: 70 })
}

function renderAll() {
  renderMetrics()
  renderBrief()
  renderRiskList()
  renderForecastBars()
  renderAlertList()
  renderDispatchList()
  renderTimeline()
  if (state.mapReady) drawMap(false)
}

function focusBin(binId, forceMap) {
  const bin = state.bins.find((item) => String(item.id) === String(binId))
  if (!bin) return
  state.selectedBinId = String(bin.id)
  state.selectedStopOrder = null
  renderRiskList()
  renderAlertList()
  renderDispatchList()
  renderTimeline()
  if (state.mapReady) {
    state.map.setCenter(new window.TMap.LatLng(bin.latitude, bin.longitude))
    if (state.map.getZoom && state.map.getZoom() < 14 && state.map.setZoom) state.map.setZoom(14)
    showInfo(bin.latitude, bin.longitude, `<div style="min-width:180px;padding:2px 4px;"><div style="font-size:13px;font-weight:700;color:#17324a;">${esc(bin.name)}</div><div style="margin-top:4px;font-size:12px;color:#365066;">满载率 ${n(bin.currentFill, 0).toFixed(1)}% | 预测 ${n(bin.predictedFillInHorizon, 0).toFixed(1)}%</div><div style="margin-top:2px;font-size:12px;color:#60778b;">优先级 ${n(bin.priorityScore, 0).toFixed(3)}</div></div>`)
  }
  drawMap(!!forceMap)
}

function focusStop(order, forceMap) {
  const route = state.plan && state.plan.route
  if (!route || !Array.isArray(route.stops)) return
  const stop = route.stops.find((item) => Number(item.order) === Number(order))
  if (!stop) return
  state.selectedStopOrder = Number(stop.order)
  state.selectedBinId = String(stop.id)
  renderRiskList()
  renderAlertList()
  renderDispatchList()
  renderTimeline()
  if (state.mapReady) {
    state.map.setCenter(new window.TMap.LatLng(stop.latitude, stop.longitude))
    if (state.map.getZoom && state.map.getZoom() < 14 && state.map.setZoom) state.map.setZoom(14)
    showInfo(stop.latitude, stop.longitude, `<div style="min-width:185px;padding:2px 4px;"><div style="font-size:13px;font-weight:700;color:#17324a;">#${stop.order} ${esc(stop.name)}</div><div style="margin-top:4px;font-size:12px;color:#365066;">ETA ${fmtTime(stop.eta)} | ${fmtKm(stop.travelKm)}</div><div style="margin-top:2px;font-size:12px;color:#60778b;">满载率 ${n(stop.currentFill, 0).toFixed(1)}%</div></div>`)
  }
  drawMap(!!forceMap)
}

async function refresh(options = {}) {
  if (state.loading) return
  state.loading = true
  if (!options.silent) setStatus(`正在刷新清运数据（${strategyLabel(state.routeStrategy)}）...`, 'warn')
  try {
    const query = new URLSearchParams({ routeStrategy: state.routeStrategy })
    const data = await api(`/api/planning/dashboard-snapshot?${query.toString()}`)
    state.bins = Array.isArray(data && data.bins) ? data.bins : []
    state.plan = data && data.plan ? data.plan : null
    if (state.plan && state.plan.start) {
      state.startPoint = {
        name: state.plan.start.name || '默认起点',
        latitude: state.plan.start.latitude,
        longitude: state.plan.start.longitude
      }
    } else if (!state.startPoint && state.bins[0]) {
      state.startPoint = { name: '默认起点', latitude: state.bins[0].latitude, longitude: state.bins[0].longitude }
    }
    if (state.plan && state.plan.options && state.plan.options.routeStrategy) {
      state.routeStrategy = normalizeStrategy(state.plan.options.routeStrategy)
      localStorage.setItem(ROUTE_STRATEGY_KEY, state.routeStrategy)
      applyStrategyUI()
    }
    renderAll()
    const stops = state.plan && state.plan.route && Array.isArray(state.plan.route.stops) ? state.plan.route.stops.length : 0
    setStatus(`刷新成功：${state.bins.length} 个桶位，${stops} 个停靠点，策略 ${strategyLabel(state.routeStrategy)}`, 'ok')
  } catch (error) {
    console.error('[collection-dashboard] refresh failed:', error)
    setStatus(error && error.message ? error.message : String(error), 'err')
  } finally {
    state.loading = false
  }
}

async function initMap() {
  await loadTencentMapSdk()
  state.map = new window.TMap.Map('map', {
    center: new window.TMap.LatLng(DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude),
    zoom: 12,
    viewMode: '2D'
  })
  state.mapReady = true
  state.map.on('click', (event) => {
    const lat = event && event.latLng && typeof event.latLng.getLat === 'function' ? event.latLng.getLat() : null
    const lng = event && event.latLng && typeof event.latLng.getLng === 'function' ? event.latLng.getLng() : null
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    state.startPoint = { name: '地图选择起点', latitude: lat, longitude: lng }
    renderBrief()
    drawMap(true)
  })
}

function bind() {
  document.getElementById('refreshBtn')?.addEventListener('click', () => refresh())
  document.getElementById('backBtn')?.addEventListener('click', (event) => {
    event.preventDefault()
    safeNavigate('/')
  })
  document.getElementById('toCommunityBtn')?.addEventListener('click', (event) => {
    event.preventDefault()
    safeNavigate('/community-dashboard')
  })
  refs.strategySwitch.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-strategy]')
    if (!btn) return
    const next = normalizeStrategy(btn.dataset.strategy)
    if (next === state.routeStrategy) return
    state.routeStrategy = next
    localStorage.setItem(ROUTE_STRATEGY_KEY, next)
    applyStrategyUI()
    refresh()
  })
  refs.riskList.addEventListener('click', (event) => {
    const card = event.target.closest('.risk')
    if (card) focusBin(card.dataset.binId, true)
  })
  refs.alertList.addEventListener('click', (event) => {
    const card = event.target.closest('.alert')
    if (card) focusBin(card.dataset.binId, true)
  })
  refs.dispatchList.addEventListener('click', (event) => {
    const navBtn = event.target.closest('.nav-btn')
    if (navBtn && navBtn.dataset.navUrl) {
      window.open(navBtn.dataset.navUrl, '_blank')
      return
    }
    const card = event.target.closest('.dispatch')
    if (!card) return
    focusStop(Number(card.dataset.stopOrder), true)
  })
  refs.routeTimeline.addEventListener('click', (event) => {
    const card = event.target.closest('.stop')
    if (card) focusStop(Number(card.dataset.stopOrder), true)
  })
}

function tick() {
  refs.clockText.textContent = fmtTime(new Date(), true)
}

;(async function init() {
  applyTheme()
  window.addEventListener('storage', (event) => {
    if (!event || event.key === 'app_theme') applyTheme()
    if (!event || event.key === ROUTE_STRATEGY_KEY) {
      state.routeStrategy = normalizeStrategy(localStorage.getItem(ROUTE_STRATEGY_KEY))
      applyStrategyUI()
    }
  })
  tick()
  setInterval(tick, 1000)
  bind()
  applyStrategyUI()
  setStatus('正在加载腾讯地图...', 'warn')
  try {
    await initMap()
  } catch (error) {
    setStatus(error && error.message ? error.message : String(error), 'err')
    return
  }
  await refresh()
  state.timer = setInterval(() => refresh({ silent: true }), 60000)
})()
