import { fetchChatMedia, forgetChatMedia, readChatMedia } from './chat-local-media.mjs'

const scope = (conversationId, messageId) => [conversationId ?? 'unknown', messageId]

export async function restoreCachedChatOriginalImages({ userId, conversationId, images } = {}) {
  const restored = {}
  for (const image of Array.isArray(images) ? images : []) {
    if (image?.id == null) continue
    const media = await readChatMedia(userId, 'original', image.sourceUrl, scope(conversationId, image.id))
    if (media) restored[image.id] = media.url
  }
  return restored
}

export async function cacheChatOriginalImage({ userId, conversationId, messageId, sourceUrl, expectedSize } = {}) {
  if (messageId == null) return null
  const media = await fetchChatMedia(userId, 'original', sourceUrl, expectedSize, scope(conversationId, messageId))
  return media?.url || null
}

export function removeCachedChatOriginalImage({ userId, conversationId, messageId, sourceUrl } = {}) {
  if (messageId == null) return
  return forgetChatMedia(userId, 'original', sourceUrl, '', scope(conversationId, messageId))
}
