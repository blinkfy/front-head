<template>
  <view class="splash-artwork">
    <image class="splash-artwork-layer" src="/static/Icon.webp.png" mode="scaleToFill" @load="baseReady = true" />
    <image v-if="baseReady && !motionFailed" class="splash-artwork-layer" :src="motionSrc"
      mode="scaleToFill" @error="motionFailed = true" />
  </view>
</template>

<script setup>
import { ref } from 'vue'
// #ifndef H5
const motionSrc = '/static/splash-foreground.gif'
// #endif
// #ifdef H5
const motionSrc = '/static/web/splash-foreground.webp'
// #endif

const baseReady = ref(false)
const motionFailed = ref(false)
</script>

<style scoped>
.splash-artwork {
  position: relative;
  width: 100%;
  height: 100%;
}

.splash-artwork-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
</style>
