import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse as parseJavaScript } from '@babel/parser'
import { parse } from '@vue/compiler-sfc'
import { initPreContext, preCss, preHtml, preJs } from '@dcloudio/uni-cli-shared/dist/preprocess/index.js'
import { normalizeActionSummaries, actionStatusLabel, actionDetailUrl } from '../src/pages-nonTheme/utils/ai-chat-actions.mjs'
import { normalizeChatBusinessCards, businessActionRequestId } from '../src/pages-nonTheme/utils/ai-chat-business.mjs'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const componentPaths = ['../src/pages-nonTheme/components/ChatActionInbox.vue', '../src/pages-nonTheme/components/ChatBusinessCards.vue']
for (const path of componentPaths) {
  const source = read(path)
  for (const platform of ['h5', 'mp-weixin', 'app']) {
    initPreContext(platform)
    const { descriptor, errors } = parse(source, { filename: path })
    assert.equal(errors.length, 0, `${path} parses`)
    const script = descriptor.scriptSetup ? descriptor.scriptSetup : descriptor.script
    const processedScript = preJs(script.content, path)
    const processedTemplate = preHtml(descriptor.template.content, path)
    descriptor.styles.forEach(style => preCss(style.content, path))
    assert.ok(processedScript.length, `${platform} script preprocesses: ${path}`)
    const { compileScript, compileTemplate } = await import('@vue/compiler-sfc')
    compileScript({ ...descriptor, [descriptor.scriptSetup ? 'scriptSetup' : 'script']: { ...script, content: processedScript } }, { id: `${platform}-${path}` })
    const compiled = compileTemplate({ source: processedTemplate, filename: path, id: `${platform}-${path}`, compilerOptions: { comments: true } })
    assert.equal(compiled.errors.length, 0, `${platform} template compiles: ${path}`)
  }
}

const uuid = 'f6de8123-7abc-4def-8abc-0123456789ab'
const actionKey = 'a6de8123-7abc-4def-8abc-0123456789ab'
const cards = normalizeChatBusinessCards([{ type: 'product', id: 42, title: '兑换', description: '商品', actionKey }])
assert.equal(businessActionRequestId(cards[0], 123, () => 'random'), `chat_${actionKey}`)
assert.equal(businessActionRequestId(cards[0], 456, () => 'random'), `chat_${actionKey}`, 'stable server actionKey wins across component instances and restored history')
const businessSource = parse(read(componentPaths[1]), { filename: componentPaths[1] }).descriptor.scriptSetup.content
const openBookingNode = parseJavaScript(businessSource, { sourceType: 'module' }).program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'openBooking')
const openBookingSource = businessSource.slice(openBookingNode.start, openBookingNode.end)
const componentRequests = []
const restoredBookingCard = normalizeChatBusinessCards([{ type: 'booking', id: 8, title: '预约', description: '纸箱', actionKey }])[0]
for (const messageId of ['123', '456']) {
  const componentContext = {
    props: { messageId, sessionId: 'session-1' }, busyProductId: { value: '' }, createRequestIds: new Map(), businessActionRequestId, beginCardAction: () => () => true,
    bookingSupported: () => true, fetchAiCapabilities: async () => ({}), isCapabilityNotFound: () => false,
    newActionRequestId: () => `random-${messageId}`, createBookingDraft: async payload => { componentRequests.push(payload.requestId); return { data: { id: `draft-${messageId}` } } },
    uni: { navigateTo() {}, showModal() {} }
  }
  runInNewContext(`${openBookingSource}\nthis.run = openBooking`, componentContext)
  await componentContext.run(JSON.parse(JSON.stringify(restoredBookingCard))) // normalized card restored from persisted history
}
assert.deepEqual(componentRequests, [`chat_${actionKey}`, `chat_${actionKey}`], 'separate card component instances reuse the restored action key')
const historicCard = normalizeChatBusinessCards([{ type: 'booking', id: 7, title: '预约', description: '纸箱' }])[0]
assert.equal(businessActionRequestId(historicCard, 123, () => 'random'), 'chat_message_123_booking_7', 'numeric persisted assistant message ID is the historic fallback')
assert.equal(businessActionRequestId(historicCard, 'legacy-id', () => 'random'), 'random')

