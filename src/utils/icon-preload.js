import { getManifestIconPath, getManifestIcons } from './manifest-icons.js'

const PRIORITY_IDS = ['home', 'map_location', 'store', 'user_profile', 'back', 'help']
const CONCURRENCY = 2
let scheduled = false

function preloadImage(source) {
  return new Promise(resolve => {
    let image = null
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      clearTimeout(timeout)
      if (image) image.onload = image.onerror = null
      resolve()
    }
    // 单个资源异常不阻塞后面的预热，也不影响页面导航。
    const timeout = setTimeout(finish, 2500)
    try {
      // #ifdef H5
      image = new Image()
      image.decoding = 'async'
      image.onload = () => {
        if (typeof image.decode === 'function') image.decode().then(finish, finish)
        else finish()
      }
      image.onerror = finish
      image.src = source
      // #endif
      // #ifndef H5
      if (typeof uni !== 'undefined' && typeof uni.getImageInfo === 'function') {
        uni.getImageInfo({ src: source, success: finish, fail: finish })
      } else finish()
      // #endif
    } catch (_) {
      finish()
    }
  })
}

export function warmManifestIcons() {
  if (scheduled) return
  scheduled = true
  const manifest = getManifestIcons()
  const ids = [
    ...PRIORITY_IDS,
    ...manifest.filter(icon => icon.category === '01_core').map(icon => icon.id),
    ...manifest.map(icon => icon.id)
  ]
  const sources = [...new Set(ids.map(getManifestIconPath).filter(Boolean))]

  const start = () => {
    let cursor = 0
    const next = () => {
      if (cursor >= sources.length) return
      const source = sources[cursor++]
      preloadImage(source).then(() => {
        // 每次释放一小段时间给页面渲染，不集中读取整包图标。
        if (cursor < sources.length) setTimeout(next, 16)
      })
    }
    for (let i = 0; i < CONCURRENCY; i += 1) next()
  }

  // #ifdef H5
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(start, { timeout: 1200 })
    return
  }
  // #endif
  setTimeout(start, 500)
}
