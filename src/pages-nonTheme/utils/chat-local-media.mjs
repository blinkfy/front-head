const MiB = 1024 * 1024
const buckets = {
  avatar: { entries: 160, total: 12 * MiB, item: MiB },
  preview: { entries: 180, total: 12 * MiB, item: MiB },
  original: { entries: 100, total: 80 * MiB, item: 20 * MiB },
  attachment: { entries: 50, total: 80 * MiB, item: 20 * MiB }
}
// WeChat's persistent file quota is shared with unrelated features.
const miniMedia = { entries: 180, total: 120 * MiB, item: 120 * MiB }
const appMedia = { entries: 300, total: 512 * MiB, item: 512 * MiB }
const STORAGE_KEY = 'chat_local_media_v2'
const LEGACY_MEDIA_KEY = 'chat_local_media_v1'
const LEGACY_ORIGINAL_KEY = 'chat_original_image_cache_v1'
const pending = new Map()
let writes = Promise.resolve()
let nativeIndex
let lastNativeTouch = 0
let database

const largeMedia = kind => kind === 'original' || kind === 'attachment'

function descriptor(owner, kind, url, scope = []) {
  if (!owner || owner === 'unknown' || !Object.prototype.hasOwnProperty.call(buckets, kind) || !/^https?:\/\//i.test(url)) return null
  // imageReview links include a login token which may rotate across sessions.
  const source = /\/api\/chat\/imageReview\?/i.test(url)
    ? url.replace(/([?&])(?:token|__chat_retry)=[^&#]*(?=&|#|$)/gi, '$1').replace(/([?&])&+/g, '$1').replace(/[?&](?=#|$)/g, '')
    : url
  return { key: JSON.stringify([String(owner), kind, source, ...scope.map(String)]), kind }
}

function limits(kind) {
  // #ifdef MP-WEIXIN
  if (largeMedia(kind)) return miniMedia
  // #endif
  // #ifdef APP-PLUS
  if (largeMedia(kind)) return appMedia
  // #endif
  return buckets[kind]
}

function serialize(task) {
  const result = writes.then(task)
  writes = result.catch(() => {})
  return result
}

function selectEvictions(entries, newEntry, budget = limits(newEntry.kind), shared = false) {
  const oldest = entries.filter(entry => (shared ? largeMedia(entry.kind) : entry.kind === newEntry.kind) && entry.key !== newEntry.key)
    .sort((a, b) => a.usedAt - b.usedAt)
  let size = oldest.reduce((sum, entry) => sum + entry.size, newEntry.size)
  let count = oldest.length + 1
  const evictions = []
  for (const entry of oldest) {
    if (count <= budget.entries && size <= budget.total) break
    evictions.push(entry)
    size -= entry.size
    count--
  }
  return count <= budget.entries && size <= budget.total ? evictions : null
}

// #ifdef H5
function openDatabase() {
  if (!database) {
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open('fentouxia-chat-media', 1)
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('media', { keyPath: 'key' })
        store.createIndex('kind', 'kind')
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('Chat media database blocked'))
    }).catch(error => { database = undefined; throw error })
  }
  return database
}

async function webTransaction(action) {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('media', 'readwrite')
    tx.onabort = () => reject(tx.error)
    let value
    tx.oncomplete = () => resolve(value)
    action(tx.objectStore('media'), result => { value = result })
  })
}

function webRead(key) {
  return webTransaction((store, setValue) => {
    const request = store.get(key)
    request.onsuccess = () => {
      const entry = request.result
      if (!entry || entry.writing) return
      if (Date.now() - entry.usedAt > 60000) store.put({ ...entry, usedAt: Date.now() })
      setValue(entry)
    }
  }).then(async entry => {
    if (!entry?.file) return entry?.blob
    const dir = await webFileDirectory()
    const file = await (await dir.getFileHandle(entry.file)).getFile()
    return file.type === entry.mime ? file : new File([file], file.name, { type: entry.mime })
  })
}

function webExclusive(task) {
  if (navigator.locks?.request) return navigator.locks.request('fentouxia-chat-media', task)
  return serialize(task)
}

function webEntries(kind) {
  return webTransaction((store, setValue) => {
    const entries = []
    const request = kind ? store.index('kind').openCursor(kind) : store.openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) { setValue(entries); return }
      const { key, kind, size, usedAt, file, writing } = cursor.value
      entries.push({ key, kind, size, usedAt, file, writing })
      cursor.continue()
    }
  })
}

