<template>
  <view :class="['robot-page', { 'dark-mode': isDarkTheme, 'is-running': actionState === 'running' }]">
    <view class="ambient-layer">
      <view class="ambient-grid"></view>
      <view class="halo halo-a"></view>
      <view class="halo halo-b"></view>
      <view class="leaf leaf-a">♻</view>
      <view class="leaf leaf-b">✦</view>
      <view class="leaf leaf-c">●</view>
    </view>

    <view class="hero">
      <view class="safe-area"></view>
      <view class="back-btn" @tap="goBack">
        <text>‹</text>
      </view>
      <view class="hero-title-row">
        <view class="title-wrap">
          <view class="title-icon-box">
            <image class="title-icon" src="/static/colorful-bin.png" mode="aspectFit"></image>
          </view>
          <view>
            <text class="page-title">机器人控制</text>
            <text class="page-subtitle">任务启动 · 状态监控 · 闭环执行</text>
          </view>
        </view>
      </view>
    </view>

    <scroll-view class="content-scroll" scroll-y enhanced :show-scrollbar="false">
      <view class="content">
        <view class="robot-card panel">
          <view class="robot-main">
            <view class="robot-copy">
              <view class="section-kicker">机器人名称</view>
              <text class="robot-name">{{ robot.name }}</text>
              <view class="robot-state-line">
                <view :class="['state-dot', actionState]"></view>
                <text>当前状态：{{ statusLabel }}</text>
              </view>
              <view class="robot-task-line">
                <text class="task-icon">▣</text>
                <text>今日任务：{{ currentTask.title }}</text>
              </view>
            </view>

            <view class="robot-visual">
              <view class="ready-chip">
                <text class="ready-dot"></text>
                <text>{{ robot.onlineText }}</text>
              </view>
              <image class="mobile-robot-image" :src="robotImageUrl" mode="aspectFit" @error="useFallbackRobotImage"></image>
              <SortingWorkflowPlayer
                class="hero-workflow-player"
                :stage="workflowStage"
                :autoplay="workflowAutoplay"
                src="/static/sorting-robot/layers"
                rig-src="/static/sorting-robot/rig.json"
                timeline-src="/static/sorting-robot/timeline.json"
                @error="handleWorkflowAssetError"
              />
            </view>
          </view>

          <view class="control-actions">
            <view class="primary-action" @tap="startOrResumeTask">
              <text class="action-symbol">{{ actionState === 'paused' ? '▶' : '▶' }}</text>
              <text>{{ actionState === 'paused' ? '继续任务' : '开始任务' }}</text>
            </view>
            <view :class="['secondary-action', { disabled: actionState !== 'running' }]" @tap="pauseTask">
              <text class="action-symbol">Ⅱ</text>
              <text>暂停任务</text>
            </view>
            <view class="danger-action" @tap="emergencyStop">
              <text class="danger-dot">!</text>
              <text>紧急停止</text>
            </view>
          </view>
        </view>

        <view class="status-panel panel">
          <view class="panel-title-row">
            <view class="panel-title">
              <text class="panel-icon">▤</text>
              <text>任务状态信息</text>
            </view>
            <view class="sync-chip">{{ syncLabel }}</view>
          </view>

          <view class="status-grid">
            <view v-for="item in statusItems" :key="item.label" class="status-item">
              <view :class="['status-icon', item.tone]">{{ item.icon }}</view>
              <view class="status-texts">
                <text class="status-label">{{ item.label }}</text>
                <text :class="['status-value', item.tone]">{{ item.value }}</text>
              </view>
            </view>
          </view>
        </view>

        <view class="progress-panel panel">
          <view class="panel-title">
            <text class="panel-icon">◒</text>
            <text>闭环执行进度</text>
          </view>

          <view class="progress-track">
            <view class="track-line"></view>
            <view class="track-fill" :style="{ width: progressLineWidth }"></view>
            <view v-for="(step, index) in steps" :key="step.key" :class="['step-node', stepState(index)]">
              <view class="node-circle">
                <text>{{ step.icon }}</text>
              </view>
              <text class="node-label">{{ step.label }}</text>
              <text class="node-mark">{{ stepState(index) === 'done' ? '✓' : stepState(index) === 'active' ? '◌' : '•' }}</text>
            </view>
          </view>
        </view>

        <view class="feedback-panel panel">
          <view class="panel-title-row">
            <view class="panel-title">
              <text class="panel-icon">●</text>
              <text>实时反馈</text>
            </view>
            <view class="more-link" @tap="appendDiagnosticLog">查看全部 ›</view>
          </view>

          <view class="feedback-list">
            <view v-for="entry in feedbackLogs" :key="entry.id" class="feedback-item">
              <text class="feedback-dot"></text>
              <text class="feedback-time">{{ entry.time }}</text>
              <text class="feedback-text">{{ entry.text }}</text>
            </view>
          </view>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { onHide, onLoad, onShow } from '@dcloudio/uni-app'
import SortingWorkflowPlayer from '@/components/SortingWorkflowPlayer.vue'
import { baseUrl } from '@/api/settings.js'
import { mapRobotWorkflowStage } from '@/utils/sorting-workflow.js'
import {
  fetchRobotControlSnapshot,
  fetchRobotTasks,
  reportRobotExecution,
  sendRobotDeviceCommand,
  sendRobotTaskAction
} from '@/api/robot-control.js'

