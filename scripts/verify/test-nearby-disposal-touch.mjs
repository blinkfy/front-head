import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parse as parseSfc } from '@vue/compiler-sfc'
import { compile as compileMpTemplate } from '@dcloudio/uni-mp-compiler'

const root = process.cwd()
const pageFiles = ['src/pages/map/map.vue', 'src/pages-dark/map/map.vue']
const componentFile = 'src/components/NearbyDisposalPanel.vue'
const targets = [...pageFiles, componentFile]

function preprocess(source, platform) {
  const flags = new Set(platform === 'mp-weixin' ? ['MP-WEIXIN', 'MP'] : platform === 'app-plus' ? ['APP-PLUS', 'APP'] : ['H5'])
  const stack = []
  const out = []
  let active = true
  const evaluate = (directive, expression) => {
    if (directive === 'ifdef') return expression.split(/\s*\|\|\s*/).some(part => flags.has(part))
    if (directive === 'ifndef') return !flags.has(expression)
    return expression.split(/\s*\|\|\s*/).some(part => flags.has(part))
  }
  for (const line of source.split(/(?<=\n)/)) {
    const match = line.match(/^\s*<!--\s*#(ifdef|ifndef|if|elif|else|endif)(?:\s+(.+?))?\s*-->\s*(?:\r?\n)?$/)
    if (!match) {
      if (active) out.push(line)
      continue
    }
    const [, directive, raw = ''] = match
    const expression = raw.trim()
    if (directive === 'ifdef' || directive === 'ifndef' || directive === 'if') {
      const condition = evaluate(directive, expression)
      stack.push({ parent: active, taken: condition, active: active && condition })
      active = active && condition
    } else if (directive === 'elif' || directive === 'else') {
      const frame = stack.at(-1)
      assert.ok(frame, `unmatched #${directive}`)
      const condition = directive === 'else' || (!frame.taken && evaluate('if', expression))
      frame.active = frame.parent && condition && !frame.taken
      frame.taken ||= condition
      active = frame.active
    } else {
      assert.ok(stack.length, 'unmatched #endif')
      stack.pop()
      active = stack.at(-1)?.active ?? true
    }
  }
  assert.equal(stack.length, 0, 'unclosed conditional compilation block')
  return out.join('')
}

function templateOf(source, filename) {
  const parsed = parseSfc(source, { filename })
  assert.equal(parsed.errors.length, 0, `${filename}: invalid SFC`)
  assert.ok(parsed.descriptor.template, `${filename}: missing template`)
  return parsed.descriptor.template.content
}

function compile(template, filename) {
  let wxml = ''
  const result = compileMpTemplate(template, {
    filename,
    miniProgram: {
      class: { array: true },
      slot: { fallbackContent: false, dynamicSlotNames: true },
      directive: '',
      emitFile: asset => { wxml = asset.source },
    },
  })
  assert.ok(result.code, `${filename}: uni mp template compiler returned no code`)
  assert.deepEqual(result.errors || [], [], `${filename}: uni mp template compiler errors`)
  assert.ok(wxml, `${filename}: uni mp template compiler emitted no WXML`)
  return { code: result.code, wxml }
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `component is missing function ${name}`)
  const brace = source.indexOf('{', start)
  let depth = 0
  let quote = ''
  let escaped = false
  for (let i = brace; i < source.length; i++) {
    const char = source[i]
    if (quote) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue }
    if (char === '{') depth++
    if (char === '}' && --depth === 0) return source.slice(start, i + 1)
  }
  assert.fail(`unterminated function ${name}`)
}

for (const relative of targets) {
  const source = await readFile(path.join(root, relative), 'utf8')
  const mpTemplate = preprocess(templateOf(source, relative), 'mp-weixin')
  compile(mpTemplate, relative)
  console.log(`PASS uni-mp-weixin template compile: ${relative}`)
}

