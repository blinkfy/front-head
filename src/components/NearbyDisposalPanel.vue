<template>
  <cover-view v-if="native && expanded" class="disposal-panel" :class="{ dark, measuring: !ready, dragging: !!dragStart, closing }" :style="panelStyle">
    <cover-view class="disposal-grip" @touchstart.stop.prevent="startResize" @touchmove.stop.prevent="moveResize" @touchend.stop.prevent="endResize" @touchcancel.stop="endResize">
      <cover-view class="disposal-handle" />
    </cover-view>
    <cover-view class="disposal-heading">
      <cover-view class="disposal-heading-title">附近投放点</cover-view>
      <cover-view class="disposal-sort">距离优先 · 5 km 内</cover-view>
      <cover-view class="disposal-close" @click.stop="closePanel">×</cover-view>
    </cover-view>
    <cover-view class="disposal-list native-list">
      <cover-view class="disposal-list-content">
        <cover-view v-for="point in points" :key="point.id" class="disposal-row" @click="$emit('select', point)">
          <cover-image class="disposal-photo" :src="pointImage(point)" @error="markImageFailed(point, pointImage(point))" />
          <cover-view class="disposal-details">
            <cover-view class="disposal-name">{{ point.name }}</cover-view>
            <cover-view class="disposal-address">{{ point.distance }} · {{ point.address || point.description || '暂无详细地址' }}</cover-view>
            <cover-view class="disposal-type">{{ point.type === 'smart' ? '智能分类投放点' : '生活垃圾投放点' }}</cover-view>
          </cover-view>
          <cover-view class="disposal-nav" @click.stop="$emit('navigate', point)">
            <cover-image class="disposal-nav-icon" :src="getManifestIconPath('dark_navigation')" />
            <cover-view>导航</cover-view>
          </cover-view>
        </cover-view>
      </cover-view>
    </cover-view>
  </cover-view>
  <cover-view v-else-if="native" class="disposal-reopen" :class="{ dark }" @click="openPanel">附近投放点 · {{ points.length }}</cover-view>
  <view v-else-if="expanded" class="disposal-panel" :class="{ dark, measuring: !ready, dragging: !!dragStart, closing }" :style="panelStyle">
    <view class="disposal-grip" role="separator" aria-label="拖动调节列表高度" aria-orientation="horizontal" :aria-valuenow="Math.round(panelHeight)" :aria-valuemin="minimumHeight" :aria-valuemax="Math.round(maximumHeight)" tabindex="0" @keydown="resizeWithKeyboard" @mousedown.stop.prevent="startMouseResize" @touchstart.stop.prevent="startResize" @touchmove.stop.prevent="moveResize" @touchend.stop.prevent="endResize" @touchcancel.stop="endResize">
      <view class="disposal-handle" />
    </view>
    <view class="disposal-heading">
      <text class="disposal-heading-title">附近投放点</text>
      <text class="disposal-sort">距离优先 · 5 km 内</text>
      <button class="disposal-close" aria-label="关闭附近投放点" @click.stop="closePanel">×</button>
    </view>
    <scroll-view class="disposal-list" scroll-y>
      <view class="disposal-list-content">
        <view v-for="point in points" :key="point.id" class="disposal-row" @click="$emit('select', point)">
          <image class="disposal-photo" :src="pointImage(point)" mode="aspectFill" @error="markImageFailed(point, pointImage(point))" />
          <view class="disposal-details">
            <text class="disposal-name">{{ point.name }}</text>
            <text class="disposal-address">{{ point.distance }} · {{ point.address || point.description || '暂无详细地址' }}</text>
            <text class="disposal-type">{{ point.type === 'smart' ? '智能分类投放点' : '生活垃圾投放点' }}</text>
          </view>
          <button class="disposal-nav" @click.stop="$emit('navigate', point)">
            <ManifestIcon id="dark_navigation" class="disposal-nav-icon" />
            <text>导航</text>
          </button>
        </view>
      </view>
    </scroll-view>
  </view>
  <button v-else class="disposal-reopen" :class="{ dark }" @click="openPanel">附近投放点 · {{ points.length }}</button>
