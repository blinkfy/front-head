<template>
  <view class="walking-preview" :class="{ dark }">
    <view aria-live="polite">
      <view v-if="route.status === 'ready'" class="walking-summary">
        <view class="walking-metric">
          <text class="walking-metric-label">步行距离</text>
          <text class="walking-metric-value">{{ distance }}<text v-if="distanceUnit" class="walking-metric-unit">{{ distanceUnit }}</text></text>
        </view>
        <view class="walking-metric">
          <text class="walking-metric-label">预计用时</text>
          <text class="walking-metric-value">{{ minutes }}<text v-if="minutes !== '—'" class="walking-metric-unit">分钟</text></text>
        </view>
      </view>
      <view v-else class="walking-status">
        <view v-if="route.status === 'loading'" class="walking-spinner" aria-hidden="true" />
        <text v-else class="walking-status-icon" aria-hidden="true">i</text>
        <text>{{ route.status === 'loading' ? '正在规划步行路线…' : route.message }}</text>
      </view>
    </view>
    <button v-if="canLocate" class="walking-locate" @click="$emit('locate')">
      <view class="walking-locate-dot" aria-hidden="true" />
      <text>回到我的位置</text>
    </button>
    <view class="walking-actions">
      <button class="walking-action walking-action-primary" @click="$emit('navigate')">
        <text>打开地图导航</text><text class="walking-handoff-icon" aria-hidden="true">↗</text>
      </button>
      <button class="walking-action" @click="$emit('photo')">看照片</button>
      <button class="walking-action" @click="$emit('close')">返回</button>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({ route: { type: Object, required: true }, dark: Boolean, canLocate: Boolean })
defineEmits(['navigate', 'photo', 'close', 'locate'])

const meters = computed(() => Number(props.route.distanceMeters))
const distance = computed(() => {
  if (!(meters.value > 0)) return '—'
  return meters.value >= 1000 ? (meters.value / 1000).toFixed(1) : Math.round(meters.value)
})
const distanceUnit = computed(() => meters.value >= 1000 ? '公里' : meters.value > 0 ? '米' : '')
const minutes = computed(() => {
  const seconds = Number(props.route.durationSeconds)
  return seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : '—'
})
</script>

<style scoped>
.walking-preview {
  --route-surface: #eef4ff; --route-outline: #dbe7ff; --route-value: #194cc8;
  --route-muted: #4b5e7d; --route-secondary: #f5f7fa; --route-secondary-text: #344259;
  display: flex; flex-direction: column; gap: 18rpx;
}
.walking-preview.dark {
  --route-surface: #202f49; --route-outline: #304765; --route-value: #b4ceff;
  --route-muted: #b3c3dc; --route-secondary: #2a3850; --route-secondary-text: #e2ebf8;
}
.walking-summary, .walking-status {
  display: flex; align-items: center; border-radius: 22rpx;
  border: 1px solid var(--route-outline); background: var(--route-surface);
}
.walking-summary { padding: 18rpx 0; }
.walking-metric { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5rpx; padding: 0 22rpx; }
.walking-metric + .walking-metric { border-left: 1px solid var(--route-outline); }
.walking-metric-label { color: var(--route-muted); font-size: 13px; line-height: 1.3; }
.walking-metric-value { color: var(--route-value); font-size: 23px; line-height: 1.15; font-weight: 750; font-variant-numeric: tabular-nums; }
.walking-metric-unit { margin-left: 8rpx; font-size: 13px; font-weight: 600; }
.walking-status { gap: 14rpx; padding: 18rpx 20rpx; color: var(--route-muted); font-size: 14px; line-height: 1.4; }
.walking-status-icon, .walking-spinner { flex: 0 0 18px; height: 18px; box-sizing: border-box; border-radius: 50%; }
.walking-status-icon { text-align: center; line-height: 18px; font-size: 12px; font-weight: 700; color: var(--route-value); background: var(--route-outline); }
.walking-spinner { border: 2px solid var(--route-outline); border-top-color: var(--route-value); animation: walking-spin 800ms linear infinite; }
@keyframes walking-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .walking-spinner { animation: none; } }
.walking-locate {
  align-self: flex-start; display: inline-flex; align-items: center; gap: 8px;
  min-height: 32px; margin: -4px 0; padding: 0 12px; border-radius: 16px;
  background: var(--route-surface); color: var(--route-value); font-size: 13px; line-height: 1.25;
}
.walking-locate::after { border: 0; }
.walking-locate-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
.walking-actions { display: flex; gap: 12rpx; }
.walking-action {
  flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center;
  min-height: 44px; margin: 0; padding: 0 18rpx; border-radius: 18rpx;
  background: var(--route-secondary); color: var(--route-secondary-text); font-size: 14px; line-height: 1.25;
}
.walking-action::after { border: 0; }
.walking-action-primary { flex: 1; min-width: 0; gap: 10rpx; background: #2355d9; color: #fff; font-weight: 650; }
.walking-handoff-icon { font-size: 17px; line-height: 1; }
</style>
