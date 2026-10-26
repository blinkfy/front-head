<template>
  <view v-if="visible" :class="['tour-root', { dark, 'demo-browsing': demoBrowsing, 'demo-exiting': guideLeaving, 'focus-following': followTarget }]" @touchmove.stop.prevent @wheel.stop.prevent>
    <view v-if="cardVisible && hasTarget" class="mask-piece mask-top" :style="topMaskStyle" @touchmove.stop.prevent @wheel.stop.prevent></view>
    <view v-if="cardVisible && hasTarget" class="mask-piece mask-left" :style="leftMaskStyle" @touchmove.stop.prevent @wheel.stop.prevent></view>
    <view v-if="cardVisible && hasTarget" class="mask-piece mask-right" :style="rightMaskStyle" @touchmove.stop.prevent @wheel.stop.prevent></view>
    <view v-if="cardVisible && hasTarget" class="mask-piece mask-bottom" :style="bottomMaskStyle" @touchmove.stop.prevent @wheel.stop.prevent></view>
    <view v-else class="mask-piece mask-full" @touchmove.stop.prevent @wheel.stop.prevent></view>

    <view class="target-ring" :class="{ 'is-visible': cardVisible && hasTarget }" :style="targetRingStyle" @touchmove.stop.prevent @wheel.stop.prevent>
      <view class="target-pulse"></view>
    </view>

    <view class="tour-card" :class="{ 'is-visible': cardVisible && !guideLeaving && displayedIndex === currentIndex, 'demo-compact': compactDemo, 'demo-intro': introDemo }" :style="cardStyle" @touchmove.stop.prevent @wheel.stop.prevent>
      <view class="tour-top">
        <view class="step-badge">{{ currentIndex + 1 }} / {{ visibleSteps.length }}</view>
        <text v-if="displayedIndex === 0 && demoStage !== 'idle'" class="example-badge">效果示例 · 自动演示</text>
        <button class="close-btn" type="button" aria-label="关闭新用户引导" @click="dismiss">×</button>
      </view>

      <view class="tip-image-box" v-if="displayedStep.tipImage">
        <image class="tip-image" :src="displayedTipUrl" mode="aspectFit" @load="onTipImageLoad(displayedStep)"></image>
      </view>

      <view class="tour-copy" :class="{ 'copy-changing': !copyVisible }">
        <text class="tour-title">{{ tourTitle }}</text>
        <text class="tour-desc">{{ tourDesc }}</text>
      </view>

      <view class="hint-line" :class="currentStep.arrow"></view>

      <view class="tour-actions">
        <view v-if="isLastStep" class="ghost-btn" @click="moreInfo">查看更多</view>
        <view v-else class="ghost-btn" @click="dismiss">跳过</view>
        <view class="solid-btn" @click="nextStep">{{ isLastStep ? '知道了' : 'OK' }}</view>
        <view v-if="demoBrowsing && !guideLeaving" class="replay-btn" @click="startDemo">重播</view>
      </view>
    </view>

    <image v-if="currentIndex === 0 && visibleSteps[1]" class="tip-preload" :src="getStepImageUrl(visibleSteps[1])" mode="aspectFit" aria-hidden="true" />

    <image v-if="currentIndex === 0 && aiEnabled" class="tip-preload" :src="getStepImageUrl({ tipImage: 'tip1-upcycling.webp' })" mode="aspectFit" aria-hidden="true" />

    <view class="progress-dots" :class="{ 'is-visible': cardVisible }" @touchmove.stop.prevent @wheel.stop.prevent>
      <view
        v-for="(_, index) in visibleSteps"
        :key="index"
        :class="['dot', { active: index === currentIndex }]"
        @click="goToStep(index)"
      ></view>
    </view>
  </view>
</template>

<script setup>
import { computed, nextTick, ref, watch, onBeforeUnmount, getCurrentInstance } from 'vue'
import { measureScopedRects, getOnboardingViewport } from '@/utils/onboarding-focus.mjs'
import { baseUrl } from '@/api/settings.js'

