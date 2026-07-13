<template>
  <view
    :class="['visitor-sprite', normalizedBehavior.toLowerCase(), { paused: !playing, mirrored: direction < 0, selected }]"
    :style="spriteStyle"
    :aria-label="`${visitorId} ${behaviorLabel}`"
  >
    <view class="visitor-ground-shadow" aria-hidden="true"></view>
    <view class="visitor-contact-shadow" aria-hidden="true"></view>
    <view class="visitor-selection-ring" aria-hidden="true"></view>
    <!-- #ifdef H5 -->
    <svg class="person-svg" viewBox="0 0 32 54" role="img" aria-hidden="true">
      <g class="person-root">
        <circle class="head" cx="16" cy="7" r="6" />
        <path class="body" d="M10 14 Q16 11 22 14 L23 32 Q16 35 9 32 Z" />
        <g class="arm arm-left"><path d="M10 16 L5 29" /></g>
        <g class="arm arm-right"><path d="M22 16 L27 29" /></g>
        <g class="leg leg-left"><path d="M13 31 L10 48" /></g>
        <g class="leg leg-right"><path d="M19 31 L22 48" /></g>
        <circle v-if="showFood" class="food" cx="27" cy="26" r="2.6" />
        <path v-if="showTrash" class="trash" d="M24 23 l5 1 -1 5 -5 -1 z" />
      </g>
    </svg>
    <!-- #endif -->
    <!-- #ifndef H5 -->
    <view class="person-fallback"><i></i><b></b><em></em><em></em></view>
    <!-- #endif -->
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  visitorId: { type: String, default: '' },
  behavior: { type: String, default: 'IDLE' },
  direction: { type: Number, default: 1 },
  playing: { type: Boolean, default: false },
  playbackRate: { type: Number, default: 1 },
  progress: { type: Number, default: 0 },
  selected: { type: Boolean, default: false },
  depthScale: { type: Number, default: 1 }
})

const BEHAVIOR_ALIASES = Object.freeze({
  DWELLING: 'IDLE', STANDING: 'IDLE', GATHERING: 'WALKING', CROWDING: 'WALKING',
  WALK: 'WALKING', MOVE: 'WALKING', EXITING: 'LEAVING'
})
const BEHAVIOR_LABELS = Object.freeze({
  WALKING: '行走', IDLE: '停留', EATING: '用餐', DISPOSING: '投放', LITTERING: '遗落', LEAVING: '离开'
})

const normalizedBehavior = computed(() => {
  const key = String(props.behavior || 'IDLE').toUpperCase()
  return BEHAVIOR_ALIASES[key] || (BEHAVIOR_LABELS[key] ? key : 'IDLE')
})
const behaviorLabel = computed(() => BEHAVIOR_LABELS[normalizedBehavior.value])
const showFood = computed(() => normalizedBehavior.value === 'EATING')
const showTrash = computed(() => ['DISPOSING', 'LITTERING'].includes(normalizedBehavior.value) && Number(props.progress) < .7)
const spriteStyle = computed(() => ({
  '--motion-duration': `${.72 / Math.max(.25, Number(props.playbackRate) || 1)}s`,
  '--visitor-depth-scale': String(Math.max(.96, Math.min(1.04, Number(props.depthScale) || 1))),
  '--action-progress': String(Math.max(0, Math.min(1, Number(props.progress) || 0))),
  '--dispose-arm-angle': `${-18 - Math.max(0, Math.min(1, Number(props.progress) || 0)) * 62}deg`,
  '--litter-arm-angle': `${8 + Math.max(0, Math.min(1, Number(props.progress) || 0)) * 34}deg`
}))
</script>

