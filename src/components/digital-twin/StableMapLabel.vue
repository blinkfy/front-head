<template>
  <view
    :class="['stable-map-label', placement, tone, { selected, current, aggregate }]"
    data-map-label="true"
    :data-label-id="labelId"
    :data-label-priority="priority"
    :data-label-suppressed="suppressed ? 'true' : 'false'"
  >
    <i class="label-leader"></i>
    <text>{{ text }}</text>
    <small v-if="detail">{{ detail }}</small>
  </view>
</template>

<script setup>
defineProps({
  labelId: { type: String, required: true },
  text: { type: String, default: '' },
  detail: { type: String, default: '' },
  priority: { type: Number, default: 30 },
  placement: { type: String, default: 'above' },
  tone: { type: String, default: 'neutral' },
  selected: { type: Boolean, default: false },
  current: { type: Boolean, default: false },
  aggregate: { type: Boolean, default: false },
  suppressed: { type: Boolean, default: false }
})
</script>

<style scoped>
.stable-map-label {
  --avoid-x: 0px; --avoid-y: 0px; --label-visible: 1;
  --leader-display: none; --leader-length: 0px; --leader-angle: 0deg;
  position: absolute; z-index: 12; min-width: max-content; max-width: 132px;
  padding: 3px 6px; box-sizing: border-box; border: 1px solid rgba(130,199,231,.22);
  border-radius: 5px; color: #e9f9ff; background: rgba(2,20,33,.88);
  box-shadow: 0 3px 10px rgba(0,10,18,.3); opacity: var(--label-visible);
  visibility: var(--label-visibility, visible); pointer-events: none; white-space: nowrap;
  transition: opacity .12s ease; text-align: center;
}
.stable-map-label.above { left: 50%; bottom: calc(100% + 7px); transform: translate(-50%,0) translate(var(--avoid-x),var(--avoid-y)); }
.stable-map-label.below { left: 50%; top: calc(100% + 7px); transform: translate(-50%,0) translate(var(--avoid-x),var(--avoid-y)); }
.stable-map-label.right { left: calc(100% + 6px); top: -6px; transform: translate(0,0) translate(var(--avoid-x),var(--avoid-y)); }
.stable-map-label.left { right: calc(100% + 6px); top: -6px; transform: translate(0,0) translate(var(--avoid-x),var(--avoid-y)); }
.stable-map-label text,.stable-map-label small { position: relative; z-index: 2; display: block; overflow: hidden; text-overflow: ellipsis; }
.stable-map-label text { font-size: 10px; font-weight: 700; }.stable-map-label small { margin-top: 2px; color: #86afc2; font: 8px/1.2 ui-monospace,Consolas,monospace; }
.stable-map-label.green { border-color: rgba(62,211,145,.36); background: rgba(11,87,59,.9); }.stable-map-label.amber { border-color: rgba(245,182,72,.46); background: rgba(116,70,13,.92); }.stable-map-label.cyan { border-color: rgba(36,217,255,.42); background: rgba(8,91,119,.92); }.stable-map-label.red { border-color: rgba(255,93,102,.52); background: rgba(126,35,42,.94); }
.stable-map-label.aggregate { color: #fff5d2; border-color: rgba(245,182,72,.5); background: rgba(108,66,10,.92); }
.stable-map-label.selected { border-color: #fff; box-shadow: 0 0 0 1px #24d9ff,0 0 14px rgba(36,217,255,.5); }.stable-map-label.current { border-color: #f5b648; }
.label-leader { display: var(--leader-display); position: absolute; z-index: 0; left: 50%; top: 50%; width: var(--leader-length); height: 1px; transform-origin: 0 50%; transform: rotate(var(--leader-angle)); background: rgba(205,238,250,.58); }
@media (max-width: 900px) { .stable-map-label { padding: 2px 4px; max-width: 104px; }.stable-map-label small { display: none; } }
</style>
