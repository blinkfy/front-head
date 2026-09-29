<template>
  <view v-if="id === 'back'" class="manifest-icon manifest-icon-back" :style="iconStyle" @click="emitClick">
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

const props = defineProps({
  id: { type: String, required: true },
  scale: { type: Number, default: 1.8 }
})
const emit = defineEmits(['click'])

const fallbackSource = getManifestIconPath('help')
const failedSource = ref('')
const placeholderOnly = ref(false)
const iconStyle = computed(() => props.id === 'back'
  ? { width: '80rpx', height: '80rpx', padding: '0', boxSizing: 'border-box' }
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

function handleImageError() {
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

