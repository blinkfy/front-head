<template>
  <view :class="['map-entity-sprite', kind, variant, { selected, affected, active, moving }]" :style="spriteStyle" :data-asset-status="resolvedAssetStatus" :data-asset-source="sprite.source">
    <view class="entity-ground-shadow" aria-hidden="true"></view>
    <view class="entity-selection-ring" aria-hidden="true"></view>
    <view class="entity-art">
      <image v-if="sprite.src" :class="`${kind}-image`" :src="sprite.src" mode="aspectFit" />
      <view v-else-if="kind === 'center'" class="center-placeholder"><i></i><b></b><em></em></view>
      <view v-else-if="kind === 'station'" class="station-placeholder"><i></i><b></b></view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { resolveMapSprite } from '@/config/map-sprite-registry.js'
import DIGITAL_TWIN_VISUAL_SYSTEM from '@/config/digital-twin-visual-system.js'

const props = defineProps({
  kind: { type: String, required: true },
  variant: { type: String, default: 'active' },
  selected: { type: Boolean, default: false },
  affected: { type: Boolean, default: false },
  active: { type: Boolean, default: false },
  moving: { type: Boolean, default: false },
  depthScale: { type: Number, default: 1 },
  headingDeg: { type: Number, default: 0 },
  assetStatus: { type: String, default: 'ready' }
})

const sprite = computed(() => resolveMapSprite(props.kind, props.variant))
const resolvedAssetStatus = computed(() => props.assetStatus === 'ready' ? sprite.value.status : props.assetStatus)
const spriteStyle = computed(() => {
  const rule = DIGITAL_TWIN_VISUAL_SYSTEM.mapEntity
  const heading = Number(props.headingDeg) || 0
  const visualTurn = Math.sin(heading * Math.PI / 180) * rule.motion.maxVisualTurnDeg
  return {
    '--entity-depth-scale': String(Math.max(rule.depthScale.min, Math.min(rule.depthScale.max, Number(props.depthScale) || 1))),
    '--entity-turn-angle': `${visualTurn.toFixed(2)}deg`,
    '--entity-turn-duration': `${rule.motion.turnBlendMs}ms`,
    '--shadow-offset-x': `${rule.shadow.offsetX}px`,
    '--shadow-offset-y': `${rule.shadow.offsetY}px`,
    '--shadow-opacity': String(rule.shadow.opacity),
    '--shadow-blur': `${rule.shadow.blur}px`,
    '--shadow-skew': `${rule.shadow.skewDeg}deg`
  }
})
</script>

