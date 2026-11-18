import assert from 'node:assert/strict'

const moduleUrl = new URL('../src/utils/chat-avatar-cache.mjs', import.meta.url)
let runId = 0

function setup() {
  const storage = new Map()
  const files = new Map()
  const calls = { download: 0, save: 0, bitmapSave: 0, removed: 0 }
  let fileId = 0

  globalThis.uni = {
    getStorageSync(key) { return storage.get(key) },
    setStorageSync(key, value) { storage.set(key, structuredClone(value)) },
    downloadFile({ url, success }) {
      calls.download++
      const tempFilePath = `temp://${++fileId}`
      files.set(tempFilePath, { size: 1024, url })
      queueMicrotask(() => success({ statusCode: 200, tempFilePath }))
    },
    getFileInfo({ filePath, success, fail }) {
      const info = files.get(filePath)
      queueMicrotask(() => info ? success({ size: info.size }) : fail(new Error('missing file')))
    },
    getImageInfo({ src, success, fail }) {
      queueMicrotask(() => files.has(src) ? success({ path: src }) : fail(new Error('invalid image')))
    },
    saveFile({ tempFilePath, success }) {
      calls.save++
      const savedFilePath = `saved://${++fileId}`
      files.set(savedFilePath, files.get(tempFilePath))
      queueMicrotask(() => success({ savedFilePath }))
    },
    removeSavedFile({ filePath, success }) {
      calls.removed++
      files.delete(filePath)
      queueMicrotask(() => success({}))
    },
    getSavedFileInfo({ filePath, success, fail }) {
      queueMicrotask(() => files.has(filePath) ? success({ size: files.get(filePath).size }) : fail(new Error('missing file')))
    }
  }

  globalThis.plus = {
    nativeObj: {
      Bitmap: class {
        loadBase64Data(_data, success) { queueMicrotask(success) }
        save(path, _options, success) {
          calls.bitmapSave++
          files.set(path, { size: 512, native: true })
          queueMicrotask(() => success({ target: path }))
        }
        clear() {}
      }
    },
    io: {
      resolveLocalFileSystemURL(path, success, fail) {
        if (!files.has(path)) { queueMicrotask(() => fail(new Error('missing file'))); return }
        queueMicrotask(() => success({ remove(done) { files.delete(path); queueMicrotask(done) } }))
      }
    }
  }
  return { storage, files, calls }
}

async function freshModule() {
  return import(`${moduleUrl.href}?cache-regression=${++runId}`)
}

async function testRemotePersistenceAndDeduplication() {
  const env = setup()
  const cache = await freshModule()
  const owner = 'user-1'
  const url = 'https://cdn.example.test/avatar.png'

  const [first, concurrent] = await Promise.all([
    cache.loadChatAvatar(owner, url),
    cache.loadChatAvatar(owner, url)
  ])
  assert.equal(first, concurrent, 'concurrent requests should share one saved path')
  assert.equal(env.calls.download, 1, 'concurrent requests should download once')
  assert.equal(env.calls.save, 1, 'remote image should be saved locally')
  assert.equal(cache.getCachedChatAvatar(owner, url), first)

  const afterRestart = await freshModule()
  assert.equal(afterRestart.getCachedChatAvatar(owner, url), first, 'persisted index should survive module reload')
  assert.equal(env.calls.download, 1, 'cache hit after reload should not download again')
}

async function testInlineAvatarPersistenceAndContentKey() {
  const env = setup()
  const originalNow = Date.now
  Date.now = () => 1000
  try {
    const cache = await freshModule()
    const owner = 'user-2'
    const firstData = 'data:image/png;base64,aGVsbG8='
    const changedData = 'data:image/png;base64,d29ybGQ='

    const firstPath = await cache.loadChatAvatar(owner, firstData)
    assert.match(firstPath, /^_doc\/chat_avatar_1000_\d+\.png$/)
    assert.equal(env.calls.bitmapSave, 1, 'real base64 avatar should be written as a native PNG')
    assert.equal(env.calls.download, 0, 'base64 avatar should not be downloaded')
    assert.equal(cache.getCachedChatAvatar(owner, firstData), firstPath)
    assert.equal(JSON.stringify([...env.storage.values()]).includes(firstData), false, 'index must not store image bytes')

    const afterRestart = await freshModule()
    assert.equal(afterRestart.getCachedChatAvatar(owner, firstData), firstPath, 'native file index should survive module reload')
    const changedPath = await cache.loadChatAvatar(owner, changedData)
    assert.notEqual(changedPath, firstPath, 'changed image data should get a distinct file')
    assert.equal(env.calls.bitmapSave, 2)
  } finally {
    Date.now = originalNow
  }
}

async function testGeneratedAndDefaultAvatarsAreSkipped() {
  const env = setup()
  const cache = await freshModule()
  assert.equal(await cache.loadChatAvatar('user-3', 'https://ui-avatars.com/api/?name=Alice'), '')
  assert.equal(await cache.loadChatAvatar('user-3', 'https://cdn.example.test/default-avatar.png'), '')
  assert.equal(await cache.loadChatAvatar('user-3', '/static/person.webp.png'), '')
  assert.equal(env.calls.download, 0, 'generated and default avatars must not download')
  assert.equal(env.calls.bitmapSave, 0, 'generated and default avatars must not be persisted as images')
}

async function testUnreadableFileReloads() {
  const env = setup()
  const cache = await freshModule()
  const owner = 'user-4'
  const url = 'https://cdn.example.test/broken-then-fixed.png'
  const path = await cache.loadChatAvatar(owner, url)

  cache.forgetMissingChatAvatar(owner, url, path)
  assert.equal(cache.getCachedChatAvatar(owner, url), '', 'forgotten local path should stop being served')
  const replacement = await cache.loadChatAvatar(owner, url)
  assert.notEqual(replacement, path, 'missing local file should be downloaded again')
  assert.equal(env.calls.download, 2)
  assert.equal(env.calls.removed, 1, 'unreadable saved file entry should be removed before reload')
}

await testRemotePersistenceAndDeduplication()
await testInlineAvatarPersistenceAndContentKey()
await testGeneratedAndDefaultAvatarsAreSkipped()
await testUnreadableFileReloads()
console.log('chat-avatar-cache regression checks passed')
