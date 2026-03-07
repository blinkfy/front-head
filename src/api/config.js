// 环境配置
// devbox:  https://kwcdasogdvpl.sealosbja.site
// app:     https://rgqexbnzzipc.sealosbja.site
const ENV = {
    baseUrl: 'https://kwcdasogdvpl.sealosbja.site',
    timeout: 30000
}

// 根据环境获取配置
export function getConfig() {
  return ENV
}

export const config = getConfig() 