// Foreground-only cooperative decoder. Transport and platform adapters stay outside this module.
export function createRoundCodeWorker({ claim, decode, register, isActive = () => true,
  getIdentity = () => '', now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout,
  idleMs = 8000, retryMs = 30000, onResult = () => {} }) {
  let running = false, stopped = false, unavailable = false, busy = false, epoch = 0, timer = null, failures = 0
  const current = (generation, identity) => !stopped && generation === epoch && isActive() && getIdentity() === identity
  const report = result => { try { onResult(result) } catch (_) {} return result }
  function schedule(delay) {
    if (timer !== null) clearTimer(timer)
    timer = null
    if (running && !stopped && !unavailable && isActive()) timer = setTimer(() => { timer = null; void tick() }, delay)
  }
  function validTask(task) {
    return task && typeof task.id === 'string' && task.id.length > 0 && task.id.length <= 128
      && typeof task.ticket === 'string' && /^[a-f0-9]{64}$/i.test(task.ticket)
      && Number.isFinite(task.expiresAt) && task.expiresAt > now()
      && typeof task.imageBase64 === 'string' && task.imageBase64.length > 0 && task.imageBase64.length <= 699052
      && ['image/png', 'image/jpeg'].includes(task.mime)
  }
  function validRaw(raw) {
    if (typeof raw !== 'string' || raw.length < 12 || raw.length > 4096 || raw.length % 4 !== 0
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return false
    // Enforce unused padding bits too, without Buffer/atob (not portable to all uni-app runtimes).
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    return raw.endsWith('==') ? alphabet.indexOf(raw[raw.length - 3]) % 16 === 0
      : raw.endsWith('=') ? alphabet.indexOf(raw[raw.length - 2]) % 4 === 0 : true
  }
  async function perform(task, generation, identity) {
    if (!current(generation, identity)) return { status: 'inactive' }
    if (!validTask(task)) return { status: 'expired' }
    let result = await decode(task.imageBase64)
    if (!current(generation, identity)) return { status: 'inactive' }
    if (typeof result === 'string') { try { result = JSON.parse(result) } catch (_) { return { status: 'failed' } } }
    if (['UNAVAILABLE', 'UNSUPPORTED'].includes(result?.error)) {
      unavailable = true; return { status: 'unsupported' }
    }
    if (result?.error === 'BUSY') return { status: 'busy' }
    if (result?.scanType !== 'WX_CODE' || result.error || !validRaw(result.rawBase64)) return { status: 'ignored' }
    if (!validTask(task)) return { status: 'expired' }
    await register({ taskId: task.id, ticket: task.ticket, rawBase64: result.rawBase64 })
    return current(generation, identity) ? { status: 'registered', taskId: task.id } : { status: 'inactive' }
  }
  async function run(task, fetchTask) {
    if (busy) return { status: 'busy' }
    if (stopped || !isActive()) return { status: 'inactive' }
    if (unavailable) return { status: 'unsupported' }
    busy = true
    const generation = epoch, identity = getIdentity()
    try {
      if (fetchTask) {
        const response = await claim()
        if (!current(generation, identity)) return { status: 'inactive' }
        task = response?.data?.task ?? response?.task ?? null
        if (!task) return { status: 'idle' }
      }
      return await perform(task, generation, identity)
    } catch (error) {
      const httpStatus = error?.httpStatus || error?.statusCode
      const status = Number(httpStatus) >= 400 ? Number(httpStatus) : Number(error?.code)
      const reason = error?.reason || error?.data?.reason
      if ([401, 403, 404, 405, 501].includes(status) || ['ROUND_CODE_UNSUPPORTED', 'WORKER_UNAVAILABLE'].includes(reason)) {
        unavailable = true; return { status: 'unsupported' }
      }
      return { status: 'failed' }
    }
    finally { busy = false }
  }
  async function tick() {
    if (!running || stopped) return
    const generation = epoch
    const result = report(await run(null, true))
    if (generation !== epoch || !running || stopped) return
    failures = result.status === 'failed' ? failures + 1 : 0
    schedule(result.status === 'failed' ? Math.min(60000, retryMs * Math.max(1, failures))
      : result.status === 'registered' ? 1000 : result.status === 'busy' ? 5000 : idleMs)
  }
  return {
    start() {
      if (running && !stopped) return
      stopped = false; unavailable = false; running = true; failures = 0; epoch++
      schedule(0)
    },
    stop() {
      stopped = true; running = false; epoch++
      if (timer !== null) clearTimer(timer)
      timer = null
    },
    async processTask(task) { return report(await run(task, false)) },
    get busy() { return busy },
    get available() { return !unavailable }
  }
}
