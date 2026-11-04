<template>
  <view v-if="cards.length" class="business-cards">
    <view v-for="card in cards" :key="`${card.type}:${card.id}`" :class="['business-card', { 'is-checklist': card.type === 'checklist' }]">
      <ChatDisposalChecklist v-if="card.type === 'checklist'" :value="card.checklist" @inspect="inspectChecklistItem" />
      <template v-else>
      <button v-if="card.type === 'recognition'" class="business-card-select" size="mini" :aria-label="`选择${card.title}`" :aria-pressed="selectedRecognitionIds.includes(card.id)" @tap.stop="toggleRecognition(card)">{{ selectedRecognitionIds.includes(card.id) ? '✓' : '选择' }}</button>
      <view class="business-card-copy">
        <text class="business-card-title">{{ card.title }}</text>
        <text v-if="card.description" class="business-card-description">{{ card.description }}</text>
        <text v-if="card.type === 'product' && (card.points != null || card.stock != null)" class="business-card-meta">
          <text v-if="card.points != null">{{ card.points }} 积分</text>
          <text v-if="card.points != null && card.stock != null"> · </text>
          <text v-if="card.stock != null">库存 {{ card.stock }}</text>
        </text>
      </view>
      <button v-if="card.type === 'recognition'" class="business-card-action" size="mini" @tap.stop="openRecognition(card)">查看识别详情</button>
      <button v-else-if="card.type === 'booking'" class="business-card-action" size="mini" :disabled="!!busyProductId" @tap.stop="openBooking(card)">{{ busyProductId === 'booking' ? '处理中…' : '填写预约信息' }}</button>
      <button v-else-if="card.type === 'community_post'" class="business-card-action" size="mini" :disabled="!!busyProductId" @tap.stop="openCommunityPost(card)">{{ busyProductId === 'community_post' ? '处理中…' : '编辑帖子草稿' }}</button>
      <button v-else class="business-card-action" size="mini" :disabled="busyProductId === String(card.id)" @tap.stop="openProduct(card)">{{ busyProductId === String(card.id) ? '处理中…' : '查看兑换详情' }}</button>
      </template>
    </view>
    <button v-if="selectedRecognitionIds.length" class="business-checklist-submit" :disabled="chatBusy" @tap.stop="submitRecognitionChecklist">整理所选 {{ selectedRecognitionIds.length }} 条记录</button>

    <view v-if="detailOpen" :class="['business-detail-mask', { 'is-confirming': confirmingRecognition }]" @tap="closeDetail">
      <view class="business-detail" @tap.stop>
        <view class="business-detail-header">
          <text class="business-detail-title">{{ activeCard?.title || '识别详情' }}</text>
          <text class="business-detail-close" @tap="closeDetail">×</text>
        </view>
        <scroll-view class="business-detail-scroll" scroll-y>
          <image v-if="detailImage" class="business-detail-image" :src="detailImage" mode="aspectFit" />
          <text v-else-if="detailLoading" class="business-detail-state">正在加载识别图片…</text>
          <text v-if="detailError" class="business-detail-state">{{ detailError }}</text>
          <text v-if="detailLoading && !detailRecognition" class="business-detail-state">正在加载识别详情…</text>
          <HistoryRecognitionExtra v-if="detailExtra" :extra="detailExtra" />
          <button v-if="detailImage" class="business-rerecognize" :disabled="!!busyProductId || detailLoading" @tap="recognizeAgain">{{ busyProductId === 'recognition' ? '正在识别…' : '使用这张图片再次识别' }}</button>
          <button v-if="detailImage && failedRecognitionId === activeCard?.id" class="business-rerecognize" :disabled="!!busyProductId" @tap="restartRecognition">上次已失败，明确发起一次新识别</button>
          <text v-if="detailImage" class="business-detail-state">会保存一条新的识别记录，原记录保留。重复点击同一操作可核实原结果。</text>
          <text v-if="!detailLoading && !detailError && !detailExtra?.hasContent" class="business-detail-state">暂无补充识别内容</text>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { getHistoryImage, getHistoryRecognitionDetail } from '@/api/history'
