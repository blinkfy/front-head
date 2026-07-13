<template>
  <view class="inspector panel">
    <view class="inspector-head">
      <view>
        <view class="panel-title">对象检查器</view>
        <view class="panel-sub">点击设备或服务点查看关联信息</view>
      </view>
      <view :class="['entity-type', typeClass]">{{ typeLabel }}</view>
    </view>

    <view v-if="selectedId" class="entity-summary">
      <view class="entity-symbol"><view :class="['entity-glyph', typeClass]">{{ glyph }}</view></view>
      <view class="entity-heading">
        <view class="entity-name">{{ selectedName }}</view>
        <view class="entity-id">{{ selectedId }}</view>
      </view>
    </view>
    <view v-else class="empty-state">请选择场景对象</view>

    <template v-if="selectedId">
      <view class="data-section">
        <view class="section-title">当前事件影响</view>
        <view class="data-row"><text>事件</text><b>{{ presentation.title }}</b></view>
        <view class="data-row"><text>显式状态</text><b :class="statusTone">{{ explicitStatus }}</b></view>
        <view class="data-row"><text>数据来源</text><b :data-source="currentEvent?.source">{{ displaySourceLabel(currentEvent?.source, '—') }}</b></view>
      </view>

      <view v-if="relatedIncident" class="data-section incident-section">
        <view class="section-title">韧性恢复 <text>{{ incidentTypeLabel }}</text></view>
        <view class="data-row"><text>恢复阶段</text><b class="warning">{{ incidentStageLabel }}</b></view>
        <view class="data-row multiline"><text>受影响任务</text><b>{{ relatedIncident.responseTaskIds?.length ? relatedIncident.responseTaskIds.join('、') : '无新增任务' }}</b></view>
        <view class="data-row multiline"><text>系统响应</text><b>{{ relatedIncident.systemResponse || '正在确认响应方案' }}</b></view>
        <view v-if="relatedIncident.recoveryResult" class="data-row multiline"><text>恢复结果</text><b class="success">{{ relatedIncident.recoveryResult }}</b></view>
      </view>

      <view v-if="showCoordination" class="data-section coordination-section">
        <view class="section-title">协同调度</view>
        <view class="data-row"><text>当前任务</text><b>{{ coordination.currentTask }}</b></view>
        <view class="data-row"><text>队列长度</text><b>{{ coordination.queueLength }}</b></view>
        <view class="data-row multiline"><text>分配原因</text><b>{{ coordination.selectionReason }}</b></view>
        <view class="data-row"><text>关联服务点</text><b>{{ coordination.servicePointId }}</b></view>
        <view class="data-row"><text>预留状态</text><b>{{ coordination.reservation }}</b></view>
        <view class="data-row"><text>中心泊位</text><b>{{ coordination.bayId }}</b></view>
      </view>

      <view class="data-section">
        <view class="section-title">映射信息</view>
        <view class="data-row"><text>对象类型</text><b>{{ typeLabel }}</b></view>
        <view class="data-row multiline"><text>Prim</text><b>{{ primPath }}</b></view>
        <view class="data-row"><text>回放最终状态</text><b>{{ finalStatus }}</b></view>
        <view v-if="metrics.fillPct != null" class="metric-block">
          <view class="metric-head"><text>填充率</text><b>{{ metrics.fillPct }}%</b></view>
          <view class="metric-track"><view class="metric-fill fill" :style="{ width: `${metrics.fillPct}%` }"></view></view>
        </view>
        <view v-if="metrics.batteryPct != null" class="metric-block">
          <view class="metric-head"><text>电量</text><b>{{ metrics.batteryPct }}%</b></view>
          <view class="metric-track"><view class="metric-fill battery" :style="{ width: `${metrics.batteryPct}%` }"></view></view>
        </view>
      </view>

      <view class="data-section tasks-section">
        <view class="section-title">关联任务 <text>{{ relatedTasks.length }}</text></view>
        <view v-if="!relatedTasks.length" class="empty-inline">当前回放未关联任务</view>
        <view v-for="task in relatedTasks" :key="task.id" class="task-row" @tap="$emit('select', task.id)">
          <view><text>{{ labels[task.id] || task.id }}</text><small>{{ task.id }}</small></view>
          <b>{{ task.status }}</b>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { entityTypeLabel, eventPresentation, explicitEntityStatus } from '@/utils/park-replay.js'
import { displaySourceLabel } from '@/utils/source-display.js'
import { displayTwinStatus } from '@/utils/digital-twin-status.js'

const props = defineProps({
  selectedId: { type: String, default: '' },
  idMap: { type: Object, default: () => ({ entries: {} }) },
  labels: { type: Object, default: () => ({}) },
  currentEvent: { type: Object, default: () => ({}) },
  finalState: { type: Object, default: () => ({}) }
})
defineEmits(['select'])

