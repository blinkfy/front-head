<template>
  <view class="api-test-page">
    <view v-if="accessState === 'checking'" class="access-state">
      <view class="state-orbit"></view>
      <text>正在验证管理员权限…</text>
    </view>

    <view v-else-if="accessState === 'denied'" class="access-state access-state--denied">
      <view class="denied-mark">!</view>
      <text class="access-title">无法访问 API 测试台</text>
      <text class="access-copy">此页面仅向管理员开放，请重新登录后再试。</text>
      <view class="access-back" role="button" @tap="goBack">返回</view>
    </view>

    <template v-else>
      <view class="topbar">
        <view class="topbar-leading">
          <view class="back-control" role="button" aria-label="返回" @tap="goBack">
            <text>‹</text>
          </view>
          <view>
            <text class="page-title">API 测试</text>
            <text class="page-subtitle">管理员接口验证</text>
          </view>
        </view>
        <view class="topbar-actions">
          <view class="admin-state">
            <view class="admin-state-dot"></view>
            <text>{{ adminName }}</text>
          </view>
          <view class="refresh-control" role="button" :class="{ disabled: loading }" @tap="runSelectedEndpoint">
            <text class="refresh-symbol" :class="{ spinning: loading }">↻</text>
            <text>{{ loading ? '请求中' : '重新请求' }}</text>
          </view>
        </view>
      </view>

      <view class="workspace">
        <view class="endpoint-rail">
          <view class="rail-heading">
            <text class="rail-title">精选接口库</text>
            <text class="rail-caption">覆盖 6 个模块 · 19 项只读验证</text>
          </view>
          <view class="module-tabs" aria-label="接口模块筛选">
            <view
              v-for="module in moduleTabs"
              :key="module.id"
              class="module-tab"
              :class="{ active: activeModuleId === module.id }"
              role="button"
              @tap="activeModuleId = module.id"
            >{{ module.label }}</view>
          </view>
          <view v-for="group in endpointGroups" :key="group.id" class="endpoint-group">
            <text class="endpoint-group__title">{{ group.label }}</text>
            <view
              v-for="endpoint in group.items"
              :key="endpoint.id"
              class="endpoint-item"
              :class="{ active: endpoint.id === selectedEndpointId }"
              role="button"
              @tap="selectEndpoint(endpoint.id)"
            >
              <view class="endpoint-item__accent"></view>
              <view class="endpoint-item__content">
                <text class="endpoint-item__title">{{ endpoint.title }}</text>
                <text class="endpoint-item__desc">{{ endpoint.description }}</text>
              </view>
              <text class="endpoint-item__method">{{ endpoint.method }}</text>
            </view>
          </view>

          <view class="rail-note">
            <text class="rail-note__title">只测关键链路，不堆接口</text>
            <text class="rail-note__copy">覆盖平台、清运、社区、AI、用户服务和数字孪生；全部为 GET，不会改动业务数据。</text>
          </view>
        </view>

        <view class="main-stage">
          <view class="request-panel panel">
            <view class="panel-heading">
              <view>
                <text class="panel-title">{{ selectedEndpoint.title }}</text>
                <text class="panel-copy">{{ selectedEndpoint.detail }}</text>
              </view>
              <view class="safe-tag">只读验证</view>
            </view>

            <view class="route-line">
              <text class="method-tag">{{ selectedEndpoint.method }}</text>
              <text class="route-text">{{ requestPath }}</text>
              <view class="route-copy" role="button" @tap="copyText(requestPath)">复制</view>
            </view>

            <view class="request-form">
              <view v-if="selectedEndpoint.fields.length" class="form-label-row">
                <text class="section-label">查询参数</text>
                <text class="section-hint">仅发送有填写的参数</text>
              </view>
              <view v-if="selectedEndpoint.fields.length" class="field-list">
                <view v-for="field in selectedEndpoint.fields" :key="field.key" class="request-field">
                  <text class="field-label">{{ field.label }}</text>
                  <input
                    class="field-input"
                    :type="field.type || 'text'"
                    :value="draftParams[field.key]"
                    :placeholder="field.placeholder"
                    @input="updateParam(field.key, $event)"
                  />
                </view>
              </view>
              <view v-else class="empty-params">
                <view class="empty-params__dot"></view>
                <text>此接口不需要额外参数，可直接验证当前运行状态。</text>
              </view>
            </view>

            <view class="request-footer">
              <text class="request-footnote">所有测试均使用当前管理员会话，并由服务端二次鉴权。</text>
              <view class="send-button" role="button" :class="{ loading }" @tap="runSelectedEndpoint">
                <text>{{ loading ? '正在发送…' : '发送请求' }}</text>
                <text class="send-arrow">→</text>
              </view>
            </view>
          </view>

          <view class="response-panel panel">
            <view class="panel-heading response-heading">
              <view>
                <text class="panel-title">响应结果</text>
                <text class="panel-copy">{{ responseMessage }}</text>
              </view>
              <view :class="['response-status', responseTone]">
                <text>{{ responseStatus }}</text>
              </view>
            </view>

            <view class="response-meta">
              <view class="meta-cell">
                <text class="meta-label">耗时</text>
                <text class="meta-value">{{ durationLabel }}</text>
              </view>
              <view class="meta-cell">
                <text class="meta-label">测试时间</text>
                <text class="meta-value">{{ testedAtLabel }}</text>
              </view>
              <view class="meta-cell">
                <text class="meta-label">响应字段</text>
                <text class="meta-value">{{ responseFieldCount }}</text>
              </view>
            </view>

            <view class="summary-list">
              <view v-for="item in responseSummary" :key="item.label" class="summary-item">
                <text class="summary-label">{{ item.label }}</text>
                <text class="summary-value">{{ item.value }}</text>
              </view>
            </view>

            <view class="code-toolbar">
              <text class="section-label">响应体</text>
              <view class="code-toolbar__actions">
                <view class="toolbar-action" role="button" @tap="copyText(responseText)">复制 JSON</view>
                <view class="toolbar-action" role="button" @tap="clearResponse">清空</view>
              </view>
            </view>
            <scroll-view class="response-code" scroll-y :scroll-top="responseScrollTop">
              <text selectable class="response-code__content">{{ responseText }}</text>
            </scroll-view>
          </view>
        </view>
      </view>

      <view class="history-panel panel">
        <view class="history-heading">
          <view>
            <text class="panel-title">最近测试</text>
            <text class="panel-copy">仅保留本次打开期间的请求记录</text>
          </view>
          <view class="clear-history" role="button" @tap="clearHistory">清空历史</view>
        </view>
        <view v-if="history.length" class="history-table">
          <view class="history-row history-row--head">
            <text>时间</text>
            <text>接口</text>
            <text>状态</text>
            <text>耗时</text>
            <text>操作</text>
          </view>
          <view v-for="item in history" :key="item.id" class="history-row">
            <text class="history-time">{{ item.time }}</text>
            <view class="history-route">
              <text :class="['history-method', item.method.toLowerCase()]">{{ item.method }}</text>
              <text>{{ item.path }}</text>
            </view>
            <text :class="['history-status', item.tone]">{{ item.status }}</text>
            <text>{{ item.duration }} ms</text>
            <view class="history-view" role="button" @tap="restoreHistoryItem(item)">查看</view>
          </view>
        </view>
        <view v-else class="history-empty">尚未发送测试请求。选择一个接口后点击“发送请求”。</view>
      </view>
    </template>
  </view>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import request from '@/api/index'
