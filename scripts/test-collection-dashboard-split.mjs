import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const parser = require('@babel/parser')
const traverse = require('@babel/traverse').default
const generate = require('@babel/generator').default
const babel = require('@babel/core')
const transformModules = require('@babel/plugin-transform-modules-commonjs').default
const sfcCompiler = require('@vue/compiler-sfc')
const uniCompiler = require('@dcloudio/uni-cli-shared')

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(appRoot, '..')
const baselineRoot = path.resolve(process.env.REFACTOR_BASELINE_ROOT || path.join(repoRoot, '.refactor-baselines/large-modules-20261024'))
const relativePage = 'front-head/src/pages-admin/collection-dashboard.vue'
const currentPagePath = path.join(appRoot, 'src/pages-admin/collection-dashboard.vue')
const baselinePagePath = path.join(baselineRoot, relativePage)
const currentModuleDir = path.join(appRoot, 'src/pages-admin/collection-dashboard')
const manifestPath = path.join(baselineRoot, 'dashboard-extraction.json')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const checks = []

function check(name, passed, detail = '') {
  checks.push({ name, passed: Boolean(passed), detail })
}

function parseScript(code, filename) {
  return parser.parse(code, {
    sourceType: 'module',
    sourceFilename: filename,
    plugins: ['importAttributes', 'topLevelAwait']
  })
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== 'object') return value
  const out = {}
  for (const key of Object.keys(value).sort()) {
    if (['loc', 'start', 'end', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) continue
    if (key === 'extra') {
      const raw = value.extra?.raw
      if (raw !== undefined) out.literalRaw = raw
      continue
    }
    out[key] = canonical(value[key])
  }
  return out
}

function normalized(value) {
  return JSON.stringify(canonical(value))
}

function declarationNodeForName(ast, wanted) {
  let found = null
  traverse(ast, {
    FunctionDeclaration(p) {
      if (!found && p.node.id?.name === wanted) found = { kind: 'function', node: p.node }
    },
    VariableDeclarator(p) {
      if (!found && p.node.id?.type === 'Identifier' && p.node.id.name === wanted) {
        const declaration = p.parentPath.node
        found = { kind: declaration.kind, node: declaration }
      }
    }
  })
  return found
}

function directDeclarations(ast) {
  const out = new Map()
  for (const statement of ast.program.body) {
    const node = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (!node) continue
    if (node.type === 'FunctionDeclaration' && node.id) out.set(node.id.name, { kind: 'function', node })
    if (node.type === 'VariableDeclaration') {
      for (const declarator of node.declarations) {
        const ids = []
        const collect = item => {
          if (!item) return
          if (item.type === 'Identifier') ids.push(item.name)
          else if (item.type === 'ObjectPattern') item.properties.forEach(prop => collect(prop.type === 'RestElement' ? prop.argument : prop.value))
          else if (item.type === 'ArrayPattern') item.elements.forEach(collect)
          else if (item.type === 'RestElement' || item.type === 'AssignmentPattern') collect(item.argument || item.left)
        }
        collect(declarator.id)
        ids.forEach(name => out.set(name, { kind: node.kind, node }))
      }
    }
  }
  return out
}

function nodesByCallName(ast, names) {
  const out = new Map(names.map(name => [name, []]))
  traverse(ast, {
    CallExpression(p) {
      const callee = p.node.callee
      const name = callee.type === 'Identifier' ? callee.name : null
      if (out.has(name)) out.get(name).push(p.node)
    }
  })
  for (const nodes of out.values()) nodes.sort((a, b) => normalized(a).localeCompare(normalized(b)))
  return out
}

function freeIdentifiers(ast, globals) {
  const free = new Set()
  traverse(ast, {
    ReferencedIdentifier(p) {
      const name = p.node.name
      if (!p.scope.getBinding(name) && !globals.has(name)) free.add(name)
    }
  })
  return [...free].sort()
}

function referencedIdentifiers(ast) {
  const names = new Set()
  traverse(ast, { ReferencedIdentifier(p) { names.add(p.node.name) } })
  return names
}

