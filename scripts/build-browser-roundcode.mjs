// Development-only reproducible asset builder. npm H5/MP builds need no compiler,
// Python installation, CDN, Java, or network access for these vendored assets.
import fs from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const inputs = path.join(root, 'experiments/wechat-roundcode/artifacts/browser')
const out = path.join(root, 'vendor/browser-roundcode/v1')
const require = createRequire(import.meta.url)
const wabt = await require(path.join(inputs, 'wabt/package/index.js'))()
const upstream = await fs.readFile(path.join(inputs, 'unicorn/unicorn_aarch64.js'), 'utf8')
const sha = data => createHash('sha256').update(data).digest('hex')
if (sha(upstream) !== 'b497aa99d973f0a5eb27fe7e14e8d32f76298bf6cc6008f9035c4a8d8b91cb37') throw new Error('Expected pinned Unicorn.js 2.1.4 build')
const start = upstream.indexOf("function findWasmBinary(){return binaryDecode('") + 'function findWasmBinary(){return binaryDecode('.length
let end = start + 1
for (; end < upstream.length; end++) { if (upstream[end] === "'") break; if (upstream[end] === '\\') end++ }
const bytes = Uint8Array.from(vm.runInNewContext(upstream.slice(start, end + 1)), c => c.charCodeAt(0))
const module = wabt.readWasm(bytes, { readDebugNames: true })
module.generateNames(); module.applyNames()
let wat = module.toText({ foldExprs: false, inlineExport: false })
// Pinned npm 2.1.4 TCI leaves these three loads as TODO/abort. Implement the
// equivalent C loads by copying its existing ld8u_i32 path, including the exact
// register and instruction-pointer handling, and changing only load signedness.
const functionStart = wat.indexOf('  (func $f3850 ')
const functionEnd = wat.indexOf('  (func ', functionStart + 5)
const tci = wat.slice(functionStart, functionEnd).split('\n')
const body = tci.slice(509, 535).map(line => line.trim()).join('\n')
if (!body.includes('\ni32.load8_u\ni32.store\n') || !body.endsWith('br $L3')) throw new Error('Unicorn TCI layout changed')
for (const [line, load] of [[598, 'i32.load8_s'], [601, 'i32.load16_u'], [604, 'i32.load16_s']]) {
  const marker = wat.indexOf(`i32.const ${line}`, functionStart)
  if (marker < functionStart || marker >= functionEnd) throw new Error('Unicorn TCI case missing')
  const a = wat.lastIndexOf('\n', wat.lastIndexOf('\n', marker) - 1)
  const b = wat.indexOf('br $B0', marker) + 'br $B0'.length
  wat = wat.slice(0, a + 1) + body.replace('\ni32.load8_u\n', `\n${load}\n`) + wat.slice(b)
}
const patched = wabt.parseWat('unicorn-aarch64-tci-fixed.wat', wat)
patched.resolveNames(); patched.validate()
const wasm = patched.toBinary({ write_debug_names: false }).buffer
const a = upstream.indexOf('function findWasmBinary(){')
const b = upstream.indexOf('function getBinarySync', a)
const glue = upstream.slice(0, a) + "function findWasmBinary(){return Module['wasmBinary']}" + upstream.slice(b)
await fs.mkdir(out, { recursive: true })
await fs.writeFile(path.join(out, 'unicorn.js'), glue)
await fs.writeFile(path.join(out, 'unicorn.wasm'), wasm)
await fs.copyFile(path.join(inputs, 'unicorn/LICENSE'), path.join(out, 'UNICORN-LICENSE.txt'))
for (const name of ['pyodide.js', 'pyodide.asm.js', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']) {
  await fs.copyFile(path.join(inputs, 'pyodide/package', name), path.join(out, name))
}
await fs.copyFile(path.join(root, 'scripts/browser-roundcode/PYODIDE-LICENSE.txt'), path.join(out, 'PYODIDE-LICENSE.txt'))
execFileSync('python', [path.join(root, 'scripts/build-browser-roundcode.py'), path.join(out, 'runtime.zip')])
await fs.copyFile(path.join(root, 'scripts/browser-roundcode/bootstrap.py'), path.join(out, 'bootstrap.py'))
await fs.copyFile(path.join(root, 'scripts/browser-roundcode/worker.js'), path.join(out, 'worker.js'))
const cacheSource = await fs.readFile(path.join(root, 'src/utils/h5-roundcode-cache.mjs'), 'utf8')
await fs.writeFile(path.join(out, 'asset-cache.js'), cacheSource.replace('export function ', 'function ') + '\nself.createRoundCodeAssetCache = createRoundCodeAssetCache\n')
const files = {}
for (const name of await fs.readdir(out)) {
  if (name !== 'manifest.json') files[name] = sha(await fs.readFile(path.join(out, name)))
}
await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify({ version: 1, pyodide: '0.27.7', unicorn: '2.1.4',
  upstreamUnicornSha256: sha(upstream), upstreamWasmSha256: sha(bytes), files }, null, 2) + '\n')
console.log('Prepared browser-local circle decoder assets')
