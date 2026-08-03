// 非 H5 聊天原图持久缓存。
// 文件本体由 uni.saveFile 管理，storage 中只保留很小的索引，便于按 LRU 回收。
const STORAGE_KEY = 'chat_original_image_cache_v1'
const MAX_TOTAL_BYTES = 80 * 1024 * 1024
const MAX_ENTRIES = 100
const MAX_ITEM_BYTES = 20 * 1024 * 1024

let operationQueue = Promise.resolve()

function runExclusive(task) {
  const next = operationQueue.catch(() => undefined).then(task)
  operationQueue = next.catch(() => undefined)
  return next
}

function getScopeValue(value, fallback = 'unknown') {
  if (value === undefined || value === null || value === '') return fallback
  return String(value)
}

function buildEntryKey({ userId, conversationId, messageId, sourceUrl }) {
  // 将四个维度都纳入 key，源地址变化（如图片被重新上传）时不会错误复用旧文件。
  return [userId, conversationId, messageId, sourceUrl]
    .map(value => encodeURIComponent(getScopeValue(value, '')))
    .join('|')
}

function normalizeIndex(rawIndex) {
  if (!rawIndex || typeof rawIndex !== 'object' || Array.isArray(rawIndex)) return {}
  const index = {}
  Object.keys(rawIndex).forEach((key) => {
    const entry = rawIndex[key]
    if (!entry || typeof entry !== 'object' || !entry.savedFilePath || !entry.sourceUrl) return
    index[key] = {
      userId: getScopeValue(entry.userId),
      conversationId: getScopeValue(entry.conversationId),
      messageId: getScopeValue(entry.messageId, ''),
      sourceUrl: String(entry.sourceUrl),
      savedFilePath: String(entry.savedFilePath),
      size: Number.isFinite(Number(entry.size)) ? Math.max(0, Number(entry.size)) : 0,
      lastAccess: Number.isFinite(Number(entry.lastAccess)) ? Number(entry.lastAccess) : 0,
      createdAt: Number.isFinite(Number(entry.createdAt)) ? Number(entry.createdAt) : 0,
      // 无法获得可靠文件大小或删除失败的文件只记账、不参与恢复，防止其绕过容量上限。
      usable: entry.usable !== false
    }
  })
  return index
}

function readIndex() {
  try {
    const raw = uni.getStorageSync(STORAGE_KEY)
    if (!raw) return {}
    return normalizeIndex(typeof raw === 'string' ? JSON.parse(raw) : raw)
  } catch (error) {
    console.warn('读取聊天原图缓存索引失败，将忽略已有缓存。', error)
    return {}
  }
}

function writeIndex(index) {
  try {
    uni.setStorageSync(STORAGE_KEY, JSON.stringify(index))
    return true
  } catch (error) {
    console.warn('保存聊天原图缓存索引失败，原图仍可正常在线查看。', error)
    return false
  }
}

function inspectSavedFile(filePath) {
  return new Promise((resolve) => {
    const query = typeof uni.getSavedFileInfo === 'function'
      ? uni.getSavedFileInfo
      : uni.getFileInfo
    if (typeof query !== 'function' || !filePath) {
      resolve({ exists: null, size: null })
      return
    }
    query({
      filePath,
      success: (result) => resolve({
        exists: true,
        size: Number.isFinite(Number(result?.size)) ? Number(result.size) : null
      }),
      fail: () => resolve({ exists: false, size: null })
    })
  })
}

function removeSavedFile(filePath) {
  return new Promise((resolve) => {
    if (typeof uni.removeSavedFile !== 'function' || !filePath) {
      resolve(false)
      return
    }
    uni.removeSavedFile({
      filePath,
      success: () => resolve(true),
      fail: () => resolve(false)
    })
  })
}

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    if (typeof uni.downloadFile !== 'function') {
      reject(new Error('当前平台不支持下载文件'))
      return
    }
    uni.downloadFile({
      url,
      success: (result) => {
        if (result && result.statusCode >= 200 && result.statusCode < 300 && result.tempFilePath) {
          resolve(result.tempFilePath)
          return
        }
        reject(new Error(`下载原图失败，状态码：${result?.statusCode || 'unknown'}`))
      },
      fail: (error) => reject(error || new Error('下载原图失败'))
    })
  })
}

function saveFile(tempFilePath) {
  return new Promise((resolve, reject) => {
    if (typeof uni.saveFile !== 'function') {
      reject(new Error('当前平台不支持保存文件'))
      return
    }
    uni.saveFile({
      tempFilePath,
      success: (result) => {
        if (result?.savedFilePath) {
          resolve(result.savedFilePath)
          return
        }
        reject(new Error('保存原图失败，未返回持久文件路径'))
      },
      fail: (error) => reject(error || new Error('保存原图失败'))
    })
  })
}