const componentScope = getCurrentInstance()?.proxy
function measureRects(selectors, callback) {
  measureScopedRects(componentScope, selectors, callback)
}
defineExpose({ measureRects })

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  active: {
    type: Boolean,
    default: true
  },
  dark: {
    type: Boolean,
    default: false
  },
  targetRect: {
    type: Object,
    default: null
  },
  aiEnabled: { type: Boolean, default: false },
  followTarget: { type: Boolean, default: false },
  focusInset: { type: Number, default: 0 },
  includeDevice: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['dismiss', 'complete', 'step-change', 'goGuide', 'demo-stage'])

const steps = [
  {
    selector: '.onboarding-target-scan',
    title: '点击这里拍照识别垃圾',
    desc: '拍照或从相册选择图片，系统会识别垃圾类别并给出处理建议。',
    arrow: 'down',
    tipImage: 'tip1.webp'
  },
  {
    selector: '.onboarding-target-device',
    shouldScroll: true,
    requiresDevice: true,
    title: '有智能设备就先连接',
    desc: '连接设备后，可以管理设备状态，并把线下分类记录同步到你的账户。',
    arrow: 'up',
    tipImage: 'tip2.webp'
  },
  {
    selector: '.onboarding-target-map',
    allowBottomDock: true,
    title: '想找投放点就点地图',
    desc: '进入地图后可查看附近垃圾桶和投放位置。',
    arrow: 'down',
    tipImage: 'tip3.webp'
  },
  {
    selector: '.onboarding-target-booking',
    shouldScroll: true,
    title: '大件或可回收物可以预约',
    desc: '填写地址、联系方式 and 物品信息，提交后可查看预约状态。',
    arrow: 'up',
    tipImage: 'tip4.webp'
  },
  {
    selector: '.onboarding-target-shop',
    allowBottomDock: true,
    title: '积分可以去商城使用',
    desc: '完成识别、挑战或活动获得积分后，可以进入积分商城兑换奖励。',
    arrow: 'down',
    tipImage: 'tip5.webp'
  }
]

const currentIndex = ref(0)
// index currently shown on the card (delayed swap)
const displayedIndex = ref(currentIndex.value)
const windowSize = ref({ width: 375, height: 667 })
const guideTop = ref(40)
const cardVisible = ref(false)
const visibilityTimer = ref(0)
// timers to coordinate delayed text swap so text doesn't change during hide animation
const swapTimer = ref(0)
const swapRequestId = ref(0)
const demoStage = ref('idle')
const lastDemoStage = ref('intro')
const displayedDemoStage = ref('intro')
const copyVisible = ref(true)
const guideLeaving = ref(false)
const demoTimers = new Set()
const tip1Loaded = ref(false)
let introTimer = null
let exitAction = null
const introDemo = computed(() => currentIndex.value === 0 && (demoStage.value === 'intro' || (demoStage.value === 'exiting' && lastDemoStage.value === 'intro')))
const compactDemo = computed(() => currentIndex.value === 0 && demoStage.value !== 'idle' && !introDemo.value)
const demoCopy = {
  intro: ['先看一段识别效果示例', '用预置照片演示识别、分类到变废为宝，无需上传。'],
  scan: ['示例演示：机器人识别照片', '看看纸箱、茶罐和玻璃瓶如何被分类。'],
  classified: ['纸、金属、玻璃都能分类', '已展示类别和识别到的具体物品。'],
  advice: ['查看投放与改造建议', '了解如何清洁、回收，并安全地组合这些物品。'],
  upcycling: ['看看桌面收纳改造效果', '可上下滑动回看，也可重播或继续引导。']
}
const visibleDemoCopy = computed(() => {
  if (demoStage.value === 'idle') return null
  if (!props.aiEnabled) {
    if (displayedDemoStage.value === 'intro') return ['先看一段识别效果示例', '用预置照片演示物品识别和垃圾分类，无需上传。']
    if (displayedDemoStage.value !== 'scan') return ['纸、金属、玻璃都能分类', '已展示类别和具体物品，可滑动回看、重播或继续引导。']
  }
  return demoCopy[displayedDemoStage.value]
})
const tourTitle = computed(() => displayedIndex.value === 0 && visibleDemoCopy.value
  ? visibleDemoCopy.value[0] : displayedStep.value.title)
const tourDesc = computed(() => displayedIndex.value === 0 && visibleDemoCopy.value
  ? visibleDemoCopy.value[1] : displayedStep.value.desc)

