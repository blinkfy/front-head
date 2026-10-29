<template>
  <view v-if="visible" class="contribution-overlay" :class="{ dark }" :style="miniProgramOverlayStyle" @click.self="closeModal" @touchmove.stop @wheel.stop>
    <view class="contribution-modal" :style="miniProgramModalStyle" @click.stop>
      <view class="modal-heading">
        <view><text class="modal-eyebrow">让附近的投放点更好找</text><text class="modal-title">新增垃圾桶</text></view>
        <button class="close-button" aria-label="关闭新增垃圾桶" :disabled="isSubmitting" @click="closeModal">×</button>
      </view>
      <scroll-view class="modal-scroll" scroll-y :scroll-into-view="scrollToReview" scroll-with-animation :show-scrollbar="false" @touchmove.stop @wheel.stop>
        <view class="form-body">
          <view class="reward-banner"><ManifestIcon id="challenge_trophy" class="reward-icon" /><view class="reward-copy"><text class="reward-title">分享一个投放点，收获 {{ BIN_APPROVAL_POINTS }} 积分</text><text class="reward-tip">真实地点 · 照片清晰 · 首次审核通过后发放</text></view></view>
          <view class="form-group">
            <view class="label-row"><text class="form-label">现场照片 <text class="required">*</text></text><text class="field-note">拍清桶身与分类标识</text></view>
            <view v-if="!previewSource" class="photo-empty" @click="chooseImage">
              <ManifestIcon id="camera_scan" class="camera-icon" />
              <view class="photo-copy"><text class="photo-title">拍下垃圾桶和周围环境</text><text class="photo-tip">保留分类标识、附近门牌或明显地标</text></view>
              <text class="photo-plus">＋</text>
            </view>
            <view v-else class="photo-selected">
              <image class="preview-image" :src="previewSource" mode="aspectFill" @click="previewImage" @error="onImageError" />
              <view class="photo-copy"><text class="photo-title">{{ isProcessingImage ? '正在处理照片…' : '照片已就绪' }}</text><text class="photo-tip">{{ imageError || '点击照片可放大查看' }}</text><view class="photo-actions"><button class="text-button" :disabled="formLocked || isProcessingImage" @click="chooseImage">重新拍摄 / 选择</button><button class="text-button remove" :disabled="formLocked || isProcessingImage" @click="removeImage">移除</button></view></view>
            </view>
          </view>
          <view class="form-group">
            <view class="label-row"><text class="form-label">投放位置 <text class="required">*</text></text><text class="field-note">请站在垃圾桶旁定位</text></view>
            <view class="location-card">
              <view class="location-main"><ManifestIcon id="map_location" class="location-icon" /><text class="location-address">{{ isGettingLocation ? '正在定位并查找附近地名…' : (formData.address || (hasLocation ? '已获取坐标，请补充附近地标' : '尚未获取位置')) }}</text></view>
              <text v-if="hasLocation" class="coordinates">{{ Number(formData.latitude).toFixed(6) }}, {{ Number(formData.longitude).toFixed(6) }}</text>
              <view class="location-actions"><button class="location-button" :disabled="isGettingLocation || formLocked" @click="getCurrentLocation()">{{ isGettingLocation ? '定位中…' : '重新定位' }}</button><button class="location-button outlined" :disabled="formLocked" @click="pickMapLocation">地图选点</button></view>
              <view v-if="satelliteCapabilityReady || satelliteReferenceLoading" class="satellite-reference-status"><text class="satellite-reference-copy">{{ satelliteReferenceLoading ? '卫星参考图准备中…可继续填写和提交' : satelliteReference ? 'AI 卫星参考图已就绪' : 'AI 卫星参考图暂不可用' }}</text><button v-if="satelliteReference" class="satellite-reference-link" @click="previewSatelliteReference">查看参考图</button></view>
            </view>
          </view>
          <view class="form-group">
            <text class="form-label">垃圾桶名称 <text class="required">*</text></text>
            <input v-model="formData.name" class="form-input" placeholder="如：阳光小区东门分类垃圾桶" placeholder-class="input-placeholder" maxlength="50" :disabled="formLocked" />
          </view>
          <view class="form-group last-group">
            <view class="label-row"><text class="form-label">详细描述</text><text class="field-note">{{ formData.description.length }}/200</text></view>
            <textarea v-model="formData.description" class="form-textarea" placeholder="如：4个分类桶，标识清晰，位于东门便利店旁；可补充外观和使用情况" placeholder-class="input-placeholder" maxlength="200" :disabled="formLocked" :show-confirm-bar="false" />
            <text class="description-tip">附近地名会自动补充，重新定位时替换；你填写的内容会保留。</text>
          </view>
          <view v-if="isReviewing && reviewPreview" id="bin-review-preview" class="review-card" :class="{ rejected: !reviewPreview.passed }">
            <text class="review-title">{{ reviewPreview.passed ? 'AI 初步检查通过' : 'AI 初步检查未通过' }}</text>
            <text v-if="!reviewPreview.passed && reviewPreview.reason" class="review-reason">{{ reviewPreview.reason }}</text>
            <template v-if="reviewPreview.passed">
              <text v-if="reviewPreview.suggestions.name && reviewPreview.suggestions.name !== formData.name.trim()" class="review-suggestion">建议名称：{{ reviewPreview.suggestions.name }}</text>
              <text v-if="reviewPreview.suggestions.description && reviewPreview.suggestions.description !== formData.description.trim()" class="review-suggestion">详细描述建议：{{ reviewPreview.suggestions.description }}</text>
              <text v-if="reviewPreview.suggestions.summary" class="review-summary">{{ reviewPreview.suggestions.summary }}</text>
              <text class="review-disclaimer">正在整理建议，接收完成后可选择应用或保留原样。</text>
            </template>
            <text v-else class="review-disclaimer">正在整理审核反馈，请稍候。</text>
          </view>
          <view v-if="reviewResult" id="bin-review-result" class="review-card" :class="{ rejected: !reviewResult.passed }">
            <text class="review-title">{{ reviewResult.passed ? 'AI 初审通过 · 100%' : 'AI 初审未通过 · 100%' }}</text>
            <text v-if="!reviewResult.passed" class="review-reason">{{ reviewResult.reason || '请核对照片与填写信息后重试。' }}</text>
            <template v-if="reviewResult.passed">
              <text v-if="reviewResult.suggestions.summary" class="review-summary">{{ reviewResult.suggestions.summary }}</text>
              <text v-if="reviewResult.suggestions.name && reviewResult.suggestions.name !== formData.name.trim()" class="review-suggestion">建议名称：{{ reviewResult.suggestions.name }}</text>
              <text v-if="reviewResult.suggestions.description && reviewResult.suggestions.description !== formData.description.trim()" class="review-suggestion">详细描述建议：{{ reviewResult.suggestions.description }}</text>
              <button v-if="hasSuggestions && !reviewResult.applied" class="apply-suggestions" :disabled="formLocked" @click="applySuggestions">应用建议</button>
              <text v-if="reviewResult.applied" class="review-summary">已应用建议，请核对后提交。</text>
              <text class="review-disclaimer">也可保留原样，最终以管理员审核为准。</text>
            </template>
            <text v-else-if="reviewResult.reason" class="review-disclaimer">请根据原因调整照片或信息，再次提交初审。</text>
          </view>
        </view>
      </scroll-view>
      <view class="modal-footer">
        <view v-if="isReviewing" class="review-progress" role="status" aria-live="polite">
          <view class="progress-heading"><text>{{ reviewPhase === 'advising' ? '初审通过，正在整理建议' : reviewPhase === 'reviewing' ? 'AI 初审中' : '正在准备提交…' }}</text><text v-if="reviewPhase !== 'checking'" class="progress-value">{{ reviewProgress }}%</text></view>
          <view v-if="reviewPhase !== 'checking'" class="progress-track"><view class="progress-fill" :style="{ width: reviewProgress + '%' }"></view></view>
          <text class="progress-tip">{{ reviewPhase === 'advising' ? '建议会逐项显示，接收完成后可应用' : reviewPhase === 'reviewing' ? '等待进度 · 正在核对照片与填写信息' : '正在检查审核服务' }}</text>
        </view>
        <text v-if="notice" class="form-notice" role="alert">{{ notice }}</text>
        <view class="footer-actions"><button class="cancel-button" :disabled="isSubmitting" @click="closeModal">取消</button><button class="submit-button" :disabled="!canSubmit" @click="handleSubmit">{{ submitLabel }}</button></view>
        <button v-if="manualFallback" class="retry-review" :disabled="formLocked" @click="retryPreReview">重试 AI 初审</button>
        <text class="footer-tip">{{ reviewResult ? '管理员审核通过后展示并发放积分' : '审核通过后在地图展示，积分自动到账' }}</text>
      </view>
    </view>
    <!-- #ifdef H5 -->
    <view v-if="imagePreviewVisible && imagePreviewSource" class="satellite-preview-overlay" role="dialog" :aria-label="`${imagePreviewTitle}预览`" @click.self="closeImagePreview" @touchmove.stop @wheel.stop>
      <button class="satellite-preview-close" aria-label="关闭图片预览" @click.stop="closeImagePreview">×</button>
      <image class="satellite-preview-image" :src="imagePreviewSource" mode="aspectFit" />
      <text class="satellite-preview-caption">{{ imagePreviewTitle }} · 点击空白处关闭</text>
    </view>
    <!-- #endif -->
  </view>
