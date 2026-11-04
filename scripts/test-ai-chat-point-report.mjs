import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { normalizeChatDisposalPoints, disposalMapUrl, createDisposalActions } from '../src/pages-nonTheme/utils/ai-chat-disposal.mjs'
import { resolveMapViewCard } from '../src/utils/map-view-card.mjs'

const require = createRequire(import.meta.url)
const { parse, compileScript, compileTemplate, compileStyle } = require('@vue/compiler-sfc')
const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const page = read('../src/pages-nonTheme/ai-chat.vue')
const card = read('../src/pages-nonTheme/components/ChatDisposalPoints.vue')
const lightMap = read('../src/pages/map/map.vue')
const darkMap = read('../src/pages-dark/map/map.vue')
const point = { id: '17', name: '河边点位', description: '东门入口', latitude: 25.04, longitude: 121.56 }
const reason = '点位已撤走，请协助核实。'

assert.match(card, /@tap\.stop="\$emit\('open', point, 'report'\)"/, 'chat point card exposes a feedback action that reaches the report helper')
assert.match(card, /<button(?=[^>]*:disabled="!!busyId")(?=[^>]*@tap\.stop="\$emit\('open', point, 'report'\)")[^>]*>/, 'feedback action is disabled while the authoritative point lookup is busy')

const normalized = normalizeChatDisposalPoints([{ ...point, reportReason: ` ${reason} ` }])[0]
assert.equal(normalized.reportReason, reason, 'report reason is trimmed and retained')
assert.equal(normalizeChatDisposalPoints([{ ...point, reportReason: '' }])[0].reportReason, '', 'an explicitly empty report reason remains available')
assert.equal(normalizeChatDisposalPoints([{ ...point, reportReason: 'x'.repeat(220) }])[0].reportReason.length, 200)
const reportUrl = new URL(disposalMapUrl(point, false, reason), 'https://local.invalid')
assert.equal(reportUrl.pathname, '/pages/map/map')
assert.equal(reportUrl.searchParams.get('mode'), 'view')
assert.equal(reportUrl.searchParams.get('pointId'), point.id)
assert.equal(reportUrl.searchParams.get('report'), '1')
assert.equal(reportUrl.searchParams.get('reason'), reason)
const emptyReportUrl = new URL(disposalMapUrl(point, true, ''), 'https://local.invalid')
assert.equal(emptyReportUrl.pathname, '/pages-dark/map/map')
assert.equal(emptyReportUrl.searchParams.get('report'), '1')
assert.equal(emptyReportUrl.searchParams.get('reason'), '')
assert.equal(new URL(disposalMapUrl(point, false, 'x'.repeat(220)), 'https://local.invalid').searchParams.get('reason').length, 200)
assert.equal(new URL(disposalMapUrl(point), 'https://local.invalid').searchParams.get('report'), null, 'ordinary map navigation does not request a report')

let latestPoint = { ...point, name: '刷新后的点位名', longitude: 121.57 }
let targetScope = 'session-a', currentScope = 'session-a', reportedOptions, busyStates = []
const reportAction = createDisposalActions({
  loadPoint: async id => ({ code: 0, data: { ...latestPoint, id } }),
  navigateTo: options => { reportedOptions = options },
  getScope: () => targetScope,
  isCurrent: scope => scope === currentScope,
  onBusy: value => busyStates.push(value)
})
await reportAction({ ...point, reportReason: reason }, 'report')
const reportQuery = new URL(reportedOptions.url, 'https://local.invalid')
assert.equal(reportQuery.searchParams.get('pointId'), point.id, 'report action uses the platform point identity')
assert.equal(reportQuery.searchParams.get('name'), '刷新后的点位名', 'report navigation uses the latest approved point')
assert.equal(reportQuery.searchParams.get('report'), '1')
assert.equal(reportQuery.searchParams.get('reason'), reason)
assert.deepEqual(busyStates, ['17', ''])

let resolveStaleLookup, staleNavigations = 0, staleNotices = 0, staleScope = 'a'
const staleReport = createDisposalActions({
  loadPoint: () => new Promise(resolve => { resolveStaleLookup = resolve }), navigateTo: () => staleNavigations++,
  notify: () => staleNotices++, getScope: () => staleScope, isCurrent: scope => scope === staleScope
})
const stalePromise = staleReport({ ...point, reportReason: reason }, 'report')
staleScope = 'b'
resolveStaleLookup({ code: 0, data: latestPoint })
await stalePromise
assert.equal(staleNavigations, 0, 'a stale account/session lookup cannot navigate to a hidden map')
assert.equal(staleNotices, 0)

