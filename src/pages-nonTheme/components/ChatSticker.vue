<template>
  <view class="chat-sticker" :class="{ 'chat-sticker-preview': !animated }" role="img" :aria-label="label">
    <ChatCachedImage v-if="active && (visible || !animated) && urls && !motionLoaded && !thumbnailFailed"
      class="chat-sticker-image" :src="urls.thumbnail" kind="sticker" owner="builtin-stickers"
      mode="aspectFit" eager @error="thumbnailFailed = true" />
    <text v-else-if="animated && thumbnailFailed && !motionLoaded" class="chat-sticker-label">{{ label }}</text>
    <image v-if="motionSrc" :key="motionSrc" class="chat-sticker-image" :src="motionSrc" mode="aspectFit"
      :data-motion-source="motionSrc" :class="{ 'chat-sticker-pending': !motionLoaded }" @load="onMotionLoad" @error="onMotionError" />
  </view>
</template>

<script setup>
import { computed, getCurrentInstance, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ChatCachedImage from './ChatCachedImage.vue'
import { chatSticker } from '@/utils/realtime/chat-sticker.mjs'
import { chatStickerAssetUrls } from '../chat/stickers.js'
import { fetchChatMedia, forgetChatMedia } from '../utils/chat-local-media.js'

const props = defineProps({ stickerId: String, animated: Boolean, active: { type: Boolean, default: true } })
const urls = computed(() => chatStickerAssetUrls(props.stickerId))
const label = computed(() => chatSticker(props.stickerId)?.label || '表情')
const instance = getCurrentInstance()
const visible = ref(false)
const pageVisible = ref(true)
const thumbnailFailed = ref(false)
const motionLoaded = ref(false)
const motionSrc = ref('')
const playing = computed(() => props.animated && props.active && visible.value && pageVisible.value)
let observer, revision = 0, localMotion, sourceIndex = 0

function resetMotion() {
  revision++
  motionSrc.value = ''
  motionLoaded.value = false
  localMotion?.release?.()
  localMotion = null
}

async function loadMotion(index) {
  resetMotion()
  const url = urls.value?.motion[index]
  if (!playing.value || !url) return
  const current = revision
  sourceIndex = index
  if (url.startsWith('/')) {
    motionSrc.value = url
    return
  }
  const result = await fetchChatMedia('builtin-stickers', 'sticker', url)
  if (current !== revision) {
    result?.release?.()
    return
  }
  if (!result) {
    void loadMotion(index + 1)
    return
  }
  localMotion = result
  motionSrc.value = result.url
}

function isCurrentMotion(event) {
  const source = event.currentTarget?.dataset?.motionSource
  return !!motionSrc.value && (source == null || source === motionSrc.value)
}

function onMotionLoad(event) {
  if (isCurrentMotion(event)) motionLoaded.value = true
}

function onMotionError(event) {
  if (!isCurrentMotion(event)) return
  if (localMotion) void forgetChatMedia('builtin-stickers', 'sticker', urls.value.motion[sourceIndex], motionSrc.value)
  void loadMotion(sourceIndex + 1)
}

function updatePageVisibility() {
  // #ifdef H5
  pageVisible.value = !document.hidden
  // #endif
}

watch(() => [playing.value, props.stickerId], () => void loadMotion(0))
watch(() => [props.stickerId, props.active, visible.value], () => { thumbnailFailed.value = false })
onMounted(() => {
  if (!props.animated) return
  try {
    // #ifdef H5
    updatePageVisibility()
    document.addEventListener('visibilitychange', updatePageVisibility)
    observer = new IntersectionObserver(([entry]) => { visible.value = entry.isIntersecting })
    observer.observe(instance.proxy.$el)
    return
    // #endif
    observer = instance.proxy.createIntersectionObserver?.({ thresholds: [0, 0.01] })
      || uni.createIntersectionObserver(instance.proxy, { thresholds: [0, 0.01] })
    observer.relativeToViewport().observe('.chat-sticker', entry => { visible.value = entry.intersectionRatio > 0 })
  } catch (_) {
    visible.value = true
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  resetMotion()
  // #ifdef H5
  if (props.animated) document.removeEventListener('visibilitychange', updatePageVisibility)
  // #endif
})
</script>

<style scoped>
.chat-sticker {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 248rpx;
  height: 296rpx;
  max-width: 100%;
}

.chat-sticker-preview {
  width: 110rpx;
  height: 110rpx;
}

.chat-sticker-image {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.chat-sticker-pending {
  opacity: 0;
}

.chat-sticker-label {
  color: var(--text-secondary);
  font-size: 26rpx;
}
</style>