</template>

<script setup>
import { chooseAppImage } from '@/utils/image-picker.js'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import ManifestIcon from './ManifestIcon.vue'
import { addTrashBin, reverseGeocoder, getBinPreReviewCapability, getBinSatelliteReference, preReviewTrashBin } from '@/api/map'
import { getUserLocationOnce } from '@/utils/location'
import { normalizeSatelliteReference } from '@/utils/bin-satellite-reference.mjs'
import { resolveLocationAddress } from '@/utils/location-address'
import { compressTrashBinImage, previewTrashBinImage } from '@/utils/trash-bin-image'
import { BIN_APPROVAL_POINTS, mergeBinLocation, validBinCoordinates } from '@/utils/bin-contribution.mjs'
import { BIN_PRE_REVIEW_SUGGESTION_ESTIMATE_MS, binReviewWaitingProgress, isLegacyBinReviewError, normalizeBinPreReview, normalizeBinReviewPreview, preserveBinDescription, sameBinSubmission, withBinReviewDeadline } from '@/utils/bin-pre-review.mjs'

const props = defineProps({ visible: Boolean, userLocation: { type: Object, default: () => ({}) }, dark: Boolean })
const emit = defineEmits(['close', 'success'])
const emptyForm = () => ({ name: '', description: '', latitude: null, longitude: null, address: '', image: '' })
const formData = ref(emptyForm()), previewSource = ref(''), imageError = ref(''), notice = ref('')
const isGettingLocation = ref(false), isSubmitting = ref(false), isProcessingImage = ref(false)
const miniProgramOverlayStyle = ref({}), miniProgramModalStyle = ref({})
const isReviewing = ref(false), reviewResult = ref(null), manualFallback = ref(false), scrollToReview = ref('')
const reviewPhase = ref('checking'), reviewProgress = ref(0), reviewPreview = ref(null)
let reviewProgressTimer = null
const formLocked = computed(() => isSubmitting.value || isReviewing.value)
let reviewRevision = 0, reviewedPayload = null, applyingSuggestion = false, restorePageScroll
const currentPayload = () => ({ name: formData.value.name.trim(), description: formData.value.description.trim(), latitude: formData.value.latitude, longitude: formData.value.longitude, image: formData.value.image })
const hasSuggestions = computed(() => {
  const suggestion = reviewResult.value?.suggestions
  return !!suggestion && ((suggestion.name && suggestion.name !== formData.value.name.trim()) || (suggestion.description && suggestion.description !== formData.value.description.trim()))
})
const unchangedRejection = computed(() => reviewResult.value?.passed === false && sameBinSubmission(reviewedPayload, currentPayload()))
const submitLabel = computed(() => isSubmitting.value ? '正在提交…' : isReviewing.value ? (reviewPhase.value === 'checking' ? '准备提交…' : `${reviewPhase.value === 'advising' ? '建议加载' : 'AI 初审'} ${reviewProgress.value}%`) : isProcessingImage.value ? '照片处理中…' : unchangedRejection.value ? '修改后重新初审' : manualFallback.value ? '提交人工审核' : reviewResult.value?.passed ? (reviewResult.value.applied ? '提交人工审核' : '保留原样并提交') : '提交审核')
const hasLocation = computed(() => validBinCoordinates(formData.value))
const canSubmit = computed(() => !!formData.value.name.trim() && hasLocation.value && !!formData.value.image && !formLocked.value && !isProcessingImage.value && !isGettingLocation.value && !unchangedRejection.value)
let locationRevision = 0, imageRevision = 0, automaticLocation = '', pickerEvent = '', pickerHandler
const satelliteReference = ref(null), satelliteReferenceLoading = ref(false), satelliteCapabilityReady = ref(false)
const imagePreviewVisible = ref(false), imagePreviewSource = ref(''), imagePreviewTitle = ref('')
let satelliteCapability = null, pickerSatelliteReference = null
const activeLocation = token => props.visible && token === locationRevision
watch(() => [formData.value.name, formData.value.description, formData.value.latitude, formData.value.longitude, formData.value.image], () => {
  if (applyingSuggestion) return
  ++reviewRevision; stopReviewProgress(); isReviewing.value = false; reviewPreview.value = null; reviewResult.value = null; reviewedPayload = null; manualFallback.value = false; scrollToReview.value = ''
}, { flush: 'sync' })

