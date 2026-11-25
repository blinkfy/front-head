import { baseUrl } from '@/api/settings.js'
import { chatSticker } from '@/utils/realtime/chat-sticker.mjs'

export function chatStickerAssetUrls(id) {
  if (!chatSticker(id)) return null
  const file = id.slice(3)
  let root = `${baseUrl.replace(/\/$/, '')}/chat-stickers/v1`
  let motion = ['gif', 'webp']
  // #ifdef APP-PLUS
  root = '/static/app/chat-stickers/v1'
  motion = ['gif']
  // #endif
  // #ifdef H5
  motion = ['webp', 'gif']
  // #endif
  return { thumbnail: `${root}/${file}-thumb.webp.png`, motion: motion.map(ext => `${root}/${file}.${ext}`) }
}

