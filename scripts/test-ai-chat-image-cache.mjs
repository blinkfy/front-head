import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const aiChatPath = path.join(root, 'src/pages-nonTheme/ai-chat.vue')
const helperPath = path.join(root, 'src/pages-nonTheme/utils/ai-chat-image-cache.mjs')
const { parse, compileScript, compileTemplate } = require('@vue/compiler-sfc')
const { preHtml, preJs } = require('@dcloudio/uni-cli-shared/dist/preprocess')
const { getPreVueContext } = require('@dcloudio/uni-cli-shared/dist/preprocess/context')

const helper = await import(new URL('../src/pages-nonTheme/utils/ai-chat-image-cache.mjs', import.meta.url))

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])))
  return Buffer.concat([length, typeBytes, data, checksum])
}

function makeOnePixelPngDataUrl() {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const header = Buffer.alloc(13)
  header.writeUInt32BE(1, 0)
  header.writeUInt32BE(1, 4)
  header[8] = 8
  header[9] = 6
  const imageData = zlib.deflateSync(Buffer.from([0, 30, 150, 80, 255]))
  const png = Buffer.concat([
    signature,
    pngChunk('IHDR', header),
    pngChunk('IDAT', imageData),
    pngChunk('IEND', Buffer.alloc(0))
  ])
  return `data:image/png;base64,${png.toString('base64')}`
}

function testCacheHelpers() {
  const image = 'data:image/png;base64,AA=='
  const storage = new Map()
  const getStorage = key => storage.has(key) ? storage.get(key) : null

  assert.equal(helper.seedImageFingerprint({ createdAt: '  2026-10-25T08:00:00.000Z  ' }), '2026-10-25T08:00:00.000Z')
  assert.equal(helper.seedImageFingerprint({ category: ' 可回收物 ', assistantReply: '纸盒可以回收。' }), '可回收物__纸盒可以回收。')
  assert.equal(helper.resolveCachedSeedImage({ imageBase64: image }, getStorage), image, 'small inline data URL should be kept')

  storage.set('ai_chat_seed_image_large', image)
  assert.equal(helper.resolveCachedSeedImage({ imageBase64: `__LARGE_IMAGE__:${image.length}` }, getStorage), image, 'large-image marker should require exact length')
  assert.equal(helper.resolveCachedSeedImage({ imageBase64: `__LARGE_IMAGE__:${image.length + 1}` }, getStorage), '', 'stale large-image length should not be used')

  storage.set('ai_chat_seed_category', '可回收物')
  storage.set('ai_chat_seed_image', image)
  assert.equal(helper.resolveCachedSeedImage({ category: '可回收物', imageBase64: '' }, getStorage), image, 'matching legacy category may restore')
  assert.equal(helper.resolveCachedSeedImage({ historyId: 42, category: '可回收物', imageBase64: '' }, getStorage), '', 'historyId-only seeds must not inherit a stale legacy image')
  assert.equal(helper.resolveCachedSeedImage({ category: '有害垃圾', imageBase64: '' }, getStorage), '', 'legacy image from another category must not restore')
  assert.equal(helper.resolveCachedSeedImage({ category: '可回收物', imageBase64: 'broken' }, getStorage), '', 'a present but invalid image field must not fall back to a stale legacy image')

  const fingerprint = 'seed-2026-10-25'
  const binding = { fingerprint, sessionId: 'session-a', owner: 'alice', pending: false }
  assert.equal(helper.cachedSeedSession(binding, fingerprint, 'alice', 'preferred'), 'session-a')
  assert.equal(helper.cachedSeedSession(binding, fingerprint, 'bob', 'preferred'), '', 'a binding from another account must not restore')
  assert.equal(helper.cachedSeedSession({ ...binding, fingerprint: 'old-seed' }, fingerprint, 'alice', 'preferred'), 'preferred')
  assert.equal(helper.cachedSeedSession(null, fingerprint, '', 'preferred'), 'preferred')

  const userText = '请继续解释这张纸盒的分类依据。'
  const assistantText = '识别结果：纸盒属于可回收物，请清空并压平后投放。'
  const unrelatedUser = { role: 'user', hasImage: true, content: '另一条带图消息。' }
  const unrelatedAssistant = { role: 'assistant', content: '另一条答复。' }
  const targetUser = { role: 'user', hasImage: true, content: userText }
  const targetAssistant = { role: 'assistant', content: assistantText }
  assert.equal(helper.findCachedSeedMessage([unrelatedUser, unrelatedAssistant, targetUser, targetAssistant], userText, assistantText), targetUser, 'only the exact adjacent user/assistant pair should match')
  assert.equal(helper.findCachedSeedMessage([{ ...targetUser, hasImage: false }, targetAssistant], userText, assistantText), null, 'text-only messages should not receive an image')
  assert.equal(helper.findCachedSeedMessage([targetUser, { ...targetAssistant, content: '不同答复' }], userText, assistantText), null, 'assistant text must match fully')
  assert.equal(helper.findCachedSeedMessage([targetUser, targetAssistant, { ...targetUser }, { ...targetAssistant }], userText, assistantText), null, 'duplicate matching pairs are ambiguous and must not restore')
  console.log('PASS helper cases: inline/large/legacy image data, length and category guards, owner/session binding, and unique exact message-pair matching')
}

