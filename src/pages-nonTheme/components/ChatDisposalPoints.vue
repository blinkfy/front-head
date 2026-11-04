<template>
  <view v-if="points.length" class="chat-disposal-points">
    <text class="disposal-heading">{{ points.some(point => point.reportReason !== undefined) ? '请选择要反馈的投放点' : '本次回答提到的投放点' }}</text>
    <view v-for="point in points" :key="point.id" class="disposal-card">
      <view class="disposal-topline">
        <text class="disposal-name">{{ point.name }}</text>
        <text v-if="point.distanceMeters != null" class="disposal-distance">约 {{ formatDisposalDistance(point.distanceMeters) }}</text>
      </view>
      <text v-if="point.description" class="disposal-description">{{ point.description }}</text>
      <view class="disposal-actions">
        <button class="disposal-action" size="mini" :disabled="!!busyId" @tap.stop="$emit('open', point, 'map')">{{ busyId === point.id ? '正在确认…' : '查看地图详情' }}</button>
        <button v-if="point.reportReason === undefined" class="disposal-action disposal-route" size="mini" :disabled="!!busyId" @tap.stop="$emit('open', point, 'route')">规划路线</button>
        <button class="disposal-action" :class="{ 'disposal-route': point.reportReason !== undefined }" size="mini" :disabled="!!busyId" @tap.stop="$emit('open', point, 'report')">{{ point.reportReason !== undefined ? '填写反馈' : '反馈问题' }}</button>
      </view>
    </view>
    <text class="disposal-note">点位为当次推荐记录，距离为当时估算直线距离。点击后确认最新点位；是否开放及可投类别以现场为准。</text>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { normalizeChatDisposalPoints } from '../utils/ai-chat-disposal.mjs'
import { formatDisposalDistance } from '../../utils/nearby-disposal.mjs'

const props = defineProps({ value: { type: Array, default: () => [] }, busyId: { type: String, default: '' } })
defineEmits(['open'])
const points = computed(() => normalizeChatDisposalPoints(props.value))
</script>

<style scoped>
.chat-disposal-points { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border-light, #e5e7eb); }
.disposal-heading { display: block; font-size: 12px; color: var(--text-secondary, #6b7280); margin-bottom: 8px; }
.disposal-card { padding: 12px; margin-top: 8px; border: 1px solid var(--border-light, #e5e7eb); border-radius: 12px; background: var(--bg-secondary, #f7f8fa); }
.disposal-topline { display: flex; align-items: flex-start; gap: 8px; }
.disposal-name { flex: 1; min-width: 0; overflow-wrap: anywhere; font-size: 14px; line-height: 1.5; color: var(--text-primary, #1f2937); font-weight: 600; }
.disposal-distance { flex-shrink: 0; font-size: 11px; line-height: 1.8; color: var(--text-secondary, #6b7280); }
.disposal-description { display: block; margin-top: 5px; font-size: 12px; line-height: 1.6; color: var(--text-secondary, #6b7280); overflow-wrap: anywhere; }
.disposal-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.disposal-action { margin: 0; padding: 0 12px; font-size: 12px; line-height: 32px; color: var(--accent, #4d6bfe); background: var(--bg-primary, #fff); border: 1px solid var(--border-light, #e5e7eb); border-radius: 8px; }
.disposal-action::after { border: 0; }
.disposal-route { color: #fff; background: var(--accent, #4d6bfe); border-color: var(--accent, #4d6bfe); }
.disposal-note { display: block; margin-top: 9px; color: var(--text-tertiary, #71717a); font-size: 11px; line-height: 1.6; }
/* #ifdef H5 */
.disposal-action:focus-visible { outline: 2px solid var(--accent, #4d6bfe); outline-offset: 3px; }
/* #endif */
</style>
