<template>
  <view class="screen">

    <!-- ===== 顶部 panel ===== -->
    <view class="panel top">
      <!-- 行1：标题 + 时钟/状态 -->
      <view class="row">
        <view>
          <view class="title">智慧城市社区治理大屏</view>
          <view class="sub">社区使用情况、分类质量与用户积极性监测</view>
        </view>
        <view class="actions meta-actions">
          <view class="clock">{{ clockText }}</view>
          <view :class="['status', statusCls]">{{ statusText }}</view>
        </view>
      </view>
      <!-- 行2：工具栏 + 操作按钮 -->
      <view class="row control-row">
        <view class="toolbar">
          <!-- 周期 picker -->
          <view class="field">
            <text>周期</text>
            <picker mode="selector" :range="daysOptions" range-key="label"
              :value="daysIndex" @change="onDaysChange">
              <view class="picker-val">{{ daysOptions[daysIndex].label }}</view>
            </picker>
          </view>
          <!-- 区 picker -->
          <view class="field">
            <text>区</text>
            <picker mode="selector" :range="districtOptions" range-key="label"
              :value="districtIndex" @change="onDistrictChange">
              <view class="picker-val">{{ districtOptions[districtIndex] && districtOptions[districtIndex].label || '全部区' }}</view>
            </picker>
          </view>
          <!-- 社区 picker -->
          <view class="field">
            <text>社区</text>
            <picker mode="selector" :range="communityOptions" range-key="label"
              :value="communityIndex" @change="onCommunityChange">
              <view class="picker-val">{{ communityOptions[communityIndex] && communityOptions[communityIndex].label || '全部社区' }}</view>
            </picker>
          </view>
        </view>
        <view class="actions main-actions">
          <view class="btn ghost nav-link-btn" @tap="goCollection">🚛 清运大屏</view>
          <view class="btn main" @tap="refreshDashboard">刷新数据</view>
          <view class="btn ok" @tap="syncDaily">重算日汇总</view>
          <view class="btn ghost" @tap="goBack">返回</view>
        </view>
      </view>
      <!-- KPI 卡片 -->
      <view class="cards">
        <view class="card">
          <view class="k">社区总数</view>
          <view class="v">{{ kpi.communities }}</view>
          <view class="m">{{ kpi.communitiesMeta }}</view>
        </view>
        <view class="card">
          <view class="k">活跃社区</view>
          <view class="v">{{ kpi.activeCommunities }}</view>
          <view class="m">{{ kpi.activeCommunitiesMeta }}</view>
        </view>
        <view class="card major">
          <view class="k">活跃用户</view>
          <view class="v">{{ kpi.activeUsers }}</view>
          <view class="m">{{ kpi.activeUsersMeta }}</view>
        </view>
        <view class="card major">
          <view class="k">分类总次数</view>
          <view class="v">{{ kpi.events }}</view>
          <view class="m">{{ kpi.eventsMeta }}</view>
        </view>
        <view class="card">
          <view class="k">低置信度占比</view>
          <view class="v">{{ kpi.lowConf }}</view>
          <view class="m">{{ kpi.lowConfMeta }}</view>
        </view>
        <view class="card">
          <view class="k">平均置信度</view>
          <view class="v">{{ kpi.avgConf }}</view>
          <view class="m">{{ kpi.avgConfMeta }}</view>
        </view>
      </view>
    </view>

    <!-- ===== 主体三列 ===== -->
    <view class="main">

      <!-- 左侧栏 -->
      <view class="col side">
        <!-- 社区排行 -->
        <view class="panel block">
          <view class="block-title">社区积极性排行 <text class="note">按综合积极性分值</text></view>
          <scroll-view class="list" scroll-y>
            <view v-if="!communityRankItems.length" class="empty">暂无社区数据</view>
            <view v-for="(row, idx) in communityRankItems" :key="'cr-'+idx"
              :class="['item', row.toneCls]">
              <view class="top">
                <view class="rank-left">
                  <text :class="['rank-badge', row.badgeCls]">{{ idx + 1 }}</text>
                  <view class="name">{{ row.community }}</view>
                </view>
                <view class="score">{{ row.scoreLabel }}</view>
              </view>
              <view class="score-track"><view class="score-fill" :style="{ width: row.ratio + '%' }"></view></view>
              <view class="sub">
                <text>{{ row.district }}</text>
                <text>活跃 {{ row.activeUsers }}</text>
              </view>
              <view class="sub">
                <text>分类 {{ row.totalEvents }}</text>
                <text>低置信 {{ row.lowConf }}</text>
              </view>
            </view>
          </scroll-view>
        </view>
        <!-- 分类环图 -->
        <view class="panel block">
          <view class="block-title">分类结构环图 <text class="note">垃圾类别占比</text></view>
          <view class="donut-wrap">
            <!-- #ifdef H5 -->
            <svg id="categoryDonutSvg" viewBox="0 0 320 220" preserveAspectRatio="xMidYMid meet"
              v-html="donutSvgHtml" class="donut-svg"></svg>
            <!-- #endif -->
            <!-- #ifndef H5 -->
            <view class="mp-canvas-box donut-canvas-box">
              <canvas canvas-id="donutCanvas" id="donutCanvas" class="mp-canvas" style="width:220px;height:220px;"></canvas>
              <view v-if="!donutEntries.length" class="empty canvas-empty">暂无分类结构数据</view>
            </view>
            <!-- #endif -->
            <view class="donut-legend">
              <view v-if="!donutEntries.length" class="empty">暂无分类结构数据</view>
              <view v-for="(entry, idx) in donutEntries" :key="'dl-'+idx" class="donut-item">
                <view class="donut-key">
                  <view class="donut-color" :style="{ background: entry.color }"></view>
                  <text>{{ entry.name }}</text>
                </view>
                <text class="donut-pct">{{ entry.pct }}%</text>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- 中间栏 -->
      <view class="col mid">
        <!-- 趋势图 -->
        <view class="panel block">
          <view class="block-title">
            趋势监控 <text class="note">活跃 + 风险组合趋势（日）</text>
          </view>
          <view class="chart-wrap">
            <view class="legend">
              <text><view class="dot events"></view>分类次数</text>
              <text><view class="dot active"></view>活跃用户</text>
              <text><view class="dot" style="background:#ffbf57"></view>风险指数</text>
            </view>
            <!-- #ifdef H5 -->
            <svg id="trendSvg" viewBox="0 0 860 300" preserveAspectRatio="none"
              v-html="trendSvgHtml" style="width:100%;height:100%"></svg>
            <!-- #endif -->
            <!-- #ifndef H5 -->
            <view class="mp-canvas-box trend-canvas-box">
              <canvas canvas-id="trendCanvas" id="trendCanvas" class="mp-canvas trend-canvas" :style="trendCanvasStyle"></canvas>
              <view v-if="!trendCanvasData.length" class="empty canvas-empty">暂无趋势数据</view>
            </view>
            <!-- #endif -->
          </view>
        </view>
        <!-- 区级治理 -->
        <view class="panel block">
          <view class="block-title">区级治理能力 <text class="note">雷达评分 + 区级对比</text></view>
          <view class="dual-chart">
            <view class="radar-wrap">
              <!-- #ifdef H5 -->
              <svg id="districtRadarSvg" viewBox="0 0 320 260" preserveAspectRatio="xMidYMid meet"
                v-html="radarSvgHtml" style="width:100%;height:100%"></svg>
              <!-- #endif -->
              <!-- #ifndef H5 -->
              <view class="mp-canvas-box radar-canvas-box">
                <canvas canvas-id="radarCanvas" id="radarCanvas" class="mp-canvas" style="width:220px;height:220px;"></canvas>
                <view v-if="!radarMetrics.length" class="empty canvas-empty">暂无雷达数据</view>
              </view>
              <!-- #endif -->
            </view>
            <scroll-view class="district-grid" scroll-y>
              <view v-if="!districtItems.length" class="empty">暂无区级数据</view>
              <view v-for="(item, idx) in districtItems" :key="'di-'+idx"
                :class="['district', item.toneCls]">
                <view class="name">{{ item.district }}</view>
                <view class="meta">
                  <text>社区活跃 {{ item.communitiesActive }}/{{ item.communitiesTotal }}</text>
                  <text>活跃用户 {{ item.activeUsers }}</text>
                </view>
                <view class="meta">
                  <text>分类 {{ item.totalEvents }}</text>
                  <text>低置信 {{ item.lowConf }}</text>
                </view>
              </view>
            </scroll-view>
          </view>
        </view>
      </view>

      <!-- 右侧栏 -->
      <view class="col side">
        <!-- 社区分类详情 -->
        <view class="panel block">
          <view class="block-title">社区分类详情 <text class="note">Top 12 社区</text></view>
          <scroll-view class="list" scroll-y>
            <view v-if="!communityListItems.length" class="empty">暂无社区明细</view>
            <view v-for="(item, idx) in communityListItems" :key="'cl-'+idx"
              :class="['item', item.toneCls]">
              <view class="top">
                <view class="name">{{ item.community }}</view>
                <view class="score">{{ item.totalEvents }}</view>
              </view>
              <view class="sub">
                <text>{{ item.district }}</text>
                <text>活跃 {{ item.activeUsers }}</text>
              </view>
              <view class="sub">
                <text>{{ item.topCats }}</text>
                <text>低置信 {{ item.lowConf }}</text>
              </view>
            </view>
          </scroll-view>
        </view>
        <!-- 风险预警 -->
        <view class="panel block">
          <view class="block-title">
            风险预警 <text class="note">{{ alertSummary }}</text>
          </view>
          <scroll-view class="alerts" scroll-y>
            <view v-if="!alertItems.length" class="empty">暂无显著异常</view>
            <view v-for="(item, idx) in alertItems" :key="'al-'+idx"
              :class="['alert', item.level]">
              <view class="alert-top">
                <view class="t">{{ item.title }}</view>
                <text class="alert-chip">{{ item.chip }}</text>
              </view>
              <view class="d">{{ item.detail }}</view>
            </view>
          </scroll-view>
        </view>
      </view>

    </view><!-- end .main -->
  </view><!-- end .screen -->
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { baseUrl } from '@/api/settings'
import { applyStoredTheme, bindThemeStorageSync } from '@/utils/theme'
import { describeApiFailure, redirectIfAccessDenied } from './access-guard.js'
import { resolveH5StandalonePath } from '@/utils/h5-route'

