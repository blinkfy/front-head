<template>
  <!-- #ifdef H5 -->
  <Teleport to="body">
  <!-- #endif -->
    <view v-if="menu" class="qr-download-mask" @touchstart="startInteraction" @pointerdown="startInteraction" @tap="dismiss">
      <view class="qr-download-menu" :class="{ 'menu-dark': dark }" :style="{ left: menu.left + 'px', top: menu.top + 'px' }" @tap.stop>
        <button class="qr-download-action" :disabled="disabled" @keydown="startInteraction" @tap="download">下载二维码</button>
      </view>
    </view>
  <!-- #ifdef H5 -->
  </Teleport>
  <!-- #endif -->
</template>

<script setup>
import { ref, watch } from 'vue'
const props = defineProps({ menu: Object, disabled: Boolean, dark: Boolean })
const emit = defineEmits(['close', 'download'])
const interactionStarted = ref(false)
watch(() => props.menu, () => { interactionStarted.value = false }, { flush: 'sync' })
// The touch that opened the menu can emit a release click on the new overlay.
// Only a new gesture (or keyboard action) may dismiss or download.
function startInteraction() { interactionStarted.value = true }
function dismiss() { if (interactionStarted.value) emit('close') }
function download() { if (interactionStarted.value && !props.disabled) emit('download') }
</script>

<style scoped>
.qr-download-mask { position: fixed; inset: 0; z-index: 10060; background: transparent; touch-action: none; }
.qr-download-menu { position: absolute; width: 148px; border: 1px solid #dceee6; border-radius: 12px; background: #fff; box-shadow: 0 5px 22px #173f3430; overflow: hidden; }
.qr-download-action { margin: 0; padding: 0; width: 100%; line-height: 44px; font-size: 14px; color: #068e6b; background: transparent; }
.qr-download-action::after { border: 0; }
.menu-dark { border-color: #396455; background: #203f35; }
.menu-dark .qr-download-action { color: #96e4c7; }
</style>

<style>
/* #ifdef H5 */
@media (max-width: 760px) { .qr-saveable-target { -webkit-touch-callout: none; } }
/* #endif */
</style>