function moduleBindingExports(ast) {
  const keys = new Set()
  traverse(ast, {
    ReturnStatement(p) {
      if (p.node.argument?.type !== 'ObjectExpression') return
      for (const property of p.node.argument.properties) {
        if (property.type === 'ObjectProperty' || property.type === 'ObjectMethod') {
          const key = property.key.type === 'Identifier' ? property.key.name : property.key.value
          keys.add(String(key))
        }
      }
    }
  })
  return keys
}

function makeFixedDate(timestamp) {
  const NativeDate = Date
  return class FixedDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [timestamp])) }
    static now() { return timestamp }
  }
}

function makeStorageRuntime(platform) {
  const values = new Map()
  const localStorage = {
    getItem: key => values.has(String(key)) ? values.get(String(key)) : null,
    setItem: (key, value) => values.set(String(key), String(value))
  }
  const uni = {
    getStorageSync: key => values.has(String(key)) ? values.get(String(key)) : '',
    setStorageSync: (key, value) => values.set(String(key), value)
  }
  return { values, localStorage, uni, platform }
}

const runtimeTimestamp = Date.UTC(2026, 9, 24, 12, 0, 0)

function makeVueRuntime() {
  const watchers = []
  const ref = value => ({ value })
  const computed = getter => Object.defineProperty({}, 'value', { enumerable: true, get: getter })
  const nextTick = callback => callback ? Promise.resolve().then(callback) : Promise.resolve()
  const watch = (source, callback, options) => { watchers.push({ source, callback, options }) }
  return { watchers, ref, computed, nextTick, watch }
}

function executeCommonJs(source, filename, dependencies = {}, globals = {}) {
  const transformed = babel.transformSync(source, {
    filename,
    babelrc: false,
    configFile: false,
    plugins: [transformModules]
  }).code
  const module = { exports: {} }
  const requireStub = specifier => {
    if (Object.prototype.hasOwnProperty.call(dependencies, specifier)) return dependencies[specifier]
    throw new Error(`Unexpected runtime import ${specifier} from ${filename}`)
  }
  const sandbox = {
    module,
    exports: module.exports,
    require: requireStub,
    Date: makeFixedDate(runtimeTimestamp),
    ...globals
  }
  vm.runInNewContext(transformed, sandbox, { filename })
  return module.exports
}

function loadNewModule(group, platform, storage, dependencies = {}, extraGlobals = {}) {
  uniCompiler.initPreContext(platform)
  const filename = path.join(currentModuleDir, group.file)
  const source = uniCompiler.preJs(fs.readFileSync(filename, 'utf8'), filename)
  return executeCommonJs(source, filename, dependencies, {
    localStorage: storage.localStorage,
    uni: storage.uni,
    console,
    ...extraGlobals
  })
}

function loadOldDeclarations(group, platform, globals = {}) {
  uniCompiler.initPreContext(platform)
  const source = uniCompiler.preJs(oldDescriptor.scriptSetup.content, baselinePagePath)
  const ast = parseScript(source, baselinePagePath)
  const declarations = []
  const exported = []
  for (const name of group.names) {
    const entry = declarationNodeForName(ast, name)
    if (entry) {
      declarations.push(generate(entry.node).code)
      exported.push(name)
    }
  }
  if (group.file === 'sorting-workflow.js') {
    traverse(ast, {
      CallExpression(p) {
        if (p.node.callee.type === 'Identifier' && p.node.callee.name === 'watch' && p.parentPath.isExpressionStatement()) {
          declarations.push(generate(p.parentPath.node).code)
        }
      }
    })
  }
  declarations.push(`module.exports = { ${exported.join(', ')} }`)
  const module = { exports: {} }
  const vue = makeVueRuntime()
  const sandbox = {
    module,
    exports: module.exports,
    Date: makeFixedDate(runtimeTimestamp),
    ref: vue.ref,
    computed: vue.computed,
    nextTick: vue.nextTick,
    watch: vue.watch,
    watchers: vue.watchers,
    ...globals
  }
  vm.runInNewContext(declarations.join('\n'), sandbox, { filename: `${baselinePagePath}#${group.file}` })
  return { api: module.exports, watchers: vue.watchers }
}

