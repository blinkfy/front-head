<template>
  <view class="report-photo-picker" :class="{ dark }">
    <view class="report-photo-heading">
      <text class="report-photo-label">问题照片</text>
      <text class="report-photo-count">{{ photos.length }}/3</text>
    </view>
    <view class="report-photo-list">
      <view v-for="(photo, index) in photos" :key="index" class="report-photo-item">
        <image class="report-photo-image" :src="resolveTrashBinImage(photo)" mode="aspectFill" @click.stop="preview(photo)" />
        <view class="report-photo-remove" :class="{ disabled: isDisabled }" @click.stop="removePhoto(index)">×</view>
      </view>
      <view v-if="photos.length < 3" class="report-photo-add" :class="{ disabled: isDisabled }" @click="choosePhotos">
        <text class="report-photo-plus">{{ processing ? '…' : '+' }}</text>
        <text>{{ processing ? '处理中' : '添加照片' }}</text>
      </view>
    </view>
    <text class="report-photo-hint">可选，最多3张，每张不超过500KB</text>
  </view>
</template>

<script setup>
import { computed, ref, onBeforeUnmount } from 'vue'
import { chooseAppImage } from '@/utils/image-picker.js'
import { compressTrashBinImage, previewTrashBinImage, resolveTrashBinImage } from '@/utils/trash-bin-image'
import { createReportPhotoSelection } from '@/utils/report-photo-selection.mjs'

const props = defineProps({ photos: { type: Array, default: () => [] }, dark: Boolean, disabled: Boolean })
const emit = defineEmits(['update:photos', 'processing'])
const processing = ref(false)
const isDisabled = computed(() => props.disabled || processing.value)
const selection = createReportPhotoSelection({
  chooseImage: chooseAppImage,
  compressImage: compressTrashBinImage,
  getPhotos: () => props.photos,
  setPhotos: photos => emit('update:photos', photos),
  setProcessing: value => { processing.value = value; emit('processing', value) },
  canChoose: () => !props.disabled,
  onError: error => uni.showToast({ title: error?.message || '照片处理失败，请重试', icon: 'none' })
})

onBeforeUnmount(() => selection.dispose())

function choosePhotos() {
  if (isDisabled.value) return
  selection.choose()
}

function removePhoto(index) {
  if (isDisabled.value) return
  emit('update:photos', props.photos.filter((_, photoIndex) => photoIndex !== index))
}

async function preview(photo) {
  try { await previewTrashBinImage(photo) }
  catch (_) { uni.showToast({ title: '图片预览失败', icon: 'none' }) }
}
</script>

<style scoped>
.report-photo-picker { margin-top: 22rpx; }
.report-photo-heading { display: flex; justify-content: space-between; margin-bottom: 12rpx; color: #273449; font-size: 25rpx; font-weight: 600; }
.report-photo-count, .report-photo-hint { color: #9aa5b3; font-size: 20rpx; font-weight: 400; }
.report-photo-list { display: flex; flex-wrap: wrap; gap: 14rpx; }
.report-photo-item, .report-photo-add { position: relative; width: 132rpx; height: 132rpx; border-radius: 14rpx; overflow: hidden; }
.report-photo-image { width: 100%; height: 100%; background: #edf1f4; }
.report-photo-remove { position: absolute; top: 4rpx; right: 4rpx; width: 36rpx; height: 36rpx; border-radius: 50%; background: rgba(15, 23, 42, .72); color: #fff; text-align: center; line-height: 32rpx; font-size: 30rpx; }
.report-photo-remove.disabled, .report-photo-add.disabled { opacity: .55; pointer-events: none; }
.report-photo-add { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4rpx; border: 1rpx dashed #cbd5e1; background: #f8fafc; color: #64748b; font-size: 20rpx; box-sizing: border-box; }
.report-photo-plus { font-size: 46rpx; line-height: 1; font-weight: 300; }
.report-photo-hint { display: block; margin-top: 8rpx; }
.dark .report-photo-heading { color: #e2e8f0; }
.dark .report-photo-add { color: #a6b6c8; background: rgba(255,255,255,.04); border-color: #4c6075; }
.dark .report-photo-hint, .dark .report-photo-count { color: #8395a9; }
</style>
