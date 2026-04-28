<template>
  <view v-if="visible" :class="['tour-root', { dark }]" @touchmove.stop.prevent @wheel.stop.prevent>
    <view v-if="hasTarget" class="mask-piece mask-top" :style="topMaskStyle" @touchmove.stop.prevent @wheel.stop.prevent></view>
    <view v-if="hasTarget" class="mask-piece mask-left" :style="leftMaskStyle" @touchmove.stop.prevent @wheel.stop.prevent></view>
    <view v-if="hasTarget" class="mask-piece mask-right" :style="rightMaskStyle" @touchmove.stop.prevent @wheel.stop.prevent></view>
    <view v-if="hasTarget" class="mask-piece mask-bottom" :style="bottomMaskStyle" @touchmove.stop.prevent @wheel.stop.prevent></view>
    <view v-else class="mask-piece mask-full" @touchmove.stop.prevent @wheel.stop.prevent></view>

    <view v-if="hasTarget" class="target-ring" :style="targetRingStyle" @touchmove.stop.prevent @wheel.stop.prevent>
      <view class="target-pulse"></view>
    </view>

    <view class="tour-card" :style="cardStyle" @touchmove.stop.prevent @wheel.stop.prevent>
      <view class="tour-top">
        <view class="step-badge">{{ currentIndex + 1 }} / {{ visibleSteps.length }}</view>
        <view class="close-btn" @click="dismiss">×</view>
      </view>

      <text class="tour-title">{{ currentStep.title }}</text>
      <text class="tour-desc">{{ currentStep.desc }}</text>

      <view class="hint-line" :class="currentStep.arrow"></view>

      <view class="tour-actions">
        <view class="ghost-btn" @click="dismiss">跳过</view>
        <view class="solid-btn" @click="nextStep">{{ isLastStep ? '知道了' : 'OK' }}</view>
      </view>
    </view>

    <view class="progress-dots" @touchmove.stop.prevent @wheel.stop.prevent>
      <view
        v-for="(_, index) in visibleSteps"
        :key="index"
        :class="['dot', { active: index === currentIndex }]"
      ></view>
    </view>
  </view>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  dark: {
    type: Boolean,
    default: false
  },
  targetRect: {
    type: Object,
    default: null
  },
  includeDevice: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['dismiss', 'complete', 'step-change'])

const steps = [
  {
    selector: '.onboarding-target-scan',
    title: '点击这里拍照识别垃圾',
    desc: '拍照或从相册选择图片，系统会识别垃圾类别并给出处理建议。',
    arrow: 'down'
  },
  {
    selector: '.onboarding-target-device',
    shouldScroll: true,
    requiresDevice: true,
    title: '有智能设备就先连接',
    desc: '连接设备后，可以管理设备状态，并把线下分类记录同步到你的账户。',
    arrow: 'up'
  },
  {
    selector: '.onboarding-target-map',
    allowBottomDock: true,
    title: '想找投放点就点地图',
    desc: '进入地图后可查看附近垃圾桶和投放位置。',
    arrow: 'down'
  },
  {
    selector: '.onboarding-target-booking',
    shouldScroll: true,
    title: '大件或可回收物可以预约',
    desc: '填写地址、联系方式和物品信息，提交后可查看预约状态。',
    arrow: 'up'
  },
  {
    selector: '.onboarding-target-shop',
    allowBottomDock: true,
    title: '积分可以去商城使用',
    desc: '完成识别、挑战或活动获得积分后，可以进入积分商城兑换奖励。',
    arrow: 'down'
  }
]

const currentIndex = ref(0)
const windowSize = ref({ width: 375, height: 667 })

const visibleSteps = computed(() => steps.filter(step => !step.requiresDevice || props.includeDevice))
const currentStep = computed(() => visibleSteps.value[currentIndex.value] || visibleSteps.value[0])
const isLastStep = computed(() => currentIndex.value === visibleSteps.value.length - 1)
const hasTarget = computed(() => !!props.targetRect && props.targetRect.width > 0 && props.targetRect.height > 0)

const spotlight = computed(() => {
  const rect = props.targetRect || {}
  const pad = 8
  const left = Math.max(12, Number(rect.left || 0) - pad)
  const top = Math.max(12, Number(rect.top || 0) - pad)
  const right = Math.min(windowSize.value.width - 12, Number(rect.right || 0) + pad)
  const bottom = Math.min(windowSize.value.height - 12, Number(rect.bottom || 0) + pad)
  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top)
  }
})

const topMaskStyle = computed(() => ({
  left: '0px',
  top: '0px',
  width: '100%',
  height: `${spotlight.value.top}px`
}))

const leftMaskStyle = computed(() => ({
  left: '0px',
  top: `${spotlight.value.top}px`,
  width: `${spotlight.value.left}px`,
  height: `${spotlight.value.height}px`
}))

const rightMaskStyle = computed(() => ({
  left: `${spotlight.value.right}px`,
  top: `${spotlight.value.top}px`,
  right: '0px',
  height: `${spotlight.value.height}px`
}))

const bottomMaskStyle = computed(() => ({
  left: '0px',
  top: `${spotlight.value.bottom}px`,
  width: '100%',
  bottom: '0px'
}))

const targetRingStyle = computed(() => ({
  left: `${spotlight.value.left}px`,
  top: `${spotlight.value.top}px`,
  width: `${spotlight.value.width}px`,
  height: `${spotlight.value.height}px`
}))