const visibleSteps = computed(() => steps.filter(step => !step.requiresDevice || props.includeDevice))
const currentStep = computed(() => visibleSteps.value[currentIndex.value] || visibleSteps.value[0])
const displayedStep = computed(() => visibleSteps.value[displayedIndex.value] || visibleSteps.value[0])
const isLastStep = computed(() => currentIndex.value === visibleSteps.value.length - 1)
const hasTarget = computed(() => !!props.targetRect && props.targetRect.width > 0 && props.targetRect.height > 0 && props.targetRect.bottom > 0 && props.targetRect.top < windowSize.value.height)
const demoBrowsing = computed(() => {
  const stage = demoStage.value === 'exiting' ? lastDemoStage.value : demoStage.value
  return currentIndex.value === 0 && (stage === 'upcycling' || (!props.aiEnabled && stage === 'classified'))
})

const displayedTipUrl = computed(() => props.aiEnabled && displayedIndex.value === 0 && displayedDemoStage.value === 'upcycling' && demoStage.value !== 'idle'
  ? getStepImageUrl({ tipImage: 'tip1-upcycling.webp' }) : getStepImageUrl(displayedStep.value))

const getStepImageUrl = (step) => {
  if (!step || !step.tipImage) return ''
  // #ifdef APP-PLUS
  return `/static/app/images/${step.tipImage}`
  // #endif
  // #ifndef APP-PLUS
  return `${baseUrl}/images/${step.tipImage}`
  // #endif
}

const spotlight = computed(() => {
  const rect = props.targetRect || {}
  const pad = 8
  const left = Math.max(12, Number(rect.left || 0) - pad)
  const minTop = compactDemo.value ? Math.max(12, props.focusInset - pad) : 12
  const top = Math.min(windowSize.value.height - 64, Math.max(minTop, Number(rect.top || 0) - pad))
  const right = Math.min(windowSize.value.width - 12, Number(rect.right || 0) + pad)
  const bottom = Math.max(top + 1, Math.min(windowSize.value.height - (compactDemo.value ? 60 : 12), Number(rect.bottom || 0) + pad))
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
  if (compactDemo.value) {
    return {
      left: '20px',
      right: '20px',
      top: `${guideTop.value}px`
    }
  }
  if (introDemo.value && hasTarget.value) {
    const estimatedHeight = Math.min(windowSize.value.height * 0.25, 220) + 220
    const belowTop = spotlight.value.bottom + 12
    if (belowTop + estimatedHeight < windowSize.value.height - 40) {
      return { left: '20px', right: '20px', top: `${belowTop}px` }
    }
    if (spotlight.value.top > estimatedHeight + 12) {
      return { left: '20px', right: '20px', bottom: `${windowSize.value.height - spotlight.value.top + 12}px` }
    }
    return { left: '20px', right: '20px', top: `${guideTop.value}px` }
  }
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
  if (!visible) {
    leaveDemo(() => setDemoStage('idle'))
    return
  }
  currentIndex.value = 0
  displayedIndex.value = 0
  cardVisible.value = false
  if (visibilityTimer.value) {
    clearTimeout(visibilityTimer.value)
    visibilityTimer.value = 0
  }
  refreshWindowSize()
  nextTick(() => {
    if (!props.visible || !props.active) return
    emitStepChange()
    startDemo()
  })
})

watch(() => props.active, active => {
  if (!active) {
    const action = exitAction
    exitAction = null
    clearDemoTimers()
    setDemoStage('idle')
    action?.()
    return
  }
  if (props.visible) nextTick(() => {
    if (!props.visible || !props.active) return
    emitStepChange()
    if (currentIndex.value === 0) startDemo()
  })
})

watch(() => props.targetRect, (rect) => {
  if (demoBrowsing.value) {
    cardVisible.value = true
    return
  }
  if (rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < windowSize.value.height) {
    // Fast displays may deliver another rect before 16ms; keep the first timer.
    if (!cardVisible.value && !visibilityTimer.value) {
      visibilityTimer.value = setTimeout(() => {
        cardVisible.value = true
        visibilityTimer.value = 0
      }, 16)
    }
    return
  }
  if (visibilityTimer.value) {
    clearTimeout(visibilityTimer.value)
    visibilityTimer.value = 0
  }
  cardVisible.value = false
})

