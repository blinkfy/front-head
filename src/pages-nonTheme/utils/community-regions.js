import regions from './shop-regions.js'
import { splitShopAddress } from './shop-address.js'

// Administrative names fill the three picker levels; community codes remain server-owned.
export function buildCommunityRegionTree(serviceTree = []) {
  function merge(base, stored, depth) {
    const known = new Map((Array.isArray(stored) ? stored : []).filter(node => node?.name).map(node => [node.name, node]))
    function build(node, current) {
      return {
        ...current,
        name: node.name,
        code: current?.code || '',
        children: depth < 2
          ? merge(node.children || [], current?.children, depth + 1)
          : (Array.isArray(current?.children) ? current.children.map(child => ({ ...child })) : [])
      }
    }
    const result = base.map(node => {
      const current = known.get(node.name)
      known.delete(node.name)
      return build(node, current)
    })
    // Retain maintained regions absent from this administrative snapshot.
    for (const current of known.values()) result.push(build({ name: current.name }, current))
    return result
  }
  return merge(regions, serviceTree, 0)
}

// Only a unique maintained community can be inferred; never choose the first option.
export function findCommunityByAddress(tree, address, parts = {}) {
  const text = [address, ...Object.values(parts || {}).filter(value => typeof value === 'string')]
    .map(value => String(value || '').replace(/\s+/g, '')).join(' ')
  if (!text.trim()) return null
  const { region } = splitShopAddress(String(address || ''), parts)
  const matches = new Map()
  for (const province of tree || []) {
    if (region[0] && province.name !== region[0]) continue
    for (const city of province.children || []) {
      if (region[1] && city.name !== region[1]) continue
      for (const district of city.children || []) {
        if (region[2] && district.name !== region[2]) continue
        for (const community of district.children || []) {
          const name = String(community.name || '').replace(/\s+/g, '')
          if (community.code && name && text.includes(name)) matches.set(String(community.code), community)
        }
      }
    }
  }
  return matches.size === 1 ? [...matches.values()][0] : null
}
