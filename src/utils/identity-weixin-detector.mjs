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
      if (pending) await pending
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