import { baseUrl } from '@/api/settings'
import { getMyCommunity } from '../api/community.js'
import ChatDisposalChecklist from './ChatDisposalChecklist.vue'
import HistoryRecognitionExtra from '@/components/HistoryRecognitionExtra.vue'
import { normalizeHistoryRecognitionDetail } from '@/utils/history-recognition-detail.mjs'
import { normalizeChatBusinessCards, businessActionRequestId } from '../utils/ai-chat-business.mjs'
import { createBookingDraft, bookingSupported, createRedemptionDraft, fetchAiCapabilities, isCapabilityNotFound, newActionRequestId, redemptionSupported, createCommunityPostDraft, communityPostSupported, rerecognizeHistory } from '@/api/ai-actions.js'

const props = defineProps({ value: { type: Array, default: () => [] }, sessionId: { type: String, default: '' }, messageId: { type: [String, Number], default: '' }, chatBusy: { type: Boolean, default: false }, pageEpoch: { type: Number, default: 0 } })
const emit = defineEmits(['checklist'])
const selectedRecognitionIds = ref([])
const cards = computed(() => normalizeChatBusinessCards(props.value))
const detailOpen = ref(false)
const detailLoading = ref(false)
const detailError = ref('')
const detailImage = ref('')
const detailRecognition = ref(null)
const activeCard = ref(null)
const confirmingRecognition = ref(false)
const failedRecognitionId = ref('')
const detailExtra = computed(() => detailRecognition.value ? normalizeHistoryRecognitionDetail(detailRecognition.value) : null)
let detailRequestId = 0
const busyProductId = ref('')
const createRequestIds = new Map()
let alive = true, actionRequestVersion = 0
onBeforeUnmount(() => { alive = false; actionRequestVersion++; detailRequestId++ })
watch(() => props.pageEpoch, () => { actionRequestVersion++; busyProductId.value = ''; closeDetail() })
function beginCardAction() {
  const version = ++actionRequestVersion, sessionId = props.sessionId, messageId = props.messageId, pageEpoch = props.pageEpoch
  return () => alive && version === actionRequestVersion && sessionId === props.sessionId && messageId === props.messageId && pageEpoch === props.pageEpoch
}

function submitRecognitionChecklist() {
  if (!props.chatBusy && selectedRecognitionIds.value.length) emit('checklist', [...selectedRecognitionIds.value])
}
function toggleRecognition(card) {
  const selected = selectedRecognitionIds.value
  if (selected.includes(card.id)) selectedRecognitionIds.value = selected.filter(id => id !== card.id)
  else if (selected.length < 5) selectedRecognitionIds.value = [...selected, card.id]
  else uni.showToast({ title: '一次最多选择5条记录', icon: 'none' })
}
function inspectChecklistItem(item) {
  return openRecognition({ id: item.sourceId, title: item.name })
}
async function openRecognition(card) {
  activeCard.value = card
  detailOpen.value = true
  detailLoading.value = true
  detailError.value = ''
  detailImage.value = ''
  detailRecognition.value = null
  const requestId = ++detailRequestId
  const results = await Promise.allSettled([
    getHistoryRecognitionDetail(card.id),
    getHistoryImage(card.id)
  ])
  if (!detailOpen.value || requestId !== detailRequestId) return
  const recognition = results[0]
  if (recognition.status === 'fulfilled' && recognition.value?.code === 0) {
    detailRecognition.value = recognition.value.data?.details || null
  } else {
    detailError.value = '识别详情暂时无法加载。'
  }
  const image = results[1]
  const src = image.status === 'fulfilled' && image.value?.code === 0 ? image.value.data?.image : ''
  if (typeof src === 'string' && src) detailImage.value = /^(?:data:|https?:\/\/)/i.test(src) ? src : `${baseUrl}${src}`
  detailLoading.value = false
}

function closeDetail() {
  confirmingRecognition.value = false
  detailOpen.value = false
  detailRequestId += 1
}