watch(demoBrowsing, browsing => {
  if (!browsing) return
  if (visibilityTimer.value) {
    clearTimeout(visibilityTimer.value)
    visibilityTimer.value = 0
  }
  cardVisible.value = true
})

watch(currentIndex, () => {
  guideLeaving.value = false
  // begin hide animation for card but keep displayed text until animation completes
  cardVisible.value = false
  swapRequestId.value += 1
  const myId = swapRequestId.value
  if (swapTimer.value) {
    clearTimeout(swapTimer.value)
    swapTimer.value = 0
  }
  // allow parent to measure target for the new logical step immediately
  nextTick(() => {
    emitStepChange()
    if (props.visible && props.active && currentIndex.value === 0 && demoStage.value === 'idle') startDemo()
  })
  
  // NOTE: do NOT set cardVisible here. 
  // Reliance on props.targetRect watch (which triggers after parent emits new rect)
  // to set cardVisible.value = true.
  
  // wait for hide animation to finish (CSS uses 0.2s) then swap text
  swapTimer.value = setTimeout(() => {
    swapTimer.value = 0
    if (myId !== swapRequestId.value) return
    displayedIndex.value = currentIndex.value
  }, displayedIndex.value === 0 || currentIndex.value === 0 ? 300 : 220)
})

function refreshWindowSize() {
  const viewport = getOnboardingViewport()
  windowSize.value = { width: viewport.width, height: viewport.height }
  guideTop.value = viewport.guideTop
}

function emitStepChange() {
  if (!props.visible || !props.active) return
  emit('step-change', currentStep.value)
}

function setDemoStage(stage) {
  if (demoCopy[stage]) {
    lastDemoStage.value = stage
    if (displayedDemoStage.value !== stage && !['idle', 'exiting'].includes(demoStage.value)) {
      copyVisible.value = false
      const timer = setTimeout(() => {
        demoTimers.delete(timer)
        if (!props.visible || !props.active || demoStage.value !== stage) return
        displayedDemoStage.value = stage
        copyVisible.value = true
      }, 120)
      demoTimers.add(timer)
    } else {
      displayedDemoStage.value = stage
      copyVisible.value = true
    }
  }
  if (stage === 'idle') copyVisible.value = true
  demoStage.value = stage
  emit('demo-stage', stage)
}

function clearDemoTimers() {
  for (const timer of demoTimers) clearTimeout(timer)
  demoTimers.clear()
  introTimer = null
}

function onTipImageLoad(step) {
  if (step?.tipImage !== 'tip1.webp') return
  tip1Loaded.value = true
  if (props.visible && props.active && currentIndex.value === 0 && demoStage.value === 'intro') {
    scheduleIntroEnd(2600)
  }
}

function scheduleIntroEnd(delay) {
  if (introTimer) {
    clearTimeout(introTimer)
    demoTimers.delete(introTimer)
  }
  const timer = setTimeout(() => {
    demoTimers.delete(timer)
    if (introTimer === timer) introTimer = null
    if (!props.visible || !props.active || currentIndex.value !== 0 || demoStage.value !== 'intro') return
    setDemoStage('scan')
    scheduleDemoStages('scan')
  }, delay)
  introTimer = timer
  demoTimers.add(timer)
}

// Resume from the visible stage when asynchronous settings change.
function scheduleDemoStages(stage) {
  if (stage === 'scan') queueDemoStage('classified', 2000)
  if (!props.aiEnabled) return
  if (stage === 'scan' || stage === 'classified') {
    queueDemoStage('advice', stage === 'scan' ? 4500 : 2500)
    queueDemoStage('upcycling', stage === 'scan' ? 8000 : 6000)
  } else if (stage === 'advice') queueDemoStage('upcycling', 3500)
}

watch(() => props.aiEnabled, () => {
  if (!props.visible || !props.active || currentIndex.value !== 0 || !['scan', 'classified', 'advice', 'upcycling'].includes(demoStage.value)) return
  clearDemoTimers()
  const stage = !props.aiEnabled && ['advice', 'upcycling'].includes(demoStage.value) ? 'classified' : demoStage.value
  setDemoStage(stage)
  scheduleDemoStages(stage)
})

