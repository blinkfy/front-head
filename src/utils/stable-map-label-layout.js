const CANDIDATES = Object.freeze([
  [0, 0], [0, -18], [0, 18], [26, 0], [-26, 0],
  [18, -18], [-18, -18], [18, 18], [-18, 18],
  [0, -36], [0, 36], [42, 0], [-42, 0], [36, -28], [-36, -28], [36, 28], [-36, 28],
  [0, -58], [0, 58], [64, 0], [-64, 0], [58, -36], [-58, -36], [58, 36], [-58, 36],
  [0, -82], [0, 82], [86, 0], [-86, 0]
])

function overlapArea(left, right, padding = 3) {
  const width = Math.max(0, Math.min(left.right + padding, right.right + padding) - Math.max(left.left - padding, right.left - padding))
  const height = Math.max(0, Math.min(left.bottom + padding, right.bottom + padding) - Math.max(left.top - padding, right.top - padding))
  return width * height
}

function shiftedRect(rect, dx, dy) {
  return { left: rect.left + dx, right: rect.right + dx, top: rect.top + dy, bottom: rect.bottom + dy }
}

function applyPlacement(element, dx, dy, visible) {
  element.style.setProperty('--avoid-x', `${dx}px`)
  element.style.setProperty('--avoid-y', `${dy}px`)
  element.style.setProperty('--label-visible', visible ? '1' : '0')
  element.style.setProperty('--label-visibility', visible ? 'visible' : 'hidden')
  const distance = Math.hypot(dx, dy)
  element.style.setProperty('--leader-display', visible && distance >= 12 ? 'block' : 'none')
  element.style.setProperty('--leader-length', `${Math.max(0, distance - 5)}px`)
  element.style.setProperty('--leader-angle', `${Math.atan2(-dy, -dx) * 180 / Math.PI}deg`)
}

export function layoutStableMapLabels(root) {
  if (!root?.querySelectorAll) return { placed: 0, hidden: 0 }
  const bounds = root.getBoundingClientRect()
  const labels = [...root.querySelectorAll('[data-map-label="true"]')]
  labels.forEach(label => applyPlacement(label, 0, 0, label.dataset.labelSuppressed !== 'true'))
  const rows = labels.filter(element => element.dataset.labelSuppressed !== 'true').map(element => ({
    element,
    id: element.dataset.labelId || '',
    priority: Number(element.dataset.labelPriority) || 0,
    base: element.getBoundingClientRect()
  })).sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
  const placed = []
  let hidden = 0
  rows.forEach(row => {
    let best = null
    CANDIDATES.forEach(([dx, dy], index) => {
      const rect = shiftedRect(row.base, dx, dy)
      const outside = Math.max(0, bounds.left - rect.left) + Math.max(0, rect.right - bounds.right) + Math.max(0, bounds.top - rect.top) + Math.max(0, rect.bottom - bounds.bottom)
      const collision = placed.reduce((sum, item) => sum + overlapArea(rect, item.rect), 0)
      const score = collision * 20 + outside * 50 + index
      if (!best || score < best.score) best = { dx, dy, rect, score, collision, outside }
    })
    const mustShow = row.priority >= 70
    const visible = mustShow || (best && best.collision === 0 && best.outside === 0)
    if (!visible) hidden += 1
    applyPlacement(row.element, best?.dx || 0, best?.dy || 0, visible)
    if (visible && best) placed.push({ rect: best.rect, priority: row.priority })
  })
  return { placed: placed.length, hidden }
}
