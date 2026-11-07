<template>
  <view class="service-map">
    <view v-if="!readonly" class="map-actions">
      <button :class="['map-button', { active: mode === 'circle' }]" :disabled="disabled" @click="setMode('circle')">圆形范围</button>
      <button :class="['map-button', { active: mode === 'polygon' }]" :disabled="disabled" @click="setMode('polygon')">多边形圈选</button>
    </view>
    <view v-if="!readonly" class="map-search">
      <!-- #ifdef H5 -->
      <input v-model="query" class="map-input" maxlength="100" placeholder="搜索小区、街道定位地图" @confirm="search" />
      <!-- #endif -->
      <!-- #ifndef H5 -->
      <input v-model="query" class="map-input" maxlength="100" placeholder="搜索当前地图附近的小区街道" @confirm="search" />
      <!-- #endif -->
      <button class="map-button" :disabled="disabled || searching" @click="search">{{ searching ? '搜索中' : '搜索' }}</button>
    </view>
    <view v-if="places.length" class="place-results">
      <button v-for="(place, index) in places" :key="index" class="place-result" @click="selectPlace(place)">{{ place.name }}</button>
    </view>
    <view class="map-stage" @touchstart="markViewportInteraction" @mousedown="markViewportInteraction" @wheel="markViewportInteraction" @keydown="markViewportInteraction">
      <!-- #ifdef H5 -->
      <view :id="mapId" class="map-canvas"></view>
      <!-- #endif -->
      <!-- #ifndef H5 -->
      <map v-if="nativeMounted" :id="mapId" class="map-canvas" :latitude="nativeCenter.latitude" :longitude="nativeCenter.longitude" :scale="nativeScale" :polygons="nativePolygons" :circles="nativeCircles" :polyline="nativeLines" :markers="nativeMarkers" :include-points="nativeIncludePoints" :show-location="false" @tap="nativeTap" @updated="nativeReady" @error="nativeError">
        <cover-view v-if="!readonly && !loading && !mapError" class="map-crosshair"><cover-view class="crosshair-horizontal"></cover-view><cover-view class="crosshair-vertical"></cover-view></cover-view>
      </map>
      <!-- #endif -->
      <view v-if="loading || mapError" class="map-status">
        <text>{{ mapError || '正在加载地图…' }}</text>
        <button v-if="mapError" class="map-button" @click="initialize">重新加载</button>
      </view>
    </view>
    <view class="map-actions map-bottom">
      <button class="map-button" @click="fitMap">查看全部范围</button>
      <text v-if="readonly && !displayAreas.length" class="map-hint">暂无服务范围</text>
    </view>
    <!-- #ifndef H5 -->
    <view v-if="!readonly" class="map-actions"><button class="map-button active" :disabled="disabled || loading || !!mapError || nativeCenterBusy" @click="pickNativeCenter">{{ nativeCenterBusy ? '读取地图中心…' : mode === 'circle' ? '使用地图中心设置圆心' : '使用地图中心添加顶点' }}</button></view>
    <!-- #endif -->
    <template v-if="!readonly">
      <!-- #ifdef H5 -->
      <text class="map-hint">{{ mode === 'circle' ? '点击地图设置圆心，再调整半径。无需开启定位权限。' : '按顺序点击地图添加顶点（3–30 个），完成后保存范围。边界不能相交。' }}</text>
      <!-- #endif -->
      <!-- #ifndef H5 -->
      <text class="map-hint">{{ mode === 'circle' ? '移动地图，让十字对准圆心，再点击上方按钮设置。无需开启定位权限。' : '移动地图，让十字依次对准顶点并点击上方按钮添加（3–30 个），再点击完成。边界不能相交。' }}</text>
      <!-- #endif -->
      <view v-if="mode === 'circle'" class="radius-row">
        <text>半径（米）</text><input class="map-input radius-input" type="number" :value="radius" :disabled="disabled" @input="radiusInput" />
      </view>
      <slider v-if="mode === 'circle'" :value="sliderRadius" :min="100" :max="50000" :step="100" :disabled="disabled" activeColor="#168362" @changing="radiusSlide" @change="radiusSlide" />
      <view v-else class="map-actions">
        <text class="map-hint">{{ vertices.length }} / 30 个顶点{{ completed ? ' · 已完成' : '' }}</text>
        <button class="map-button" :disabled="disabled || !vertices.length" @click="undo">撤销</button>
        <button class="map-button active" :disabled="disabled || vertices.length < 3" @click="finishPolygon">完成</button>
      </view>
      <view class="map-actions"><button class="map-button" :disabled="disabled" @click="clear">清空范围</button><text v-if="validGeometry" class="map-valid">范围已就绪</text></view>
      <text v-if="validationError" class="map-error" role="alert">{{ validationError }}</text>
    </template>
    <text v-if="locationHint" class="map-hint">{{ locationHint }}</text>
    <text v-if="searchError" class="map-error" role="alert">{{ searchError }}</text>
    <view v-if="displayAreas.length || addressPoint" class="map-legend">
      <view v-for="(area, index) in displayAreas" :key="area.id || index" class="legend-item"><view class="legend-swatch" :style="{ backgroundColor: area.color }"></view><text>{{ area.name }}</text></view>
      <view v-if="addressPoint" class="legend-item"><view class="legend-pin"></view><text>预约地址</text></view>
    </view>
  </view>
