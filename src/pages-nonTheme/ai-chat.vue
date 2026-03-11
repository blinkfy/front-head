<template>
  <view :class="['shell', isDark ? 'dark-theme' : '']">
    <view class="ambient ambient-one"></view>
    <view class="ambient ambient-two"></view>

    <!-- ===== 侧边栏：对话历史 ===== -->
    <view :class="['sidebar', historyDrawerOpen ? 'drawer-open' : '']">
      <view class="sidebar-top">
        <view class="brand-card">
          <view class="brand-kicker">DEEP MODE</view>
          <view class="sidebar-h1">AI 环保助手</view>
          <view class="sidebar-p">围绕识别结果继续追问分类依据、投放顺序和可执行的再利用方案。</view>
        </view>
        <view class="sidebar-stats">
          <view class="stat-card">
            <text class="stat-value">{{ conversationCount }}</text>
            <text class="stat-label">会话数</text>
          </view>
          <view class="stat-card">
            <text class="stat-value">{{ activeMessageCount }}</text>
            <text class="stat-label">当前消息</text>
          </view>
        </view>
        <view class="new-chat-btn" @tap="onNewChat">
          <text class="new-chat-icon">+</text>
          <text>新建对话</text>
        </view>
      </view>
      <scroll-view class="conversation-list" scroll-y>
        <view v-if="!conversationList.length" class="history-empty">
          暂无历史会话。完成一次识别后，AI 对话会自动出现在这里。
        </view>
        <view
          v-for="item in conversationList"
          :key="item.id"
          :class="['conversation-item', item.id === activeSessionId ? 'active' : '']"
          @tap="onSelectConversation(item.id)"
        >
          <view class="conversation-item-top">
            <view class="conversation-title">{{ item.title || '环保分类咨询' }}</view>
            <view class="conversation-dot"></view>
          </view>
          <view class="conversation-summary">{{ item.summary || item.title || '环保分类咨询' }}</view>
          <view class="conversation-meta">
            <text>{{ formatTimeLabel(item.updatedAt) }}</text>
            <text>{{ item.messages.length }} 条消息</text>
          </view>
        </view>
      </scroll-view>
      <view class="sidebar-footnote">会话自动保存，移动端可通过左上角按钮展开历史。</view>
    </view>

    <!-- 移动端抽屉遮罩 -->
    <view
      :class="['history-backdrop', historyDrawerOpen ? 'backdrop-open' : '']"
      @tap="closeHistoryDrawer"
    ></view>

    <!-- ===== 主聊天区 ===== -->
    <view class="chat-panel">

      <!-- 头部 -->
      <view class="chat-header">
        <view class="header-left">
          <view class="history-toggle" @tap="toggleHistoryDrawer">
            <view class="history-toggle-bar"></view>
          </view>
          <view class="chat-header-main">
            <view class="chat-header-row">
              <view class="chat-title">{{ chatTitle }}</view>
              <view :class="['status-pill', isStreaming ? 'is-streaming' : '']">
                <view class="status-dot"></view>
                <text>{{ isStreaming ? '生成中' : '上下文已保存' }}</text>
              </view>
            </view>
            <view class="chat-subtitle">{{ chatSubtitle }}</view>
          </view>
        </view>
        <view class="header-actions">
          <view class="header-chip">{{ userMessageCount }} 次追问</view>
          <view class="btn ghost" @tap="goBack">返回识别页</view>
        </view>
      </view>

      <!-- 消息列表 -->
      <scroll-view
        class="messages"
        scroll-y
        :scroll-top="messagesScrollTop"
      >
        <view v-if="showIntroPanel" class="intro-panel">
          <view class="intro-kicker">深度解析模式</view>
          <view class="intro-title">继续追问这次识别结果</view>
          <view class="intro-copy">{{ introDescription }}</view>
          <view class="intro-tags">
            <view
              v-for="item in quickActions"
              :key="item.label"
              class="intro-tag"
              @tap="applyQuickPrompt(item.prompt)"
            >
              <text class="intro-tag-title">{{ item.label }}</text>
              <text class="intro-tag-copy">{{ item.hint }}</text>
            </view>
          </view>
        </view>
        <view v-if="!messageList.length && !isStreaming" class="empty-chat">
          当前对话还没有消息。你可以直接提问，或先发送一张图片继续分析。
        </view>
        <view
          v-for="(msg, idx) in messageList"
          :key="`${msg.createdAt || idx}_${idx}`"
          :class="['message-row', msg.role === 'user' ? 'from-user' : 'from-assistant']"
        >
          <view v-if="msg.role !== 'user'" class="avatar assistant-avatar">AI</view>
          <view class="message-content">
            <view class="message-meta">
              <text class="message-author">{{ msg.role === 'user' ? '你' : '环保 AI' }}</text>
              <text class="message-time">{{ formatMessageTime(msg.createdAt) }}</text>
            </view>
            <view :class="['msg', msg.role === 'user' ? 'user' : 'assistant']">
              <image
                v-if="msg.imageBase64"
                class="msg-image"
                :src="msg.imageBase64"
                mode="aspectFit"
              />
              <text class="msg-body">{{ msg.content }}</text>
            </view>
          </view>
          <view v-if="msg.role === 'user'" class="avatar user-avatar">你</view>
        </view>
        <view v-if="isStreaming" class="message-row from-assistant">
          <view class="avatar assistant-avatar">AI</view>
          <view class="message-content">
            <view class="message-meta">
              <text class="message-author">环保 AI</text>
              <text class="message-time">正在生成</text>
            </view>
            <view class="msg assistant streaming">
              <text class="msg-body">{{ streamingPreview }}</text>
              <view class="typing-dots">
                <view class="typing-dot"></view>
                <view class="typing-dot"></view>
                <view class="typing-dot"></view>
              </view>
            </view>
          </view>
        </view>
      </scroll-view>

      <!-- 输入区 -->
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
            :placeholder="composerPlaceholder"
            @keydown.enter.exact.prevent="onSend"
          ></textarea>
          <!-- #endif -->
          <!-- #ifndef H5 -->
          <textarea
            v-model="promptText"
            class="prompt-textarea"
            :placeholder="composerPlaceholder"
          ></textarea>
          <!-- #endif -->

          <view class="composer-toolbar">
            <view class="composer-hint">支持文字追问，也可以补一张图片让我继续判断。</view>

            <view class="actions">
              <view class="btn subtle" @tap="onPickImage">添加图片</view>
              <view
                :class="['btn', 'blue', !isStreaming ? 'btn-disabled' : '']"
                @tap="onStop"
              >停止</view>
              <view
                :class="['btn', 'primary', isStreaming ? 'btn-disabled' : '']"
                @tap="onSend"
              >发送</view>
            </view>
          </view>
        </view>

        <scroll-view class="composer-suggestions" scroll-x>
          <view class="suggestions-track">
            <view
              v-for="item in quickActions"
              :key="`composer_${item.label}`"
              class="suggestion-pill"
              @tap="applyQuickPrompt(item.prompt)"
            >
              {{ item.label }}
            </view>
          </view>
        </scroll-view>
      </view>
    </view>

  </view>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { baseUrl } from '@/api/settings'

