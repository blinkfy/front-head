import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { parse, compileScript, compileTemplate } = require('@vue/compiler-sfc')
const { preHtml, preJs } = require('@dcloudio/uni-cli-shared/dist/preprocess')
const { getPreVueContext } = require('@dcloudio/uni-cli-shared/dist/preprocess/context')
const aiChatPath = new URL('../src/pages-nonTheme/ai-chat.vue', import.meta.url)
const markdownBodyPath = new URL('../src/pages-nonTheme/components/MarkdownBody.vue', import.meta.url)
const chatMarkdownPath = new URL('../src/pages-nonTheme/components/ChatMarkdown.vue', import.meta.url)
const aiChat = fs.readFileSync(aiChatPath, 'utf8')
const markdownBody = fs.readFileSync(markdownBodyPath, 'utf8')
const chatMarkdown = fs.readFileSync(chatMarkdownPath, 'utf8')

const platforms = [
  { name: 'H5', keys: ['H5', 'WEB'] },
  { name: 'APP-PLUS', keys: ['APP', 'APP_PLUS', 'APP_VUE'] },
  { name: 'MP-WEIXIN', keys: ['MP', 'MP_WEIXIN'] }
]

function setPlatform(platform) {
  const context = getPreVueContext()
  for (const key of Object.keys(context)) context[key] = false
  context.VUE3 = true
  for (const key of platform.keys) context[key] = true
}

function preprocessSfc(source, filename, platform) {
  setPlatform(platform)
  const parsed = parse(source, { filename })
  assert.equal(parsed.errors.length, 0, `${platform.name}: source SFC parse`)
  const descriptor = parsed.descriptor
  const replacements = []
  if (descriptor.scriptSetup) replacements.push({ block: descriptor.scriptSetup, content: preJs(descriptor.scriptSetup.content, filename) })
  if (descriptor.script) replacements.push({ block: descriptor.script, content: preJs(descriptor.script.content, filename) })
  if (descriptor.template) replacements.push({ block: descriptor.template, content: preHtml(descriptor.template.content, filename) })
  let prepared = source
  for (const { block, content } of replacements.sort((a, b) => b.block.loc.start.offset - a.block.loc.start.offset)) {
    prepared = prepared.slice(0, block.loc.start.offset) + content + prepared.slice(block.loc.end.offset)
  }
  const output = parse(prepared, { filename })
  assert.equal(output.errors.length, 0, `${platform.name}: preprocessed SFC parse`)
  const compiledScript = compileScript(output.descriptor, { id: `app-compat-${platform.name}` })
  const compiledTemplate = compileTemplate({
    source: output.descriptor.template.content,
    filename,
    id: `app-compat-${platform.name}`,
    compilerOptions: { bindingMetadata: compiledScript.bindings }
  })
  assert.equal(compiledTemplate.errors.length, 0, `${platform.name}: template compile: ${compiledTemplate.errors.map(String).join('\n')}`)
  return { descriptor: output.descriptor, script: compiledScript.content, template: output.descriptor.template.content, render: compiledTemplate.code }
}

