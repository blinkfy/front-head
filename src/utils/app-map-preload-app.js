import { mapConfig } from '@/api/map-config.js'
import { onAppPageReady } from './app-page-ready.mjs'
import { createAppMapPreloader } from './app-map-preload-core.mjs'
import { startLocalMapServer, stopLocalMapServer } from './app-map-local-server-app.js'

let active = true, ready = false
const preloader = createAppMapPreloader({
  getNetworkType: () => new Promise(resolve => uni.getNetworkType({ success: result => resolve(result.networkType), fail: () => resolve('none') })),
  createWindow: sdkUrl => {
    const base = startLocalMapServer()
    if (!base) return null
    let released = false
    const release = () => { if (!released) { released = true; stopLocalMapServer(base) } }
    try {
      const view = plus.webview.create('_www/static/app-map/preload.html', 'ftx-map-sdk-preload', {
        width: '1px', height: '1px', left: '-2px', top: '-2px', render: 'always', cachemode: 'default'
      }, { sdkPreloadUrl: sdkUrl, frameUrl: base + 'index.html' })
      view.addEventListener('close', release)
      return {
        addEventListener: (type, listener) => view.addEventListener(type, listener),
        close: mode => { try { view.close(mode) } finally { release() } }
      }
    } catch (error) { release(); throw error }
  },
  log: phase => console.info('[app-map-preload] ' + phase)
})

function schedule() {
  if (!active || !ready) return
  const route = getCurrentPages().slice(-1)[0]?.route || ''
  if (/^(pages|pages-dark)\/map\/map$/.test(route)) return
  const key = mapConfig.qqMapKey || mapConfig.qqMapKeyBackup
  if (key) preloader.schedule(`https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(key)}`)
}
onAppPageReady(() => { ready = true; schedule() })
export function setAppMapPreloadActive(value) { active = !!value; if (active) schedule(); else preloader.cancel() }
export function disposeAppMapPreload() { preloader.dispose() }