const isDarkTheme = ref(false)
const syncState = ref('local')
const actionState = ref('idle')
const activeStep = ref(0)
const progressPct = ref(0)
const routeDeviceId = ref('')
const isMockMode = ref(false)
const robotImageFailed = ref(false)
const remoteDeviceState = ref('idle')
const workflowPageVisible = ref(true)
const taskId = ref('')
const latestTaskStateAt = ref(0)
let taskTimer = 0
let remotePollTimer = 0
const commandRefreshTimers = []
let logId = 4
let lastRemoteSignature = ''

const robot = ref({
  id: 'robot-01',
  name: '分投侠-01',
  battery: 81,
  onlineText: '在线 / Ready',
  coordinates: '[1.036, -0.153, 0.565] m',
  phase: '导航至抓取点',
  target: '金属罐',
  bin: '蓝色可回收箱',
  grasp: '待命中',
  category: '可回收物'
})

const currentTask = ref({
  title: '垃圾分类投放',
  stage: '导航至抓取点',
  target: '金属罐',
  bin: '蓝色可回收箱'
})

const feedbackLogs = ref([
  { id: 1, time: '10:28:16', text: '已完成目标识别' },
  { id: 2, time: '10:28:24', text: '已到达抓取站位' },
  { id: 3, time: '10:28:31', text: '机械臂准备执行抓取' }
])

const steps = [
  { key: 'recognize', label: '识别', icon: '◎' },
  { key: 'navigate', label: '导航', icon: '⌖' },
  { key: 'grasp', label: '抓取', icon: '♙' },
  { key: 'drop', label: '投放', icon: '▥' },
  { key: 'return', label: '返回', icon: '↶' }
]

const robotImageUrl = computed(() => robotImageFailed.value
  ? '/static/robot-control-robot.png'
  : `${baseUrl}/images/lejv.webp`)

function useFallbackRobotImage() {
  robotImageFailed.value = true
}

const statusLabel = computed(() => {
  if (actionState.value === 'running') return '执行中'
  if (actionState.value === 'paused') return '已暂停'
  if (actionState.value === 'stopped') return '紧急停止'
  return '待命中'
})

const syncLabel = computed(() => (syncState.value === 'cloud' ? '已同步' : '本地演示'))

const progressLineWidth = computed(() => {
  if (workflowStage.value === 'idle') return '0%'
  return `${Math.min(100, Math.max(0, progressPct.value))}%`
})

const workflowStage = computed(() => mapRobotWorkflowStage({
  actionState: actionState.value,
  deviceState: remoteDeviceState.value,
  taskStage: currentTask.value.stage,
  progress: progressPct.value,
  hasTask: Boolean(currentTask.value.title)
}))

const workflowAutoplay = computed(() => (
  workflowPageVisible.value && actionState.value === 'running' && workflowStage.value !== 'error'
))

const statusItems = computed(() => [
  { icon: '➤', label: '当前阶段', value: currentTask.value.stage, tone: 'green' },
  { icon: '▣', label: '当前目标', value: currentTask.value.target, tone: 'blue' },
  { icon: '♻', label: '垃圾类别', value: robot.value.category, tone: 'green' },
  { icon: '▥', label: '目标垃圾桶', value: currentTask.value.bin, tone: 'blue' },
  { icon: '◎', label: 'RGB-D定位', value: robot.value.coordinates, tone: 'mint' },
  { icon: '♙', label: '抓取状态', value: robot.value.grasp, tone: actionState.value === 'running' ? 'green' : 'orange' }
])

function checkTheme() {
  try {
    isDarkTheme.value = uni.getStorageSync('app_theme') === 'dark'
  } catch (e) {
    isDarkTheme.value = false
  }
}

function stepState(index) {
  if (workflowStage.value === 'idle') return 'pending'
  if (workflowStage.value === 'completed') return 'done'
  if (index < activeStep.value) return 'done'
  if (index === activeStep.value) return 'active'
  return 'pending'
}

function formatLogTime() {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
}

function pushLog(text) {
  feedbackLogs.value.unshift({
    id: ++logId,
    time: formatLogTime(),
    text
  })
  feedbackLogs.value = feedbackLogs.value.slice(0, 4)
}

function handleWorkflowAssetError() {
  if (!robotImageFailed.value) {
    useFallbackRobotImage()
    pushLog('机器人素材加载失败，流程示意已切换本地素材')
  }
}

function setStep(index) {
  activeStep.value = Math.min(Math.max(index, 0), steps.length - 1)
  progressPct.value = (activeStep.value / Math.max(steps.length - 1, 1)) * 100
  const stageMap = ['目标识别完成', '导航至抓取点', '机械臂抓取中', '投放至目标桶', '返回待命区']
  currentTask.value.stage = stageMap[activeStep.value] || currentTask.value.stage
}

function applyRemoteProgress(progress, phase) {
  const normalized = Math.min(100, Math.max(0, Number(progress)))
  if (!Number.isFinite(normalized)) return
  progressPct.value = normalized
  const thresholds = [0, 20, 45, 70, 90]
  activeStep.value = thresholds.reduce((step, threshold, index) => (
    normalized >= threshold ? index : step
  ), 0)
  if (phase) currentTask.value.stage = phase
}