async function dropMissingFiles(index) {
  const keys = Object.keys(index)
  for (const key of keys) {
    const entry = index[key]
    const file = await inspectSavedFile(entry.savedFilePath)
    if (file.exists === false) {
      delete index[key]
      continue
    }
    if (file.exists === true && Number.isFinite(file.size) && file.size >= 0) {
      entry.size = file.size
      continue
    }
    // 不能确认文件大小时以总上限记账并禁止恢复，宁可停止新增也不能低估磁盘占用。
    entry.size = MAX_TOTAL_BYTES
    entry.usable = false
  }
}

async function removeIndexedFile(index, key) {
  const entry = index[key]
  if (!entry) return true

  await removeSavedFile(entry.savedFilePath)
  const file = await inspectSavedFile(entry.savedFilePath)
  // 删除接口报错但文件已不存在时，索引仍可安全移除；无法确认或文件仍在时必须继续记账。
  if (file.exists !== false) {
    return false
  }
  delete index[key]
  return true
}

async function discardNewFile(savedFilePath) {
  if (!savedFilePath) return true
  await removeSavedFile(savedFilePath)
  const file = await inspectSavedFile(savedFilePath)
  return file.exists === false
}

function rememberUndeletableFile(index, key, scope, savedFilePath, size, now) {
  // 该条目不用于展示，只以保守体积参与后续 LRU；等下次清理成功再真正释放。
  index[key] = {
    ...scope,
    savedFilePath,
    size: Number.isFinite(Number(size)) && Number(size) >= 0 ? Number(size) : MAX_TOTAL_BYTES,
    lastAccess: 0,
    createdAt: now,
    usable: false
  }
}

function getTotalBytes(index) {
  return Object.values(index).reduce((total, entry) => total + (Number(entry.size) || 0), 0)
}

function isWithinLimit(index, reserveBytes, reserveEntries) {
  return Object.keys(index).length + reserveEntries <= MAX_ENTRIES
    && getTotalBytes(index) + reserveBytes <= MAX_TOTAL_BYTES
}

async function evictLeastRecentlyUsed(index, reserveBytes = 0, reserveEntries = 0) {
  const blockedKeys = new Set()
  while (!isWithinLimit(index, reserveBytes, reserveEntries)) {
    const candidates = Object.entries(index)
      .filter(([key]) => !blockedKeys.has(key))
      .sort(([, left], [, right]) => (
        (Number(left.lastAccess) || 0) - (Number(right.lastAccess) || 0)
        || (Number(left.createdAt) || 0) - (Number(right.createdAt) || 0)
      ))
    const oldest = candidates[0]
    if (!oldest) return false

    const [key] = oldest
    if (!await removeIndexedFile(index, key)) {
      blockedKeys.add(key)
    }
  }
  return true
}

function isRemoteImageUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value)
}

/**
 * 从持久文件缓存恢复一批已查看过的聊天原图。
 * 返回值以 messageId 为 key，只返回仍实际存在的文件路径。
 */
export function restoreCachedChatOriginalImages({ userId, conversationId, images } = {}) {
  const validImages = Array.isArray(images)
    ? images.filter(image => image && image.id !== undefined && isRemoteImageUrl(image.sourceUrl))
    : []
  if (validImages.length === 0) return Promise.resolve({})

  return runExclusive(async () => {
    const index = readIndex()
    const restored = {}
    let changed = false
    const now = Date.now()

    for (const image of validImages) {
      const key = buildEntryKey({
        userId: getScopeValue(userId),
        conversationId: getScopeValue(conversationId),
        messageId: image.id,
        sourceUrl: image.sourceUrl
      })
      const entry = index[key]
      if (!entry || entry.usable === false) continue

      const file = await inspectSavedFile(entry.savedFilePath)
      if (file.exists === false) {
        delete index[key]
        changed = true
        continue
      }
      if (!Number.isFinite(file.size) || file.size < 0) {
        // 不能可靠计量的文件不再用于恢复，避免绕过总容量控制。
        entry.size = MAX_TOTAL_BYTES
        entry.usable = false
        changed = true
        continue
      }
      entry.size = file.size
      entry.lastAccess = now
      restored[image.id] = entry.savedFilePath
      changed = true
    }

    if (changed) writeIndex(index)
    return restored
  })
}

