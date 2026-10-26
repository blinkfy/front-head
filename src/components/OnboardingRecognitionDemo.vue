<template>
  <view v-if="contentLevel > 0" class="onboarding-demo-layout">
    <view :style="{ height: `${demoTopSpace}px` }" aria-hidden="true"></view>
  <view class="onboarding-recognition-demo" :class="{ dark, exiting: stage === 'exiting' }" aria-label="预置识别示例">
    <view class="demo-layout-origin" aria-hidden="true"></view>
    <view class="onboarding-demo-photo">
    <view class="demo-heading">
      <text class="demo-title">识别结果</text>
      <text class="demo-label">预置示例</text>
    </view>

    <view class="demo-photo-frame" :style="photoFrameStyle">
    <view class="demo-photo">
      <image class="demo-image" :src="beforeImageUrl" mode="aspectFill" />
      <view v-if="contentLevel === 1" class="demo-scan-line"></view>
    </view>
    </view>
    </view>
    <view class="demo-robot-row">
      <SmartSortRobot3D class="demo-robot" :state="contentLevel === 1 ? 'processing' : 'success'" :active="active" :overlay-active="true" :variant="dark ? 'dark' : 'light'" />
      <text class="demo-robot-caption">{{ contentLevel === 1 ? '正在分析示例照片…' : '示例识别完成' }}</text>
    </view>

    <view v-if="contentLevel >= 2" class="onboarding-demo-summary demo-reveal">
      <view class="demo-reveal-inner demo-enter">
        <view class="demo-section">
          <text class="demo-section-title">垃圾类别</text>
          <text class="demo-section-body">可回收物 · 纸类、金属、玻璃</text>
          <text class="demo-section-title demo-subtitle">识别到的具体物品</text>
          <view class="demo-chips">
            <text v-for="item in items" :key="item" class="demo-chip">{{ item }}</text>
          </view>
        </view>
      </view>
    </view>

    <view v-if="contentLevel >= 3" class="onboarding-demo-advice demo-reveal">
      <view class="demo-reveal-inner demo-enter">
        <view v-for="section in advice" :key="section.title" class="demo-section">
          <text class="demo-section-title">{{ section.title }}</text>
          <text class="demo-section-body">{{ section.content }}</text>
        </view>
      </view>
    </view>

    <view v-if="contentLevel >= 4" class="onboarding-demo-upcycling demo-reveal">
      <view class="demo-reveal-inner demo-enter">
        <view class="demo-section">
          <text class="demo-section-title">变废为宝 · 桌面收纳组合</text>
          <view class="demo-photo-frame" :style="photoFrameStyle">
          <view class="demo-after-photo">
            <image class="demo-image" :src="afterImageUrl" mode="aspectFill" />
          </view>
          </view>
          <text class="demo-image-caption">同一组物品改造的预置效果图，仅供灵感参考</text>
        </view>
      </view>
    </view>
  </view>
    <view :style="{ height: `${demoBottomSpace}px` }" aria-hidden="true"></view>
  </view>
</template>

<script setup>
import { computed, ref, watch, getCurrentInstance, nextTick, onBeforeUnmount } from 'vue'
import { measureScopedRects, getOnboardingViewport } from '@/utils/onboarding-focus.mjs'
import { baseUrl } from '@/api/settings.js'
import SmartSortRobot3D from './SmartSortRobot3D.vue'

const componentScope = getCurrentInstance()?.proxy
function measureRects(selectors, callback) {
  const stage = props.stage
  const requestId = layoutRequestId
  measureScopedRects(componentScope, selectors, rects => {
    if (stage === props.stage && requestId === layoutRequestId && props.active) {
      const index = selectors.indexOf({ scan: '.onboarding-demo-photo', classified: '.onboarding-demo-summary', advice: '.onboarding-demo-advice', upcycling: '.onboarding-demo-upcycling' }[stage])
      if (index >= 0 && rects[index]?.height > 0) activeSectionHeight.value = rects[index].height
    }
    callback(rects)
  })
}
defineExpose({ measureRects })

