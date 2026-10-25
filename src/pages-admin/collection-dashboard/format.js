// 看板格式化、点位命名、平台存储与路线插值工具。
const ZHONGSHAN_PARK_POINT_NAMES = [
  '中山北门', '中山北门东侧', '中山南门', '中山南门西侧', '樱花大道南段',
  '小西湖东岸', '小西湖西岸', '孙文莲池', '会前村遗址', '动物园入口',
  '观象亭', '太平山索道口', '公园广场', '儿童乐园', '桂花园',
  '牡丹园', '玉兰园', '中山东门', '中山西门', '林荫步道',
  '湖畔休息区', '迎宾广场', '花卉园', '休闲长廊'
]

function n(v, fallback = 0) {
  const value = Number(v)
  return Number.isFinite(value) ? value : fallback
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, n(v, min))) }
function clampFill(v) { return clamp(v, 0, 100) }
function pointCode(index) {
  return `P${String(index + 1).padStart(3, '0')}`
}
function defaultBinCode(index) {
  return `B-M${String(index + 1).padStart(2, '0')}`
}
function zhongshanParkPointName(index) {
  const base = ZHONGSHAN_PARK_POINT_NAMES[index % ZHONGSHAN_PARK_POINT_NAMES.length]
  const group = Math.floor(index / ZHONGSHAN_PARK_POINT_NAMES.length)
  return group === 0 ? base : `${base}-${group + 1}`
}
function withPointIdentity(bin, index) {
  const code = bin.pointCode || pointCode(index)
  const pointName = bin.pointName || zhongshanParkPointName(index)
  return {
    ...bin,
    name: code,
    pointCode: code,
    pointName,
    binCode: bin.binCode || defaultBinCode(index),
    hasBin: bin.hasBin !== false,
    slotState: bin.slotState || (bin.isUrgent ? '满载告警' : '可用'),
    taskLabel: bin.taskLabel || '日常监测'
  }
}
function applyDashboardBinNames(data) {
  const bins = Array.isArray(data?.bins)
    ? data.bins.map((bin, index) => withPointIdentity(bin, index))
    : []
  const binsById = new Map(bins.map(bin => [String(bin.id), bin]))
  const plan = data?.plan ? { ...data.plan } : null

  if (plan && Array.isArray(plan.bins)) {
    plan.bins = plan.bins.map(bin => ({ ...bin, ...(binsById.get(String(bin.id)) || {}) }))
  }
  if (plan?.route && Array.isArray(plan.route.stops)) {
    plan.route = {
      ...plan.route,
      stops: plan.route.stops.map(stop => {
        const mapped = binsById.get(String(stop.id))
        return mapped ? { ...stop, ...mapped, name: mapped.pointCode } : stop
      })
    }
  }
  return { bins, plan }
}

function sev(fill) {
  const f = clampFill(fill)
  if (f >= 90) return 'red'; if (f >= 80) return 'orange'
  if (f >= 65) return 'amber'; return 'green'
}
function sevRank(fill) {
  const f = clampFill(fill)
  if (f >= 90) return 3; if (f >= 80) return 2; if (f >= 65) return 1; return 0
}
function sevLabel(fill) {
  const f = clampFill(fill)
  if (f >= 90) return '紧急'; if (f >= 80) return '高负载'; if (f >= 65) return '临界'; return '正常'
}
function countdownToFull(hoursToFull) {
  const h = n(hoursToFull, NaN)
  if (!Number.isFinite(h)) return '预计满载时间未知'
  const mins = Math.max(0, Math.round(h * 60))
  const hh = Math.floor(mins / 60); const mm = mins % 60
  if (hh === 0) return `预计 ${mm} 分钟满载`
  return `预计 ${hh}h ${mm}m 满载`
}
function fmtTime(value, withSeconds = false) {
  const d = value ? new Date(value) : new Date()
  if (Number.isNaN(d.getTime())) return withSeconds ? '--:--:--' : '--:--'
  return d.toLocaleTimeString('zh-CN', {
    hour12: false, hour: '2-digit', minute: '2-digit',
    second: withSeconds ? '2-digit' : undefined
  })
}
function fmtKm(v) { return `${n(v, 0).toFixed(2)} km` }
function fmtMin(v) { return `${n(v, 0).toFixed(1)} min` }

function normalizeStrategy(value) {
  const v = String(value || '').trim().toLowerCase()
  if (v === 'shortest_distance') return 'shortest_distance'
  return 'shortest_time'
}
function strategyLabel(strategy) {
  if (strategy === 'shortest_distance') return '最短距离'
  return '最短时间'
}
function handlingLabel(status) {
  if (status === 'processing') return '处理中'
  if (status === 'dispatched') return '已派单'
  return '未处理'
}

