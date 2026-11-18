// Resolve from the component module, not the API host. Dev modules live in
// src/components; production chunks live in assets, beside static at the root.
export function resolveH5MapAssets(moduleUrl) {
  const assetBase = new URL('../', moduleUrl).href
  return { assetBase, frameUrl: new URL('static/app-map/index.html', assetBase).href }
}