function testAiChatSfcCompile() {
  const source = fs.readFileSync(aiChatPath, 'utf8')
  const parsed = parse(source, { filename: aiChatPath })
  assert.equal(parsed.errors.length, 0, `SFC parse failed: ${parsed.errors.map(String).join('\n')}`)

  const platforms = [
    { name: 'H5', keys: ['H5', 'WEB'] },
    { name: 'APP-PLUS', keys: ['APP', 'APP_PLUS', 'APP_VUE'] },
    { name: 'MP-WEIXIN', keys: ['MP', 'MP_WEIXIN'] }
  ]

  for (const platform of platforms) {
    const context = getPreVueContext()
    for (const key of Object.keys(context)) context[key] = false
    context.VUE3 = true
    for (const key of platform.keys) context[key] = true

    const scriptSource = preJs(parsed.descriptor.scriptSetup.content, aiChatPath)
    const templateSource = preHtml(parsed.descriptor.template.content, aiChatPath)
    const replacements = [
      { block: parsed.descriptor.scriptSetup, content: scriptSource },
      { block: parsed.descriptor.template, content: templateSource }
    ].sort((a, b) => b.block.loc.start.offset - a.block.loc.start.offset)
    let preparedSource = source
    for (const { block, content } of replacements) {
      preparedSource = preparedSource.slice(0, block.loc.start.offset) + content + preparedSource.slice(block.loc.end.offset)
    }
    const prepared = parse(preparedSource, { filename: aiChatPath })
    assert.equal(prepared.errors.length, 0, `${platform.name} preprocessed SFC parse failed: ${prepared.errors.map(String).join('\n')}`)
    const descriptor = prepared.descriptor
    const id = `ai-chat-${platform.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    const compiledScript = compileScript(descriptor, { id })
    const compiledTemplate = compileTemplate({
      source: descriptor.template.content,
      filename: aiChatPath,
      id,
      compilerOptions: { bindingMetadata: compiledScript.bindings }
    })
    assert.equal(compiledTemplate.errors.length, 0, `${platform.name} template compile failed: ${compiledTemplate.errors.map(String).join('\n')}`)

    const displayImageDeclarations = compiledScript.content.match(/\bconst\s+displayImage\s*=/g) || []
    assert.equal(displayImageDeclarations.length, 1, `${platform.name} preprocessed script should contain one displayImage declaration`)
    console.log(`PASS SFC compile: ${platform.name} script and template after uni conditional preprocessing`)
  }
}

async function testBrowserRefreshFlow() {
  const playwrightModule = process.env.PLAYWRIGHT_MODULE || path.join(
    'C:/Users/29513/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules',
    'playwright'
  )
  const { chromium } = require(playwrightModule)
  const appUrl = process.env.AI_CHAT_TEST_URL || 'http://127.0.0.1:3000'
  const appOrigin = new URL(appUrl).origin
  const apiOrigin = 'https://rgqexbnzzipc.sealosbja.site'
  const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  const artifactDir = process.env.AI_CHAT_IMAGE_CACHE_ARTIFACT_DIR || 'C:/Users/29513/.codex/visualizations/2026/10/23/01a16840-ee7d-7763-8a3c-b488a039d89f'
  const screenshotPath = path.join(artifactDir, 'ai-chat-image-cache-after-refresh.png')
  const imageDataUrl = makeOnePixelPngDataUrl()
  const sessionId = 'mockhistorysession'
  const seedUserText = '请继续解释这张纸盒的分类依据。'
  const seedAssistantText = '识别结果：纸盒属于可回收物，请清空并压平后投放。'
  const createdAt = '2026-10-25T08:00:00.000Z'
  const historyPayload = {
    code: 0,
    data: {
      items: [
        { id: 'unrelated-image-user', role: 'user', sessionId, content: '另一条带图历史消息，不应复用缓存图片。', hasImage: true, createdAt: '2026-10-25T07:58:00.000Z' },
        { id: 'unrelated-image-assistant', role: 'assistant', sessionId, content: '这是另一条消息的答复。', hasImage: false, createdAt: '2026-10-25T07:58:01.000Z' },
        { id: 'seed-user', role: 'user', sessionId, content: seedUserText, hasImage: true, createdAt },
        { id: 'seed-assistant', role: 'assistant', sessionId, content: seedAssistantText, hasImage: false, createdAt: '2026-10-25T08:00:01.000Z' }
      ],
      sessionMetas: { [sessionId]: '本地图片缓存验证会话' }
    }
  }
  const apiHeaders = {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': appOrigin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'Authorization, Content-Type',
    'access-control-max-age': '600'
  }
  const mockedRequests = []
  const blockedExternalRequests = []
  const consoleErrors = []
  const pageErrors = []
  const browser = await chromium.launch({ headless: true, executablePath: chromePath })
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('pageerror', error => pageErrors.push(error.message))

  await context.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const isLocalAppRequest = url.host === new URL(appOrigin).host && (url.protocol === 'http:' || url.protocol === 'ws:')
    if (isLocalAppRequest || url.protocol === 'data:' || url.protocol === 'blob:') return route.continue()
    if (url.origin === apiOrigin) {
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: apiHeaders, body: '' })
      if (url.pathname === '/api/ai/settings' && request.method() === 'GET') {
        mockedRequests.push({ path: url.pathname, authorization: request.headers().authorization || '' })
        return route.fulfill({ status: 200, headers: apiHeaders, body: JSON.stringify({ code: 0, data: { aiEnabled: true } }) })
      }
      if (url.pathname === '/api/ai/chat/history' && request.method() === 'GET') {
        mockedRequests.push({ path: url.pathname, authorization: request.headers().authorization || '' })
        return route.fulfill({ status: 200, headers: apiHeaders, body: JSON.stringify(historyPayload) })
      }
    }
    blockedExternalRequests.push(`${request.method()} ${request.url()}`)
    return route.abort()
  })

  await page.addInitScript(({ sessionId, seedUserText, seedAssistantText, createdAt, imageDataUrl }) => {
    localStorage.setItem('token', 'codex-image-cache-test-token')
    localStorage.setItem('userInfo', JSON.stringify({ username: 'codex-image-cache-test-user' }))
    localStorage.setItem('ai_chat_session_id', sessionId)
    localStorage.setItem('ai_chat_seed_payload', JSON.stringify({
      userPrompt: seedUserText,
      assistantReply: seedAssistantText,
      category: '可回收物',
      createdAt,
      imageBase64: imageDataUrl
    }))
    localStorage.setItem('ai_chat_seed_consumed_at', createdAt)
    localStorage.removeItem('ai_chat_seed_image_binding')
  }, { sessionId, seedUserText, seedAssistantText, createdAt, imageDataUrl })

  try {
    await page.goto(`${appUrl}/#/pages-nonTheme/ai-chat`, { waitUntil: 'domcontentloaded' })
    await page.locator('.shell').waitFor({ state: 'visible', timeout: 20000 })
    await page.waitForFunction(() => {
      const splash = document.querySelector('.app-splash')
      return !splash || getComputedStyle(splash).display === 'none' || getComputedStyle(splash).visibility === 'hidden'
    }, null, { timeout: 10000 })

    assert.match(await page.url(), /#\/pages-nonTheme\/ai-chat/, 'the AI chat route should be active')
    assert.equal(await page.locator('vite-error-overlay, #webpack-dev-server-client-overlay, nextjs-portal').count(), 0, 'framework error overlays should be absent')

    const targetRow = page.locator('.message-row.from-user').filter({ hasText: seedUserText })
    const unrelatedRow = page.locator('.message-row.from-user').filter({ hasText: '另一条带图历史消息' })
    assert.equal(await targetRow.count(), 1, 'the exact seed history message should render once')
    assert.equal(await unrelatedRow.count(), 1, 'the unrelated hasImage history message should render once')
    const targetImage = targetRow.locator('.msg-image')
    try {
      await targetImage.waitFor({ state: 'visible', timeout: 20000 })
    } catch (error) {
      const diagnostics = {
        url: await page.url(),
        title: await page.title(),
        messages: await page.locator('.messages').innerText().catch(() => ''),
        rows: await page.locator('.message-row').evaluateAll(rows => rows.map(row => ({ className: row.className, text: row.innerText, images: [...row.querySelectorAll('img')].map(img => ({ className: img.className, src: img.getAttribute('src'), naturalWidth: img.naturalWidth })) }))).catch(() => []),
        mockedRequests,
        blockedExternalRequests,
        consoleErrors,
        pageErrors
      }
      console.error('Browser image restore diagnostics:', JSON.stringify(diagnostics, null, 2))
      throw error
    }
      await page.waitForFunction(() => {
      const target = [...document.querySelectorAll('.message-row.from-user')].find(row => row.textContent.includes('请继续解释这张纸盒的分类依据。'))
      const image = target?.querySelector('.msg-image img')
      return !!image && image.complete && image.naturalWidth > 0
    }, null, { timeout: 10000 })
    assert.equal(await unrelatedRow.locator('.msg-image').count(), 0, 'the cached image must not be assigned to another hasImage message')
    assert.match(await targetRow.locator('.msg-image img').getAttribute('src'), /^data:image\/png;base64,/, 'the restored image should be the local PNG data URL')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('.shell').waitFor({ state: 'visible', timeout: 20000 })
    await page.waitForFunction(() => {
      const splash = document.querySelector('.app-splash')
      return !splash || getComputedStyle(splash).display === 'none' || getComputedStyle(splash).visibility === 'hidden'
    }, null, { timeout: 10000 })
    const refreshedTargetRow = page.locator('.message-row.from-user').filter({ hasText: seedUserText })
    const refreshedImage = refreshedTargetRow.locator('.msg-image')
    await refreshedImage.waitFor({ state: 'visible', timeout: 20000 })
    await page.waitForFunction(() => {
      const target = [...document.querySelectorAll('.message-row.from-user')].find(row => row.textContent.includes('请继续解释这张纸盒的分类依据。'))
      const image = target?.querySelector('.msg-image img')
      return !!image && image.complete && image.naturalWidth > 0
    }, null, { timeout: 10000 })
    assert.equal(await page.locator('.message-row.from-user').filter({ hasText: '另一条带图历史消息' }).locator('.msg-image').count(), 0, 'refresh must still leave the unrelated image empty')

    const screenshot = await page.screenshot({ path: screenshotPath, fullPage: false })
    assert.ok(screenshot.length > 0, 'screenshot should be captured after splash is hidden')
    assert.ok(mockedRequests.some(request => request.path === '/api/ai/settings'), 'the AI access guard should use the mocked settings response')
    const historyRequests = mockedRequests.filter(request => request.path === '/api/ai/chat/history')
    assert.ok(historyRequests.length >= 2, 'initial render and refresh should both load mocked history')
    assert.ok(historyRequests.every(request => request.authorization === 'codex-image-cache-test-token'), 'history requests should use only the fake local token')
    assert.equal(pageErrors.length, 0, `unexpected page errors: ${pageErrors.join(' | ')}`)

    console.log(JSON.stringify({
      result: 'PASS',
      flow: 'mocked legacy history + local image cache -> AI chat -> refresh -> same image remains visible',
      url: await page.url(),
      title: await page.title(),
      viewport: '1280x850',
      checks: ['image naturalWidth > 0 before and after refresh', 'only the exact adjacent seed message pair received the cached image', 'splash hidden before screenshot', 'fake auth and mocked AI endpoints only', 'zero page errors'],
      mockedRequests,
      blockedExternalRequests,
      consoleErrors,
      pageErrors,
      screenshotPath
    }, null, 2))
  } finally {
    await context.close()
    await browser.close()
  }
}

async function main() {
  testCacheHelpers()
  testAiChatSfcCompile()
  if (process.argv.includes('--browser')) await testBrowserRefreshFlow()
  else console.log('Browser flow skipped; rerun with --browser to use the existing local H5 server.')
}

main().catch(error => {
  console.error(error.stack || String(error))
  process.exitCode = 1
})
