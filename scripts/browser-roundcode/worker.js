// Classic Worker: the complete ARM64/JNI decoder runs here, never on the UI thread.
let runtime, initialization
const base = new URL('.', self.location.href).href
const progress = (id, phase) => self.postMessage({ id, phase })
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
    const [wasm, archive, bootstrap, ...scripts] = await Promise.all(
      ['unicorn.wasm', 'runtime.zip', 'bootstrap.py', 'unicorn.js', 'pyodide.js', 'pyodide.asm.js'].map(name => assets.get(name)))
    // Pyodide requests its WASM/stdlib/lock files itself. Route those public
    // files through the same verified disk cache, including versionless URLs.
    self.fetch = (input, options) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, base)
      const name = url.href.startsWith(base) ? url.pathname.split('/').pop() : ''
      return manifest.files[name] && (!options?.method || options.method === 'GET')
        ? assets.response(name) : nativeFetch(input, options)
    }
    const urls = scripts.map(bytes => URL.createObjectURL(new Blob([bytes], { type: 'text/javascript' })))
    try { importScripts(...urls) }
    catch (_) {
      // CSP may prohibit blob scripts. HTTP-loaded scripts retain compatibility;
      // large binary/runtime files still use the verified persistent cache.
      importScripts(...['unicorn.js', 'pyodide.js', 'pyodide.asm.js'].map(name => base + name + '?v=' + manifest.files[name]))
    } finally { urls.forEach(url => URL.revokeObjectURL(url)) }
    const [engine, py] = await Promise.all([
      MUnicorn({ wasmBinary: wasm, print() {}, printErr() {} }),
      loadPyodide({ indexURL: base, stdout() {}, stderr() {} })
    ])
    self.qbarUnicorn = engine
    py.FS.writeFile('/runtime.zip', archive)
    py.runPython("import zipfile\nzipfile.ZipFile('/runtime.zip').extractall('/runtime')")
    py.FS.unlink('/runtime.zip')
    py.runPython(new TextDecoder().decode(bootstrap))
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