function webPut(entry) { return webTransaction(store => store.put(entry)) }

async function webFileDirectory() {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle('fentouxia-chat-media', { create: true })
}

async function webRemove(entry, dir) {
  if (entry.file) {
    try { await (dir || await webFileDirectory()).removeEntry(entry.file) }
    catch (error) { if (error?.name !== 'NotFoundError') throw error }
  }
  await webTransaction(store => store.delete(entry.key))
}

function webWrite(entry) {
  if (!largeMedia(entry.kind)) {
    return webTransaction(store => {
      const request = store.index('kind').getAll(entry.kind)
      request.onsuccess = () => {
        for (const old of selectEvictions(request.result, entry) || []) store.delete(old.key)
        store.put(entry)
      }
    })
  }
  return webExclusive(async () => {
    const entries = await webEntries(entry.kind)
    const existing = entries.find(old => old.key === entry.key)
    if (existing?.file) return
    const evictions = selectEvictions(entries, entry)
    if (!evictions) return
    for (const old of evictions) await webRemove(old)
    await webPut(entry)
  })
}

function webMediaType(response, url, kind) {
  const mime = response.headers.get('content-type') || ''
  const extension = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(url)?.[1]?.toLowerCase()
  if (/^text\/html(?:;|$)/i.test(mime) && !(kind === 'attachment' && /^(?:html?|xhtml)$/.test(extension))) return null
  if (/^application\/json(?:;|$)/i.test(mime) && !(kind === 'attachment' && extension === 'json')) return null
  if (mime && mime !== 'application/octet-stream') return mime
  return { mp3: 'audio/mpeg', aac: 'audio/aac', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg',
    amr: 'audio/amr', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' }[extension] || mime
}

async function streamWebMedia(item, url, expectedSize, dir) {
  return webExclusive(async () => {
    const cached = await webRead(item.key).catch(() => null)
    if (cached) return cached
    const entries = await webEntries()
    for (const old of entries) if (old.writing || (old.key === item.key && old.file)) await webRemove(old, dir)
    const { quota, usage } = await navigator.storage.estimate()
    if (!(quota > 0 && Number.isFinite(usage))) return null
    const media = entries.filter(old => largeMedia(old.kind) && !old.writing && old.key !== item.key)
    const stored = media.reduce((sum, old) => sum + old.size, 0)
    const free = quota - usage - Math.min(64 * MiB, quota * 0.05)
    const total = Math.max(0, stored + free)
    if (expectedSize > total) return null
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120000)
    let staging
    try {
      const response = await fetch(url, { signal: controller.signal })
      if (response.status !== 200 || !response.body) return null
      const mime = webMediaType(response, url, item.kind)
      if (mime === null) return null
      const sizeHint = Number(response.headers.get('content-length')) || expectedSize || 1
      const evictions = selectEvictions(media, { ...item, size: sizeHint }, { total, entries: 300 }, true)
      if (!evictions) return null
      const available = free + evictions.reduce((sum, old) => sum + old.size, 0)
      if (available <= 0) return null
      for (const old of evictions) await webRemove(old, dir)
      staging = { ...item, file: crypto.randomUUID(), mime, size: 0, usedAt: Date.now(), writing: true }
      await webPut(staging)
      const handle = await dir.getFileHandle(staging.file, { create: true })
      const writer = await handle.createWritable()
      let size = 0
      const countBytes = new TransformStream({ transform(chunk, output) {
        size += chunk.byteLength
        if (size > available) throw new Error('Chat media exceeds available storage')
        output.enqueue(chunk)
      } })
      await response.body.pipeThrough(countBytes).pipeTo(writer, { signal: controller.signal })
      if (!size) return null
      const file = await handle.getFile()
      await webPut({ ...staging, size, writing: false })
      staging = null
      return file.type === mime ? file : new File([file], file.name, { type: mime })
    } finally {
      clearTimeout(timeout)
      controller.abort()
      if (staging) await webRemove(staging, dir).catch(() => {})
    }
  })
}

async function downloadBlob(url, kind) {
  const maxBytes = limits(kind).item
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (response.status !== 200 || Number(response.headers.get('content-length')) > maxBytes) return null
    const mime = webMediaType(response, url, kind)
    if (mime === null) return null
    const reader = response.body?.getReader()
    if (!reader) return null
    let size = 0
    const chunks = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) return null
      chunks.push(value)
    }
    return size ? new Blob(chunks, { type: mime }) : null
  } finally {
    clearTimeout(timeout)
    controller.abort()
  }
}
// #endif

