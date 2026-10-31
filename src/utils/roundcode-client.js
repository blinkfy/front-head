import { baseUrl } from '@/api/settings.js'
import { createRoundCodeTransport, readGeneratedCodeTask, isGeneratedCodeUrl } from './roundcode-client-core.mjs'
import { createRoundCodeWorker } from './roundcode-worker-core.mjs'
import { createScanDebugAccess } from './scan-debug.mjs'
// #ifdef APP-PLUS
import { decodeGeneratedImage } from '@/uni_modules/ftx-qbar'
// #endif
// #ifdef H5
import { createBrowserGeneratedCodeClient } from './h5-generated-roundcode.js'
// #endif

const runtime = { request: options => uni.request(options) }
const transport = createRoundCodeTransport({ runtime, baseUrl })
let foreground = false, sharedWorker = null, sharedIdentity = '', recheckTimer = null, scannerDepth = 0, scanRequests = 0, nativeTail = Promise.resolve()
const ownWorkers = new Set(), offered = new Map(), decoding = new Set(), registering = new Set()
const identity = () => { try { return uni.getStorageSync('token') || '' } catch (_) { return '' } }
// #ifdef H5
const browserClient = createBrowserGeneratedCodeClient({ baseUrl, transport, getIdentity: identity })
// #endif
function supportsLocalTasks() {
  try {
    return String(uni.getSystemInfoSync().platform).toLowerCase() === 'android'
      && typeof decodeGeneratedImage === 'function'
  } catch (_) { return false }
}
function decode(encoded) {
  const token = identity()
  // All own-image and shared workers use one native lane. Never stack native handles.
  const pending = nativeTail.then(() => {
    if (!foreground || scannerDepth > 0 || scanRequests > 0 || identity() !== token) return { error: 'BUSY' }
    return new Promise(resolve => {
      let settled = false
      const finish = result => {
        if (settled) return
        settled = true; clearTimeout(timeout); resolve(result)
      }
      const timeout = setTimeout(() => finish({ error: 'DECODE_TIMEOUT' }), 10000)
      // #ifdef APP-PLUS
      try {
        if (typeof decodeGeneratedImage === 'function') { decodeGeneratedImage(encoded, finish); return }
      } catch (_) { /* Old bases remain ordinary-QR capable. */ }
      // #endif
      finish({ error: 'UNAVAILABLE' })
    })
  })
  nativeTail = pending.catch(() => ({ error: 'DECODE_FAILED' }))
  decoding.add(pending)
  void pending.then(() => decoding.delete(pending), () => decoding.delete(pending))
  return pending
}
function worker(active) {
  return createRoundCodeWorker({ decode, register: data => {
    const pending = transport.register(data)
    registering.add(pending)
    void pending.then(() => registering.delete(pending), () => registering.delete(pending))
    return pending
  }, getIdentity: identity, isActive: () => foreground && scannerDepth === 0 && active(),
  claim: () => scanRequests > 0 ? Promise.resolve({ data: { task: null } }) : transport.claim(identity()) })
}
function reconcileSharedWorker() {
  if (!foreground || scannerDepth > 0 || scanRequests > 0 || !supportsLocalTasks()) return
  const token = identity()
  const access = createScanDebugAccess(uni)
  // This is just a local gate. The server independently checks administrator permissions.
  if (!token || !access()) {
    sharedWorker?.stop(); sharedWorker = null; sharedIdentity = ''; return
  }
  if (sharedWorker && sharedIdentity === token) return
  sharedWorker?.stop(); sharedIdentity = token
  sharedWorker = worker(() => access())
  sharedWorker.start()
}
export function setRoundCodeClientActive(active) {
  // #ifdef H5
  browserClient.setActive(active)
  return
  // #endif
  foreground = active === true
  if (recheckTimer !== null) clearInterval(recheckTimer)
  recheckTimer = null
  if (!foreground) {
    sharedWorker?.stop(); sharedWorker = null; sharedIdentity = ''
    for (const item of ownWorkers) item.stop()
    ownWorkers.clear()
    for (const [url, entry] of offered) if (entry.state === 'pending') forgetGeneratedCodeImage(url)
    return
  }
  reconcileSharedWorker()
  // Login/logout can happen without an app onShow event. This check does not call the network.
  recheckTimer = setInterval(reconcileSharedWorker, 15000)
}

