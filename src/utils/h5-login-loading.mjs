import { isH5PagePreloaded } from './h5-page-preload-state.mjs'

// 克隆启动页的动画与样式，覆盖层独立于 uni-page，reLaunch 卸载登录页时仍保留。
const template = typeof document !== 'undefined' ? document.getElementById('app-loading')?.cloneNode(true) : null
let pending = null

const routeOf = url => String(url || '').split(/[?#]/)[0].replace(/^\//, '')

function dispose(state, fade = false) {
  clearTimeout(state.timer)
  clearTimeout(state.showTimer)
  state.observer?.disconnect()
  window.removeEventListener('vite:preloadError', state.fail)
  if (pending === state) pending = null
  if (fade && state.shown) {
    state.loader.classList.add('loading-fade-out')
    setTimeout(() => state.loader.remove(), 200)
  } else state.loader.remove()
}

export function beginH5LoginLoading(url) {
  if (pending) dispose(pending)
  if (!template || isH5PagePreloaded(url)) return () => {}
  const loader = template.cloneNode(true)
  loader.id = 'app-route-loading'
  loader.classList.remove('loading-fade-out')
  const status = loader.querySelector('.loading-status')
  const detail = loader.querySelector('.loading-detail')
  const hint = loader.querySelector('.loading-hint')
  const bar = loader.querySelector('.loading-progress-bar')
  const progress = loader.querySelector('[role="progressbar"]')
  const retry = loader.querySelector('.loading-retry')
  const state = { loader, route: routeOf(url), count: 0, bytes: 0, failed: false, shown: false }
  const show = () => {
    if (pending !== state || state.shown) return
    state.shown = true
    document.body.appendChild(loader)
  }
  const isHome = /\/home\/home$/.test(state.route)
  const title = isHome ? '正在进入首页' : '正在打开页面'
  const update = value => {
    bar.style.width = `${value}%`
    progress.setAttribute('aria-valuenow', String(value))
    status.textContent = `${title} · 估算进度 ${value}%`
  }
  update(10)
  detail.textContent = '正在加载页面资源'
  hint.textContent = '登录成功，请稍候'
  retry.hidden = true
  // 使用当前 URL 重载，保留已完成的登录，不重复提交登录请求。
  retry.onclick = () => window.location.reload()
  state.fail = () => {
    state.failed = true
    status.textContent = '页面资源加载失败，请重新加载'
    retry.hidden = false
    show()
  }
  window.addEventListener('vite:preloadError', state.fail)
  state.timer = setTimeout(() => {
    hint.textContent = '网络较慢，仍在加载，请稍候或重新加载'
    retry.hidden = false
  }, 15000)
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      state.observer = new PerformanceObserver(list => {
        const resources = list.getEntries().filter(entry => ['script', 'link', 'css'].includes(entry.initiatorType))
        state.count += resources.length
        state.bytes += resources.reduce((total, entry) => total + (entry.encodedBodySize || 0), 0)
        detail.textContent = `已完成 ${state.count} 个资源 · 已接收 ${(state.bytes / 1024).toFixed(0)} KB`
        if (!state.failed) update(10 + Math.floor(80 * state.count / (state.count + 15)))
      })
      state.observer.observe({ type: 'resource' })
    } catch (_) { /* 旧浏览器保留动画与阶段提示。 */ }
  }
  pending = state
  // 已预加载直接跳过；其它快速跳转在两帧内完成时，也不闪现动画。
  state.showTimer = setTimeout(show, 200)
  return () => { if (pending === state) dispose(state) }
}

// 由全局 onReady 在目标页完成 nextTick 和两帧绘制后调用；导航 success 不代表页面已绘制。
export function finishH5LoginLoading(route) {
  if (!pending || pending.route !== routeOf(route)) return
  pending.loader.querySelector('.loading-progress-bar').style.width = '100%'
  pending.loader.querySelector('[role="progressbar"]').setAttribute('aria-valuenow', '100')
  pending.loader.querySelector('.loading-status').textContent = '加载完成 · 100%'
  dispose(pending, true)
}
