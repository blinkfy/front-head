<template>
  <view v-if="appTabIcon" class="manifest-icon manifest-icon-tab" :class="'manifest-icon-tab-' + id" :style="iconStyle" @click="emitClick"></view>
  <view v-else-if="id === 'back'" class="manifest-icon manifest-icon-back" :style="iconStyle" @click="emitClick">
    <image
      v-if="source && !placeholderOnly"
      class="manifest-icon-back-image"
      :src="source"
      mode="aspectFit"
      @error="handleImageError"
    />
    <view v-else class="manifest-icon-back-image manifest-icon-placeholder" aria-hidden="true"></view>
  </view>
  <image
    v-else-if="source && !placeholderOnly"
    class="manifest-icon"
    :src="source"
    mode="aspectFit"
    :style="iconStyle"
    @click="emitClick"
    @error="handleImageError"
  />
  <view v-else class="manifest-icon manifest-icon-placeholder" :style="iconStyle" aria-hidden="true" @click="emitClick"></view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { getManifestIconPath } from '@/utils/manifest-icons.js'

const warnedMissingIds = new Set()
const warnedFailedSources = new Set()

const props = defineProps({
  id: { type: String, required: true },
  scale: { type: Number, default: 1.8 },
  size: { type: String, default: '' }
})
const emit = defineEmits(['click'])
const appTabIcon = computed(() => {
  // #ifdef APP-PLUS
  return ['home', 'map_location', 'store', 'user_profile'].includes(props.id)
  // #endif
  // #ifndef APP-PLUS
  return false
  // #endif
})

const fallbackSource = getManifestIconPath('help')
const failedSource = ref('')
const placeholderOnly = ref(false)
const iconStyle = computed(() => props.id === 'back'
  ? { width: '80rpx', height: '80rpx', padding: '0', boxSizing: 'border-box' }
  : props.size
    ? { width: props.size, height: props.size }
    : { width: `${props.scale}em`, height: `${props.scale}em` })
const source = computed(() => {
  const requestedSource = getManifestIconPath(props.id)
  if (requestedSource) return requestedSource === failedSource.value ? fallbackSource : requestedSource

  if (import.meta.env.DEV && typeof console !== 'undefined' && !warnedMissingIds.has(props.id)) {
    warnedMissingIds.add(props.id)
    console.warn(`[ManifestIcon] Unknown icon id "${props.id}"; using the help fallback.`)
  }
  return fallbackSource
})

function handleImageError(event) {
  if (source.value && !warnedFailedSources.has(source.value)) {
    warnedFailedSources.add(source.value)
    console.warn(`[ManifestIcon] Failed to load "${props.id}" from "${source.value}"`, event?.detail?.errMsg || 'image error')
  }
  if (source.value && source.value !== fallbackSource) {
    failedSource.value = source.value
  } else {
    placeholderOnly.value = true
  }
}

function emitClick(event) {
  emit('click', event)
}

watch(() => props.id, () => {
  failedSource.value = ''
  placeholderOnly.value = false
})
</script>

<style scoped>
.manifest-icon {
  display: inline-block;
  vertical-align: middle;
  flex: 0 0 auto;
}

/* #ifdef APP-PLUS */
/* Local navigation artwork paints directly instead of waiting for uni-image's load callback. */
.manifest-icon-tab {
  background-repeat: no-repeat;
  background-position: center;
  background-size: contain;
}
.manifest-icon-tab-home { background-image: url('/static/icons/home_128.webp.png'); }
.manifest-icon-tab-map_location { background-image: url('/static/icons/map_location_128.webp.png'); }
.manifest-icon-tab-store { background-image: url('/static/icons/store_128.webp.png'); }
.manifest-icon-tab-user_profile { background-image: url('/static/icons/user_profile_128.webp.png'); }
/* #endif */

.manifest-icon-placeholder {
  opacity: 0;
  flex: 0 0 auto;
}

.manifest-icon-back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  flex: 0 0 auto;
  vertical-align: middle;
}

.manifest-icon-back-image {
  display: block;
  width: 54rpx;
  height: 54rpx;
  flex: 0 0 auto;
}
</style>