function updateMiniProgramModalInsets() {
  // #ifdef MP-WEIXIN
  try {
    const info = typeof uni.getWindowInfo === 'function' ? uni.getWindowInfo() : uni.getSystemInfoSync()
    const capsule = uni.getMenuButtonBoundingClientRect()
    const capsuleBottom = Number(capsule?.bottom) || (Number(capsule?.top) + Number(capsule?.height)) || 0
    const top = Math.max(capsuleBottom, (Number(info.statusBarHeight) || 0) + 44) + 12
    miniProgramOverlayStyle.value = { paddingTop: `${top}px` }
    miniProgramModalStyle.value = { maxHeight: Number(info.windowHeight) > top + 12 ? `${Math.min(820, Number(info.windowHeight) - top - 12)}px` : `calc(100vh - ${top + 12}px)` }
  } catch (_) {
    // Keep the close button below the custom navigation area if capsule metrics are unavailable.
    miniProgramOverlayStyle.value = { paddingTop: 'calc(env(safe-area-inset-top) + 56px)' }
    miniProgramModalStyle.value = { maxHeight: 'calc(100vh - env(safe-area-inset-top) - 68px)' }
  }
  // #endif
}

function lockPageScroll(locked) {
  // #ifdef H5
  if (locked && !restorePageScroll) {
    const bodyOverflow = document.body.style.overflow
    const rootOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'; document.documentElement.style.overflow = 'hidden'
    restorePageScroll = () => { document.body.style.overflow = bodyOverflow; document.documentElement.style.overflow = rootOverflow }
  } else if (!locked && restorePageScroll) { restorePageScroll(); restorePageScroll = null }
  // #endif
}

