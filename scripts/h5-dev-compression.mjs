import { gzip } from 'node:zlib'

function acceptsGzip(header = '') {
  const encodings = new Map(header.split(',').map(part => {
    const [name, ...params] = part.trim().toLowerCase().split(';')
    const quality = params.find(param => param.trim().startsWith('q='))
    return [name, quality ? Number(quality.trim().slice(2)) : 1]
  }))
  return (encodings.get('gzip') ?? encodings.get('*') ?? 0) > 0
}

// Vite/uni 在开发模式直接返回较大的 ESM 和内联 sourcemap。
// 仅压缩完整的脚本/样式响应，不接管 API、流式响应、图片或 HMR WebSocket。
export function compressDevModules(req, res, next) {
  if (req.method !== 'GET' || req.headers.range || /^\/(api|ws)(\/|\?|$)/.test(req.url || '')) return next()
  const end = res.end
  const write = res.write
  let streamed = false
  res.write = function(...args) {
    streamed = true
    return write.apply(this, args)
  }
  res.end = function(chunk, encoding, callback) {
    if (typeof encoding === 'function') { callback = encoding; encoding = undefined }
    const type = String(res.getHeader('Content-Type') || '')
    if (streamed || res.headersSent || res.statusCode !== 200 || !chunk ||
        res.getHeader('Content-Encoding') || /no-transform/i.test(String(res.getHeader('Cache-Control') || '')) ||
        !/^(?:text\/(?:javascript|css)|application\/(?:javascript|json))(?:;|$)/i.test(type)) {
      return end.call(this, chunk, encoding, callback)
    }
    const vary = String(res.getHeader('Vary') || '')
    if (!vary.split(',').some(name => ['accept-encoding', '*'].includes(name.trim().toLowerCase()))) {
      res.setHeader('Vary', vary ? `${vary}, Accept-Encoding` : 'Accept-Encoding')
    }
    const body = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding)
    if (body.length < 1024 || !acceptsGzip(req.headers['accept-encoding'])) return end.call(this, chunk, encoding, callback)
    gzip(body, { level: 6 }, (error, compressed) => {
      if (res.destroyed) return
      if (error || compressed.length >= body.length) { end.call(res, chunk, encoding, callback); return }
      res.setHeader('Content-Encoding', 'gzip')
      res.setHeader('Content-Length', compressed.length)
      end.call(res, compressed, undefined, callback)
    })
    return this
  }
  next()
}

export function h5DevCompressionPlugin() {
  return {
    name: 'h5-dev-module-compression',
    apply: 'serve',
    enforce: 'pre',
    configureServer(server) {
      if (process.env.UNI_PLATFORM === 'h5') server.middlewares.use(compressDevModules)
    }
  }
}
