// Group the columns of a composite constraint, but keep distinct constraints
// between the same two tables individually selectable.
export const domains = [
  { label: '账户身份', color: '#147d72', dark: '#58d5bf', match: /^(User$|UserIdentity|UserLogin|UserMfa|Mfa|Biometric|PlatformLogin|Identity)/ },
  { label: '社区通信', color: '#7261ba', dark: '#b5a0ff', match: /^(Community|UserCommunity|UserNotification|Chat|Friend|Group|Message|Post|Comment)/ },
  { label: '设备回收', color: '#247bad', dark: '#74c4f5', match: /^(UserDevice|Device|Bin|Waste|Maintenance|Operation|Sorting|ServicePoint|Collector)/ },
  { label: 'AI 识别', color: '#b55179', dark: '#fa9fc4', match: /^(Ai|Rag|Algorithm|History|Recognition)/i },
  { label: '其他业务', color: '#ad7427', dark: '#edbb76' }
]

export function domainIndex(name) {
  return domains.findIndex(domain => !domain.match || domain.match.test(name))
}

export function groupRelations(relations) {
  const constraints = new Map(), lanes = new Map()
  for (const field of relations) {
    const pair = JSON.stringify([field.source, field.target])
    const key = JSON.stringify([field.source, field.target, field.constraintName || [field.sourceColumn, field.targetColumn], !!field.business])
    if (!constraints.has(key)) {
      const edge = { key, source: field.source, target: field.target, fields: [], business: !!field.business }
      constraints.set(key, edge)
      if (!lanes.has(pair)) lanes.set(pair, [])
      lanes.get(pair).push(edge)
    }
    constraints.get(key).fields.push(field)
  }
  for (const siblings of lanes.values()) siblings.forEach((edge, index) => {
    edge.lane = index; edge.lanes = siblings.length
    const field = edge.fields[0]
    const roles = roleNames[edge.source]
    const label = field.sourceLabel && field.sourceLabel !== field.sourceColumn ? field.sourceLabel.replace(/\s*(用户\s*)?ID$/i, '') : ''
    const attribute = field.sourceColumn.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    edge.role = edge.fields.length === 1 ? roles?.[attribute] || label || field.sourceColumn : '复合外键'
  })
  return [...constraints.values()]
}

const roleNames = {
  BookingOrder: { userId: '下单人', collectorId: '回收员' },
  BookingChatBinding: { customerUserId: '下单人', collectorUserId: '回收员' },
  Message: { senderId: '发送者', receiverId: '接收者' },
  FriendRequest: { fromUserId: '申请人', toUserId: '接收人' },
  Chat: { userId: '会话用户', otherId: '对方用户' }
}
export const businessViews = [
  { label: '预约回收', root: 'BookingOrder', names: ['BookingOrder', 'User', 'BookingChatBinding', 'BookingOrderEvent', 'RecyclingDelivery', 'RecyclingDeviceDelivery', 'RecyclingPhoto', 'RecyclingServiceArea'] },
  { label: '设备投递', root: 'DeviceDepositEvent', names: ['DeviceDepositEvent', 'Device', 'User', 'UserDevice', 'Bin', 'ServicePoint'] },
  { label: '社区互动', root: 'Post', names: ['Post', 'User', 'Comment', 'PostLike', 'Community', 'UserCommunity', 'CommunityNotification'] }
]

export function graphBounds(nodes) {
  const xs = nodes.map(node => node.x), ys = nodes.map(node => node.y)
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) }
}

// Reserve less horizontal space on narrow screens while retaining the desktop margins.
export function graphPadding(width, height) {
  return { x: Math.min(112, Math.max(48, width * .15)), y: Math.min(96, Math.max(64, height * .15)) }
}

// Keep node circles apart in graph coordinates; the canvas can then zoom the
// complete layout to fit instead of squeezing nodes into the available height.
function separateNodes(nodes, minimum = 38) {
  for (let pass = 0; pass < 80; pass++) {
    let largest = 0
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j]
      let dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy)
      if (distance >= minimum) continue
      if (distance < .001) { const angle = (i * 17 + j * 31) * 2.4; dx = Math.cos(angle); dy = Math.sin(angle); distance = 1 }
      const overlap = minimum - distance, shift = overlap / (2 * distance)
      a.x -= dx * shift; a.y -= dy * shift; b.x += dx * shift; b.y += dy * shift
      largest = Math.max(largest, overlap)
    }
    if (largest < .05) break
  }
  return nodes
}

// Expand the shorter axis to follow the viewport without compressing nodes or
// changing their ordering. Very small graphs keep their natural shape.
function matchViewportAspect(nodes, width, height) {
  if (nodes.length < 4) return nodes
  const b = graphBounds(nodes), spanX = b.right - b.left, spanY = b.bottom - b.top
  if (spanX < 1 || spanY < 1) return nodes
  const padding = graphPadding(width, height)
  const target = Math.max(36, width - padding.x) / Math.max(36, height - padding.y)
  const ratio = spanX / spanY
  const sx = Math.min(3, Math.max(1, target / ratio))
  const sy = Math.min(3, Math.max(1, ratio / target))
  const cx = (b.left + b.right) / 2, cy = (b.top + b.bottom) / 2
  for (const node of nodes) { node.x = (node.x - cx) * sx; node.y = (node.y - cy) * sy }
  return nodes
}

// Improve the initial placement without moving the anchor or changing the
// occupied area. Swapping positions preserves the existing node clearance.
function reduceCrossings(nodes, pairs, anchor, groupByDomain = false) {
  const byName = new Map(nodes.map(node => [node.name, node]))
  const seen = new Set(), links = []
  for (const edge of pairs) {
    const a = byName.get(edge.source), b = byName.get(edge.target)
    if (!a || !b || a === b) continue
    const key = [edge.source, edge.target].sort().join('\0')
    if (!seen.has(key)) { seen.add(key); links.push([a, b]) }
  }
  if (links.length < 2) return nodes
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  // Only pairs involving an edge attached to either swapped node can change.
  // Counting those pairs produces the same decision as rescoring the whole graph.
  function score(a, b) {
    let crossings = 0
    const affected = new Set()
    for (let i = 0; i < links.length; i++) if (links[i].includes(a) || links[i].includes(b)) affected.add(i)
    for (const i of affected) for (let j = 0; j < links.length; j++) {
      if (i === j || (affected.has(j) && j < i)) continue
      const [p, q] = links[i], [r, s] = links[j]
      if (p === r || p === s || q === r || q === s) continue
      if (cross(p, q, r) * cross(p, q, s) < 0 && cross(r, s, p) * cross(r, s, q) < 0) crossings++
    }
    return crossings
  }
  const movable = nodes.filter(node => node.name !== anchor && links.some(link => link.includes(node)))
  let attempts = 0
  for (let i = 0; i < movable.length && attempts < 300; i++) for (let j = i + 1; j < movable.length && attempts < 300; j++) {
    const a = movable[i], b = movable[j]
    if (groupByDomain && domainIndex(a.name) !== domainIndex(b.name)) continue
    const before = score(a, b)
    ;[a.x, b.x] = [b.x, a.x]; [a.y, b.y] = [b.y, a.y]
    const next = score(a, b); attempts++
    if (next >= before) { [a.x, b.x] = [b.x, a.x]; [a.y, b.y] = [b.y, a.y] }
  }
  return nodes
}

