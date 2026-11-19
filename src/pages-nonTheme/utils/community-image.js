let pendingPostSnapshot = null;

export function setCommunityPostSnapshot(communityId, post) {
  pendingPostSnapshot = { communityId: Number(communityId), post: { ...post, images: [...(post.images || [])] } };
}

export function takeCommunityPostSnapshot(communityId, postId) {
  const snapshot = pendingPostSnapshot;
  pendingPostSnapshot = null;
  return snapshot && snapshot.communityId === Number(communityId) && Number(snapshot.post.id) === Number(postId)
    ? snapshot.post : null;
}

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
const MAX_CACHE_BYTES = 40 * 1024 * 1024;
const DATABASE_NAME = 'fentouxia-community-image-cache';
const STORE_NAME = 'images';
const DATABASE_VERSION = 1;

let databasePromise = null;
const writeQueues = new Map();
let nativeQueue = Promise.resolve();

function now() {
  return Date.now ? Date.now() : new Date().getTime();
}

export function getCommunityImageOwner() {
  if (!uni.getStorageSync('token')) return '';
  const user = uni.getStorageSync('userInfo');
  const id = String(user?.id || user?.userId || '');
  return /^\d+$/.test(id) ? id : '';
}

function getCacheKey(type, id) {
  const owner = getCommunityImageOwner();
  return owner ? `${CACHE_PREFIX}${owner}:${type}:${id}` : '';
}

function canUseIndexedDb() {
  // #ifdef H5
  return typeof indexedDB !== 'undefined';
  // #endif
  return false;
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
      keptCount < MAX_CACHE_ITEMS && usedBytes + byteSize <= MAX_CACHE_BYTES
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

function nativeImageFile(operation, file, value) {
  // #ifdef MP-WEIXIN
  const filePath = `${wx.env.USER_DATA_PATH}/${file}`;
  const fs = wx.getFileSystemManager();
  return new Promise((resolve, reject) => {
    const options = { filePath, success: resolve, fail: reject };
    if (operation === 'write') fs.writeFile({ ...options, data: value, encoding: 'utf8' });
    else if (operation === 'read') fs.readFile({ ...options, encoding: 'utf8' });
    else fs.unlink(options);
  }).then(result => result?.data);
  // #endif
  // #ifdef APP-PLUS
  const create = operation === 'write';
  return new Promise((resolve, reject) => {
    plus.io.resolveLocalFileSystemURL('_doc/', directory => {
      directory.getFile(file, { create, exclusive: create }, entry => {
        if (create) {
          entry.createWriter(writer => {
            writer.onwrite = resolve;
            writer.onerror = reject;
            writer.write(value);
          }, reject);
        } else if (operation === 'read') {
          entry.file(cached => {
            const reader = new plus.io.FileReader();
            reader.onloadend = event => resolve(event?.target?.result || reader.result);
            reader.onerror = reject;
            reader.readAsText(cached, 'UTF-8');
          }, reject);
        } else entry.remove(resolve, reject);
      }, reject);
    }, reject);
  });
  // #endif
  return Promise.reject(new Error('社区图片文件缓存不可用'));
}

function queueNativeStorage(task) {
  const result = nativeQueue.then(task);
  nativeQueue = result.catch(() => {});
  return result;
}

async function pruneStorageCache(keep) {
  const index = readCacheIndex()
    .filter(item => item?.key && item.key !== keep.key)
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  const kept = [keep];
  let bytes = keep.byteSize;
  for (const item of index) {
    const size = Number(item.byteSize) || 0;
    if (kept.length < MAX_CACHE_ITEMS && bytes + size <= MAX_CACHE_BYTES) {
      kept.push(item);
      bytes += size;
    } else {
      uni.removeStorageSync(item.key);
      if (item.file) await nativeImageFile('delete', item.file).catch(() => {});
    }
  }
  writeCacheIndex(kept);
}

async function readStorageCache(key, ttl) {
  const record = uni.getStorageSync(key);
  if (!record?.updatedAt) return null;
  try {
    if (now() - Number(record.updatedAt) <= ttl) {
      const value = record.file ? JSON.parse(await nativeImageFile('read', record.file)) : record.value;
      if (value) {
        const updatedAt = now();
        await pruneStorageCache({ key, updatedAt, byteSize: record.byteSize || 0, file: record.file || '' });
        uni.setStorageSync(key, { ...record, updatedAt });
        return value;
      }
    }
  } catch (_) {}
  uni.removeStorageSync(key);
  if (record.file) await nativeImageFile('delete', record.file).catch(() => {});
  writeCacheIndex(readCacheIndex().filter(item => item?.key !== key));
  return null;
}

async function writeStorageCache(key, value, byteSize) {
  const previous = uni.getStorageSync(key);
  const record = { updatedAt: now(), byteSize };
  try {
    if (hasInlineImage(value)) {
      record.file = `ftx_community_${now()}_${Math.random().toString(36).slice(2)}.json`;
      await nativeImageFile('write', record.file, JSON.stringify(value));
    } else record.value = value;
    await pruneStorageCache({ key, updatedAt: record.updatedAt, byteSize, file: record.file || '' });
    uni.setStorageSync(key, record);
  } catch (error) {
    if (record.file) await nativeImageFile('delete', record.file).catch(() => {});
    if (previous?.updatedAt) {
      await pruneStorageCache({ key, updatedAt: previous.updatedAt, byteSize: previous.byteSize || 0, file: previous.file || '' });
    } else writeCacheIndex(readCacheIndex().filter(item => item?.key !== key));
    throw error;
  }
  if (previous?.file) await nativeImageFile('delete', previous.file).catch(() => {});
  return true;
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
  if (!key) return null;
  try {
    const cached = await (canUseIndexedDb() ? getIndexedDbCache(key, ttl) : queueNativeStorage(() => readStorageCache(key, ttl)));
    return key === getCacheKey(type, id) ? cached : null;
  } catch (_) {
    return null;
  }
}

export async function setCachedCommunityImage(type, id, value) {
  if (!type || !id || !value) return false;
  const key = getCacheKey(type, id);
  const byteSize = estimateBytes(value);
  if (!key || !byteSize || byteSize > MAX_CACHE_BYTES) return false;
  try {
    return await (canUseIndexedDb() ? queueIndexedDbCache(key, value) : queueNativeStorage(() => writeStorageCache(key, value, byteSize)));
  } catch (_) {
    return false;
  }
}
