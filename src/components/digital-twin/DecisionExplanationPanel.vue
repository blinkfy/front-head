<template>
  <view class="decision-panel panel">
    <view class="decision-head">
      <view>
        <view class="panel-title">决策解释</view>
        <view class="panel-sub">候选对象、排除原因与最终依据</view>
      </view>
      <text v-if="trace" class="decision-type">{{ decisionTypeLabel }}</text>
    </view>

    <view v-if="!trace" class="decision-empty">
      <b>该事件无调度决策</b>
      <text>仅在实际发生派单、预留、泊位分配、路径重规划或异常响应时显示。</text>
    </view>

    <template v-else>
      <view class="decision-meta">
        <view><text>决策编号</text><b>{{ trace.decisionId || '—' }}</b></view>
        <view v-if="trace.taskId"><text>关联任务</text><b>{{ trace.taskId }}</b></view>
        <view v-if="payload.reservationId"><text>预留编号</text><b>{{ payload.reservationId }}</b></view>
        <view v-if="trace.reassignedFrom || payload.reassignedFrom"><text>重新分配来源</text><b>{{ trace.reassignedFrom || payload.reassignedFrom }}</b></view>
        <view v-if="isCenterDecision"><text>中心等待队列</text><b>{{ centerQueueText }}</b></view>
        <view v-if="isIncidentDecision"><text>当前恢复阶段</text><b>{{ payload.currentStage || '—' }}</b></view>
        <view v-if="isRiskDecision"><text>当前填充率</text><b>{{ predictionResult?.currentFillPct ?? '—' }}%</b></view>
        <view v-if="isRiskDecision"><text>当前增长率</text><b>{{ predictionResult?.growthRatePctPerHour ?? '—' }}%/h</b></view>
        <view v-if="isRiskDecision"><text>预计满载</text><b>{{ fullTimeText }}</b></view>
        <view v-if="isRiskDecision"><text>风险等级</text><b>{{ riskLevelText }}</b></view>
      </view>

      <view v-if="scoreRows.length" class="score-summary">
        <view v-for="item in scoreRows" :key="item.key"><text>{{ item.label }}</text><b>{{ item.value }}</b></view>
      </view>

      <view class="candidate-section">
        <view class="section-title"><text>候选对象</text><b>{{ candidateRows.length }}</b></view>
        <view v-if="!candidateRows.length" class="candidate-empty">本次决策没有可用候选对象</view>
        <view
          v-for="candidate in candidateRows"
          :key="candidate.entityId"
          :class="['candidate-row', { selected: candidate.entityId === trace.selectedEntityId, excluded: candidate.excludedReason }]"
        >
          <view class="candidate-top">
            <view class="candidate-name">
              <b>{{ candidateLabel(candidate.entityId) }}</b>
              <small>{{ candidate.entityId }}</small>
            </view>
            <text v-if="candidate.entityId === trace.selectedEntityId" class="candidate-state selected">最终选择</text>
            <text v-else-if="candidate.excludedReason" class="candidate-state excluded">已排除</text>
            <text v-else class="candidate-state">参与比较</text>
          </view>
          <view v-if="candidateFacts(candidate).length" class="candidate-facts">
            <text v-for="fact in candidateFacts(candidate)" :key="fact">{{ fact }}</text>
          </view>
          <view v-if="candidateCost(candidate) != null" class="cost-row">
            <view class="cost-track"><view class="cost-fill" :style="{ width: `${costWidth(candidate)}%` }"></view></view>
            <b>{{ scoreCaption }} {{ candidateCost(candidate) }}</b>
          </view>
          <view v-if="candidate.excludedReason" class="excluded-reason">{{ candidate.excludedReason }}</view>
        </view>
      </view>

      <view class="selected-reason">
        <text>{{ trace.selectedEntityId ? '选择依据' : '当前结果' }}</text>
        <b>{{ trace.selectedReason || '未记录额外说明' }}</b>
      </view>
    </template>
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  currentEvent: { type: Object, default: () => ({}) },
  labels: { type: Object, default: () => ({}) }
})

const payload = computed(() => props.currentEvent?.payload || {})
const trace = computed(() => {
  const value = payload.value.decisionTrace
  return Array.isArray(value) ? value[0] || null : value || null
})
const typeLabels = Object.freeze({
  ROBOT_TASK_ASSIGNMENT: '机器人派单',
  ROBOT_TASK_REASSIGNMENT: '机器人重新分配',
  STANDBY_DEVICE_SELECTION: '备用桶补位',
  CENTER_BAY_ASSIGNMENT: '中心泊位分配',
  ROUTE_REPLANNING: '路径重规划',
  INCIDENT_RESPONSE: '异常响应',
  FILL_RISK_ASSESSMENT: '容量风险评估',
  RETURN_TASK_PRIORITY: '返航任务顺序'
})
const decisionTypeLabel = computed(() => typeLabels[trace.value?.decisionType] || trace.value?.decisionType || '调度决策')
const isCenterDecision = computed(() => trace.value?.decisionType === 'CENTER_BAY_ASSIGNMENT')
const isIncidentDecision = computed(() => trace.value?.decisionType === 'INCIDENT_RESPONSE')
const isRiskDecision = computed(() => ['FILL_RISK_ASSESSMENT', 'RETURN_TASK_PRIORITY'].includes(trace.value?.decisionType))
const predictionResult = computed(() => trace.value?.predictionResult || payload.value.predictionResult || null)
const fullTimeText = computed(() => predictionResult.value?.hoursToFull == null ? '暂无法计算'
  : `${predictionResult.value.hoursToFull} 小时`)