function serialize(value) {
  return JSON.stringify(value)
}

function assertSame(label, left, right) {
  const leftJson = serialize(left)
  const rightJson = serialize(right)
  if (leftJson !== rightJson) throw new Error(`${label} differs\nbaseline: ${leftJson}\ncurrent:  ${rightJson}`)
}

function runFormatBehavior(platform) {
  const group = manifest.groups.find(item => item.file === 'format.js')
  const oldStorage = makeStorageRuntime(platform)
  const newStorage = makeStorageRuntime(platform)
  const oldApi = loadOldDeclarations(group, platform, { localStorage: oldStorage.localStorage, uni: oldStorage.uni }).api
  const newApi = loadNewModule(group, platform, newStorage)
  const results = api => ({
    edge: [api.n('x', 7), api.clamp('x', 10, 20), api.clampFill(-3), api.clampFill(118), api.countdownToFull(-0.5), api.countdownToFull('bad')],
    identity: [api.pointCode(0), api.defaultBinCode(23), api.zhongshanParkPointName(0), api.zhongshanParkPointName(24), api.withPointIdentity({ id: 9, isUrgent: true }, 0)],
    mapping: api.applyDashboardBinNames({
      bins: [{ id: 1, name: '忽略名称', latitude: 1 }, { id: 2, pointCode: 'CUSTOM', binCode: 'B-X' }],
      plan: { bins: [{ id: 1, old: true }, { id: 3, name: '保留' }], route: { stops: [{ id: 1, order: 1 }, { id: 3, order: 2 }], tag: 'route' } }
    }),
    interpolation: [
      api.interpolatePoint({ latitude: 10, longitude: 20 }, { latitude: 20, longitude: 30 }, 1.5),
      api.pointAlongRoute([[36, 120], [36.1, 120], [36.1, 120.2]], -1),
      api.pointAlongRoute([[36, 120], [36.1, 120], [36.1, 120.2]], 0.75),
      api.pointAlongRoute([[1, 2]], 0.5)
    ],
    routeAndDisplay: [api.decodeEntryParam('%252Fpages%252Ffoo'), api.decodeEntryParam('%E0%A4%A'), api.displayTaskLabel('replacement', 'running')]
  })
  assertSame(`${platform} format boundaries/mapping`, results(oldApi), results(newApi))
  const key = 'collection_route_strategy'
  oldApi.setStorage(key, 'shortest_time')
  newApi.setStorage(key, 'shortest_time')
  assertSame(`${platform} storage get`, oldApi.getStorage(key), newApi.getStorage(key))
  assertSame(`${platform} storage backing`, [...oldStorage.values], [...newStorage.values])
}

