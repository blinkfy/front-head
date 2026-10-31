// Versioned public decoder files only. No QR image, payload or login data enters this cache.
export function createRoundCodeAssetCache({ base, files, fetchAsset = globalThis.fetch.bind(globalThis),
  storage = globalThis.caches, crypto = globalThis.crypto, signal } = {}) {
  const inflight = new Map()
  let cachePromise
  const cache = () => cachePromise || (cachePromise = Promise.resolve().then(() => storage?.open('ftx-roundcode-assets-v1')).catch(() => null))
  async function valid(bytes, hash) {
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('') === hash
  }
  async function read(name) {
    const hash = files[name]
    if (!/^[a-zA-Z0-9_.-]+$/.test(name) || !/^[a-f0-9]{64}$/.test(hash || '')) throw new Error('INVALID_ASSET')
    if (signal?.aborted) throw new Error('CANCELLED')
    const url = new URL(name + '?v=' + hash, base).href, store = await cache()
    let saved
    try { saved = await store?.match(url) } catch (_) { /* Storage restrictions do not disable decoding. */ }
    if (saved?.ok) {
      const bytes = new Uint8Array(await saved.arrayBuffer())
      if (await valid(bytes, hash)) return bytes
      try { await store?.delete(url) } catch (_) {}
    }
    const response = await fetchAsset(url, { cache: 'force-cache', ...(signal ? { signal } : {}) })
    if (!response.ok) throw new Error('ASSETS_UNAVAILABLE')
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (!await valid(bytes, hash)) throw new Error('ASSETS_INVALID')
    if (!signal?.aborted) {
      try {
        await store?.put(url, new Response(bytes, { headers: { 'Content-Type': contentType(name) } }))
        // Keep the two most recently stored versions per file, so ordinary
        // releases cannot grow this public-asset cache without a bound.
        if (store?.keys) {
          const path = new URL(url).pathname
          const versions = (await store.keys()).filter(request => new URL(request.url).pathname === path)
          await Promise.all(versions.slice(0, -2).map(request => store.delete(request)))
        }
      } catch (_) {}
    }
    return bytes
  }
  function contentType(name) {
    return name.endsWith('.wasm') ? 'application/wasm' : name.endsWith('.js') ? 'text/javascript'
      : name.endsWith('.json') ? 'application/json' : 'application/octet-stream'
  }
  function get(name) {
    if (inflight.has(name)) return inflight.get(name)
    const pending = read(name).finally(() => inflight.delete(name))
    inflight.set(name, pending); return pending
  }
  return {
    get,
    async response(name) { return new Response(await get(name), { headers: { 'Content-Type': contentType(name) } }) },
    async preload() {
      const names = Object.keys(files).filter(name => /\.(?:js|wasm|zip|py|json)$/.test(name))
      let cursor = 0
      await Promise.all([0, 1].map(async () => {
        while (cursor < names.length) { const name = names[cursor++]; await get(name) }
      }))
    }
  }
}