// ─── 工具函数 ──────────────────────────────────────────
function getStorage(key) {
  // #ifdef H5
  return localStorage.getItem(key)
  // #endif
  // #ifndef H5
  const result = uni.getStorageSync(key)
  return result || null
  // #endif
}

// ─── 主题 ──────────────────────────────────────────────
const isDark = ref(getStorage('app_theme') !== 'light')

// ─── 定时器管理 ────────────────────────────────────────
const timers = new Set()
function addTimer(id) { timers.add(id); return id }
function clearAllTimers() { timers.forEach(id => clearInterval(id)); timers.clear() }

// ─── 常量 ──────────────────────────────────────────────
const ALERT_META = {
  p1: { label: 'P1', order: 1 },
  p2: { label: 'P2', order: 2 },
  p3: { label: 'P3', order: 3 }
}

// ─── 响应式状态 ────────────────────────────────────────
const clockText = ref('--:--:--')
const statusText = ref('准备就绪')
const statusCls = ref('')

// KPI 卡片数据
const kpi = reactive({
  communities: '0',     communitiesMeta: '--',
  activeCommunities: '0', activeCommunitiesMeta: '--',
  activeUsers: '0',     activeUsersMeta: '去重活跃用户',
  events: '0',          eventsMeta: '--',
  lowConf: '0%',        lowConfMeta: '低于 60% 置信度',
  avgConf: '0%',        avgConfMeta: '全量加权平均'
})

// 筛选器选项
const daysOptions = ref([
  { label: '近7天',   value: '7'  },
  { label: '近30天',  value: '30' },
  { label: '近90天',  value: '90' },
  { label: '近180天', value: '180'}
])
const daysIndex    = ref(1)  // 默认 30天
const districtOptions = ref([{ label: '全部区', value: '' }])
const districtIndex   = ref(0)
const communityOptions = ref([{ label: '全部社区', value: '' }])
const communityIndex   = ref(0)

// 渲染数据（替代 innerHTML）
const communityRankItems = ref([])   // 社区排行
const donutSvgHtml       = ref('')   // H5 环图 SVG innerHTML
const donutEntries       = ref([])   // 非H5 环图列表
const trendSvgHtml       = ref('')   // H5 趋势图 SVG innerHTML
const trendRows          = ref([])   // 非H5 趋势简表
const trendCanvasData    = ref([])   // 非H5 canvas 趋势原始数据
const radarSvgHtml       = ref('')   // H5 雷达图 SVG innerHTML
const radarMetrics       = ref([])   // 非H5 雷达图指标数据
const districtItems      = ref([])   // 区级数据列表
const communityListItems = ref([])   // 社区详情列表
const alertItems         = ref([])   // 风险预警列表
const alertSummary       = ref('P1 0 | P2 0 | P3 0')

// 非H5：趋势图 canvas 宽度（px），在 onMounted 时获取屏幕宽度后赋值
// #ifndef H5
const trendCanvasW = ref(320)
const trendCanvasStyle = computed(() => `width:${trendCanvasW.value}px;height:200px;`)
// #endif

// 内部状态
const _state = reactive({
  options: [],
  districts: [],
  loading: false,
  lastOverview: null,
  lastBreakdown: null,
  lastTrend: null
})

// ─── 筛选器事件 ────────────────────────────────────────
function onDaysChange(e) {
  daysIndex.value = Number(e.detail.value)
  refreshDashboard()
}
function onDistrictChange(e) {
  districtIndex.value = Number(e.detail.value)
  // 联动更新社区列表
  communityOptions.value = buildCommunityOptions()
  communityIndex.value = 0
  refreshDashboard()
}
function onCommunityChange(e) {
  communityIndex.value = Number(e.detail.value)
  refreshDashboard()
}

// ─── 辅助工具 ──────────────────────────────────────────
function n(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}
function fmtPercent(value, digits = 1) {
  return `${n(value, 0).toFixed(digits)}%`
}
function fmtNumber(value) {
  return n(value, 0).toLocaleString('zh-CN')
}
function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
function districtToneClass(district) {
  const s = String(district || '').replace(/\s+/g, '')
  if (s.includes('市南')) return 'tone-shinan'
  if (s.includes('黄岛')) return 'tone-huangdao'
  return 'tone-other'
}
function rankBadgeClass(index) {
  if (index === 0) return 'top1'
  if (index === 1) return 'top2'
  if (index === 2) return 'top3'
  return ''
}
function authHeaders() {
  const token = getStorage('token') || ''
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = token
  return headers
}

function navigateStandaloneH5(prettyPath, spaPath, query = '') {
  const target = resolveH5StandalonePath(prettyPath, spaPath, query)
  window.location.assign(target)
}

// ─── API ───────────────────────────────────────────────
async function api(path, options) {
  const fullPath = path.startsWith('/') ? `${baseUrl}${path}` : path
  // #ifdef H5
  const res = await fetch(fullPath, {
    ...(options || {}),
    headers: { ...authHeaders(), ...((options && options.headers) || {}) }
  })
  let json = null
  try {
    json = await res.json()
  } catch (_) {}
  if (!json || json.code !== 0 || !res.ok) {
    if (redirectIfAccessDenied(json, res)) {
      throw new Error(describeApiFailure(json, res))
    }
    throw new Error(describeApiFailure(json, res))
  }
  return json.data
  // #endif
  // #ifndef H5
  return new Promise((resolve, reject) => {
    uni.request({
      url: fullPath,
      method: (options && options.method) || 'GET',
      data: (options && options.body) ? JSON.parse(options.body) : undefined,
      header: { ...authHeaders(), ...((options && options.headers) || {}) },
      success: res => {
        const json = res.data
        if (!json || json.code !== 0) { reject(new Error((json && json.msg) || `HTTP ${res.statusCode}`)); return }
        resolve(json.data)
      },
      fail: err => reject(new Error(err && err.errMsg ? err.errMsg : String(err)))
    })
  })
  // #endif
}