const action = { id: uuid, type: 'booking', status: 'pending', version: 4, title: '回收预约' }
assert.deepEqual(actionDetailUrl(action), `/pages-nonTheme/booking?draftId=${uuid}`)
assert.deepEqual(actionDetailUrl({ ...action, type: 'redemption' }), `/pages-nonTheme/shop-confirm?draftId=${uuid}`)
for (const invalid of [{ ...action, type: 'other' }, { ...action, id: '42' }, { ...action, id: 'x'.repeat(37) }]) assert.equal(actionDetailUrl(invalid), '', 'only known action types and UUIDs route to business pages')
assert.equal(normalizeActionSummaries([{ ...action, type: 'other' }]).length, 0)
for (const invalidType of ['constructor', 'toString', '__proto__']) {
  assert.equal(actionDetailUrl({ ...action, type: invalidType }), '', `${invalidType} is not a business route type`)
  assert.equal(normalizeActionSummaries([{ ...action, type: invalidType }]).length, 0, `${invalidType} is not an accepted action type`)
}
for (const invalidStatus of ['constructor', 'toString', '__proto__']) {
  assert.equal(actionStatusLabel(invalidStatus), '', `${invalidStatus} is not a recognized action status`)
  assert.equal(normalizeActionSummaries([{ ...action, status: invalidStatus }]).length, 0, `${invalidStatus} is not an accepted action status`)
}

const inboxSource = parse(read(componentPaths[0]), { filename: componentPaths[0] }).descriptor.scriptSetup.content
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const ref = value => ({ value })
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
function makeInbox({ fetchRows, cancel = async () => ({ code: 0 }), fetchCapabilities = async () => ({ code: 0, data: { actionInbox: true } }), showModal = ({ success }) => success({ confirm: true }) }) {
  let exposed
  const calls = []
  const context = {
    ref, onBeforeUnmount() {}, defineExpose(value) { exposed = value },
    fetchAiCapabilities: fetchCapabilities,
    fetchAiActions: async (scope, cursor) => { calls.push({ scope, cursor }); return fetchRows(scope, cursor, calls.length) },
    cancelAiAction: cancel, isCapabilityNotFound: () => false,
    normalizeActionSummaries, actionStatusLabel, actionDetailUrl,
    uni: { showModal, navigateTo() {} }
  }
  runInNewContext(`${inboxSource.replace(/^import .*\r?\n/gm, '')}\nthis.state = { opened, loading, supported, error, scope, items, nextCursor, cancelling, confirmingCancel }`, context)
  return { context, calls, exposed }
}

let initialCalls = 0
const panel = makeInbox({ fetchRows: async scope => {
  initialCalls++
  return { code: 0, data: { items: [{ ...action, status: scope === 'pending' ? 'pending' : 'completed' }], nextCursor: '' } }
} })
await panel.exposed.openInbox()
assert.equal(panel.calls.length, 1, 'opening triggers one list request')
await tick()
assert.equal(panel.calls.length, 1, 'open panel does not poll')
await panel.context.loadItems(false) // explicit refresh
assert.equal(panel.calls.length, 2)
await panel.context.changeScope('recent')
assert.equal(panel.calls.length, 3)
assert.equal(initialCalls, 3)

const pendingRows = deferred(), recentRows = deferred()
const race = makeInbox({ fetchRows: scope => scope === 'pending' ? pendingRows.promise : recentRows.promise })
const opening = race.exposed.openInbox()
await tick()
const change = race.context.changeScope('recent')
pendingRows.resolve({ code: 0, data: { items: [{ ...action, title: 'stale pending' }], nextCursor: '' } })
recentRows.resolve({ code: 0, data: { items: [{ ...action, title: 'current recent' }], nextCursor: '' } })
await change
await opening
await tick()
assert.equal(race.context.state.items.value[0].title, 'current recent', 'late response from old scope cannot replace current items')

let cancelArgs, cancelReads = 0
const cancelling = makeInbox({ fetchRows: async () => { cancelReads++; return { code: 0, data: { items: [action], nextCursor: '' } } }, cancel: async (...args) => { cancelArgs = args; return { code: 0 } } })
await cancelling.exposed.openInbox()
await cancelling.context.cancelItem(cancelling.context.state.items.value[0])
assert.deepEqual(cancelArgs, [uuid, 4], 'cancellation sends the displayed version')
assert.equal(cancelReads, 2, 'successful cancellation reloads the list')

