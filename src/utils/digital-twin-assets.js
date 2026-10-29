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
  // #ifdef H5
  return `/assets/digital-twin/${normalized}`
  // #endif
  // #ifndef APP-PLUS || H5
  return `${DIGITAL_TWIN_ASSET_ROOT}/${normalized}`
  // #endif
}

export function digitalTwinWebpAssetUrl(webpPath, appFallbackPath) {
  const target = String(appFallbackPath || webpPath || '').replace(/(?:\.webp)?\.png$|\.webp$/i, '.webp.png')
  return digitalTwinAssetUrl(target)
}

export function webpPngFallbackUrl(url = '') {
  return String(url || '')
}

export default digitalTwinAssetUrl
