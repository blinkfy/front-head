const REQUEST = /^[A-Za-z0-9_-]{16,80}$/
const UUID = /^[a-f0-9-]{36}$/i
const ID = /^[1-9]\d{0,19}$/
const STATUSES = ['pending', 'executing', 'completed', 'cancelled', 'failed']

export function runStorageKey(origin, token) {
  // Namespace by the current credential without retaining it in the ledger.
  let a = 2166136261, b = 5381
  for (const char of `${origin}|${token}`) { a = Math.imul(a ^ char.charCodeAt(0), 16777619); b = Math.imul(b, 33) ^ char.charCodeAt(0) }
  return `ai_chat_runs_v1_${(a >>> 0).toString(16)}_${(b >>> 0).toString(16)}`
}
export function normalizePendingRuns(value) {
  const seen = new Set()
  return (Array.isArray(value) ? value : []).slice(0, 20).flatMap(item => {
    if (!item || typeof item.requestId !== 'string' || !REQUEST.test(item.requestId) || typeof item.sessionId !== 'string' || !item.sessionId.trim() || item.sessionId.length > 64 || seen.has(item.requestId)) return []
    seen.add(item.requestId)
    return [{ requestId: item.requestId, sessionId: item.sessionId, runId: UUID.test(item.runId || '') ? item.runId : '',
      status: STATUSES.includes(item.status) ? item.status : 'pending', userLocalId: String(item.userLocalId || '').slice(0, 80),
      userMessageId: ID.test(String(item.userMessageId || '')) ? String(item.userMessageId) : '',
      assistantLocalId: String(item.assistantLocalId || '').slice(0, 80), userText: typeof item.userText === 'string' ? item.userText.slice(0, 12000) : '',
      seedLocalIds: Array.isArray(item.seedLocalIds) ? [...new Set(item.seedLocalIds.filter(id => typeof id === 'string' && id.length <= 80))].slice(0, 6) : [],
      seedFingerprint: typeof item.seedFingerprint === 'string' ? item.seedFingerprint.slice(0, 256) : '',
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString() }]
  })
}
export function applyRunSnapshot(messages, pending, snapshot, normalizeCards, normalizePoints, normalizeSearch) {
  if (!snapshot || snapshot.requestId !== pending.requestId || snapshot.sessionId !== pending.sessionId || !UUID.test(snapshot.runId || '') || (pending.runId && pending.runId !== snapshot.runId) || !STATUSES.includes(snapshot.status)) throw new Error('任务返回内容不匹配，请重新查询')
  const next = messages.slice()
  const userId = ID.test(String(snapshot.userMessageId || '')) ? String(snapshot.userMessageId) : ''
  if (userId) {
    const local = next.find(item => String(item.id) === pending.userLocalId)
    if (local) local.id = userId
    else if (!next.some(item => item.role === 'user' && String(item.id) === userId) && (snapshot.userMessage?.content || pending.userText)) next.push({ id: userId, role: 'user', content: snapshot.userMessage?.content || pending.userText,
      hasImage: !!snapshot.userMessage?.hasImage, recognitionHistoryId: snapshot.userMessage?.recognitionHistoryId || null, imageAvailable: !!snapshot.userMessage?.hasImage, imageBase64: '', createdAt: snapshot.userMessage?.createdAt || pending.createdAt })
  }
  if (snapshot.status === 'completed') {
    const result = snapshot.result || snapshot
    if (!ID.test(String(result.assistantMessageId || '')) || typeof result.content !== 'string' || !result.content) throw new Error('任务结果不完整，请重新查询')
    const id = String(result.assistantMessageId)
    const local = next.find(item => String(item.id) === id || String(item.id) === pending.assistantLocalId)
    const value = { id, role: 'assistant', content: result.content, reasoning: result.reasoning || '', hasImage: false, imageBase64: '',
      search: normalizeSearch(result.search), businessCards: normalizeCards(result.businessCards), disposalPoints: normalizePoints(result.disposalPoints), createdAt: result.createdAt || local?.createdAt || new Date().toISOString() }
    if (local) Object.assign(local, value)
    else next.push(value)
  }
  const seen = new Set()
  return next.filter(item => { const key = `${item.role}:${item.id}`; if (seen.has(key)) return false; seen.add(key); return true })
    .sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0))
}

export function createRunLedger({ read, write, key }) {
  let items = normalizePendingRuns(read(key)).filter(item => !['failed', 'cancelled'].includes(item.status))
  const save = next => {
    // Persist before sending. If storage is unavailable, do not start a task
    // whose identifier could be lost on a refresh.
    write(key, next)
    items = next
    return items.slice()
  }
  return {
    items: () => items.slice(),
    add(item) {
      if (items.length >= 20) throw new Error('待核实任务较多，请先查看或关闭已结束的任务')
      const next = normalizePendingRuns([...items, item])
      if (!next.some(value => value.requestId === item.requestId)) throw new Error('任务编号无效')
      return save(next)
    },
    update(requestId, change) { return save(normalizePendingRuns(items.map(item => item.requestId === requestId ? { ...item, ...change } : item))) },
    remove(requestId) { return save(items.filter(item => item.requestId !== requestId)) },
    merge(received) {
      const byId = new Map(items.map(item => [item.requestId, item]))
      for (const item of normalizePendingRuns(received)) byId.set(item.requestId, { ...item, ...byId.get(item.requestId), runId: item.runId, status: item.status, userMessageId: item.userMessageId })
      // Older backends also list terminal tasks. They have no answer to recover.
      return save(normalizePendingRuns([...byId.values()].filter(item => !['failed', 'cancelled'].includes(item.status))))
    }
  }
}
