<template>
  <view :class="['theme-wrapper', currentTheme === 'light' ? 'light-theme' : 'dark-theme']">
    <main class="wrap">

      <!-- 顶部导航栏 -->
      <section v-if="adminVerified" class="topbar">
        <div class="topbar-title-group">
          <view class="page-badge">Admin</view>
          <div class="title">服务设置</div>
          <div class="sub">管理员可管理网页注册、AI 服务、识别模式和模型参数</div>
        </div>
        <div class="topbar-actions">
          <button class="btn icon-btn" @click="goBack" type="button">
            <ManifestIcon class="btn-icon" id="back" /> 返回
          </button>
          <button class="btn btn-refresh" @click="loadSettings" :disabled="loading" type="button">
            <ManifestIcon class="btn-icon" id="refresh" :class="{ spinning: loading }" /> 读取
          </button>
          <button class="btn btn-chat" @click="goToAiChat" type="button">AI 聊天</button>
        </div>
      </section>

      <!-- 状态横幅 -->
      <view v-if="adminVerified && statusText" class="status-banner" :class="statusCls">
        <ManifestIcon class="status-icon" :id="statusCls === 'ok' ? 'confirm' : statusCls === 'err' ? 'cancel' : 'help'" />
        <text>{{ statusText }}</text>
      </view>

      <!-- 设置表单卡片 -->
      <section v-if="adminVerified" class="card">
        <div class="card-h">
          <view class="card-h-left">
            <ManifestIcon class="card-icon" id="ai_settings" />
            <span>运行参数</span>
          </view>
          <view class="ai-badge" :class="form.aiEnabled ? 'badge-on' : 'badge-off'">
            {{ form.aiEnabled ? 'AI 运行中' : 'AI 已关闭' }}
          </view>
        </div>
        <div class="card-b">

          <!-- 网页注册开关 -->
          <div class="row">
            <div class="row-label-group">
              <view class="row-dot dot-green"></view>
              <div>
                <div class="label">允许网页端 / APP 注册</div>
                <div class="desc">开启后 H5 与 APP 显示账号注册表单；关闭后显示微信扫码引导，小程序不受影响</div>
              </div>
            </div>
            <view class="switch-row">
              <switch :checked="form.allowWebRegistration" @change="form.allowWebRegistration = $event.detail.value" color="#17b27a" />
              <text class="switch-label" :class="form.allowWebRegistration ? 'sw-on' : 'sw-off'">{{ form.allowWebRegistration ? '启用' : '关闭' }}</text>
            </view>
          </div>

          <view class="divider"></view>

          <div class="row">
            <div class="row-label-group">
              <view class="row-dot dot-green"></view>
              <div>
                <div class="label">社区互动与聊天关联</div>
                <div class="desc">独立于 LLM：开启发帖、评论、作者联系、帖子分享、互动提醒、联系人和群聊管理，以及发起通话和实时位置共享入口；关闭后保留浏览、点赞、内容管理、已有会话聊天及正在进行的通话与共享</div>
              </div>
            </div>
            <view class="switch-row">
              <switch :checked="form.communityChatEnabled" @change="form.communityChatEnabled = $event.detail.value" color="#17b27a" />
              <text class="switch-label" :class="form.communityChatEnabled ? 'sw-on' : 'sw-off'">{{ form.communityChatEnabled ? '启用' : '关闭' }}</text>
            </view>
          </div>
          <view class="divider"></view>

          <!-- AI 服务开关 -->
          <div class="row">
            <div class="row-label-group">
              <view class="row-dot dot-green"></view>
              <div>
                <div class="label">LLM 服务开关</div>
                <div class="desc">关闭后将禁用 AI 识别增强及 AI 对话流式接口</div>
              </div>
            </div>
            <view class="switch-row">
              <switch :checked="form.aiEnabled" @change="form.aiEnabled = $event.detail.value" color="#17b27a" />
              <text class="switch-label" :class="form.aiEnabled ? 'sw-on' : 'sw-off'">{{ form.aiEnabled ? '启用' : '关闭' }}</text>
            </view>
          </div>

          <view class="divider"></view>

          <!-- 识别模式 -->
          <div class="row">
            <div class="row-label-group">
              <view class="row-dot dot-blue"></view>
              <div>
                <div class="label">识别模式</div>
                <div class="desc">yolo 优先本地 YOLO；ai 直接使用大模型图像识别</div>
              </div>
            </div>
            <picker :range="detectorModeOptions" :range-key="'label'" :value="detectorModeIndex" @change="onDetectorModeChange" class="picker-wrap">
              <view class="picker-display">
                <text>{{ detectorModeOptions[detectorModeIndex].label }}</text>
                <ManifestIcon class="picker-arrow" id="chevron_down" :scale="0.8" />
              </view>
            </picker>
          </div>

          <div class="row">
            <div class="row-label-group">
              <view class="row-dot dot-purple"></view>
              <div>
                <div class="label">LLM 供应商</div>
                <div class="desc">用于 AI 对话、识别增强及聊天 AI</div>
              </div>
            </div>
            <picker :range="providerOptions" range-key="label" :value="providerIndex" @change="onProviderChange" class="picker-wrap">
              <view class="picker-display">
                <text>{{ providerOptions[providerIndex].label }}</text>
                <ManifestIcon class="picker-arrow" id="chevron_down" :scale="0.8" />
              </view>
            </picker>
          </div>
          <div class="row">
            <div class="row-label-group">
              <view class="row-dot dot-blue"></view>
              <div>
                <div class="label">供应商密钥{{ llmCredentials[form.provider] ? '已配置' : '未配置' }}</div>
                <div class="desc">{{ form.provider === 'deepseek' ? '在服务端配置 DEEPSEEK_API_KEY；可用 DEEPSEEK_BASE_URL 自定义接口地址。联网搜索请选择 deepseek-flash，工具调用按官方标准另行计费。' : '在服务端配置 DASHSCOPE_API_KEY 或 QWEN_API_KEY' }}</div>
              </div>
            </div>
          </div>

          <!-- 模型名 -->
          <div class="row">
            <div class="row-label-group">
              <view class="row-dot dot-purple"></view>
              <div>
                <div class="label">模型名</div>
                <div class="desc">{{ form.provider === 'deepseek' ? 'deepseek-flash 支持文字与图片；deepseek-v4-pro 仅支持文字' : '例如：qwen3.5-flash' }}</div>
              </div>
            </div>
            <input v-if="form.provider === 'deepseek'" class="input" type="text" :value="form.deepseekModel" @input="form.deepseekModel = $event.detail.value" placeholder="deepseek-flash" />
            <input v-else class="input" type="text" :value="form.model" @input="form.model = $event.detail.value" placeholder="qwen3.5-flash" />
          </div>

          <!-- 推荐算法 -->
          <div class="row">
            <div class="row-label-group">
              <view class="row-dot dot-orange"></view>
              <div>
                <div class="label">商城推荐算法</div>
                <div class="desc">切换默认推荐引擎：千问（qwen）或 deep（深度学习）</div>
              </div>
            </div>
            <picker :range="recommendOptions" :range-key="'label'" :value="recommendIndex" @change="onRecommendChange" class="picker-wrap">
              <view class="picker-display">
                <text>{{ recommendOptions[recommendIndex].label }}</text>
                <ManifestIcon class="picker-arrow" id="chevron_down" :scale="0.8" />
              </view>
            </picker>
          </div>

          <view class="divider"></view>

          <!-- 3D 定位 -->
          <div class="row">
            <div class="row-label-group">
              <view class="row-dot dot-cyan"></view>
              <div>
                <div class="label">3D 定位</div>
                <div class="desc">在识别结果中返回相对三维位置</div>
              </div>
            </div>
            <view class="switch-row">
              <switch :checked="form.include3d" @change="form.include3d = $event.detail.value" color="#17b27a" />
              <text class="switch-label" :class="form.include3d ? 'sw-on' : 'sw-off'">{{ form.include3d ? '启用' : '关闭' }}</text>
            </view>
          </div>

          <!-- Thinking 模式 -->
          <div class="row">
            <div class="row-label-group">
              <view class="row-dot dot-purple"></view>
              <div>
                <div class="label">Thinking 模式</div>
                <div class="desc">开启后模型可能更慢，但推理更充分</div>
              </div>
            </div>
            <view class="switch-row">
              <switch :checked="form.enableThinking" @change="form.enableThinking = $event.detail.value" color="#17b27a" />
              <text class="switch-label" :class="form.enableThinking ? 'sw-on' : 'sw-off'">{{ form.enableThinking ? '启用' : '关闭' }}</text>
            </view>
          </div>

          <!-- Thinking 强度 -->
          <div class="row" :class="{ 'row-muted': !form.enableThinking }">
            <div class="row-label-group">
              <view class="row-dot dot-purple"></view>
              <div>
                <div class="label">思考强度</div>
                <div class="desc">{{ form.provider === 'qwen' ? 'Qwen3.5 通过指令调节；支持原生强度的型号使用对应参数' : 'deepseek 支持低、高、最高三档' }}</div>
              </div>
            </div>
            <picker :range="thinkingEffortOptions" range-key="label" :value="thinkingEffortIndex"
              @change="onThinkingEffortChange" :disabled="!form.enableThinking" class="picker-wrap">
              <view class="picker-display">
                <text>{{ thinkingEffortOptions[thinkingEffortIndex].label }}</text>
                <ManifestIcon class="picker-arrow" id="chevron_down" :scale="0.8" />
              </view>
            </picker>
          </div>

          <view class="divider"></view>

          <!-- 变废为宝效果图 -->
          <div class="row">
            <div class="row-label-group">
              <view class="row-dot dot-green"></view>
              <div>
                <div class="label">变废为宝效果图</div>
                <div class="desc">开启后，可为识别结果生成效果图</div>
              </div>
            </div>
            <view class="switch-row">
              <switch :checked="form.enableUpcyclingImage" @change="form.enableUpcyclingImage = $event.detail.value" color="#17b27a" />
              <text class="switch-label" :class="form.enableUpcyclingImage ? 'sw-on' : 'sw-off'">{{ form.enableUpcyclingImage ? '启用' : '关闭' }}</text>
            </view>
          </div>

          <div class="row" :class="{ 'row-muted': !form.enableUpcyclingImage }">
            <div class="row-label-group">
              <view class="row-dot dot-green"></view>
              <div>
                <div class="label">AI 不建议改造时跳过</div>
                <div class="desc">默认生成效果图；开启后，仅当识别 AI 明确不建议改造时跳过</div>
              </div>
            </div>
            <view class="switch-row">
              <switch :checked="form.skipUnrecommendedUpcyclingImage" :disabled="!form.enableUpcyclingImage" @change="form.skipUnrecommendedUpcyclingImage = $event.detail.value" color="#17b27a" />
              <text class="switch-label" :class="form.skipUnrecommendedUpcyclingImage ? 'sw-on' : 'sw-off'">{{ form.skipUnrecommendedUpcyclingImage ? '启用' : '关闭' }}</text>
            </view>
          </div>

          <!-- 操作区 -->
          <div class="action-bar">
            <button class="btn btn-save" @click="saveSettings" :disabled="loading" type="button">
              <text v-if="loading">保存中…</text><template v-else><ManifestIcon id="confirm" /> 保存设置</template>
            </button>
            <button class="btn btn-reset" @click="resetForm" type="button"><ManifestIcon id="restore" :scale="1" /> 恢复默认</button>
          </div>

        </div>
      </section>

      <view v-if="adminVerified || publicOfflineMode" class="diagnostic-tools">
        <button v-if="adminVerified" class="diagnostic-toggle" @click="toggleDiagnostics" :aria-expanded="diagnosticsExpanded" type="button">
          <text>开发与诊断</text><text>{{ diagnosticsExpanded ? '收起 −' : '展开 +' }}</text>
        </button>
        <view v-else class="diagnostic-toggle diagnostic-heading">开发与诊断</view>
        <view v-if="diagnosticsExpanded || publicOfflineMode">
        <section v-if="publicOfflineMode" class="retirement-card retirement-blocked">
          <div class="retirement-title">暂缓销毁</div>
          <div class="retirement-reason">数据库离线，暂时无法确认实例是否可以销毁。</div>
          <div class="retirement-note">此状态来自公共健康检查，只反映当前响应的实例。停止接收新请求后，请再执行最终检查。</div>
          <div class="retirement-actions">
            <button class="diagnostic-link" @click="goBack" type="button">返回</button>
            <button class="diagnostic-link" @click="retryAdminAuth" type="button">重新检查</button>
          </div>
        </section>
        <section v-else class="retirement-card" :class="retirementCardClass">
          <div class="retirement-card-heading">
            <div>
              <div class="retirement-title">实例销毁检查</div>
              <div class="retirement-note">只检查响应请求的实例；请结合部署主机名核对目标。停止接收新请求后，请再执行最终检查。</div>
            </div>
            <button class="diagnostic-link" @click="checkRetirement" :disabled="retirementLoading" type="button">
              {{ retirementLoading ? '检查中…' : '刷新检查' }}
            </button>
          </div>
          <div class="retirement-status">{{ retirementStatusText }}</div>
          <div v-if="retirementCheck" class="retirement-meta">
            <span v-if="retirementCheck.instanceId">实例：{{ retirementCheck.instanceId }}</span>
            <span v-if="retirementCheck.checkedAt">检查时间：{{ formatCheckedAt(retirementCheck.checkedAt) }}</span>
          </div>
          <ul v-if="retirementCheck && retirementCheck.reasons.length" class="retirement-reasons">
            <li v-for="(reason, index) in retirementCheck.reasons" :key="index">{{ reason }}</li>
          </ul>
        </section>
        <view v-if="adminVerified" class="diagnostic-links">
          <button class="diagnostic-link" @click="goCallCheck" type="button">通话环境检测</button>
          <button class="diagnostic-link" @click="goToTest" type="button">API 测试</button>
          <button class="diagnostic-link" @click="goToTestMap" type="button">地图功能测试</button>
        </view>
        <!-- #ifdef APP-PLUS -->
        <view v-if="adminVerified" class="diagnostic-console"><AdminConsolePanel /></view>
        <!-- #endif -->
        </view>
      </view>
    </main>
  </view>