</template>

<script setup>
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ManifestIcon from './ManifestIcon.vue'
import { getManifestIconPath } from '@/utils/manifest-icons.js'
import { config } from '@/api/config.js'
import { resolveBinPointImage } from '@/utils/trash-bin-image-core.mjs'
import { binPointPhotoKey, getBinPointPhotoSource } from '@/utils/bin-point-photo.js'
const props = defineProps({ points: { type: Array, required: true }, dark: Boolean, native: Boolean })
const emit = defineEmits(['select', 'navigate', 'heightchange', 'closingchange'])
const instance = getCurrentInstance()
const expanded = ref(true)
const closing = ref(false)
const CLOSE_DURATION = 280
let closeTimer
const ready = ref(false)
const panelHeight = ref(0)
const dragStart = ref(null)
const viewport = ref(readViewport())
let userResized = false
let disposed = false
let measurement = 0
const wide = computed(() => viewport.value.windowWidth >= 900)
const maximumHeight = computed(() => Math.max(100, wide.value
  ? viewport.value.windowHeight - 230
  : Math.min(viewport.value.windowHeight * .7, viewport.value.windowHeight - 180)))
const minimumHeight = computed(() => Math.min(150, maximumHeight.value))
const panelStyle = computed(() => ready.value ? { height: `${panelHeight.value}px` } : {})

function readViewport() {
  return uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()
}

async function measureContent() {
  const revision = ++measurement
  if (!expanded.value || closing.value) return
  await nextTick()
  if (disposed || revision !== measurement) return
  const query = uni.createSelectorQuery().in(instance.proxy)
  query.select('.disposal-panel').boundingClientRect()
  query.select('.disposal-list').boundingClientRect()
  query.select('.disposal-list-content').boundingClientRect()
  query.exec(rects => {
    if (disposed || revision !== measurement || !expanded.value || closing.value) return
    const [panel, list, content] = rects || []
    if (!panel || !list || !content) return
    const contentHeight = Math.ceil(content.height + panel.height - list.height)
    panelHeight.value = Math.min(maximumHeight.value, userResized ? panelHeight.value : contentHeight)
    ready.value = true
    emit('heightchange', panelHeight.value)
  })
}

function adjustHeight(delta) {
  if (closing.value) return
  userResized = true
  panelHeight.value = Math.max(minimumHeight.value, Math.min(maximumHeight.value, panelHeight.value + delta))
  emit('heightchange', panelHeight.value)
}

function eventY(event) {
  const touch = event.touches?.[0] || event.changedTouches?.[0]
  const candidates = [touch?.clientY, touch?.pageY, touch?.y, event.clientY, event.pageY, event.detail?.y]
  for (const value of candidates) {
    if (value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))) return Number(value)
  }
  return NaN
}

function resizeWithKeyboard(event) {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
  event.preventDefault?.()
  adjustHeight(event.key === 'ArrowUp' ? 40 : -40)
}

function startResize(event) {
  const y = eventY(event)
  if (!ready.value || closing.value || !Number.isFinite(y)) return
  dragStart.value = { y, height: panelHeight.value }
  userResized = true
}

function moveResize(event) {
  if (!dragStart.value) return
  const y = eventY(event)
  if (!Number.isFinite(y)) return
  const delta = (y - dragStart.value.y) * (wide.value ? 1 : -1)
  const requestedHeight = dragStart.value.height + delta
  if (delta < 0 && requestedHeight <= Math.min(96, minimumHeight.value * .65)) {
    closePanel()
    return
  }
  const nextHeight = Math.max(minimumHeight.value, Math.min(maximumHeight.value, requestedHeight))
  adjustHeight(nextHeight - panelHeight.value)
}

function endResize() {
  dragStart.value = null
  if (typeof document !== 'undefined') {
    document.removeEventListener('mousemove', moveResize)
    document.removeEventListener('mouseup', endResize)
  }
}