function startTaskLoop() {
  clearInterval(taskTimer)
  taskTimer = setInterval(() => {
    if (actionState.value !== 'running') return
    if (activeStep.value < steps.length - 1) {
      setStep(activeStep.value + 1)
      const current = steps[activeStep.value]
      robot.value.grasp = current.key === 'grasp' ? '执行中' : current.key === 'drop' ? '已抓取' : '执行中'
      pushLog(`${current.label}阶段已进入执行队列`)
      return
    }
    actionState.value = 'idle'
    robot.value.grasp = '已完成'
    pushLog('闭环任务完成，机器人返回待命')
    clearInterval(taskTimer)
  }, 1800)
}

async function startOrResumeTask() {
  if (actionState.value === 'running') return
  const previousState = actionState.value
  actionState.value = 'running'
  remoteDeviceState.value = 'running'
  robot.value.grasp = activeStep.value >= 2 ? '执行中' : '准备中'
  if (activeStep.value >= steps.length - 1 || previousState === 'stopped') {
    setStep(0)
  }
  pushLog(previousState === 'paused' ? '任务继续执行' : '任务已启动，进入闭环流程')
  if (isMockMode.value) startTaskLoop()
  await sendTaskAction(previousState === 'paused' ? 'resume' : 'start')
}

async function pauseTask() {
  if (actionState.value !== 'running') return
  actionState.value = 'paused'
  remoteDeviceState.value = 'paused'
  robot.value.grasp = '暂停中'
  clearInterval(taskTimer)
  pushLog('任务已暂停，保持当前安全位姿')
  await sendTaskAction('pause')
}

async function emergencyStop() {
  actionState.value = 'stopped'
  remoteDeviceState.value = 'emergency_stopped'
  robot.value.grasp = '安全停止'
  clearInterval(taskTimer)
  pushLog('紧急停止已触发，执行机构锁止')
  await sendTaskAction('emergency_stop')
}

function scheduleCommandRefresh() {
  if (isMockMode.value) return
  ;[1200, 2600].forEach((delay) => {
    const timer = setTimeout(loadRemoteState, delay)
    commandRefreshTimers.push(timer)
  })
}

async function sendTaskAction(action) {
  if (isMockMode.value) {
    syncState.value = 'local'
    return
  }
  try {
    if (taskId.value) {
      await sendRobotTaskAction(taskId.value, action, {
        deviceId: robot.value.id,
        progress: Math.round(progressPct.value)
      })
      syncState.value = 'cloud'
      scheduleCommandRefresh()
      return
    }
    await sendRobotDeviceCommand(robot.value.id, action, {
      progress: Math.round(progressPct.value),
      timestamp: new Date().toISOString()
    })
    syncState.value = 'cloud'
    scheduleCommandRefresh()
  } catch (e) {
    try {
      await reportRobotExecution(robot.value.id, {
        status: action === 'emergency_stop' ? 'cancelled' : action === 'pause' ? 'paused' : 'running',
        progress: Math.round(progressPct.value),
        message: `robot-control:${action}`,
        timestamp: new Date().toISOString()
      })
    } catch (_) {}
    syncState.value = 'local'
  }
}

function appendDiagnosticLog() {
  const messages = [
    '电机电流稳定，夹爪压力正常',
    '视觉置信度 96%，目标边界已锁定',
    '底盘姿态正常，路径偏差 0.03m',
    '投放口空闲，允许执行下一步'
  ]
  pushLog(messages[Math.floor(Math.random() * messages.length)])
}

function normalizeSnapshot(payload) {
  const raw = payload && payload.data
  const item = Array.isArray(raw) ? raw[0] : raw && Array.isArray(raw.items) ? raw.items[0] : raw
  if (!item || typeof item !== 'object') return

  robot.value = {
    ...robot.value,
    id: item.id || item.device_id || robot.value.id,
    name: item.name || item.device_name || robot.value.name,
    onlineText: String(item.status || '').toLowerCase() === 'online' ? '在线 / Ready' : robot.value.onlineText,
    category: item.type === 'smart' ? '智能分类设备' : robot.value.category,
    battery: Math.round(Number(item.batteryPct || item.battery || robot.value.battery)),
    coordinates: Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude))
      ? `[${Number(item.latitude).toFixed(3)}, ${Number(item.longitude).toFixed(3)}, 0.565] m`
      : robot.value.coordinates,
    grasp: item.deviceState || robot.value.grasp
  }
  if (item.taskStatus) {
    currentTask.value.stage = item.taskStatus
  }
  const remoteState = String(item.deviceState || '').toLowerCase()
  remoteDeviceState.value = remoteState || remoteDeviceState.value
  if (remoteState === 'running') actionState.value = 'running'
  if (remoteState === 'paused') actionState.value = 'paused'
  if (['stopped', 'emergency_stopped', 'cancelled'].includes(remoteState)) actionState.value = 'stopped'
  if (['idle', 'completed', 'succeeded'].includes(remoteState)) actionState.value = 'idle'
  const remoteProgress = item.progress
  const remotePhase = item.currentPhase || item.taskStatus
  const snapshotStateAt = Date.parse(
    item.reportedAt || item.cachedAt || item.lastTelemetryAt || item.updatedAt || ''
  ) || 0
  const taskStateIsNewer = latestTaskStateAt.value > snapshotStateAt
  if (!taskStateIsNewer) {
    if (Number.isFinite(Number(remoteProgress))) {
      applyRemoteProgress(remoteProgress, remotePhase)
    } else if (remotePhase) {
      currentTask.value.stage = remotePhase
    }
  }
  if (remoteState !== 'running') clearInterval(taskTimer)
  syncState.value = 'cloud'
}

