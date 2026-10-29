<template>
  <view class="address-tools">
    <view class="address-actions">
      <button class="address-action" :disabled="disabled || busy" @click="choose"><ManifestIcon id="map_location" />地图选址</button>
    </view>
    <text class="address-hint">{{ locating ? '正在获取当前位置…' : '请核对地址并补充楼栋、单元及门牌号' }}</text>
    <text v-if="error" class="address-error" role="alert">{{ error }}</text>
    <view v-if="opened" class="address-overlay" @click.self="close">
      <view class="address-modal">
        <view class="address-modal-heading"><text>选择收货位置</text><button class="address-action" @click="close">取消</button></view>
        <view class="address-search"><input v-model="query" class="address-search-input" placeholder="搜索小区、学校或街道" maxlength="100" @confirm="search" /><button class="address-action" :disabled="searching" @click="search">搜索</button></view>
        <!-- #ifdef H5 -->
        <view :id="mapId" class="address-map"></view>
        <!-- #endif -->
        <!-- #ifndef H5 -->
        <scroll-view class="address-places" scroll-y>
          <view v-for="(place, index) in places" :key="place.id || index" class="address-place" @click="selectPlace(place)"><text>{{ place.title || place.name }}</text><text class="address-hint">{{ place.address || place.addr }}</text></view>
        </scroll-view>
        <!-- #endif -->
        <text v-if="initializing" class="address-hint">正在定位附近位置…</text>
        <text v-else-if="searching" class="address-hint">正在加载位置…</text>
        <text v-if="error" class="address-error" role="alert">{{ error }}</text>
        <text class="address-selected">{{ selected || '搜索地址或在地图上点击选择位置' }}</text>
        <button class="address-confirm" :disabled="!selected || searching || disabled" @click="confirm">使用此地址</button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import ManifestIcon from '@/components/ManifestIcon.vue'
import { getUserLocationOnce } from '@/utils/location'
import { searchPlaces } from '@/api/map'
import { getCurrentAddress, resolveLocationAddress } from '@/utils/location-address'

const props = defineProps({ modelValue: { type: String, default: '' }, disabled: Boolean, autoLocate: Boolean })
const emit = defineEmits(['update:modelValue', 'busy-change', 'select'])
const locating = ref(false), searching = ref(false), opened = ref(false)
const initializing = ref(false)
const query = ref(''), selected = ref(''), error = ref(''), places = ref([])
const selectedParts = ref({})
const busy = computed(() => locating.value || opened.value)
const mapId = `shop-address-map-${Math.random().toString(36).slice(2)}`
let map, marker, coords, revision = 0, disposed = false
let leafletPromise
let autoLocateAttempted = false
watch(busy, value => emit('busy-change', value), { flush: 'sync' })
watch(() => props.disabled, value => { if (value) close() })
const active = token => !disposed && !props.disabled && token === revision
const joinAddress = place => {
  const address = String(place?.address || place?.addr || '').trim()
  const name = String(place?.name || place?.title || '').trim()
  return address && name && !address.includes(name) ? `${address} ${name}` : address || name
}
function update(value) {
  const selection = value && typeof value === 'object' ? value : { address: value }
  const address = String(selection.address || '').trim()
  if (!address || address.length > 500 || /^[-+]?\d+(?:\.\d+)?\s*,\s*[-+]?\d+(?:\.\d+)?$/.test(address)) throw new Error('未能获取详细地址，请手动填写')
  if (!disposed && !props.disabled) {
    emit('update:modelValue', address)
    emit('select', { address, parts: selection.parts || {} })
  }
}
function showError(reason) {
  const message = String(reason?.errMsg || reason?.message || '')
  if (/cancel/i.test(message)) return
  error.value = /auth|permission|deny|denied/i.test(message) ? '未获得定位权限，请在系统设置中允许定位，或手动输入地址' : '获取位置失败，请重试或手动输入地址'
}
function requestJson(url) {
  return new Promise((resolve, reject) => uni.request({ url, timeout: 10000, success: res => res.statusCode === 200 ? resolve(res.data) : reject(new Error('地址服务暂不可用')), fail: reject }))
}
function getCoords() {
  // #ifdef H5
  return getUserLocationOnce('wgs84')
  // #endif
  // #ifndef H5
  return getUserLocationOnce('gcj02')
  // #endif
}
const resolveAddress = resolveLocationAddress
async function locate(onlyIfEmpty = false) {
  if (props.disabled || busy.value) return
  const token = ++revision
  error.value = ''; locating.value = true
  try {
    const address = await getCurrentAddress()
    if (active(token) && (!onlyIfEmpty || !props.modelValue.trim())) update(address)
  } catch (reason) { if (active(token)) showError(reason) }
  finally { if (token === revision) locating.value = false }
}
watch(() => [props.autoLocate, props.disabled], () => {
  if (!props.autoLocate || props.disabled || busy.value || autoLocateAttempted || props.modelValue.trim()) return
  autoLocateAttempted = true
  locate(true)
}, { immediate: true, flush: 'post' })

