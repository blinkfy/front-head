import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// uni-app 会替换 Vite 的 public 静态中间件。仅在 H5 开发环境补回官网入口；
// 生产环境由 publicDir 复制页面、生成 HLS 播放器，部署服务直接提供静态文件。
export function officialSitePlugin() {
  return {
    name: 'official-site',
    generateBundle() {
      if (process.env.UNI_PLATFORM !== 'h5') return
      // 复用项目已安装的 HLS 播放器，官网无需依赖外部脚本 CDN。
      for (const [source, fileName] of [['dist/hls.min.js', 'official/hls.min.js'], ['LICENSE', 'official/hls-license.txt']]) {
        this.emitFile({ type: 'asset', fileName, source: fs.readFileSync(path.resolve(projectRoot, 'node_modules/hls.js', source)) })
      }
    },
    writeBundle(options) {
      if (process.env.UNI_PLATFORM !== 'h5') return
      const outDir = path.resolve(options.dir || process.env.UNI_OUTPUT_DIR || '')
      const srcDir = path.resolve(projectRoot, 'src/static/app/digital-twin')
      if (outDir && fs.existsSync(srcDir)) {
        fs.cpSync(srcDir, path.join(outDir, 'assets/digital-twin'), { recursive: true, force: true })
      }
    },
    configureServer(server) {
      if (process.env.UNI_PLATFORM !== 'h5') return
      const root = path.resolve(server.config.publicDir)
      const digitalTwinRoot = path.resolve(projectRoot, 'src/static/app/digital-twin')
      const pages = new Set(['/official.html', '/privacy.html', '/user-agreement.html'])
      const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t' }
      server.middlewares.use((req, res, next) => {
        if (!['GET', 'HEAD'].includes(req.method)) return next()
        let pathname
        try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname) } catch (_) { return next() }
        const dtPrefix = ['/static/app/digital-twin/', '/assets/digital-twin/'].find(p => pathname.startsWith(p))
        if (dtPrefix) {
          const rel = pathname.slice(dtPrefix.length)
          let file = path.resolve(digitalTwinRoot, rel)
          if (!file.startsWith(digitalTwinRoot + path.sep)) return next()
          if (!fs.existsSync(file) && /\.(?:png|webp)$/i.test(file) && !/\.webp\.png$/i.test(file)) {
            const candidate = file.replace(/\.(?:png|webp)$/i, '.webp.png')
            if (fs.existsSync(candidate)) file = candidate
          }
          try {
            if (!fs.statSync(file).isFile()) return next()
            const isWebp = /\.webp(?:\.png)?$/i.test(file)
            const type = isWebp ? 'image/webp' : (types[path.extname(file).toLowerCase()] || 'application/octet-stream')
            res.setHeader('Content-Type', type.startsWith('text/') || type === 'application/json' ? `${type}; charset=utf-8` : type)
            res.setHeader('Cache-Control', 'no-store')
            if (req.method === 'HEAD') return res.end()
            const stream = fs.createReadStream(file)
            stream.on('error', () => res.destroy())
            return stream.pipe(res)
          } catch (_) {
            res.statusCode = 404
            return res.end('Digital twin asset not found')
          }
        }
        if (!pages.has(pathname) && !pathname.startsWith('/official/')) return next()
        const playerFile = pathname === '/official/hls.min.js'
        const file = playerFile ? path.resolve(projectRoot, 'node_modules/hls.js/dist/hls.min.js') : path.resolve(root, `.${pathname}`)
        if (!playerFile && !file.startsWith(root + path.sep)) return next()
        try {
          if (!fs.statSync(file).isFile()) return next()
          const type = types[path.extname(file)] || 'application/octet-stream'
          res.setHeader('Content-Type', type.startsWith('text/') ? `${type}; charset=utf-8` : type)
          res.setHeader('Cache-Control', 'no-store')
          if (req.method === 'HEAD') return res.end()
          const stream = fs.createReadStream(file)
          stream.on('error', () => res.destroy())
          stream.pipe(res)
        } catch (_) {
          res.statusCode = 404
          res.end('Official site resource not found')
        }
      })
    },
  }
}
