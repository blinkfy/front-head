import assert from 'node:assert/strict'
import { createIncomingRingtone } from '../src/utils/incoming-ringtone-core.mjs'

function setup({ duration = 35000, active = true, owner = 'account-1' } = {}) {
  let time = 1000
  let nextTimer = 1
  let ownerValue = owner
  let enabled = active
  const timers = new Map()
  const calls = { plays: [], stops: 0, primes: 0, changes: [] }
  let playResult = Promise.resolve()
  const ringtone = createIncomingRingtone({
    driver: {
      play(canStart) { calls.plays.push({ canStart }); return playResult },
      stop() { calls.stops++ },
      prime() { calls.primes++ },
    },
    getOwner: () => ownerValue,
    enabled: () => enabled,
    changed: value => calls.changes.push(value),
    now: () => time,
    setTimer(callback, delay) { const id = nextTimer++; timers.set(id, { callback, at: time + delay }); return id },
    clearTimer(id) { timers.delete(id) },
    maxDuration: duration,
  })
  const update = (phase = 'incoming', callId = 'call-1') => ringtone.update({ phase, callId })
  const advance = async ms => {
    const end = time + ms
    while (true) {
      const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      const [id, timer] = due
      timers.delete(id)
      time = timer.at
      timer.callback()
      await flush()
    }
    time = end
    await flush()
  }
  return {
    ringtone, calls, update, advance,
    setEnabled(value) { enabled = value },
    setOwner(value) { ownerValue = value },
    setPlayResult(value) { playResult = value },
    time: () => time,
    timerCount: () => timers.size,
  }
}

const flush = async () => { await Promise.resolve(); await Promise.resolve() }

async function run() {
  {
    const test = setup()
    test.update()
    await flush()
    assert.equal(test.calls.plays.length, 1, 'incoming starts one ringtone attempt')
    const deadline = test.time() + 35000
    test.update('incoming', 'call-1')
    await test.advance(4000)
    test.update('incoming', 'call-1')
    assert.equal(test.calls.plays.length, 1, 'same incoming call updates do not restart playback')
    assert.ok(test.ringtone.state().callId === 'call-1')
    await test.advance(deadline - test.time())
    assert.equal(test.ringtone.state().callId, '', 'ringtone expires at its original 35 second deadline')
    assert.ok(test.calls.stops > 0, 'expired ringtone is stopped')
  }

  {
    const test = setup({ active: false })
    test.update()
    assert.equal(test.calls.plays.length, 0, 'disabled sound does not start playback')
    test.setEnabled(true)
    await test.advance(500)
    assert.equal(test.calls.plays.length, 1, 'reenabling sound starts playback during the active deadline')
    test.setEnabled(false)
    await test.advance(500)
    assert.ok(test.calls.stops > 0, 'disabling sound stops the active ringtone')
    test.setEnabled(true)
    await test.advance(500)
    assert.equal(test.calls.plays.length, 2, 'reenabling sound resumes within the original deadline')
    test.update('idle', 'call-1')
    assert.equal(test.ringtone.state().callId, '', 'leaving incoming state clears the ringtone')
  }

  {
    const test = setup()
    test.setPlayResult(Promise.reject(new Error('autoplay blocked')))
    test.update()
    await flush()
    assert.deepEqual(test.ringtone.state(), { blocked: true, callId: 'call-1' }, 'autoplay rejection reports blocked state')
    test.setPlayResult(Promise.resolve())
    test.ringtone.retry()
    assert.equal(test.calls.plays.length, 2, 'manual retry makes another play attempt')
    await flush()
    assert.equal(test.ringtone.state().blocked, false, 'successful manual retry clears blocked state')
    test.update('idle', 'call-1')
    test.ringtone.retry()
    assert.equal(test.calls.primes, 1, 'retry without an active call primes audio for the next user gesture')
  }

  for (const phase of ['connecting', 'connected', 'idle', 'ended', 'rejected', 'cancelled']) {
    const test = setup()
    test.update()
    await flush()
    test.update(phase, 'call-1')
    assert.equal(test.ringtone.state().callId, '', `${phase} ends incoming playback`)
    assert.equal(test.timerCount(), 0, `${phase} clears the scheduled ringtone timer`)
  }

  {
    const test = setup({ duration: 1000 })
    test.update()
    await flush()
    await test.advance(1000)
    assert.equal(test.ringtone.state().callId, '', 'expired incoming call is cleared')
    test.update('incoming', 'call-1')
    assert.equal(test.calls.plays.length, 1, 'the same expired call cannot restart after its deadline')
  }

  {
    const test = setup()
    test.update()
    await flush()
    test.setOwner('account-2')
    test.update('incoming', 'call-1')
    await flush()
    assert.equal(test.calls.plays.length, 2, 'owner change starts playback for the new account')
    assert.equal(test.ringtone.state().callId, 'call-1')
  }

  {
    const test = setup()
    test.update()
    await flush()
    test.setOwner('account-2')
    await test.advance(500)
    assert.equal(test.ringtone.state().callId, '', 'owner change stops playback on the next timer tick without another update')
  }

  {
    let resolveLate
    const test = setup()
    test.setPlayResult(new Promise(resolve => { resolveLate = resolve }))
    test.update()
    test.update('idle', 'call-1')
    resolveLate()
    await flush()
    assert.equal(test.ringtone.state().callId, '', 'late play promise cannot restore a ringtone after the call ends')
    assert.equal(test.ringtone.state().blocked, false)
  }

  console.log('Incoming ringtone core tests passed.')
}

run().catch(error => { console.error(error); process.exitCode = 1 })
