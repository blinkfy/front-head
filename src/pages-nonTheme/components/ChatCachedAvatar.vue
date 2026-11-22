<template>
  <view class="chat-avatar" :style="avatarStyle">
    <text v-if="!loaded">{{ avatarInitial }}</text>
    <view class="chat-avatar-media" :class="{ pending: !loaded }">
      <ChatCachedImage :src="src" :owner="owner" kind="avatar" mode="aspectFill"
        @avatar-loading="loaded = false" @load="loaded = true" @error="loaded = false" />
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import ChatCachedImage from './ChatCachedImage.vue'

defineOptions({ options: { virtualHost: true } })
const props = defineProps({
  src: { type: String, default: '' },
  owner: { type: [String, Number], default: '' },
  avatarName: { type: String, default: '' },
  size: { type: String, default: '80rpx' },
  radius: { type: String, default: '12rpx' }
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
// Keep the square dimensions on the native view instead of depending on styles from a mini program host.
const avatarStyle = computed(() => ({
  width: props.size,
  height: props.size,
  borderRadius: props.radius,
  backgroundColor: loaded.value ? undefined : avatarColor.value
}))
</script>

<style scoped>
.chat-avatar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  color: #fff;
  font-size: 34rpx;
  font-weight: 700;
  line-height: 1;
}
.chat-avatar-media {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: inherit;
}
.chat-avatar-media.pending { opacity: 0; }
</style>
