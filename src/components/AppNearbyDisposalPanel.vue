<template><view class="app-nearby-bridge" /></template>

<script setup>
import { getCurrentInstance, onBeforeUnmount, onMounted, watch } from 'vue'
import { onHide, onReady, onShow, onUnload } from '@dcloudio/uni-app'
import { config } from '@/api/config.js'
import { pageSubNVue } from '@/utils/page-subnvue.mjs'
import { resolveBinPointImage } from '@/utils/trash-bin-image-core.mjs'
import { binPointPhotoKey, getBinPointPhoto } from '@/utils/bin-point-photo.js'
import { createNativeDisposalController } from '@/utils/native-nearby-disposal.mjs'

const props = defineProps({ panelId: { type: String, required: true }, visible: Boolean, points: { type: Array, default: () => [] }, dark: Boolean })
const emit = defineEmits(['select', 'navigate', 'heightchange', 'closingchange'])
const topic = `nearby-disposal:${props.panelId}`
const page = getCurrentInstance().root
const fallbackImages = new Map()
const attemptedImages = new Set()
const controller = createNativeDisposalController({
  windowInfo: () => uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync(),
  publish: data => uni.$emit(`${topic}:state`, data),
  height: value => emit('heightchange', value),
  closing: value => emit('closingchange', value),
  select: point => emit('select', props.points.find(item => String(item.id) === String(point.id)) || point),
  navigate: point => emit('navigate', props.points.find(item => String(item.id) === String(point.id)) || point)
})

function attach() {
  try {
    const window = pageSubNVue(page, props.panelId)
    if (window) controller.attach(window)
  } catch (_) { /* The page's onReady or the child ready message retries attachment. */ }
}
function mappedPoints() {
  const currentKeys = new Set(props.points.map(binPointPhotoKey).filter(Boolean))
  for (const key of fallbackImages.keys()) if (!currentKeys.has(key)) fallbackImages.delete(key)
  for (const key of attemptedImages) if (!currentKeys.has(key)) attemptedImages.delete(key)
  return props.points.map(point => {
    const key = binPointPhotoKey(point)
    return { ...point, image: fallbackImages.get(key) || resolveBinPointImage(point, config.baseUrl) }
  })
}
function receive(message) {
  if (message?.type === 'ready') attach()
  if (message?.type === 'imageerror') {
    const point = props.points.find(item => String(item.id) === String(message.id))
    const key = binPointPhotoKey(point)
    if (!point?.hasImage || !key || attemptedImages.has(key)) return
    attemptedImages.add(key)
    getBinPointPhoto(point).then(image => {
      const current = props.points.find(item => String(item.id) === String(point.id))
      if (disposed || binPointPhotoKey(current) !== key) return
      fallbackImages.set(key, image)
      controller.update({ visible: props.visible, dark: props.dark, points: mappedPoints() })
    }).catch(() => {})
    return
  }
  controller.action(message || {})
}
uni.$on(`${topic}:action`, receive)
watch(() => [props.visible, props.points, props.dark], () => controller.update({
  visible: props.visible, dark: props.dark,
  points: mappedPoints()
}), { immediate: true })
onMounted(() => { attach(); controller.activate(true); uni.onWindowResize?.(controller.refresh) })
onReady(attach, page)
onShow(() => { attach(); controller.activate(true) }, page)
onHide(() => controller.activate(false), page)
let disposed = false
function dispose() {
  if (disposed) return
  disposed = true
  uni.$off(`${topic}:action`, receive)
  uni.offWindowResize?.(controller.refresh)
  controller.dispose()
}
onUnload(dispose, page)
onBeforeUnmount(dispose)
</script>

<style scoped>
.app-nearby-bridge { display: none; }
</style>
