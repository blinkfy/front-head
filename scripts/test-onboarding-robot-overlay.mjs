import assert from 'node:assert/strict'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { parse as parseJavaScript } from '@babel/parser'
import { parse as parseSfc } from '@vue/compiler-sfc'
import { parse as parseTemplate } from '@vue/compiler-dom'
import { initPreContext, preCss, preHtml, preJs } from '@dcloudio/uni-cli-shared'

const root = fileURLToPath(new URL('..', import.meta.url))

function loadForPlatform(relativePath, platform) {
  const filename = path.resolve(root, relativePath)
  initPreContext(platform)
  const source = readFileSync(filename, 'utf8')
  const { descriptor, errors } = parseSfc(source, { filename })
  assert.equal(errors.length, 0, relativePath + ' SFC parses')
  const scriptBlock = descriptor.scriptSetup || descriptor.script
  assert.ok(scriptBlock, relativePath + ' has a script block')
  const script = preJs(scriptBlock.content, filename)
  const template = preHtml(descriptor.template.content, filename)
  parseJavaScript(script, { sourceType: 'module' })
  const style = descriptor.styles.map(block => preCss(block.content, filename)).join('\n')
  return { filename, script, template, style, ast: parseJavaScript(script, { sourceType: 'module' }) }
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) { for (const item of node) walk(item, visit); return }
  visit(node)
  for (const value of Object.values(node)) if (value && typeof value === 'object') walk(value, visit)
}

function findVariable(source, ast, name) {
  let result = null
  function inspect(node, parent = null) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) { for (const item of node) inspect(item, parent); return }
    if (node.type === 'VariableDeclarator' && node.id?.name === name && parent?.type === 'VariableDeclaration') {
      result = source.slice(parent.start, parent.end)
    }
    for (const value of Object.values(node)) if (value && typeof value === 'object') inspect(value, node)
  }
  inspect(ast)
  assert.ok(result, 'expected production declaration ' + name)
  return result
}

function findFunction(source, ast, name) {
  let found = null
  walk(ast, node => { if (node.type === 'FunctionDeclaration' && node.id?.name === name) found = node })
  assert.ok(found, 'expected production function ' + name)
  return source.slice(found.start, found.end)
}

function watchCallbacks(source, ast) {
  const callbacks = { overlay: null, active: null }
  walk(ast, node => {
    if (node.type !== 'CallExpression' || node.callee?.name !== 'watch') return
    const sourceNode = node.arguments[0]
    if (sourceNode?.type === 'Identifier' && sourceNode.name === 'overlayFallback') callbacks.overlay = node.arguments[1]
    const body = sourceNode?.type === 'ArrowFunctionExpression' ? sourceNode.body : null
    if (body?.type === 'MemberExpression' && body.object?.name === 'props' && body.property?.name === 'active') callbacks.active = node.arguments[1]
  })
  for (const [name, callback] of Object.entries(callbacks)) assert.ok(callback, 'expected ' + name + ' watcher')
  return Object.fromEntries(Object.entries(callbacks).map(([name, node]) => [name, source.slice(node.start, node.end)]))
}

function elements(template) {
  const ast = parseTemplate(template)
  const result = []
  walk(ast, node => { if (node.type === 1) result.push(node) })
  return result
}

function findElement(template, tag) {
  const result = elements(template).find(node => node.tag === tag)
  assert.ok(result, 'expected template element ' + tag)
  return result
}

function boundExpression(node, name) {
  const binding = node.props.find(prop => prop.type === 7 && prop.name === 'bind' && prop.arg?.content === name)
  return binding?.exp?.content || ''
}

function directiveExpression(node, name) {
  const directive = node.props.find(prop => prop.type === 7 && prop.name === name)
  return directive?.exp?.content || ''
}

