import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import {
  MAX_IMAGE_BYTES,
  compressUntilWithinLimit,
  dataUrlByteLength,
  isSupportedChatImage
} from '../src/pages-nonTheme/utils/chat-image-compression-core.mjs'

const require = createRequire(import.meta.url)
const { preJs } = require('@dcloudio/uni-cli-shared/dist/preprocess')
const { getPreVueContext } = require('@dcloudio/uni-cli-shared/dist/preprocess/context')
const uploadPath = new URL('../src/api/chat-image-upload.js', import.meta.url)
const downloadPath = new URL('../src/utils/image-download.mjs', import.meta.url)
const compressionPath = new URL('../src/pages-nonTheme/utils/chat-image-compression.js', import.meta.url)
const source = fs.readFileSync(uploadPath, 'utf8')
const platforms = [
  { name: 'H5', keys: ['H5', 'WEB'] },
  { name: 'APP-PLUS', keys: ['APP', 'APP_PLUS', 'APP_VUE'] },
  { name: 'MP-WEIXIN', keys: ['MP', 'MP_WEIXIN'] }
]
const image = 'data:image/png;base64,QUJDRA=='
const id = '123e4567-e89b-12d3-a456-426614174000'
const response = (statusCode = 200) => ({ statusCode, data: JSON.stringify({ code: 0, data: { id, expiresAt: new Date(Date.now() + 3600000).toISOString() } }) })

function compile(platform) {
  const context = getPreVueContext()
  for (const key of Object.keys(context)) context[key] = false
  context.VUE3 = true
  for (const key of platform.keys) context[key] = true
  let output = preJs(source, uploadPath.pathname)
  output = output.replace(/^import .*\r?\n/gm, '')
  output = output.replace(/export (async function|function|const)/g, '$1')
  output += '\n;globalThis.__exports = { uploadChatImage, imageUploadFields, prepareMessageImageUpload }\n'
  return output
}

function runtime(platform, options = {}) {
  const requests = []
  const uploads = []
  const ctx = {
    config: { baseUrl: 'https://api.example.test' },
    MAX_IMAGE_BYTES: 512000,
    dataUrlByteLength: value => Math.floor((value.split(',')[1] || '').length * 3 / 4),
    compressChatImage: options.compressChatImage || (async () => ({ dataUrl: image, filePath: '/tmp/compressed.png' })),
    FormData,
    Blob,
    Uint8Array,
    AbortController,
    setTimeout,
    clearTimeout,
    atob,
    Date,
    console,
    fetch: async (url, init) => {
      requests.push({ url, init })
      if (options.fetch) return options.fetch(url, init)
      return { status: options.status ?? 200, json: async () => options.payload ?? { code: 0, data: { id, expiresAt: new Date(Date.now() + 3600000).toISOString() } } }
    },
    uni: {
      uploadFile(opts) {
        uploads.push(opts)
        if (options.networkError) return opts.fail(new Error('offline'))
        options.beforeUploadSuccess?.()
        opts.success(options.response || response(options.status ?? 200))
      }
    }
  }
  vm.runInNewContext(compile(platform), ctx, { filename: `chat-image-upload.${platform.name}.js` })
  return { ...ctx.__exports, requests, uploads }
}

async function testPlatforms() {
  const h5 = runtime(platforms[0])
  const result = await h5.uploadChatImage(image, '', 'Bearer h5')
  assert.equal(result.imageUploadId, id)
  assert.equal(h5.requests.length, 1)
  const req = h5.requests[0]
  assert.equal(req.url, 'https://api.example.test/api/ai/chat/uploads')
  assert.equal(req.init.method, 'POST')
  assert.equal(req.init.headers.Authorization, 'Bearer h5')
  assert.equal(Object.keys(req.init.headers).some(key => key.toLowerCase() === 'content-type'), false)
  const file = req.init.body.get('image')
  assert.equal(file.name, 'chat.png')
  assert.equal(file.type, 'image/png')
  assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [65, 66, 67, 68])

  for (const platform of platforms.slice(1)) {
    const app = runtime(platform)
    const uploaded = await app.uploadChatImage(image, '/local/photo.jpg', 'Bearer native')
    assert.equal(uploaded.imageUploadId, id)
    assert.equal(app.uploads.length, 1)
    const opts = app.uploads[0]
    assert.equal(opts.url, 'https://api.example.test/api/ai/chat/uploads')
    assert.equal(opts.filePath, '/local/photo.jpg')
    assert.equal(opts.name, 'image')
    assert.deepEqual({ ...opts.header }, { Authorization: 'Bearer native' })
    assert.equal(opts.timeout, 30000)
    assert.equal(app.requests.length, 0)
  }
}

