export const DATA_SOURCE_LABELS = Object.freeze({
  SIM: 'SIM',
  ISAAC_REALTIME: 'ISAAC_REALTIME',
  BACKEND_API: 'BACKEND_API',
  VISUAL_AID: 'VISUAL_AID'
})

export const EVENT_PRESENTATION = Object.freeze({
  SCENE_STARTED: { title: '场景启动', desc: '加载公园布局与初始对象', stage: 'idle', tone: 'blue' },
  LITTER_CREATED: { title: '垃圾产生', desc: '游客事件产生待处理垃圾', stage: 'scan', tone: 'amber' },
  TASK_CREATED: { title: '任务创建', desc: '编排器登记新的执行任务', stage: 'idle', tone: 'blue' },
  ROBOT_TASK_REQUESTED: { title: '机器人任务下发', desc: '提交识别、导航、抓取和投放请求', stage: 'scan', tone: 'cyan' },
  ROBOT_TASK_RESULT: { title: '机器人任务结果', desc: '读取机器人任务管线返回结果', stage: 'release', tone: 'cyan' },
  TASK_SUCCEEDED: { title: '任务完成', desc: '当前任务返回成功状态', stage: 'completed', tone: 'green' },
  BIN_FILL_UPDATED: { title: '容量更新', desc: '智能桶容量数据发生变化', stage: 'idle', tone: 'amber' },
  FULL_RISK_TRIGGERED: { title: '满载风险触发', desc: '容量达到配置风险阈值', stage: 'idle', tone: 'red' },
  RETURN_AND_REPLACEMENT_DISPATCHED: { title: '返航与补位调度', desc: '满载桶返航，备用桶前往原服务点', stage: 'return', tone: 'amber' },
  DEVICE_ARRIVED_AT_CENTER: { title: '设备抵达中心', desc: '返航设备进入运维与收运中心', stage: 'return', tone: 'green' },
  STANDBY_TOOK_OVER_SERVICE_POINT: { title: '备用桶完成补位', desc: '备用设备接管原服务点', stage: 'completed', tone: 'green' },
  CENTER_UNLOADING: { title: '中心卸料', desc: '收运中心推进卸料阶段', stage: 'place', tone: 'amber' },
  CENTER_CLEANING: { title: '中心清洗', desc: '收运中心推进清洗阶段', stage: 'return', tone: 'cyan' },
  CENTER_CHARGING: { title: '中心充电', desc: '收运中心推进充电阶段', stage: 'return', tone: 'cyan' },
  DEVICE_RECOVERED: { title: '设备恢复', desc: '设备完成处理并恢复备用状态', stage: 'completed', tone: 'green' },
  VISITOR_ACTIVITY_UPDATED: { title: '游客活动更新', desc: '游客在公园区域间移动或停留', stage: 'idle', tone: 'cyan' },
  ACTIVE_DISPOSAL: { title: '游客主动投放', desc: '游客主动将垃圾投入服务点智能桶', stage: 'place', tone: 'green' },
  PEDESTRIAN_FLOW_UPDATED: { title: '区域人流更新', desc: '回放更新各区域人数与活动密度', stage: 'idle', tone: 'cyan' },
  CROWD_FLOW_UPDATED: { title: '道路人群变化', desc: '游客逐步聚集或散开，阻塞判定仍由回放事件给出', stage: 'idle', tone: 'amber' },
  HEATMAP_UPDATED: { title: '人流热区更新', desc: '回放更新餐饮区人流热区强度', stage: 'idle', tone: 'amber' },
  FILL_PREDICTION_UPDATED: { title: '满载预测更新', desc: '回放载荷提供历史与未来填充预测', stage: 'idle', tone: 'amber' },
  RETURN_ROUTE_STARTED: { title: '返航路线启动', desc: '满载设备开始沿原规划路线返航', stage: 'return', tone: 'cyan' },
  ROUTE_BLOCKED: { title: '返航路线受阻', desc: '临时障碍导致原返航路线暂停', stage: 'return', tone: 'red' },
  ROUTE_REPLANNED: { title: '返航路线重规划', desc: '路径规划输出新的可通行路线', stage: 'return', tone: 'amber' },
  RETURN_ROUTE_RESUMED: { title: '返航恢复', desc: '设备沿新路线继续前往收运中心', stage: 'return', tone: 'green' }
})

const ENTITY_ID_KEYS = new Set([
  'visitorId', 'garbageId', 'taskId', 'robotId', 'deviceId', 'servicePointId',
  'fromServicePointId', 'targetServicePointId', 'targetCenterId', 'centerId',
  'returnTaskId', 'replacementTaskId',
  'zoneId', 'fromZoneId', 'toZoneId', 'obstacleId'
])

