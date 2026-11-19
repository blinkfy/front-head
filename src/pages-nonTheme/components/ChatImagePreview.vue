<template>
  <view class="chat-image-viewer" role="dialog" aria-modal="true" aria-label="聊天图片预览" @click="closeOnBackground">
    <view class="viewer-stage" @touchstart="touchStart" @touchmove.stop.prevent="touchMove" @touchend="touchEnd" @touchcancel="cancelTouch"
      @mousedown="mouseDown" @mousemove="mouseMove" @mouseup="mouseUp" @mouseleave="mouseUp" @wheel.stop.prevent="wheelZoom">
      <view class="viewer-image-wrap" :style="imageStyle" @click.stop @dblclick.stop="doubleClick">
        <ChatCachedImage class="viewer-image" :src="src" :owner="owner" :kind="kind" :message-id="messageId" :original-token="originalToken" :retry-nonce="retryNonce"
          :original-src="originalSrc" :conversation-id="conversationId" eager @original-cached="$emit('original-cached')"
          mode="aspectFit" :draggable="false" :show-menu-by-longpress="true" @load="imageLoad" @error="$emit('error', $event)" />
      </view>
    </view>
    <view class="viewer-header">
      <button class="viewer-button viewer-close" aria-label="关闭图片预览" @click.stop="$emit('close')">×</button>
      <text class="viewer-count">{{ index + 1 }} / {{ count }}</text>
      <text class="viewer-quality">{{ originalLoaded ? '原图' : '预览图' }}</text>
    </view>
    <button v-if="index > 0" class="viewer-button viewer-prev" aria-label="上一张图片" @click.stop="$emit('previous')">‹</button>
    <button v-if="index < count - 1" class="viewer-button viewer-next" aria-label="下一张图片" @click.stop="$emit('next')">›</button>
    <view class="viewer-footer">
      <view class="viewer-zoom">
        <button class="viewer-button" :disabled="zoomLevel <= 0.5" aria-label="缩小图片" @click.stop="zoomBy(-0.25)">−</button>
        <button class="viewer-button viewer-reset" aria-label="恢复图片大小" @click.stop="resetZoom">{{ Math.round(zoomLevel * 100) }}%</button>
        <button class="viewer-button" :disabled="zoomLevel >= 3" aria-label="放大图片" @click.stop="zoomBy(0.25)">＋</button>
      </view>
      <view class="viewer-original">
        <text v-if="retrying || loading" class="viewer-status">{{ retrying ? '重新加载中…' : '正在加载原图…' }}</text>
        <text v-else-if="originalLoaded" class="viewer-status">已加载原图</text>
        <button v-else class="viewer-button viewer-download" @click.stop="$emit('original')">查看原图{{ fileSize ? ' · ' + fileSize : '' }}</button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { onResize } from '@dcloudio/uni-app'
import ChatCachedImage from './ChatCachedImage.vue'

const props = defineProps({
  src: { type: String, default: '' }, owner: { type: [String, Number], default: '' }, kind: { type: String, default: '' },
  messageId: { type: [String, Number], required: true }, originalToken: { type: String, default: '' }, retryNonce: { type: [String, Number], default: '' },
  originalSrc: { type: String, default: '' }, conversationId: { type: [String, Number], default: '' },
  index: { type: Number, default: 0 }, count: { type: Number, default: 1 }, originalLoaded: Boolean, loading: Boolean, retrying: Boolean,
  fileSize: { type: String, default: '' }
})
const emit = defineEmits(['close', 'next', 'previous', 'original', 'load', 'error', 'original-cached'])
function windowSize() {
  try {
    const info = uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()
    return { width: Number(info.windowWidth) || 375, height: Number(info.windowHeight) || 667 }
  } catch (_) { return { width: 375, height: 667 } }
}
const viewport = ref(windowSize()), natural = ref(null), zoomLevel = ref(1), offsetX = ref(0), offsetY = ref(0)
let gesture = null, mouse = null, lastTap = null, suppressCloseUntil = 0
const imageSize = computed(() => {
  if (!natural.value) return viewport.value
  const fit = Math.min(viewport.value.width / natural.value.width, viewport.value.height / natural.value.height)
  return { width: natural.value.width * fit, height: natural.value.height * fit }
})
const imageStyle = computed(() => ({ width: imageSize.value.width + 'px', height: imageSize.value.height + 'px',
  transform: `translate(-50%, -50%) translate(${offsetX.value}px, ${offsetY.value}px) scale(${zoomLevel.value})` }))
