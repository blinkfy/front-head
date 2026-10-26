<template>
  <view :class="['shell', isDark ? 'dark-theme' : '']">
    <view class="ambient ambient-one"></view>
    <view class="ambient ambient-two"></view>

    <!-- ===== 侧边栏：对话历史 ===== -->
    <view :class="['sidebar', historyDrawerOpen ? 'drawer-open' : '']">
      <view class="sidebar-top">
        <!-- DeepSeek式极简顶栏 -->
        <view class="brand-bar">
          <image class="brand-icon" :src="getManifestIconPath('ai_assistant')" mode="aspectFit" />
          <view class="brand-title">AI 环保助手</view>
        </view>
        <view class="new-chat-btn" @tap="onNewChat">
          <ManifestIcon class="new-chat-icon" id="add" :scale="1.1" />
          <text>新建对话</text>
        </view>
      </view>
      <scroll-view class="conversation-list" scroll-y>
        <view v-if="!conversationList.length" class="history-empty">
          暂无历史会话
        </view>
        <view
          v-for="item in conversationList"
          :key="item.id"
          :class="['conversation-item', item.id === activeSessionId ? 'active' : '', editingSessionId === item.id ? 'is-editing' : '']"
          @tap="onSelectConversation(item.id)"
        >
          <view class="conversation-item-top">
            <input
              v-if="editingSessionId === item.id"
              class="conversation-title-input"
              v-model="editingTitle"
              :focus="editingSessionId === item.id"
              placeholder="输入对话名称"
              @tap.stop
              @confirm.stop="confirmRenameConversation(item.id)"
              @blur="confirmRenameConversation(item.id)"
            />
            <view v-else class="conversation-title">{{ item.title || '环保分类咨询' }}</view>

            <view class="conversation-actions">
              <template v-if="editingSessionId === item.id">
                <view class="action-btn check-btn" title="确认" @tap.stop="confirmRenameConversation(item.id)">
                  <ManifestIcon class="action-icon" id="confirm" />
                </view>
                <view class="action-btn cancel-btn" title="取消" @tap.stop="cancelRenameConversation">
                  <ManifestIcon class="action-icon" id="close" />
                </view>
              </template>
              <template v-else>
                <view class="action-btn edit-btn" title="重命名" @tap.stop="startRenameConversation(item.id, item.title)">
                  <ManifestIcon class="action-icon" id="post_edit" />
                </view>
                <view class="action-btn delete-btn" title="删除对话" @tap.stop="onDeleteConversation(item.id)">
                  <ManifestIcon class="action-icon" id="delete" :scale="1.1" />
                </view>
              </template>
            </view>
          </view>
          <view class="conversation-meta">
            <text>{{ formatTimeLabel(item.updatedAt) }}</text>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- 移动端抽屉遮罩 -->
    <view
      :class="['history-backdrop', historyDrawerOpen ? 'backdrop-open' : '']"
      @tap="closeHistoryDrawer"
    ></view>

    <!-- ===== 主聊天区 ===== -->
    <view class="chat-panel" :style="{ '--composer-overlay-height': `${composerOverlayHeight}px` }">

      <!-- 头部 -->
      <view class="chat-header">
        <view class="header-left">
          <view class="history-toggle" @tap="toggleHistoryDrawer">
            <view class="history-toggle-bar"></view>
          </view>
          <view class="chat-header-main">
            <view class="chat-header-row">
              <view class="chat-title-dot"></view>
              <view class="chat-title">{{ chatTitle }}</view>
            </view>
            <view class="chat-header-subtitle">{{ chatSubtitle }}</view>
          </view>
        </view>
        <view class="header-actions">
          <view class="btn ghost" @tap="goBack">返回识别页<ManifestIcon class="compact-back-icon" id="back" :scale="1.1" /></view>
        </view>
      </view>

      <!-- 消息列表 -->
      <scroll-view
        class="messages"
        scroll-y
        :scroll-top="messagesScrollTop"
        @scroll="onMessagesScroll"
      >
        <view v-if="showIntroPanel" class="welcome-hero">
          <image class="welcome-icon" :src="getManifestIconPath('ai_assistant')" mode="aspectFit" />
          <view class="welcome-text">今天有什么可以帮您？</view>
        </view>
        <view v-if="!messageList.length && !isStreaming" class="empty-chat">
          当前对话还没有消息。你可以直接提问，或先发送一张图片继续分析。
        </view>
        <view
          v-for="(msg, idx) in messageList"
          :key="getMessageKey(msg.id)"
          :class="['message-row', msg.role === 'user' ? 'from-user' : 'from-assistant']"
        >
          <image v-if="msg.role !== 'user'" class="avatar assistant-avatar" :src="getManifestIconPath('ai_assistant')" mode="aspectFit" />
          <view class="message-content">
            <view class="message-meta">
              <text class="message-author">{{ msg.role === 'user' ? '你' : '环保 AI' }}</text>
              <text class="message-time">{{ formatMessageTime(msg.createdAt) }}</text>
            </view>
            <view :class="['msg', msg.role === 'user' ? 'user' : 'assistant']">
              <image
                v-if="getMessageImageSrc(msg)"
                class="msg-image"
                lazy-load
                :src="getMessageImageSrc(msg)"
                mode="widthFix"
                @tap.stop="previewMessageImage(msg)"
                @error="handleMessageImageError(idx)"
              />
              <view v-else-if="msg.hasImage || msg.recognitionHistoryId" class="msg-image-placeholder">
                <text>{{ msg.imageExpired ? '图片已超过180天保留期，已自动清理' : (msg._imageLoadFailed ? '图片加载失败' : '暂无图片') }}</text>
                <text v-if="msg._imageLoadFailed && !msg.imageExpired" class="image-retry" @tap.stop="retryMessageImage(idx)">重新加载</text>
              </view>
              <!-- 用户消息保持纯文本，助手消息走 Markdown 渲染 -->
              <text v-if="msg.role === 'user'" class="msg-body">{{ msg.content }}</text>
              <!-- 深度思考推理区：DeepSeek风格，可折叠，置于正文上方 -->
              <view
                v-if="msg.role === 'assistant' && msg.reasoning"
                class="reasoning-block"
              >
                <view
                  class="reasoning-header"
                  @tap.stop="toggleReasoning(msg.id)"
                >
                  <text class="reasoning-label">思考过程</text>
                  <ManifestIcon class="reasoning-chevron" :class="isReasoningCollapsed(msg.id) ? 'collapsed' : ''" id="chevron_down" :scale="1" />
                </view>
                <view
                  v-if="!isReasoningCollapsed(msg.id)"
                  class="reasoning-body"
                >
                  <MarkdownBody variant="reasoning" :markdown="msg.reasoning" :native-renderer="true" />
                </view>
              </view>
              <!-- #ifdef H5 -->
              <MarkdownBody v-if="msg.role !== 'user' && !recognitionSeedSummaries[idx]" :markdown="msg.content || 'AI 暂未返回内容。'" />
              <!-- #endif -->
              <!-- #ifndef H5 -->
              <MarkdownBody v-if="msg.role !== 'user' && !recognitionSeedSummaries[idx]" :markdown="msg.content || 'AI 暂未返回内容。'" :native-renderer="true" />
              <!-- #endif -->
              <view v-if="recognitionSeedSummaries[idx]" class="seed-summary">
                <text class="seed-summary-title">本次识别概览</text>
                <view class="seed-summary-labels">
                  <view v-for="(label, labelIndex) in recognitionSeedSummaries[idx].labels" :key="labelIndex" class="seed-summary-label">
                    <text class="seed-label-name">{{ label.name }}</text>
                    <text class="seed-label-confidence">{{ label.confidence }}</text>
                  </view>
                </view>
                <view v-if="recognitionSeedSummaries[idx].items.length" class="seed-summary-items">
                  <text class="seed-summary-caption">识别物品</text>
                  <text class="seed-summary-copy">{{ (isSeedSummaryExpanded(idx) ? recognitionSeedSummaries[idx].items : recognitionSeedSummaries[idx].items.slice(0, 3)).join('、') }}{{ !isSeedSummaryExpanded(idx) && recognitionSeedSummaries[idx].items.length > 3 ? `等 ${recognitionSeedSummaries[idx].items.length} 件` : '' }}</text>
                </view>
                <view v-if="isSeedSummaryExpanded(idx) && recognitionSeedSummaries[idx].disposal" class="seed-summary-detail">
                  <text class="seed-summary-caption">分类建议</text>
                  <text class="seed-summary-copy">{{ recognitionSeedSummaries[idx].disposal }}</text>
                </view>
                <view v-if="isSeedSummaryExpanded(idx) && recognitionSeedSummaries[idx].upcycling" class="seed-summary-detail">
                  <text class="seed-summary-caption">变废为宝</text>
                  <text class="seed-summary-copy">{{ recognitionSeedSummaries[idx].upcycling }}</text>
                </view>
                <view v-if="recognitionSeedSummaries[idx].disposal || recognitionSeedSummaries[idx].upcycling || recognitionSeedSummaries[idx].items.length > 3" class="seed-summary-toggle" @tap="toggleSeedSummary(idx)">
                  {{ isSeedSummaryExpanded(idx) ? '收起详细建议' : '查看完整分类与投放建议' }}
                </view>
              </view>
            </view>
          </view>
        </view>
        <view v-if="isStreaming" class="message-row from-assistant">
          <image class="avatar assistant-avatar" :src="getManifestIconPath('ai_assistant')" mode="aspectFit" />
          <view class="message-content">
            <view class="message-meta">
              <text class="message-author">环保 AI</text>
              <text class="message-time">正在生成</text>
            </view>
            <view class="msg assistant streaming">
              <!-- 流式推理区：生成中默认展开，完成后用户可折叠 -->
              <view
                v-if="streamingReasoning"
                class="reasoning-block"
              >
                <view
                  class="reasoning-header"
                  @tap.stop="toggleReasoning(streamingMessageId)"
                >
                  <text class="reasoning-label">思考过程</text>
                  <ManifestIcon class="reasoning-chevron" :class="isReasoningCollapsed(streamingMessageId) ? 'collapsed' : ''" id="chevron_down" :scale="1" />
                </view>
                <view
                  v-if="!isReasoningCollapsed(streamingMessageId)"
                  class="reasoning-body"
                >
                  <MarkdownBody variant="reasoning" :markdown="streamingReasoning" :streaming="true" />
                </view>
              </view>
              <MarkdownBody :markdown="streamingText" :streaming="true" />
              <view class="typing-dots">
                <view class="typing-dot"></view>
                <view class="typing-dot"></view>
                <view class="typing-dot"></view>
              </view>
            </view>
          </view>
        </view>

        <view v-if="showInlineSuggestions" class="inline-suggestions">
          <view class="inline-suggestions-title">可以继续问</view>
          <view class="inline-suggestions-grid">
            <view
              v-for="item in quickActions"
              :key="`inline_${item.label}`"
              class="inline-suggestion-card"
              @tap="applyQuickPrompt(item.prompt)"
            >
              <text class="inline-suggestion-label">{{ item.label }}</text>
              <text class="inline-suggestion-hint">{{ item.hint }}</text>
            </view>
          </view>
        </view>
      </scroll-view>

      <!-- 输入区 - DeepSeek风格 -->
      <view class="composer">
        <view v-if="pickedImageDataUrl" class="image-pending">
          <view class="image-pending-copy">
            <text class="image-pending-label">已附加图片</text>
            <text class="image-pending-name">{{ pickedImageName }}</text>
          </view>
          <text class="image-pending-clear" @tap="clearPickedImage">取消</text>
        </view>

        <view class="composer-card">
          <!-- #ifdef H5 -->
          <textarea
            v-model="promptText"
            class="prompt-textarea"
            auto-height
            :placeholder="composerPlaceholder"
            @keydown.enter.exact.prevent="onSend"
          ></textarea>
          <!-- #endif -->
          <!-- #ifndef H5 -->
          <textarea
            v-model="promptText"
            class="prompt-textarea"
            auto-height
            :placeholder="composerPlaceholder"
            @confirm="onSend"
          ></textarea>
          <!-- #endif -->

          <view class="composer-toolbar">
            <view class="composer-left">
              <!-- DeepSeek风格：深度思考切换按钮 -->
              <view
                :class="['deep-think-btn', isDeepThinking ? 'active' : '']"
                @tap="toggleDeepThinking"
              >
                <text class="deep-think-text">{{ deepThinkLabel }}</text>
              </view>
            </view>

            <view class="composer-right">
              <ManifestIcon class="attach-icon" id="image_gallery" :scale="2.1" role="button" aria-label="添加图片" @click="onPickImage" />
              <view
                v-if="isStreaming"
                class="btn-stop"
                @tap="onStop"
              >
                <text class="stop-text">停止</text>
              </view>
              <ManifestIcon v-else class="send-icon" id="submit_action" :scale="2.1" role="button" aria-label="发送消息" @click="onSend" />
            </view>
          </view>
        </view>

      </view>
    </view>

  </view>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { onHide, onUnload } from '@dcloudio/uni-app'
import { baseUrl } from '@/api/settings'
import MarkdownBody from '@/components/MarkdownBody.vue'
import ManifestIcon from '@/components/ManifestIcon.vue'
import { getManifestIconPath } from '@/utils/manifest-icons.js'
import { parseRecognitionSeedSummary } from '@/pages-nonTheme/utils/recognition-seed-display.mjs'
import { compressChatImage, dataUrlByteLength, MAX_IMAGE_BYTES } from '@/pages-nonTheme/utils/chat-image-compression.js'
import { resolveChatPreviewSource } from '@/pages-nonTheme/utils/chat-image-preview.js'
import { SEED_IMAGE_BINDING_KEY, seedImageFingerprint, resolveCachedSeedImage, cachedSeedSession, findCachedSeedMessage } from '@/pages-nonTheme/utils/ai-chat-image-cache.mjs'

