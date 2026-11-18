import request from '@/api/index.js'

import { readCommunityChatEnabled } from '@/utils/community-chat-settings.js'
export function communitySocialEnabled(force = false) { return readCommunityChatEnabled(force) }
export const getCommunityPostDetail = postId => request({ url: `/api/community/post/${encodeURIComponent(postId)}/detail`, method: 'GET', needAuth: true })
export const shareCommunityPost = (postId, data) => request({ url: `/api/community/post/${encodeURIComponent(postId)}/share`, method: 'POST', data, needAuth: true })
export const getCommunityNotifications = data => request({ url: '/api/community/notifications', method: 'GET',
  data: Object.fromEntries(Object.entries(data || {}).filter(([, value]) => value !== undefined && value !== null && value !== '')),
  needAuth: true, silent: true })
export const readCommunityNotifications = value => request({ url: '/api/community/notifications/read', method: 'POST', data: typeof value === 'object' ? value : { throughId: value }, needAuth: true, silent: true })

// Only typed messages or server-generated compatibility metadata are cards.
// Ordinary text, including copied JSON or an old marker, stays ordinary text.
export function communityPostCard(message) {
  let card
  if (message?.type === 'others' && typeof message.content === 'string' && message.content.length <= 4096) {
    try { card = JSON.parse(message.content) } catch (_) { return null }
  } else if (message?.type === 'text' && message.storedType === 'others') card = message.communityPost
  if (!card || card.kind !== 'community_post' || card.version !== 1 ||
      !Number.isSafeInteger(card.postId) || card.postId <= 0 || !Number.isSafeInteger(card.communityId) || card.communityId <= 0 ||
      !Number.isSafeInteger(card.author?.id) || card.author.id <= 0 || typeof card.title !== 'string' ||
      typeof card.author.name !== 'string' || typeof card.tag !== 'string') return null
  return { kind: 'community_post', version: 1, postId: card.postId, communityId: card.communityId,
    title: Array.from(card.title).slice(0, 32).join('') || '社区帖子',
    author: { id: card.author.id, name: Array.from(card.author.name).slice(0, 40).join('') || '社区成员' },
    tag: Array.from(card.tag).slice(0, 16).join('') }
}

export function communityPostLink(message) {
  const card = communityPostCard(message)
  return card ? `/pages-nonTheme/community-post?postId=${card.postId}&communityId=${card.communityId}` : ''
}
