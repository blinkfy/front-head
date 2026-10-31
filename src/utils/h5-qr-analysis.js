import { createQrFrameAnalyzer } from './h5-qr-analysis-core.mjs'

export function createBrowserQrAnalyzer() {
  const BrowserWorker = typeof Worker === 'function' ? class {
    constructor() { return new Worker(new URL('./h5-qr-analysis-worker.js', import.meta.url), { type: 'module' }) }
  } : null
  return createQrFrameAnalyzer({ WorkerClass: BrowserWorker,
    fallback: async (pixels, options) => {
      const { analyzeQrFrame } = await import('./h5-qr-analysis.mjs')
      // Yield before the compatibility path when a browser blocks Workers.
      await new Promise(resolve => setTimeout(resolve, 0))
      return analyzeQrFrame(pixels, options)
    } })
}
