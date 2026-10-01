export function normalizeCommunityImageUrl(image, baseUrl = '') {
  if (!image || typeof image !== 'string') return '';

  const value = image.trim();
  if (!value) return '';
  if (value.startsWith('blob:')) return '';
  if (value.startsWith('data:image/')) return value;
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  if (value.startsWith('/static/')) return value;

  const root = (baseUrl || '').replace(/\/$/, '');
  if (!root) return value;

  if (value.startsWith('/')) return `${root}${value}`;

  if (value.startsWith('files/')) return `${root}/${value}`;
  if (value.startsWith('download/') || value.startsWith('downloads/')) return `${root}/files/${value}`;
  if (value.startsWith('chat/') || value.startsWith('community/')) return `${root}/files/download/${value}`;

  return `${root}/${value}`;
}

export function normalizeCommunityImages(images, baseUrl = '') {
  let list = images;

  if (typeof images === 'string') {
    try {
      list = JSON.parse(images);
    } catch {
      list = images ? [images] : [];
    }
  }

  if (!Array.isArray(list)) return [];

  return list
    .map((image) => normalizeCommunityImageUrl(image, baseUrl))
    .filter(Boolean);
}

const CACHE_PREFIX = 'community_image_cache:';
const CACHE_INDEX_KEY = 'community_image_cache:index';
const DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE_ITEMS = 30;
const MAX_H5_CACHE_BYTES = 40 * 1024 * 1024;
const DATABASE_NAME = 'fentouxia-community-image-cache';
const STORE_NAME = 'images';
const DATABASE_VERSION = 1;

let databasePromise = null;
const writeQueues = new Map();

function now() {
  return Date.now ? Date.now() : new Date().getTime();
}

function getCacheKey(type, id) {
  return `${CACHE_PREFIX}${type}:${id}`;
}

function canUseIndexedDb() {
  return typeof indexedDB !== 'undefined';
}

function estimateBytes(value) {
  try {
    return JSON.stringify(value).length * 2;
  } catch (_) {
    return 0;
  }
}

function hasInlineImage(value) {
  if (typeof value === 'string') return value.startsWith('data:image/');
  return Array.isArray(value) && value.some(hasInlineImage);
}

function openDatabase() {
  if (!canUseIndexedDb()) return Promise.resolve(null);
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = null;
      reject(request.error || new Error('Unable to open community image cache'));
    };
  });
  return databasePromise;
}

function getRecord(database, key) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('Unable to read community image cache'));
  });
}

function putRecord(database, record) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(record);
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error || new Error('Unable to save community image cache'));
    transaction.onabort = () => reject(transaction.error || new Error('Community image cache transaction aborted'));
  });
}

function removeRecord(database, key) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(key);
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error || new Error('Unable to remove community image cache'));
  });
}

function getAllRecords(database) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
    request.onerror = () => reject(request.error || new Error('Unable to list community image cache'));
  });
}

async function pruneIndexedDbCache(database, keepKey = '') {
  const records = (await getAllRecords(database))
    .filter(item => item && item.key)
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  let keptCount = 0;
  let usedBytes = 0;

  for (const record of records) {
    const byteSize = Number(record.byteSize || 0);
    const shouldKeep = record.key === keepKey || (
      keptCount < MAX_CACHE_ITEMS && usedBytes + byteSize <= MAX_H5_CACHE_BYTES
    );
    if (shouldKeep) {
      keptCount += 1;
      usedBytes += byteSize;
    } else {
      await removeRecord(database, record.key);
    }
  }
}

function readCacheIndex() {
  try {
    const raw = uni.getStorageSync(CACHE_INDEX_KEY);
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string' && raw) return JSON.parse(raw);
  } catch (_) {}
  return [];
}

function writeCacheIndex(index) {
  try {
    uni.setStorageSync(CACHE_INDEX_KEY, index);
  } catch (_) {}
}

function pruneStorageCache(keepKey = '') {
  const index = readCacheIndex()
    .filter(item => item && item.key)
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  const kept = [];

  index.forEach((item) => {
    if (item.key === keepKey || kept.length < MAX_CACHE_ITEMS) {
      kept.push(item);
      return;
    }
    try {
      uni.removeStorageSync(item.key);
    } catch (_) {}
  });

  writeCacheIndex(kept);
}

function touchStorageKey(key) {
  const index = readCacheIndex().filter(item => item && item.key && item.key !== key);
  index.unshift({ key, updatedAt: now() });
  writeCacheIndex(index);
  pruneStorageCache(key);
}

async function getIndexedDbCache(key, ttl) {
  const database = await openDatabase();
  if (!database) return null;
  const record = await getRecord(database, key);
  if (!record) return null;
  if (!record.updatedAt || now() - Number(record.updatedAt) > ttl) {
    await removeRecord(database, key);
    return null;
  }

  // 命中后更新时间，确保按照真实使用情况淘汰旧图。
  record.updatedAt = now();
  await putRecord(database, record);
  return record.value || null;
}

function queueIndexedDbCache(key, value) {
  const previous = writeQueues.get(key) || Promise.resolve();
  const task = previous
    .catch(() => undefined)
    .then(async () => {
      const database = await openDatabase();
      if (!database) return false;
      await putRecord(database, {
        key,
        value,
        updatedAt: now(),
        byteSize: estimateBytes(value)
      });
      await pruneIndexedDbCache(database, key);
      return true;
    });

  writeQueues.set(key, task);
  task.then(
    () => { if (writeQueues.get(key) === task) writeQueues.delete(key); },
    () => { if (writeQueues.get(key) === task) writeQueues.delete(key); }
  );
  return task;
}

export async function getCachedCommunityImage(type, id, ttl = DEFAULT_TTL) {
  if (!type || !id) return null;
  const key = getCacheKey(type, id);

  if (canUseIndexedDb()) {
    try {
      const cached = await getIndexedDbCache(key, ttl);
      if (cached) return cached;

      // 迁移旧版 H5 键值缓存，避免旧 Base64 继续占用 localStorage 配额。
      const legacy = uni.getStorageSync(key);
      if (legacy && legacy.updatedAt && now() - Number(legacy.updatedAt) <= ttl) {
        await queueIndexedDbCache(key, legacy.value);
        uni.removeStorageSync(key);
        return legacy.value || null;
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  try {
    const cached = uni.getStorageSync(key);
    if (!cached || typeof cached !== 'object') return null;
    if (!cached.updatedAt || now() - Number(cached.updatedAt) > ttl || hasInlineImage(cached.value)) {
      uni.removeStorageSync(key);
      return null;
    }
    touchStorageKey(key);
    return cached.value || null;
  } catch (_) {
    return null;
  }
}

export async function setCachedCommunityImage(type, id, value) {
  if (!type || !id || !value) return false;
  const key = getCacheKey(type, id);

  if (canUseIndexedDb()) {
    try {
      const saved = await queueIndexedDbCache(key, value);
      if (saved) uni.removeStorageSync(key);
      return saved;
    } catch (_) {
      return false;
    }
  }

  // 小程序/App 的键值存储容量有限，不再持久化 Base64；远程 URL 仍可缓存以减少图片列表接口请求。
  if (hasInlineImage(value)) return false;
  const payload = { value, updatedAt: now() };
  try {
    uni.setStorageSync(key, payload);
    touchStorageKey(key);
    return true;
  } catch (_) {
    pruneStorageCache(key);
    try {
      uni.setStorageSync(key, payload);
      touchStorageKey(key);
      return true;
    } catch (_) {
      return false;
    }
  }
}
