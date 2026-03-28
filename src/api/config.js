// 环境配置
// devbox:  https://kwcdasogdvpl.sealosbja.site
// app:     https://rgqexbnzzipc.sealosbja.site

// uni-app + Vite: import.meta.env 会被替换为包含环境变量的对象
// 构建时 VITE_API_BASE_URL="" 会生成相关环境变量

const DEFAULT_PROD_URL = 'https://kwcdasogdvpl.sealosbja.site';

// uni-app 会将 import.meta.env 替换为 importMetaEnv 对象
const _env = typeof importMetaEnv !== 'undefined' ? importMetaEnv : null;
const ENV = {
    // 如果 VITE_API_BASE_URL 存在（可能为空字符串），使用它；否则使用生产地址
    baseUrl: (_env && _env.VITE_API_BASE_URL !== undefined) ? _env.VITE_API_BASE_URL : DEFAULT_PROD_URL,
    timeout: 30000
}

// 根据环境获取配置
export function getConfig() {
  const isH5 = process.env.UNI_PLATFORM === 'h5'
  return ENV
}

export const config = getConfig()
