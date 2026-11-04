import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse as parseJavaScript } from '@babel/parser'
import { parse as parseSfc } from '@vue/compiler-sfc'
import { createRecentRecognitionStore, RECENT_RECOGNITION_IDLE_MS } from '../src/utils/recent-recognition-core.mjs'

const successful = name => ({ labels: [{ name }], result_img_base64: `image-${name}` })

function harness() {
  let owner = 'account-A'
  let time = 0
  const store = createRecentRecognitionStore({ getOwner: () => owner, now: () => time })
  return { store, setOwner(value) { owner = value }, advance(ms) { time += ms } }
}

function verifyStore() {
  const h = harness()
  const notices = []
  const unsubscribe = h.store.subscribe((entry, reason) => notices.push([entry?.id, reason]))
  h.store.save('first', successful('纸盒'))
  // Recreating a consumer must read the same in-memory singleton entry.
  const original = h.store.get()
  assert.equal((() => h.store.get())(), original)
  h.store.save('empty', { labels: [] })
  h.store.save('missing', {})
  assert.equal(h.store.get().id, 'first', 'empty detections preserve the latest successful result')
  h.store.save('second', successful('玻璃瓶'))
  assert.equal(h.store.get().id, 'second', 'only the latest success is retained')
  h.store.updateImage('first', { upcyclingImageUrl: 'stale-image' })
  assert.equal(h.store.get().result.upcyclingImageUrl, undefined, 'an old image job cannot update the new result')
  h.store.updateImage('second', { upcyclingImageUrl: 'current-image', upcyclingTaskId: '' })
  assert.equal(h.store.get().result.upcyclingImageUrl, 'current-image')
  assert.equal(h.store.get().result.labels[0].name, '玻璃瓶')
  h.setOwner('account-B')
  assert.equal(h.store.get(), null, 'switching accounts clears private results')
  assert.deepEqual(notices.at(-1), [undefined, 'owner-changed'])
  h.setOwner('account-A')
  assert.equal(h.store.get(), null, 'returning to the original token cannot restore an invalidated result')
  h.store.save('before-logout', successful('纸盒'))
  h.setOwner('')
  assert.equal(h.store.get(), null, 'logging out invalidates the stored result')
  h.setOwner('account-A')
  assert.equal(h.store.get(), null, 'logging in with the same token does not resurrect a logged-out result')
  const count = notices.length
  unsubscribe()
  h.store.save('unsubscribed', successful('纸盒'))
  h.store.updateImage('unsubscribed', { upcyclingImageUrl: 'updated' })
  h.store.clear()
  assert.equal(notices.length, count, 'unsubscribe stops future notifications')

  const ttl = harness()
  ttl.store.save('ttl', successful('纸盒'))
  ttl.advance(RECENT_RECOGNITION_IDLE_MS * 2)
  assert.equal(ttl.store.foreground(), false, 'time spent in the foreground does not expire results')
  ttl.store.background()
  ttl.advance(RECENT_RECOGNITION_IDLE_MS - 1)
  assert.equal(ttl.store.foreground(), false, 'a return just before the threshold preserves results')
  assert.equal(ttl.store.get().id, 'ttl')
  ttl.store.background()
  ttl.advance(RECENT_RECOGNITION_IDLE_MS / 2)
  ttl.store.background()
  ttl.advance(RECENT_RECOGNITION_IDLE_MS / 2)
  assert.equal(ttl.store.foreground(), true, 'the threshold is inclusive and repeated background events do not extend it')
  assert.equal(ttl.store.get(), null)
  assert.equal(ttl.store.foreground(), false, 'foreground consumes the background timestamp')
}

function visit(node, callback) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) { node.forEach(child => visit(child, callback)); return }
  callback(node)
  for (const [key, value] of Object.entries(node)) {
    if (!['loc', 'comments', 'tokens'].includes(key) && value && typeof value === 'object') visit(value, callback)
  }
}

