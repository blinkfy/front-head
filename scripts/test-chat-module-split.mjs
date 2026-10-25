import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const parser = require('@babel/parser')
const traverse = require('@babel/traverse').default
const { parse: parseSfc, compileScript, compileTemplate, compileStyle } = require('@vue/compiler-sfc')
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const baselineRoot = path.resolve(process.env.REFACTOR_BASELINE_ROOT || path.join(root, '..', '.refactor-baselines', 'large-modules-20261024'))
const baselineFile = path.join(baselineRoot, 'front-head', 'src', 'pages-nonTheme', 'chat.vue')
const pageFile = path.join(root, 'src', 'pages-nonTheme', 'chat.vue')
const moduleDir = path.join(root, 'src', 'pages-nonTheme', 'chat')
const moduleFiles = ['audio-methods.js', 'attachment-methods.js', 'image-methods.js', 'file-methods.js', 'cache-methods.js']

function read(file) {
    return fs.readFileSync(file, 'utf8')
}

function parseJs(source, filename = 'chat.js') {
    return parser.parse(source, {
        sourceType: 'module',
        sourceFilename: filename,
        plugins: ['decorators-legacy', 'classProperties', 'dynamicImport', 'importMeta', 'topLevelAwait']
    })
}

function propName(node) {
    if (!node) return null
    if (node.type === 'ObjectMethod' || node.type === 'ObjectProperty') {
        if (!node.computed && node.key.type === 'Identifier') return node.key.name
        if (node.key.type === 'StringLiteral' || node.key.type === 'NumericLiteral') return String(node.key.value)
    }
    return null
}

function sourceOf(source, node) {
    return source.slice(node.start, node.end)
}

function stripPositions(value) {
    if (Array.isArray(value)) return value.map(stripPositions)
    if (!value || typeof value !== 'object') return value
    const result = {}
    for (const [key, child] of Object.entries(value)) {
        if (['start', 'end', 'loc', 'leadingComments', 'trailingComments', 'innerComments', 'comments'].includes(key)) continue
        if (key === 'extra' && child && typeof child === 'object') {
            const extra = { ...child }
            delete extra.parenStart
            result[key] = stripPositions(extra)
        } else {
            result[key] = stripPositions(child)
        }
    }
    return result
}

function equivalentMethod(left, right, label) {
    assert.equal(sourceOf(left.source, left.node), sourceOf(right.source, right.node), `${label}: raw method source changed`)
    assert.deepEqual(stripPositions(left.node), stripPositions(right.node), `${label}: method AST changed`)
}

function sfc(source, filename) {
    const result = parseSfc(source, { filename })
    assert.equal(result.errors.length, 0, `${filename}: SFC parse errors: ${result.errors.join('; ')}`)
    return result.descriptor
}

function defaultOptions(descriptor, filename) {
    const script = descriptor.script
    assert.ok(script, `${filename}: expected normal script block`)
    const ast = parseJs(script.content, filename)
    const exp = ast.program.body.find(node => node.type === 'ExportDefaultDeclaration')
    assert.ok(exp?.declaration?.type === 'ObjectExpression', `${filename}: expected exported options object`)
    return { source: script.content, ast, options: exp.declaration }
}

function methodsObject(options, filename) {
    const property = options.properties.find(node => propName(node) === 'methods')
    assert.ok(property?.value?.type === 'ObjectExpression', `${filename}: expected methods object`)
    return property.value
}

function getModuleExports(source, filename) {
    const ast = parseJs(source, filename)
    const exports = new Map()
    for (const statement of ast.program.body) {
        if (statement.type !== 'ExportNamedDeclaration' || statement.declaration?.type !== 'VariableDeclaration') continue
        for (const declaration of statement.declaration.declarations) {
            if (declaration.id.type !== 'Identifier' || declaration.init?.type !== 'ObjectExpression') continue
            const methods = declaration.init.properties.filter(node => node.type === 'ObjectMethod')
            exports.set(declaration.id.name, { methods, source })
        }
    }
    return { ast, exports }
}