// ─── Storage 工具 ────────────────────────────────────────
function getStorage(key) {
  // #ifdef H5
  try {
    return localStorage.getItem(key)
  } catch (e) {
    return null
  }
  // #endif
  // #ifndef H5
  try {
    return uni.getStorageSync(key)
  } catch (e) {
    return null
  }
  // #endif
}
function setStorage(key, value) {
  // #ifdef H5
  try {
    localStorage.setItem(key, value)
  } catch (e) {}
  // #endif
  // #ifndef H5
  try {
    uni.setStorageSync(key, value)
  } catch (e) {}
  // #endif
}

// ─── 常量 ────────────────────────────────────────────────
const SEED_KEY = 'ai_chat_seed_payload'
const SESSION_KEY = 'ai_chat_session_id'
const SEED_CONSUMED_KEY = 'ai_chat_seed_consumed_at'

// ─── 主题 ────────────────────────────────────────────────
const isDark = ref(getStorage('app_theme') === 'dark')

// ─── 状态栏高度 ──────────────────────────────────────────
const statusBarHeight = ref(20)
function initSystemInfo() {
  const info = uni.getSystemInfoSync()
  statusBarHeight.value = info.statusBarHeight || 20
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--status-bar-height', statusBarHeight.value + 'px')
  }
}

// ─── 响应式状态 ──────────────────────────────────────────
const chatTitle    = ref('当前对话')
const chatSubtitle = ref('继续提问，AI 会结合识别结果给出更细建议。')
const promptText   = ref('')
const messageList  = ref([])          // { role, content, imageBase64, createdAt }[]
const conversationList = ref([])      // 侧边栏渲染用的排序列表
const activeSessionId = ref('')
const editingSessionId = ref('')      // 当前处于行内重命名的 sessionId
const editingTitle = ref('')          // 当前行内重命名的输入文本
const isStreaming   = ref(false)
const streamingText = ref('')
const streamingReasoning = ref('')   // 流式推理内容
const streamingMessageId = ref('')
const messagesScrollTop = ref(0)
const shouldAutoFollowMessages = ref(true)
const messagesViewportHeight = ref(0)
const composerOverlayHeight = ref(96)
const historyDrawerOpen = ref(false)
const pickedImageDataUrl = ref('')
const pickedImageLocalPath = ref('')
const imagePreparing = ref(false)
const imagePreviewPreparing = ref(false)
const pickedImageName    = ref('')
const isDeepThinking = ref(false)    // DeepSeek风格：深度思考开关
const isNarrowScreen = ref(false)    // 超小屏（≤480px）标识
const reasoningCollapsed = ref({})   // 折叠状态按会话ID和稳定消息ID隔离
const expandedSeedSummaries = ref({})
const recognitionSeedSummaries = computed(() =>
  messageList.value.map((message, index) => parseRecognitionSeedSummary(message, index))
)

function toggleSeedSummary(index) {
  expandedSeedSummaries.value = {
    ...expandedSeedSummaries.value,
    [index]: !isSeedSummaryExpanded(index)
  }
}
function isSeedSummaryExpanded(index) {
  return expandedSeedSummaries.value[index] !== false
}

// 深度思考按钮标签：窄屏时显示短文案，始终可见
const deepThinkLabel = computed(() =>
  isNarrowScreen.value
    ? (isDeepThinking.value ? '已开启' : '深度思考')
    : (isDeepThinking.value ? '深度思考已开启' : '深度思考')
)

const quickActions = [
  {
    label: '分类依据',
    hint: '逐项解释为什么这样分类',
    prompt: '逐项解释这次识别结果的分类依据，并指出最容易分错的地方。'
  },
  {
    label: '投放步骤',
    hint: '告诉我正确投放顺序和注意事项',
    prompt: '给我一个清晰的投放步骤，说明要不要清洗、拆分和沥干。'
  },
  {
    label: '变废为宝',
    hint: '给出能马上执行的再利用方案',
    prompt: '给我一个低门槛、现在就能做的变废为宝方案，材料和步骤尽量具体。'
  },
  {
    label: '易错对比',
    hint: '帮我区分相似垃圾',
    prompt: '列出和它容易混淆的垃圾，并用简短规则帮我快速区分。'
  }
]

const conversationCount = computed(() => conversationList.value.length)
const activeMessageCount = computed(() => messageList.value.length + (isStreaming.value ? 1 : 0))
const userMessageCount = computed(() =>
  messageList.value.filter(item => item && item.role === 'user').length
)
const showIntroPanel = computed(() => userMessageCount.value === 0 && !isStreaming.value)
const showInlineSuggestions = computed(() => messageList.value.length > 0 && !isStreaming.value)
const composerPlaceholder = computed(() =>
  pickedImageDataUrl.value
    ? '描述你想让我重点观察的内容，例如瓶盖材质、是否需要拆分投放...'
    : '向 AI 环保助手提问...'
)
// ─── 内部数据（不需要响应式） ─────────────────────────────
function isRenderableImageSrc(src) {
  const value = String(src || '').trim()
  if (!value) return false
  if (value.startsWith('__LARGE_IMAGE__:')) return false
  return true
}

function chatImageUrl(messageId) {
  return `${baseUrl}/api/ai/chat/image/${messageId}?token=${encodeURIComponent(getStorage('token') || '')}`
}
function retryMessageImage(index) {
  const msg = messageList.value[index]
  if (!msg || msg.imageExpired) return
  msg._imageLoadFailed = false
  msg._imageFallbackTried = false
  messageList.value = messageList.value.slice()
}
function getMessageImageSrc(msg) {
  if (!msg) return ''
  if (msg._imageLoadFailed || msg.imageExpired) return ''
  if (isRenderableImageSrc(msg._localImagePath)) return msg._localImagePath
  if (isRenderableImageSrc(msg.imageBase64)) return msg.imageBase64
  if (msg.imageAvailable && /^\d+$/.test(String(msg.id))) return chatImageUrl(msg.id)
  if (msg.recognitionHistoryId && msg.imageAvailable !== false) return `${baseUrl}/api/recognition_history/image/${msg.recognitionHistoryId}?raw=1&token=${encodeURIComponent(getStorage('token') || '')}`
  return ''
}

async function previewMessageImage(msg) {
  const source = getMessageImageSrc(msg)
  if (!source || imagePreviewPreparing.value) return
  imagePreviewPreparing.value = true
  let loadingShown = false
  try {
    // #ifndef H5
    loadingShown = true
    uni.showLoading({ title: '图片加载中', mask: true })
    // #endif
    const path = await resolveChatPreviewSource(source)
    if (path !== source) msg._localImagePath = path
    if (loadingShown) { uni.hideLoading(); loadingShown = false }
    await new Promise((resolve, reject) => uni.previewImage({
      urls: [path], current: path, success: resolve, fail: reject
    }))
  } catch (error) {
    uni.showToast({ title: error?.message || '图片预览失败，请重试', icon: 'none' })
  } finally {
    if (loadingShown) uni.hideLoading()
    imagePreviewPreparing.value = false
  }
}

function getDisplayMessageText(msg) {
  const raw = String(msg && msg.content ? msg.content : '').trim()
  if (!raw) return 'AI 暂未返回内容。'
  return raw
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/^\s*[-*+]\s*/gm, '')
    .replace(/^\s*\d+\.\s*/gm, '')
    .trim() || 'AI 暂未返回内容。'
}

function handleMessageImageError(index) {
  const conversation = ensureConversation(activeSessionId.value)
  const msg = conversation.messages[index]
  if (!msg) return
  if (msg._localImagePath && isRenderableImageSrc(msg.imageBase64) && !msg._imageFallbackTried) {
    msg._imageFallbackTried = true
    msg._localImagePath = ''
    messageList.value = conversation.messages.slice()
    return
  }
  msg._imageLoadFailed = true
  messageList.value = conversation.messages.slice()
}

let conversationMap = new Map()       // sessionId -> conversation object
let abortCtrl = null
let wsSocket = null                   // WebSocket 连接（小程序/App 流式）
let messagesScrollSeed = 1000000
const AUTO_SCROLL_BOTTOM_THRESHOLD = 96

// ─── 工具函数 ─────────────────────────────────────────────
function safeJsonParse(str) {
  try { return JSON.parse(str) } catch (_) { return null }
}
function createSessionId() {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}
function createMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}
function getMessageKey(messageId) {
  return JSON.stringify([activeSessionId.value, String(messageId)])
}
function normalizeSessionId(value) {
  if (value === undefined || value === null) return ''
  return String(value).trim().slice(0, 64)
}
function truncateText(text, max) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim()
  if (!raw) return ''
  if (raw.length <= max) return raw
  return `${raw.slice(0, max - 1)}…`
}
function formatTimeLabel(isoText) {
  const date = new Date(isoText || Date.now())
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const sameDay =
    now.getFullYear() === date.getFullYear() &&
    now.getMonth() === date.getMonth() &&
    now.getDate() === date.getDate()
  if (sameDay) {
    return `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`
  }
  return `${date.getMonth() + 1}/${date.getDate()}`
}
function formatMessageTime(isoText) {
  const date = new Date(isoText || Date.now())
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const sameDay =
    now.getFullYear() === date.getFullYear() &&
    now.getMonth() === date.getMonth() &&
    now.getDate() === date.getDate()
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return sameDay ? `${hh}:${mm}` : `${date.getMonth() + 1}/${date.getDate()} ${hh}:${mm}`
}
function applyQuickPrompt(prompt) {
  const nextPrompt = String(prompt || '').trim()
  if (!nextPrompt) return
  const current = String(promptText.value || '').trim()
  promptText.value = current ? `${current}\n${nextPrompt}` : nextPrompt
}
// ─── 深度思考切换 ────────────────────────────────────────
function toggleDeepThinking() {
  isDeepThinking.value = !isDeepThinking.value
}
// ─── 推理区折叠 ──────────────────────────────────────────
function toggleReasoning(messageId) {
  const key = getMessageKey(messageId)
  reasoningCollapsed.value = {
    ...reasoningCollapsed.value,
    [key]: !reasoningCollapsed.value[key]
  }
}
function isReasoningCollapsed(messageId) {
  return !!reasoningCollapsed.value[getMessageKey(messageId)]
}
function buildAuthHeaders(withJson) {
  const token = getStorage('token') || ''
  const headers = {}
  if (withJson) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = token
  return headers
}
function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    uni.request({
      url,
      method: options.method || 'GET',
      header: options.header || {},
      data: options.data,
      success: (res) => resolve(res.data),
      fail: reject
    })
  })
}
async function isCurrentUserAdmin() {
  const token = getStorage('token') || ''
  if (!token) return false
  try {
    const payload = await requestJson(`${baseUrl}/api/userinfo?avater=false`, {
      header: buildAuthHeaders(false)
    })
    const isAdmin = !!(payload && payload.code === 0 && payload.data && payload.data.isAdmin)
    if (isAdmin) setStorage('isAdmin', true)
    else {
      try { uni.removeStorageSync('isAdmin') } catch (_) {}
      // #ifdef H5
      try { localStorage.removeItem('isAdmin') } catch (_) {}
      // #endif
    }
    return isAdmin
  } catch (_) {
    return false
  }
}
async function guardAiChatAccess() {
  try {
    const payload = await requestJson(`${baseUrl}/api/ai/settings`)
    const settings = payload && payload.code === 0 ? payload.data : null
    if (!settings || settings.aiEnabled !== false) return true
    if (await isCurrentUserAdmin()) return true
    goBack()
    return false
  } catch (err) {
    console.warn('[ai-chat] check AI settings failed:', err)
    return true
  }
}

// ─── 会话管理 ─────────────────────────────────────────────
function measureMessagesViewport() {
  // #ifdef H5
  try {
    const el = document.querySelector('.messages')
    if (el && el.clientHeight) messagesViewportHeight.value = el.clientHeight
  } catch (_) {}
  // #endif

  try {
    uni.createSelectorQuery()
      .select('.messages')
      .boundingClientRect((rect) => {
        if (rect && rect.height) messagesViewportHeight.value = rect.height
      })
      .exec()
  } catch (_) {}
}
function scrollMessagesToBottom(force = false) {
  if (!force && !shouldAutoFollowMessages.value) return
  if (force) shouldAutoFollowMessages.value = true
  messagesScrollSeed += 1
  messagesScrollTop.value = messagesScrollSeed
}
function scheduleMessagesAutoScroll() {
  nextTick(() => scrollMessagesToBottom(false))
}
function onMessagesScroll(event) {
  const detail = (event && event.detail) || {}
  const scrollTop = Number(detail.scrollTop || 0)
  const scrollHeight = Number(detail.scrollHeight || 0)
  const viewportHeight = Number(detail.clientHeight || detail.height || messagesViewportHeight.value || 0)

  if (!viewportHeight) measureMessagesViewport()
  if (!scrollHeight || !viewportHeight) return

  const distanceToBottom = scrollHeight - scrollTop - viewportHeight
  shouldAutoFollowMessages.value = distanceToBottom <= AUTO_SCROLL_BOTTOM_THRESHOLD
}