async function recognizeAgain() {
  if (busyProductId.value || !activeCard.value || !detailImage.value) return
  const card = { ...activeCard.value, type: 'recognition' }
  const key = `recognition:${card.id}`
  const actionCurrent = beginCardAction(), sourceRequestId = detailRequestId
  const current = () => actionCurrent() && detailOpen.value && sourceRequestId === detailRequestId
  busyProductId.value = 'recognition'
  try {
    const capability = await fetchAiCapabilities()
    if (!current() || !detailOpen.value) return
    if (capability?.data?.actions?.rerecognition !== true) throw new Error('当前服务暂不支持再次识别')
    confirmingRecognition.value = true
    const answer = await new Promise(resolve => uni.showModal({ title: '再次识别', content: '使用原图片重新识别并保存新记录？本次操作只执行一次，网络中断后可使用同一入口核实结果。', success: resolve, fail: () => resolve({ confirm: false }) }))
    if (actionCurrent()) confirmingRecognition.value = false
    if (!current() || !detailOpen.value || !answer.confirm) return
    const requestId = createRequestIds.get(key) || businessActionRequestId(card, props.messageId, newActionRequestId)
    createRequestIds.set(key, requestId)
    const response = await rerecognizeHistory({ historyId: card.id, requestId })
    if (!current() || !detailOpen.value) return
    if (response?.code !== 0 || !response?.data?.historyId) throw new Error(response?.msg || '结果尚未确认，请稍后使用同一操作重试查询')
    await openRecognition({ id: String(response.data.historyId), title: '再次识别结果' })
  } catch (error) {
    if (current() && detailOpen.value) {
      detailError.value = error?.msg || error?.message || '结果尚未确认，请使用同一操作重试查询'
      if (error?.data?.data?.status === 'failed' || error?.data?.status === 'failed') failedRecognitionId.value = card.id
    }
  } finally { if (actionCurrent()) { busyProductId.value = ''; confirmingRecognition.value = false } }
}

function restartRecognition() {
  if (busyProductId.value || failedRecognitionId.value !== activeCard.value?.id) return
  createRequestIds.set(`recognition:${activeCard.value.id}`, newActionRequestId())
  failedRecognitionId.value = ''
  return recognizeAgain()
}

async function openBooking(card) {
  if (busyProductId.value) return
  busyProductId.value = 'booking'
  const current = beginCardAction()
  try {
    let supported = false
    try { supported = bookingSupported(await fetchAiCapabilities()) }
    catch (error) { if (!isCapabilityNotFound(error)) throw error }
    if (!current()) return
    if (!supported) {
      uni.navigateTo({ url: '/pages-nonTheme/booking' })
      return
    }
    const key = `booking:${card.description}`
    const requestId = businessActionRequestId(card, props.messageId, () => createRequestIds.get(key) || newActionRequestId())
    createRequestIds.set(key, requestId)
    const response = await createBookingDraft({ notes: card.description, requestId, sessionId: props.sessionId })
    if (!current()) return
    if (!response?.data?.id) throw new Error('预约草稿暂未创建，请重试')
    // Retain the key while this card is mounted: reopening recovers the same draft.
    uni.navigateTo({ url: `/pages-nonTheme/booking?draftId=${encodeURIComponent(response.data.id)}` })
  } catch (error) {
    if (!current()) return
    uni.showModal({ title: '暂时无法准备预约', content: error?.msg || error?.message || '请检查网络后重试。', showCancel: false })
  } finally { if (current()) busyProductId.value = '' }
}

async function openCommunityPost(card) {
  if (busyProductId.value) return
  busyProductId.value = 'community_post'
  const current = beginCardAction()
  try {
    let supported = false
    try { supported = communityPostSupported(await fetchAiCapabilities()) }
    catch (error) { if (!isCapabilityNotFound(error)) throw error }
    if (!current()) return
    if (!supported) throw new Error('当前服务暂不支持帖子草稿，请复制文字后从社区发布页编辑')
    const mine = await getMyCommunity()
    if (!current()) return
    const communityId = mine?.code === 0 ? mine?.data?.id : null
    if (!communityId) throw new Error('请先加入社区，再回来准备帖子草稿')
    const key = `community_post:${card.id}`
    const requestId = businessActionRequestId(card, props.messageId, () => createRequestIds.get(key) || newActionRequestId())
    createRequestIds.set(key, requestId)
    const response = await createCommunityPostDraft({ requestId, sessionId: props.sessionId,
      payload: { communityId, content: card.postContent, images: [], tag: '心得', visibilityScope: 'community' } })
    if (!current()) return
    if (!response?.data?.id) throw new Error('帖子草稿创建结果不明确，请重试')
    uni.navigateTo({ url: `/pages-nonTheme/community-publish?draftId=${encodeURIComponent(response.data.id)}` })
  } catch (error) {
    if (current()) uni.showModal({ title: '暂时无法准备帖子', content: error?.msg || error?.message || '请稍后重试', showCancel: false })
  } finally { if (current()) busyProductId.value = '' }
}

