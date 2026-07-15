<template>
  <view :class="['map-entity-sprite', kind, variant, direction.key, { selected, affected, active, moving }]" :style="spriteStyle" :data-asset-status="resolvedAssetStatus" :data-asset-source="sprite.source" :data-heading-direction="direction.key">
    <view class="entity-ground-shadow" aria-hidden="true"></view>
    <view class="entity-contact-shadow" aria-hidden="true"></view>
    <view class="entity-selection-ring" aria-hidden="true"></view>
    <view v-if="kind === 'robot'" class="entity-heading-indicator" aria-hidden="true"><i></i></view>
    <view class="entity-art">
      <image v-if="sprite.src" :class="`${kind}-image`" :src="sprite.src" mode="aspectFit" />
      <view v-else-if="kind === 'center'" class="center-placeholder"><i></i><b></b><em></em></view>
      <view v-else-if="kind === 'station'" class="station-placeholder"><i></i><b></b></view>
    </view>
    <view v-if="kind === 'bin'" class="entity-status-indicator" aria-hidden="true"></view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { resolveMapHeadingDirection, resolveMapSprite } from '@/config/map-sprite-registry.js'
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

const direction = computed(() => resolveMapHeadingDirection(props.headingDeg))
const sprite = computed(() => resolveMapSprite(props.kind, props.variant, direction.value.key))
const resolvedAssetStatus = computed(() => props.assetStatus === 'ready' ? sprite.value.status : props.assetStatus)
const spriteStyle = computed(() => {
  const rule = DIGITAL_TWIN_VISUAL_SYSTEM.mapEntity
  const heading = Number(props.headingDeg) || 0
  return {
    '--entity-depth-scale': String(Math.max(rule.depthScale.min, Math.min(rule.depthScale.max, Number(props.depthScale) || 1))),
    '--entity-heading-angle': `${heading.toFixed(2)}deg`,
    '--entity-turn-duration': `${rule.motion.turnBlendMs}ms`,
    '--entity-heading-opacity': String(rule.motion.headingIndicatorOpacity),
    '--shadow-offset-x': `${rule.shadow.offsetX}px`,
    '--shadow-offset-y': `${rule.shadow.offsetY}px`,
    '--shadow-opacity': String(rule.shadow.opacity),
    '--contact-shadow-opacity': String(rule.shadow.contactOpacity),
    '--shadow-blur': `${rule.shadow.blur}px`,
    '--contact-shadow-blur': `${rule.shadow.contactBlur}px`,
    '--shadow-skew': `${rule.shadow.skewDeg}deg`
  }
})
</script>

