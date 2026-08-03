const DATABASE_NAME = 'fentouxia-chat-history'
const STORE_NAME = 'conversations'
const DATABASE_VERSION = 1

// H5 使用 IndexedDB 保存已加载的历史。数量与体积双重限制，避免单个会话无限占用磁盘。
const MAX_MESSAGES_PER_CONVERSATION = 5000
const MAX_BYTES_PER_CONVERSATION = 12 * 1024 * 1024

let databasePromise = null
const writeQueues = new Map()

function canUseIndexedDb() {
  return typeof indexedDB !== 'undefined'
}

function openDatabase() {
  if (!canUseIndexedDb()) return Promise.resolve(null)
  if (databasePromise) return databasePromise

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'conversationKey' })
        store.createIndex('updatedAt', 'updatedAt', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      databasePromise = null
      reject(request.error || new Error('Unable to open chat history cache'))
    }
  })
  return databasePromise
}

function isEphemeralMediaUrl(value) {
  return typeof value === 'string' && (value.startsWith('blob:') || value.startsWith('data:'))
}

function toCachedMessage(message = {}) {
  // 仅缓存页面展示和恢复所需的字段。Data URL / blob URL 不能跨刷新复用，且常包含完整媒体二进制。
  const content = isEphemeralMediaUrl(message.content) ? null : message.content
  const thumbnail = isEphemeralMediaUrl(message.thumbnail) ? null : message.thumbnail
  const senderAvatar = isEphemeralMediaUrl(message.senderAvatar) ? '' : message.senderAvatar
  const voicePath = isEphemeralMediaUrl(message.voicePath) ? '' : message.voicePath

  return {
    id: message.id,
    type: message.type,
    content,
    isSelf: Boolean(message.isSelf),
    isAi: Boolean(message.isAi),
    senderName: message.senderName || '',
    senderAvatar,
    timestamp: message.timestamp,
    status: message.status,
    duration: message.duration,
    voiceText: message.voiceText || '',
    voicePath,
    fileName: message.fileName,
    fileSize: message.fileSize,
    thumbnail,
    isWithdraw: Boolean(message.isWithdraw),
    refId: message.refId || null,
    locationName: message.locationName,
    locationAddress: message.locationAddress,
    latitude: message.latitude,
    longitude: message.longitude,
    // 只保存原图已成功加载的标记和原图 URL，不把大图二进制写入聊天缓存。
    originalLoaded: Boolean(message.originalLoaded),
    cachedMediaOmitted: content === null || thumbnail === null
  }
}

function getStringBytes(value) {
  // UTF-16 字符串在浏览器存储中通常按两个字节计，使用保守估算来控制体积。
  return String(value || '').length * 2
}

function buildRecord(conversationKey, messages) {
  let cachedMessages = (Array.isArray(messages) ? messages : [])
    .slice(-MAX_MESSAGES_PER_CONVERSATION)
    .map(toCachedMessage)
  let payload = JSON.stringify(cachedMessages)

  while (getStringBytes(payload) > MAX_BYTES_PER_CONVERSATION && cachedMessages.length > 1) {
    cachedMessages = cachedMessages.slice(Math.ceil(cachedMessages.length / 8))
    payload = JSON.stringify(cachedMessages)
  }

  return {
    conversationKey,
    payload,
    count: cachedMessages.length,
    byteSize: getStringBytes(payload),
    updatedAt: Date.now()
  }
}

function readRecord(database, conversationKey) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(conversationKey)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error || new Error('Unable to read chat history cache'))
  })
}

function writeRecord(database, record) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(record)
    transaction.oncomplete = () => resolve(true)
    transaction.onerror = () => reject(transaction.error || new Error('Unable to save chat history cache'))
    transaction.onabort = () => reject(transaction.error || new Error('Chat history cache transaction aborted'))
  })
}

export async function loadChatHistoryCache(conversationKey) {
  const database = await openDatabase()
  if (!database || !conversationKey) return null

  const record = await readRecord(database, conversationKey)
  if (!record?.payload) return null
  try {
    const messages = JSON.parse(record.payload)
    return Array.isArray(messages) ? messages : null
  } catch (error) {
    return null
  }
}

export function saveChatHistoryCache(conversationKey, messages) {
  if (!conversationKey || !canUseIndexedDb()) return Promise.resolve(false)

  const previous = writeQueues.get(conversationKey) || Promise.resolve()
  const task = previous
    .catch(() => undefined)
    .then(async () => {
      const database = await openDatabase()
      if (!database) return false
      return writeRecord(database, buildRecord(conversationKey, messages))
    })

  writeQueues.set(conversationKey, task)
  task.then(
    () => {
      if (writeQueues.get(conversationKey) === task) writeQueues.delete(conversationKey)
    },
    () => {
      if (writeQueues.get(conversationKey) === task) writeQueues.delete(conversationKey)
    }
  )
  return task
}
