import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'
import {
  getRecognitionCompressionDecision,
  getRecognitionImageSize,
  isSmallerRecognitionImage,
  shouldCompressRecognitionImage,
  shouldUseCompressedRecognitionImage
} from '../src/utils/recognition-image.mjs'

const mib = 1024 * 1024
assert.equal(shouldCompressRecognitionImage(mib), false)
assert.equal(shouldCompressRecognitionImage(mib + 1), true)
assert.equal(shouldCompressRecognitionImage(0), false)
assert.equal(shouldCompressRecognitionImage(900 * 1024, 3200), true)
assert.equal(shouldCompressRecognitionImage(900 * 1024, 800), false)
assert.equal(isSmallerRecognitionImage(2 * mib, mib), true)
assert.equal(isSmallerRecognitionImage(mib, mib), false)
assert.equal(isSmallerRecognitionImage(mib, mib + 1), false)
assert.equal(isSmallerRecognitionImage(0, 1), false)

globalThis.uni = {
  getFileInfo({ filePath, success }) {
    assert.equal(filePath, '/image.jpg')
    success({ size: 2 * mib })
  }
}
assert.equal(await getRecognitionImageSize('/image.jpg', 512), 512)
assert.equal(await getRecognitionImageSize('/image.jpg'), 2 * mib)
globalThis.uni.getFileInfo = ({ fail }) => fail(new Error('unavailable'))
assert.equal(await getRecognitionImageSize('/missing.jpg'), 0)
globalThis.uni.getFileInfo = () => { throw new Error('unsupported') }
assert.equal(await getRecognitionImageSize('/missing.jpg'), 0)

let imageInfoCalls = 0
globalThis.uni.getImageInfo = ({ success }) => {
  imageInfoCalls += 1
  success({ width: 3200, height: 2400 })
}
assert.equal((await getRecognitionCompressionDecision('/large.jpg', 2 * mib)).shouldCompress, true)
assert.equal(imageInfoCalls, 0)
assert.equal((await getRecognitionCompressionDecision('/small-bytes.jpg', 900 * 1024)).shouldCompress, true)
assert.equal(imageInfoCalls, 1)
globalThis.uni.getImageInfo = ({ success }) => success({ width: 640, height: 480 })
assert.equal((await getRecognitionCompressionDecision('/small.jpg', 900 * 1024)).shouldCompress, false)
globalThis.uni.getImageInfo = ({ fail }) => fail(new Error('unavailable'))
assert.equal((await getRecognitionCompressionDecision('/unknown.jpg', 900 * 1024)).shouldCompress, false)
const gifDecision = await getRecognitionCompressionDecision('/small.gif', 100 * 1024, 'image/gif')
assert.equal(gifDecision.needsJpegConversion, true)
assert.equal(shouldUseCompressedRecognitionImage(100 * 1024, 130 * 1024, gifDecision.needsJpegConversion), true)
assert.equal(shouldUseCompressedRecognitionImage(100 * 1024, 130 * 1024, false), false)

const apiSource = readFileSync(new URL('../src/api/recognize.js', import.meta.url), 'utf8')
  .replace(/^import .*\r?\n/gm, '')
  .replace(/^export /gm, '')
  .concat('\nthis.recognizeImage = recognizeImage')

class TestFile {
  constructor(name, type = '') { this.name = name; this.type = type }
}
class TestFormData {
  fields = []
  append(name, value) { this.fields.push([name, value]) }
}

function loadApi({ platform, fetch, uploadFile, toasts }) {
  const context = {
    File: TestFile,
    FormData: TestFormData,
    baseUrl: 'https://example.test',
    request: () => {},
    fetch,
    console: { error() {} },
    uni: {
      getStorageSync: () => 'session-token',
      getDeviceInfo: () => ({ platform: platform === 'web' ? 'browser' : 'android' }),
      getAppBaseInfo: () => ({ uniPlatform: platform }),
      uploadFile,
      showToast: value => toasts.push(value)
    }
  }
  runInNewContext(apiSource, context, { filename: 'recognize.js' })
  return context.recognizeImage
}

const webToasts = []
const originalFile = new TestFile('original.webp')
let fetchRequest
const webApi = loadApi({
  platform: 'web',
  toasts: webToasts,
  fetch: async (url, options) => {
    fetchRequest = { url, options }
    return { ok: true, json: async () => ({ code: 0, data: { labels: [] } }) }
  }
})
assert.deepEqual(await webApi(originalFile), { labels: [] })
assert.equal(fetchRequest.url, 'https://example.test/api/recognize')
assert.equal(fetchRequest.options.headers.Authorization, 'session-token')
assert.deepEqual(fetchRequest.options.body.fields, [['image', originalFile]])
assert.equal(webToasts.length, 0)

const convertedGif = new TestFile('converted.jpg', 'image/jpeg')
await webApi(convertedGif)
assert.deepEqual(fetchRequest.options.body.fields, [['image', convertedGif]])
assert.equal(fetchRequest.options.body.fields[0][1].type, 'image/jpeg')

for (const [status, message] of [[429, '服务器繁忙，请稍后重试'], [503, '识别超时，请重试']]) {
  const toasts = []
  const api = loadApi({
    platform: 'web',
    toasts,
    fetch: async () => ({ ok: false, status, statusText: 'Unavailable', json: async () => ({ code: 1, msg: message }) })
  })
  await assert.rejects(api(originalFile), error => error.status === status && error.msg === message)
  assert.equal(toasts[0].title, message)
}
const fallbackToasts = []
const fallbackApi = loadApi({
  platform: 'web',
  toasts: fallbackToasts,
  fetch: async () => ({ ok: false, status: 502, statusText: 'Bad Gateway', json: async () => { throw new Error('not JSON') } })
})
await assert.rejects(fallbackApi(originalFile), error => error.status === 502 && !error.msg)
assert.equal(fallbackToasts[0].title, '图片上传失败')

const miniToasts = []
let uploadOptions
const miniApi = loadApi({
  platform: 'mp-weixin',
  toasts: miniToasts,
  uploadFile: options => {
    uploadOptions = options
    options.success({ data: JSON.stringify({ code: 0, data: { labels: ['ok'] } }) })
  }
})
assert.equal((await miniApi('/tmp/compressed.png')).labels[0], 'ok')
assert.equal(uploadOptions.filePath, '/tmp/compressed.png')
assert.equal(uploadOptions.name, 'image')
assert.equal(uploadOptions.timeout, 600000)
assert.equal(uploadOptions.header.Authorization, 'session-token')

const errorToasts = []
const errorApi = loadApi({
  platform: 'mp-weixin',
  toasts: errorToasts,
  uploadFile: options => options.success({ data: { code: 1, msg: '识别失败原因' } })
})
await assert.rejects(errorApi('/tmp/image.jpg'), error => error.msg === '识别失败原因')
assert.equal(errorToasts[0].title, '识别失败原因')

for (const page of ['../src/pages/home/home.vue', '../src/pages-dark/home/home.vue']) {
  const filename = new URL(page, import.meta.url).pathname
  const source = readFileSync(new URL(page, import.meta.url), 'utf8')
  const { descriptor, errors } = parse(source, { filename })
  assert.equal(errors.length, 0)
  compileScript(descriptor, { id: page })
  assert.equal(compileTemplate({ source: descriptor.template.content, filename, id: page }).errors.length, 0)
  assert(descriptor.template.content.includes('{{ processStatus }}'))
  assert(descriptor.scriptSetup.content.includes('业务繁忙时会自动排队，本地模型首次加载需等待，请耐心等待'))
}

console.log('recognition image tests passed')