function conditionalScript(source, target) {
  const stack = [true]
  const output = []
  for (const line of source.split(/\r?\n/)) {
    const open = line.match(/^\s*\/\/\s*#(ifdef|ifndef)\s+(.+?)\s*$/)
    if (open) {
      const match = open[2].split(/\s+\|\|\s+/).includes(target)
      stack.push(stack.at(-1) && (open[1] === 'ifdef' ? match : !match))
    } else if (/^\s*\/\/\s*#else\s*$/.test(line)) {
      assert.ok(stack.length > 1)
      stack[stack.length - 1] = stack.at(-2) && !stack.at(-1)
    } else if (/^\s*\/\/\s*#endif\s*$/.test(line)) {
      assert.ok(stack.length > 1)
      stack.pop()
    } else if (stack.at(-1)) output.push(line)
  }
  assert.equal(stack.length, 1, `${target}: conditional blocks balance`)
  return output.join('\n')
}

function verifyPlatformImports(script, path) {
  for (const target of ['H5', 'APP-PLUS', 'MP-WEIXIN']) {
    const ast = parseJavaScript(conditionalScript(script, target), { sourceType: 'module' })
    assert.ok(ast.program.body.some(node => node.type === 'ImportDeclaration' &&
      node.source.value === '@/utils/recent-recognition.js' &&
      node.specifiers.some(specifier => specifier.type === 'ImportSpecifier' &&
        specifier.imported.name === 'recentRecognition' && specifier.local.name === 'recentRecognition')),
    `${path} ${target}: recentRecognition remains imported after conditional preprocessing`)
  }
}

function homeHarness(path, store) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const { descriptor, errors } = parseSfc(source, { filename: path })
  assert.equal(errors.length, 0)
  const script = descriptor.scriptSetup.content
  verifyPlatformImports(script, path)
  const ast = parseJavaScript(script, { sourceType: 'module' })
  const names = ['resetRecentPresentation', 'restoreRecentPresentation', 'expandRecentResult', 'collapseRecentResult']
  const functions = new Map()
  visit(ast, node => {
    if (node.type === 'FunctionDeclaration' && names.includes(node.id?.name)) functions.set(node.id.name, script.slice(node.start, node.end))
  })
  for (const name of names) assert.ok(functions.has(name), `${path}: ${name} exists`)
  const ref = value => ({ value })
  const applied = [], scrolls = []
  const context = {
    recentRecognition: store,
    recentResult: ref(null), resultCollapsed: ref(false), resultImage: ref(''),
    isProcessing: ref(false), failedPreviewPending: ref(false), retryImagePath: ref(''), classificationUi: ref('initial'),
    robotFeedbackActive: ref(true), robotEntryReturning: ref(false), robotAtEntry: ref(false), robotState: ref('success'),
    displayedRecentId: '', homeWasHidden: false, preserveResultOnReturn: false,
    pendingTask: null, getRecognitionTask() { return context.pendingTask },
    applyRecognitionResult(...args) { applied.push(args); context.resultImage.value = args[0].result_img_base64 },
    clearOtherOwnerRecognition() { context.resultImage.value = ''; context.classificationUi.value = 'initial' },
    nextTick(callback) { callback() }, queueRefreshDisplayBboxes() {},
    uni: { pageScrollTo(options) { scrolls.push(options) } },
    recognizeImage() { assert.fail('restoring and expanding saved results must never submit recognition') }
  }
  runInNewContext([...functions.values(), ...names.map(name => `this.${name} = ${name}`)].join('\n'), context)
  return { context, applied, scrolls }
}

function verifyHome(path) {
  const h = harness()
  const result = successful('纸盒')
  h.store.save('saved', result)
  const { context: c, applied, scrolls } = homeHarness(path, h.store)
  c.restoreRecentPresentation()
  assert.equal(c.resultCollapsed.value, true, `${path}: a newly mounted home starts collapsed`)
  assert.equal(c.resultImage.value, result.result_img_base64)
  assert.deepEqual(applied[0], [h.store.get().result, false, true], `${path}: restoration requests cached rendering`)
  c.expandRecentResult()
  assert.equal(c.resultCollapsed.value, false, `${path}: explicit expansion shows the cached result`)
  assert.equal(c.classificationUi.value, 'complete')

  c.homeWasHidden = true
  c.preserveResultOnReturn = true
  const scrollCount = scrolls.length
  const applyCount = applied.length
  c.restoreRecentPresentation()
  assert.equal(c.resultCollapsed.value, false, `${path}: returning from chat keeps the expanded result`)
  assert.equal(scrolls.length, scrollCount, `${path}: returning from chat does not scroll to the top`)
  assert.equal(applied.length, applyCount, `${path}: chat return preserves the displayed response`)

  c.preserveResultOnReturn = false
  c.restoreRecentPresentation()
  assert.equal(c.resultCollapsed.value, true, `${path}: an ordinary return collapses the result`)
  assert.equal(scrolls.length, scrollCount + 1)

  for (const processing of [true, false]) {
    c.resultCollapsed.value = false
    c.isProcessing.value = processing
    c.pendingTask = processing ? null : { status: 'pending' }
    const before = scrolls.length
    c.restoreRecentPresentation()
    assert.equal(c.resultCollapsed.value, false, `${path}: pending work stays visible`)
    assert.equal(scrolls.length, before)
  }
  c.pendingTask = null
  c.isProcessing.value = true
  c.collapseRecentResult()
  assert.equal(c.resultCollapsed.value, false, `${path}: the collapse action cannot hide active processing`)
  const before = applied.length
  c.expandRecentResult()
  assert.equal(applied.length, before, `${path}: expansion does not replace active processing`)
  c.isProcessing.value = false
  h.store.background()
  h.advance(RECENT_RECOGNITION_IDLE_MS)
  h.store.foreground()
  c.restoreRecentPresentation()
  assert.equal(c.recentResult.value, null, `${path}: expiration clears the saved entry`)
  assert.equal(c.resultImage.value, '', `${path}: expiration clears the displayed result`)
  assert.equal(c.displayedRecentId, '')
  assert.equal(c.classificationUi.value, 'initial')
}

verifyStore()
for (const path of ['../src/pages/home/home.vue', '../src/pages-dark/home/home.vue']) verifyHome(path)
console.log('recent recognition store and both home presentation tests passed')
