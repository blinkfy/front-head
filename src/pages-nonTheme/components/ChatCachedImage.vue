<template>
  <image :key="sourceKey" class="chat-cached-image" :src="displaySrc" :mode="mode"
    :style="!displaySrc && mode === 'widthFix' ? { height: '120rpx' } : null"
    v-show="kind !== 'avatar' || displaySrc"
    :data-message-id="messageId" :data-original-token="originalToken" :data-retry-nonce="retryNonce"
    @load="$emit('load', $event)" @error="onImageError" />
</template>

<script setup>
import { getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { fetchChatMedia, forgetChatMedia, readChatMedia } from '../utils/chat-local-media.mjs'
// #ifdef APP-PLUS
import { forgetMissingChatAvatar, getCachedChatAvatar, loadChatAvatar } from '../utils/chat-avatar-cache.mjs'
// #endif

defineOptions({ options: { virtualHost: true } })
const props = defineProps({
  src: { type: String, default: '' },
  kind: { type: String, default: '' },
  owner: { type: [String, Number], default: '' },
  mode: { type: String, default: 'aspectFill' },
  messageId: { type: [String, Number], default: '' },
  originalToken: { type: String, default: '' },
  retryNonce: { type: [String, Number], default: '' }
})
const emit = defineEmits(['load', 'error', 'avatar-loading'])
const displaySrc = ref('')
const sourceKey = ref(0)
const instance = getCurrentInstance()
let visible = false, disposed = false, observer, revision = 0, local

function releaseLocal() {
  local?.release?.()
  local = null
}

function display(source) {
  displaySrc.value = source
  sourceKey.value++
}

async function load() {
  if (disposed) return
  const current = ++revision
  releaseLocal()
  const { src, owner, kind } = props
  const avatar = kind === 'avatar'
  if (avatar) emit('avatar-loading')
  if (avatar && (/^https?:\/\/ui-avatars\.com(?:[/:?#]|$)/i.test(src) ||
    /(?:^|\/)(?:person\.webp\.png|default-avatar[^/?#]*)(?:[?#]|$)/i.test(src))) {
    display('')
    return
  }
  if (!kind || !/^https?:\/\//i.test(src)) {
    display(src)
    return
  }
  if (!owner || owner === 'unknown') {
    display(src)
    return
  }
  display('')
  // #ifdef APP-PLUS
  if (avatar) {
    const path = getCachedChatAvatar(owner, src) || (visible ? await loadChatAvatar(owner, src) : '')
    if (current === revision && (path || visible)) display(path || src)
    return
  }
  // #endif
  const result = await (visible ? fetchChatMedia(owner, kind, src) : readChatMedia(owner, kind, src))
  if (current !== revision) { result?.release?.(); return }
  local = result
  if (result || visible) display(result?.url || src)
}

function onImageError(event) {
  const { src, owner, kind } = props
  const path = displaySrc.value
  if (!path) return
  // #ifdef APP-PLUS
  if (kind === 'avatar' && path !== src) {
    forgetMissingChatAvatar(owner, src, path)
    display(src)
    return
  }
  // #endif
  if (local?.url === path) {
    releaseLocal()
    void forgetChatMedia(owner, kind, src, path)
    display(src)
    return
  }
  if (kind === 'avatar') display('')
  emit('error', event)
}

function activate() {
  if (visible || disposed) return
  visible = true
  observer?.disconnect()
  if (!displaySrc.value) void load()
}

watch(() => [props.owner, props.src, props.kind], load, { immediate: true })
onMounted(() => nextTick(() => {
  if (disposed) return
  if (props.kind !== 'preview') { activate(); return }
  try {
    // #ifdef H5
    const element = instance.proxy.$el
    observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) activate()
    }, { rootMargin: '160px 0px' })
    observer.observe(element)
    return
    // #endif
    if (typeof uni.createIntersectionObserver !== 'function') { activate(); return }
    observer = instance.proxy.createIntersectionObserver?.() || uni.createIntersectionObserver(instance.proxy)
    observer.relativeToViewport({ top: 160, bottom: 160 }).observe('.chat-cached-image', entry => {
      if (entry.intersectionRatio > 0) activate()
    })
  } catch (_) { activate() }
}))
onBeforeUnmount(() => {
  disposed = true
  revision++
  observer?.disconnect()
  releaseLocal()
})
</script>