const incidentCandidates = computed(() => {
  const incidents = props.finalState?.incidents || {}
  return [...(incidents.active || []), ...(incidents.recent ? [incidents.recent] : [])]
})
const relatedIncident = computed(() => incidentCandidates.value.find(incident =>
  incident.incidentId === props.selectedId || incident.affectedEntityIds?.includes(props.selectedId)) || null)
const entry = computed(() => props.idMap?.entries?.[props.selectedId] || (relatedIncident.value ? { type: 'incident' }
  : /^robot_patrol_/.test(props.selectedId) ? { type: 'robot' }
    : /^bay_/.test(props.selectedId) ? { type: 'center_bay' }
      : /^device_smart_bin_/.test(props.selectedId) ? { type: 'device' } : {}))
const typeLabel = computed(() => entityTypeLabel(entry.value.type))
const typeClass = computed(() => String(entry.value.type || 'object').replace(/_/g, '-'))
const glyph = computed(() => ({ robot: 'R', service_point: 'P', device: 'B', sorting_center: 'C', center_bay: 'C', task: 'T', garbage: 'W', visitor: 'V', incident: 'I' })[entry.value.type] || 'O')
const selectedName = computed(() => relatedIncident.value ? incidentTypeLabel.value : (props.labels[props.selectedId] || props.selectedId))
const presentation = computed(() => eventPresentation(props.currentEvent))
const explicitStatusCode = computed(() => explicitEntityStatus(props.currentEvent, props.selectedId))
const explicitStatus = computed(() => displayTwinStatus(explicitStatusCode.value))
const statusTone = computed(() => /RISK|RETURN|PENDING|CHARGING/i.test(explicitStatusCode.value) ? 'warning' : /SUCCEEDED|ONLINE|OCCUPIED|STANDBY/i.test(explicitStatusCode.value) ? 'success' : '')
const primPath = computed(() => entry.value.primPath || entry.value.primPathCandidates?.join(' / ') || '—')

const finalRecord = computed(() => {
  const state = props.finalState || {}
  return state.devices?.[props.selectedId] || state.servicePoints?.[props.selectedId] ||
    state.tasks?.[props.selectedId] || state.robots?.[props.selectedId] || (state.robot?.id === props.selectedId ? state.robot : null) ||
    state.operations?.centerBays?.[props.selectedId] || state.sortingCenter?.bays?.[props.selectedId] ||
    (state.sortingCenter?.id === props.selectedId ? state.sortingCenter : null) || null
})
const finalStatus = computed(() => displayTwinStatus(finalRecord.value?.status, '无状态字段'))
const metrics = computed(() => ({
  fillPct: finalRecord.value?.fillPct ?? null,
  batteryPct: finalRecord.value?.batteryPct ?? null
}))

const relatedTasks = computed(() => {
  const tasks = props.finalState?.tasks || {}
  return Object.entries(tasks)
    .filter(([, task]) => Object.values(task || {}).includes(props.selectedId))
    .map(([id, task]) => ({ id, status: displayTwinStatus(task.status) }))
})
const coordinationTask = computed(() => {
  const tasks = props.finalState?.tasks || {}
  return Object.entries(tasks).map(([id, task]) => ({ id, ...task })).find(task =>
    task.id === props.selectedId || task.assignedRobotId === props.selectedId || task.replacementDeviceId === props.selectedId || task.deviceId === props.selectedId) || null
})
const coordination = computed(() => {
  const record = finalRecord.value || {}
  const task = coordinationTask.value || {}
  const payload = props.currentEvent?.payload || {}
  const queueLength = record.taskQueue?.length ?? props.finalState?.operations?.robotQueues?.[props.selectedId]?.length ?? 0
  const bayId = /^bay_/.test(props.selectedId) ? props.selectedId : (record.assignedBayId || task.assignedBayId || '未进入泊位')
  const reservationId = record.reservationId || task.reservationId || (payload.selectedEntityId === props.selectedId ? payload.reservationId : '')
  return {
    currentTask: record.activeTaskId || task.id || '无主任务',
    queueLength,
    selectionReason: task.selectionReason || (payload.selectedEntityId === props.selectedId ? payload.selectionReason : '') || '无调度记录',
    servicePointId: record.servicePointId || record.reservedForPointId || task.servicePointId || task.targetServicePointId || '未关联',
    reservation: reservationId ? `已预留 · ${reservationId}` : '未预留',
    bayId
  }
})
const showCoordination = computed(() => ['robot', 'device', 'center_bay', 'service_point', 'task'].includes(entry.value.type))
const incidentTypeLabel = computed(() => ({
  ROAD_BLOCK: '道路拥堵', DEVICE_FAULT: '智能桶故障', LOW_BATTERY: '设备低电量',
  ROBOT_UNAVAILABLE: '机器人暂停', CENTER_CONGESTION: '中心拥堵'
})[relatedIncident.value?.incidentType] || relatedIncident.value?.incidentType || '—')
const incidentStageLabel = computed(() => ({
  DETECTED: '已发现', CONFIRMED: '已确认', RESPONSE_PLANNED: '响应已规划',
  MITIGATING: '处置中', RECOVERING: '恢复中', RESOLVED: '已解除'
})[relatedIncident.value?.currentStage] || relatedIncident.value?.currentStage || '—')
</script>

