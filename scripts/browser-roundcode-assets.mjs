import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../vendor/browser-roundcode/v1')
const prefix = '/h5-roundcode/v1/'
export function browserRoundCodeAssetsPlugin() {
  return {
    name: 'browser-roundcode-assets',
    generateBundle() {
      if (process.env.UNI_PLATFORM !== 'h5') return
      for (const name of fs.readdirSync(root)) {
        if (fs.statSync(path.join(root, name)).isFile()) this.emitFile({ type: 'asset', fileName: prefix.slice(1) + name, source: fs.readFileSync(path.join(root, name)) })
      }
    },
    configureServer(server) {
      if (process.env.UNI_PLATFORM !== 'h5') return
      server.middlewares.use((req, res, next) => {
        if (!['GET', 'HEAD'].includes(req.method)) return next()
        const pathname = new URL(req.url, 'http://localhost').pathname
        const at = pathname.indexOf(prefix)
        if (at < 0) return next()
        const name = pathname.slice(at + prefix.length)
        if (!/^[a-zA-Z0-9_.-]+$/.test(name)) { res.statusCode = 404; return res.end() }
        const file = path.join(root, name)
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; return res.end() }
        const type = { '.js': 'text/javascript', '.py': 'text/plain', '.json': 'application/json', '.wasm': 'application/wasm' }[path.extname(file)] || 'application/octet-stream'
        res.setHeader('Content-Type', type); res.setHeader('Cache-Control', 'no-cache')
        if (req.method === 'HEAD') return res.end()
        const stream = fs.createReadStream(file)
        stream.on('error', () => res.destroy()); stream.pipe(res)
      })
    }
  }
}
