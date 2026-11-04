import request from '@/api/index.js'

let settingsPromise, settingsUntil = 0
export function communitySocialEnabled(force = false) {
  if (!force && settingsPromise && Date.now() < settingsUntil) return settingsPromise
  settingsUntil = Date.now() + 5000
  settingsPromise = request({ url: '/api/ai/settings', method: 'GET', silent: true }).then(res =>
    res?.code === 0 && Boolean(res.data) && res.data.communityChatEnabled !== false
  ).catch(() => false)
  return settingsPromise
}
export const getCommunityPostDetail = postId => request({ url: `/api/community/post/${encodeURIComponent(postId)}/detail`, method: 'GET', needAuth: true })
export const shareCommunityPost = (postId, data) => request({ url: `/api/community/post/${encodeURIComponent(postId)}/share`, method: 'POST', data, needAuth: true })
export const getCommunityNotifications = data => request({ url: '/api/community/notifications', method: 'GET',
  data: Object.fromEntries(Object.entries(data || {}).filter(([, value]) => value !== undefined && value !== null && value !== '')),
  needAuth: true, silent: true })
export const readCommunityNotifications = value => request({ url: '/api/community/notifications/read', method: 'POST', data: typeof value === 'object' ? value : { throughId: value }, needAuth: true, silent: true })

// A strict internal link format; never navigate to arbitrary message-supplied URLs.
export function communityPostLink(content) {
  if (typeof content !== 'string' || !content.startsWith('【社区帖子】\n')) return ''
  const match = /\n(\/pages-nonTheme\/community-post\?postId=[1-9]\d{0,9}&communityId=[1-9]\d{0,9})$/.exec(content)
  return match ? match[1] : ''
}