const props = defineProps({
  stage: { type: String, default: 'idle' },
  dark: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  aiEnabled: { type: Boolean, default: false },
  focusInset: { type: Number, default: 0 }
})

function getDemoImageUrl(filename) {
  // #ifdef APP-PLUS
  return `/static/app/images/${filename}`
  // #endif
  // #ifndef APP-PLUS
  return `${baseUrl}/images/${filename}`
  // #endif
}
const beforeImageUrl = getDemoImageUrl('desk-packaging-before.webp')
const afterImageUrl = getDemoImageUrl('desk-packaging-after.webp')

const stageLevels = { idle: 0, intro: 0, scan: 1, classified: 2, advice: 3, upcycling: 4 }
const lastContentLevel = ref(0)
const activeSectionHeight = ref(0)
watch(() => props.stage, stage => {
  if (stage === 'idle' || stage === 'intro') lastContentLevel.value = 0
  else if (stageLevels[stage]) {
    lastContentLevel.value = stageLevels[stage]
    activeSectionHeight.value = 0
  }
}, { immediate: true })
const contentLevel = computed(() => {
  const level = props.stage === 'exiting' ? lastContentLevel.value : (stageLevels[props.stage] || 0)
  return props.aiEnabled ? level : Math.min(level, 2)
})


// Reserve real document space so the first photo can sit below the guide even
// when the page is already at scrollTop zero.
const demoOriginTop = ref(null)
const demoViewport = ref(getOnboardingViewport())
const demoTopSpace = computed(() => demoOriginTop.value === null ? 0 : Math.max(0, props.focusInset - demoOriginTop.value))
// Reserve trailing room so even a short classification panel can reach the guide.
const demoBottomSpace = computed(() => Math.max(0, Math.ceil(demoViewport.value.height - props.focusInset - activeSectionHeight.value)))
const photoFrameStyle = computed(() => ({
  maxWidth: `${Math.max(80, demoViewport.value.bottom - props.focusInset - 80) * 4 / 3}px`
}))
let layoutRequestId = 0
let layoutRetry = null
function measureDemoOrigin(requestId, retries = 2) {
  if (requestId !== layoutRequestId || !props.active || contentLevel.value <= 0) return
  demoViewport.value = getOnboardingViewport()
  try {
    const query = uni.createSelectorQuery().in(componentScope)
    query.select('.demo-layout-origin').boundingClientRect()
    query.selectViewport().scrollOffset()
    query.exec(([origin, viewport]) => {
      if (requestId !== layoutRequestId || !props.active || contentLevel.value <= 0) return
      if (origin) demoOriginTop.value = origin.top + (viewport?.scrollTop || 0)
      else if (retries > 0) layoutRetry = setTimeout(() => measureDemoOrigin(requestId, retries - 1), 80)
    })
  } catch (_) {}
}
watch(() => contentLevel.value > 0, shown => {
  const requestId = ++layoutRequestId
  clearTimeout(layoutRetry)
  demoOriginTop.value = null
  if (shown) nextTick(() => measureDemoOrigin(requestId))
}, { immediate: true })
onBeforeUnmount(() => { layoutRequestId++; clearTimeout(layoutRetry) })

const items = ['旧纸箱', '金属茶罐', '玻璃瓶×2', '牛皮纸']
const advice = [
  { title: '投放建议', content: '纸箱压平；茶罐、玻璃瓶倒空并清洁。按当地分类规则投放可回收物。' },
  { title: '回收建议', content: '干净、完整的容器可优先重复使用；不再使用时将纸、金属、玻璃分别交给回收点。' },
  { title: '改造步骤', content: '将纸箱折叠成隔板，用牛皮纸包覆外侧；茶罐和玻璃瓶洗净晾干后作笔筒或小物盒。麻绳、布料仅作装饰辅材。' }
]
</script>

