// Stage estimates never cross a business boundary or imply registration succeeded.
const stages = { image: [0, 5, 500], loading: [5, 65, 1800], initializing: [65, 80, 650],
  decoding: [80, 94, 650], registering: [94, 99, 450] }
export function roundCodePreparationText(state, value, phase) {
  if (state === 'registered') return 'APP 扫码已就绪 · 100%'
  if (!['idle', 'preparing'].includes(state)) return 'APP 扫码暂未就绪，可先用微信扫码'
  const labels = { image: '读取码图', loading: '加载资源', initializing: '初始化', decoding: '解码中', registering: '登记中' }
  return `APP 扫码暂未就绪 · ${labels[phase] || '准备中'} ${value}%`
}
export function createRoundCodePreparationProgress({ onChange, now = Date.now,
  setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let value = 0, phase = 'idle', timer, started = 0, initial = 0
  function cancel() { if (timer != null) clearTimer(timer); timer = null }
  function publish(next) { value = Math.max(value, Math.min(100, Math.floor(next))); onChange?.({ value, phase }) }
  function tick() {
    const [, end, duration] = stages[phase]
    publish(Math.min(end - 1, initial + (end - initial) * (1 - Math.exp(-(now() - started) / duration))))
    timer = setTimer(tick, 250)
  }
  return {
    update(next, fraction) {
      if (next === 'registered') { cancel(); phase = next; publish(100); return }
      if (!stages[next] || phase === 'registered') return
      const [start, end] = stages[next]
      if (stages[phase] && start < stages[phase][0]) return
      if (next === phase && fraction == null) return
      cancel(); phase = next
      if (Number.isFinite(fraction)) publish(start + (end - start) * Math.max(0, Math.min(1, fraction)))
      else publish(start)
      initial = value; started = now(); timer = setTimer(tick, 250)
    },
    stop() { cancel() },
    reset() { cancel(); value = 0; phase = 'idle'; onChange?.({ value, phase }) }
  }
}