const cardStyle = computed(() => {
  if (!hasTarget.value) {
    return {
      left: '28px',
      right: '28px',
      top: `${Math.round(windowSize.value.height * 0.28)}px`
    }
  }

  const belowTop = spotlight.value.bottom + 26
  const cardFitsBelow = belowTop + 210 < windowSize.value.height
  if (cardFitsBelow) {
    return {
      left: '28px',
      right: '28px',
      top: `${belowTop}px`
    }
  }

  return {
    left: '28px',
    right: '28px',
    bottom: `${Math.max(24, windowSize.value.height - spotlight.value.top + 22)}px`
  }
})

watch(() => props.visible, (visible) => {
  if (!visible) return
  currentIndex.value = 0
  refreshWindowSize()
  nextTick(() => emitStepChange())
})

watch(currentIndex, () => {
  nextTick(() => emitStepChange())
})

function refreshWindowSize() {
  try {
    const info = uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()
    windowSize.value = {
      width: info.windowWidth || 375,
      height: info.windowHeight || 667
    }
  } catch (e) {}
}

function emitStepChange() {
  emit('step-change', currentStep.value)
}

function dismiss() {
  emit('dismiss')
}

function nextStep() {
  if (!isLastStep.value) {
    currentIndex.value += 1
    return
  }
  emit('complete')
}
</script>

<style scoped>
.tour-root {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  z-index: 20000;
  pointer-events: auto;
}

.mask-piece {
  position: fixed;
  background: rgba(2, 12, 18, 0.76);
}

.dark .mask-piece {
  background: rgba(0, 4, 8, 0.78);
}

.mask-full {
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
}

.target-ring {
  position: fixed;
  border: 4rpx solid #86efac;
  border-radius: 26rpx;
  box-shadow: 0 0 0 8rpx rgba(134, 239, 172, 0.16), 0 0 36rpx rgba(134, 239, 172, 0.52);
  pointer-events: none;
}

.dark .target-ring {
  border-color: #67e8f9;
  box-shadow: 0 0 0 8rpx rgba(103, 232, 249, 0.14), 0 0 40rpx rgba(103, 232, 249, 0.5);
}

.target-pulse {
  position: absolute;
  top: -10rpx;
  left: -10rpx;
  right: -10rpx;
  bottom: -10rpx;
  border-radius: 32rpx;
  border: 2rpx solid rgba(134, 239, 172, 0.44);
  animation: pulse 1.6s ease-in-out infinite;
}

.dark .target-pulse {
  border-color: rgba(103, 232, 249, 0.42);
}

.tour-card {
  position: fixed;
  color: #ffffff;
  text-shadow: 0 4rpx 14rpx rgba(0, 0, 0, 0.35);
}

.tour-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18rpx;
}

.step-badge {
  height: 48rpx;
  line-height: 48rpx;
  padding: 0 22rpx;
  border-radius: 999rpx;
  background: rgba(134, 239, 172, 0.22);
  color: #bbf7d0;
  font-size: 24rpx;
  font-weight: 800;
}

.dark .step-badge {
  background: rgba(103, 232, 249, 0.18);
  color: #a5f3fc;
}

.close-btn {
  width: 56rpx;
  height: 56rpx;
  line-height: 52rpx;
  text-align: center;
  border-radius: 50%;
  color: #ffffff;
  background: rgba(255, 255, 255, 0.14);
  font-size: 44rpx;
  text-shadow: none;
}

.tour-title {
  display: block;
  max-width: 620rpx;
  font-size: 46rpx;
  line-height: 1.18;
  font-weight: 900;
  color: #ffffff;
}

.tour-desc {
  display: block;
  margin-top: 18rpx;
  max-width: 600rpx;
  color: rgba(255, 255, 255, 0.86);
  font-size: 28rpx;
  line-height: 1.55;
}

.hint-line {
  width: 120rpx;
  height: 44rpx;
  margin: 24rpx 0 4rpx 72rpx;
  border-bottom: 6rpx solid #86efac;
  border-left: 6rpx solid #86efac;
  border-radius: 0 0 0 42rpx;
  transform: rotate(-14deg);
}

.dark .hint-line {
  border-color: #67e8f9;
}

.hint-line.up {
  transform: rotate(165deg);
  margin-left: 180rpx;
}

.tour-actions {
  display: flex;
  align-items: center;
  gap: 18rpx;
  margin-top: 26rpx;
}

.ghost-btn,
.solid-btn {
  min-width: 132rpx;
  height: 66rpx;
  line-height: 66rpx;
  text-align: center;
  border-radius: 18rpx;
  font-size: 26rpx;
  font-weight: 900;
  text-shadow: none;
}

.ghost-btn {
  color: rgba(255, 255, 255, 0.86);
  background: rgba(255, 255, 255, 0.12);
}

.solid-btn {
  color: #052e16;
  background: #86efac;
}

.dark .solid-btn {
  color: #082f49;
  background: #67e8f9;
}

.progress-dots {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(28rpx + env(safe-area-inset-bottom));
  display: flex;
  justify-content: center;
  gap: 14rpx;
}

.dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.34);
}

.dot.active {
  width: 36rpx;
  border-radius: 999rpx;
  background: #86efac;
}

.dark .dot.active {
  background: #67e8f9;
}

@keyframes pulse {
  0%, 100% { opacity: 0.35; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.03); }
}
</style>
