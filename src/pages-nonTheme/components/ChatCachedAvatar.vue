<template>
  <view class="chat-avatar" :style="!loaded ? { backgroundColor: avatarColor } : null">
    <text v-if="!loaded">{{ avatarInitial }}</text>
    <ChatCachedImage class="chat-avatar-image" :class="{ pending: !loaded }" :src="src" :owner="owner" kind="avatar"
      @avatar-loading="loaded = false" @load="loaded = true" @error="loaded = false" />
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import ChatCachedImage from './ChatCachedImage.vue'

defineOptions({ options: { virtualHost: true } })
const props = defineProps({
  src: { type: String, default: '' },
  owner: { type: [String, Number], default: '' },
  avatarName: { type: String, default: '' }
})
const loaded = ref(false)
const avatarColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#6C5CE7',
  '#A29BFE', '#FD79A8', '#FDCB6E', '#00B894', '#00CEC9', '#0984E3']
const avatarName = computed(() => props.avatarName.trim())
const avatarInitial = computed(() => Array.from(avatarName.value)[0]?.toUpperCase() || 'U')
const avatarColor = computed(() => {
  const name = avatarName.value
  if (!name) return '#999999'
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return avatarColors[Math.abs(hash) % avatarColors.length]
})
</script>

<style scoped>
.chat-avatar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: #fff;
  font-size: 34rpx;
  font-weight: 700;
  line-height: 1;
}
.chat-avatar-image {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: inherit;
}
.chat-avatar-image.pending { opacity: 0; }
</style>