const riskLevelText = computed(() => ({ URGENT: '需要处置', NORMAL: '正常关注' })[predictionResult.value?.riskLevel]
  || predictionResult.value?.riskLevel || '—')
const centerQueueText = computed(() => {
  const queue = payload.value.waitingQueue || props.currentEvent?.currentState?.operations?.centerQueue || []
  return queue.length ? queue.join('、') : '无等待设备'
})

const excludedReasonMap = computed(() => Object.fromEntries((trace.value?.excludedCandidates || [])
  .map((candidate) => [candidate.entityId, candidate.reason || candidate.excludedReason || '未满足当前调度条件'])))
const candidateRows = computed(() => {
  const rows = (trace.value?.candidates || []).map((candidate) => ({
    ...candidate,
    excludedReason: candidate.excludedReason || excludedReasonMap.value[candidate.entityId] || ''
  }))
  for (const [entityId, reason] of Object.entries(excludedReasonMap.value)) {
    if (!rows.some((candidate) => candidate.entityId === entityId)) rows.push({ entityId, excludedReason: reason })
  }
  return rows
})

const scoreLabels = Object.freeze({
  distanceCost: '距离代价', queueCost: '队列代价', activeTaskCost: '在途任务代价', batteryCost: '电量代价',
  originalPathCost: '原路线代价', selectedPathCost: '新路线代价', extraPathCost: '绕行增加代价',
  fillScore: '当前容量项', fillContribution: '容量贡献', urgencyScore: '满载紧迫项',
  urgencyContribution: '紧迫贡献', horizonScore: '预测区间项', horizonContribution: '预测贡献',
  riskBonus: '高容量加成', priorityScore: '最终风险评分'
})
const scoreRows = computed(() => Object.entries(trace.value?.scoreBreakdown || {}).map(([key, value]) => ({
  key, label: scoreLabels[key] || key, value
})))
const candidateLabel = (entityId) => props.labels?.[entityId] || ({
  A_STAR_REPLAN: 'A* 绕行规划', STANDBY_REPLACEMENT: '备用桶补位', WAITING_REPLACEMENT: '等待备用资源',
  RETURN_TO_CENTER: '返航充电', RETAIN_TASK_CONTEXT: '保留已抓取任务', REQUEUE_UNPICKED_TASK: '未抓取任务重新入队',
  FIFO_CENTER_QUEUE: '中心到站顺序队列'
})[entityId] || entityId
const candidateFacts = (candidate) => [
  candidate.status ? `状态 ${candidate.status}` : '',
  candidate.queueLength != null ? `队列 ${candidate.queueLength}` : '',
  candidate.distance != null ? `距离 ${candidate.distance}` : '',
  candidate.batteryPct != null ? `电量 ${candidate.batteryPct}%` : '',
  candidate.reservedForPointId ? `预留 ${candidate.reservedForPointId}` : '',
  candidate.currentDeviceId ? `占用 ${candidate.currentDeviceId}` : '',
  candidate.pathCost != null ? `路径代价 ${candidate.pathCost}` : '',
  candidate.currentFillPct != null ? `填充 ${candidate.currentFillPct}%` : '',
  candidate.growthRatePctPerHour != null ? `增长 ${candidate.growthRatePctPerHour}%/h` : '',
  candidate.predictedFillPct != null ? `预测 ${candidate.predictedFillPct}%` : '',
  candidate.hoursToFull != null ? `满载 ${candidate.hoursToFull}h` : '',
  candidate.riskLevel ? `风险 ${riskLabel(candidate.riskLevel)}` : '',
  candidate.servicePointPriority != null ? `点位级别 ${candidate.servicePointPriority}` : '',
  candidate.serviceImpact || '',
  candidate.taskOrder != null ? `任务顺序 ${candidate.taskOrder}` : '',
  candidate.hasActiveReturnTask ? '已有返航任务' : ''
].filter(Boolean)
const riskLabel = (level) => ({ URGENT: '需要处置', NORMAL: '正常关注' })[level] || level
const usesPriorityScore = computed(() => ['FILL_RISK_ASSESSMENT', 'RETURN_TASK_PRIORITY'].includes(trace.value?.decisionType))
const scoreCaption = computed(() => usesPriorityScore.value ? '评分' : '代价')
const candidateCost = (candidate) => candidate.estimatedCost ?? candidate.pathCost ?? candidate.priorityScore ?? null
const maximumCost = computed(() => Math.max(0, ...candidateRows.value.map((candidate) => Number(candidateCost(candidate)) || 0)))
const costWidth = (candidate) => maximumCost.value ? Math.max(8, Math.round(Number(candidateCost(candidate)) / maximumCost.value * 100)) : 0
</script>

