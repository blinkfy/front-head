import { defineConfig, loadEnv } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { resolve } from 'path'
import { pathToFileURL } from 'node:url'
import { officialSitePlugin } from './scripts/official-site.mjs'
import { browserRoundCodeAssetsPlugin } from './scripts/browser-roundcode-assets.mjs'
import { h5DevCompressionPlugin } from './scripts/h5-dev-compression.mjs'

// https://vitejs.dev/config/
export default defineConfig(async ({ mode }) => {
  const { smartSortRobotAssetsPlugin } = await import(pathToFileURL(resolve(process.cwd(), 'scripts/smart-sort-robot-assets.mjs')).href)
  const { mpMainPackageAssetsPlugin } = await import(pathToFileURL(resolve(process.cwd(), 'scripts/mp-main-package-assets.mjs')).href)
  // 加载环境变量
  const env = loadEnv(mode, process.cwd(), '')

  return {
    // 官网仅作为 H5 静态页面发布，不进入小程序 / APP 的业务路由。
    ...(process.env.UNI_PLATFORM === 'h5' ? { publicDir: resolve(__dirname, 'public') } : {}),
    plugins: [
      h5DevCompressionPlugin(),
      uni({ vueOptions: { template: { compilerOptions: { isCustomElement: tag => tag === 'smart-sort-xr' } } } }),
      smartSortRobotAssetsPlugin(),
      mpMainPackageAssetsPlugin(),
      officialSitePlugin(),
      browserRoundCodeAssetsPlugin(),
      // APP 的 IIFE 不支持动态分包；在输出阶段内联，保留 H5/AMD 的分包行为。
      {
        name: 'app-iife-inline-imports',
        apply: 'build',
        outputOptions(output) {
          if (['app', 'app-plus'].includes(process.env.UNI_PLATFORM) && output.format === 'iife') {
            return { ...output, inlineDynamicImports: true, manualChunks: undefined }
          }
        }
      },
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