function detachPicker() {
  if (pickerEvent && pickerHandler) uni.$off(pickerEvent, pickerHandler)
  pickerEvent = ''; pickerHandler = null
}
watch(() => props.visible, visible => {
  ++locationRevision; ++imageRevision; ++reviewRevision; stopReviewProgress(); detachPicker(); lockPageScroll(visible)
  isReviewing.value = false; reviewPreview.value = null; reviewResult.value = null; reviewedPayload = null; manualFallback.value = false; scrollToReview.value = ''
  isGettingLocation.value = false; isProcessingImage.value = false
  satelliteReference.value = null; satelliteReferenceLoading.value = false; satelliteCapabilityReady.value = false; satelliteCapability = null; pickerSatelliteReference = null; imagePreviewVisible.value = false; imagePreviewSource.value = ''; imagePreviewTitle.value = ''
  if (!visible) return
  updateMiniProgramModalInsets()
  formData.value = emptyForm(); previewSource.value = ''; imageError.value = ''; notice.value = ''; automaticLocation = ''
  getCurrentLocation(validBinCoordinates(props.userLocation) ? props.userLocation : null)
}, { immediate: true })
onBeforeUnmount(() => { ++locationRevision; ++imageRevision; ++reviewRevision; stopReviewProgress(); detachPicker(); lockPageScroll(false) })

