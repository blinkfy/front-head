// Keep the native upload path unchanged; image views and plus.io need a file URL.
export function identityPhotoFileUrl(path) {
  return typeof path === 'string' && path.startsWith('/') ? `file://${path}` : path
}