function importsByLocal(source) {
    const ast = parseJs(source, 'chat.vue script')
    const result = new Map()
    for (const node of ast.program.body) {
        if (node.type !== 'ImportDeclaration') continue
        for (const specifier of node.specifiers) {
            result.set(specifier.local.name, { file: node.source.value, imported: specifier.imported?.name || 'default' })
        }
    }
    return result
}

function flattenMethods(methods, moduleImports, modules) {
    const flat = []
    for (const property of methods.properties) {
        if (property.type === 'ObjectMethod') {
            flat.push({ node: property, source: methods.__source })
            continue
        }
        if (property.type === 'SpreadElement' && property.argument.type === 'Identifier') {
            const binding = moduleImports.get(property.argument.name)
            assert.ok(binding, `unresolved methods spread: ${property.argument.name}`)
            const module = modules.get(binding.file)
            assert.ok(module, `methods spread import not loaded: ${binding.file}`)
            const exported = module.exports.get(binding.imported)
            assert.ok(exported, `methods export missing: ${binding.file}#${binding.imported}`)
            flat.push(...exported.methods.map(node => ({ node, source: exported.source })))
            continue
        }
        assert.fail(`unsupported methods property: ${property.type}`)
    }
    return flat
}

function finalMethods(flat) {
    const object = {}
    for (const entry of flat) object[propName(entry.node)] = entry
    return { order: Object.keys(object), entries: object }
}

function compareUnchangedOptions(before, after, label) {
    const left = before.options.properties.filter(node => propName(node) !== 'methods')
    const right = after.options.properties.filter(node => propName(node) !== 'methods')
    assert.deepEqual(left.map(propName), right.map(propName), `${label}: non-method option order changed`)
    left.forEach((node, index) => assert.equal(sourceOf(before.source, node), sourceOf(after.source, right[index]), `${label}: ${propName(node)} changed`))
}