function testSeedImageConversion() {
  const start = aiChat.indexOf('function convertSeedImagesToTempFiles(sessionId) {')
  const end = aiChat.indexOf('\nfunction localPathToBase64(', start)
  assert(start >= 0 && end > start, 'seed image converter should remain extractable for a focused runtime check')
  const source = aiChat.slice(start, end)
  const imageBase64 = 'data:image/png;base64,QUJD'
  const message = { imageBase64 }

  for (const platform of platforms.filter(item => item.name !== 'MP-WEIXIN')) {
    const compiled = preJs(source, (setPlatform(platform), aiChatPath.pathname))
    const writes = []
    const context = {
      conversationMap: new Map([['session', { messages: [{ ...message }] }]]),
      console: { warn() {}, log() {} },
      uni: Object.defineProperty({}, 'getFileSystemManager', { get() { throw new Error('unexpected filesystem manager access') } })
    }
    vm.createContext(context)
    vm.runInContext(`${compiled}\nglobalThis.convert = convertSeedImagesToTempFiles`, context)
    assert.doesNotThrow(() => context.convert('session'), `${platform.name} must not touch the mini-program filesystem API`)
    assert.equal(writes.length, 0)
    assert.equal(context.conversationMap.get('session').messages[0]._localImagePath, undefined)
    assert.equal(context.conversationMap.get('session').messages[0].imageBase64, imageBase64)
  }

  const mp = platforms.find(item => item.name === 'MP-WEIXIN')
  const compiled = preJs(source, (setPlatform(mp), aiChatPath.pathname))
  const writes = []
  const context = {
    conversationMap: new Map([['session', { messages: [{ ...message }] }]]),
    console: { warn() {}, log() {} }, Date: { now: () => 123 }, Math,
    wx: { env: { USER_DATA_PATH: '/user-data' } },
    uni: { getFileSystemManager: () => ({ writeFileSync: (...args) => writes.push(args) }) }
  }
  vm.createContext(context)
  vm.runInContext(`${compiled}\nglobalThis.convert = convertSeedImagesToTempFiles`, context)
  context.convert('session')
  assert.equal(writes.length, 1, 'MP should write the image data to a local file')
  assert.equal(writes[0][0].startsWith('/user-data/ai_seed_img_123_'), true)
  assert.deepEqual(Array.from(writes[0].slice(1)), ['QUJD', 'base64'])
  const converted = context.conversationMap.get('session').messages[0]
  assert.equal(converted._localImagePath, writes[0][0])
  assert.equal(converted.imageBase64, imageBase64, 'MP conversion must retain the original data URL for API requests')
  console.log('PASS seed image conversion: H5/APP skip MP filesystem access; MP writes local image and keeps imageBase64')
}

function testMarkdownPlatforms() {
  for (const platform of platforms) {
    const body = preprocessSfc(markdownBody, markdownBodyPath.pathname, platform)
    const native = platform.name !== 'H5'
    if (native) {
      assert.match(body.template, /<ChatMarkdown[\s\S]*:markdown="markdown"/)
      assert.match(body.script, /import ChatMarkdown from/)
      assert.doesNotMatch(body.template + body.script + body.render, /mp-html|resolveComponent\(['"]mp-html/)
    } else {
      assert.match(body.template, /v-html="renderedHtml"/)
      assert.doesNotMatch(body.template, /<ChatMarkdown/)
      assert.doesNotMatch(body.script, /import ChatMarkdown/)
    }

    const parserStart = chatMarkdown.indexOf('function inlineTokens(value) {')
    const parserEnd = chatMarkdown.indexOf('\nexport default {', parserStart)
    assert(parserStart >= 0 && parserEnd > parserStart, 'native markdown parser functions should remain present')
    const parserContext = {}
    vm.createContext(parserContext)
    vm.runInContext(`${chatMarkdown.slice(parserStart, parserEnd)}\nglobalThis.parseMarkdown = parseMarkdown`, parserContext)
    const blocks = parserContext.parseMarkdown('# 分拣指南\n\n- 可回收物\n- 厨余垃圾\n\n| 类别 | 示例 |\n| --- | --- |\n| 纸类 | 纸盒 |')
    assert.equal(blocks[0].type, 'heading')
    assert.equal(blocks[0].tokens[0].text, '分拣指南')
    assert.equal(blocks[1].type, 'list')
    assert.equal(blocks[1].items.length, 2)
    assert.equal(blocks[2].type, 'table')
    assert.equal(blocks[2].header[0][0].text, '类别')
    assert.equal(blocks[2].rows[0][1][0].text, '纸盒')
  }
  console.log('PASS MarkdownBody SFC preprocessing and compilation: H5 HTML, APP/MP ChatMarkdown, headings, lists and tables')
}

testSeedImageConversion()
testMarkdownPlatforms()