function createConversation(sessionId) {
  return { id: sessionId, title: '新对话', summary: '智能摘要生成中', updatedAt: new Date().toISOString(), messages: [] }
}
function ensureConversation(sessionId) {
  const key = normalizeSessionId(sessionId) || createSessionId()
  if (!conversationMap.has(key)) conversationMap.set(key, createConversation(key))
  return conversationMap.get(key)
}
function refreshConversationMeta(conversation) {
  if (!conversation) return
  const messages = Array.isArray(conversation.messages) ? conversation.messages : []
  const firstUser = messages.find(m => m && m.role === 'user' && String(m.content || '').trim())
  const firstMsg  = firstUser || messages.find(m => m && String(m.content || '').trim())
  const lastMsg   = messages.length ? messages[messages.length - 1] : null
  const textPool  = messages.map(m => String((m && m.content) || '').trim()).filter(Boolean).join('\n')

  const itemRegex = /([\u4e00-\u9fa5A-Za-z0-9]{1,10}(?:皮|核|瓶|盒|袋|罐|纸|电池|灯管|菜叶|剩饭))/g
  const itemSet = new Set()
  let itemMatch = itemRegex.exec(textPool)
  while (itemMatch && itemSet.size < 2) { itemSet.add(itemMatch[1]); itemMatch = itemRegex.exec(textPool) }

  const categories = []
  if (textPool.includes('厨余垃圾') || textPool.includes('湿垃圾')) categories.push('厨余垃圾')
  if (textPool.includes('可回收'))   categories.push('可回收物')
  if (textPool.includes('有害垃圾')) categories.push('有害垃圾')
  if (textPool.includes('其他垃圾') || textPool.includes('干垃圾')) categories.push('其他垃圾')

  let smartSummary = ''
  const items = Array.from(itemSet)
  if (items.length && categories.length) smartSummary = `${items.join('、')} · ${categories[0]}处理`
  else if (categories.length) smartSummary = `${categories[0]}分类与再利用`
  else if (/变废为宝|再利用|改造|堆肥/.test(textPool)) smartSummary = '变废为宝执行建议'
  else if (firstMsg) smartSummary = truncateText(firstMsg.content, 16)
  else smartSummary = '环保分类咨询'

  if (conversation.customTitle) {
    conversation.title = conversation.customTitle
    conversation.summary = conversation.customTitle
  } else {
    conversation.title     = smartSummary
    conversation.summary   = smartSummary
  }
  conversation.updatedAt = (lastMsg && lastMsg.createdAt) || conversation.updatedAt || new Date().toISOString()
}

const isCancelingRename = ref(false)

function startRenameConversation(sessionId, defaultTitle = '') {
  const conversation = conversationMap.get(sessionId)
  if (!conversation) return
  editingSessionId.value = sessionId
  editingTitle.value = conversation.customTitle || conversation.title || defaultTitle || ''
}

function confirmRenameConversation(sessionId) {
  if (!editingSessionId.value || isCancelingRename.value) return
  const targetId = sessionId || editingSessionId.value
  const conversation = conversationMap.get(targetId)
  if (conversation) {
    const trimmed = (editingTitle.value || '').trim()
    const originalTitle = (conversation.customTitle || conversation.title || '').trim()
    if (trimmed && trimmed !== originalTitle) {
      conversation.customTitle = trimmed
      conversation.title = trimmed
      conversation.summary = trimmed
      syncConversationList()
      updateHeader()
      
      // 异步同步给后端保存
      const token = getStorage('token') || ''
      if (token) {
        // #ifdef H5
        fetch(`${baseUrl}/api/ai/chat/rename`, {
          method: 'POST',
          headers: buildAuthHeaders(true),
          body: JSON.stringify({ sessionId: targetId, customTitle: trimmed })
        }).catch(() => {})
        // #endif
        // #ifndef H5
        uni.request({
          url: `${baseUrl}/api/ai/chat/rename`,
          method: 'POST',
          header: buildAuthHeaders(true),
          data: { sessionId: targetId, customTitle: trimmed }
        })
        // #endif
      }

      uni.showToast({ title: '重命名成功', icon: 'success' })
    }
  }
  editingSessionId.value = ''
  editingTitle.value = ''
}

function cancelRenameConversation() {
  isCancelingRename.value = true
  editingSessionId.value = ''
  editingTitle.value = ''
  setTimeout(() => {
    isCancelingRename.value = false
  }, 150)
}

function onRenameConversation(sessionId) {
  startRenameConversation(sessionId)
}

function onDeleteConversation(sessionId) {
  const conversation = conversationMap.get(sessionId)
  if (!conversation) return

  uni.showModal({
    title: '删除对话',
    content: `确定要删除对话“${conversation.title || '此对话'}”吗？`,
    confirmColor: '#EF4444',
    success: (res) => {
      if (res.confirm) {
        conversationMap.delete(sessionId)
        
        // 异步同步给后端进行永久删除与标记
        const token = getStorage('token') || ''
        if (token) {
          // #ifdef H5
          fetch(`${baseUrl}/api/ai/chat/delete`, {
            method: 'POST',
            headers: buildAuthHeaders(true),
            body: JSON.stringify({ sessionId })
          }).catch(() => {})
          // #endif
          // #ifndef H5
          uni.request({
            url: `${baseUrl}/api/ai/chat/delete`,
            method: 'POST',
            header: buildAuthHeaders(true),
            data: { sessionId }
          })
          // #endif
        }

        if (activeSessionId.value === sessionId) {
          const sorted = getSortedConversations()
          if (sorted.length > 0) {
            setActiveSession(sorted[0].id)
          } else {
            const nextId = createSessionId()
            ensureConversation(nextId)
            setActiveSession(nextId)
          }
        } else {
          syncConversationList()
        }
        
        uni.showToast({ title: '已删除对话', icon: 'none' })
      }
    }
  })
}
function getSortedConversations() {
  return Array.from(conversationMap.values()).sort((a, b) =>
    new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
  )
}
function syncConversationList() {
  const list = getSortedConversations()
  list.forEach(item => refreshConversationMeta(item))
  conversationList.value = list
}
function updateHeader() {
  const conversation = ensureConversation(activeSessionId.value)
  refreshConversationMeta(conversation)
  chatTitle.value = conversation.title || '当前对话'
  chatSubtitle.value = conversation.messages.length
    ? `最近更新：${formatTimeLabel(conversation.updatedAt)}，可继续追问投放与再利用细节。`
    : '继续提问，AI 会结合识别结果给出更细建议。'
}
function renderActiveMessages() {
  const conversation = ensureConversation(activeSessionId.value)
  messageList.value = conversation.messages.slice()
}
function setActiveSession(sessionId) {
  const nextId = normalizeSessionId(sessionId) || createSessionId()
  activeSessionId.value = nextId
  setStorage(SESSION_KEY, nextId)
  ensureConversation(nextId)
  restoreCachedSeedImage()
  expandedSeedSummaries.value = {}
  updateHeader()
  syncConversationList()
  renderActiveMessages()
  clearPickedImage()
  shouldAutoFollowMessages.value = true
  nextTick(() => {
    measureMessagesViewport()
    scrollMessagesToBottom(true)
  })
}
function pushMessageToActive(role, content, imageBase64, createdAt, reasoning, localImagePath, messageId) {
  const conversation = ensureConversation(activeSessionId.value)
  const msg = {
    id: messageId || createMessageId(),
    role: role === 'assistant' ? 'assistant' : 'user',
    content: String(content || ''),
    imageBase64: typeof imageBase64 === 'string' ? imageBase64 : '',
    hasImage: !!imageBase64,
    createdAt: createdAt || new Date().toISOString(),
    reasoning: role === 'assistant' ? (reasoning || '') : undefined
  }
  // 小程序端：本地文件路径存到 _localImagePath 供 <image> 渲染
  if (localImagePath && typeof localImagePath === 'string') {
    msg._localImagePath = localImagePath
  }
  conversation.messages.push(msg)
  refreshConversationMeta(conversation)
  syncConversationList()
  updateHeader()
  messageList.value = conversation.messages.slice()
  nextTick(() => scrollMessagesToBottom(role !== 'assistant'))
}
function ensureWelcomeMessageIfEmpty() {
  const conversation = ensureConversation(activeSessionId.value)
  if (conversation.messages.length) return
  conversation.messages.push({
    id: createMessageId(),
    role: 'assistant',
    content: '我已准备好继续分析。你可以直接问：分类依据、投放顺序、或更详细的变废为宝执行方案。',
    imageBase64: '',
    createdAt: new Date().toISOString()
  })
  refreshConversationMeta(conversation)
}

// 小程序端：将 seed 消息中的 base64 图片写入临时文件以便 <image> 正确渲染
// （WeChat mini-program 对超大 inline base64 src 可能静默失败，
//  且 base64 有 2MB 限制，大图必须走本地文件路径）
function convertSeedImagesToTempFiles(sessionId) {
  // #ifndef H5
  try {
    const conversation = conversationMap.get(sessionId)
    if (!conversation) return
    const fs = uni.getFileSystemManager()
    // 优先取 wx.env.USER_DATA_PATH，uni.env 作为兜底
    let basePath = ''
    try {
      if (typeof wx !== 'undefined' && wx.env && wx.env.USER_DATA_PATH) {
        basePath = wx.env.USER_DATA_PATH
      } else if (typeof uni !== 'undefined' && uni.env && uni.env.USER_DATA_PATH) {
        basePath = uni.env.USER_DATA_PATH
      }
    } catch (_) {}

    if (!basePath) {
      console.warn('[ai-chat] USER_DATA_PATH unavailable, keeping base64 for seed images')
      return
    }

    for (const msg of conversation.messages) {
      if (msg && !msg._localImagePath && msg.imageBase64 && msg.imageBase64.startsWith('data:image/')) {
        const base64Data = msg.imageBase64.replace(/^data:image\/\w+;base64,/, '')
        // 生成唯一文件名，避免多图冲突
        const ext = (msg.imageBase64.match(/^data:image\/(\w+);base64,/) || [, 'jpg'])[1]
        const tempPath = `${basePath}/ai_seed_img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`
        try {
          fs.writeFileSync(tempPath, base64Data, 'base64')
          // 将本地文件路径存入 _localImagePath 供 <image> 渲染，
          // 保留原始 imageBase64（data URL）供 API 请求使用
          msg._localImagePath = tempPath
          console.log('[ai-chat] seed image saved to temp file:', tempPath)
        } catch (e) {
          console.warn('[ai-chat] writeFileSync failed, keeping base64:', e && e.message)
          // base64 保留不动，<image> 会尝试渲染（小于 2MB 时有效）
        }
      }
    }
  } catch (e) {
    console.warn('[ai-chat] convertSeedImagesToTempFiles error:', e && e.message)
  }
  // #endif
}

// 小程序端将本地临时路径转为 base64 data URL，供服务端接收
function localPathToBase64(filePath) {
  return new Promise((resolve) => {
    // #ifndef H5
    try {
      const fs = uni.getFileSystemManager()
      // 优先用同步读取，避免异步回调在某些场景下不触发
      try {
        const data = fs.readFileSync(filePath, 'base64')
        if (data) { resolve('data:image/jpeg;base64,' + data); return }
      } catch (_) {}
      // 同步失败则退回异步
      fs.readFile({
        filePath,
        encoding: 'base64',
        success: (res) => resolve('data:image/jpeg;base64,' + res.data),
        fail: () => resolve('')
      })
    } catch (e) {
      resolve('')
    }
    // #endif
    // #ifdef H5
    // H5: filePath 可能是 blob URL 或 data URL，直接返回 data URL
    // 如果是 blob URL，用 fetch 读取并转成 data URL
    if (!filePath || typeof filePath !== 'string') { resolve(''); return }
    if (filePath.startsWith('data:')) { resolve(filePath); return }
    if (filePath.startsWith('blob:')) {
      fetch(filePath)
        .then(r => r.blob())
        .then(blob => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result || '')
          reader.onerror = () => resolve('')
          reader.readAsDataURL(blob)
        })
        .catch(() => resolve(''))
      return
    }
    // 相对路径或绝对路径：当作文件 URL 处理
    fetch(filePath)
      .then(r => r.blob())
      .then(blob => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result || '')
        reader.onerror = () => resolve('')
        reader.readAsDataURL(blob)
      })
      .catch(() => resolve(''))
    // #endif
  })
}

// ─── 图片选择 ─────────────────────────────────────────────
function clearPickedImage() {
  pickedImageDataUrl.value = ''
  pickedImageLocalPath.value = ''
  pickedImageName.value = ''
}
function onPickImage() {
  if (imagePreparing.value || isStreaming.value) return
  uni.chooseImage({
    count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'],
    success: async res => {
      const path = res.tempFilePaths?.[0]
      if (!path) return
      imagePreparing.value = true
      uni.showLoading({ title: '正在处理图片', mask: true })
      try {
        const image = await compressChatImage(path)
        if (!image.dataUrl || dataUrlByteLength(image.dataUrl) > MAX_IMAGE_BYTES) throw new Error('图片需压缩到500KB以内')
        pickedImageDataUrl.value = image.dataUrl
        pickedImageLocalPath.value = image.filePath || ''
        pickedImageName.value = '已添加图片'
      } catch (error) {
        uni.showToast({ title: error?.message || '图片处理失败，请重试', icon: 'none' })
      } finally {
        imagePreparing.value = false
        uni.hideLoading()
      }
    }, fail: () => {}
  })
}

// ─── 侧边栏抽屉 ───────────────────────────────────────────
function isMobileViewport() {
  // #ifdef H5
  return window.innerWidth <= 980
  // #endif
  // #ifndef H5
  return uni.getSystemInfoSync().screenWidth <= 980
  // #endif
}
function closeHistoryDrawer() {
  historyDrawerOpen.value = false
  // #ifdef H5
  document.body.classList.remove('history-drawer-open')
  // #endif
}
function openHistoryDrawer() {
  if (!isMobileViewport()) { closeHistoryDrawer(); return }
  historyDrawerOpen.value = true
  // #ifdef H5
  document.body.classList.add('history-drawer-open')
  // #endif
}
function toggleHistoryDrawer() {
  historyDrawerOpen.value ? closeHistoryDrawer() : openHistoryDrawer()
}

