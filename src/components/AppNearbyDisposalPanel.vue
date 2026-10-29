<template><view class="app-nearby-bridge" /></template>

<script setup>
import { getCurrentInstance, onBeforeUnmount, onMounted, watch } from 'vue'
import { onHide, onReady, onShow, onUnload } from '@dcloudio/uni-app'
import { resolveTrashBinImage } from '@/utils/trash-bin-image'
import { createNativeDisposalController } from '@/utils/native-nearby-disposal.mjs'

const props = defineProps({ panelId: { type: String, required: true }, visible: Boolean, points: { type: Array, default: () => [] }, dark: Boolean })
const emit = defineEmits(['select', 'navigate', 'heightchange', 'closingchange'])
const topic = `nearby-disposal:${props.panelId}`
const page = getCurrentInstance().root
const controller = createNativeDisposalController({
  windowInfo: () => uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync(),
  publish: data => uni.$emit(`${topic}:state`, data),
  height: value => emit('heightchange', value),
  closing: value => emit('closingchange', value),
  select: point => emit('select', point),
  navigate: point => emit('navigate', point)
})

function attach() {
  try {
    const window = uni.getSubNVueById(props.panelId)
    if (window) controller.attach(window)
  } catch (_) { /* The page's onReady or the child ready message retries attachment. */ }
}
function receive(message) {
  if (message?.type === 'ready') attach()
  controller.action(message || {})
}
uni.$on(`${topic}:action`, receive)
watch(() => [props.visible, props.points, props.dark], () => controller.update({
  visible: props.visible, dark: props.dark,
  points: props.points.map(point => ({ ...point, image: resolveTrashBinImage(point.image || point.imagePath) }))
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
