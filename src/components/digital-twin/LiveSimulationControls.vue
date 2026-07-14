<template>
  <view class="live-controls panel">
    <view class="section-heading"><text>场景控制</text><text :class="['connection', { online: connected }]">{{ connected ? statusLabel : '连接中' }}</text></view>
    <view class="auto-summary">
      <view><small>仿真时间</small><b>{{ timeOfDay }}</b></view>
      <view><small>客流阶段</small><b>{{ flowPhaseLabel }}</b></view>
      <view><small>固定种子</small><b>{{ randomSeed }}</b></view>
    </view>
    <view class="coordination-summary">
      <view v-for="robot in robotSummaries" :key="robot.id"><small>{{ robot.shortLabel }}</small><b>{{ robot.statusLabel }}</b></view>
      <view><small>可用备用桶</small><b>{{ availableStandbyCount }} / 2</b></view>
      <view><small>中心泊位</small><b>{{ occupiedBayCount }} / 2</b></view>
      <view><small>并行任务</small><b>{{ parallelTaskCount }} / 2</b></view>
    </view>
    <view class="automation-row">
      <label><text>自动运行</text><switch :checked="autoRunEnabled" color="#28c98b" @change="toggle('SET_AUTO_RUN', $event)" /></label>
      <label><text>自动派单</text><switch :checked="autoRobotTaskEnabled" color="#28c98b" @change="toggle('SET_AUTO_ROBOT_TASKS', $event)" /></label>
      <label><text>预测调度</text><switch :checked="autoDispatchEnabled" color="#28c98b" @change="toggle('SET_AUTO_DISPATCH', $event)" /></label>
      <label><text>自动异常</text><switch :checked="autoIncidentEnabled" color="#f5b648" @change="toggle('SET_AUTO_INCIDENT', $event)" /></label>
    </view>
    <view class="incident-row">
      <picker mode="selector" :range="incidentProfiles" range-key="label" :value="incidentProfileIndex" @change="changeIncidentProfile">
        <view class="field"><small>异常强度</small><b>{{ incidentProfiles[incidentProfileIndex].label }}</b></view>
      </picker>
      <view class="incident-count"><small>活动异常</small><b>{{ activeIncidentCount }}</b></view>
      <view :class="['command', 'resolve', { disabled: !activeIncidentCount }]" @tap="resolveIncident">一键解除</view>
    </view>
    <view class="recent-incident"><small>最近异常</small><b>{{ recentIncidentText }}</b></view>
    <view class="metric-grid">
      <view><small>服务可用率</small><b>{{ metrics.servicePointAvailabilityPct ?? 100 }}%</b></view>
      <view><small>异常 / 恢复</small><b>{{ metrics.incidentCount || 0 }} / {{ metrics.autoRecoveryCount || 0 }}</b></view>
      <view><small>平均恢复时长</small><b>{{ metrics.averageRecoveryDuration || 0 }}</b></view>
      <view><small>路线额外代价</small><b>{{ metrics.routeExtraCost || 0 }}</b></view>
      <view><small>等待任务</small><b>{{ metrics.waitingTaskCount || 0 }}</b></view>
      <view><small>中心排队</small><b>{{ metrics.centerQueueCount || 0 }}</b></view>
    </view>
    <view class="control-grid primary-actions">
      <view class="command primary" @tap="emitCommand(running ? 'PAUSE' : 'START')">{{ running ? '暂停仿真' : '开始仿真' }}</view>
      <view class="command" @tap="emitCommand('RESET')">重置</view>
      <picker mode="selector" :range="speedOptions" range-key="label" :value="speedIndex" @change="changeSpeed">
        <view class="command">速度 {{ speed }}×</view>
      </picker>
    </view>

    <view class="control-grid">
      <view class="command accent" @tap="emitCommand('CREATE_LITTER', { garbageId: garbageId, positionM: litterPosition })">产生垃圾</view>
      <view class="command" @tap="emitCommand('ADD_VISITOR', { count: 1, zoneId: 'visitor_walkway' })">增加游客</view>
      <view class="command" @tap="emitCommand('VISITOR_DEPOSIT', { deviceId: selectedDeviceId })">主动投放</view>
    </view>

    <view class="picker-row">
      <picker mode="selector" :range="positionOptions" range-key="label" :value="positionIndex" @change="changePosition">
        <view class="field"><small>垃圾位置</small><b>{{ positionOptions[positionIndex].label }}</b></view>
      </picker>
      <picker mode="selector" :range="flowOptions" range-key="label" :value="flowIndex" @change="changeFlow">
        <view class="field"><small>客流状态</small><b>{{ flowOptions[flowIndex].label }}</b></view>
      </picker>
    </view>

    <view class="fill-row">
      <picker mode="selector" :range="deviceOptions" range-key="label" :value="deviceIndex" @change="changeDevice">
        <view class="field device"><small>指定智能桶</small><b>{{ deviceOptions[deviceIndex].shortLabel }}</b></view>
      </picker>
      <slider class="fill-slider" :value="fillPct" min="0" max="100" step="1" activeColor="#24d9ff" backgroundColor="#183c50" @changing="changeFill" @change="changeFill" />
      <view class="fill-value">{{ fillPct }}%</view>
      <view class="apply" @tap="emitCommand('SET_BIN_FILL', { deviceId: selectedDeviceId, fillPct })">应用</view>
    </view>

    <view class="control-grid secondary">
      <view class="command" @tap="emitCommand('BLOCK_ROAD')">道路拥堵</view>
      <view class="command" @tap="emitCommand('CLEAR_ROAD')">解除拥堵</view>
      <view class="command danger" @tap="emitCommand('DEVICE_FAULT', { deviceId: selectedDeviceId })">设备故障</view>
      <view class="command" @tap="emitCommand('RECOVER_DEVICE', { deviceId: selectedDeviceId })">恢复设备</view>
    </view>
    <view class="snapshot-row">
      <view class="command" @tap="$emit('export-snapshot')">导出快照</view>
      <view class="command" @tap="$emit('restore-snapshot')">恢复快照</view>
    </view>
    <view v-if="message" class="feedback">{{ message }}</view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { displayTwinStatus } from '@/utils/digital-twin-status.js'