function normalizeTasks(payload) {
  const data = payload && payload.data
  const items = data && Array.isArray(data.items) ? data.items : []
  const active = items.find((item) => ['pending', 'dispatched', 'running', 'paused'].includes(item.status))
  if (!active) {
    latestTaskStateAt.value = 0
    return
  }
  taskId.value = active.id || ''
  latestTaskStateAt.value = Date.parse(active.updatedAt || active.createdAt || '') || 0
  currentTask.value = {
    ...currentTask.value,
    title: active.taskNo || currentTask.value.title,
    stage: active.status || currentTask.value.stage,
    target: active.type === 'replacement' ? '备用桶' : currentTask.value.target,
    bin: active.deviceId ? `设备 ${active.deviceId}` : currentTask.value.bin
  }
  if (Number.isFinite(Number(active.progress))) {
    applyRemoteProgress(
      active.progress,
      active.currentPhase || active.phase || active.status
    )
  }
  syncState.value = 'cloud'
}

async function loadRemoteState() {
  const deviceId = routeDeviceId.value || robot.value.id
  const [snapshot, tasks] = await Promise.allSettled([
    fetchRobotControlSnapshot(deviceId),
    fetchRobotTasks({ deviceId, limit: 10 })
  ])

  if (tasks.status === 'fulfilled') normalizeTasks(tasks.value)
  // 设备遥测是机器人当前状态的最终事实来源，最后应用以覆盖可能滞后的任务记录。
  if (snapshot.status === 'fulfilled') normalizeSnapshot(snapshot.value)

  const signature = `${actionState.value}|${Math.round(progressPct.value)}|${currentTask.value.stage}`
  if ((snapshot.status === 'fulfilled' || tasks.status === 'fulfilled') && signature !== lastRemoteSignature) {
    lastRemoteSignature = signature
    pushLog('云端状态已同步到机器人控制台')
  }
}

function goBack() {
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
  if (pages.length > 1) {
    uni.navigateBack()
    return
  }
  uni.reLaunch({ url: isDarkTheme.value ? '/pages-dark/home/home' : '/pages/home/home' })
}

onLoad((options = {}) => {
  routeDeviceId.value = options.deviceId || options.device_id || ''
  isMockMode.value = ['1', 'true', 'yes'].includes(String(options.mock || '').toLowerCase())
  if (routeDeviceId.value) {
    robot.value.id = routeDeviceId.value
  }
  if (options.deviceName || options.device_name) {
    const routeName = options.deviceName || options.device_name
    try {
      robot.value.name = decodeURIComponent(routeName)
    } catch (e) {
      robot.value.name = routeName
    }
  }
  checkTheme()
  if (isMockMode.value) {
    robot.value.onlineText = '模拟在线 / Demo'
    pushLog('模拟设备连接成功，控制台已进入本地演示模式')
    return
  }
  loadRemoteState()
  remotePollTimer = setInterval(loadRemoteState, 4000)
})

onShow(() => {
  workflowPageVisible.value = true
  checkTheme()
})

onHide(() => {
  workflowPageVisible.value = false
})

onBeforeUnmount(() => {
  clearInterval(taskTimer)
  clearInterval(remotePollTimer)
  commandRefreshTimers.forEach(clearTimeout)
})
</script>

<style scoped>
.robot-page {
  min-height: 100vh;
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(ellipse 54% 30% at 88% 8%, rgba(16, 185, 129, 0.15), transparent 72%),
    radial-gradient(ellipse 44% 28% at 7% 57%, rgba(56, 189, 248, 0.1), transparent 74%),
    radial-gradient(ellipse 48% 24% at 78% 88%, rgba(245, 158, 11, 0.055), transparent 76%),
    linear-gradient(180deg, #effcf7 0%, #f6fcfa 36%, #f5faff 74%, #f8fafc 100%);
  color: #16342c;
}

.robot-page.dark-mode {
  background:
    radial-gradient(circle at 18% 8%, rgba(34, 197, 94, 0.22), transparent 28%),
    radial-gradient(circle at 80% 18%, rgba(56, 189, 248, 0.22), transparent 32%),
    linear-gradient(180deg, #06151f 0%, #0b1724 48%, #101827 100%);
  color: #e5f8f2;
}

.ambient-layer {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}

.ambient-grid {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgba(16, 185, 129, 0.18) 1rpx, transparent 1.2rpx);
  background-size: 42rpx 42rpx;
  opacity: 0.36;
  mask-image: linear-gradient(180deg, rgba(0,0,0,0.55), transparent 65%);
  -webkit-mask-image: linear-gradient(180deg, rgba(0,0,0,0.55), transparent 65%);
}

.halo {
  position: absolute;
  border-radius: 50%;
  filter: blur(8rpx);
  opacity: 0.3;
}

.halo-a {
  width: 360rpx;
  height: 360rpx;
  top: -120rpx;
  left: -96rpx;
  background: rgba(16, 185, 129, 0.34);
}

.halo-b {
  width: 420rpx;
  height: 420rpx;
  right: -160rpx;
  top: 210rpx;
  background: rgba(56, 189, 248, 0.22);
}

.leaf {
  position: absolute;
  color: rgba(16, 185, 129, 0.18);
  font-weight: 800;
  animation: floatLeaf 7s ease-in-out infinite;
}

.leaf-a { top: 96rpx; left: 100rpx; font-size: 42rpx; }
.leaf-b { top: 292rpx; right: 84rpx; font-size: 30rpx; animation-delay: 1.2s; }
.leaf-c { bottom: 292rpx; right: 116rpx; font-size: 22rpx; animation-delay: 2s; }

@keyframes floatLeaf {
  0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); opacity: 0.22; }
  50% { transform: translate3d(14rpx, -18rpx, 0) rotate(10deg); opacity: 0.42; }
}

