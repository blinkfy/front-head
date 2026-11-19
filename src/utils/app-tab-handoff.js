const MAX_HOLD_MS = 260
let sequence = 0
let cancelPrevious

// Also serialized into the destination WebView so it can release the cover on its paint frame.
export function releaseAppTabCover(native, id) {
  if (!id) return
  const objects = native?.nativeObj
  try { objects?.View.getViewById(id)?.close() } catch (_) { /* The cover may already be gone. */ }
  try { objects?.Bitmap.getBitmapById(id)?.clear() } catch (_) { /* Same for the bitmap. */ }
}

export function holdAppTabFrame(page) {
  const native = typeof plus !== 'undefined' ? plus : null
  const view = page?.$getAppWebview?.()
  if (!native?.nativeObj?.View || !native.nativeObj.Bitmap || !view?.draw) return null

  cancelPrevious?.()
  const id = `ftx-tab-frame-${Date.now()}-${++sequence}`
  let timer
  let cancelled = false
  const cancel = () => {
    if (cancelled) return
    cancelled = true
    clearTimeout(timer)
    if (cancelPrevious === cancel) cancelPrevious = null
    releaseAppTabCover(native, id)
  }
  cancelPrevious = cancel
  timer = setTimeout(cancel, MAX_HOLD_MS)

  // Start routing in the tap handler. The capture runs in parallel with target setup.
  Promise.resolve().then(() => {
    try {
      if (cancelled || native.webview.getTopWebview()?.id !== view.id) { cancel(); return }
      const cover = new native.nativeObj.View(id, { top: '0px', left: '0px', width: '100%', height: '100%' })
      const bitmap = new native.nativeObj.Bitmap(id)
      cover.interceptTouchEvent(false)
      view.draw(bitmap, () => {
        try {
          if (cancelled || native.webview.getTopWebview()?.id !== view.id || !native.nativeObj.View.getViewById(id)) {
            cancel()
            return
          }
          cover.drawBitmap(bitmap, {}, { top: '0px', left: '0px', width: '100%', height: '100%' })
          cover.show()
        } catch (_) { cancel() }
      }, cancel, { bit: 'RGB565', check: true, checkKeyboard: true })
    } catch (_) { cancel() }
  })
  return { id, cancel }
}