function makeRobotHarness(source, { active = true, overlayActive = false } = {}) {
  const ast = parseJavaScript(source.script, { sourceType: 'module' })
  const declarations = ['ready', 'failed', 'loadingStage', 'overlayFallback', 'displayReady'].map(name => findVariable(source.script, ast, name))
  const functions = ['clearLoadingTimer', 'watchLoading', 'handleReady'].map(name => findFunction(source.script, ast, name))
  const callbacks = watchCallbacks(source.script, ast)
  const emitted = []
  let nextId = 0
  const timers = new Map()
  const context = {
    props: { active, overlayActive, state: 'processing' },
    ref: value => ({ value }),
    computed: getter => ({ get value() { return getter() } }),
    setTimeout(callback, delay) { const id = ++nextId; timers.set(id, { callback, delay }); return id },
    clearTimeout(id) { timers.delete(id) },
    emit: name => emitted.push(name)
  }
  const program = [
    'let destroyed = false; let engine = null; let loadingTimer = null',
    ...declarations,
    ...functions,
    `this.state = { ready, failed, loadingStage, overlayFallback, displayReady }`,
    `this.methods = { clearLoadingTimer, watchLoading, handleReady }`,
    `this.watchers = { overlay: ${callbacks.overlay}, active: ${callbacks.active} }`
  ].join('\n')
  runInNewContext(program, context, { filename: 'SmartSortRobot3D-overlay.js' })
  return { context, emitted, timers, state: context.state, methods: context.methods, watchers: context.watchers }
}

function verifyMpOverlayLifecycle(mp) {
  const harness = makeRobotHarness(mp, { overlayActive: true })
  harness.methods.watchLoading()
  assert.equal(harness.state.overlayFallback.value, true, 'MP overlay activates the fallback layer')
  assert.equal(harness.state.displayReady.value, false, 'MP overlay hides XR-ready rendering')
  assert.equal(harness.timers.size, 0, 'initial MP overlay does not start the 15s XR timeout')

  const xr = findElement(mp.template, 'smart-sort-xr')
  assert.ok(directiveExpression(xr, 'if').includes('!overlayFallback'), 'MP XR node is not mounted during overlay fallback')

  harness.context.props.overlayActive = false
  harness.watchers.overlay(false)
  assert.equal([...harness.timers.values()][0]?.delay, 15000, 'leaving overlay resumes the normal XR-ready timeout')
  harness.methods.handleReady()
  assert.equal(harness.state.ready.value, true, 'XR can become ready after leaving overlay')
  assert.equal(harness.timers.size, 0, 'XR ready clears its timeout')
  assert.deepEqual(harness.emitted, ['ready'])

  harness.context.props.overlayActive = true
  harness.watchers.overlay(true)
  assert.equal(harness.state.ready.value, false, 'entering overlay clears an earlier ready state')
  assert.equal(harness.timers.size, 0, 'overlay entry keeps the XR timeout cleared')
  const beforeLateReady = harness.emitted.length
  harness.methods.handleReady()
  assert.equal(harness.state.ready.value, false, 'late XR ready cannot make overlay fallback ready')
  assert.equal(harness.emitted.length, beforeLateReady, 'late XR ready does not emit a duplicate ready')

  harness.context.props.overlayActive = false
  harness.watchers.overlay(false)
  assert.equal(harness.timers.size, 1, 'XR timeout is restored after overlay exit')
  harness.methods.handleReady()
  assert.equal(harness.state.ready.value, true, 'XR becomes ready again after the overlay is removed')
  assert.equal(harness.timers.size, 0, 'restored XR ready clears the timer')

  harness.context.props.active = false
  harness.watchers.active(false)
  assert.equal(harness.state.ready.value, false, 'inactive MP XR resets readiness')
  assert.equal(harness.timers.size, 0, 'inactive MP XR has no timeout')
  const beforeInactiveReady = harness.emitted.length
  harness.methods.handleReady()
  assert.equal(harness.state.ready.value, false, 'late XR ready is ignored while inactive')
  assert.equal(harness.emitted.length, beforeInactiveReady, 'inactive late XR ready emits nothing')
  assert.equal(harness.emitted.includes('settled'), false, 'overlay and late-ready handling add no settled event')
}

