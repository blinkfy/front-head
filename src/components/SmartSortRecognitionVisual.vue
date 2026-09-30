<template>
  <view class="recognition-visual" :class="[variant, { 'robot-space': usedRobot }]" aria-hidden="true">
    <view class="camera-layer" :class="{ visible: !robotMounted || phase === 'fade' }">
      <slot />
    </view>
    <SmartSortRobot3D v-if="robotMounted" class="robot-layer" :class="{ outgoing: phase === 'fade' }"
      :variant="variant" :state="state" :active="active" @settled="onRobotSettled" />
  </view>
</template>

<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import SmartSortRobot3D from './SmartSortRobot3D.vue'

const props = defineProps({
  showRobot: { type: Boolean, default: false },
  state: { type: String, default: 'idle' },
  active: { type: Boolean, default: true },
  variant: { type: String, default: 'light' }
})
const emit = defineEmits(['settled'])
const robotMounted = ref(false)
const usedRobot = ref(false)
const phase = ref('camera')
let holdTimer = null
let fadeTimer = null

function clearTimers() {
  clearTimeout(holdTimer)
  clearTimeout(fadeTimer)
  holdTimer = fadeTimer = null
}

function finishFeedback() {
  clearTimers()
  phase.value = 'camera'
  robotMounted.value = false
  emit('settled')
}

function beginFade() {
  // 摄像机已在同一位置挂载，两层同时过渡，结束后才移除 3D。
  phase.value = 'fade'
  fadeTimer = setTimeout(finishFeedback, 320)
}

function onRobotSettled() {
  if (!robotMounted.value || phase.value !== 'robot' || !['success', 'fail'].includes(props.state)) return
  if (!props.active) return finishFeedback()
  phase.value = 'hold'
  if (props.state === 'success') holdTimer = setTimeout(beginFade, 700)
  else beginFade()
}

watch(() => [props.showRobot, props.state], ([showRobot]) => {
  clearTimers()
  if (showRobot) {
    usedRobot.value = true
    robotMounted.value = true
    phase.value = 'robot'
  } else {
    robotMounted.value = false
    phase.value = 'camera'
  }
}, { immediate: true })

watch(() => props.active, active => {
  if (!active && (phase.value === 'hold' || phase.value === 'fade')) finishFeedback()
})
onBeforeUnmount(clearTimers)
</script>

<style scoped>
.recognition-visual { position: relative; pointer-events: none; }
.recognition-visual.robot-space { width: 160rpx; height: 142rpx; margin: 0 auto 16rpx; }
.recognition-visual.robot-space.dark { width: 170rpx; height: 170rpx; margin-bottom: 24rpx; }
.camera-layer { opacity: 0; transition: opacity 320ms ease-in-out; }
.robot-space .camera-layer { position: absolute; top: 0; right: 0; bottom: 0; left: 0; display: flex; align-items: center; justify-content: center; }
.camera-layer.visible { opacity: 1; }
.recognition-visual .robot-layer {
  position: absolute;
  top: 0;
  left: 0;
  opacity: 1;
  transform: scale(1);
  transition: opacity 320ms ease-in-out, transform 320ms ease-in-out;
}
.robot-layer.outgoing { opacity: 0; transform: scale(0.94); }
@media (prefers-reduced-motion: reduce) {
  .robot-layer.outgoing { transform: none; }
}
</style>