// Push a node out of the middle of an unrelated link. Ignore link endpoints:
// converging lines at a hub are unavoidable and should not push it away.
export function repelNodesFromLinks(nodes, springs) {
  for (const node of nodes) for (const [a, b] of springs) {
    if (!a || !b || node === a || node === b) continue
    const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy
    if (length2 < 1) continue
    const t = ((node.x - a.x) * dx + (node.y - a.y) * dy) / length2
    if (t < .15 || t > .85) continue
    let nx = node.x - (a.x + t * dx), ny = node.y - (a.y + t * dy)
    let distance = Math.hypot(nx, ny)
    if (distance >= 30) continue
    if (distance < .01) { const length = Math.sqrt(length2); nx = -dy / length; ny = dx / length; distance = 1 }
    const force = Math.min(4, (30 - distance) * .13) / distance
    node.dx += nx * force; node.dy += ny * force
  }
}

// The force pass runs before crossing-reduction swaps. Afterwards, move only
// nodes trapped in a fan of unrelated links, including near a shared hub.
export function clearDenseLinkAreas(nodes, pairs, anchor) {
  const byName = new Map(nodes.map(node => [node.name, node])), seen = new Set(), links = []
  for (const edge of pairs) {
    const a = byName.get(edge.source), b = byName.get(edge.target)
    if (!a || !b || a === b) continue
    const key = [a.name, b.name].sort().join('\0')
    if (!seen.has(key)) { seen.add(key); links.push([a, b]) }
  }
  if (links.length < 2) return nodes
  const degree = node => links.reduce((sum, [a, b]) => sum + Number(node === a || node === b), 0)
  const hub = byName.get(anchor) || nodes.reduce((best, node) => !best || degree(node) > degree(best) ? node : best, null)
  function density(node) {
    let score = 0, count = 0
    for (const [a, b] of links) {
      if (node === a || node === b) continue
      const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy
      if (!length2) continue
      const t = ((node.x - a.x) * dx + (node.y - a.y) * dy) / length2
      if (t <= .01 || t >= .99) continue
      const distance = Math.hypot(node.x - a.x - t * dx, node.y - a.y - t * dy)
      if (distance < 30) { score += (30 - distance) ** 2; count++ }
    }
    return { score, count }
  }
  const candidates = nodes.filter(node => node !== hub && degree(node) > 0).map(node => ({ node, ...density(node) }))
    .filter(item => item.count >= 2).sort((a, b) => b.score - a.score).slice(0, 12)
  const bounds = graphBounds(nodes)
  const directions = Array.from({ length: 12 }, (_, i) => [Math.cos(i * Math.PI / 6), Math.sin(i * Math.PI / 6)])
  for (const { node } of candidates) {
    const origin = { x: node.x, y: node.y }, initial = density(node).score
    const attached = links.filter(([a, b]) => a === node || b === node)
    if (attached.length > 12) continue
    const others = links.filter(([a, b]) => a !== node && b !== node)
    const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
    const intersections = () => attached.reduce((count, [a, b]) => count + others.reduce((total, [c, d]) => {
      if (a === c || a === d || b === c || b === d) return total
      return total + Number(cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0)
    }, 0), 0)
    const initialIntersections = intersections()
    let best = initial, bestPosition = origin
    for (const step of [12, 24, 36]) for (const [dx, dy] of directions) {
      node.x = origin.x + dx * step; node.y = origin.y + dy * step
      if (node.x < bounds.left - 4 || node.x > bounds.right + 4 || node.y < bounds.top - 4 || node.y > bounds.bottom + 4 ||
          nodes.some(other => other !== node && Math.hypot(other.x - node.x, other.y - node.y) < 38)) continue
      const score = density(node).score
      if (score < best - 1 && intersections() <= initialIntersections) { best = score; bestPosition = { x: node.x, y: node.y } }
    }
    node.x = bestPosition.x; node.y = bestPosition.y
  }
  return nodes
}

// A single link may take a large detour around an unrelated node even when
// shifting one endpoint would open a shorter corridor. Test small endpoint
// moves after the initial placement, without moving the hub or rerouting the
// entire graph for every candidate.
export function improveLinkClearance(nodes, pairs, anchor) {
  if (nodes.length < 3) return nodes
  const byName = new Map(nodes.map(node => [node.name, node])), links = [], seen = new Set()
  for (const edge of pairs) {
    const a = byName.get(edge.source), b = byName.get(edge.target)
    if (!a || !b || a === b) continue
    const key = [a.name, b.name].sort().join('\0')
    if (!seen.has(key)) { seen.add(key); links.push([a, b]) }
  }
  const degree = node => links.reduce((n, [a, b]) => n + Number(node === a || node === b), 0)
  const hub = byName.get(anchor) || nodes.reduce((best, node) => !best || degree(node) > degree(best) ? node : best, null)
  function obstruction(a, b, node) {
    if (node === a || node === b) return 0
    const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy
    if (length2 < 1) return 0
    const t = ((node.x - a.x) * dx + (node.y - a.y) * dy) / length2
    if (t <= .08 || t >= .92) return 0
    const distance = Math.hypot(node.x - a.x - dx * t, node.y - a.y - dy * t)
    return Math.max(0, 32 - distance) ** 2
  }
  const penalty = ([a, b]) => nodes.reduce((sum, node) => sum + obstruction(a, b, node), 0)
  const blocked = links.map(link => ({ link, score: penalty(link) })).filter(item => item.score > 25)
    .sort((a, b) => b.score - a.score).slice(0, 10)
  const candidates = [...new Set(blocked.flatMap(item => item.link))].filter(node => node !== hub && degree(node) <= 12)
  const bounds = graphBounds(nodes), directions = Array.from({ length: 12 }, (_, i) => [Math.cos(i * Math.PI / 6), Math.sin(i * Math.PI / 6)])
  for (const node of candidates.slice(0, 12)) {
    const attached = links.filter(link => link.includes(node)), others = links.filter(link => !link.includes(node))
    const score = () => attached.reduce((sum, link) => sum + penalty(link), 0) +
      others.reduce((sum, [a, b]) => sum + obstruction(a, b, node), 0)
    const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
    const crossings = () => attached.reduce((sum, [a, b]) => sum + others.reduce((n, [c, d]) => {
      if (a === c || a === d || b === c || b === d) return n
      return n + Number(cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0)
    }, 0), 0)
    const origin = { x: node.x, y: node.y }, initialCrossings = crossings()
    let best = score(), bestPosition = origin
    if (best <= 25) continue
    for (const step of [18, 36, 48]) for (const [dx, dy] of directions) {
      node.x = origin.x + dx * step; node.y = origin.y + dy * step
      if (node.x < bounds.left - 4 || node.x > bounds.right + 4 || node.y < bounds.top - 4 || node.y > bounds.bottom + 4 ||
          nodes.some(other => other !== node && Math.hypot(other.x - node.x, other.y - node.y) < 38)) continue
      const next = score()
      if (next < best - 25 && crossings() <= initialCrossings) { best = next; bestPosition = { x: node.x, y: node.y } }
    }
    node.x = bestPosition.x; node.y = bestPosition.y
  }
  return nodes
}