.hero {
  position: relative;
  z-index: 2;
  min-height: 324rpx;
  padding: 0 28rpx 48rpx;
  background:
    radial-gradient(circle at 22% 35%, rgba(255, 255, 255, 0.18), transparent 28%),
    linear-gradient(135deg, #10b981 0%, #059669 48%, #0f9f93 100%);
  box-shadow: 0 14rpx 36rpx rgba(5, 150, 105, 0.18);
}

.dark-mode .hero {
  background:
    radial-gradient(circle at 22% 35%, rgba(56, 189, 248, 0.22), transparent 30%),
    linear-gradient(135deg, #0f766e 0%, #0f172a 72%, #111827 100%);
  box-shadow: 0 18rpx 50rpx rgba(2, 6, 23, 0.48);
}

.safe-area {
  height: env(safe-area-inset-top);
  min-height: 18rpx;
}

.hero-title-row {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 18rpx;
  min-height: 86rpx;
}

.back-btn {
  position: absolute;
  left: 24rpx;
  top: calc(env(safe-area-inset-top) + 18rpx);
  z-index: 8;
  width: 62rpx;
  height: 62rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.18);
  border: 1rpx solid rgba(255, 255, 255, 0.26);
  color: #ffffff;
  backdrop-filter: blur(18rpx);
}

.back-btn:active {
  transform: scale(0.94);
}

.back-btn text {
  font-size: 52rpx;
  line-height: 1;
  font-weight: 300;
  transform: translateY(-3rpx);
}

.title-wrap {
  display: flex;
  align-items: center;
  gap: 18rpx;
}

.title-icon-box {
  width: 66rpx;
  height: 66rpx;
  border-radius: 18rpx;
  background: rgba(255, 255, 255, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1rpx solid rgba(255, 255, 255, 0.28);
}

.title-icon {
  width: 48rpx;
  height: 48rpx;
}

.page-title,
.page-subtitle,
.robot-name,
.section-kicker,
.status-label,
.status-value,
.node-label,
.node-mark,
.feedback-time,
.feedback-text,
.sync-chip,
.more-link {
  display: block;
}

.page-title {
  color: #ffffff;
  font-size: 38rpx;
  font-weight: 800;
  line-height: 1.18;
}

.page-subtitle {
  margin-top: 8rpx;
  color: rgba(255, 255, 255, 0.78);
  font-size: 22rpx;
  letter-spacing: 0;
}

.content-scroll {
  position: relative;
  z-index: 3;
  height: calc(100vh - 92rpx);
  margin-top: -42rpx;
  padding-bottom: 34rpx;
  box-sizing: border-box;
}

.content {
  padding: 0 28rpx 42rpx;
}

.panel {
  position: relative;
  border-radius: 18rpx;
  background: rgba(255, 255, 255, 0.94);
  border: 1rpx solid rgba(255, 255, 255, 0.86);
  box-shadow: 0 10rpx 28rpx rgba(15, 118, 110, 0.09);
  backdrop-filter: blur(16rpx);
  overflow: hidden;
}

.dark-mode .panel {
  background: rgba(15, 23, 42, 0.84);
  border-color: rgba(148, 163, 184, 0.16);
  box-shadow: 0 16rpx 42rpx rgba(2, 6, 23, 0.38);
}

.robot-card {
  padding: 22rpx 28rpx 20rpx;
}

.robot-card::after,
.feedback-panel::after {
  content: '';
  position: absolute;
  right: -36rpx;
  bottom: -32rpx;
  width: 220rpx;
  height: 180rpx;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(16, 185, 129, 0.12), transparent 70%);
}

.robot-main {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 250rpx;
  min-height: 284rpx;
}

.robot-copy {
  position: relative;
  z-index: 2;
  padding-top: 16rpx;
  min-width: 0;
}

.section-kicker {
  color: #334155;
  font-size: 24rpx;
  font-weight: 700;
}

.dark-mode .section-kicker {
  color: #cbd5e1;
}

.robot-name {
  margin-top: 10rpx;
  color: #059669;
  font-size: 38rpx;
  font-weight: 900;
  line-height: 1.1;
}

.dark-mode .robot-name {
  color: #34d399;
}

.robot-state-line,
.robot-task-line {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-top: 18rpx;
  color: #475569;
  font-size: 24rpx;
  font-weight: 600;
}

.dark-mode .robot-state-line,
.dark-mode .robot-task-line {
  color: rgba(226, 232, 240, 0.82);
}

.state-dot {
  width: 18rpx;
  height: 18rpx;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 0 8rpx rgba(34, 197, 94, 0.12);
}

.state-dot.running {
  animation: signalPulse 1.2s ease-in-out infinite;
}

.state-dot.paused {
  background: #f59e0b;
  box-shadow: 0 0 0 8rpx rgba(245, 158, 11, 0.14);
}

.state-dot.stopped {
  background: #ef4444;
  box-shadow: 0 0 0 8rpx rgba(239, 68, 68, 0.14);
}

@keyframes signalPulse {
  0%, 100% { box-shadow: 0 0 0 8rpx rgba(34, 197, 94, 0.12); }
  50% { box-shadow: 0 0 0 16rpx rgba(34, 197, 94, 0.02); }
}

.task-icon {
  color: #059669;
  font-size: 27rpx;
}

.robot-visual {
  position: relative;
  min-width: 0;
}

.hero-workflow-player {
  display: none;
  width: 100%;
  height: 100%;
}

.mobile-robot-image {
  position: absolute;
  right: -12rpx;
  top: 8rpx;
  z-index: 3;
  width: 246rpx;
  height: 322rpx;
  filter: drop-shadow(0 22rpx 24rpx rgba(15, 23, 42, 0.2));
  animation: robotFloat 3.6s ease-in-out infinite;
}

.ready-chip {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 12rpx 18rpx;
  border-radius: 999rpx;
  color: #047857;
  background: rgba(220, 252, 231, 0.92);
  font-size: 22rpx;
  font-weight: 700;
  box-shadow: 0 8rpx 20rpx rgba(16, 185, 129, 0.12);
}

.dark-mode .ready-chip {
  color: #bbf7d0;
  background: rgba(20, 83, 45, 0.62);
  border: 1rpx solid rgba(74, 222, 128, 0.18);
}

.ready-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: #22c55e;
}

