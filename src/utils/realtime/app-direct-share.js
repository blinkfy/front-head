// #ifdef APP-PLUS
import { syncShareTargets, takeSharedText } from '@/uni_modules/ftx-direct-share'
import { onAppPageReady } from '../app-page-ready.mjs'
// #endif

const idPattern = /^[1-9]\d{0,19}$/
const recentCutoffMs = 30 * 24 * 60 * 60 * 1000
let listening = false
let lastPublished = ''

export function needsRecentShareTargets() {
  // #ifdef APP-PLUS
  if (typeof plus !== 'undefined' && plus.os.name === 'Android') {
    return parseInt(plus.os.version, 10) >= 10 && !lastPublished
  }
  // #endif
  return false
}

export function directShareConversation(row) {
  const kind = row?.conversationType === 'group' ? 'group' : 'direct'
  const id = String(kind === 'group' ? row.groupId : row?.otherId || '')
  const label = (row?.note || row?.nickname || row?.username || '').trim()
  return idPattern.test(id) && label ? { kind, id, label } : null
}

export function syncDirectShareAccount(owner) {
  lastPublished = ''
  // #ifdef APP-PLUS
  try {
    if (typeof plus !== 'undefined' && plus.os.name === 'Android') syncShareTargets(owner, '')
  } catch (_) {}
  // #endif
}

export function publishRecentShareTargets(owner, rows, now = Date.now()) {
  // #ifdef APP-PLUS
  if (typeof plus === 'undefined' || plus.os.name !== 'Android' || !idPattern.test(owner) || !Array.isArray(rows)) return
  const targets = rows.map(row => ({ target: directShareConversation(row), time: Date.parse(row?.latestContent?.sendTime) }))
    .filter(item => item.target && item.target.id !== (item.target.kind === 'direct' ? owner : '') && item.time > now - recentCutoffMs)
    .sort((a, b) => b.time - a.time)
    .slice(0, 4)
    .map(item => item.target)
  const value = JSON.stringify(targets)
  const signature = owner + ':' + value
  if (signature === lastPublished) return
  try {
    syncShareTargets(owner, value)
    lastPublished = signature
  } catch (_) { /* Existing bases still support regular sharing. */ }
  // #endif
}

export function resumeDirectShare() {
  // #ifdef APP-PLUS
  if (typeof plus === 'undefined' || plus.os.name !== 'Android') return
  const open = () => onAppPageReady(() => {
    try {
      const raw = takeSharedText()
      if (!raw) return
      const share = JSON.parse(raw)
      const token = uni.getStorageSync('token')
      const user = uni.getStorageSync('userInfo') || {}
      const owner = String(user.id || user.userId || user.user?.id || user.data?.id || '')
      const direct = !!share.owner
      if (!token || typeof share.text !== 'string' ||
          (direct && (owner !== share.owner || !idPattern.test(share.id) || !['direct', 'group'].includes(share.kind)))) return
      uni.navigateTo({
        url: '/pages-nonTheme/chat-contacts?shareReply=1' + (direct ? '&directShare=1' : ''),
        success: ({ eventChannel }) => {
          if (uni.getStorageSync('token') === token) eventChannel?.emit('assistantReplyToShare', direct ? share : share.text)
        },
        fail: () => uni.showToast({ title: '无法打开分享确认页', icon: 'none' })
      })
    } catch (_) {}
  })
  if (!listening) {
    plus.globalEvent.addEventListener('newintent', open)
    listening = true
  }
  open()
  // #endif
}
