<template>
  <view class="timeline-panel panel">
    <view class="panel-head">
      <view>
        <view class="panel-title">事件时间线</view>
        <view class="panel-sub">{{ liveWindow ? `实时窗口 · 仅保留最近 ${events.length} 条` : `按 sequence 顺序播放 · 共 ${events.length} 条` }}</view>
      </view>
      <view class="counter">{{ currentIndex + 1 }}/{{ events.length }}</view>
    </view>
    <scroll-view
      class="timeline-list"
      scroll-y
      :scroll-into-view="`park-event-${currentIndex}`"
      :scroll-with-animation="!liveWindow"
    >
      <view
        v-for="(event, index) in events"
        :id="`park-event-${index}`"
        :key="event.sequence"
        :class="['event-row', { active: index === currentIndex, passed: index < currentIndex }]"
        @tap="$emit('select', index)"
      >
        <view class="event-sequence">{{ String(liveWindow ? index + 1 : event.sequence).padStart(2, '0') }}</view>
        <view :class="['event-dot', presentation(event).tone]"></view>
        <view class="event-copy">
          <view class="event-title">{{ presentation(event).title }}</view>
          <view class="event-desc">{{ presentation(event).desc }}</view>
        </view>
        <text :data-source="event.source" :class="['source-tag', sourceClass(event.source)]">{{ displaySourceLabel(event.source) }}</text>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { eventPresentation } from '@/utils/park-replay.js'
import { displaySourceLabel } from '@/utils/source-display.js'

defineProps({
  events: { type: Array, default: () => [] },
  currentIndex: { type: Number, default: 0 },
  liveWindow: { type: Boolean, default: false }
})
defineEmits(['select'])

const presentation = eventPresentation
const sourceClass = value => String(value || '').toLowerCase().replace(/_/g, '-')
</script>

<style scoped>
.timeline-panel { min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.panel-head { padding: 13px 14px 11px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(116,197,255,.18); }
.panel-title { color: #e8f8ff; font-size: 15px; font-weight: 700; letter-spacing: .5px; }
.panel-sub { color: #789fb4; font-size: 11px; margin-top: 3px; }
.counter { color: #7ee8ff; font-size: 13px; font-weight: 700; }
.timeline-list { flex: 1; min-height: 0; }
.event-row { min-height: 58px; padding: 8px 10px; box-sizing: border-box; display: grid; grid-template-columns: 28px 8px minmax(0,1fr) auto; align-items: center; gap: 8px; border-bottom: 1px solid rgba(116,197,255,.1); transition: background .18s ease, border-color .18s ease; }
.event-row:hover { background: rgba(39,126,195,.12); }
.event-row.active { background: linear-gradient(90deg, rgba(36,143,255,.28), rgba(36,217,255,.08)); box-shadow: inset 3px 0 #24d9ff; }
.event-row.passed:not(.active) { opacity: .72; }
.event-sequence { color: #92b7ca; font: 700 12px/1 ui-monospace, SFMono-Regular, Consolas, monospace; }
.event-dot { width: 7px; height: 7px; border-radius: 50%; background: #2c8fff; box-shadow: 0 0 8px currentColor; }
.event-dot.cyan { background: #24d9ff; }.event-dot.green { background: #16c57c; }.event-dot.amber { background: #f5b648; }.event-dot.red { background: #ff5d66; }
.event-copy { min-width: 0; }
.event-title { color: #dff5ff; font-size: 13px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.event-desc { color: #779bae; font-size: 11px; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.source-tag { padding: 2px 5px; border-radius: 4px; border: 1px solid rgba(100,174,226,.34); color: #8ec8eb; background: rgba(22,91,144,.24); font: 700 10px/1.2 ui-monospace, Consolas, monospace; }
.source-tag.isaac-realtime { color: #c1a7ff; border-color: rgba(154,113,255,.45); background: rgba(95,54,151,.28); }
.source-tag.backend-api { color: #8af1be; border-color: rgba(50,202,124,.42); background: rgba(31,123,78,.28); }
.source-tag.visual-aid { color: #ffd57c; border-color: rgba(245,182,72,.44); background: rgba(132,87,16,.28); }
.timeline-list :deep(.uni-scroll-view) { scrollbar-width: thin; scrollbar-color: rgba(65,158,215,.7) rgba(5,29,46,.75); }
.timeline-list :deep(.uni-scroll-view)::-webkit-scrollbar { width: 5px; }
.timeline-list :deep(.uni-scroll-view)::-webkit-scrollbar-track { border-radius: 99px; background: rgba(5,29,46,.75); }
.timeline-list :deep(.uni-scroll-view)::-webkit-scrollbar-thumb { border-radius: 99px; background: rgba(65,158,215,.7); }
.timeline-list :deep(.uni-scroll-view)::-webkit-scrollbar-button { display: none; width: 0; height: 0; }

/* #ifdef MP-WEIXIN */
.timeline-panel { height: 100%; min-height: 0; overflow: hidden; }
.panel-head { flex: 0 0 auto; padding: 10px 12px 9px; gap: 8px; }
.panel-head > view { flex: 1; min-width: 0; }
.panel-sub { white-space: normal; line-height: 1.35; }
.counter { flex: 0 0 auto; }
.timeline-list { flex: 1; height: 0; min-height: 0; overflow: hidden; }
.event-row { display: flex; align-items: center; width: 100%; min-height: 58px; gap: 8px; }
.event-sequence { flex: 0 0 28px; }
.event-dot { flex: 0 0 7px; }
.event-copy { flex: 1; min-width: 0; }
.event-title,
.event-desc { white-space: normal; overflow: visible; text-overflow: clip; line-height: 1.35; }
.source-tag { flex: 0 0 auto; max-width: 76px; white-space: normal; word-break: break-word; text-align: center; }
/* #endif */
</style>