import { userinfo } from '@/api/user'

const endpointCatalog = [
  {
    id: 'database',
    module: 'platform',
    title: '数据库结构与统计',
    description: '核验模型目录、表数量与管理端数据源。',
    detail: '确认当前 Sequelize 模型注册表、统计计数和字段结构能够被管理端读取。',
    method: 'GET',
    path: '/api/admin/database/stats',
    fields: []
  },
  {
    id: 'users',
    module: 'platform',
    title: '账号与权限目录',
    description: '读取管理员可见的用户分页及角色信息。',
    detail: '核验账号管理模块的列表、分页和关联社区信息是否可正常读取。',
    method: 'GET',
    path: '/api/admin/users',
    fields: [
      { key: 'page', label: '页码', type: 'number', placeholder: '1', defaultValue: '1' },
      { key: 'pageSize', label: '每页数量', type: 'number', placeholder: '10', defaultValue: '10' }
    ]
  },
  {
    id: 'aiSettings',
    module: 'platform',
    title: 'AI 服务配置',
    description: '读取当前模型、开关与服务配置。',
    detail: '验证管理员侧 AI 配置读取链路；仅展示配置，不会提交或覆盖设置。',
    method: 'GET',
    path: '/api/admin/ai-settings',
    fields: []
  },
  {
    id: 'devices',
    module: 'collection',
    title: '设备运营数据',
    description: '读取设备状态、审核状态与分页结果。',
    detail: '验证当前 Device / Devices 设计及设备运营数据的管理接口。',
    method: 'GET',
    path: '/api/admin/devices',
    fields: [
      { key: 'page', label: '页码', type: 'number', placeholder: '1', defaultValue: '1' },
      { key: 'pageSize', label: '每页数量', type: 'number', placeholder: '20', defaultValue: '20' }
    ]
  },
  {
    id: 'planning',
    module: 'collection',
    title: '清运态势快照',
    description: '读取桶位、任务、服务点与实时运行状态。',
    detail: '验证大屏首屏快照接口；路线规划不在此请求中执行。',
    method: 'GET',
    path: '/api/planning/dashboard-snapshot',
    fields: [
      { key: 'routeStrategy', label: '调度策略', placeholder: 'nearest', defaultValue: 'nearest' }
    ]
  },
  {
    id: 'servicePoints',
    module: 'collection',
    title: '服务点位状态',
    description: '读取服务点与当前设备绑定状态。',
    detail: '验证清运调度中服务点位、设备归属和点位状态的实时读取链路。',
    method: 'GET',
    path: '/api/planning/points',
    fields: []
  },
  {
    id: 'operationTasks',
    module: 'collection',
    title: '调度任务队列',
    description: '读取最近的派单、补位与返航任务。',
    detail: '验证调度任务状态的查询能力，不执行开始、暂停或完成等任务操作。',
    method: 'GET',
    path: '/api/planning/tasks',
    fields: [
      { key: 'limit', label: '返回数量', type: 'number', placeholder: '12', defaultValue: '12' }
    ]
  },
  {
    id: 'faultEvents',
    module: 'collection',
    title: '风险与故障事件',
    description: '读取监测到的风险预警和处置状态。',
    detail: '验证大屏风险预警数据源；仅查询故障事件，不发送处置动作。',
    method: 'GET',
    path: '/api/planning/fault-events',
    fields: [
      { key: 'limit', label: '返回数量', type: 'number', placeholder: '12', defaultValue: '12' }
    ]
  },
  {
    id: 'sortingCenter',
    module: 'collection',
    title: '分拣中心进度',
    description: '读取中心内任务、事件与最新进度。',
    detail: '验证分拣中心状态聚合接口；默认检查主分拣中心，不会记录新的中心事件。',
    method: 'GET',
    path: '/api/sorting-centers/center-main/status',
    fields: []
  },
  {
    id: 'community',
    module: 'community',
    title: '社区治理概览',
    description: '读取指定周期内的社区治理核心指标。',
    detail: '验证社区统计聚合链路，默认查询最近 30 天数据。',
    method: 'GET',
    path: '/api/admin/community/overview',
    fields: [
      { key: 'days', label: '统计天数', type: 'number', placeholder: '30', defaultValue: '30' },
      { key: 'district', label: '区域筛选', placeholder: '可选，例如 市南区', defaultValue: '' }
    ]
  },
  {
    id: 'communityTrend',
    module: 'community',
    title: '社区治理趋势',
    description: '读取治理指标的时间趋势与变化。',
    detail: '验证社区大屏的趋势聚合数据，默认读取最近 30 天。',
    method: 'GET',
    path: '/api/admin/community/trend',
    fields: [
      { key: 'days', label: '统计天数', type: 'number', placeholder: '30', defaultValue: '30' },
      { key: 'district', label: '区域筛选', placeholder: '可选，例如 市南区', defaultValue: '' }
    ]
  },
  {
    id: 'knowledgeGraph',
    module: 'ai',
    title: '知识图谱统计',
    description: '读取 AI 知识库节点、边和构建状态。',
    detail: '验证 AI 问答背后的知识图谱服务是否可用；不会生成、清空或写入图谱。',
    method: 'GET',
    path: '/api/ai/kg/stats',
    fields: []
  },
  {
    id: 'recognitionHistory',
    module: 'ai',
    title: '识别历史抽样',
    description: '读取当前管理员会话的识别记录。',
    detail: '验证垃圾识别结果的历史读取与分页链路，不会删除任何识别记录。',
    method: 'GET',
    path: '/api/history',
    fields: [
      { key: 'page', label: '页码', type: 'number', placeholder: '1', defaultValue: '1' },
      { key: 'pageSize', label: '每页数量', type: 'number', placeholder: '10', defaultValue: '10' }
    ]
  },
  {
    id: 'bookingOrders',
    module: 'services',
    title: '回收预约订单',
    description: '读取当前会话的预约订单列表。',
    detail: '验证预约回收服务的列表与筛选链路，不创建、取消或变更订单。',
    method: 'GET',
    path: '/api/booking/list',
    fields: [
      { key: 'page', label: '页码', type: 'number', placeholder: '1', defaultValue: '1' },
      { key: 'limit', label: '每页数量', type: 'number', placeholder: '10', defaultValue: '10' },
      { key: 'status', label: '订单状态', placeholder: 'all', defaultValue: 'all' }
    ]
  },
  {
    id: 'shopRecords',
    module: 'services',
    title: '积分商城兑换记录',
    description: '读取当前会话的积分兑换历史。',
    detail: '验证积分商城兑换记录的分页链路，不会发起兑换或扣减积分。',
    method: 'GET',
    path: '/api/shop/purchase-records',
    fields: [
      { key: 'page', label: '页码', type: 'number', placeholder: '1', defaultValue: '1' },
      { key: 'pageSize', label: '每页数量', type: 'number', placeholder: '10', defaultValue: '10' }
    ]
  },
  {
    id: 'challengeRanking',
    module: 'services',
    title: '低碳挑战排行',
    description: '读取社区挑战积分排名。',
    detail: '验证挑战与积分模块的社区排行聚合数据，不提交答题或写入积分。',
    method: 'GET',
    path: '/api/challenge/community-ranking',
    fields: []
  },
  {
    id: 'lotteryConfig',
    module: 'services',
    title: '积分抽奖配置',
    description: '读取奖品池与抽奖基础配置。',
    detail: '验证积分激励模块的配置读取能力，不会触发抽奖或消耗积分。',
    method: 'GET',
    path: '/api/lottery/config',
    fields: []
  },
  {
    id: 'digitalTwin',
    module: 'twin',
    title: '数字孪生状态',
    description: '读取公园垃圾分类仿真的当前状态快照。',
    detail: '验证数字孪生服务的只读状态接口，不会写入或推进仿真。',
    method: 'GET',
    path: '/api/digital-twin/simulation/state',
    fields: []
  },
  {
    id: 'twinReplay',
    module: 'twin',
    title: '数字孪生回放包',
    description: '读取当前场景的回放事件与图层配置。',
    detail: '验证回放数据包、场景配置和事件序列的读取能力，不会改变仿真进度。',
    method: 'GET',
    path: '/api/digital-twin/park-replay',
    fields: [
      { key: 'scene', label: '回放场景', placeholder: 'baseline', defaultValue: 'baseline' },
      { key: 'mode', label: '回放模式', placeholder: 'sim', defaultValue: 'sim' }
    ]
  }
]

