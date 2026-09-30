<template>
  <view class="robot-slot" :class="variant" :data-robot-status="failed ? 'fallback' : ready ? 'ready' : loadingStage" :data-robot-error="fallbackReason" aria-hidden="true">
    <ManifestIcon id="smart_sort" class="robot-fallback" :class="{ hidden: ready }" :scale="2" />
    <!-- #ifdef H5 -->
    <view ref="host" class="robot-stage" :class="{ visible: ready }"></view>
    <!-- #endif -->
    <!-- #ifdef APP-PLUS -->
    <view v-if="!failed" class="robot-stage" :class="{ visible: ready }">
      <SmartSortRobotApp :state="state" :active="active" @ready="handleReady" @fallback="useFallback" @settled="emit('settled')" />
    </view>
    <!-- #endif -->
    <!-- #ifdef MP-WEIXIN -->
    <view class="robot-stage" :class="{ visible: ready }">
      <smart-sort-xr v-if="xrSupported && !failed && active" :style="xrStyle" :width="xrSize.width" :height="xrSize.height"
        :robot-state="state" :reduced-motion="reducedMotion" @modelready="handleReady" @modelprogress="handleXrProgress" @modelfallback="handleXrFallback" @settled="emit('settled')" />
    </view>
    <!-- #endif -->
  </view>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ManifestIcon from './ManifestIcon.vue'
// #ifdef MP-WEIXIN
import { ensureRobotModelPackage } from './smart-sort-robot-mp.mjs'
// #endif
// #ifdef APP-PLUS
import SmartSortRobotApp from './SmartSortRobotApp.vue'
// #endif

const props = defineProps({
  state: { type: String, default: 'idle' },
  active: { type: Boolean, default: true },
  variant: { type: String, default: 'light' },
  reducedMotion: { type: Boolean, default: false }
})
const emit = defineEmits(['ready', 'fallback', 'settled'])
const host = ref(null)
const ready = ref(false)
let engine = null
let destroyed = false
const failed = ref(false)
const loadingStage = ref('loading')
const fallbackReason = ref('')
let loadingTimer
function clearLoadingTimer() { clearTimeout(loadingTimer); loadingTimer = null }
function watchLoading() {
  clearLoadingTimer()
  if (props.active && !ready.value && !failed.value) {
    loadingTimer = setTimeout(() => useFallback(new Error(`Robot rendering timed out (${loadingStage.value})`)), 15000)
  }
}
function handleReady() {
  if (destroyed || failed.value) return
  clearLoadingTimer()
  ready.value = true
  emit('ready')
}
// #ifdef MP-WEIXIN
const xrSupported = ref(false)
const windowInfo = ref({})
const viewportScale = computed(() => props.state === 'success' && !props.reducedMotion ? 3 / 2.38 : 1)
const xrSize = computed(() => {
  const ratio = (windowInfo.value.windowWidth || 375) / 750 * Math.min(windowInfo.value.pixelRatio || 1, 1.5) * viewportScale.value
  return { width: Math.round((props.variant === 'dark' ? 260 : 240) * ratio), height: Math.round((props.variant === 'dark' ? 235 : 218) * ratio) }
})
const xrStyle = computed(() => `position:absolute;left:50%;top:50%;width:${viewportScale.value * 100}%;height:${viewportScale.value * 100}%;transform:translate(-50%,-50%);pointer-events:none`)
function handleXrProgress(event) { loadingStage.value = event?.detail?.stage || 'scene-loading' }
function handleXrFallback(event) { useFallback(new Error(event?.detail?.message || 'XR-frame unavailable')) }
onMounted(async () => {
  try {
    windowInfo.value = uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()
    windowInfo.value.platform = uni.getDeviceInfo ? uni.getDeviceInfo().platform : uni.getSystemInfoSync().platform
    // XR API 由原生渲染上下文提供，不在 uni-app 普通页面的 API 快照中预判。
    loadingStage.value = 'package-loading'
    await ensureRobotModelPackage()
    if (destroyed || failed.value) return
    loadingStage.value = 'scene-loading'
    xrSupported.value = true
  } catch (error) { useFallback(error) }
})
// #endif

function useFallback(error) {
  if (destroyed || failed.value) return
  fallbackReason.value = String(error?.message || error || 'Robot 3D unavailable')
  failed.value = true
  clearLoadingTimer()
  ready.value = false
  engine?.dispose()
  engine = null
  if (import.meta.env.DEV) console.warn('[SmartSortRobot3D] 静态图标回退:', error)
  // #ifdef MP-WEIXIN
  if (!import.meta.env.DEV && windowInfo.value.platform === 'devtools') console.warn('[SmartSortRobot3D] 静态图标回退:', fallbackReason.value)
  // #endif
  emit('fallback')
  if (props.state === 'success' || props.state === 'fail') emit('settled')
}

// #ifdef H5
onMounted(async () => {
  try {
    const { mountSmartSortRobot } = await import('./smart-sort-robot-engine.mjs')
    if (destroyed) return
    const hostElement = host.value?.$el || host.value
    if (!hostElement?.appendChild) throw new Error('Robot canvas host unavailable')
    engine = await mountSmartSortRobot(hostElement, {
      modelUrl: `${import.meta.env.BASE_URL || '/'}static/web/robot_3d/smart_sort_robot_v34_animated.glb`,
      state: props.state,
      active: props.active,
      onFirstFrame: handleReady,
      onSettled: () => emit('settled'),
      onError: useFallback
    })
    if (destroyed || failed.value) {
      engine.dispose()
      engine = null
    }
    else {
      engine.setState(props.state)
      engine.setActive(props.active)
    }
  } catch (error) {
    useFallback(error)
  }
})
// #endif

// #ifndef H5 || APP-PLUS || MP-WEIXIN
onMounted(() => useFallback(new Error('Platform does not support robot 3D')))
// #endif
onMounted(watchLoading)

watch(() => props.state, value => {
  engine?.setState(value)
  if (failed.value && (value === 'success' || value === 'fail')) emit('settled')
})
watch(() => props.active, value => {
  engine?.setActive(value)
  // #ifdef MP-WEIXIN
  // XR-frame 随节点移除释放渲染上下文；隐藏页不保留运行中的场景。
  if (!value) ready.value = false
  // #endif
  watchLoading()
})
onBeforeUnmount(() => {
  destroyed = true
  clearLoadingTimer()
  engine?.dispose()
  engine = null
})
</script>

<style scoped>
.robot-slot {
  width: 160rpx;
  height: 142rpx;
  margin: 0 auto 16rpx;
  position: relative;
  pointer-events: none;
  font-size: 70rpx;
}
.robot-slot.dark {
  width: 170rpx;
  height: 170rpx;
  margin-bottom: 24rpx;
  font-size: 88rpx;
}
.robot-fallback {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  opacity: 1;
  transition: opacity 220ms ease;
}
.robot-fallback.hidden { opacity: 0; }
.robot-stage {
  position: absolute;
  width: 240rpx;
  height: 218rpx;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  opacity: 0;
  pointer-events: none;
  transition: opacity 220ms ease;
}
.robot-slot.dark .robot-stage {
  width: 260rpx;
  height: 235rpx;
}
.robot-stage.visible { opacity: 1; }
</style>