<style scoped>
.map-entity-sprite { position:relative; display:grid; place-items:end center; transform:scale(var(--entity-depth-scale)); transform-origin:50% 100%; }
.entity-art { position:relative; z-index:3; display:grid; place-items:end center; width:100%; height:100%; transform-origin:50% 100%; filter:drop-shadow(1px 2px 1.5px rgba(0,10,18,.36)) drop-shadow(0 0 .65px rgba(223,247,255,.58)); }
.entity-ground-shadow { position:absolute; z-index:0; left:50%; bottom:-1px; width:76%; height:12%; transform:translate(calc(-50% + var(--shadow-offset-x)),var(--shadow-offset-y)) skewX(var(--shadow-skew)); transform-origin:center; clip-path:polygon(0 48%,14% 22%,48% 9%,100% 40%,86% 76%,47% 94%,10% 75%); border-radius:46% 30% 52% 34%; background:radial-gradient(ellipse at 30% 38%,rgba(0,12,20,var(--shadow-opacity)) 0 28%,rgba(0,12,20,.14) 58%,transparent 82%); filter:blur(var(--shadow-blur)); pointer-events:none; }
.entity-contact-shadow { position:absolute; z-index:1; left:50%; bottom:-1px; width:52%; height:7%; transform:translateX(-50%); border-radius:50%; background:radial-gradient(ellipse,rgba(0,10,17,var(--contact-shadow-opacity)) 0 42%,rgba(0,10,17,.16) 67%,transparent 82%); filter:blur(var(--contact-shadow-blur)); pointer-events:none; }
.entity-selection-ring { position:absolute; z-index:1; left:50%; bottom:-5px; width:86%; height:17%; transform:translateX(-50%) skewX(-18deg); border:1px solid transparent; border-radius:50%; box-sizing:border-box; pointer-events:none; }
.map-entity-sprite.selected .entity-selection-ring { border-color:rgba(183,246,255,.9); box-shadow:0 0 0 1px rgba(36,217,255,.34),0 0 7px rgba(36,217,255,.28); }
.map-entity-sprite.affected:not(.selected) .entity-selection-ring { border-color:rgba(197,144,90,.82); box-shadow:0 0 6px rgba(197,144,90,.24); }
.entity-heading-indicator { position:absolute; z-index:2; left:50%; bottom:3px; width:17px; height:2px; transform:rotate(var(--entity-heading-angle)); transform-origin:0 50%; opacity:var(--entity-heading-opacity); transition:transform var(--entity-turn-duration) cubic-bezier(.22,1,.36,1); pointer-events:none; }
.entity-heading-indicator::before { content:''; position:absolute; inset:0; border-radius:2px; background:linear-gradient(90deg,rgba(116,185,199,.1),rgba(168,222,232,.82)); }
.entity-heading-indicator i { position:absolute; right:-1px; top:-2px; width:0; height:0; border-top:3px solid transparent; border-bottom:3px solid transparent; border-left:4px solid rgba(168,222,232,.88); }
.map-entity-sprite.robot { width:42px; height:60px; }.robot-image { width:42px; height:60px; object-fit:contain; }
.map-entity-sprite.bin { width:36px; height:46px; }.bin-image { width:36px; height:46px; object-fit:contain; filter:saturate(.92) contrast(1.03) brightness(.99); }
.map-entity-sprite.robot .entity-ground-shadow { width:118%; height:21%; bottom:-9px; transform:translate(calc(-50% + var(--shadow-offset-x) + 18px),calc(var(--shadow-offset-y) + 7px)) rotate(18deg) skewX(-14deg); transform-origin:center; clip-path:polygon(4% 56%,18% 30%,44% 13%,76% 19%,98% 47%,85% 72%,49% 90%,15% 78%); border-radius:42% 34% 55% 41%; background:radial-gradient(ellipse at 28% 42%,rgba(0,12,20,.42) 0 14%,rgba(0,12,20,.22) 38%,rgba(0,12,20,.075) 62%,transparent 86%),radial-gradient(ellipse at 67% 58%,rgba(0,12,20,.18) 0 18%,rgba(0,12,20,.055) 42%,transparent 70%); filter:blur(6.8px); opacity:.68; }
.map-entity-sprite.robot .entity-contact-shadow { width:34%; height:5%; bottom:-1px; transform:translate(calc(-50% + 7px),2px) skewX(-12deg); clip-path:polygon(9% 58%,28% 33%,66% 24%,94% 48%,76% 76%,35% 86%,10% 72%); border-radius:42%; background:radial-gradient(ellipse at 50% 50%,rgba(0,10,17,.2) 0 25%,rgba(0,10,17,.065) 58%,transparent 82%); filter:blur(1.6px); opacity:.2; }
.map-entity-sprite.bin .entity-ground-shadow { width:92%; height:17%; bottom:-6px; transform:translate(calc(-50% + var(--shadow-offset-x) + 11px),calc(var(--shadow-offset-y) + 5px)) rotate(17deg) skewX(-12deg); transform-origin:center; clip-path:polygon(3% 52%,19% 25%,54% 12%,96% 43%,84% 73%,42% 90%,10% 72%); border-radius:44% 35% 56% 42%; background:radial-gradient(ellipse at 29% 44%,rgba(0,12,20,.36) 0 14%,rgba(0,12,20,.19) 38%,rgba(0,12,20,.065) 62%,transparent 84%),radial-gradient(ellipse at 65% 56%,rgba(0,12,20,.14) 0 18%,rgba(0,12,20,.04) 42%,transparent 70%); filter:blur(5.2px); opacity:.62; }
.map-entity-sprite.bin .entity-contact-shadow { width:28%; height:4%; bottom:-1px; transform:translate(calc(-50% + 5px),1px) skewX(-10deg); clip-path:polygon(12% 55%,34% 31%,74% 24%,94% 49%,76% 77%,36% 87%,10% 72%); border-radius:42%; background:radial-gradient(ellipse at 50% 50%,rgba(0,10,17,.18) 0 28%,rgba(0,10,17,.055) 62%,transparent 82%); filter:blur(1.4px); opacity:.18; }
.map-entity-sprite.bin.standby .bin-image { opacity:.9; filter:saturate(.9) contrast(1.02) brightness(.97); }.map-entity-sprite.bin.returning .bin-image { filter:saturate(.9) contrast(1.04) brightness(.98); }
.entity-status-indicator { position:absolute; z-index:4; right:1px; top:5px; width:5px; height:5px; border:1px solid rgba(230,249,255,.82); border-radius:50%; background:#5fbf92; box-shadow:0 1px 3px rgba(0,14,22,.6); pointer-events:none; }
.map-entity-sprite.bin.standby .entity-status-indicator { background:#8299a8; }.map-entity-sprite.bin.returning .entity-status-indicator { background:#bd866b; }
.map-entity-sprite.center { width:160px; height:106px; place-items:center; }.map-entity-sprite.center::before { content:''; position:absolute; z-index:0; inset:13px 4px 7px; border:1px solid rgba(62,205,242,.24); border-radius:10px; background:linear-gradient(145deg,rgba(8,57,76,.2),rgba(3,25,39,.5)); box-shadow:inset 0 0 24px rgba(36,217,255,.08),0 8px 18px rgba(0,12,20,.28); transform:skewY(-2deg); }.center-image { position:relative; z-index:1; width:154px; height:102px; object-fit:contain; }.map-entity-sprite.center.active::before { border-color:rgba(36,217,255,.62); box-shadow:inset 0 0 28px rgba(36,217,255,.14),0 0 18px rgba(36,217,255,.2); }.map-entity-sprite.center .entity-ground-shadow { width:112%; height:18%; bottom:3px; transform:translate(calc(-50% + 16px),8px) rotate(14deg) skewX(-6deg); clip-path:none; border-radius:52% 42% 58% 44%; background:radial-gradient(ellipse at 24% 44%,rgba(0,12,20,.4) 0 13%,rgba(0,12,20,.22) 35%,rgba(0,12,20,.08) 60%,transparent 82%),radial-gradient(ellipse at 62% 55%,rgba(0,12,20,.12) 0 22%,transparent 68%); filter:blur(8px); opacity:.72; }.map-entity-sprite.center .entity-contact-shadow { width:54%; height:5%; bottom:8px; transform:translate(calc(-50% + 2px),0); clip-path:none; background:radial-gradient(ellipse at 50% 50%,rgba(0,10,17,.14) 0 28%,rgba(0,10,17,.05) 62%,transparent 82%); filter:blur(2.5px); opacity:.18; }.center-placeholder { position:relative; width:48px; height:27px; border:1px solid #9bd7ec; border-radius:3px; background:linear-gradient(145deg,#2e6d88,#13384b); transform:skewY(-4deg); }.center-placeholder::before { content:''; position:absolute; left:3px; right:3px; top:-9px; height:11px; border:1px solid #bceeff; background:linear-gradient(155deg,#6aa6bc,#285c73); transform:skewY(4deg); }.center-placeholder i,.center-placeholder b,.center-placeholder em { position:absolute; bottom:3px; width:8px; height:13px; border:1px solid rgba(210,244,255,.7); background:#092131; }.center-placeholder i{left:5px}.center-placeholder b{left:19px}.center-placeholder em{right:5px}.center-placeholder.active{box-shadow:inset 0 0 12px rgba(36,217,255,.35)}
.map-entity-sprite.station { width:34px; height:31px; }.station-image { width:34px; height:31px; object-fit:contain; }.map-entity-sprite.station.active .station-image { filter:drop-shadow(0 0 2px #fff) drop-shadow(0 0 7px #24d9ff); }.station-placeholder { position:relative; width:20px; height:18px; border:1px solid #9bd7ec; border-radius:3px; background:linear-gradient(145deg,#376f83,#163849); transform:skewY(-5deg); }.station-placeholder i { position:absolute; left:3px; right:3px; top:4px; height:2px; background:#24d9ff; }.station-placeholder b { position:absolute; left:7px; bottom:2px; width:6px; height:7px; border:1px solid rgba(220,249,255,.75); }.map-entity-sprite.station.active .station-placeholder { border-color:#fff; box-shadow:0 0 10px #24d9ff; }
.map-entity-sprite.station .entity-ground-shadow { width:96%; height:22%; bottom:-5px; transform:translate(calc(-50% + var(--shadow-offset-x) + 5px),calc(var(--shadow-offset-y) - 1px)) rotate(21deg) skewX(-8deg); clip-path:none; border-radius:48% 36% 56% 40%; background:radial-gradient(ellipse at 24% 44%,rgba(0,12,20,.48) 0 13%,rgba(0,12,20,.27) 34%,rgba(0,12,20,.1) 58%,rgba(0,12,20,.035) 70%,transparent 84%),radial-gradient(ellipse at 58% 54%,rgba(0,12,20,.16) 0 18%,transparent 68%); filter:blur(3.8px); opacity:.9; }
.map-entity-sprite.station .entity-contact-shadow { width:30%; height:5%; bottom:-2px; transform:translate(calc(-50% + 1px),0); clip-path:none; background:radial-gradient(ellipse at 50% 50%,rgba(0,10,17,.18) 0 28%,rgba(0,10,17,.055) 62%,transparent 82%); filter:blur(1.3px); opacity:.22; }
@media (max-width:900px){.map-entity-sprite.robot{transform:scale(.9)}.map-entity-sprite.center{transform:scale(.72)}.map-entity-sprite.station{transform:scale(.88)}}
</style>
