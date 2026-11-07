import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { build } from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'src/embedded-call')
const ringtone = path.join(root, 'src/static/app/sounds/09-incoming-call.mp3')
const require = createRequire(import.meta.url)
const { preprocess } = require('@dcloudio/uni-cli-shared/lib/preprocess')

async function buildCall(options = {}) {
  return build({ entryPoints: [path.join(source, 'main.js')], bundle: true,
    format: 'esm', platform: 'browser', target: 'es2020', sourcemap: false, logLevel: 'silent',
    ...options,
    plugins: [{ name: 'embedded-call-platform', setup(buildApi) {
      buildApi.onResolve({ filter: /^\.\/android-realtime\.js$/ }, args => args.importer.endsWith('voice-call-media.js') ? ({ path: 'android-realtime-stub', namespace: 'embedded-call' }) : null)
      buildApi.onResolve({ filter: /^\.\/feature-permission\.js$/ }, args => args.importer.endsWith('voice-call-media.js') ? ({ path: 'feature-permission-stub', namespace: 'embedded-call' }) : null)
      buildApi.onLoad({ filter: /.*/, namespace: 'embedded-call' }, args => ({ contents: args.path === 'android-realtime-stub'
        ? 'export const androidRealtimeAvailable=()=>false;'
        : 'export const ensureFeaturePermission=async()=>false;export const isPermissionDenied=()=>false;export const openFeaturePermissionSettings=async()=>{};', loader: 'js' }))
      buildApi.onLoad({ filter: /voice-call-media\.js$/ }, async args => ({ contents: preprocess(await fs.readFile(args.path, 'utf8'), { H5: true, APP: false, APP_PLUS: false, MP: false, MP_WEIXIN: false }, 'js'), loader: 'js' }))
    } }] })
}

async function bundle(outdir) {
  await fs.mkdir(outdir, { recursive: true })
  const jsPath = path.join(outdir, 'app.js'), cssPath = path.join(outdir, 'style.css')
  await buildCall({ outfile: jsPath })
  await fs.copyFile(path.join(source, 'style.css'), cssPath)
  const hash = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex').slice(0, 12)
  const jsAsset = `app.${await hash(jsPath)}.js`, cssAsset = `style.${await hash(cssPath)}.css`
  await fs.rename(jsPath, path.join(outdir, jsAsset))
  const html = (await fs.readFile(path.join(source, 'index.html'), 'utf8')).replace('./app.js', `./${jsAsset}`).replace('./style.css', `./${cssAsset}`)
  await fs.writeFile(path.join(outdir, 'index.html'), html)
  await fs.rename(cssPath, path.join(outdir, cssAsset))
  await fs.copyFile(ringtone, path.join(outdir, 'ringtone.mp3'))
}

export function embeddedCallPlugin() {
  return {
    name: 'embedded-call-entry',
    configureServer(server) {
      if (process.env.UNI_PLATFORM !== 'h5') return
      const middleware = async (req, res, next) => {
        const pathname = String(req.url || '').split('?')[0]
        const prefix = ['/call/', '/web/call/'].find(value => pathname.startsWith(value))
        if (!prefix || !['GET', 'HEAD'].includes(req.method)) return next()
        const name = pathname.slice(prefix.length) || 'index.html'
        const types = { 'index.html': 'text/html; charset=utf-8', 'app.js': 'text/javascript; charset=utf-8',
          'style.css': 'text/css; charset=utf-8', 'ringtone.mp3': 'audio/mpeg' }
        if (!Object.hasOwn(types, name)) return next()
        try {
          const body = name === 'app.js' ? (await buildCall({ write: false })).outputFiles[0].text
            : await fs.readFile(name === 'ringtone.mp3' ? ringtone : path.join(source, name))
          res.statusCode = 200
          res.setHeader('Content-Type', types[name])
          res.setHeader('Cache-Control', 'no-store')
          res.end(req.method === 'HEAD' ? undefined : body)
        } catch (error) {
          server.config.logger.error(error.message)
          res.statusCode = 500
          res.end('通话页编译失败')
        }
      }
      server.middlewares.use(middleware)
    },
    writeBundle: {
      order: 'post', sequential: true,
      async handler(options) {
        if (process.env.UNI_PLATFORM !== 'h5') return
        const outdir = path.join(path.resolve(options.dir || process.env.UNI_OUTPUT_DIR || path.join(root, 'dist/build/h5')), 'call')
        await bundle(outdir)
      }
    }
  }
}