// Refine crowded placements without moving the fixed hub or enlarging the
// graph. Route once, then retain those bends while testing short local moves;
// this keeps the per-candidate work bounded and follows the displayed curves.
export function improveCurveCrossings(nodes, pairs, anchor, curved = false) {
  if (nodes.length < 4 || pairs.length < 2) return nodes
  const byName = new Map(nodes.map(node => [node.name, node]))
  const renderNodes = nodes.map(node => ({ ...node, radius: 14 }))
  const lines = relationStrokes(renderNodes, pairs, curved).filter(line => !line.loop)
  const unique = new Map()
  for (const line of lines) {
    const key = [line.source, line.target].sort().join('\0')
    if (!unique.has(key)) unique.set(key, line)
  }
  const edges = [...unique.values()].map(line => ({
    line, a: byName.get(line.source), b: byName.get(line.target), points: []
  })).filter(edge => edge.a && edge.b)
  if (edges.length < 2) return nodes
  const reverseKeys = new Set(pairs.map(edge => JSON.stringify([edge.source, edge.target])))
  function sample(edge) {
    const { a, b, line } = edge, dx = b.x - a.x, dy = b.y - a.y
    const distance = Math.hypot(dx, dy)
    if (distance < 37) return []
    const ux = dx / distance, uy = dy / distance
    const reverse = reverseKeys.has(JSON.stringify([b.name, a.name]))
    const lane = reverse ? (line.lane || 0) + .5 : (line.lane || 0) - ((line.lanes || 1) - 1) / 2
    const offset = lane * (curved ? 4 : 10), length = distance - 35
    const x = a.x + ux * 17 - uy * offset, y = a.y + uy * 17 + ux * offset
    return Array.from({ length: 5 }, (_, i) => {
      const t = i / 4, normal = 2 * t * (1 - t) * (line.bend || 0)
      return { x: x + ux * length * t - uy * normal, y: y + uy * length * t + ux * normal }
    })
  }
  for (const edge of edges) edge.points = sample(edge)
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  function intersects(one, two) {
    if (one.a === two.a || one.a === two.b || one.b === two.a || one.b === two.b) return false
    for (let i = 1; i < one.points.length; i++) for (let j = 1; j < two.points.length; j++) {
      const a = one.points[i - 1], b = one.points[i], c = two.points[j - 1], d = two.points[j]
      if (Math.max(a.x, b.x) < Math.min(c.x, d.x) || Math.max(c.x, d.x) < Math.min(a.x, b.x) ||
          Math.max(a.y, b.y) < Math.min(c.y, d.y) || Math.max(c.y, d.y) < Math.min(a.y, b.y)) continue
      const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b)
      if (abC * abD <= 0 && cdA * cdB <= 0 && (abC || abD || cdA || cdB)) return true
    }
    return false
  }
  const crossingCounts = new Map(nodes.map(node => [node, 0]))
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    if (intersects(edges[i], edges[j])) for (const node of [edges[i].a, edges[i].b, edges[j].a, edges[j].b]) {
      crossingCounts.set(node, crossingCounts.get(node) + 1)
    }
  }
  const candidates = nodes.filter(node => node.name !== anchor && crossingCounts.get(node) > 0 &&
      edges.filter(edge => edge.a === node || edge.b === node).length <= 12)
    .sort((a, b) => crossingCounts.get(b) - crossingCounts.get(a)).slice(0, 12)
  const bounds = graphBounds(nodes), directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [.707, .707], [-.707, .707], [.707, -.707], [-.707, -.707]]
  for (const node of candidates) {
    const affected = edges.filter(edge => edge.a === node || edge.b === node)
    if (!affected.length || affected.length > 12) continue
    const other = edges.filter(edge => edge.a !== node && edge.b !== node)
    const score = () => affected.reduce((total, edge) => total + other.reduce((sum, otherEdge) => sum + Number(intersects(edge, otherEdge)), 0), 0)
    function crossesNode(edge, obstacle) {
      if (edge.a === obstacle || edge.b === obstacle) return false
      for (let i = 1; i < edge.points.length; i++) {
        const a = edge.points[i - 1], b = edge.points[i], dx = b.x - a.x, dy = b.y - a.y
        const t = Math.max(0, Math.min(1, ((obstacle.x - a.x) * dx + (obstacle.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
        if (Math.hypot(obstacle.x - a.x - t * dx, obstacle.y - a.y - t * dy) < 18) return true
      }
      return false
    }
    const nodeCollisions = () => affected.reduce((total, edge) => total + nodes.reduce((sum, obstacle) => sum + Number(crossesNode(edge, obstacle)), 0), 0) +
      other.reduce((total, edge) => total + Number(crossesNode(edge, node)), 0)
    const original = { x: node.x, y: node.y }, initial = score(), initialCollisions = nodeCollisions()
    if (!initial) continue
    let best = initial, bestPosition = original
    for (const distance of [22, 48]) for (const [dx, dy] of directions) {
      node.x = original.x + dx * distance; node.y = original.y + dy * distance
      if (node.x < bounds.left - 4 || node.x > bounds.right + 4 || node.y < bounds.top - 4 || node.y > bounds.bottom + 4 ||
          nodes.some(otherNode => otherNode !== node && Math.hypot(otherNode.x - node.x, otherNode.y - node.y) < 38)) continue
      for (const edge of affected) edge.points = sample(edge)
      const next = score()
      if (next < best && nodeCollisions() <= initialCollisions) { best = next; bestPosition = { x: node.x, y: node.y } }
    }
    node.x = bestPosition.x; node.y = bestPosition.y
    for (const edge of affected) edge.points = sample(edge)
  }
  return nodes
}

// Refine small congested neighborhoods with one shared objective. Static edges
// are indexed once per window; only edges incident to the moved nodes change.
export function* refineRelationNeighborhoodsInSteps(nodes, pairs, anchor, groupByDomain = false) {
  if (nodes.length < 4) return nodes
  const byName = new Map(nodes.map(node => [node.name, node])), links = [], seen = new Set()
  for (const edge of pairs) {
    const a = byName.get(edge.source), b = byName.get(edge.target)
    if (!a || !b || a === b) continue
    const key = [a.name, b.name].sort().join('\0')
    if (!seen.has(key)) { seen.add(key); links.push({ a, b }) }
  }
  if (links.length < 2) return nodes
  const degree = new Map(nodes.map(node => [node, 0]))
  for (const { a, b } of links) { degree.set(a, degree.get(a) + 1); degree.set(b, degree.get(b) + 1) }
  const hub = byName.get(anchor) || nodes.reduce((best, node) => degree.get(node) > degree.get(best) ? node : best, nodes[0])
  const bounds = graphBounds(nodes), cellSize = 80
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const intersects = (a, b, c, d) => cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0
  const distance = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy
    if (!length2) return Math.hypot(p.x - a.x, p.y - a.y)
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2))
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
  }
  // Bounding-box cells are a broad phase only; geometry is still checked exactly.
  function grid(items, box) {
    const cells = new Map()
    const visit = (rect, callback) => {
      for (let x = Math.floor(rect[0] / cellSize); x <= Math.floor(rect[2] / cellSize); x++)
        for (let y = Math.floor(rect[1] / cellSize); y <= Math.floor(rect[3] / cellSize); y++) callback(x + ',' + y)
    }
    for (const item of items) visit(box(item), key => { if (!cells.has(key)) cells.set(key, []); cells.get(key).push(item) })
    return rect => { const found = new Set(); visit(rect, key => { for (const item of cells.get(key) || []) found.add(item) }); return found }
  }
  const edgeBox = ({ a, b }) => [Math.min(a.x, b.x) - 32, Math.min(a.y, b.y) - 32, Math.max(a.x, b.x) + 32, Math.max(a.y, b.y) + 32]
  const pointBox = node => [node.x - 32, node.y - 32, node.x + 32, node.y + 32]
  const original = new Map(nodes.map(n => [n, { x: n.x, y: n.y }]))
  const centers = new Map()
  if (groupByDomain) for (const n of nodes) {
    if (n === hub) continue
    const domain = domainIndex(n.name), c = centers.get(domain) || { x: 0, y: 0, count: 0 }
    c.x += n.x; c.y += n.y; c.count++; centers.set(domain, c)
  }
  for (const c of centers.values()) { c.x /= c.count; c.y /= c.count }
  // Rank only genuinely congested nodes; fixed hubs are not moved.
  const initialEdges = grid(links, edgeBox)
  const ranked = nodes.filter(n => n !== hub && degree.get(n) > 0 && degree.get(n) <= 12).map(node => {
    let congestion = 0
    for (const e of initialEdges(pointBox(node))) if (e.a !== node && e.b !== node) {
      const d = distance(node, e.a, e.b)
      if (d < 32) congestion += (32 - d) / 8
    }
    for (const e of links) if (e.a === node || e.b === node) for (const other of initialEdges(edgeBox(e))) {
      if (e === other || e.a === other.a || e.a === other.b || e.b === other.a || e.b === other.b) continue
      if (intersects(e.a, e.b, other.a, other.b)) congestion += 2
    }
    return { node, congestion }
  }).filter(item => item.congestion > 0).sort((a, b) => b.congestion - a.congestion).slice(0, 6)
  const directions = [[1,0],[-1,0],[0,1],[0,-1],[.707,.707],[-.707,.707],[.707,-.707],[-.707,-.707]]
  for (const { node } of ranked) {
    // A nearby related node may move with it, allowing small coordinated moves.
    const neighbor = links.filter(e => e.a === node || e.b === node).map(e => e.a === node ? e.b : e.a)
      .filter(n => n !== hub && degree.get(n) <= 8 && (!groupByDomain || domainIndex(n.name) === domainIndex(node.name)))
      .sort((a, b) => Math.hypot(a.x - node.x, a.y - node.y) - Math.hypot(b.x - node.x, b.y - node.y))[0]
    const moving = neighbor ? [node, neighbor] : [node], set = new Set(moving)
    const affected = links.filter(e => set.has(e.a) || set.has(e.b)), staticLinks = links.filter(e => !set.has(e.a) && !set.has(e.b))
    const staticNodes = nodes.filter(n => !set.has(n)), findEdges = grid(staticLinks, edgeBox), findNodes = grid(staticNodes, pointBox)
    const start = moving.map(n => ({ x: n.x, y: n.y }))
    function score() {
      let cost = 0
      for (const n of moving) {
        for (const other of findNodes(pointBox(n))) {
          const d = Math.hypot(n.x - other.x, n.y - other.y)
          if (d < 38) return Infinity
        }
        for (const e of findEdges(pointBox(n))) { const d = distance(n, e.a, e.b); if (d < 30) cost += (30 - d) ** 2 * .08 }
        const p = original.get(n); cost += ((n.x - p.x) ** 2 + (n.y - p.y) ** 2) * .001
        const c = centers.get(domainIndex(n.name)); if (c) cost += ((n.x - c.x) ** 2 + (n.y - c.y) ** 2) * .0001
      }
      if (moving.length > 1 && Math.hypot(moving[0].x - moving[1].x, moving[0].y - moving[1].y) < 38) return Infinity
      for (let i = 0; i < affected.length; i++) {
        const e = affected[i]
        cost += Math.hypot(e.a.x - e.b.x, e.a.y - e.b.y) * .006
        for (const n of findNodes(edgeBox(e))) if (n !== e.a && n !== e.b) { const d = distance(n, e.a, e.b); if (d < 30) cost += (30 - d) ** 2 * .08 }
        for (const n of moving) if (n !== e.a && n !== e.b) { const d = distance(n, e.a, e.b); if (d < 30) cost += (30 - d) ** 2 * .08 }
        const others = new Set([...findEdges(edgeBox(e)), ...affected.slice(i + 1)])
        for (const other of others) {
          if (e.a === other.a || e.a === other.b || e.b === other.a || e.b === other.b) continue
          if (intersects(e.a, e.b, other.a, other.b)) cost += 12
        }
      }
      return cost
    }
    let best = score(), bestPositions = start.map(p => ({ ...p }))
    // Single and paired shifts keep the search bounded on mobile devices.
    for (const count of neighbor ? [1, 2] : [1]) for (const [dx, dy] of directions) {
      moving.forEach((n, i) => { n.x = start[i].x + (i < count ? dx * 24 : 0); n.y = start[i].y + (i < count ? dy * 24 : 0) })
      if (moving.some(n => n.x < bounds.left - 4 || n.x > bounds.right + 4 || n.y < bounds.top - 4 || n.y > bounds.bottom + 4)) continue
      const value = score()
      if (value < best - .1) { best = value; bestPositions = moving.map(n => ({ x: n.x, y: n.y })) }
    }
    moving.forEach((n, i) => { n.x = bestPositions[i].x; n.y = bestPositions[i].y })
    yield nodes
    // Deterministic local annealing can cross a temporary scoring barrier.
    // Only the best state is committed; rejected or worse states stay private.
    let seed = 2166136261
    for (const char of node.name) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619)
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
    let current = best, currentPositions = bestPositions.map(p => ({ ...p }))
    for (let attempt = 0; attempt < 32; attempt++) {
      const temperature = Math.max(.25, 5 * (1 - attempt / 32))
      const moveIndex = moving.length > 1 && random() < .5 ? 1 : 0
      const direction = directions[Math.floor(random() * directions.length)]
      const step = random() < .5 ? 12 : 24
      moving.forEach((n, i) => { n.x = currentPositions[i].x; n.y = currentPositions[i].y })
      moving[moveIndex].x += direction[0] * step; moving[moveIndex].y += direction[1] * step
      const valid = moving.every((n, i) => n.x >= bounds.left - 4 && n.x <= bounds.right + 4 &&
        n.y >= bounds.top - 4 && n.y <= bounds.bottom + 4 && Math.hypot(n.x - start[i].x, n.y - start[i].y) <= 64)
      const value = valid ? score() : Infinity
      if (Number.isFinite(value) && (!Number.isFinite(current) || value < current || random() < Math.exp((current - value) / temperature))) {
        current = value; currentPositions = moving.map(n => ({ x: n.x, y: n.y }))
        if (value < best - .1) { best = value; bestPositions = currentPositions.map(p => ({ ...p })) }
      } else moving.forEach((n, i) => { n.x = currentPositions[i].x; n.y = currentPositions[i].y })
      if ((attempt + 1) % 4 === 0) yield nodes
    }
    moving.forEach((n, i) => { n.x = bestPositions[i].x; n.y = bestPositions[i].y })
  }
  return nodes
}