const moduleTabs = [
  { id: 'all', label: '全部' },
  { id: 'platform', label: '平台' },
  { id: 'collection', label: '清运' },
  { id: 'community', label: '社区' },
  { id: 'ai', label: 'AI' },
  { id: 'services', label: '服务' },
  { id: 'twin', label: '孪生' }
]

const moduleLabels = {
  platform: '平台管理',
  collection: '智能清运',
  community: '社区治理',
  ai: 'AI 与识别',
  services: '用户服务',
  twin: '数字孪生'
}

const accessState = ref('checking')
const adminName = ref('管理员会话')
const selectedEndpointId = ref('database')
const activeModuleId = ref('all')
const draftParams = ref({})
const loading = ref(false)
const response = ref(null)
const responseError = ref(null)
const responseDuration = ref(null)
const testedAt = ref(null)
const history = ref([])
const responseScrollTop = ref(0)

const selectedEndpoint = computed(() => (
  endpointCatalog.find(item => item.id === selectedEndpointId.value) || endpointCatalog[0]
))

const endpointGroups = computed(() => {
  const allowedModules = activeModuleId.value === 'all'
    ? Object.keys(moduleLabels)
    : [activeModuleId.value]

  return allowedModules
    .map(id => ({
      id,
      label: moduleLabels[id],
      items: endpointCatalog.filter(item => item.module === id)
    }))
    .filter(group => group.items.length)
})