// ─── 对话列表事件 ─────────────────────────────────────────
function onSelectConversation(id) {
  if (id === activeSessionId.value) return
  setActiveSession(id)
  if (isMobileViewport()) closeHistoryDrawer()
}
function onNewChat() {
  const current = ensureConversation(activeSessionId.value)
  if (!current.messages.length) {
    promptText.value = ''
    return
  }
  const nextId = createSessionId()
  ensureConversation(nextId)
  setActiveSession(nextId)
  promptText.value = ''
}

// ─── 导航 ────────────────────────────────────────────────
function goBack() {
  const pages = getCurrentPages()
  if (pages.length > 1) { uni.navigateBack(); return }
  if (getStorage('app_theme') === 'dark') uni.reLaunch({ url: '/pages-dark/home/home' })
  else uni.reLaunch({ url: '/pages/home/home' })
}

// ─── 历史加载 ─────────────────────────────────────────────
async function loadHistoryItems() {
  const token = getStorage('token') || ''
  if (!token) return { items: [], sessionMetas: {} }
  try {
    // #ifdef H5
    const res = await fetch(`${baseUrl}/api/ai/chat/history?limit=100`, {
      method: 'GET', headers: buildAuthHeaders(false)
    })
    if (!res.ok) return { items: [], sessionMetas: {} }
    const payload = await res.json()
    const items = payload && payload.code === 0 && payload.data && Array.isArray(payload.data.items)
      ? payload.data.items : []
    const sessionMetas = payload && payload.code === 0 && payload.data && payload.data.sessionMetas
      ? payload.data.sessionMetas : {}
    return {
      items: items.filter(item => item && (item.role === 'user' || item.role === 'assistant')),
      sessionMetas
    }
    // #endif
    // #ifndef H5
    return await new Promise((resolve) => {
      uni.request({
        url: `${baseUrl}/api/ai/chat/history?limit=100`,
        method: 'GET',
        header: buildAuthHeaders(false),
        success: (res) => {
          const payload = res.data
          const items = payload && payload.code === 0 && payload.data && Array.isArray(payload.data.items)
            ? payload.data.items : []
          const sessionMetas = payload && payload.code === 0 && payload.data && payload.data.sessionMetas
            ? payload.data.sessionMetas : {}
          resolve({
            items: items.filter(item => item && (item.role === 'user' || item.role === 'assistant')),
            sessionMetas
          })
        },
        fail: () => resolve({ items: [], sessionMetas: {} })
      })
    })
    // #endif
  } catch (_) { return { items: [], sessionMetas: {} } }
}
function hydrateConversations(historyData) {
  conversationMap = new Map()
  reasoningCollapsed.value = {}
  const list = historyData && Array.isArray(historyData.items) ? historyData.items : []
  const sessionMetas = (historyData && historyData.sessionMetas) || {}

  for (const item of list) {
    const sessionId = normalizeSessionId(item.sessionId) || 'legacy_default'
    const conversation = ensureConversation(sessionId)
    
    // 使用后端数据库返回的 customTitle
    const title = sessionMetas[sessionId]
    if (title) {
      conversation.customTitle = title
    }
    
    const content = String(item.content || '').trim()
    if (!content) continue
    conversation.messages.push({
      id: item.id ?? createMessageId(),
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content,
      reasoning: item.role === 'assistant' ? String(item.reasoning || '') : '',
      hasImage: !!item.hasImage,
      recognitionHistoryId: item.recognitionHistoryId || null,
      imageAvailable: !!item.imageAvailable,
      imageExpired: !!item.imageExpired,
      imageExpiresAt: item.imageExpiresAt || null,
      imageBase64: '',
      createdAt: item.createdAt || new Date().toISOString()
    })
    conversation.updatedAt = item.createdAt || conversation.updatedAt
  }
  Array.from(conversationMap.values()).forEach(c => refreshConversationMeta(c))
}

// ─── Seed（来自识别页的初始数据） ──────────────────────────
function parseSeedPayload() {
  const raw = getStorage(SEED_KEY) || ''
  const parsed = safeJsonParse(raw)
  if (!parsed || typeof parsed !== 'object') return null
  return parsed
}
function stripRecognitionPrefix(text) {
  return String(text || '')
    .replace(/^我已经完成识别[，,]\s*/, '')
    .replace(/^我已经完成识别\s*/, '')
    .trim()
}
function buildSeedUserText(payload) {
  const raw = stripRecognitionPrefix(String(payload.userPrompt || '').trim())
  return raw || '请基于这张图继续分析具体物品分类和可执行的变废为宝方案。'
}
function buildSeedAssistantText(payload) {
  const raw = String(payload.assistantReply || '').trim()
  if (raw) return raw
  const category = String(payload.category || '').trim()
  if (!category) return '我已经拿到这次识别结果。你可以继续问我：具体物品分类依据、投放注意事项或变废为宝步骤。'
  return `我已读取这次识别结果，主要类别是「${category}」。\n如果你愿意，我可以继续细化到每个物品的分类依据，并给出可执行的变废为宝步骤。`
}
function cachedImageOwner() {
  let value = getStorage('userInfo')
  if (!value) {
    try { value = uni.getStorageSync('userInfo') } catch (_) {}
  }
  const info = typeof value === 'string' ? safeJsonParse(value) : value
  return String(info?.username || '')
}
function bindCachedSeedImage(seed, sessionId, pending = false) {
  setStorage(SEED_IMAGE_BINDING_KEY, JSON.stringify({
    fingerprint: seedImageFingerprint(seed), sessionId, owner: cachedImageOwner(), pending
  }))
}
function restoreCachedSeedImage() {
  const seed = parseSeedPayload()
  const fingerprint = seedImageFingerprint(seed)
  if (!fingerprint || fingerprint !== String(getStorage(SEED_CONSUMED_KEY) || '').trim()) return
  const binding = safeJsonParse(getStorage(SEED_IMAGE_BINDING_KEY))
  const sessionId = cachedSeedSession(binding, fingerprint, cachedImageOwner(), activeSessionId.value || getStorage(SESSION_KEY))
  let conversation = conversationMap.get(sessionId)
  if (!conversation && sessionId && binding?.fingerprint === fingerprint && binding.pending === true && binding.owner && binding.owner === cachedImageOwner()) {
    const image = resolveCachedSeedImage(seed, getStorage)
    if (!image && !Number(seed.historyId)) return
    conversation = ensureConversation(sessionId)
    appendCachedSeedMessages(conversation, seed, image)
    convertSeedImagesToTempFiles(sessionId)
    return
  }
  if (!conversation) return
  const target = findCachedSeedMessage(conversation.messages, buildSeedUserText(seed), buildSeedAssistantText(seed))
  if (!target || target.imageBase64 || target.imageExpired) return
  const image = resolveCachedSeedImage(seed, getStorage)
  if (!image) return
  target.imageBase64 = image
  bindCachedSeedImage(seed, sessionId)
  convertSeedImagesToTempFiles(sessionId)
}
function appendCachedSeedMessages(conversation, seedPayload, seedImage) {
  const createdAt = String(seedPayload.createdAt || '').trim()
  const seedUserText = buildSeedUserText(seedPayload)
  const seedText = buildSeedAssistantText(seedPayload)
  if (seedUserText || seedImage) {
    conversation.messages.push({
      id: createMessageId(),
      role: 'user', content: seedUserText || '请继续分析这张图片。',
      imageBase64: seedImage, createdAt: createdAt || new Date().toISOString(),
      recognitionHistoryId: Number(seedPayload.historyId) > 0 ? Number(seedPayload.historyId) : null,
      hasImage: !!seedImage || Number(seedPayload.historyId) > 0,
      imageExpired: !!createdAt && Date.now() - new Date(createdAt).getTime() > 180 * 86400000,
      _pendingPersist: true
    })
  }
  if (seedText) {
    conversation.messages.push({
      id: createMessageId(),
      role: 'assistant', content: seedText, imageBase64: '',
      createdAt: createdAt || new Date().toISOString(),
      _pendingPersist: true
    })
  }
  refreshConversationMeta(conversation)
}
function maybeStartFromFreshSeed() {
  const seedPayload = parseSeedPayload()
  if (!seedPayload) return null
  const seedFingerprint = seedImageFingerprint(seedPayload)
  const consumedAt = String(getStorage(SEED_CONSUMED_KEY) || '').trim()
  if (!seedFingerprint || seedFingerprint === consumedAt) return null

  const newSessionId = createSessionId()
  ensureConversation(newSessionId)
  activeSessionId.value = newSessionId
  setStorage(SESSION_KEY, newSessionId)

  const seedImage = resolveCachedSeedImage(seedPayload, getStorage)
  appendCachedSeedMessages(ensureConversation(newSessionId), seedPayload, seedImage)
  setStorage(SEED_CONSUMED_KEY, seedFingerprint)
  bindCachedSeedImage(seedPayload, newSessionId, true)
  return newSessionId
}
function ensureSessionId() {
  const existing = normalizeSessionId(getStorage(SESSION_KEY) || '')
  if (existing) return existing
  const next = createSessionId()
  setStorage(SESSION_KEY, next)
  return next
}

// ─── SSE 流式对话（仅 H5） ────────────────────────────────
async function streamChat({ text, imageBase64, history, seedMessages, enableThinking }) {
  // #ifdef H5
  abortCtrl = new AbortController()
  // #endif
  isStreaming.value = true
  streamingText.value = ''

  // #ifdef H5
  const response = await fetch(`${baseUrl}/api/ai/chat/stream`, {
    method: 'POST',
    headers: buildAuthHeaders(true),
    body: JSON.stringify({ text, imageBase64, history, seedMessages, sessionId: activeSessionId.value, enableThinking }),
    signal: abortCtrl.signal
  })

  const contentType = String(response.headers.get('Content-Type') || '').toLowerCase()
  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => null)
    const code = Number(payload && payload.code)
    const message = String((payload && (payload.msg || payload.message || payload.error)) || '').trim()
    if (code === 401 || response.status === 401) throw new Error('登录已失效，请重新登录后再试。')
    throw new Error(message || `请求失败（HTTP ${response.status}）`)
  }
  if (!response.ok || !response.body) {
    if (response.status === 401) throw new Error('登录已失效，请重新登录后再试。')
    throw new Error(`请求失败（HTTP ${response.status}）`)
  }

  let full = ''
  let reasoning = ''   // 累积推理内容
  let pending = ''
  let errorMessage = ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      pending += decoder.decode(value, { stream: true })
      const events = pending.split('\n\n')
      pending = events.pop() || ''
      for (const block of events) {
        const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
        let eventName = 'message', data = null
        for (const line of lines) {
          if (line.startsWith('event:')) eventName = line.slice(6).trim()
          else if (line.startsWith('data:')) data = safeJsonParse(line.slice(5).trim())
        }
        if (!data) continue
        if (eventName === 'delta') {
          full = data.full || (full + (data.chunk || ''))
          streamingText.value = full
          scheduleMessagesAutoScroll()
        } else if (eventName === 'reasoning') {
          // 推理增量事件（后端每次推送 chunk，客户端拼接）
          reasoning = (reasoning || '') + (data.chunk || '')
          streamingReasoning.value = reasoning
          scheduleMessagesAutoScroll()
        } else if (eventName === 'done') {
          full = data.content || full
          // done 事件中若包含 reasoning，优先取完整值
          if (data.reasoning) reasoning = data.reasoning
          streamingText.value = full
          scheduleMessagesAutoScroll()
        } else if (eventName === 'error') {
          const code = Number(data && data.code)
          errorMessage = code === 401 ? '登录已失效，请重新登录后再试。' : String(data.message || '未知错误')
        }
      }
    }
  } catch (err) {
    if (err && err.name === 'AbortError') {
      const abortedText = full ? `${full}\n\n（已停止）` : '已停止当前回答。'
      streamingText.value = ''
      streamingReasoning.value = ''
      isStreaming.value = false
      return { content: abortedText, aborted: true }
    }
    throw err
  } finally {
    reader.releaseLock()
  }

  if (errorMessage) {
    streamingText.value = ''
    streamingReasoning.value = ''
    isStreaming.value = false
    return { content: `请求失败：${errorMessage}`, aborted: false }
  }
  if (!full.trim()) full = 'AI 暂未返回内容。'
  streamingText.value = ''
  streamingReasoning.value = ''
  isStreaming.value = false
  return { content: full, reasoning, aborted: false }
  // #endif

  // #ifndef H5
  // 非 H5 平台（小程序/APP）：使用 WebSocket 流式输出
  return await new Promise((resolve, reject) => {
    isStreaming.value = true
    streamingText.value = ''
    streamingReasoning.value = ''

    const token = getStorage('token') || ''
    if (!token) {
      isStreaming.value = false
      reject(new Error('登录已失效，请重新登录后再试。'))
      return
    }

    // 将 http baseUrl 转为 ws/wss 协议
    const wsBaseUrl = baseUrl.replace(/^http/, 'ws')
    const wsUrl = `${wsBaseUrl}/ws/ai/chat?token=${encodeURIComponent(token)}`

    let full = ''
    let reasoning = ''
    let errorMessage = ''
    let resolved = false

    const finish = (result) => {
      if (resolved) return
      resolved = true
      isStreaming.value = false
      streamingText.value = ''
      streamingReasoning.value = ''
      if (wsSocket) {
        try { wsSocket.close() } catch (_) {}
        wsSocket = null
      }
      resolve(result)
    }

    const fail = (err) => {
      if (resolved) return
      resolved = true
      isStreaming.value = false
      streamingText.value = ''
      streamingReasoning.value = ''
      if (wsSocket) {
        try { wsSocket.close() } catch (_) {}
        wsSocket = null
      }
      reject(err)
    }

    try {
      wsSocket = uni.connectSocket({
        url: wsUrl,
        success: () => { console.log('[ai-chat] ws connecting...') },
        fail: (err) => {
          console.error('[ai-chat] ws connect fail:', err)
          fail(new Error('WebSocket 连接失败'))
        }
      })
    } catch (e) {
      fail(new Error('WebSocket 连接异常'))
      return
    }

    wsSocket.onOpen(() => {
      console.log('[ai-chat] ws connected, sending chat request')
      wsSocket.send({
        data: JSON.stringify({
          type: 'chat',
          text,
          imageBase64,
          history,
          seedMessages,
          sessionId: activeSessionId.value,
          enableThinking
        })
      })
    })

    wsSocket.onMessage((res) => {
      let data
      try { data = JSON.parse(res.data) } catch (_) { return }
      if (!data || !data.type) return

      switch (data.type) {
        case 'connected':
          // 连接确认，等待 chat 请求
          break
        case 'retrieval':
          // RAG 检索结果，可忽略或展示
          break
        case 'reasoning':
          reasoning += (data.chunk || '')
          streamingReasoning.value = reasoning
          scheduleMessagesAutoScroll()
          break
        case 'delta':
          full = data.full || (full + (data.chunk || ''))
          streamingText.value = full
          scheduleMessagesAutoScroll()
          break
        case 'usage':
          // token 用量，可忽略
          break
        case 'done':
          full = data.content || full
          if (data.reasoning) reasoning = data.reasoning
          finish({ content: full || 'AI 暂未返回内容。', reasoning, aborted: false })
          break
        case 'error':
          const code = Number(data.code)
          errorMessage = code === 401 ? '登录已失效，请重新登录后再试。' : String(data.message || '未知错误')
          fail(new Error(errorMessage))
          break
      }
    })

    wsSocket.onError((err) => {
      console.error('[ai-chat] ws error:', err)
      if (!resolved) fail(new Error('WebSocket 连接异常'))
    })

    wsSocket.onClose((res) => {
      console.log('[ai-chat] ws closed:', res)
      if (!resolved) {
        // 如果有部分内容，返回它；否则报错
        if (full.trim()) {
          finish({ content: full, reasoning, aborted: true })
        } else {
          fail(new Error('WebSocket 连接已关闭'))
        }
      }
    })
  })
  // #endif
}

