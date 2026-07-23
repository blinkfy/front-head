export const DATABASE_OFFLINE_STORAGE_KEY = 'dbOffline'
export const DATABASE_OFFLINE_MESSAGE = '数据库离线，当前为缓存/演示数据'
export const DATABASE_OFFLINE_TOAST_COOLDOWN_MS = 8000

const listeners = new Set()
let memoryStatus = null

function runtimeOrGlobal(runtime) {
  return runtime || null
}

function normalizeStatus(value) {
  if (value === true) {
    return {
      offline: true,
      message: DATABASE_OFFLINE_MESSAGE,
      source: 'legacy',
      changedAt: 0,
      notifiedAt: 0
    }
  }
  if (!value || typeof value !== 'object' || value.offline !== true) {
    return {
      offline: false,
      message: '',
      source: '',
      changedAt: 0,
      notifiedAt: 0
    }
  }
  return {
    offline: true,
    message: value.message || DATABASE_OFFLINE_MESSAGE,
    source: value.source || 'unknown',
    changedAt: Number(value.changedAt) || 0,
    notifiedAt: Number(value.notifiedAt) || 0
  }
}

function emit(status) {
  listeners.forEach(listener => {
    try {
      listener(status)
    } catch (_) {
      // A view listener must not interrupt request handling.
    }
  })
}

function readStoredStatus(runtime) {
  const api = runtimeOrGlobal(runtime)
  if (!api || typeof api.getStorageSync !== 'function') return normalizeStatus(memoryStatus)
  try {
    return normalizeStatus(api.getStorageSync(DATABASE_OFFLINE_STORAGE_KEY))
  } catch (_) {
    return normalizeStatus(memoryStatus)
  }
}

function persistStatus(status, runtime) {
  const api = runtimeOrGlobal(runtime)
  memoryStatus = status
  if (api && typeof api.setStorageSync === 'function') {
    try {
      api.setStorageSync(DATABASE_OFFLINE_STORAGE_KEY, status)
    } catch (_) {
      // Keep the in-memory state when storage is unavailable.
    }
  }
  emit(status)
  return status
}

function removeStoredStatus(runtime) {
  const api = runtimeOrGlobal(runtime)
  memoryStatus = null
  if (api && typeof api.removeStorageSync === 'function') {
    try {
      api.removeStorageSync(DATABASE_OFFLINE_STORAGE_KEY)
    } catch (_) {
      // The in-memory state is still cleared for the active page.
    }
  }
  const status = normalizeStatus(null)
  emit(status)
  return status
}

function extractAvailability(payload) {
  // Some database-backed endpoints return only code 2 + message. Treat that
  // response as authoritative even when the structured database state is absent.
  if (Number(payload?.code) === 2 || Number(payload?.data?.code) === 2) {
    return { confirmed: true, offline: true }
  }

  const candidates = [
    payload && payload.data,
    payload,
    payload && payload.database,
    payload && payload.data && payload.data.database
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue
    if (candidate.online === false || candidate.degraded === true || candidate.state === 'offline') {
      return { confirmed: true, offline: true }
    }
    if (candidate.online === true && candidate.degraded !== true && candidate.state !== 'offline') {
      return { confirmed: true, offline: false }
    }
  }
  return { confirmed: false, offline: false }
}

export function getDatabaseStatus(runtime) {
  return readStoredStatus(runtime)
}

export function markDatabaseOffline(options = {}) {
  const runtime = runtimeOrGlobal(options.runtime)
  const now = Number(options.now) || Date.now()
  const previous = readStoredStatus(runtime)
  const shouldNotify = options.notify !== false &&
    (!previous.notifiedAt || now - previous.notifiedAt >= DATABASE_OFFLINE_TOAST_COOLDOWN_MS)
  const status = {
    offline: true,
    message: options.message || previous.message || DATABASE_OFFLINE_MESSAGE,
    source: options.source || previous.source || 'request',
    changedAt: previous.offline && previous.changedAt ? previous.changedAt : now,
    notifiedAt: shouldNotify ? now : previous.notifiedAt
  }

  persistStatus(status, runtime)
  if (shouldNotify && runtime && typeof runtime.showToast === 'function') {
    runtime.showToast({ title: status.message, icon: 'none' })
  }
  return status
}

export function updateDatabaseStatusFromAvailability(payload, options = {}) {
  const availability = extractAvailability(payload)
  if (!availability.confirmed) return readStoredStatus(options.runtime)
  if (availability.offline) {
    return markDatabaseOffline({
      runtime: options.runtime,
      message: options.message || payload?.msg || payload?.error || DATABASE_OFFLINE_MESSAGE,
      source: options.source || 'availability',
      notify: options.notify === true
    })
  }
  // A normal business request must never clear a previous offline marker.
  // Recovery is accepted only when a caller identifies a health endpoint.
  if (options.allowRecovery === true) return removeStoredStatus(options.runtime)
  return readStoredStatus(options.runtime)
}

export function subscribeDatabaseStatus(listener, runtime) {
  if (typeof listener !== 'function') return () => {}
  listeners.add(listener)
  listener(readStoredStatus(runtime))
  return () => listeners.delete(listener)
}
