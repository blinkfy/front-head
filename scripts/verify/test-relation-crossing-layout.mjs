import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../../src/pages-admin/components/database-relation-layout.js', import.meta.url), 'utf8')
const { improveCurveCrossings, improveLinkClearance, layoutTables, relationStrokes, repelNodesFromLinks, clearDenseLinkAreas, refineRelationNeighborhoods, refineRelationNeighborhoodsInSteps, dragSprings, domainIndex } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
const pairs = [
  { key: 'a-b', source: 'a', target: 'b', lane: 0, lanes: 1 },
  { key: 'c-d', source: 'c', target: 'd', lane: 0, lanes: 1 }
]
const nodes = [{ name: 'a', x: -80, y: 0 }, { name: 'b', x: 80, y: 0 },
  { name: 'c', x: 20, y: -80 }, { name: 'd', x: 20, y: 28 }]
const original = structuredClone(nodes)
improveCurveCrossings(nodes, pairs, 'a', false)
assert.deepEqual(nodes[0], original[0], 'anchor must not move')
assert.ok(nodes.some((n, i) => n.x !== original[i].x || n.y !== original[i].y), 'local move should resolve an avoidable crossing')
function curvesCross(points) {
  const lines = relationStrokes(points.map(point => ({ ...point, radius: 14 })), pairs, true)
  const samples = line => Array.from({ length: 41 }, (_, i) => {
    const t = i / 40, bend = 2 * t * (1 - t) * line.bend
    return { x: line.x + line.ux * line.length * t - line.uy * bend, y: line.y + line.uy * line.length * t + line.ux * bend }
  })
  const [a, b] = lines.map(samples)
  const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++) {
    if (cross(a[i - 1], a[i], b[j - 1]) * cross(a[i - 1], a[i], b[j]) < 0 &&
        cross(b[j - 1], b[j], a[i - 1]) * cross(b[j - 1], b[j], a[i]) < 0) return true
  }
  return false
}
const curved = structuredClone(original)
assert.equal(curvesCross(curved), true, 'fixture starts with a visible curve crossing')
improveCurveCrossings(curved, pairs, 'a', true)
assert.equal(curvesCross(curved), false, 'recomputed visible curves no longer cross')
for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
  assert.ok(Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) >= 38, 'nodes remain separated')
}
const noCross = [{ name: 'a', x: -80, y: 0 }, { name: 'b', x: 80, y: 0 },
  { name: 'c', x: -80, y: 80 }, { name: 'd', x: 80, y: 80 }]
const unchanged = structuredClone(noCross)
improveCurveCrossings(noCross, pairs, 'a', true)
assert.deepEqual(noCross, unchanged, 'non-crossing nodes remain stable')
const graph = layoutTables(nodes, pairs, 'a', 'force', 600, 400, true)
assert.equal(graph.length, 4)
assert.ok(graph.every(n => Number.isFinite(n.x) && Number.isFinite(n.y)))
const originalScoring = `function score() {
    let crossings = 0
    for (let i = 0; i < links.length; i++) for (let j = i + 1; j < links.length; j++) {
      const [a, b] = links[i], [c, d] = links[j]
      if (a === c || a === d || b === c || b === d) continue
      if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) crossings++
    }
    return crossings
  }
  const movable`
const baselineSource = source.replace(/function score\(a, b\) \{[\s\S]*?\r?\n  \}\r?\n  const movable/, originalScoring)
assert.ok(baselineSource !== source, 'baseline crossing scorer was replaced')
const baselineLayout = (await import('data:text/javascript;base64,' + Buffer.from(baselineSource).toString('base64'))).layoutTables
const sampleTables = Array.from({ length: 28 }, (_, i) => ({ name: ['User', 'Chat', 'Device', 'Ai'][i % 4] + i }))
const sampleEdges = Array.from({ length: 44 }, (_, i) => ({ key: String(i), source: sampleTables[(i * 7) % 28].name, target: sampleTables[(i * 13 + 3) % 28].name, lane: 0, lanes: 1 }))
assert.deepEqual(layoutTables(sampleTables, sampleEdges, '', 'force', 900, 600, false, true),
  baselineLayout(sampleTables, sampleEdges, '', 'force', 900, 600, false, true), 'incremental crossing scores keep identical layout decisions')
