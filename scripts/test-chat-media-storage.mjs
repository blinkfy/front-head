import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { uniPrePlugin } = require('@dcloudio/uni-cli-shared/dist/vite/plugins/pre')
const { initPreContext } = require('@dcloudio/uni-cli-shared/dist/preprocess/context')
const mediaPath = fileURLToPath(new URL('../src/pages-nonTheme/utils/chat-local-media.js', import.meta.url))
const source = readFileSync(mediaPath, 'utf8')
const MiB = 1024 * 1024
const original = 'https://example.test/original.jpg'
const video = 'https://example.test/video.mp4'
const scope = ['9', '123']
let moduleGeneration = 0

function loadCompiledMedia(platform) {
  initPreContext(platform)
  const result = uniPrePlugin({ build: {} }, {}).transform(source, mediaPath)
  assert.ok(result?.code, 'the uni-app build must preprocess the actual media file path')
  const compiled = result.code
  if (platform === 'h5') assert.doesNotMatch(compiled, /function nativeWrite\(/)
  else assert.doesNotMatch(compiled, /indexedDB|function webRead\(/)
  if (platform === 'app-plus') assert.doesNotMatch(compiled, /wx\.getFileSystemManager/)
  if (platform === 'mp-weixin') assert.doesNotMatch(compiled, /plus\.android/)
  return () => import(`data:text/javascript;charset=utf-8,${encodeURIComponent(compiled)}#${++moduleGeneration}`)
}

async function fixture(platform, { downloadSize = 70 * MiB, downloadSizes = {}, failSave = false, freeBytes = 4 * 1024 * MiB, deferredUrls = [] } = {}) {
  const files = new Map()
  const index = new Map()
  let downloadCount = 0
  const downloadCalls = []
  const deferred = new Map()
  const delayedUrls = new Set(deferredUrls)
  let free = freeBytes
  let shouldFailSave = failSave
  let offline = false
  const stat = ({ path, filePath, success, fail }) => {
    const size = files.get(path || filePath)
    if (size) success({ size, stats: { size } })
    else fail({ errMsg: 'no such file or directory' })
  }
  const saveFile = ({ tempFilePath, success, fail }) => {
    if (shouldFailSave) { fail({ errMsg: 'quota exceeded' }); return }
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
    getNetworkType: ({ success }) => success({ networkType: offline ? 'none' : 'wifi' }),
    downloadFile({ url, success }) {
      downloadCalls.push(url)
      const ordinal = downloadCount++
      const tempFilePath = ordinal === 0 ? '/temp-original' : `/temp-original-${ordinal + 1}`
      files.set(tempFilePath, downloadSizes[url] ?? downloadSize)
      const complete = () => success({ statusCode: 200, tempFilePath })
      if (delayedUrls.has(url)) {
        const callbacks = deferred.get(url) || []
        callbacks.push(complete)
        deferred.set(url, callbacks)
      } else complete()
    } }
  globalThis.wx = { getFileSystemManager: () => fs }
  globalThis.plus = { os: { name: 'Android' }, io: { convertLocalFileSystemURL: () => '/data/doc' },
    android: { newObject: () => ({}), invoke: () => free } }
  const load = loadCompiledMedia(platform === 'MP' ? 'mp-weixin' : 'app-plus')
  return {
    api: await load(), load, files, index,
    setFree: size => { free = size },
    setFailSave: value => { shouldFailSave = value },
    setOffline: value => { offline = value },
    getDownloadCount: () => downloadCount,
    getDownloadCalls: () => [...downloadCalls],
    completeDownloads: url => { for (const complete of deferred.get(url) || []) complete(); deferred.delete(url) }
  }
}

async function h5Fixture() {
  const records = new Map()
  const stores = new Set()
  let fetchCount = 0
  let objectUrlId = 0
  let failOriginalWrites = false
  function transactionStore(transaction) {
    const requestFor = run => {
      const request = {}
      transaction.pending++
      queueMicrotask(() => {
        try { run(request) }
        catch (error) { request.error = error; request.onerror?.() }
        transaction.pending--
        if (transaction.pending === 0) queueMicrotask(() => {
          if (transaction.pending === 0) transaction.oncomplete?.()
        })
      })
      return request
    }
    return {
      get(key) { return requestFor(request => { request.result = records.get(key); request.onsuccess?.() }) },
      put(record) {
        if (failOriginalWrites && record.kind === 'original') {
          return requestFor(() => { transaction.error = new Error('quota exceeded'); transaction.onabort?.() })
        }
        records.set(record.key, record)
        return requestFor(() => {})
      },
      delete(key) { records.delete(key); return requestFor(() => {}) },
      index() {
        return {
          getAll(kind) { return requestFor(request => { request.result = [...records.values()].filter(record => record.kind === kind); request.onsuccess?.() }) },
          openCursor(kind) {
            const entries = [...records.values()].filter(record => record.kind === kind)
            const request = {}
            let position = 0
            const advance = () => requestFor(() => {
              if (position >= entries.length) { request.result = null; request.onsuccess?.(); return }
              const entry = entries[position++]
              request.result = { value: entry, continue: advance }
              request.onsuccess?.()
            })
            advance()
            return request
          }
        }
      }
    }
  }
  const store = { createIndex() {} }
  const database = {
    objectStoreNames: { contains: name => stores.has(name) },
    createObjectStore(name) { stores.add(name); return store },
    transaction() {
      const transaction = { pending: 0 }
      transaction.objectStore = () => transactionStore(transaction)
      return transaction
    }
  }
  const previous = {
    indexedDB: globalThis.indexedDB,
    navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
    fetch: globalThis.fetch,
    createObjectURL: URL.createObjectURL,
    revokeObjectURL: URL.revokeObjectURL
  }
  globalThis.indexedDB = { open() {
    const request = { result: database }
    queueMicrotask(() => { request.onupgradeneeded?.(); request.onsuccess?.() })
    return request
  } }
  Object.defineProperty(globalThis, 'navigator', { value: { storage: {}, locks: undefined, onLine: true }, configurable: true, writable: true })
  globalThis.fetch = async url => {
    fetchCount++
    return new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg', 'content-length': '4' }
    })
  }
  URL.createObjectURL = () => `blob:chat-media-${++objectUrlId}`
  URL.revokeObjectURL = () => {}

  const load = loadCompiledMedia('h5')
  return {
    api: await load(), load,
    getFetchCount: () => fetchCount,
    failOriginalWrites: () => { failOriginalWrites = true },
    restore() {
      if (previous.indexedDB === undefined) delete globalThis.indexedDB
      else globalThis.indexedDB = previous.indexedDB
      if (previous.navigator === undefined) delete globalThis.navigator
      else Object.defineProperty(globalThis, 'navigator', previous.navigator)
      globalThis.fetch = previous.fetch
      URL.createObjectURL = previous.createObjectURL
      URL.revokeObjectURL = previous.revokeObjectURL
    }
  }
}

