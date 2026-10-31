import { analyzeQrFrame } from './h5-qr-analysis.mjs'

self.onmessage = ({ data: message }) => {
  const { id, pixels, options } = message || {}
  try { self.postMessage({ id, result: analyzeQrFrame(pixels, options) }) }
  catch (_) { self.postMessage({ id, result: { error: 'ANALYSIS_FAILED' } }) }
}
