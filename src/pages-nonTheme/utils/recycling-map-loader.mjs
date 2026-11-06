let leafletPromise
export function loadRecyclingLeaflet() {
  if (window.L) return Promise.resolve(window.L)
  if (leafletPromise) return leafletPromise
  leafletPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    const existingStyle = document.querySelector('link[href*="leaflet.css"]')
    const style = existingStyle || document.createElement('link')
    let scriptReady = false, styleReady = Boolean(existingStyle?.sheet), settled = false
    const fail = () => {
      if (settled) return
      settled = true; clearTimeout(timer); script.remove()
      if (!existingStyle) style.remove()
      reject(new Error('地图加载失败，请检查网络后重试'))
    }
    const finish = () => {
      if (!settled && scriptReady && styleReady) { settled = true; clearTimeout(timer); resolve(window.L) }
    }
    const timer = setTimeout(fail, 12000)
    if (!existingStyle) { style.rel = 'stylesheet'; style.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css' }
    style.addEventListener('load', () => { styleReady = true; finish() }, { once: true })
    style.addEventListener('error', fail, { once: true })
    if (!existingStyle) document.head.appendChild(style)
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => { if (!window.L) return fail(); scriptReady = true; finish() }
    script.onerror = fail
    document.head.appendChild(script)
  }).catch(error => { leafletPromise = null; throw error })
  return leafletPromise
}