function clampOffsets() {
  const x = Math.max(0, (imageSize.value.width * zoomLevel.value - viewport.value.width) / 2)
  const y = Math.max(0, (imageSize.value.height * zoomLevel.value - viewport.value.height) / 2)
  offsetX.value = Math.max(-x, Math.min(x, offsetX.value))
  offsetY.value = Math.max(-y, Math.min(y, offsetY.value))
}
function imageLoad(event) {
  if (event.currentTarget?.dataset?.messageId != null && String(event.currentTarget.dataset.messageId) !== String(props.messageId)) return
  const { width, height } = event.detail || {}
  if (Number(width) > 0 && Number(height) > 0) natural.value = { width: Number(width), height: Number(height) }
  clampOffsets()
  emit('load', event)
}
function setZoom(value, point) {
  const next = Math.max(0.5, Math.min(3, Math.round(value * 100) / 100))
  const ratio = next / zoomLevel.value
  const x = point ? point.clientX - viewport.value.width / 2 : 0
  const y = point ? point.clientY - viewport.value.height / 2 : 0
  offsetX.value = x - (x - offsetX.value) * ratio
  offsetY.value = y - (y - offsetY.value) * ratio
  zoomLevel.value = next
  clampOffsets()
}
function zoomBy(delta) { setZoom(zoomLevel.value + delta) }
function resetZoom() { zoomLevel.value = 1; offsetX.value = 0; offsetY.value = 0 }
function doubleClick(event) { if (Date.now() >= suppressCloseUntil) setZoom(zoomLevel.value > 1 ? 1 : 2, event) }
function wheelZoom(event) { if (event.deltaY) setZoom(zoomLevel.value + (event.deltaY > 0 ? -0.25 : 0.25), event) }
function distance(points) { return Math.hypot(points[0].clientX - points[1].clientX, points[0].clientY - points[1].clientY) }
function midpoint(points) { return { clientX: (points[0].clientX + points[1].clientX) / 2, clientY: (points[0].clientY + points[1].clientY) / 2 } }
function touchStart(event) {
  const points = event.touches || []
  if (points.length >= 2) {
    const point = midpoint(points)
    gesture = { pinch: true, distance: distance(points), zoom: zoomLevel.value,
      anchorX: (point.clientX - viewport.value.width / 2 - offsetX.value) / zoomLevel.value,
      anchorY: (point.clientY - viewport.value.height / 2 - offsetY.value) / zoomLevel.value }
    lastTap = null
  } else if (points.length === 1) {
    gesture = { x: points[0].clientX, y: points[0].clientY, dx: 0, dy: 0, offsetX: offsetX.value, offsetY: offsetY.value }
  }
}
function touchMove(event) {
  const points = event.touches || []
  if (!gesture) return
  if (points.length >= 2 && gesture.pinch && gesture.distance > 0) {
    const point = midpoint(points)
    zoomLevel.value = Math.max(0.5, Math.min(3, gesture.zoom * distance(points) / gesture.distance))
    offsetX.value = point.clientX - viewport.value.width / 2 - gesture.anchorX * zoomLevel.value
    offsetY.value = point.clientY - viewport.value.height / 2 - gesture.anchorY * zoomLevel.value
  } else if (points.length === 1 && !gesture.pinch) {
    gesture.dx = points[0].clientX - gesture.x; gesture.dy = points[0].clientY - gesture.y
    if (zoomLevel.value > 1) { offsetX.value = gesture.offsetX + gesture.dx; offsetY.value = gesture.offsetY + gesture.dy }
  }
  clampOffsets()
  suppressCloseUntil = Date.now() + 450
}
function touchEnd(event) {
  if (!gesture) return
  if (event.touches?.length) {
    // Lifting one finger after a pinch must not turn into a swipe or double tap.
    gesture = null; lastTap = null; suppressCloseUntil = Date.now() + 450
    return
  }
  const current = gesture
  gesture = null
  if (current.pinch) { lastTap = null; suppressCloseUntil = Date.now() + 450; return }
  const dx = current.dx || 0, dy = current.dy || 0
  if (zoomLevel.value <= 1 && Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.4) {
    if (dx < 0 && props.index < props.count - 1) emit('next')
    if (dx > 0 && props.index > 0) emit('previous')
    lastTap = null
  } else if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
    if (lastTap && Date.now() - lastTap.time < 280 && Math.hypot(current.x - lastTap.x, current.y - lastTap.y) < 24) {
      setZoom(zoomLevel.value > 1 ? 1 : 2, { clientX: current.x, clientY: current.y })
      lastTap = null; suppressCloseUntil = Date.now() + 450
    } else lastTap = { x: current.x, y: current.y, time: Date.now() }
  } else lastTap = null
}
function cancelTouch() { gesture = null; lastTap = null; suppressCloseUntil = Date.now() + 450 }
function mouseDown(event) {
  if (event.button !== 0) return
  event.preventDefault?.()
  mouse = { x: event.clientX, y: event.clientY, offsetX: offsetX.value, offsetY: offsetY.value }
}
function mouseMove(event) {
  if (!mouse || zoomLevel.value <= 1) return
  offsetX.value = mouse.offsetX + event.clientX - mouse.x; offsetY.value = mouse.offsetY + event.clientY - mouse.y
  clampOffsets(); suppressCloseUntil = Date.now() + 450
}
function mouseUp() { mouse = null }
function closeOnBackground() { if (Date.now() >= suppressCloseUntil) emit('close') }
function keydown(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return
  if (event.key === 'Escape') emit('close')
  else if (event.key === 'ArrowLeft' && props.index > 0) emit('previous')
  else if (event.key === 'ArrowRight' && props.index < props.count - 1) emit('next')
  else if (event.key === '+' || event.key === '=') zoomBy(0.25)
  else if (event.key === '-') zoomBy(-0.25)
  else if (event.key === '0') resetZoom()
  else return
  event.preventDefault?.()
}
onResize(() => { viewport.value = windowSize(); clampOffsets() })
onMounted(() => {
  // #ifdef H5
  window.addEventListener('keydown', keydown)
  // #endif
})
onBeforeUnmount(() => {
  // #ifdef H5
  window.removeEventListener('keydown', keydown)
  // #endif
})
</script>

