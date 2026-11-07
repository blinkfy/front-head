import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { realtimeActivityCard, realtimeActivitySummary } from '../src/utils/realtime-activity.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const { parse, compileScript, compileTemplate, compileStyle } = require('@vue/compiler-sfc')
const { preprocess } = require('@dcloudio/uni-cli-shared/lib/preprocess')
const babel = require('@babel/parser')

function loadSfc(relativePath) {
  const filename = path.join(root, relativePath)
  const parsed = parse(fs.readFileSync(filename, 'utf8'), { filename })
  assert.deepEqual(parsed.errors, [], `${relativePath} parses`)
  return { filename, descriptor: parsed.descriptor }
}

function method(relativePath, name, globals = {}) {
  const { filename, descriptor } = loadSfc(relativePath)
  const ast = babel.parse(descriptor.script.content, { sourceType: 'unambiguous', plugins: ['optionalChaining', 'objectRestSpread'] })
  const objectProperty = (object, property) => object?.properties?.find(item =>
    ['ObjectProperty', 'ObjectMethod'].includes(item.type) && (item.key.name === property || item.key.value === property))
  const exported = ast.program.body.find(node => node.type === 'ExportDefaultDeclaration')?.declaration
  const node = objectProperty(objectProperty(exported, 'methods')?.value, name)
  assert.ok(node, `${relativePath} method ${name} exists`)
  return vm.runInNewContext(`({${descriptor.script.content.slice(node.start, node.end)}})[${JSON.stringify(name)}]`, globals)
}

function valid(activity = 'location', extra = {}) {
  return { kind: 'realtime_activity', version: 1, activity, sessionId: 'session_1234567890', fromId: 11, toId: 22,
    createdAt: 1760000000000, ...(activity === 'call' ? { mode: 'audio', reason: 'timeout', connected: false, durationSeconds: 0 } : {}), ...extra }
}

function testRecognitionAndSummary() {
  const card = valid()
  assert.deepEqual(realtimeActivityCard({ type: 'others', content: JSON.stringify(card), senderId: 11, receiverId: 22 }), card,
    'typed others activity messages are recognized')
  assert.deepEqual(realtimeActivityCard({ type: 'text', storedType: 'others', realtimeActivity: card, senderId: 11, receiverId: 22 }), card,
    'trusted server metadata on a text envelope is recognized')
  for (const spoof of [
    { type: 'text', content: JSON.stringify(card), senderId: 11, receiverId: 22 },
    { type: 'text', realtimeActivity: card, senderId: 11, receiverId: 22 },
    { type: 'others', content: JSON.stringify(card), senderId: 99, receiverId: 22 },
    { type: 'others', content: JSON.stringify(card), senderId: 11, receiverId: 99 },
    { type: 'others', content: '{broken', senderId: 11, receiverId: 22 }
  ]) assert.equal(realtimeActivityCard(spoof), null, 'user text and mismatched participants cannot become cards')
  const missed = valid('call')
  assert.equal(realtimeActivitySummary(missed), '语音通话 · 未接来电')
  assert.equal(realtimeActivitySummary(missed, true), '语音通话 · 对方未接听')
  assert.equal(realtimeActivitySummary(valid('call', { connected: true, durationSeconds: 125 })), '语音通话 · 02:05')
  assert.equal(realtimeActivitySummary(card), '实时位置共享 · 查看共享状态')
}