function preprocess(source, flags) {
    const active = [true]
    const stack = []
    const output = []
    const condition = expression => {
        const tokens = expression.match(/[A-Za-z0-9_-]+|&&|\|\||!|\(|\)/g) || []
        let index = 0
        const primary = () => {
            if (tokens[index] === '!') { index++; return !primary() }
            if (tokens[index] === '(') { index++; const value = or(); assert.equal(tokens[index++], ')', `bad macro condition: ${expression}`); return value }
            const token = tokens[index++]
            return Boolean(flags[token])
        }
        const and = () => { let value = primary(); while (tokens[index] === '&&') { index++; const next = primary(); value = value && next } return value }
        const or = () => { let value = and(); while (tokens[index] === '||') { index++; const next = and(); value = value || next } return value }
        return or()
    }
    for (const line of source.split(/(?<=\n)/)) {
        const directive = line.match(/^\s*\/\/\s*#(ifdef|ifndef|elif|else|endif)\s*(.*?)\s*\r?\n?$/)
        if (!directive) { if (active.at(-1)) output.push(line); continue }
        const [, kind, expression] = directive
        if (kind === 'ifdef' || kind === 'ifndef') {
            const test = condition(expression)
            const branch = kind === 'ifdef' ? test : !test
            stack.push({ parent: active.at(-1), branch, matched: branch })
            active.push(active.at(-1) && branch)
        } else if (kind === 'elif') {
            const frame = stack.at(-1)
            assert.ok(frame, 'orphan #elif')
            frame.branch = !frame.matched && condition(expression)
            frame.matched ||= frame.branch
            active[active.length - 1] = frame.parent && frame.branch
        } else if (kind === 'else') {
            const frame = stack.at(-1)
            assert.ok(frame, 'orphan #else')
            frame.branch = !frame.matched
            frame.matched = true
            active[active.length - 1] = frame.parent && frame.branch
        } else {
            assert.ok(stack.pop(), 'orphan #endif')
            active.pop()
        }
    }
    assert.equal(stack.length, 0, 'unclosed platform macro')
    return output.join('')
}

const platformGlobals = new Set([
    'uni', 'wx', 'plus', 'window', 'document', 'navigator', 'File', 'FileReader', 'Blob', 'URL', 'Image',
    'FormData', 'XMLHttpRequest', 'fetch', 'getCurrentPages', 'console', 'setTimeout', 'clearTimeout',
    'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'globalThis', 'process',
    'Buffer', 'atob', 'btoa', 'WebSocket', 'Audio', 'MediaRecorder', 'HTMLElement', 'Event', 'Promise',
    'Date', 'Math', 'JSON', 'Array', 'Object', 'String', 'Number', 'Boolean', 'RegExp', 'Map', 'Set',
    'Error', 'TypeError', 'parseInt', 'parseFloat', 'isNaN', 'Infinity', 'NaN', 'undefined', 'require'
])

function checkFreeReferences(source, filename, platform) {
    const ast = parseJs(source, filename)
    const free = new Set()
    traverse(ast, {
        ReferencedIdentifier(path) {
            const name = path.node.name
            if (!path.scope.hasBinding(name) && !platformGlobals.has(name)) free.add(name)
        }
    })
    assert.deepEqual([...free].sort(), [], `${filename} (${platform}): unresolved identifiers: ${[...free].sort().join(', ')}`)
}

function transformModuleForVm(source, filename, flags, deps, globals = {}) {
    let transformed = preprocess(source, flags)
    const ast = parseJs(transformed, filename)
    const names = []
    for (const statement of ast.program.body) {
        if (statement.type === 'ExportNamedDeclaration' && statement.declaration?.type === 'VariableDeclaration') {
            for (const declaration of statement.declaration.declarations) names.push(declaration.id.name)
        }
    }
    transformed = transformed
        .replace(/^import \* as (\w+) from ['"]([^'"]+)['"]\s*;?\s*$/gm, 'const $1 = __deps["$2"] || {};')
        .replace(/^import \{\s*([^}]+)\s*\} from ['"]([^'"]+)['"]\s*;?\s*$/gm, (_, namesText, specifier) => `const { ${namesText} } = __deps[${JSON.stringify(specifier)}] || {};`)
        .replace(/^export const (\w+)\s*=/gm, 'const $1 =')
    const context = { __deps: deps, __exports: {}, console, Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp, Map, Set, Error, Promise, setTimeout, clearTimeout, ...globals }
    vm.runInNewContext(`${transformed}\nglobalThis.__exports = { ${names.join(', ')} };`, context, { filename })
    return context.__exports
}

function assertNoErrors(errors, label) {
    assert.equal(errors.length, 0, `${label}: ${errors.map(error => error.message || String(error)).join('\n')}`)
}

const beforeSource = read(baselineFile)
const afterSource = read(pageFile)
const beforeDescriptor = sfc(beforeSource, baselineFile)
const afterDescriptor = sfc(afterSource, pageFile)

const blockSource = (source, block) => source.slice(block.loc.start.offset, block.loc.end.offset)
assert.equal(blockSource(beforeSource, beforeDescriptor.template), blockSource(afterSource, afterDescriptor.template), 'template block changed')
assert.deepEqual(beforeDescriptor.styles.map(style => blockSource(beforeSource, style)), afterDescriptor.styles.map(style => blockSource(afterSource, style)), 'style blocks changed')

const before = defaultOptions(beforeDescriptor, baselineFile)
const after = defaultOptions(afterDescriptor, pageFile)
compareUnchangedOptions(before, after, 'chat page')

const moduleMap = new Map()
for (const file of moduleFiles) {
    const filename = path.join(moduleDir, file)
    const source = read(filename)
    moduleMap.set(`@/pages-nonTheme/chat/${file}`, { ...getModuleExports(source, filename), source, filename })
    for (const [platform, flags] of [
        ['H5', { H5: true, 'MP-WEIXIN': false, 'APP-PLUS': false }],
        ['MP-WEIXIN', { H5: false, 'MP-WEIXIN': true, 'APP-PLUS': false }]
    ]) {
        const preprocessed = preprocess(source, flags)
        parseJs(preprocessed, `${filename} (${platform})`)
        checkFreeReferences(preprocessed, `${filename} (${platform})`, platform)
    }
}

