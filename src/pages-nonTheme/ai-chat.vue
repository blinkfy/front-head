<template>
  <view :class="['shell', isDark ? 'dark-theme' : '']">
    <view class="ambient ambient-one"></view>
    <view class="ambient ambient-two"></view>

    <!-- ===== 侧边栏：对话历史 ===== -->
    <view :class="['sidebar', historyDrawerOpen ? 'drawer-open' : '']">
      <view class="sidebar-top">
        <!-- DeepSeek式极简顶栏 -->
        <view class="brand-bar">
          <view class="brand-icon"></view>
          <view class="brand-title">AI 环保助手</view>
        </view>
        <view class="new-chat-btn" @tap="onNewChat">
          <text class="new-chat-icon">+</text>
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
          :class="['conversation-item', item.id === activeSessionId ? 'active' : '']"
          @tap="onSelectConversation(item.id)"
        >
          <view class="conversation-title">{{ item.title || '环保分类咨询' }}</view>
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
            </view>
          </view>
        </view>
        <view class="header-actions">
          <view class="btn ghost" @tap="goBack">返回识别页</view>
        </view>
      </view>

      <!-- 消息列表 -->
      <scroll-view
        class="messages"
        scroll-y
        :scroll-top="messagesScrollTop"
      >
        <view v-if="showIntroPanel" class="welcome-hero">
          <view class="welcome-icon">
            <view class="welcome-icon-inner"></view>
          </view>
          <view class="welcome-text">今天有什么可以帮您？</view>
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
                v-if="getMessageImageSrc(msg)"
                class="msg-image"
                :src="getMessageImageSrc(msg)"
                mode="aspectFit"
                @error="handleMessageImageError(idx)"
              />
              <!-- 用户消息保持纯文本，助手消息走 Markdown 渲染 -->
              <text v-if="msg.role === 'user'" class="msg-body">{{ msg.content }}</text>
              <!-- 深度思考推理区：DeepSeek风格，可折叠，置于正文上方 -->
              <view
                v-if="msg.reasoning && (isDeepThinking || !isStreaming)"
                class="reasoning-block"
              >
                <view
                  class="reasoning-header"
                  @tap="toggleReasoning(idx)"
                >
                  <text class="reasoning-label">思考过程</text>
                  <text class="reasoning-chevron" :class="isReasoningCollapsed(idx) ? 'collapsed' : ''">&#9658;</text>
                </view>
                <view
                  v-show="!isReasoningCollapsed(idx)"
                  class="reasoning-body"
                >
                  <MarkdownBody variant="reasoning" :markdown="msg.reasoning" />
                </view>
              </view>
              <!-- #ifdef H5 -->
              <MarkdownBody v-if="msg.role !== 'user'" :markdown="msg.content || 'AI 暂未返回内容。'" />
              <!-- #endif -->
              <!-- #ifndef H5 -->
              <text v-if="msg.role !== 'user'" class="msg-body assistant-text">
                {{ getDisplayMessageText(msg) }}
              </text>
              <!-- #endif -->
            </view>
          </view>
        </view>
        <view v-if="isStreaming" class="message-row from-assistant">
          <view class="avatar assistant-avatar">AI</view>
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
                  @tap="toggleReasoning('__stream__')"
                >
                  <text class="reasoning-label">思考过程</text>
                  <text class="reasoning-chevron" :class="isReasoningCollapsed('__stream__') ? 'collapsed' : ''">&#9658;</text>
                </view>
                <view
                  v-show="!isReasoningCollapsed('__stream__')"
                  class="reasoning-body"
                >
                  <MarkdownBody variant="reasoning" :markdown="streamingReasoning" />
                </view>
              </view>
              <MarkdownBody :markdown="streamingText" />
              <view class="typing-dots">
                <view class="typing-dot"></view>
                <view class="typing-dot"></view>
                <view class="typing-dot"></view>
              </view>
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
              <view class="btn-attach" @tap="onPickImage">
                <text class="attach-icon">📎</text>
              </view>
              <view
                v-if="isStreaming"
                class="btn-stop"
                @tap="onStop"
              >
                <text class="stop-text">停止</text>
              </view>
              <view
                v-else
                class="btn-send"
                @tap="onSend"
              >
                <text class="send-icon">↑</text>
              </view>
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
import MarkdownBody from '@/components/MarkdownBody.vue'

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
const isStreaming   = ref(false)
const streamingText = ref('')
const streamingReasoning = ref('')   // 流式推理内容
const messagesScrollTop = ref(0)
const historyDrawerOpen = ref(false)
const pickedImageDataUrl = ref('')
const pickedImageName    = ref('')
const isDeepThinking = ref(false)    // DeepSeek风格：深度思考开关
const isNarrowScreen = ref(false)    // 超小屏（≤480px）标识
const reasoningCollapsed = ref({})   // reasoning-block 折叠状态，key=消息index

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

