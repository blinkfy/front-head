import manifest from '@/static/manifest.json'

const iconsById = new Map(manifest.map(icon => [icon.id, icon]))

export function getManifestIcons() {
  return manifest
}

export function getManifestIcon(id) {
  return iconsById.get(id) || null
}

export function getManifestIconPath(id) {
  const icon = getManifestIcon(id)
  if (!icon) return ''
  return `/static/${icon.file}`
}
