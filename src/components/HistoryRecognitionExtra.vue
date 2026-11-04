<template>
  <view v-if="extra.hasContent" class="recognition-extra" :class="{ 'recognition-extra-dark': dark }">
    <view v-if="extra.items.length" class="extra-card">
      <text class="extra-title">识别物品</text>
      <text class="extra-text">{{ extra.items.join('、') }}</text>
    </view>
    <view v-for="section in extra.sections" :key="section.key" class="extra-card">
      <text class="extra-title">{{ section.title }}</text>
      <text class="extra-text">{{ section.content }}</text>
    </view>
    <view v-if="extra.imageUrl" class="extra-card">
      <text class="extra-title">变废为宝效果图</text>
      <image class="extra-image" :src="extra.imageUrl" mode="aspectFit"
        @error="emit('image-error')" @click.stop="previewImage" />
    </view>
  </view>
</template>

<script setup>
import { previewTrashBinImage as previewStoredImage } from '@/utils/trash-bin-image'

const props = defineProps({
  extra: { type: Object, required: true },
  dark: { type: Boolean, default: false }
})
const emit = defineEmits(['image-error'])
async function previewImage() {
  if (!props.extra.imageUrl) return
  try {
    await previewStoredImage(props.extra.imageUrl)
  } catch (_) {
    uni.showToast({ title: '图片暂时无法预览', icon: 'none' })
  }
}
</script>

<style scoped>
.recognition-extra {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  margin-top: 20rpx;
}
.extra-card {
  padding: 20rpx;
  border-radius: 12rpx;
  border: 1rpx solid rgba(16, 185, 129, 0.18);
  background: rgba(255, 255, 255, 0.9);
}
.extra-title {
  display: block;
  margin-bottom: 10rpx;
  font-size: 27rpx;
  line-height: 1.5;
  font-weight: 600;
  color: #047857;
}
.extra-text {
  display: block;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 26rpx;
  line-height: 1.7;
  color: #334155;
}
.extra-image {
  display: block;
  width: 100%;
  height: 340rpx;
  border-radius: 10rpx;
}
.recognition-extra-dark .extra-card {
  border-color: rgba(64, 224, 255, 0.2);
  background: rgba(64, 224, 255, 0.06);
}
.recognition-extra-dark .extra-title { color: #40e0ff; }
.recognition-extra-dark .extra-text { color: #dce6f3; }
</style>
