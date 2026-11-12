import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { shouldReturnFromCall } from '../src/utils/voice-call-core.mjs'

const source = fs.readFileSync(new URL('../src/embedded-call/main.js', import.meta.url), 'utf8')
const implementation = source.slice(source.indexOf('async function returnCompletedCall()'), source.indexOf('async function leaveCall()'))
assert.ok(implementation.length > 0)
function scenario({ hidden = false, nativeChat = false, save = Promise.resolve() } = {}) {
  const events = []
  const context = {
    state: { phase: 'ended', callId: 'completed-call', reason: 'hangup' },
    document: { hidden }, nativeChatVisit: nativeChat, disposed: false, leaving: false, returningCallId: '',
    shouldReturnFromCall,
    controller: { waitForRecordingSave() { events.push('save'); return save }, setActive: value => events.push(`controller:${value}`) },
    transport: { setActive: value => events.push(`transport:${value}`) },
    syncCatalogBeforeReturn: async () => { events.push('catalog') }, miniSdk: async () => { events.push('sdk') },
    returnToMini: () => events.push('back')
  }
  vm.createContext(context)
  vm.runInContext(implementation, context)
  return { context, events, run: () => context.returnCompletedCall() }
}

{
  const h = scenario()
  await h.run()
  assert.deepEqual(h.events, ['save', 'catalog', 'sdk', 'controller:false', 'transport:false', 'back'])
  await h.run()
  assert.equal(h.events.filter(value => value === 'back').length, 1, 'recording updates cannot navigate twice')
}
for (const options of [{ hidden: true }, { nativeChat: true }]) {
  const h = scenario(options)
  await h.run()
  assert.deepEqual(h.events, [], 'a hidden web-view cannot pop native chat above it')
  h.context.document.hidden = false
  h.context.nativeChatVisit = false
  await h.run()
  assert.equal(h.events.at(-1), 'back', 'returning to the web-view skips the ended screen')
}
for (const reason of ['connect_failed', 'disconnected', 'permission_denied', 'timeout']) {
  const h = scenario()
  h.context.state.reason = reason
  await h.run()
  assert.deepEqual(h.events, [], `${reason} remains visible`)
}
{
  let finishSave
  const h = scenario({ save: new Promise(resolve => { finishSave = resolve }) })
  const pending = h.run()
  await h.run()
  assert.deepEqual(h.events, ['save'], 'return waits for saved recording and is not duplicated')
  h.context.state = { phase: 'incoming', callId: 'new-incoming-call', reason: '' }
  finishSave()
  await pending
  assert.equal(h.events.includes('back'), false, 'a new call arriving during file save cancels navigation')
  assert.equal(h.events.includes('controller:false'), false, 'the incoming call retains its connection')
}
{
  let finishSave
  const h = scenario({ save: new Promise(resolve => { finishSave = resolve }) })
  const pending = h.run()
  h.context.document.hidden = true
  h.context.nativeChatVisit = true
  finishSave()
  await pending
  assert.equal(h.events.includes('back'), false, 'opening native chat during recording save cancels the return')
}
console.log('PASS embedded call completion, recording-save ordering, native chat visibility and new-call navigation races')