function applyAddress(address) {
  formData.value.address = String(address || '').trim()
  const merged = mergeBinLocation(formData.value.description, automaticLocation, formData.value.address)
  formData.value.description = merged.description
  automaticLocation = merged.automatic
}
async function getCurrentLocation(existing = null) {
  if (isGettingLocation.value || formLocked.value) return
  const token = ++locationRevision
  notice.value = ''; isGettingLocation.value = true; satelliteReference.value = null; satelliteReferenceLoading.value = false; satelliteCapabilityReady.value = false; satelliteCapability = null; pickerSatelliteReference = null
  try {
    const location = existing || await getUserLocationOnce('gcj02')
    if (!activeLocation(token)) return
    if (!validBinCoordinates(location)) throw new Error('定位结果无效')
    formData.value.latitude = Number(location.latitude); formData.value.longitude = Number(location.longitude)
    prepareSatelliteReference(token)
    const result = await resolveLocationAddress(location.latitude, location.longitude)
    if (activeLocation(token)) {
      applyAddress(result.address)
      if (!result.address) notice.value = '已定位，未获取到附近地名，请在描述中补充地标。'
    }
  } catch (error) {
    if (activeLocation(token)) {
      applyAddress('')
      notice.value = hasLocation.value ? '已获取坐标，地址解析暂不可用，请补充附近地标或地图选点。' : '定位失败，请允许定位权限，或使用地图选点。'
    }
  } finally { if (activeLocation(token)) isGettingLocation.value = false }
}
function pickMapLocation() {
  if (formLocked.value) return
  ++locationRevision; isGettingLocation.value = false; detachPicker()
  pickerEvent = `bin-location-${Date.now()}-${Math.random().toString(36).slice(2)}`
  pickerHandler = async location => {
    detachPicker()
    if (!props.visible || !validBinCoordinates(location)) return
    const token = ++locationRevision
    formData.value.latitude = Number(location.latitude); formData.value.longitude = Number(location.longitude)
    pickerSatelliteReference = normalizeSatelliteReference(location.satelliteReference, location)
    prepareSatelliteReference(token)
    if (location.address) { applyAddress(location.address); notice.value = ''; return }
    isGettingLocation.value = true
    try {
      const response = await reverseGeocoder(location.latitude, location.longitude)
      const result = response?.data?.result || response?.result || response?.data || {}
      if (activeLocation(token)) applyAddress(result.formatted_addresses?.recommend || result.address || '')
    } catch (_) { if (activeLocation(token)) { applyAddress(''); notice.value = '已选取坐标，请补充附近地标。' } }
    finally { if (activeLocation(token)) isGettingLocation.value = false }
  }
  uni.$on(pickerEvent, pickerHandler)
  const page = props.dark ? '/pages-dark/map/map' : '/pages/map/map'
  const origin = hasLocation.value ? `&lat=${formData.value.latitude}&lng=${formData.value.longitude}` : ''
  uni.navigateTo({ url: `${page}?mode=select&purpose=bin&returnEvent=${encodeURIComponent(pickerEvent)}${origin}`, fail: () => { detachPicker(); notice.value = '地图暂时无法打开，请重试。' } })
}
function chooseImage() {
  if (formLocked.value || isProcessingImage.value) return
  const token = ++imageRevision
  chooseAppImage({ count: 1, sizeType: ['original'], sourceType: ['camera', 'album'],
    success: async result => {
      const path = result.tempFilePaths?.[0]
      if (!path || !props.visible || token !== imageRevision) return
      isProcessingImage.value = true; notice.value = ''; imageError.value = ''
      const previousPreview = previewSource.value
      previewSource.value = path
      try {
        const image = await compressTrashBinImage(path)
        if (!props.visible || token !== imageRevision) return
        formData.value.image = image
        // H5 uses the processed data URI; native platforms retain the accessible local thumbnail path.
        // #ifdef H5
        previewSource.value = image
        // #endif
      } catch (error) {
        if (props.visible && token === imageRevision) { previewSource.value = previousPreview; notice.value = error.message || '照片处理失败，请重新选择。' }
      } finally { if (token === imageRevision) isProcessingImage.value = false }
    },
    fail: error => { if (props.visible && token === imageRevision && !/cancel/i.test(error.errMsg || '')) notice.value = '未能选择照片，请重试。' }
  })
}
function removeImage() {
  if (formLocked.value || isProcessingImage.value) return
  ++imageRevision; formData.value.image = ''; previewSource.value = ''; imageError.value = ''
}
function onImageError() { imageError.value = '照片显示失败，请重新选择'; notice.value = imageError.value }
function previewImage() {
  if (isProcessingImage.value) return
  const source = previewSource.value || formData.value.image
  // #ifdef H5
  openImagePreview(source, '现场照片')
  // #else
  previewNativeImage(source)
  // #endif
}
function previewSatelliteReference() {
  const image = satelliteReference.value?.image
  if (!image) return
  // #ifdef H5
  openImagePreview(image, 'AI 卫星参考图')
  // #else
  previewNativeImage(image)
  // #endif
}
async function previewNativeImage(source) {
  try { await previewTrashBinImage(source) }
  catch (_) { notice.value = '暂时无法预览，请重试。' }
}
function openImagePreview(source, title) {
  if (!source) return
  imagePreviewSource.value = source; imagePreviewTitle.value = title; imagePreviewVisible.value = true
}
function closeImagePreview() { imagePreviewVisible.value = false; imagePreviewSource.value = ''; imagePreviewTitle.value = '' }
function satelliteLog(event, details = {}) { console.info('[bin-satellite-reference]', event, details) }
async function prepareSatelliteReference(token) {
  satelliteReference.value = null; satelliteCapabilityReady.value = false; satelliteReferenceLoading.value = false; satelliteCapability = null
  if (!activeLocation(token) || !validBinCoordinates(formData.value)) return
  const location = { latitude: Number(formData.value.latitude), longitude: Number(formData.value.longitude) }
  const started = Date.now()
  satelliteReferenceLoading.value = true
  satelliteLog('start')
  try {
    const response = await getBinPreReviewCapability()
    if (!activeLocation(token)) { satelliteLog('stale response'); return }
    const capability = response?.data
    if (capability?.supported !== true || capability.enabled !== true) { const reason = capability?.enabled === false ? 'disabled' : 'unsupported'; satelliteLog(reason); return }
    satelliteCapability = capability
    satelliteCapabilityReady.value = capability.satelliteReferenceFetch === true || (capability.satelliteReference === true && !!pickerSatelliteReference)
    if (capability.satelliteReferenceFetch !== true) {
      satelliteLog('unsupported', { reason: 'satelliteReferenceFetch' })
      if (capability.satelliteReference === true && pickerSatelliteReference) satelliteReference.value = pickerSatelliteReference
      return
    }
    const result = await getBinSatelliteReference(location.latitude, location.longitude)
    if (!activeLocation(token)) { satelliteLog('stale response'); return }
    const data = result?.data
    const normalized = normalizeSatelliteReference(data, location)
    if (!normalized) {
      satelliteLog('failed', { reason: result?.msg || 'invalid_response' })
      if (result?.msg !== 'no_satellite_imagery' && capability.satelliteReference === true && pickerSatelliteReference) satelliteReference.value = pickerSatelliteReference
      return
    }
    satelliteReference.value = { ...normalized, source: data.source, cached: data.cached === true }
    const bytes = Math.round(normalized.image.length * 3 / 4)
    satelliteLog('success', { durationMs: Date.now() - started, KB: Math.round(bytes / 1024 * 10) / 10, cached: data.cached === true, zoom: data.zoom, source: data.source || 'unknown' })
  } catch (error) {
    if (!activeLocation(token)) { satelliteLog('stale response'); return }
    satelliteLog('failed', { reason: error?.msg || error?.message || 'unavailable' })
    if (satelliteCapability?.satelliteReference === true && pickerSatelliteReference) satelliteReference.value = pickerSatelliteReference
  } finally {
    if (activeLocation(token)) satelliteReferenceLoading.value = false
  }
}
function applySuggestions() {
  if (formLocked.value || !reviewResult.value?.passed || !sameBinSubmission(reviewedPayload, currentPayload())) return
  const suggestion = reviewResult.value.suggestions
  applyingSuggestion = true
  try {
    if (suggestion.name) formData.value.name = suggestion.name
    if (suggestion.description) formData.value.description = preserveBinDescription(formData.value.description, suggestion.description)
    reviewedPayload = currentPayload(); reviewResult.value.applied = true
  } finally { applyingSuggestion = false }
}
function retryPreReview() {
  if (formLocked.value) return
  manualFallback.value = false
  handleSubmit()
}
function stopReviewProgress() {
  if (reviewProgressTimer) clearInterval(reviewProgressTimer)
  reviewProgressTimer = null
}
function startReviewProgress(estimateMs, phase = 'reviewing') {
  stopReviewProgress()
  reviewPhase.value = phase; reviewProgress.value = 4
  const started = Date.now()
  reviewProgressTimer = setInterval(() => { reviewProgress.value = binReviewWaitingProgress(Date.now() - started, estimateMs) }, 200)
}
async function checkPreReview(payload, active) {
  let capability
  try { capability = (await getBinPreReviewCapability())?.data }
  catch (error) { if (isLegacyBinReviewError(error)) return { skip: true }; throw error }
  if (!active()) return null
  // Missing fields cover older servers returning a generic successful response.
  if (capability?.supported !== true || capability.enabled !== true) return { skip: true }
  if (capability.available === false) throw new Error('AI 初审暂不可用')
  startReviewProgress(capability.estimatedDurationMs)
  const reference = capability.satelliteReference === true ? normalizeSatelliteReference(satelliteReference.value, payload) : null
  satelliteLog('submit', { attached: !!reference, reason: reference ? 'ready' : capability.satelliteReference !== true ? 'unsupported' : satelliteReferenceLoading.value ? 'still_preparing' : 'unavailable' })
  const reviewPayload = reference ? { ...payload, satelliteReference: reference } : payload
  let response
  try { response = await preReviewTrashBin(reviewPayload, capability.progress === true ? {
    isActive: active,
    onProgress: snapshot => {
      if (!active()) return
      const preview = normalizeBinReviewPreview(snapshot.preview, payload.description)
      if (!preview) return
      const firstVerdict = !reviewPreview.value
      reviewPreview.value = preview
      if (preview.passed && reviewPhase.value !== 'advising') startReviewProgress(capability.suggestionDurationMs || BIN_PRE_REVIEW_SUGGESTION_ESTIMATE_MS, 'advising')
      if (firstVerdict) nextTick(() => { if (active()) scrollToReview.value = 'bin-review-preview' })
    }
  } : undefined) }
  catch (error) { if (isLegacyBinReviewError(error)) return { skip: true }; throw error }
  const data = response?.data
  if (data?.enabled === false || data?.supported === false) return { skip: true }
  const normalized = normalizeBinPreReview(data, payload.description)
  if (!normalized) throw new Error('AI 初审暂不可用')
  return { decision: normalized }
}
async function handleSubmit() {
  if (!canSubmit.value) return
  const payload = currentPayload()
  if (manualFallback.value || (reviewResult.value?.passed && sameBinSubmission(reviewedPayload, payload))) return submitContribution(payload)
  const token = ++reviewRevision
  let finished = false
  const active = () => !finished && props.visible && token === reviewRevision && sameBinSubmission(payload, currentPayload())
  isReviewing.value = true; reviewPreview.value = null; reviewPhase.value = 'checking'; reviewProgress.value = 0; notice.value = ''
  try {
    const outcome = await withBinReviewDeadline(() => checkPreReview(payload, active))
    if (!active() || !outcome) return
    stopReviewProgress(); isReviewing.value = false
    if (outcome.skip) return await submitContribution(payload)
    reviewProgress.value = 100
    reviewedPayload = payload; reviewResult.value = outcome.decision
    await nextTick()
    if (active()) scrollToReview.value = 'bin-review-result'
  } catch (error) {
    if (!active()) return
    if ([401, 403].includes(Number(error?.code || error?.statusCode))) { notice.value = error.msg || error.message || '请重新登录'; return }
    manualFallback.value = true
    notice.value = error.message === 'AI_PRE_REVIEW_TIMEOUT' ? 'AI 初审等待超时，可重试，或提交管理员人工审核。' : 'AI 初审暂不可用，可重试，或提交管理员人工审核。'
  } finally { finished = true; if (token === reviewRevision) { stopReviewProgress(); isReviewing.value = false } }
}
async function submitContribution(payload) {
  if (isSubmitting.value) return
  isSubmitting.value = true; notice.value = ''
  try {
    const result = await addTrashBin(payload)
    if (!result || (result.code !== 0 && result.code !== 200)) throw new Error(result?.msg || result?.message || '提交失败，请重试')
    emit('success', payload); emit('close')
  } catch (error) { notice.value = error.message || error.msg || '提交失败，请重试' }
  finally { isSubmitting.value = false }
}
function closeModal() { if (!isSubmitting.value) emit('close') }
</script>

