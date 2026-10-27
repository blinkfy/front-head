// Only phone browsers get the new camera entry; desktop keeps its existing UI.
export function isPhoneBrowser(nav = globalThis.navigator) {
  return /iPhone|iPod|Android.*Mobile|Windows Phone/i.test(nav?.userAgent || '')
}

export function canShowDeviceScanEntry() {
  // #ifdef H5
  if (typeof window !== 'undefined') return isPhoneBrowser()
  // #endif
  return true
}
