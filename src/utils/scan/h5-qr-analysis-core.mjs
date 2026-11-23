// A single transferred frame, never an unbounded camera queue.
export function createQrFrameAnalyzer({ workerUrl, WorkerClass = globalThis.Worker, fallback,
  setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let worker, pending, closed = false, disabled = false, sequence = 0
  function settle(result) {
    if (!pending) return
    const request = pending; pending = null; clearTimer(request.timer); request.resolve(result)
  }
  function fail() { worker?.terminate(); worker = null; disabled = true; settle({ error: 'ANALYSIS_UNAVAILABLE' }) }
  return {
    async analyze(pixels, options = {}) {
      if (closed) return { error: 'CANCELLED' }
      if (pending) return { error: 'BUSY' }
      const { width, height, data } = pixels || {}
      if (!(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && width <= 2400 && height <= 2400)
        || data?.length !== width * height * 4) return { error: 'INVALID_IMAGE' }
      if (!disabled && typeof WorkerClass === 'function') {
        try {
          if (!worker) {
            worker = new WorkerClass(workerUrl, { type: 'module' })
            worker.onmessage = ({ data: message }) => {
              if (pending && message?.id === pending.id) settle(message.result || { error: 'ANALYSIS_FAILED' })
            }
            worker.onerror = fail
          }
          return await new Promise(resolve => {
            const id = ++sequence
            pending = { id, resolve, timer: setTimer(fail, 8000) }
            const input = options.retain ? new Uint8ClampedArray(data) : data
            try { worker.postMessage({ id, pixels: { width, height, data: input }, options }, [input.buffer]) }
            catch (_) { fail() }
          })
        } catch (_) { fail() }
      }
      if (typeof fallback !== 'function') return { error: 'ANALYSIS_UNAVAILABLE' }
      try { const result = await fallback(pixels, options); return closed ? { error: 'CANCELLED' } : result }
      catch (_) { return { error: 'ANALYSIS_FAILED' } }
    },
    close() { closed = true; worker?.terminate(); worker = null; settle({ error: 'CANCELLED' }) }
  }
}
