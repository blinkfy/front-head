export function createTimedResource(maxAge) {
  let entry = {}

  function read(load, { key, force = false } = {}) {
    if (entry.key !== key) entry = { key }
    const current = entry
    if (current.pending) return current.pending
    if (!force && current.updatedAt !== undefined && Date.now() - current.updatedAt < maxAge) {
      return Promise.resolve(current.value)
    }
    current.pending = Promise.resolve().then(load).then(value => {
      if (entry !== current) throw new Error('刷新请求已失效')
      current.value = value
      current.updatedAt = Date.now()
      return value
    }).finally(() => { current.pending = null })
    return current.pending
  }

  return {
    read,
    peek: key => entry.key === key ? entry.value : undefined,
    invalidate() { entry = { key: entry.key, value: entry.value } }
  }
}
