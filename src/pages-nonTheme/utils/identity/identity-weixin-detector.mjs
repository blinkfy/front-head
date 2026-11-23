// An empty/no-face frame is normal during camera warm-up. Never infer a single
// face from an unknown multi-face schema.
export function weixinIdentityFaces(result) {
  if (!result || typeof result !== 'object') return null
  if (Array.isArray(result.faceInfo)) return result.faceInfo
  if (result.x === -1 && result.y === -1 && (result.faceInfo == null ||
    (typeof result.faceInfo === 'object' && Object.keys(result.faceInfo).length === 0))) return []
  return null
}

// Error 5 is the legacy detector's per-frame no-face/detection-miss result,
// not a failure to initialize the detector or a failed identity verification.
export function isWeixinIdentityNoFaceError(error) {
  if (String(error?.errCode) === '5') return true
  return error?.errCode == null && /^faceDetect:fail (?:face not detected(?: or detection failed)?|no face(?: detected)?)[.!]?$/i.test(String(error?.errMsg || '').trim())
}

// wx.faceDetect is a process-wide detector. Serialize initialization and teardown so
// an old page's late init callback cannot stop a newer capture page's detector.
export function createWeixinIdentityDetector(api) {
  let owner = null, ready = false, pending = null
  async function stop() {
    await new Promise(resolve => { try { api.stopFaceDetect({ complete: resolve }) } catch { resolve() } })
    ready = false
  }
  return {
    async acquire(token) {
      owner = token
      if (pending) {
        try { await pending } catch { /* A previous page's failed init must not fail the current owner. */ }
      }
      if (owner !== token) return false
      if (!ready) {
        pending = new Promise((resolve, reject) => {
          try { api.initFaceDetect({ success: () => { ready = true; resolve() }, fail: reject }) }
          catch (error) { reject(error) }
        })
        try { await pending } finally { pending = null }
      }
      if (owner !== token) {
        if (owner === null && ready) { pending = stop(); try { await pending } finally { pending = null } }
        return false
      }
      return ready
    },
    release(token) {
      if (owner !== token) return
      owner = null
      if (ready && !pending) {
        pending = stop()
        pending.finally(() => { pending = null })
      }
    }
  }
}
