import { defineConfig, loadEnv } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 加载环境变量
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      uni(),
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        'mp-html': resolve(__dirname, 'node_modules/mp-html/src/uni-app/components/mp-html/mp-html.vue')
      }
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      proxy: {
        '/api': {
          target: 'http://localhost:3002',
          changeOrigin: true,
          secure: false,
        }
      }
    },
    define: {
      // 确保 importMetaEnv 在运行时存在
      'importMetaEnv': JSON.stringify({
        VITE_API_BASE_URL: env.VITE_API_BASE_URL || '',
        MODE: mode,
        BASE_URL: '/',
        DEV: mode !== 'production',
        PROD: mode === 'production',
      })
    }
  }
})