</template>

<script setup>
import { onBeforeUnmount, onMounted, reactive, ref, computed } from 'vue'
import { onShow, onHide } from '@dcloudio/uni-app'
// #ifdef APP-PLUS
import AdminConsolePanel from './components/AdminConsolePanel.vue'
// #endif
import { applyStoredTheme, bindThemeStorageSync } from '@/utils/theme'
import { userinfo } from '@/api/user'
import { baseUrl } from '@/api/settings'
import { applyCommunityChatSettings } from '@/utils/community-chat-settings.js'
// #ifdef APP-PLUS
import { invalidateAppHomeAiSettings } from '@/utils/app-home-ai-settings.js'
// #endif
import ManifestIcon from '@/components/ManifestIcon.vue'

let unbindThemeWatcher = null

const adminVerified = ref(false)
const publicOfflineMode = ref(false)
const diagnosticsExpanded = ref(false)
const retirementCheck = ref(null)
const retirementLoading = ref(false)
let verifiedAdminToken = ''
let authVersion = 0
let retirementRequestVersion = 0
const currentTheme = ref('light')
const loading = ref(false)
const statusText = ref('')
const statusCls = ref('')

const DEFAULT_FORM = {
  provider: 'qwen',
  deepseekModel: 'deepseek-flash',
  allowWebRegistration: false,
  aiEnabled: true,
  communityChatEnabled: true,
  detectorMode: 'yolo',
  model: 'qwen3.5-flash',
  recommendAlgorithm: 'qwen',
  include3d: true,
  enableThinking: false,
  qwenThinkingEffort: 'auto',
  deepseekThinkingEffort: 'high',
  enableUpcyclingImage: true,
  skipUnrecommendedUpcyclingImage: true
}