async function openProduct(card) {
  const productId = String(card.id)
  if (busyProductId.value) return
  busyProductId.value = productId
  const current = beginCardAction()
  try {
    let supported = false
    try {
      const capabilities = await fetchAiCapabilities()
      supported = redemptionSupported(capabilities)
    } catch (error) {
      if (!isCapabilityNotFound(error)) throw error
    }
    if (!current()) return
    if (!supported) {
      createRequestIds.delete(productId)
      uni.navigateTo({ url: `/pages-nonTheme/shop-confirm?productId=${encodeURIComponent(productId)}` })
      return
    }
    const requestId = businessActionRequestId(card, props.messageId, () => createRequestIds.get(productId) || newActionRequestId())
    createRequestIds.set(productId, requestId)
    const response = await createRedemptionDraft({ productId, quantity: 1, requestId, sessionId: props.sessionId })
    if (!current()) return
    const draftId = response?.data?.id
    if (!draftId) throw new Error('兑换草稿暂未创建，请重试')
    uni.navigateTo({ url: `/pages-nonTheme/shop-confirm?draftId=${encodeURIComponent(draftId)}` })
  } catch (error) {
    if (!current()) return
    uni.showModal({ title: '暂时无法创建兑换草稿', content: error?.msg || error?.message || '请检查网络后重试。', showCancel: false })
  } finally {
    if (current()) busyProductId.value = ''
  }
}
</script>

<style scoped>
.business-card.is-checklist { display: block; }
.business-rerecognize { margin-top: 12px; font-size: 13px; color: var(--accent, #4d6bfe); }
.business-card-select { margin: 0; padding: 0 6px; font-size: 10px; line-height: 28px; border-radius: 7px; color: var(--accent, #4d6bfe); background: var(--bg-primary, #fff); flex-shrink: 0; }
.business-card-select::after, .business-checklist-submit::after { border: 0; }
.business-checklist-submit { margin: 0; padding: 0 12px; font-size: 12px; line-height: 34px; border-radius: 8px; color: var(--accent, #4d6bfe); background: var(--bg-secondary, #f7f8fa); }

.business-cards { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }
.business-card { display: flex; align-items: center; gap: 10px; padding: 12px; border: 1px solid var(--border-light, #e5e7eb); border-radius: 12px; background: var(--bg-secondary, #f7f8fa); }
.business-card-copy { flex: 1; min-width: 0; }
.business-card-title, .business-card-description, .business-card-meta { display: block; overflow-wrap: anywhere; }
.business-card-title { color: var(--text-primary, #1f2937); font-size: 14px; font-weight: 600; line-height: 1.5; }
.business-card-description, .business-card-meta { margin-top: 4px; color: var(--text-secondary, #6b7280); font-size: 12px; line-height: 1.5; }
.business-card-action { flex-shrink: 0; margin: 0; padding: 0 10px; color: var(--accent, #4d6bfe); background: var(--bg-primary, #fff); border: 1px solid var(--border-light, #e5e7eb); border-radius: 8px; font-size: 11px; line-height: 30px; }
.business-card-action::after { border: 0; }
.business-detail-mask { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(15, 23, 42, .58); box-sizing: border-box; }
.business-detail-mask.is-confirming { z-index: 998; pointer-events: none; }
.business-detail { width: 100%; max-width: 560px; max-height: 82vh; overflow: hidden; border-radius: 16px; background: var(--bg-primary, #fff); color: var(--text-primary, #1f2937); }
.business-detail-header { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--border-light, #e5e7eb); }
.business-detail-title { flex: 1; font-size: 15px; font-weight: 600; }
.business-detail-close { padding: 0 4px; font-size: 24px; line-height: 24px; }
.business-detail-scroll { max-height: calc(82vh - 54px); padding: 14px 16px 18px; box-sizing: border-box; }
.business-detail-image { display: block; width: 100%; height: 210px; border-radius: 10px; background: var(--bg-secondary, #f7f8fa); }
.business-detail-state { display: block; padding: 10px 0; color: var(--text-secondary, #6b7280); font-size: 13px; line-height: 1.6; }
/* #ifdef H5 */
.business-card-action:focus-visible { outline: 2px solid var(--accent, #4d6bfe); outline-offset: 3px; }
/* #endif */
</style>
