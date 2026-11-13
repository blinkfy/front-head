// Save before changing; a late callback after close must restore, never brighten a departed page.
export function createIdentityBrightness(api) {
  let closed = false, started = false, original = null, changed = false
  const restore = () => {
    if (original === null || !changed) return
    api.setScreenBrightness({ value: original, fail() {} })
  }
  return {
    start() {
      if (closed || started) return
      started = true
      api.getScreenBrightness({ success(res) {
        if (closed || typeof res.value !== 'number' || res.value < 0 || res.value > 1) return
        original = res.value; changed = true
        api.setScreenBrightness({ value: 1, success() { if (closed) restore() }, fail() { if (closed) restore() } })
      }, fail() {} })
    },
    close() { closed = true; restore() }
  }
}