const form = reactive({ ...DEFAULT_FORM })
const llmCredentials = reactive({ qwen: false, deepseek: false })
const providerOptions = [
  { label: '阿里云百炼', value: 'qwen' },
  { label: 'DeepSeek 官方 API', value: 'deepseek' }
]
const providerIndex = computed(() => Math.max(0, providerOptions.findIndex(option => option.value === form.provider)))
function onProviderChange(event) {
  form.provider = providerOptions[Number(event.detail.value)]?.value || 'qwen'
}

const qwenThinkingEffortOptions = [
  { label: '默认', value: 'auto' },
  { label: '低', value: 'low' },
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' }
]
const deepseekThinkingEffortOptions = [
  { label: '低', value: 'low' },
  { label: '高', value: 'high' },
  { label: '最高', value: 'max' }
]
const thinkingEffortOptions = computed(() => form.provider === 'deepseek'
  ? deepseekThinkingEffortOptions
  : qwenThinkingEffortOptions)
const thinkingEffortIndex = computed(() => {
  const value = form.provider === 'deepseek' ? form.deepseekThinkingEffort : form.qwenThinkingEffort
  const index = thinkingEffortOptions.value.findIndex(option => option.value === value)
  return index >= 0 ? index : 0
})
function onThinkingEffortChange(event) {
  const value = thinkingEffortOptions.value[Number(event.detail.value)]?.value
  if (!value) return
  if (form.provider === 'deepseek') form.deepseekThinkingEffort = value
  else form.qwenThinkingEffort = value
}

