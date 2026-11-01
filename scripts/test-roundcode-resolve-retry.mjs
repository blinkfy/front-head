import assert from 'node:assert/strict'
import { resolveRoundCodeWithRetry } from '../src/utils/roundcode-resolve-retry.mjs'

const pending = reason => Object.assign(new Error('pending'), { reason })
const retryDelays = [400, 800]

{
  let requests = 0, waits = [], notices = []
  const value = await resolveRoundCodeWithRetry(async () => {
    requests++
    if (requests <= retryDelays.length) throw pending('ROUND_CODE_PENDING_REGISTRATION')
    return { sessionId: 'resolved' }
  }, { onPending: attempt => notices.push(attempt), wait: async delay => waits.push(delay) })
  assert.deepEqual(value, { sessionId: 'resolved' })
  assert.equal(requests, 3, 'unknown registration support gets only three total requests')
  assert.deepEqual(waits, retryDelays)
  assert.deepEqual(notices, [1, 2])
  assert.equal(waits.reduce((sum, delay) => sum + delay, 0), 1200, 'an unsupported display never incurs the previous 24-second backoff')
}

{
  let requests = 0, waits = 0
  await assert.rejects(resolveRoundCodeWithRetry(async () => {
    requests++; throw pending('ROUND_CODE_PENDING_REGISTRATION')
  }, { wait: async () => { waits++ } }), error => error.reason === 'ROUND_CODE_PENDING_REGISTRATION')
  assert.equal(requests, 3); assert.equal(waits, 2)
}

for (const error of [pending('AUTH_REQUIRED'), pending('ROUND_CODE_EXPIRED'),
  Object.assign(new Error('not found'), { httpStatus: 404 }), pending('OTHER')]) {
  let requests = 0, waits = 0
  await assert.rejects(resolveRoundCodeWithRetry(async () => { requests++; throw error },
    { wait: async () => { waits++ } }), caught => caught === error)
  assert.equal(requests, 1); assert.equal(waits, 0)
}

{
  let requests = 0, waits = [], active = true
  const result = await resolveRoundCodeWithRetry(async () => {
    requests++
    if (requests === 1) throw { data: { reason: 'ROUND_CODE_PENDING_REGISTRATION' } }
    return 'ready'
  }, { isActive: () => active, wait: async delay => { waits.push(delay); active = false } })
  assert.equal(result, null); assert.equal(requests, 1); assert.deepEqual(waits, [400], 'account or page change during wait prevents another request')
}

{
  let requests = 0
  const result = await resolveRoundCodeWithRetry(async () => { requests++; return 'resolved' }, { isActive: () => false })
  assert.equal(result, null); assert.equal(requests, 0)
}

{
  let requests = 0, delays = []
  const value = await resolveRoundCodeWithRetry(async () => {
    requests++
    if (requests === 1) throw pending('ROUND_CODE_UNSUPPORTED')
    return 'legacy-compatible'
  }, { wait: async delay => delays.push(delay) })
  assert.equal(value, 'legacy-compatible'); assert.equal(requests, 2); assert.deepEqual(delays, [400])
}

console.log('PASS bounded generated-roundcode pending retries, cancellation guards and legacy reason compatibility')