function runKpiBehavior() {
  const group = manifest.groups.find(item => item.file === 'kpi-history.js')
  const formatGroup = manifest.groups.find(item => item.file === 'format.js')
  const oldStorage = makeStorageRuntime('h5')
  const newStorage = makeStorageRuntime('h5')
  const oldFormat = loadOldDeclarations(formatGroup, 'h5', { localStorage: oldStorage.localStorage, uni: oldStorage.uni }).api
  const newFormat = loadNewModule(formatGroup, 'h5', newStorage)
  const oldState = { kpiSeries: [] }
  const newState = { kpiSeries: [] }
  const oldApi = loadOldDeclarations(group, 'h5', {
    ...oldFormat,
    getStorage: oldFormat.getStorage,
    setStorage: oldFormat.setStorage,
    seededRatio: oldFormat.seededRatio,
    clamp: oldFormat.clamp,
    n: oldFormat.n,
    _state: oldState,
    localStorage: oldStorage.localStorage,
    uni: oldStorage.uni
  }).api
  const newApi = loadNewModule(group, 'h5', newStorage, { './format.js': newFormat }).createCollectionKpiHistory({ _state: newState })
  const malformedKey = 'collection_dashboard_kpi_history_v2'
  oldStorage.localStorage.setItem(malformedKey, '{broken')
  newStorage.localStorage.setItem(malformedKey, '{broken')
  assertSame('KPI malformed history recovery', oldApi.loadKpiSeries(), newApi.loadKpiSeries())
  const history = [
    { ts: runtimeTimestamp - 36 * 24 * 60 * 60 * 1000, total: 1 },
    { ts: runtimeTimestamp - 2 * 60 * 60 * 1000, total: 22, urgent: 4 },
    { ts: runtimeTimestamp + 1000, total: 33, urgent: 5 }
  ]
  oldApi.saveKpiSeries(history)
  newApi.saveKpiSeries(history)
  assertSame('KPI persisted history', [...oldStorage.values], [...newStorage.values])
  oldState.kpiSeries = oldApi.loadKpiSeries()
  newState.kpiSeries = newApi.loadKpiSeries()
  const current = { total: 40, urgent: 2, average: 70, distance: 4.2, duration: 29 }
  assertSame('KPI nearest persisted/fallback and delta edges', {
    nearest: [oldApi.nearestKpi(2, current, 'day'), oldApi.nearestKpi(24, current, 'day')],
    deltas: [oldApi.deltaTag('KPI', 0, 0, '%', false), oldApi.deltaTag('KPI', -2, 1, '%', true), oldApi.deltaTag('KPI', 'bad', 1, '', false)]
  }, {
    nearest: [newApi.nearestKpi(2, current, 'day'), newApi.nearestKpi(24, current, 'day')],
    deltas: [newApi.deltaTag('KPI', 0, 0, '%', false), newApi.deltaTag('KPI', -2, 1, '%', true), newApi.deltaTag('KPI', 'bad', 1, '', false)]
  })
  const many = Array.from({ length: 805 }, (_, index) => ({ ts: runtimeTimestamp - index, total: index }))
  oldState.kpiSeries = many
  newState.kpiSeries = many
  oldApi.pushKpi({ total: 999, urgent: 3 })
  newApi.pushKpi({ total: 999, urgent: 3 })
  assertSame('KPI push pruning/cap/storage', { state: oldState.kpiSeries, stored: [...oldStorage.values] }, { state: newState.kpiSeries, stored: [...newStorage.values] })
}

function mapDependencies(state, refs, format) {
  return {
    _state: state,
    monitor: { active: false, scene: '', dispatchCases: [], activeDispatchCaseId: '' },
    mapMarkers: refs.mapMarkers,
    mapPolyline: refs.mapPolyline,
    mapCenter: refs.mapCenter,
    mapScale: refs.mapScale,
    DEFAULT_CENTER: { latitude: 36.0671, longitude: 120.3826 },
    selectedBinId: refs.selectedBinId,
    selectedStopOrder: refs.selectedStopOrder,
    routeStrategy: { value: 'shortest_time' },
    isLightTheme: { value: false },
    focusDispatchCase() {},
    renderLists: refs.renderLists,
    ...format
  }
}

function makeMapFixture(format) {
  const state = {
    bins: [
      { id: 'b-1', name: 'P001', latitude: 36.0671, longitude: 120.3826, currentFill: 92, type: 'smart', pointCode: 'P001', pointName: '中山北门' },
      { id: 'b-2', name: 'P002', latitude: 36.071, longitude: 120.39, currentFill: 72, type: 'normal' }
    ],
    plan: { route: { polyline: [[36.0671, 120.3826], [36.071, 120.39]] } },
    startPoint: { latitude: 36.068, longitude: 120.384 }
  }
  const renderCounts = { count: 0 }
  const refs = {
    mapMarkers: { value: [] }, mapPolyline: { value: [] }, mapCenter: { value: { latitude: 0, longitude: 0 } }, mapScale: { value: 12 },
    selectedBinId: { value: null }, selectedStopOrder: { value: null }, renderLists: () => { renderCounts.count += 1 }
  }
  return { state, refs, renderCounts, deps: mapDependencies(state, refs, format) }
}