</template>

<script setup>
import { getUserLocationOnce } from '@/utils/location'
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
// #ifndef H5
import { searchPlaces } from '@/api/map'
// #endif
import { distanceMeters, gcj02ToWgs84, geometryBounds, geometryError, normalizeGeometry, normalizePoint, wgs84ToGcj02 } from '../utils/recycling-geometry.mjs'
// #ifdef H5
import { loadRecyclingLeaflet } from '../utils/recycling-map-loader.mjs'
// #endif

const props = defineProps({ geometry: { type: Object, default: undefined }, modelValue: { type: Object, default: null }, areas: { type: Array, default: () => [] }, point: { type: Object, default: null }, readonly: Boolean, disabled: Boolean, autoLocate: Boolean })
const emit = defineEmits(['update:geometry', 'update:modelValue', 'change'])
const source = computed(() => props.geometry === undefined ? props.modelValue : props.geometry)
const mode = ref('circle'), radius = ref(1000), center = ref(null), vertices = ref([]), completed = ref(false)
const locationHint = ref('')
const loading = ref(true), mapError = ref(''), query = ref(''), searching = ref(false), searchError = ref(''), places = ref([])
const mapId = `recycling-service-map-${Math.random().toString(36).slice(2)}`
const nativeMounted = ref(true), nativeCenter = ref({ latitude: 35.86, longitude: 104.19 }), nativeScale = ref(5)
const nativeCenterBusy = ref(false), componentProxy = getCurrentInstance()?.proxy
let map, layers, L, tileLayer, timeout, disposed = false, generation = 0, lastEmitted = '', searchGeneration = 0
let viewportRevision = 0, initialLocationAttempted = false
function markViewportInteraction() { viewportRevision++; locationHint.value = '' }
const colors = ['#168362', '#3178c6', '#c87524', '#9656bc', '#d35375']
const addressPoint = computed(() => normalizePoint(props.point))
const draft = computed(() => mode.value === 'circle' ? { type: 'circle', coordinateSystem: 'wgs84', center: center.value, radiusMeters: radius.value } : { type: 'polygon', coordinateSystem: 'wgs84', points: vertices.value })
const validGeometry = computed(() => mode.value === 'polygon' && !completed.value ? null : normalizeGeometry(draft.value))
const validationError = computed(() => {
  if (mode.value === 'circle' && !center.value) return ''
  if (mode.value === 'polygon' && !vertices.value.length) return ''
  return geometryError(draft.value)
})
const sliderRadius = computed(() => Math.max(100, Math.min(50000, Number(radius.value) || 100)))
const displayAreas = computed(() => {
  const values = props.areas.map((area, index) => ({ ...area, geometry: normalizeGeometry(area.geometry), color: colors[index % colors.length], name: area.name || `服务范围 ${index + 1}` })).filter(area => area.geometry)
  if (props.readonly) { const geometry = normalizeGeometry(source.value); if (geometry) values.push({ id: 'current', name: '服务范围', geometry, color: colors[0] }) }
  else if (validGeometry.value) values.push({ id: 'editing', name: '当前范围', geometry: validGeometry.value, color: colors[0] })
  return values
})
const nativePolygons = computed(() => displayAreas.value.filter(area => area.geometry.type === 'polygon').map(area => ({ points: area.geometry.points.map(point => wgs84ToGcj02(point)), strokeColor: area.color, fillColor: `${area.color}28`, strokeWidth: 2 })))
const nativeCircles = computed(() => displayAreas.value.filter(area => area.geometry.type === 'circle').map(area => ({ ...wgs84ToGcj02(area.geometry.center), radius: area.geometry.radiusMeters, color: area.color, fillColor: `${area.color}28`, strokeWidth: 2 })))
const nativeLines = computed(() => !props.readonly && mode.value === 'polygon' && !completed.value && vertices.value.length > 1 ? [{ points: vertices.value.map(point => wgs84ToGcj02(point)), color: '#168362', width: 3, dottedLine: true }] : [])
const nativeMarkers = computed(() => {
  const values = addressPoint.value ? [{ id: 1, ...wgs84ToGcj02(addressPoint.value), iconPath: '/static/normal-marker.png', width: 28, height: 34, title: '预约地址', callout: { content: '预约地址', display: 'ALWAYS', padding: 6, borderRadius: 6 } }] : []
  if (!props.readonly) {
    const points = mode.value === 'circle' ? (center.value ? [center.value] : []) : vertices.value
    points.forEach((point, index) => values.push({ id: index + 10, ...wgs84ToGcj02(point), iconPath: '/static/normal-marker.png', width: 20, height: 24, title: mode.value === 'circle' ? '圆心' : `顶点 ${index + 1}` }))
  }
  return values
})
const viewportPoints = computed(() => {
  const points = []
  displayAreas.value.forEach(area => { const bounds = geometryBounds(area.geometry); points.push({ latitude: bounds.south, longitude: bounds.west }, { latitude: bounds.north, longitude: bounds.east }) })
  if (!props.readonly) points.push(...vertices.value, ...(center.value ? [center.value] : []))
  if (addressPoint.value) points.push(addressPoint.value)
  return points
})
const nativeIncludePoints = ref([])

