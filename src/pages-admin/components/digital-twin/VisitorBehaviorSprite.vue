<template>
  <view
    :class="['visitor-sprite', variantClass, normalizedBehavior.toLowerCase(), { paused: !playing, mirrored: direction < 0, selected }]"
    :style="spriteStyle"
    :aria-label="`${visitorId} ${behaviorLabel}`"
  >
    <view class="visitor-ground-shadow" aria-hidden="true"></view>
    <view class="visitor-contact-shadow" aria-hidden="true"></view>
    <view class="visitor-selection-ring" aria-hidden="true"></view>
    <!-- #ifdef H5 -->
    <svg class="person-svg" viewBox="0 0 32 54" role="img" aria-hidden="true">
      <g class="person-root">
        <g class="leg leg-left">
          <path class="trouser" d="M13.1 30.5 Q12.6 35.7 12.4 40.4" />
          <g class="lower-leg lower-leg-left">
            <path class="trouser" d="M12.4 40.1 Q11.8 44.5 11.4 48" />
            <path class="shoe" d="M11.6 46.9 Q10.2 48.1 7.9 48.7 Q7.2 49.7 9.2 50 L13 49.1" />
          </g>
        </g>
        <g class="leg leg-right">
          <path class="trouser" d="M18.9 30.5 Q19.4 35.7 19.6 40.4" />
          <g class="lower-leg lower-leg-right">
            <path class="trouser" d="M19.6 40.1 Q20.2 44.5 20.6 48" />
            <path class="shoe" d="M20.4 46.9 Q21.8 48.1 24.1 48.7 Q24.8 49.7 22.8 50 L19 49.1" />
          </g>
        </g>
        <g class="arm arm-left">
          <path class="sleeve" d="M10.6 16.4 Q9.3 19.8 8.5 23" />
          <path class="forearm" d="M8.5 22.8 Q8 25.9 8.7 28.7" />
          <circle class="hand" cx="8.7" cy="28.8" r="1.55" />
        </g>
        <path class="body" d="M10.2 14.2 Q12.8 12.1 16 12.1 Q19.2 12.1 21.8 14.2 L21.3 29.5 Q18.9 32.2 16 32.2 Q13.1 32.2 10.7 29.5 Z" />
        <path class="body-shade" d="M16.2 13 Q20 13.1 21 15.1 L20.5 28.5 Q18.7 30.3 16.1 30.6 Z" />
        <path class="garment-detail" :d="garmentDetailPath" />
        <path class="waist" d="M10.8 28.4 Q16 30 21.2 28.4 L21.3 31.5 Q16 33.4 10.7 31.5 Z" />
        <g class="arm arm-right">
          <path class="sleeve" d="M21.4 16.4 Q22.7 19.8 23.5 23" />
          <path class="forearm" d="M23.5 22.8 Q24 25.9 23.3 28.7" />
          <circle class="hand" cx="23.3" cy="28.8" r="1.55" />
        </g>
        <circle class="head" cx="16" cy="7.1" r="5.8" />
        <path class="head-shade" d="M16.5 1.6 A5.8 5.8 0 0 1 20.6 10.8 Q18.9 13 16.5 12.8 Z" />
        <g v-if="hairVariant === 0" class="hair-style hair-short">
          <path class="hair" d="M10.6 6.5 Q10.5 1.3 15.7 1 Q21.4 1.2 21.5 6.2 Q19.2 4.5 16.9 4.5 Q13.7 4.7 10.6 6.5 Z" />
        </g>
        <g v-else-if="hairVariant === 1" class="hair-style hair-side-part">
          <path class="hair" d="M10.5 6.7 Q10.6 1.5 15.8 1 Q20.7 1.1 21.5 5.7 Q18.2 3.2 12 5.7 Z" />
          <path class="hair-lock" d="M19.8 4.3 Q22.2 6.4 20.7 9.3 Q20.1 7 18.6 5.4 Z" />
        </g>
        <g v-else-if="hairVariant === 2" class="hair-style hair-crop">
          <path class="hair" d="M11 5.2 Q11.7 1.5 15.9 1.3 Q20.2 1.5 21 5.1 Q18.7 3.8 16 3.8 Q13.3 3.8 11 5.2 Z" />
        </g>
        <g v-else-if="hairVariant === 3" class="hair-style hair-bun">
          <circle class="hair" cx="20.7" cy="1.7" r="2.15" />
          <path class="hair" d="M10.7 6.6 Q10.7 1.8 15.8 1.2 Q21 1.8 21.3 6.5 Q18.8 4.6 16.3 4.5 Q13.5 4.6 10.7 6.6 Z" />
        </g>
        <g v-else-if="hairVariant === 4" class="hair-style hair-wave">
          <path class="hair" d="M10.5 6.7 Q10.1 3.7 12 2.1 Q13.3 .8 15 1.4 Q16.6 .2 18 1.5 Q20 .7 21.1 2.5 Q22.2 4.2 21.4 6.7 Q19.1 4.7 16.2 4.6 Q13.3 4.7 10.5 6.7 Z" />
        </g>
        <g v-else class="hair-style hair-long-side">
          <path class="hair" d="M10.5 7 Q10.2 1.5 15.8 1 Q21.6 1.5 21.5 7 Q19.3 4.7 16.2 4.5 Q13.1 4.7 10.5 7 Z" />
          <path class="hair-lock" d="M10.7 5.5 Q9.1 8.5 11.7 11.6 L13 9.8 Q11.8 7.6 12.4 5.1 Z" />
        </g>
        <circle v-if="showFood" class="food" cx="27" cy="26" r="2.6" />
        <path v-if="showTrash" class="trash" d="M24 23 l5 1 -1 5 -5 -1 z" />
      </g>
    </svg>
    <!-- #endif -->
    <!-- #ifndef H5 -->
    <view class="person-fallback">
      <view class="fallback-head"></view>
      <view class="fallback-body"></view>
      <view class="fallback-leg fallback-leg-left"></view>
      <view class="fallback-leg fallback-leg-right"></view>
    </view>
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
const visitorVariant = computed(() => {
  const id = String(props.visitorId || '')
  const numericMatch = id.match(/(\d+)$/)
  if (numericMatch) return Math.abs(Number(numericMatch[1]) - 1) % 8
  const hash = [...id].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 0)
  return hash % 8
})
const variantClass = computed(() => `variant-${visitorVariant.value}`)
const hairVariant = computed(() => [0, 1, 2, 3, 4, 5, 1, 4][visitorVariant.value])
const garmentDetailPath = computed(() => [
  'M13.3 13.4 Q16 16.2 18.7 13.4',
  'M13.5 13.2 L16 16.2 L18.5 13.2',
  'M16 13.1 L16 28.7 M13.4 15.1 L16 16.4 L18.6 15.1',
  'M12.9 13.4 L15.8 16 L19.1 13.4 M16 16 L16 27.8'
][visitorVariant.value % 4])
const showFood = computed(() => normalizedBehavior.value === 'EATING')
const showTrash = computed(() => ['DISPOSING', 'LITTERING'].includes(normalizedBehavior.value) && Number(props.progress) < .7)
const spriteStyle = computed(() => {
  const playbackRate = Math.max(.25, Number(props.playbackRate) || 1)
  const actionProgress = Math.max(0, Math.min(1, Number(props.progress) || 0))
  const motionDuration = .86 / playbackRate
  return {
    '--motion-duration': `${motionDuration}s`,
    '--idle-duration': `${motionDuration * 2.2}s`,
    '--eat-duration': `${motionDuration * 1.4}s`,
    '--visitor-depth-scale': String(Math.max(.96, Math.min(1.04, Number(props.depthScale) || 1))),
    '--action-progress': String(actionProgress),
    '--leaving-opacity': String(1 - actionProgress * .28),
    '--dispose-arm-angle': `${-18 - actionProgress * 62}deg`,
    '--litter-arm-angle': `${8 + actionProgress * 34}deg`
  }
})
</script>

