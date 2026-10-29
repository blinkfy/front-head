import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'
import { createRecognitionImagePicker } from '../src/utils/recognition-picker-core.mjs'

const root = new URL('../', import.meta.url)

const passed = []
const failed = []
async function scenario(name, run) {
  try {
    await run()
    passed.push(name)
  } catch (error) {
    failed.push({ name, error })
    console.error(`FAIL ${name}: ${error.message}`)
  }
}

function callbacks() {
  const calls = { success: [], fail: [], complete: [] }
  return {
    calls,
    options: {
      count: 1,
      sizeType: ['compressed'],
      success: value => calls.success.push(value),
      fail: value => calls.fail.push(value),
      complete: value => calls.complete.push(value)
    }
  }
}

function conditionalSource(source, target) {
  const active = [true]
  const output = []
  for (const line of source.split(/\r?\n/)) {
    const directive = line.match(/^\s*(?:\/\/|<!--)\s*#(ifdef|ifndef)\s+(.+?)\s*(?:-->)?\s*$/)
    const close = /^\s*(?:\/\/|<!--)\s*#endif\s*(?:-->)?\s*$/.test(line)
    if (directive) {
      const matches = directive[2].split(/\s+\|\|\s+/).some(name => name === target)
      const applies = directive[1] === 'ifdef' ? matches : !matches
      active.push(active.at(-1) && applies)
    } else if (close) active.pop()
    else if (active.at(-1)) output.push(line)
  }
  assert.equal(active.length, 1, 'platform conditional blocks should be balanced')
  return output.join('\n')
}

function compileSfc(source, filename, target) {
  const parsed = parse(source, { filename })
  assert.equal(parsed.errors.length, 0, `${filename} ${target} SFC parses`)
  const descriptor = parsed.descriptor
  const script = descriptor.scriptSetup || descriptor.script
  assert.ok(script, `${filename} has script`)
  script.content = conditionalSource(script.content, target)
  const compiledScript = compileScript(descriptor, { id: `${target}-${filename}` })
  assert.ok(compiledScript.content.length > 0, `${filename} ${target} script compiles`)
  const template = conditionalSource(descriptor.template.content, target)
  const compiledTemplate = compileTemplate({ source: template, filename, id: `${target}-${filename}` })
  assert.deepEqual(compiledTemplate.errors, [], `${filename} ${target} template compiles`)
  for (const style of descriptor.styles) {
    const compiledStyle = compileStyle({
      source: conditionalSource(style.content, target),
      filename,
      id: `${target}-${filename}`,
      scoped: style.scoped,
      preprocessLang: style.lang
    })
    assert.deepEqual(compiledStyle.errors, [], `${filename} ${target} styles compile`)
  }
}

await scenario('WeChat photo action opens embedded camera and marks captured result', () => {
  const calls = callbacks()
  let sheet
  let navigation
  const runtime = {
    showActionSheet: options => { sheet = options },
    navigateTo: options => { navigation = options }
  }
  const choose = createRecognitionImagePicker({ runtime, platform: 'weixin' })
  choose(calls.options)

  assert.deepEqual(sheet.itemList, ['拍照', '从相册选择'])
  sheet.success({ tapIndex: 0 })
  assert.equal(navigation.url, '/pages-nonTheme/recognition-camera')
  const captured = { tempFilePaths: ['/tmp/camera.jpg'], tempFiles: [{ path: '/tmp/camera.jpg' }] }
  navigation.events.captured(captured)
  assert.deepEqual(calls.calls.success, [{ ...captured, fromEmbeddedCamera: true }])
  assert.equal(calls.calls.complete.length, 1)
  assert.equal(calls.calls.fail.length, 0)
})

await scenario('WeChat album action forces album source while preserving other options', () => {
  const calls = callbacks()
  let sheet
  let imageOptions
  const runtime = {
    showActionSheet: options => { sheet = options },
    chooseImage: options => { imageOptions = options }
  }
  const choose = createRecognitionImagePicker({ runtime, platform: 'weixin' })
  choose({ ...calls.options, sourceType: ['camera', 'album'] })
  sheet.success({ tapIndex: 1 })

  assert.deepEqual(imageOptions.sourceType, ['album'])
  assert.equal(imageOptions.count, 1)
  imageOptions.success({ tempFilePaths: ['/tmp/album.jpg'] })
  assert.deepEqual(calls.calls.success, [{ tempFilePaths: ['/tmp/album.jpg'] }])
  assert.equal(calls.calls.complete.length, 1)
})

await scenario('H5 sourceType selects album and camera paths without adding a menu', async () => {
  for (const sourceType of [['album'], ['camera']]) {
      const calls = callbacks()
      let sheet
      let imageOptions
      let cameraOpens = 0
      const runtime = {
        showActionSheet: options => { sheet = options },
        chooseImage: options => { imageOptions = options }
      }
      const choose = createRecognitionImagePicker({
        runtime,
        platform: 'h5',
        detectCamera: async () => true,
        openWebCamera: async () => { cameraOpens++; return { tempFilePaths: ['/tmp/camera.jpg'] } }
      })
      choose({ ...calls.options, count: 4, sizeType: ['original'], sourceType })
      await new Promise(resolve => setImmediate(resolve))

      if (sourceType[0] === 'album') {
        assert.ok(imageOptions, 'H5 album-only invokes album picker')
        assert.equal(sheet, undefined)
        assert.equal(cameraOpens, 0)
        assert.equal(imageOptions.count, 4)
        assert.deepEqual(imageOptions.sizeType, ['original'])
        assert.deepEqual(imageOptions.sourceType, ['album'])
        imageOptions.success({ tempFilePaths: ['/tmp/album.jpg'] })
      } else {
        assert.equal(sheet, undefined)
        assert.equal(cameraOpens, 1)
        assert.ok(calls.calls.success[0]?.tempFilePaths?.[0])
      }
      assert.equal(calls.calls.success.length, 1)
      assert.equal(calls.calls.fail.length, 0)
      assert.equal(calls.calls.complete.length, 1)
  }
})

await scenario('WeChat action sheet cancellation fails and completes exactly once', () => {
  const calls = callbacks()
  let sheet
  const choose = createRecognitionImagePicker({
    runtime: { showActionSheet: options => { sheet = options } },
    platform: 'weixin'
  })
  choose(calls.options)
  const error = { errMsg: 'showActionSheet:fail cancel' }
  sheet.fail(error)

  assert.deepEqual(calls.calls.fail, [error])
  assert.deepEqual(calls.calls.complete, [error])
})

await scenario('WeChat camera cancellation and navigation failure both settle once', () => {
  for (const mode of ['camera-cancel', 'navigation-fail']) {
    const calls = callbacks()
    let sheet
    let navigation
    const runtime = {
      showActionSheet: options => { sheet = options },
      navigateTo: options => {
        navigation = options
        if (mode === 'navigation-fail') options.fail({ errMsg: 'navigateTo:fail' })
      }
    }
    const choose = createRecognitionImagePicker({ runtime, platform: 'weixin' })
    choose(calls.options)
    sheet.success({ tapIndex: 0 })
    const error = mode === 'camera-cancel'
      ? { errMsg: 'chooseImage:fail cancel' }
      : { errMsg: 'navigateTo:fail' }
    if (mode === 'camera-cancel') navigation.events.cameraCancelled(error)
    assert.deepEqual(calls.calls.fail, [error])
    assert.deepEqual(calls.calls.complete, [error])
  }
})

await scenario('duplicate captured and failure events cannot settle or complete twice', () => {
  const calls = callbacks()
  let sheet
  let navigation
  const choose = createRecognitionImagePicker({
    runtime: {
      showActionSheet: options => { sheet = options },
      navigateTo: options => { navigation = options }
    },
    platform: 'weixin'
  })
  choose(calls.options)
  sheet.success({ tapIndex: 0 })
  const result = { tempFilePaths: ['/tmp/once.jpg'] }
  navigation.events.captured(result)
  navigation.events.captured({ tempFilePaths: ['/tmp/twice.jpg'] })
  navigation.events.cameraCancelled({ errMsg: 'late cancel' })

  assert.equal(calls.calls.success.length, 1)
  assert.equal(calls.calls.fail.length, 0)
  assert.equal(calls.calls.complete.length, 1)
})

await scenario('concurrent picker invocation is ignored until the first request completes', () => {
  const first = callbacks()
  const second = callbacks()
  let sheets = 0
  let sheet
  const choose = createRecognitionImagePicker({
    runtime: { showActionSheet: options => { sheets++; sheet = options } },
    platform: 'weixin'
  })
  choose(first.options)
  choose(second.options)
  assert.equal(sheets, 1)
  assert.equal(second.calls.complete.length, 0)
  sheet.fail({ errMsg: 'cancel' })

  choose(second.options)
  assert.equal(sheets, 2)
})

await scenario('H5 camera detection false or rejected falls back to album', async () => {
  for (const detect of [async () => false, async () => { throw new Error('permission query failed') }]) {
    const calls = callbacks()
    let imageOptions
    const choose = createRecognitionImagePicker({
      runtime: { chooseImage: options => { imageOptions = options } },
      platform: 'h5',
      detectCamera: detect
    })
    choose(calls.options)
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(imageOptions.sourceType, ['album'])
    imageOptions.success({ tempFilePaths: ['/tmp/h5-album.jpg'] })
    assert.equal(calls.calls.success.length, 1)
    assert.equal(calls.calls.complete.length, 1)
  }
})

await scenario('H5 camera can fall back to album when opener requests album', async () => {
  const calls = callbacks()
  let sheet
  let imageOptions
  const choose = createRecognitionImagePicker({
    runtime: {
      showActionSheet: options => { sheet = options },
      chooseImage: options => { imageOptions = options }
    },
    platform: 'h5',
    detectCamera: async () => true,
    openWebCamera: async () => ({ useAlbum: true })
  })
  choose(calls.options)
  await new Promise(resolve => setImmediate(resolve))
  sheet.success({ tapIndex: 0 })
  await new Promise(resolve => setImmediate(resolve))

  assert.deepEqual(imageOptions.sourceType, ['album'])
  imageOptions.success({ tempFilePaths: ['/tmp/fallback.jpg'] })
  assert.equal(calls.calls.success.length, 1)
  assert.equal(calls.calls.complete.length, 1)
})

await scenario('H5 camera rejection fails and completes once', async () => {
  const calls = callbacks()
  let sheet
  const failure = new Error('camera denied')
  const choose = createRecognitionImagePicker({
    runtime: { showActionSheet: options => { sheet = options } },
    platform: 'h5',
    detectCamera: async () => true,
    openWebCamera: async () => { throw failure }
  })
  choose(calls.options)
  await new Promise(resolve => setImmediate(resolve))
  sheet.success({ tapIndex: 0 })
  await new Promise(resolve => setImmediate(resolve))

  assert.deepEqual(calls.calls.fail, [failure])
  assert.deepEqual(calls.calls.complete, [failure])
})

await scenario('H5 camera success returns the selected File in chooseImage-compatible form', async () => {
  const calls = callbacks()
  let sheet
  const file = { name: 'camera.jpg', type: 'image/jpeg' }
  const choose = createRecognitionImagePicker({
    runtime: { showActionSheet: options => { sheet = options } },
    platform: 'h5',
    detectCamera: async () => true,
    openWebCamera: async () => ({ tempFilePaths: ['/tmp/camera.jpg'], tempFiles: [file] })
  })
  choose(calls.options)
  await new Promise(resolve => setImmediate(resolve))
  sheet.success({ tapIndex: 0 })
  await new Promise(resolve => setImmediate(resolve))

  assert.deepEqual(calls.calls.success, [{ tempFilePaths: ['/tmp/camera.jpg'], tempFiles: [file] }])
  assert.equal(calls.calls.complete.length, 1)
})

await scenario('APP keeps the caller sourceType unchanged', () => {
  const calls = callbacks()
  let received
  const sourceType = ['album', 'camera']
  const choose = createRecognitionImagePicker({
    runtime: { chooseImage: options => { received = options } },
    platform: 'app'
  })
  choose({ ...calls.options, sourceType })

  assert.equal(received.sourceType, sourceType)
  assert.equal(received.count, 1)
  received.success({ tempFilePaths: ['/tmp/native.jpg'] })
  assert.deepEqual(calls.calls.success, [{ tempFilePaths: ['/tmp/native.jpg'] }])
  assert.equal(calls.calls.complete.length, 1)
})

await scenario('non-H5 platforms retain the complete chooseImage options', () => {
  for (const platform of ['app', 'other-mini-program']) {
    const calls = callbacks()
    let received
    const sourceType = ['camera', 'album']
    const complete = calls.options.complete
    const choose = createRecognitionImagePicker({
      runtime: { chooseImage: options => { received = options } },
      platform
    })
    choose({ ...calls.options, count: 7, sizeType: ['original'], sourceType })
    assert.equal(received.sourceType, sourceType)
    assert.equal(received.count, 7)
    assert.deepEqual(received.sizeType, ['original'])
    assert.equal(received.complete, undefined)
    received.success({ tempFilePaths: ['/tmp/native.jpg'] })
    assert.equal(calls.calls.success.length, 1)
    assert.equal(calls.calls.complete.length, 1)
    assert.notEqual(complete, undefined)
  }
})

await scenario('recognition camera and both home pages compile for H5, APP-PLUS, and MP-WEIXIN', async () => {
  const files = [
    'src/pages-nonTheme/recognition-camera.vue',
    'src/pages/home/home.vue',
    'src/pages-dark/home/home.vue'
  ]
  for (const file of files) {
    const source = await readFile(new URL(file, root), 'utf8')
    for (const target of ['H5', 'APP-PLUS', 'MP-WEIXIN']) compileSfc(source, file, target)
  }
})

await scenario('photo picker entry SFCs compile for H5, APP-PLUS, and MP-WEIXIN', async () => {
  const files = [
    'src/components/AddTrashBinModal.vue',
    'src/components/AddTrashBinModal-black.vue',
    'src/components/TrashBinImageEditor.vue',
    'src/components/WechatProfileForm.vue',
    'src/pages-nonTheme/community-publish.vue',
    'src/pages-nonTheme/voice-scan.vue',
    'src/pages-nonTheme/chat.vue',
    'src/pages-nonTheme/ai-chat.vue',
    'src/pages-nonTheme/edit-profile.vue'
  ]
  for (const file of files) {
    const source = await readFile(new URL(file, root), 'utf8')
    for (const target of ['H5', 'APP-PLUS', 'MP-WEIXIN']) compileSfc(source, file, target)
  }
})

await scenario('recognition camera route is registered only for MP-WEIXIN', async () => {
  const source = await readFile(new URL('src/pages.json', root), 'utf8')
  for (const target of ['H5', 'APP-PLUS', 'MP-WEIXIN']) {
    const platformSource = conditionalSource(source, target).replace(/^\s*\/\/.*$/gm, '')
    const pages = JSON.parse(platformSource)
    const recognitionCamera = pages.subPackages?.find(pack => pack.root === 'pages-nonTheme')?.pages
      ?.find(page => page.path === 'recognition-camera')
    assert.equal(Boolean(recognitionCamera), target === 'MP-WEIXIN', `${target} route registration`)
  }
})

for (const name of passed) console.log(`PASS ${name}`)
console.log(`${passed.length} recognition picker checks passed; ${failed.length} failed`)
if (failed.length) process.exitCode = 1