// ─── 状态控制 ──────────────────────────────────────────
function setStatus(text, cls) {
  statusText.value = text || ''
  statusCls.value = cls || ''
}
function renderClock() {
  clockText.value = new Date().toLocaleTimeString('zh-CN', {
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
}

// ─── 筛选器值读取 ──────────────────────────────────────
function buildQuery() {
  const parts = []
  parts.push('days=' + encodeURIComponent(daysOptions.value[daysIndex.value]?.value || '30'))
  const district = districtOptions.value[districtIndex.value]?.value || ''
  if (district) parts.push('district=' + encodeURIComponent(district))
  const communityCode = communityOptions.value[communityIndex.value]?.value || ''
  if (communityCode) parts.push('communityCode=' + encodeURIComponent(communityCode))
  return parts.join('&')
}

function buildDistrictOptions() {
  const out = [{ value: '', label: '全部区' }]
  _state.districts.forEach(item => {
    out.push({ value: item.district, label: `${item.district} (${item.count})` })
  })
  return out
}
function buildCommunityOptions() {
  const selDistrict = districtOptions.value[districtIndex.value]?.value || ''
  const scoped = selDistrict
    ? _state.options.filter(item => item.district === selDistrict)
    : _state.options.slice()
  const out = [{ value: '', label: '全部社区' }]
  scoped.forEach(item => {
    out.push({ value: item.code, label: `${item.community}${selDistrict ? '' : ` (${item.district})`}` })
  })
  return out
}

async function loadOptions() {
  const data = await api('/api/admin/community/options')
  _state.options   = Array.isArray(data.options)   ? data.options   : []
  _state.districts = Array.isArray(data.districts) ? data.districts : []
  districtOptions.value  = buildDistrictOptions()
  communityOptions.value = buildCommunityOptions()
  districtIndex.value  = 0
  communityIndex.value = 0
}

// ─── KPI 渲染（动画简化为直接赋值，uni-app 无 requestAnimationFrame 保证） ──
function renderKpi(overview) {
  const totals = (overview && overview.totals) || {}
  const range = overview && overview.range ? `${overview.range.startDate} ~ ${overview.range.endDate}` : '--'

  kpi.communities     = fmtNumber(n(totals.communitiesTotal))
  kpi.communitiesMeta = `统计范围：${range}`

  kpi.activeCommunities     = fmtNumber(n(totals.communitiesActive))
  kpi.activeCommunitiesMeta = `活跃率 ${fmtPercent(n(totals.communitiesActive) / Math.max(1, n(totals.communitiesTotal)) * 100)}`

  kpi.activeUsers     = fmtNumber(n(totals.activeUsers))
  kpi.activeUsersMeta = '去重活跃用户'

  kpi.events     = fmtNumber(n(totals.totalEvents))
  kpi.eventsMeta = `在线 ${fmtNumber(totals.onlineEvents)} | 设备 ${fmtNumber(totals.deviceEvents)}`

  kpi.lowConf     = fmtPercent(n(totals.lowConfidenceRate))
  kpi.lowConfMeta = '低于 60% 置信度'

  const avgConf = n(totals.avgConfidence, NaN)
  kpi.avgConf     = Number.isFinite(avgConf) ? fmtPercent(avgConf * 100) : '--'
  kpi.avgConfMeta = '全量加权平均'
}

// ─── 社区排行 ──────────────────────────────────────────
function renderCommunityRank(breakdown) {
  const rows = Array.isArray(breakdown && breakdown.rows) ? breakdown.rows : []
  const top  = rows.slice(0, 12)
  const maxScore = Math.max(1, ...top.map(item => n(item.engagementScore, 0)))
  communityRankItems.value = top.map((row, idx) => ({
    community:   row.community,
    district:    row.district,
    scoreLabel:  fmtNumber(n(row.engagementScore, 0)),
    activeUsers: fmtNumber(row.activeUsers),
    totalEvents: fmtNumber(row.totalEvents),
    lowConf:     fmtPercent(row.lowConfidenceRate),
    ratio:       clamp((n(row.engagementScore, 0) / maxScore) * 100, 0, 100).toFixed(1),
    badgeCls:    rankBadgeClass(idx),
    toneCls:     districtToneClass(row.district)
  }))
}

// ─── 分类环图 ──────────────────────────────────────────
function renderCategoryDonut(breakdown) {
  const rows = Array.isArray(breakdown && breakdown.rows) ? breakdown.rows : []
  const categorySum = {}
  rows.forEach(row => {
    const cats = row && row.categories && typeof row.categories === 'object' ? row.categories : {}
    Object.keys(cats).forEach(key => { categorySum[key] = (categorySum[key] || 0) + n(cats[key], 0) })
  })
  const entries = Object.entries(categorySum)
    .map(([name, value]) => ({ name, value: n(value, 0) }))
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value)

  const palette = ['#2bc6de', '#24d392', '#ffbf57', '#5e91ff', '#f37f8f', '#8d7dff']
  const total = entries.reduce((sum, item) => sum + item.value, 0) || 1

  // 非H5 列表
  donutEntries.value = entries.slice(0, 6).map((item, idx) => ({
    name:  item.name,
    pct:   ((item.value / total) * 100).toFixed(1),
    color: palette[idx % palette.length],
    value: entries[idx].value
  }))
  // 非H5 canvas 环图
  // #ifndef H5
  nextTick(() => drawDonutCanvas(entries.slice(0, 6), total, palette))
  // #endif

  // H5 SVG
  // #ifdef H5
  if (!entries.length) { donutSvgHtml.value = ''; return }
  const cx = 120, cy = 110, radius = 74, stroke = 34
  let offset = 0
  const circles = entries.map((item, idx) => {
    const ratio = item.value / total
    const dash  = Math.max(0.003, ratio) * 2 * Math.PI * radius
    const color = palette[idx % palette.length]
    const node = `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-dasharray="${dash.toFixed(2)} ${(2 * Math.PI * radius).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" stroke-linecap="butt" transform="rotate(-90 ${cx} ${cy})"></circle>`
    offset += dash
    return node
  })
  donutSvgHtml.value = [
    `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="rgba(116,216,232,.16)" stroke-width="${stroke}"></circle>`,
    ...circles,
    `<circle cx="${cx}" cy="${cy}" r="${radius - stroke / 2 - 3}" fill="rgba(5,31,40,.76)"></circle>`,
    `<text x="${cx}" y="${cy - 6}" text-anchor="middle" fill="currentColor" font-size="24" font-family="Rajdhani, DIN Alternate, sans-serif">${fmtNumber(total)}</text>`,
    `<text x="${cx}" y="${cy + 16}" text-anchor="middle" fill="var(--muted)" font-size="11">总分类次数</text>`
  ].join('')
  // #endif
}

// ─── 趋势图 ────────────────────────────────────────────
function polyline(points) { return points.map(p => `${p.x},${p.y}`).join(' ') }

function renderTrend(trend) {
  const daily = Array.isArray(trend && trend.daily) ? trend.daily : []
  // 非H5 简表
  trendRows.value = daily.map(item => ({
    date:   String(item.date).slice(5),
    events: fmtNumber(item.totalEvents),
    users:  fmtNumber(item.activeUsers)
  }))
  // 非H5 canvas 数据
  // #ifndef H5
  trendCanvasData.value = daily.map(item => {
    const low = n(item.lowConfidenceRate, NaN)
    const risk = Number.isFinite(low)
      ? clamp(low, 0, 100)
      : clamp((n(item.totalEvents, 0) / Math.max(n(item.activeUsers, 0), 1)) * 2.2 + 18, 0, 100)
    return {
      date:   String(item.date).slice(5),
      events: n(item.totalEvents, 0),
      users:  n(item.activeUsers, 0),
      risk:   risk
    }
  })
  nextTick(() => drawTrendCanvas())
  // #endif
  // H5 SVG
  // #ifdef H5
  if (!daily.length) { trendSvgHtml.value = ''; return }
  const width = 860, height = 300
  const pad = { top: 18, right: 16, bottom: 28, left: 38 }
  const plotW = width - pad.left - pad.right
  const plotH = height - pad.top  - pad.bottom
  const maxEvents = Math.max(1, ...daily.map(d => n(d.totalEvents, 0)))
  const maxActive = Math.max(1, ...daily.map(d => n(d.activeUsers, 0)))
  const size = daily.length - 1 || 1
  const eventPoints = daily.map((item, idx) => ({
    x: pad.left + (plotW * idx) / size,
    y: pad.top + plotH - (n(item.totalEvents, 0) / maxEvents) * plotH
  }))
  const activePoints = daily.map((item, idx) => ({
    x: pad.left + (plotW * idx) / size,
    y: pad.top + plotH - (n(item.activeUsers, 0) / maxActive) * plotH
  }))
  const riskValues = daily.map(item => {
    const low = n(item.lowConfidenceRate, NaN)
    if (Number.isFinite(low)) return clamp(low, 0, 100)
    const active = n(item.activeUsers, 0), events = n(item.totalEvents, 0)
    const concentration = events > 0 ? clamp((events / Math.max(active, 1)) * 2.2, 0, 50) : 0
    return clamp(concentration + 18, 0, 100)
  })
  const riskPoints = riskValues.map((value, idx) => ({
    x: pad.left + (plotW * idx) / size,
    y: pad.top + plotH - (value / 100) * plotH
  }))
  const grid = []
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (plotH * i) / 4
    grid.push(`<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="rgba(116,216,232,.16)" stroke-width="1" />`)
  }
  const thresholdTop    = pad.top + plotH - 0.55 * plotH
  const thresholdBottom = pad.top + plotH - 0.35 * plotH
  const activeArea = [
    `M ${activePoints[0].x},${pad.top + plotH}`,
    ...activePoints.map(p => `L ${p.x},${p.y}`),
    `L ${activePoints[activePoints.length - 1].x},${pad.top + plotH}`, 'Z'
  ].join(' ')
  const labels = []
  const step = Math.max(1, Math.floor(daily.length / 6))
  for (let i = 0; i < daily.length; i += step) {
    const x = pad.left + (plotW * i) / size
    labels.push(`<text x="${x}" y="${height - 8}" fill="#84b8c2" font-size="10" text-anchor="middle">${esc(String(daily[i].date).slice(5))}</text>`)
  }
  trendSvgHtml.value = [
    ...grid,
    `<rect x="${pad.left}" y="${thresholdTop}" width="${plotW}" height="${thresholdBottom - thresholdTop}" fill="rgba(255,191,87,.10)" />`,
    `<path d="${activeArea}" fill="rgba(36,211,146,.18)"></path>`,
    `<polyline class="events-line" points="${polyline(eventPoints)}" fill="none" stroke="#2bc6de" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />`,
    `<polyline class="active-line" points="${polyline(activePoints)}" fill="none" stroke="#24d392" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />`,
    `<polyline points="${polyline(riskPoints)}" fill="none" stroke="#ffbf57" stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round" stroke-linejoin="round" />`,
    ...eventPoints.map(p => `<circle class="events-dot" cx="${p.x}" cy="${p.y}" r="2.3" fill="#2bc6de" />`),
    ...activePoints.map(p => `<circle class="active-dot" cx="${p.x}" cy="${p.y}" r="2.3" fill="#24d392" />`),
    ...riskPoints.map(p => `<circle cx="${p.x}" cy="${p.y}" r="2.2" fill="#ffbf57" />`),
    `<text x="${width - pad.right}" y="${thresholdTop - 4}" fill="#ffdeab" font-size="10" text-anchor="end">风险阈值带</text>`,
    ...labels
  ].join('')
  // #endif
}

