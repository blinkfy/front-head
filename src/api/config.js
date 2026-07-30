// 环境配置
// devbox:  https://kwcdasogdvpl.sealosbja.site
// app:     https://rgqexbnzzipc.sealosbja.site
// local:   http://localhost:3000
// 根据环境获取配置
export function getConfig() {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL
    ? String(import.meta.env.VITE_API_BASE_URL).replace(/\/+$/, '')
    : ''
  const browserOrigin =
    typeof window !== 'undefined' && window.location?.origin
      ? String(window.location.origin).replace(/\/+$/, '')
      : ''

  return {
    // H5 defaults to its own origin so Vite's /api proxy and the backend's
    // bundled frontend work without an ignored .env.local file. Native builds
    // retain the hosted API fallback unless a build-time URL is configured.
    baseUrl: configuredBaseUrl || browserOrigin || 'https://rgqexbnzzipc.sealosbja.site',
    timeout: 30000
  }
}

export const config = getConfig()
