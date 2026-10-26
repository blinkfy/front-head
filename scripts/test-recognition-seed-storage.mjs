import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const sourcePath = fileURLToPath(new URL('../src/utils/recognition-sync.js', import.meta.url))
const source = readFileSync(sourcePath, 'utf8').replace(/^export\s+/gm, '')
const storage = new Map()
const uni = {
  getStorageSync: key => storage.get(key),
  setStorageSync: (key, value) => storage.set(key, value),
  removeStorageSync: key => storage.delete(key)
}
const context = { uni }
vm.runInNewContext(`${source}\nglobalThis.__saveSeed = saveSeed;`, context, { filename: sourcePath })

const staleImage = 'data:image/png;base64,stale-image'
storage.set('ai_chat_seed_image', staleImage)
storage.set('ai_chat_seed_image_large', staleImage)
storage.set('ai_chat_seed_category', '旧分类')

context.__saveSeed({
  historyId: 4201,
  imageBase64: '',
  category: '可回收物',
  userPrompt: '请继续解释分类依据。',
  assistantReply: '这是新的识别记录。'
})

const seed = JSON.parse(storage.get('ai_chat_seed_payload'))
assert.equal(seed.historyId, 4201, 'historyId-only seed should be stored')
assert.equal(seed.imageBase64, '', 'historyId-only seed should remain free of image base64')
assert.equal(storage.has('ai_chat_seed_image'), false, 'stale legacy image should be removed')
assert.equal(storage.has('ai_chat_seed_image_large'), false, 'stale large-image cache should be removed')
assert.equal(storage.get('ai_chat_seed_category'), '可回收物', 'the category index should track the new seed')

console.log('PASS recognition seed storage: historyId-only seeds persist without inheriting stale image caches')