// ─── 非H5 Canvas 绘图 ─────────────────────────────────
// #ifndef H5
function drawDonutCanvas(entries, total, palette) {
  if (!entries || !entries.length) return
  const ctx = uni.createCanvasContext('donutCanvas')
  // canvas style = 220px × 220px，绘图坐标系与 style px 值一一对应
  const W = 220, H = 220
  const cx = W / 2, cy = H / 2
  const outerR = 80, innerR = 46
  ctx.clearRect(0, 0, W, H)
  // 背景环
  ctx.beginPath()
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2)
  ctx.setFillStyle('rgba(116,216,232,0.1)')
  ctx.fill()
  // 绘制各扇区
  let startAngle = -Math.PI / 2
  entries.forEach((item, idx) => {
    const ratio = item.value / total
    const angle = Math.max(0.004, ratio) * Math.PI * 2
    ctx.beginPath()
    ctx.arc(cx, cy, outerR, startAngle, startAngle + angle)
    ctx.arc(cx, cy, innerR, startAngle + angle, startAngle, true)
    ctx.closePath()
    ctx.setFillStyle(palette[idx % palette.length])
    ctx.fill()
    startAngle += angle
  })
  // 中心遮罩
  ctx.beginPath()
  ctx.arc(cx, cy, innerR - 2, 0, Math.PI * 2)
  ctx.setFillStyle('#071a2d')
  ctx.fill()
  // 中心文字：总次数
  ctx.setFillStyle('#e8f3ff')
  ctx.setFontSize(20)
  ctx.setTextAlign('center')
  ctx.setTextBaseline('middle')
  ctx.fillText(String(total), cx, cy - 6)
  ctx.setFontSize(11)
  ctx.setFillStyle('#9fbbd7')
  ctx.fillText('总分类次数', cx, cy + 12)
  ctx.draw()
}

function drawTrendCanvas() {
  const data = trendCanvasData.value
  if (!data || !data.length) return
  const ctx = uni.createCanvasContext('trendCanvas')
  // W 与 canvas style px 完全一致（由 trendCanvasW 动态决定）
  const W = trendCanvasW.value
  const H = 200
  const pad = { top: 16, right: 12, bottom: 28, left: 34 }
  const plotW = W - pad.left - pad.right
  const plotH = H - pad.top - pad.bottom
  ctx.clearRect(0, 0, W, H)
  const maxEvents = Math.max(1, ...data.map(d => d.events))
  const maxUsers  = Math.max(1, ...data.map(d => d.users))
  const size = data.length - 1 || 1
  const ex = (i) => pad.left + (plotW * i) / size
  const ey = (v) => pad.top + plotH - (v / maxEvents) * plotH
  const uy = (v) => pad.top + plotH - (v / maxUsers)  * plotH
  const ry = (v) => pad.top + plotH - (v / 100)       * plotH
  // 网格线
  ctx.setStrokeStyle('rgba(116,216,232,0.14)')
  ctx.setLineWidth(1)
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (plotH * i) / 4
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke()
  }
  // 活跃用户填充区
  ctx.beginPath()
  ctx.moveTo(ex(0), pad.top + plotH)
  data.forEach((d, i) => ctx.lineTo(ex(i), uy(d.users)))
  ctx.lineTo(ex(data.length - 1), pad.top + plotH)
  ctx.closePath()
  ctx.setFillStyle('rgba(36,211,146,0.15)')
  ctx.fill()
  // 分类次数折线
  ctx.beginPath()
  data.forEach((d, i) => { i === 0 ? ctx.moveTo(ex(i), ey(d.events)) : ctx.lineTo(ex(i), ey(d.events)) })
  ctx.setStrokeStyle('#2bc6de')
  ctx.setLineWidth(2)
  ctx.stroke()
  // 活跃用户折线
  ctx.beginPath()
  data.forEach((d, i) => { i === 0 ? ctx.moveTo(ex(i), uy(d.users)) : ctx.lineTo(ex(i), uy(d.users)) })
  ctx.setStrokeStyle('#24d392')
  ctx.setLineWidth(2)
  ctx.stroke()
  // 风险折线（虚线用短段模拟）
  ctx.setStrokeStyle('#ffbf57')
  ctx.setLineWidth(1.5)
  for (let i = 0; i < data.length - 1; i++) {
    const x1 = ex(i), y1 = ry(data[i].risk)
    const x2 = ex(i + 1), y2 = ry(data[i + 1].risk)
    const dx = x2 - x1, dy = y2 - y1
    const len = Math.sqrt(dx * dx + dy * dy)
    const dashLen = 4, gapLen = 3, total2 = dashLen + gapLen
    let drawn = 0
    while (drawn < len) {
      const d1 = Math.min(drawn + dashLen, len)
      ctx.beginPath()
      ctx.moveTo(x1 + dx * (drawn / len), y1 + dy * (drawn / len))
      ctx.lineTo(x1 + dx * (d1 / len), y1 + dy * (d1 / len))
      ctx.stroke()
      drawn += total2
    }
  }
  // X 轴标签
  ctx.setFillStyle('#84b8c2')
  ctx.setFontSize(9)
  ctx.setTextAlign('center')
  const step = Math.max(1, Math.floor(data.length / 6))
  for (let i = 0; i < data.length; i += step) {
    ctx.fillText(data[i].date, ex(i), H - 8)
  }
  ctx.draw()
}