function verifyPlatformFallbacks(sources) {
  for (const platform of ['h5', 'app-plus']) {
    const source = sources[platform]
    const harness = makeRobotHarness(source, { active: true, overlayActive: true })
    assert.equal(harness.state.overlayFallback.value, false, platform + ' ignores overlay fallback')
    assert.equal(harness.state.displayReady.value, false, platform + ' retains its normal not-yet-ready display')
  }
  assert.ok(elements(sources.h5.template).some(node => node.tag === 'view' && node.props.some(prop => prop.type === 6 && prop.name === 'ref' && prop.value?.content === 'host')), 'H5 keeps its original DOM robot host')
  assert.equal(elements(sources.h5.template).some(node => node.tag === 'smart-sort-xr'), false, 'H5 does not receive the MP XR branch')
  assert.ok(elements(sources['app-plus'].template).some(node => node.tag === 'SmartSortRobotApp'), 'App keeps its native robot renderer')
  assert.equal(elements(sources['app-plus'].template).some(node => node.tag === 'smart-sort-xr'), false, 'App does not receive the MP XR branch')
}

function verifyOverlayBindings(mpSources) {
  const visualRobot = findElement(mpSources.visual.template, 'SmartSortRobot3D')
  assert.equal(boundExpression(visualRobot, 'overlay-active'), 'overlayActive', 'visual forwards overlayActive')
  const demoRobot = findElement(mpSources.demo.template, 'SmartSortRobot3D')
  assert.equal(boundExpression(demoRobot, 'overlay-active'), 'true', 'onboarding demo opts into overlay fallback')
  for (const [theme, source] of [['light', mpSources.light], ['dark', mpSources.dark]]) {
    const visual = findElement(source.template, 'SmartSortRecognitionVisual')
    const entryRobot = findElement(source.template, 'SmartSortRobot3D')
    assert.equal(boundExpression(visual, 'overlay-active'), 'showAppOnboarding', theme + ' recognition visual receives onboarding state')
    assert.equal(boundExpression(entryRobot, 'overlay-active'), 'showAppOnboarding', theme + ' entry robot receives onboarding state')
  }
}

function verifyFallbackMotion(mp) {
  const icon = findElement(mp.template, 'ManifestIcon')
  const classExpression = boundExpression(icon, 'class')
  assert.ok(classExpression.includes('overlayFallback && active && !reducedMotion'), 'fallback motion respects overlay, active and reduced-motion props')
  assert.ok(mp.style.includes('.robot-slot.overlay-fallback { overflow: hidden; }'), 'MP fallback stays within its robot slot')
  assert.ok(mp.style.includes('animation: overlay-robot-float 1.8s ease-in-out infinite'), 'MP overlay fallback retains its lightweight float animation')
  assert.ok(mp.style.includes('@keyframes overlay-robot-float'), 'MP overlay fallback animation keyframes remain present')
}

const platforms = {}
for (const platform of ['mp-weixin', 'h5', 'app-plus']) {
  platforms[platform] = loadForPlatform('src/components/SmartSortRobot3D.vue', platform)
}
const routes = {}
for (const [key, filename] of Object.entries({
  visual: 'src/components/SmartSortRecognitionVisual.vue',
  demo: 'src/components/OnboardingRecognitionDemo.vue',
  light: 'src/pages/home/home.vue',
  dark: 'src/pages-dark/home/home.vue'
})) routes[key] = loadForPlatform(filename, 'mp-weixin')

verifyMpOverlayLifecycle(platforms['mp-weixin'])
verifyPlatformFallbacks({ h5: platforms.h5, 'app-plus': platforms['app-plus'] })
verifyOverlayBindings(routes)
verifyFallbackMotion(platforms['mp-weixin'])
console.log('onboarding robot overlay lifecycle and routing tests passed')
