// Optional ordinary-QR accelerator. No polyfill, global patch or circle-code decoding.
export function createNativeQrReader({ BarcodeDetector = globalThis.BarcodeDetector, within = promise => promise } = {}) {
  let detector, busy = false, closed = false, disabled = typeof BarcodeDetector !== 'function'
  return {
    get available() { return !closed && !disabled },
    async read(pixels, isActive = () => true) {
      if (closed || disabled || busy || !isActive()) return null
      busy = true
      try {
        const operation = (async () => {
          if (!detector) {
            if (typeof BarcodeDetector.getSupportedFormats !== 'function'
                || !(await BarcodeDetector.getSupportedFormats()).includes('qr_code')) {
              disabled = true
              return null
            }
            if (closed || !isActive()) return null
            detector = new BarcodeDetector({ formats: ['qr_code'] })
          }
          if (closed || disabled || !isActive()) return null
          const results = await detector.detect(pixels)
          if (closed || disabled || !isActive()) return null
          const values = new Set((results || []).filter(item => item?.format === 'qr_code'
            && typeof item.rawValue === 'string' && item.rawValue.length > 0 && item.rawValue.length <= 4096)
            .map(item => item.rawValue))
          return values.size > 1 ? { multiple: true } : values.size === 1 ? { text: [...values][0] } : null
        })()
        return await within(operation, 700)
      } catch (_) {
        // Broken/hung implementations fall back for this camera session. Their
        // eventual completion is observed above and can never dispatch a result.
        disabled = true
        return null
      } finally { busy = false }
    },
    close() { closed = true; detector = null }
  }
}
