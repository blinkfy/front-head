import assert from 'node:assert/strict'
import { createMiniCallInbox } from '../src/utils/mini-call-inbox.mjs'

const offer = { type: 'voice.alert', callId: 'mini_incoming_1234', mode: 'video', peer: { id: 2, name: '分投侠官方' } }
function setup() {
  const sent = [], opened = [], state = {}, timers = new Map()
  let token = 'account-a', shown = 0, resolveEntry
  const inbox = createMiniCallInbox({ state, send: event => sent.push(event), identity: () => ({ token, id: 1 }),
    show: () => { shown++ }, open: async url => opened.push(url), entry: () => new Promise(resolve => { resolveEntry = resolve }),
    setTimer: fn => { timers.set(fn, true); return fn }, clearTimer: id => timers.delete(id) })
  return { inbox, sent, opened, state, timers, shown: () => shown, switchAccount: () => { token = 'account-b' }, entry: url => resolveEntry(url) }
}
{
  const h = setup()
  h.inbox.foreground(true); h.inbox.connection({})
  h.inbox.handle(offer)
  assert.equal(h.shown(), 0, 'old servers never enable the incoming-only protocol')
  assert.equal(h.sent.length, 0)
  h.inbox.connection({ voiceIncomingVersion: 1 })
  assert.equal(h.sent.at(-1).type, 'voice.listen')
  h.inbox.handle(offer); h.inbox.handle(offer)
  assert.equal(h.shown(), 1, 'duplicate alert does not stack pages')
  assert.equal(h.state.peer.name, '分投侠官方')
  const accepting = h.inbox.accept()
  await h.inbox.accept()
  h.entry('https://example.test/web/call/#?incomingCallId=' + offer.callId)
  await accepting
  assert.equal(h.opened.length, 1)
  assert.ok(h.sent.every(event => !['voice.accept', 'voice.invite'].includes(event.type)), 'mini client never accepts media or starts a second call')
}
for (const change of ['cancel', 'background', 'account']) {
  const h = setup()
  h.inbox.foreground(true); h.inbox.connection({ voiceIncomingVersion: 1 }); h.inbox.handle(offer)
  const accepting = h.inbox.accept()
  if (change === 'cancel') h.inbox.handle({ type: 'voice.alert-ended', callId: offer.callId })
  if (change === 'background') h.inbox.foreground(false)
  if (change === 'account') h.switchAccount()
  h.entry('https://example.test/call')
  await accepting
  assert.equal(h.opened.length, 0, `${change} invalidates a pending handoff`)
}
{
  const h = setup()
  h.inbox.foreground(true); h.inbox.connection({ voiceIncomingVersion: 1 }); h.inbox.handle(offer); h.inbox.reject()
  assert.deepEqual(h.sent.at(-1), { type: 'voice.alert-reject', callId: offer.callId })
  assert.equal(h.state.callId, '')
  assert.equal(h.timers.size, 0)
}
console.log('PASS mini foreground call alerts, deduplication, rejection, account/visibility safety and single handoff')
