import { baseUrl } from '@/api/settings.js'

const API_ORIGIN = String(baseUrl || '').replace(/\/+$/, '')

export const DIGITAL_TWIN_ASSET_ROOT = `${API_ORIGIN}/assets/digital-twin`

export function digitalTwinAssetUrl(path = '') {
  const value = String(path || '').trim()
  if (!value) return DIGITAL_TWIN_ASSET_ROOT
  if (/^(?:https?:|data:|blob:)/i.test(value)) return value

  const normalized = value
    .replace(/^\/+/, '')
    .replace(/^(?:static\/|assets\/digital-twin\/)/, '')

  // #ifdef APP-PLUS
  return `/static/app/digital-twin/${normalized}`
  // #endif
  // #ifndef APP-PLUS
  return `${DIGITAL_TWIN_ASSET_ROOT}/${normalized}`
  // #endif
}

// WebP is used for remote mini-program/H5 assets. App keeps the PNG copy so
// classic app-vue builds remain compatible with iOS versions below 14.
export function digitalTwinWebpAssetUrl(webpPath, appFallbackPath) {
  // #ifdef APP-PLUS
  return digitalTwinAssetUrl(appFallbackPath)
  // #endif
  // #ifndef APP-PLUS
  return digitalTwinAssetUrl(webpPath)
  // #endif
}

export function webpPngFallbackUrl(url = '') {
  return String(url || '').replace(/\.webp(?=([?#]|$))/i, '.png')
}

export default digitalTwinAssetUrl