async function testFallbackStatuses() {
  for (const platform of platforms) {
    for (const status of [404, 405, 501]) {
      const api = runtime(platform, { status })
      const result = await api.uploadChatImage(image, '/local/photo.png', 'token')
      assert.deepEqual({ ...result }, { imageBase64: image }, `${platform.name} ${status}`)
    }
    for (const status of [401, 413, 429, 500]) {
      const api = runtime(platform, { status })
      await assert.rejects(api.uploadChatImage(image, '/local/photo.png', 'token'), `${platform.name} ${status} should reject`)
    }
  }
  for (const platform of platforms) {
    if (platform.name === 'H5') {
      const api = runtime(platform, { fetch: async () => { throw new Error('offline') } })
      await assert.rejects(api.uploadChatImage(image, '', 'token'), /offline/)
      assert.equal(api.requests.length, 1)
    } else {
      const api = runtime(platform, { networkError: true })
      await assert.rejects(api.uploadChatImage(image, '/local/photo.png', 'token'), /offline/)
      assert.equal(api.uploads.length, 1)
    }
  }
}

async function testBmpConversion() {
  const bmp = 'data:image/bmp;base64,Qk0=' // Legacy cached BMP payload.
  const jpeg = 'data:image/jpeg;base64,SlBFRw=='
  for (const platform of platforms) {
    let conversions = 0
    const api = runtime(platform, {
      compressChatImage: async input => {
        conversions++
        assert.equal(input, bmp)
        return { dataUrl: jpeg, filePath: '/tmp/converted.jpg' }
      }
    })
    await api.uploadChatImage(bmp, '/cache/legacy.bmp', 'token')
    assert.equal(conversions, 1)
    if (platform.name === 'H5') {
      assert.equal(api.requests.length, 1)
      const uploadedFile = api.requests[0].init.body.get('image')
      assert.equal(uploadedFile.type, 'image/jpeg')
      assert.equal(uploadedFile.name, 'chat.jpg')
      assert.deepEqual([...new Uint8Array(await uploadedFile.arrayBuffer())], [74, 80, 69, 71])
    } else {
      assert.equal(api.uploads.length, 1)
      assert.equal(api.uploads[0].filePath, '/tmp/converted.jpg')
      assert.equal(api.uploads[0].name, 'image')
      assert.equal(api.requests.length, 0)
    }
  }

  for (const platform of platforms) {
    const failed = runtime(platform, { compressChatImage: async () => { throw new Error('BMP conversion failed') } })
    await assert.rejects(failed.uploadChatImage(bmp, '/cache/legacy.bmp', 'token'), /BMP conversion failed/)
    assert.equal(failed.requests.length, 0, `${platform.name} must not upload or fallback after conversion failure`)
    assert.equal(failed.uploads.length, 0, `${platform.name} must not upload or fallback after conversion failure`)
  }
}

