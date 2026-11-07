<template>
  <view v-if="opened" :class="['inbox-mask', { 'is-confirming': confirmingCancel }]" @tap="closeInbox">
    <view class="inbox-panel" @tap.stop>
      <view class="inbox-header">
        <text class="inbox-title">我的业务待办</text>
        <button class="inbox-close" aria-label="关闭待办" @tap="closeInbox">×</button>
      </view>
      <view class="inbox-tabs">
        <button :class="{ active: scope === 'pending' }" :disabled="!!cancelling" @tap="changeScope('pending')">待确认</button>
        <button :class="{ active: scope === 'recent' }" :disabled="!!cancelling" @tap="changeScope('recent')">最近30天</button>
        <button :disabled="loading || !!cancelling" @tap="refreshInbox">刷新</button>
      </view>
      <scroll-view class="inbox-list" scroll-y>
        <text v-if="loading && !items.length" class="inbox-state">正在读取待办…</text>
        <text v-if="error" class="inbox-state" role="alert">{{ error }}</text>
        <text v-if="!loading && !error && !items.length" class="inbox-state">{{ scope === 'pending' ? '暂无待确认的操作' : '最近30天暂无操作记录' }}</text>
        <view v-for="item in items" :key="item.id" class="inbox-item">
          <view class="inbox-copy">
            <text class="inbox-item-title">{{ item.title }}</text>
            <text class="inbox-meta">{{ item.type === 'community_post' ? '社区发帖' : item.type === 'booking' ? '回收预约' : '积分兑换' }} · {{ actionStatusLabel(item.status) }}</text>
          </view>
          <view class="inbox-actions">
            <button :disabled="!!cancelling" @tap="openItem(item)">{{ item.status === 'pending' ? '继续填写' : (item.status === 'completed' ? '查看回执' : '查看草稿') }}</button>
            <button v-if="item.status === 'pending'" :disabled="!!cancelling" @tap="cancelItem(item)">{{ cancelling === item.id ? '取消中…' : '取消' }}</button>
          </view>
        </view>
        <button v-if="nextCursor && supported" class="inbox-more" :disabled="loading || !!cancelling" @tap="loadItems(true)">{{ loading ? '加载中…' : '加载更多' }}</button>
      </scroll-view>
    </view>
  </view>
</template>

<script setup>
import { inject as injectModalProvider } from 'vue'
const showPageModal = injectModalProvider('app-confirm-dialog', options => uni.showModal(options))
import { ref, onBeforeUnmount } from 'vue'
import { fetchAiCapabilities, fetchAiActions, cancelAiAction, isCapabilityNotFound } from '@/api/ai-actions.js'
import { normalizeActionSummaries, actionStatusLabel, actionDetailUrl } from '../utils/ai-chat-actions.mjs'