export function refineRelationNeighborhoods(nodes, pairs, anchor, groupByDomain = false) {
  for (const _ of refineRelationNeighborhoodsInSteps(nodes, pairs, anchor, groupByDomain)) { /* complete synchronously */ }
  return nodes
}

// Unlinked tables still gravitate gently toward the graph, while keeping a
// wider clearance from linked nodes than ordinary node-to-node spacing.
function settleUnlinked(main, unlinked, width, height) {
  const center = main.reduce((c, n) => ({ x: c.x + n.x / main.length, y: c.y + n.y / main.length }), { x: 0, y: 0 })
  const edgeX = Math.max(45, (width - 80) / 2), edgeY = Math.max(45, (height - 80) / 2)
  // The convex outline protects the entire linked cluster, including empty
  // spaces between nodes, rather than only repelling individual nodes.
  const points = [...main].sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const half = list => {
    const result = []
    for (const p of list) { while (result.length > 1 && cross(result[result.length - 2], result[result.length - 1], p) <= 0) result.pop(); result.push(p) }
    return result
  }
  const lower = half(points), upper = half([...points].reverse())
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1))
  function keepOutside(node) {
    if (hull.length < 3) return
    let closest = null
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i], b = hull[(i + 1) % hull.length]
      if (cross(a, b, node) < 0) return
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy)
      if (!length) continue
      const distance = cross(a, b, node) / length
      if (!closest || distance < closest.distance) closest = { dx, dy, length, distance }
    }
    if (closest) {
      const shift = (closest.distance + 20) / closest.length
      node.x += closest.dy * shift; node.y -= closest.dx * shift
    }
  }
  for (let pass = 0; pass < 120; pass++) {
    for (const node of unlinked) {
      let fx = (center.x - node.x) * .018, fy = (center.y - node.y) * .018
      if (Math.abs(node.x) > edgeX) fx -= (node.x - Math.sign(node.x) * edgeX) * .3
      if (Math.abs(node.y) > edgeY) fy -= (node.y - Math.sign(node.y) * edgeY) * .3
      for (const other of main) {
        const dx = node.x - other.x, dy = node.y - other.y, distance = Math.max(.001, Math.hypot(dx, dy))
        if (distance < 56) { const push = (56 - distance) * .3 / distance; fx += dx * push; fy += dy * push }
      }
      const length = Math.hypot(fx, fy), scale = length > 3 ? 3 / length : 1
      node.x += fx * scale; node.y += fy * scale
      keepOutside(node)
    }
    separateNodes(unlinked, 40)
  }
  // Finish with collision constraints so densely packed linked nodes cannot
  // trap an unlinked node on top of them after the attraction settles.
  for (let pass = 0; pass < 80; pass++) {
    for (const node of unlinked) for (const other of main) {
      let dx = node.x - other.x, dy = node.y - other.y, distance = Math.hypot(dx, dy)
      if (distance >= 50) continue
      if (distance < .001) { dx = 1; dy = 0; distance = 1 }
      const shift = (50 - distance) / distance
      node.x += dx * shift; node.y += dy * shift
    }
    separateNodes(unlinked, 40)
    for (const node of unlinked) {
      if (Math.abs(node.x) > edgeX) node.x -= (node.x - Math.sign(node.x) * edgeX) * .2
      if (Math.abs(node.y) > edgeY) node.y -= (node.y - Math.sign(node.y) * edgeY) * .2
      keepOutside(node)
    }
  }
  return main.concat(unlinked)
}