async function testCurrentAndCache() {
  for (const platform of platforms) {
    const cancelled = runtime(platform)
    await assert.rejects(cancelled.uploadChatImage(image, '/local/photo.png', 'token', () => false), /取消发送/)
    assert.equal(cancelled.requests.length + cancelled.uploads.length, 0)

    let current = true
    const changingOwnerItem = { imageBase64: image, _localImagePath: '/local/photo.png', _imageUpload: { imageUploadId: 'old', owner: 'previous' } }
    if (platform.name === 'H5') {
      const api = runtime(platform, { fetch: async () => {
        await Promise.resolve()
        current = false
        return { status: 200, json: async () => ({ code: 0, data: { id, expiresAt: new Date(Date.now() + 3600000).toISOString() } }) }
      } })
      await assert.rejects(api.prepareMessageImageUpload(changingOwnerItem, 'token', () => current), /取消发送/)
      assert.equal(api.requests.length, 1)
    } else {
      const api = runtime(platform, { beforeUploadSuccess: () => { current = false } })
      await assert.rejects(api.prepareMessageImageUpload(changingOwnerItem, 'token', () => current), /取消发送/)
      assert.equal(api.uploads.length, 1)
    }
    assert.equal(changingOwnerItem._imageUpload.imageUploadId, 'old')

    const api = runtime(platform)
    const item = { imageBase64: image, _localImagePath: '/local/photo.png' }
    const transferCount = () => api.requests.length + api.uploads.length
    const good = { imageUploadId: id, expiresAt: new Date(Date.now() + 60000).toISOString(), owner: 'owner' }
    item._imageUpload = good
    assert.deepEqual({ ...await api.prepareMessageImageUpload(item, 'owner') }, { imageUploadId: id })
    assert.equal(transferCount(), 0)
    assert.deepEqual({ ...await api.prepareMessageImageUpload(item, 'other') }, { imageUploadId: id })
    assert.equal(transferCount(), 1)
    item._imageUpload = { ...good, expiresAt: new Date(Date.now() + 1000).toISOString() }
    assert.deepEqual({ ...await api.prepareMessageImageUpload(item, 'owner') }, { imageUploadId: id })
    assert.equal(transferCount(), 2)
    assert.deepEqual({ ...api.imageUploadFields({ imageUploadId: id, expiresAt: 'x', owner: 'owner', imageBase64: image }) }, { imageUploadId: id })
    assert.deepEqual({ ...api.imageUploadFields({ imageBase64: image, _localImagePath: '/local/a' }) }, { imageBase64: image })
    assert.deepEqual({ ...api.imageUploadFields({ _imageUpload: good }) }, {})
  }
}

function testImageDownload() {
  const module = { exports: {} }
  const downloadSource = fs.readFileSync(downloadPath, 'utf8').replace('export function resolveUpcyclingImage', 'function resolveUpcyclingImage')
  vm.runInNewContext(`${downloadSource}\n;module.exports = { resolveUpcyclingImage }`, { module })
  const resolve = module.exports.resolveUpcyclingImage
  assert.equal(resolve('/api/recognition_history/upcycling-image/42', 'https://api.test/', 'a b'), 'https://api.test/api/recognition_history/upcycling-image/42?token=a%20b')
  assert.equal(resolve('https://cdn.test/image.png?x=1', 'https://api.test', 'secret'), 'https://cdn.test/image.png?x=1')
  assert.equal(resolve('data:image/png;base64,QUJD', '', 'secret'), 'data:image/png;base64,QUJD')
  for (const value of ['javascript:alert(1)', 'file:///tmp/a.png', '/uploads/a.png', 'api/recognition_history/upcycling-image/42', '/api/recognition_history/upcycling-image/0']) assert.equal(resolve(value, 'https://api.test', 'secret'), '', value)
}