const requestPath = computed(() => {
  const query = toQueryString(normalizedParams())
  return query ? `${selectedEndpoint.value.path}?${query}` : selectedEndpoint.value.path
})

const responsePayload = computed(() => {
  if (responseError.value) return responseError.value
  return response.value
})

const responseText = computed(() => {
  if (!responsePayload.value) return '选择一个接口并发送请求后，响应 JSON 会显示在这里。'
  try {
    return JSON.stringify(responsePayload.value, null, 2)
  } catch (_) {
    return String(responsePayload.value)
  }
})

const responseStatus = computed(() => {
  if (loading.value) return '请求中'
  if (responseError.value) return responseError.value.statusCode || responseError.value.code || '失败'
  if (response.value) return isSuccessfulResponse(response.value) ? '200' : (response.value.code || '完成')
  return '待测试'
})

const responseTone = computed(() => {
  if (loading.value) return 'response-status--loading'
  if (responseError.value) return 'response-status--error'
  if (response.value) return 'response-status--success'
  return 'response-status--idle'
})

const responseMessage = computed(() => {
  if (loading.value) return '正在等待服务端响应…'
  if (responseError.value) return responseError.value.msg || responseError.value.message || '请求未完成'
  if (response.value) return response.value.msg || '请求完成，已解析响应数据。'
  return '尚未执行请求'
})

const durationLabel = computed(() => responseDuration.value === null ? '—' : `${responseDuration.value} ms`)
const testedAtLabel = computed(() => testedAt.value ? formatTime(testedAt.value) : '—')
const responseFieldCount = computed(() => {
  const payload = responsePayload.value
  if (!payload || typeof payload !== 'object') return '—'
  return `${Object.keys(payload).length} 项`
})

const responseSummary = computed(() => buildSummary(responsePayload.value, selectedEndpoint.value.id))

function defaultParams(endpoint) {
  return endpoint.fields.reduce((result, field) => {
    result[field.key] = field.defaultValue || ''
    return result
  }, {})
}

function selectEndpoint(id) {
  if (loading.value) return
  const endpoint = endpointCatalog.find(item => item.id === id)
  if (!endpoint) return
  selectedEndpointId.value = id
  draftParams.value = defaultParams(endpoint)
  clearResponse()
}

function updateParam(key, event) {
  draftParams.value = { ...draftParams.value, [key]: event?.detail?.value ?? '' }
}

function normalizedParams() {
  return Object.entries(draftParams.value || {}).reduce((result, [key, value]) => {
    const trimmed = String(value ?? '').trim()
    if (trimmed) result[key] = trimmed
    return result
  }, {})
}

function toQueryString(params) {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
}

async function runSelectedEndpoint() {
  if (loading.value) return
  const endpoint = selectedEndpoint.value
  loading.value = true
  response.value = null
  responseError.value = null
  responseDuration.value = null
  testedAt.value = new Date()
  const startedAt = Date.now()

  try {
    const result = await request({
      url: endpoint.path,
      method: endpoint.method,
      data: normalizedParams(),
      needAuth: true
    })
    response.value = result
    responseDuration.value = Date.now() - startedAt
    appendHistory({ endpoint, result, duration: responseDuration.value, tone: 'success', status: '成功' })
  } catch (error) {
    responseDuration.value = Date.now() - startedAt
    responseError.value = normalizeError(error)
    appendHistory({ endpoint, result: responseError.value, duration: responseDuration.value, tone: 'error', status: '失败' })
  } finally {
    loading.value = false
    responseScrollTop.value += 1
  }
}

function normalizeError(error) {
  if (error?.payload && typeof error.payload === 'object') return error.payload
  if (error && typeof error === 'object') {
    return {
      code: error.code || error.statusCode || error.response?.status || 'ERROR',
      statusCode: error.statusCode || error.response?.status,
      msg: error.msg || error.message || '请求失败',
      detail: error.data || error.errMsg || null
    }
  }
  return { code: 'ERROR', msg: String(error || '请求失败') }
}

function appendHistory({ endpoint, result, duration, tone, status }) {
  history.value = [
    {
      id: `${Date.now()}-${endpoint.id}`,
      endpointId: endpoint.id,
      method: endpoint.method,
      path: endpoint.path,
      time: formatTime(new Date()),
      duration,
      tone,
      status,
      result
    },
    ...history.value
  ].slice(0, 6)
}

function restoreHistoryItem(item) {
  selectEndpoint(item.endpointId)
  response.value = item.tone === 'success' ? item.result : null
  responseError.value = item.tone === 'error' ? item.result : null
  responseDuration.value = item.duration
  testedAt.value = new Date()
  responseScrollTop.value += 1
}

