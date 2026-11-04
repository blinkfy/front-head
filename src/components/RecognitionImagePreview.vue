<template>
  <view class="recognition-fullscreen" role="dialog" aria-label="识别图片预览" @tap="closeOnBackground" @touchstart="onTouchStart" @touchmove.stop.prevent="onTouchMove" @touchend="onTouchEnd" @touchcancel="onTouchEnd">
        <view class="recognition-fullscreen-image-wrap" :style="imageStyle" @tap.stop>
          <image class="recognition-fullscreen-image" :src="src" mode="aspectFit" @load="onImageLoad" />
          <view class="recognition-fullscreen-boxes">
            <view v-for="(box, index) in displayBoxes" :key="index" class="recognition-fullscreen-box" :style="box.boxStyle">
              <view class="recognition-fullscreen-label" :style="box.labelStyle">{{ box.label }}</view>
            </view>
          </view>
        </view>
    <view class="recognition-fullscreen-close" role="button" aria-label="关闭图片预览" @tap.stop="$emit('close')">×</view>
    <view class="recognition-fullscreen-zoom" @tap.stop>
      <view class="recognition-fullscreen-zoom-button" role="button" aria-label="缩小图片" @tap.stop="zoom(-1)">−</view>
      <text>{{ Math.round(zoomLevel * 100) }}%</text>
      <view class="recognition-fullscreen-zoom-button" role="button" aria-label="放大图片" @tap.stop="zoom(1)">＋</view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onResize } from '@dcloudio/uni-app'
import { buildDisplayBboxes } from '@/utils/use-recognition-bboxes'

const props = defineProps({
  src: { type: String, required: true },
  boxes: { type: Array, default: () => [] },
  space: { type: String, default: '' }
})
const emit = defineEmits(['close'])

