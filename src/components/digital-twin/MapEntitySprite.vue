<template>
  <view :class="['map-entity-sprite', kind, variant, { selected, affected, active }]" :data-asset-status="resolvedAssetStatus" :data-asset-source="sprite.source">
    <image v-if="sprite.src" :class="`${kind}-image`" :src="sprite.src" mode="aspectFit" />
    <view v-else-if="kind === 'center'" class="center-placeholder"><i></i><b></b><em></em></view>
    <view v-else-if="kind === 'station'" class="station-placeholder"><i></i><b></b></view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { resolveMapSprite } from '@/config/map-sprite-registry.js'

const props = defineProps({
  kind: { type: String, required: true },
  variant: { type: String, default: 'active' },
  selected: { type: Boolean, default: false },
  affected: { type: Boolean, default: false },
  active: { type: Boolean, default: false },
  assetStatus: { type: String, default: 'ready' }
})

const sprite = computed(() => resolveMapSprite(props.kind, props.variant))
const resolvedAssetStatus = computed(() => props.assetStatus === 'ready' ? sprite.value.status : props.assetStatus)
</script>

<style scoped>
.map-entity-sprite { position: relative; display: grid; place-items: end center; transform-origin: 50% 100%; filter: drop-shadow(0 5px 4px rgba(0,10,18,.52)); }
.map-entity-sprite::after { content:''; position:absolute; z-index:-1; left:50%; bottom:-3px; width:72%; height:7px; transform:translateX(-50%); border-radius:50%; background:rgba(0,12,20,.38); filter:blur(2px); }
.map-entity-sprite.selected { filter: drop-shadow(0 0 3px #fff) drop-shadow(0 0 8px #24d9ff); }.map-entity-sprite.affected { filter: drop-shadow(0 0 3px #fff) drop-shadow(0 0 9px #f5b648); }
.map-entity-sprite.robot { width: 34px; height: 48px; }.robot-image { width: 34px; height: 48px; }
.map-entity-sprite.bin { width: 34px; height: 43px; }.bin-image { width: 34px; height: 43px; }
.map-entity-sprite.bin.standby .bin-image { filter:saturate(.62) brightness(.92); opacity:.88; }.map-entity-sprite.bin.returning .bin-image { filter:saturate(.82) sepia(.12); }
.map-entity-sprite.center { width:160px; height:106px; place-items:center; }.map-entity-sprite.center::before { content:''; position:absolute; z-index:0; inset:13px 4px 7px; border:1px solid rgba(62,205,242,.24); border-radius:10px; background:linear-gradient(145deg,rgba(8,57,76,.2),rgba(3,25,39,.5)); box-shadow:inset 0 0 24px rgba(36,217,255,.08),0 8px 18px rgba(0,12,20,.28); transform:skewY(-2deg); }.center-image { position:relative; z-index:1; width:154px; height:102px; object-fit:contain; }.map-entity-sprite.center.active::before { border-color:rgba(36,217,255,.62); box-shadow:inset 0 0 28px rgba(36,217,255,.14),0 0 18px rgba(36,217,255,.2); }.center-placeholder { position:relative; width:48px; height:27px; border:1px solid #9bd7ec; border-radius:3px; background:linear-gradient(145deg,#2e6d88,#13384b); transform:skewY(-4deg); }.center-placeholder::before { content:''; position:absolute; left:3px; right:3px; top:-9px; height:11px; border:1px solid #bceeff; background:linear-gradient(155deg,#6aa6bc,#285c73); transform:skewY(4deg); }.center-placeholder i,.center-placeholder b,.center-placeholder em { position:absolute; bottom:3px; width:8px; height:13px; border:1px solid rgba(210,244,255,.7); background:#092131; }.center-placeholder i{left:5px}.center-placeholder b{left:19px}.center-placeholder em{right:5px}.center-placeholder.active{box-shadow:inset 0 0 12px rgba(36,217,255,.35)}
.map-entity-sprite.station { width:34px; height:31px; }.station-image { width:34px; height:31px; object-fit:contain; }.map-entity-sprite.station.active .station-image { filter:drop-shadow(0 0 2px #fff) drop-shadow(0 0 7px #24d9ff); }.station-placeholder { position:relative; width:20px; height:18px; border:1px solid #9bd7ec; border-radius:3px; background:linear-gradient(145deg,#376f83,#163849); transform:skewY(-5deg); }.station-placeholder i { position:absolute; left:3px; right:3px; top:4px; height:2px; background:#24d9ff; }.station-placeholder b { position:absolute; left:7px; bottom:2px; width:6px; height:7px; border:1px solid rgba(220,249,255,.75); }.map-entity-sprite.station.active .station-placeholder { border-color:#fff; box-shadow:0 0 10px #24d9ff; }
@media (max-width:900px){.map-entity-sprite.robot{transform:scale(.9)}.map-entity-sprite.center{transform:scale(.72)}.map-entity-sprite.station{transform:scale(.88)}}
</style>
