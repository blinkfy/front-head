<template>
  <view class="trash-image-editor">
    <view v-if="imageSrc" class="image-preview" @click="preview">
      <image class="thumbnail" :src="imageSrc" mode="aspectFill" />
      <text class="image-hint">点击图片预览</text>
    </view>
    <view v-else class="image-empty">尚未添加图片</view>
    <view class="image-actions">
      <view class="image-action primary" :class="{ disabled: disabled || processing }" @click="chooseImage">
        {{ processing ? '图片处理中…' : (imageSrc ? '替换图片' : '添加图片') }}
      </view>
      <view v-if="imageSrc" class="image-action danger" :class="{ disabled: disabled || processing }" @click="removeImage">删除图片</view>
      <view v-if="processing" class="image-status">正在压缩图片，请稍候</view>
    </view>
  </view>
</template>

<script setup>
import { chooseAppImage } from '@/utils/image-picker.js'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { compressTrashBinImage, resolveTrashBinImage, previewTrashBinImage } from '@/utils/trash-bin-image'

const props = defineProps({ modelValue: { type: String, default: '' }, previewSrc: { type: String, default: '' }, disabled: Boolean })
const emit = defineEmits(['update:modelValue', 'processing'])
const processing = ref(false)
let operationId = 0
const imageSrc = computed(() => resolveTrashBinImage(props.modelValue || props.previewSrc))

watch(() => props.modelValue, () => { operationId += 1 })
onBeforeUnmount(() => { operationId += 1; setProcessing(false) })

function setProcessing(value) {
  processing.value = value
  emit('processing', value)
}

function chooseImage() {
  if (props.disabled || processing.value) return
  const currentOperation = ++operationId
  chooseAppImage({ count: 1, sizeType: ['original'], sourceType: ['album', 'camera'],
    success: async result => {
      const filePath = result.tempFilePaths?.[0]
      if (!filePath || currentOperation !== operationId) return
      setProcessing(true)
      try {
        const compressed = await compressTrashBinImage(filePath)
        if (currentOperation === operationId) emit('update:modelValue', compressed)
      } catch (error) {
        if (currentOperation === operationId) uni.showToast({ title: '图片处理失败，请重试', icon: 'none' })
      } finally {
        if (processing.value) setProcessing(false)
      }
    },
    fail: () => { if (currentOperation === operationId) uni.showToast({ title: '未能选择图片，请重试', icon: 'none' }) }
  })
}

function removeImage() {
  if (props.disabled || processing.value || !imageSrc.value) return
  operationId += 1
  setProcessing(false)
  emit('update:modelValue', '')
}

async function preview() {
  if (!imageSrc.value) return
  try { await previewTrashBinImage(imageSrc.value) }
  catch (error) { uni.showToast({ title: '图片预览失败', icon: 'none' }) }
}
</script>

<style scoped>
.trash-image-editor { display: flex; flex-direction: column; gap: 14rpx; }
.image-preview { display: flex; align-items: center; gap: 14rpx; }
.thumbnail { width: 144rpx; height: 144rpx; border-radius: 12rpx; background: #edf1f4; }
.image-hint, .image-empty, .image-status { color: #8b98a7; font-size: 20rpx; }
.image-empty { padding: 24rpx; border: 1rpx dashed #cbd5dc; border-radius: 12rpx; }
.image-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 12rpx; }
.image-action { padding: 12rpx 18rpx; border-radius: 10rpx; font-size: 20rpx; }
.primary { color: #087d5e; background: #e7f7ef; }
.danger { color: #bd4d4d; background: #fff0ef; }
.disabled { opacity: .48; }
</style>