// picker 选项配置
const detectorModeOptions = [
  { label: 'yolo（默认）', value: 'yolo' },
  { label: 'ai（所选大模型）', value: 'ai' }
]
const recommendOptions = [
  { label: 'qwen（千问）', value: 'qwen' },
  { label: 'deep（深度学习）', value: 'deep' },
  { label: 'deepseek', value: 'deepseek' }
]

const detectorModeIndex = computed(() => {
  const idx = detectorModeOptions.findIndex(o => o.value === form.detectorMode)
  return idx >= 0 ? idx : 0
})
const recommendIndex = computed(() => {
  const idx = recommendOptions.findIndex(o => o.value === form.recommendAlgorithm)
  return idx >= 0 ? idx : 0
})

function onDetectorModeChange(e) {
  form.detectorMode = detectorModeOptions[e.detail.value].value
}
function onRecommendChange(e) {
  form.recommendAlgorithm = recommendOptions[e.detail.value].value
}

function getStorage(key) {
  const result = uni.getStorageSync(key)
  return result || null
}

function setStatus(text, type) {
  statusText.value = text || ''
  statusCls.value = type || ''
}

function normalizeRecommendAlgorithm(input) {
  const value = String(input || '').trim().toLowerCase()
  if (value === 'deep' || value === 'deepseek') return value
  return 'qwen'
}

function applyData(data) {
  form.provider = data.provider === 'deepseek' ? 'deepseek' : 'qwen'
  form.deepseekModel = data.deepseekModel || 'deepseek-flash'
  if (data.llmCredentials) Object.assign(llmCredentials, data.llmCredentials)
  form.allowWebRegistration = !!data.allowWebRegistration
  form.aiEnabled = !!data.aiEnabled
  form.communityChatEnabled = data.communityChatEnabled !== false
  applyCommunityChatSettings(data)
  form.detectorMode = data.detectorMode === 'ai' ? 'ai' : 'yolo'
  form.model = data.model || 'qwen3.5-flash'
  form.recommendAlgorithm = normalizeRecommendAlgorithm(
    data.recommendAlgorithm !== undefined ? data.recommendAlgorithm : data.recommendAlgo
  )
  form.include3d = !!data.include3d
  form.enableThinking = !!data.enableThinking
  form.qwenThinkingEffort = ['auto', 'low', 'medium', 'high'].includes(data.qwenThinkingEffort)
    ? data.qwenThinkingEffort : 'auto'
  form.deepseekThinkingEffort = ['low', 'high', 'max'].includes(data.deepseekThinkingEffort)
    ? data.deepseekThinkingEffort : 'high'
  form.enableUpcyclingImage = !!data.enableUpcyclingImage
  form.skipUnrecommendedUpcyclingImage = data.skipUnrecommendedUpcyclingImage !== false
}

function resetForm() {
  applyData(DEFAULT_FORM)
  setStatus('已重置为页面默认值（尚未保存）')
}

function authHeaders() {
  const token = getStorage('token') || ''
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = token
  return headers
}