.robot-glow {
  position: absolute;
  right: 10rpx;
  bottom: 12rpx;
  width: 230rpx;
  height: 230rpx;
  border-radius: 50%;
  background:
    radial-gradient(circle, rgba(16, 185, 129, 0.24), rgba(34, 197, 94, 0.08) 50%, transparent 72%);
  animation: glowBreath 3s ease-in-out infinite;
}

@keyframes glowBreath {
  0%, 100% { transform: scale(0.96); opacity: 0.72; }
  50% { transform: scale(1.04); opacity: 1; }
}

.robot-image {
  position: absolute;
  right: -12rpx;
  top: 8rpx;
  bottom: auto;
  z-index: 3;
  width: 246rpx;
  height: 322rpx;
  filter: drop-shadow(0 22rpx 24rpx rgba(15, 23, 42, 0.2));
  animation: robotFloat 3.6s ease-in-out infinite;
}

.is-running .robot-image {
  animation-duration: 2.4s;
}

@keyframes robotFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10rpx); }
}

.orbit {
  position: absolute;
  right: 0;
  bottom: 22rpx;
  border-radius: 50%;
  border: 3rpx solid rgba(16, 185, 129, 0.1);
  transform: rotateX(64deg);
}

.orbit-one {
  width: 214rpx;
  height: 104rpx;
}

.orbit-two {
  width: 152rpx;
  height: 72rpx;
  right: 30rpx;
  bottom: 44rpx;
}

.control-actions {
  position: relative;
  z-index: 5;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 18rpx;
  margin-top: 12rpx;
}

.primary-action,
.secondary-action,
.danger-action {
  min-height: 58rpx;
  padding: 0 26rpx;
  border-radius: 999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  font-size: 24rpx;
  font-weight: 800;
  transition: transform 0.18s ease, opacity 0.18s ease;
}

.primary-action:active,
.secondary-action:active,
.danger-action:active {
  transform: scale(0.96);
}

.primary-action {
  color: #ffffff;
  background: linear-gradient(135deg, #10b981, #059669);
  box-shadow: 0 12rpx 26rpx rgba(16, 185, 129, 0.26);
}

.secondary-action {
  color: #f97316;
  border: 2rpx solid rgba(249, 115, 22, 0.42);
  background: rgba(255, 247, 237, 0.9);
}

.dark-mode .secondary-action {
  color: #fdba74;
  background: rgba(67, 32, 14, 0.62);
}

.secondary-action.disabled {
  opacity: 0.48;
}

.danger-action {
  color: #ef4444;
  background: rgba(254, 242, 242, 0.84);
  border: 1rpx solid rgba(248, 113, 113, 0.24);
}

.dark-mode .danger-action {
  color: #fca5a5;
  background: rgba(69, 10, 10, 0.5);
  border-color: rgba(248, 113, 113, 0.18);
}

.danger-dot {
  width: 26rpx;
  height: 26rpx;
  border-radius: 50%;
  color: #ffffff;
  background: #ef4444;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18rpx;
}

.status-panel,
.progress-panel,
.feedback-panel {
  margin-top: 12rpx;
  padding: 18rpx;
}

.panel-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 10rpx;
  color: #1f2937;
  font-size: 26rpx;
  font-weight: 900;
}

.dark-mode .panel-title {
  color: #f8fafc;
}

