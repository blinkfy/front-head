// One bounded alert for the current account/call. Never replay an expired call.
export function createIncomingRingtone({ driver, getOwner, enabled, changed = () => {},
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, maxDuration = 35000 }) {
  let active = null, retired = '', blocked = false
  const report = value => { if (blocked !== value) { blocked = value; changed({ blocked }) } }
  const current = item => active === item && item.owner === getOwner() && now() < item.deadline
  function stop(retire = false) {
    const item = active
    active = null
    if (item) { clearTimer(item.timer); if (retire) retired = `${item.owner}:${item.id}` }
    driver.stop(); report(false)
  }
  function play(item, retry = false) {
    if (!current(item) || !enabled() || item.pending || (item.attempted && !retry)) return
    item.attempted = true; item.pending = true
    let result
    // Keep play() inside an explicit retry's user gesture (no microtask first).
    try { result = driver.play(() => current(item) && enabled()) } catch (error) { result = Promise.reject(error) }
    Promise.resolve(result).then(() => { if (current(item)) report(false) }, () => { if (current(item) && enabled()) report(true) })
      .finally(() => { item.pending = false })
  }
  function tick(item) {
    if (!current(item)) { if (active === item) stop(true); return }
    if (!enabled()) { if (item.attempted) driver.stop(); item.attempted = false; report(false) }
    else play(item)
    item.timer = setTimer(() => tick(item), Math.min(500, Math.max(1, item.deadline - now())))
  }
  return {
    update(state) {
      const owner = getOwner()
      if (state.phase !== 'incoming' || !state.callId || !owner) { stop(); retired = ''; return }
      if (active?.id === state.callId && active.owner === owner) return
      stop()
      const key = `${owner}:${state.callId}`
      if (retired === key) return
      active = { id: state.callId, owner, deadline: now() + maxDuration, timer: null, pending: false, attempted: false }
      tick(active)
    },
    retry() { if (enabled()) driver.unlock?.(); if (active) play(active, true); else if (enabled()) driver.prime?.() },
    stop() { stop(true) },
    state: () => ({ blocked, callId: active?.id || '' })
  }
}
