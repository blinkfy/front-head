<template>
  <view v-if="visible && guide" class="waste-overlay" :class="{ dark }" @click="emit('close')" @touchmove.stop.prevent>
    <view class="waste-dialog" :style="{ '--category-color': guide.color, '--category-text': dark ? guide.darkColor : guide.color, '--category-soft': guide.soft, '--button-soft': dark ? guide.darkButtonSoft : guide.buttonSoft }" role="dialog" aria-modal="true" :aria-label="guide.title" @click.stop>
      <view class="waste-header">
        <view class="bin-icon"><ManifestIcon :id="guide.icon" :scale="1" /></view>
        <view class="heading-copy"><text class="waste-title">{{ guide.title }}</text><text class="definition">{{ guide.definition }}</text></view>
        <button class="close-button" aria-label="关闭分类详情" @click="emit('close')">×</button>
      </view>
      <view v-if="imageFailed" class="legacy-description"><text>{{ dark ? guide.legacyDarkDescription : guide.legacyDescription }}</text></view>
      <scroll-view v-else class="waste-body" scroll-y @touchmove.stop>
        <view class="examples-heading"><text>常见物品示例</text><text class="swipe-hint">可横滑</text></view>
        <scroll-view :key="category" class="examples-scroll" scroll-x :scroll-left="scrollPosition" :show-scrollbar="false" @scroll="onExampleScroll" @touchstart="pauseScroll" @touchend="resumeScroll" @touchcancel="resumeScroll" @touchmove.stop @mousedown="pauseScroll" @mouseup="resumeScroll" @mouseleave="resumeScroll" @wheel="pauseThenResume">
          <view class="example-track">
            <view v-for="copy in 2" :key="copy" class="example-set" :aria-hidden="copy === 2">
              <view v-for="item in guide.examples" :key="item.file" class="example-item">
                <view class="example-picture"><image :src="exampleUrl(item.file)" mode="aspectFit" lazy-load @error="onImageError" /></view>
                <text class="example-name">{{ item.name }}</text>
              </view>
            </view>
          </view>
        </scroll-view>
        <view class="info-cards">
          <view class="info-card reminders"><text class="info-title">常见投放提醒</text><view v-for="tip in guide.tips" :key="tip" class="tip-row"><text class="check">✓</text><text>{{ tip }}</text></view></view>
          <view class="info-card confusions"><text class="info-title">易混淆示例</text><view v-for="item in guide.confusions" :key="item[0]" class="confusion-row"><text class="confusion-name">{{ item[0] }}</text><text class="confusion-note">{{ item[1] }}</text></view></view>
        </view>
        <text class="local-note">具体投放要求以当地分类标准为准</text>
      </scroll-view>
      <view class="waste-footer"><button class="primary-button" @click="emit('close')">我知道了</button></view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref, watch, nextTick, getCurrentInstance, onBeforeUnmount } from 'vue'
