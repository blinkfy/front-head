import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { encodeBinImageWithinLimit, imageDataBytes, imageMimeFromBase64, normalizeImageData, resolveStoredBinImage, TRASH_BIN_IMAGE_LIMIT } from '../src/utils/trash-bin-image-core.mjs'
import { prepareAppMapImage } from '../src/utils/map-image-preview.mjs'
import { transformWithEsbuild } from 'vite'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const { preprocess } = require('@dcloudio/uni-cli-shared/lib/preprocess')

function jpegData(bytes) {
  const data = Buffer.alloc(bytes)
  data.set([0xff, 0xd8, 0xff, 0xe0])
  return `data:image/jpeg;base64,${data.toString('base64')}`
}

async function testCore() {
  assert.equal(imageMimeFromBase64('/9j/AA=='), 'image/jpeg')
  assert.equal(normalizeImageData(' /9j/AA==\n'), 'data:image/jpeg;base64,/9j/AA==')
  assert.equal(normalizeImageData('data:image/jpg;base64,/9j/AA=='), 'data:image/jpeg;base64,/9j/AA==')
  assert.equal(normalizeImageData('data:image/jpeg;base64,/9j/A'), '')
  assert.equal(resolveStoredBinImage('uploads\\bins\\1.jpg', 'https://cdn.test/'), 'https://cdn.test/uploads/bins/1.jpg')
  assert.equal(resolveStoredBinImage('https://cdn.test/b.jpg?sig=x'), 'https://cdn.test/b.jpg?sig=x')
  assert.equal(resolveStoredBinImage('data:text/plain;base64,AA=='), '')
  assert.equal(resolveStoredBinImage('', 'https://cdn.test'), '', 'empty non-map images must keep the legacy empty value')
  assert.equal(resolveStoredBinImage(undefined, 'https://cdn.test'), '')
  assert.equal(resolveStoredBinImage('data:image/jpeg;base64,/9j/AA==', 'https://cdn.test'), 'data:image/jpeg;base64,/9j/AA==', 'real inline images must be preserved without mapType')
  assert.equal(resolveStoredBinImage('', 'https://cdn.test/', 'waste_basket'), 'https://cdn.test/images/waste_basket.webp')
  assert.equal(resolveStoredBinImage(null, 'https://cdn.test', 'waste_disposal'), 'https://cdn.test/images/waste_disposal.webp')
  assert.equal(resolveStoredBinImage(undefined, 'https://cdn.test', 'recycling'), 'https://cdn.test/images/recycling.webp')
  assert.equal(resolveStoredBinImage('', 'https://cdn.test', 'unknown'), 'https://cdn.test/images/waste_basket.webp')
  assert.equal(resolveStoredBinImage('real.jpg', 'https://cdn.test', 'recycling'), 'https://cdn.test/real.jpg')
  assert.equal(resolveStoredBinImage('data:image/jpeg;base64,/9j/AA==', 'https://cdn.test', 'recycling'), 'data:image/jpeg;base64,/9j/AA==')

  const mapSources = ['src/pages/map/map.vue', 'src/pages-dark/map/map.vue'].map(file => fs.readFileSync(path.join(root, file), 'utf8'))
  for (const source of mapSources) {
    assert.match(source, /item\.hasImage\s*===\s*true\s*&&\s*!\(item\.image\s*\|\|\s*item\.imagePath\)/, 'map cards must keep lazy Base64 loading available')
    assert.match(source, /resolveTrashBinImage\(item\.image\s*\|\|\s*item\.imagePath,\s*item\.mapType\s*\|\|\s*'waste_basket'\)/, 'map cards must pass an explicit default mapType')
  }
  const adminPanel = fs.readFileSync(path.join(root, 'src/components/MapBinAdminPanel.vue'), 'utf8')
  assert.match(adminPanel, /loadedImage\.value\s*\?\s*resolveTrashBinImage\(loadedImage\.value\)\s*:\s*props\.bin\.hasImage\s*&&\s*!\(props\.bin\.image\s*\|\|\s*props\.bin\.imagePath\)\s*\?\s*''/, 'admin panel must prefer loaded data and preserve its lazy load action')

  let attempts = 0
  const result = await encodeBinImageWithinLimit(2400, 1800, ({ quality }) => {
    attempts += 1
    return jpegData(attempts < 4 ? TRASH_BIN_IMAGE_LIMIT + 100 : 320_000 + Math.round(quality))
  })
  assert.ok(attempts > 1)
  assert.ok(imageDataBytes(result) <= TRASH_BIN_IMAGE_LIMIT)
  await assert.rejects(encodeBinImageWithinLimit(2400, 1800, () => jpegData(TRASH_BIN_IMAGE_LIMIT + 1)), /500KB/)
  console.log(`CORE OK normalization, resolver, retries=${attempts}, bytes=${imageDataBytes(result)}, oversized rejection`)
}