function clearResponse() {
  response.value = null
  responseError.value = null
  responseDuration.value = null
  testedAt.value = null
  responseScrollTop.value += 1
}

function clearHistory() {
  history.value = []
}

function isSuccessfulResponse(payload) {
  return !!payload && (payload.code === 0 || payload.success === true || payload.status === 'ok')
}

function countItems(data, keys = []) {
  if (Array.isArray(data)) return data.length
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key].length
  }
  return 0
}

function buildSummary(payload, endpointId) {
  if (!payload) {
    return [
      { label: '请求状态', value: '等待发送' },
      { label: '接口类型', value: '只读 GET' },
      { label: '写入影响', value: '无' }
    ]
  }

  if (!isSuccessfulResponse(payload)) {
    return [
      { label: '结果', value: '请求失败' },
      { label: '错误码', value: String(payload.code || payload.statusCode || payload.error || '—') },
      { label: '说明', value: payload.msg || payload.error || '请检查服务状态' }
    ]
  }

  const data = payload.data && typeof payload.data === 'object' ? payload.data : {}
  const summaries = {
    database: [
      { label: '数据表', value: `${Array.isArray(data.tables) ? data.tables.length : 0} 张` },
      { label: '用户记录', value: String(data.usersCount ?? '—') },
      { label: '设备记录', value: String(data.binsCount ?? '—') }
    ],
    users: [
      { label: '当前页记录', value: `${countItems(data, ['list', 'rows'])} 条` },
      { label: '匹配总数', value: String(data.total ?? payload.total ?? '—') },
      { label: '权限范围', value: '管理员' }
    ],
    aiSettings: [
      { label: '配置项', value: `${Object.keys(data).length} 项` },
      { label: '接口权限', value: '管理员' },
      { label: '写入影响', value: '无' }
    ],
    devices: [
      { label: '当前页记录', value: `${Array.isArray(data.list) ? data.list.length : 0} 条` },
      { label: '匹配总数', value: String(data.total ?? '—') },
      { label: '数据源', value: 'Devices' }
    ],
    planning: [
      { label: '桶位', value: `${Array.isArray(data.bins) ? data.bins.length : 0} 个` },
      { label: '服务点', value: `${Array.isArray(data.points) ? data.points.length : 0} 个` },
      { label: '路线', value: data.routePending ? '后台规划' : '已就绪' }
    ],
    servicePoints: [
      { label: '服务点', value: `${countItems(data, ['items'])} 个` },
      { label: '数据字段', value: `${Object.keys(data).length} 项` },
      { label: '写入影响', value: '无' }
    ],
    operationTasks: [
      { label: '调度任务', value: `${countItems(data, ['items'])} 条` },
      { label: '数据字段', value: `${Object.keys(data).length} 项` },
      { label: '操作类型', value: '仅查询' }
    ],
    faultEvents: [
      { label: '风险事件', value: `${countItems(data, ['items'])} 条` },
      { label: '汇总字段', value: `${Object.keys(data.summary || {}).length} 项` },
      { label: '操作类型', value: '仅查询' }
    ],
    sortingCenter: [
      { label: '最新进度', value: `${countItems(data, ['latest'])} 条` },
      { label: '中心事件', value: `${countItems(data, ['events'])} 条` },
      { label: '中心编号', value: String(data.centerId || 'center-main') }
    ],
    community: [
      { label: '统计周期', value: `${data.range?.days || data.days || '—'} 天` },
      { label: '活跃社区', value: String(data.activeCommunities ?? data.summary?.activeCommunities ?? '—') },
      { label: '治理事件', value: String(data.totalEvents ?? data.summary?.totalEvents ?? '—') }
    ],
    communityTrend: [
      { label: '统计周期', value: `${data.range?.days || data.days || '30'} 天` },
      { label: '趋势数据', value: `${countItems(data, ['items', 'series', 'trend'])} 条` },
      { label: '写入影响', value: '无' }
    ],
    knowledgeGraph: [
      { label: '节点数', value: String(data.nodeCount ?? data.nodes ?? '—') },
      { label: '关系数', value: String(data.edgeCount ?? data.edges ?? '—') },
      { label: '服务状态', value: '已响应' }
    ],
    recognitionHistory: [
      { label: '当前页记录', value: `${countItems(data)} 条` },
      { label: '匹配总数', value: String(payload.total ?? data.total ?? '—') },
      { label: '操作类型', value: '仅查询' }
    ],
    bookingOrders: [
      { label: '当前页订单', value: `${countItems(data, ['list', 'items', 'orders'])} 条` },
      { label: '匹配总数', value: String(data.total ?? payload.total ?? '—') },
      { label: '操作类型', value: '仅查询' }
    ],
    shopRecords: [
      { label: '当前页记录', value: `${countItems(data)} 条` },
      { label: '匹配总数', value: String(payload.pagination?.total ?? '—') },
      { label: '操作类型', value: '仅查询' }
    ],
    challengeRanking: [
      { label: '排行榜记录', value: `${countItems(data, ['list', 'items', 'ranking'])} 条` },
      { label: '数据字段', value: `${Object.keys(data).length} 项` },
      { label: '写入影响', value: '无' }
    ],
    lotteryConfig: [
      { label: '奖品配置', value: `${countItems(data, ['prizes', 'items'])} 项` },
      { label: '配置字段', value: `${Object.keys(data).length} 项` },
      { label: '操作类型', value: '不触发抽奖' }
    ],
    digitalTwin: [
      { label: '场景', value: String(data.scene || data.mode || '当前仿真') },
      { label: '状态字段', value: `${Object.keys(data).length} 项` },
      { label: '写入影响', value: '无' }
    ],
    twinReplay: [
      { label: '回放场景', value: String(data.scene || 'baseline') },
      { label: '回放事件', value: `${countItems(data.replay || {}, ['events'])} 条` },
      { label: '回放模式', value: String(data.mode || 'sim') }
    ]
  }
  return summaries[endpointId] || [
    { label: '响应状态', value: '成功' },
    { label: '数据字段', value: `${Object.keys(data).length} 项` },
    { label: '写入影响', value: '无' }
  ]
}