<style scoped>
.contribution-overlay { --ink: #203933; --muted: #7e928b; --line: #e2ece7; --card: #fff; --soft: #f3f8f5; position: fixed; inset: 0; z-index: 20000; display: flex; align-items: center; justify-content: center; padding: 18px; box-sizing: border-box; background: rgba(13, 35, 29, .48); overscroll-behavior: none; }
.contribution-overlay.dark { --ink: #e5f4ee; --muted: #9aafa8; --line: #36514a; --card: #1b302a; --soft: #243e35; }
.contribution-modal { display: flex; flex-direction: column; width: 100%; max-width: 480px; height: 90vh; max-height: 820px; border-radius: 24px; background: var(--card); color: var(--ink); box-shadow: 0 18px 70px rgba(8, 42, 29, .22); overflow: hidden; }
.modal-heading { flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; padding: 22px 22px 16px; }
.modal-eyebrow { display: block; font-size: 13px; color: var(--muted); letter-spacing: 1px; margin-bottom: 5px; }
.modal-title { display: block; font-size: 24px; font-weight: 700; }
.close-button { margin: 0; padding: 0; width: 32px; height: 32px; line-height: 30px; border-radius: 50%; font-size: 25px; background: var(--soft); color: var(--muted); }
button::after { border: 0; }
button[disabled] { opacity: .5; }
.modal-scroll { flex: 1; min-height: 0; height: 0; overflow: hidden; overscroll-behavior: contain; touch-action: pan-y; }
.form-body { padding: 0 22px 8px; }
.reward-banner { display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 14px; margin-bottom: 20px; background: var(--soft); }
.reward-icon { flex-shrink: 0; width: 30px; height: 30px; }
.reward-copy { flex: 1; min-width: 0; }
.reward-title { display: block; font-size: 15px; font-weight: 600; color: #06916b; line-height: 1.6; }
.reward-tip { display: block; font-size: 12px; color: var(--muted); margin-top: 3px; line-height: 1.5; }
.form-group { margin-bottom: 18px; }
.last-group { margin-bottom: 0; }
.label-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 9px; }
.form-label { display: block; font-size: 16px; font-weight: 600; margin-bottom: 9px; }
.label-row .form-label { margin-bottom: 0; }
.required { color: #0ca77d; }
.field-note { font-size: 12px; color: var(--muted); }
.photo-empty, .photo-selected { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 90px; padding: 14px; box-sizing: border-box; border: 1px dashed #b8d7c7; border-radius: 14px; background: var(--soft); }
.camera-icon { flex-shrink: 0; width: 38px; height: 38px; }
.photo-copy { flex: 1; min-width: 0; }
.photo-title { display: block; font-size: 16px; font-weight: 600; line-height: 1.6; }
.photo-tip { display: block; font-size: 12px; color: var(--muted); line-height: 1.6; margin-top: 4px; }
.photo-plus { color: #129c76; font-size: 24px; }
.photo-selected { padding: 10px; border-style: solid; border-color: var(--line); }
.preview-image { display: block; width: 90px; height: 90px; flex-shrink: 0; border-radius: 9px; background: #dce9e1; }
.photo-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 7px; }
.text-button { font-size: 12px; line-height: 1.6; padding: 0; margin: 0; color: #079873; background: transparent; }
.text-button.remove { color: var(--muted); }
.location-card { padding: 12px; border: 1px solid var(--line); border-radius: 14px; background: var(--soft); }
.location-main { display: flex; align-items: flex-start; gap: 7px; }
.location-icon { width: 17px; height: 17px; flex-shrink: 0; margin-top: 2px; }
.location-address { font-size: 16px; line-height: 1.7; overflow-wrap: anywhere; }
.coordinates { display: block; margin: 5px 0 0 24px; font-size: 12px; color: var(--muted); }
.location-actions { display: flex; gap: 10px; margin-top: 11px; }
.satellite-reference-status { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 8px 0 0 24px; }
.satellite-reference-copy { color: var(--muted); font-size: 12px; line-height: 1.5; }
.satellite-reference-link { flex-shrink: 0; margin: 0; padding: 0; background: transparent; color: #079873; font-size: 12px; line-height: 1.5; }
.location-button { flex: 1; padding: 8px 0; margin: 0; font-size: 16px; line-height: 1.7; border-radius: 8px; background: #e0f1e8; color: #0a8665; }
.location-button.outlined { background: var(--card); border: 1px solid var(--line); box-sizing: border-box; }
.form-input, .form-textarea { display: block; width: 100%; box-sizing: border-box; border: 1px solid var(--line); border-radius: 11px; background: var(--soft); color: var(--ink); font-size: 16px; }
.form-input { height: 42px; padding: 0 12px; }
.form-textarea { height: 100px; padding: 10px 12px; line-height: 1.7; }
.input-placeholder { color: #8c9e96; }
.description-tip { display: block; margin-top: 7px; color: var(--muted); font-size: 12px; line-height: 1.6; }
.modal-footer { position: relative; z-index: 1; flex-shrink: 0; padding: 14px 22px 15px; border-top: 1px solid var(--line); background: var(--card); }
.footer-actions { display: flex; gap: 12px; }
.cancel-button, .submit-button { margin: 0; padding: 11px 0; border-radius: 12px; font-size: 16px; font-weight: 600; line-height: 1.5; }
.cancel-button { width: 80px; background: var(--soft); color: var(--muted); }
.submit-button { flex: 1; background: #06a778; color: #fff; }
.submit-button[disabled] { color: #fff; background: #91cbb4; }
.footer-tip { display: block; color: var(--muted); font-size: 12px; text-align: center; margin-top: 10px; line-height: 1.5; }
.form-notice { display: block; font-size: 13px; line-height: 1.6; margin-bottom: 9px; color: #bf6247; }
.review-progress { padding: 0 0 12px; }
.progress-heading { display: flex; justify-content: space-between; align-items: center; color: var(--ink); font-size: 15px; font-weight: 600; }
.progress-value { color: #07936b; }
.progress-track { height: 7px; margin-top: 10px; overflow: hidden; border-radius: 7px; background: var(--line); }
.progress-fill { height: 100%; background: #08ad7e; border-radius: 7px; transition: width 220ms linear; }
.progress-tip { display: block; margin-top: 7px; color: var(--muted); font-size: 12px; line-height: 1.6; }
.review-card { margin-top: 20px; padding: 14px; border: 1px solid #b2dccc; border-radius: 14px; background: var(--soft); }
.review-card.rejected { border-color: #e5b69c; }
.review-title { display: block; color: #078461; font-size: 17px; font-weight: 600; margin-bottom: 8px; }
.rejected .review-title { color: #b35d39; }
.review-reason, .review-suggestion { display: block; color: var(--ink); font-size: 16px; line-height: 1.8; overflow-wrap: anywhere; }
.review-summary, .review-disclaimer { display: block; margin-top: 8px; color: var(--muted); font-size: 12px; line-height: 1.7; }
.apply-suggestions { margin: 12px 0 0; padding: 8px; background: #d8eee3; color: #087c5d; border-radius: 10px; font-size: 15px; line-height: 1.6; }
.retry-review { padding: 6px 0 0; margin: 0; background: transparent; color: #087c5d; font-size: 13px; line-height: 1.6; }
.satellite-preview-overlay { position: fixed; inset: 0; z-index: 21000; display: flex; align-items: center; justify-content: center; padding: 52px 18px 54px; box-sizing: border-box; background: rgba(5, 12, 10, .92); }
.satellite-preview-image { display: block; width: 100%; height: 100%; max-width: 720px; }
.satellite-preview-close { position: absolute; top: max(16px, env(safe-area-inset-top)); right: 16px; z-index: 1; width: 38px; height: 38px; margin: 0; padding: 0; border-radius: 50%; background: rgba(255, 255, 255, .16); color: #fff; font-size: 26px; line-height: 36px; }
.satellite-preview-caption { position: absolute; bottom: max(18px, env(safe-area-inset-bottom)); left: 0; right: 0; color: rgba(255, 255, 255, .82); font-size: 12px; line-height: 1.5; text-align: center; pointer-events: none; }
@media (max-width: 420px) { .contribution-overlay { padding: 12px; } .contribution-modal { height: 92vh; max-height: 820px; border-radius: 20px; } .modal-heading { padding: 18px 18px 14px; } .form-body { padding-left: 18px; padding-right: 18px; } .modal-footer { padding-left: 18px; padding-right: 18px; padding-bottom: max(14px, env(safe-area-inset-bottom)); } }
</style>
