import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse as parseJavaScript } from '@babel/parser'
import { parse as parseSfc, compileScript, compileTemplate } from '@vue/compiler-sfc'

function visit(node, callback) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) { for (const child of node) visit(child, callback); return }
  if (typeof node.type === 'string') callback(node)
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'comments' || key === 'tokens') continue
    if (value && typeof value === 'object') visit(value, callback)
  }
}

function getSectionsExpression(path) {
  const filename = new URL(path, import.meta.url)
  const source = readFileSync(filename, 'utf8')
  const { descriptor, errors } = parseSfc(source, { filename: filename.pathname })
  assert.equal(errors.length, 0, `${path} parses`)
  const script = descriptor.scriptSetup.content
  const ast = parseJavaScript(script, { sourceType: 'module' })
  let callback = null
  visit(ast, node => {
    if (node.type === 'VariableDeclarator' && node.id?.name === 'displayAdviceSections' &&
        node.init?.type === 'CallExpression' && node.init.callee?.name === 'computed') {
      callback = node.init.arguments[0]
    }
  })
  assert.ok(callback, `${path} exposes displayAdviceSections as a computed expression`)
  return { source, script, expression: script.slice(callback.start, callback.end) }
}

function conditionalSource(source, target) {
  const stack = [true]
  const output = []
  for (const line of source.split(/\r?\n/)) {
    const open = line.match(/^\s*\/\/\s*#(ifdef|ifndef)\s+(.+)\s*$/) || line.match(/^\s*<!--\s*#(ifdef|ifndef)\s+(.+?)\s*-->\s*$/)
    const other = /^\s*(?:\/\/|<!--)\s*#else\s*(?:-->)?\s*$/.test(line)
    const close = /^\s*(?:\/\/|<!--)\s*#endif\s*(?:-->)?\s*$/.test(line)
    if (open) {
      const match = open[2].split(/\s+\|\|\s+/).includes(target)
      stack.push(stack.at(-1) && (open[1] === 'ifdef' ? match : !match))
    } else if (other) {
      assert.ok(stack.length > 1)
      stack[stack.length - 1] = stack.at(-2) && !stack.at(-1)
    } else if (close) stack.pop()
    else if (stack.at(-1)) output.push(line)
  }
  assert.equal(stack.length, 1, 'conditional blocks balance')
  return output.join('\n')
}

function compileHome(source, path, target) {
  const { descriptor, errors } = parseSfc(source, { filename: path })
  assert.equal(errors.length, 0, `${path} ${target} SFC parses`)
  descriptor.scriptSetup.content = conditionalSource(descriptor.scriptSetup.content, target)
  const script = compileScript(descriptor, { id: `${target}-${path}` })
  assert.ok(script.content.length, `${path} ${target} script compiles`)
  const template = conditionalSource(descriptor.template.content, target)
  const compiledTemplate = compileTemplate({ source: template, filename: path, id: `${target}-${path}` })
  assert.deepEqual(compiledTemplate.errors, [], `${path} ${target} template compiles`)
}

function plainSections(sections) {
  return Array.from(sections, section => ({ title: section.title, content: section.content, renderKey: section.renderKey }))
}

const helperSource = readFileSync(new URL('../src/utils/recognition-sync.js', import.meta.url), 'utf8')
  .replace(/^export\s+/gm, '')
  .concat('\nthis.buildExpandedUpcyclingText = buildExpandedUpcyclingText; this.splitUpcyclingSections = splitUpcyclingSections;')
const helperContext = {}
runInNewContext(helperSource, helperContext, { filename: 'recognition-sync.js' })

for (const path of ['../src/pages/home/home.vue', '../src/pages-dark/home/home.vue']) {
  const { source, script, expression } = getSectionsExpression(path)
  const isProcessing = { value: true }
  const recognitionPreview = { value: { aiInsights: {
    disposalAdvice: '垃圾投放：冲洗后晾干',
    expandedUpcycling: '回收利用：清洁后回收'
  } } }
  const upcyclingSections = { value: [] }
  const context = {
    computed: getter => getter,
    isProcessing,
    recognitionPreview,
    upcyclingSections,
    buildExpandedUpcyclingText: helperContext.buildExpandedUpcyclingText,
    splitUpcyclingSections: helperContext.splitUpcyclingSections
  }
  runInNewContext(`this.readSections = ${expression}`, context, { filename: `sections-${path}` })
  const initial = plainSections(context.readSections())
  assert.deepEqual(initial.map(section => [section.title, section.renderKey]), [
    ['垃圾投放', '垃圾投放:0'], ['回收利用', '回收利用:0']
  ], `${path} gives title-occurrence render keys in source order`)

  recognitionPreview.value = { aiInsights: {
    disposalAdvice: '识别判断：识别到玻璃瓶',
    expandedUpcycling: '垃圾投放：冲洗后晾干\n回收利用：清洁后回收'
  } }
  const inserted = plainSections(context.readSections())
  const insertedKeys = new Map(inserted.map(section => [section.title, section.renderKey]))
  for (const prior of initial) assert.equal(insertedKeys.get(prior.title), prior.renderKey,
    `${path} preserves ${prior.title} renderKey when a differently titled section is inserted first`)

  recognitionPreview.value = { aiInsights: {
    disposalAdvice: '回收利用：先清洁',
    expandedUpcycling: '分类建议：检查材质\n回收利用：再拆解'
  } }
  const duplicates = plainSections(context.readSections())
  const duplicateKeys = duplicates.filter(section => section.title === '回收利用').map(section => section.renderKey)
  assert.deepEqual(duplicateKeys, ['回收利用:0', '回收利用:1'], `${path} distinguishes duplicate same-title sections`)
  assert.equal(new Set(duplicates.map(section => section.renderKey)).size, duplicates.length,
    `${path} has no renderKey collisions`)

  isProcessing.value = false
  upcyclingSections.value = [
    { title: '垃圾投放', content: '请先冲洗瓶身' },
    { title: '回收利用', content: '瓶身可送入回收箱' },
    { title: '安全提醒', content: '小心玻璃边缘' }
  ]
  const finalSections = plainSections(context.readSections())
  assert.deepEqual(finalSections.map(({ title, content }) => [title, content]), [
    ['垃圾投放', '请先冲洗瓶身'],
    ['回收利用', '瓶身可送入回收箱'],
    ['安全提醒', '小心玻璃边缘']
  ], `${path} final sections keep their content and order`)

  assert.match(source, /<text class="recognition-preview-caption" role="status">\{\{ isProcessing \? '识别分析中 · 内容可能继续更新' : '识别完成' \}\}<\/text>/,
    `${path} updates the existing caption in place`)
  assert.doesNotMatch(source, /v-if="[^"]*recognition-preview-caption/,
    `${path} does not conditionally remove the caption row`)

  for (const target of ['H5', 'APP-PLUS', 'MP-WEIXIN']) compileHome(source, path, target)
}

console.log('home advice section key continuity and SFC checks passed')