function startMouseResize(event) {
  if (typeof document === 'undefined') return
  // uni-app 的 H5 鼠标事件会移除 button，并减去原生导航栏高度。
  if (event.button != null && event.button !== 0) return
  const offset = event.button == null ? (viewport.value.windowTop || 0) : 0
  startResize({ clientY: eventY(event) + offset })
  if (!dragStart.value) return
  document.addEventListener('mousemove', moveResize)
  document.addEventListener('mouseup', endResize)
}

function closePanel() {
  if (closing.value || !expanded.value) return
  endResize()
  measurement++
  closing.value = true
  emit('closingchange', true)
  emit('heightchange', 0)
  closeTimer = setTimeout(() => {
    closeTimer = null
    expanded.value = false
    closing.value = false
    emit('closingchange', false)
  }, CLOSE_DURATION + 32)
}

function openPanel() {
  if (closing.value) return
  userResized = false
  ready.value = false
  expanded.value = true
  measureContent()
}

function refreshViewport() {
  endResize()
  viewport.value = readViewport()
  measureContent()
}

watch(() => props.points, () => {
  const keys = new Set(props.points.map(binPointPhotoKey).filter(Boolean))
  for (const key of Object.keys(fallbackImages.value)) if (!keys.has(key)) delete fallbackImages.value[key]
  for (const key of Object.keys(failedImages.value)) if (!keys.has(key)) delete failedImages.value[key]
  measureContent()
}, { flush: 'post' })
onMounted(() => {
  measureContent()
  uni.onWindowResize?.(refreshViewport)
})
onBeforeUnmount(() => {
  disposed = true
  clearTimeout(closeTimer)
  emit('closingchange', false)
  measurement++
  endResize()
  uni.offWindowResize?.(refreshViewport)
  emit('heightchange', 0)
})
const fallbackImages = ref({})
const failedImages = ref({})
const pendingImages = new Set()
function markImageFailed(point, failedSource) {
  const key = binPointPhotoKey(point)
  if (!key || failedSource !== pointImage(point)) return
  if (fallbackImages.value[key]) {
    failedImages.value[key] = true
    return
  }
  if (!point.hasImage || failedImages.value[key] || pendingImages.has(key)) return
  pendingImages.add(key)
  getBinPointPhotoSource(point, { coverImage: props.native }).then(source => {
    const current = props.points.some(item => binPointPhotoKey(item) === key)
    if (!disposed && current) fallbackImages.value[key] = source
  }).catch(() => {
    if (!disposed && props.points.some(item => binPointPhotoKey(item) === key)) failedImages.value[key] = true
  }).finally(() => pendingImages.delete(key))
}
function pointImage(point) {
  const key = binPointPhotoKey(point)
  if (key && failedImages.value[key]) return getManifestIconPath('colorful_bin')
  if (key && fallbackImages.value[key]) return fallbackImages.value[key]
  const src = resolveBinPointImage(point, config.baseUrl)
  return src || getManifestIconPath('colorful_bin')
}
</script>

