<template>
  <view class="analytics-panel panel">
    <view class="analytics-head">
      <view><text>{{ panelTitle }}</text><text class="small-text">{{ panelSubtitle }}</text></view>
      <view class="analytics-tags"><text class="b-text">算法说明</text></view>
    </view>
    <view class="metric-grid">
      <view><text class="small-text">{{ primaryMetricLabel }}</text><text class="b-text">{{ primaryMetricValue }}</text></view>
      <view><text class="small-text">{{ secondaryMetricLabel }}</text><text class="b-text">{{ secondaryMetricValue }}</text></view>
      <view><text class="small-text">{{ riskTrace ? '容量增长率' : '垃圾增长率' }}</text><text class="b-text">{{ growthRate }}</text></view>
      <view><text class="small-text">当前填充率</text><text class="b-text">{{ fillPct }}</text><text class="em-label" v-if="fillSource">{{ fillSource }}</text></view>
      <view><text class="small-text">预测填充率</text><text class="b-text">{{ predictedFill }}</text></view>
      <view><text class="small-text">预计满载</text><text class="b-text">{{ eta }}</text></view>
    </view>

    <view v-if="prediction" class="prediction-block">
      <view class="prediction-title">
        <text>填充率预测曲线</text>
        <text class="b-text" :class="riskTone">{{ riskLabel }}</text>
      </view>
      <view v-if="predictionWindows.length" class="horizon-grid">
        <view v-for="window in predictionWindows" :key="window.minutes">
          <text class="small-text">{{ window.minutes }} 分钟</text><text class="b-text">{{ window.p50 }}%</text><text class="em-label">{{ window.p10 }}–{{ window.p90 }}%</text>
        </view>
      </view>
      <!-- #ifdef H5 -->
      <svg class="prediction-chart" viewBox="0 0 260 76" preserveAspectRatio="none">
        <line x1="8" y1="66" x2="252" y2="66" class="chart-axis" />
        <line x1="8" y1="16" x2="252" y2="16" class="risk-line" />
        <line :x1="splitX" y1="8" :x2="splitX" y2="69" class="split-line" />
        <polygon v-if="forecastBandPoints" :points="forecastBandPoints" class="forecast-band" />
        <polyline v-if="historyPoints" :points="historyPoints" class="chart-line history" />
        <polyline v-if="forecastPoints" :points="forecastPoints" class="chart-line forecast" />
      </svg>
      <!-- #endif -->
      <view class="chart-legend"><text><i class="history"></i>历史</text><text><i class="band"></i>P10–P90</text><text><i class="forecast"></i>P50</text><text class="small-text" :data-source="prediction.source">{{ prediction.modelVersion || displaySourceLabel(prediction.source) }}</text></view>
    </view>
    <view v-else class="prediction-empty">当前事件之前没有预测载荷，不在前端补造数值。</view>

    <view class="reason-block">
      <text class="small-text">{{ routeReason ? '调度 / 重规划原因' : '当前行为说明' }}</text>
      <text>{{ routeReason || activityReason || '回放事件暂未提供说明' }}</text>
      <view v-if="routeMetrics" class="route-metrics">
        <text class="b-text">距离 {{ routeMetrics.distance }}</text><text class="b-text">代价 {{ routeMetrics.cost }}</text><text class="b-text" :data-source="state.route.algorithmSource">{{ displaySourceLabel(state.route.algorithmSource) }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { scenarioMetricText, zoneLabel } from '@/pages-admin/utils/park-scenario-visuals.js'
import { displaySourceLabel } from '@/utils/source-display.js'

const props = defineProps({
  scenario: { type: String, default: 'baseline' },
  state: { type: Object, default: () => ({}) },
  currentEvent: { type: Object, default: () => ({}) }
})

const scenarioLabels = { baseline: '正常闭环', daily: '公园日常', peak: '高峰预测', blocked: '道路受阻' }
const scenarioLabel = computed(() => scenarioLabels[props.scenario] || props.scenario)
const trace = computed(() => {
  const value = props.currentEvent?.payload?.decisionTrace
  return Array.isArray(value) ? value[0] || null : value || null
})
const riskTrace = computed(() => ['FILL_RISK_ASSESSMENT', 'RETURN_TASK_PRIORITY'].includes(trace.value?.decisionType))
const riskResult = computed(() => trace.value?.predictionResult || props.currentEvent?.payload?.predictionResult || null)
const prediction = computed(() => {
  if (!riskTrace.value || !riskResult.value) return props.state.prediction || null
  return {
    historical: (riskResult.value.inputWindow || []).map((item) => ({ value: item.fillLevel, timestamp: item.timestamp })),
    forecast: riskResult.value.forecastSeries || [],
    currentFillPct: riskResult.value.currentFillPct,
    predictedFillPct: riskResult.value.predictedFillPct,
    etaMinutes: riskResult.value.hoursToFull == null ? null : Math.round(riskResult.value.hoursToFull * 60),
    riskLevel: riskResult.value.riskLevel,
    source: props.currentEvent?.source
  }
})
const panelTitle = computed(() => riskTrace.value ? '容量风险解释' : '场景算法解释')
const panelSubtitle = computed(() => riskTrace.value
  ? (props.currentEvent?.payload?.deviceId || trace.value?.selectedEntityId || '当前智能桶') : scenarioLabel.value)
const riskSelectedCandidate = computed(() => (trace.value?.candidates || [])
  .find((candidate) => candidate.entityId === trace.value?.selectedEntityId) || null)
const currentArea = computed(() => {
  const explicit = props.state.currentArea || props.currentEvent?.payload?.zoneId
  if (explicit) return zoneLabel(explicit)
  const busiest = Object.entries(props.state.zoneCounts || {}).sort((left, right) => Number(right[1]) - Number(left[1]))[0]
  return zoneLabel(busiest?.[0])
})
const visitorCount = computed(() => {
  const areaId = props.state.currentArea || props.currentEvent?.payload?.areaId
  const areaCount = areaId ? props.state.zoneCounts?.[areaId] : null
  const explicit = props.currentEvent?.payload?.areaVisitorCount ?? props.state.areaVisitorCount
  const visitorSnapshotCount = props.state.visitors?.length ? props.state.visitors.length : null
  const value = props.currentEvent?.payload?.crowdCount ?? explicit ?? areaCount ?? props.currentEvent?.payload?.visitorCount ?? visitorSnapshotCount
  return scenarioMetricText(value, value == null ? '' : ' 人')
})
const servicePointLabels = Object.freeze({ service_food_01: '餐饮休息区', service_rest_01: '步道休息区' })
const primaryMetricLabel = computed(() => riskTrace.value ? '关联服务点' : '当前区域')
const primaryMetricValue = computed(() => riskTrace.value
  ? (servicePointLabels[riskSelectedCandidate.value?.servicePointId] || riskSelectedCandidate.value?.servicePointId || '—') : currentArea.value)
const secondaryMetricLabel = computed(() => riskTrace.value ? '点位等级' : '人流数量')
const secondaryMetricValue = computed(() => riskTrace.value
  ? (riskSelectedCandidate.value?.servicePointPriority ?? '—') : visitorCount.value)
const growthRate = computed(() => riskTrace.value
  ? scenarioMetricText(riskResult.value?.growthRatePctPerHour, '%/h')
  : scenarioMetricText(props.state.garbageGenerationRateItemsPerHour, ' 件/h'))
const fillPct = computed(() => scenarioMetricText(riskResult.value?.currentFillPct ?? props.state.capacity?.currentFillPct ?? prediction.value?.currentFillPct, '%'))
const fillSource = computed(() => props.state.capacity?.currentFillPct == null ? '' : `${displaySourceLabel(props.state.capacity.source)} · ${props.state.capacity.sourceEventType}`)
const predictedFill = computed(() => scenarioMetricText(prediction.value?.predictedFillPct, '%'))
const eta = computed(() => scenarioMetricText(prediction.value?.etaMinutes, ' 分钟'))
const riskTone = computed(() => String(prediction.value?.riskLevel || '').toLowerCase())
const riskLabel = computed(() => ({ URGENT: '需要处置', NORMAL: '正常关注', EMERGENCY: '紧急风险', HIGH: '高风险', MEDIUM: '中风险', LOW: '低风险' })[prediction.value?.riskLevel]
  || prediction.value?.riskLevel || '—')
const routeReason = computed(() => {
  const reason = props.state.route?.reason || ''
  return ({ TEMPORARY_CROWD_BLOCKS_RETURN_ROUTE: '临时人群聚集阻断原返航路线' })[reason] || reason
})
const activityReason = computed(() => {
  if (riskTrace.value) return trace.value?.selectedReason || '容量变化已完成风险评估。'
  if (props.currentEvent?.eventType === 'ACTIVE_DISPOSAL') return '游客主动投放，行为事件不直接修改设备业务状态。'
  if (props.currentEvent?.eventType === 'LITTER_CREATED') return '散落垃圾由回放事件触发后续机器人任务。'
  if (props.currentEvent?.eventType === 'DT_MARL_DECISION_UPDATED') return props.currentEvent?.payload?.decisionTrace?.selectedReason || 'MAPPO 已在动作掩码约束内生成调度动作。'
  if (props.currentEvent?.eventType === 'ALGORITHM_FALLBACK') return `算法降级：${props.currentEvent?.payload?.reason || '模型暂不可用'}。`
  if (props.currentEvent?.eventType === 'CROWD_FLOW_UPDATED') {
    const payload = props.currentEvent.payload || {}
    const phase = ({ APPROACHING: '接近道路节点', GATHERING: '逐步聚集', THRESHOLD_REACHED: '达到阻塞阈值', DISPERSING: '人群散开', DISPERSED: '道路占用恢复' })[payload.crowdPhase] || payload.crowdPhase
    return `${phase || '人群变化'}：${payload.crowdCount ?? '—'} / ${payload.crowdThreshold ?? '—'} 人，占用 ${payload.occupancyPct == null ? '—' : Math.round(payload.occupancyPct * 100)}% / 阈值 ${payload.occupancyThresholdPct == null ? '—' : Math.round(payload.occupancyThresholdPct * 100)}%（回放数据）。`
  }
  return props.state.activity?.reason || props.state.activity?.behavior || props.currentEvent?.payload?.reason || ''
})
const routeMetrics = computed(() => {
  const route = props.state.route || {}
  const hasDistance = route.originalDistanceM != null || route.newDistanceM != null
  const hasCost = route.originalCost != null || route.newCost != null
  if (!hasDistance && !hasCost) return null
  return {
    distance: hasDistance ? `${route.originalDistanceM ?? '—'}m → ${route.newDistanceM ?? '—'}m` : '—',
    cost: hasCost ? `${route.originalCost ?? '—'} → ${route.newCost ?? '—'}` : '—'
  }
})

const allSeries = computed(() => [...(prediction.value?.historical || []), ...(prediction.value?.forecast || [])])
const splitX = computed(() => chartX(Math.max(0, (prediction.value?.historical?.length || 1) - 1)))
const historyPoints = computed(() => pointsFor(prediction.value?.historical || [], 0))
const forecastPoints = computed(() => {
  const historical = prediction.value?.historical || []
  const forecast = prediction.value?.forecast || []
  const joined = historical.length && forecast.length ? [historical[historical.length - 1], ...forecast] : forecast
  return pointsFor(joined, Math.max(0, historical.length - 1))
})
const predictionWindows = computed(() => Object.entries(prediction.value?.windows || {}).map(([minutes, window]) => {
  const percent = value => Math.round((Number(value) <= 1 ? Number(value) * 100 : Number(value)) * 10) / 10
  return { minutes: Number(minutes), p10: percent(window.p10), p50: percent(window.p50), p90: percent(window.p90) }
}).sort((left, right) => left.minutes - right.minutes))
const forecastBandPoints = computed(() => {
  const forecast = prediction.value?.forecast || []
  if (!forecast.length || !forecast.some(item => item.p10 != null && item.p90 != null)) return ''
  const offset = Math.max(0, prediction.value?.historical?.length || 0)
  const upper = forecast.map((item, index) => `${chartX(index + offset)},${chartY(item.p90 ?? item.value)}`)
  const lower = forecast.map((item, index) => `${chartX(index + offset)},${chartY(item.p10 ?? item.value)}`).reverse()
  return [...upper, ...lower].join(' ')
})

function chartX(index) {
  const maxIndex = Math.max(1, allSeries.value.length - 1)
  return 8 + index / maxIndex * 244
}
function chartY(value) { return 66 - Math.max(0, Math.min(100, Number(value) || 0)) / 100 * 56 }
function pointsFor(series, offset) { return series.map((item, index) => `${chartX(index + offset)},${chartY(item.value)}`).join(' ') }
</script>

<style scoped>
.analytics-panel { flex: 0 0 auto; padding: 10px 11px; overflow: hidden; }
.analytics-head,.prediction-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; }.analytics-head > view:first-child text,.analytics-head > view:first-child .small-text { display: block; }.analytics-head text { color: #e7f8ff; font-size: 11px; font-weight: 750; }.analytics-head .small-text { margin-top: 2px; color: #7fa8ba; font-size: 9px; }.analytics-tags { display: flex; gap: 3px; }.analytics-tags .b-text { padding: 2px 4px; border: 1px solid rgba(245,182,72,.42); border-radius: 3px; color: #ffd57c; background: rgba(121,77,11,.28); font: 700 8px/1 ui-monospace,Consolas,monospace; }
.metric-grid { margin-top: 8px; display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 4px; }.metric-grid view { min-width: 0; padding: 5px 6px; border: 1px solid rgba(116,197,255,.14); border-radius: 5px; background: rgba(10,43,65,.56); }.metric-grid .small-text,.metric-grid .b-text,.metric-grid .em-label { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.metric-grid .small-text { color: #719aad; font-size: 8px; }.metric-grid .b-text { margin-top: 2px; color: #e3f7ff; font-size: 10px; }.metric-grid .em-label { margin-top: 2px; color: #7eb4ca; font: 8px/1.1 ui-monospace,Consolas,monospace; font-style: normal; }
.prediction-block { margin-top: 7px; padding: 7px; border: 1px solid rgba(116,197,255,.14); border-radius: 6px; background: rgba(3,25,40,.62); }.prediction-title text { color: #a8cedd; font-size: 10px; }.prediction-title .b-text { padding: 2px 5px; border-radius: 4px; color: #bfe7f6; background: rgba(28,101,145,.5); font-size: 9px; }.prediction-title .b-text.high,.prediction-title .b-text.critical { color: #ffd5d5; background: rgba(175,47,56,.7); }.prediction-title .b-text.medium { color: #ffe4a8; background: rgba(145,90,14,.68); }.prediction-title .b-text.low { color: #aef4cf; background: rgba(16,112,71,.66); }
.prediction-title .b-text.emergency { color: #fff; background: #a9232d; }.horizon-grid { display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:6px }.horizon-grid view { padding:4px;border-radius:4px;background:rgba(39,104,135,.2) }.horizon-grid .small-text,.horizon-grid .b-text,.horizon-grid .em-label { display:block;text-align:center }.horizon-grid .small-text { color:#739caf;font-size:7px }.horizon-grid .b-text { color:#f2c76f;font-size:9px }.horizon-grid .em-label { color:#8ab4c6;font-size:6px;font-style:normal }
.prediction-chart { width: 100%; height: 72px; margin-top: 3px; overflow: visible; }.chart-axis { stroke: rgba(154,207,233,.25); stroke-width: 1; }.risk-line { stroke: rgba(255,93,102,.35); stroke-width: 1; stroke-dasharray: 3 3; }.split-line { stroke: rgba(222,244,255,.24); stroke-width: 1; stroke-dasharray: 2 3; }.chart-line { fill: none; stroke-width: 2.5; vector-effect: non-scaling-stroke; stroke-linejoin: round; stroke-linecap: round; }.chart-line.history { stroke: #69a9d2; }.chart-line.forecast { stroke: #f5b648; stroke-dasharray: 5 4; filter: drop-shadow(0 0 3px rgba(245,182,72,.5)); }.chart-legend { display: flex; align-items: center; gap: 8px; color: #86adbf; font-size: 6px; }.chart-legend text { display: flex; align-items: center; gap: 3px; }.chart-legend .history,.chart-legend .band,.chart-legend .forecast { width: 12px; border-top: 2px solid; }.chart-legend .history { border-color: #69a9d2; }.chart-legend .forecast { border-color: #f5b648; border-top-style: dashed; }.chart-legend .small-text { margin-left: auto; color: #ffd57c; font: 6px/1 ui-monospace,Consolas,monospace; }
.forecast-band { fill:rgba(245,182,72,.14);stroke:rgba(245,182,72,.25);stroke-width:.7 }.chart-legend .band { height:4px;border:0;background:rgba(245,182,72,.25) }.chart-legend .small-text { max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap }
.prediction-empty { margin-top: 7px; padding: 8px; border: 1px dashed rgba(116,197,255,.18); border-radius: 6px; color: #688fa1; font-size: 9px; line-height: 1.5; }.reason-block { margin-top: 7px; padding: 7px; border-left: 2px solid #24d9ff; border-radius: 0 5px 5px 0; background: rgba(15,65,90,.36); }.reason-block .small-text,.reason-block text { display: block; }.reason-block .small-text { color: #719bac; font-size: 8px; }.reason-block text { margin-top: 3px; color: #d8edf6; font-size: 9px; line-height: 1.45; }.route-metrics { margin-top: 5px; display: flex; flex-wrap: wrap; gap: 3px; }.route-metrics .b-text { padding: 2px 4px; border-radius: 3px; color: #9bdcf1; background: rgba(26,100,130,.5); font: 8px/1.2 ui-monospace,Consolas,monospace; }
@media (max-width: 900px) { .metric-grid { grid-template-columns: repeat(3,minmax(0,1fr)); }.prediction-chart { height: 90px; } }
@media (max-width: 560px) { .metric-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }

/* #ifdef MP-WEIXIN */
.metric-grid { display: flex; flex-wrap: wrap; }
.metric-grid view { flex: 1; min-width: 120px; }
.horizon-grid { display: flex; flex-wrap: wrap; }
.horizon-grid view { flex: 1; min-width: 80px; }
/* #endif */
</style>