function extractHistoryForRequest() {
  const conversation = ensureConversation(activeSessionId.value)
  return conversation.messages
    .slice(-10)
    .map(item => {
      const entry = { role: item.role, content: item.content }
      if (item.imageExpired) return entry
      if (item.role === 'user' && item.hasImage && /^\d+$/.test(String(item.id))) { entry.messageId = item.id; return entry }
      if (item.role === 'user' && item.recognitionHistoryId) { entry.recognitionHistoryId = item.recognitionHistoryId; return entry }
      // 保留图片信息，让后端能构建多模态消息
      if (item.role === 'user' && item.imageBase64) {
        let img = item.imageBase64
        // 大图占位符：从独立存储 key 恢复实际 base64
        if (img.startsWith('__LARGE_IMAGE__:')) {
          img = getStorage('ai_chat_seed_image_large') || ''
        }
        // 只发送有效的 data URL 或 http URL，过滤掉本地文件路径
        if (img && (img.startsWith('data:image/') || img.startsWith('http://') || img.startsWith('https://'))) {
          entry.imageBase64 = img
        }
      }
      return entry
    })
    .filter(item => item.content && (item.role === 'user' || item.role === 'assistant'))
}

// ─── 发送消息 ─────────────────────────────────────────────
async function extractPendingPersistMessages() {
  const conversation = ensureConversation(activeSessionId.value)
  const pending = conversation.messages.filter(item => item?._pendingPersist && (item.role === 'user' || item.role === 'assistant'))
  for (const item of pending) {
    if (item.role === 'user' && !item.imageExpired && !item.recognitionHistoryId && item.imageBase64) {
      const compressed = await compressChatImage(item.imageBase64)
      item.imageBase64 = compressed.dataUrl
      item._localImagePath = compressed.filePath || ''
    }
  }
  return pending.map(item => ({
    role: item.role, content: item.content,
    reasoning: item.role === 'assistant' ? item.reasoning : undefined,
    hasImage: (!item.imageExpired && !!item.imageBase64) || !!item.recognitionHistoryId,
    recognitionHistoryId: item.recognitionHistoryId || undefined,
    imageBase64: item.role === 'user' && !item.imageExpired && !item.recognitionHistoryId ? item.imageBase64 : undefined
  })).filter(item => String(item.content || '').trim())
}

function markPendingPersistMessagesSaved() {
  const conversation = ensureConversation(activeSessionId.value)
  let changed = false
  conversation.messages.forEach((item) => {
    if (item && item._pendingPersist) {
      item._pendingPersist = false
      changed = true
    }
  })
  if (changed) {
    messageList.value = conversation.messages.slice()
    const binding = safeJsonParse(getStorage(SEED_IMAGE_BINDING_KEY))
    if (binding?.sessionId === activeSessionId.value && binding.owner === cachedImageOwner()) {
      setStorage(SEED_IMAGE_BINDING_KEY, JSON.stringify({ ...binding, pending: false }))
    }
  }
}

async function onSend() {
  if (isStreaming.value || imagePreparing.value) return
  const rawText = promptText.value.trim()
  const sendingImage = pickedImageDataUrl.value
  const displayImage = pickedImageLocalPath.value || sendingImage
  if (!rawText && !sendingImage) { uni.showToast({ title: '请先输入问题或选择图片', icon: 'none' }); return }
  streamingMessageId.value = createMessageId()
  isStreaming.value = true
  streamingText.value = '正在准备消息…'
  streamingReasoning.value = ''
  let messageSent = false
  try {
    if (sendingImage && dataUrlByteLength(sendingImage) > MAX_IMAGE_BYTES) throw new Error('图片需压缩到500KB以内')
    const seedMessagesForPersist = await extractPendingPersistMessages()
    const historyForApi = extractHistoryForRequest()
    const userText = rawText || '请基于这张图继续补充具体物品分类和可执行的变废为宝方案。'
    pushMessageToActive('user', userText, sendingImage, new Date().toISOString(), undefined, displayImage)
    messageSent = true
    promptText.value = ''
    clearPickedImage()
    const streamed = await streamChat({ text: userText, imageBase64: sendingImage, history: historyForApi, seedMessages: seedMessagesForPersist, enableThinking: isDeepThinking.value })
    if (!streamed.aborted) markPendingPersistMessagesSaved()
    pushMessageToActive('assistant', streamed.content || 'AI 暂未返回内容。', '', new Date().toISOString(), streamed.reasoning || '', '', streamingMessageId.value)
  } catch (error) {
    if (messageSent) pushMessageToActive('assistant', error?.name === 'AbortError' ? '已停止当前回答。' : `请求异常：${error?.message || error}`, '', new Date().toISOString(), '')
    else uni.showToast({ title: error?.message || '消息准备失败', icon: 'none' })
  } finally {
    isStreaming.value = false
    streamingText.value = ''
    streamingReasoning.value = ''
  }
}

function onStop() {
  // #ifdef H5
  if (abortCtrl) abortCtrl.abort()
  // #endif
  // #ifndef H5
  // 小程序端：关闭 WebSocket 连接来中止流式输出
  if (wsSocket) {
    try { wsSocket.close() } catch (_) {}
    wsSocket = null
  }
  isStreaming.value = false
  streamingText.value = ''
  streamingReasoning.value = ''
  // #endif
}

// ─── 生命周期 ─────────────────────────────────────────────
let onStorageHandler = null
let drawerMediaQuery = null
let onDrawerMediaChange = null
let composerResizeObserver = null
let onComposerWindowResize = null

function updateComposerOverlayHeight() {
  // #ifdef H5
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const composer = document.querySelector('.chat-panel .composer')
  composerOverlayHeight.value = window.innerWidth >= 1025 && composer
    ? Math.ceil(composer.getBoundingClientRect().height)
    : 0
  // #endif
}

onMounted(async () => {
  initSystemInfo()
  isDark.value = getStorage('app_theme') === 'dark'
  const canUseAiChat = await guardAiChatAccess()
  if (!canUseAiChat) return

  // #ifdef H5
  onStorageHandler = (event) => {
    if (!event || event.key === 'app_theme') isDark.value = getStorage('app_theme') === 'dark'
  }
  window.addEventListener('storage', onStorageHandler)

  drawerMediaQuery = window.matchMedia('(max-width: 980px)')
  onDrawerMediaChange = (e) => {
    if (e && !e.matches) closeHistoryDrawer()
  }
  if (drawerMediaQuery.addEventListener) drawerMediaQuery.addEventListener('change', onDrawerMediaChange)
  else if (drawerMediaQuery.addListener) drawerMediaQuery.addListener(onDrawerMediaChange)
  // #endif

  closeHistoryDrawer()

  // 初始化窄屏标识（H5 用 window.matchMedia，非 H5 用 uni.getSystemInfoSync）
  // #ifdef H5
  isNarrowScreen.value = window.innerWidth <= 480
  // #endif
  // #ifndef H5
  try {
    const sysInfo = uni.getSystemInfoSync()
    isNarrowScreen.value = (sysInfo.screenWidth || 375) <= 480
  } catch (_) {
    isNarrowScreen.value = false
  }
  // #endif

  let historyData = { items: [], sessionMetas: {} }
  try { historyData = await loadHistoryItems() } catch (_) {}
  hydrateConversations(historyData)
  restoreCachedSeedImage()

  const freshSeedSession = maybeStartFromFreshSeed()
  if (freshSeedSession) {
    // 小程序端将 seed 消息图片写入临时文件，避免 <image> 渲染大 base64 失败
    convertSeedImagesToTempFiles(freshSeedSession)
    setActiveSession(freshSeedSession)
  } else {
    const preferredId = normalizeSessionId(ensureSessionId())
    const sorted = getSortedConversations()
    const fallbackId = sorted.length ? sorted[0].id : preferredId
    const targetId = conversationMap.has(preferredId) ? preferredId : fallbackId
    ensureConversation(targetId)
    setActiveSession(targetId)
  }

  ensureWelcomeMessageIfEmpty()
  syncConversationList()
  renderActiveMessages()
  updateHeader()
  promptText.value = ''
  clearPickedImage()
  nextTick(() => {
    measureMessagesViewport()
    scrollMessagesToBottom(true)
    // #ifdef H5
    updateComposerOverlayHeight()
    const composer = document.querySelector('.chat-panel .composer')
    if (composer && typeof ResizeObserver !== 'undefined') {
      composerResizeObserver = new ResizeObserver(updateComposerOverlayHeight)
      composerResizeObserver.observe(composer)
    } else if (typeof window !== 'undefined') {
      onComposerWindowResize = updateComposerOverlayHeight
      window.addEventListener('resize', onComposerWindowResize)
    }
    // #endif
  })
})

onHide(closeHistoryDrawer)
onUnload(closeHistoryDrawer)

onBeforeUnmount(() => {
  closeHistoryDrawer()
  if (abortCtrl) abortCtrl.abort()
  if (wsSocket) {
    try { wsSocket.close() } catch (_) {}
    wsSocket = null
  }
  // #ifdef H5
  if (composerResizeObserver) {
    composerResizeObserver.disconnect()
    composerResizeObserver = null
  }
  if (onComposerWindowResize) {
    window.removeEventListener('resize', onComposerWindowResize)
    onComposerWindowResize = null
  }
  if (onStorageHandler) window.removeEventListener('storage', onStorageHandler)
  if (drawerMediaQuery && onDrawerMediaChange) {
    if (drawerMediaQuery.removeEventListener) drawerMediaQuery.removeEventListener('change', onDrawerMediaChange)
    else if (drawerMediaQuery.removeListener) drawerMediaQuery.removeListener(onDrawerMediaChange)
  }
  // #endif
})
</script>

<style>
/* DeepSeek风格CSS变量定义 */
.shell {
  /* 主背景色 - 纯白/浅灰 */
  --bg-primary: #FFFFFF;
  --bg-secondary: #F7F8FA;
  --bg-tertiary: #F1F3F5;
  --bg-sidebar: #F7F8FA;

  /* 强调色 - DeepSeek蓝 */
  --accent: #4D6BFE;
  --accent-light: rgba(77, 107, 254, 0.1);
  --accent-hover: #3D5BEE;

  /* 文本颜色 */
  --text-primary: #1a1a1a;
  --text-secondary: #6B7280;
  --text-tertiary: #9CA3AF;
  --text-inverse: #FFFFFF;

  /* 边框 */
  --border-light: #E5E7EB;
  --border-medium: #D1D5DB;

  /* 阴影 */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.12);

  /* 消息气泡 */
  --bubble-ai-bg: #FFFFFF;
  --bubble-ai-border: #E5E7EB;
  --bubble-user-bg: linear-gradient(135deg, #4D6BFE, #6B8BFF);
  --bubble-user-text: #FFFFFF;

  /* 输入框 */
  --input-bg: #FFFFFF;
  --input-border: #E5E7EB;
  --input-focus: #4D6BFE;

  /* 功能按钮 */
  --btn-think-active: rgba(77, 107, 254, 0.12);
  --btn-think-active-text: #4D6BFE;
  --btn-think-inactive: #F3F4F6;
  --btn-think-inactive-text: #6B7280;

  /* 状态 */
  --status-online: #22C55E;
  --status-busy: #4D6BFE;
  --danger: #EF4444;

  /* 字体 */
  --font-main: "PingFang SC", "Microsoft YaHei", "Helvetica Neue", sans-serif;
  --font-mono: "SF Mono", "Menlo", "Monaco", monospace;
}