function testFormattingAndListPreview() {
  const format = method('src/pages-nonTheme/chat.vue', 'formatServerMessage', {
    realtimeActivityCard, communityPostCard: () => null, getDisplayName: () => 'Sender', baseUrl: '', Date, console
  })
  const raw = { id: 31, senderId: 11, receiverId: 22, sendTime: '2026-11-01T12:00:00Z', type: 'others',
    content: JSON.stringify(valid()), Sender: { username: 'sender' } }
  const normalized = format.call({ getCurrentUserId: () => 22, otherUserId: 11, buildReviewUrl: value => value }, raw)
  assert.equal(normalized.type, 'others')
  assert.equal(normalized.receiverId, 22)
  assert.deepEqual(realtimeActivityCard(JSON.parse(JSON.stringify(normalized))), valid(), 'serialized chat cache retains typed card and receiver')
  const text = format.call({ getCurrentUserId: () => 22, otherUserId: 11 }, { ...raw, type: 'text' })
  assert.equal(text.type, 'text', 'JSON pasted as user text remains text')

  const preview = method('src/pages-nonTheme/chatlist.vue', 'formatLastMessage', {
    realtimeActivityCard, realtimeActivitySummary
  })
  assert.equal(preview.call({ getCurrentUserId: () => 22 }, normalized), '实时位置共享 · 查看共享状态')
  const callMessage = { ...normalized, content: JSON.stringify(valid('call', { connected: true, durationSeconds: 65 })) }
  assert.equal(preview.call({ getCurrentUserId: () => 22 }, callMessage), '语音通话 · 01:05')
}

function testClickActionsAndPlatformEntrypoints() {
  const activity = valid()
  const opened = []
  const open = method('src/pages-nonTheme/chat.vue', 'openRealtimeActivity', {
    realtimeActivityCard, voiceCallState: { phase: 'idle', peer: null },
    uni: { navigateTo: value => opened.push(['navigate', value.url]), showToast: () => opened.push(['toast']) }
  })
  open.call({ getCurrentUserId: () => 22, isGroupChat: false, otherUserId: 11, contactSettings: {}, otherUsername: 'Peer',
    chatTitle: '', startVoiceCall: mode => opened.push(['call', mode]), openWebCall: mode => opened.push(['web', mode]),
    showCallSupport: () => opened.push(['support'])
  }, { type: 'others', content: JSON.stringify(activity), senderId: 11, receiverId: 22 })
  assert.deepEqual(opened, [['navigate', '/pages-nonTheme/live-location?peerId=11&name=Peer&sessionId=session_1234567890']],
    'historical location entry joins only its exact stored session')
  assert.ok(!opened.some(([kind]) => kind === 'startLiveLocation'), 'historical card never starts a new location session')
  const source = fs.readFileSync(path.join(root, 'src/pages-nonTheme/chat.vue'), 'utf8')
  assert.match(source, /this\.startVoiceCall\(card\.mode\)/, 'APP-PLUS and H5 call cards use native voice call entry')
  assert.match(source, /void this\.openWebCall\(card\.mode\)/, 'MP-WEIXIN call cards use App/H5 web call entry')
}

function compileAffectedSfcFiles() {
  const platforms = [
    ['H5', { H5: true }],
    ['APP-PLUS', { APP: true, APP_PLUS: true }],
    ['MP-WEIXIN', { MP: true, MP_WEIXIN: true }]
  ]
  for (const relativePath of ['src/pages-nonTheme/components/RealtimeActivityMessage.vue', 'src/pages-nonTheme/chat.vue', 'src/pages-nonTheme/chatlist.vue']) {
    const { filename, descriptor } = loadSfc(relativePath)
    for (const [platform, context] of platforms) {
      const script = descriptor.script && { ...descriptor.script, content: preprocess(descriptor.script.content, context, { type: 'js' }) }
      const templateSource = preprocess(descriptor.template.content, context, { type: 'html' })
      const compiled = compileScript({ ...descriptor, script }, { id: `activity-${platform}-${path.basename(filename)}` })
      assert.ok(compiled.content.length, `${relativePath} script compiles for ${platform}`)
      const template = compileTemplate({ source: templateSource, filename, id: `activity-${platform}-${path.basename(filename)}` })
      assert.deepEqual(template.errors, [], `${relativePath} template compiles for ${platform}`)
    }
    for (const [index, style] of descriptor.styles.entries()) {
      const result = compileStyle({ source: style.content, filename, id: `activity-${path.basename(filename)}-${index}`, preprocessLang: style.lang })
      assert.deepEqual(result.errors, [], `${relativePath} style ${index + 1} compiles`)
    }
  }
}

compileAffectedSfcFiles()
testRecognitionAndSummary()
testFormattingAndListPreview()
testClickActionsAndPlatformEntrypoints()
console.log('realtime activity message checks passed: validation, cache formatting, previews, click routing, and affected SFCs')