function runMapBehavior() {
  const mapGroup = manifest.groups.find(item => item.file === 'map-renderer.js')
  const formatGroup = manifest.groups.find(item => item.file === 'format.js')
  const oldFormat = loadOldDeclarations(formatGroup, 'mp-weixin').api
  const storage = makeStorageRuntime('mp-weixin')
  const newFormat = loadNewModule(formatGroup, 'mp-weixin', storage)
  const oldFixture = makeMapFixture(oldFormat)
  const oldMap = loadOldDeclarations(mapGroup, 'mp-weixin', oldFixture.deps).api
  const newFixture = makeMapFixture(newFormat)
  const newMapModule = loadNewModule(mapGroup, 'mp-weixin', storage, { './format.js': newFormat })
  const newMap = newMapModule.createCollectionMapRenderer(newFixture.deps)
  const snapshot = (map, fixture) => {
    map.buildMpMapData()
    const initial = { markers: fixture.refs.mapMarkers.value, polyline: fixture.refs.mapPolyline.value, center: fixture.refs.mapCenter.value }
    map.focusBin('b-2')
    return {
      initial,
      afterFocus: {
        selectedBinId: fixture.refs.selectedBinId.value,
        selectedStopOrder: fixture.refs.selectedStopOrder.value,
        center: fixture.refs.mapCenter.value,
        scale: fixture.refs.mapScale.value,
        markers: fixture.refs.mapMarkers.value,
        polyline: fixture.refs.mapPolyline.value,
        renderCount: fixture.renderCounts.count
      }
    }
  }
  assertSame('MP marker/polyline build and focus mapping', snapshot(oldMap, oldFixture), snapshot(newMap, newFixture))
}

async function runSortingBehavior() {
  const group = manifest.groups.find(item => item.file === 'sorting-workflow.js')
  const formatGroup = manifest.groups.find(item => item.file === 'format.js')
  const videoConfig = {
    durationSeconds: 18.33,
    playbackRate: 1,
    cuePoints: { arrive: { startSeconds: 0 }, weigh: { startSeconds: 1.3 }, wash: { startSeconds: 4.68 }, dry: { startSeconds: 7.15 }, battery: { startSeconds: 8.55 }, charge: { startSeconds: 13.1 }, ready: { startSeconds: 16.57 } }
  }
  const storage = makeStorageRuntime('h5')
  const format = loadNewModule(formatGroup, 'h5', storage)
  const createVideo = () => ({
    currentTime: 4,
    playbackRate: 0,
    calls: [],
    fastSeek(seconds) { this.calls.push(['fastSeek', seconds]); this.currentTime = seconds },
    play() { this.calls.push(['play']); return Promise.resolve() },
    pause() { this.calls.push(['pause']) }
  })
  const createInstance = old => {
    const monitor = { active: false, scene: '', sortingProgress: 0, sortingStageText: '等待返航桶抵达分拣中心', sortingStatus: '待接收' }
    const video = createVideo()
    const refs = old ? null : makeVueRuntime()
    const globals = { clamp: format.clamp, CENTER_WORKFLOW_MASTER_VIDEO: videoConfig }
    let api
    let watchers
    if (old) {
      const loaded = loadOldDeclarations(group, 'h5', { ...globals, monitor, sortingMasterVideoRef: undefined })
      api = loaded.api
      watchers = loaded.watchers
    } else {
      const module = loadNewModule(group, 'h5', storage, {
        vue: { ref: refs.ref, computed: refs.computed, nextTick: refs.nextTick, watch: refs.watch },
        '../config/center-workflow-video.js': { CENTER_WORKFLOW_MASTER_VIDEO: videoConfig },
        './format.js': format
      }, globals)
      api = module.useSortingWorkflow({ monitor })
      watchers = refs.watchers
    }
    api.sortingMasterVideoRef.value = video
    return { api, monitor, video, watchers }
  }
  const old = createInstance(true)
  const current = createInstance(false)
  const snapshot = ({ api, monitor }) => {
    const project = () => ({
      visual: api.sortingVisualState.value,
      operation: api.sortingOperation.value,
      workpiece: api.sortingWorkpieceStyle.value,
      timeline: api.sortingMasterTimelineSeconds.value,
      started: api.sortingWorkflowStarted.value,
      stageActive: api.sortingStageVideoActive.value,
      device: api.sortingDeviceStatus.value
    })
    return [project(), (() => {
      monitor.active = true; monitor.scene = 'sorting'; monitor.sortingProgress = 45; monitor.sortingStageText = '清洗消毒'; monitor.sortingStatus = '处理中'
      api.sortingManualPlaybackActive.value = true
      api.sortingMasterVideoReady.value = true
      return project()
    })()]
  }
  assertSame('sorting computed workflow states', snapshot(old), snapshot(current))
  assertSame('sorting watchers configured', old.watchers.map(w => w.options), current.watchers.map(w => w.options))

  const action = async instance => {
    const { api, monitor, video, watchers } = instance
    monitor.active = true; monitor.scene = 'sorting'; monitor.sortingProgress = 48
    api.sortingManualPlaybackActive.value = true
    api.sortingMasterVideoReady.value = true
    api.seekSortingMasterVideo(-5)
    api.seekSortingMasterVideo(999)
    await api.playSortingMasterVideo()
    await api.syncSortingMasterVideo(true)
    await watchers[0].callback(true)
    await watchers[1].callback([true, 'sorting'])
    await new Promise(resolve => setTimeout(resolve, 0))
    monitor.scene = 'dispatch'
    await watchers[1].callback([true, 'dispatch'])
    api.pauseSortingMasterVideo(true)
    return { currentTime: video.currentTime, playbackRate: video.playbackRate, calls: video.calls }
  }
  assertSame('sorting seek/play/pause/watch media effects', await action(old), await action(current))
}