const moduleImports = importsByLocal(after.source)
const beforeMethods = methodsObject(before.options, baselineFile)
beforeMethods.__source = before.source
const afterMethods = methodsObject(after.options, pageFile)
afterMethods.__source = after.source
const originalFlat = flattenMethods(beforeMethods, new Map(), new Map())
const currentFlat = flattenMethods(afterMethods, moduleImports, moduleMap)

const moved = new Map()
let extractedMethodCount = 0
for (const module of moduleMap.values()) {
    for (const exported of module.exports.values()) {
        for (const method of exported.methods) {
            extractedMethodCount++
            const name = propName(method)
            const entries = originalFlat.filter(entry => propName(entry.node) === name)
            assert.ok(entries.length > 0, `${name}: extracted method absent from baseline`)
            const expected = entries.length > 1 ? entries.at(-1) : entries[0]
            equivalentMethod({ source: module.source, node: method }, expected, name)
            moved.set(name, entries.length > 1 ? entries.length - 1 : 0)
        }
    }
}

const originalOccurrences = new Map()
const expectedPageMethods = originalFlat.filter(entry => {
    const name = propName(entry.node)
    const occurrence = originalOccurrences.get(name) || 0
    originalOccurrences.set(name, occurrence + 1)
    return !moved.has(name) || occurrence !== moved.get(name)
})
const currentPageMethods = afterMethods.properties.filter(node => node.type === 'ObjectMethod').map(node => ({ node, source: after.source }))
assert.deepEqual(currentPageMethods.map(entry => propName(entry.node)), expectedPageMethods.map(entry => propName(entry.node)), 'page method order or retained duplicates changed')
expectedPageMethods.forEach((entry, index) => equivalentMethod(currentPageMethods[index], entry, `retained ${propName(entry.node)}`))

const originalFinal = finalMethods(originalFlat)
const currentFinal = finalMethods(currentFlat)
assert.deepEqual(currentFinal.order, originalFinal.order, 'resolved methods key order changed')
for (const name of originalFinal.order) equivalentMethod(currentFinal.entries[name], originalFinal.entries[name], `resolved ${name}`)

const compiled = compileScript(afterDescriptor, { id: 'chat-module-split-test' })
const templateResult = compileTemplate({
    source: afterDescriptor.template.content,
    filename: pageFile,
    id: 'chat-module-split-test',
    compilerOptions: { bindingMetadata: compiled.bindings }
})
assertNoErrors(templateResult.errors, 'chat template compilation')
for (const [index, style] of afterDescriptor.styles.entries()) {
    const result = compileStyle({
        source: style.content,
        filename: pageFile,
        id: `chat-module-split-test-${index}`,
        scoped: style.scoped,
        preprocessLang: style.lang
    })
    assertNoErrors(result.errors, `chat style ${index} compilation`)
}

const deps = {
    '@/pages-nonTheme/api/chat.js': {},
    '@/api/settings.js': { baseUrl: 'https://example.test' },
    '@/utils/chat-history-cache.js': { loadChatHistoryCache: async () => [], saveChatHistoryCache: async () => {} },
    '@/pages-nonTheme/utils/chat-media-cache.js': {
        cacheChatOriginalImage: async () => '', removeCachedChatOriginalImage: async () => {}, restoreCachedChatOriginalImages: async () => {}
    }
}
const h5Flags = { H5: true, 'MP-WEIXIN': false, 'APP-PLUS': false }
const mpFlags = { H5: false, 'MP-WEIXIN': true, 'APP-PLUS': false }
const storage = new Map([['userInfo', { id: 42 }]])
const fileReaders = []
const quietConsole = { log() {}, warn() {}, error() {} }
class FakeFileReader {
    readAsDataURL(file) { this.file = file; fileReaders.push(this) }
}
const uni = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    chooseImage: options => { uni.imageOptions = options },
    showToast: options => { uni.toast = options },
    getImageInfo: options => { uni.imageInfoOptions = options }
}
const loaded = Object.fromEntries(moduleFiles.map(file => [file, transformModuleForVm(read(path.join(moduleDir, file)), file, h5Flags, deps, { uni, FileReader: FakeFileReader, console: quietConsole })]))

