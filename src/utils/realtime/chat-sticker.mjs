export const chatStickers = [
  '我来了', '收到！', '笑死', '等一下', '抱抱', '太强了', '投得漂亮', '收工啦',
  '谢谢', '啊？', '无语', '辛苦啦'
].map((label, index) => ({ id: `v1-${String(index + 1).padStart(2, '0')}`, label }))

const stickersById = new Map(chatStickers.map(sticker => [sticker.id, sticker]))

export function chatSticker(id) {
  return stickersById.get(id) || null
}

export function messageChatStickerId(type, metadata) {
  if (type !== 'image') return ''
  if (typeof metadata === 'string') {
    if (metadata.length > 8192 || !metadata.startsWith('{')) return ''
    try { metadata = JSON.parse(metadata) } catch (_) { return '' }
  }
  const id = metadata?.stickerId
  if (!chatSticker(id)) return ''
  const stem = `chat-stickers/v1/${id.slice(3)}`
  const path = typeof metadata.path === 'string' ? metadata.path.replace(/^\//, '') : ''
  return path === `${stem}.gif` || path === `${stem}-thumb.png` ? id : ''
}

export function chatStickerPreview(message) {
  if (message?.type !== 'image' || message.isWithdraw) return ''
  const sticker = chatSticker(message.stickerId || messageChatStickerId(message.type, message.content))
  return sticker ? `表情[${sticker.label}]` : ''
}
