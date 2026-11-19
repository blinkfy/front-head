<template>
  <scroll-view class="app-tab-scroll" scroll-y :scroll-top="scrollTop" :scroll-with-animation="scrollAnimated" @scroll="scrolled">
    <component :is="pageComponent" />
  </scroll-view>
</template>

<script setup>
import { onMounted, onBeforeUnmount, provide, ref, nextTick } from 'vue'
import { APP_TAB_CONTEXT } from '@/utils/app-tab-context.js'
import { emitAppTabHook } from '@/utils/app-tab-lifecycle.js'

const props = defineProps({ context: Object, pageComponent: Object })
const emit = defineEmits(['ready'])
provide(APP_TAB_CONTEXT, props.context)
const scrollTop = ref(0)
const scrollAnimated = ref(false)
let lastScroll = 0
function scrolled(event) {
  lastScroll = event.detail.scrollTop || 0
  emitAppTabHook(props.context, 'onPageScroll', { scrollTop: lastScroll })
}
props.context.scrollTo = async options => {
  scrollAnimated.value = Number(options?.duration) > 0
  scrollTop.value = lastScroll
  await nextTick()
  scrollTop.value = Math.max(0, Number(options?.scrollTop) || 0)
  const result = { errMsg: 'pageScrollTo:ok' }
  options?.success?.(result)
  options?.complete?.(result)
}
onMounted(async () => {
  await nextTick()
  emitAppTabHook(props.context, 'onReady')
  emit('ready', props.context)
})
onBeforeUnmount(() => emitAppTabHook(props.context, 'onUnload'))
</script>

<style scoped>
.app-tab-scroll { width: 100%; height: 100%; }
</style>
