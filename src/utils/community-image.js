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

function now() {
  return Date.now ? Date.now() : new Date().getTime();
}

function getCacheKey(type, id) {
  return `${CACHE_PREFIX}${type}:${id}`;
}

function readCacheIndex() {
  try {
    const raw = uni.getStorageSync(CACHE_INDEX_KEY);
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string' && raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}

function writeCacheIndex(index) {
  try {
    uni.setStorageSync(CACHE_INDEX_KEY, index);
  } catch (e) {}
}

function pruneCommunityImageCache(keepKey = '') {
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
    } catch (e) {}
  });

  writeCacheIndex(kept);
}

function touchCacheKey(key) {
  const index = readCacheIndex().filter(item => item && item.key && item.key !== key);
  index.unshift({ key, updatedAt: now() });
  writeCacheIndex(index);
  pruneCommunityImageCache(key);
}

export function getCachedCommunityImage(type, id, ttl = DEFAULT_TTL) {
  if (!type || !id) return null;
  const key = getCacheKey(type, id);
  try {
    const cached = uni.getStorageSync(key);
    if (!cached || typeof cached !== 'object') return null;
    if (!cached.updatedAt || now() - Number(cached.updatedAt) > ttl) {
      uni.removeStorageSync(key);
      return null;
    }
    touchCacheKey(key);
    return cached.value || null;
  } catch (e) {
    return null;
  }
}

export function setCachedCommunityImage(type, id, value) {
  if (!type || !id || !value) return;
  const key = getCacheKey(type, id);
  const payload = { value, updatedAt: now() };

  try {
    uni.setStorageSync(key, payload);
    touchCacheKey(key);
  } catch (e) {
    pruneCommunityImageCache(key);
    try {
      uni.setStorageSync(key, payload);
      touchCacheKey(key);
    } catch (err) {}
  }
}