function compileCompression(platform) {
  const context = getPreVueContext()
  for (const key of Object.keys(context)) context[key] = false
  context.VUE3 = true
  for (const key of platform.keys) context[key] = true
  let output = preJs(fs.readFileSync(compressionPath, 'utf8'), compressionPath.pathname)
  output = output.replace(/import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"]\s*\r?\n/g, '')
  output = output.replace(/^export \{[^\r\n]*\}\s*;?\s*\r?\n/gm, '')
  output = output.replace(/export (async function|function|const)/g, '$1')
  output += '\n;globalThis.__compression = { compressChatImage }\n'
  return output
}

function makeMiniProgramCompression(platform) {
  const bmpBase64 = 'Qk0='
  const jpegBase64 = 'SlBFRw=='
  const outputs = new Map()
  const compressedCalls = []
  const imageInfoCalls = []
  const removed = []
  const fsManager = {
    writeFile({ filePath, data, success }) {
      outputs.set(filePath, data === bmpBase64 ? 'data:image/bmp;base64,Qk0=' : `data:image/jpeg;base64,${jpegBase64}`)
      success()
    },
    readFile({ filePath, success }) {
      const data = filePath.endsWith('.bmp') ? bmpBase64 : jpegBase64
      success({ data })
    },
    unlink({ filePath, success }) { removed.push(filePath); success() }
  }
  const ctx = {
    MAX_IMAGE_BYTES,
    compressUntilWithinLimit,
    isSupportedChatImage,
    dataUrlByteLength,
    uni: {
      env: { USER_DATA_PATH: '/user' },
      getFileSystemManager: () => fsManager,
      getImageInfo({ src, success }) { imageInfoCalls.push(src); success({ width: 32, height: 24, path: src }) },
      compressImage(options) {
        compressedCalls.push(options)
        options.success({ tempFilePath: '/user/encoded.jpg' })
      }
    }
  }
  vm.runInNewContext(compileCompression(platform), ctx, { filename: `chat-image-compression.${platform.name}.js` })
  return { compress: ctx.__compression.compressChatImage, compressedCalls, imageInfoCalls, removed }
}

function makeAppCompression(platform) {
  const bmpBase64 = 'Qk0='
  const jpegDataUrl = 'data:image/jpeg;base64,SlBFRw=='
  const files = new Map()
  const compressedCalls = []
  const imageInfoCalls = []
  const removed = []
  const entryFor = path => ({
    getFile(_name, _options, success) { success(entryFor(path)) },
    createWriter(success) {
      const writer = {
        onwrite: null,
        onerror: null,
        writeAsBinary(binary) {
          files.set(path, binary.startsWith('BM') ? 'data:image/bmp;base64,Qk0=' : jpegDataUrl)
          writer.onwrite?.()
        }
      }
      success(writer)
    },
    file(success) { success({ path }) },
    remove(success) { removed.push(path); success() }
  })
  class FakeFileReader {
    readAsDataURL(file) {
      this.result = files.get(file.path) || (file.path.endsWith('.bmp') ? 'data:image/bmp;base64,Qk0=' : jpegDataUrl)
      this.onloadend?.({ target: { result: this.result } })
    }
  }
  const ctx = {
    MAX_IMAGE_BYTES,
    compressUntilWithinLimit,
    isSupportedChatImage,
    dataUrlByteLength,
    uni: {
      getImageInfo({ src, success }) { imageInfoCalls.push(src); success({ width: 32, height: 24, path: src }) }
    },
    plus: {
      io: {
        FileReader: FakeFileReader,
        resolveLocalFileSystemURL(path, success, fail) {
          if (path === '_doc/') {
            success({ getFile: (name, _options, callback) => callback(entryFor(`_doc/${name}`)) })
            return
          }
          if (path) success(entryFor(path))
          else fail?.(new Error('missing'))
        }
      },
      zip: {
        compressImage(options, success) {
          compressedCalls.push(options)
          files.set(options.dst, jpegDataUrl)
          success()
        }
      }
    }
  }
  vm.runInNewContext(compileCompression(platform), ctx, { filename: `chat-image-compression.${platform.name}.js` })
  return { compress: ctx.__compression.compressChatImage, compressedCalls, imageInfoCalls, removed }
}

async function testRealNativeBmpCompression() {
  const bmp = 'data:image/bmp;base64,Qk0='
  const nativePlatforms = [
    { platform: platforms[1], make: makeAppCompression },
    { platform: platforms[2], make: makeMiniProgramCompression }
  ]
  for (const { platform, make } of nativePlatforms) {
    for (const input of [bmp, '/local/legacy.bmp']) {
      const native = make(platform)
      const result = await native.compress(input)
      assert.match(result.dataUrl, /^data:image\/jpeg;base64,SlBFRw==$/, `${platform.name} should return encoded JPEG for ${input}`)
      assert.match(result.filePath, /\.jpg$/i, `${platform.name} should return an encoded JPEG path`)
      assert.equal(native.compressedCalls.length, 1, `${platform.name} must invoke its real image encoder for small BMP`)
      assert.equal(native.imageInfoCalls.length, 1)
      if (platform.name === 'APP-PLUS') {
        assert.equal(native.compressedCalls[0].format, 'jpg')
        assert.match(native.compressedCalls[0].src, /\.bmp$/i, 'APP encoder must receive the BMP source')
      } else {
        assert.equal(native.compressedCalls[0].src, native.imageInfoCalls[0])
        assert.match(native.compressedCalls[0].src, /\.bmp$/i, 'mini program encoder must receive the BMP source')
      }
    }
  }
}

await testPlatforms()
await testFallbackStatuses()
await testBmpConversion()
await testCurrentAndCache()
testImageDownload()
await testRealNativeBmpCompression()
console.log('Image transfer tests passed (H5, APP-PLUS, MP-WEIXIN, image URL validation).')