watch(source, value => {
  if (JSON.stringify(value || null) === lastEmitted) return
  const geometry = normalizeGeometry(value)
  if (geometry) markViewportInteraction()
  center.value = geometry?.type === 'circle' ? geometry.center : null
  vertices.value = geometry?.type === 'polygon' ? geometry.points : []
  mode.value = geometry?.type || 'circle'; radius.value = geometry?.radiusMeters || 1000; completed.value = geometry?.type === 'polygon'
  nextTick(() => { renderLayers(); fitMap() })
}, { immediate: true, deep: true })
watch([displayAreas, addressPoint], () => nextTick(() => { renderLayers(); if (props.readonly) fitMap() }), { deep: true })
function publish() {
  const geometry = validGeometry.value
  lastEmitted = JSON.stringify(geometry)
  emit('update:geometry', geometry); emit('update:modelValue', geometry); emit('change', geometry)
  renderLayers()
}
function setMode(value) { if (props.disabled || value === mode.value) return; markViewportInteraction(); mode.value = value; center.value = null; vertices.value = []; completed.value = false; publish() }
function pick(point) {
  if (props.readonly || props.disabled || !normalizePoint(point)) return
  markViewportInteraction()
  const firstCircle = mode.value === 'circle' && !center.value
  if (mode.value === 'circle') center.value = point
  else { if (vertices.value.some(vertex => distanceMeters(vertex, point) < 0.1)) { searchError.value = '此位置已添加，请移动地图后选择下一个顶点'; return }; if (vertices.value.length >= 30) { searchError.value = '最多添加 30 个顶点，请完成圈选或撤销后重试'; return }; vertices.value = [...vertices.value, point]; completed.value = false }
  searchError.value = ''; publish(); if (firstCircle) nextTick(fitMap)
}
function radiusInput(event) { radius.value = event.detail.value === '' ? null : Number(event.detail.value); publish() }
function radiusSlide(event) { radius.value = Number(event.detail.value); publish() }
function undo() { vertices.value = vertices.value.slice(0, -1); completed.value = false; publish() }
function clear() { markViewportInteraction(); center.value = null; vertices.value = []; completed.value = false; publish() }
function finishPolygon() { completed.value = !geometryError(draft.value); publish(); if (completed.value) nextTick(fitMap) }
function nativeTap(event) { const detail = event.detail || {}; pick(gcj02ToWgs84(detail.latitude, detail.longitude)) }
function nativeReady() { loading.value = false; mapError.value = ''; clearTimeout(timeout) }
function nativeError() { loading.value = false; mapError.value = '地图暂不可用，请检查网络后重试'; clearTimeout(timeout) }
// #ifndef H5
function getNativeCenter() {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error, point) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(point) }
    const timer = setTimeout(() => finish(new Error('读取地图中心超时')), 1800)
    try {
      const context = uni.createMapContext(mapId, componentProxy)
      if (typeof context?.getCenterLocation !== 'function') { finish(new Error('当前环境不支持读取地图中心')); return }
      context.getCenterLocation({
        success: result => { const point = normalizePoint(result); finish(point ? null : new Error('未能读取地图中心'), point) },
        fail: error => finish(error || new Error('未能读取地图中心'))
      })
    } catch (error) { finish(error) }
  })
}
async function verifyNativeReady(token) {
  // App-vue does not consistently emit `updated`; reading map center needs no GPS.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (disposed || token !== generation || !loading.value) return
    try { await getNativeCenter(); if (!disposed && token === generation) nativeReady(); return }
    catch (_) {
      if (disposed || token !== generation || !loading.value) return
      if (attempt === 2) { nativeError(); return }
      await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)))
    }
  }
}
async function pickNativeCenter() {
  if (props.readonly || props.disabled || loading.value || mapError.value || nativeCenterBusy.value) return
  const token = generation, selectedMode = mode.value
  nativeCenterBusy.value = true; searchError.value = ''
  try {
    const point = await getNativeCenter()
    if (disposed || token !== generation || selectedMode !== mode.value) return
    pick(gcj02ToWgs84(point))
  } catch (_) { if (!disposed && token === generation) searchError.value = '未能读取地图中心，请稍后重试或重新加载地图' }
  finally { if (!disposed && token === generation) nativeCenterBusy.value = false }
}
// #endif
function renderLayers() {
  // #ifdef H5
  if (!map || !L || !layers) return
  layers.clearLayers()
  displayAreas.value.forEach(area => {
    const style = { color: area.color, fillOpacity: 0.14, weight: 2, interactive: false }
    const shape = area.geometry.type === 'circle' ? L.circle([area.geometry.center.latitude, area.geometry.center.longitude], { ...style, radius: area.geometry.radiusMeters }) : L.polygon(area.geometry.points.map(point => [point.latitude, point.longitude]), style)
    shape.addTo(layers)
  })
  if (!props.readonly) {
    if (mode.value === 'polygon' && !completed.value && vertices.value.length > 1) L.polyline(vertices.value.map(point => [point.latitude, point.longitude]), { color: colors[0], dashArray: '5 5', interactive: false }).addTo(layers)
    const points = mode.value === 'circle' ? (center.value ? [center.value] : []) : vertices.value
    points.forEach(point => L.circleMarker([point.latitude, point.longitude], { radius: 5, color: colors[0], fillOpacity: 1, interactive: false }).addTo(layers))
  }
  if (addressPoint.value) L.marker([addressPoint.value.latitude, addressPoint.value.longitude], { keyboard: true, title: '预约地址' }).addTo(layers).bindTooltip('预约地址')
  // #endif
}
function fitMap() {
  const points = viewportPoints.value
  if (!points.length) return
  const first = points[0]
  nativeCenter.value = wgs84ToGcj02(first); nativeScale.value = 14
  nativeIncludePoints.value = points.map(point => wgs84ToGcj02(point))
  // #ifdef H5
  if (map) { map.invalidateSize(); if (points.length === 1) map.setView([first.latitude, first.longitude], 15); else map.fitBounds(points.map(point => [point.latitude, point.longitude]), { padding: [24, 24], maxZoom: 16 }) }
  // #endif
}
function focusMapPoint(point, scale = 15) {
  nativeCenter.value = wgs84ToGcj02(point); nativeScale.value = scale
  // App's map watcher fits even an empty includePoints array, overriding center.
  // Supply real bounds around the destination instead of clearing the array.
  const bounds = geometryBounds({ type: 'circle', coordinateSystem: 'wgs84', center: point, radiusMeters: scale === 16 ? 400 : 800 })
  nativeIncludePoints.value = [
    wgs84ToGcj02({ latitude: bounds.south, longitude: bounds.west }),
    wgs84ToGcj02({ latitude: bounds.north, longitude: bounds.east })
  ]
  // #ifdef H5
  if (map) map.setView([point.latitude, point.longitude], scale)
  // #endif
}
async function locateInitialViewport(token) {
  if (!props.autoLocate || props.readonly || props.disabled || initialLocationAttempted || viewportRevision || viewportPoints.value.length) return
  initialLocationAttempted = true
  const revision = viewportRevision
  const isCurrent = () => !disposed && token === generation && revision === viewportRevision && !props.disabled && !viewportPoints.value.length
  locationHint.value = '正在定位附近地图…'
  try {
    let point
    // #ifdef H5
    point = normalizePoint(await getUserLocationOnce('wgs84', { interactive: true, isCurrent }))
    // #endif
    // #ifndef H5
    point = gcj02ToWgs84(await getUserLocationOnce('gcj02', { interactive: true, isCurrent }))
    // #endif
    if (!isCurrent()) return
    if (!point) throw new Error('当前坐标无法用于地图')
    focusMapPoint(point)
    locationHint.value = ''
  } catch (_) {
    if (isCurrent()) locationHint.value = '未能获取当前位置，可搜索地点或移动地图圈选'
  }
}
async function initialize() {
  const token = ++generation
  clearTimeout(timeout); loading.value = true; mapError.value = ''; locationHint.value = ''
  // #ifdef H5
  if (map) map.remove()
  map = null; layers = null; tileLayer = null
  try {
    await nextTick(); L = await loadRecyclingLeaflet()
    if (disposed || token !== generation) return
    map = L.map(mapId, { center: [35.86, 104.19], zoom: 5, doubleClickZoom: false })
    layers = L.layerGroup().addTo(map)
    tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' })
    let tileLoaded = false
    tileLayer.on('tileload', () => { if (token !== generation) return; tileLoaded = true; loading.value = false; mapError.value = ''; clearTimeout(timeout) })
    tileLayer.on('tileerror', () => { if (token === generation && !tileLoaded) { loading.value = false; mapError.value = '地图底图加载失败，请检查网络后重试' } })
    timeout = setTimeout(() => { if (token === generation && !tileLoaded) { loading.value = false; mapError.value = '地图加载超时，请重试' } }, 12000)
    tileLayer.addTo(map)
    map.on('click', event => pick({ latitude: event.latlng.lat, longitude: event.latlng.lng }))
    renderLayers(); fitMap(); void locateInitialViewport(token)
  } catch (error) { if (!disposed && token === generation) { loading.value = false; mapError.value = error.message || '地图加载失败，请重试' } }
  // #endif
  // #ifndef H5
  nativeCenterBusy.value = false; nativeMounted.value = false; await nextTick(); if (disposed || token !== generation) return; nativeMounted.value = true
  await nextTick(); if (disposed || token !== generation) return; fitMap(); verifyNativeReady(token); void locateInitialViewport(token)
  // #endif
}
async function search() {
  if (searching.value || props.disabled || !query.value.trim()) return
  markViewportInteraction()
  const token = ++searchGeneration
  searching.value = true; searchError.value = ''; places.value = []
  try {
    // Search recenters the map only. It never replaces the service geometry.
    // #ifdef H5
    const results = await new Promise((resolve, reject) => uni.request({
      url: `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query.value.trim())}&limit=5&addressdetails=1&accept-language=zh`,
      method: 'GET', timeout: 10000,
      success: response => response.statusCode === 200 && Array.isArray(response.data) ? resolve(response.data) : reject(new Error('地点搜索暂不可用')),
      fail: reject
    }))
    if (disposed || token !== searchGeneration) return
    places.value = results.map(place => ({ name: place.display_name || place.name || '搜索结果', point: normalizePoint({ latitude: Number(place.lat), longitude: Number(place.lon) }) })).filter(place => place.point).slice(0, 5)
    // #endif
    // #ifndef H5
    const current = await getNativeCenter()
    if (disposed || token !== searchGeneration) return
    const response = await searchPlaces(query.value.trim(), current.latitude, current.longitude, 50000)
    if (disposed || token !== searchGeneration) return
    places.value = (Array.isArray(response?.data) ? response.data : []).map(place => ({ name: place.title || place.name || place.address, point: gcj02ToWgs84(Number(place.location?.lat ?? place.latitude), Number(place.location?.lng ?? place.longitude)) })).filter(place => place.point).slice(0, 5)
    // #endif
    if (!places.value.length) searchError.value = '未找到地点，可换个关键词或直接移动地图'
  } catch (_) { if (!disposed && token === searchGeneration) searchError.value = '地点搜索失败，可直接移动地图后圈选' }
  finally { if (token === searchGeneration) searching.value = false }
}
function selectPlace(place) {
  markViewportInteraction()
  focusMapPoint(place.point, 16)
  places.value = []
}
onMounted(initialize)
onBeforeUnmount(() => { disposed = true; generation++; searchGeneration++; clearTimeout(timeout); if (map) map.remove(); map = null })
</script>

