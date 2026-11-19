<template>
  <view class="chat-file-name" :aria-label="name" :title="name">
    <view v-if="showSuffix" class="file-name-shortened" aria-hidden="true">
      <text class="file-name-lines">{{ stem }}</text>
      <text class="file-name-suffix">{{ suffix }}</text>
    </view>
    <text v-else class="file-name-lines" aria-hidden="true">{{ name }}</text>
    <view v-if="suffix" class="file-name-measure" aria-hidden="true">
      <text class="file-name-probe">{{ name }}</text>
    </view>
  </view>
</template>

<script setup>
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onResize } from '@dcloudio/uni-app'

const props = defineProps({ name: { type: String, default: '' } })
const name = computed(() => props.name || '')
const suffix = computed(() => {
  const match = /(\.tar\.(?:gz|bz2|xz|zst)|\.[^\s./\\]+)$/i.exec(name.value)
  return match?.index > 0 ? match[0] : ''
})
const stem = computed(() => name.value.slice(0, -suffix.value.length))
const showSuffix = ref(false)
const scope = getCurrentInstance()?.proxy
let revision = 0

async function measure() {
  const current = ++revision
  if (!suffix.value) {
    showSuffix.value = false
    return
  }
  await nextTick()
  if (current !== revision || !scope || typeof uni.createSelectorQuery !== 'function') return
  const query = uni.createSelectorQuery().in(scope)
  query.select('.file-name-measure').boundingClientRect()
  query.select('.file-name-probe').boundingClientRect()
  query.exec(results => {
    const [limit, full] = results || []
    if (current === revision && limit?.height > 0 && full?.height > 0) {
      showSuffix.value = full.height > limit.height + 1
    }
  })
}

watch(name, measure)
onMounted(measure)
onResize(measure)
onBeforeUnmount(() => { revision++ })
</script>

<style scoped>
.chat-file-name {
  position: relative;
  min-width: 0;
  color: #333;
  font-size: 28rpx;
  line-height: 38rpx;
}

.file-name-lines,
.file-name-probe {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
  overflow-wrap: anywhere;
  -webkit-line-clamp: 2;
}

.file-name-shortened {
  display: flex;
  align-items: flex-end;
}

.file-name-shortened .file-name-lines {
  flex: 1;
  min-width: 0;
}

.file-name-suffix {
  flex-shrink: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-name-measure {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  height: 76rpx;
  visibility: hidden;
  pointer-events: none;
}

.file-name-probe { -webkit-line-clamp: 3; }
</style>
