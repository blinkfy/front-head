// 环境配置
// devbox:  https://kwcdasogdvpl.sealosbja.site
// app:     https://rgqexbnzzipc.sealosbja.site
// local:   http://localhost:3000
// 根据环境获取配置
export function getConfig() {
  return {
    baseUrl: 'http://localhost:3000',
    timeout: 30000
  }
}

export const config = getConfig()