<style scoped>
.demo-layout-origin { height: 0; }
.demo-photo-frame { width: 100%; margin-left: auto; margin-right: auto; }
.onboarding-recognition-demo {
  padding: 32rpx;
  margin-bottom: 24rpx;
  border-radius: 24rpx;
  background: #fff;
  color: #1f2937;
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, .08);
  pointer-events: none;
  transition: opacity .32s ease, transform .32s ease;
}
.onboarding-recognition-demo:not(.exiting) { animation: demo-card-enter .48s cubic-bezier(.22, 1, .36, 1) both; }
.onboarding-recognition-demo.dark {
  padding: 40rpx;
  color: #e3f2f2;
  background: rgba(15, 15, 35, .95);
  border: 1px solid rgba(64, 224, 255, .3);
  box-shadow: 0 8rpx 32rpx rgba(64, 224, 255, .15);
}
.onboarding-recognition-demo.exiting { opacity: 0; transform: translateY(10rpx); }
.demo-heading { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; margin-bottom: 24rpx; }
.demo-title { font-size: 32rpx; font-weight: 700; }
.demo-label { flex: none; padding: 8rpx 16rpx; border-radius: 999rpx; color: #065f46; background: #d1fae5; font-size: 22rpx; font-weight: 700; }
.dark .demo-title { color: #40e0ff; }
.dark .demo-label { color: #b7fff1; background: rgba(78, 205, 196, .22); }
.demo-photo, .demo-after-photo { position: relative; width: 100%; height: 0; padding-bottom: 75%; overflow: hidden; border-radius: 16rpx; background: #dce8e3; }
.dark .demo-photo, .dark .demo-after-photo { background: #213d4a; border: 2rpx solid rgba(64, 224, 255, .3); }
.demo-image { position: absolute; inset: 0; width: 100%; height: 100%; }
.demo-scan-line { position: absolute; left: 4%; right: 4%; top: 0; height: 4rpx; background: #7fffc1; box-shadow: 0 0 24rpx #20d8ac; animation: demo-scan 2s ease-in-out infinite alternate; }
.demo-robot-row { display: flex; align-items: center; gap: 12rpx; min-height: 94rpx; }
.demo-robot { width: 110rpx; height: 90rpx; flex: none; }
.demo-robot-caption { color: #538274; font-size: 23rpx; }
.dark .demo-robot-caption { color: #8fe0df; }
.demo-section { display: flex; flex-direction: column; gap: 8rpx; margin-top: 14rpx; padding: 18rpx 20rpx; border-radius: 16rpx; border: 1rpx solid rgba(16, 185, 129, .16); background: rgba(236, 250, 244, .85); }
.dark .demo-section { border-color: rgba(64, 224, 255, .22); background: rgba(37, 79, 87, .28); }
.demo-section-title { color: #0f8f66; font-size: 23rpx; font-weight: 700; }
.dark .demo-section-title { color: #55ded5; }
.demo-section-body { font-size: 25rpx; line-height: 1.5; }
.demo-subtitle { margin-top: 8rpx; }
.demo-chips { display: flex; flex-wrap: wrap; gap: 8rpx; }
.demo-chip { padding: 6rpx 12rpx; border-radius: 999rpx; background: rgba(16, 185, 129, .12); font-size: 23rpx; }
.dark .demo-chip { background: rgba(64, 224, 255, .13); }
.demo-after-photo { margin-top: 8rpx; }
.demo-image-caption { color: #64748b; font-size: 21rpx; line-height: 1.4; }
.dark .demo-image-caption { color: #91a9ba; }
.demo-reveal { display: grid; grid-template-rows: 1fr; }
.demo-reveal-inner { min-height: 0; overflow: hidden; }
.demo-enter { animation: demo-enter .48s cubic-bezier(.22, 1, .36, 1) both; }
@keyframes demo-scan { from { top: 3%; } to { top: 95%; } }
@keyframes demo-card-enter { from { opacity: 0; transform: translateY(10rpx); } to { opacity: 1; transform: translateY(0); } }
@keyframes demo-enter { from { opacity: 0; transform: translateY(10rpx); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .demo-scan-line, .demo-reveal, .demo-enter, .onboarding-recognition-demo:not(.exiting) { animation: none; } .onboarding-recognition-demo { transition: none; } }
</style>
