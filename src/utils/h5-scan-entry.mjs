// Only phone browsers get the new camera entry; desktop keeps its existing UI.
export function isPhoneBrowser(nav = globalThis.navigator) {
  return /iPhone|iPod|Android.*Mobile|Windows Phone/i.test(nav?.userAgent || '')
}

// Check capability only; do not request permission or activate the camera here.
export function canUseBrowserCamera(nav = globalThis.navigator, browser = globalThis.window) {
  return Boolean(browser && browser.isSecureContext !== false &&
    typeof nav?.mediaDevices?.getUserMedia === 'function')
}

export function canShowDeviceScanEntry(nav = globalThis.navigator, browser = globalThis.window) {
  // #ifdef H5
  if (typeof browser !== 'undefined') return isPhoneBrowser(nav) && canUseBrowserCamera(nav, browser)
  // #endif
  return true
}