<style scoped>
.map-entity-sprite { position: relative; display: grid; place-items: end center; transform: scale(var(--entity-depth-scale)); transform-origin: 50% 100%; }
.entity-art { position:relative; z-index:2; display:grid; place-items:end center; width:100%; height:100%; transform:rotate(var(--entity-turn-angle)); transform-origin:50% 100%; transition:transform var(--entity-turn-duration) cubic-bezier(.22,1,.36,1); filter:drop-shadow(2px 4px 3px rgba(0,10,18,.38)); }
.entity-ground-shadow { position:absolute; z-index:0; left:50%; bottom:-2px; width:76%; height:13%; transform:translate(calc(-50% + var(--shadow-offset-x)),var(--shadow-offset-y)) skewX(var(--shadow-skew)); transform-origin:center; clip-path:polygon(0 48%,14% 22%,48% 9%,100% 40%,86% 76%,47% 94%,10% 75%); border-radius:46% 30% 52% 34%; background:radial-gradient(ellipse at 38% 42%,rgba(0,12,20,var(--shadow-opacity)) 0 36%,rgba(0,12,20,.18) 58%,transparent 78%); filter:blur(var(--shadow-blur)); pointer-events:none; }
.entity-selection-ring { position:absolute; z-index:1; left:50%; bottom:-5px; width:86%; height:17%; transform:translateX(-50%) skewX(-18deg); border:1px solid transparent; border-radius:50%; box-sizing:border-box; pointer-events:none; }
.map-entity-sprite.selected .entity-selection-ring { border-color:#b7f6ff; box-shadow:0 0 0 1px rgba(36,217,255,.7),0 0 11px rgba(36,217,255,.52); }
.map-entity-sprite.affected .entity-selection-ring { border-color:#f5b648; box-shadow:0 0 11px rgba(245,182,72,.52); animation:entity-ring-pulse 1.2s ease-in-out infinite; }
.map-entity-sprite.moving .entity-ground-shadow { width:82%; opacity:.92; }
@keyframes entity-ring-pulse { 50% { opacity:.5; transform:translateX(-50%) skewX(-18deg) scale(1.12); } }
.map-entity-sprite.robot { width: 34px; height: 48px; }.robot-image { width: 34px; height: 48px; }
.map-entity-sprite.bin { width: 34px; height: 43px; }.bin-image { width: 34px; height: 43px; }
.map-entity-sprite.robot .entity-ground-shadow { width:88%; height:15%; bottom:-1px; clip-path:polygon(0 54%,12% 22%,44% 8%,100% 38%,86% 77%,48% 96%,9% 78%); }
.map-entity-sprite.bin .entity-ground-shadow { width:78%; height:14%; clip-path:polygon(0 42%,20% 12%,70% 8%,100% 46%,80% 88%,27% 91%,7% 69%); }
.map-entity-sprite.bin.standby .bin-image { filter:saturate(.62) brightness(.92); opacity:.88; }.map-entity-sprite.bin.returning .bin-image { filter:saturate(.82) sepia(.12); }
.map-entity-sprite.center { width:160px; height:106px; place-items:center; }.map-entity-sprite.center::before { content:''; position:absolute; z-index:0; inset:13px 4px 7px; border:1px solid rgba(62,205,242,.24); border-radius:10px; background:linear-gradient(145deg,rgba(8,57,76,.2),rgba(3,25,39,.5)); box-shadow:inset 0 0 24px rgba(36,217,255,.08),0 8px 18px rgba(0,12,20,.28); transform:skewY(-2deg); }.center-image { position:relative; z-index:1; width:154px; height:102px; object-fit:contain; }.map-entity-sprite.center.active::before { border-color:rgba(36,217,255,.62); box-shadow:inset 0 0 28px rgba(36,217,255,.14),0 0 18px rgba(36,217,255,.2); }.center-placeholder { position:relative; width:48px; height:27px; border:1px solid #9bd7ec; border-radius:3px; background:linear-gradient(145deg,#2e6d88,#13384b); transform:skewY(-4deg); }.center-placeholder::before { content:''; position:absolute; left:3px; right:3px; top:-9px; height:11px; border:1px solid #bceeff; background:linear-gradient(155deg,#6aa6bc,#285c73); transform:skewY(4deg); }.center-placeholder i,.center-placeholder b,.center-placeholder em { position:absolute; bottom:3px; width:8px; height:13px; border:1px solid rgba(210,244,255,.7); background:#092131; }.center-placeholder i{left:5px}.center-placeholder b{left:19px}.center-placeholder em{right:5px}.center-placeholder.active{box-shadow:inset 0 0 12px rgba(36,217,255,.35)}
.map-entity-sprite.station { width:34px; height:31px; }.station-image { width:34px; height:31px; object-fit:contain; }.map-entity-sprite.station.active .station-image { filter:drop-shadow(0 0 2px #fff) drop-shadow(0 0 7px #24d9ff); }.station-placeholder { position:relative; width:20px; height:18px; border:1px solid #9bd7ec; border-radius:3px; background:linear-gradient(145deg,#376f83,#163849); transform:skewY(-5deg); }.station-placeholder i { position:absolute; left:3px; right:3px; top:4px; height:2px; background:#24d9ff; }.station-placeholder b { position:absolute; left:7px; bottom:2px; width:6px; height:7px; border:1px solid rgba(220,249,255,.75); }.map-entity-sprite.station.active .station-placeholder { border-color:#fff; box-shadow:0 0 10px #24d9ff; }
.map-entity-sprite.station .entity-ground-shadow { width:86%; height:18%; bottom:-1px; }
@media (max-width:900px){.map-entity-sprite.robot{transform:scale(.9)}.map-entity-sprite.center{transform:scale(.72)}.map-entity-sprite.station{transform:scale(.88)}}
</style>
