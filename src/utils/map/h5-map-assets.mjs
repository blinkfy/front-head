// Vite serves this source from src/utils/map and emits production chunks into assets.
export function resolveH5MapAssets(moduleUrl = import.meta.url, dev = import.meta.env?.DEV === true) {
  const assetBase = new URL(dev ? '../../' : '../', moduleUrl).href
  return { assetBase, frameUrl: new URL('static/app-map/index.html', assetBase).href }
}