async function choose() {
  if (props.disabled || busy.value) return
  error.value = ''
  // #ifdef H5
  opened.value = true; selected.value = ''; selectedParts.value = {}; query.value = ''
  const token = ++revision
  initializing.value = true
  const nearbyLocation = getCoords().catch(() => null)
  try {
    await nextTick()
    const L = await loadLeaflet()
    if (!active(token) || !opened.value) return
    map = L.map(mapId, { center: [35.86, 104.19], zoom: 5 })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map)
    map.on('click', event => pickPoint(event.latlng.lat, event.latlng.lng))
    const current = await nearbyLocation
    if (!active(token) || !opened.value) return
    initializing.value = false
    if (current) {
      map.setView([current.latitude, current.longitude], 16)
      await pickPoint(current.latitude, current.longitude)
    } else if (props.modelValue) {
      query.value = props.modelValue.slice(0, 100)
      await search()
    } else error.value = '未能获取当前位置，可搜索地址或在地图上选点'
  } catch (reason) { if (active(token)) { initializing.value = false; showError(reason) } }
  return
  // #endif
  // #ifndef H5
  const platform = uni.getSystemInfoSync().uniPlatform
  if (platform === 'app' || platform === 'app-plus') {
    opened.value = true; selected.value = ''; selectedParts.value = {}; places.value = []; query.value = ''; coords = null
    await search()
    const token = revision
    if (coords && active(token) && opened.value && !selected.value) {
      try {
        const current = await resolveAddress(coords.latitude, coords.longitude)
        if (active(token) && opened.value && !selected.value) { selected.value = current.address; selectedParts.value = current.parts }
      } catch (_) { /* 附近地点列表仍可选择，不覆盖其加载结果。 */ }
    }
    return
  }
  const token = ++revision
  locating.value = true
  try {
    if (typeof uni.chooseLocation !== 'function') throw new Error('当前环境不支持地图选址')
    const current = await getCoords().catch(() => null)
    if (!active(token)) return
    const result = await new Promise((resolve, reject) => uni.chooseLocation({ ...(current || {}), success: resolve, fail: reject }))
    if (active(token)) update({ address: joinAddress(result), parts: result.address_component || {} })
  } catch (reason) { if (active(token)) showError(reason) }
  finally { if (token === revision) locating.value = false }
  // #endif
}
// #ifdef H5
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L)
  if (leafletPromise) return leafletPromise
  if (!document.querySelector('link[href*="leaflet.css"]')) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(link)
  }
  leafletPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    const timer = setTimeout(() => { script.remove(); reject(new Error('地图加载超时')) }, 10000)
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => { clearTimeout(timer); window.L ? resolve(window.L) : reject(new Error('地图加载失败')) }
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('地图加载失败')) }
    document.head.appendChild(script)
  }).catch(reason => { leafletPromise = null; throw reason })
  return leafletPromise
}
function placeMarker(latitude, longitude) {
  if (marker) marker.remove()
  marker = window.L.marker([latitude, longitude], { draggable: true }).addTo(map)
  marker.on('dragend', () => { const point = marker.getLatLng(); pickPoint(point.lat, point.lng) })
}
async function pickPoint(latitude, longitude) {
  const token = ++revision
  initializing.value = false
  selected.value = ''; selectedParts.value = {}; error.value = ''; searching.value = true
  placeMarker(latitude, longitude)
  try {
    const result = await resolveAddress(latitude, longitude)
    if (active(token)) { selected.value = result.address; selectedParts.value = result.parts }
  }
  catch (reason) { if (active(token)) showError(reason) }
  finally { if (token === revision) searching.value = false }
}
// #endif
async function search() {
  if (props.disabled || !opened.value || searching.value) return
  const token = ++revision
  initializing.value = false
  searching.value = true; selected.value = ''; selectedParts.value = {}; error.value = ''
  try {
    // #ifdef H5
    if (!query.value.trim()) { error.value = '请输入要搜索的地址'; return }
    const results = await requestJson(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query.value.trim())}&limit=1&addressdetails=1&accept-language=zh`)
    if (!active(token)) return
    if (!results?.length) { error.value = '未找到该地址，请换个关键词'; return }
    const place = results[0]
    if (map) { map.setView([Number(place.lat), Number(place.lon)], 16); placeMarker(Number(place.lat), Number(place.lon)) }
    selected.value = place.display_name || ''
    selectedParts.value = place.address || {}
    // #endif
    // #ifndef H5
    if (!coords) coords = await getCoords()
    const response = await searchPlaces(query.value.trim() || '小区', coords.latitude, coords.longitude, 2000)
    if (!active(token)) return
    places.value = Array.isArray(response?.data) ? response.data : []
    if (!places.value.length) error.value = '附近没有找到地点，请换个关键词或手动填写'
    // #endif
  } catch (reason) { if (active(token)) showError(reason) }
  finally { if (token === revision) searching.value = false }
}
function selectPlace(place) { selected.value = joinAddress(place); selectedParts.value = place.ad_info || {} }
function confirm() {
  if (props.disabled || searching.value) return
  try { update({ address: selected.value, parts: selectedParts.value }); close() } catch (reason) { showError(reason) }
}
function close() {
  ++revision; opened.value = false; searching.value = false; locating.value = false; initializing.value = false
  if (map) map.remove()
  map = null; marker = null
}
onBeforeUnmount(() => { disposed = true; close() })
</script>

<style scoped>
.address-tools { width: 100%; padding-top: 18rpx; }
.address-actions, .address-modal-heading, .address-search { display: flex; align-items: center; gap: 16rpx; }
.address-action { display: inline-flex; align-items: center; justify-content: center; gap: 8rpx; margin: 0; padding: 12rpx 18rpx; line-height: 1.4; font-size: 24rpx; color: var(--shop-green); background: var(--shop-soft); border-radius: 14rpx; flex-shrink: 0; }
.address-action::after, .address-confirm::after { border: 0; }
.address-action[disabled], .address-confirm[disabled] { opacity: .5; }
.address-hint, .address-error { display: block; margin-top: 12rpx; font-size: 23rpx; line-height: 1.6; color: var(--shop-muted); }
.address-error { color: #df6147; }
.address-overlay { position: fixed; inset: 0; z-index: 10000; padding: 24rpx; box-sizing: border-box; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.5); }
.address-modal { width: 100%; max-width: 680px; max-height: 85vh; padding: 24rpx; box-sizing: border-box; overflow-y: auto; border-radius: 24rpx; background: var(--shop-card); color: var(--shop-text); }
.address-modal-heading { justify-content: space-between; font-size: 30rpx; font-weight: 600; }
.address-search { margin: 20rpx 0; }
.address-search-input { flex: 1; min-width: 0; height: 80rpx; min-height: 80rpx; box-sizing: border-box; padding: 0 20rpx; line-height: 80rpx; border: 1rpx solid var(--shop-line); border-radius: 12rpx; font-size: 26rpx; color: var(--shop-text); }
.address-search .address-action { height: 80rpx; min-height: 80rpx; box-sizing: border-box; padding: 0 20rpx; }
.address-map { height: 36vh; min-height: 220px; isolation: isolate; background: var(--shop-soft); border-radius: 12rpx; }
.address-selected { display: block; margin: 20rpx 0; font-size: 26rpx; line-height: 1.6; overflow-wrap: anywhere; }
.address-confirm { margin: 0; padding: 18rpx; line-height: 1.5; font-size: 28rpx; color: #fff; background: var(--shop-green); border-radius: 16rpx; }
.address-places { height: 32vh; }
.address-place { padding: 20rpx 0; border-bottom: 1rpx solid var(--shop-line); font-size: 26rpx; }
</style>
