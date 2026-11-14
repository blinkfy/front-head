// 环境配置
// devbox:  https://kwcdasogdvpl.sealosbja.site
// app:     https://rgqexbnzzipc.sealosbja.site
// local:   http://127.0.0.1:3000
// 根据环境获取配置
export function getConfig() {
  return {
    baseUrl: 'http://127.0.0.1:3000',
    timeout: 30000
  }
}

export const config = getConfig()