// Cache and picker behavior still uses Vue-bound `this` and the same storage keys/callbacks.
const cacheContext = { chatId: 'conversation-7', localFileCache: { a: 1 } }
Object.assign(cacheContext, loaded['cache-methods.js'].localFileCacheMethods)
{
    const cacheKey = 'file_cache_42_conversation-7'
    cacheContext.saveLocalFileCache.call(cacheContext)
    assert.equal(storage.get(cacheKey), '{"a":1}')
    storage.set(cacheKey, '{"b":2}')
    cacheContext.localFileCache = {}
    cacheContext.loadLocalFileCache.call(cacheContext)
    assert.deepEqual({ ...cacheContext.localFileCache }, { b: 2 })

    const pickerContext = { showMorePanel: true, sent: [], sendImageMessage(path) { this.sent.push(path) } }
    loaded['attachment-methods.js'].mediaPickerMethods.chooseImage.call(pickerContext)
    uni.imageOptions.success({ tempFilePaths: ['/tmp/a.png', '/tmp/b.png'] })
    assert.deepEqual(pickerContext.sent, ['/tmp/a.png', '/tmp/b.png'])
    assert.equal(pickerContext.showMorePanel, false)

    const dropContext = { isDragOver: true, dropped: null, processDroppedFiles(files) { this.dropped = files } }
    let prevented = false
    let stopped = false
    loaded['attachment-methods.js'].attachmentIngressMethods.onDrop.call(dropContext, {
        preventDefault() { prevented = true }, stopPropagation() { stopped = true },
        dataTransfer: { files: [{ name: 'one.txt' }, { name: 'two.png' }] }
    })
    assert.equal(prevented && stopped, true)
    assert.equal(dropContext.isDragOver, false)
    assert.deepEqual(dropContext.dropped.map(file => file.name), ['one.txt', 'two.png'])

    const ingressMethods = loaded['attachment-methods.js'].attachmentIngressMethods
    const sent = []
    const ingressContext = {
        ...ingressMethods, isDragOver: false,
        sendImageMessage(data) { sent.push(['image', data]) },
        sendVideoMessage(data, name) { sent.push(['video', data, name]) },
        sendFileMessage(data, name, size) { sent.push(['file', data, name, size]) }
    }
    const pastedImage = { name: 'pasted.png', type: 'image/png', size: 32 }
    ingressContext.onPasteNative.call(ingressContext, {
        clipboardData: { items: [{ kind: 'file', type: pastedImage.type, getAsFile: () => pastedImage }], files: [] }
    })
    const imageReader = fileReaders.pop()
    assert.equal(imageReader.file, pastedImage)
    imageReader.onload({ target: { result: 'data:image/png;base64,AAAA' } })
    assert.deepEqual(sent.shift(), ['image', 'data:image/png;base64,AAAA'])

    const droppedFile = { name: 'notes.txt', type: 'text/plain', size: 14 }
    ingressContext.onDrop.call(ingressContext, { dataTransfer: { files: [droppedFile] } })
    const fileReader = fileReaders.pop()
    assert.equal(fileReader.file, droppedFile)
    fileReader.onload({ target: { result: 'data:text/plain;base64,AA==' } })
    assert.deepEqual(sent.shift(), ['file', 'data:text/plain;base64,AA==', 'notes.txt', 14])

    const imageMethods = {
        ...loaded['image-methods.js'].imageSourceMethods,
        ...loaded['image-methods.js'].imagePreviewMethods,
        ...loaded['image-methods.js'].imageLoadingMethods
    }
    const msg = { id: 'img-1', type: 'image', content: 'https://example.test/image.jpg', fileSize: 20 }
    const imageContext = {
        ...imageMethods, messages: [msg], loadedOriginalImages: {}, loadedOriginalImageTokens: {}, originalImageTokenSeed: 0,
        originalImageLoadingIds: {}, previewImageList: [], previewCurrentIndex: 0, showImagePreview: false,
        $set(target, key, value) { target[key] = value }, saveMessagesToStorage() { this.saved = (this.saved || 0) + 1 }
    }
    imageContext.previewImage.call(imageContext, msg)
    assert.equal(imageContext.showImagePreview, true)
    assert.equal(uni.imageInfoOptions.src, msg.content)
    uni.imageInfoOptions.success({ width: 10, height: 10 })
    assert.equal(msg.originalLoaded, true)
    assert.equal(imageContext.loadedOriginalImages[msg.id], msg.content)
    assert.equal(imageContext.originalImageLoadingIds[msg.id], undefined)
    assert.equal(imageContext.saved, 1)

    const failedMsg = { id: 'img-2', type: 'image', content: 'https://example.test/fail.jpg' }
    imageContext.messages.push(failedMsg)
    imageContext.loadOriginalImage.call(imageContext, failedMsg)
    uni.imageInfoOptions.fail(new Error('offline'))
    assert.equal(imageContext.originalImageLoadingIds[failedMsg.id], undefined)
    assert.equal(uni.toast.title, '原图加载失败')
}