// #ifndef H5
function nativeEntries() {
  if (!nativeIndex) {
    const stored = uni.getStorageSync(STORAGE_KEY)
    const entries = new Map()
    const saved = Array.isArray(stored) ? stored : uni.getStorageSync(LEGACY_MEDIA_KEY)
    for (const entry of (Array.isArray(saved) ? saved : [])) {
      if (entry?.key && entry.path && Number.isFinite(entry.size) && entry.size > 0) entries.set(entry.key, entry)
    }
    if (!Array.isArray(stored)) {
      const legacy = uni.getStorageSync(LEGACY_ORIGINAL_KEY)
      let originals = legacy
      try { if (typeof legacy === 'string') originals = JSON.parse(legacy) } catch (_) { originals = null }
      for (const [oldKey, image] of Object.entries(originals || {})) {
        if (!image?.savedFilePath) continue
        const scope = [image.conversationId ?? 'unknown', image.messageId ?? '']
        const original = descriptor(image.userId, 'original', image.sourceUrl, scope)
        const key = original && !entries.has(original.key) ? original.key : `legacy:${oldKey}`
        const size = Number(image.size)
        entries.set(key, { key, kind: 'original', path: image.savedFilePath, usedAt: Number(image.lastAccess) || 0,
          size: Number.isFinite(size) && size > 0 ? size : limits('original').total, usable: !!original && image.usable !== false })
      }
    }
    nativeIndex = entries
  }
  return nativeIndex
}

function callFile(api, method, options) {
  return new Promise((resolve, reject) => api[method]({ ...options, success: resolve, fail: reject }))
}

function nativeSize(path, saved) {
  let query
  // #ifdef MP-WEIXIN
  query = callFile(wx.getFileSystemManager(), 'stat', { path }).then(result => result.stats.size)
  // #endif
  // #ifndef MP-WEIXIN
  query = callFile(uni, saved ? 'getSavedFileInfo' : 'getFileInfo', { filePath: path }).then(result => result.size)
  // #endif
  return query.then(size => Number.isFinite(size) && size > 0 ? size : null, error => {
    return /no such file|file not (?:exist|found)|does not exist|不存在/i.test(error?.errMsg || error?.message || '') ? 0 : null
  })
}

function nativeSave(path) {
  // #ifdef MP-WEIXIN
  return callFile(wx.getFileSystemManager(), 'saveFile', { tempFilePath: path }).then(result => result.savedFilePath)
  // #endif
  return callFile(uni, 'saveFile', { tempFilePath: path }).then(result => result.savedFilePath)
}

function nativeRemove(path) {
  // #ifdef MP-WEIXIN
  return callFile(wx.getFileSystemManager(), 'removeSavedFile', { filePath: path })
    .catch(() => callFile(wx.getFileSystemManager(), 'unlink', { filePath: path }))
  // #endif
  return callFile(uni, 'removeSavedFile', { filePath: path })
}

async function removeNativeEntry(entry) {
  try { await nativeRemove(entry.path) }
  catch (_) { if (await nativeSize(entry.path, true) !== 0) return false }
  nativeEntries().delete(entry.key)
  return true
}

function writeNativeIndex() {
  uni.setStorageSync(STORAGE_KEY, [...nativeEntries().values()])
}