function viewport() {
  const info = uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()
  return { width: info.windowWidth || 375, height: info.windowHeight || 667 }
}
const size = ref(viewport())
const natural = ref(null)
const zoomLevel = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)
let pinchStartDistance = 0
let pinchStartZoom = 1
let pinchAnchor = null
let dragStart = null
let suppressCloseUntil = 0
onResize(() => { size.value = viewport() })
function onImageLoad(event) {
  const { width, height } = event.detail || {}
  natural.value = width > 0 && height > 0 ? { width: Number(width), height: Number(height) } : null
}
const imageSize = computed(() => {
  if (!natural.value) return { ...size.value }
  const fit = Math.min(size.value.width / natural.value.width, size.value.height / natural.value.height)
  return { width: natural.value.width * fit, height: natural.value.height * fit }
})
const imageStyle = computed(() => ({ width: `${imageSize.value.width}px`, height: `${imageSize.value.height}px`, transform: `translate(-50%, -50%) translate(${offsetX.value}px, ${offsetY.value}px) scale(${zoomLevel.value})` }))
function clampOffset(value, viewportSize, imageLength) {
  const limit = Math.abs(viewportSize - imageLength) / 2
  return Math.max(-limit, Math.min(limit, value))
}
function zoom(direction) {
  zoomLevel.value = Math.max(0.5, Math.min(3, Math.round((zoomLevel.value + direction * 0.25) * 100) / 100))
  offsetX.value = clampOffset(offsetX.value, size.value.width, imageSize.value.width * zoomLevel.value)
  offsetY.value = clampOffset(offsetY.value, size.value.height, imageSize.value.height * zoomLevel.value)
}
function touchMidpoint(touches) {
  return { x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 }
}
function touchDistance(touches) {
  if (!touches || touches.length < 2) return 0
  const a = touches[0], b = touches[1]
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
}
function onTouchStart(event) {
  const distance = touchDistance(event.touches)
  if (!distance) {
    if (event.touches?.length === 1) dragStart = { x: event.touches[0].clientX, y: event.touches[0].clientY, offsetX: offsetX.value, offsetY: offsetY.value }
    return
  }
  dragStart = null
  pinchStartDistance = distance
  pinchStartZoom = zoomLevel.value
  const midpoint = touchMidpoint(event.touches)
  const width = imageSize.value.width * zoomLevel.value, height = imageSize.value.height * zoomLevel.value
  const left = (size.value.width - width) / 2 + offsetX.value
  const top = (size.value.height - height) / 2 + offsetY.value
  pinchAnchor = { x: (midpoint.x - left) / width, y: (midpoint.y - top) / height }
  suppressCloseUntil = Date.now() + 500
}
function onTouchMove(event) {
  const distance = touchDistance(event.touches)
  if (!pinchStartDistance || !distance) {
    if (dragStart && event.touches?.length === 1) {
      const dx = event.touches[0].clientX - dragStart.x, dy = event.touches[0].clientY - dragStart.y
      if (Math.abs(dx) + Math.abs(dy) > 4) suppressCloseUntil = Date.now() + 500
      offsetX.value = clampOffset(dragStart.offsetX + dx, size.value.width, imageSize.value.width * zoomLevel.value)
      offsetY.value = clampOffset(dragStart.offsetY + dy, size.value.height, imageSize.value.height * zoomLevel.value)
    }
    return
  }
  zoomLevel.value = Math.max(0.5, Math.min(3, pinchStartZoom * distance / pinchStartDistance))
  const midpoint = touchMidpoint(event.touches)
  const width = imageSize.value.width * zoomLevel.value, height = imageSize.value.height * zoomLevel.value
  offsetX.value = clampOffset(midpoint.x - pinchAnchor.x * width - (size.value.width - width) / 2, size.value.width, width)
  offsetY.value = clampOffset(midpoint.y - pinchAnchor.y * height - (size.value.height - height) / 2, size.value.height, height)
  suppressCloseUntil = Date.now() + 500
}
function onTouchEnd(event) {
  if (pinchStartDistance && (!event.touches || event.touches.length < 2)) {
    pinchStartDistance = 0
    pinchAnchor = null
    suppressCloseUntil = Date.now() + 500
  }
  if (!event.touches?.length) dragStart = null
}
function closeOnBackground() {
  if (!pinchStartDistance && Date.now() >= suppressCloseUntil) emit('close')
}
const displayBoxes = computed(() => {
  if (!natural.value) return []
  const { width, height } = imageSize.value
  let scale = size.value.width / 750
  try { scale = uni.upx2px(20) / 20 || scale } catch (_) {}
  return buildDisplayBboxes(props.boxes, {
    displayWidth: width, displayHeight: height,
    naturalWidth: natural.value.width, naturalHeight: natural.value.height, objectFit: 'contain'
  }, props.space, size.value.width <= 768, 0, 0, scale)
})
</script>

<style scoped>
.recognition-fullscreen { position: fixed; inset: 0; z-index: 10000; overflow: hidden; background: rgba(0, 0, 0, .94); touch-action: none; }
.recognition-fullscreen-image-wrap { position: absolute; left: 50%; top: 50%; transform-origin: center; }
.recognition-fullscreen-image, .recognition-fullscreen-boxes { position: absolute; inset: 0; width: 100%; height: 100%; }
.recognition-fullscreen-boxes { pointer-events: none; }
.recognition-fullscreen-box { box-sizing: border-box; position: absolute; border: 2px solid; border-radius: 4px; }
.recognition-fullscreen-label { position: absolute; padding: 3px 9px; color: #fff; border-radius: 4px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.recognition-fullscreen-close { position: absolute; top: calc(8px + env(safe-area-inset-top)); right: 8px; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: rgba(0, 0, 0, .55); color: #fff; font-size: 30px; line-height: 1; }
.recognition-fullscreen-zoom { position: absolute; bottom: calc(20px + env(safe-area-inset-bottom)); left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 12px; padding: 4px 10px; border-radius: 28px; background: rgba(0, 0, 0, .65); color: #fff; font-size: 14px; }
.recognition-fullscreen-zoom-button { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; font-size: 25px; line-height: 1; }
</style>