<style scoped>
.disposal-panel { position: fixed; left: 0; right: 0; bottom: calc(70px + env(safe-area-inset-bottom)); z-index: 90; padding: 0 16px 16px; border-radius: 24px 24px 0 0; background: #fcfefe; color: #142f3b; box-shadow: 0 -6px 30px rgba(25, 65, 60, .12); animation: disposal-rise .3s ease-out; box-sizing: border-box; display: flex; flex-direction: column; }
.disposal-panel { transition: transform 280ms cubic-bezier(.22, 1, .36, 1), opacity 280ms ease-out; }
.disposal-panel.closing { animation: none; transform: translateY(calc(100% + 90px + env(safe-area-inset-bottom))); opacity: 0; pointer-events: none; }
.disposal-panel.measuring { visibility: hidden; }
.disposal-grip { display: flex; align-items: center; justify-content: center; height: 30px; flex-shrink: 0; cursor: ns-resize; touch-action: none; user-select: none; }
.disposal-handle { pointer-events: none; width: 38px; height: 5px; border-radius: 6px; background: #c5cfd3; }
.disposal-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; min-height: 32px; flex-shrink: 0; }
.disposal-heading-title { font-size: 20px; font-weight: 700; }
.disposal-sort { margin-left: auto; font-size: 12px; color: #839098; }
.disposal-close { width: 28px; height: 28px; margin: 0; padding: 0; flex-shrink: 0; border: 0; border-radius: 50%; background: #edf3f1; color: #617b77; font-size: 24px; text-align: center; line-height: 26px; }
.disposal-close::after, .disposal-reopen::after { border: 0; }
.disposal-list { flex: 1; height: 0; min-height: 0; }
.measuring .disposal-list { flex: none; height: auto; }
.disposal-list-content { display: flex; flex-direction: column; }
.native-list { overflow-y: auto; }
.disposal-row { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; padding: 12px 10px; border-radius: 16px; background: #f3f8f7; cursor: pointer; flex-shrink: 0; }
.disposal-row:last-child { margin-bottom: 0; }
.disposal-reopen { position: fixed; left: 16px; bottom: calc(86px + env(safe-area-inset-bottom)); z-index: 90; width: auto; padding: 10px 16px; margin: 0; border-radius: 24px; background: rgba(252,254,254,.82); color: #168b70; font-size: 14px; font-weight: 600; line-height: 24px; box-shadow: 0 3px 18px rgba(25, 65, 60, .16); }
@keyframes disposal-reopen { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
.disposal-reopen { animation: disposal-reopen 180ms ease-out; }
.disposal-reopen.dark { background: rgba(22,43,49,.82); }
.disposal-photo { width: 76px; height: 84px; flex-shrink: 0; border-radius: 12px; background: #e6f1eb; }
.disposal-details { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.disposal-name { display: block; color: #18343f; font-size: 16px; font-weight: 700; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.disposal-address { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; max-height: 3em; overflow: hidden; text-overflow: ellipsis; color: #7c8893; font-size: 13px; line-height: 1.5; white-space: normal; word-break: break-all; }
.disposal-type { display: block; align-self: flex-start; padding: 4px 7px; border-radius: 6px; background: #d5f3e7; color: #179c77; font-size: 12px; line-height: 1.4; }
.disposal-nav { flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; width: 48px; padding: 12px 0; margin: 0; border: 0; border-radius: 24px; background: #e0f7ef; color: #079f7c; font-size: 14px; font-weight: 700; line-height: 1.2; }
.disposal-nav::after { border: 0; }
.disposal-nav-icon { width: 24px; height: 24px; }
.dark { background: #162b31; color: #e3f5ef; box-shadow: 0 -6px 30px rgba(0, 0, 0, .24); }
.dark .disposal-row { background: #1c373c; }
.dark .disposal-name { color: #e3f5ef; }
.dark .disposal-address { color: #a3b7ba; }
.dark .disposal-type, .dark .disposal-nav { background: #164c42; color: #6ce3bc; }
.dark .disposal-close { background: #25434a; color: #a3c9bd; }
@keyframes disposal-rise { from { opacity: 0; transform: translateY(100%); } to { opacity: 1; transform: translateY(0); } }
@keyframes disposal-side { from { opacity: 0; transform: translateX(-24px); } to { opacity: 1; transform: translateX(0); } }
@media (min-width: 900px) {
  .disposal-panel { left: 24px; right: auto; top: 130px; bottom: auto; width: 400px; border-radius: 22px; padding: 16px 16px 0; animation: disposal-side .3s ease-out; }
  .disposal-panel.closing { transform: translateX(-48px); }
  .disposal-grip { order: 2; }
  .disposal-reopen { left: 24px; top: auto; }
}
@media (prefers-reduced-motion: reduce) { .disposal-panel { animation: none; } }
</style>
