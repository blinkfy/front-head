import { PARK_SCENE_ASSETS } from './park-scene-layers.js'

const freeze = value => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(freeze)
  return Object.freeze(value)
}

// Foreground regions repaint only pixels already present in the formal background.
// They do not move or clip the underlying entities; the layer order creates depth.
export const PARK_SCENE_OCCLUSIONS = freeze([
  {
    id: 'north-tree-canopy',
    type: 'tree_canopy',
    clipPath: 'polygon(0 0,100% 0,100% 8.8%,93% 8.2%,85% 9.1%,76% 8.4%,67% 9.2%,58% 8.5%,49% 9%,40% 8.3%,31% 9%,22% 8.4%,13% 9.2%,5% 8.5%,0 9%)'
  },
  {
    id: 'west-tree-canopy',
    type: 'tree_canopy',
    clipPath: 'polygon(0 4%,8.8% 4.8%,7.8% 18%,9.6% 30%,8.3% 43%,10% 56%,8.2% 69%,10.1% 82%,8.8% 100%,0 100%)'
  },
  {
    id: 'east-tree-canopy',
    type: 'tree_canopy',
    clipPath: 'polygon(91% 8%,100% 7%,100% 100%,92.8% 100%,93.4% 87%,91.8% 73%,94% 59%,92% 44%,94% 30%,91.8% 19%)'
  },
  {
    id: 'south-west-tree-canopy',
    type: 'tree_canopy',
    clipPath: 'polygon(0 83%,10% 84%,20% 82%,31% 85%,42% 83%,44% 89%,45% 100%,0 100%)'
  },
  {
    id: 'south-east-tree-canopy',
    type: 'tree_canopy',
    clipPath: 'polygon(53% 90%,58% 85%,69% 83%,80% 85%,90% 82%,100% 84%,100% 100%,52% 100%)'
  },
  {
    id: 'interior-north-right-canopy',
    type: 'tree_canopy',
    clipPath: 'polygon(54.8% 16%,61.8% 15.2%,67.3% 20.2%,68% 27.4%,63.1% 31.8%,56.7% 30.4%,52.8% 24.6%)'
  }
])

export function parkOcclusionStyle(region) {
  return {
    clipPath: region.clipPath,
    WebkitClipPath: region.clipPath,
    backgroundImage: `url(${PARK_SCENE_ASSETS.formalBackground})`
  }
}

export default PARK_SCENE_OCCLUSIONS
