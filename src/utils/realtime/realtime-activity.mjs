const validId = value => Number.isSafeInteger(value) && value > 0
const callReasons = new Set(['hangup', 'cancelled', 'rejected', 'timeout', 'unavailable', 'busy', 'failed', 'connect_failed',
  'disconnected', 'background', 'permission_denied', 'camera_unavailable', 'interrupted', 'invalid'])

// Text copied by a user is never an activity entry. Compatibility metadata is
// attached by the server only to stored, typed activity records.
export function realtimeActivityCard(message) {
  let card
  if (message?.type === 'others' && typeof message.content === 'string' && message.content.length <= 2048) {
    try { card = JSON.parse(message.content) } catch (_) { return null }
  } else if (message?.type === 'text' && message.storedType === 'others') card = message.realtimeActivity
  if (!card || card.kind !== 'realtime_activity' || card.version !== 1 || !['location', 'call'].includes(card.activity) ||
      !/^[A-Za-z0-9_-]{12,80}$/.test(card.sessionId || '') || !validId(card.fromId) || !validId(card.toId) || card.fromId === card.toId ||
      String(message.senderId) !== String(card.fromId) || String(message.receiverId) !== String(card.toId) ||
      !Number.isSafeInteger(card.createdAt) || card.createdAt <= 0) return null
  if (card.activity === 'call' && (!['audio', 'video'].includes(card.mode) || !callReasons.has(card.reason) ||
      typeof card.connected !== 'boolean' || !Number.isInteger(card.durationSeconds) || card.durationSeconds < 0 || card.durationSeconds > 7200)) return null
  return { kind: 'realtime_activity', version: 1, activity: card.activity, sessionId: card.sessionId,
    fromId: card.fromId, toId: card.toId, createdAt: card.createdAt,
    ...(card.activity === 'call' ? { mode: card.mode, reason: card.reason, connected: card.connected, durationSeconds: card.durationSeconds } : {}) }
}

export function realtimeActivitySummary(card, self = false) {
  if (card.activity === 'location') return '实时位置共享 · 查看共享状态'
  const name = card.mode === 'video' ? '视频通话' : '语音通话'
  if (card.connected) return `${name} · ${String(Math.floor(card.durationSeconds / 60)).padStart(2, '0')}:${String(card.durationSeconds % 60).padStart(2, '0')}`
  const status = self ? { rejected: '对方已拒绝', cancelled: '已取消', timeout: '对方未接听', busy: '对方忙' }
    : { rejected: '已拒绝', cancelled: '未接来电 · 对方已取消', timeout: '未接来电', busy: '忙线未接' }
  return `${name} · ${status[card.reason] || (self ? '未接通' : '未接来电')}`
}