export function eventPresentation(event) {
  return EVENT_PRESENTATION[event?.eventType] || {
    title: event?.eventType || '未知事件',
    desc: '未登记的事件类型，仅展示原始载荷',
    stage: 'idle',
    tone: 'blue'
  }
}

export function normalizeReplayBundle(bundle) {
  if (!bundle?.replay || !Array.isArray(bundle.replay.events)) {
    throw new Error('回放数据缺少 events 数组')
  }
  const events = bundle.replay.events
    .map(event => ({ ...event, sequence: Number(event.sequence) }))
    .filter(event => Number.isFinite(event.sequence) && event.eventType && event.source)
    .sort((left, right) => left.sequence - right.sequence)
  if (!events.length) throw new Error('回放中没有可播放事件')
  return {
    ...bundle,
    replay: { ...bundle.replay, events }
  }
}

export function eventEntityIds(event) {
  const values = []
  function visit(value, key = '') {
    if (value == null) return
    if (Array.isArray(value)) {
      value.forEach(item => visit(item, key))
      return
    }
    if (typeof value === 'object') {
      Object.entries(value).forEach(([childKey, childValue]) => visit(childValue, childKey))
      return
    }
    if (ENTITY_ID_KEYS.has(key) && typeof value === 'string') values.push(value)
  }
  visit(event?.payload || {})
  return [...new Set(values)]
}

export function primaryEventEntityIds(event) {
  const payload = event?.payload || {}
  const request = payload.request || {}
  const result = payload.result || {}
  const keys = ['visitorId', 'garbageId', 'taskId', 'robotId', 'deviceId', 'servicePointId', 'obstacleId', 'returnTaskId', 'replacementTaskId', 'targetCenterId']
  return [...new Set(keys.flatMap(key => [payload[key], request[key], result[key]]).filter(value => typeof value === 'string' && value))]
}

export function currentTaskId(event) {
  const payload = event?.payload || {}
  return payload.taskId || payload.request?.taskId || payload.result?.taskId ||
    payload.returnTaskId || payload.replacementTaskId || ''
}

export function centerPhaseFromEvent(event) {
  const phases = {
    DEVICE_ARRIVED_AT_CENTER: 'RECEIVING',
    CENTER_UNLOADING: 'UNLOADING',
    CENTER_CLEANING: 'CLEANING',
    CENTER_CHARGING: 'CHARGING',
    DEVICE_RECOVERED: 'IDLE'
  }
  return phases[event?.eventType] || '—'
}

export function explicitEntityStatus(event, entityId) {
  const type = event?.eventType
  const payload = event?.payload || {}
  if (!entityId) return '—'
  if (type === 'FULL_RISK_TRIGGERED' && payload.deviceId === entityId) return 'FULL_RISK'
  if (type === 'RETURN_AND_REPLACEMENT_DISPATCHED') {
    if (entityId === payload.returnTaskId || entityId === payload.replacementTaskId) return 'DISPATCHED'
    if (entityId === 'device_smart_bin_food_01') return 'RETURNING'
    if (entityId === 'device_smart_bin_standby_01') return 'DEPLOYING'
    if (entityId === 'service_food_01') return 'PENDING_REPLACEMENT'
  }
  if (type === 'DEVICE_ARRIVED_AT_CENTER' && payload.deviceId === entityId) return 'AT_CENTER'
  if (type === 'STANDBY_TOOK_OVER_SERVICE_POINT') {
    if (payload.deviceId === entityId) return 'ONLINE'
    if (payload.servicePointId === entityId) return 'OCCUPIED'
  }
  if (type === 'CENTER_UNLOADING' && payload.deviceId === entityId) return 'UNLOADING'
  if (type === 'CENTER_CLEANING' && payload.deviceId === entityId) return 'CLEANING'
  if (type === 'CENTER_CHARGING' && payload.deviceId === entityId) return 'CHARGING'
  if (type === 'DEVICE_RECOVERED' && payload.deviceId === entityId) return payload.nextRole || 'STANDBY'
  if (type === 'TASK_CREATED' && payload.taskId === entityId) return 'PENDING'
  if (type === 'TASK_SUCCEEDED' && payload.taskId === entityId) return 'SUCCEEDED'
  return '当前事件无状态更新'
}

export function entityTypeLabel(type) {
  return ({
    robot: '巡检机器人', service_point: '服务点', device: '智能桶', smart_bin: '智能桶',
    sorting_center: '收运中心', operations_center: '收运中心', task: '任务', garbage: '垃圾物体',
    visitor: '游客'
  })[type] || type || '场景对象'
}