export function layoutTables(tables, pairs, anchor, layout, width, height, curved = false, groupByDomain = false, options = {}) {
  if (!tables.length) return []
  const ordered = [...tables].sort((a, b) => domainIndex(a.name) - domainIndex(b.name) || a.name.localeCompare(b.name))
  // Tables without inter-table links have no springs to balance repulsion.
  // Give them a compact area of their own so they cannot push a connected
  // component to the edge of the overview or flatten it into a narrow strip.
  if (layout === 'force' && !anchor) {
    const degree = new Map()
    for (const { source, target } of pairs) {
      if (source === target) continue
      degree.set(source, (degree.get(source) || 0) + 1)
      degree.set(target, (degree.get(target) || 0) + 1)
    }
    const linked = ordered.filter(t => degree.has(t.name))
    const separate = ordered.filter(t => !degree.has(t.name))
    if (separate.length) {
      const hub = linked.reduce((best, t) => !best || degree.get(t.name) > degree.get(best.name) ? t : best, null)
      const perCorner = Math.ceil(separate.length / 4)
      const cols = Math.max(1, Math.ceil(Math.sqrt(perCorner * 1.4)))
      const rows = Math.ceil(perCorner / cols)
      const mainW = Math.max(120, width - Math.min(width * .3, cols * 36))
      const mainH = Math.max(120, height - Math.min(height * .3, rows * 36))
      const main = linked.length ? layoutTables(linked, pairs.filter(p => degree.has(p.source) && degree.has(p.target)),
        hub.name, layout, mainW, mainH, curved, groupByDomain, options) : []
      if (!main.length) {
        const cols = Math.max(1, Math.ceil(Math.sqrt(separate.length * Math.max(1, width) / Math.max(1, height))))
        const rows = Math.ceil(separate.length / cols)
        return matchViewportAspect(separate.map((t, i) => ({ name: t.name, x: (i % cols - (cols - 1) / 2) * 44,
          y: (Math.floor(i / cols) - (rows - 1) / 2) * 44 })), width, height)
      }
      const bounds = graphBounds(main)
      const edgeX = Math.max((width - 80) / 2, Math.max(Math.abs(bounds.left), Math.abs(bounds.right)))
      const edgeY = Math.max((height - 80) / 2, Math.max(Math.abs(bounds.top), Math.abs(bounds.bottom)))
      const extra = separate.map((t, i) => {
        const corner = i % 4, index = Math.floor(i / 4), column = index % cols, row = Math.floor(index / cols)
        const right = corner % 2, bottom = corner >= 2
        return { name: t.name, x: (right ? 1 : -1) * (edgeX - column * 40),
          y: (bottom ? 1 : -1) * (edgeY - row * 40) }
      })
      const combined = matchViewportAspect(settleUnlinked(main, extra, width, height), width, height)
      return groupByDomain ? clearDenseLinkAreas(combined, pairs, hub.name) : combined
    }
  }
  const pinned = layout === 'force' && ordered.some(table => table.name === anchor)
  const count = ordered.length - Number(pinned)
  let ordinal = 0
  const nodes = ordered.map(table => {
    const fixed = pinned && table.name === anchor
    const startAngle = count === 2 && width > height ? -.18 : -Math.PI / 2
    const angle = fixed ? 0 : 2 * Math.PI * (ordinal++ / Math.max(1, count)) + startAngle
    const layer = layout === 'force' && count > 8 ? .46 + ((ordinal * 7) % 11) / 16 : 1
    const radius = fixed ? 0 : Math.max(110, Math.sqrt(count) * 60) * layer
    return { name: table.name, x: radius * Math.cos(angle), y: radius * Math.sin(angle), fixed, dx: 0, dy: 0 }
  })
  if (layout === 'force') {
    const byName = new Map(nodes.map(node => [node.name, node]))
    const springs = pairs.filter(pair => pair.source !== pair.target && !pair.lane).map(pair => [byName.get(pair.source), byName.get(pair.target)]).filter(([a, b]) => a && b)
    // Domain centers follow the existing ordered sectors, but act as soft
    // anchors so genuine cross-domain relationships can still pull nodes closer.
    const domainCenters = new Map()
    if (groupByDomain) for (const node of nodes) {
      if (node.fixed) continue
      const domain = domainIndex(node.name), center = domainCenters.get(domain) || { x: 0, y: 0, count: 0 }
      center.x += node.x; center.y += node.y; center.count++
      domainCenters.set(domain, center)
    }
    for (const center of domainCenters.values()) { center.x /= center.count; center.y /= center.count }
    // Settle the initial overview before paint. Interactive springs start from these coordinates.
    const iterations = Math.max(40, Math.min(100, Math.round(options.iterations || 100)))
    for (let step = 0; step < iterations; step++) {
      const limit = 14 * (1 - step / iterations) + .3
      for (const node of nodes) { node.dx = -node.x * .025; node.dy = -node.y * .025 }
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j], dx = a.x - b.x, dy = a.y - b.y
          const distance = Math.max(1, Math.hypot(dx, dy))
          const repulsion = 8200 / (distance * distance)
          a.dx += dx * repulsion; a.dy += dy * repulsion
          b.dx -= dx * repulsion; b.dy -= dy * repulsion
        }
      }
      for (const [a, b] of springs) {
        const dx = b.x - a.x, dy = b.y - a.y, distance = Math.max(1, Math.hypot(dx, dy))
        const pull = (distance - 110) * .22 / distance
        a.dx += dx * pull; a.dy += dy * pull
        b.dx -= dx * pull; b.dy -= dy * pull
      }
      if (groupByDomain) {
        for (const node of nodes) {
          const center = domainCenters.get(domainIndex(node.name))
          if (!node.fixed && center) { node.dx += (center.x - node.x) * .065; node.dy += (center.y - node.y) * .065 }
        }
        if (step % 3 === 0) repelNodesFromLinks(nodes, springs)
      }
      for (const node of nodes) {
        if (node.fixed) continue
        const factor = Math.min(1, limit / Math.max(1, Math.hypot(node.dx, node.dy)))
        node.x += node.dx * factor; node.y += node.dy * factor
      }
    }
  }
  const bounds = graphBounds(nodes)
  const spanX = bounds.right - bounds.left, spanY = bounds.bottom - bounds.top
  const padding = graphPadding(width, height)
  const usableX = Math.max(36, width - padding.x), usableY = Math.max(36, height - padding.y)
  // Prevent floating-point noise on a two-node vertical axis becoming a diagonal.
  const scaleX = Math.min(1.8, usableX / Math.max(1, spanX))
  const scaleY = Math.min(1.4, usableY / Math.max(1, spanY))
  const placed = matchViewportAspect(separateNodes(nodes.map(node => ({
    name: node.name,
    x: (node.x - (bounds.left + bounds.right) / 2) * scaleX,
    y: (node.y - (bounds.top + bounds.bottom) / 2) * scaleY
  }))), width, height)
  if (layout !== 'force') return placed
  const refined = improveLinkClearance(improveCurveCrossings(reduceCrossings(placed, pairs, anchor, groupByDomain), pairs, anchor, curved), pairs, anchor)
  const cleared = groupByDomain ? clearDenseLinkAreas(refined, pairs, anchor) : refined
  return options.deferRefinement ? cleared : refineRelationNeighborhoods(cleared, pairs, anchor, groupByDomain)
}

