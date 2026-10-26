<template>
  <view v-if="category || itemNames.length || disposalAdvice || sections.length" class="recognition-preview" :class="{ dark }">
    <text class="preview-caption">识别分析中 · 内容可能继续更新</text>
    <view v-if="category" class="preview-block" key="category">
      <text class="preview-label">垃圾类别</text>
      <text class="preview-value">{{ category }}</text>
    </view>
    <view v-if="itemNames.length" class="preview-block" key="items">
      <text class="preview-label">识别到的物品</text>
      <text class="preview-value">{{ itemNames.join('、') }}</text>
    </view>
    <view v-if="disposalAdvice" class="preview-block" key="disposal">
      <text class="preview-label">投放建议</text>
      <text class="preview-value">{{ disposalAdvice }}</text>
    </view>
    <view v-for="section in sections" :key="section.title" class="preview-block">
      <text class="preview-label">{{ section.title }}</text>
      <text class="preview-value">{{ section.content }}</text>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { splitUpcyclingSections } from '@/utils/recognition-sync'

const props = defineProps({ preview: { type: Object, default: () => ({}) }, dark: Boolean })
const insights = computed(() => props.preview?.aiInsights || {})
const category = computed(() => String(props.preview?.labels?.[0]?.name || '').trim())
const itemNames = computed(() => (Array.isArray(insights.value.items) ? insights.value.items : [])
  .map(item => String(item?.name || '').trim()).filter(Boolean).slice(0, 6))
const disposalAdvice = computed(() => String(insights.value.disposalAdvice || '').trim())
const sections = computed(() => {
  const text = String(insights.value.expandedUpcycling || insights.value.upcyclingSuggestion || '').trim()
  return text ? splitUpcyclingSections(text) : []
})
</script>

<style scoped>
.recognition-preview { display: flex; flex-direction: column; gap: 12rpx; margin-top: 12rpx; }
.preview-caption { color: #64748b; font-size: 22rpx; margin-bottom: 2rpx; }
.preview-block {
  display: flex; flex-direction: column; gap: 8rpx; padding: 18rpx 20rpx;
  border: 1rpx solid rgba(16, 185, 129, .16); border-radius: 16rpx;
  background: rgba(236, 250, 244, .85); animation: preview-enter .3s ease both;
}
.preview-label { font-size: 22rpx; font-weight: 700; color: #0f8f66; }
.preview-value { font-size: 25rpx; line-height: 1.55; white-space: pre-wrap; color: #233047; }
.dark .preview-caption { color: #91a9ba; }
.dark .preview-block { background: rgba(37, 79, 87, .28); border-color: rgba(64, 224, 255, .22); }
.dark .preview-label { color: #55ded5; }
.dark .preview-value { color: #e3f2f2; }
@keyframes preview-enter { from { opacity: .9; transform: translateY(10rpx); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .preview-block { animation: none; } }
</style>