<style scoped>
.chat-image-viewer { position: fixed; inset: 0; z-index: 999999; overflow: hidden; color: #fff; background: #080a09; touch-action: none; }
.viewer-stage { position: absolute; inset: 0; overflow: hidden; user-select: none; }
.viewer-image-wrap { position: absolute; left: 50%; top: 50%; transform-origin: center; }
.viewer-image { display: block; width: 100%; height: 100%; }
.viewer-header { position: absolute; top: max(12px, var(--status-bar-height, 0px), env(safe-area-inset-top)); left: 16px; right: 16px; display: flex; align-items: center; justify-content: space-between; pointer-events: none; }
.viewer-button { margin: 0; padding: 0; min-width: 42px; height: 42px; line-height: 42px; border: 0; border-radius: 50%; color: #fff; background: rgba(22, 26, 24, .72); font-size: 23px; text-align: center; pointer-events: auto; }
.viewer-button::after { border: 0; }
.viewer-button[disabled] { opacity: .35; color: #fff; background: transparent; }
.viewer-close { font-size: 31px; }
.viewer-count, .viewer-quality { padding: 6px 12px; border-radius: 16px; background: rgba(22, 26, 24, .65); font-size: 13px; }
.viewer-prev, .viewer-next { position: absolute; top: 50%; margin-top: -22px; font-size: 32px; }
.viewer-prev { left: 12px; } .viewer-next { right: 12px; }
.viewer-footer { position: absolute; left: 16px; right: 16px; bottom: calc(16px + env(safe-area-inset-bottom)); display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; pointer-events: none; }
.viewer-zoom { display: flex; align-items: center; border-radius: 24px; background: rgba(22, 26, 24, .8); pointer-events: auto; }
.viewer-zoom .viewer-button { background: transparent; }
.viewer-reset { min-width: 62px; font-size: 13px; font-variant-numeric: tabular-nums; }
.viewer-original { text-align: right; }
.viewer-download { min-width: 112px; padding: 0 14px; border-radius: 24px; font-size: 13px; }
.viewer-status { display: block; max-width: 150px; padding: 10px 12px; border-radius: 24px; background: rgba(22, 26, 24, .72); font-size: 12px; }
</style>
