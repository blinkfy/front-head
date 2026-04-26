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
          // SSE 流式传输必须禁用代理缓冲
          configure: (proxy) => {
            proxy.on('proxyRes', (proxyRes) => {
              // 对 SSE 响应禁用缓冲，确保逐事件推送
              if (proxyRes.headers['content-type'] &&
                  proxyRes.headers['content-type'].includes('text/event-stream')) {
                proxyRes.headers['x-accel-buffering'] = 'no'
                proxyRes.headers['cache-control'] = 'no-cache, no-transform'
              }
            })
          }
        },
        // WebSocket 代理：将 /ws 路径转发到后端，支持小程序/H5 开发调试
        '/ws': {
          target: 'http://localhost:3002',
          changeOrigin: true,
          ws: true  // 启用 WebSocket 代理
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