function compilePlatform(platform, oldDescriptor, currentDescriptor, cssText) {
  uniCompiler.initPreContext(platform)
  const preprocess = (type, text, filename) => {
    if (type === 'js') return uniCompiler.preJs(text, filename)
    if (type === 'html') return uniCompiler.preHtml(text, filename)
    return uniCompiler.preCss(text, filename)
  }

  const platformFree = []
  const mapChecks = []
  const globals = new Set([
    'Array', 'AbortController', 'Boolean', 'Date', 'Error', 'Infinity', 'Intl', 'JSON', 'Map', 'Math', 'NaN', 'Number', 'Object', 'Promise', 'RegExp', 'Set', 'String', 'URLSearchParams', 'console', 'decodeURIComponent', 'encodeURIComponent', 'isFinite', 'parseFloat', 'parseInt', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', 'uni', 'window', 'document', 'navigator', 'fetch', 'Blob', 'FormData', 'FileReader', 'Image', 'HTMLImageElement', 'XMLSerializer', 'getComputedStyle', 'performance', 'requestIdleCallback', 'queueMicrotask', 'undefined'
  ])
  for (const group of manifest.groups) {
    const filename = path.join(currentModuleDir, group.file)
    const source = fs.readFileSync(filename, 'utf8')
    const compiled = preprocess('js', source, filename)
    const ast = parseScript(compiled, filename)
    const free = freeIdentifiers(ast, globals)
    if (free.length) platformFree.push(`${group.file}: ${free.join(', ')}`)
    if (group.file === 'map-renderer.js') {
      const exports = moduleBindingExports(ast)
      const mapExpected = ['buildMpMapData', 'focusBin', 'focusStop']
      const h5Only = ['markerSvg', 'iconSrc', 'mapSignature', 'clearH5Map', 'showInfoWindow', 'drawMap', 'updateH5DispatchLayers']
      const missing = platform === 'h5' ? h5Only.filter(key => !exports.has(key)) : h5Only.filter(key => exports.has(key))
      const missingMp = mapExpected.filter(key => !exports.has(key))
      mapChecks.push(`${platform}: ${missing.length || missingMp.length ? `bad H5 keys ${missing}; missing common keys ${missingMp}` : 'export guards OK'}`)
      if (platform === 'mp-weixin') {
        const allReferences = referencedIdentifiers(ast)
        const unexpectedGlobals = ['window', 'document', 'TMap'].filter(key => allReferences.has(key))
        if (unexpectedGlobals.length) mapChecks.push(`MP map globals leaked: ${unexpectedGlobals.join(', ')}`)
      }
    }
  }
  check(`${platform} new-module imports/globals`, platformFree.length === 0, platformFree.join('\n'))
  check(`${platform} map H5 macro guard`, mapChecks.length > 0 && mapChecks.every(item => item.endsWith('export guards OK')), mapChecks.join('\n'))

  const pageScript = preprocess('js', currentDescriptor.scriptSetup.content, currentPagePath)
  const pageTemplate = preprocess('html', currentDescriptor.template.content, currentPagePath)
  const pageAst = parseScript(pageScript, currentPagePath)
  const pageSfc = `<template>${pageTemplate}</template>\n<script setup>${pageScript}</script>\n`
  const parsed = sfcCompiler.parse(pageSfc, { filename: currentPagePath })
  const errors = [...(parsed.errors || [])]
  let compiledScript
  try {
    compiledScript = sfcCompiler.compileScript(parsed.descriptor, { id: `collection-dashboard-${platform}` })
  } catch (error) {
    errors.push(error)
  }
  const templateResult = sfcCompiler.compileTemplate({
    source: pageTemplate,
    filename: currentPagePath,
    id: `collection-dashboard-${platform}`,
    compilerOptions: { bindingMetadata: compiledScript?.bindings || {} }
  })
  errors.push(...(templateResult.errors || []))
  const preprocessedStyle = preprocess('css', cssText, currentPagePath)
  const styleResult = sfcCompiler.compileStyle({ source: preprocessedStyle, filename: currentPagePath, id: `collection-dashboard-${platform}` })
  errors.push(...(styleResult.errors || []))
  check(`${platform} SFC compileScript/template/style`, errors.length === 0, errors.map(error => String(error?.message || error)).join('\n'))
  return { pageAst, compiledScript }
}