function queueDemoStage(stage, delay) {
  const timer = setTimeout(() => {
    demoTimers.delete(timer)
    if (props.visible && props.active && currentIndex.value === 0 && (props.aiEnabled || !['advice', 'upcycling'].includes(stage))) setDemoStage(stage)
  }, delay)
  demoTimers.add(timer)
}

function startDemo() {
  if (!props.visible || !props.active || currentIndex.value !== 0) return
  clearDemoTimers()
  exitAction = null
  guideLeaving.value = false
  setDemoStage('intro')
  scheduleIntroEnd(tip1Loaded.value ? 2600 : 4000)
}

function leaveDemo(action) {
  clearDemoTimers()
  if (currentIndex.value === 0 && demoStage.value !== 'idle') guideLeaving.value = true
  if (demoStage.value === 'exiting') {
    if (action) {
      exitAction = action
      const timer = setTimeout(() => {
        demoTimers.delete(timer)
        setDemoStage('idle')
        const pendingAction = exitAction
        exitAction = null
        pendingAction?.()
      }, 320)
      demoTimers.add(timer)
    }
    return
  }
  if (currentIndex.value !== 0 || demoStage.value === 'idle') {
    action?.()
    return
  }
  setDemoStage('exiting')
  if (!action) return
  exitAction = action
  const timer = setTimeout(() => {
    demoTimers.delete(timer)
    setDemoStage('idle')
    const pendingAction = exitAction
    exitAction = null
    pendingAction?.()
  }, 320)
  demoTimers.add(timer)
}

function moreInfo() {
  emit('goGuide')
}

function dismiss() {
  if (visibilityTimer.value) {
    clearTimeout(visibilityTimer.value)
    visibilityTimer.value = 0
  }
  leaveDemo(() => emit('dismiss'))
}

function nextStep() {
  if (!isLastStep.value) {
    leaveDemo(() => { currentIndex.value += 1 })
    return
  }
  emit('complete')
}

function goToStep(index) {
  if (index === currentIndex.value) return
  if (index < 0 || index >= visibleSteps.value.length) return
  leaveDemo(() => { currentIndex.value = index })
}

onBeforeUnmount(() => {
  leaveDemo()
  exitAction = null
  if (demoStage.value !== 'idle') setDemoStage('idle')
  if (visibilityTimer.value) {
    clearTimeout(visibilityTimer.value)
    visibilityTimer.value = 0
  }
  if (swapTimer.value) {
    clearTimeout(swapTimer.value)
    swapTimer.value = 0
  }
  clearDemoTimers()
})
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

.tour-root.demo-browsing { pointer-events: none; }
.tour-root.demo-exiting { pointer-events: auto; }
.tour-root.demo-exiting .tour-card, .tour-root.demo-exiting .progress-dots { pointer-events: none; }
.demo-exiting .target-ring { opacity: 0; }
.demo-browsing .mask-piece,
.demo-browsing .target-ring { pointer-events: none; }
.demo-browsing .tour-card,
.demo-browsing .progress-dots { pointer-events: auto; }
.demo-browsing .target-ring { visibility: hidden; }

/* Per-frame geometry already follows the content without additional CSS easing. */
.focus-following .mask-piece { transition: none; }
.focus-following .target-ring { transition: opacity .28s ease, transform .48s cubic-bezier(.22, 1, .36, 1); }

.mask-piece {
  position: fixed;
  background: rgba(2, 12, 18, 0.76);
  transition: top .48s cubic-bezier(.22, 1, .36, 1), left .48s cubic-bezier(.22, 1, .36, 1), width .48s cubic-bezier(.22, 1, .36, 1), height .48s cubic-bezier(.22, 1, .36, 1);
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
  border-radius: 24rpx;
  box-shadow: 0 0 0 8rpx rgba(134, 239, 172, 0.16), 0 0 36rpx rgba(134, 239, 172, 0.52);
  pointer-events: none;
  opacity: 0;
  transform: scale(0.98);
  transition: opacity .28s ease, transform .48s cubic-bezier(.22, 1, .36, 1), border-radius .48s ease, top .48s cubic-bezier(.22, 1, .36, 1), left .48s cubic-bezier(.22, 1, .36, 1), width .48s cubic-bezier(.22, 1, .36, 1), height .48s cubic-bezier(.22, 1, .36, 1);
  overflow: hidden;
}