function loadSettings() {
  if (loading.value) return
  loading.value = true
  setStatus('读取中...')
  uni.request({
    url: baseUrl + '/api/admin/ai-settings',
    method: 'GET',
    header: authHeaders(),
    success(res) {
      const json = res.data
      if (!json || json.code !== 0 || !json.data) {
        setStatus('读取失败：' + ((json && json.msg) || ('HTTP ' + res.statusCode)), 'err')
        return
      }
      applyData(json.data)
      setStatus('读取成功', 'ok')
    },
    fail() {
      setStatus('读取失败：网络错误', 'err')
    },
    complete() {
      loading.value = false
    }
  })
}

const retirementStatusText = computed(() => {
  if (retirementLoading.value && !retirementCheck.value) return '正在检查当前实例…'
  const status = retirementCheck.value?.status
  if (status === 'ready') return '当前检查通过'
  if (status === 'blocked') return '暂缓销毁'
  return retirementCheck.value ? '无法确认' : '尚未检查'
})
const retirementCardClass = computed(() => {
  const status = retirementCheck.value?.status
  return status === 'ready' ? 'retirement-ready' : status === 'blocked' ? 'retirement-blocked' : ''
})

function formatCheckedAt(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function clearRetirementCheck() {
  retirementRequestVersion++
  retirementCheck.value = null
  retirementLoading.value = false
}

function toggleDiagnostics() {
  diagnosticsExpanded.value = !diagnosticsExpanded.value
  if (diagnosticsExpanded.value) checkRetirement()
  else clearRetirementCheck()
}

function checkRetirement() {
  if (!canOpenDiagnostics() || retirementLoading.value) return
  const version = ++retirementRequestVersion
  const token = uni.getStorageSync('token')
  retirementLoading.value = true
  retirementCheck.value = null
  let fallbackPending = false
  const current = () => {
    if (version !== retirementRequestVersion) return false
    if (token !== uni.getStorageSync('token')) {
      clearRetirementCheck()
      return false
    }
    return adminVerified.value
  }
  const requestHealthFallback = () => {
    fallbackPending = true
    checkPublicDatabaseOffline().then(databaseOffline => {
      if (!current()) return
      if (databaseOffline) {
        publicOfflineMode.value = true
        adminVerified.value = false
        verifiedAdminToken = ''
        diagnosticsExpanded.value = false
        retirementCheck.value = null
      } else {
        retirementCheck.value = {
          status: 'unknown', instanceId: '', checkedAt: '',
          reasons: ['管理检查未能完成，公共健康检查未报告数据库离线。']
        }
      }
      retirementLoading.value = false
    })
  }
  uni.request({
    url: baseUrl.replace(/\/$/, '') + '/api/admin/instance-retirement-check',
    method: 'GET',
    header: authHeaders(),
    success(res) {
      if (!current()) return
      const data = res.data && res.data.code === 0 && res.data.data
      if (data && ['ready', 'blocked', 'unknown'].includes(data.status)) {
        const instanceId = String(data.instanceId || '').trim()
        const checkedAt = String(data.checkedAt || '')
        const validCheckedAt = /^\d{4}-\d{2}-\d{2}T/.test(checkedAt) && !Number.isNaN(new Date(checkedAt).getTime())
        const readyIsVerifiable = data.status !== 'ready' || (instanceId && validCheckedAt)
        retirementCheck.value = {
          status: readyIsVerifiable ? data.status : 'unknown',
          instanceId,
          checkedAt,
          reasons: [
            ...(Array.isArray(data.reasons) ? data.reasons.map(String) : []),
            ...(!readyIsVerifiable ? ['缺少有效的实例标识或检查时间，无法确认检查结果。'] : [])
          ]
        }
        return
      }
      requestHealthFallback()
    },
    fail: requestHealthFallback,
    complete() {
      if (version === retirementRequestVersion && !fallbackPending) retirementLoading.value = false
    }
  })
}

function saveSettings() {
  if (loading.value) return
  loading.value = true
  setStatus('保存中...')
  const payload = {
    provider: form.provider,
    deepseekModel: (form.deepseekModel || '').trim() || 'deepseek-flash',
    allowWebRegistration: form.allowWebRegistration,
    aiEnabled: form.aiEnabled,
    communityChatEnabled: form.communityChatEnabled,
    detectorMode: form.detectorMode,
    model: (form.model || '').trim() || 'qwen3.5-flash',
    recommendAlgorithm: normalizeRecommendAlgorithm(form.recommendAlgorithm),
    include3d: form.include3d,
    enableThinking: form.enableThinking,
    qwenThinkingEffort: form.qwenThinkingEffort,
    deepseekThinkingEffort: form.deepseekThinkingEffort,
    enableUpcyclingImage: form.enableUpcyclingImage,
    skipUnrecommendedUpcyclingImage: form.skipUnrecommendedUpcyclingImage
  }
  uni.request({
    url: baseUrl + '/api/admin/ai-settings',
    method: 'PUT',
    header: authHeaders(),
    data: payload,
    success(res) {
      const json = res.data
      if (!json || json.code !== 0 || !json.data) {
        setStatus('保存失败：' + ((json && json.msg) || ('HTTP ' + res.statusCode)), 'err')
        return
      }
      applyData(json.data)
      setStatus('保存成功', 'ok')
      // #ifdef APP-PLUS
      invalidateAppHomeAiSettings()
      // #endif
    },
    fail() {
      setStatus('保存失败：网络错误', 'err')
    },
    complete() {
      loading.value = false
    }
  })
}

function goBack() {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack()
  } else if (currentTheme.value === 'light') {
    uni.reLaunch({ url: '/pages/home/home' })
  } else {
    uni.reLaunch({ url: '/pages-dark/home/home' })
  }
}
function goToAiChat() {
  uni.navigateTo({ url: '/pages-nonTheme/assistant' })
}
function goToTest() {
  if (!canOpenDiagnostics()) return
  uni.navigateTo({ url: '/pages-admin/test' })
}
function goToTestMap() {
  if (!canOpenDiagnostics()) return
  uni.navigateTo({ url: '/pages-admin/test-map' })
}
function canOpenDiagnostics() {
  return adminVerified.value && verifiedAdminToken === uni.getStorageSync('token')
}
function goCallCheck() {
  if (!canOpenDiagnostics()) return
  const target = baseUrl.replace(/\/$/, '') + '/call-check.html'
  // #ifdef H5
  window.location.assign(target)
  // #endif
  // #ifndef H5
  uni.navigateTo({ url: `/pages-nonTheme/webview?url=${encodeURIComponent(target)}` })
  // #endif
}
async function adminAuth(){
  const version = ++authVersion
  adminVerified.value = false
  publicOfflineMode.value = false
  verifiedAdminToken = ''
  diagnosticsExpanded.value = false
  clearRetirementCheck()
  const token = uni.getStorageSync('token')
  if (!token) {
    uni.setStorageSync('autoLogin', false)
    uni.navigateTo({ url: '/pages/index/index' })
    return false
  }
  try {
    const response = await userinfo('false')
    if (version !== authVersion || token !== uni.getStorageSync('token')) return false
    if (response && response.data && response.data.isAdmin === true){
      verifiedAdminToken = token
      adminVerified.value = true
      return true
    } else {
      const databaseOffline = await checkPublicDatabaseOffline()
      if (version !== authVersion || token !== uni.getStorageSync('token')) return false
      if (databaseOffline) {
        publicOfflineMode.value = true
        return false
      }
      // 权限验证失败，清除本地伪造的 isAdmin 标记
      uni.removeStorageSync('isAdmin')
      uni.showToast({ title: '权限已过期或被撤销', icon: 'none' })
      goBack()
    }
  } catch (err) {
    if (version !== authVersion || token !== uni.getStorageSync('token')) return false
    console.error('权限验证失败:', err)
    const databaseOffline = await checkPublicDatabaseOffline()
    if (version !== authVersion || token !== uni.getStorageSync('token')) return false
    if (databaseOffline) {
      publicOfflineMode.value = true
      return false
    }
    uni.showToast({ title: '权限验证失败，请重新登录', icon: 'none' })
    setTimeout(() => {
      goBack()
    }, 1000)
  }
  return false
}

