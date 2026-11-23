import { getTrashBinImage } from '@/api/map'
import { config } from '@/api/config.js'
import { normalizeImageData, resolveStoredBinImage } from './trash-bin-image-core.mjs'

const PHOTO_CACHE_LIMIT = 10
const PHOTO_CACHE_TTL = 60_000
const TEMP_CACHE_LIMIT = 10
const MAX_REQUESTS = 2
const photos = new Map()
const temporaryFiles = new Map()
const temporaryWrites = new Map()
const inFlight = new Map()
const requestQueue = []
let activeRequests = 0

export function binPointPhotoKey(point) {
  if (!point?.id) return ''
  return `${point.id}:${point.updatedAt || 'ttl'}`
}

function touch(map, key, value) {
  map.delete(key)
  map.set(key, value)
  while (map.size > PHOTO_CACHE_LIMIT) map.delete(map.keys().next().value)
}

function logFailure(id, status, stage) {
  console.warn('[bin-point-photo]', JSON.stringify({ id, status: Number(status) || 0, stage }))
}

function readCachedPhoto(key, point) {
  const item = photos.get(key)
  if (!item) return ''
  if (!point.updatedAt && Date.now() - item.createdAt > PHOTO_CACHE_TTL) {
    photos.delete(key)
    return ''
  }
  touch(photos, key, item)
  return item.image
}

function drainRequests() {
  while (activeRequests < MAX_REQUESTS && requestQueue.length) {
    const job = requestQueue.shift()
    activeRequests += 1
    Promise.resolve().then(job.fetch).then(job.resolve, job.reject).finally(() => {
      activeRequests -= 1
      inFlight.delete(job.key)
      drainRequests()
    })
  }
}

export function getBinPointPhoto(point, fetchImage = getTrashBinImage) {
  const key = binPointPhotoKey(point)
  const id = point?.id
  if (!key) return Promise.reject(new Error('点位图片不可用'))
  const cached = readCachedPhoto(key, point)
  if (cached) return Promise.resolve(cached)
  if (inFlight.has(key)) return inFlight.get(key)

  let resolveRequest
  let rejectRequest
  const promise = new Promise((resolve, reject) => {
    resolveRequest = resolve
    rejectRequest = reject
  })
  inFlight.set(key, promise)
  requestQueue.push({ key, resolve: resolveRequest, reject: rejectRequest, fetch: async () => {
      let status = 200
      try {
        const result = await fetchImage(id)
        const rawImage = result?.data?.image
        const image = normalizeImageData(rawImage) || (typeof rawImage === 'string' && rawImage.trim()
          ? resolveStoredBinImage(rawImage, config.baseUrl) : '')
        if (result?.code !== 0 || !image) {
          logFailure(id, status, 'json-image')
          throw new Error('点位图片响应无效')
        }
        touch(photos, key, { image, createdAt: Date.now() })
        resolveRequest(image)
      } catch (error) {
        status = error?.statusCode || error?.status || error?.response?.statusCode || status
        if (!error?.message?.includes('响应无效')) logFailure(id, status, 'json-image')
        rejectRequest(error)
      }
  } })
  drainRequests()
  return promise
}

function removeTemporaryFile(filePath) {
  filePath = typeof filePath === 'string' ? filePath : filePath?.path
  if (!filePath) return
  try {
    const fileSystem = uni.getFileSystemManager?.() || (typeof my !== 'undefined' ? my.getFileSystemManager?.() : null)
    fileSystem?.unlink({ filePath, fail: () => {} })
  } catch (_) { /* best effort */ }
}

function rememberTemporaryFile(key, filePath) {
  temporaryFiles.delete(key)
  temporaryFiles.set(key, { path: filePath, createdAt: Date.now() })
  while (temporaryFiles.size > TEMP_CACHE_LIMIT) {
    const oldest = temporaryFiles.keys().next().value
    removeTemporaryFile(temporaryFiles.get(oldest))
    temporaryFiles.delete(oldest)
  }
}

export async function getBinPointPhotoSource(point, { coverImage = false, fetchImage = getTrashBinImage } = {}) {
  const image = await getBinPointPhoto(point, fetchImage)
  // #ifdef MP
  if (coverImage && image.startsWith('data:image/')) {
    const key = binPointPhotoKey(point)
    const cachedFile = temporaryFiles.get(key)
    if (cachedFile && (point.updatedAt || Date.now() - cachedFile.createdAt <= PHOTO_CACHE_TTL)) {
      temporaryFiles.delete(key)
      temporaryFiles.set(key, cachedFile)
      return cachedFile.path
    }
    if (cachedFile) {
      removeTemporaryFile(cachedFile)
      temporaryFiles.delete(key)
    }
    if (temporaryWrites.has(key)) return temporaryWrites.get(key)
    const writePromise = (async () => {
    try {
      const root = uni.env?.USER_DATA_PATH || (typeof my !== 'undefined' ? my.env?.USER_DATA_PATH : '')
      const fileSystem = uni.getFileSystemManager?.() || (typeof my !== 'undefined' ? my.getFileSystemManager?.() : null)
      if (!root || !fileSystem) throw new Error('临时图片存储不可用')
      const ext = image.startsWith('data:image/png;') ? 'png' : image.startsWith('data:image/webp;') ? 'webp' : image.startsWith('data:image/gif;') ? 'gif' : 'jpg'
      const filePath = `${root}/bin_point_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      await new Promise((resolve, reject) => fileSystem.writeFile({
        filePath, data: image.slice(image.indexOf(',') + 1), encoding: 'base64', success: resolve, fail: reject
      }))
      rememberTemporaryFile(key, filePath)
      return filePath
    } catch (error) {
      logFailure(point?.id, 200, 'write-temp')
      throw error
    }
    })()
    temporaryWrites.set(key, writePromise)
    try { return await writePromise }
    finally { temporaryWrites.delete(key) }
  }
  // #endif
  return image
}
