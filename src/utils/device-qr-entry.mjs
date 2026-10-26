export const DEVICE_SCAN_PAGE = '/pages-nonTheme/scan'

export const PENDING_DEVICE_QR_KEY = 'pending_device_qr_scene'
export const PENDING_DEVICE_QR_TTL_MS = 10 * 60 * 1000

const DEVICE_QR_SCENE_PATTERN = /^[a-f0-9]{32}$/i
const OWN_SCAN_PATH_PATTERN = /^\/?(?:pages(?:-dark)?\/scan\/scan|pages-nonTheme\/scan)(?:$|\?)/

export function normalizeDeviceQrScene(value) {
  let scene = String(value ?? '').trim()
  try {
    scene = decodeURIComponent(scene)
  } catch (error) {
    // Keep the original value; the strict token check below rejects malformed escapes.
  }
  return DEVICE_QR_SCENE_PATTERN.test(scene) ? scene : ''
}

export function isValidDeviceQrScene(value) {
  return Boolean(normalizeDeviceQrScene(value))
}

function normalizeOwnScanPath(value) {
  let path = String(value || '').trim()
  if (path.startsWith('#')) path = path.slice(1)
  else if (path.includes('#')) return ''
  if (!OWN_SCAN_PATH_PATTERN.test(path)) return ''
  return path.startsWith('/') ? path : `/${path}`
}

export function getDeviceQrScanContent(scanResult) {
  const path = normalizeOwnScanPath(scanResult?.path)
  if (path) return path
  return String(scanResult?.result || '')
}

function parseQuery(queryText) {
  const params = {}
  String(queryText || '').split('&').forEach(pair => {
    if (!pair) return
    const separator = pair.indexOf('=')
    const key = separator >= 0 ? pair.slice(0, separator) : pair
    const value = separator >= 0 ? pair.slice(separator + 1) : ''
    try {
      params[decodeURIComponent(key.replace(/\+/g, ' '))] = decodeURIComponent(value.replace(/\+/g, ' '))
    } catch (error) {
      params[key] = value
    }
  })
  return params
}

export function isLegacyDeviceScanPath(value) {
  return /^\/?pages(?:-dark)?\/scan\/scan(?:$|\?)/.test(String(value || '').replace(/^#/, ''))
}

export function resolveLegacyDeviceScanUrl(value, query = {}) {
  const path = normalizeOwnScanPath(value)
  if (!isLegacyDeviceScanPath(path)) return ''
  const queryIndex = path.indexOf('?')
  const params = queryIndex < 0 ? {} : parseQuery(path.slice(queryIndex + 1))
  return appendPageQuery(DEVICE_SCAN_PAGE, { ...params, ...query })
}

// Run before the H5 router starts so old bookmarks need no legacy page.
export function rewriteLegacyDeviceScanLocation(location, history) {
  if (!location || !history?.replaceState) return false
  const target = resolveLegacyDeviceScanUrl(location.hash)
  if (target) {
    history.replaceState(history.state, '', location.pathname + location.search + '#' + target)
    return true
  }
  const directTarget = !location.hash && resolveLegacyDeviceScanUrl(location.pathname + location.search)
  if (!directTarget) return false
  history.replaceState(history.state, '', directTarget)
  return true
}

export function resolveDeviceQrPathTarget(pathValue, scanPage = DEVICE_SCAN_PAGE) {
  if (isLegacyDeviceScanPath(scanPage)) scanPage = DEVICE_SCAN_PAGE
  const path = normalizeOwnScanPath(pathValue)
  if (!path) return null
  const queryIndex = path.indexOf('?')
  if (queryIndex < 0) return null
  const params = parseQuery(path.slice(queryIndex + 1))
  if (!Object.prototype.hasOwnProperty.call(params, 'scene')) return null

  const scene = normalizeDeviceQrScene(params.scene)
  if (!scene) {
    return {
      url: '',
      scene: '',
      invalidScene: true,
      deviceId: '',
      deviceName: '',
      deviceMode: 'bin',
      token: '',
      isMock: false
    }
  }

  return {
    url: `${scanPage}?scene=${encodeURIComponent(scene)}`,
    scene,
    deviceId: '',
    deviceName: '',
    deviceMode: 'bin',
    token: '',
    isMock: false
  }
}

export function appendPageQuery(path, params = {}) {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
  if (!query) return path
  return `${path}${String(path).includes('?') ? '&' : '?'}${query}`
}

export function buildDeviceQrScanUrl(scene) {
  const normalizedScene = normalizeDeviceQrScene(scene)
  if (!normalizedScene) return ''
  return appendPageQuery(DEVICE_SCAN_PAGE, { scene: normalizedScene })
}

export function savePendingDeviceQrScene(runtime, scene, now = Date.now()) {
  const normalizedScene = normalizeDeviceQrScene(scene)
  if (!normalizedScene || !runtime?.setStorageSync) return false
  runtime.setStorageSync(PENDING_DEVICE_QR_KEY, { scene: normalizedScene, savedAt: now })
  return true
}

export function getPendingDeviceQrScene(runtime, now = Date.now()) {
  if (!runtime?.getStorageSync) return ''
  const pending = runtime.getStorageSync(PENDING_DEVICE_QR_KEY)
  const scene = normalizeDeviceQrScene(pending?.scene)
  const savedAt = Number(pending?.savedAt)
  if (!scene || !Number.isFinite(savedAt) || savedAt > now || now - savedAt > PENDING_DEVICE_QR_TTL_MS) {
    clearPendingDeviceQrScene(runtime)
    return ''
  }
  return scene
}

export function clearPendingDeviceQrScene(runtime) {
  if (runtime?.removeStorageSync) runtime.removeStorageSync(PENDING_DEVICE_QR_KEY)
}