const pages = await Promise.all(pageFiles.map(async file => ({ file, source: await readFile(path.join(root, file), 'utf8') })))
for (const { file, source } of pages) {
  const mp = preprocess(templateOf(source, file), 'mp-weixin')
  const { wxml: mpWxml } = compile(mp, file)
  assert.ok(/nearby-disposal-panel/.test(mpWxml), `${file}: generated WeChat WXML has no disposal panel`)
  const compiledMapStart = mpWxml.indexOf('<map')
  const compiledMapEnd = mpWxml.indexOf('</map>', compiledMapStart)
  const compiledPanelAt = mpWxml.indexOf('<nearby-disposal-panel')
  assert.ok(compiledMapStart >= 0 && compiledMapEnd > compiledMapStart && compiledPanelAt > compiledMapEnd, `${file}: generated WeChat panel must be outside map`)
  assert.doesNotMatch(mp, /<NearbyDisposalPanel\b[^>]*\bnative\s*=\s*["']true["']/)
  const mapStart = mp.indexOf('<map')
  const mapEnd = mp.indexOf('</map>', mapStart)
  const panelAt = mp.indexOf('<NearbyDisposalPanel')
  assert.ok(mapStart >= 0 && mapEnd > mapStart && panelAt > mapEnd, `${file}: WeChat panel must be outside map`)

  const app = preprocess(templateOf(source, file), 'app-plus')
  assert.match(app, /<AppNearbyDisposalPanel\b/, `${file}: App adapter missing`)
  assert.doesNotMatch(app, /<NearbyDisposalPanel\b/, `${file}: H5/WeChat panel leaked into App`)
  compile(app, `${file} [APP-PLUS]`)

  const h5 = preprocess(templateOf(source, file), 'h5')
  assert.match(h5, /<NearbyDisposalPanel\b/)
  assert.doesNotMatch(h5, /<AppNearbyDisposalPanel\b/)
  compile(h5, `${file} [H5]`)
  console.log(`PASS platform conditional and map placement: ${file}`)
}

const componentSource = await readFile(path.join(root, componentFile), 'utf8')
const componentTemplate = preprocess(templateOf(componentSource, componentFile), 'mp-weixin')
const { wxml: componentWxml } = compile(componentTemplate, componentFile)
assert.match(componentTemplate, /class="disposal-grip"[^>]*@touchstart\.stop\.prevent=/)
for (const event of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
  assert.ok(new RegExp(`catch${event}`).test(componentWxml), `WeChat output is missing catch${event}`)
}
assert.match(componentTemplate, /<scroll-view\b[^>]*class="disposal-list"[^>]*scroll-y/)
assert.match(componentSource, /\.disposal-handle\s*\{[^}]*pointer-events:\s*none/)
assert.equal((componentSource.match(/@keydown=/g) || []).length, 1, 'keyboard handler should be attached once')
console.log('PASS WeChat grip catch events, scroll-view, handle pointer events, single keydown')

const names = ['eventY', 'adjustHeight', 'startResize', 'startMouseResize', 'moveResize', 'endResize', 'closePanel']
const functions = names.map(name => extractFunction(componentSource, name)).join('\n')
const events = []
let timeoutCallback
const scope = {
  ready: { value: true }, closing: { value: false }, expanded: { value: true }, dragStart: { value: null },
  panelHeight: { value: 400 }, minimumHeight: { value: 150 }, maximumHeight: { value: 680 }, wide: { value: false },
  userResized: false, measurement: 0, closeTimer: null, document: undefined, CLOSE_DURATION: 280,
  emit: (...args) => events.push(args), setTimeout: callback => (timeoutCallback = callback, 1), clearTimeout: () => {},
}
const api = new Function('scope', `with (scope) { ${functions}; return { ${names.join(', ')} } }`)(scope)
const reset = () => { scope.panelHeight.value = 400; scope.dragStart.value = null; scope.closing.value = false; scope.expanded.value = true; events.length = 0 }
const drag = (startEvent, moveEvent) => { api.startResize(startEvent); api.moveResize(moveEvent) }

reset(); drag({ touches: [{ clientY: 200 }] }, { touches: [{ clientY: 160 }] }); assert.equal(scope.panelHeight.value, 440, 'standard WeChat touch should grow on upward drag')
reset(); assert.doesNotThrow(() => api.startMouseResize({ clientY: 200 }), 'mouse resize must safely ignore environments without document'); assert.equal(scope.dragStart.value, null)
reset(); drag({ changedTouches: [{ pageY: 200 }] }, { changedTouches: [{ pageY: 160 }] }); assert.equal(scope.panelHeight.value, 440, 'changedTouches-only should resize')
reset(); drag({ detail: { y: '200' } }, { detail: { y: '160' } }); assert.equal(scope.panelHeight.value, 440, 'numeric-string y should resize')
reset(); drag({ touches: [{ y: 200 }] }, { touches: [{ y: 160 }] }); assert.equal(scope.panelHeight.value, 440, 'touch y-only should resize')
reset(); drag({ touches: [{ clientY: 200 }] }, { touches: [{ clientY: 240 }] }); assert.equal(scope.panelHeight.value, 360, 'downward drag should shrink')
reset(); drag({ touches: [{ clientY: 200 }] }, { touches: [{ clientY: 700 }] }); assert.equal(scope.closing.value, true, 'dragging below close threshold should close'); assert.equal(scope.dragStart.value, null, 'close should clear active drag')
const closedHeight = scope.panelHeight.value
api.moveResize({ touches: [{ clientY: 100 }] }); assert.equal(scope.panelHeight.value, closedHeight, 'move after close must not resize')
timeoutCallback(); assert.equal(scope.expanded.value, false, 'close timer should hide panel')
reset(); api.startResize({ touches: [{ clientY: 200 }] }); api.endResize({ changedTouches: [{ clientY: 200 }] }); assert.equal(scope.dragStart.value, null, 'touchcancel/end cleanup should clear active drag'); api.moveResize({ touches: [{ clientY: 100 }] }); assert.equal(scope.panelHeight.value, 400, 'move after touchcancel should not resize')
reset(); api.startResize({ touches: [{ clientY: 200 }] }); api.closePanel(); const afterExplicitClose = scope.panelHeight.value; api.moveResize({ touches: [{ clientY: 100 }] }); assert.equal(scope.panelHeight.value, afterExplicitClose, 'move after explicit close must not resize')
console.log('PASS component event regression: touch variants, grow/shrink, bottom close, cancel cleanup, closed drag ignored')

