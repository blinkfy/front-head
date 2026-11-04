export const CHECKLIST_CATEGORIES = ['待确认', '有害垃圾', '可回收物', '厨余垃圾', '其他垃圾']
export const CHECKLIST_GUIDES = {
  '待确认': '先单独放置，确认物品材质、类别及当地接收要求后再处理。',
  '有害垃圾': '保持完整、分开暂存，按当地有害垃圾收集要求投放。',
  '可回收物': '清空内容物、保持干燥，按现场分类标识投放。',
  '厨余垃圾': '去除外包装、沥干水分，按当地厨余投放要求处理。',
  '其他垃圾': '与可回收物、厨余和有害垃圾分开，按现场标识投放。'
}
export function normalizeChatChecklist(value) {
  if (!value || !Array.isArray(value.items)) return null
  const seen = new Set()
  const items = value.items.slice(0, 30).flatMap(item => {
    if (!item || !/^[1-9]\d{0,15}:\d{1,3}$/.test(item.key || '') || seen.has(item.key) || typeof item.name !== 'string' || !item.name.trim()) return []
    const sourceId = item.key.split(':')[0]
    if (String(item.sourceId) !== sourceId) return []
    seen.add(item.key)
    const score = typeof item.confidence === 'number' && Number.isFinite(item.confidence) && item.confidence >= 0 && item.confidence <= 1 ? item.confidence : null
    const rawCategory = CHECKLIST_CATEGORIES.includes(item.category) ? item.category : '待确认'
    const reason = typeof item.reviewReason === 'string' ? item.reviewReason.trim().slice(0, 180) : ''
    const needsReview = rawCategory === '待确认' || score == null || score < 0.65 || !!reason

    return [{ key: item.key, sourceId, name: item.name.trim().slice(0, 120),
      category: needsReview ? '待确认' : rawCategory,
      originalCategory: CHECKLIST_CATEGORIES.includes(item.originalCategory) ? item.originalCategory : '待确认',
      confidence: score,
      reviewReason: reason || (needsReview ? '识别信息不够明确，请核对后再处理。' : '') }]
  })
  return items.length ? { items, recordCount: Math.max(1, Math.min(5, Math.floor(Number(value.recordCount) || 1))), truncated: value.truncated === true,
    missingCount: Math.max(0, Math.min(5, Math.floor(Number(value.missingCount) || 0))) } : null
}
export function checklistText(value) {
  const checklist = normalizeChatChecklist(value)
  if (!checklist) return ''
  const lines = ['物品投放清单（沿用已保存识别结果）']
  for (const category of CHECKLIST_CATEGORIES) {
    const items = checklist.items.filter(item => item.category === category)
    if (!items.length) continue
    lines.push(`\n${category}：${CHECKLIST_GUIDES[category]}`)
    lines.push(...items.map(item => `- ${item.name}${item.reviewReason ? `：${item.reviewReason}` : ''}`))
  }
  if (checklist.missingCount) lines.push(`\n有${checklist.missingCount}条所选记录无法读取，未纳入清单。`)
  if (checklist.truncated) lines.push('\n本次最多展示30项，请减少所选记录后查看其余物品。')
  lines.push('\n以当地分类标识为准，待确认项先不要投放。')
  return lines.join('\n')
}

export function isChecklistItemCheckable(item) {
  return !!item && CHECKLIST_CATEGORIES.includes(item.category) && item.category !== '待确认' && typeof item.confidence === 'number' && item.confidence >= 0.65 && item.confidence <= 1 && !item.reviewReason
}
