import { createLocalRoundCodeDecoder } from './h5-roundcode-local.mjs'
import manifest from '../../vendor/browser-roundcode/v1/manifest.json'
import { createRoundCodeAssetCache } from './h5-roundcode-cache.mjs'

const supported = () => typeof WebAssembly === 'object' && typeof BigInt === 'function'
  && typeof Worker === 'function' && typeof AbortController === 'function' && Boolean(globalThis.crypto?.subtle)
const assetBase = () => new URL(`${import.meta.env.BASE_URL}h5-roundcode/v1/`, window.location.href).href

export function preloadBrowserRoundCodeAssets() {
  if (!supported()) return { promise: Promise.resolve(false), cancel() {} }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60000)
  const store = createRoundCodeAssetCache({ base: assetBase(), files: manifest.files, signal: controller.signal })
  return { promise: store.preload().then(() => true, () => false).finally(() => clearTimeout(timer)),
    cancel() { clearTimeout(timer); controller.abort() } }
}

export function createBrowserRoundCodeDecoder(onProgress) {
  return createLocalRoundCodeDecoder({
    supported: supported(),
    workerUrl: assetBase() + `worker.js?v=${manifest.files['worker.js']}`,
    onProgress
  })
}