const props = defineProps({
  connected: { type: Boolean, default: false },
  running: { type: Boolean, default: false },
  status: { type: String, default: 'READY' },
  speed: { type: Number, default: 1 },
  timeOfDay: { type: String, default: '08:00' },
  flowPhaseLabel: { type: String, default: '早间低峰' },
  randomSeed: { type: Number, default: 20260713 },
  autoRunEnabled: { type: Boolean, default: false },
  autoRobotTaskEnabled: { type: Boolean, default: true },
  autoDispatchEnabled: { type: Boolean, default: true },
  autoIncidentEnabled: { type: Boolean, default: false },
  incidentProfile: { type: String, default: 'normal' },
  incidentState: { type: Object, default: () => ({}) },
  runtimeState: { type: Object, default: () => ({}) },
  message: { type: String, default: '' }
})
const emit = defineEmits(['command', 'export-snapshot', 'restore-snapshot'])
const speedOptions = Object.freeze([{ label: '0.5×', value: .5 }, { label: '1×', value: 1 }, { label: '2×', value: 2 }, { label: '4×', value: 4 }])
const incidentProfiles = Object.freeze([{ label: '稳定', value: 'stable' }, { label: '正常', value: 'normal' }, { label: '压力', value: 'stress' }])
const positionOptions = Object.freeze([
  { label: '主步道', value: [0.3, -0.4, 0] },
  { label: '餐饮区', value: [2.0, -0.8, 0] },
  { label: '休息区', value: [-5.8, 1.2, 0] }
])
const flowOptions = Object.freeze([{ label: '普通客流', value: 'NORMAL' }, { label: '高峰客流', value: 'PEAK' }])
const deviceOptions = Object.freeze([
  { label: '餐饮区智能桶', shortLabel: '餐饮区桶', value: 'device_smart_bin_food_01' },
  { label: '休息区智能桶', shortLabel: '休息区桶', value: 'device_smart_bin_rest_01' }
])
const garbageId = 'garbage_banana_01'
const positionIndex = ref(0)
const flowIndex = ref(0)
const deviceIndex = ref(0)
const fillPct = ref(84)
const selectedDeviceId = computed(() => deviceOptions[deviceIndex.value].value)
const litterPosition = computed(() => positionOptions[positionIndex.value].value)
const speedIndex = computed(() => Math.max(0, speedOptions.findIndex(item => item.value === Number(props.speed))))
const statusLabel = computed(() => displayTwinStatus(props.status, '连接中'))
const incidentProfileIndex = computed(() => Math.max(0, incidentProfiles.findIndex(item => item.value === props.incidentProfile)))
const activeIncidentCount = computed(() => props.incidentState?.active?.length || 0)
const metrics = computed(() => props.incidentState?.metrics || {})
const incidentTypeLabels = Object.freeze({ ROAD_BLOCK: '道路拥堵', DEVICE_FAULT: '智能桶故障', LOW_BATTERY: '设备低电量', ROBOT_UNAVAILABLE: '机器人暂停', CENTER_CONGESTION: '中心拥堵' })
const stageLabels = Object.freeze({ DETECTED: '已发现', CONFIRMED: '已确认', RESPONSE_PLANNED: '响应已规划', MITIGATING: '处置中', RECOVERING: '恢复中', RESOLVED: '已解除' })
const recentIncidentText = computed(() => {
  const incident = props.incidentState?.recent || props.incidentState?.active?.[0]
  return incident ? `${incidentTypeLabels[incident.incidentType] || incident.incidentType} · ${stageLabels[incident.currentStage] || incident.currentStage}` : '暂无'
})
const robotSummaries = computed(() => ['robot_patrol_01', 'robot_patrol_02'].map((id, index) => {
  const robot = props.runtimeState?.robots?.[id] || (props.runtimeState?.robot?.id === id ? props.runtimeState.robot : { id, status: 'PATROLLING' })
  return {
  id,
  shortLabel: `机器人 ${index + 1}`,
  statusLabel: displayTwinStatus(robot.status, '待命')
}}))
const availableStandbyCount = computed(() => {
  const declared = props.runtimeState?.operations?.availableStandbyDeviceCount
  if (declared != null) return Number(declared) || 0
  return ['device_smart_bin_standby_01', 'device_smart_bin_standby_02'].filter(id => {
    const device = props.runtimeState?.devices?.[id]
    return !device || (!device.reservedForPointId && !['FAULT', 'OFFLINE', 'AT_CENTER', 'DOCKING', 'UNLOADING', 'CLEANING', 'CHARGING', 'CHECKING'].includes(device.status))
  }).length
})
const occupiedBayCount = computed(() => Object.values(props.runtimeState?.operations?.centerBays || {}).filter(bay => bay.deviceId).length)
const parallelTaskCount = computed(() => Number(props.runtimeState?.operations?.parallelRobotTaskCount) || 0)