function getStorage(key) {
  // #ifdef H5
  return localStorage.getItem(key)
  // #endif
  // #ifndef H5
  const result = uni.getStorageSync(key)
  return result || null
  // #endif
}
function setStorage(key, value) {
  // #ifdef H5
  localStorage.setItem(key, value)
  // #endif
  // #ifndef H5
  uni.setStorageSync(key, value)
  // #endif
}

function seededRatio(seed) {
  const text = String(seed || 'seed'); let hash = 0
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  return (hash % 1000) / 1000
}

function slotStateClass(state) {
  const value = String(state || '').toLowerCase()
  if (['满载告警', '返航中', 'abnormal', 'maintenance', 'returning'].includes(value)) return 'danger'
  if (['待补位', '空位', 'pending_replacement', 'vacant', 'replacement'].includes(value)) return 'waiting'
  if (['补位完成', '可用', 'available', 'ready'].includes(value)) return 'available'
  return ''
}

function displaySlotState(state) {
  const value = String(state || '').trim().toLowerCase()
  const labels = {
    available: '可用',
    vacant: '空位',
    pending_replacement: '待补位',
    replacement: '补位中',
    returning: '返航中',
    abnormal: '异常',
    maintenance: '维护中',
    ready: '可用'
  }
  return labels[value] || String(state || '状态未知')
}

function displayTaskType(type) {
  const typeLabels = {
    return: '返航任务',
    replacement: '补位任务',
    dispatch: '调度任务',
    monitoring: '监测中'
  }
  return typeLabels[String(type || '').toLowerCase()] || String(type || '任务')
}

function displayOperationalState(status) {
  const statusLabels = {
    pending: '待处理',
    dispatched: '已派发',
    running: '执行中',
    processing: '处理中',
    completed: '已完成',
    done: '已完成',
    active: '处理中',
    ready: '已就绪',
    waiting: '待处理',
    available: '可用'
  }
  return statusLabels[String(status || '').toLowerCase()] || String(status || '状态未知')
}

function displayTaskLabel(type, status) {
  const taskText = displayTaskType(type)
  const statusText = status ? displayOperationalState(status) : ''
  return [taskText, statusText].filter(Boolean).join(' · ') || '监测中'
}

function interpolatePoint(from, to, progress) {
  const p = clamp(progress, 0, 1)
  return {
    latitude: n(from && from.latitude, 0) + (n(to && to.latitude, 0) - n(from && from.latitude, 0)) * p,
    longitude: n(from && from.longitude, 0) + (n(to && to.longitude, 0) - n(from && from.longitude, 0)) * p
  }
}

function pointAlongRoute(route, progress) {
  if (!Array.isArray(route) || route.length < 2) return null
  const p = clamp(progress, 0, 1)
  const segmentLengths = []
  let totalLength = 0
  for (let index = 0; index < route.length - 1; index += 1) {
    const from = route[index]
    const to = route[index + 1]
    const avgLatRad = ((n(from[0], 0) + n(to[0], 0)) / 2) * Math.PI / 180
    const latMeters = (n(to[0], 0) - n(from[0], 0)) * 111320
    const lngMeters = (n(to[1], 0) - n(from[1], 0)) * 111320 * Math.cos(avgLatRad)
    const length = Math.max(Math.hypot(latMeters, lngMeters), 0.001)
    segmentLengths.push(length)
    totalLength += length
  }
  let remaining = totalLength * p
  for (let index = 0; index < segmentLengths.length; index += 1) {
    const length = segmentLengths[index]
    if (remaining <= length || index === segmentLengths.length - 1) {
      return interpolatePoint(
        { latitude: route[index][0], longitude: route[index][1] },
        { latitude: route[index + 1][0], longitude: route[index + 1][1] },
        clamp(remaining / length, 0, 1)
      )
    }
    remaining -= length
  }
  return { latitude: route[route.length - 1][0], longitude: route[route.length - 1][1] }
}

function decodeEntryParam(value) {
  let decoded = String(value || '')
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded)
      if (next === decoded) break
      decoded = next
    } catch (_) {
      break
    }
  }
  return decoded
}

export { ZHONGSHAN_PARK_POINT_NAMES, n, clamp, clampFill, pointCode, defaultBinCode, zhongshanParkPointName, withPointIdentity, applyDashboardBinNames, sev, sevRank, sevLabel, countdownToFull, fmtTime, fmtKm, fmtMin, normalizeStrategy, strategyLabel, handlingLabel, getStorage, setStorage, seededRatio, slotStateClass, displaySlotState, displayTaskType, displayOperationalState, displayTaskLabel, interpolatePoint, pointAlongRoute, decodeEntryParam }
