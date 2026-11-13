// #ifdef APP-PLUS
import { updateChatBadge } from '@/uni_modules/ftx-voice-call'
// #endif

let configuredOwner
function owner() {
  if (!uni.getStorageSync('token')) return ''
  const user = uni.getStorageSync('userInfo') || {}
  return String(user.id || user.userId || user.user?.id || user.data?.id || '')
}

function update(value) {
  // #ifdef APP-PLUS
  try {
    if (typeof plus !== 'undefined' && plus.os.name === 'Android') updateChatBadge(JSON.stringify(value))
  } catch (_) { /* An older custom base keeps messaging available. */ }
  // #endif
}

export function syncChatBadgeAccount() {
  const current = owner()
  if (configuredOwner === current) return
  configuredOwner = current
  update({ owner: current })
}
export function clearChatBadge() { configuredOwner = ''; update({ owner: '', operation: 'clear' }) }

// No requests/timers: reuse an unfiltered chat list response already being loaded.
export function beginChatBadgeSnapshot() { return { owner: owner(), token: uni.getStorageSync('token'), startedAt: Date.now() } }
export function finishChatBadgeSnapshot(start, result, params) {
  if (params?.keyword || result?.code !== 0 || !result.data?.badgeUnreadCounts ||
      !start.owner || start.owner !== owner() || start.token !== uni.getStorageSync('token')) return
  update({ owner: start.owner, operation: 'snapshot', counts: result.data.badgeUnreadCounts, startedAt: start.startedAt })
}