const opened = ref(false), loading = ref(false), supported = ref(false), error = ref('')
const scope = ref('pending'), items = ref([]), nextCursor = ref(''), cancelling = ref('')
const confirmingCancel = ref(false)
let requestVersion = 0, panelVersion = 0, cancelVersion = 0
const message = value => value?.msg || value?.message || '待办暂时无法读取，请重试'
function closeInbox() { opened.value = false; requestVersion++; panelVersion++; cancelVersion++; loading.value = false; cancelling.value = ''; confirmingCancel.value = false }
onBeforeUnmount(closeInbox)
defineExpose({ openInbox })
async function openInbox() {
  if (opened.value) return
  opened.value = true
  panelVersion++
  supported.value = false
  loading.value = true
  error.value = ''
  items.value = []
  nextCursor.value = ''
  const version = ++requestVersion
  try {
    const response = await fetchAiCapabilities()
    if (!opened.value || version !== requestVersion) return
    supported.value = response?.code === 0 && response?.data?.actionInbox === true
    if (!supported.value) throw new Error('当前服务暂不支持待办列表，请从原业务页面继续操作')
    loading.value = false
    await loadItems(false)
  } catch (value) {
    if (opened.value && version === requestVersion) {
      error.value = isCapabilityNotFound(value) ? '当前服务暂不支持待办列表' : message(value)
      loading.value = false
    }
  }
}
async function refreshInbox() {
  if (supported.value) return loadItems(false)
  closeInbox()
  return openInbox()
}
async function changeScope(value) {
  if (cancelling.value || scope.value === value) return
  scope.value = value
  await loadItems(false)
}
async function loadItems(append = false) {
  if (!opened.value || !supported.value) return
  const version = ++requestVersion
  const cursor = append ? nextCursor.value : ''
  loading.value = true
  error.value = ''
  if (!append) { items.value = []; nextCursor.value = '' }
  try {
    const response = await fetchAiActions(scope.value, cursor)
    if (!opened.value || version !== requestVersion) return
    if (response?.code !== 0 || !Array.isArray(response?.data?.items)) throw new Error('待办返回内容不完整，请重试')
    const received = normalizeActionSummaries(response.data.items)
    const previous = append ? items.value : []
    const ids = new Set(previous.map(item => item.id))
    items.value = [...previous, ...received.filter(item => !ids.has(item.id))]
    nextCursor.value = typeof response.data.nextCursor === 'string' && response.data.nextCursor.length <= 220 ? response.data.nextCursor : ''
  } catch (value) { if (opened.value && version === requestVersion) error.value = message(value) }
  finally { if (version === requestVersion) loading.value = false }
}
function openItem(item) {
  const url = actionDetailUrl(item)
  if (url && !cancelling.value) uni.navigateTo({ url })
}
async function cancelItem(item) {
  if (cancelling.value) return
  cancelling.value = item.id
  const panel = panelVersion, operation = ++cancelVersion
  const current = () => opened.value && panel === panelVersion && operation === cancelVersion
  try {
    confirmingCancel.value = true
    const answer = await new Promise(resolve => showPageModal({ title: '取消待办', content: `取消“${item.title}”这份尚未提交的草稿？`, success: resolve, fail: () => resolve({ confirm: false }) }))
    if (!current()) return
    confirmingCancel.value = false
    if (!answer.confirm || !current()) return
    await cancelAiAction(item.id, item.version)
    if (!current()) return
    await loadItems(false)
  } catch (value) {
    if (current()) {
      await loadItems(false)
      if (current()) error.value = `${message(value)}；请核对列表中的最新状态。`
    }
  } finally { if (operation === cancelVersion) { cancelling.value = ''; confirmingCancel.value = false } }
}
</script>

<style scoped>
.inbox-trigger { margin: 0; padding: 0 10px; font-size: 12px; line-height: 30px; border-radius: 9px; background: var(--bg-secondary, #f5f6fa); color: var(--text-primary, #243047); }
.inbox-trigger::after, .inbox-panel button::after { border: 0; }
.inbox-mask { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: center; justify-content: center; padding: 18px; box-sizing: border-box; background: rgba(15, 23, 42, .5); }
/* H5 uni.showModal uses z-index 999; let its confirmation receive real pointer events. */
.inbox-mask.is-confirming { z-index: 998; pointer-events: none; }
.inbox-panel { width: 100%; max-width: 520px; overflow: hidden; border-radius: 16px; color: var(--text-primary, #243047); background: var(--bg-primary, #fff); }
.inbox-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; }
.inbox-title { font-size: 16px; font-weight: 600; }
.inbox-close { margin: 0; padding: 0 8px; font-size: 24px; line-height: 32px; background: transparent; color: inherit; }
.inbox-tabs { display: flex; gap: 6px; padding: 0 12px 12px; }
.inbox-tabs button { margin: 0; flex: 1; font-size: 12px; line-height: 32px; background: var(--bg-secondary, #f5f6fa); color: inherit; }
.inbox-tabs button.active { color: var(--accent, #4d6bfe); font-weight: 600; }
.inbox-list { max-height: 60vh; }
.inbox-item { display: flex; gap: 10px; padding: 12px 16px; border-top: 1px solid var(--border-light, #e5e7eb); }
.inbox-copy { flex: 1; min-width: 0; }
.inbox-item-title { display: block; font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; }
.inbox-meta { display: block; margin-top: 4px; font-size: 12px; color: var(--text-secondary, #667085); }
.inbox-actions { display: flex; flex-direction: column; gap: 6px; }
.inbox-actions button, .inbox-more { margin: 0; padding: 0 8px; font-size: 12px; line-height: 30px; color: var(--accent, #4d6bfe); background: var(--bg-secondary, #f5f6fa); }
.inbox-state { display: block; padding: 20px 16px; font-size: 13px; line-height: 1.6; }
.inbox-more { margin: 12px 16px; }
</style>
