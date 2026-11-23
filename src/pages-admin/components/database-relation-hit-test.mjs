// Convert graph-space centers to screen coordinates before hit testing touch input.
export function relationNodeAtPoint(nodes, point, rect, width, height, pan, scale) {
  const x = point?.clientX - rect.left, y = point?.clientY - rect.top
  if (!Number.isFinite(x) || !Number.isFinite(y)) return ''
  let closest = '', closestDistance = Infinity
  for (const node of nodes) {
    const cx = width / 2 + pan.x + node.x * scale
    const cy = height / 2 + pan.y + node.y * scale
    const distance = Math.hypot(x - cx, y - cy)
    if (distance <= Math.max(22, node.radius * scale) && distance < closestDistance) {
      closest = node.name
      closestDistance = distance
    }
  }
  return closest
}
