export const SEED_IMAGE_BINDING_KEY = 'ai_chat_seed_image_binding'

export function seedImageFingerprint(seed) {
  if (!seed || typeof seed !== 'object') return ''
  return String(seed.createdAt || '').trim() || [
    String(seed.category || '').trim(),
    String(seed.assistantReply || '').trim().slice(0, 120)
  ].join('__')
}

export function resolveCachedSeedImage(seed, getStorage) {
  if (!seed) return ''
  const raw = String(seed.imageBase64 || '')
  if (raw.startsWith('data:image/')) return raw
  if (raw.startsWith('__LARGE_IMAGE__:')) {
    const large = getStorage('ai_chat_seed_image_large')
    const length = Number(raw.slice('__LARGE_IMAGE__:'.length))
    return typeof large === 'string' && large.startsWith('data:image/') && large.length === length ? large : ''
  }
  // 旧版分开存图时，要求分类一致；已有但损坏的图片字段不回退到可能过期的旧图。
  if (raw || Number(seed.historyId) > 0 || !seed.category || getStorage('ai_chat_seed_category') !== seed.category) return ''
  const legacy = getStorage('ai_chat_seed_image')
  return typeof legacy === 'string' && legacy.startsWith('data:image/') ? legacy : ''
}

export function cachedSeedSession(binding, fingerprint, owner, preferredSessionId) {
  if (binding?.fingerprint === fingerprint) {
    if (binding.owner && binding.owner !== owner) return ''
    return String(binding.sessionId || '')
  }
  return String(preferredSessionId || '')
}

// 仅恢复唯一匹配的识别消息对，不将同一张缓存图片套到其他带图消息。
export function findCachedSeedMessage(messages, userText, assistantText) {
  let match = null
  for (let index = 0; index < messages.length - 1; index++) {
    const user = messages[index]
    const assistant = messages[index + 1]
    if (user.role !== 'user' || !user.hasImage || assistant.role !== 'assistant') continue
    if (String(user.content || '').trim() !== userText.trim()) continue
    if (String(assistant.content || '').trim() !== assistantText.trim()) continue
    if (match) return null
    match = user
  }
  return match
}