function checkPublicDatabaseOffline() {
  return new Promise(resolve => {
    uni.request({
      url: baseUrl.replace(/\/$/, '') + '/health',
      method: 'GET',
      success(res) {
        const health = res.data
        resolve(!!(health && health.database && health.database.online === false))
      },
      fail() { resolve(false) }
    })
  })
}

async function retryAdminAuth() {
  publicOfflineMode.value = false
  if (await adminAuth()) {
    loadSettings()
    diagnosticsExpanded.value = true
    checkRetirement()
  }
}

onShow(async () => {
  if (await adminAuth()) loadSettings()
})
onHide(() => {
  adminVerified.value = false
  publicOfflineMode.value = false
  verifiedAdminToken = ''
  diagnosticsExpanded.value = false
  authVersion++
  clearRetirementCheck()
})

onMounted(() => {
  currentTheme.value = applyStoredTheme()
  unbindThemeWatcher = bindThemeStorageSync()
})

onBeforeUnmount(() => {
  if (unbindThemeWatcher) unbindThemeWatcher()
})
</script>

<style scoped>
.diagnostic-tools { margin-top: 28px; border-top: 1px solid var(--line); padding-top: 12px; }
.retirement-card { margin: 14px 0; padding: 14px 16px; border: 1px solid var(--line); border-radius: 12px; background: rgba(255,255,255,0.04); }
.retirement-card-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.retirement-title { color: var(--text); font-size: 15px; font-weight: 700; }
.retirement-status { margin-top: 10px; color: var(--blue); font-size: 14px; font-weight: 700; }
.retirement-ready .retirement-status { color: var(--green); }
.retirement-blocked { border-color: rgba(239,107,107,0.4); background: rgba(239,107,107,0.08); }
.retirement-blocked .retirement-status, .retirement-blocked .retirement-title { color: var(--warn); }
.retirement-reason { margin-top: 8px; color: var(--warn); font-size: 13px; }
.retirement-note, .retirement-meta { margin-top: 5px; color: var(--muted); font-size: 12px; line-height: 1.5; }
.retirement-meta { display: flex; flex-wrap: wrap; gap: 12px; }
.retirement-reasons { margin: 8px 0 0; padding-left: 20px; color: var(--muted); font-size: 13px; line-height: 1.6; }
.diagnostic-toggle { display: flex; justify-content: space-between; gap: 16px; width: 100%; margin: 0; padding: 12px 0; color: var(--muted); background: transparent; font-size: 13px; line-height: 1.5; text-align: left; }
.diagnostic-toggle::after, .diagnostic-link::after { border: 0; }
.diagnostic-links { display: flex; flex-wrap: wrap; gap: 8px; padding: 8px 0 0; }
.diagnostic-console { margin-top: 14px; }
.diagnostic-link { margin: 0; padding: 9px 14px; color: var(--muted); background: transparent; border: 1px solid var(--line); border-radius: 8px; font-size: 13px; line-height: 1.5; }