// ─── Storage 工具 ────────────────────────────────────────
function getStorage(key) {
  // #ifdef H5
  return localStorage.getItem(key)
  // #endif
  // #ifndef H5
  const result = uni.getStorageSync(key)
  return result || null
  // #endif
}
function setStorage(key, value) {
  // #ifdef H5
  localStorage.setItem(key, value)
  // #endif
  // #ifndef H5
  uni.setStorageSync(key, value)
  // #endif
}

// ─── 常量 ────────────────────────────────────────────────
const SEED_KEY = 'ai_chat_seed_payload'
const SESSION_KEY = 'ai_chat_session_id'
const SEED_CONSUMED_KEY = 'ai_chat_seed_consumed_at'

// ─── 主题 ────────────────────────────────────────────────
const isDark = ref(getStorage('app_theme') === 'dark')

// ─── 响应式状态 ──────────────────────────────────────────
const chatTitle    = ref('当前对话')
const chatSubtitle = ref('继续提问，AI 会结合识别结果给出更细建议。')
const promptText   = ref('')
const messageList  = ref([])          // { role, content, imageBase64, createdAt }[]
const conversationList = ref([])      // 侧边栏渲染用的排序列表
const activeSessionId = ref('')
const isStreaming   = ref(false)
const streamingText = ref('')
const messagesScrollTop = ref(0)
const historyDrawerOpen = ref(false)
const pickedImageDataUrl = ref('')
const pickedImageName    = ref('')

const quickActions = [
  {
    label: '分类依据',
    hint: '逐项解释为什么这样分类',
    prompt: '请逐项解释这次识别结果的分类依据，并指出最容易分错的地方。'
  },
  {
    label: '投放步骤',
    hint: '告诉我正确投放顺序和注意事项',
    prompt: '请给我一个清晰的投放步骤，说明要不要清洗、拆分和沥干。'
  },
  {
    label: '变废为宝',
    hint: '给出能马上执行的再利用方案',
    prompt: '请给我一个低门槛、现在就能做的变废为宝方案，材料和步骤尽量具体。'
  },
  {
    label: '易错对比',
    hint: '帮我区分相似垃圾',
    prompt: '请列出和它容易混淆的垃圾，并用简短规则帮我快速区分。'
  }
]

const conversationCount = computed(() => conversationList.value.length)
const activeMessageCount = computed(() => messageList.value.length + (isStreaming.value ? 1 : 0))
const userMessageCount = computed(() =>
  messageList.value.filter(item => item && item.role === 'user').length
)
const showIntroPanel = computed(() => userMessageCount.value === 0 && !isStreaming.value)
const composerPlaceholder = computed(() =>
  pickedImageDataUrl.value
    ? '描述你想让我重点观察的内容，例如瓶盖材质、是否需要拆分投放...'
    : '继续追问：比如投放细节、分类依据、可执行改造步骤...'
)
const introDescription = computed(() => {
  if (pickedImageName.value) return `已准备好附加图片「${pickedImageName.value}」，发送后我会结合图像继续分析。`
  return '我会沿着当前识别结果继续给出分类依据、投放建议和可执行的再利用方案。'
})
const streamingPreview = computed(() => streamingText.value || '正在整理更细的分析结论...')

// ─── 内部数据（不需要响应式） ─────────────────────────────
let conversationMap = new Map()       // sessionId -> conversation object
let abortCtrl = null

// ─── 工具函数 ─────────────────────────────────────────────
function safeJsonParse(str) {
  try { return JSON.parse(str) } catch (_) { return null }
}
function createSessionId() {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
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
function buildAuthHeaders(withJson) {
  const token = getStorage('token') || ''
  const headers = {}
  if (withJson) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = token
  return headers
}

// ─── 会话管理 ─────────────────────────────────────────────
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
  if (textPool.includes('厨余垃圾')) categories.push('厨余垃圾')
  if (textPool.includes('可回收'))   categories.push('可回收垃圾')
  if (textPool.includes('有害垃圾')) categories.push('有害垃圾')
  if (textPool.includes('其他垃圾')) categories.push('其他垃圾')

  let smartSummary = ''
  const items = Array.from(itemSet)
  if (items.length && categories.length) smartSummary = `${items.join('、')} · ${categories[0]}处理`
  else if (categories.length) smartSummary = `${categories[0]}分类与再利用`
  else if (/变废为宝|再利用|改造|堆肥/.test(textPool)) smartSummary = '变废为宝执行建议'
  else if (firstMsg) smartSummary = truncateText(firstMsg.content, 16)
  else smartSummary = '环保分类咨询'

  conversation.title     = smartSummary
  conversation.summary   = smartSummary
  conversation.updatedAt = (lastMsg && lastMsg.createdAt) || conversation.updatedAt || new Date().toISOString()
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
  updateHeader()
  syncConversationList()
  renderActiveMessages()
  clearPickedImage()
}
function pushMessageToActive(role, content, imageBase64, createdAt) {
  const conversation = ensureConversation(activeSessionId.value)
  conversation.messages.push({
    role: role === 'assistant' ? 'assistant' : 'user',
    content: String(content || ''),
    imageBase64: typeof imageBase64 === 'string' ? imageBase64 : '',
    createdAt: createdAt || new Date().toISOString()
  })
  refreshConversationMeta(conversation)
  syncConversationList()
  updateHeader()
  messageList.value = conversation.messages.slice()
  nextTick(() => { messagesScrollTop.value = 999999 })
}
function ensureWelcomeMessageIfEmpty() {
  const conversation = ensureConversation(activeSessionId.value)
  if (conversation.messages.length) return
  conversation.messages.push({
    role: 'assistant',
    content: '我已准备好继续分析。你可以直接问：分类依据、投放顺序、或更详细的变废为宝执行方案。',
    imageBase64: '',
    createdAt: new Date().toISOString()
  })
  refreshConversationMeta(conversation)
}