// Keep the resting shape of each link as well as its length. The light lateral
// spring makes neighbors respond even when a node is pulled across a link.
export function dragSprings(nodes, pairs, pinned, options = {}) {
  const byName = new Map()
  const bodies = nodes.map(node => {
    const body = { node, x0: node.x, y0: node.y, vx: 0, vy: 0, fx: 0, fy: 0, degree: 0 }
    byName.set(node.name, body)
    return body
  })
  const links = [], seen = new Set()
  for (const { source, target } of pairs) {
    const a = byName.get(source), b = byName.get(target)
    const key = JSON.stringify([source, target].sort())
    if (!a || !b || a === b || seen.has(key)) continue
    seen.add(key); a.degree++; b.degree++
    links.push({ a, b, dx: b.x0 - a.x0, dy: b.y0 - a.y0, length: Math.hypot(b.x0 - a.x0, b.y0 - a.y0) })
  }
  let repulsionTick = 0, cachedRepulsion = null
  let deferredRepulsionFrames = Math.max(0, Number(options.deferRepulsionFrames) || 0)
  return function advance(repulsionPeriod = 1) {
    for (const b of bodies) {
      b.fx = (b.x0 - b.node.x) * .012
      b.fy = (b.y0 - b.node.y) * .012
    }
    for (const link of links) {
      const { a, b } = link
      const dx = b.node.x - a.node.x, dy = b.node.y - a.node.y
      const length = Math.max(.01, Math.hypot(dx, dy))
      const stretch = .09 * (length - link.length) / length
      const fx = dx * stretch + (dx - link.dx) * .10
      const fy = dy * stretch + (dy - link.dy) * .10
      a.fx += fx; a.fy += fy; b.fx -= fx; b.fy -= fy
    }
    // Local repulsion stops neighbors from sitting on top of the dragged node.
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], b = bodies[j]
        const dx = b.node.x - a.node.x, dy = b.node.y - a.node.y
        if (Math.abs(dx) > 42 || Math.abs(dy) > 42) continue
        const distance = Math.hypot(dx, dy)
        const gap = Math.min(42, Math.hypot(b.x0 - a.x0, b.y0 - a.y0)) - distance
        if (gap <= 0) continue
        const fx = (distance ? dx / distance : 1) * gap * .18
        const fy = (distance ? dy / distance : 0) * gap * .18
        a.fx -= fx; a.fy -= fy; b.fx += fx; b.fy += fy
      }
    }
    // Refresh expensive node-to-link avoidance less often under sustained load;
    // reuse its forces between refreshes so movement remains continuous.
    if (deferredRepulsionFrames > 0) {
      // Let the dragged node respond before the more expensive link avoidance.
      deferredRepulsionFrames--
    } else if (!cachedRepulsion || repulsionTick++ % Math.max(1, repulsionPeriod) === 0) {
      const before = bodies.map(b => ({ x: b.fx, y: b.fy }))
    for (const { a, b } of links) {
      const dx = b.node.x - a.node.x, dy = b.node.y - a.node.y, length2 = dx * dx + dy * dy
      if (length2 < 1) continue
      for (const body of bodies) {
        if (body === a || body === b) continue
        if (body.node.x < Math.min(a.node.x, b.node.x) - 32 || body.node.x > Math.max(a.node.x, b.node.x) + 32 ||
            body.node.y < Math.min(a.node.y, b.node.y) - 32 || body.node.y > Math.max(a.node.y, b.node.y) + 32) continue
        const t = ((body.node.x - a.node.x) * dx + (body.node.y - a.node.y) * dy) / length2
        if (t <= .08 || t >= .92) continue
        let nx = body.node.x - (a.node.x + t * dx), ny = body.node.y - (a.node.y + t * dy)
        let distance = Math.hypot(nx, ny)
        if (distance >= 32) continue
        if (distance < .01) { const length = Math.sqrt(length2); nx = -dy / length * .01; ny = dx / length * .01; distance = .01 }
        const force = Math.min(1.5, (32 - distance) * .06) / distance
        body.fx += nx * force; body.fy += ny * force
        a.fx -= nx * force * (1 - t) * .25; a.fy -= ny * force * (1 - t) * .25
        b.fx -= nx * force * t * .25; b.fy -= ny * force * t * .25
      }
    }
      cachedRepulsion = bodies.map((b, i) => ({ x: b.fx - before[i].x, y: b.fy - before[i].y }))
    } else {
      for (let i = 0; i < bodies.length; i++) { bodies[i].fx += cachedRepulsion[i].x; bodies[i].fy += cachedRepulsion[i].y }
    }
    let speed = 0
    for (const b of bodies) {
      if (b.node.name === pinned) continue
      const mass = Math.max(1, b.degree * .45)
      b.vx = (b.vx + b.fx / mass) * .76
      b.vy = (b.vy + b.fy / mass) * .76
      b.node.x += b.vx; b.node.y += b.vy
      speed = Math.max(speed, Math.abs(b.vx), Math.abs(b.vy))
    }
    return speed
  }
}