<style scoped>
.visitor-sprite { --visitor-skin:#f2bd96;--visitor-skin-shade:#d99a76;--visitor-forearm:#e5ae89;--visitor-hand:#efb991;--visitor-hand-edge:#8d604e;--visitor-hair:#293847;--visitor-hair-edge:#1a2935;--visitor-shirt:#5d58c9;--visitor-shirt-light:#7771de;--visitor-shirt-edge:#263a58;--visitor-pants:#30445f;--visitor-pants-back:#293c55;--visitor-waist-edge:#26384e;--visitor-shoe:#182837;--visitor-garment-detail:rgba(225,239,244,.7);position:relative;width:24px;height:41px;transform:scale(var(--visitor-depth-scale));transform-origin:50% 100%; }
.visitor-sprite.variant-1 { --visitor-skin:#dba47f;--visitor-skin-shade:#bd7f60;--visitor-forearm:#d39a75;--visitor-hand:#dba47f;--visitor-hand-edge:#7d5242;--visitor-hair:#3c2e2b;--visitor-hair-edge:#261c1a;--visitor-shirt:#357981;--visitor-shirt-light:#55959a;--visitor-shirt-edge:#234952;--visitor-pants:#34495d;--visitor-pants-back:#2b3f50;--visitor-shoe:#192935; }
.visitor-sprite.variant-2 { --visitor-skin:#b97d5f;--visitor-skin-shade:#965c46;--visitor-forearm:#ae7055;--visitor-hand:#b97d5f;--visitor-hand-edge:#674238;--visitor-hair:#242123;--visitor-hair-edge:#151315;--visitor-shirt:#a85f52;--visitor-shirt-light:#c47a6c;--visitor-shirt-edge:#623d3d;--visitor-pants:#3d4652;--visitor-pants-back:#343d48;--visitor-shoe:#202833; }
.visitor-sprite.variant-3 { --visitor-skin:#e3ae86;--visitor-skin-shade:#c78865;--visitor-forearm:#d9a17b;--visitor-hand:#e3ae86;--visitor-hand-edge:#895c47;--visitor-hair:#4a3427;--visitor-hair-edge:#2c2019;--visitor-shirt:#9b7a3f;--visitor-shirt-light:#b99a5d;--visitor-shirt-edge:#5c4c31;--visitor-pants:#35475a;--visitor-pants-back:#2d3d4e;--visitor-shoe:#1b2936; }
.visitor-sprite.variant-4 { --visitor-skin:#956348;--visitor-skin-shade:#74452f;--visitor-forearm:#8b5941;--visitor-hand:#956348;--visitor-hand-edge:#513329;--visitor-hair:#211d1c;--visitor-hair-edge:#121010;--visitor-shirt:#46745e;--visitor-shirt-light:#66927a;--visitor-shirt-edge:#294839;--visitor-pants:#323f4b;--visitor-pants-back:#293640;--visitor-shoe:#17232c; }
.visitor-sprite.variant-5 { --visitor-skin:#c98d69;--visitor-skin-shade:#a76c50;--visitor-forearm:#bf835f;--visitor-hand:#c98d69;--visitor-hand-edge:#704839;--visitor-hair:#6b5140;--visitor-hair-edge:#3d3027;--visitor-shirt:#466884;--visitor-shirt-light:#6688a2;--visitor-shirt-edge:#2c465d;--visitor-pants:#384456;--visitor-pants-back:#303b4b;--visitor-shoe:#1c2835; }
.visitor-sprite.variant-6 { --visitor-skin:#efc09c;--visitor-skin-shade:#d59b78;--visitor-forearm:#e5b38f;--visitor-hand:#efc09c;--visitor-hand-edge:#8c604c;--visitor-hair:#2f2528;--visitor-hair-edge:#1b1517;--visitor-shirt:#844e67;--visitor-shirt-light:#a56d83;--visitor-shirt-edge:#553448;--visitor-pants:#3c4554;--visitor-pants-back:#333c49;--visitor-shoe:#1d2833; }
.visitor-sprite.variant-7 { --visitor-skin:#e9b991;--visitor-skin-shade:#cb8e69;--visitor-forearm:#dfaa83;--visitor-hand:#e9b991;--visitor-hand-edge:#865945;--visitor-hair:#a77a49;--visitor-hair-edge:#684a2f;--visitor-shirt:#68736f;--visitor-shirt-light:#87918d;--visitor-shirt-edge:#404b49;--visitor-pants:#30455a;--visitor-pants-back:#293b4d;--visitor-shoe:#192734; }
.person-svg { position:relative; z-index:2; width:100%; height:100%; overflow:visible; transform-origin:50% 100%; transition:transform .18s ease; filter:drop-shadow(1px 3px 2px rgba(0,12,23,.4)); }
.visitor-sprite.mirrored .person-svg { transform:scaleX(-1); }
.visitor-ground-shadow { position:absolute; z-index:0; left:50%; bottom:-3px; width:25px; height:10px; transform:translate(calc(-50% + 7px),5px) rotate(22deg) skewX(-8deg); clip-path:none; border-radius:50% 40% 58% 42%; background:radial-gradient(ellipse at 24% 45%,rgba(0,12,20,.42) 0 13%,rgba(0,12,20,.23) 34%,rgba(0,12,20,.085) 58%,rgba(0,12,20,.03) 70%,transparent 84%),radial-gradient(ellipse at 58% 54%,rgba(0,12,20,.12) 0 18%,transparent 66%); filter:blur(3px); pointer-events:none; }
.visitor-contact-shadow { position:absolute; z-index:1; left:50%; bottom:-1px; width:7px; height:2px; transform:translate(calc(-50% + 1px),0) skewX(-8deg); border-radius:50%; background:radial-gradient(ellipse,rgba(0,10,17,.2),rgba(0,10,17,.055) 62%,transparent 82%); filter:blur(.9px); opacity:.24; pointer-events:none; }
.visitor-selection-ring { position:absolute; z-index:1; left:50%; bottom:-4px; width:22px; height:7px; transform:translateX(-50%) skewX(-18deg); border:1px solid transparent; border-radius:50%; box-sizing:border-box; }
.visitor-sprite.selected .visitor-selection-ring { border-color:#b7f6ff; box-shadow:0 0 0 1px rgba(36,217,255,.65),0 0 9px rgba(36,217,255,.5); }
.head { fill:var(--visitor-skin);stroke:#233646;stroke-width:1.15; }
.head-shade { fill:var(--visitor-skin-shade);opacity:.4; }
.hair,.hair-lock { fill:var(--visitor-hair);stroke:var(--visitor-hair-edge);stroke-width:.55;stroke-linejoin:round; }
.body { fill:var(--visitor-shirt);stroke:var(--visitor-shirt-edge);stroke-width:1.15; }
.body-shade { fill:var(--visitor-shirt-light);opacity:.72; }
.garment-detail { fill:none;stroke:var(--visitor-garment-detail);stroke-width:.72;stroke-linecap:round;stroke-linejoin:round;opacity:.68; }
.waist { fill:var(--visitor-pants);stroke:var(--visitor-waist-edge);stroke-width:.75; }
.arm,.leg,.lower-leg { transform-box:fill-box; transform-origin:top center; }
.sleeve,.forearm,.trouser,.shoe { fill:none; stroke-linecap:round; stroke-linejoin:round; }
.sleeve { stroke:var(--visitor-shirt);stroke-width:4.4; }
.forearm { stroke:var(--visitor-forearm);stroke-width:3.05; }
.hand { fill:var(--visitor-hand);stroke:var(--visitor-hand-edge);stroke-width:.55; }
.trouser { stroke:var(--visitor-pants);stroke-width:4.2; }
.leg-left .trouser { stroke:var(--visitor-pants-back); }
.shoe { stroke:var(--visitor-shoe);stroke-width:3.1; }
.food { fill: #ffbf52; stroke: #fff1c9; stroke-width: 1; }
.trash { fill: #f5b648; stroke: #fff; stroke-width: .8; }
.walking .person-root,.leaving .person-root { animation:walk-body var(--motion-duration) linear infinite; }
.walking .arm-left,.leaving .arm-left { animation:walk-arm-a var(--motion-duration) ease-in-out infinite; }
.walking .arm-right,.leaving .arm-right { animation:walk-arm-b var(--motion-duration) ease-in-out infinite; }
.walking .leg-left,.leaving .leg-left { animation:walk-leg-a var(--motion-duration) ease-in-out infinite; }
.walking .leg-right,.leaving .leg-right { animation:walk-leg-b var(--motion-duration) ease-in-out infinite; }
.walking .lower-leg-left,.leaving .lower-leg-left { animation:walk-knee-a var(--motion-duration) ease-in-out infinite; }
.walking .lower-leg-right,.leaving .lower-leg-right { animation:walk-knee-b var(--motion-duration) ease-in-out infinite; }
.idle .person-root { animation: idle-breathe var(--idle-duration) ease-in-out infinite; }
.eating .arm-right { transform: rotate(-55deg); animation: eat-hand var(--eat-duration) ease-in-out infinite; }
.disposing .arm-right { transform: rotate(var(--dispose-arm-angle)); }
.littering .arm-right { transform: rotate(var(--litter-arm-angle)); }
.leaving { opacity: var(--leaving-opacity); }
.paused .person-root,
.paused .arm,
.paused .leg,
.paused .lower-leg { animation-play-state: paused !important; }
@keyframes walk-body { 0%,50%,100% { transform:translateY(0) rotate(-.35deg); } 25%,75% { transform:translateY(-.72px) rotate(.35deg); } }
@keyframes walk-arm-a { 0%,100% { transform:rotate(-9deg); } 50% { transform:rotate(10deg); } }
@keyframes walk-arm-b { 0%,100% { transform:rotate(10deg); } 50% { transform:rotate(-9deg); } }
@keyframes walk-leg-a { 0%,100% { transform:rotate(7deg); } 50% { transform:rotate(-7deg); } }
@keyframes walk-leg-b { 0%,100% { transform:rotate(-7deg); } 50% { transform:rotate(7deg); } }
@keyframes walk-knee-a { 0%,30%,100% { transform:rotate(0); } 52% { transform:rotate(-9deg); } 72% { transform:rotate(-3deg); } }
@keyframes walk-knee-b { 0% { transform:rotate(-9deg); } 20% { transform:rotate(-3deg); } 48%,80% { transform:rotate(0); } 100% { transform:rotate(-9deg); } }
@keyframes idle-breathe { 50% { transform: scaleY(.97) translateY(1px); } }
@keyframes eat-hand { 50% { transform: rotate(-72deg) translateY(-1px); } }
.person-fallback { position:relative;width:18px;height:34px; }
.fallback-head { position:absolute;left:5px;top:0;width:8px;height:8px;border-radius:50%;background:var(--visitor-skin); }
.fallback-body { position:absolute;left:3px;top:8px;width:12px;height:17px;border-radius:4px;background:var(--visitor-shirt); }
.fallback-leg { position:absolute;left:5px;top:23px;width:3px;height:11px;background:var(--visitor-pants); }
.fallback-leg-right { left:11px; }
</style>