/* 深色主题 */
.shell.dark-theme {
  --bg-primary: #1A1A1A;
  --bg-secondary: #262626;
  --bg-tertiary: #333333;
  --bg-sidebar: #262626;

  --text-primary: #FAFAFA;
  --text-secondary: #A1A1AA;
  --text-tertiary: #71717A;

  --border-light: #3F3F46;
  --border-medium: #52525B;

  --bubble-ai-bg: #262626;
  --bubble-ai-border: #3F3F46;
  --bubble-user-bg: linear-gradient(135deg, #4D6BFE, #6B8BFF);
  --bubble-user-text: #FFFFFF;

  --input-bg: #262626;
  --input-border: #3F3F46;

  --btn-think-active: rgba(77, 107, 254, 0.2);
  --btn-think-active-text: #8BA4FF;
  --btn-think-inactive: #3F3F46;
  --btn-think-inactive-text: #A1A1AA;

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);
}

/* 平台兼容 */
page, view, text, scroll-view, swiper, button, form, input, textarea, label, navigator, image {
  box-sizing: border-box;
}

/* #ifdef H5 */
*, *::before, *::after { box-sizing: border-box; }
/* H5滚动条美化 */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(100, 100, 100, 0.3); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(100, 100, 100, 0.5); }
/* #endif */

/* ─── shell根布局：尺寸与滚动限制仅作用于聊天页 ─── */
.shell {
  width: 100%;
  padding-top: constant(safe-area-inset-top);
  padding-top: env(safe-area-inset-top);
  /* 减去小程序状态栏高度 */
  height: calc(100vh - constant(safe-area-inset-top));
  height: calc(100vh - env(safe-area-inset-top));
  display: grid;
  grid-template-columns: 260px 1fr;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-main);
  position: relative;
  overflow: hidden;
}

/* ─── 侧边栏 - DeepSeek浅灰风格 ─── */
.shell .sidebar {
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-light);
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.shell .sidebar-top {
  padding: 16px;
  flex-shrink: 0;
}

.shell .brand-card {
  background: var(--bg-primary);
  border: 1px solid var(--border-light);
  border-radius: 16px;
  padding: 16px;
  box-shadow: var(--shadow-sm);
}

.shell .brand-kicker {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 1.5px;
  color: var(--accent);
  text-transform: uppercase;
}

.shell .sidebar-h1 {
  margin-top: 8px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.3px;
}

.shell .sidebar-p {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.shell .new-chat-btn {
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  transition: all 0.2s ease;
}

.shell .new-chat-btn:active {
  background: var(--bg-tertiary);
  transform: scale(0.98);
}

.shell .new-chat-icon {
  font-size: 16px;
  font-weight: 600;
}

.shell .conversation-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
}

.shell .conversation-item {
  padding: 12px 14px;
  border-radius: 12px;
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-bottom: 4px;
}

.shell .conversation-item:hover {
  background: var(--bg-tertiary);
}

.shell .conversation-item.active {
  background: var(--accent-light);
  border-color: var(--accent);
}

.shell .conversation-item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.shell .conversation-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.shell .conversation-title-input {
  flex: 1;
  min-width: 0;
  height: 24px;
  font-size: 12px;
  color: var(--text-primary);
  background: var(--bg-card, rgba(255, 255, 255, 0.8));
  border: 1px solid var(--accent, #3b82f6);
  border-radius: 4px;
  padding: 0 6px;
  outline: none;
  box-sizing: border-box;
}

.shell .conversation-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0.85;
  transition: opacity 0.15s ease;
  flex-shrink: 0;
}

.shell .conversation-item:hover .conversation-actions,
.shell .conversation-item.active .conversation-actions,
.shell .conversation-item.is-editing .conversation-actions {
  opacity: 1;
}

.shell .action-btn {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  background: transparent;
  transition: all 0.15s ease;
}

.shell .action-btn:hover {
  background: rgba(128, 128, 128, 0.2);
  transform: scale(1.08);
}

.shell .action-btn.check-btn:hover {
  background: rgba(34, 197, 94, 0.2);
  color: #16a34a;
}

.shell .action-btn.cancel-btn:hover {
  background: rgba(156, 163, 175, 0.2);
}

.shell .action-btn.delete-btn:hover {
  background: rgba(239, 68, 68, 0.15);
}

.shell .action-icon {
  font-size: 11px;
  line-height: 1;
}

.shell .conversation-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  margin-left: 8px;
  flex-shrink: 0;
}

.shell .conversation-summary {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shell .conversation-meta {
  margin-top: 6px;
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--text-tertiary);
}

.shell .history-empty {
  padding: 20px 16px;
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.shell .sidebar-footnote {
  padding: 12px 16px;
  font-size: 10px;
  color: var(--text-tertiary);
  text-align: center;
  border-top: 1px solid var(--border-light);
  flex-shrink: 0;
}

/* ─── 抽屉遮罩 ─── */
.shell .history-backdrop {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 999;
  background: rgba(0, 0, 0, 0.3);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.shell .history-backdrop.backdrop-open {
  opacity: 1;
  pointer-events: auto;
}

/* ─── 汉堡菜单按钮 ─── */
.shell .history-toggle {
  display: none;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-light);
  border-radius: 8px;
  cursor: pointer;
}

.shell .history-toggle-bar,
.shell .history-toggle-bar::before,
.shell .history-toggle-bar::after {
  display: block;
  width: 16px;
  height: 2px;
  border-radius: 2px;
  background: var(--text-primary);
  content: "";
}

.shell .history-toggle-bar {
  position: relative;
}

.shell .history-toggle-bar::before {
  position: absolute;
  left: 0;
  top: -5px;
}

.shell .history-toggle-bar::after {
  position: absolute;
  left: 0;
  top: 5px;
}

/* ─── 聊天面板 ─── */
.shell .chat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--bg-primary);
}

.shell .chat-header {
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-light);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-primary);
  flex-shrink: 0;
}

.shell .header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.shell .chat-header-main {
  flex: 1;
  min-width: 0;
}

.shell .chat-header-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.shell .chat-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.shell .status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 20px;
  background: rgba(34, 197, 94, 0.1);
  font-size: 12px;
  color: #22C55E;
}

.shell .status-pill.is-streaming {
  background: var(--accent-light);
  color: var(--accent);
}

.shell .status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #22C55E;
}

.shell .status-pill.is-streaming .status-dot {
  background: var(--accent);
  animation: statusPulse 1.5s infinite;
}

.shell .chat-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.shell .header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.shell .header-chip {
  padding: 6px 12px;
  border-radius: 20px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-light);
  font-size: 12px;
  color: var(--text-secondary);
}

/* ─── 按钮基础样式 ─── */
.shell .btn {
  padding: 8px 16px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
}

.shell .btn.ghost {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-light);
}

.shell .btn.ghost:active {
  background: var(--border-light);
}

/* ─── 消息区域 ─── */
.shell .messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  background: var(--bg-primary);
}

.shell .intro-panel {
  max-width: 720px;
  margin: 0 auto 24px;
  padding: 32px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-light);
  border-radius: 20px;
}

.shell .intro-kicker {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1.5px;
  color: var(--accent);
  text-transform: uppercase;
}

.shell .intro-title {
  margin-top: 12px;
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.3;
}

.shell .intro-copy {
  margin-top: 12px;
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.shell .intro-tags {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-top: 20px;
}

.shell .intro-tag {
  padding: 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border-light);
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.shell .intro-tag:hover {
  border-color: var(--accent);
  box-shadow: var(--shadow-sm);
}

.shell .intro-tag-title {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.shell .intro-tag-copy {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.shell .empty-chat {
  max-width: 480px;
  margin: 40px auto;
  padding: 24px;
  text-align: center;
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.6;
}

/* ─── 消息行 ─── */
.shell .message-row {
  max-width: 720px;
  margin: 0 auto 20px;
  display: flex;
  align-items: flex-start;
}

.shell .message-row.from-user {
  flex-direction: row-reverse;
}

.shell .avatar {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.shell .assistant-avatar {
  margin-right: 12px;
  background: transparent;
}

.shell .user-avatar {
  margin-left: 12px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border: 1px solid var(--border-light);
}

.shell .message-content {
  flex: 1;
  min-width: 0;
}

.shell .message-row.from-user .message-content {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.shell .message-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 11px;
}

.shell .message-row.from-user .message-meta {
  flex-direction: row-reverse;
}

.shell .message-author {
  font-weight: 500;
  color: var(--text-secondary);
}

.shell .message-time {
  color: var(--text-tertiary);
}

.shell .msg {
  padding: 14px 18px;
  border-radius: 18px;
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.shell .msg.assistant {
  background: var(--bubble-ai-bg);
  border: 1px solid var(--bubble-ai-border);
  color: var(--text-primary);
  border-bottom-left-radius: 6px;
  min-height: 44px;
  white-space: normal;
}

.shell .msg.user {
  background: var(--bubble-user-bg);
  color: var(--bubble-user-text);
  border-bottom-right-radius: 6px;
}

.shell .msg.streaming {
  opacity: 0.9;
}

.shell .seed-summary { min-width: 0; }
.shell .seed-summary-title {
  display: block;
  margin-bottom: 12px;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}
.shell .seed-summary-labels {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.shell .seed-summary-label {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  padding: 5px 10px;
  border-radius: 10px;
  background: var(--accent-light);
  font-size: 12px;
}
.shell .seed-label-name { color: var(--text-primary); }
.shell .seed-label-confidence { color: var(--accent); font-weight: 600; }
.shell .seed-summary-items,
.shell .seed-summary-detail {
  padding: 10px 0;
  border-top: 1px solid var(--border-light);
}
.shell .seed-summary-caption {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}
.shell .seed-summary-copy {
  display: block;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.7;
  color: var(--text-primary);
}
.shell .seed-summary-toggle {
  padding: 10px 0 2px;
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.shell .msg-image-placeholder { padding: 14px; margin-bottom: 8px; border: 1px dashed var(--border-color, #d1d5db); border-radius: 8px; font-size: 12px; color: var(--text-secondary, #6b7280); }
.shell .image-retry { margin-left: 10px; color: #4D6BFE; }

/* 深度思考推理区：DeepSeek风格，浅底左侧竖线 */
.shell .reasoning-block {
  margin-bottom: 8px;
  padding: 7px 10px 7px 12px;
  background: rgba(77, 107, 254, 0.05);
  border-left: 2.5px solid rgba(77, 107, 254, 0.45);
  border-radius: 0 8px 8px 0;
}

.shell .reasoning-header {
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.shell .reasoning-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--btn-think-active-text, #4D6BFE);
  letter-spacing: 0.5px;
}

.shell .reasoning-chevron {
  font-size: 13px;
  color: var(--btn-think-active-text, #4D6BFE);
  transition: transform 0.18s ease;
  flex-shrink: 0;
}
.shell .reasoning-chevron.collapsed {
  transform: rotate(-90deg);
}

.shell .reasoning-body {
  margin-top: 5px;
}

.shell.dark-theme .reasoning-block {
  background: rgba(77, 107, 254, 0.07);
  border-left-color: rgba(77, 107, 254, 0.50);
}

.shell .msg-body {
  display: block;
}

.shell .assistant-text {
  min-height: 1.5em;
  white-space: pre-wrap;
}

.shell .msg-image {
  display: block;
  width: 280px;
  max-width: 100%;
  cursor: zoom-in;
  border-radius: 12px;
  margin-bottom: 10px;
  background: var(--bg-tertiary);
}

/* ─── 输入区域 - DeepSeek风格 ─── */
.shell .composer {
  padding: 16px 24px 24px;
  background: var(--bg-primary);
  border-top: 1px solid var(--border-light);
  flex-shrink: 0;
}

.shell .image-pending {
  max-width: 720px;
  margin: 0 auto 12px;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.shell .image-pending-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.shell .image-pending-label {
  font-size: 10px;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.shell .image-pending-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.shell .image-pending-clear {
  color: var(--danger);
  font-size: 12px;
  padding: 4px 8px;
  cursor: pointer;
}

.shell .composer-card {
  max-width: 720px;
  margin: 0 auto;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 16px;
  padding: 12px;
  box-shadow: var(--shadow-sm);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.shell .composer-card:focus-within {
  border-color: var(--input-focus);
  box-shadow: 0 0 0 3px var(--accent-light);
}

.shell .prompt-textarea {
  width: 100%;
  min-height: 36px;
  max-height: 200px;
  border: none;
  background: transparent;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-primary);
  outline: none;
  resize: none;
  padding: 4px 8px;
  overflow-y: auto;
}

.shell .prompt-textarea::placeholder {
  color: var(--text-tertiary);
}

.shell .composer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 8px;
  border-top: 1px solid var(--border-light);
  margin-top: 8px;
}

.shell .composer-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.shell .composer-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* DeepSeek风格：深度思考按钮 */
.shell .deep-think-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--btn-think-inactive);
  color: var(--btn-think-inactive-text);
}

.shell .deep-think-btn.active {
  background: var(--btn-think-active);
  color: var(--btn-think-active-text);
}

/* 图标本身作为操作按钮，避免外层再套一个按钮底板 */
.shell .attach-icon,
.shell .send-icon {
  display: block;
  font-size: 18px;
  flex-shrink: 0;
  cursor: pointer;
  transition: transform 0.12s ease;
}

.shell .attach-icon:active,
.shell .send-icon:active {
  transform: scale(0.94);
}

/* 停止按钮 */
.shell .btn-stop {
  padding: 6px 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-medium);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.shell .btn-stop:active {
  background: var(--border-light);
}

.shell .stop-text {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
}

/* 快速操作标签 */
.shell .composer-suggestions {
  max-width: 720px;
  margin: 0px auto 0;
  white-space: nowrap;
  overflow-x: auto;
}

.shell .suggestions-track {
  display: flex;
  gap: 8px;
  padding: 4px 0;
}

.shell .suggestion-pill {
  flex-shrink: 0;
  padding: 8px 14px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-light);
  border-radius: 20px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.shell .suggestion-pill:hover {
  background: var(--accent-light);
  border-color: var(--accent);
  color: var(--accent);
}

/* ─── 动画 ─── */
@keyframes statusPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.1); }
}

@keyframes dotPulse {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40% { transform: translateY(-3px); opacity: 1; }
}

.shell .typing-dots {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
}

.shell .typing-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-tertiary);
  animation: dotPulse 1.2s infinite ease-in-out;
}

.shell .typing-dot:nth-child(2) { animation-delay: 0.15s; }
.shell .typing-dot:nth-child(3) { animation-delay: 0.3s; }

/* ─── 深色主题覆盖 ─── */
.shell.dark-theme {
  --bg-primary: #1A1A1A;
  --bg-secondary: #262626;
  --bg-tertiary: #333333;
  --bg-sidebar: #262626;

  --text-primary: #FAFAFA;
  --text-secondary: #A1A1AA;
  --text-tertiary: #71717A;

  --border-light: #3F3F46;
  --border-medium: #52525B;

  --bubble-ai-bg: #262626;
  --bubble-ai-border: #3F3F46;
  --bubble-user-bg: linear-gradient(135deg, #4D6BFE, #6B8BFF);
  --bubble-user-text: #FFFFFF;

  --input-bg: #262626;
  --input-border: #3F3F46;

  --btn-think-active: rgba(77, 107, 254, 0.18);
  --btn-think-active-text: #8BA4FF;
  --btn-think-inactive: #3F3F46;
  --btn-think-inactive-text: #A1A1AA;

  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.5);
}

/* ─── Shell 根布局 ─── */
.shell {
  width: 100%;
  height: 100vh;
  display: flex;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-main);
  position: relative;
  overflow: hidden;
}

/* ─── 侧边栏（DeepSeek 浅灰）─── */
.shell .sidebar {
  width: 260px;
  flex: 0 0 260px;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-light);
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  position: relative;
  z-index: 2;
}

.shell .sidebar-top {
  padding: 14px 14px 10px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* DeepSeek 式极简顶栏 */
.shell .brand-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 4px;
}
.shell .brand-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  flex-shrink: 0;
}
.shell .brand-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.2px;
}

/* 新建对话按钮 */
.shell .new-chat-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 14px;
  background: var(--bg-primary);
  border: 1px solid var(--border-light);
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.15s ease;
}
.shell .new-chat-btn:active {
  background: var(--bg-tertiary);
  transform: scale(0.98);
}
.shell .new-chat-icon {
  font-size: 15px;
  font-weight: 600;
  color: var(--accent);
}

