import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const apiSource = readFileSync(new URL('../src/api/recognize.js', import.meta.url), 'utf8')
  .replace(/^import .*\r?\n/gm, '')
  .replace(/^export /gm, '')
  .concat('\nthis.recognizeImage = recognizeImage')

function createHarness({ h5 = false } = {}) {
  const timers = new Map()
  const pollRequests = []
  const toasts = []
  const abortControllers = []
  let nextTimerId = 0
  let uploadOptions = null
  let fetchCalls = []
  let token = 'session-token'
  class TestFile {}
  class TestFormData {
    constructor() { this.entries = [] }
    append(...entry) { this.entries.push(entry) }
  }
  class TestAbortController {
    constructor() {
      this.signal = { aborted: false }
      this.abortCount = 0
      abortControllers.push(this)
    }
    abort() { this.abortCount++; this.signal.aborted = true }
  }
  const context = {
    baseUrl: 'https://example.test',
    request: () => {},
    File: TestFile,
    FormData: TestFormData,
    AbortController: TestAbortController,
    console: { error() {}, warn() {} },
    setTimeout(callback, delay) {
      const id = ++nextTimerId
      timers.set(id, { callback, delay })
      return id
    },
    clearTimeout(id) { timers.delete(id) },
    fetch: (...args) => new Promise((resolve, reject) => fetchCalls.push({ args, resolve, reject })),
    uni: {
      getStorageSync(key) { return key === 'token' ? token : '' },
      getDeviceInfo: () => ({ platform: h5 ? 'web' : 'android' }),
      getAppBaseInfo: () => ({ uniPlatform: h5 ? 'web' : 'mp-weixin' }),
      uploadFile(options) { uploadOptions = options },
      request(options) { pollRequests.push(options) },
      showToast(options) { toasts.push(options) }
    }
  }
  runInNewContext(apiSource, context, { filename: 'recognize.js' })
  const file = h5 ? runInNewContext('new File()', context) : '/tmp/recognition.jpg'
  return {
    recognizeImage: context.recognizeImage,
    file,
    timers,
    pollRequests,
    toasts,
    abortControllers,
    get fetchCalls() { return fetchCalls },
    get uploadOptions() { return uploadOptions },
    getToken() { return token },
    fireTimer(timer) {
      const entry = [...timers.entries()].find(([, candidate]) => candidate === timer)
      assert.ok(entry, 'timer should still be pending')
      timers.delete(entry[0])
      timer.callback()
    },
    fireFirstTimer() {
      const first = timers.entries().next()
      assert.equal(first.done, false, 'expected a pending timer')
      const [id, timer] = first.value
      timers.delete(id)
      timer.callback()
      return timer
    },
    timersWithDelay(delay) { return [...timers.values()].filter(timer => timer.delay === delay) },
    respondToLatestPoll(response) {
      const options = pollRequests.at(-1)
      assert.ok(options, 'expected a progress poll request')
      options.success(response)
      options.complete?.()
    },
    failLatestPoll(error = new Error('network offline')) {
      const options = pollRequests.at(-1)
      assert.ok(options, 'expected a progress poll request')
      options.fail(error)
      options.complete?.()
    }
  }
}

async function flushMicrotasks() {
  for (let index = 0; index < 6; index++) await Promise.resolve()
}

async function verifyPollRetriesTransientFailures() {
  const harness = createHarness()
  const snapshots = []
  const recognition = harness.recognizeImage('/tmp/poll-retry.jpg', { onProgress: value => snapshots.push(value) })
  harness.fireFirstTimer()
  harness.failLatestPoll()
  const retryAfterNetwork = harness.fireFirstTimer()
  assert.ok(retryAfterNetwork.delay <= 5000, 'network retry delay is bounded to five seconds')
  harness.respondToLatestPoll({ statusCode: 503, data: { code: 1 } })
  const retryAfterServerError = harness.fireFirstTimer()
  assert.ok(retryAfterServerError.delay <= 5000, '5xx retry delay is bounded to five seconds')
  harness.respondToLatestPoll({
    statusCode: 200,
    data: { code: 0, data: { revision: 4, status: 'pending', phase: 'recognizing' } }
  })
  assert.deepEqual(snapshots.map(value => value.revision), [4], 'polling recovers and publishes the next valid snapshot')
  harness.uploadOptions.success({ data: JSON.stringify({ code: 0, data: { id: 1 } }) })
  assert.equal((await recognition).id, 1)
  assert.equal(harness.timers.size, 0, 'POST settlement clears remaining poll timers')
}

async function verifyUnauthorizedStopsOptionalPolling() {
  for (const statusCode of [401, 403]) {
    const harness = createHarness()
    const recognition = harness.recognizeImage('/tmp/poll-auth.jpg', { onProgress: () => assert.fail('unauthorized response must not publish progress') })
    harness.fireFirstTimer()
    harness.respondToLatestPoll({ statusCode, data: { code: 1 } })
    assert.equal(harness.timers.size, 0, `${statusCode} stops optional progress polling`)
    harness.uploadOptions.success({ data: JSON.stringify({ code: 0, data: { id: statusCode } }) })
    assert.equal((await recognition).id, statusCode, 'progress auth failure does not fail the authoritative POST')
  }
}

async function verifyH5WatchdogAbortsAndIgnoresLateResponse() {
  const harness = createHarness({ h5: true })
  let settlements = 0
  let rejection
  const recognition = harness.recognizeImage(harness.file, { onProgress: () => assert.fail('late response must not publish progress') })
    .then(value => { settlements++; return value }, error => { settlements++; rejection = error; throw error })
  const observed = recognition.catch(() => {})
  assert.equal(harness.fetchCalls.length, 1, 'H5 File upload starts through fetch')
  assert.equal(harness.fetchCalls[0].args[1].signal, harness.abortControllers[0].signal, 'fetch receives the watchdog AbortSignal')
  const watchdog = [...harness.timers.values()].find(timer => timer.delay === 600000)
  assert.ok(watchdog, 'H5 upload has a 600000ms watchdog')
  harness.fireTimer(watchdog)
  await observed
  assert.equal(settlements, 1, 'watchdog rejects the recognition promise only once')
  assert.equal(harness.abortControllers[0].abortCount, 1, 'watchdog aborts the in-flight fetch once')
  assert.ok(rejection && typeof rejection.message === 'string', 'watchdog rejects with an error')

  harness.fetchCalls[0].resolve({ ok: true, json: async () => ({ code: 0, data: { id: 'late' } }) })
  await flushMicrotasks()
  assert.equal(settlements, 1, 'late fetch success cannot settle the promise a second time')
  assert.equal(harness.toasts.length, 0, 'late fetch success has no user-visible effect after timeout')
}

await verifyPollRetriesTransientFailures()
await verifyUnauthorizedStopsOptionalPolling()
await verifyH5WatchdogAbortsAndIgnoresLateResponse()
console.log('3 UX resilience checks passed')
