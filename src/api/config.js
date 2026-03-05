// 环境配置
// devbox:  https://kwcdasogdvpl.sealosbja.site
// app:     https://rgqexbnzzipc.sealosbja.site
const ENV = {
  development: {
    baseUrl: 'http://localhost:3000', // 本地开发环境
    timeout: 30000
  },
  production: {
    baseUrl: 'http://localhost:3000', // 生产环境，需要替换为实际部署的服务器地址
    timeout: 30000
  }
}

// 根据环境获取配置
export function getConfig() {
  // 可以通过环境变量或构建时配置来切换环境
  const env = process.env.NODE_ENV || 'development'
  return ENV[env]
}

export const config = getConfig() 