// ─── 图片选择 ─────────────────────────────────────────────
function clearPickedImage() {
  pickedImageDataUrl.value = ''
  pickedImageName.value = ''
}
function onPickImage() {
  uni.chooseImage({
    count: 1,
    sizeType: ['original', 'compressed'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      const path = res.tempFilePaths && res.tempFilePaths[0]
      if (!path) return
      // H5 端转 base64，非 H5 端直接用临时路径
      // #ifdef H5
      const reader = new FileReader()
      fetch(path)
        .then(r => r.blob())
        .then(blob => {
          reader.onload = () => {
            pickedImageDataUrl.value = reader.result
            pickedImageName.value = path.split('/').pop() || '已添加图片'
          }
          reader.onerror = () => {
            pickedImageDataUrl.value = path
            pickedImageName.value = path.split('/').pop() || '已添加图片'
          }
          reader.readAsDataURL(blob)
        })
        .catch(() => {
          pickedImageDataUrl.value = path
          pickedImageName.value = path.split('/').pop() || '已添加图片'
        })
      // #endif
      // #ifndef H5
      pickedImageDataUrl.value = path
      pickedImageName.value = path.split('/').pop() || '已添加图片'
      // #endif
    },
    fail: () => {}
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
  if (!token) return []
  try {
    // #ifdef H5
    const res = await fetch(`${baseUrl}/api/ai/chat/history?limit=100`, {
      method: 'GET', headers: buildAuthHeaders(false)
    })
    if (!res.ok) return []
    const payload = await res.json()
    const items = payload && payload.code === 0 && payload.data && Array.isArray(payload.data.items)
      ? payload.data.items : []
    return items.filter(item => item && (item.role === 'user' || item.role === 'assistant'))
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
          resolve(items.filter(item => item && (item.role === 'user' || item.role === 'assistant')))
        },
        fail: () => resolve([])
      })
    })
    // #endif
  } catch (_) { return [] }
}
function hydrateConversations(items) {
  conversationMap = new Map()
  const list = Array.isArray(items) ? items : []
  for (const item of list) {
    const sessionId = normalizeSessionId(item.sessionId) || 'legacy_default'
    const conversation = ensureConversation(sessionId)
    const content = String(item.content || '').trim()
    if (!content) continue
    conversation.messages.push({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content,
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
function buildSeedUserText(payload) {
  const raw = String(payload.userPrompt || '').trim()
  return raw || '请基于这张图继续分析具体物品分类和可执行的变废为宝方案。'
}
function buildSeedAssistantText(payload) {
  const raw = String(payload.assistantReply || '').trim()
  if (raw) return raw
  const category = String(payload.category || '').trim()
  if (!category) return '我已经拿到这次识别结果。你可以继续问我：具体物品分类依据、投放注意事项或变废为宝步骤。'
  return `我已读取这次识别结果，主要类别是「${category}」。\n如果你愿意，我可以继续细化到每个物品的分类依据，并给出可执行的变废为宝步骤。`
}
function maybeStartFromFreshSeed() {
  const seedPayload = parseSeedPayload()
  if (!seedPayload) return null
  const createdAt = String(seedPayload.createdAt || '').trim()
  const seedFingerprint = createdAt || [
    String(seedPayload.category || '').trim(),
    String(seedPayload.assistantReply || '').trim().slice(0, 120)
  ].join('__')
  const consumedAt = String(getStorage(SEED_CONSUMED_KEY) || '').trim()
  if (!seedFingerprint || seedFingerprint === consumedAt) return null

  const newSessionId = createSessionId()
  ensureConversation(newSessionId)
  activeSessionId.value = newSessionId
  setStorage(SESSION_KEY, newSessionId)

  const seedImage = typeof seedPayload.imageBase64 === 'string' && seedPayload.imageBase64.startsWith('data:image/')
    ? seedPayload.imageBase64 : ''
  const seedUserText = buildSeedUserText(seedPayload)
  const seedText = buildSeedAssistantText(seedPayload)
  const conversation = ensureConversation(newSessionId)
  if (seedUserText || seedImage) {
    conversation.messages.push({
      role: 'user', content: seedUserText || '请继续分析这张图片。',
      imageBase64: seedImage, createdAt: createdAt || new Date().toISOString()
    })
  }
  if (seedText) {
    conversation.messages.push({
      role: 'assistant', content: seedText, imageBase64: '',
      createdAt: createdAt || new Date().toISOString()
    })
  }
  refreshConversationMeta(conversation)
  setStorage(SEED_CONSUMED_KEY, seedFingerprint)
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
async function streamChat({ text, imageBase64, history }) {
  // #ifdef H5
  abortCtrl = new AbortController()
  // #endif
  isStreaming.value = true
  streamingText.value = ''

  // #ifdef H5
  const response = await fetch(`${baseUrl}/api/ai/chat/stream`, {
    method: 'POST',
    headers: buildAuthHeaders(true),
    body: JSON.stringify({ text, imageBase64, history, sessionId: activeSessionId.value }),
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
          nextTick(() => { messagesScrollTop.value = 999999 })
        } else if (eventName === 'done') {
          full = data.content || full
          streamingText.value = full
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
      isStreaming.value = false
      return { content: abortedText, aborted: true }
    }
    throw err
  } finally {
    reader.releaseLock()
  }

  if (errorMessage) {
    streamingText.value = ''
    isStreaming.value = false
    return { content: `请求失败：${errorMessage}`, aborted: false }
  }
  if (!full.trim()) full = 'AI 暂未返回内容。'
  streamingText.value = ''
  isStreaming.value = false
  return { content: full, aborted: false }
  // #endif

  // #ifndef H5
  // 非 H5 平台：使用普通 POST 请求（不支持 SSE 流）
  return await new Promise((resolve, reject) => {
    uni.request({
      url: `${baseUrl}/api/ai/chat/stream`,
      method: 'POST',
      header: buildAuthHeaders(true),
      data: { text, imageBase64, history, sessionId: activeSessionId.value },
      success: (res) => {
        const payload = res.data
        if (!payload || (payload.code !== 0 && payload.code !== undefined)) {
          isStreaming.value = false
          reject(new Error((payload && payload.msg) || `请求失败（HTTP ${res.statusCode}）`))
          return
        }
        const content = (payload.data && payload.data.content) || payload.content || 'AI 暂未返回内容。'
        streamingText.value = ''
        isStreaming.value = false
        resolve({ content, aborted: false })
      },
      fail: (err) => {
        isStreaming.value = false
        reject(new Error(err && err.errMsg ? err.errMsg : '网络请求失败'))
      }
    })
  })
  // #endif
}

function extractHistoryForRequest() {
  const conversation = ensureConversation(activeSessionId.value)
  return conversation.messages
    .slice(-10)
    .map(item => ({ role: item.role, content: item.content }))
    .filter(item => item.content && (item.role === 'user' || item.role === 'assistant'))
}

// ─── 发送消息 ─────────────────────────────────────────────
async function onSend() {
  if (isStreaming.value) return
  const rawText = promptText.value.trim()
  const sendingImage = pickedImageDataUrl.value
  if (!rawText && !sendingImage) {
    uni.showToast({ title: '请先输入问题或选择图片', icon: 'none' })
    return
  }
  const userText = rawText || '请基于这张图继续补充具体物品分类和可执行的变废为宝方案。'
  const historyForApi = extractHistoryForRequest()

  pushMessageToActive('user', userText, sendingImage, new Date().toISOString())
  promptText.value = ''
  clearPickedImage()

  try {
    const streamed = await streamChat({ text: userText, imageBase64: sendingImage, history: historyForApi })
    pushMessageToActive('assistant', streamed.content || 'AI 暂未返回内容。', '', new Date().toISOString())
  } catch (err) {
    const failedText = err && err.name === 'AbortError'
      ? '已停止当前回答。'
      : `请求异常：${err && err.message ? err.message : err}`
    pushMessageToActive('assistant', failedText, '', new Date().toISOString())
    isStreaming.value = false
    streamingText.value = ''
  }
}
function onStop() {
  // #ifdef H5
  if (abortCtrl) abortCtrl.abort()
  // #endif
  // #ifndef H5
  // 小程序端不支持 AbortController，使用标志位中止
  isStreaming.value = false
  streamingText.value = ''
  // #endif
}

// ─── 生命周期 ─────────────────────────────────────────────
let onStorageHandler = null
let drawerMediaQuery = null
let onDrawerMediaChange = null

onMounted(async () => {
  isDark.value = getStorage('app_theme') === 'dark'

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

  let historyItems = []
  try { historyItems = await loadHistoryItems() } catch (_) {}
  hydrateConversations(historyItems)

  const freshSeedSession = maybeStartFromFreshSeed()
  if (freshSeedSession) {
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
  nextTick(() => { messagesScrollTop.value = 999999 })
})

onBeforeUnmount(() => {
  if (abortCtrl) abortCtrl.abort()
  // #ifdef H5
  if (onStorageHandler) window.removeEventListener('storage', onStorageHandler)
  if (drawerMediaQuery && onDrawerMediaChange) {
    if (drawerMediaQuery.removeEventListener) drawerMediaQuery.removeEventListener('change', onDrawerMediaChange)
    else if (drawerMediaQuery.removeListener) drawerMediaQuery.removeListener(onDrawerMediaChange)
  }
  // #endif
})
</script>

<style>
/* ─── page 背景 ─── */
page {
  background:
    radial-gradient(900px 460px at 90% -12%, rgba(47, 111, 237, 0.16), transparent 62%),
    radial-gradient(720px 420px at -10% 16%, rgba(23, 133, 106, 0.2), transparent 58%),
    linear-gradient(165deg, #eef8f3, #e8f0ff);
  height: 100vh;
  overflow: hidden;
  padding: 16px;
  font-family: "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif;
  box-sizing: border-box;
}
/* ─── CSS 变量（定义在 .shell 上保证平台兼容） ─── */
.shell {
  --bg-1: #eef8f3;
  --bg-2: #e8f0ff;
  --card: rgba(255, 255, 255, 0.9);
  --line: #d5e3f0;
  --text: #12212f;
  --muted: #5e7388;
  --side-bg: rgba(16, 28, 40, 0.92);
  --side-line: rgba(196, 220, 240, 0.18);
  --side-text: #deebf7;
  --side-muted: #9fb6cc;
  --accent: #17856a;
  --accent-2: #2f6fed;
  --msg-ai-bg: #ffffff;
  --msg-ai-line: #d4e3ef;
  --msg-user-bg: linear-gradient(135deg, #2f6fed, #4f8af8);
  --composer-bg: rgba(255, 255, 255, 0.78);
  --danger: #d94e55;
  --font-main: "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif;
}
.shell.dark-theme {
  --bg-1: #0e1a27;
  --bg-2: #132538;
  --card: rgba(18, 31, 44, 0.92);
  --line: #30485f;
  --text: #dce8f4;
  --muted: #9ab2c7;
  --side-bg: rgba(9, 16, 25, 0.95);
  --side-line: rgba(151, 183, 210, 0.2);
  --side-text: #d7e7f8;
  --side-muted: #95aec3;
  --msg-ai-bg: #142436;
  --msg-ai-line: #35516a;
  --composer-bg: rgba(16, 28, 40, 0.82);
  --danger: #ef6c74;
}

/* #ifdef H5 */
*, *::before, *::after { box-sizing: border-box; }
/* H5 滚动条美化 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(100, 150, 200, 0.4);
  border-radius: 4px;
  transition: background 0.3s ease;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(80, 130, 180, 0.7);
}
/* #endif */
/* #ifndef H5 */
page, view, text, scroll-view, swiper, button, form, input, textarea, label, navigator, image { box-sizing: border-box; }
/* #endif */

/* ─── shell 根布局 ─── */
.shell {
  width: min(1240px, 100%);
  margin: 0 auto;
  height: calc(100vh - 32px);
  display: grid;
  grid-template-columns: 280px 1fr;
  border-radius: 18px;
  border: 1px solid var(--line);
  overflow: hidden;
  position: relative;
  background: var(--card);
  box-shadow: 0 24px 54px rgba(16, 31, 44, 0.16);
  backdrop-filter: blur(6px);
  color: var(--text);
  font-family: var(--font-main);
}

/* ─── 侧边栏 ─── */
.shell .sidebar {
  background: linear-gradient(160deg, var(--side-bg), rgba(10, 18, 28, 0.94));
  border-right: 1px solid var(--side-line);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.shell .sidebar-h1 {
  margin: 0;
  font-size: 19px;
  line-height: 1.2;
  color: var(--side-text);
  letter-spacing: 0.3px;
  font-weight: 600;
}
.shell .sidebar-p {
  margin: 6px 0 0;
  color: var(--side-muted);
  font-size: 12px;
  line-height: 1.45;
}
.shell .new-chat-btn {
  border: 1px solid rgba(167, 202, 232, 0.35);
  background: rgba(30, 66, 100, 0.48);
  color: var(--side-text);
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 13px;
  cursor: pointer;
  transition: background .18s ease;
}
.shell .new-chat-btn:hover { background: rgba(42, 88, 132, 0.58); }
.shell .conversation-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 180px;
  padding-right: 2px;
  overflow: auto;
}
.shell .conversation-item {
  border: 1px solid transparent;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  padding: 10px;
  cursor: pointer;
  transition: border-color .18s ease, background .18s ease;
  color: var(--side-text);
  width: 100%;
}
.shell .conversation-item:hover {
  border-color: rgba(168, 201, 228, 0.36);
  background: rgba(255, 255, 255, 0.1);
}
.shell .conversation-item.active {
  border-color: rgba(104, 170, 242, 0.84);
  background: linear-gradient(145deg, rgba(46, 95, 142, 0.5), rgba(55, 115, 176, 0.34));
  box-shadow: 0 10px 20px rgba(11, 28, 44, 0.22);
}
.shell .conversation-title {
  margin: 0;
  font-size: 13px;
  line-height: 1.35;
  color: var(--side-text);
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  word-break: break-word;
}
.shell .conversation-summary {
  margin: 5px 0 0;
  font-size: 11px;
  color: var(--side-muted);
  line-height: 1.4;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
  line-clamp: 1;
}
.shell .conversation-meta {
  margin-top: 7px;
  font-size: 11px;
  color: rgba(190, 213, 232, 0.78);
}
.shell .history-empty {
  border: 1px dashed rgba(165, 198, 226, 0.35);
  border-radius: 12px;
  padding: 12px;
  font-size: 12px;
  color: var(--side-muted);
  line-height: 1.5;
}
.shell .sidebar-footnote {
  margin: 0;
  font-size: 11px;
  color: rgba(177, 204, 224, 0.82);
  line-height: 1.4;
}

/* ─── 移动端抽屉遮罩 ─── */
.shell .history-backdrop {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 41;
  opacity: 0;
  pointer-events: none;
  background: rgba(3, 8, 16, 0.46);
  transition: opacity .22s ease;
  border: 0;
}
.shell .history-backdrop.backdrop-open {
  opacity: 1;
  pointer-events: auto;
}

/* ─── 汉堡按钮 ─── */
.shell .history-toggle {
  display: none;
  border: 1px solid var(--line);
  background: rgba(10, 24, 36, 0.07);
  color: var(--text);
  width: 38px;
  height: 38px;
  padding: 0;
  border-radius: 10px;
  cursor: pointer;
  flex: 0 0 38px;
  align-items: center;
  justify-content: center;
}
.shell.dark-theme .history-toggle { background: rgba(255, 255, 255, 0.06); }
.shell .history-toggle-bar,
.shell .history-toggle-bar::before,
.shell .history-toggle-bar::after {
  display: block;
  width: 16px;
  height: 2px;
  border-radius: 999px;
  background: currentColor;
  content: "";
}
.shell .history-toggle-bar { position: relative; }
.shell .history-toggle-bar::before { position: absolute; left: 0; top: -5px; }
.shell .history-toggle-bar::after  { position: absolute; left: 0; top: 5px; }

/* ─── 聊天面板 ─── */
.shell .chat-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}
.shell .chat-header-main { min-width: 0; flex: 1; }
.shell .chat-header {
  border-bottom: 1px solid var(--line);
  padding: 13px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.84), rgba(255, 255, 255, 0.62));
}
.shell.dark-theme .chat-header {
  background: linear-gradient(180deg, rgba(16, 27, 39, 0.94), rgba(16, 27, 39, 0.72));
}
.shell .chat-title {
  margin: 0;
  font-size: 18px;
  letter-spacing: 0.2px;
  font-weight: 600;
}
.shell .chat-subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.45;
}

/* ─── 按钮 ─── */
.shell .btn {
  border: 0;
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 13px;
  cursor: pointer;
  background: #e9f1f8;
  color: #22425f;
  white-space: nowrap;
  transition: transform .16s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.shell.dark-theme .btn { background: #23374d; color: #d2e2f2; }
.shell .btn:hover { transform: translateY(-1px); }
.shell .btn.primary { background: linear-gradient(135deg, var(--accent), #23b883); color: #fff; box-shadow: 0 10px 22px rgba(23, 133, 106, 0.28); }
.shell .btn.blue    { background: linear-gradient(135deg, #2f6fed, #4f88f7); color: #fff; box-shadow: 0 10px 22px rgba(47, 111, 237, 0.26); }
.shell .btn.btn-disabled { opacity: 0.4; pointer-events: none; }

/* ─── 消息区 ─── */
.shell .messages {
  flex: 1;
  overflow: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: linear-gradient(180deg, rgba(244, 251, 255, 0.72), rgba(246, 255, 250, 0.6));
}
.shell.dark-theme .messages {
  background: linear-gradient(180deg, rgba(12, 23, 35, 0.72), rgba(10, 25, 22, 0.66));
}
.shell .msg {
  max-width: min(760px, 88%);
  border-radius: 14px;
  padding: 10px 12px;
  line-height: 1.56;
  word-break: break-word;
  white-space: pre-wrap;
  position: relative;
  font-size: 14px;
}
.shell .msg.user {
  align-self: flex-end;
  background: var(--msg-user-bg);
  color: #fff;
  border-bottom-right-radius: 4px;
}
.shell .msg.assistant {
  align-self: flex-start;
  background: var(--msg-ai-bg);
  border: 1px solid var(--msg-ai-line);
  color: var(--text);
  border-bottom-left-radius: 4px;
}
.shell .label {
  display: block;
  font-size: 11px;
  opacity: 0.72;
  margin-bottom: 4px;
  user-select: none;
}
.shell .msg-body { display: block; }
.shell .msg-image {
  width: min(280px, 58vw);
  max-height: 230px;
  border-radius: 10px;
  object-fit: contain;
  background: rgba(255, 255, 255, 0.25);
  display: block;
  margin-bottom: 8px;
}
.shell .empty-chat {
  align-self: center;
  width: min(640px, 100%);
  border: 1px dashed var(--line);
  border-radius: 14px;
  padding: 16px;
  color: var(--muted);
  line-height: 1.6;
  background: rgba(255, 255, 255, 0.54);
  text-align: center;
  font-size: 14px;
}
.shell.dark-theme .empty-chat { background: rgba(20, 34, 50, 0.74); }

/* ─── 输入区 ─── */
.shell .composer {
  border-top: 1px solid var(--line);
  background: var(--composer-bg);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.shell .image-pending {
  border: 1px dashed rgba(64, 127, 195, 0.42);
  border-radius: 999px;
  padding: 7px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  max-width: 100%;
  background: rgba(250, 253, 255, 0.8);
  font-size: 12px;
  color: var(--muted);
}
.shell.dark-theme .image-pending { background: rgba(19, 34, 50, 0.74); }
.shell .image-pending-name {
  font-size: 12px;
  color: var(--text);
  font-weight: 600;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.shell .image-pending-clear {
  border: 0;
  background: transparent;
  color: var(--danger);
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
  padding: 4px 6px;
  border-radius: 8px;
}
.shell .image-pending-clear:hover { background: rgba(217, 78, 85, 0.1); }
.shell .prompt-textarea {
  width: 100%;
  resize: vertical;
  min-height: 54px;
  max-height: 80px;
  border: 1px solid #ccdeec;
  border-radius: 12px;
  padding: 11px 12px;
  font-size: 14px;
  font-family: inherit;
  color: var(--text);
  background: #fbfdff;
  outline: none;
}
.shell.dark-theme .prompt-textarea { background: #142335; border-color: #3f5f7b; color: var(--text); }
.shell .prompt-textarea:focus { border-color: #88b6ff; box-shadow: 0 0 0 3px rgba(79, 136, 241, 0.16); }
.shell .actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

/* ─── 响应式：移动端 ─── */
@media (max-width: 980px) {
  page { padding: 8px; }
  /* #ifdef H5 */
  body.history-drawer-open { overflow: hidden; }
  /* #endif */
  .shell {
    height: calc(100vh - 16px);
    grid-template-columns: 1fr;
    overflow: hidden;
  }
  .shell .sidebar {
    position: fixed;
    top: 0; left: 0; bottom: 0;
    width: min(82vw, 320px);
    max-width: 320px;
    z-index: 42;
    border-right: 1px solid var(--side-line);
    border-bottom: 0;
    padding: 12px; gap: 8px;
    transform: translateX(-100%);
    transition: transform .24s ease;
    box-shadow: 0 24px 54px rgba(2, 8, 14, 0.44);
  }
  .shell .sidebar.drawer-open { transform: translateX(0); }
  .shell .history-backdrop { display: block; }
  .shell .history-toggle { display: inline-flex; }
  .shell .conversation-list { min-height: 0; padding-right: 3px; }
  .shell .chat-header { align-items: flex-start; gap: 10px; }
  .shell .msg { max-width: 95%; }
}
@media (max-width: 680px) {
  page { padding: 0; }
  .shell {
    border-radius: 0;
    border-left: 0; border-right: 0;
    height: 100vh;
    border-bottom: 0;
  }
  .shell .sidebar-h1 { font-size: 16px; }
  .shell .sidebar-p, .shell .sidebar-footnote { font-size: 11px; }
  .shell .chat-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    padding: 10px 12px;
  }
  .shell .chat-title   { font-size: 16px; }
  .shell .chat-subtitle { font-size: 11px; }
  .shell .messages { padding: 10px; }
  .shell .actions .btn { flex: 1; min-height: 40px; }
  .shell .image-pending { width: 100%; }
  .shell .image-pending-name { max-width: 150px; }
  .shell .composer { padding: 10px; padding-bottom: calc(10px + env(safe-area-inset-bottom)); }
  .shell .prompt-textarea { min-height: 52px; }
  .shell .msg { max-width: 100%; font-size: 13px; }
}
</style>
<style>
page {
  background:
    radial-gradient(820px 420px at 18% -6%, rgba(42, 118, 255, 0.18), transparent 68%),
    radial-gradient(760px 420px at 100% 8%, rgba(62, 158, 255, 0.12), transparent 62%),
    linear-gradient(180deg, #f3f6fb 0%, #edf2f9 100%);
  padding: 18px;
}

.shell {
  --shell-bg: rgba(248, 250, 253, 0.92);
  --shell-line: rgba(151, 170, 198, 0.28);
  --panel: rgba(255, 255, 255, 0.9);
  --panel-strong: #ffffff;
  --panel-line: rgba(160, 179, 205, 0.28);
  --panel-soft: rgba(245, 248, 252, 0.78);
  --text: #112033;
  --muted: #667892;
  --muted-strong: #465975;
  --brand-start: #275efe;
  --brand-end: #4b8dff;
  --accent: #22a06b;
  --danger: #dc5b67;
  --sidebar-bg: linear-gradient(180deg, #0f1726 0%, #141f31 48%, #182538 100%);
  --sidebar-line: rgba(182, 204, 232, 0.14);
  --sidebar-text: #eef5ff;
  --sidebar-muted: rgba(203, 220, 242, 0.68);
  --assistant-bubble: rgba(255, 255, 255, 0.96);
  --user-bubble: linear-gradient(135deg, #2e67ff 0%, #63a1ff 100%);
  --composer-bg: rgba(248, 250, 253, 0.84);
  --shadow-lg: 0 22px 60px rgba(15, 31, 52, 0.12);
  --shadow-md: 0 14px 32px rgba(15, 31, 52, 0.08);
  width: 100%;
  max-width: 1380px;
  height: calc(100vh - 36px);
  display: flex;
  border-radius: 28px;
  background: var(--shell-bg);
  border: 1px solid var(--shell-line);
  box-shadow: var(--shadow-lg);
  position: relative;
  overflow: hidden;
}

.shell.dark-theme {
  --shell-bg: rgba(10, 17, 28, 0.94);
  --shell-line: rgba(104, 128, 162, 0.24);
  --panel: rgba(14, 23, 36, 0.92);
  --panel-strong: #121d2d;
  --panel-line: rgba(88, 111, 144, 0.34);
  --panel-soft: rgba(15, 26, 40, 0.82);
  --text: #edf4ff;
  --muted: #90a4c2;
  --muted-strong: #b7c8de;
  --sidebar-bg: linear-gradient(180deg, #08111e 0%, #0c1624 52%, #101b2a 100%);
  --sidebar-line: rgba(129, 157, 191, 0.14);
  --sidebar-text: #f4f8ff;
  --sidebar-muted: rgba(180, 198, 221, 0.68);
  --assistant-bubble: rgba(16, 28, 42, 0.96);
  --composer-bg: rgba(9, 16, 26, 0.9);
  --shadow-lg: 0 24px 60px rgba(0, 0, 0, 0.28);
  --shadow-md: 0 14px 28px rgba(0, 0, 0, 0.2);
}

.ambient {
  position: absolute;
  border-radius: 999px;
  pointer-events: none;
  opacity: 0.72;
  filter: blur(14px);
}
.ambient-one {
  top: -120px;
  right: 18%;
  width: 320px;
  height: 320px;
  background: rgba(63, 135, 255, 0.12);
}
.ambient-two {
  bottom: -120px;
  left: 28%;
  width: 280px;
  height: 280px;
  background: rgba(44, 189, 148, 0.1);
}

.shell .sidebar {
  width: 320px;
  flex: 0 0 320px;
  padding: 22px 18px 18px;
  background: var(--sidebar-bg);
  border-right: 1px solid var(--sidebar-line);
  display: flex;
  flex-direction: column;
  min-width: 0;
  position: relative;
  z-index: 2;
}
.shell .sidebar-top {
  flex: 0 0 auto;
}
.shell .brand-card {
  border: 1px solid rgba(197, 216, 240, 0.14);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03));
  border-radius: 22px;
  padding: 18px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
}
.shell .brand-kicker {
  font-size: 11px;
  line-height: 1;
  letter-spacing: 1.8px;
  color: rgba(196, 218, 249, 0.72);
}
.shell .sidebar-h1 {
  margin-top: 12px;
  font-size: 24px;
  line-height: 1.16;
  color: var(--sidebar-text);
  font-weight: 600;
}
.shell .sidebar-p {
  margin-top: 10px;
  font-size: 13px;
  line-height: 1.65;
  color: var(--sidebar-muted);
}
.shell .sidebar-stats {
  display: flex;
  margin-top: 14px;
}
.shell .stat-card {
  flex: 1;
  margin-right: 10px;
  border-radius: 18px;
  padding: 14px;
  border: 1px solid rgba(189, 210, 236, 0.12);
  background: rgba(255, 255, 255, 0.05);
}
.shell .stat-card:last-child {
  margin-right: 0;
}
.shell .stat-value {
  display: block;
  font-size: 24px;
  line-height: 1.1;
  color: var(--sidebar-text);
  font-weight: 600;
}
.shell .stat-label {
  display: block;
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--sidebar-muted);
}
.shell .new-chat-btn {
  margin-top: 16px;
  min-height: 48px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(125, 176, 255, 0.32);
  background: linear-gradient(135deg, rgba(45, 102, 255, 0.98), rgba(86, 142, 255, 0.98));
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 14px 28px rgba(33, 73, 161, 0.24);
}
.shell .new-chat-icon {
  margin-right: 8px;
  font-size: 18px;
  line-height: 1;
}
.shell .conversation-list {
  flex: 1;
  min-height: 0;
  margin-top: 18px;
  padding-right: 4px;
}
.shell .conversation-item {
  margin-bottom: 10px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.04);
  color: var(--sidebar-text);
}
.shell .conversation-item.active {
  border-color: rgba(116, 172, 255, 0.38);
  background: linear-gradient(180deg, rgba(43, 95, 197, 0.32), rgba(34, 74, 144, 0.22));
  box-shadow: 0 14px 24px rgba(7, 19, 38, 0.22);
}
.shell .conversation-item-top {
  display: flex;
  align-items: center;
}
.shell .conversation-title {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  line-height: 1.45;
  font-weight: 600;
  color: var(--sidebar-text);
}
.shell .conversation-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  margin-left: 10px;
  background: rgba(143, 186, 255, 0.8);
  box-shadow: 0 0 0 4px rgba(77, 136, 255, 0.12);
}
.shell .conversation-summary {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.55;
  color: var(--sidebar-muted);
}
.shell .conversation-meta {
  margin-top: 10px;
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  line-height: 1.4;
  color: rgba(210, 224, 243, 0.7);
}
.shell .history-empty {
  padding: 14px;
  border-radius: 18px;
  border: 1px dashed rgba(172, 201, 236, 0.24);
  color: var(--sidebar-muted);
  font-size: 12px;
  line-height: 1.6;
}
.shell .sidebar-footnote {
  margin-top: 10px;
  font-size: 11px;
  line-height: 1.6;
  color: rgba(203, 220, 242, 0.62);
}

.shell .history-backdrop {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 41;
  opacity: 0;
  pointer-events: none;
  background: rgba(6, 10, 18, 0.52);
}
.shell .history-backdrop.backdrop-open {
  opacity: 1;
  pointer-events: auto;
}
.shell .history-toggle {
  display: none;
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  border-radius: 14px;
  border: 1px solid var(--panel-line);
  background: rgba(255, 255, 255, 0.6);
  color: var(--text);
  align-items: center;
  justify-content: center;
}
.shell.dark-theme .history-toggle {
  background: rgba(255, 255, 255, 0.04);
}

.shell .chat-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 1;
}
.shell .chat-header {
  padding: 20px 24px 18px;
  border-bottom: 1px solid var(--shell-line);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.66), rgba(255, 255, 255, 0.3));
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.shell.dark-theme .chat-header {
  background: linear-gradient(180deg, rgba(14, 23, 36, 0.9), rgba(14, 23, 36, 0.58));
}
.shell .header-left {
  display: flex;
  align-items: flex-start;
  min-width: 0;
  flex: 1;
}
.shell .chat-header-main {
  min-width: 0;
  flex: 1;
}
.shell .chat-header-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}
.shell .chat-title {
  font-size: 22px;
  line-height: 1.2;
  font-weight: 600;
}
.shell .status-pill {
  margin-left: 10px;
  padding: 8px 12px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  background: rgba(34, 160, 107, 0.12);
  color: var(--muted-strong);
  font-size: 12px;
}
.shell .status-pill.is-streaming {
  background: rgba(39, 94, 254, 0.12);
  color: #2b63f1;
}
.shell.dark-theme .status-pill.is-streaming {
  color: #9ebcff;
}
.shell .status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  margin-right: 8px;
  background: var(--accent);
}
.shell .status-pill.is-streaming .status-dot {
  background: #2f6fed;
  animation: statusPulse 1.2s infinite ease-in-out;
}
.shell .chat-subtitle {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--muted);
}
.shell .header-actions {
  display: flex;
  align-items: center;
  margin-left: 16px;
}
.shell .header-chip {
  padding: 8px 12px;
  border-radius: 999px;
  margin-right: 10px;
  background: var(--panel-soft);
  border: 1px solid var(--panel-line);
  color: var(--muted-strong);
  font-size: 12px;
}

.shell .btn {
  min-height: 42px;
  padding: 0 16px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
.shell .btn.ghost {
  background: var(--panel-soft);
  border: 1px solid var(--panel-line);
  color: var(--text);
}
.shell .btn.subtle {
  background: rgba(122, 146, 179, 0.12);
  color: var(--muted-strong);
}
.shell .btn.primary {
  background: linear-gradient(135deg, var(--accent) 0%, #43c286 100%);
  color: #ffffff;
  box-shadow: 0 14px 26px rgba(34, 160, 107, 0.24);
}
.shell .btn.blue {
  background: linear-gradient(135deg, var(--brand-start) 0%, var(--brand-end) 100%);
  color: #ffffff;
  box-shadow: 0 14px 26px rgba(39, 94, 254, 0.22);
}
.shell .btn.btn-disabled {
  opacity: 0.38;
  pointer-events: none;
}

.shell .chat-stage {
  flex: 1;
  min-height: 0;
  padding: 18px 24px 10px;
}
.shell .messages {
  height: 100%;
  display: block;
  padding: 0 6px 0 0;
  background: transparent;
}
.shell .intro-panel {
  max-width: 880px;
  margin: 0 auto 22px;
  padding: 24px;
  border-radius: 28px;
  border: 1px solid var(--panel-line);
  background:
    radial-gradient(240px 140px at 100% 0%, rgba(77, 140, 255, 0.14), transparent 72%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(247, 250, 255, 0.92));
  box-shadow: var(--shadow-md);
}
.shell.dark-theme .intro-panel {
  background:
    radial-gradient(240px 140px at 100% 0%, rgba(77, 140, 255, 0.16), transparent 72%),
    linear-gradient(180deg, rgba(16, 28, 42, 0.94), rgba(14, 23, 36, 0.94));
}
.shell .intro-kicker {
  font-size: 11px;
  line-height: 1;
  letter-spacing: 1.8px;
  color: #5077d8;
}
.shell.dark-theme .intro-kicker {
  color: #9ebcff;
}
.shell .intro-title {
  margin-top: 14px;
  font-size: 28px;
  line-height: 1.18;
  font-weight: 600;
}
.shell .intro-copy {
  margin-top: 12px;
  font-size: 14px;
  line-height: 1.75;
  color: var(--muted);
}
.shell .intro-tags {
  display: flex;
  flex-wrap: wrap;
  margin-top: 18px;
}
.shell .intro-tag {
  width: calc(50% - 6px);
  margin-right: 12px;
  margin-bottom: 12px;
  padding: 16px;
  border-radius: 20px;
  border: 1px solid var(--panel-line);
  background: rgba(255, 255, 255, 0.58);
}
.shell .intro-tag:nth-child(2n) {
  margin-right: 0;
}
.shell.dark-theme .intro-tag {
  background: rgba(255, 255, 255, 0.03);
}
.shell .intro-tag-title {
  display: block;
  font-size: 15px;
  line-height: 1.4;
  font-weight: 600;
}
.shell .intro-tag-copy {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--muted);
}

.shell .message-row {
  width: 100%;
  max-width: 880px;
  margin: 0 auto 18px;
  display: flex;
  align-items: flex-end;
}
.shell .message-row.from-user {
  justify-content: flex-end;
}
.shell .avatar {
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
}
.shell .assistant-avatar {
  margin-right: 12px;
  color: #ffffff;
  background: linear-gradient(135deg, var(--brand-start) 0%, var(--brand-end) 100%);
  box-shadow: 0 14px 24px rgba(39, 94, 254, 0.18);
}
.shell .user-avatar {
  margin-left: 12px;
  color: var(--text);
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid var(--panel-line);
}
.shell.dark-theme .user-avatar {
  background: rgba(255, 255, 255, 0.04);
}
.shell .message-content {
  display: flex;
  flex-direction: column;
  max-width: calc(100% - 52px);
}
.shell .message-row.from-user .message-content {
  align-items: flex-end;
}
.shell .message-meta {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--muted);
}
.shell .message-row.from-user .message-meta {
  justify-content: flex-end;
}
.shell .message-author {
  font-weight: 600;
  color: var(--muted-strong);
}
.shell .message-time {
  margin-left: 8px;
}
.shell .msg {
  max-width: 760px;
  padding: 16px 18px;
  border-radius: 22px;
  line-height: 1.75;
  font-size: 15px;
  white-space: pre-wrap;
  word-break: break-word;
  border: 1px solid transparent;
  box-shadow: var(--shadow-md);
}
.shell .msg.assistant {
  background: var(--assistant-bubble);
  border-color: var(--panel-line);
  color: var(--text);
  border-bottom-left-radius: 8px;
}
.shell .msg.user {
  color: #ffffff;
  background: var(--user-bubble);
  border-bottom-right-radius: 8px;
}
.shell .msg.streaming {
  min-width: 280px;
}
.shell .msg-body {
  display: block;
}
.shell .msg-image {
  display: block;
  width: 320px;
  max-width: 100%;
  height: 240px;
  border-radius: 18px;
  margin-bottom: 12px;
  background: rgba(113, 136, 167, 0.12);
}
.shell .typing-dots {
  display: flex;
  align-items: center;
  margin-top: 14px;
}
.shell .typing-dot {
  width: 6px;
  height: 6px;
  margin-right: 6px;
  border-radius: 999px;
  background: rgba(95, 122, 160, 0.78);
  animation: dotPulse 1.2s infinite ease-in-out;
}
.shell .typing-dot:nth-child(2) {
  animation-delay: 0.15s;
}
.shell .typing-dot:nth-child(3) {
  margin-right: 0;
  animation-delay: 0.3s;
}

.shell .composer {
  border-top: 1px solid var(--shell-line);
  background: var(--composer-bg);
  padding: 14px 24px calc(18px + env(safe-area-inset-bottom));
}
.shell .image-pending {
  margin-bottom: 12px;
  padding: 12px 14px;
  border-radius: 18px;
  border: 1px solid var(--panel-line);
  background: var(--panel);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.shell .image-pending-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.shell .image-pending-label {
  font-size: 11px;
  line-height: 1;
  letter-spacing: 1.1px;
  color: var(--muted);
}
.shell .image-pending-name {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.4;
  color: var(--text);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.shell .image-pending-clear {
  color: var(--danger);
  font-size: 13px;
  line-height: 1.4;
  padding-left: 14px;
}
.shell .composer-card {
  border-radius: 24px;
  border: 1px solid var(--panel-line);
  background: var(--panel-strong);
  padding: 14px;
  box-shadow: var(--shadow-md);
}
.shell.dark-theme .composer-card {
  background: rgba(17, 28, 43, 0.94);
}
.shell .prompt-textarea {
  width: 100%;
  min-height: 96px;
  max-height: 180px;
  border: 0;
  padding: 2px 2px 10px;
  background: transparent;
  color: var(--text);
  font-size: 15px;
  line-height: 1.7;
  outline: none;
}
.shell .composer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.shell .composer-hint {
  margin-right: 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--muted);
}
.shell .actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-start;
  margin-right: -10px;
  margin-bottom: -10px;
  gap: 0;
}
.shell .actions .btn {
  margin-right: 10px;
  margin-bottom: 10px;
}
.shell .composer-suggestions {
  margin-top: 12px;
  white-space: nowrap;
}
.shell .suggestions-track {
  display: flex;
  align-items: center;
  padding-right: 8px;
}
.shell .suggestion-pill {
  flex: 0 0 auto;
  margin-right: 10px;
  padding: 10px 14px;
  border-radius: 999px;
  border: 1px solid var(--panel-line);
  background: var(--panel);
  color: var(--muted-strong);
  font-size: 12px;
  line-height: 1.2;
}
.shell .suggestion-pill:last-child {
  margin-right: 0;
}

@keyframes dotPulse {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
  40% { transform: translateY(-2px); opacity: 1; }
}
@keyframes statusPulse {
  0%, 100% { transform: scale(1); opacity: 0.65; }
  50% { transform: scale(1.18); opacity: 1; }
}

@media (max-width: 1180px) {
  .shell .sidebar {
    width: 296px;
    flex-basis: 296px;
  }
  .shell .chat-header,
  .shell .chat-stage,
  .shell .composer {
    padding-left: 18px;
    padding-right: 18px;
  }
  .shell .intro-tag {
    width: 100%;
    margin-right: 0;
  }
}

@media (max-width: 980px) {
  page {
    padding: 10px;
  }
  .shell {
    height: calc(100vh - 20px);
    border-radius: 24px;
  }
  .shell .sidebar {
    position: fixed;
    top: 10px;
    left: 10px;
    bottom: 10px;
    width: 320px;
    max-width: 84vw;
    transform: translateX(-112%);
    transition: transform 0.24s ease;
    border-right: 1px solid var(--sidebar-line);
    border-radius: 24px;
    box-shadow: 0 24px 60px rgba(5, 10, 18, 0.34);
  }
  .shell .sidebar.drawer-open {
    transform: translateX(0);
  }
  .shell .history-backdrop {
    display: block;
  }
  .shell .history-toggle {
    display: inline-flex;
    margin-right: 12px;
  }
  .shell .header-actions {
    margin-left: 12px;
  }
}

@media (max-width: 720px) {
  page {
    padding: 0;
  }
  .shell {
    height: 100vh;
    border-radius: 0;
    border: 0;
  }
  .ambient {
    display: none;
  }
  .shell .chat-header {
    padding: 14px 14px 12px;
    flex-direction: column;
    align-items: stretch;
  }
  .shell .header-left {
    width: 100%;
  }
  .shell .chat-title {
    font-size: 19px;
  }
  .shell .header-actions {
    width: 100%;
    margin-left: 0;
    margin-top: 12px;
    justify-content: space-between;
  }
  .shell .chat-stage {
    padding: 12px 12px 8px;
  }
  .shell .intro-panel {
    padding: 18px;
    border-radius: 22px;
  }
  .shell .intro-title {
    font-size: 22px;
  }
  .shell .message-row {
    margin-bottom: 14px;
  }
  .shell .avatar {
    display: none;
  }
  .shell .message-content {
    max-width: 100%;
  }
  .shell .msg {
    max-width: 100%;
    padding: 14px 15px;
    font-size: 14px;
  }
  .shell .msg.streaming {
    min-width: 0;
  }
  .shell .msg-image {
    width: 100%;
    height: 220px;
  }
  .shell .composer {
    padding: 10px 12px calc(12px + env(safe-area-inset-bottom));
  }
  .shell .composer-card {
    border-radius: 20px;
    padding: 12px;
  }
  .shell .prompt-textarea {
    min-height: 82px;
    font-size: 14px;
  }
  .shell .composer-toolbar {
    display: block;
  }
  .shell .composer-hint {
    margin-right: 0;
    margin-bottom: 12px;
  }
  .shell .actions .btn {
    flex: 1 1 120px;
  }
  .shell .image-pending {
    align-items: flex-start;
    flex-direction: column;
  }
  .shell .image-pending-clear {
    padding-left: 0;
  }
}

@media (max-width: 480px) {
  .shell .sidebar {
    top: 0;
    left: 0;
    bottom: 0;
    max-width: 88vw;
    border-radius: 0 24px 24px 0;
  }
  .shell .status-pill,
  .shell .header-chip {
    font-size: 11px;
  }
  .shell .intro-copy,
  .shell .composer-hint {
    font-size: 11px;
  }
  .shell .suggestion-pill {
    padding: 9px 12px;
  }
}
</style>