const recorderHandlers = {}
let clearedTimer = null
const recorderUni = {
    getRecorderManager() {
        return {
            onStart(callback) { recorderHandlers.start = callback },
            onStop(callback) { recorderHandlers.stop = callback },
            onError(callback) { recorderHandlers.error = callback },
            start(options) { recorderHandlers.options = options },
            stop() { recorderHandlers.stop({ tempFilePath: '/tmp/record.amr' }) }
        }
    },
    showToast() {}
}
const recordingContext = {
    isCancelVoice: false, recordingDuration: 0, sentVoice: null,
    sendVoiceMessage(path, duration) { this.sentVoice = { path, duration } }
}
const recorderVm = {
    __deps: deps, __exports: {}, console: quietConsole, Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp, Map, Set, Error, Promise,
    uni: recorderUni, setInterval: () => 123, clearInterval: timer => { clearedTimer = timer }, setTimeout, clearTimeout
}
// The module has already been evaluated in H5 above; evaluate this one MP variant with timer/uni globals available.
let recorderSource = preprocess(read(path.join(moduleDir, 'audio-methods.js')), mpFlags)
recorderSource = recorderSource
    .replace(/^import \* as (\w+) from ['"]([^'"]+)['"]\s*;?\s*$/gm, 'const $1 = __deps["$2"] || {};')
    .replace(/^import \{\s*([^}]+)\s*\} from ['"]([^'"]+)['"]\s*;?\s*$/gm, (_, namesText, specifier) => `const { ${namesText} } = __deps[${JSON.stringify(specifier)}] || {};`)
    .replace(/^export const (\w+)\s*=/gm, 'const $1 =')
vm.runInNewContext(`${recorderSource}\nglobalThis.__exports = { audioInitializationMethods };`, recorderVm, { filename: 'audio-methods.js (MP-WEIXIN)' })
const mpRecorderMethods = recorderVm.__exports.audioInitializationMethods
Object.assign(recordingContext, mpRecorderMethods)
recordingContext.initRecorder.call(recordingContext)
recorderHandlers.start()
recordingContext.recordingDuration = 2
recorderHandlers.stop({ tempFilePath: '/tmp/record.amr' })
assert.deepEqual({ ...recordingContext.sentVoice }, { path: '/tmp/record.amr', duration: 2 })
assert.equal(clearedTimer, 123)

console.log(`chat module split checks passed (${moduleFiles.length} modules; ${extractedMethodCount} extracted methods; ${currentFlat.length} resolved methods; baseline ${baselineFile})`)