// Traverse from either end of a foreign key, retaining its declared direction
// on the returned step so the inspector can show the actual column mapping.
export function shortestRelationPath(edges, start, end) {
  if (!start || !end) return null
  if (start === end) return []
  const neighbors = new Map()
  for (const edge of edges) {
    if (edge.source === edge.target) continue
    for (const [from, to] of [[edge.source, edge.target], [edge.target, edge.source]]) {
      if (!neighbors.has(from)) neighbors.set(from, [])
      neighbors.get(from).push({ from, to, edge })
    }
  }
  const queue = [start], previous = new Map([[start, null]])
  for (let i = 0; i < queue.length; i++) {
    for (const step of neighbors.get(queue[i]) || []) {
      if (previous.has(step.to)) continue
      previous.set(step.to, step)
      if (step.to === end) {
        const path = []
        for (let s = step; s; s = previous.get(s.from)) path.push(s)
        return path.reverse()
      }
      queue.push(step.to)
    }
  }
  return null
}

export function relationStrokes(nodes, edges, curved = false, cachedBends = null, reroute = null, cachedArrows = null) {
  const byName = new Map(nodes.map(n => [n.name, n]))
  const keys = new Set(edges.map(e => JSON.stringify([e.source, e.target])))
  const arrows = [], routed = []
  return edges.flatMap(edge => {
    const a = byName.get(edge.source), b = byName.get(edge.target)
    if (!a || !b) return []
    if (a === b) {
      const radius = Math.max(17, a.radius + 5) + (edge.lane || 0) * 12
      const cx = a.x + radius * .82, cy = a.y - radius * .82
      const path = `M ${cx + radius} ${cy} a ${radius} ${radius} 0 1 1 ${-2 * radius} 0 a ${radius} ${radius} 0 1 1 ${2 * radius} 0`
      return [{ ...edge, path, loop: true, x: cx - radius, y: cy - radius, length: radius * 2,
        angle: 0, arrowX: cx + radius * .707, arrowY: cy + radius * .707, arrowAngle: Math.PI * .75,
        captionX: cx + radius, captionY: cy - radius, ux: 0, uy: 0, loopCenterX: cx, loopCenterY: cy, loopRadius: radius }]
    }
    const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy)
    if (distance < a.radius + b.radius + 9) return []
    const ux = dx / distance, uy = dy / distance
    const reverse = keys.has(JSON.stringify([b.name, a.name]))
    const lane = reverse ? (edge.lane || 0) + .5 : (edge.lane || 0) - ((edge.lanes || 1) - 1) / 2
    const offset = lane * (curved ? 4 : 10)
    const x = a.x + ux * (a.radius + 3) - uy * offset, y = a.y + uy * (a.radius + 3) + ux * offset
    const length = distance - a.radius - b.radius - 7, angle = Math.atan2(dy, dx)
    // A perpendicular control-point offset separates reciprocal directions.
    // Sample the same quadratic for drawing, arrow tangents and field labels.
    const curveSeed = [...[a.name, b.name].sort().join('|')].reduce((sum, char) => sum + char.charCodeAt(0), 0)
    const naturalBend = (curveSeed % 2 ? 1 : -1) * Math.min(18, Math.max(5, length * .06))
    let bend = curved ? (lane ? lane * Math.min(76, length * .53) : naturalBend) : 0
    if (curved && cachedBends?.has(edge.key) && !reroute?.has(edge.key)) {
      bend = cachedBends.get(edge.key)
    } else if (curved && (!cachedBends || reroute?.has(edge.key))) {
      const obstacles = nodes.filter(n => n !== a && n !== b)
      const collision = candidate => {
        let nodePenalty = 0, linePenalty = 0
        for (let i = 1; i < 24; i++) {
          const t = i / 24, normal = 2 * t * (1 - t) * candidate
          const px = x + ux * length * t - uy * normal, py = y + uy * length * t + ux * normal
          for (const node of obstacles) {
            const overlap = node.radius + 8 - Math.hypot(node.x - px, node.y - py)
            if (overlap > 0) nodePenalty += overlap * overlap
          }
          // Ignore the unavoidable convergence at shared endpoints.
          if (i % 2 === 0 && t > .1 && t < .9) for (const previous of routed) {
            for (const p of previous) {
              const overlap = 12 - Math.hypot(p.x - px, p.y - py)
              if (overlap > 0) linePenalty += overlap * overlap
            }
          }
        }
        return nodePenalty * 30 + linePenalty * .15 + Math.abs(candidate - bend) * .8
      }
      let best = collision(bend)
      let chosen = bend
      for (const candidate of [-naturalBend, 0]) {
        const score = collision(candidate)
        if (score < best) { chosen = candidate; best = score }
      }
      for (let magnitude = 24; magnitude <= Math.min(160, Math.max(64, length * .7)); magnitude += 24) {
        for (const candidate of [magnitude, -magnitude]) {
          const score = collision(candidate)
          if (score < best) { chosen = candidate; best = score }
        }
      }
      bend = chosen
    }
    const pointAt = t => {
      const normal = 2 * t * (1 - t) * bend
      return { x: x + ux * length * t - uy * normal, y: y + uy * length * t + ux * normal }
    }
    if (curved && (!cachedBends || reroute)) routed.push(Array.from({ length: 11 }, (_, i) => pointAt((i + 1) / 12)))
    const end = pointAt(1)
    const path = `M ${x} ${y} Q ${x + ux * length / 2 - uy * bend} ${y + uy * length / 2 + ux * bend} ${end.x} ${end.y}`
    // At a busy hub, move each arrow along its own shaft until it clears
    // neighboring disks and arrows. Labels reserve this footprint afterwards.
    const clearAt = t => {
      const { x: px, y: py } = pointAt(t)
      return nodes.every(n => Math.hypot(n.x - px, n.y - py) > n.radius + 7) &&
        arrows.every(p => Math.hypot(p.x - px, p.y - py) > 12)
    }
    const t = cachedArrows?.get(edge.key) ?? ([.72, .61, .83, .50, .39, .28].find(clearAt) ?? .72)
    const { x: arrowX, y: arrowY } = pointAt(t), caption = pointAt(.4)
    const arrowAngle = angle + Math.atan2(2 * bend * (1 - 2 * t), length)
    arrows.push({ x: arrowX, y: arrowY })
    return [{ ...edge, path, loop: false, laneSide: Math.sign(lane), x, y, length, angle, ux, uy, bend, arrowAngle, arrowT: t,
      arrowX, arrowY,
      captionX: caption.x, captionY: caption.y }]
  })
}

