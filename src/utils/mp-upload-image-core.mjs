const call = (invoke, options, deadline, late = () => {}) => new Promise((resolve, reject) => {
  if (Date.now() >= deadline) { reject(new Error('图片处理超时')); return }
  let settled = false
  const finish = (error, value) => {
    if (settled) { if (!error) late(value); return }
    settled = true
    clearTimeout(timer)
    error ? reject(error) : resolve(value)
  }
  const timer = setTimeout(() => finish(new Error('图片处理超时')), Math.max(1, deadline - Date.now()))
  try { invoke({ ...options, success: value => finish(null, value), fail: error => finish(error || new Error('图片处理失败')) }) }
  catch (error) { finish(error) }
})

function webpData(value, decode) {
  const match = /^data:image\/webp;base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(value || ''))
  if (!match || match[1].length % 4) return null
  const bytes = new Uint8Array(decode(match[1]))
  const ascii = (offset, text) => [...text].every((char, index) => bytes[offset + index] === char.charCodeAt(0))
  if (bytes.length < 20 || !ascii(0, 'RIFF') || !ascii(8, 'WEBP')) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(4, true) + 8 !== bytes.length) return null
  let alpha = false
  let imageChunk = false
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const length = view.getUint32(offset + 4, true)
    const start = offset + 8
    if (start + length > bytes.length) return null
    if (ascii(offset, 'VP8X') && length >= 10) alpha ||= !!(bytes[start] & 0x10)
    if (ascii(offset, 'VP8 ') && length >= 10 && ascii(start + 3, '\x9d\x01\x2a')) imageChunk = true
    if (ascii(offset, 'VP8L') && length >= 5 && bytes[start] === 0x2f) {
      imageChunk = true
      alpha ||= !!(bytes[start + 4] & 0x10)
    }
    offset = start + length + (length % 2)
  }
  return imageChunk ? { encoded: match[1], alpha } : null
}

// No platform globals: callers supply WeChat's Canvas / file APIs, never browser DOM APIs.
export function createMiniUploadProcessor(runtime) {
  let capability
  let sequence = 0
  let tail = Promise.resolve()
  const remove = path => {
    if (!path) return
    try { runtime.fs().unlink({ filePath: path, fail() {} }) } catch (_) {}
  }
  async function process(source, info, options) {
    let canvas
    let image
    let writtenPath
    let delivered = false
    const deadline = Date.now() + (runtime.timeoutMs || 4000)
    try {
      // Preserve the existing native EXIF path; Canvas rotation differs between clients.
      if (info.orientation && info.orientation !== 'up') return null
      if (!(info.width > 0 && info.height > 0) || info.width * info.height > 16 * 1024 * 1024) return null
      canvas = (await call(runtime.getCanvas, {}, deadline)).canvas
      if (!canvas?.getContext || !canvas.createImage) return null
      let context = canvas.getContext('2d')
      if (!context) return null
      if (!capability) {
        canvas.width = 2
        canvas.height = 1
        context.clearRect(0, 0, 2, 1)
        context.fillStyle = '#00b578'
        context.fillRect(0, 0, 1, 1) // Leave the other pixel transparent to probe alpha encoding.
        try {
          const probe = webpData(canvas.toDataURL('image/webp', .8), runtime.decodeBase64)
          capability = { webp: !!probe, alpha: !!probe?.alpha }
        } catch (_) { capability = { webp: false, alpha: false } }
      }
      image = canvas.createImage()
      await call(({ success, fail }) => {
        image.onload = success
        image.onerror = fail
        image.src = source
      }, {}, deadline)
      const width = Number(image.width) || info.width
      const height = Number(image.height) || info.height
      const maximum = Math.min(1600, Math.max(1, options.maxSize))
      const scale = Math.min(1, maximum / Math.max(width, height))
      canvas.width = Math.max(1, Math.round(width * scale))
      canvas.height = Math.max(1, Math.round(height * scale))
      context = canvas.getContext('2d')
      context.clearRect(0, 0, canvas.width, canvas.height)
      if (!options.preserveAlpha) {
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      if (Date.now() >= deadline) return null
      const quality = Math.min(1, Math.max(.01, options.quality / 100))
      if (capability.webp && (!options.preserveAlpha || capability.alpha)) {
        let data
        try { data = webpData(canvas.toDataURL('image/webp', quality), runtime.decodeBase64) } catch (_) {}
        if (data && Date.now() < deadline) {
          const root = runtime.root()
          if (root) {
            const destination = `${root}/upload_mp_${Date.now()}_${++sequence}_${Math.random().toString(36).slice(2)}.webp`
            if (destination === source) return null
            try {
              const fs = runtime.fs()
              await call(args => fs.writeFile(args), {
                filePath: destination, data: data.encoded, encoding: 'base64'
              }, deadline, () => remove(destination))
              writtenPath = destination
              if (Date.now() >= deadline) return null
              delivered = true
              return destination
            } catch (_) { remove(destination) }
          }
        }
      }
      if (Date.now() >= deadline) return null
      const exported = await call(runtime.exportCanvas, {
        canvas, x: 0, y: 0, width: canvas.width, height: canvas.height,
        destWidth: canvas.width, destHeight: canvas.height,
        fileType: options.preserveAlpha ? 'png' : 'jpg', quality
      }, deadline, result => { if (result?.tempFilePath !== source) remove(result?.tempFilePath) })
      return exported.tempFilePath || null
    } catch (_) { return null }
    finally {
      if (image) { image.onload = null; image.onerror = null }
      if (canvas) { try { canvas.width = canvas.height = 1 } catch (_) {} }
      if (writtenPath && !delivered) remove(writtenPath)
    }
  }
  return (source, info, options) => {
    // A single scratch canvas must not mix pixels from overlapping uploads.
    const task = tail.then(() => process(source, info, options))
    tail = task.catch(() => {})
    return task
  }
}