import { onHide, onShow } from '@dcloudio/uni-app'
import ManifestIcon from './ManifestIcon.vue'
import { baseUrl } from '@/api/settings'
import { wasteCategoryGuides } from '@/utils/waste-category-guides'
const props = defineProps({ visible: Boolean, category: { type: String, default: '' }, dark: Boolean })
const emit = defineEmits(['close'])
const guide = computed(() => wasteCategoryGuides[props.category])
const imageFailed = ref(false)
const scrollPosition = ref(0)
const owner = getCurrentInstance()
let cycleWidth = 0, observedScroll = 0, loopTimer = null, resumeTimer = null
let version = 0, pageActive = true, touching = false
let measureTimer = null
function stopScroll() {
  clearInterval(loopTimer)
  clearTimeout(resumeTimer)
  loopTimer = resumeTimer = null
}
function startScroll() {
  if (loopTimer || !props.visible || imageFailed.value || !pageActive || touching || !cycleWidth) return
  loopTimer = setInterval(() => {
    const next = observedScroll + 1.6
    observedScroll = next >= cycleWidth ? next - cycleWidth : next
    scrollPosition.value = observedScroll
  }, 80)
}
function pauseScroll() { touching = true; stopScroll() }
function resumeScroll() {
  touching = false
  clearTimeout(resumeTimer)
  if (props.visible && !imageFailed.value && pageActive) resumeTimer = setTimeout(() => { resumeTimer = null; startScroll() }, 2500)
}
function pauseThenResume() { pauseScroll(); resumeScroll() }
function onExampleScroll(event) {
  if (touching || resumeTimer || !loopTimer) observedScroll = event.detail.scrollLeft
}
function onImageError() { imageFailed.value = true; clearMeasurement(); stopScroll() }
function clearMeasurement() { clearTimeout(measureTimer); measureTimer = null }
function measureCycle(current) {
  clearMeasurement()
  // 入场缩放结束后再测量，确保循环距离不含动画中的临时缩放。
  measureTimer = setTimeout(() => {
    measureTimer = null
    if (current !== version || !props.visible || imageFailed.value || !pageActive) return
    uni.createSelectorQuery().in(owner.proxy).select('.example-set').boundingClientRect(rect => {
      if (current !== version || !props.visible || imageFailed.value) return
      cycleWidth = rect?.width || 0
      startScroll()
    }).exec()
  }, 480)
}
watch(() => [props.visible, props.category], async () => {
  const current = ++version
  clearMeasurement()
  stopScroll()
  imageFailed.value = false
  touching = false
  cycleWidth = observedScroll = scrollPosition.value = 0
  if (!props.visible) return
  await nextTick()
  if (current !== version || imageFailed.value) return
  measureCycle(current)
}, { immediate: true })
onHide(() => { pageActive = false; clearMeasurement(); stopScroll() })
onShow(() => {
  pageActive = true
  if (props.visible && !imageFailed.value && !cycleWidth) measureCycle(version)
  else startScroll()
})
onBeforeUnmount(() => { version++; clearMeasurement(); stopScroll() })
const exampleUrl = file => {
  // #ifdef APP-PLUS
  return `/static/app/waste-examples/${file}`
  // #endif
  return `${baseUrl.replace(/\/$/, '')}/waste_examples/${file}`
}
</script>