function drawRadarCanvas() {
  const metrics = radarMetrics.value
  if (!metrics || !metrics.length) return
  const ctx = uni.createCanvasContext('radarCanvas')
  // canvas style = 220px × 220px，绘图坐标系与 style px 值一一对应
  const W = 220, H = 220
  const cx = W / 2, cy = H / 2 + 4
  const radius = 78, levels = 5
  const count = metrics.length
  const angleStep = (Math.PI * 2) / count
  const start = -Math.PI / 2
  ctx.clearRect(0, 0, W, H)
  // 背景多边形网格
  ctx.setStrokeStyle('rgba(116,216,232,0.2)')
  ctx.setLineWidth(1)
  for (let lv = 1; lv <= levels; lv++) {
    const r = (radius * lv) / levels
    ctx.beginPath()
    metrics.forEach((_, idx) => {
      const a = start + idx * angleStep
      const x = cx + Math.cos(a) * r
      const y = cy + Math.sin(a) * r
      idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.closePath()
    ctx.stroke()
  }
  // 轴线
  metrics.forEach((_, idx) => {
    const a = start + idx * angleStep
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius)
    ctx.setStrokeStyle('rgba(116,216,232,0.24)')
    ctx.setLineWidth(1)
    ctx.stroke()
  })
  // 数据多边形
  ctx.beginPath()
  metrics.forEach((item, idx) => {
    const a = start + idx * angleStep
    const r = radius * (Math.max(0, Math.min(item.score, 100)) / 100)
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.closePath()
  ctx.setFillStyle('rgba(47,111,237,0.22)')
  ctx.fill()
  ctx.setStrokeStyle('#5ea2ff')
  ctx.setLineWidth(2)
  ctx.stroke()
  // 数据点
  metrics.forEach((item, idx) => {
    const a = start + idx * angleStep
    const r = radius * (Math.max(0, Math.min(item.score, 100)) / 100)
    ctx.beginPath()
    ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 3, 0, Math.PI * 2)
    ctx.setFillStyle('#8fc0ff')
    ctx.fill()
  })
  // 标签
  ctx.setFontSize(10)
  ctx.setFillStyle('#9fbbd7')
  metrics.forEach((item, idx) => {
    const a = start + idx * angleStep
    const lx = cx + Math.cos(a) * (radius + 14)
    const ly = cy + Math.sin(a) * (radius + 14)
    ctx.setTextAlign(lx >= cx ? 'left' : 'right')
    ctx.setTextBaseline('middle')
    ctx.fillText(item.name, lx, ly)
  })
  // 中心评分
  const avgScore = metrics.reduce((s, m) => s + m.score, 0) / metrics.length
  ctx.setFontSize(20)
  ctx.setFillStyle('#e8f3ff')
  ctx.setTextAlign('center')
  ctx.setTextBaseline('middle')
  ctx.fillText(avgScore.toFixed(0), cx, cy - 6)
  ctx.setFontSize(10)
  ctx.setFillStyle('#9fbbd7')
  ctx.fillText('治理综合评分', cx, cy + 12)
  ctx.draw()
}
// #endif

// ─── 区级数据 ──────────────────────────────────────────
function renderDistricts(overview) {
  const rows = Array.isArray(overview && overview.districts) ? overview.districts : []
  districtItems.value = rows.map(item => ({
    district:          item.district,
    communitiesActive: fmtNumber(item.communitiesActive),
    communitiesTotal:  fmtNumber(item.communitiesTotal),
    activeUsers:       fmtNumber(item.activeUsers),
    totalEvents:       fmtNumber(item.totalEvents),
    lowConf:           fmtPercent(item.lowConfidenceRate),
    toneCls:           districtToneClass(item.district)
  }))
}

// ─── 区级雷达图（H5 only SVG，非H5 canvas） ──────────────
function renderDistrictRadar(overview) {
  const rows = Array.isArray(overview && overview.districts) ? overview.districts : []
  if (!rows.length) {
    radarSvgHtml.value = ''
    radarMetrics.value = []
    return
  }
  const agg = rows.reduce((acc, item) => {
    acc.communitiesTotal  += n(item.communitiesTotal, 0)
    acc.communitiesActive += n(item.communitiesActive, 0)
    acc.activeUsers       += n(item.activeUsers, 0)
    acc.totalEvents       += n(item.totalEvents, 0)
    acc.lowConfidenceRate += n(item.lowConfidenceRate, 0)
    return acc
  }, { communitiesTotal: 0, communitiesActive: 0, activeUsers: 0, totalEvents: 0, lowConfidenceRate: 0 })
  const districtCount  = Math.max(1, rows.length)
  const activeRatio    = agg.communitiesActive / Math.max(1, agg.communitiesTotal)
  const userScore      = clamp((agg.activeUsers  / Math.max(1, agg.communitiesTotal * 8))  * 100, 0, 100)
  const eventScore     = clamp((agg.totalEvents  / Math.max(1, agg.communitiesTotal * 45)) * 100, 0, 100)
  const qualityScore   = clamp(100 - agg.lowConfidenceRate / districtCount * 2.4, 0, 100)
  const balanceScore   = clamp((activeRatio * 0.6 + qualityScore / 100 * 0.4) * 100, 0, 100)
  const responseScore  = clamp((eventScore * 0.45 + qualityScore * 0.55), 0, 100)
  const metrics = [
    { name: '参与度',   score: clamp(activeRatio * 100, 0, 100) },
    { name: '活跃强度', score: userScore    },
    { name: '响应效率', score: responseScore },
    { name: '分类质量', score: qualityScore  },
    { name: '治理均衡', score: balanceScore  }
  ]
  // 非H5 canvas 数据
  // #ifndef H5
  radarMetrics.value = metrics
  nextTick(() => drawRadarCanvas())
  // #endif
  // H5 SVG
  // #ifdef H5
  const cx = 160, cy = 130, radius = 94, levels = 5
  const angleStep = (Math.PI * 2) / metrics.length
  const start = -Math.PI / 2
  const bgPolygons = []
  for (let level = 1; level <= levels; level++) {
    const r = (radius * level) / levels
    const points = metrics.map((_, idx) => {
      const a = start + idx * angleStep
      return `${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`
    }).join(' ')
    bgPolygons.push(`<polygon points="${points}" fill="none" stroke="rgba(116,216,232,.18)" stroke-width="1"></polygon>`)
  }
  const axes = metrics.map((item, idx) => {
    const a = start + idx * angleStep
    const x = cx + Math.cos(a) * radius, y = cy + Math.sin(a) * radius
    const lx = cx + Math.cos(a) * (radius + 18), ly = cy + Math.sin(a) * (radius + 18)
    const anchor = lx >= cx ? 'start' : 'end'
    return [
      `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="rgba(116,216,232,.24)" stroke-width="1"></line>`,
      `<text x="${lx}" y="${ly}" fill="var(--muted)" font-size="11" text-anchor="${anchor}" dominant-baseline="middle">${esc(item.name)}</text>`
    ].join('')
  }).join('')
  const dataPoints = metrics.map((item, idx) => {
    const a = start + idx * angleStep
    const r = radius * (clamp(item.score, 0, 100) / 100)
    return `${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`
  }).join(' ')
  const avgScore = metrics.reduce((sum, item) => sum + item.score, 0) / metrics.length
  radarSvgHtml.value = [
    ...bgPolygons, axes,
    `<polygon points="${dataPoints}" fill="rgba(47,111,237,.22)" stroke="#5ea2ff" stroke-width="2"></polygon>`,
    ...metrics.map((item, idx) => {
      const a = start + idx * angleStep
      const r = radius * (clamp(item.score, 0, 100) / 100)
      return `<circle cx="${cx + Math.cos(a) * r}" cy="${cy + Math.sin(a) * r}" r="3" fill="#8fc0ff"></circle>`
    }),
    `<text x="${cx}" y="${cy - 2}" text-anchor="middle" fill="currentColor" font-size="24" font-family="Rajdhani, DIN Alternate, sans-serif">${avgScore.toFixed(0)}</text>`,
    `<text x="${cx}" y="${cy + 16}" text-anchor="middle" fill="var(--muted)" font-size="11">治理综合评分</text>`
  ].join('')
  // #endif
}

// ─── 预警 ──────────────────────────────────────────────
function pushAlert(alerts, level, title, detail) {
  const meta = ALERT_META[level] || ALERT_META.p3
  alerts.push({ level, order: meta.order, chip: meta.label, title, detail })
}
function buildAlerts(breakdown, trend) {
  const alerts = []
  const rows = Array.isArray(breakdown && breakdown.rows) ? breakdown.rows : []
  rows.forEach(item => {
    const community = String(item.community || '未知社区')
    const lowConf    = n(item.lowConfidenceRate, 0)
    const totalEvents = n(item.totalEvents, 0)
    const activeUsers = n(item.activeUsers, 0)
    if      (lowConf >= 30 && totalEvents >= 30) pushAlert(alerts, 'p1', `${community} 低置信度偏高`, `当前低置信度占比 ${fmtPercent(lowConf)}，建议排查设备质量并补充分类指引。`)
    else if (lowConf >= 20 && totalEvents >= 20) pushAlert(alerts, 'p2', `${community} 低置信度偏高`, `当前低置信度占比 ${fmtPercent(lowConf)}，建议尽快抽检样本并优化标注。`)
    else if (lowConf >= 15 && totalEvents >= 15) pushAlert(alerts, 'p3', `${community} 低置信度抬升`, `当前低置信度占比 ${fmtPercent(lowConf)}，建议持续观察未来 3 天变化。`)
    if      (activeUsers <= 1 && totalEvents >= 35) pushAlert(alerts, 'p1', `${community} 使用集中度过高`, `分类量 ${fmtNumber(totalEvents)}，但活跃用户仅 ${fmtNumber(activeUsers)}，疑似单点依赖。`)
    else if (activeUsers <= 2 && totalEvents >= 30) pushAlert(alerts, 'p2', `${community} 使用集中度过高`, `分类量 ${fmtNumber(totalEvents)}，活跃用户仅 ${fmtNumber(activeUsers)}，建议扩展参与用户。`)
    else if (activeUsers <= 3 && totalEvents >= 25) pushAlert(alerts, 'p3', `${community} 用户活跃偏集中`, `活跃用户 ${fmtNumber(activeUsers)}，建议做轮班分流，提升稳定性。`)
  })
  const daily = Array.isArray(trend && trend.daily) ? trend.daily : []
  if (daily.length >= 2) {
    const last = daily[daily.length - 1], prev = daily[daily.length - 2]
    const lastEvents = n(last.totalEvents, 0), prevEvents = n(prev.totalEvents, 0)
    if (prevEvents >= 20) {
      const dropRate = (prevEvents - lastEvents) / prevEvents
      if      (dropRate >= 0.55) pushAlert(alerts, 'p1', '整体活跃度明显下滑', `最近一天分类量 ${fmtNumber(lastEvents)}，较前一天 ${fmtNumber(prevEvents)} 下滑超过 55%。`)
      else if (dropRate >= 0.40) pushAlert(alerts, 'p2', '整体活跃度下滑',     `最近一天分类量 ${fmtNumber(lastEvents)}，较前一天 ${fmtNumber(prevEvents)} 下滑超过 40%。`)
      else if (dropRate >= 0.30) pushAlert(alerts, 'p3', '整体活跃度轻度回落', `最近一天分类量 ${fmtNumber(lastEvents)}，较前一天 ${fmtNumber(prevEvents)} 下滑超过 30%。`)
    }
  }
  alerts.sort((a, b) => a.order - b.order)
  return alerts.slice(0, 12)
}
function renderAlerts(breakdown, trend) {
  const alerts = buildAlerts(breakdown, trend)
  const summary = { p1: 0, p2: 0, p3: 0 }
  alerts.forEach(item => { if (summary[item.level] !== undefined) summary[item.level]++ })
  alertSummary.value = `P1 ${summary.p1} | P2 ${summary.p2} | P3 ${summary.p3}`
  alertItems.value = alerts
}

// ─── 社区详情列表 ──────────────────────────────────────
function renderCommunityList(breakdown) {
  const rows = Array.isArray(breakdown && breakdown.rows) ? breakdown.rows : []
  communityListItems.value = rows.slice(0, 12).map(item => {
    const categories = item.categories || {}
    const topCats = Object.entries(categories)
      .sort((a, b) => n(b[1], 0) - n(a[1], 0))
      .slice(0, 2)
      .map(([k, v]) => `${k} ${fmtNumber(v)}`).join(' | ') || '暂无分类细分'
    return {
      community:   item.community,
      district:    item.district,
      totalEvents: fmtNumber(item.totalEvents),
      activeUsers: fmtNumber(item.activeUsers),
      lowConf:     fmtPercent(item.lowConfidenceRate),
      topCats,
      toneCls:     districtToneClass(item.district)
    }
  })
}

// ─── 导航 ──────────────────────────────────────────────
function goCollection() {
  // #ifdef H5
  navigateStandaloneH5('/collection-dashboard', '/pages-nonTheme/collection-dashboard')
  return
  // #endif
  uni.navigateTo({ url: '/pages-nonTheme/collection-dashboard' })
}
function goBack() {
  const pages = getCurrentPages()
  if (pages.length > 1) { uni.navigateBack(); return }
  // #ifdef H5
  navigateStandaloneH5('/', '/pages/home/home')
  return
  // #endif
  if (getStorage('app_theme') === 'light') uni.reLaunch({ url: '/pages/home/home' })
  else uni.reLaunch({ url: '/pages-dark/home/home' })
}

// ─── 数据刷新 ──────────────────────────────────────────
async function refreshDashboard() {
  if (_state.loading) return
  _state.loading = true
  setStatus('数据加载中...', 'warn')
  try {
    const query = buildQuery()
    const [overview, breakdown, trend] = await Promise.all([
      api(`/api/admin/community/overview?${query}`),
      api(`/api/admin/community/by-community?${query}`),
      api(`/api/admin/community/trend?${query}`)
    ])
    _state.lastOverview  = overview
    _state.lastBreakdown = breakdown
    _state.lastTrend     = trend
    renderKpi(overview)
    renderCommunityRank(breakdown)
    renderCategoryDonut(breakdown)
    renderTrend(trend)
    renderDistrictRadar(overview)
    renderDistricts(overview)
    renderCommunityList(breakdown)
    renderAlerts(breakdown, trend)
    const syncInfo = overview && overview.sync ? overview.sync : null
    const suffix = syncInfo && syncInfo.rebuilt ? '（已更新日汇总）' : ''
    setStatus(`更新完成${suffix}`, 'ok')
  } catch (error) {
    console.error('[community-dashboard] refresh failed:', error)
    setStatus(`刷新失败：${error && error.message ? error.message : '未知错误'}`, 'err')
  } finally {
    _state.loading = false
  }
}

async function syncDaily() {
  if (_state.loading) return
  _state.loading = true
  setStatus('正在重算日汇总...', 'warn')
  try {
    const query = buildQuery()
    await api(`/api/admin/community/sync?${query}`, { method: 'POST', body: JSON.stringify({}) })
    setStatus('重算完成，刷新数据中...', 'ok')
    _state.loading = false
    await refreshDashboard()
  } catch (error) {
    console.error('[community-dashboard] sync failed:', error)
    setStatus(`重算失败：${error && error.message ? error.message : '未知错误'}`, 'err')
    _state.loading = false
  }
}

// ─── 生命周期 ──────────────────────────────────────────
let unbindThemeWatcher = null

onMounted(async () => {
  applyStoredTheme()
  unbindThemeWatcher = bindThemeStorageSync()
  isDark.value = getStorage('app_theme') !== 'light'

  // #ifndef H5
  // 获取屏幕宽度用于趋势图 canvas 尺寸（扣除 panel padding 各约10px）
  try {
    const sysInfo = uni.getSystemInfoSync()
    trendCanvasW.value = Math.max(200, (sysInfo.windowWidth || 320) - 20)
  } catch (e) {
    trendCanvasW.value = 300
  }
  // #endif

  // #ifdef H5
  const onStorage = (event) => {
    if (!event || event.key === 'app_theme') isDark.value = getStorage('app_theme') !== 'light'
  }
  window.addEventListener('storage', onStorage)
  // #endif

  renderClock()
  addTimer(setInterval(renderClock, 1000))

  try {
    await loadOptions()
    await refreshDashboard()
  } catch (error) {
    console.error('[community-dashboard] init failed:', error)
    setStatus(`初始化失败：${error && error.message ? error.message : '未知错误'}`, 'err')
  }
})

onBeforeUnmount(() => {
  clearAllTimers()
  if (typeof unbindThemeWatcher === 'function') unbindThemeWatcher()
  // #ifdef H5
  // storage listener 由闭包持有，onMounted 中 removeEventListener 需要同一引用，
  // 实际上 bindThemeStorageSync 内部已处理，此处略
  // #endif
})
</script>
<style scoped>
/* ─── page 背景（覆盖 uni-app 默认白色） ─── */
page {
  background:
    radial-gradient(1000px 600px at 110% -20%, rgba(24, 216, 156, .2), transparent 62%),
    radial-gradient(900px 520px at -15% 22%, rgba(41, 184, 211, .24), transparent 57%),
    linear-gradient(162deg, #061a1f, #0b2630);
  min-height: 100vh;
}

/* ─── CSS 变量（定义在 .screen 上，确保任何平台都生效） ─── */
.screen {
  --bg: #061a1f;
  --bg2: #0b2630;
  --panel: rgba(7, 32, 40, .78);
  --panel-strong: rgba(7, 32, 40, .9);
  --line: rgba(102, 214, 231, .26);
  --text: #e8fbff;
  --muted: #9ac8d1;
  --main: #29b8d3;
  --accent: #18d89c;
  --warn: #ffbf57;
  --danger: #ff6b77;
  --ink: #032029;
  --tone-shinan: #57b8ff;
  --tone-huangdao: #2ed89a;
  --tone-other: #ffc86a;
  --glow-cyan: rgba(64, 212, 232, .28);
}

/* #ifdef H5 */
html, body { height: 100%; min-height: 100%; margin: 0; }
/* #endif */

/* ─── 根容器 ─── */
.screen {
  position: relative;
  z-index: 1;
  min-height: 100vh;
  height: 100vh;
  width: min(1980px, 100%);
  margin: 0 auto;
  padding: clamp(8px, .75vw, 12px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: clamp(8px, .75vw, 12px);
  color: var(--text);
  font-family: "Source Han Sans SC", "Microsoft YaHei", sans-serif;
  background:
    radial-gradient(1000px 600px at 110% -20%, rgba(24, 216, 156, .2), transparent 62%),
    radial-gradient(900px 520px at -15% 22%, rgba(41, 184, 211, .24), transparent 57%),
    linear-gradient(162deg, var(--bg), var(--bg2));
}

/* ─── panel ─── */
.screen .panel {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--line);
  background: linear-gradient(180deg, rgba(18, 66, 79, .12), transparent 24%), var(--panel);
  border-radius: 14px;
  backdrop-filter: blur(6px);
  box-shadow: inset 0 1px 0 rgba(182, 241, 250, .08), 0 14px 28px rgba(0, 0, 0, .16);
}
.screen .panel::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  border: 1px solid rgba(130, 224, 238, .08);
}

/* ─── top / row ─── */
.screen .top {
  padding: clamp(8px, .75vw, 12px) clamp(10px, .9vw, 14px);
  display: grid;
  gap: 8px;
  background: linear-gradient(180deg, rgba(8, 52, 62, .34), rgba(8, 40, 49, .12));
}
.screen .row { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.screen .control-row { padding-top: 8px; border-top: 1px solid rgba(116, 216, 232, .14); }

/* ─── 标题 ─── */
.screen .title {
  margin: 0;
  font-size: clamp(24px, 2vw, 32px);
  letter-spacing: 1.6px;
  background: linear-gradient(180deg, #f2fdff, #b8efff 74%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow: 0 6px 22px rgba(43, 201, 223, .18);
}
.screen .sub { font-size: 12px; color: var(--muted); letter-spacing: .2px; }

/* ─── actions ─── */
.screen .actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.screen .meta-actions { justify-content: flex-end; }
.screen .main-actions { justify-content: flex-end; }
.screen .main-actions .btn { flex: 0 0 auto; min-width: 112px; }
.screen .nav-link-btn { display: inline-flex; align-items: center; gap: 6px; }

/* ─── 时钟 / 状态 ─── */
.screen .clock {
  font-family: "Rajdhani", "DIN Alternate", sans-serif;
  font-size: 22px;
  min-width: 190px;
  text-align: center;
  padding: 6px 10px;
  border-radius: 12px;
  border: 1px solid rgba(116, 216, 232, .35);
  background: rgba(4, 34, 44, .66);
  box-shadow: inset 0 0 0 1px rgba(128, 226, 240, .1);
}
.screen .status {
  font-size: 12px;
  padding: 7px 11px;
  border-radius: 999px;
  border: 1px solid rgba(116, 216, 232, .35);
  background: rgba(4, 34, 44, .66);
  min-width: 220px;
  text-align: center;
  transition: all .24s ease;
}
.screen .status.ok  { color: #9df5d8; border-color: rgba(24, 216, 156, .55); background: rgba(10, 66, 52, .5); animation: communityStatusPulse 2.8s ease-in-out infinite; }
.screen .status.warn { color: #ffe8b6; border-color: rgba(255, 191, 87, .45); background: rgba(78, 56, 17, .52); }
.screen .status.err  { color: #ffd2d6; border-color: rgba(255, 107, 119, .5);  background: rgba(88, 22, 29, .56); }

/* ─── toolbar / field ─── */
.screen .toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; flex: 1 1 auto; }
.screen .field {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 8px; border-radius: 10px;
  border: 1px solid rgba(116, 216, 232, .25);
  background: rgba(4, 34, 44, .58);
  font-size: 12px;
  transition: border-color .2s ease, box-shadow .2s ease;
}
.screen .field:hover { border-color: rgba(129, 232, 246, .45); box-shadow: 0 0 0 1px rgba(129, 232, 246, .14); }
.screen .picker-val { color: var(--text); font-size: 12px; min-width: 86px; }

/* ─── btn ─── */
.screen .btn {
  border: 0; border-radius: 11px; padding: 8px 12px; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  color: #fff; font-size: 12px; text-decoration: none;
  transition: transform .18s ease, box-shadow .22s ease, filter .22s ease;
}
.screen .btn:hover  { transform: translateY(-1px); filter: saturate(1.06); }
.screen .btn:active { transform: translateY(0); }
.screen .btn.main  { background: linear-gradient(135deg, #1a9ab3, #37c9de); box-shadow: 0 6px 18px rgba(41, 184, 211, .28); }
.screen .btn.ok    { background: linear-gradient(135deg, #169f74, #23d29c); box-shadow: 0 6px 18px rgba(35, 210, 156, .24); }
.screen .btn.ghost { background: rgba(255, 255, 255, .12); border: 1px solid rgba(116, 216, 232, .3); }

/* ─── KPI 卡片 ─── */
.screen .cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(clamp(170px, 12vw, 240px), 1fr));
  gap: 7px;
}
.screen .card {
  position: relative; overflow: hidden;
  border: 1px solid rgba(116, 216, 232, .2); border-radius: 12px;
  padding: 6px 9px;
  background: linear-gradient(180deg, rgba(11, 45, 56, .7), rgba(9, 32, 40, .88));
  transition: transform .2s ease, border-color .2s ease, box-shadow .22s ease;
}
.screen .card::after {
  content: ""; position: absolute; left: 0; right: 0; top: 0; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(177, 246, 255, .45), transparent);
}
.screen .card:hover { transform: translateY(-2px); border-color: rgba(126, 231, 244, .45); box-shadow: 0 10px 20px rgba(0, 0, 0, .15); }
.screen .card.major { border-color: rgba(56, 217, 232, .46); background: linear-gradient(180deg, rgba(17, 63, 76, .88), rgba(9, 36, 46, .92)); box-shadow: 0 0 0 1px rgba(56, 217, 232, .12), 0 12px 24px rgba(0, 0, 0, .16); }
.screen .card .k   { font-size: 12px; color: #acdae3; }
.screen .card .v   { margin-top: 4px; font-family: "Rajdhani", "DIN Alternate", sans-serif; font-size: clamp(22px, 1.55vw, 28px); line-height: 1; }
.screen .card.major .v { font-size: clamp(26px, 2vw, 33px); color: #d7f8ff; }
.screen .card .m   { margin-top: 4px; font-size: 11px; color: #95c3ce; }

/* ─── main 布局 ─── */
.screen .main {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(240px, .85fr) minmax(500px, 1.9fr) minmax(240px, .85fr);
  gap: 10px;
}
.screen .col { display: grid; gap: 10px; min-height: 0; }
.screen .col.mid  { grid-template-rows: minmax(0, .9fr) minmax(0, 1.1fr); }
.screen .col.side { grid-template-rows: 1fr 1fr; }

/* ─── block / block-title ─── */
.screen .block {
  min-height: 0; padding: 10px;
  display: grid; grid-template-rows: auto 1fr; gap: 8px;
  background: linear-gradient(180deg, rgba(11, 49, 59, .2), rgba(8, 33, 42, .05));
}
.screen .block-title {
  margin: 0;
  font-size: clamp(12px, .75vw, 14px);
  letter-spacing: .8px;
  display: flex; justify-content: space-between; align-items: center;
  position: relative;
  padding-left: 13px; padding-bottom: 6px;
}
.screen .block-title::before {
  content: ""; position: absolute; left: 0; top: 4px;
  width: 7px; height: 7px; border-radius: 50%;
  background: linear-gradient(180deg, #9df4ff, #33bdd4);
  box-shadow: 0 0 0 4px rgba(63, 201, 223, .12);
}
.screen .block-title::after {
  content: ""; position: absolute; left: 13px; right: 0; bottom: 0; height: 1px;
  background: linear-gradient(90deg, rgba(140, 234, 246, .28), transparent 60%);
}
.screen .note { font-size: 11px; color: #97c5ce; }

/* ─── list / item ─── */
.screen .list { min-height: 0; overflow: auto; display: grid; gap: 7px; }
.screen .list::-webkit-scrollbar { width: 6px; }
.screen .list::-webkit-scrollbar-thumb { background: rgba(116, 216, 232, .38); border-radius: 8px; }
.screen .tone-shinan  { --tone: var(--tone-shinan);  }
.screen .tone-huangdao{ --tone: var(--tone-huangdao);}
.screen .tone-other   { --tone: var(--tone-other);   }
.screen .item {
  border: 1px solid rgba(116, 216, 232, .22);
  border-left: 3px solid var(--tone, rgba(116, 216, 232, .3));
  border-radius: 10px;
  background: rgba(6, 34, 43, .75);
  padding: 8px 9px; display: grid; gap: 5px;
  transition: transform .18s ease, border-color .2s ease, box-shadow .2s ease;
}
.screen .item:hover { transform: translateY(-1px); border-color: rgba(125, 229, 243, .44); box-shadow: 0 8px 18px rgba(0, 0, 0, .14); }
.screen .item .top { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
.screen .rank-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
.screen .rank-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 22px; height: 22px; padding: 0 7px; border-radius: 999px;
  font-family: "Rajdhani", "DIN Alternate", sans-serif; font-size: 11px;
  background: rgba(133, 185, 195, .25); color: #d8f5ff;
}
.screen .rank-badge.top1 { background: linear-gradient(135deg, #ffd777, #f4a42f); color: #2f1a00; }
.screen .rank-badge.top2 { background: linear-gradient(135deg, #d7e7f8, #9db9d7); color: #0f2334; }
.screen .rank-badge.top3 { background: linear-gradient(135deg, #f4c59d, #d98752); color: #2e1605; }
.screen .item .name   { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.screen .item .score  { font-size: 12px; font-family: "Rajdhani", "DIN Alternate", sans-serif; color: #a6ebff; }
.screen .item .sub { display: flex; justify-content: space-between; gap: 6px; font-size: 11px; color: #90c0ca; }
.screen .score-track { height: 5px; border-radius: 999px; background: rgba(117, 183, 194, .25); overflow: hidden; }
.screen .score-fill  { height: 100%; width: 0; background: linear-gradient(90deg, var(--tone, #2bc6de), #2bc6de); box-shadow: 0 0 12px var(--glow-cyan); }

/* ─── 环图 ─── */
.screen .donut-wrap { display: grid; grid-template-columns: minmax(0, 1fr) minmax(130px, 34%); gap: 10px; align-items: center; }
.screen .donut-svg  { width: 100%; height: clamp(190px, 22vh, 240px); }
.screen .donut-svg-placeholder { display: flex; align-items: center; justify-content: center; width: 100%; height: clamp(190px, 22vh, 240px); font-size: 12px; color: var(--muted); }
.screen .donut-legend { display: grid; gap: 6px; }
.screen .donut-item  { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; color: var(--muted); }
.screen .donut-item b { color: var(--text); font-family: "Rajdhani", "DIN Alternate", sans-serif; font-size: 13px; }
.screen .donut-key   { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.screen .donut-pct   { font-family: "Rajdhani", "DIN Alternate", sans-serif; font-size: 12px; }
.screen .donut-color { width: 10px; height: 10px; border-radius: 50%; }

/* ─── 非H5 canvas 通用 ─── */
.mp-canvas-box { position: relative; display: flex; align-items: center; justify-content: center; }
.mp-canvas { display: block; }
/* 趋势图：宽度由 :style 动态绑定 px，高度 200px */
.trend-canvas { display: block; }
/* 甜甜圈 / 雷达：容器与 canvas 同尺寸 220px，不裁切 */
.donut-canvas-box, .radar-canvas-box { max-width: none; }
.canvas-empty { position: absolute; font-size: 12px; color: var(--muted); }
.donut-canvas-box { width: 220px; height: 220px; }
.trend-canvas-box { width: 100%; }
.radar-canvas-box { width: 220px; height: 220px; }

/* ─── 趋势图 ─── */
.screen .chart-wrap {
  position: relative; min-height: 0; border-radius: 10px;
  border: 1px solid rgba(116, 216, 232, .2);
  background: rgba(7, 31, 39, .6); padding: 10px;
  box-shadow: inset 0 0 0 1px rgba(133, 227, 241, .06);
}
.screen .trend-svg  { width: 100%; height: 100%; }
.screen .trend-fallback { min-height: 0; overflow: auto; display: grid; gap: 4px; }
.screen .trend-table { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; font-size: 11px; }
.screen .trend-col  { color: var(--muted); padding: 3px 6px; }
.screen .trend-date { color: var(--text); }
.screen .trend-val  { text-align: right; font-family: "Rajdhani", "DIN Alternate", sans-serif; }
.screen .legend {
  position: absolute; right: 10px; top: 8px;
  display: flex; gap: 8px; font-size: 11px; color: #a5d3dc;
}
.screen .legend span { display: inline-flex; align-items: center; gap: 4px; }
.screen .dot { width: 8px; height: 8px; border-radius: 50%; }
.screen .dot.events { background: #2bc6de; }
.screen .dot.active { background: #24d392; }

/* ─── 区级 / 雷达图 ─── */
.screen .district-grid { display: grid; gap: 8px; overflow: auto; min-height: 0; }
.screen .dual-chart    { display: grid; grid-template-columns: minmax(250px, .95fr) minmax(0, 1.05fr); gap: 10px; min-height: 0; }
.screen .radar-wrap    { position: relative; min-height: 0; border-radius: 10px; border: 1px solid rgba(116, 216, 232, .2); background: rgba(7, 31, 39, .6); padding: 10px; }
.screen .radar-svg     { width: 100%; height: 100%; }
.screen .district {
  border: 1px solid rgba(116, 216, 232, .2);
  border-left: 3px solid var(--tone, rgba(116, 216, 232, .3));
  border-radius: 10px; padding: 8px;
  background: rgba(8, 33, 42, .7); display: grid; gap: 4px;
  transition: transform .18s ease, border-color .2s ease, box-shadow .2s ease;
}
.screen .district:hover { transform: translateY(-1px); border-color: rgba(129, 230, 244, .43); box-shadow: 0 8px 16px rgba(0, 0, 0, .13); }
.screen .district .name { font-size: 13px; font-weight: 600; }
.screen .district .meta { font-size: 11px; color: #90c0ca; display: flex; justify-content: space-between; }

/* ─── 预警 ─── */
.screen .alerts {
  display: grid; gap: 7px; overflow: auto; min-height: 0;
  scrollbar-width: thin; scrollbar-color: rgba(95, 194, 222, .72) rgba(6, 34, 43, .58);
}
.screen .alerts::-webkit-scrollbar        { width: 8px; }
.screen .alerts::-webkit-scrollbar-track  { background: rgba(6, 34, 43, .58); border-radius: 999px; }
.screen .alerts::-webkit-scrollbar-thumb  { background: linear-gradient(180deg, rgba(105, 214, 238, .82), rgba(63, 164, 211, .86)); border: 1px solid rgba(105, 214, 238, .26); border-radius: 999px; }
.screen .alerts::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
.screen .alert {
  border-radius: 10px; padding: 8px;
  border: 1px solid rgba(124, 179, 191, .4);
  background: linear-gradient(180deg, rgba(16, 47, 58, .7), rgba(7, 30, 38, .84));
  transition: transform .18s ease, box-shadow .2s ease;
}
.screen .alert:hover { transform: translateY(-1px); box-shadow: 0 8px 16px rgba(0, 0, 0, .14); }
.screen .alert-top   { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
.screen .alert .t    { font-size: 12px; font-weight: 600; }
.screen .alert .d    { margin-top: 4px; font-size: 11px; color: #c7e7ef; }
.screen .alert-chip  {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 32px; height: 20px; padding: 0 8px; border-radius: 999px;
  font-size: 10px; font-family: "Rajdhani", "DIN Alternate", sans-serif; border: 1px solid transparent;
}
.screen .alert.p1 { border-color: rgba(255, 123, 132, .56); background: linear-gradient(180deg, rgba(86, 24, 33, .74), rgba(43, 16, 22, .86)); }
.screen .alert.p1 .alert-chip { color: #ffd9dc; border-color: rgba(255, 123, 132, .56); background: rgba(255, 123, 132, .18); }
.screen .alert.p2 { border-color: rgba(255, 189, 95, .54); background: linear-gradient(180deg, rgba(78, 49, 20, .74), rgba(38, 25, 14, .86)); }
.screen .alert.p2 .alert-chip { color: #ffe4bc; border-color: rgba(255, 189, 95, .56); background: rgba(255, 189, 95, .16); }
.screen .alert.p3 { border-color: rgba(114, 208, 229, .52); background: linear-gradient(180deg, rgba(18, 52, 64, .74), rgba(9, 29, 37, .86)); }
.screen .alert.p3 .alert-chip { color: #ccf5ff; border-color: rgba(114, 208, 229, .55); background: rgba(114, 208, 229, .18); }

/* ─── empty ─── */
.screen .empty { display: flex; align-items: center; justify-content: center; height: 100%; font-size: 12px; color: #8ab8c2; border: 1px dashed rgba(116, 216, 232, .25); border-radius: 10px; }

/* ─── reveal 动画 ─── */
.screen .reveal { opacity: 0; transform: translateY(12px); }
.screen .reveal.is-show { animation: communityRiseIn .56s ease forwards; animation-delay: var(--delay, 0ms); }

/* ─── keyframes ─── */
@keyframes communityStatusPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(25, 214, 155, 0); }
  45%       { box-shadow: 0 0 0 6px rgba(25, 214, 155, .08); }
}
@keyframes communityRiseIn {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ─── 响应式 ─── */
@media (max-width: 1500px) {
  .screen { padding: 8px; gap: 8px; }
  .screen .main { grid-template-columns: minmax(220px, .8fr) minmax(460px, 1.8fr) minmax(220px, .8fr); gap: 8px; }
  .screen .clock  { min-width: 170px; }
  .screen .status { min-width: 190px; }
  .screen .main-actions .btn { min-width: 104px; }
}
@media (max-width: 1260px) {
  .screen { width: 100%; height: auto; min-height: 100%; padding: 10px; overflow-y: auto; }
  .screen .cards  { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .screen .main   { grid-template-columns: 1fr; }
  .screen .col    { grid-template-rows: auto !important; }
  .screen .chart-wrap  { height: clamp(300px, 42vh, 380px); }
  .screen .dual-chart  { grid-template-columns: 1fr; }
  .screen .donut-wrap  { grid-template-columns: 1fr; }
  .screen .clock, .screen .status { min-width: 160px; }
}
@media (max-width: 760px) {
  .screen .cards  { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .screen .title { font-size: 21px; }
  .screen .clock  { min-width: 144px; font-size: 18px; }
  .screen .status { min-width: 144px; }
  .screen .main-actions { width: 100%; }
  .screen .main-actions .btn { min-width: 0; flex: 1 1 32%; }
  .screen .toolbar { width: 100%; }
  .screen .field   { flex: 1 1 30%; }
}
</style>