.dark .target-ring {
  border-color: #67e8f9;
  box-shadow: 0 0 0 8rpx rgba(103, 232, 249, 0.14), 0 0 40rpx rgba(103, 232, 249, 0.5);
}

.target-ring.is-visible {
  opacity: 1;
  transform: scale(1);
}

.target-pulse {
  position: absolute;
  inset: 0;
  border-radius: inherit;
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
  opacity: 0;
  transform: translateY(10rpx) scale(0.985);
  transition: opacity .28s ease, transform .45s cubic-bezier(.22, 1, .36, 1), top .54s cubic-bezier(.22, 1, .36, 1);
}

.tour-card.is-visible {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.tour-copy { opacity: 1; transform: translateY(0); transition: opacity .18s ease, transform .24s cubic-bezier(.22, 1, .36, 1); }
.tour-copy.copy-changing { opacity: 0; transform: translateY(4rpx); }

.tour-card.demo-compact {
  z-index: 2;
}

.demo-intro .tip-image-box { height: 25vh; max-height: 220px; margin-bottom: 12rpx; }
.demo-intro .tour-title { font-size: 48rpx; }
.demo-intro .tour-desc { margin-top: 10rpx; font-size: 25rpx; line-height: 1.4; }
.demo-intro .hint-line { height: 30rpx; margin-top: 12rpx; }
.demo-intro .tour-actions { margin-top: 12rpx; }

.demo-compact .tip-image-box {
  height: 20vh;
  max-height: 168px;
  margin-bottom: 24rpx;
}

.demo-compact .tour-top { margin-bottom: 20rpx; }
.example-badge { color: #d1fae5; font-size: 22rpx; font-weight: 700; letter-spacing: 1rpx; }
.dark .example-badge { color: #cffafe; }
.demo-compact .tour-title { font-size: 38rpx; line-height: 1.3; }
.demo-compact .tour-desc { margin-top: 14rpx; font-size: 25rpx; line-height: 1.5; }
.demo-compact .hint-line { display: none; }
.demo-compact .tour-actions { margin-top: 24rpx; }
.demo-compact .ghost-btn,
.demo-compact .solid-btn { min-width: 132rpx; height: 70rpx; line-height: 70rpx; }

@media (max-height: 680px) {
  .demo-compact .tip-image-box { height: 14vh; max-height: 90px; margin-bottom: 16rpx; }
  .demo-compact .tour-top { margin-bottom: 12rpx; }
  .demo-compact .tour-title { font-size: 36rpx; }
  .demo-compact .tour-desc { margin-top: 10rpx; }
  .demo-compact .tour-actions { margin-top: 18rpx; }
}

.replay-btn {
  padding: 10rpx 4rpx;
  color: #bbf7d0;
  font-size: 24rpx;
  font-weight: 700;
  text-shadow: none;
}

.dark .replay-btn { color: #a5f3fc; }

.tip-image-box {
  width: 100%;
  height: 25vh;
  transition: height .54s cubic-bezier(.22, 1, .36, 1), max-height .54s cubic-bezier(.22, 1, .36, 1), margin-bottom .45s ease;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 24rpx;
  background: rgba(255, 255, 255, 0);
  border-radius: 16rpx;
  overflow: hidden;
}

.tip-preload { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }

.tip-image {
  width: 100%;
  height: 100%;
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
  flex: 0 0 56rpx;
  display: grid;
  place-items: center;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  border: 1px solid rgba(220, 255, 244, 0.38);
  border-radius: 50%;
  color: #d6fff1;
  background: rgba(220, 255, 244, 0.17);
  font-family: Arial, sans-serif;
  font-size: 40rpx;
  font-weight: 400;
  line-height: 1;
  text-shadow: none;
}

.close-btn::after {
  border: 0;
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
  opacity: 0;
  transform: translateY(10rpx);
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.progress-dots.is-visible {
  opacity: 1;
  transform: translateY(0);
}

.dot {
  cursor: pointer;
}

.dot:active {
  transform: scale(0.92);
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
@media (prefers-reduced-motion: reduce) {
  .tour-card, .tour-copy, .tip-image-box, .mask-piece, .target-ring { transition: none; }
  .tour-copy.copy-changing { opacity: 1; transform: none; }
}
</style>