const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
const textWidth = text => [...text].reduce((w, char) => w + (char.charCodeAt(0) > 255 ? 12 : 6.7), 0)
export function graphLabels(nodes, lines, viewport, activeKey, allLines = lines) {
  const boxes = nodes.map(n => ({ x: n.x - n.radius - 3, y: n.y - n.radius - 3, w: n.radius * 2 + 6, h: n.radius * 2 + 6 }))
  for (const line of allLines) boxes.push({ x: line.arrowX - 7, y: line.arrowY - 7, w: 14, h: 14 })
  const segments = []
  for (const line of allLines) {
    let previous
    const steps = line.loop ? 40 : Math.max(12, Math.ceil(line.length / 12))
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, normal = 2 * t * (1 - t) * (line.bend || 0)
      const p = line.loop
        ? { x: line.loopCenterX + line.loopRadius * Math.cos(t * Math.PI * 2), y: line.loopCenterY + line.loopRadius * Math.sin(t * Math.PI * 2) }
        : { x: line.x + line.ux * line.length * t - line.uy * normal, y: line.y + line.uy * line.length * t + line.ux * normal }
      if (previous) segments.push({ key: line.key, x: Math.min(previous.x, p.x) - 2, y: Math.min(previous.y, p.y) - 2, w: Math.abs(p.x - previous.x) + 4, h: Math.abs(p.y - previous.y) + 4 })
      previous = p
    }
  }
  const nodeLabels = new Map(), lineLabels = []
  function fits(box) {
    return box.x >= viewport.left && box.y >= viewport.top && box.x + box.w <= viewport.right &&
      box.y + box.h <= viewport.bottom && !boxes.some(other => overlaps(box, other))
  }
  function lineOverlap(box) {
    let score = 0
    for (const segment of segments) if (overlaps(box, segment)) score++
    return score
  }
  function bestPosition(candidates) {
    let best = null, score = Infinity
    for (const candidate of candidates) {
      if (!fits(candidate.box)) continue
      const overlap = lineOverlap(candidate.box)
      if (overlap < score) { best = candidate; score = overlap }
      if (!score) break
    }
    return score <= 3 ? best : null
  }
  for (const n of [...nodes].sort((a, b) => b.priority - a.priority)) {
    if (n.hideLabel) continue
    const w = Math.min(144, 10 + Math.max(textWidth(n.label), (n.sqlLabel?.length || 0) * 5.5))
    const h = n.sqlLabel ? 35 : 21, gap = n.radius + 5
    const candidates = [[-w / 2, gap], [-w / 2, -gap - h], [gap, -h / 2], [-gap - w, -h / 2]]
      .map(([dx, dy]) => ({ dx, dy, box: { x: n.x + dx, y: n.y + dy, w, h } }))
    const position = bestPosition(candidates)
    if (position) {
      nodeLabels.set(n.name, { left: position.dx + 'px', top: position.dy + 'px', width: w + 'px' })
      boxes.push(position.box)
    }
  }
  for (const line of [...lines].sort((a,b) => Number(b.key === activeKey) - Number(a.key === activeKey))) {
    const field = line.fields[0]
    const text = line.lanes > 1 && line.role ? line.role : field.sourceColumn + ' → ' + field.targetColumn + (line.fields.length > 1 ? ' +' + (line.fields.length - 1) : '')
    const w = Math.min(160, textWidth(text) + 12), h = 19
    // Label reciprocal lanes on their respective outsides, keeping both
    // arrows visible even when the two mappings have long field names.
    const side = (line.laneSide || 0) * ((Math.abs(line.uy) * w + Math.abs(line.ux) * h) / 2 + 3)
    const clearance = (Math.abs(line.uy) * w + Math.abs(line.ux) * h) / 2 + 5
    const candidates = []
    for (const [t, offset] of [[0, side || clearance], [0, side || -clearance], [.13, clearance], [-.13, -clearance], [.26, -clearance], [-.26, clearance], [0, 0]]) {
      const x = line.captionX + line.ux * line.length * t - line.uy * offset
      const y = line.captionY + line.uy * line.length * t + line.ux * offset
      const box = { x: x - w / 2, y: y - h / 2, w, h }
      candidates.push({ box })
    }
    const position = bestPosition(candidates)
    if (position) {
      lineLabels.push({ key: line.key, text, x: position.box.x, y: position.box.y, width: w })
      boxes.push(position.box)
    }
  }
  return { nodeLabels, lineLabels }
}
// Use the same click/tap interval on H5 and mini-program table nodes.
export function tableDoubleTap() {
  let previous = '', at = 0
  return (key = '') => {
    const now = Date.now()
    const twice = !!key && previous === key && now - at < 350
    previous = twice ? '' : key
    at = now
    return twice
  }
}
