import { relationStrokes } from './database-relation-layout.js'

self.onmessage = event => {
  const { id, nodes, edges, bends, affected } = event.data
  try {
    const keys = new Set(affected)
    const result = relationStrokes(nodes, edges, true, new Map(bends), keys)
      .filter(line => keys.has(line.key)).map(line => [line.key, line.bend || 0])
    self.postMessage({ id, result })
  } catch (error) {
    self.postMessage({ id, error: String(error?.message || error) })
  }
}
