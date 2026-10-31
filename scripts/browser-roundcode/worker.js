// Classic Worker: the complete ARM64/JNI decoder runs here, never on the UI thread.
let runtime, initialization
const base = new URL('.', self.location.href).href
const progress = (id, phase, value) => self.postMessage({ id, phase, progress: value })
async function initialize(id) {
  if (runtime) return runtime
  if (initialization) return initialization
  initialization = (async () => {
    progress(id, 'loading')
    const manifestResponse = await fetch(base + 'manifest.json', { cache: 'no-cache' })
    if (!manifestResponse.ok) throw new Error('ASSETS_UNAVAILABLE')
    const manifest = await manifestResponse.json()
    importScripts(base + 'asset-cache.js?v=' + manifest.files['asset-cache.js'])
    const nativeFetch = self.fetch.bind(self)
    const assets = createRoundCodeAssetCache({ base, files: manifest.files, fetchAsset: nativeFetch })
    // Start the large Python WASM/stdlib downloads alongside the emulator,
    // rather than waiting for runtime.zip and JavaScript to finish first.
    const names = ['unicorn.wasm', 'runtime.zip', 'bootstrap.py', 'unicorn.js', 'pyodide.js', 'pyodide.asm.js',
      'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']
    let completed = 0
    const downloads = new Map(names.map(name => [name, assets.get(name).then(bytes => {
      progress(id, 'loading', ++completed / names.length); return bytes
    })]))
    const [wasm, archive, bootstrap, ...scripts] = (await Promise.all(downloads.values())).slice(0, 6)
    // Pyodide requests its WASM/stdlib/lock files itself. Route those public
    // files through the same verified disk cache, including versionless URLs.
    self.fetch = (input, options) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, base)
      const name = url.href.startsWith(base) ? url.pathname.split('/').pop() : ''
      if (!manifest.files[name] || (options?.method && options.method !== 'GET')) return nativeFetch(input, options)
      if (!downloads.has(name)) return assets.response(name)
      return downloads.get(name).then(bytes => new Response(bytes, { headers: {
        'Content-Type': name.endsWith('.wasm') ? 'application/wasm' : name.endsWith('.json') ? 'application/json' : 'application/octet-stream'
      } }))
    }
    const urls = scripts.map(bytes => URL.createObjectURL(new Blob([bytes], { type: 'text/javascript' })))
    try { importScripts(...urls) }
    catch (_) {
      // CSP may prohibit blob scripts. HTTP-loaded scripts retain compatibility;
      // large binary/runtime files still use the verified persistent cache.
      importScripts(...['unicorn.js', 'pyodide.js', 'pyodide.asm.js'].map(name => base + name + '?v=' + manifest.files[name]))
    } finally { urls.forEach(url => URL.revokeObjectURL(url)) }
    progress(id, 'initializing')
    const [engine, py] = await Promise.all([
      MUnicorn({ wasmBinary: wasm, print() {}, printErr() {} }),
      loadPyodide({ indexURL: base, stdout() {}, stderr() {} })
    ])
    self.qbarUnicorn = engine
    py.FS.writeFile('/runtime.zip', archive)
    py.runPython("import zipfile\nzipfile.ZipFile('/runtime.zip').extractall('/runtime')")
    py.FS.unlink('/runtime.zip')
    py.runPython(new TextDecoder().decode(bootstrap))
    downloads.clear()
    runtime = py
    return py
  })()
  return initialization
}
self.onmessage = async ({ data }) => {
  const { id, width, height, gray } = data || {}
  if (!Number.isInteger(id) || !Number.isInteger(width) || !Number.isInteger(height)
      || width < 24 || height < 24 || width > 384 || height > 384
      || !(gray instanceof Uint8Array) || gray.length !== width * height) {
    self.postMessage({ id, result: { error: 'INVALID_IMAGE' } }); return
  }
  try {
    const py = await initialize(id)
    progress(id, 'decoding')
    py.globals.set('_frame', gray)
    py.globals.set('_width', width); py.globals.set('_height', height)
    let result
    try { result = JSON.parse(py.runPython('json.dumps(decode_frame(_frame.to_py(), _width, _height))')) }
    finally { for (const key of ['_frame', '_width', '_height']) py.globals.delete(key) }
    self.postMessage({ id, result })
  } catch (_) {
    // Guest exceptions may contain bytes or JNI references. Only fixed errors
    // cross this boundary. The caller terminates and releases this failed Worker.
    self.postMessage({ id, result: { error: 'DECODER_UNAVAILABLE' } })
  }
}
