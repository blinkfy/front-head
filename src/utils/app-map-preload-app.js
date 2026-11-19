import { getAppCurrentPages } from '@/utils/app-tab-context.js'
import { mapConfig } from '@/api/map-config.js'
import { onAppPageReady } from './app-page-ready.mjs'
import { createAppMapPreloader } from './app-map-preload-core.mjs'
import { startLocalMapServer, stopLocalMapServer } from './app-map-local-server-app.js'
import { subscribeRecognitionTask } from './recognition-task.mjs'

let active = true, ready = false, recognizing = false
let idlePage = null
const canWarm = () => active && ready && !recognizing && !!idlePage && getAppCurrentPages().slice(-1)[0] === idlePage
const preloader = createAppMapPreloader({
  canStart: canWarm,
  // The SDK entry currently advertises a 30-second HTTP cache lifetime.
  successTtlMs: 30000,
  getNetworkType: () => new Promise(resolve => uni.getNetworkType({ success: result => resolve(result.networkType), fail: () => resolve('none') })),
  createWindow: (sdkUrl, finish) => {
    const base = startLocalMapServer()
    if (!base) return null
    let released = false
    const release = () => { if (!released) { released = true; stopLocalMapServer(base) } }
    try {
      const view = plus.webview.create('_www/static/app-map/preload.html', 'ftx-map-sdk-preload', {
        width: '1px', height: '1px', left: '-2px', top: '-2px', render: 'always', cachemode: 'default'
      }, { sdkPreloadUrl: sdkUrl, frameUrl: base + 'index.html' })
      view.addEventListener('titleUpdate', () => {
        const title = view.getTitle()
        if (title === 'app-map-sdk-loaded') finish('loaded')
        else if (title === 'app-map-sdk-failed') finish('failed')
      })
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
  if (!canWarm()) return
  const key = mapConfig.qqMapKey || mapConfig.qqMapKeyBackup
  if (key) preloader.schedule(`https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(key)}`)
}
onAppPageReady(() => { ready = true; schedule() })
uni.onNetworkStatusChange?.(result => { if (result.isConnected) schedule() })
const unsubscribeRecognition = subscribeRecognitionTask(task => {
  const pending = task?.status === 'pending'
  if (pending === recognizing) return
  recognizing = pending
  if (recognizing) preloader.cancel()
  else schedule()
})
export function setAppMapPreloadPageIdle(page, idle) {
  if (idle && /^(pages|pages-dark)\/(home|shop|profile)\/\2$/.test(page?.route || '') && getAppCurrentPages().slice(-1)[0] === page) {
    idlePage = page
    schedule()
  } else if (page && idlePage === page) {
    idlePage = null
    preloader.cancel()
  }
}
export function setAppMapPreloadActive(value) { active = !!value; if (active) schedule(); else preloader.cancel() }
export function pauseAppMapPreload() { preloader.cancel() }
export function markAppMapSdkReady() { preloader.complete() }
export function disposeAppMapPreload() { preloader.dispose(); unsubscribeRecognition(); idlePage = null }
