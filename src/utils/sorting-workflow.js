export const SORTING_WORKFLOW_STAGE_LABELS = Object.freeze({
  idle: '待命',
  scan: '扫描识别',
  approach: '接近目标',
  grasp: '抓取',
  transport: '运输',
  place: '定位投放',
  release: '释放投放物',
  return: '返回待命区',
  completed: '任务完成',
  error: '异常停止'
})

const STAGE_ALIASES = Object.freeze({
  recognition: 'scan',
  detect: 'scan',
  navigation: 'approach',
  navigate: 'approach',
  pick: 'grasp',
  carry: 'transport',
  drop: 'release',
  reset: 'return',
  ready: 'idle',
  done: 'completed'
})

const VALID_STAGES = new Set(Object.keys(SORTING_WORKFLOW_STAGE_LABELS))
const ERROR_STATE_RE = /(?:error|fault|failed|abnormal|emergency|stopped|cancelled|offline|异常|故障|急停|停止|失败)/i
const COMPLETE_STATE_RE = /(?:completed|succeeded|success|done|finished|已完成|任务完成|闭环任务完成)/i
const IDLE_STATE_RE = /(?:idle|ready|standby|pending|待命|就绪|等待)/i

export function normalizeSortingWorkflowStage(value, fallback = 'idle') {
  const raw = String(value || '').trim().toLowerCase()
  const aliased = STAGE_ALIASES[raw] || raw
  if (VALID_STAGES.has(aliased)) return aliased

  if (/(?:recogn|detect|scan|识别|检测|扫描)/i.test(raw)) return 'scan'
  if (/(?:navigat|approach|导航|接近|到达抓取)/i.test(raw)) return 'approach'
  if (/(?:grasp|pick|抓取|夹取)/i.test(raw)) return 'grasp'
  if (/(?:transport|carry|运输|搬运|移送)/i.test(raw)) return 'transport'
  if (/(?:place|定位投放|投放至|对准投放)/i.test(raw)) return 'place'
  if (/(?:release|drop|释放|落入|完成投放)/i.test(raw)) return 'release'
  if (/(?:return|reset|返回|返航|复位)/i.test(raw)) return 'return'
  if (COMPLETE_STATE_RE.test(raw)) return 'completed'
  if (ERROR_STATE_RE.test(raw)) return 'error'
  if (IDLE_STATE_RE.test(raw)) return 'idle'
  return fallback
}

export function workflowStageFromProgress(progress) {
  const value = Number(progress)
  if (!Number.isFinite(value) || value <= 0) return 'scan'
  if (value >= 100) return 'completed'
  if (value < 20) return 'scan'
  if (value < 40) return 'approach'
  if (value < 55) return 'grasp'
  if (value < 70) return 'transport'
  if (value < 82) return 'place'
  if (value < 90) return 'release'
  return 'return'
}

/**
 * 页面业务状态到动画阶段的唯一入口。动画组件本身不推进业务流程。
 */
export function mapRobotWorkflowStage({
  actionState,
  deviceState,
  taskStage,
  progress,
  hasTask = true,
  error
} = {}) {
  const action = String(actionState || '')
  const device = String(deviceState || '')
  const state = `${action} ${device}`.trim()
  const stageText = String(taskStage || '')
  const actionIsActive = /(?:running|paused|active|executing|执行|暂停)/i.test(action)

  if (error || ERROR_STATE_RE.test(state) || ERROR_STATE_RE.test(stageText)) return 'error'
  if (COMPLETE_STATE_RE.test(state) || COMPLETE_STATE_RE.test(stageText)) return 'completed'
  if (!hasTask || (!actionIsActive && IDLE_STATE_RE.test(state))) return 'idle'

  if (Number.isFinite(Number(progress))) return workflowStageFromProgress(progress)
  return normalizeSortingWorkflowStage(stageText, 'idle')
}

export function sortingWorkflowStageLabel(stage) {
  return SORTING_WORKFLOW_STAGE_LABELS[normalizeSortingWorkflowStage(stage)]
}
