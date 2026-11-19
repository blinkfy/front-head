import { releaseAppTabCover } from './app-tab-handoff.js'

const ACK_KEY = 'appMapTabMotionReady'
const PREPARE_TIMEOUT = 96
let sequence = 0

// Runs in the page WebView. Vue's onShow can run before the native window is on screen.
function runEntrance(direction, token, ackKey, duration, handoffId, releaseCover) {
  const html = document.documentElement
  const native = window.plus
  const view = native?.webview.currentWebview()
  let frame
  let timer
  const cleanup = () => {
    cancelAnimationFrame(frame)
    clearTimeout(timer)
    html.removeAttribute('data-app-map-tab-entry')
    html.removeAttribute('data-app-tab-entry-playing')
    delete window.__appTabEntranceCleanup
  }
  window.__appTabEntranceCleanup?.()
  window.__appTabEntranceCleanup = cleanup

  if (token) {
    const map = document.querySelector('.app-tab-map-root')
    if (!map || !native?.storage) { cleanup(); return }
    html.setAttribute('data-app-map-tab-entry', direction)
    // Lay out the starting offset while the old tab still covers the map.
    map.getBoundingClientRect()
    native.storage.setItem(ackKey, token)
  }

  const selector = token ? '.app-tab-map-root' : `.tab-page-enter-${direction}`
  const isFrontmost = () => document.visibilityState === 'visible' &&
    (!view || native.webview.getTopWebview()?.id === view.id)
  const play = () => {
    clearTimeout(timer)
    releaseCover?.(native, handoffId)
    html.setAttribute('data-app-tab-entry-playing', '')
    if (token) timer = setTimeout(cleanup, duration + 40)
  }
  const waitForVisibleFrame = () => {
    const root = isFrontmost() && document.querySelector(selector)
    if (!root) { frame = requestAnimationFrame(waitForVisibleFrame); return }
    const cover = handoffId && native?.nativeObj?.View.getViewById(handoffId)
    if (!cover?.isVisible?.()) { play(); return }
    const content = root.querySelector('.tab-page-motion')
    if (!content?.getBoundingClientRect().width) { frame = requestAnimationFrame(waitForVisibleFrame); return }
    // Give the laid-out target one paint opportunity before lifting the outgoing frame.
    frame = requestAnimationFrame(() => { if (isFrontmost()) play(); else cleanup() })
  }
  frame = requestAnimationFrame(waitForVisibleFrame)
  // A dropped navigation must never leave a page at its starting offset.
  timer = setTimeout(() => {
    cancelAnimationFrame(frame)
    if (token) cleanup()
    else play()
  }, 900)
}

export function playAppTabEntrance(page, direction, duration, handoffId = '') {
  const view = page?.$getAppWebview?.()
  if (!view?.evalJS) return false
  view.evalJS(`(${runEntrance.toString()})(${JSON.stringify(direction)}, '', '', ${duration}, ${JSON.stringify(handoffId)}, ${releaseAppTabCover.toString()})`)
  return true
}

export function prepareAppMapTabEntrance(page, direction, duration, done) {
  const view = page?.$getAppWebview?.()
  const storage = typeof plus !== 'undefined' && plus.storage
  if (!view?.evalJS || !storage) { done(); return }

  const token = `${Date.now()}-${++sequence}`
  const deadline = Date.now() + PREPARE_TIMEOUT
  const cancel = () => view.evalJS('window.__appTabEntranceCleanup?.()')
  view.evalJS(`(${runEntrance.toString()})(${JSON.stringify(direction)}, ${JSON.stringify(token)}, ${JSON.stringify(ACK_KEY)}, ${duration})`)
  const check = () => {
    if (storage.getItem(ACK_KEY) === token) {
      storage.removeItem(ACK_KEY)
      done(cancel)
    } else if (Date.now() >= deadline) {
      cancel()
      done()
    } else {
      setTimeout(check, 8)
    }
  }
  check()
}
