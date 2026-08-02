<template>
  <view class="controls panel">
    <view class="button-rail">
      <view :class="['control-button', 'primary', { active: playing }]" @tap="$emit(playing ? 'pause' : 'play')">
        <view :class="playing ? 'icon-pause' : 'icon-play'"><i class="pause-bar"></i><i class="pause-bar"></i></view>
        <text>{{ playing ? '暂停' : currentIndex > 0 ? '继续' : '开始' }}</text>
      </view>
      <view class="control-button" @tap="$emit('reset')"><view class="icon-reset">↺</view><text>重置</text></view>
      <view class="control-button" @tap="$emit('previous')"><view class="icon-step previous"></view><text>上一事件</text></view>
      <view class="control-button" @tap="$emit('next')"><view class="icon-step next"></view><text>下一事件</text></view>
    </view>
    <view class="speed-control">
      <text class="control-label">播放速度</text>
      <view class="speed-options">
        <view v-for="value in speeds" :key="value" :class="['speed-button', { active: speed === value }]" @tap="$emit('speed', value)">{{ value }}×</view>
      </view>
    </view>
    <view class="progress-row">
      <text class="control-label">事件进度</text>
      <slider
        class="event-slider"
        :value="currentIndex"
        :min="0"
        :max="Math.max(0, total - 1)"
        :step="1"
        activeColor="#2c8fff"
        backgroundColor="rgba(105,157,187,.22)"
        block-color="#24d9ff"
        :block-size="15"
        @changing="$emit('seek', Number($event.detail.value))"
        @change="$emit('seek', Number($event.detail.value))"
      />
      <text class="progress-count">{{ currentIndex + 1 }}/{{ total }}</text>
      <view class="jump-control">
        <input v-model="jumpValue" class="jump-input" type="number" :min="1" :max="total" />
        <view class="jump-button" @tap="jump">跳转</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  currentIndex: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  playing: { type: Boolean, default: false },
  speed: { type: Number, default: 1 }
})
const emit = defineEmits(['play', 'pause', 'reset', 'previous', 'next', 'speed', 'seek'])
const speeds = [0.5, 1, 2, 4]
const jumpValue = ref(1)

watch(() => props.currentIndex, value => { jumpValue.value = value + 1 })
function jump() {
  const next = Math.max(1, Math.min(props.total || 1, Number(jumpValue.value) || 1))
  emit('seek', next - 1)
}
</script>

<style scoped>
.controls { padding: 10px 12px; display: grid; grid-template-columns: auto minmax(320px,1fr); gap: 9px 14px; align-items: center; }
.button-rail { display: flex; gap: 7px; }
.control-button { min-width: 72px; height: 44px; padding: 0 10px; border: 1px solid rgba(126,196,239,.24); border-radius: 9px; display: flex; align-items: center; justify-content: center; gap: 7px; color: #a9cada; background: rgba(12,42,62,.78); font-size: 11px; box-sizing: border-box; }
.control-button.primary { color: #fff; border-color: rgba(57,176,255,.8); background: linear-gradient(135deg, #1769c9, #2c8fff); }
.control-button:active { transform: translateY(1px); }
.icon-play { width: 0; height: 0; border-top: 7px solid transparent; border-bottom: 7px solid transparent; border-left: 11px solid currentColor; }
.icon-pause { display: flex; gap: 4px; }.pause-bar { display: block; width: 3px; height: 14px; border-radius: 1px; background: currentColor; }
.icon-reset { font-size: 20px; line-height: 1; }.icon-step { width: 14px; height: 14px; position: relative; }
.icon-step::before { content: ''; position: absolute; top: 2px; width: 0; height: 0; border-top: 5px solid transparent; border-bottom: 5px solid transparent; }
.icon-step::after { content: ''; position: absolute; top: 2px; width: 2px; height: 10px; background: currentColor; }
.icon-step.previous::before { left: 3px; border-right: 7px solid currentColor; }.icon-step.previous::after { left: 1px; }
.icon-step.next::before { right: 3px; border-left: 7px solid currentColor; }.icon-step.next::after { right: 1px; }
.speed-control { display: flex; align-items: center; gap: 10px; }.control-label { color: #83a9bc; font-size: 10px; white-space: nowrap; }
.speed-options { flex: 1; display: grid; grid-template-columns: repeat(4,1fr); gap: 6px; }
.speed-button { padding: 7px 10px; text-align: center; border: 1px solid rgba(126,196,239,.22); border-radius: 7px; color: #9dbfd0; background: rgba(12,42,62,.65); font-size: 11px; }
.speed-button.active { color: #fff; border-color: #2c8fff; background: linear-gradient(135deg, #1769c9, #2c8fff); }
.progress-row { grid-column: 1 / -1; display: flex; align-items: center; gap: 10px; padding-top: 7px; border-top: 1px solid rgba(116,197,255,.14); }
.event-slider { flex: 1; margin: 0; }.progress-count { min-width: 42px; color: #bcecff; font: 700 11px/1 ui-monospace, Consolas, monospace; }
.jump-control { display: flex; align-items: center; gap: 5px; }.jump-input { width: 54px; height: 28px; padding: 0 7px; border: 1px solid rgba(126,196,239,.28); border-radius: 6px; color: #dff7ff; background: rgba(5,27,43,.8); font-size: 11px; }
.jump-button { padding: 7px 10px; border-radius: 6px; color: #fff; background: #247ee5; font-size: 10px; }
@media (max-width: 1180px) { .controls { grid-template-columns: 1fr; }.progress-row { grid-column: 1; }.button-rail { min-width: 0; }.control-button { flex: 1; min-width: 0; }.speed-control { min-width: 0; } }
@media (max-width: 900px) { .button-rail { overflow-x: auto; }.control-button { flex: none; min-width: 72px; } }

/* #ifdef MP-WEIXIN */
.controls { display: flex; flex-direction: column; align-items: stretch; width: 100%; gap: 10px; overflow: visible; box-sizing: border-box; }
.button-rail { display: flex; flex-wrap: wrap; width: 100%; gap: 7px; overflow: visible; }
.control-button { flex: 1 1 140px; min-width: 0; height: 40px; padding: 0 6px; }
.control-button text { white-space: nowrap; }
.speed-control { display: flex; flex-direction: column; align-items: stretch; width: 100%; gap: 6px; }
.speed-options { display: flex; flex-wrap: wrap; width: 100%; gap: 6px; }
.speed-button { flex: 1 1 52px; min-width: 52px; box-sizing: border-box; }
.progress-row { display: flex; flex-wrap: wrap; align-items: center; width: 100%; gap: 7px; box-sizing: border-box; }
.event-slider { flex: 1 1 150px; min-width: 140px; }
.progress-count { flex: 0 0 auto; }
.jump-control { flex: 0 0 auto; margin-left: auto; }
.jump-input { box-sizing: border-box; }
/* #endif */
</style>
