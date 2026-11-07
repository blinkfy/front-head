import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../src/pages-nonTheme/chat/audio-methods.js', import.meta.url), 'utf8')

function preprocess(input, platform) {
  const output = [], stack = [true]
  for (const line of input.split(/\r?\n/)) {
    const marker = line.match(/^\s*\/\/\s*#(ifdef|ifndef|endif)\s*(.*)$/)
    if (!marker) { if (stack.at(-1)) output.push(line); continue }
    const [, kind, expression] = marker
    if (kind === 'endif') stack.pop()
    else {
      const active = expression.split('||').map(value => value.trim()).includes(platform)
      stack.push(stack.at(-1) && (kind === 'ifdef' ? active : !active))
    }
  }
  assert.deepEqual(stack, [true])
  return output.join('\n').replace(/^import .*$/gm, '').replace(/^export const /gm, 'const ')
}

function load(platform, permissions) {
  const starts = [], toasts = []
  const recorderManager = { start: options => starts.push(options), stop() {} }
  const context = {
    uni: { getStorageSync: key => key === 'token' ? 'owner' : '', showToast: value => toasts.push(value) },
    ensureFeaturePermission: (_kind, { isCurrent }) => permissions.shift()(isCurrent),
    chatApi: {}, baseUrl: '', console, Promise, Set, Map, Object, Array, String, Number, Error, JSON, setInterval, clearInterval
  }
  vm.createContext(context)
  const code = preprocess(source, platform) + '\nglobalThis.__methods = voiceRecordingMethods'
  vm.runInContext(code, context)
  const page = {
    recorderManager, recordHeld: false, recordAttempt: 0, recordPermissionPending: false, isRecording: false,
    isCancelVoice: false, isChatPageDestroyed: false, isChatPageActive: true
  }
  return { page, methods: context.__methods, starts, toasts, setPermission(value) { permissions.push(value) } }
}

function deferredPermission() {
  let resolve
  const promise = new Promise(yes => { resolve = yes })
  return { promise, resolve }
}

for (const platform of ['APP-PLUS', 'MP-WEIXIN']) {
  // Releasing the press while the system prompt is open invalidates that
  // attempt; a late grant must not start a background recording.
  const late = deferredPermission()
  const h = load(platform, [current => late.promise.then(granted => granted && current())])
  const pending = h.methods.startRecord.call(h.page, { touches: [{ clientY: 100 }] })
  assert.equal(h.page.recordPermissionPending, true)
  h.methods.stopRecord.call(h.page)
  late.resolve(true)
  await pending
  assert.equal(h.starts.length, 0, `${platform}: late grant after touch end does not start recording`)
  assert.equal(h.page.recordPermissionPending, false)

  // An ordinary denial does not lock the next explicit press out.
  const retry = load(platform, [async () => false, async current => current()])
  await retry.methods.startRecord.call(retry.page, { touches: [{ clientY: 90 }] })
  assert.equal(retry.starts.length, 0)
  assert.equal(retry.page.recordPermissionPending, false)
  await retry.methods.startRecord.call(retry.page, { touches: [{ clientY: 90 }] })
  assert.equal(retry.starts.length, 1, `${platform}: a new press requests permission and starts after grant`)
  assert.equal(retry.starts[0].duration, 60000)

  const stale = deferredPermission()
  const exited = load(platform, [current => stale.promise.then(granted => granted && current())])
  const exitPending = exited.methods.startRecord.call(exited.page, { touches: [{ clientY: 80 }] })
  exited.page.isChatPageActive = false
  stale.resolve(true)
  await exitPending
  assert.equal(exited.starts.length, 0, `${platform}: page exit invalidates a pending microphone grant`)
}

console.log('Chat recording App/MP permission retry and stale-attempt tests passed.')
