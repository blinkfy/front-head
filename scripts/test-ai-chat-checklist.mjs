import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { CHECKLIST_CATEGORIES, CHECKLIST_GUIDES, checklistText, isChecklistItemCheckable, normalizeChatChecklist } from '../src/pages-nonTheme/utils/ai-chat-checklist.mjs'
import { normalizeChatBusinessCards } from '../src/pages-nonTheme/utils/ai-chat-business.mjs'

const require = createRequire(import.meta.url)
const { parse, compileScript, compileTemplate, compileStyle } = require('@vue/compiler-sfc')
const root = new URL('../src/pages-nonTheme/', import.meta.url)
const read = name => fs.readFileSync(new URL(name, root), 'utf8')
const page = read('ai-chat.vue')
const businessSource = read('components/ChatBusinessCards.vue')
const checklistSource = read('components/ChatDisposalChecklist.vue')

function takeFunction(source, name) {
  let start = source.indexOf(`function ${name}(`)
  if (source.slice(start - 6, start) === 'async ') start -= 6
  assert(start >= 0, `missing ${name}`)
  const next = source.slice(start + 1).search(/\n(?:async )?function [\w$]+\(/)
  return source.slice(start, next < 0 ? source.length : start + 1 + next)
}

function unipreprocess(source, platform) {
  const stack = [true]
  return source.split('\n').filter(line => {
    const directive = /(?:\/\/|\/\*|<!--)\s*#(ifdef|ifndef)\s+([\w-]+)\s*(?:\*\/|-->)?/.exec(line)
    if (directive) {
      const symbol = directive[2]
      const matches = symbol === platform || (symbol === 'MP' && platform.startsWith('MP-'))
      stack.push(stack.at(-1) && (directive[1] === 'ifdef' ? matches : !matches))
      return false
    }
    if (/(?:\/\/|\/\*|<!--)\s*#endif\s*(?:\*\/|-->)?/.test(line)) { stack.pop(); return false }
    return stack.at(-1)
  }).join('\n')
}

// Pure normalization and display contract: invalid fields cannot leak into cards/text.
const entry = (key, category, extra = {}) => ({ key, sourceId: key.split(':')[0], name: `物品${key}`, category, originalCategory: category, confidence: 0.9, ...extra })
const rawChecklist = { recordCount: 5, items: CHECKLIST_CATEGORIES.map((category, i) => entry(`${i + 1}:1`, category)) }
const normalized = normalizeChatChecklist(rawChecklist)
assert.equal(normalized.items.length, 5)
assert.deepEqual(normalized.items.map(item => item.category), CHECKLIST_CATEGORIES)
assert.equal(normalizeChatChecklist({ items: [{ ...entry('1:1', '有害垃圾'), sourceId: '2' }] }), null, 'source ID must match the key')
const badFields = normalizeChatChecklist({ recordCount: 99, items: [
  { ...entry('1:1', 'invalid', { confidence: Infinity, reviewReason: 8 }), injected: true },
  { ...entry('1:2', '有害垃圾', { confidence: 1.4, reviewReason: ' 需核对 ' }) }
] })
assert.equal(badFields.recordCount, 5)
assert.equal(badFields.items[0].category, '待确认')
assert.equal(badFields.items[0].confidence, null)
assert.equal(badFields.items[0].reviewReason, '识别信息不够明确，请核对后再处理。')
assert.equal(badFields.items[1].confidence, null)
assert.equal(badFields.items[1].reviewReason, '需核对')
assert(!('injected' in badFields.items[0]))
assert.equal(normalizeChatBusinessCards([{ type: 'checklist', id: 'bad', title: '坏卡片' }]).length, 0, 'invalid checklist card is dropped for body fallback')
assert.deepEqual(normalizeChatBusinessCards([{ type: 'unknown', id: 'x', title: '忽略' }]), [])
const fallbackBody = '正文仍然可见'
const normalizeCards = normalizeChatBusinessCards([{ type: 'checklist', id: '1', title: '清单', checklist: { items: [] } }])
assert.equal(normalizeCards.length, 0)
const invalidCardMessage = { role: 'assistant', content: fallbackBody, businessCards: [{ type: 'checklist', id: 'bad', title: '坏清单', checklist: { items: [{ key: 'bad', name: '无效' }] } }] }
const hasChecklistStart = page.indexOf('function hasChecklistMessage(message) {')
const hasChecklistEnd = page.indexOf('\nfunction buildSelectedChecklist', hasChecklistStart)
const fallbackContext = { normalizeChatBusinessCards }
vm.createContext(fallbackContext)
vm.runInContext(`${page.slice(hasChecklistStart, hasChecklistEnd)}\nglobalThis.hasChecklist = hasChecklistMessage`, fallbackContext)
assert.equal(normalizeChatBusinessCards(invalidCardMessage.businessCards).length, 0)
assert.equal(fallbackContext.hasChecklist(invalidCardMessage), false, 'invalid checklist cards must not suppress the answer body')
assert.equal(invalidCardMessage.content, '正文仍然可见')
assert.match(checklistText(rawChecklist), /有害垃圾：/)
assert.match(checklistText(rawChecklist), /可回收物：/)
assert.match(checklistText(rawChecklist), /厨余垃圾：/)
assert.match(checklistText(rawChecklist), /其他垃圾：/)
assert.match(checklistText(rawChecklist), /待确认：/)
assert(!checklistText(rawChecklist).includes('undefined'))

// Execute the component's actual selection/emit and inspect handlers in a small VM.
const toastCalls = []
const emitted = []
const businessContext = {
  props: { value: Array.from({ length: 6 }, (_, i) => ({ type: 'recognition', id: String(i + 1), title: `记录${i + 1}`, description: '已识别' })),
    sessionId: 'session', messageId: 'message', chatBusy: false },
  selectedRecognitionIds: { value: [] },
  cards: { value: normalizeChatBusinessCards(Array.from({ length: 6 }, (_, i) => ({ type: 'recognition', id: String(i + 1), title: `记录${i + 1}`, description: '已识别' }))) },
  emit: (event, value) => emitted.push([event, value]), uni: { showToast: value => toastCalls.push(value) },
  openRecognition: card => { businessContext.inspected = card }
}
vm.createContext(businessContext)
vm.runInContext(`${takeFunction(businessSource, 'submitRecognitionChecklist')}\n${takeFunction(businessSource, 'toggleRecognition')}\n${takeFunction(businessSource, 'inspectChecklistItem')}\nglobalThis.submit = submitRecognitionChecklist; globalThis.select = toggleRecognition; globalThis.inspect = inspectChecklistItem`, businessContext)
for (const card of businessContext.cards.value.slice(0, 6)) businessContext.select(card)
assert.deepEqual(Array.from(businessContext.selectedRecognitionIds.value), ['1', '2', '3', '4', '5'])
assert.equal(toastCalls[0].title, '一次最多选择5条记录')
businessContext.submit()
assert.equal(emitted[0][0], 'checklist')
assert.deepEqual(Array.from(emitted[0][1]), ['1', '2', '3', '4', '5'])
businessContext.props.chatBusy = true
businessContext.submit()
assert.equal(emitted.length, 1, 'busy chat does not emit another selection')
businessContext.inspect({ sourceId: '3', name: '玻璃瓶' })
assert.equal(businessContext.inspected.id, '3')
assert.equal(businessContext.inspected.title, '玻璃瓶', 'checklist inspect opens the original recognition record')
assert(businessSource.includes('@tap.stop="submitRecognitionChecklist"'), 'selection submit action is wired')
assert(businessSource.includes("@inspect=\"inspectChecklistItem\""))

// Execute checklist component checkbox filtering and copy handlers.
const clipboard = []
const checklistContext = {
  checklist: { value: { ...normalized, items: [...normalized.items, entry('6:1', '其他垃圾', { confidence: 0.1 })] } }, checked: { value: [] },
  uni: { setClipboardData: value => clipboard.push(value) }, checklistText,
  CHECKLIST_CATEGORIES, CHECKLIST_GUIDES, isChecklistItemCheckable, computed: fn => ({ value: fn() }),
  emit: (event, value) => emitted.push([event, value])
}
vm.createContext(checklistContext)
const groupsStart = checklistSource.indexOf('const groups = computed(')
const groupsEnd = checklistSource.indexOf('\nwatch(', groupsStart)
const setCheckedStart = checklistSource.indexOf('function setChecked(event) {')
const setCheckedEnd = checklistSource.indexOf('\nfunction copyChecklist()', setCheckedStart)
const copyStart = checklistSource.indexOf('function copyChecklist() {')
const copyEnd = checklistSource.indexOf('\n}', copyStart) + 2
vm.runInContext(`${checklistSource.slice(groupsStart, groupsEnd)}\n${checklistSource.slice(setCheckedStart, setCheckedEnd)}\n${checklistSource.slice(copyStart, copyEnd)}\nglobalThis.groupList = groups; globalThis.setChecked = setChecked; globalThis.copy = copyChecklist`, checklistContext)
assert.deepEqual(Array.from(checklistContext.groupList.value, group => group.category), CHECKLIST_CATEGORIES, 'all five category groups are built from normalized checklist data')
checklistContext.setChecked({ detail: { value: checklistContext.checklist.value.items.map(item => item.key) } })
assert.deepEqual(Array.from(checklistContext.checked.value), ['2:1', '3:1', '4:1', '5:1'], '待确认 and low-confidence items cannot be selected')
checklistContext.copy()
assert.match(clipboard[0].data, /物品投放清单/)
assert(checklistSource.includes("emit('inspect', item)"), 'original recognition action is present')
assert(checklistSource.includes('item.confidence'), 'low-confidence checkbox state is disabled in the UI')

// Run onSend itself. Selection is treated as IDs only and keeps the user's draft/image untouched.
const sent = []
const userMessages = []
const pageContext = {
  isStreaming: { value: false }, imagePreparing: { value: false }, recoveringRun: { value: '' }, activeRun: { value: null }, pageDisposed: false, supportsRuns: async () => false, ensureRunLedger: () => null, sendEpoch: 0, ensureConversation: () => ({ messages: [] }), promptText: { value: '保留的输入草稿' },
  pickedImageDataUrl: { value: 'data:image/png;base64,QUJD' }, pickedImageLocalPath: { value: '/tmp/picked.png' },
  isSearchEnabled: { value: false }, streamingMessageId: { value: '' }, streamingText: { value: '' }, streamingReasoning: { value: '' }, streamingSearch: { value: null },
  pendingMessagePreparation: null, isDeepThinking: { value: false }, activeSessionId: { value: 'session' },
  createMessageId: () => 'message-id', extractPendingPersistMessages: async () => [], extractHistoryForRequest: () => [],
  getStorage: () => '', chatEnvironment: { forRequest: async () => ({}) }, pushMessageToActive: (...args) => userMessages.push(args),
  clearPickedImage: () => { throw new Error('selected checklist request must keep pending image') },
  streamChat: async request => { sent.push(request); return { content: '整理完成', businessCards: [] } },
  dataUrlByteLength: () => 3, finalizeChatSearch: () => null, uni: { showToast() {} }, Date, console: { log() {}, error() {} }
}
vm.createContext(pageContext)
vm.runInContext(`${takeFunction(page, 'onSend')}\nglobalThis.send = onSend`, pageContext)
await pageContext.send({ recognitionSelection: ['4', 1, '2', 'bad', { id: '3', type: 'product' }, '5', '6', '7'] })
assert.deepEqual(Array.from(sent[0].recognitionSelection), ['4', 1, '2', '5', '6'], 'selection accepts only numeric IDs and is capped at five')
assert(Array.from(sent[0].recognitionSelection).every(id => typeof id === 'string' || typeof id === 'number'), 'request selection contains IDs only, without client supplied categories')
assert.equal(sent[0].text, '将选中的识别记录整理成投放清单')
assert.equal(sent[0].imageBase64, '', 'pending picture is not uploaded with checklist request')
assert.equal(pageContext.promptText.value, '保留的输入草稿')
assert.equal(pageContext.pickedImageDataUrl.value, 'data:image/png;base64,QUJD')
assert.equal(userMessages[0][1], '将选中的识别记录整理成投放清单')
assert.equal(userMessages[0][2], '')

// Confirm both transport payloads forward the exact server-side selection field.
const streamStart = page.indexOf('async function streamChat(')
const streamEnd = page.indexOf('\nfunction extractHistoryForRequest()', streamStart)
const streamSource = page.slice(streamStart, streamEnd)
assert(streamSource.includes('recognitionSelection = []'))
assert(streamSource.includes('recognitionSelection, sessionId'), 'H5 request JSON includes selected IDs')
assert(streamSource.includes('recognitionSelection'), 'WebSocket request includes selected IDs')
const wsStart = streamSource.indexOf('socket.send({')
assert(wsStart >= 0 && streamSource.slice(wsStart, streamSource.indexOf('})', wsStart)).includes('recognitionSelection'), 'WebSocket payload forwards selected IDs')

// Compile the touched SFCs after Uni preprocessing for H5, Weixin mini program and App.
for (const platform of ['H5', 'MP-WEIXIN', 'APP-PLUS']) {
  for (const [filename, original] of [['ai-chat.vue', page], ['components/ChatBusinessCards.vue', businessSource], ['components/ChatDisposalChecklist.vue', checklistSource]]) {
    const source = unipreprocess(original, platform)
    const { descriptor, errors } = parse(source, { filename })
    assert.deepEqual(errors, [], `${platform} ${filename}: SFC parse`)
    const compiled = compileScript(descriptor, { id: `checklist-${platform}` })
    const template = compileTemplate({ source: descriptor.template.content, filename, id: `checklist-${platform}`, compilerOptions: { bindingMetadata: compiled.bindings } })
    assert.deepEqual(template.errors, [], `${platform} ${filename}: template compile`)
    for (const style of descriptor.styles) assert.deepEqual(compileStyle({ source: style.content, filename, id: `checklist-${platform}`, scoped: style.scoped }).errors, [], `${platform} ${filename}: style compile`)
  }
}
console.log('ai-chat checklist checks passed: selection, IDs-only request, draft/image retention, checklist display and three-platform SFC compile')
