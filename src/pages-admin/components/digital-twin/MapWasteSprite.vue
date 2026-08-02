<template>
  <view
    :class="['map-waste-sprite', sprite.key, { selected, affected, falling, carried }]"
    :style="spriteStyle"
    :data-asset-status="sprite.status"
    :data-asset-source="sprite.sourceModel"
    :data-waste-category="sprite.category"
  >
    <view class="waste-ground-shadow" aria-hidden="true"></view>
    <view class="waste-contact-shadow" aria-hidden="true"></view>
    <view class="waste-contrast-support" aria-hidden="true"></view>
    <view class="waste-selection-ring" aria-hidden="true"></view>
    <image class="waste-image" :src="sprite.src" mode="aspectFit" />
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { resolveMapWasteSprite } from '@/pages-admin/config/map-sprite-registry.js'
import DIGITAL_TWIN_VISUAL_SYSTEM from '@/config/digital-twin-visual-system.js'

const props = defineProps({
  waste: { type: [Object, String], default: () => ({}) },
  category: { type: String, default: '' },
  selected: { type: Boolean, default: false },
  affected: { type: Boolean, default: false },
  falling: { type: Boolean, default: false },
  carried: { type: Boolean, default: false },
  depthScale: { type: Number, default: 1 }
})

const sprite = computed(() => resolveMapWasteSprite(typeof props.waste === 'string' ? props.waste : { ...props.waste, category: props.category || props.waste?.category }))
const spriteStyle = computed(() => {
  const rule = DIGITAL_TWIN_VISUAL_SYSTEM.mapEntity
  const [width, height] = sprite.value.size
  return {
    '--waste-width': `${width}px`, '--waste-height': `${height}px`, '--waste-rotation': `${sprite.value.rotation}deg`,
    '--waste-depth-scale': String(Math.max(rule.depthScale.min, Math.min(rule.depthScale.max, Number(props.depthScale) || 1))),
    '--waste-carried-depth-scale': String(Math.max(rule.depthScale.min, Math.min(rule.depthScale.max, Number(props.depthScale) || 1)) * .72),
    '--waste-shadow-scale': String(sprite.value.groundShadowScale), '--shadow-offset-x': `${rule.shadow.offsetX}px`, '--shadow-offset-y': `${rule.shadow.offsetY}px`,
    '--shadow-opacity': String(rule.shadow.opacity), '--contact-shadow-opacity': String(rule.shadow.contactOpacity), '--shadow-blur': `${rule.shadow.blur}px`, '--contact-shadow-blur': `${rule.shadow.contactBlur}px`
  }
})
</script>

<style scoped>
.map-waste-sprite{position:relative;width:var(--waste-width);height:var(--waste-height);transform:scale(var(--waste-depth-scale));transform-origin:50% 100%;pointer-events:none}
.waste-image{position:relative;z-index:3;display:block;width:100%;height:100%;object-fit:contain;transform:rotate(var(--waste-rotation));transform-origin:50% 78%;filter:drop-shadow(1px 1px 1px rgba(0,10,18,.28));transition:filter .18s ease}
.waste-ground-shadow{position:absolute;z-index:0;left:50%;bottom:-3px;width:82%;height:24%;transform:translate(calc(-50% + var(--shadow-offset-x) + 3px),calc(var(--shadow-offset-y) - 1px)) rotate(22deg) skewX(-8deg) scaleX(var(--waste-shadow-scale));clip-path:none;border-radius:50% 40% 56% 42%;background:radial-gradient(ellipse at 24% 45%,rgba(0,12,20,.36) 0 13%,rgba(0,12,20,.19) 34%,rgba(0,12,20,.07) 58%,rgba(0,12,20,.025) 70%,transparent 84%),radial-gradient(ellipse at 58% 54%,rgba(0,12,20,.11) 0 18%,transparent 68%);filter:blur(3.4px);opacity:.88}
.waste-contact-shadow{position:absolute;z-index:1;left:50%;bottom:-1px;width:28%;height:7%;transform:translate(calc(-50% + 1px),0) skewX(-8deg);border-radius:50%;background:radial-gradient(ellipse,rgba(0,10,17,.16) 0 28%,rgba(0,10,17,.045) 62%,transparent 82%);filter:blur(1.1px);opacity:.24}
.waste-contrast-support{position:absolute;z-index:2;left:50%;bottom:0;width:58%;height:25%;transform:translateX(-50%) skewX(-16deg);border:1px solid transparent;border-radius:50%;opacity:0;pointer-events:none}
.waste-selection-ring{position:absolute;z-index:1;left:50%;bottom:-4px;width:82%;height:30%;transform:translateX(-50%) skewX(-18deg);border:1px solid transparent;border-radius:50%;box-sizing:border-box}
.map-waste-sprite.selected .waste-selection-ring{border-color:rgba(183,246,255,.9);box-shadow:0 0 0 1px rgba(36,217,255,.3),0 0 7px rgba(36,217,255,.24)}
.map-waste-sprite.affected:not(.selected) .waste-selection-ring{border-color:rgba(245,182,72,.86);box-shadow:0 0 6px rgba(245,182,72,.22)}
.map-waste-sprite.falling .waste-image{animation:waste-tumble var(--waste-motion-duration,.82s) linear infinite}
.map-waste-sprite.carried{transform:scale(var(--waste-carried-depth-scale));transform-origin:50% 100%}.map-waste-sprite.carried .waste-ground-shadow,.map-waste-sprite.carried .waste-contact-shadow{opacity:0}
.map-waste-sprite.banana .waste-ground-shadow{width:92%;height:20%;filter:blur(3.2px)}.map-waste-sprite.cardboard_box .waste-ground-shadow{width:88%;height:28%;filter:blur(3.6px)}.map-waste-sprite.battery .waste-ground-shadow{width:74%;height:22%;filter:blur(3px);opacity:.8}.map-waste-sprite.papercup .waste-ground-shadow{width:78%;height:24%;filter:blur(3.3px)}
.map-waste-sprite.banana .waste-image{filter:saturate(1.22) contrast(1.2) brightness(1.13) drop-shadow(1px 1px 1px rgba(0,10,18,.42)) drop-shadow(0 0 1px rgba(255,242,154,.76))}.map-waste-sprite.banana .waste-contrast-support{opacity:.62;border-color:rgba(255,227,113,.48);background:radial-gradient(ellipse,rgba(16,42,27,.48) 0 48%,rgba(13,50,31,.16) 67%,transparent 78%);box-shadow:0 1px 5px rgba(0,14,20,.26)}
@keyframes waste-tumble{to{transform:rotate(calc(var(--waste-rotation) + 360deg))}}
</style>