const result = await resolveMapViewCard({ pointId: '17', lat: '1', lng: '2', report: '1', reason: encodeURIComponent(reason) }, async id => ({ code: 0, data: { ...point, id } }))
assert.equal(result.reportRequested, true, 'only a verified platform point can request report prefill')
assert.equal(result.reportReason, reason)
const shared = await resolveMapViewCard({ lat: '25', lng: '121', name: '分享位置', report: '1', reason }, async () => { throw new Error('no point lookup') })
assert.equal(shared.reportRequested, false, 'shared coordinates cannot open a platform report form')
assert.equal(shared.reportReason, reason)
await assert.rejects(resolveMapViewCard({ pointId: '17', report: '1', reason }, async () => ({ code: 404 })), /移除或暂不可用/)

function takeFunction(source, name) {
  let start = source.indexOf(`function ${name}(`)
  if (source.slice(start - 6, start) === 'async ') start -= 6
  assert(start >= 0, `missing ${name}`)
  const next = source.slice(start + 1).search(/\n(?:async )?function [\w$]+\(/)
  return source.slice(start, next < 0 ? source.length : start + 1 + next)
}
function mapContext(source, options, lookup) {
  const refs = { viewMode: { value: true }, viewPoint: { value: null }, viewLocationInfo: { value: null }, center: { value: { latitude: 0, longitude: 0 } }, selectedMarker: { value: null }, reportTarget: { value: null }, reportReason: { value: '' }, reportPhotos: { value: ['old-photo'] }, reportPhotoProcessing: { value: true }, showReportModal: { value: false }, reportSubmitting: { value: false } }
  const context = { ...refs, pageOptions: options, options, mapPageDisposed: false, accountToken: 'owner-a', mapViewEpoch: 0, viewOwner: null, viewInvalidated: false, viewLookupScope: '', sdkCalls: 0,
    mapViewOwner: () => context.accountToken, ensureH5Sdk: () => context.sdkCalls++,
    mapViewScope: () => `${context.mapViewEpoch}|${context.accountToken}`, resolveMapViewCard, request: lookup,
    onH5MarkerClicked: (_, pointValue) => { context.selectedMarker.value = { ...pointValue, title: pointValue.name } },
    uni: { setNavigationBarTitle() {}, showToast() {} }, submitCalls: 0, submitReport() { this.submitCalls++ } }
  vm.createContext(context)
  vm.runInContext(`${takeFunction(source, 'reportErrorMarker')}\nglobalThis.openReport = reportErrorMarker`, context)
  const start = source.indexOf('async function initializeViewedPoint()')
  const end = source.indexOf('\nonShow(', start)
  assert(start >= 0 && end > start, 'view initialization function exists')
  vm.runInContext(`${source.slice(start, end)}\nglobalThis.initializeView = initializeViewedPoint`, context)
  return context
}

for (const [name, source] of [['light', lightMap], ['dark', darkMap]]) {
  const map = mapContext(source, { mode: 'view', pointId: '17', report: '1', reason: encodeURIComponent(reason) }, async () => ({ code: 0, data: point }))
  await map.initializeView()
  assert.equal(map.viewMode.value, true, `${name} map enters detail mode`)
  assert.equal(map.reportTarget.value.id, '17', `${name} map binds report to the refreshed point`)
  assert.equal(map.reportReason.value, reason, `${name} map pre-fills the supplied report reason`)
  assert.equal(map.reportPhotos.value.length, 0, `${name} map clears stale photos before opening the form`)
  assert.equal(map.showReportModal.value, true)
  assert.equal(map.submitCalls, 0, 'opening the report form never submits it')

  let resolvePoint
  const disposed = mapContext(source, { mode: 'view', pointId: '17', report: '1', reason }, () => new Promise(resolve => { resolvePoint = resolve }))
  const opening = disposed.initializeView()
  disposed.mapPageDisposed = true
  resolvePoint({ code: 0, data: point })
  await opening
  assert.equal(disposed.showReportModal.value, false, `${name} map ignores a point lookup after unload`)
  assert.equal(disposed.reportTarget.value, null)

  let resolveScoped
  const scopeOptions = { mode: 'view', pointId: '17', report: '1', reason }
  const hidden = mapContext(source, scopeOptions, () => new Promise(resolve => { resolveScoped = resolve }))
  const hiddenOpening = hidden.initializeView()
  hidden.mapViewEpoch++ // matches the map page's onHide scope invalidation
  resolveScoped({ code: 0, data: point })
  await hiddenOpening
  assert.equal(hidden.showReportModal.value, false, `${name} map ignores a point lookup after hide`)
  assert(source.includes('onHide(() => { mapViewEpoch++ })'), `${name} map invalidates the captured scope on hide`)
  const retry = hidden.initializeView()
  resolveScoped({ code: 0, data: point })
  await retry
  assert.equal(hidden.showReportModal.value, true, `${name} map resumes the deferred lookup after show`)
  assert.equal(hidden.sdkCalls, 1, `${name} map starts its SDK after the resumed lookup`)


  let resolveOwner
  const switched = mapContext(source, scopeOptions, () => new Promise(resolve => { resolveOwner = resolve }))
  const ownerOpening = switched.initializeView()
  switched.accountToken = 'owner-b'
  resolveOwner({ code: 0, data: point })
  await ownerOpening
  assert.equal(switched.showReportModal.value, false, `${name} map ignores a point lookup after account change`)
  await switched.initializeView()
  assert.equal(switched.viewInvalidated, true, `${name} map refuses to reuse the previous owner's point`)
}

// The model-visible history preserves structured assistant point context for natural follow-up reports.
const historyStart = page.indexOf('function extractHistoryForRequest()')
const historyEnd = page.indexOf('\n// ─── 发送消息', historyStart)
const historyContext = { activeSessionId: { value: 's' }, ensureConversation: () => ({ messages: [
  { role: 'assistant', content: '附近有这个点', disposalPoints: [point] }, { role: 'user', content: '这个点搬走了' }
] }), normalizeChatDisposalPoints, normalizeChatBusinessCards: () => [], getStorage: () => '' }
vm.createContext(historyContext)
vm.runInContext(`${page.slice(historyStart, historyEnd)}\nglobalThis.history = extractHistoryForRequest()`, historyContext)
assert.deepEqual(Array.from(historyContext.history[0].disposalPoints, item => item.id), ['17'], 'assistant point IDs survive model history for natural feedback requests')

function unipreprocess(source, platform) {
  const stack = [true]
  return source.split('\n').filter(line => {
    const directive = /(?:\/\/|\/\*|<!--)\s*#(ifdef|ifndef)\s+([\w-]+)\s*(?:\*\/|-->)?/.exec(line)
    if (directive) { const matches = directive[2] === platform || (directive[2] === 'MP' && platform.startsWith('MP-')); stack.push(stack.at(-1) && (directive[1] === 'ifdef' ? matches : !matches)); return false }
    if (/(?:\/\/|\/\*|<!--)\s*#endif\s*(?:\*\/|-->)?/.test(line)) { stack.pop(); return false }
    return stack.at(-1)
  }).join('\n')
}
for (const platform of ['H5', 'MP-WEIXIN', 'APP-PLUS']) {
  for (const [filename, source] of [['ai-chat.vue', page], ['ChatDisposalPoints.vue', card], ['pages/map/map.vue', lightMap], ['pages-dark/map/map.vue', darkMap]]) {
    const { descriptor, errors } = parse(unipreprocess(source, platform), { filename })
    assert.deepEqual(errors, [], `${platform} ${filename} parses`)
    const compiled = compileScript(descriptor, { id: `point-report-${platform}` })
    const templateSource = filename.includes('/map/')
      ? descriptor.template.content.replace('<map v-else-if="!showAddModal"', '<map v-if="!isH5 && !showAddModal"')
      : descriptor.template.content
    const template = compileTemplate({ source: templateSource, filename, id: `point-report-${platform}`, compilerOptions: { bindingMetadata: compiled.bindings } })
    assert.deepEqual(template.errors, [], `${platform} ${filename} template compiles`)
    for (const style of descriptor.styles) assert.deepEqual(compileStyle({ source: style.content, filename, id: `point-report-${platform}`, scoped: style.scoped }).errors, [], `${platform} ${filename} styles compile`)
  }
}

console.log('ai-chat point report checks passed: structured context, refreshed report navigation, prefill, stale guards, three-platform compile')
