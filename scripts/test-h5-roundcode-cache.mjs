import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRoundCodeAssetCache } from '../src/utils/h5-roundcode-cache.mjs'

const bytes = new TextEncoder().encode('fixed decoder bytes'), hash = createHash('sha256').update(bytes).digest('hex')
const base = 'https://example.test/h5-roundcode/v1/'
const entries = new Map(), calls = []
const storage = { async open() { return {
  async match(key) { return entries.get(key)?.clone() },
  async put(key, response) { entries.set(key, response.clone()) },
  async delete(key) { entries.delete(typeof key === 'string' ? key : key.url) },
  async keys() { return [...entries.keys()].map(url => ({ url })) }
} } }
const files = { 'unicorn.wasm': hash }
const fetchAsset = async (url, options) => { calls.push({ url, options }); return new Response(bytes) }
const make = extra => createRoundCodeAssetCache({ base, files, storage, fetchAsset, ...extra })

assert.deepEqual(await make().get('unicorn.wasm'), bytes)
assert.equal(calls.length, 1); assert.equal(calls[0].options.cache, 'force-cache')
assert.equal(calls[0].url, base + 'unicorn.wasm?v=' + hash)
assert.deepEqual(await make().get('unicorn.wasm'), bytes)
assert.equal(calls.length, 1, 'new Worker/page can reuse persistent cached bytes without a network fetch')
const response = await make().response('unicorn.wasm')
assert.equal(response.headers.get('content-type'), 'application/wasm')

entries.set(base + 'unicorn.wasm?v=' + hash, new Response('corrupted'))
assert.deepEqual(await make().get('unicorn.wasm'), bytes)
assert.equal(calls.length, 2, 'corrupted cache is discarded and repaired')
const replacement = new TextEncoder().encode('new version'), newHash = createHash('sha256').update(replacement).digest('hex')
const upgraded = make({ files: { 'unicorn.wasm': newHash }, fetchAsset: async url => { calls.push({ url }); return new Response(replacement) } })
assert.deepEqual(await upgraded.get('unicorn.wasm'), replacement)
assert.equal(calls.length, 3); assert.ok(calls[2].url.endsWith(newHash))
const third = new TextEncoder().encode('third version'), thirdHash = createHash('sha256').update(third).digest('hex')
await make({ files: { 'unicorn.wasm': thirdHash }, fetchAsset: async () => new Response(third) }).get('unicorn.wasm')
assert.equal(entries.size, 2, 'retain at most two versions of each public file')
assert.equal(entries.has(base + 'unicorn.wasm?v=' + hash), false)

let network = 0
const noStorage = make({ storage: { open() { throw new Error('storage blocked') } }, fetchAsset: async () => { network++; return new Response(bytes) } })
assert.deepEqual(await noStorage.get('unicorn.wasm'), bytes); assert.equal(network, 1)
await assert.rejects(make({ storage: null, fetchAsset: async () => new Response('wrong release') }).get('unicorn.wasm'), /ASSETS_INVALID/)
await assert.rejects(make({ storage: null, fetchAsset: async () => new Response('', { status: 503 }) }).get('unicorn.wasm'), /ASSETS_UNAVAILABLE/)
await assert.rejects(make().get('../private'), /INVALID_ASSET/)
await assert.rejects(make().get('unlisted.js'), /INVALID_ASSET/)
const aborted = new AbortController(); aborted.abort()
await assert.rejects(make({ signal: aborted.signal }).get('unicorn.wasm'), /CANCELLED/)

let complete, fetches = 0
const single = make({ storage: null, fetchAsset: () => { fetches++; return new Promise(resolve => { complete = resolve }) } })
const a = single.get('unicorn.wasm'), b = single.get('unicorn.wasm')
for (let i = 0; i < 20 && !complete; i++) await Promise.resolve()
complete(new Response(bytes)); await Promise.all([a, b]); assert.equal(fetches, 1)

let active = 0, peak = 0
const preload = make({ storage: null, files: { 'a.js': hash, 'b.wasm': hash, 'c.zip': hash, 'LICENSE.txt': hash },
  fetchAsset: async () => { active++; peak = Math.max(peak, active); await Promise.resolve(); active--; return new Response(bytes) } })
await preload.preload(); assert.ok(peak <= 2, 'preloading uses a bounded download lane')
console.log('PASS persistent versioned asset cache, hash validation/repair, upgrade, blocked storage, failures, abort, singleflight and bounded preloading')