const oldText = fs.readFileSync(baselinePagePath, 'utf8')
const currentText = fs.readFileSync(currentPagePath, 'utf8')
const oldDescriptorResult = sfcCompiler.parse(oldText, { filename: baselinePagePath })
const currentDescriptorResult = sfcCompiler.parse(currentText, { filename: currentPagePath })
if (oldDescriptorResult.errors.length || currentDescriptorResult.errors.length) {
  throw new Error('SFC parse failure before audit')
}
const oldDescriptor = oldDescriptorResult.descriptor
const currentDescriptor = currentDescriptorResult.descriptor
const oldAst = parseScript(oldDescriptor.scriptSetup.content, baselinePagePath)
const currentAst = parseScript(currentDescriptor.scriptSetup.content, currentPagePath)

const extracted = new Set(manifest.groups.flatMap(group => group.names))
const movedMismatches = []
for (const group of manifest.groups) {
  const modulePath = path.join(currentModuleDir, group.file)
  const moduleAst = parseScript(fs.readFileSync(modulePath, 'utf8'), modulePath)
  for (const name of group.names) {
    const oldNode = declarationNodeForName(oldAst, name)
    const newNode = declarationNodeForName(moduleAst, name)
    if (!oldNode || !newNode) {
      movedMismatches.push(`${name}: ${!oldNode ? 'missing from baseline' : `missing from ${group.file}`}`)
    } else if (oldNode.kind !== newNode.kind || normalized(oldNode.node) !== normalized(newNode.node)) {
      movedMismatches.push(`${name}: AST differs (${group.file})`)
    }
  }
}
check('migrated declarations preserve AST', movedMismatches.length === 0, movedMismatches.join('\n'))

