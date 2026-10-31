<template><view class="app-map-controls-bridge" /></template>

<script setup>
// #ifdef APP-PLUS
import { getCurrentInstance, onBeforeUnmount, onMounted, watch } from 'vue'
import { onReady, onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { createAppMapControlsController } from '@/utils/app-map-controls.mjs'

const props = defineProps({
  controlId: { type: String, required: true },
  visible: { type: Boolean, default: true },
  selectMode: { type: Boolean, default: false },
  dark: { type: Boolean, default: false },
  top: { type: Number, default: 0 },
  satellite: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  latitude: { type: [Number, String], default: null },
  longitude: { type: [Number, String], default: null }
})
const emit = defineEmits(['basemap', 'cancel', 'confirm', 'center', 'locate'])
const topic = `app-map-controls:${props.controlId}`
const page = getCurrentInstance().root
const controller = createAppMapControlsController({
  getSize: () => {
    const info = uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()
    return { width: info.windowWidth, height: info.windowHeight }
  },
  publish: state => uni.$emit(`${topic}:state`, state),
  onAction: (action, value) => emit(action, value)
})
function attach() {
  try {
    const nativeWindow = uni.getSubNVueById(props.controlId)
    if (nativeWindow) controller.attach(nativeWindow)
  } catch (_) { /* Page ready and the native child's handshake retry attachment. */ }
}
function sync() {
  controller.update({
    visible: props.visible, selectMode: props.selectMode, dark: props.dark, top: props.top,
    satellite: props.satellite, loading: props.loading, latitude: props.latitude, longitude: props.longitude
  })
}
function receive(message) {
  if (message?.type === 'ready') attach()
  controller.action(message)
}
uni.$on(`${topic}:action`, receive)
watch(() => [props.visible, props.selectMode, props.dark, props.top, props.satellite, props.loading, props.latitude, props.longitude], sync, { immediate: true })
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
// #endif
</script>

<style scoped>
.app-map-controls-bridge { display: none; }
</style>