<style scoped>
.waste-overlay { position: fixed; inset: 0; z-index: 10020; display: flex; align-items: center; justify-content: center; padding: 28rpx; box-sizing: border-box; background: rgba(28, 49, 57, .42); backdrop-filter: blur(7px); -webkit-backdrop-filter: blur(7px); }
.waste-dialog { width: 100%; max-width: 880rpx; max-height: 88vh; display: flex; flex-direction: column; border-radius: 36rpx; overflow: hidden; color: #273b4b; background: #fff; box-shadow: 0 24rpx 80rpx rgba(15, 35, 42, .22); }
.waste-header { position: relative; display: flex; align-items: center; padding: 30rpx 76rpx 26rpx 26rpx; background: linear-gradient(125deg, #fff, var(--category-soft)); flex-shrink: 0; }
.bin-icon { font-size: 116rpx; width: 120rpx; height: 120rpx; flex-shrink: 0; display: flex; align-items: center; justify-content: center; margin-right: 20rpx; }
.heading-copy { min-width: 0; }
.waste-title { display: block; font-size: 38rpx; font-weight: 800; color: var(--category-text); margin-bottom: 10rpx; }
.definition { display: block; font-size: 25rpx; line-height: 1.55; color: #657585; }
.close-button { position: absolute; top: 18rpx; right: 18rpx; width: 58rpx; height: 58rpx; padding: 0; border-radius: 50%; line-height: 54rpx; font-size: 42rpx; background: rgba(100, 130, 140, .1); color: #607580; }
.close-button::after, .primary-button::after { border: 0; }
.waste-body { min-height: 0; max-height: 58vh; }
.examples-heading { display: flex; justify-content: space-between; align-items: center; padding: 24rpx 26rpx 18rpx; font-size: 29rpx; font-weight: 700; }
.swipe-hint { font-size: 21rpx; font-weight: 400; color: #82909b; }
.examples-scroll { width: calc(100% - 52rpx); margin: 0 26rpx; }
.example-track { display: flex; width: 100%; }
.example-set { display: flex; width: 300%; flex-shrink: 0; }
.example-item { display: inline-flex; flex-direction: column; vertical-align: top; width: calc(100% / 12); flex-shrink: 0; box-sizing: border-box; padding-right: 12rpx; padding-bottom: 6rpx; }
.example-picture { height: 116rpx; border-radius: 22rpx; background: var(--category-soft); display: flex; align-items: center; justify-content: center; overflow: hidden; }
.example-picture image { width: 100%; height: 100%; }
.example-name { font-size: 23rpx; text-align: center; white-space: normal; line-height: 1.4; margin-top: 10rpx; }
.legacy-description { padding: 30rpx; font-size: 28rpx; line-height: 1.9; color: #526575; max-height: 55vh; overflow-y: auto; }
.dark .legacy-description { color: #c8d6e2; }
.image-fallback { padding: 8rpx; font-size: 22rpx; text-align: center; white-space: normal; line-height: 1.3; color: var(--category-color); }
.fallback-note { display: block; font-size: 18rpx; margin-top: 5rpx; }
.info-cards { display: flex; align-items: stretch; gap: 16rpx; margin: 22rpx 26rpx 0; }
.info-card { flex: 1; min-width: 0; min-height: 248rpx; box-sizing: border-box; border-radius: 24rpx; padding: 22rpx 18rpx; }
.reminders { background: var(--category-soft); }
.confusions { background: #fbf3f4; }
.info-title { display: block; font-size: 26rpx; font-weight: 700; line-height: 1.4; margin-bottom: 18rpx; color: var(--category-text); }
.confusions .info-title { color: #a96471; }
.tip-row { display: flex; gap: 10rpx; font-size: 24rpx; line-height: 1.6; margin-top: 12rpx; }
.check { flex-shrink: 0; font-weight: 700; color: var(--category-color); }
.confusion-row { margin-top: 14rpx; }
.confusion-name { display: block; font-size: 24rpx; line-height: 1.5; }
.confusion-note { display: block; font-size: 22rpx; line-height: 1.5; color: #7e8792; margin-top: 3rpx; }
.local-note { display: block; margin: 18rpx 26rpx 10rpx; color: #87949e; font-size: 20rpx; text-align: center; }
.waste-footer { padding: 18rpx 26rpx 26rpx; flex-shrink: 0; }
.primary-button { border-radius: 50rpx; background: var(--button-soft); color: var(--category-text); font-size: 30rpx; font-weight: 700; line-height: 84rpx; padding: 0; }
.dark.waste-overlay { background: rgba(4, 12, 21, .58); }
.dark .waste-dialog { background: #182634; color: #e5edf3; }
.dark .waste-header { background: #203343; }
.dark .confusions .info-title { color: #ffafb6; }
.dark .definition, .dark .swipe-hint, .dark .confusion-note, .dark .local-note { color: #adbdca; }
.dark .reminders, .dark .example-picture { background: #263c4b; }
.dark .confusions { background: #382e39; }
.dark .close-button { color: #d8e3ec; background: #344b5d; }
.dark .image-fallback { color: #dcecf7; }
@media (max-height: 600px) { .waste-body { max-height: 48vh; } .waste-header { padding-top: 20rpx; padding-bottom: 18rpx; } }

/* 每次挂载弹窗重新播放入场；只作用于视觉，不延迟打开和关闭事件。 */
.waste-overlay { animation: waste-mask-in 220ms ease-out both; }
.waste-dialog { transform-origin: center 58%; animation: waste-dialog-in 380ms cubic-bezier(.22, .8, .3, 1) both; }
.bin-icon { animation: waste-bin-in 480ms cubic-bezier(.22, .8, .3, 1) 60ms both; }
.heading-copy { animation: waste-content-in 320ms ease-out 70ms both; }
.waste-body, .legacy-description { animation: waste-content-in 340ms ease-out 110ms both; }
.waste-footer { animation: waste-content-in 320ms ease-out 160ms both; }
@keyframes waste-mask-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes waste-dialog-in {
  0% { opacity: 0; transform: translateY(30rpx) scale(.94); }
  72% { opacity: 1; transform: translateY(-3rpx) scale(1.008); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes waste-bin-in {
  0% { opacity: 0; transform: scale(.82) rotate(-5deg); }
  65% { opacity: 1; transform: scale(1.04) rotate(2deg); }
  100% { opacity: 1; transform: scale(1) rotate(0); }
}
@keyframes waste-content-in { from { opacity: 0; transform: translateY(12rpx); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) {
  .waste-overlay, .waste-dialog, .bin-icon, .heading-copy, .waste-body, .legacy-description, .waste-footer { animation: none; }
}
</style>