let conflictReads = 0
const conflict = makeInbox({ fetchRows: async () => { conflictReads++; return { code: 0, data: { items: [action], nextCursor: '' } } }, cancel: async () => { throw { statusCode: 409, message: '版本冲突' } } })
await conflict.exposed.openInbox()
await conflict.context.cancelItem(conflict.context.state.items.value[0])
assert.equal(conflictReads, 2, 'cancellation conflict triggers a fresh list read')
assert.match(conflict.context.state.error.value, /请核对列表中的最新状态/)

for (const outcome of ['resolve', 'reject']) {
  const oldCancel = deferred()
  let reads = 0
  const isolated = makeInbox({
    fetchRows: async () => { reads++; return { code: 0, data: { items: [action], nextCursor: '' } } },
    cancel: () => oldCancel.promise
  })
  await isolated.exposed.openInbox()
  const oldOperation = isolated.context.cancelItem(isolated.context.state.items.value[0])
  await tick()
  isolated.context.closeInbox()
  await isolated.exposed.openInbox()
  const newCancel = deferred()
  isolated.context.cancelAiAction = () => newCancel.promise
  const newOperation = isolated.context.cancelItem(isolated.context.state.items.value[0])
  await tick()
  assert.equal(isolated.context.state.cancelling.value, uuid, 'new panel cancel is busy')
  if (outcome === 'resolve') oldCancel.resolve({ code: 0 })
  else oldCancel.reject(new Error('late old cancellation failure'))
  await oldOperation
  assert.equal(reads, 2, 'a cancellation from a closed panel cannot refresh the reopened panel')
  assert.equal(isolated.context.state.error.value, '', 'a cancellation from a closed panel cannot write into the reopened panel')
  assert.equal(isolated.context.state.cancelling.value, uuid, 'an old cancellation cannot clear the new panel busy state')
  newCancel.resolve({ code: 0 })
  await newOperation
}

let capabilityChecks = 0, retryReads = 0
const refreshRetry = makeInbox({
  fetchCapabilities: async () => ++capabilityChecks === 1 ? ({ code: 0, data: { actionInbox: false } }) : ({ code: 0, data: { actionInbox: true } }),
  fetchRows: async () => { retryReads++; return { code: 0, data: { items: [], nextCursor: '' } } }
})
await refreshRetry.exposed.openInbox()
assert.ok(refreshRetry.context.state.error.value)
assert.equal(retryReads, 0)
await refreshRetry.context.refreshInbox()
assert.equal(capabilityChecks, 2, 'explicit refresh retries capability discovery after an unsupported response')
assert.equal(retryReads, 1, 'successful capability retry fetches the list without polling')

for (const ending of ['confirm', 'cancel', 'close']) {
  const modalDeferred = deferred()
  const cancelDeferred = deferred()
  const modalPanel = makeInbox({
    fetchRows: async () => ({ code: 0, data: { items: [action], nextCursor: '' } }),
    cancel: () => cancelDeferred.promise,
    showModal: ({ success, fail }) => modalDeferred.promise.then(success, fail)
  })
  await modalPanel.exposed.openInbox()
  const operation = modalPanel.context.cancelItem(modalPanel.context.state.items.value[0])
  await tick()
  assert.equal(modalPanel.context.state.confirmingCancel.value, true, 'native confirmation modal sets the confirming state while pending')
  if (ending === 'close') {
    modalPanel.context.closeInbox()
    assert.equal(modalPanel.context.state.confirmingCancel.value, false, 'closing the panel clears the confirming state immediately')
    modalDeferred.resolve({ confirm: true })
  } else {
    modalDeferred.resolve({ confirm: ending === 'confirm' })
  }
  await tick()
  assert.equal(modalPanel.context.state.confirmingCancel.value, false, `${ending} outcome clears the confirming state`)
  if (ending === 'confirm') cancelDeferred.resolve({ code: 0 })
  await operation
}