.panel-icon {
  width: 30rpx;
  height: 30rpx;
  border-radius: 8rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  background: linear-gradient(135deg, #10b981, #0ea5e9);
  font-size: 18rpx;
}

.sync-chip,
.more-link {
  flex-shrink: 0;
  color: #059669;
  font-size: 22rpx;
  font-weight: 700;
}

.dark-mode .sync-chip,
.dark-mode .more-link {
  color: #5eead4;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14rpx 12rpx;
  margin-top: 18rpx;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 14rpx;
  min-width: 0;
}

.status-icon {
  width: 42rpx;
  height: 42rpx;
  border-radius: 14rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 22rpx;
  flex: 0 0 auto;
}

.status-icon.green { background: linear-gradient(135deg, #22c55e, #10b981); }
.status-icon.blue { background: linear-gradient(135deg, #38bdf8, #2563eb); }
.status-icon.mint { background: linear-gradient(135deg, #2dd4bf, #059669); }
.status-icon.orange { background: linear-gradient(135deg, #fb923c, #f97316); }

.status-texts {
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 8rpx;
}

.status-label {
  color: #64748b;
  font-size: 20rpx;
  flex-shrink: 0;
}

.dark-mode .status-label {
  color: #94a3b8;
}

.status-value {
  color: #334155;
  font-size: 20rpx;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dark-mode .status-value {
  color: #e2e8f0;
}

.status-value.green { color: #059669; }
.status-value.blue { color: #2563eb; }
.status-value.mint { color: #0f766e; }
.status-value.orange { color: #f97316; }
.dark-mode .status-value.green { color: #34d399; }
.dark-mode .status-value.blue { color: #7dd3fc; }
.dark-mode .status-value.mint { color: #5eead4; }
.dark-mode .status-value.orange { color: #fdba74; }

.progress-track {
  position: relative;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0;
  margin-top: 22rpx;
  padding: 0 4rpx 2rpx;
}

.track-line,
.track-fill {
  position: absolute;
  left: 9%;
  right: 9%;
  top: 39rpx;
  height: 6rpx;
  border-radius: 99rpx;
}

.track-line {
  background: #d1d5db;
}

.track-fill {
  right: auto;
  width: 0;
  background: linear-gradient(90deg, #22c55e, #10b981, #38bdf8);
  transition: width 0.4s ease;
}

.step-node {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  min-width: 0;
}

.node-circle {
  width: 62rpx;
  height: 62rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  background: #eef2f7;
  border: 4rpx solid #ffffff;
  box-shadow: 0 8rpx 18rpx rgba(15, 23, 42, 0.08);
}

.dark-mode .node-circle {
  color: #64748b;
  background: #1e293b;
  border-color: #0f172a;
}

.step-node.done .node-circle,
.step-node.active .node-circle {
  color: #ffffff;
  background: linear-gradient(135deg, #22c55e, #10b981);
  box-shadow: 0 10rpx 24rpx rgba(16, 185, 129, 0.24);
}

.step-node.active .node-circle {
  animation: nodePulse 1.2s ease-in-out infinite;
}

@keyframes nodePulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.08); }
}

.node-label {
  color: #475569;
  font-size: 20rpx;
  font-weight: 700;
  white-space: nowrap;
}

.dark-mode .node-label {
  color: #cbd5e1;
}

.step-node.pending .node-label,
.step-node.pending .node-mark {
  color: #94a3b8;
}

.node-mark {
  color: #10b981;
  font-size: 20rpx;
  font-weight: 900;
  height: 24rpx;
}

.feedback-list {
  margin-top: 14rpx;
}

.feedback-item {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: 18rpx 110rpx minmax(0, 1fr);
  align-items: center;
  gap: 10rpx;
  min-height: 38rpx;
  border-bottom: 1rpx solid rgba(148, 163, 184, 0.16);
}

.feedback-item:last-child {
  border-bottom: none;
}

.feedback-dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  background: #22c55e;
}

.feedback-time {
  color: #64748b;
  font-size: 22rpx;
}

.feedback-text {
  color: #334155;
  font-size: 22rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dark-mode .feedback-time {
  color: #94a3b8;
}

.dark-mode .feedback-text {
  color: #e2e8f0;
}

@media (min-width: 768px) {
  .hero {
    min-height: 280rpx;
    padding-bottom: 38rpx;
  }

  .content-scroll {
    margin-top: -82rpx;
  }

  .content {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-areas:
      "robot robot"
      "status progress"
      "feedback feedback";
    gap: 18rpx;
    width: 100%;
    max-width: 3360rpx;
    margin: 0 auto;
    padding-bottom: 56rpx;
  }

  .robot-card {
    grid-area: robot;
    padding: 34rpx 42rpx 30rpx;
  }

  .robot-main {
    grid-template-columns: minmax(320rpx, .72fr) minmax(0, 1.28fr);
    min-height: 480rpx;
  }

  .robot-visual {
    min-height: 420rpx;
  }

  .hero-workflow-player {
    display: block;
  }

  .mobile-robot-image {
    display: none;
  }

  .robot-image {
    right: -36rpx;
    top: 18rpx;
    bottom: auto;
    width: 620rpx;
    height: 620rpx;
  }

  .robot-glow {
    width: 520rpx;
    height: 520rpx;
  }

  .orbit-one {
    width: 460rpx;
    height: 184rpx;
  }

  .orbit-two {
    width: 336rpx;
    height: 132rpx;
    right: 70rpx;
  }

  .status-panel,
  .progress-panel,
  .feedback-panel {
    margin-top: 0;
    padding: 28rpx 30rpx;
  }

  .status-panel { grid-area: status; }
  .progress-panel { grid-area: progress; }
  .feedback-panel { grid-area: feedback; }

  .status-panel,
  .progress-panel {
    min-height: 310rpx;
  }

  .feedback-panel {
    min-height: 320rpx;
  }
}

@media (min-width: 1024px) {
  .hero {
    min-height: 190px;
    padding: 0 48px 34px;
  }

  .safe-area {
    min-height: 12px;
  }

  .hero-title-row {
    min-height: 76px;
    margin-top: 8px;
  }

  .back-btn {
    left: 24px;
    top: calc(env(safe-area-inset-top) + 18px);
    width: 44px;
    height: 44px;
  }

  .back-btn text {
    font-size: 34px;
  }

  .title-wrap {
    gap: 14px;
  }

  .title-icon-box {
    width: 50px;
    height: 50px;
    border-radius: 14px;
  }

  .title-icon {
    width: 36px;
    height: 36px;
  }

  .page-title {
    font-size: min(24px, 48rpx);
  }

  .page-subtitle {
    margin-top: 5px;
    font-size: 14px;
  }

  .content-scroll {
    height: calc(100vh - 92px);
    margin-top: -68px;
    padding-bottom: 32px;
  }

  .content {
    max-width: 1560px;
    gap: 18px;
    padding: 0 28px 48px;
  }

  .panel {
    border-radius: 18px;
    box-shadow: 0 12px 30px rgba(15, 118, 110, 0.1);
  }

  .robot-card {
    padding: 26px 34px 24px;
  }

  .robot-main {
    grid-template-columns: minmax(270px, .7fr) minmax(0, 1.3fr);
    min-height: 220px;
  }

  .robot-visual {
    min-height: 220px;
  }

  .robot-copy {
    padding-top: 10px;
  }

  .section-kicker {
    font-size: 14px;
  }

  .robot-name {
    margin-top: 8px;
    font-size: 24px;
  }

  .robot-state-line,
  .robot-task-line {
    gap: 10px;
    margin-top: 15px;
    font-size: 15px;
  }

  .state-dot {
    width: 12px;
    height: 12px;
    box-shadow: 0 0 0 6px rgba(34, 197, 94, 0.12);
  }

  .task-icon {
    font-size: 19px;
  }

  .ready-chip {
    top: 0;
    right: 0;
    gap: 6px;
    padding: 9px 14px;
    font-size: 14px;
  }

  .ready-dot {
    width: 8px;
    height: 8px;
  }

  .robot-image {
    right: -8px;
    top: -18px;
    width: 330px;
    height: 330px;
  }

  .robot-glow {
    right: 8px;
    bottom: -14px;
    width: 300px;
    height: 300px;
  }

  .orbit-one {
    width: 280px;
    height: 116px;
  }

  .orbit-two {
    right: 45px;
    bottom: 28px;
    width: 210px;
    height: 84px;
  }

  .control-actions {
    gap: 12px;
    margin-top: 14px;
  }

  .primary-action,
  .secondary-action,
  .danger-action {
    min-height: 40px;
    padding: 0 20px;
    gap: 8px;
    font-size: 14px;
  }

  .danger-dot {
    width: 20px;
    height: 20px;
    font-size: 13px;
  }

  .status-panel,
  .progress-panel,
  .feedback-panel {
    padding: 24px 26px;
  }

  .status-panel,
  .progress-panel {
    min-height: 188px;
  }

  .feedback-panel {
    min-height: 186px;
  }

  .panel-title {
    gap: 9px;
    font-size: 16px;
  }

  .panel-icon {
    width: 26px;
    height: 26px;
    border-radius: 8px;
    font-size: 14px;
  }

  .sync-chip,
  .more-link {
    font-size: 14px;
  }

  .status-grid {
    gap: 16px 18px;
    margin-top: 20px;
  }

  .status-item {
    gap: 12px;
  }

  .status-icon {
    width: 36px;
    height: 36px;
    border-radius: 11px;
    font-size: 17px;
  }

  .status-texts {
    gap: 7px;
  }

  .status-label {
    font-size: 13px;
  }

  .status-value {
    font-size: 14px;
  }

  .progress-track {
    margin-top: 26px;
    padding-bottom: 4px;
  }

  .track-line,
  .track-fill {
    top: 34px;
    height: 4px;
  }

  .step-node {
    gap: 7px;
  }

  .node-circle {
    width: 54px;
    height: 54px;
    border-width: 3px;
    font-size: 18px;
  }

  .node-label,
  .node-mark {
    font-size: 13px;
  }

  .node-mark {
    height: 18px;
  }

  .feedback-list {
    margin-top: 15px;
  }

  .feedback-item {
    grid-template-columns: 12px 82px minmax(0, 1fr);
    gap: 10px;
    min-height: 32px;
  }

  .feedback-dot {
    width: 8px;
    height: 8px;
  }

  .feedback-time,
  .feedback-text {
    font-size: 13px;
  }
}

@media (max-width: 360px) {
  .content {
    padding-left: 20rpx;
    padding-right: 20rpx;
  }

  .hero {
    padding-left: 20rpx;
    padding-right: 20rpx;
  }

  .page-title {
    font-size: 34rpx;
  }

  .robot-main {
    grid-template-columns: minmax(0, 1fr) 220rpx;
  }

  .robot-image {
    width: 250rpx;
    height: 356rpx;
  }

  .status-grid {
    grid-template-columns: 1fr;
  }

  .control-actions {
    gap: 12rpx;
  }

  .primary-action,
  .secondary-action,
  .danger-action {
    padding: 0 20rpx;
    font-size: 22rpx;
  }
}

@media (prefers-reduced-motion: reduce) {
  .leaf,
  .robot-image,
  .mobile-robot-image,
  .robot-glow,
  .state-dot.running,
  .step-node.active .node-circle {
    animation: none !important;
  }

  .track-fill,
  .primary-action,
  .secondary-action,
  .danger-action {
    transition: none !important;
  }
}
</style>