const arrowNodes = original.map(node => ({ ...node, radius: 14 }))
const initialStrokes = relationStrokes(arrowNodes, pairs, false)
const arrowCache = new Map(initialStrokes.map(line => [line.key, line.arrowT]))
arrowNodes[1].y += 20
const movedStrokes = relationStrokes(arrowNodes, pairs, false, null, null, arrowCache)
assert.deepEqual(movedStrokes.map(line => line.arrowT), initialStrokes.map(line => line.arrowT), 'dragged arrows keep their relative positions')
assert.notEqual(movedStrokes[0].arrowY, initialStrokes[0].arrowY, 'cached arrows still move with the link')
const a = { x: -80, y: 0, dx: 0, dy: 0 }, b = { x: 80, y: 0, dx: 0, dy: 0 }
const obstacle = { x: 0, y: 4, dx: 0, dy: 0 }, endpointNeighbor = { x: -78, y: 4, dx: 0, dy: 0 }
repelNodesFromLinks([a, b, obstacle, endpointNeighbor], [[a, b]])
assert.ok(obstacle.dy > 0, 'an unrelated node near the middle of a line is pushed away')
assert.equal(endpointNeighbor.dy, 0, 'line convergence near endpoints does not repel unrelated nodes')
const fanNodes = [{ name: 'User', x: 0, y: 0 }, { name: 'Crowded', x: -55, y: 0 },
  { name: 'Own', x: -55, y: -130 }, { name: 'L1', x: -300, y: -100 }, { name: 'L2', x: -300, y: -30 },
  { name: 'L3', x: -300, y: 30 }, { name: 'L4', x: -300, y: 100 }]
const fanEdges = ['L1', 'L2', 'L3', 'L4'].map(source => ({ source, target: 'User' }))
fanEdges.push({ source: 'Crowded', target: 'Own' })
const hubBefore = { ...fanNodes[0] }, crowdedBefore = { ...fanNodes[1] }
clearDenseLinkAreas(fanNodes, fanEdges, 'User')
assert.deepEqual(fanNodes[0], hubBefore, 'the hub remains fixed')
assert.notDeepEqual(fanNodes[1], crowdedBefore, 'a node near the hub moves out of the dense fan')
assert.ok(fanNodes.every((node, index) => fanNodes.slice(index + 1).every(other => Math.hypot(node.x - other.x, node.y - other.y) >= 38)), 'fan refinement keeps nodes separated')
const detour = [{ name: 'Hub', x: 0, y: 0 }, { name: 'End', x: 70, y: 120 },
  { name: 'Obstacle', x: 46, y: 80 }, { name: 'Other', x: 180, y: 65 }]
const detourEdges = [{ key: 'main', source: 'Hub', target: 'End', lane: 0, lanes: 1 },
  { key: 'other', source: 'Obstacle', target: 'Other', lane: 0, lanes: 1 }]
