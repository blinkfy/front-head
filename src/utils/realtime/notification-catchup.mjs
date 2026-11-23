const kinds = ['direct', 'group', 'system']
const numericId = value => /^\d{1,20}$/.test(String(value)) ? String(value).replace(/^0+(?=\d)/, '') : '0'
const greater = (left, right) => left.length > right.length || (left.length === right.length && left > right)

// There is no polling timer. The app lifecycle and existing socket connection
// invoke check(); local watermarks prevent replaying the same unread messages.
export function createNotificationCatchup({ getToken, request, readState, writeState, notify, now = Date.now }) {
  let active = false, version = 0, pending = null
  const attempts = new Map()
  const memory = new Map()
  const stateKey = userId => `notification:catchup:v1:${userId}`
  function read(userId) {
    userId = String(userId)
    if (memory.has(userId)) return memory.get(userId)
    try {
      const state = readState(stateKey(userId))
      return state && typeof state === 'object' && !Array.isArray(state) ? state : {}
    } catch (_) { return {} }
  }
  function write(userId, state) {
    userId = String(userId)
    if (memory.size >= 16) memory.delete(memory.keys().next().value)
    memory.set(userId, state)
    try { writeState(stateKey(userId), state) } catch (_) { /* Storage failure must not block the app. */ }
  }
  async function check() {
    if (!active) return
    const account = getToken(), generation = version
    if (!account) return
    let task
    if (pending?.account === account) task = pending.task
    else {
      if (now() - (attempts.get(account) ?? -Infinity) < 60000) return
      if (attempts.size >= 8) attempts.delete(attempts.keys().next().value)
      attempts.set(account, now())
      task = Promise.resolve().then(() => request(account))
      pending = { account, task }
      task.finally(() => { if (pending?.task === task) pending = null }).catch(() => {})
    }
    try {
      const summary = await task
      if (!active || generation !== version || account !== getToken() || !/^[1-9]\d*$/.test(String(summary?.userId || ''))) return
      const state = read(summary.userId), next = { ...state }
      const fresh = {}
      for (const kind of kinds) {
        const latest = numericId(summary[kind]), previous = numericId(state[kind] || '0')
        fresh[kind] = greater(latest, previous)
        if (fresh[kind]) {
          next[kind] = latest
          next.summarized = { ...next.summarized, [kind]: latest }
        }
      }
      if (!kinds.some(kind => fresh[kind])) return
      // Persist before notifying: repeated resume/connected callbacks share the watermark.
      write(summary.userId, next)
      notify({ chat: fresh.direct || fresh.group, system: fresh.system, account })
    } catch (_) { /* Offline/older backends remain usable; retry on a later resume. */ }
  }
  return {
    check,
    setActive(value) { active = !!value; version++; if (active) void check() },
    seen(userId, kind, id) {
      if (!active || !/^[1-9]\d*$/.test(String(userId || '')) || !kinds.includes(kind)) return true
      const state = read(userId), latest = numericId(id)
      if (greater(latest, numericId(state[kind] || '0'))) write(userId, { ...state, [kind]: latest })
      // Only a summary suppresses late realtime events. Two realtime events may
      // arrive out of ID order from different conversations and both deserve alerts.
      return greater(latest, numericId(state.summarized?.[kind] || '0'))
    }
  }
}
