// Environment config
const REMOTE_BASE_URL = 'https://rgqexbnzzipc.sealosbja.site'
const DEFAULT_TIMEOUT = 30000

function resolveH5BaseUrl() {
  if (typeof window === 'undefined' || !window.location) {
    return REMOTE_BASE_URL
  }

  const { origin, protocol } = window.location
  if (!origin || origin === 'null') {
    return REMOTE_BASE_URL
  }

  if (protocol === 'http:' || protocol === 'https:') {
    return origin
  }

  return REMOTE_BASE_URL
}

export function getConfig() {
  const isH5 = process.env.UNI_PLATFORM === 'h5'
  return {
    baseUrl: isH5 ? resolveH5BaseUrl() : REMOTE_BASE_URL,
    timeout: DEFAULT_TIMEOUT
  }
}

export const config = getConfig()