const oldDirect = directDeclarations(oldAst)
const newDirect = directDeclarations(currentAst)
const retainedMismatches = []
for (const [name, oldNode] of oldDirect) {
  if (extracted.has(name)) continue
  const newNode = newDirect.get(name)
  if (!newNode) {
    const movedNode = manifest.groups.map(group => {
      const modulePath = path.join(currentModuleDir, group.file)
      return declarationNodeForName(parseScript(fs.readFileSync(modulePath, 'utf8'), modulePath), name)
    }).find(Boolean)
    if (!movedNode) retainedMismatches.push(`${name}: missing from page and extracted modules`)
    else if (oldNode.kind !== movedNode.kind || normalized(oldNode.node) !== normalized(movedNode.node)) retainedMismatches.push(`${name}: moved declaration AST differs`)
  }
  else if (oldNode.kind !== newNode.kind || normalized(oldNode.node) !== normalized(newNode.node)) retainedMismatches.push(`${name}: AST differs`)
}
for (const name of newDirect.keys()) {
  if (!oldDirect.has(name) && !extracted.has(name)) retainedMismatches.push(`${name}: new page declaration`)
}
check('unmigrated page declarations preserve AST', retainedMismatches.length === 0, retainedMismatches.join('\n'))

const callNames = ['watch', 'onLoad', 'onShow', 'onMounted', 'onBeforeUnmount']
const oldCalls = nodesByCallName(oldAst, callNames)
const newCalls = nodesByCallName(currentAst, callNames)
for (const group of manifest.groups) {
  const modulePath = path.join(currentModuleDir, group.file)
  const ast = parseScript(fs.readFileSync(modulePath, 'utf8'), modulePath)
  const found = nodesByCallName(ast, callNames)
  for (const name of callNames) newCalls.get(name).push(...found.get(name))
}
const lifecycleMismatches = []
for (const name of callNames) {
  const oldValues = oldCalls.get(name).map(normalized).sort()
  const newValues = newCalls.get(name).map(normalized).sort()
  if (JSON.stringify(oldValues) !== JSON.stringify(newValues)) lifecycleMismatches.push(`${name}: baseline ${oldValues.length}, current ${newValues.length}`)
}
check('watch/lifecycle callbacks preserve AST', lifecycleMismatches.length === 0, lifecycleMismatches.join('\n'))

check('template bytes unchanged', oldDescriptor.template.content === currentDescriptor.template.content, `baseline=${Buffer.byteLength(oldDescriptor.template.content)} current=${Buffer.byteLength(currentDescriptor.template.content)}`)
const currentCssPath = path.join(currentModuleDir, 'collection-dashboard.css')
const currentCss = fs.readFileSync(currentCssPath, 'utf8')
check('scoped CSS bytes unchanged', oldDescriptor.styles.length === 1 && oldDescriptor.styles[0].content === currentCss, `baseline=${oldDescriptor.styles[0]?.content?.length} current=${currentCss.length}`)

const platformResults = []
for (const platform of ['h5', 'mp-weixin']) platformResults.push(compilePlatform(platform, oldDescriptor, currentDescriptor, currentCss))

for (const platform of ['h5', 'mp-weixin']) {
  try { runFormatBehavior(platform); check(`${platform} format/storage behavior diff`, true) }
  catch (error) { check(`${platform} format/storage behavior diff`, false, error.stack || String(error)) }
}
try { runKpiBehavior(); check('KPI persistence/trend behavior diff', true) }
catch (error) { check('KPI persistence/trend behavior diff', false, error.stack || String(error)) }
try { runMapBehavior(); check('MP map marker/polyline behavior diff', true) }
catch (error) { check('MP map marker/polyline behavior diff', false, error.stack || String(error)) }
try { await runSortingBehavior(); check('sorting computed/watch/media behavior diff', true) }
catch (error) { check('sorting computed/watch/media behavior diff', false, error.stack || String(error)) }

let failures = 0
for (const result of checks) {
  console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}`)
  if (!result.passed) {
    failures += 1
    if (result.detail) console.log(result.detail)
  }
}
console.log(`\n${checks.length - failures}/${checks.length} checks passed`)
if (failures) process.exitCode = 1
