const SOURCE_LABELS = Object.freeze({
  SIM: '回放数据',
  ISAAC_REALTIME: '实时结果',
  BACKEND_API: '接口数据',
  VISUAL_AID: '视觉说明'
})

export function displaySourceLabel(value, fallback = '回放数据') {
  const key = String(value || '').trim().toUpperCase()
  return SOURCE_LABELS[key] || (key ? '外部数据' : fallback)
}
