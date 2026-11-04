let nativeEncoder

// The UTS dependency is installed by App.vue only in APP builds.
export function installAppWebpEncoder(encoder) {
  nativeEncoder = typeof encoder === 'function' ? encoder : undefined
}

export function tryAppUploadWebp(source, quality, maxSize, preserveAlpha, io, timeoutMs = 4000) {
  if (!nativeEncoder || !io?.convertLocalFileSystemURL) return Promise.resolve(null)
  let destination
  let input
  try {
    destination = io.convertLocalFileSystemURL(`_doc/upload_webp_${Date.now()}_${Math.random().toString(36).slice(2)}.webp`)
    input = source.startsWith('content://') ? source : io.convertLocalFileSystemURL(source)
    if (!input || !destination || input === destination) return Promise.resolve(null)
  } catch (_) { return Promise.resolve(null) }
  const remove = () => {
    try { io.resolveLocalFileSystemURL(destination, entry => entry.remove(() => {}, () => {}), () => {}) } catch (_) {}
  }
  return new Promise(resolve => {
    let settled = false
    let delivered = false
    const finish = (path, ownsOutput = false) => {
      if (settled) { if (!delivered && ownsOutput) remove(); return }
      settled = true
      delivered = !!path
      clearTimeout(timer)
      if (!path && ownsOutput) remove()
      resolve(path)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    try {
      nativeEncoder(JSON.stringify({
        source: input, destination, quality: Math.min(100, Math.max(1, quality)),
        maxSize: Math.min(1600, Math.max(1, Math.round(maxSize))), preserveAlpha,
        deadline: Date.now() + timeoutMs
      }), raw => {
        try {
          const result = JSON.parse(raw)
          const ownsOutput = result.path === destination && !result.error && result.size > 0
          finish(ownsOutput && result.width > 0 && result.height > 0 &&
            Math.max(result.width, result.height) <= Math.min(1600, maxSize) ? destination : null, ownsOutput)
        } catch (_) { finish(null) }
      })
    } catch (_) { finish(null) }
  })
}