const oldEnd = { ...detour[1] }, oldHub = { ...detour[0] }
const mainBend = () => relationStrokes(detour.map(node => ({ ...node, radius: 14 })), detourEdges, true).find(line => line.key === 'main').bend
const chordDistance = () => {
  const [a, b, p] = detour, dx = b.x - a.x, dy = b.y - a.y
  return Math.abs(dx * (a.y - p.y) - (a.x - p.x) * dy) / Math.hypot(dx, dy)
}
const oldClearance = chordDistance()
const oldBend = Math.abs(mainBend())
improveLinkClearance(detour, detourEdges, 'Hub')
assert.deepEqual(detour[0], oldHub, 'the anchor is not moved to clear a detour')
assert.notDeepEqual(detour[1], oldEnd, 'a blocked link endpoint can move even without line crossings')
assert.ok(chordDistance() > oldClearance, 'moving the endpoint gives the unrelated node more clearance')
assert.ok(Math.abs(mainBend()) < oldBend, 'the rendered curve no longer needs the large detour')
assert.ok(detour.every((node, index) => detour.slice(index + 1).every(other => Math.hypot(node.x - other.x, node.y - other.y) >= 38)), 'detour refinement preserves spacing')
const tables = ['User', 'Chat', 'Message', 'Post', 'Comment', 'Device', 'Bin', 'WasteType', 'ServicePoint'].map(name => ({ name }))
const links = tables.slice(1).map(({ name }, i) => ({ key: String(i), source: name, target: 'User', lane: 0, lanes: 1 }))
const overview = layoutTables(tables, links, '', 'force', 900, 600, false, true)
const centers = new Map()
for (const node of overview.filter(node => node.name !== 'User')) {
  const domain = domainIndex(node.name), current = centers.get(domain) || { x: 0, y: 0, count: 0 }
  current.x += node.x; current.y += node.y; current.count++
  centers.set(domain, current)
}
for (const center of centers.values()) { center.x /= center.count; center.y /= center.count }
for (const node of overview.filter(node => node.name !== 'User')) {
  const own = centers.get(domainIndex(node.name))
  const ownDistance = Math.hypot(node.x - own.x, node.y - own.y)
  assert.ok([...centers.values()].every(other => other === own || ownDistance < Math.hypot(node.x - other.x, node.y - other.y)), 'business sectors stay grouped')
}
const localNodes = [{ name: 'a', x: -100, y: 0 }, { name: 'b', x: 100, y: 0 },
  { name: 'c', x: 0, y: 8 }, { name: 'd', x: 0, y: 100 }, { name: 'e', x: -100, y: 100 }]
const localEdges = [{ source: 'a', target: 'b' }, { source: 'c', target: 'd' }, { source: 'd', target: 'e' }]
const localAnchor = { ...localNodes[0] }, initialClearance = localNodes[2].y
refineRelationNeighborhoods(localNodes, localEdges, 'a')
assert.deepEqual(localNodes[0], localAnchor, 'joint refinement keeps the anchor fixed')
assert.ok(localNodes[2].y > initialClearance, 'joint refinement clears a node from an unrelated line')
assert.ok(localNodes.every((node, i) => localNodes.slice(i + 1).every(other => Math.hypot(node.x - other.x, node.y - other.y) >= 38)), 'joint refinement preserves node clearance')
const stableNodes = structuredClone(noCross)
refineRelationNeighborhoods(stableNodes, pairs, 'a')
assert.deepEqual(stableNodes, noCross, 'an uncrowded layout is not needlessly rearranged')
const frameSource = await readFile(new URL('../../src/pages-admin/components/database-relation-frame-budget.js', import.meta.url), 'utf8')
const { createRelationFrameBudget } = await import('data:text/javascript;base64,' + Buffer.from(frameSource).toString('base64'))
const budget = createRelationFrameBudget(true)
assert.equal(budget.level, 3, 'desktop begins with a higher budget')
let time = 0
budget.observe(time)
for (let i = 0; i < 5; i++) budget.observe(time += 33)
assert.equal(budget.level, 2, 'sustained slow frames reduce work')
for (let i = 0; i < 40; i++) budget.observe(time += 16)
assert.equal(budget.level, 3, 'sustained smooth frames recover work gradually')
budget.observe(time += 1000)
assert.equal(budget.level, 3, 'an idle gap does not reduce the budget')
assert.equal(createRelationFrameBudget(false).level, 1, 'mobile starts conservatively')
const chunked = [{ name: 'a', x: -100, y: 0 }, { name: 'b', x: 100, y: 0 },
  { name: 'c', x: 0, y: 8 }, { name: 'd', x: 0, y: 100 }, { name: 'e', x: -100, y: 100 }]
