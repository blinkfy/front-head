import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { prepareAppMapImage } from '../src/utils/map-image-preview.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function errorMessage(promise) {
  return assert.rejects(promise, Error)
}

test('remote image is downloaded, HTTP-checked, decoded, and returns its temp path', async () => {
  let downloadOptions
  let imageInfoOptions
  const result = prepareAppMapImage('https://example.test/bin.jpg', {
    downloadFile(options) { downloadOptions = options; return { abort() {} } },
    getImageInfo(options) { imageInfoOptions = options; options.success({ width: 10, height: 10 }) },
    createBitmap() { assert.fail('remote path should not create a bitmap') }
  })

  assert.equal(downloadOptions.url, 'https://example.test/bin.jpg')
  assert.equal(downloadOptions.timeout, 15000)
  downloadOptions.success({ statusCode: 200, tempFilePath: '_doc/download.jpg' })
  assert.equal(await result, '_doc/download.jpg')
  assert.equal(imageInfoOptions.src, '_doc/download.jpg')
})

test('HTTP errors and missing downloaded paths reject without attempting decode', async () => {
  for (const response of [{ statusCode: 404, tempFilePath: '/tmp/no.jpg' }, { statusCode: 200 }]) {
    let options
    let decodeCalls = 0
    const result = prepareAppMapImage('https://example.test/bin.jpg', {
      downloadFile(value) { options = value; return {} },
      getImageInfo() { decodeCalls++ },
      createBitmap() {}
    })
    options.success(response)
    await errorMessage(result)
    assert.equal(decodeCalls, 0)
  }
})

test('decode failures and network failures reject', async () => {
  let downloadOptions
  const decodeFailure = prepareAppMapImage('https://example.test/bin.jpg', {
    downloadFile(options) { downloadOptions = options; return {} },
    getImageInfo(options) { options.fail(new Error('decode failed')) },
    createBitmap() {}
  })
  downloadOptions.success({ statusCode: 200, tempFilePath: '/tmp/bin.jpg' })
  await errorMessage(decodeFailure)

  const networkFailure = prepareAppMapImage('https://example.test/bin.jpg', {
    downloadFile(options) { options.fail(new Error('network failed')); return {} },
    getImageInfo() { assert.fail('network failure must skip decode') },
    createBitmap() {}
  })
  await errorMessage(networkFailure)
})

test('base64 image is saved locally and bitmap is released', async () => {
  let bitmapOptions
  let savedPath
  let clearCalls = 0
  const result = await prepareAppMapImage('data:image/png;base64,abc', {
    downloadFile() { assert.fail('base64 should not download') },
    getImageInfo() { assert.fail('base64 should not decode a temp download') },
    createBitmap(name) {
      return {
        loadBase64Data(data, success) { assert.equal(data, 'data:image/png;base64,abc'); success() },
        save(path, options, success) { savedPath = path; bitmapOptions = options; success({ target: '_doc/map-preview.png' }) },
        clear() { clearCalls++ }
      }
    }
  })
  assert.equal(result, '_doc/map-preview.png')
  assert.match(bitmapOptions.format, /png/i)
  assert.match(savedPath, /^_doc\/map_preview_\d+\.png$/)
  assert.equal(clearCalls, 1)
})

test('base64 load and save failures reject and release bitmap', async () => {
  for (const failure of ['load', 'save']) {
    let clearCalls = 0
    const result = prepareAppMapImage('data:image/png;base64,abc', {
      downloadFile() {},
      getImageInfo() {},
      createBitmap() {
        return {
          loadBase64Data(_data, success, fail) {
            if (failure === 'load') fail(new Error('load failed'))
            else success()
          },
          save(_path, _options, _success, fail) { fail(new Error('save failed')) },
          clear() { clearCalls++ }
        }
      }
    })
    await errorMessage(result)
    assert.equal(clearCalls, 1)
  }
})

test('timeout aborts download and ignores late download callbacks', async () => {
  let options
  let abortCalls = 0
  let decodeCalls = 0
  const result = prepareAppMapImage('https://example.test/slow.jpg', {
    downloadFile(value) { options = value; return { abort() { abortCalls++ } } },
    getImageInfo() { decodeCalls++ },
    createBitmap() {}
  }, 10)
  await errorMessage(result)
  options.success({ statusCode: 200, tempFilePath: '/tmp/late.jpg' })
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(abortCalls, 1)
  assert.equal(decodeCalls, 0)
})

test('timeout ignores late base64 load callback without saving', async () => {
  let loadSuccess
  let saveCalls = 0
  let clearCalls = 0
  const result = prepareAppMapImage('data:image/png;base64,abc', {
    downloadFile() {},
    getImageInfo() {},
    createBitmap() {
      return {
        loadBase64Data(_data, success) { loadSuccess = success },
        save() { saveCalls++ },
        clear() { clearCalls++ }
      }
    }
  }, 10)
  await errorMessage(result)
  loadSuccess()
  assert.equal(saveCalls, 0)
  assert.equal(clearCalls, 1)
})

test('non-HTTP local paths pass through without native IO', async () => {
  let calls = 0
  const path = '/storage/emulated/0/bin.jpg'
  assert.equal(await prepareAppMapImage(path, {
    downloadFile() { calls++ },
    getImageInfo() { calls++ },
    createBitmap() { calls++ }
  }), path)
  assert.equal(calls, 0)
})

test('both map page script setups compile', async () => {
  const { parse, compileScript } = await import('@vue/compiler-sfc')
  for (const path of ['src/pages/map/map.vue', 'src/pages-dark/map/map.vue']) {
    const source = await readFile(resolve(root, path), 'utf8')
    const { descriptor, errors } = parse(source, { filename: path })
    assert.deepEqual(errors, [], `${path} SFC parse errors`)
    assert.ok(descriptor.scriptSetup, `${path} should contain script setup`)
    assert.doesNotThrow(() => compileScript(descriptor, { id: path }), `${path} script setup compilation`)
  }
})