/* ───── 全局变量 ───── */
.theme-wrapper {
  --bg: #0f1824;
  --card: #121f2d;
  --line: #253d55;
  --text: #d5e4f1;
  --muted: #7a9ab0;
  --green: #17b27a;
  --blue: #4b84f4;
  --purple: #9b73f5;
  --orange: #f5a623;
  --cyan: #29c4d0;
  --warn: #ef6b6b;
  min-height: 100vh;
  background:
    radial-gradient(1000px 500px at 80% -5%, rgba(75, 132, 244, 0.18), transparent 58%),
    radial-gradient(900px 460px at -15% 20%, rgba(23, 178, 122, 0.14), transparent 56%),
    linear-gradient(160deg, #0d1620, #0f1c2c);
  color: var(--text);
  font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  padding: 16px;
}

.theme-wrapper.light-theme {
  --bg: #f4fbf7;
  --card: #ffffff;
  --line: #d8eae3;
  --text: #15232d;
  --muted: #5e7d8c;
  --green: #0ea56b;
  --blue: #2d66ea;
  --purple: #7c50e8;
  --orange: #d4830a;
  --cyan: #1aabb8;
  --warn: #d94848;
  background:
    radial-gradient(1000px 500px at 80% -5%, rgba(45, 102, 234, 0.12), transparent 58%),
    radial-gradient(900px 460px at -15% 20%, rgba(14, 165, 107, 0.14), transparent 56%),
    linear-gradient(160deg, #f5fff8, #eaf5ff);
}

/* #ifdef H5 */
* { box-sizing: border-box; }
/* #endif */
/* #ifndef H5 */
page, view, text, scroll-view, swiper, button, form, input, textarea, label, navigator, image {
  box-sizing: border-box;
}
/* #endif */

/* ───── 页面容器 ───── */
.wrap {
  width: min(920px, 100%);
  margin: 0 auto;
  display: grid;
  gap: 12px;
}

/* ───── 顶部栏 ───── */
.topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.topbar-title-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.page-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  background: linear-gradient(135deg, var(--blue), var(--purple));
  color: #fff;
  width: fit-content;
  margin-bottom: 2px;
}

.title {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.3px;
}

.sub {
  color: var(--muted);
  font-size: 13px;
}

.topbar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

/* ───── 按钮通用 ───── */
.btn {
  border: 0;
  border-radius: 10px;
  padding: 9px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: transform .15s, box-shadow .15s;
  background: rgba(255,255,255,0.08);
  color: var(--text);
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.theme-wrapper.light-theme .btn {
  background: rgba(0,0,0,0.05);
  color: #233a50;
}

.btn:active { transform: scale(0.97); }

.btn-icon {
  font-size: 15px;
  font-weight: 400;
  line-height: 1;
}

.icon-btn { background: rgba(255,255,255,0.06); }

.btn-refresh {
  background: linear-gradient(135deg, #1a3a6a, #2354a8);
  color: #fff;
}
.theme-wrapper.light-theme .btn-refresh {
  background: linear-gradient(135deg, var(--blue), #5591ff);
}

.btn-chat {
  background: rgba(151, 115, 245, 0.18);
  color: var(--purple);
  border: 1px solid rgba(151,115,245,0.3);
}
.theme-wrapper.light-theme .btn-chat {
  background: rgba(124, 80, 232, 0.1);
  border-color: rgba(124,80,232,0.25);
}

.btn-save {
  background: linear-gradient(135deg, var(--green), #1bcf8e);
  color: #fff;
  box-shadow: 0 6px 20px rgba(23,178,122,0.35);
  padding: 11px 22px;
  font-size: 14px;
}

.btn-reset {
  background: rgba(239,107,107,0.12);
  color: var(--warn);
  border: 1px solid rgba(239,107,107,0.25);
  padding: 11px 18px;
}
.theme-wrapper.light-theme .btn-reset {
  background: rgba(217,72,72,0.08);
  border-color: rgba(217,72,72,0.2);
}

/* ───── 状态横幅 ───── */
.status-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  color: var(--muted);
  transition: .3s;
}
.theme-wrapper.light-theme .status-banner {
  background: rgba(0,0,0,0.04);
  border-color: rgba(0,0,0,0.08);
}
.status-banner.ok {
  background: rgba(23,178,122,0.12);
  border-color: rgba(23,178,122,0.3);
  color: var(--green);
}
.status-banner.err {
  background: rgba(239,107,107,0.12);
  border-color: rgba(239,107,107,0.3);
  color: var(--warn);
}
.status-icon { font-size: 15px; }

/* ───── 卡片 ───── */
.card {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  box-shadow: 0 16px 40px rgba(0,0,0,0.3);
  border-radius: 18px;
  backdrop-filter: blur(12px);
  overflow: hidden;
}

.theme-wrapper.light-theme .card {
  background: rgba(255,255,255,0.92);
  border: 1px solid rgba(200,220,235,0.8);
  box-shadow: 0 8px 32px rgba(21,35,45,0.08);
}

.card-h {
  padding: 16px 20px;
  border-bottom: 1px solid var(--line);
  font-weight: 700;
  font-size: 15px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  background: rgba(255,255,255,0.03);
}
.theme-wrapper.light-theme .card-h {
  background: rgba(0,0,0,0.02);
}

.card-h-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-icon { font-size: 17px; }

/* AI 状态徽章 */
.ai-badge {
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}
.badge-on {
  background: rgba(23,178,122,0.18);
  color: var(--green);
  border: 1px solid rgba(23,178,122,0.35);
}
.badge-off {
  background: rgba(239,107,107,0.12);
  color: var(--warn);
  border: 1px solid rgba(239,107,107,0.3);
}

.card-b {
  padding: 10px 20px 14px;
  display: grid;
  gap: 0;
}

/* ───── 行 ───── */
.row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 9px 0;
  min-height: 44px;
  transition: opacity .2s;
}

.row-muted { opacity: 0.45; pointer-events: none; }

.row-label-group {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.row-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-top: 6px;
  flex-shrink: 0;
}
.dot-green  { background: var(--green);  box-shadow: 0 0 6px var(--green); }
.dot-blue   { background: var(--blue);   box-shadow: 0 0 6px var(--blue); }
.dot-purple { background: var(--purple); box-shadow: 0 0 6px var(--purple); }
.dot-orange { background: var(--orange); box-shadow: 0 0 6px var(--orange); }
.dot-cyan   { background: var(--cyan);   box-shadow: 0 0 6px var(--cyan); }

.label {
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 7px;
}

.badge-range {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 5px;
  background: rgba(255,255,255,0.08);
  color: var(--muted);
}
.theme-wrapper.light-theme .badge-range {
  background: rgba(0,0,0,0.06);
}

.desc {
  color: var(--muted);
  font-size: 12px;
  margin-top: 3px;
  line-height: 1.5;
}

.divider {
  height: 1px;
  background: var(--line);
  opacity: 0.5;
  margin: 1px 0;
}

/* ───── Switch ───── */
.switch-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.switch-label {
  font-size: 12px;
  font-weight: 600;
  min-width: 28px;
  text-align: right;
}
.sw-on  { color: var(--green); }
.sw-off { color: var(--muted); }

/* ───── Input ───── */
.input {
  display: block;
  width: 200px;
  height: 38px;
  line-height: 38px;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px;
  padding: 0 12px;
  font-size: 14px;
  background: rgba(255,255,255,0.06);
  outline: none;
  color: var(--text);
}

.theme-wrapper.light-theme .input {
  border: 1px solid #c8dce8;
  background: #f7fbfe;
  color: var(--text);
}

/* ───── Picker ───── */
.picker-wrap { width: 200px; }

.picker-display {
  width: 100%;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 13px;
  background: rgba(255,255,255,0.06);
  color: var(--text);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.theme-wrapper.light-theme .picker-display {
  border: 1px solid #c8dce8;
  background: #f7fbfe;
}

.picker-arrow {
  color: var(--muted);
  font-size: 16px;
}

/* ───── 操作区 ───── */
.action-bar {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  padding-top: 8px;
  margin-top: 4px;
  border-top: 1px solid var(--line);
}

/* ───── 响应式 ───── */
@media (max-width: 760px) {
  .theme-wrapper { padding: 10px; }

  /* topbar：标题行 + 按钮行，两行布局 */
  .topbar { flex-direction: column; align-items: flex-start; gap: 8px; }
  .topbar-title-group { gap: 2px; }
  .title { font-size: 18px; }
  .sub { display: none; }
  .page-badge { display: none; }
  .topbar-actions { gap: 6px; flex-wrap: nowrap; width: 100%; overflow-x: auto; }
  .btn { padding: 7px 10px; font-size: 12px; white-space: nowrap; flex-shrink: 0; }

  /* 行：保持横向，标签左控件右；隐藏 desc */
  .row { padding: 7px 0; min-height: 36px; gap: 8px; }
  .desc { display: none; }
  .row-dot { margin-top: 4px; }
  .label { font-size: 13px; }

  /* 控件宽度适配 */
  .input { width: 130px; height: 34px; font-size: 13px; }
  .picker-wrap { width: 130px; }
  .picker-display { padding: 7px 10px; font-size: 12px; }

  /* 卡片内边距 */
  .card-b { padding: 8px 14px 10px; }
  .card-h { padding: 10px 14px; font-size: 14px; }

  .wrap { gap: 8px; }
  .action-bar { padding-top: 6px; }
  .btn-save, .btn-reset { padding: 9px 14px; font-size: 13px; }
}
</style>