// Camera interaction takes priority over optional generated-image decoding.
export async function prioritizeRoundCodeScanner() {
  // #ifdef H5
  return browserClient.prioritize()
  // #endif
  scanRequests++ // Block new decode/claim work, but let an already decoded result finish registering.
  let timeout
  try {
    const finishCurrent = async () => {
      await Promise.allSettled([...decoding])
      await Promise.allSettled([...registering])
    }
    await Promise.race([finishCurrent(), new Promise(resolve => { timeout = setTimeout(resolve, 2500) })])
  } finally { clearTimeout(timeout) }
  scannerDepth++
  sharedWorker?.stop(); sharedWorker = null; sharedIdentity = ''
  for (const item of ownWorkers) item.stop()
  let released = false
  return () => {
    if (released) return
    released = true; scannerDepth = Math.max(0, scannerDepth - 1); scanRequests = Math.max(0, scanRequests - 1)
    reconcileSharedWorker()
  }
}

export function forgetGeneratedCodeImage(url) {
  // #ifdef H5
  browserClient.forget(url)
  return
  // #endif
  const entry = offered.get(url)
  if (entry?.state !== 'pending') return
  entry.cancelled = true; entry.worker?.stop(); offered.delete(url)
}

// A registration code displayed by this client can be decoded even before account login.
export async function registerGeneratedCodeImage(url, isCurrent = () => true, onProgress) {
  // #ifdef H5
  return browserClient.registerImage(url, isCurrent, onProgress)
  // #endif
  if (!foreground || scannerDepth > 0 || scanRequests > 0 || !supportsLocalTasks() || !isCurrent() || !isGeneratedCodeUrl(url, baseUrl)) return
  const stamp = Date.now()
  for (const [key, entry] of offered) if (entry.until <= stamp) offered.delete(key)
  if (offered.has(url) || offered.size >= 16) return
  const entry = { state: 'pending', until: stamp + 30000, cancelled: false }
  offered.set(url, entry)
  const token = identity()
  const active = () => !entry.cancelled && foreground && isCurrent() && identity() === token
  let local
  try {
    const response = await transport.image(url)
    if (!active()) return
    const task = readGeneratedCodeTask(response.header, encoded => {
      const bytes = new Uint8Array(uni.base64ToArrayBuffer(encoded))
      return Array.from(bytes, byte => String.fromCharCode(byte)).join('')
    })
    if (!task) { entry.state = 'unsupported'; entry.until = Date.now() + 30000; return }
    const headers = response.header || {}
    const typeKey = Object.keys(headers).find(key => key.toLowerCase() === 'content-type')
    const mime = String(headers[typeKey] || '').split(';')[0].trim()
    local = worker(active); entry.worker = local; ownWorkers.add(local)
    const imageBase64 = uni.arrayBufferToBase64(response.data)
    let result = await local.processTask({ ...task, mime, imageBase64 })
    if (result.status === 'busy' && active() && scannerDepth === 0 && scanRequests === 0) {
      // A camera which closed during this request may still be releasing its native handle.
      await new Promise(resolve => setTimeout(resolve, 500))
      if (active()) result = await local.processTask({ ...task, mime, imageBase64 })
    }
    if (result.status === 'registered') { entry.state = 'registered'; entry.until = task.expiresAt }
    else if (result.status === 'unsupported') { entry.state = 'unsupported'; entry.until = Date.now() + 30000 }
  } catch (_) { /* Registration is optional and must never interrupt code display/login. */ }
  finally {
    if (local) { local.stop(); ownWorkers.delete(local) }
    if (entry.state === 'pending' && offered.get(url) === entry) offered.delete(url)
  }
}