{
  const { api, load, files, index, getDownloadCount } = await fixture('MP')
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
  assert.equal(reloaded.persistent, true)
  const coldStart = await load()
  const originalHit = await coldStart.fetchChatMedia('1', 'original', original, 70 * MiB, scope)
  assert.equal(originalHit.url, '/saved/temp-original', 'persisted original is reused after module reload')
  assert.equal(getDownloadCount(), 1, 'reloading a persistent original does not download it again')
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

{
  const { api, index, files } = await fixture('APP', { freeBytes: 0 })
  const localRecording = '/saved/call-recording'
  const cachedVideo = '/saved/downloaded-video'
  files.set(localRecording, 80 * MiB)
  files.set(cachedVideo, 40 * MiB)
  index.set('chat_local_media_v2', [
    { key: 'legacy:local-recording', kind: 'attachment', path: localRecording, size: 80 * MiB, usedAt: 1 },
    { key: JSON.stringify(['1', 'attachment', video]), kind: 'attachment', path: cachedVideo, size: 40 * MiB, usedAt: 2 }
  ])
  assert.equal(await api.reclaimAppChatMediaSpace(), 40 * MiB)
  assert.equal(files.has(localRecording), true)
  assert.equal(files.has(cachedVideo), false)
}

for (const platform of ['MP', 'APP']) {
  const downloadSize = 512 * 1024
  const { api, getDownloadCount } = await fixture(platform, {
    downloadSize,
    failSave: platform === 'MP',
    freeBytes: platform === 'APP' ? 128 * MiB : undefined
  })
  const [strict, temporary] = await Promise.all([
    api.fetchChatMedia('1', 'original', original, downloadSize, scope),
    api.fetchChatMedia('1', 'original', original, downloadSize, scope, { allowTemporary: true })
  ])
  assert.equal(strict, null, `${platform} scoped originals keep the default non-persistent fallback`)
  assert.equal(temporary.url, '/temp-original', `${platform} opt-in receives the current downloaded path`)
  assert.equal(temporary.persistent, false, `${platform} opt-in identifies a temporary path`)
  assert.equal(getDownloadCount(), 1, `${platform} callers with different temporary-path policies share one download`)
}

{
  const { api, load, getDownloadCount, index, files } = await fixture('MP', { downloadSize: 512 * 1024 })
  const url = 'https://example.test/thumbnail.jpg'
  const [first, concurrent] = await Promise.all([
    api.fetchChatMedia('1', 'preview', url),
    api.fetchChatMedia('1', 'preview', url)
  ])
  assert.equal(first.url, concurrent.url, 'concurrent thumbnail requests share the same cache result')
  assert.equal(getDownloadCount(), 1, 'concurrent thumbnail requests download once')
  const afterRestart = await load()
  assert.equal((await afterRestart.readChatMedia('1', 'preview', url)).url, first.url)
  assert.equal(getDownloadCount(), 1, 'persisted thumbnail hit after reload does not redownload')
}

{
  const thumbnail = 'https://example.test/cold-start-thumbnail.jpg'
  const highResolution = 'https://example.test/cold-start-original.jpg'
  const { api, load, getDownloadCount } = await fixture('MP', {
    downloadSize: 512 * 1024,
    downloadSizes: { [highResolution]: 8 * MiB }
  })
  const cachedPreview = await api.fetchChatMedia('account-a', 'preview', thumbnail)
  const cachedOriginal = await api.fetchChatMedia('account-a', 'original', highResolution, 8 * MiB, ['conversation-a', 'message-a'])
  assert.equal(cachedOriginal.persistent, true)
  assert.equal(getDownloadCount(), 2)

  // Cold startup has no originalLoaded flag in memory; URL + account are sufficient to restore it.
  const coldStart = await load()
  assert.equal((await coldStart.readChatOriginalMedia('account-a', highResolution, ['conversation-b', 'message-b'])).url, cachedOriginal.url,
    'same-account original cache is reusable across message/conversation scopes')
  assert.equal(await coldStart.readChatOriginalMedia('account-b', highResolution, ['conversation-a', 'message-a']), null,
    'original cache remains isolated by account')
  const fetchedOriginal = await coldStart.fetchChatMedia('account-a', 'original', highResolution, 8 * MiB, ['conversation-b', 'message-b'])
  assert.equal(fetchedOriginal.url, cachedOriginal.url, 'original fetch should probe same-account cached originals across scopes')
  const image = await coldStart.readChatImageMedia('account-a', thumbnail, highResolution, ['conversation-b', 'message-b'])
  assert.equal(image.original, true, 'image lookup should prefer an existing original after cold start')
  assert.equal(image.url, cachedOriginal.url)
  await coldStart.removeChatImagePreviews('account-a', [thumbnail])
  assert.equal(await coldStart.readChatMedia('account-a', 'preview', thumbnail), null,
    'using an existing original removes its cached thumbnail')
  assert.equal(getDownloadCount(), 2, 'cold-start original reuse and thumbnail cleanup do not request the backend')
  assert.equal(cachedPreview.url.startsWith('/saved/'), true)
}

{
  const thumbnail = 'https://example.test/preview-race-thumbnail.jpg'
  const highResolution = 'https://example.test/preview-race-original.jpg'
  const { api, getDownloadCount, getDownloadCalls, completeDownloads } = await fixture('MP', {
    downloadSize: 512 * 1024,
    downloadSizes: { [highResolution]: 8 * MiB },
    deferredUrls: [thumbnail]
  })
  const imagePromise = api.readChatImageMedia('account-a', thumbnail, highResolution, scope, { download: true })
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(getDownloadCalls(), [thumbnail], 'image lookup downloads only the thumbnail while no original is cached')

  const originalHandle = await api.fetchChatMedia('account-a', 'original', highResolution, 8 * MiB, scope)
  assert.equal(originalHandle.persistent, true)
  const cleanup = api.removeChatImagePreviews('account-a', [thumbnail])
  completeDownloads(thumbnail)

  const image = await imagePromise
  await cleanup
  assert.equal(image.original, true, 'in-flight thumbnail should switch to an original cached during its download')
  assert.equal(image.url, originalHandle.url)
  assert.equal(await api.readChatMedia('account-a', 'preview', thumbnail), null,
    'thumbnail completion must not recreate the entry after original cleanup')
  assert.equal(getDownloadCount(), 2, 'the race downloads only one thumbnail and one original')
}

{
  const thumbnail = 'https://example.test/preserved-thumbnail.jpg'
  const highResolution = 'https://example.test/unpersisted-original.jpg'
  const { api, load, getDownloadCount, setFailSave, setOffline } = await fixture('APP', {
    downloadSize: 512 * 1024,
    downloadSizes: { [highResolution]: 512 * 1024 }
  })
  const cachedPreview = await api.fetchChatMedia('account-a', 'preview', thumbnail)
  const previewFallback = await api.readChatImageMedia('account-a', thumbnail, highResolution, scope, { download: false })
  assert.notEqual(previewFallback.original, true, 'without a cached original, image lookup falls back to the thumbnail')
  assert.equal(previewFallback.url, cachedPreview.url)
  assert.equal(getDownloadCount(), 1, 'read-only fallback must not proactively download an original')
  setFailSave(true)
  const temporaryOriginal = await api.fetchChatMedia('account-a', 'original', highResolution, 512 * 1024, scope, { allowTemporary: true })
  assert.equal(temporaryOriginal.persistent, false)
  setOffline(true)
  const image = await api.readChatImageMedia('account-a', thumbnail, highResolution, scope, { download: true })
  assert.equal(image.url, temporaryOriginal.url, 'reopening the chat reuses the downloaded original while the app is running')
  assert.equal(image.original, true)
  assert.equal(image.persistent, false)
  assert.equal((await api.fetchChatMedia('account-a', 'original', highResolution, 0, scope, { allowTemporary: true })).url, image.url)
  assert.equal(await api.readChatOriginalMedia('account-a', highResolution, scope), null, 'temporary files never qualify for thumbnail cleanup')
  const otherAccount = await api.readChatImageMedia('account-b', thumbnail, highResolution, scope)
  assert.equal(otherAccount, null, 'temporary originals remain isolated by account')
  assert.equal((await api.readChatMedia('account-a', 'preview', thumbnail)).url, cachedPreview.url,
    'failed original persistence must leave the preview cached')
  const restarted = await load()
  assert.equal((await restarted.readChatImageMedia('account-a', thumbnail, highResolution, scope)).url, cachedPreview.url,
    'a cold start still has the persistent thumbnail when the original could not be saved')
  assert.equal(getDownloadCount(), 2, 'preview fallback uses the cached thumbnail without another request')
}

for (const platform of ['APP', 'MP']) {
  const { api, files, load, getDownloadCount } = await fixture(platform, { downloadSize: 512 * 1024 })
  files.set('/already-downloaded.jpg', 512 * 1024)
  const saved = await api.saveDownloadedChatOriginal('1', original, '/already-downloaded.jpg', scope)
  assert.equal(saved.persistent, true)
  const restarted = await load()
  assert.equal((await restarted.readChatImageMedia('1', '', original, scope)).url, saved.url)
  assert.equal(getDownloadCount(), 0, 'persisting a native image-info result does not download it again')
}

{
  const h5 = await h5Fixture()
  try {
    const highResolution = 'https://example.test/h5-original.jpg'
    const thumbnail = 'https://example.test/h5-thumbnail.jpg'
    const original = await h5.api.fetchChatMedia('h5-account-a', 'original', highResolution)
    assert.equal(original.url.startsWith('blob:chat-media-'), true)
    assert.equal(h5.getFetchCount(), 1)

    const scopedOriginal = await h5.api.fetchChatMedia('h5-account-a', 'original', highResolution, 4, scope)
    assert.equal(scopedOriginal.url.startsWith('blob:chat-media-'), true,
      'H5 scoped original request should reuse a previously cached no-scope original')
    assert.equal(h5.getFetchCount(), 1, 'scoped H5 original lookup should not fetch again')
    assert.equal(await h5.api.readChatOriginalMedia('h5-account-b', highResolution, scope), null,
      'H5 original cache remains isolated by account')

    await h5.api.fetchChatMedia('h5-account-a', 'preview', thumbnail)
    globalThis.navigator.onLine = false
    const selected = await h5.api.readChatImageMedia('h5-account-a', thumbnail, highResolution, scope, { download: true })
    assert.equal(selected.original, true, 'H5 image lookup should prefer an existing original')
    const offlinePreview = await h5.api.readChatImageMedia('h5-account-a', thumbnail, highResolution + '?uncached', scope, { download: true })
    assert.ok(offlinePreview?.url && !offlinePreview.original, 'H5 fullscreen can open the cached thumbnail offline')
    assert.equal(await h5.api.fetchChatMedia('h5-account-a', 'original', highResolution + '?uncached'), null,
      'H5 offline original upgrade does not fetch')
    await h5.api.removeChatImagePreviews('h5-account-a', [thumbnail])
    assert.equal(await h5.api.readChatMedia('h5-account-a', 'preview', thumbnail), null,
      'H5 original reuse should remove the cached thumbnail')

    const coldStart = await h5.load()
    assert.ok(await coldStart.readChatOriginalMedia('h5-account-a', highResolution, scope),
      'H5 original cache survives module reload')
    assert.equal(h5.getFetchCount(), 2, 'H5 cached reads after reload do not fetch media')

    globalThis.navigator.onLine = true
    h5.failOriginalWrites()
    const unsavedUrl = 'https://example.test/original-over-quota.jpg'
    const firstPage = await coldStart.fetchChatMedia('h5-account-a', 'original', unsavedUrl)
    firstPage.release()
    globalThis.navigator.onLine = false
    const reopened = await coldStart.readChatImageMedia('h5-account-a', thumbnail, unsavedUrl, scope, { download: true })
    assert.equal(reopened?.original, true, 'H5 reopening can use the downloaded Blob even if the database write failed')
    assert.equal(reopened.persistent, false)
    assert.notEqual(reopened.url, firstPage.url, 'reopening gets a fresh object URL for the same image bytes')
    assert.equal(await coldStart.readChatOriginalMedia('h5-account-a', unsavedUrl), null)
    assert.equal(h5.getFetchCount(), 3, 'H5 reopening does not download the original again')
  } finally {
    h5.restore()
  }
}

for (const platform of ['APP', 'MP']) {
  const { api, load, setOffline, getDownloadCalls } = await fixture(platform, { downloadSize: 512 * 1024 })
  const thumbnail = 'https://example.test/api/chat/imageReview?path=photo&token=old'
  const thumbnailOnly = 'https://example.test/thumbnail-only.jpg'
  const missingOriginal = 'https://example.test/uncached-original.jpg'
  const hd = await api.fetchChatMedia('1', 'original', original, 0, scope)
  const preview = await api.fetchChatMedia('1', 'preview', thumbnailOnly)
  setOffline(true)
  const reopened = await load()
  const best = await reopened.readChatImageMedia('1', thumbnail, original, scope, { download: true })
  assert.equal(best.url, hd.url)
  assert.equal(best.original, true)
  const fallback = await reopened.readChatImageMedia('1', thumbnailOnly, missingOriginal, scope, { download: true })
  assert.equal(fallback.url, preview.url)
  assert.equal(await reopened.fetchChatMedia('1', 'original', missingOriginal, 0, scope), null)
  assert.equal(await reopened.readChatImageMedia('1', thumbnail, missingOriginal, scope, { download: true }), null)
  assert.deepEqual(getDownloadCalls(), [original, thumbnailOnly], `${platform} offline browsing sends no media downloads`)
}

console.log('Chat media capacity, migration, shared quota and offline cache fallbacks passed.')