function getMessageImageSrc(msg) {
  if (!msg) return ''
  if (msg._imageLoadFailed) return ''
  if (isRenderableImageSrc(msg._localImagePath)) return msg._localImagePath
  if (isRenderableImageSrc(msg.imageBase64)) return msg.imageBase64
  return ''
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
// ─── 深度思考切换 ────────────────────────────────────────
function toggleDeepThinking() {
  isDeepThinking.value = !isDeepThinking.value
}
// ─── 推理区折叠 ──────────────────────────────────────────
function toggleReasoning(msgIndex) {
  const key = String(msgIndex)
  reasoningCollapsed.value = {
    ...reasoningCollapsed.value,
    [key]: !reasoningCollapsed.value[key]
  }
}
function isReasoningCollapsed(msgIndex) {
  return !!reasoningCollapsed.value[String(msgIndex)]
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
function pushMessageToActive(role, content, imageBase64, createdAt, reasoning, localImagePath) {
  const conversation = ensureConversation(activeSessionId.value)
  const msg = {
    role: role === 'assistant' ? 'assistant' : 'user',
    content: String(content || ''),
    imageBase64: typeof imageBase64 === 'string' ? imageBase64 : '',
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
      if (msg && msg.imageBase64 && msg.imageBase64.startsWith('data:image/')) {
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

  // 优先使用 seed 中的 imageBase64，按以下顺序尝试：
  // 1. 正常 data:image/ URL
  // 2. 大图占位符 __LARGE_IMAGE__:len → 从独立 key 读取实际 base64
  // 3. legacy key（H5 和小程序的兼容路径）
  let seedImage = ''
  const rawImage = seedPayload.imageBase64 || ''
  if (rawImage.startsWith('data:image/')) {
    seedImage = rawImage
  } else if (rawImage.startsWith('__LARGE_IMAGE__:')) {
    // 从拆分存储的大图中恢复
    seedImage = getStorage('ai_chat_seed_image_large') || ''
  } else {
    const legacyImage = getStorage('ai_chat_seed_image')
    if (typeof legacyImage === 'string' && legacyImage.startsWith('data:image/')) {
      seedImage = legacyImage
    }
  }
  const seedUserText = buildSeedUserText(seedPayload)
  const seedText = buildSeedAssistantText(seedPayload)
  const conversation = ensureConversation(newSessionId)
  if (seedUserText || seedImage) {
    conversation.messages.push({
      role: 'user', content: seedUserText || '请继续分析这张图片。',
      imageBase64: seedImage, createdAt: createdAt || new Date().toISOString(),
      _pendingPersist: true
    })
  }
  if (seedText) {
    conversation.messages.push({
      role: 'assistant', content: seedText, imageBase64: '',
      createdAt: createdAt || new Date().toISOString(),
      _pendingPersist: true
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
          nextTick(() => { messagesScrollTop.value = 999999 })
        } else if (eventName === 'reasoning') {
          // 推理增量事件（后端每次推送 chunk，客户端拼接）
          reasoning = (reasoning || '') + (data.chunk || '')
          streamingReasoning.value = reasoning
        } else if (eventName === 'done') {
          full = data.content || full
          // done 事件中若包含 reasoning，优先取完整值
          if (data.reasoning) reasoning = data.reasoning
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
          break
        case 'delta':
          full = data.full || (full + (data.chunk || ''))
          streamingText.value = full
          nextTick(() => { messagesScrollTop.value = 999999 })
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
function extractPendingPersistMessages() {
  const conversation = ensureConversation(activeSessionId.value)
  return conversation.messages
    .filter(item => item && item._pendingPersist && (item.role === 'user' || item.role === 'assistant'))
    .map(item => ({
      role: item.role,
      content: item.content,
      hasImage: !!item.imageBase64
    }))
    .filter(item => String(item.content || '').trim())
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
  if (changed) messageList.value = conversation.messages.slice()
}

async function onSend() {
  if (isStreaming.value) return
  const rawText = promptText.value.trim()
  const sendingImage = pickedImageDataUrl.value
  if (!rawText && !sendingImage) {
    uni.showToast({ title: '请先输入问题或选择图片', icon: 'none' })
    return
  }
  // 小程序端在发送前立即设置状态，防止重复点击
  // #ifndef H5
  isStreaming.value = true
  streamingText.value = '正在思考中...'
  streamingReasoning.value = ''
  // #endif
  const userText = rawText || '请基于这张图继续补充具体物品分类和可执行的变废为宝方案。'
  const historyForApi = extractHistoryForRequest()
  const seedMessagesForPersist = extractPendingPersistMessages()

  // 小程序端：保留本地路径用于消息气泡显示，另转 base64 发给服务端
  let apiImage = sendingImage
  // #ifndef H5
  console.log('[ai-chat] sendingImage before conversion:', sendingImage, 'startsWith data:', sendingImage && sendingImage.startsWith('data:'), 'startsWith http:', sendingImage && sendingImage.startsWith('http'))
  if (apiImage && !apiImage.startsWith('data:') && !apiImage.startsWith('http')) {
    const converted = await localPathToBase64(apiImage)
    console.log('[ai-chat] apiImage after conversion:', converted ? (converted.substring(0, 50) + '...') : 'empty', 'length:', converted && converted.length)
    // 只有成功转换出 data URL 才赋值
    if (converted && converted.startsWith('data:')) {
      apiImage = converted
    } else {
      // 转换失败：保留本地路径给气泡显示，不发给服务端
      apiImage = ''
    }
  }
  // #endif

  console.log('[ai-chat] onSend: userText=', userText, 'hasImage=', !!apiImage)
  // 小程序端：本地路径存到 _localImagePath 供气泡渲染，imageBase64 存 data URL 供 API
  // #ifndef H5
  const displayImage = sendingImage   // 本地路径，用于气泡显示
  const storedImage = apiImage        // data URL，用于 API 请求
  // #endif
  // #ifdef H5
  const displayImage = sendingImage
  const storedImage = sendingImage    // H5 下 sendingImage 本身就是 data URL 或 blob URL
  // #endif
  pushMessageToActive('user', userText, storedImage, new Date().toISOString(), undefined, displayImage)
  promptText.value = ''
  clearPickedImage()

  try {
    const streamed = await streamChat({
      text: userText,
      imageBase64: apiImage,
      history: historyForApi,
      seedMessages: seedMessagesForPersist,
      enableThinking: isDeepThinking.value
    })
    markPendingPersistMessagesSaved()
    pushMessageToActive('assistant', streamed.content || 'AI 暂未返回内容。', '', new Date().toISOString(), streamed.reasoning || '')
  } catch (err) {
    const failedText = err && err.name === 'AbortError'
      ? '已停止当前回答。'
      : `请求异常：${err && err.message ? err.message : err}`
    pushMessageToActive('assistant', failedText, '', new Date().toISOString(), '')
    // #ifdef H5
    isStreaming.value = false
    // #endif
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

  let historyItems = []
  try { historyItems = await loadHistoryItems() } catch (_) {}
  hydrateConversations(historyItems)

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
  nextTick(() => { messagesScrollTop.value = 999999 })
})

onBeforeUnmount(() => {
  if (abortCtrl) abortCtrl.abort()
  if (wsSocket) {
    try { wsSocket.close() } catch (_) {}
    wsSocket = null
  }
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

/* ─── page容器 ─── */
page {
  background: var(--bg-primary);
  height: 100vh;
  overflow: hidden;
  font-family: var(--font-main);
}

/* 微信小程序安全区域适配 */
page {
  padding-top: constant(safe-area-inset-top);
  padding-top: env(safe-area-inset-top);
}

/* ─── shell根布局 ─── */
.shell {
  width: 100%;
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
  background: linear-gradient(135deg, #4D6BFE, #6B8BFF);
  color: #fff;
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
  font-size: 9px;
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
  width: auto;
  max-width: min(280px, 72vw);
  max-height: 220px;
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

/* 附件按钮 */
.shell .btn-attach {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-light);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.shell .btn-attach:active {
  background: var(--border-light);
  transform: scale(0.95);
}

.shell .attach-icon {
  font-size: 16px;
}

/* 发送按钮 */
.shell .btn-send {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.shell .btn-send:active {
  background: var(--accent-hover);
  transform: scale(0.95);
}

.shell .send-icon {
  font-size: 16px;
  color: #fff;
  font-weight: 600;
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
  background: linear-gradient(135deg, #4D6BFE, #7B9BFF);
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
  background: linear-gradient(135deg, #4D6BFE, #7B9BFF);
  display: flex;
  align-items: center;
  justify-content: center;
}
.shell .welcome-icon-inner {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.5);
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

/* 附件按钮 */
.shell .btn-attach {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-light);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.12s ease;
  flex-shrink: 0;
}
.shell .btn-attach:active {
  background: var(--border-light);
  transform: scale(0.95);
}
.shell .attach-icon { font-size: 15px; }

/* 发送按钮 */
.shell .btn-send {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.12s ease;
  flex-shrink: 0;
}
.shell .btn-send:active {
  background: var(--accent-hover);
  transform: scale(0.95);
}
.shell .send-icon { font-size: 15px; color: #fff; font-weight: 700; }

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
  page { padding: 0; }
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
  .shell .msg-image { width: auto; max-width: min(260px, 72vw) !important; max-height: 200px; }
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
  .shell .btn-send, .shell .btn-attach { width: 30px; height: 30px; border-radius: 7px; flex-shrink: 0; }
  .shell .composer-right { flex-shrink: 0; }
  .shell .suggestion-pill { padding: 5px 10px; font-size: 10px; }
  .shell .image-pending { padding: 8px 10px; border-radius: 10px; }
  .shell .image-pending-name { max-width: 160px; }
  /* 消息气泡和小屏进一步保证 */
  .shell .msg { max-width: 100% !important; width: 100%; }
  .shell .msg-image { width: auto; max-width: min(220px, 68vw) !important; max-height: 180px; }
  .shell .message-row { flex-wrap: wrap; width: 100%; }
  .shell .message-content { flex: 1 1 auto !important; }
}

/* ─── 深色主题覆盖 ─── */
.shell.dark-theme .btn-attach { background: #333333; border-color: #3F3F46; }
.shell.dark-theme .btn-stop { background: #333333; border-color: #52525B; }
.shell.dark-theme .suggestion-pill { background: #262626; border-color: #3F3F46; }
.shell.dark-theme .conversation-item:hover { background: #333333; }
.shell.dark-theme .welcome-icon { background: linear-gradient(135deg, #3D5BEE, #6B8AFF); }
.shell.dark-theme .brand-icon { background: linear-gradient(135deg, #3D5BEE, #6B8AFF); }
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