/* 历史会话列表 */
.shell .conversation-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px 8px;
}
.shell .history-empty {
  padding: 24px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.6;
}
.shell .conversation-item {
  padding: 10px 12px;
  border-radius: 8px;
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.12s ease;
  margin-bottom: 2px;
}
.shell .conversation-item:hover {
  background: var(--bg-tertiary);
}
.shell .conversation-item.active {
  background: var(--accent-light);
  border-left: 2px solid var(--accent);
  padding-left: 10px;
}
.shell .conversation-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.shell .conversation-meta {
  margin-top: 3px;
  font-size: 11px;
  color: var(--text-tertiary);
}

/* 抽屉遮罩 */
.shell .history-backdrop {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 998;
  background: rgba(0, 0, 0, 0.25);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}
.shell .history-backdrop.backdrop-open {
  opacity: 1;
  pointer-events: auto;
}

/* 汉堡菜单按钮 */
.shell .history-toggle {
  display: none;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-light);
  border-radius: 8px;
  cursor: pointer;
}
.shell .history-toggle-bar,
.shell .history-toggle-bar::before,
.shell .history-toggle-bar::after {
  display: block;
  width: 16px;
  height: 2px;
  border-radius: 2px;
  background: var(--text-primary);
  content: "";
  position: relative;
}
.shell .history-toggle-bar::before { position: absolute; left: 0; top: -5px; }
.shell .history-toggle-bar::after { position: absolute; left: 0; top: 5px; }

/* ─── 聊天主面板 ─── */
.shell .chat-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--bg-primary);
  position: relative;
  z-index: 1;
}

/* 头部 */
.shell .chat-header {
  padding: 14px 22px;
  border-bottom: 1px solid var(--border-light);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  background: var(--bg-primary);
}
.shell .header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}
.shell .chat-header-main { flex: 1; min-width: 0; }
.shell .chat-header-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.shell .chat-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}
.shell .status-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 20px;
  background: rgba(34, 197, 94, 0.10);
  font-size: 11px;
  color: var(--status-online);
}
.shell .status-pill.is-streaming {
  background: var(--accent-light);
  color: var(--accent);
}
.shell .status-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--status-online);
}
.shell .status-pill.is-streaming .status-dot {
  background: var(--accent);
  animation: statusPulse 1.4s infinite ease-in-out;
}
.shell .chat-subtitle {
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-secondary);
}
.shell .header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.shell .header-chip {
  padding: 5px 10px;
  border-radius: 20px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-light);
  font-size: 11px;
  color: var(--text-secondary);
}
.shell .btn {
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
}
.shell .btn.ghost {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-light);
}
.shell .btn.ghost:active {
  background: var(--border-light);
}

/* ─── 消息区域 ─── */
.shell .messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  background: var(--bg-primary);
}

/* 新建对话欢迎语 */
.shell .welcome-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px 32px;
  gap: 16px;
}
.shell .welcome-icon {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.shell .welcome-text {
  font-size: 20px;
  font-weight: 500;
  color: var(--text-primary);
  text-align: center;
}
.shell .empty-chat { display: none; }

.shell .empty-chat { display: none; }
.shell .typing-dots {
  display: flex;
  align-items: center;
  margin-top: 10px;
  gap: 4px;
}
.shell .typing-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--text-tertiary);
  animation: dotPulse 1.2s infinite ease-in-out;
}
.shell .typing-dot:nth-child(2) { animation-delay: 0.15s; }
.shell .typing-dot:nth-child(3) { animation-delay: 0.3s; }

/* ─── 输入区（DeepSeek 宽幅风格）─── */
.shell .composer {
  border-top: 1px solid var(--border-light);
  background: var(--bg-primary);
  flex-shrink: 0;
  padding: 12px 24px calc(14px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

/* #ifdef H5 */
.shell .composer { padding-top: 14px; }
/* #endif */
/* #ifdef APP-PLUS */
.shell .composer { padding: 12px 16px calc(16px + env(safe-area-inset-bottom)); }
/* #endif */
/* #ifdef MP-WEIXIN */
.shell .composer { padding: 10px 14px calc(14px + env(safe-area-inset-bottom)); }
/* #endif */

.shell .image-pending {
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: 10px 14px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.shell .image-pending-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.shell .image-pending-label {
  font-size: 10px;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.shell .image-pending-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;
}
.shell .image-pending-clear {
  color: var(--danger);
  font-size: 12px;
  padding: 4px 8px;
  cursor: pointer;
  flex-shrink: 0;
}

/* 输入卡片 */
.shell .composer-card {
  width: 100%;
  max-width: 780px;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 20px;
  padding: 10px 14px;
  box-shadow: var(--shadow-sm);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 0;
}
/* #ifdef H5 */
.shell .composer-card { max-width: 820px; border-radius: 24px; padding: 12px 16px; }
/* #endif */
/* #ifdef APP-PLUS */
.shell .composer-card { max-width: 760px; border-radius: 20px; }
/* #endif */
/* #ifdef MP-WEIXIN */
.shell .composer-card { max-width: 100%; border-radius: 16px; padding: 10px 12px; }
/* #endif */
.shell .composer-card:focus-within {
  border-color: var(--input-focus);
  box-shadow: 0 0 0 3px var(--accent-light);
}

.shell .prompt-textarea {
  width: 100%;
  min-height: 36px;
  max-height: 200px;
  border: none;
  background: transparent;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-primary);
  outline: none;
  resize: none;
  padding: 2px 4px 6px;
  overflow-y: auto;
}
/* #ifdef H5 */
.shell .prompt-textarea { min-height: 38px; font-size: 15px; padding: 2px 6px 6px; }
/* #endif */
/* #ifdef MP-WEIXIN */
.shell .prompt-textarea { min-height: 36px; font-size: 14px; }
/* #endif */
.shell .prompt-textarea::placeholder { color: var(--text-tertiary); }

.shell .composer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 6px;
  border-top: 1px solid var(--border-light);
  margin-top: 4px;
}
.shell .composer-left { display: flex; align-items: center; gap: 8px; }
.shell .composer-right { display: flex; align-items: center; gap: 8px; }

/* 深度思考按钮 */
.shell .deep-think-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.18s ease;
  background: var(--btn-think-inactive);
  color: var(--btn-think-inactive-text);
}
.shell .deep-think-btn.active {
  background: var(--btn-think-active);
  color: var(--btn-think-active-text);
}
.shell .deep-think-icon-char {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--btn-think-inactive-text);
  background: rgba(0, 0, 0, 0.04);
}
.shell .deep-think-btn.active .deep-think-icon-char {
  color: var(--btn-think-active-text);
  background: rgba(77, 107, 254, 0.15);
}
.shell .deep-think-text { white-space: nowrap; }

/* 停止按钮 */
.shell .btn-stop {
  padding: 5px 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-medium);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.12s ease;
}
.shell .btn-stop:active { background: var(--border-light); }
.shell .stop-text { font-size: 12px; color: var(--text-secondary); font-weight: 500; }

/* 底部快捷标签 */
.shell .composer-suggestions {
  width: 100%;
  max-width: 780px;
  white-space: nowrap;
  overflow-x: auto;
}
/* #ifdef H5 */
.shell .composer-suggestions { max-width: 820px; }
/* #endif */
.shell .suggestions-track {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 8px;
}
.shell .suggestion-pill {
  flex: 0 0 auto;
  padding: 7px 14px;
  border-radius: 999px;
  border: 1px solid var(--border-light);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.12s ease;
  white-space: nowrap;
}
.shell .suggestion-pill:active {
  background: var(--accent-light);
  color: var(--accent);
  border-color: var(--accent);
}

/* ─── 动画 ─── */
@keyframes dotPulse {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.3; }
  40% { transform: translateY(-2px); opacity: 1; }
}
@keyframes statusPulse {
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.2); opacity: 1; }
}

/* ─── 响应式：平板（≤1024px）─── */
@media (max-width: 1024px) {
  .shell .sidebar { width: 220px; flex: 0 0 220px; }
  .shell .composer-card, .shell .composer-suggestions { max-width: 90%; }
  /* #ifdef H5 */
  .shell .composer-card, .shell .composer-suggestions { max-width: 92%; }
  /* #endif */
}

/* ─── 响应式：移动端抽屉（≤980px）─── */
@media (max-width: 980px) {
  .shell { padding: 0; }
  /* #ifdef H5 */
  body.history-drawer-open { overflow: hidden; }
  /* #endif */
  .shell { height: 100vh; border-radius: 0; border: none; }
  .shell .sidebar {
    position: fixed;
    top: 0; left: 0; bottom: 0;
    width: min(82vw, 300px);
    max-width: 300px;
    z-index: 1000;
    transform: translateX(-100%);
    transition: transform 0.22s ease;
    box-shadow: 0 20px 48px rgba(0, 0, 0, 0.30);
  }
  .shell .sidebar.drawer-open { transform: translateX(0); }
  .shell .history-backdrop { display: block; }
  .shell .history-toggle { display: inline-flex; }
  .shell .msg { max-width: 95%; font-size: 13px; }
  .shell .composer-card, .shell .composer-suggestions, .shell .image-pending { max-width: 100%; }
  .shell .messages { padding: 14px 16px; }
}

/* ─── 响应式：手机（≤720px）─── */
@media (max-width: 720px) {
  .shell .chat-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    padding: calc(var(--status-bar-height, 20px) + 34px) 12px 8px;
    gap: 6px;
  }
  .shell .chat-title { font-size: 15px; }
  .shell .chat-subtitle--hidden { display: none; }
  .shell .header-chip { font-size: 10px; padding: 4px 8px; }
  .shell .btn.ghost { font-size: 12px; padding: 5px 8px; }
  .shell .messages { padding: 12px 14px; }
  /* 消息气泡：确保不超出屏幕，防止气泡过窄 */
  .shell .msg { max-width: 100% !important; width: 100%; font-size: 13px; padding: 9px 12px; }
  .shell .msg-image { width: 260px; max-width: 100% !important; }
  /* 消息行：允许换行，内容不被压缩 */
  .shell .message-row { flex-wrap: wrap; width: 100%; margin-bottom: 14px; }
  .shell .message-content { flex: 1 1 auto !important; min-width: 0; }
  .shell .composer { padding: 10px 12px calc(12px + env(safe-area-inset-bottom)); }
  .shell .prompt-textarea { font-size: 14px; }
  .shell .composer-card { border-radius: 16px; padding: 9px 12px; }
  .shell .suggestion-pill { padding: 6px 12px; font-size: 11px; }
  .shell .welcome-hero { padding: 36px 16px 24px; }
  .shell .welcome-icon { width: 44px; height: 44px; }
  .shell .welcome-text { font-size: 17px; }
}

