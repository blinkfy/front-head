const TWIN_STATUS_LABELS = Object.freeze({
  READY: '就绪',
  RUNNING: '运行中',
  PAUSED: '已暂停',
  STOPPED: '已停止',
  DISCONNECTED: '已断开',
  ERROR: '异常',
  PENDING: '待处理',
  PENDING_REPLACEMENT: '等待补位',
  REQUESTED: '已请求',
  RESULT_RECEIVED: '已接收结果',
  DISPATCHED: '已派发',
  SUCCEEDED: '已完成',
  FAILED: '失败',
  CANCELLED: '已取消',
  RETURNING: '返航中',
  DEPLOYING: '补位中',
  FULL_RISK: '满载风险',
  AT_CENTER: '已到中心',
  DOCKING: '入泊中',
  RECEIVING: '接收中',
  UNLOADING: '卸料中',
  CLEANING: '清洁中',
  CHARGING: '充电中',
  CHECKING: '检测中',
  DOCK: '入泊中',
  UNLOAD: '卸料中',
  CLEAN: '清洁中',
  CHARGE: '充电中',
  CHECK: '检测中',
  IDLE: '空闲',
  LOW_BATTERY: '电量不足',
  CONGESTED: '中心拥堵',
  MULTI_PROCESSING: '多线处理',
  DEGRADED: '降级运行',
  ONLINE: '在线',
  OFFLINE: '离线',
  STANDBY: '待命',
  OCCUPIED: '已占用',
  PATROLLING: '巡检中',
  EXECUTING_TASK: '执行任务',
  FAULT: '故障'
})

export function displayTwinStatus(value, fallback = '—') {
  const raw = String(value || '').trim()
  const normalized = raw.toUpperCase()
  return TWIN_STATUS_LABELS[normalized] || (raw || fallback)
}