const synchronous = structuredClone(chunked)
refineRelationNeighborhoods(synchronous, localEdges, 'a')
const iterator = refineRelationNeighborhoodsInSteps(chunked, localEdges, 'a')
while (!iterator.next().done) { /* simulate a frame boundary */ }
assert.deepEqual(chunked, synchronous, 'chunked optimization preserves synchronous results')
const springNodes = structuredClone(chunked), tick = dragSprings(springNodes, localEdges, 'a')
springNodes[0].x -= 30
for (let i = 0; i < 10; i++) assert.ok(Number.isFinite(tick(3)), 'throttled avoidance stays finite')
assert.equal(springNodes[0].x, chunked[0].x - 30, 'throttled spring keeps the dragged node pinned')
const delayedNodes = [{ name: 'a', x: -100, y: 0 }, { name: 'b', x: 100, y: 0 }, { name: 'c', x: 0, y: 8 }]
const delayedTick = dragSprings(delayedNodes, [{ source: 'a', target: 'b' }], 'a', { deferRepulsionFrames: 2 })
delayedTick(); delayedTick()
assert.equal(delayedNodes[2].y, 8, 'first frames do not run node-to-link avoidance')
delayedTick()
assert.ok(delayedNodes[2].y > 8, 'node-to-link avoidance resumes after the deferred frames')
const interactiveBudget = createRelationFrameBudget(true)
let interactiveTime = 0
interactiveBudget.observe(interactiveTime, 30)
for (let i = 0; i < 8; i++) interactiveBudget.observe(interactiveTime += 33, 30)
assert.equal(interactiveBudget.level, 3, '30fps is acceptable during interaction')
for (let i = 0; i < 5; i++) interactiveBudget.observe(interactiveTime += 45, 30)
assert.equal(interactiveBudget.level, 2, 'sustained sub-30fps reduces interaction work')
const annealNodes = [{name:'n0',x:28,y:15},{name:'n1',x:115,y:22},{name:'n2',x:187,y:23},
  {name:'n3',x:289,y:17},{name:'n4',x:3,y:140},{name:'n5',x:98,y:150},
  {name:'n6',x:208,y:135},{name:'n7',x:279,y:145}]
const annealEdges = [['n3','n5'],['n3','n4'],['n3','n2'],['n1','n5'],['n3','n6'],
  ['n4','n6'],['n7','n4'],['n5','n2'],['n7','n2']].map(([source,target]) => ({ source, target }))
const greedySource = source.replace(/    \/\/ Deterministic local annealing[\s\S]*?    moving\.forEach\(\(n, i\) => \{ n\.x = bestPositions\[i\]\.x; n\.y = bestPositions\[i\]\.y \}\)\r?\n  \}/, '  }')
assert.notEqual(greedySource, source, 'greedy-only baseline removes the annealing phase')
const greedyRefine = (await import('data:text/javascript;base64,' + Buffer.from(greedySource).toString('base64'))).refineRelationNeighborhoods
const greedyNodes = structuredClone(annealNodes), improvedNodes = structuredClone(annealNodes)
greedyRefine(greedyNodes, annealEdges, 'n0')
refineRelationNeighborhoods(improvedNodes, annealEdges, 'n0')
function crossingCount(points, edges) {
  const byName = new Map(points.map(p => [p.name, p]))
  const cross = (a,b,c) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)
  let result = 0
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    const a = byName.get(edges[i].source), b = byName.get(edges[i].target), c = byName.get(edges[j].source), d = byName.get(edges[j].target)
    if (a === c || a === d || b === c || b === d) continue
    if (cross(a,b,c)*cross(a,b,d) < 0 && cross(c,d,a)*cross(c,d,b) < 0) result++
  }
  return result
}
assert.ok(crossingCount(improvedNodes, annealEdges) < crossingCount(greedyNodes, annealEdges), 'annealing escapes a greedy local crossing')
assert.deepEqual(improvedNodes[0], annealNodes[0], 'annealing retains the fixed anchor')
assert.ok(improvedNodes.every((node, i) => improvedNodes.slice(i + 1).every(other => Math.hypot(node.x - other.x, node.y - other.y) >= 38)), 'annealing retains node spacing')
const repeated = structuredClone(annealNodes)
refineRelationNeighborhoods(repeated, annealEdges, 'n0')
assert.deepEqual(repeated, improvedNodes, 'annealing is deterministic across reloads')
console.log('PASS relation crossing refinement: local movement, separation, stable graph and anchored layout')