/* ─── 响应式：超小屏（≤480px）─── */
@media (max-width: 480px) {
  .shell .sidebar { max-width: 88vw; }
  .shell .sidebar-top { padding: 8px; }
  .shell .brand-icon { width: 26px; height: 26px; border-radius: 6px; }
  .shell .brand-title { font-size: 13px; }
  .shell .new-chat-btn { padding: 8px 12px; font-size: 12px; }
  .shell .conversation-list { padding: 4px 6px; }
  .shell .conversation-item { padding: 8px 10px; }
  .shell .conversation-title { font-size: 12px; }
  .shell .chat-header { padding: calc(var(--status-bar-height, 20px) + 30px) 12px 6px; }
  .shell .history-toggle { width: 28px; height: 28px; border-radius: 6px; }
  .shell .chat-subtitle--hidden { display: none; }
  .shell .welcome-hero { padding: 20px 12px 16px; }
  .shell .welcome-icon { width: 36px; height: 36px; border-radius: 10px; }
  .shell .welcome-text { font-size: 15px; }
  .shell .composer { padding: 8px 10px calc(10px + env(safe-area-inset-bottom)); }
  .shell .composer-card { border-radius: 14px; padding: 8px 10px; }
  .shell .prompt-textarea { font-size: 13px; min-height: 38px; padding: 2px 4px 5px; }
  .shell .composer-left { flex-shrink: 0; }
  .shell .deep-think-btn { padding: 5px 8px; max-width: 130px; }
  .shell .deep-think-btn { flex-shrink: 0; }
  .shell .composer-right { flex-shrink: 0; }
  .shell .suggestion-pill { padding: 5px 10px; font-size: 10px; }
  .shell .image-pending { padding: 8px 10px; border-radius: 10px; }
  .shell .image-pending-name { max-width: 160px; }
  /* 消息气泡和小屏进一步保证 */
  .shell .msg { max-width: 100% !important; width: 100%; }
  .shell .msg-image { width: 220px; max-width: 100% !important; }
  .shell .message-row { flex-wrap: wrap; width: 100%; }
  .shell .message-content { flex: 1 1 auto !important; }
}

/* ─── AI 聊天页精修覆盖：统一桌面/手机视觉 ─── */
.shell .chat-header {
  min-height: 64px;
  padding: 12px 24px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid rgba(229, 231, 235, 0.9);
  box-shadow: 0 1px 0 rgba(17, 24, 39, 0.02);
}
.shell.dark-theme .chat-header {
  background: rgba(26, 26, 26, 0.94);
  border-bottom-color: rgba(63, 63, 70, 0.9);
}
.shell .chat-header-row {
  gap: 8px;
  min-width: 0;
}
.shell .chat-title-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: linear-gradient(135deg, #10b981, #4D6BFE);
  box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.1);
  flex-shrink: 0;
}
.shell .chat-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.35;
}
.shell .chat-header-subtitle {
  margin-top: 2px;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.shell .header-actions .btn.ghost {
  border-radius: 10px;
  padding: 8px 14px;
  background: var(--bg-secondary);
}
.shell .compact-back-icon { display: none; }
.shell .messages {
  padding: 22px 28px;
}
.shell .message-row {
  max-width: 780px;
  margin-bottom: 22px;
}
.shell .avatar {
  width: 38px;
  height: 38px;
  border-radius: 12px;
}
.shell .message-meta {
  margin-bottom: 7px;
}
.shell .msg {
  line-height: 1.75;
}
.shell .msg.assistant {
  border-radius: 18px;
  border-bottom-left-radius: 8px;
  box-shadow: 0 6px 20px rgba(17, 24, 39, 0.04);
}
.shell .msg.user {
  border-radius: 16px;
  border-bottom-right-radius: 8px;
  padding: 12px 16px;
}
.shell .composer {
  background: linear-gradient(180deg, rgba(255,255,255,0.86), #fff 42%);
  border-top-color: rgba(229, 231, 235, 0.78);
  padding: 10px 24px calc(12px + env(safe-area-inset-bottom));
  gap: 8px;
}
.shell.dark-theme .composer {
  background: linear-gradient(180deg, rgba(26,26,26,0.86), #1A1A1A 42%);
}
.shell .composer-card {
  max-width: 780px;
  border-radius: 22px;
  padding: 9px 12px 8px;
  box-shadow: 0 10px 34px rgba(17, 24, 39, 0.08);
}
.shell .prompt-textarea {
  min-height: 34px;
  line-height: 1.55;
  padding: 2px 6px 5px;
}
.shell .composer-toolbar {
  padding-top: 6px;
  margin-top: 2px;
}
.shell .deep-think-btn {
  border-radius: 999px;
  padding: 6px 11px;
}
.shell .composer-suggestions {
  max-width: 780px;
}
.shell .suggestions-track {
  gap: 10px;
}
.shell .suggestion-pill {
  border-radius: 999px;
  padding: 7px 13px;
  background: rgba(247, 248, 250, 0.92);
}
.shell .inline-suggestions {
  max-width: 780px;
  margin: 0 auto 14px;
  padding-left: 50px;
}
.shell .inline-suggestions-title {
  color: var(--text-tertiary);
  font-size: 12px;
  margin-bottom: 8px;
}
.shell .inline-suggestions-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.shell .inline-suggestion-card {
  padding: 8px 12px;
  border: 1px solid var(--border-light);
  border-radius: 999px;
  background: var(--bg-secondary);
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.15s ease, background 0.15s ease;
}
.shell .inline-suggestion-card:active {
  transform: scale(0.98);
  border-color: var(--accent);
  background: var(--accent-light);
}
.shell .inline-suggestion-label {
  display: block;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.25;
  text-align: center;
}
.shell .inline-suggestion-hint {
  display: none;
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

@media (min-width: 1025px) {
  .shell .sidebar {
    width: 240px;
    flex-basis: 240px;
  }
  .shell .brand-title,
  .shell .chat-title { font-size: 14px; }
  .shell .sidebar-h1 { font-size: 17px; }
  .shell .conversation-title,
  .shell .new-chat-btn,
  .shell .header-actions .btn.ghost { font-size: 12px; }
  .shell .chat-header-subtitle { font-size: 11px; line-height: 1.3; }
  .shell .new-chat-btn { padding: 8px 14px; }
  .shell .conversation-item { padding-top: 8px; padding-bottom: 8px; }
  .shell .conversation-meta { margin-top: 2px; }
  .shell .header-actions .btn.ghost { padding: 7px 12px; }
  .shell .messages {
    min-height: 0;
    padding-top: 24px;
    padding-bottom: var(--composer-overlay-height, 96px);
  }
  .shell .messages > .message-row:last-child { margin-bottom: 0; }
  .shell .message-row,
  .shell .composer-suggestions,
  .shell .image-pending,
  .shell .inline-suggestions {
    max-width: 740px;
  }
  .shell .composer-card { max-width: 700px; }
  .shell .message-row { margin-bottom: 18px; }
  .shell .message-meta { margin-bottom: 5px; }
  .shell .msg { line-height: 1.65; }
  .shell .msg.user { padding: 10px 14px; }
  .shell .msg.assistant {
    padding: 2px 0;
    background: transparent;
    border-color: transparent;
    border-radius: 0;
    box-shadow: none;
  }
  .shell .msg { font-size: 13px; }
  .shell .msg :deep(.md-body),
  .shell .msg :deep(.md-text) {
    font-size: 13px;
    line-height: 1.65;
  }
  .shell .message-meta { font-size: 10px; }
  .shell .composer-card { padding: 6px 10px 5px; }
  .shell .prompt-textarea {
    min-height: 30px;
    font-size: 14px;
    line-height: 1.5;
    padding: 1px 5px 3px;
  }
  .shell .composer-toolbar { padding-top: 3px; margin-top: 0; }
  .shell .composer-left,
  .shell .composer-right { gap: 6px; }
  .shell .deep-think-btn { gap: 4px; padding: 3px 9px; font-size: 11px; }
  .shell .deep-think-icon-char { width: 16px; height: 16px; font-size: 10px; }
  .shell .attach-icon,
  .shell .send-icon { font-size: 16px; }
  .shell .btn-stop { padding: 3px 10px; }
  .shell .stop-text { font-size: 11px; }
  .shell .composer {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 4;
    padding: 0 32px calc(16px + env(safe-area-inset-bottom));
    background: transparent;
    border-top-color: transparent;
    pointer-events: none;
  }
  .shell .composer-card,
  .shell .image-pending {
    pointer-events: auto;
  }
  .shell.dark-theme .composer {
    background: transparent;
    border-top-color: transparent;
  }
  .shell .composer-card {
    border-radius: 20px;
    box-shadow: 0 12px 36px rgba(17, 24, 39, 0.12);
  }
  .shell.dark-theme .composer-card {
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.3);
  }
}

@media (max-width: 720px) {
  .shell .chat-header {
    min-height: 72px;
    display: flex;
    padding: calc(var(--status-bar-height, 20px) + 16px) 14px 10px;
    gap: 10px;
  }
  .shell .history-toggle {
    width: 36px;
    height: 36px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.84);
    box-shadow: 0 4px 14px rgba(17, 24, 39, 0.08);
  }
  .shell.dark-theme .history-toggle {
    background: rgba(38, 38, 38, 0.88);
  }
  .shell .chat-title {
    font-size: 15px;
  }
  .shell .chat-header-subtitle {
    display: none;
  }
  .shell .header-actions .btn.ghost {
    width: 36px;
    height: 36px;
    padding: 0;
    border-radius: 12px;
    font-size: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .shell .compact-back-icon {
    display: inline-flex;
    font-size: 18px;
  }
  .shell .messages {
    padding: 14px 14px 12px;
  }
  .shell .message-row {
    margin-bottom: 16px;
    flex-wrap: nowrap;
  }
  .shell .avatar {
    width: 32px;
    height: 32px;
    border-radius: 11px;
    font-size: 11px;
  }
  .shell .assistant-avatar {
    margin-right: 8px;
  }
  .shell .message-content {
    width: calc(100% - 42px);
  }
  .shell .msg {
    width: 100%;
    max-width: 100% !important;
    padding: 12px 13px;
    border-radius: 16px;
    font-size: 14px;
  }
  .shell .message-row.from-user .message-content {
    width: auto;
    max-width: 82%;
  }
  .shell .message-row.from-user .msg {
    width: auto;
    max-width: 100% !important;
  }
  .shell .composer {
    padding: 8px 12px calc(10px + env(safe-area-inset-bottom));
    gap: 8px;
  }
  .shell .composer-card {
    border-radius: 18px;
    padding: 9px 11px 8px;
    box-shadow: 0 8px 26px rgba(17, 24, 39, 0.1);
  }
  .shell .prompt-textarea {
    min-height: 36px;
    font-size: 14px;
    padding: 2px 5px 6px;
  }
  .shell .composer-toolbar {
    padding-top: 6px;
  }
  .shell .deep-think-btn {
    max-width: none;
    padding: 6px 10px;
    font-size: 11px;
  }
  .shell .composer-suggestions {
    max-width: 100%;
    order: -1;
  }
  .shell .inline-suggestions {
    padding-left: 40px;
    margin-bottom: 10px;
  }
  .shell .inline-suggestions-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .shell .inline-suggestion-card {
    padding: 9px 10px;
  }
}

@media (max-width: 480px) {
  .shell .chat-header {
    padding: calc(var(--status-bar-height, 20px) + 14px) 12px 9px;
  }
  .shell .chat-title-dot {
    display: none;
  }
  .shell .composer-card {
    border-radius: 17px;
  }
  .shell .suggestion-pill {
    padding: 6px 11px;
    font-size: 11px;
  }
  .shell .inline-suggestions {
    padding-left: 0;
  }
  .shell .inline-suggestion-hint {
    display: none;
  }
}

/* #ifdef MP-WEIXIN */
.shell .chat-header {
  padding-top: calc(var(--status-bar-height, 20px) + 34px);
}
@media (max-width: 720px) {
  .shell .chat-header {
    min-height: 88px;
    padding-top: calc(var(--status-bar-height, 20px) + 42px);
  }
}
@media (max-width: 480px) {
  .shell .chat-header {
    padding-top: calc(var(--status-bar-height, 20px) + 40px);
  }
}
/* #endif */

/* ─── 深色主题覆盖 ─── */
.shell.dark-theme .btn-stop { background: #333333; border-color: #52525B; }
.shell.dark-theme .suggestion-pill { background: #262626; border-color: #3F3F46; }
.shell.dark-theme .conversation-item:hover { background: #333333; }
.shell.dark-theme .brand-icon { opacity: 0.9; }
.shell.dark-theme .deep-think-icon-char {
  background: rgba(255, 255, 255, 0.08);
  color: var(--btn-think-inactive-text);
}
.shell.dark-theme .deep-think-btn.active .deep-think-icon-char {
  background: rgba(77, 107, 254, 0.22);
  color: var(--btn-think-active-text);
}

/* ─── 打印 ─── */
@media print {
  .shell .sidebar, .shell .composer, .shell .history-backdrop { display: none !important; }
  .shell { flex-direction: column; }
  .shell .messages { overflow: visible; height: auto; }
}
</style>
