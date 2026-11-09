const INDEX_KEY = 'chat_avatar_cache_v1'
const MAX_ENTRIES = 160
const MAX_BYTES = 12 * 1024 * 1024
const MAX_IMAGE_BYTES = 1024 * 1024
const pending = new Map()
let index
let queue = Promise.resolve()

export function isRemoteChatAvatar(url) {
  return /^https?:\/\//i.test(url) && !/^https?:\/\/ui-avatars\.com(?:[/:?#]|$)/i.test(url)
}

function entries() {
  if (index) return index
  index = new Map()
  try {
    const saved = uni.getStorageSync(INDEX_KEY)
    if (Array.isArray(saved)) {
      for (const [key, entry] of saved) {
        if (typeof key === 'string' && typeof entry?.path === 'string' && Number.isFinite(entry.size) && entry.size > 0) {
          index.set(key, entry)
        }
      }
    }
  } catch (_) {}
  return index
}

function keyFor(owner, url) {
  return owner && owner !== 'unknown' && isRemoteChatAvatar(url) ? JSON.stringify([String(owner), url]) : ''
}

function persist() {
  uni.setStorageSync(INDEX_KEY, [...entries()])
}

function fileOperation(name, options) {
  return new Promise((resolve, reject) => uni[name]({ ...options, success: resolve, fail: reject }))
}

export function getCachedChatAvatar(owner, url) {
  const key = keyFor(owner, url)
  const entry = key && entries().get(key)
  if (!entry || entry.unreadable) return ''
  entry.lastUsed = Date.now()
  return entry.path
}

export function forgetMissingChatAvatar(owner, url, path) {
  const entry = entries().get(keyFor(owner, url))
  if (!entry || entry.path !== path) return
  // Keep unreadable files in the index until they are deleted or confirmed missing.
  entry.unreadable = true
}

async function removeEntry(key, entry) {
  try {
    await fileOperation('removeSavedFile', { filePath: entry.path })
  } catch (_) {
    if (await fileOperation('getSavedFileInfo', { filePath: entry.path }).catch(() => null)) return false
  }
  entries().delete(key)
  return true
}

export function loadChatAvatar(owner, url) {
  const key = keyFor(owner, url)
  if (!key) return Promise.resolve('')
  if (pending.has(key)) return pending.get(key)
  const request = queue.then(async () => {
    const existing = entries().get(key)
    if (existing && !existing.unreadable) return existing.path
    if (existing && !await removeEntry(key, existing)) return ''

    const download = await fileOperation('downloadFile', { url, timeout: 6000 })
    if (download.statusCode !== 200 || !download.tempFilePath) return ''
    const filePath = download.tempFilePath
    const { size } = await fileOperation('getFileInfo', { filePath }).catch(() => ({}))
    if (!(size > 0 && size <= MAX_IMAGE_BYTES)) return filePath
    if (!await fileOperation('getImageInfo', { src: filePath }).catch(() => null)) return filePath

    const oldest = [...entries()].sort(([, a], [, b]) => a.lastUsed - b.lastUsed)
    let bytes = oldest.reduce((sum, [, entry]) => sum + entry.size, size)
    for (const [oldKey, entry] of oldest) {
      if (entries().size < MAX_ENTRIES && bytes <= MAX_BYTES) break
      if (await removeEntry(oldKey, entry)) bytes -= entry.size
    }
    if (entries().size >= MAX_ENTRIES || bytes > MAX_BYTES) return filePath

    const { savedFilePath } = await fileOperation('saveFile', { tempFilePath: filePath }).catch(() => ({}))
    if (!savedFilePath) return filePath
    entries().set(key, { path: savedFilePath, size, lastUsed: Date.now() })
    try { persist() }
    catch (_) { await removeEntry(key, entries().get(key)); return '' }
    return savedFilePath
  }).catch(() => '').finally(() => pending.delete(key))
  pending.set(key, request)
  queue = request
  return request
}
