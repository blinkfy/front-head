import { createRoundCodeWorker } from './roundcode-worker-core.mjs'
import { isGeneratedCodeUrl, readGeneratedCodeTask } from './roundcode-client-core.mjs'

// Own-image registration only: never claim other users' generation tasks.
export function createWebGeneratedCodeRegistrar({ baseUrl, transport, createDecoder, getIdentity,
  decodeBase64, encodeImage, now = Date.now }) {
  let foreground = false, scannerDepth = 0, tail = Promise.resolve()
  const offered = new Map()
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
    async registerImage(url, isCurrent = () => true) {
      if (!foreground || scannerDepth || !isCurrent() || !isGeneratedCodeUrl(url, baseUrl)) return
      for (const [key, entry] of offered) if (entry.until <= now() && entry.state !== 'pending') offered.delete(key)
      if (offered.has(url) || offered.size >= 16) return
      const entry = { state: 'pending', cancelled: false, until: now() + 30000, isCurrent }
      const identity = getIdentity()
      const active = () => foreground && !scannerDepth && !entry.cancelled && isCurrent() && getIdentity() === identity
      offered.set(url, entry)
      try {
        const response = await transport.image(url)
        if (!active()) return
        const task = readGeneratedCodeTask(response.header, decodeBase64, now)
        // Old backends retain their original display/login behaviour, without
        // downloading decoder resources or attempting the new endpoint.
        if (!task) { entry.state = 'unsupported'; return }
        const key = Object.keys(response.header || {}).find(name => name.toLowerCase() === 'content-type')
        const mime = String(response.header[key] || '').split(';')[0].trim()
        const imageBase64 = encodeImage(response.data)
        const perform = async () => {
          if (!active() || task.expiresAt <= now()) return
          entry.decoder = createDecoder()
          if (!entry.decoder.available) { entry.state = 'unsupported'; return }
          entry.worker = createRoundCodeWorker({
            decode: encoded => entry.decoder.decode(encoded, mime, active),
            register: data => transport.register(data), getIdentity,
            isActive: active, now
          })
          const result = await entry.worker.processTask({ ...task, mime, imageBase64 })
          if (result.status === 'registered') { entry.state = 'registered'; entry.until = task.expiresAt }
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
    }
  }
  return client
}
