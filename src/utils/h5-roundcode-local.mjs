// One bounded decoder lane per scanner. No image uploads, CDN or page-thread emulation.
export function createLocalRoundCodeDecoder({ workerUrl, WorkerClass = globalThis.Worker,
  supported = typeof WebAssembly === 'object' && typeof BigInt === 'function',
  setTimer = setTimeout, clearTimer = clearTimeout, onProgress = () => {} } = {}) {
  let worker, pending, sequence = 0, ready = false, closed = false
  function reset() { worker?.terminate(); worker = null; ready = false }
  function settle(result) {
    const request = pending
    if (!request) return
    pending = null; clearTimer(request.timer); request.resolve(result)
  }
  return {
    get available() { return !closed && supported && typeof WorkerClass === 'function' },
    get busy() { return Boolean(pending) },
    async decode(pixels) {
      if (closed) return { error: 'CANCELLED' }
      if (!supported || typeof WorkerClass !== 'function') return { error: 'UNSUPPORTED' }
      if (pending) return { error: 'BUSY' }
      const { data, width, height } = pixels || {}
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 24 || height < 24
          || width > 384 || height > 384 || data?.length !== width * height * 4) return { error: 'INVALID_IMAGE' }
      const gray = new Uint8Array(width * height)
      for (let i = 0; i < gray.length; i++) {
        const offset = i * 4, alpha = data[offset + 3] / 255
        gray[i] = Math.round((data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114) * alpha + 255 * (1 - alpha))
      }
      try {
        if (!worker) {
          worker = new WorkerClass(workerUrl)
          worker.onmessage = ({ data: message }) => {
            if (!pending || message?.id !== pending.id) return
            if (message.phase) { onProgress(message.phase); return }
            const result = message.result
            if (result?.scanType === 'WX_CODE' && typeof result.rawBase64 === 'string'
                && /^[A-Za-z0-9+/]{12,4096}={0,2}$/.test(result.rawBase64)) {
              ready = true; settle({ scanType: 'WX_CODE', rawBase64: result.rawBase64 })
            } else {
              const error = ['NO_CODE', 'WRONG_CODE_TYPE', 'MULTIPLE_CODES', 'INVALID_IMAGE'].includes(result?.error) ? result.error : 'DECODER_UNAVAILABLE'
              if (error === 'DECODER_UNAVAILABLE') reset()
              else ready = true
              settle({ error })
            }
          }
          worker.onerror = () => { reset(); settle({ error: 'DECODER_UNAVAILABLE' }) }
        }
        return await new Promise(resolve => {
          const id = ++sequence
          pending = { id, resolve, timer: setTimer(() => { reset(); settle({ error: 'DECODE_TIMEOUT' }) }, ready ? 30000 : 60000) }
          try { worker.postMessage({ id, width, height, gray }, [gray.buffer]) }
          catch (_) { reset(); settle({ error: 'DECODER_UNAVAILABLE' }) }
        })
      } catch (_) { reset(); return { error: 'DECODER_UNAVAILABLE' } }
    },
    close() { closed = true; reset(); settle({ error: 'CANCELLED' }) }
  }
}
