import { createAppTencentMap } from './renderer.mjs'

const channel = 'app-tencent-map'
const token = location.hash.slice(1)
const container = document.getElementById('map')
const errorElement = document.getElementById('map-error')
let parentOrigin
let latestPacket = null
let sdkPromise = null
let cancelSdkLoad = null
let renderer = null
let disposed = false
let initializationStarted = false
let lifecycleVersion = 0

function showError(message) {
  errorElement.textContent = message
  errorElement.style.display = 'block'
  container.style.display = 'none'
}

function send(type, detail = {}) {
  if (disposed || !token) return
  const targetOrigin = parentOrigin === undefined || parentOrigin === 'null' ? '*' : parentOrigin
  parent.postMessage({ channel, token, event: { type, detail } }, targetOrigin)
}

function reportError(code, stage, error) {
  const message = String(error?.message || '').replace(/https?:\/\/[^\s]+/g, '[url]').slice(0, 160)
  send('error', { code, stage, message, satellite: !!latestPacket?.satellite })
}

function loadSdk(key) {
  if (window.TMap?.Map) return Promise.resolve(window.TMap)
  if (sdkPromise) return sdkPromise

  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    let settled = false
    const timeout = setTimeout(() => finish(false), 15000)

    function finish(success) {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      cancelSdkLoad = null
      script.onload = null
      script.onerror = null
      if (success && window.TMap?.Map) resolve(window.TMap)
      else {
        script.remove()
        sdkPromise = null
        reject(new Error('sdk_load_failed'))
      }
    }

    cancelSdkLoad = () => finish(false)
    script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(key)}`
    script.onload = () => finish(true)
    script.onerror = () => finish(false)
    document.head.appendChild(script)
  })
  return sdkPromise
}

function applyLatestPacket() {
  if (disposed || !renderer || !latestPacket) return
  try {
    renderer.update(latestPacket)
  } catch (error) {
    reportError('map_render_failed', 'render', error)
  }
}

async function initialize() {
  if (disposed || initializationStarted || !latestPacket) return
  initializationStarted = true
  const version = lifecycleVersion
  if (!['http:', 'https:'].includes(location.protocol)) {
    showError('地图页面仅支持通过 HTTP 或 HTTPS 加载。')
    reportError('sdk_load_failed', 'protocol')
    return
  }

  send('phase', { phase: 'sdk_loading', satellite: !!latestPacket?.satellite })
  let sdk
  try {
    sdk = await loadSdk(latestPacket.key)
  } catch (_) {
    if (!disposed && version === lifecycleVersion) reportError('sdk_load_failed', 'load')
    return
  }
  if (disposed || version !== lifecycleVersion) return
  send('phase', { phase: 'sdk_ready', satellite: !!latestPacket?.satellite })

  try {
    renderer = createAppTencentMap({
      sdk,
      container,
      assetUrl: value => {
        if (typeof value !== 'string') return value
        if (/^(?:file:|_www(?:\/|$))/i.test(value)) return '/static/normal-marker.png'
        if (value.startsWith('/static/')) return `${latestPacket.assetBase}${value.slice(1)}`
        return value
      },
      emit: event => {
        send(event?.type, event?.detail || {})
      }
    })
    applyLatestPacket()
  } catch (error) {
    if (!disposed) reportError('map_render_failed', 'render', error)
  }
}

function onMessage(event) {
  const message = event.data
  if (disposed || event.source !== parent || !message || message.channel !== channel || message.token !== token) return
  if (parentOrigin === undefined) parentOrigin = event.origin
  else if (event.origin !== parentOrigin) return
  if (!message.packet || typeof message.packet !== 'object' || Array.isArray(message.packet)) return

  latestPacket = { ...latestPacket, ...message.packet }
  if (renderer) applyLatestPacket()
  else initialize()
}

function onPageHide() {
  if (disposed) return
  disposed = true
  lifecycleVersion++
  window.removeEventListener('message', onMessage)
  cancelSdkLoad?.()
  cancelSdkLoad = null
  renderer?.destroy()
  renderer = null
  latestPacket = null
  sdkPromise = null
  initializationStarted = false
}

function onPageShow() {
  if (!disposed || document.hidden) return
  disposed = false
  errorElement.style.display = 'none'
  container.style.display = ''
  window.addEventListener('message', onMessage)
  send('frame-ready', {})
}

function onVisibilityChange() {
  // Native overlays can briefly hide the WebView without leaving the map page.
  // Keep the current renderer; pagehide and the owner page control disposal.
  if (!document.hidden) onPageShow()
}

window.addEventListener('message', onMessage)
window.addEventListener('pagehide', onPageHide)
window.addEventListener('pageshow', onPageShow)
document.addEventListener('visibilitychange', onVisibilityChange)

if (!['http:', 'https:'].includes(location.protocol)) {
  showError('地图页面仅支持通过 HTTP 或 HTTPS 加载。')
}
send('frame-ready', {})