<style scoped>
.inspector { min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.inspector-head { padding: 13px 14px 11px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(116,197,255,.18); }
.panel-title { color: #e8f8ff; font-size: 14px; font-weight: 700; }.panel-sub { color: #789fb4; font-size: 10px; margin-top: 3px; }.entity-type { padding: 3px 6px; border-radius: 5px; color: #8fdfff; border: 1px solid rgba(64,177,235,.38); background: rgba(32,106,153,.22); font-size: 9px; }
.entity-summary { padding: 14px; display: flex; align-items: center; gap: 11px; border-bottom: 1px solid rgba(116,197,255,.14); }.entity-symbol { width: 42px; height: 42px; border: 1px solid rgba(66,176,239,.45); border-radius: 10px; display: flex; align-items: center; justify-content: center; background: rgba(21,84,125,.22); }.entity-glyph { width: 27px; height: 27px; border-radius: 7px; display: flex; align-items: center; justify-content: center; color: #fff; background: #2c8fff; font: 800 13px/1 ui-monospace, Consolas, monospace; }.entity-glyph.device { background: #1c8fdc; }.entity-glyph.service-point { background: #11a98c; }.entity-glyph.sorting-center { background: #835ed6; }.entity-glyph.task { background: #d58a22; }.entity-glyph.garbage { background: #d94d57; }
.entity-glyph.incident { background: #d96632; }
.entity-heading { min-width: 0; }.entity-name { color: #f0fbff; font-size: 13px; font-weight: 700; }.entity-id { color: #69bfea; font: 10px/1.3 ui-monospace, Consolas, monospace; margin-top: 4px; overflow-wrap: anywhere; }
.data-section { padding: 10px 14px; border-bottom: 1px solid rgba(116,197,255,.12); }.section-title { color: #8bc9e7; font-size: 11px; font-weight: 700; letter-spacing: .6px; margin-bottom: 7px; display: flex; justify-content: space-between; }.section-title text { color: #5f91aa; }.data-row { min-height: 25px; display: flex; align-items: center; justify-content: space-between; gap: 10px; color: #799eb1; font-size: 10px; }.data-row b { color: #dceff7; font-weight: 600; text-align: right; }.data-row b.warning { color: #ffc76c; }.data-row b.success { color: #79edb5; }.data-row.multiline { align-items: flex-start; }.data-row.multiline b { max-width: 68%; overflow-wrap: anywhere; font: 9px/1.4 ui-monospace, Consolas, monospace; }
.metric-block { margin-top: 8px; }.metric-head { display: flex; justify-content: space-between; color: #82a8ba; font-size: 9px; }.metric-head b { color: #e6f8ff; }.metric-track { height: 5px; margin-top: 5px; border-radius: 99px; overflow: hidden; background: rgba(104,159,187,.18); }.metric-fill { height: 100%; border-radius: inherit; }.metric-fill.fill { background: linear-gradient(90deg,#f5b648,#ff7d48); }.metric-fill.battery { background: linear-gradient(90deg,#0a9c68,#24dda0); }
.tasks-section { min-height: 0; overflow-y: auto; }.task-row { padding: 7px 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; border-bottom: 1px solid rgba(116,197,255,.09); }.task-row view { min-width: 0; }.task-row text,.task-row small { display: block; }.task-row text { color: #dceef6; font-size: 9px; }.task-row small { color: #6791a6; font: 7px/1.3 ui-monospace, Consolas, monospace; margin-top: 2px; }.task-row b { color: #79edb5; font-size: 8px; }.empty-state,.empty-inline { color: #6f93a6; font-size: 10px; text-align: center; padding: 24px 10px; }.empty-inline { padding: 10px; }
.incident-section { background: linear-gradient(90deg,rgba(245,182,72,.07),transparent); }.incident-section .section-title text { color: #ffc76c; }
.coordination-section { background:linear-gradient(90deg,rgba(36,217,255,.045),transparent) }
.panel-title { font-size: 15px; }.panel-sub { font-size: 11px; }.entity-type { font-size: 10px; }
.entity-name { font-size: 14px; }.entity-id { font-size: 11px; }
.section-title { font-size: 12px; }.data-row { min-height: 27px; font-size: 11px; }.data-row.multiline b { font-size: 10px; }
.metric-head { font-size: 10px; }.task-row text { font-size: 10px; }.task-row small { font-size: 8px; }.task-row b { font-size: 9px; }
.empty-state,.empty-inline { font-size: 11px; }
</style>