// Capture session/message identity through the actual card action guard.
const cardFunctions = parseJavaScript(businessSource, { sourceType: 'module' }).program.body.filter(node => node.type === 'FunctionDeclaration' && ['beginCardAction', 'openBooking'].includes(node.id.name))
const guardedBookingSource = cardFunctions.map(node => businessSource.slice(node.start, node.end)).join('\n')
function makeCardAction({ capabilities, createDraft }) {
  const navigation = [], modals = []
  const state = {
    props: { sessionId: 'session-old', messageId: '123' }, alive: true, actionRequestVersion: 0,
    busyProductId: { value: '' }, createRequestIds: new Map(), businessActionRequestId,
    bookingSupported: response => response?.supported === true, fetchAiCapabilities: capabilities, isCapabilityNotFound: () => false,
    newActionRequestId: () => 'fallback-id', createBookingDraft: createDraft,
    uni: { navigateTo: value => navigation.push(value), showModal: value => modals.push(value) },
    encodeURIComponent
  }
  const source = `let alive = true, actionRequestVersion = 0; const props = this.props; const busyProductId = this.busyProductId; const createRequestIds = this.createRequestIds; const businessActionRequestId = this.businessActionRequestId; const bookingSupported = this.bookingSupported; const fetchAiCapabilities = this.fetchAiCapabilities; const isCapabilityNotFound = this.isCapabilityNotFound; const newActionRequestId = this.newActionRequestId; const createBookingDraft = this.createBookingDraft; const uni = this.uni; const encodeURIComponent = this.encodeURIComponent;\n${guardedBookingSource}\nthis.run = openBooking; this.unmount = () => { alive = false; actionRequestVersion++ }`
  runInNewContext(source, state)
  return { state, navigation, modals }
}
const capabilityWait = deferred()
let capabilityCreates = 0
const unmountedDuringCapabilities = makeCardAction({ capabilities: () => capabilityWait.promise, createDraft: async () => { capabilityCreates++; return { data: { id: 'unexpected' } } } })
const capabilityOperation = unmountedDuringCapabilities.state.run(restoredBookingCard)
unmountedDuringCapabilities.state.unmount()
capabilityWait.resolve({ supported: true })
await capabilityOperation
assert.equal(capabilityCreates, 0, 'unmounted card does not create after a late capability response')
assert.equal(unmountedDuringCapabilities.navigation.length + unmountedDuringCapabilities.modals.length, 0)

const draftWait = deferred()
const changedSession = makeCardAction({ capabilities: async () => ({ supported: true }), createDraft: () => draftWait.promise })
const createOperation = changedSession.state.run(restoredBookingCard)
await tick()
changedSession.state.props.sessionId = 'session-new'
draftWait.reject(new Error('late create failure'))
await createOperation
assert.equal(changedSession.navigation.length + changedSession.modals.length, 0, 'a create response from a stale session cannot navigate or show an error')

const lateDraft = deferred()
const changedSessionSuccess = makeCardAction({ capabilities: async () => ({ supported: true }), createDraft: () => lateDraft.promise })
const lateSuccessOperation = changedSessionSuccess.state.run(restoredBookingCard)
await tick()
changedSessionSuccess.state.props.sessionId = 'session-new'
lateDraft.resolve({ data: { id: 'stale-session-draft' } })
await lateSuccessOperation
assert.equal(changedSessionSuccess.navigation.length, 0, 'a successful create response from a stale session cannot navigate')

