import { normalizeChatChecklist } from './ai-chat-checklist.mjs'
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/
const RECOGNITION_ID_PATTERN = /^[1-9]\d{0,15}$/

export function normalizeChatBusinessCards(input) {
  const seen = new Set()
  const normalized = []
  for (const item of Array.isArray(input) ? input : []) {
    if (normalized.length >= 10 || !item || !['recognition', 'product', 'booking', 'checklist', 'community_post'].includes(item.type)) continue
    if (item.type === 'community_post' && (typeof item.postContent !== 'string' || !item.postContent.trim() || item.postContent.trim().length > 2000)) continue
    const checklist = item.type === 'checklist' ? normalizeChatChecklist(item.checklist) : null
    if (item.type === 'checklist' && !checklist) continue
    const id = String(item.id ?? '').trim()
    const title = typeof item.title === 'string' ? item.title.trim() : ''
    const description = typeof item.description === 'string' ? item.description.trim() : ''
    const key = `${item.type}:${id}`
    if (!ID_PATTERN.test(id) || (item.type === 'recognition' && !RECOGNITION_ID_PATTERN.test(id)) || seen.has(key) || !title || (item.type === 'recognition' && !description)) continue
    seen.add(key)
    const card = { type: item.type, id, title: title.slice(0, 160), description: description.slice(0, 500), ...(checklist ? { checklist } : {}) }
    if (item.type === 'community_post') card.postContent = item.postContent.trim()
    if (/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(item.actionKey || '')) card.actionKey = item.actionKey.toLowerCase()
    if (typeof item.createdAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(item.createdAt) && Number.isFinite(Date.parse(item.createdAt))) card.createdAt = item.createdAt
    if (item.points !== null && item.points !== undefined && Number.isFinite(Number(item.points)) && Number(item.points) >= 0) card.points = Number(item.points)
    if (item.stock !== null && item.stock !== undefined && Number.isFinite(Number(item.stock)) && Number(item.stock) >= 0) card.stock = Number(item.stock)
    normalized.push(card)
  }
  return normalized
}

// Keep the full response in history for older clients; cards replace only matching product rows.
export function businessMessageMarkdown(message) {
  const content = String(message?.content || 'AI 暂未返回内容。')
  if (message?.role !== 'assistant') return content
  const compact = value => value.replace(/\s+/g, '')
  const rows = new Set(normalizeChatBusinessCards(message.businessCards)
    .filter(card => card.type === 'product' && card.points != null && card.stock != null)
    .map(card => compact(`${card.title}：${card.points}积分，库存${card.stock}`)))
  if (!rows.size) return content
  return content.split(/\r?\n/).filter(line => {
    const bullet = /^\s*[-*+]\s+(.+)$/.exec(line)
    return !bullet || !rows.has(compact(bullet[1]))
  }).join('\n').trim()
}

// New cards carry a server-generated UUID. Historic cards can use their persisted message ID.
export function businessActionRequestId(card, messageId, fallback) {
  if (/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(card?.actionKey || '')) return `chat_${card.actionKey.toLowerCase()}`
  if (/^[1-9]\d{0,15}$/.test(String(messageId)) && /^(product|booking|community_post|recognition)$/.test(card?.type || '') && /^[1-9]\d{0,15}$/.test(String(card?.id))) {
    return `chat_message_${messageId}_${card.type}_${card.id}`
  }
  return fallback()
}