<style scoped>
.visitor-sprite { position:relative; width:24px; height:41px; transform:scale(var(--visitor-depth-scale)); transform-origin:50% 100%; }
.person-svg { position:relative; z-index:2; width:100%; height:100%; overflow:visible; transform-origin:50% 100%; transition:transform .18s ease; filter:drop-shadow(1px 3px 2px rgba(0,12,23,.4)); }
.visitor-sprite.mirrored .person-svg { transform:scaleX(-1); }
.visitor-ground-shadow { position:absolute; z-index:0; left:50%; bottom:-1px; width:17px; height:6px; transform:translate(-22%,4px) skewX(-18deg); clip-path:polygon(0 48%,14% 18%,45% 6%,100% 39%,84% 78%,48% 96%,8% 74%); border-radius:44% 28% 50% 32%; background:radial-gradient(ellipse at 32% 40%,rgba(0,12,20,.28),rgba(0,12,20,.11) 58%,transparent 82%); filter:blur(2.2px); pointer-events:none; }
.visitor-contact-shadow { position:absolute; z-index:1; left:50%; bottom:-1px; width:9px; height:3px; transform:translateX(-50%); border-radius:50%; background:radial-gradient(ellipse,rgba(0,10,17,.43),rgba(0,10,17,.12) 68%,transparent 84%); filter:blur(.8px); pointer-events:none; }
.visitor-selection-ring { position:absolute; z-index:1; left:50%; bottom:-4px; width:22px; height:7px; transform:translateX(-50%) skewX(-18deg); border:1px solid transparent; border-radius:50%; box-sizing:border-box; }
.visitor-sprite.selected .visitor-selection-ring { border-color:#b7f6ff; box-shadow:0 0 0 1px rgba(36,217,255,.65),0 0 9px rgba(36,217,255,.5); }
.head { fill: #ffd1ad; stroke: #12283a; stroke-width: 1.3; }
.body { fill: #6963dc; stroke: #dff8ff; stroke-width: 1.1; }
.arm,.leg { transform-box: fill-box; transform-origin: top center; }
.arm path,.leg path { fill: none; stroke: #dff8ff; stroke-width: 4.2; stroke-linecap: round; }
.leg path { stroke: #31465f; }
.food { fill: #ffbf52; stroke: #fff1c9; stroke-width: 1; }
.trash { fill: #f5b648; stroke: #fff; stroke-width: .8; }
.walking .person-root,.leaving .person-root { animation: body-bob var(--motion-duration) ease-in-out infinite; }
.walking .arm-left,.leaving .arm-left { animation: limb-forward var(--motion-duration) ease-in-out infinite; }
.walking .arm-right,.leaving .arm-right { animation: limb-back var(--motion-duration) ease-in-out infinite; }
.walking .leg-left,.leaving .leg-left { animation: limb-back var(--motion-duration) ease-in-out infinite; }
.walking .leg-right,.leaving .leg-right { animation: limb-forward var(--motion-duration) ease-in-out infinite; }
.idle .person-root { animation: idle-breathe calc(var(--motion-duration) * 2.2) ease-in-out infinite; }
.eating .arm-right { transform: rotate(-55deg); animation: eat-hand calc(var(--motion-duration) * 1.4) ease-in-out infinite; }
.disposing .arm-right { transform: rotate(var(--dispose-arm-angle)); }
.littering .arm-right { transform: rotate(var(--litter-arm-angle)); }
.leaving { opacity: calc(1 - var(--action-progress) * .28); }
.paused * { animation-play-state: paused !important; }
@keyframes body-bob { 50% { transform: translateY(-1.8px) rotate(1.2deg); } }
@keyframes limb-forward { 0%,100% { transform: rotate(24deg); } 50% { transform: rotate(-25deg); } }
@keyframes limb-back { 0%,100% { transform: rotate(-25deg); } 50% { transform: rotate(24deg); } }
@keyframes idle-breathe { 50% { transform: scaleY(.97) translateY(1px); } }
@keyframes eat-hand { 50% { transform: rotate(-72deg) translateY(-1px); } }
.person-fallback { position: relative; width: 18px; height: 34px; }.person-fallback i { position:absolute;left:5px;top:0;width:8px;height:8px;border-radius:50%;background:#ffd1ad }.person-fallback b { position:absolute;left:3px;top:8px;width:12px;height:17px;border-radius:4px;background:#6963dc }.person-fallback em { position:absolute;left:5px;top:23px;width:3px;height:11px;background:#31465f }.person-fallback em:last-child { left:11px }
</style>
