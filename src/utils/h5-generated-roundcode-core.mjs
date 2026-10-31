import { createRoundCodeWorker } from './roundcode-worker-core.mjs'
import { isGeneratedCodeUrl, readGeneratedCodeTask } from './roundcode-client-core.mjs'

// Own-image registration only: never claim other users' generation tasks.
export function createWebGeneratedCodeRegistrar({ baseUrl, transport, createDecoder, getIdentity,
  decodeBase64, encodeImage, now = Date.now }) {
  let foreground = false, scannerDepth = 0, tail = Promise.resolve()
  const offered = new Map()
  function observe(entry, listener) {
    if (typeof listener === 'function') {
      entry.listeners.add(listener)
      if (entry.progress) { try { listener(entry.progress.phase, entry.progress.fraction) } catch (_) {} }
    }
    return entry.promise.finally(() => entry.listeners.delete(listener))
  }
  function forget(url) {
    const entry = offered.get(url)
    if (entry?.state !== 'pending') return
    entry.cancelled = true; entry.worker?.stop(); entry.decoder?.close(); offered.delete(url)
  }
  function stopPending() { for (const [url] of offered) forget(url) }
  const client = {
    setActive(active) { foreground = active === true; if (!foreground) stopPending() },
    forget,
    prioritize() {
      const resume = [...offered].filter(([, entry]) => entry.state === 'pending').map(([url, entry]) => [url, entry.isCurrent])
      scannerDepth++; stopPending()
      let released = false
      return () => {
        if (released) return
        released = true; scannerDepth = Math.max(0, scannerDepth - 1)
        if (!scannerDepth && foreground) for (const [url, isCurrent] of resume) void client.registerImage(url, isCurrent)
      }
    },
    async registerImage(url, isCurrent = () => true, onProgress) {
      if (!foreground || scannerDepth || !isCurrent() || !isGeneratedCodeUrl(url, baseUrl)) return
      for (const [key, entry] of offered) if (entry.until <= now() && entry.state !== 'pending') offered.delete(key)
      if (offered.has(url)) {
        const existing = offered.get(url)
        return observe(existing, onProgress)
      }
      if (offered.size >= 16) return { status: 'busy' }
      const entry = { state: 'pending', cancelled: false, until: now() + 30000, isCurrent,
        listeners: new Set(), progress: { phase: 'image' } }
      const identity = getIdentity()
      const active = () => foreground && !scannerDepth && !entry.cancelled && isCurrent() && getIdentity() === identity
      const report = (phase, fraction) => {
        if (!active()) return
        entry.progress = { phase, fraction }
        for (const listener of entry.listeners) { try { listener(phase, fraction) } catch (_) {} }
      }
      offered.set(url, entry)
      entry.promise = (async () => {
      try {
        const response = await transport.image(url)
        if (!active()) return
        const task = readGeneratedCodeTask(response.header, decodeBase64, now)
        // Old backends retain their original display/login behaviour, without
        // downloading decoder resources or attempting the new endpoint.
        if (!task) { entry.state = 'unsupported'; return { status: entry.state } }
        const key = Object.keys(response.header || {}).find(name => name.toLowerCase() === 'content-type')
        const mime = String(response.header[key] || '').split(';')[0].trim()
        const imageBase64 = encodeImage(response.data)
        const perform = async () => {
          if (!active() || task.expiresAt <= now()) return
          report('loading')
          entry.decoder = createDecoder(report)
          if (!entry.decoder.available) { entry.state = 'unsupported'; return }
          entry.worker = createRoundCodeWorker({
            decode: encoded => entry.decoder.decode(encoded, mime, active),
            register: data => { report('registering'); return transport.register(data) }, getIdentity,
            isActive: active, now
          })
          const result = await entry.worker.processTask({ ...task, mime, imageBase64 })
          if (result.status === 'registered') { entry.state = 'registered'; entry.until = task.expiresAt; report('registered') }
          else if (active()) entry.state = result.status
        }
        const pending = tail.then(perform)
        tail = pending.catch(() => {})
        await pending
      } catch (_) { if (active()) entry.state = 'failed' }
      finally {
        entry.worker?.stop(); entry.decoder?.close()
        if (entry.state === 'pending' && offered.get(url) === entry) offered.delete(url)
      }
      return { status: entry.state === 'pending' ? 'inactive' : entry.state }
      })()
      return observe(entry, onProgress)
    }
  }
  return client
}
