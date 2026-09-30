<template>
  <view ref="visualHost" class="recognition-visual" :class="[variant, { 'robot-space': usedRobot }]" aria-hidden="true">
    <view class="camera-layer" :class="{ visible: !robotMounted || ['fade', 'returning', 'parked'].includes(phase) }">
      <slot />
    </view>
    <SmartSortRobot3D v-if="robotMounted" class="robot-layer" :class="{ outgoing: phase === 'fade', returning: phase === 'returning', parked: phase === 'parked' }" :style="returnStyle"
      :variant="variant" :state="state" :active="active" @settled="onRobotSettled" />
  </view>
</template>

<script setup>
import { getCurrentInstance, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import SmartSortRobot3D from './SmartSortRobot3D.vue'

const props = defineProps({
  showRobot: { type: Boolean, default: false },
  state: { type: String, default: 'idle' },
  active: { type: Boolean, default: true },
  variant: { type: String, default: 'light' },
  returnTo: { type: String, default: '' }
})
const emit = defineEmits(['settled', 'returning'])
const owner = getCurrentInstance()
const visualHost = ref(null)
const returnStyle = ref({})
let returnVersion = 0
let destroyed = false
const robotMounted = ref(false)
const usedRobot = ref(false)
const phase = ref('camera')
let holdTimer = null
let fadeTimer = null
let returnTimer = null

function clearTimers() {
  clearTimeout(holdTimer)
  clearTimeout(fadeTimer)
  clearTimeout(returnTimer)
  holdTimer = fadeTimer = returnTimer = null
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

function queryRect(selector, scope) {
  return new Promise(resolve => {
    try {
      const query = uni.createSelectorQuery().in(scope)
      query.select(selector).boundingClientRect()
      query.exec(results => resolve(results?.[0] || null))
    } catch (_) { resolve(null) }
  })
}

async function measureReturnPosition() {
  // H5 从当前视觉节点向上查落点，避开 uni-view 包装层和缓存的其它页面。
  // #ifdef H5
  const element = visualHost.value?.$el || visualHost.value
  if (element?.getBoundingClientRect) {
    let scope = element.parentElement
    let target = null
    while (scope && !target) {
      target = scope.querySelector(props.returnTo)
      scope = scope.parentElement
    }
    return [element.getBoundingClientRect(), target?.getBoundingClientRect() || null]
  }
  // #endif
  // APP/小程序逐层找到包含入口的作用域，不能假定直接父级就是页面。
  const source = await queryRect('.recognition-visual', owner.proxy)
  let scope = owner.parent
  while (source && scope) {
    const target = await queryRect(props.returnTo, scope.proxy)
    if (target) return [source, target]
    scope = scope.parent
  }
  return [source, null]
}

function finishReturn() {
  clearTimers()
  phase.value = 'parked'
  // 保留同一个机器人上下文，入口卡片只提供落点占位。
  emit('settled', { returned: true })
}

async function returnToEntry() {
  clearTimers()
  const version = ++returnVersion
  phase.value = 'returning'
  emit('returning')
  await nextTick()
  const [source, target] = await measureReturnPosition()
  if (destroyed || version !== returnVersion || phase.value !== 'returning') return
  if (!source || !target) {
    // 无法取得布局时仍恢复入口，交由入口自己的静态/3D 加载机制显示。
    phase.value = 'camera'
    robotMounted.value = false
    emit('settled', { returned: false })
    return
  }
  returnStyle.value = { transform: `translate(${target.left - source.left}px, ${target.top - source.top}px)` }
  if (!props.active) return finishReturn()
  // 仅控制落回入口的视觉过渡，不参与上传或识别请求时序。
  returnTimer = setTimeout(finishReturn, 500)
}

function onRobotSettled() {
  if (!robotMounted.value || phase.value !== 'robot' || !['success', 'fail'].includes(props.state)) return
  if (props.state === 'fail' && props.returnTo) return returnToEntry()
  if (!props.active) return finishFeedback()
  phase.value = 'hold'
  if (props.state === 'success') holdTimer = setTimeout(beginFade, 700)
  else beginFade()
}

watch(() => [props.showRobot, props.state], ([showRobot, state]) => {
  // 回到入口后 Idle/Tap 继续在落点播放；新请求立即把机器人送回顶部。
  if (showRobot && ['returning', 'parked'].includes(phase.value) && ['idle', 'tap'].includes(state)) return
  returnVersion++
  clearTimers()
  returnStyle.value = {}
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
  if (!active && phase.value === 'returning') finishReturn()
  if (active && phase.value === 'parked') {
    const version = returnVersion
    nextTick().then(measureReturnPosition).then(([source, target]) => {
      if (!destroyed && version === returnVersion && phase.value === 'parked' && source && target) {
        returnStyle.value = { transform: `translate(${target.left - source.left}px, ${target.top - source.top}px)` }
      }
    })
  }
})
onBeforeUnmount(() => { destroyed = true; returnVersion++; clearTimers() })
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
  transition: none;
}
.robot-layer.returning { transition: transform 500ms cubic-bezier(0.22, 0.7, 0.3, 1.06); }
.robot-layer.parked { transition: none; }
.robot-layer.outgoing { opacity: 0; transform: scale(0.94); transition: opacity 320ms ease-in-out, transform 320ms ease-in-out; }
@media (prefers-reduced-motion: reduce) {
  .robot-layer.outgoing { transform: none; }
  .robot-layer.returning { transition: none; }
}
</style>