function appFreeBytes() {
  // #ifdef APP-PLUS
  try {
    if (plus.os.name === 'Android') {
      const path = plus.io.convertLocalFileSystemURL('_doc/').replace(/^file:\/\//, '')
      const stats = plus.android.newObject('android.os.StatFs', path)
      return Number(plus.android.invoke(stats, 'getAvailableBytes') ?? NaN)
    }
  } catch (_) {}
  // #endif
  return NaN
}

async function nativeWrite(item, path) {
  const size = await nativeSize(path, false)
  if (!(size > 0)) return path
  return serialize(async () => {
    const entries = nativeEntries()
    const existing = entries.get(item.key)
    if (existing) {
      const size = await nativeSize(existing.path, true)
      if (size > 0 && existing.usable !== false) return existing.path
      if (size === 0) entries.delete(item.key)
      else if (!await removeNativeEntry(existing)) return path
    }
    const entry = { ...item, size, usedAt: Date.now() }
    const shared = largeMedia(item.kind)
    const current = [...entries.values()]
    let budget = limits(item.kind)
    if (shared) {
      const free = appFreeBytes()
      if (Number.isFinite(free) && free >= 0) {
        const cached = current.reduce((sum, old) => sum + (largeMedia(old.kind) ? old.size : 0), 0)
        budget = { ...budget, total: Math.max(0, cached + free - 256 * MiB), item: Infinity }
      }
    }
    if (size > budget.item) return path
    const evictions = selectEvictions(current, entry, budget, shared)
    if (!evictions) return path
    for (const old of evictions) {
      if (!await removeNativeEntry(old)) {
        writeNativeIndex()
        return path
      }
    }
    writeNativeIndex()
    const savedPath = await nativeSave(path)
    if (!savedPath) return path
    entries.set(item.key, { ...entry, path: savedPath })
    // Native saveFile can move the temp file. Return its actual path even if indexing fails.
    try { writeNativeIndex() } catch (_) {}
    return savedPath
  }).catch(() => path)
}

async function nativeRead(key) {
  const entry = nativeEntries().get(key)
  if (!entry || entry.usable === false) return null
  const size = await nativeSize(entry.path, true)
  if (nativeEntries().get(key) !== entry) return null
  if (size > 0) {
    entry.usedAt = Date.now()
    if (entry.usedAt - lastNativeTouch > 60000) {
      lastNativeTouch = entry.usedAt
      try { writeNativeIndex() } catch (_) {}
    }
    return entry.path
  }
  if (size === 0) nativeEntries().delete(key)
  return null
}
// #endif

function mediaHandle(value) {
  if (!value) return null
  // #ifdef H5
  const url = URL.createObjectURL(value)
  return { url, release: () => URL.revokeObjectURL(url) }
  // #endif
  return { url: value }
}

async function lookup(key) {
  // #ifdef H5
  return webRead(key)
  // #endif
  return nativeRead(key)
}

export async function readChatMedia(owner, kind, url, scope) {
  const item = descriptor(owner, kind, url, scope)
  if (!item) return null
  try { return mediaHandle(await lookup(item.key)) } catch (_) { return null }
}

export async function forgetChatMedia(owner, kind, url, displayedPath, scope) {
  const item = descriptor(owner, kind, url, scope)
  if (!item) return
  try {
    // #ifdef H5
    if (!largeMedia(kind)) {
      await webTransaction(store => store.delete(item.key))
      return
    }
    await webExclusive(async () => {
      const entry = await webTransaction((store, setValue) => {
        const request = store.get(item.key)
        request.onsuccess = () => setValue(request.result)
      })
      if (entry) await webRemove(entry)
    })
    return
    // #endif
    await serialize(async () => {
      const entry = nativeEntries().get(item.key)
      if (!entry || (displayedPath && entry.path !== displayedPath)) return
      if (!await removeNativeEntry(entry)) entry.usable = false
      writeNativeIndex()
    })
  } catch (_) {}
}

export async function saveDownloadedChatMedia(owner, kind, url, path) {
  // #ifndef H5
  const item = descriptor(owner, kind, url)
  if (item) return nativeWrite(item, path)
  // #endif
  return path
}

export async function fetchChatMedia(owner, kind, url, expectedSize = 0, scope) {
  const item = descriptor(owner, kind, url, scope)
  if (!item) return null
  const size = Math.max(0, Number(expectedSize) || 0)
  if (!pending.has(item.key)) {
    const request = (async () => {
      const cached = await lookup(item.key).catch(() => null)
      if (cached) return cached
      // #ifdef H5
      if (largeMedia(kind) && navigator.storage?.estimate && navigator.locks?.request &&
          globalThis.FileSystemFileHandle?.prototype?.createWritable && globalThis.crypto?.randomUUID) {
        const dir = await webFileDirectory().catch(() => null)
        if (dir) return streamWebMedia(item, url, size, dir)
      }
      if (size > limits(kind).item) return null
      const blob = await downloadBlob(url, kind)
      if (blob) await webWrite({ ...item, blob, size: blob.size, usedAt: Date.now() }).catch(() => {})
      return blob
      // #endif
      if (size > limits(kind).item && !Number.isFinite(appFreeBytes())) return null
      const download = await callFile(uni, 'downloadFile', { url, timeout: largeMedia(kind) ? 120000 : 12000 })
      if (download.statusCode !== 200 || !download.tempFilePath) return null
      const savedPath = await nativeWrite(item, download.tempFilePath)
      return scope && savedPath === download.tempFilePath ? null : savedPath
    })().catch(() => null).finally(() => pending.delete(item.key))
    pending.set(item.key, request)
  }
  return mediaHandle(await pending.get(item.key))
}
