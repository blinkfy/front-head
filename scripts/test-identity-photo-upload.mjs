import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')
const photoSource = await read('../src/utils/identity-photo-upload.js')
const identityApiSource = await read('../src/api/identity.js')

function loadPhotoModule({ uni = {}, compressNativeUploadImage = async () => null, discardUploadImage = () => {} } = {}) {
  const source = photoSource
    .replace(/^\/\/ #ifndef H5\s*import .*?\r?\n\/\/ #endif\s*/m, '')
    .replace(/^\/\/ #ifndef H5\s*$/gm, '')
    .replace(/^\/\/ #endif\s*$/gm, '')
    .replace(/export async function/g, 'async function')
  const context = { uni, compressNativeUploadImage, discardUploadImage }
  vm.runInNewContext(`${source}\nglobalThis.api = { encodeIdentityCanvas, prepareIdentityUpload }`, context)
  return context.api
}

function uniWith({ sizes = {}, dimensions = {}, compressed = {}, compressError = false, imageInfoError = [] } = {}) {
  const calls = []
  const uni = {
    getFileInfo({ filePath, success }) { success({ size: sizes[filePath] ?? 0 }) },
    getImageInfo({ src, success, fail }) { imageInfoError.includes(src) ? fail(new Error('image info failed')) : success(dimensions[src] ?? { width: 1000, height: 800 }) },
    compressImage(options) {
      calls.push(options)
      if (compressError) options.fail(new Error('compress failed'))
      else options.success(compressed)
    }
  }
  return { uni, calls }
}

function loadIdentityApi({ uni, prepareIdentityUpload }) {
  const source = identityApiSource
    .replace(/^import \{ baseUrl \} from .*\r?\n/m, '')
    .replace(/^\/\/ #ifndef H5\s*import .*?\r?\n\/\/ #endif\s*/m, '')
    .replace(/^[ \t]*\/\/ #ifdef H5[ \t]*\r?\n[\s\S]*?^[ \t]*\/\/ #endif[ \t]*$/gm, '')
    .replace(/^\/\/ #ifndef H5\s*$/gm, '')
    .replace(/^\/\/ #endif\s*$/gm, '')
    .replace(/\bexport\s+(?=(?:async\s+)?function|const)/g, '')
  const context = { uni, prepareIdentityUpload, baseUrl: 'https://identity.test', Promise }
  vm.runInNewContext(`${source}\nglobalThis.api = { submitIdentity }`, context)
  return context.api
}

{
  const api = loadPhotoModule()
  const webp = { size: 10, type: 'image/webp' }
  const jpeg = { size: 11, type: 'image/jpeg' }
  const canvas = { toBlob(done, type) { done(type === 'image/webp' ? webp : jpeg) } }
  assert.equal(await api.encodeIdentityCanvas(canvas), webp, 'accepts a WebP encoding')
  for (const webpResult of [{ size: 10, type: 'image/png' }, null]) {
    let jpegRequested = false
    const result = await api.encodeIdentityCanvas({ toBlob(done, type) {
      if (type === 'image/webp') done(webpResult)
      else { jpegRequested = true; done(jpeg) }
    } })
    assert.equal(result, jpeg)
    assert.equal(jpegRequested, true)
  }
  assert.equal(await api.encodeIdentityCanvas({ toBlob(_done, type) { if (type === 'image/webp') throw Error('unsupported'); else _done(jpeg) } }), jpeg,
    'falls back to JPEG when WebP encoding throws')
}

{
  const discarded = []
  const base = uniWith({ sizes: { small: 400 * 1024 }, dimensions: { small: { width: 900, height: 700 } } })
  const api = loadPhotoModule({ ...base, discardUploadImage: path => discarded.push(path) })
  assert.deepEqual(api.prepareIdentityUpload ? Object.keys(await api.prepareIdentityUpload({ path: 'small' })) : [], ['path', 'cleanup'])
  assert.equal(base.calls.length, 0, 'small photos skip compression')
  assert.equal(discarded.length, 0)
}

{
  const discarded = []
  const base = uniWith({ sizes: { original: 800 * 1024, candidate: 700 * 1024 }, dimensions: { original: { width: 1200, height: 900 }, candidate: { width: 1200, height: 900 } } })
  let nativeArgs
  const api = loadPhotoModule({ ...base, compressNativeUploadImage: async (...args) => { nativeArgs = args; return 'candidate' }, discardUploadImage: (path, original) => discarded.push([path, original]) })
  const upload = await api.prepareIdentityUpload({ path: 'original' })
  assert.equal(upload.path, 'candidate')
  assert.deepEqual(nativeArgs, ['original', 88, 1200])
  upload.cleanup()
  assert.deepEqual(discarded, [['candidate', 'original']])
}

{
  const discarded = []
  const base = uniWith({ sizes: { original: 800 * 1024, smaller: 650 * 1024 }, dimensions: { original: { width: 1200, height: 900 }, smaller: { width: 800, height: 600 } } })
  const api = loadPhotoModule({ ...base, compressNativeUploadImage: async () => 'smaller', discardUploadImage: path => discarded.push(path) })
  const upload = await api.prepareIdentityUpload({ path: 'original' })
  assert.equal(upload.path, 'original', 'rejects candidates that change the frame')
  assert.deepEqual(discarded, ['smaller'])
}

for (const scenario of ['no-savings', 'compression-error']) {
  const discarded = []
  const base = uniWith({ sizes: { original: 800 * 1024, candidate: 790 * 1024 }, dimensions: { original: { width: 1200, height: 900 }, candidate: { width: 1200, height: 900 } },
    imageInfoError: scenario === 'compression-error' ? ['candidate'] : [] })
  const api = loadPhotoModule({ ...base,
    compressNativeUploadImage: async () => 'candidate',
    discardUploadImage: path => discarded.push(path) })
  const upload = await api.prepareIdentityUpload({ path: 'original' })
  assert.equal(upload.path, 'original')
  assert.deepEqual(discarded, ['candidate'])
}

{
  const discarded = []
  const base = uniWith({ sizes: { original: 2 * 1024 * 1024, candidate: 1 * 1024 * 1024 }, dimensions: { original: { width: 4000, height: 3000 }, candidate: { width: 4000, height: 3000 } }, compressed: { tempFilePath: 'candidate' } })
  const api = loadPhotoModule({ ...base, discardUploadImage: path => discarded.push(path) })
  const upload = await api.prepareIdentityUpload({ path: 'original' })
  assert.equal(upload.path, 'candidate')
  assert.deepEqual(base.calls.map(({ src, quality, compressedWidth, compressedHeight }) => ({ src, quality, compressedWidth, compressedHeight })),
    [{ src: 'original', quality: 88, compressedWidth: 4000, compressedHeight: 3000 }], 'large photos go through uni.compressImage at full dimensions')
  upload.cleanup()
  assert.deepEqual(discarded, ['candidate'])
}

{
  const source = await read('../src/utils/identity-camera-h5.js')
  const start = source.indexOf('    async function capture(points) {')
  assert.notEqual(start, -1, 'capture function exists')
  const bodyStart = source.indexOf('{', start)
  let depth = 0, end = -1, quote = '', lineComment = false, blockComment = false
  for (let i = bodyStart; i < source.length; i++) {
    const c = source[i], n = source[i + 1]
    if (lineComment) { if (c === '\n') lineComment = false; continue }
    if (blockComment) { if (c === '*' && n === '/') { blockComment = false; i++ } continue }
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue }
    if (c === '/' && n === '/') { lineComment = true; i++; continue }
    if (c === '/' && n === '*') { blockComment = true; i++; continue }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue }
    if (c === '{') depth++
    if (c === '}' && --depth === 0) { end = i + 1; break }
  }
  assert.ok(end > bodyStart, 'extracts the nested capture function')
  const captureSource = source.slice(start, end)
  const drawn = [], finished = [], retry = []
  const video = { videoWidth: 1920, videoHeight: 1080 }
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: (...args) => drawn.push(args) }) }
  const context = {
    video, taking: false, closed: false, finish: (...args) => finished.push(args),
    showInstruction() {}, text() {}, footerHint: {},
    document: { createElement: () => canvas },
    identityImageQualityIssue: () => null,
    sampleQuality: (_source, _points, width, height) => { assert.deepEqual([width, height], [1920, 1080]); return { score: 0.5 } },
    encodeIdentityCanvas: async image => { assert.deepEqual([image.width, image.height], [1920, 1080]); return { size: 123, type: 'image/webp' } },
    retryQuality: issue => retry.push(issue),
    lightFeedback: 'not_run'
  }
  vm.runInNewContext(`${captureSource}\nglobalThis.run = capture`, context)
  await context.run([])
  assert.equal(canvas.width, 1920)
  assert.equal(canvas.height, 1080)
  assert.equal(drawn.length, 1)
  assert.deepEqual(drawn[0], [video, 0, 0, 1920, 1080], 'draws the complete frame without crop or downscale')
  assert.equal(JSON.stringify(finished[0][0]), JSON.stringify({ file: { size: 123, type: 'image/webp' }, assist: 'client_actions', lightFeedback: 'not_run' }))
  assert.deepEqual(retry, [], 'quality sampling leaves the full-resolution capture result intact')
}

async function submitWithDeferredPreparation({ isCurrent = () => true, beforeResolve = ({ resolve }) => resolve(), uploadBehavior } = {}) {
  let finishPrepare
  let markPrepared
  const prepared = new Promise(resolve => { markPrepared = resolve })
  const events = { uploads: 0, cleanups: 0, uploadPaths: [] }
  let token = 'account-a'
  const uni = {
    getStorageSync: () => token,
    uploadFile(options) {
      events.uploads++
      events.uploadPaths.push(options.filePath)
      uploadBehavior(options)
    }
  }
  const api = loadIdentityApi({ uni, prepareIdentityUpload: () => new Promise(resolve => { finishPrepare = resolve; markPrepared() }) })
  const pending = api.submitIdentity({ name: 'test' }, { path: 'original' }, { isCurrent })
  pending.catch(() => {})
  await prepared
  beforeResolve({ setToken: value => { token = value }, resolve: () => finishPrepare({ path: 'compressed', cleanup: () => { events.cleanups++ } }) })
  return { pending, events }
}

{
  let current = true
  const { pending, events } = await submitWithDeferredPreparation({
    isCurrent: () => current,
    beforeResolve: ({ resolve }) => { current = false; resolve() },
    uploadBehavior: options => options.fail(new Error('must not upload after exit'))
  })
  await assert.rejects(pending, error => error.cancelled === true)
  assert.equal(events.uploads, 0, 'does not upload after the page exits during preparation')
  assert.equal(events.cleanups, 1, 'cleans the prepared file after cancellation')
}

{
  const { pending, events } = await submitWithDeferredPreparation({
    beforeResolve: ({ setToken, resolve }) => { setToken('account-b'); resolve() },
    uploadBehavior: options => options.fail(new Error('must not upload with changed credentials'))
  })
  await assert.rejects(pending, error => error.cancelled === true)
  assert.equal(events.uploads, 0, 'does not upload when the account token changes during preparation')
  assert.equal(events.cleanups, 1, 'cleans the prepared file after a credential change')
}

{
  const { pending, events } = await submitWithDeferredPreparation({
    uploadBehavior: options => options.success({ data: JSON.stringify({ code: 0, data: { verification: 'accepted' } }) })
  })
  assert.equal(JSON.stringify(await pending), JSON.stringify({ verification: 'accepted' }))
  assert.equal(events.uploads, 1)
  assert.deepEqual(events.uploadPaths, ['compressed'])
  assert.equal(events.cleanups, 1, 'cleans the prepared file after successful upload')
}

{
  const { pending, events } = await submitWithDeferredPreparation({
    uploadBehavior: options => options.fail(new Error('upload failed'))
  })
  await assert.rejects(pending, /未取得认证结果/)
  assert.equal(events.uploads, 1)
  assert.equal(events.cleanups, 1, 'cleans the prepared file after upload failure')
}

console.log('identity photo upload tests passed')
