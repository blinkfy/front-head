import { computed, ref } from 'vue'
import { getHistoryImage, getHistoryRecognitionDetail } from '@/api/history'
import { baseUrl } from '@/api/settings'
import { getHistoryImageState } from './history-image-state.mjs'
import { normalizeHistoryRecognitionDetail } from './history-recognition-detail.mjs'

export function useHistoryDetail({ selectMode, toggleSelect }) {
  const detailVisible = ref(false)
  const imagePreviewVisible = ref(false)
  const detailItem = ref({
    id: null,
    image: '',
    category: '',
    confidence: 0,
    time: '',
    source: '',
    source_name: ''
  })

  const detailImageLoading = ref(false)
  const detailImageFailed = ref(false)
  const detailImageState = computed(() => getHistoryImageState(detailItem.value, detailImageFailed.value))
  let detailImageRequest = 0
  let detailImageRetry = 0
  let detailImageUsingRaw = false
  const detailRecognition = ref(null)
  const detailExtraImageFailed = ref(false)
  const detailExtra = computed(() => normalizeHistoryRecognitionDetail(detailRecognition.value, detailExtraImageFailed.value))
  let detailRecognitionRequest = 0

  // 查看详情时仍尝试加载有图的旧记录；只有缺图或失败时才判断清理期限。
  function viewDetail(item) {
    imagePreviewVisible.value = false
    detailItem.value = { ...item, image: '' }
    detailImageRetry = 0
    detailImageFailed.value = false
    detailVisible.value = true
    loadDetailImage(item)
    loadDetailRecognition(item)
  }

  async function loadDetailRecognition(item) {
    const requestId = ++detailRecognitionRequest
    detailRecognition.value = null
    detailExtraImageFailed.value = false
    if (item.hasDetails !== true) return
    try {
      const res = await getHistoryRecognitionDetail(item.id)
      if (!detailVisible.value || requestId !== detailRecognitionRequest) return
      if (res?.code === 0) detailRecognition.value = res.data?.details || null
    } catch (_) {
      // 补充内容失败不影响原有图片和基础字段。
    }
  }

  async function loadDetailImage(item, preferRaw = true) {
    const requestId = ++detailImageRequest
    detailImageLoading.value = false
    detailImageUsingRaw = false
    if (!item.hasImage) return
    detailImageLoading.value = true
    detailImageFailed.value = false
    // #ifdef APP-PLUS
    const token = uni.getStorageSync('token') || ''
    if (preferRaw && token) {
      detailImageUsingRaw = true
      detailItem.value.image = `${baseUrl}/api/recognition_history/image/${encodeURIComponent(item.id)}?raw=1&token=${encodeURIComponent(token)}&retry=${detailImageRetry}`
      return
    }
    // #endif
    try {
      const res = await getHistoryImage(item.id)
      if (!detailVisible.value || requestId !== detailImageRequest) return
      if (res.code === 0 && res.data?.image) {
        const img = res.data.image
        detailItem.value.image = /^(?:data:|https?:\/\/)/i.test(img) ? img : baseUrl + img
      } else {
        detailImageFailed.value = true
      }
    } catch (_) {
      if (detailVisible.value && requestId === detailImageRequest) detailImageFailed.value = true
    } finally {
      if (requestId === detailImageRequest) detailImageLoading.value = false
    }
  }

  function onDetailImageLoaded() {
    detailImageLoading.value = false
  }

  function onDetailImageError() {
    // #ifdef APP-PLUS
    if (detailVisible.value && detailImageUsingRaw) {
      detailImageUsingRaw = false
      detailItem.value.image = ''
      loadDetailImage(detailItem.value, false)
      return
    }
    // #endif
    detailImageLoading.value = false
    detailItem.value.image = ''
    detailImageFailed.value = true
    onThumbError(detailItem.value.id)
  }

  function retryDetailImage() {
    if (!detailImageLoading.value && detailImageState.value === 'error') {
      detailImageRetry++
      loadDetailImage(detailItem.value)
    }
  }

  // 列表缩略图保持按需加载，失败后可单独重试。
  const thumbFailed = ref({})
  const thumbRetry = ref({})
  function thumbUrl(item) {
    const token = uni.getStorageSync('token') || ''
    return `${baseUrl}/api/recognition_history/image/${item.id}?raw=1&w=240&token=${encodeURIComponent(token)}&retry=${thumbRetry.value[item.id] || 0}`
  }
  function onThumbError(id) {
    thumbFailed.value = { ...thumbFailed.value, [id]: true }
  }
  function onImagePlaceholderTap(item) {
    if (selectMode.value) toggleSelect(item.id)
    else if (getHistoryImageState(item, !!thumbFailed.value[item.id]) === 'error') retryThumb(item)
    else viewDetail(item)
  }
  function retryThumb(item) {
    if (getHistoryImageState(item, !!thumbFailed.value[item.id]) !== 'error') return
    thumbRetry.value = { ...thumbRetry.value, [item.id]: (thumbRetry.value[item.id] || 0) + 1 }
    thumbFailed.value = { ...thumbFailed.value, [item.id]: false }
  }

  let lastFastDetailDismiss = 0
  function onFastDetailDismiss() {
    lastFastDetailDismiss = Date.now()
    closeDetail()
  }

  function onDetailTap() {
    // Avoid handling a second tap event from the same touch after a fast dismissal.
    if (Date.now() - lastFastDetailDismiss < 1000) return
    closeDetail()
  }

  function closeDetail() {
    imagePreviewVisible.value = false
    detailVisible.value = false
    detailImageRequest++
    detailRecognitionRequest++
    detailRecognition.value = null
    detailImageLoading.value = false
  }

  function openImagePreview() {
    if (detailItem.value.image) imagePreviewVisible.value = true
  }

  function closeImagePreview() {
    imagePreviewVisible.value = false
  }

  return {
    detailVisible, imagePreviewVisible, detailItem, detailImageLoading, detailImageState,
    detailExtraImageFailed, detailExtra, thumbFailed, viewDetail, onDetailImageLoaded,
    onDetailImageError, retryDetailImage, thumbUrl, onThumbError, onImagePlaceholderTap,
    onFastDetailDismiss, onDetailTap, closeDetail, openImagePreview, closeImagePreview
  }
}