<style scoped>
.decision-panel { flex: 0 0 auto; overflow: hidden; }.decision-head { padding: 11px 12px 9px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(116,197,255,.16); }.panel-title { color:#e8f8ff;font-size:13px;font-weight:700 }.panel-sub { margin-top:3px;color:#789fb4;font-size:8px }.decision-type { padding:3px 6px;border:1px solid rgba(36,217,255,.32);border-radius:5px;color:#79e8ff;background:rgba(36,217,255,.08);font-size:8px }
.decision-empty { padding:18px 12px;text-align:center }.decision-empty b,.decision-empty text { display:block }.decision-empty b { color:#91adba;font-size:10px }.decision-empty text { margin-top:5px;color:#5f8293;font-size:7px;line-height:1.5 }
.decision-meta { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;padding:9px 12px;border-bottom:1px solid rgba(116,197,255,.1) }.decision-meta view,.score-summary view { min-width:0;padding:5px 6px;border-radius:5px;background:rgba(27,81,111,.18) }.decision-meta text,.decision-meta b,.score-summary text,.score-summary b { display:block }.decision-meta text,.score-summary text { color:#7299ac;font-size:7px }.decision-meta b,.score-summary b { margin-top:2px;color:#d8eef7;font:7px/1.3 ui-monospace,Consolas,monospace;overflow-wrap:anywhere }
.score-summary { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;padding:7px 12px;border-bottom:1px solid rgba(116,197,255,.1) }.score-summary b { color:#ffd27d }
.candidate-section { padding:9px 12px }.section-title { display:flex;justify-content:space-between;color:#8bc9e7;font-size:9px;font-weight:700;margin-bottom:6px }.section-title b { color:#5f91aa }.candidate-row { padding:7px;margin-top:5px;border:1px solid rgba(116,197,255,.13);border-radius:6px;background:rgba(8,42,62,.34) }.candidate-row.selected { border-color:rgba(44,220,166,.52);background:linear-gradient(90deg,rgba(26,159,116,.15),rgba(8,42,62,.34)) }.candidate-row.excluded { opacity:.72 }.candidate-top { display:flex;align-items:center;gap:6px }.candidate-name { min-width:0;flex:1 }.candidate-name b,.candidate-name small { display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap }.candidate-name b { color:#dff4fb;font-size:8px }.candidate-name small { margin-top:2px;color:#5f91aa;font:6px/1.2 ui-monospace,Consolas,monospace }.candidate-state { color:#8ab0c1;font-size:6px }.candidate-state.selected { color:#73edb5 }.candidate-state.excluded { color:#ffb071 }.candidate-facts { display:flex;flex-wrap:wrap;gap:4px;margin-top:5px }.candidate-facts text { padding:2px 4px;border-radius:3px;color:#9ec4d4;background:rgba(80,145,174,.12);font-size:6px }.cost-row { display:flex;align-items:center;gap:6px;margin-top:6px }.cost-track { height:3px;flex:1;border-radius:9px;overflow:hidden;background:rgba(103,157,181,.16) }.cost-fill { height:100%;border-radius:inherit;background:linear-gradient(90deg,#24d9ff,#5d91ff) }.cost-row b { color:#9dc9da;font-size:6px }.excluded-reason { margin-top:5px;padding-left:6px;border-left:2px solid #d9884e;color:#e5ad82;font-size:7px;line-height:1.35 }.candidate-empty { padding:10px;text-align:center;color:#6f93a6;font-size:8px }
.selected-reason { padding:9px 12px;border-top:1px solid rgba(116,197,255,.12);background:linear-gradient(90deg,rgba(36,217,255,.05),transparent) }.selected-reason text,.selected-reason b { display:block }.selected-reason text { color:#71a0b4;font-size:7px }.selected-reason b { margin-top:4px;color:#dff5fc;font-size:8px;line-height:1.45 }
.panel-title { font-size:15px }.panel-sub { font-size:10px }.decision-type { font-size:10px }
.decision-empty b { font-size:12px }.decision-empty text { font-size:9px }
.decision-meta text,.score-summary text { font-size:9px }.decision-meta b,.score-summary b { font-size:9px }
.section-title { font-size:11px }.candidate-name b { font-size:10px }.candidate-name small { font-size:8px }
.candidate-state,.candidate-facts text,.cost-row b { font-size:8px }.excluded-reason { font-size:9px }
.candidate-empty { font-size:10px }.selected-reason text { font-size:9px }.selected-reason b { font-size:10px }
</style>