// The two existing draft pages must recognize cancellation as terminal and only POST on explicit recreation.
const bookingMethodsSource = read('../src/pages-nonTheme/utils/booking-draft-methods.js')
let bookingCreates = 0, bookingUpdates = 0, bookingConfirms = 0
const bookingContext = {
  fetchAiAction: async id => ({ data: { id, type: 'booking', status: 'cancelled', version: 4, expiresAt: '2999-01-01T00:00:00Z' } }),
  updateAiAction: async () => { bookingUpdates++ }, confirmAiAction: async () => { bookingConfirms++ },
  createBookingDraft: async () => { bookingCreates++; return { data: { id: 'replacement-booking', type: 'booking', status: 'pending', version: 1, expiresAt: '2999-01-01T00:00:00Z' } } },
  newActionRequestId: () => 'replacement-request', uni: { redirectTo() {}, showModal() {}, showToast() {} }, Date, Number, Object, String
}
runInNewContext(`${bookingMethodsSource.replace(/^import .*\r?\n/gm, '').replace('export const bookingDraftMethods =', 'this.methods =')}`, bookingContext)
const booking = { ...bookingContext.methods, draftId: 'booking-cancelled', draft: null, draftExpired: false, draftReceipt: null, draftError: '', draftLoading: false, submitting: false, dateValues: {}, async loadTimeSlots() {}, selectedTypes: [], itemWeights: {}, remark: '', selectedTimeSlot: '', timeSlotsDate: '', address: '', contactPhone: '', validateBookingForm: () => true, syncProfileAfterBooking() {} }
await booking.loadBookingDraft()
assert.equal(booking.draftExpired, true)
await booking.submitDraftBooking()
assert.equal(bookingUpdates + bookingConfirms + bookingCreates, 0, 'cancelled booking cannot be confirmed or silently replaced')
await booking.recreateBookingDraft()
assert.equal(bookingCreates, 1, 'booking replacement is created only by explicit recreation')

const shopSource = parse(read('../src/pages-nonTheme/shop-confirm.vue'), { filename: '../src/pages-nonTheme/shop-confirm.vue' }).descriptor.scriptSetup.content
const shopNames = new Set(['submitDraft', 'loadDraft', 'isDraftExpired', 'getDraftPayload', 'acceptDraftResult', 'refreshAfterConflict', 'recreateExpiredDraft', 'showSubmitError'])
const shopDeclarations = (await import('@babel/parser')).parse(shopSource, { sourceType: 'module' }).program.body.filter(node => node.type === 'FunctionDeclaration' && shopNames.has(node.id.name))
const shopFns = shopDeclarations.map(node => shopSource.slice(node.start, node.end)).join('\n')
let shopUpdates = 0, shopConfirms = 0, shopCreates = 0, shopReads = 0
const shopState = {
  ref, computed: fn => ({ get value() { return fn() } }), reactive: value => value,
  draftId: ref('redemption-cancelled'), draft: ref({ id: 'redemption-cancelled', type: 'redemption', status: 'cancelled', version: 4 }), draftExpired: ref(true), creatingDraft: ref(false), replacementRequestId: ref(''),
  productId: ref('product-1'), product: ref({ points: 5 }), quantity: ref(1), form: { recipientName: 'Lin', recipientPhone: '12345678', recipientAddress: 'Road 1' }, fullAddress: ref('Taipei Road 1'), region: ref(['Taipei', 'Taipei', 'Xinyi']), submitting: ref(false), loading: ref(false), loadError: ref(''), unavailable: ref(''), addressBusy: ref(false), result: ref(null), resultWasRetry: ref(false), points: ref(100), intent: ref(null),
  fetchAiAction: async () => { shopReads++; return { data: { id: 'redemption-cancelled', type: 'redemption', status: 'cancelled', version: 4 } } }, updateAiAction: async () => { shopUpdates++ }, confirmAiAction: async () => { shopConfirms++ }, createRedemptionDraft: async () => { shopCreates++; return { data: { id: 'replacement-redemption' } } }, newActionRequestId: () => 'new-request',
  loadDraft: async () => {}, isDraftExpired: value => !value?.expiresAt || Date.now() >= Date.parse(value.expiresAt), getDraftPayload: () => ({}), acceptDraftResult() {}, refreshAfterConflict: async () => {}, shopError: error => error?.message || 'failed', showSubmitError() {}, uni: { redirectTo() {} }, Date, Number, String, Object, encodeURIComponent
}
runInNewContext(`${shopFns}\nthis.runSubmit = submitDraft; this.runRecreate = recreateExpiredDraft`, shopState)
await shopState.runSubmit()
assert.equal(shopReads + shopUpdates + shopConfirms, 0, 'cancelled redemption stays terminal and cannot be confirmed')
assert.equal(shopCreates, 0, 'cancelled redemption is not silently recreated')
await shopState.runRecreate()
assert.equal(shopCreates, 1, 'redemption replacement POST requires explicit recreation')

console.log('AI action inbox, stable business request IDs, cancellation flows, and H5 / Weixin / App SFC preprocessing passed')
