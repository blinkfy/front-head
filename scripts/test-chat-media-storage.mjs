import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { preprocess } = require('@dcloudio/uni-cli-shared/lib/preprocess')
const source = readFileSync(new URL('../src/pages-nonTheme/utils/chat-local-media.mjs', import.meta.url), 'utf8')
const MiB = 1024 * 1024
const original = 'https://example.test/original.jpg'
const video = 'https://example.test/video.mp4'
const scope = ['9', '123']

async function fixture(platform) {
  const files = new Map()
  const index = new Map()
  let free = 4 * 1024 * MiB
  const stat = ({ path, filePath, success, fail }) => {
    const size = files.get(path || filePath)
    if (size) success({ size, stats: { size } })
    else fail({ errMsg: 'no such file or directory' })
  }
  const saveFile = ({ tempFilePath, success }) => {
    const savedFilePath = '/saved' + tempFilePath
    files.set(savedFilePath, files.get(tempFilePath))
    files.delete(tempFilePath)
    success({ savedFilePath })
  }
  const removeSavedFile = ({ filePath, success, fail }) => {
    if (files.delete(filePath)) success()
    else fail({ errMsg: 'file not exist' })
  }
  const fs = { stat, saveFile, removeSavedFile }
  globalThis.uni = { getStorageSync: key => index.get(key), setStorageSync: (key, value) => index.set(key, value),
    getFileInfo: stat, getSavedFileInfo: stat, saveFile, removeSavedFile,
    downloadFile({ success }) {
      files.set('/temp-original', 70 * MiB)
      success({ statusCode: 200, tempFilePath: '/temp-original' })
    } }
  globalThis.wx = { getFileSystemManager: () => fs }
  globalThis.plus = { os: { name: 'Android' }, io: { convertLocalFileSystemURL: () => '/data/doc' },
    android: { newObject: () => ({}), invoke: () => free } }
  const context = platform === 'MP' ? { MP: true, MP_WEIXIN: true } : { APP: true, APP_PLUS: true }
  const compiled = preprocess(source, context, { type: 'js' })
  let generation = 0
  const load = () => import(`data:text/javascript;charset=utf-8,${encodeURIComponent(compiled)}#${++generation}`)
  return { api: await load(), load, files, index, setFree: size => { free = size } }
}

{
  const { api, load, files, index } = await fixture('MP')
  files.set('/old-original', 75 * MiB)
  index.set('chat_original_image_cache_v1', JSON.stringify({ old: { userId: '1', conversationId: '9', messageId: '123',
    sourceUrl: original, savedFilePath: '/old-original', lastAccess: 1, size: 75 * MiB } }))
  assert.equal((await api.readChatMedia('1', 'original', original, scope)).url, '/old-original')
  assert.equal(await api.readChatMedia('2', 'original', original, scope), null)
  files.set('/temp-video', 60 * MiB)
  const path = await api.saveDownloadedChatMedia('1', 'attachment', video, '/temp-video')
  assert.equal(path, '/saved/temp-video', 'files over the previous 8 MiB threshold persist')
  assert.equal(files.has('/old-original'), false, 'attachment and legacy original share their persistent file budget')
  const restarted = await load()
  assert.equal(await restarted.readChatMedia('1', 'original', original, scope), null, 'cold start does not reimport evicted legacy files')
  assert.equal((await restarted.readChatMedia('1', 'attachment', video)).url, path)
  files.set('/over-budget', 121 * MiB)
  assert.equal(await restarted.saveDownloadedChatMedia('1', 'attachment', video + '?other', '/over-budget'), '/over-budget')
  assert.equal(files.has(path), true, 'a file larger than the whole budget does not evict usable media')
  const reloaded = await restarted.fetchChatMedia('1', 'original', original, 70 * MiB, scope)
  assert.equal(reloaded.url, '/saved/temp-original', 'the original-image entry point writes to the shared cache')
  assert.equal(await restarted.readChatMedia('1', 'attachment', video), null)
}

{
  const { api, files, setFree } = await fixture('APP')
  files.set('/large', 600 * MiB)
  assert.equal(await api.saveDownloadedChatMedia('1', 'attachment', video, '/large'), '/saved/large')
  setFree(260 * MiB)
  files.set('/small', 10 * MiB)
  assert.equal(await api.saveDownloadedChatMedia('1', 'attachment', video + '?other', '/small'), '/saved/small')
  assert.equal(files.has('/saved/large'), false, 'Android reclaims the least recently used file when disk space is low')
  setFree(0)
  files.set('/temp', 40 * MiB)
  assert.equal(await api.saveDownloadedChatMedia('1', 'attachment', video, '/temp'), '/temp')
  assert.equal(files.has('/saved/small'), true, 'leaves the existing cache when reclaiming it cannot make enough room')
}

console.log('Chat media Android capacity and WeChat migration, shared quota and fallbacks passed.')
