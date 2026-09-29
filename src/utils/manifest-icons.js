import manifest from '@/static/manifest.json'

const iconsById = new Map(manifest.map(icon => [icon.id, icon]))

export function getManifestIcon(id) {
  return iconsById.get(id) || null
}

export function getManifestIconPath(id) {
  const icon = getManifestIcon(id)
  return icon ? `/static/${icon.file}` : ''
}
