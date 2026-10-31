import assert from 'node:assert/strict'
import { createRoundCodePreparationProgress, roundCodePreparationText } from '../src/utils/roundcode-preparation-progress.mjs'

let time = 0, sequence = 0, latest
const timers = new Map()
const model = createRoundCodePreparationProgress({ now: () => time, onChange: next => { latest = next },
  setTimer(callback, delay) { const id = ++sequence; timers.set(id, { at: time + delay, callback }); return id },
  clearTimer: id => timers.delete(id) })
function advance(ms) {
  const end = time + ms
  while (true) {
    const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0]
    if (!next || next[1].at > end) break
    time = next[1].at; timers.delete(next[0]); next[1].callback()
  }
  time = end
}
model.reset(); assert.deepEqual(latest, { value: 0, phase: 'idle' })
model.update('loading'); advance(1000)
assert(latest.value >= 30 && latest.value < 65, 'loading estimate advances promptly without crossing its stage')
model.reset()
model.update('loading'); advance(5000); const first = latest.value - 5
advance(5000); const second = latest.value - 5 - first
assert(first > 0 && second > 0 && second <= first, 'estimates approach the stage limit more slowly')
advance(120000); assert(latest.value < 65, 'time alone cannot complete the loading stage')
model.update('loading', 1); assert.equal(latest.value, 65, 'real resource completion may complete its stage')
model.update('initializing'); advance(120000); assert(latest.value < 80)
model.update('loading', 0.1); assert.equal(latest.phase, 'initializing', 'stale phases never move progress backwards')
model.update('decoding'); advance(120000); assert(latest.value < 94)
model.update('registering'); advance(120000); assert(latest.value < 99)
const frozen = latest.value; model.stop(); advance(2000); assert.equal(latest.value, frozen); assert.equal(timers.size, 0)
model.update('registered'); assert.deepEqual(latest, { value: 100, phase: 'registered' }); assert.equal(timers.size, 0)
model.update('loading'); assert.equal(latest.value, 100)
model.reset(); model.update('image'); assert.equal(latest.value, 0); assert.equal(timers.size, 1)
model.stop(); assert.equal(timers.size, 0)
assert.match(roundCodePreparationText('preparing', 82, 'decoding'), /82%/)
assert.match(roundCodePreparationText('failed', 82, 'decoding'), /暂未就绪/)
assert(!roundCodePreparationText('failed', 82, 'decoding').includes('100%'))
assert.match(roundCodePreparationText('registered', 100, 'registered'), /已就绪 · 100%/)
console.log('PASS bounded asymptotic stage estimates, actual completion, monotonicity, success-only 100%, timer cleanup and status text')