<style scoped>
.service-map { width: 100%; min-width: 0; color: var(--shop-text, var(--text-primary, #263932)); }
.map-actions, .map-search, .radius-row, .legend-item { display: flex; align-items: center; gap: 12rpx; }
.map-actions { flex-wrap: wrap; margin-bottom: 12rpx; }
.map-search { margin-bottom: 14rpx; }
.map-button { box-sizing: border-box; width: auto; max-width: 100%; min-width: 0; height: auto; white-space: normal; word-break: break-all; flex-shrink: 0; margin: 0; padding: 12rpx 18rpx; border-radius: 12rpx; background: var(--shop-soft, var(--bg-secondary, #eff5f1)); color: var(--shop-green, #168362); font-size: 24rpx; line-height: 1.5; }
.map-button::after, .place-result::after { border: 0; }
.map-button.active { color: #fff; background: #168362; }
.map-button[disabled] { opacity: .45; }
.service-map .map-input { box-sizing: border-box; min-width: 0; width: 0; max-width: 100%; flex: 1; height: 72rpx; min-height: 72rpx; line-height: normal; padding: 0 16rpx; border: 1rpx solid var(--shop-line, var(--border-color, #dce7df)); border-radius: 12rpx; font-size: 25rpx; color: inherit; }
.map-stage { position: relative; height: 300px; min-height: 240px; isolation: isolate; border: 1rpx solid var(--shop-line, var(--border-color, #dce7df)); border-radius: 14rpx; overflow: hidden; }
.map-canvas { display: block; width: 100%; height: 300px; min-height: 300px; flex-shrink: 0; background: var(--shop-soft, var(--bg-secondary, #eff5f1)); }
.map-crosshair { position: absolute; left: 50%; top: 50%; width: 28px; height: 28px; margin-left: -14px; margin-top: -14px; pointer-events: none; }
.crosshair-horizontal, .crosshair-vertical { position: absolute; background: #168362; border: 1px solid #fff; border-radius: 2px; }
.crosshair-horizontal { left: 0; top: 12px; width: 26px; height: 2px; }
.crosshair-vertical { left: 12px; top: 0; width: 2px; height: 26px; }
.map-status { position: absolute; inset: 0; z-index: 1100; display: flex; gap: 18rpx; flex-direction: column; align-items: center; justify-content: center; padding: 24rpx; text-align: center; background: var(--shop-card, var(--bg-primary, #fff)); color: inherit; font-size: 25rpx; }
.map-bottom { margin-top: 12rpx; }
.map-hint, .map-error { display: block; font-size: 23rpx; line-height: 1.6; color: var(--shop-muted, var(--text-secondary, #77827b)); }
.map-error { margin-top: 10rpx; color: #d85c43; }
.map-valid { font-size: 23rpx; color: #168362; }
.radius-row { flex-wrap: wrap; margin-top: 16rpx; font-size: 25rpx; }
.service-map .radius-input { width: 200rpx; flex: 0 1 200rpx; }
.map-legend { display: flex; flex-wrap: wrap; gap: 12rpx 24rpx; margin-top: 14rpx; }
.legend-item { max-width: 100%; font-size: 23rpx; overflow-wrap: anywhere; }
.legend-swatch { width: 24rpx; height: 16rpx; border-radius: 4rpx; flex-shrink: 0; }
.legend-pin { width: 18rpx; height: 18rpx; border-radius: 50%; background: #2877c4; border: 3rpx solid #fff; box-shadow: 0 0 0 1rpx #2877c4; flex-shrink: 0; }
.place-results { margin-bottom: 12rpx; }
.place-result { box-sizing: border-box; width: 100%; min-width: 0; height: auto; white-space: normal; word-break: break-all; margin: 0; padding: 12rpx; border-bottom: 1rpx solid var(--shop-line, #dce7df); text-align: left; color: inherit; background: var(--shop-card, var(--bg-primary, #fff)); font-size: 24rpx; line-height: 1.5; }
:global(.recycle-dark) .service-map, :global(.dark-mode) .service-map { --shop-text:#e5eee8; --shop-soft:#263b32; --shop-card:#18271f; --shop-line:#40564a; --shop-muted:#a7bbae; }
</style>