function formatTime(date) {
  const value = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(value.getTime())) return '—'
  const pad = number => String(number).padStart(2, '0')
  return `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
}

function copyText(text) {
  const value = String(text || '')
  if (!value) return
  uni.setClipboardData({ data: value, showToast: false })
  uni.showToast({ title: '已复制', icon: 'success' })
}

function goBack() {
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
  if (pages.length > 1) {
    uni.navigateBack()
    return
  }
  uni.reLaunch({ url: '/pages/index/index' })
}

async function verifyAdminAccess() {
  try {
    const profile = await userinfo('false')
    const user = profile?.data || {}
    if (user.isAdmin !== true) throw new Error('管理员权限不足')
    adminName.value = user.username || '管理员会话'
    accessState.value = 'ready'
  } catch (error) {
    accessState.value = 'denied'
  }
}

onMounted(async () => {
  draftParams.value = defaultParams(selectedEndpoint.value)
  await verifyAdminAccess()
})
</script>

<style scoped>
page,
.api-test-page {
  min-height: 100vh;
  font-family: "PingFang SC", "Microsoft YaHei", "Inter", Arial, sans-serif;
  color: #13233d;
  background: #eef3fa;
}

.api-test-page {
  box-sizing: border-box;
  min-height: 100vh;
  padding: 18px;
}

.topbar,
.workspace,
.history-panel {
  width: min(1520px, 100%);
  margin: 0 auto;
}

.topbar {
  box-sizing: border-box;
  min-height: 72px;
  padding: 0 18px 0 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  background: #ffffff;
  border: 1px solid #dce6f2;
  border-radius: 14px;
  box-shadow: 0 12px 30px rgba(34, 76, 132, 0.07);
}

.topbar-leading,
.topbar-actions,
.admin-state,
.refresh-control,
.panel-heading,
.route-line,
.request-footer,
.response-meta,
.code-toolbar,
.history-heading,
.history-route {
  display: flex;
  align-items: center;
}

.topbar-leading { gap: 14px; min-width: 0; }
.topbar-actions { gap: 12px; }

.back-control {
  width: 46px;
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #385579;
  font-size: 36px;
  font-family: Arial, sans-serif;
  line-height: 1;
  border-radius: 10px;
  cursor: pointer;
  transition: background .18s ease, color .18s ease;
}

.back-control:active { color: #1768d3; background: #edf5ff; }

.page-title {
  display: block;
  color: #112441;
  font-size: 25px;
  font-weight: 750;
  line-height: 1.15;
  letter-spacing: -.35px;
}

.page-subtitle {
  display: block;
  margin-top: 5px;
  color: #7a8da7;
  font-size: 13px;
  line-height: 1.2;
}

.admin-state {
  gap: 7px;
  color: #60738f;
  font-size: 13px;
  white-space: nowrap;
}

.admin-state-dot,
.empty-params__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #24b88c;
  box-shadow: 0 0 0 4px rgba(36, 184, 140, .12);
}

.refresh-control,
.route-copy,
.toolbar-action,
.clear-history,
.history-view,
.access-back {
  cursor: pointer;
  user-select: none;
}

.refresh-control {
  box-sizing: border-box;
  min-width: 102px;
  height: 38px;
  padding: 0 13px;
  justify-content: center;
  gap: 7px;
  color: #1c5ea8;
  font-size: 13px;
  font-weight: 650;
  border: 1px solid #b9d6f5;
  border-radius: 8px;
  background: #f6fbff;
}

.refresh-control.disabled { opacity: .58; pointer-events: none; }
.refresh-symbol { color: #2479d7; font-size: 17px; line-height: 1; }
.spinning { display: inline-block; animation: spin .8s linear infinite; }

.workspace {
  box-sizing: border-box;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 14px;
  margin-top: 14px;
}

.endpoint-rail,
.panel {
  box-sizing: border-box;
  background: #ffffff;
  border: 1px solid #dce6f2;
  border-radius: 14px;
  box-shadow: 0 10px 28px rgba(34, 76, 132, .055);
}

.endpoint-rail {
  min-height: 640px;
  padding: 18px 12px;
  max-height: calc(100vh - 122px);
  overflow-y: auto;
  position: sticky;
  top: 18px;
  align-self: start;
}

.rail-heading { padding: 1px 10px 15px; }
.rail-title,
.panel-title { display: block; color: #182c49; font-weight: 730; }
.rail-title { font-size: 15px; }
.rail-caption,
.panel-copy { display: block; color: #8091aa; font-size: 12px; line-height: 1.55; }
.rail-caption { margin-top: 4px; }

.module-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 9px 13px;
  border-bottom: 1px solid #edf2f7;
}

.module-tab {
  padding: 5px 8px;
  color: #71849c;
  font-size: 11px;
  line-height: 1;
  border: 1px solid #e0e8f2;
  border-radius: 5px;
  background: #fbfdff;
  cursor: pointer;
  transition: color .18s ease, border-color .18s ease, background .18s ease;
}

.module-tab.active {
  color: #1664c7;
  border-color: #b9d8f8;
  background: #edf5ff;
}

.endpoint-group { margin-top: 13px; }
.endpoint-group__title {
  display: block;
  padding: 0 10px 5px;
  color: #6f849f;
  font-size: 11px;
  font-weight: 720;
  letter-spacing: .3px;
}

.endpoint-item {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 58px;
  margin: 3px 0;
  padding: 10px 9px 10px 15px;
  box-sizing: border-box;
  border-radius: 9px;
  cursor: pointer;
  overflow: hidden;
  transition: background .18s ease, transform .18s ease;
}

.endpoint-item:active { transform: translateX(2px); }
.endpoint-item.active { background: #edf5ff; }
.endpoint-item__accent {
  position: absolute;
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 3px;
  border-radius: 3px;
  background: transparent;
}
.endpoint-item.active .endpoint-item__accent { background: #1d75df; }
.endpoint-item__content { flex: 1; min-width: 0; }
.endpoint-item__title { display: block; color: #254466; font-size: 14px; font-weight: 650; }
.endpoint-item.active .endpoint-item__title { color: #1664c7; }
.endpoint-item__desc { display: block; margin-top: 4px; color: #8293aa; font-size: 11px; line-height: 1.35; }
.endpoint-item__method { padding-left: 8px; color: #20a67b; font-size: 10px; font-weight: 750; }

.rail-note {
  margin: 20px 8px 0;
  padding: 13px;
  border-radius: 10px;
  background: #f6f9fd;
  border: 1px solid #e5edf7;
}
.rail-note__title { display: block; color: #506782; font-size: 12px; font-weight: 650; }
.rail-note__copy { display: block; margin-top: 6px; color: #8291a5; font-size: 11px; line-height: 1.6; }

.endpoint-rail::-webkit-scrollbar { width: 6px; }
.endpoint-rail::-webkit-scrollbar-thumb { border-radius: 6px; background: #c6d9ee; }

.main-stage {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(330px, .9fr) minmax(430px, 1.1fr);
  gap: 14px;
}

.panel { min-width: 0; padding: 22px; }
.request-panel,
.response-panel { min-height: 640px; }
.panel-heading { justify-content: space-between; gap: 16px; }
.panel-title { font-size: 19px; letter-spacing: -.15px; }
.panel-copy { max-width: 420px; margin-top: 6px; }

.safe-tag {
  flex: none;
  padding: 5px 8px;
  color: #188761;
  font-size: 11px;
  border: 1px solid #bcebd9;
  border-radius: 6px;
  background: #f1fbf7;
}

.route-line {
  min-height: 50px;
  margin-top: 24px;
  padding: 0 12px;
  gap: 10px;
  border: 1px solid #dbe6f3;
  border-radius: 8px;
  background: #fbfdff;
}
.method-tag,
.history-method {
  flex: none;
  padding: 4px 7px;
  color: #138b68;
  font-size: 11px;
  font-weight: 760;
  letter-spacing: .2px;
  border-radius: 5px;
  background: #e9faf4;
}
.route-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: #314d70;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 12px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.route-copy,
.toolbar-action,
.clear-history,
.history-view { color: #1c70d2; font-size: 12px; font-weight: 600; white-space: nowrap; }

.request-form { min-height: 260px; margin-top: 24px; }
.form-label-row,
.code-toolbar { display: flex; align-items: center; justify-content: space-between; }
.section-label { color: #45617f; font-size: 13px; font-weight: 690; }
.section-hint { color: #95a4b7; font-size: 11px; }
.field-list { margin-top: 13px; }
.request-field { margin-top: 12px; }
.field-label { display: block; margin-bottom: 6px; color: #647a96; font-size: 12px; }
.field-input {
  box-sizing: border-box;
  width: 100%;
  height: 42px;
  padding: 0 11px;
  color: #263f60;
  font-size: 13px;
  border: 1px solid #dbe5f0;
  border-radius: 7px;
  background: #ffffff;
}
.empty-params { min-height: 126px; display: flex; align-items: center; gap: 11px; color: #7488a2; font-size: 13px; line-height: 1.65; }

.request-footer { justify-content: space-between; gap: 16px; padding-top: 18px; border-top: 1px solid #edf1f6; }
.request-footnote { flex: 1; color: #8a9bb0; font-size: 11px; line-height: 1.55; }
.send-button {
  min-width: 126px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  border-radius: 7px;
  background: #166ee0;
  box-shadow: 0 8px 18px rgba(22, 110, 224, .22);
  cursor: pointer;
  transition: background .18s ease, transform .18s ease;
}
.send-button:active { transform: translateY(1px); background: #0f60c9; }
.send-button.loading { opacity: .72; pointer-events: none; }
.send-arrow { font-size: 17px; line-height: 1; }

.response-status { min-width: 64px; padding: 6px 9px; text-align: center; font-size: 13px; font-weight: 750; border-radius: 6px; }
.response-status--success { color: #188761; background: #eaf9f3; border: 1px solid #c5ebdb; }
.response-status--error { color: #c84b4b; background: #fff1f1; border: 1px solid #f5cccc; }
.response-status--loading { color: #996f14; background: #fff8e9; border: 1px solid #f1dfae; }
.response-status--idle { color: #71849e; background: #f3f6fa; border: 1px solid #e0e8f1; }

.response-meta { margin-top: 22px; padding: 12px 0; border-top: 1px solid #edf1f6; border-bottom: 1px solid #edf1f6; }
.meta-cell { flex: 1; min-width: 0; padding: 0 11px; border-left: 1px solid #e7edf4; }
.meta-cell:first-child { padding-left: 0; border-left: 0; }
.meta-label { display: block; color: #93a1b3; font-size: 11px; }
.meta-value { display: block; margin-top: 5px; color: #405b7c; font-size: 13px; font-weight: 670; white-space: nowrap; }

.summary-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; margin-top: 17px; }
.summary-item { min-width: 0; padding: 10px; border: 1px solid #e1e9f3; border-radius: 8px; background: #fbfdff; }
.summary-label { display: block; overflow: hidden; color: #8a9bb0; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.summary-value { display: block; margin-top: 6px; overflow: hidden; color: #2e4d72; font-size: 14px; font-weight: 720; text-overflow: ellipsis; white-space: nowrap; }

.code-toolbar { margin-top: 20px; }
.code-toolbar__actions { display: flex; gap: 14px; }
.response-code { box-sizing: border-box; height: 288px; margin-top: 10px; padding: 13px; border: 1px solid #dce6f2; border-radius: 8px; background: #f8fbfe; }
.response-code__content { display: block; color: #2d4b6f; font-family: "SFMono-Regular", Consolas, monospace; font-size: 11px; line-height: 1.65; white-space: pre-wrap; word-break: break-word; }

.history-panel { margin-top: 14px; padding: 20px 22px; }
.history-heading { justify-content: space-between; gap: 16px; }
.history-table { margin-top: 16px; overflow: hidden; border: 1px solid #dfe7f1; border-radius: 8px; }
.history-row { display: grid; grid-template-columns: 100px minmax(260px, 1fr) 80px 74px 48px; align-items: center; min-height: 44px; column-gap: 12px; padding: 0 13px; color: #5d718c; font-size: 12px; border-top: 1px solid #edf1f5; }
.history-row--head { min-height: 36px; color: #8191a4; font-size: 11px; font-weight: 650; border-top: 0; background: #f8fafe; }
.history-route { min-width: 0; gap: 8px; }
.history-route text:last-child { overflow: hidden; color: #496583; font-family: "SFMono-Regular", Consolas, monospace; text-overflow: ellipsis; white-space: nowrap; }
.history-method { padding: 3px 5px; font-size: 10px; }
.history-status { font-weight: 680; }
.history-status.success { color: #1f9d76; }
.history-status.error { color: #cd5555; }
.history-empty { margin-top: 16px; padding: 22px; color: #91a0b2; font-size: 13px; text-align: center; border: 1px dashed #d7e1ec; border-radius: 8px; background: #fbfdff; }

.access-state { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 15px; color: #64809f; font-size: 14px; }
.state-orbit { width: 26px; height: 26px; border: 3px solid #d9e8fb; border-top-color: #1b70da; border-radius: 50%; animation: spin .8s linear infinite; }
.access-state--denied { color: #788da6; }
.denied-mark { width: 46px; height: 46px; display: flex; align-items: center; justify-content: center; color: #d05454; font-size: 23px; font-weight: 800; border-radius: 50%; background: #fff1f1; }
.access-title { color: #304c6d; font-size: 19px; font-weight: 730; }
.access-copy { font-size: 13px; }
.access-back { padding: 10px 24px; color: #fff; font-size: 13px; font-weight: 650; border-radius: 7px; background: #1c70d2; }

@keyframes spin { to { transform: rotate(360deg); } }

@media screen and (max-width: 1180px) {
  .main-stage { grid-template-columns: 1fr; }
  .request-panel, .response-panel { min-height: auto; }
  .response-code { height: 250px; }
  .endpoint-rail { max-height: none; position: static; }
}

@media screen and (max-width: 860px) {
  .api-test-page { padding: 10px; }
  .topbar { min-height: 64px; padding-right: 10px; }
  .workspace { grid-template-columns: 1fr; }
  .endpoint-rail { min-height: auto; padding: 10px; }
  .module-tabs { padding-bottom: 10px; }
  .endpoint-group { margin-top: 10px; }
  .endpoint-group__title { padding-left: 7px; }
  .endpoint-item { display: inline-flex; width: calc(50% - 4px); vertical-align: top; margin: 3px 2px; }
  .rail-note { display: none; }
  .history-row { grid-template-columns: 80px minmax(170px, 1fr) 60px 55px; }
  .history-row > :last-child { display: none; }
}

@media screen and (max-width: 600px) {
  .topbar { align-items: flex-start; padding: 10px; }
  .topbar-actions { align-items: flex-end; flex-direction: column; gap: 7px; }
  .admin-state { font-size: 11px; }
  .refresh-control { min-width: 92px; height: 34px; }
  .page-title { font-size: 21px; }
  .workspace { margin-top: 10px; }
  .endpoint-item { display: flex; width: 100%; }
  .panel, .history-panel { padding: 16px; }
  .panel-heading { align-items: flex-start; }
  .route-line { align-items: flex-start; padding: 10px; }
  .route-text { white-space: normal; word-break: break-all; }
  .request-footer { align-items: flex-start; flex-direction: column; }
  .send-button { width: 100%; }
  .summary-list { grid-template-columns: 1fr; }
  .meta-cell { padding: 0 7px; }
  .meta-value { font-size: 11px; }
  .history-table { overflow-x: auto; }
  .history-row { min-width: 530px; }
}
</style>