async function loadPlatformModule(platform, stubs) {
  const source = fs.readFileSync(path.join(root, 'src/utils/trash-bin-image.js'), 'utf8')
  const context = { APP_PLUS: platform === 'APP_PLUS', MP: platform === 'MP', H5: false }
  let code = preprocess(source, context, 'js')
  code = code
    .replace(/^import\s+\{\s*config\s*\}\s+from\s+['"]@\/api\/config\.js['"];?\s*$/m, '')
    .replace(/^import\s+\{\s*prepareAppMapImage\s*\}\s+from\s+['"]\.\/map-image-preview\.mjs['"];?\s*$/m, '')
    .replace(/^import\s+\{\s*encodeBinImageWithinLimit, imageDataBytes, imageMimeFromBase64, normalizeImageData, resolveStoredBinImage, TRASH_BIN_IMAGE_LIMIT\s*\}\s+from\s+['"]\.\/trash-bin-image-core\.mjs['"];?\s*$/m, '')
    .replace(/\bexport\s+const\s+resolveTrashBinImage\b/, 'const resolveTrashBinImage')
    .replace(/\bexport\s+async\s+function\s+compressTrashBinImage\b/, 'async function compressTrashBinImage')
    .replace(/\bexport\s+async\s+function\s+previewTrashBinImage\b/, 'async function previewTrashBinImage')
  const transformed = (await transformWithEsbuild(code, `trash-bin-image-${platform}.js`, { loader: 'js', target: 'es2022' })).code
  const factory = new Function(
    'config', 'prepareAppMapImage', 'encodeBinImageWithinLimit', 'imageDataBytes', 'imageMimeFromBase64',
    'normalizeImageData', 'resolveStoredBinImage', 'TRASH_BIN_IMAGE_LIMIT', 'uni', 'plus', 'my',
    `${transformed}\nreturn { compressTrashBinImage, resolveTrashBinImage, previewTrashBinImage }`
  )
  return factory(
    { baseUrl: 'https://cdn.test' }, prepareAppMapImage, encodeBinImageWithinLimit, imageDataBytes,
    imageMimeFromBase64, normalizeImageData, resolveStoredBinImage, TRASH_BIN_IMAGE_LIMIT,
    stubs.uni, stubs.plus, stubs.my
  )
}

function createPlatformHarness(platform, options = {}) {
  const original = '/selected/original.jpg'
  const compressed = '/selected/compressed.jpg'
  const removed = []
  let compressCalls = 0
  let previewCalls = 0
  const originalData = jpegData(options.originalBytes ?? TRASH_BIN_IMAGE_LIMIT + 64)
  const compressedData = jpegData(options.compressedBytes ?? 96_000)
  const dataForPath = filePath => filePath === original ? originalData : compressedData
  const fileSystem = {
    readFile(args) { args.success({ data: dataForPath(args.filePath).split(',')[1] }) },
    writeFile(args) { args.success({}) },
    unlink(args) { removed.push(args.filePath); args.success?.({}) }
  }
  const uni = {
    env: { USER_DATA_PATH: '/user' },
    getImageInfo(args) { args.success({ width: 2200, height: 1600, path: args.src }) },
    getFileSystemManager: () => fileSystem,
    compressImage(args) {
      compressCalls += 1
      if (options.compressError) { args.fail(options.compressError); return }
      args.success({ tempFilePath: compressed })
    },
    previewImage(args) {
      previewCalls += 1
      if (options.previewErrorAt === previewCalls) args.fail(new Error('preview stub failure'))
      else args.success({})
    }
  }
  const plus = {
    zip: { compressImage(_args, success, fail) {
      compressCalls += 1
      if (options.compressError) { fail(options.compressError); return }
      success({ target: compressed })
    } },
    nativeObj: { Bitmap: class {
      loadBase64Data(_src, success) { success() }
      save(_path, _opts, success) { success({ target: `/doc/map-preview-${Date.now()}-${previewCalls}.png` }) }
      clear() {}
    } },
    io: {
      resolveLocalFileSystemURL(filePath, success) {
        success({
          file: done => done({ path: filePath }),
          remove: done => { removed.push(filePath); done?.() }
        })
      },
      FileReader: class {
        readAsDataURL(file) { this.onloadend({ target: { result: dataForPath(file?.path || original) } }) }
      }
    }
  }
  const module = loadPlatformModule(platform, { uni, plus, my: {} })
  return { module, original, compressed, compressCalls: () => compressCalls, previewCalls: () => previewCalls, removed, fileSystem }
}

async function testCompressionPlatform(platform) {
  const success = createPlatformHarness(platform)
  const helper = await success.module
  assert.equal(helper.resolveTrashBinImage(''), '', `${platform} callers without mapType must keep the legacy empty value`)
  assert.equal(helper.resolveTrashBinImage('', 'recycling'), 'https://cdn.test/images/recycling.webp')
  const result = await helper.compressTrashBinImage(success.original)
  assert.ok(imageDataBytes(result) <= TRASH_BIN_IMAGE_LIMIT, `${platform} must return a within-limit image`)
  assert.equal(success.compressCalls(), 1, `${platform} should compress an oversized original once before succeeding`)
  assert.ok(success.removed.includes(success.compressed), `${platform} should clean up compressed temporary files`)

  const fail = createPlatformHarness(platform, { compressError: new Error('compress stub failure') })
  await assert.rejects((await fail.module).compressTrashBinImage(fail.original), /compress stub failure/)
  assert.equal(fail.compressCalls(), 1)

  const remainsLarge = createPlatformHarness(platform, { compressedBytes: TRASH_BIN_IMAGE_LIMIT + 80 })
  await assert.rejects((await remainsLarge.module).compressTrashBinImage(remainsLarge.original), /500KB/)
  assert.equal(remainsLarge.compressCalls(), 18, `${platform} should reject after the bounded retry limit`)
  console.log(`${platform} compression OK success-after-compress, compressor failure, and 18 oversized retries rejected`)
}

async function testPreviewPlatform(platform) {
  const harness = createPlatformHarness(platform, { previewErrorAt: 3 })
  const helper = await harness.module
  const image = jpegData(128)
  await helper.previewTrashBinImage(image)
  await helper.previewTrashBinImage(image)
  await assert.rejects(helper.previewTrashBinImage(image), /图片预览失败|preview stub failure/)
  assert.equal(harness.previewCalls(), 3)
  if (platform === 'APP_PLUS') {
    assert.ok(harness.removed.some(path => path.includes('map-preview')), 'APP should remove superseded and failed native preview files')
  } else {
    assert.ok(harness.removed.some(path => path.includes('bin_preview_')), 'MP should remove superseded and failed preview files')
  }
  console.log(`${platform} preview OK temporary path cleanup on supersede and failure`)
}

await testCore()
for (const platform of ['APP_PLUS', 'MP']) {
  await testCompressionPlatform(platform)
  await testPreviewPlatform(platform)
}
console.log('Trash bin image core/native regressions complete')
