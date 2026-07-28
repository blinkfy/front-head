// 环境配置
// devbox:  https://kwcdasogdvpl.sealosbja.site
// app:     https://rgqexbnzzipc.sealosbja.site
// local:   http://localhost:3000
// 根据环境获取配置
export function getConfig() {
  const localBaseUrl =
    import.meta.env.DEV &&
    import.meta.env.VITE_API_BASE_URL
      ? String(import.meta.env.VITE_API_BASE_URL).replace(/\/+$/, '')
      : ''

  return {
    baseUrl: localBaseUrl || 'https://rgqexbnzzipc.sealosbja.site',
    timeout: 30000
  }
}

export const config = getConfig()