function emitCommand(type, payload = {}) { emit('command', { type, payload }) }
function toggle(type, event) { emitCommand(type, { enabled: !!event?.detail?.value }) }
function changePosition(event) { positionIndex.value = Number(event?.detail?.value) || 0 }
function changeDevice(event) { deviceIndex.value = Number(event?.detail?.value) || 0 }
function changeFill(event) { fillPct.value = Number(event?.detail?.value) || 0 }
function changeFlow(event) {
  flowIndex.value = Number(event?.detail?.value) || 0
  emitCommand('SET_FLOW_MODE', { mode: flowOptions[flowIndex.value].value })
}
function changeSpeed(event) {
  const option = speedOptions[Number(event?.detail?.value)] || speedOptions[1]
  emitCommand('SET_SPEED', { speed: option.value })
}
function changeIncidentProfile(event) {
  const option = incidentProfiles[Number(event?.detail?.value)] || incidentProfiles[1]
  emitCommand('SET_INCIDENT_PROFILE', { profile: option.value })
}
function resolveIncident() {
  const incidentId = props.incidentState?.active?.[0]?.incidentId
  if (incidentId) emitCommand('RESOLVE_INCIDENT', { incidentId })
}
</script>

<style scoped>
.live-controls { flex: 0 0 auto; padding: 10px; }
.section-heading { display: flex; justify-content: space-between; color: #8bc9e7; font-size: 13px; font-weight: 700; }
.connection { color: #7896a6; }.connection.online { color: #72e6ad; }
.auto-summary { display: grid; grid-template-columns: .8fr 1.2fr 1fr; gap: 5px; margin-top: 8px; }
.auto-summary view { padding: 5px 6px; border: 1px solid rgba(126,196,239,.18); border-radius: 7px; background: rgba(7,33,50,.58); }
.auto-summary small,.auto-summary b { display: block; }.auto-summary small { color: #6f93a5; font-size: 9px; }.auto-summary b { margin-top: 2px; color: #d9f3fb; font: 700 11px/1.2 ui-monospace,Consolas,monospace; }
.coordination-summary { display: grid; grid-template-columns: repeat(5,1fr); gap: 4px; margin-top: 5px; }.coordination-summary view { min-width: 0; padding: 4px 5px; border: 1px solid rgba(89,216,255,.16); border-radius: 6px; background: rgba(7,33,50,.48); }.coordination-summary small,.coordination-summary b { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.coordination-summary small { color: #6f93a5; font-size: 8px; }.coordination-summary b { margin-top: 2px; color: #bcefff; font: 700 9px/1.2 ui-monospace,Consolas,monospace; }
.automation-row { display: grid; grid-template-columns: repeat(2,1fr); gap: 4px 7px; margin-top: 7px; }
.automation-row label { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 2px; color: #8fb3c4; font-size: 10px; }
.automation-row switch { transform: scale(.62); transform-origin: right center; margin-left: -8px; }
.control-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 8px; }
.primary-actions { grid-template-columns: 1.2fr .8fr .9fr; }
.secondary { grid-template-columns: repeat(4, 1fr); }
.command,.apply { min-height: 30px; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(126,196,239,.26); border-radius: 7px; color: #cbe4ef; background: rgba(255,255,255,.06); font-size: 11px; }
.command.primary { color: #fff; border-color: rgba(45,155,235,.7); background: linear-gradient(135deg,#1769c9,#2c8fff); }
.command.accent { color: #d8fff0; border-color: rgba(56,211,140,.52); background: rgba(24,128,82,.26); }
.command.danger { color: #ffd4d6; border-color: rgba(255,93,103,.4); }
.picker-row { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 7px; }
.field { min-height: 34px; padding: 5px 7px; box-sizing: border-box; border: 1px solid rgba(126,196,239,.2); border-radius: 7px; background: rgba(7,33,50,.58); }
.field small,.field b { display: block; }.field small { color: #6f93a5; font-size: 9px; }.field b { margin-top: 2px; color: #d6edf6; font-size: 10px; }
.fill-row { display: grid; grid-template-columns: 86px 1fr 38px 42px; gap: 5px; align-items: center; margin-top: 7px; }
.fill-slider { margin: 0; }.fill-value { color: #75dcff; font: 700 10px/1 ui-monospace,Consolas,monospace; }.apply { min-height: 28px; color: #7ce9ba; }
.feedback { margin-top: 7px; color: #ffca76; font-size: 9px; line-height: 1.4; }
.snapshot-row { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 7px; }
.incident-row { display: grid; grid-template-columns: 1.2fr .75fr .85fr; gap: 5px; align-items: stretch; margin-top: 7px; }.incident-count,.metric-grid view { padding: 5px 6px; border: 1px solid rgba(245,182,72,.2); border-radius: 7px; background: rgba(67,43,8,.22); }.incident-count small,.incident-count b,.recent-incident small,.recent-incident b,.metric-grid small,.metric-grid b { display: block; }.incident-count small,.recent-incident small,.metric-grid small { color: #8ca5ae; font-size: 9px; }.incident-count b { margin-top: 2px; color: #ffd27d; font-size: 11px; }.command.resolve { color: #ffd7a0; border-color: rgba(245,182,72,.36); }.command.disabled { opacity: .38; }.recent-incident { margin-top: 5px; padding: 5px 7px; border-left: 2px solid #f5b648; background: rgba(245,182,72,.06); }.recent-incident b { margin-top: 2px; color: #e6f5fa; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.metric-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 4px; margin-top: 5px; }.metric-grid b { margin-top: 2px; color: #d9f3fb; font: 700 10px/1.2 ui-monospace,Consolas,monospace; }
</style>