// 图片解码失败时主动移除对应持久文件；只有确认文件已不存在才删索引账目。
export function removeCachedChatOriginalImage({ userId, conversationId, messageId, sourceUrl } = {}) {
  if (!sourceUrl || messageId === undefined || messageId === null) return Promise.resolve(false)

  return runExclusive(async () => {
    const scope = {
      userId: getScopeValue(userId),
      conversationId: getScopeValue(conversationId),
      messageId,
      sourceUrl
    }
    const index = readIndex()
    const key = buildEntryKey(scope)
    if (!index[key]) return false

    const removed = await removeIndexedFile(index, key)
    if (removed) {
      writeIndex(index)
    } else {
      // 解码已确认失败而文件又删不掉时，必须保留账面占用但禁止下次恢复使用坏文件。
      index[key].usable = false
      writeIndex(index)
    }
    return removed
  })
}

/**
 * 下载并持久保存用户实际查看过的原图。失败返回 null，调用方继续使用在线原图。
 */
export function cacheChatOriginalImage({ userId, conversationId, messageId, sourceUrl, expectedSize = 0 } = {}) {
  if (!isRemoteImageUrl(sourceUrl) || messageId === undefined || messageId === null) {
    return Promise.resolve(null)
  }

  return runExclusive(async () => {
    const scope = {
      userId: getScopeValue(userId),
      conversationId: getScopeValue(conversationId),
      messageId,
      sourceUrl
    }
    const key = buildEntryKey(scope)
    const index = readIndex()
    const now = Date.now()
    const existing = index[key]
    if (existing) {
      if (existing.usable !== false) {
        const file = await inspectSavedFile(existing.savedFilePath)
        if (file.exists === true && Number.isFinite(file.size) && file.size >= 0) {
          existing.lastAccess = now
          existing.size = file.size
          writeIndex(index)
          return existing.savedFilePath
        }
        if (file.exists === false) {
          delete index[key]
        } else {
          existing.size = MAX_TOTAL_BYTES
          existing.usable = false
        }
      }

      // 同 key 的不可用条目可能对应删不掉的坏文件，绝不能被新文件覆盖并丢失账目。
      if (index[key]?.usable === false && !await removeIndexedFile(index, key)) {
        writeIndex(index)
        return null
      }
    }

    await dropMissingFiles(index)
    const estimatedSize = Math.max(0, Number(expectedSize) || 0)
    if (estimatedSize > MAX_ITEM_BYTES) {
      writeIndex(index)
      return null
    }
    if (!await evictLeastRecentlyUsed(index, estimatedSize, 1) || !writeIndex(index)) {
      return null
    }

    let savedFilePath = ''
    try {
      const tempFilePath = await downloadFile(sourceUrl)
      savedFilePath = await saveFile(tempFilePath)
      const file = await inspectSavedFile(savedFilePath)
      // 只有真实且可计量的文件才能纳入缓存；不能拿预估大小冒充真实占用。
      if (file.exists !== true || !Number.isFinite(file.size) || file.size < 0) {
        if (!await discardNewFile(savedFilePath)) {
          rememberUndeletableFile(index, key, scope, savedFilePath, MAX_TOTAL_BYTES, now)
          writeIndex(index)
        }
        return null
      }
      const actualSize = file.size
      if (actualSize > MAX_ITEM_BYTES) {
        if (!await discardNewFile(savedFilePath)) {
          rememberUndeletableFile(index, key, scope, savedFilePath, actualSize, now)
          writeIndex(index)
        }
        return null
      }

      index[key] = {
        ...scope,
        savedFilePath,
        size: actualSize,
        lastAccess: now,
        createdAt: now,
        usable: true
      }
      const withinLimit = await evictLeastRecentlyUsed(index)
      if (!withinLimit || !index[key]) {
        if (index[key] && !await removeIndexedFile(index, key)) {
          index[key].usable = false
        }
        writeIndex(index)
        return null
      }
      // 索引写入失败时不要留下无法被后续 LRU 管理的孤儿文件。
      if (!writeIndex(index)) {
        delete index[key]
        await discardNewFile(savedFilePath)
        return null
      }
      return index[key] ? savedFilePath : null
    } catch (error) {
      if (savedFilePath && !await discardNewFile(savedFilePath)) {
        rememberUndeletableFile(index, key, scope, savedFilePath, MAX_TOTAL_BYTES, now)
        writeIndex(index)
      }
      console.warn('持久缓存聊天原图失败，将继续使用在线原图。', error)
      return null
    }
  })
}

export const CHAT_MEDIA_CACHE_LIMITS = Object.freeze({
  maxTotalBytes: MAX_TOTAL_BYTES,
  maxEntries: MAX_ENTRIES,
  maxItemBytes: MAX_ITEM_BYTES
})
