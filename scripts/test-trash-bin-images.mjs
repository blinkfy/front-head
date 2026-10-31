import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { encodeBinImageWithinLimit, imageDataBytes, imageMimeFromBase64, normalizeImageData, resolveBinPointImage, resolveStoredBinImage, TRASH_BIN_IMAGE_LIMIT } from '../src/utils/trash-bin-image-core.mjs'
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
  const imageHelper = fs.readFileSync(path.join(root, 'src/utils/trash-bin-image.js'), 'utf8')
  assert.doesNotMatch(imageHelper, /\buni\s*\[[^\]]+\]/, 'uni APIs must not be selected through dynamic property access')
  assert.match(imageHelper, /uniCall\(options\s*=>\s*uni\.previewImage\(options\)/, 'image preview uses a static uni API reference')
  assert.match(imageHelper, /uniCall\(options\s*=>\s*uni\.getImageInfo\(options\)/, 'image metadata lookup uses a static uni API reference')
  assert.match(imageHelper, /uniCall\(options\s*=>\s*uni\.compressImage\(options\)/, 'image compression uses a static uni API reference')

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
  assert.equal(resolveBinPointImage({ imagePath: 'uploads/bin.jpg', id: 7 }, 'https://cdn.test'), 'https://cdn.test/uploads/bin.jpg', 'stored real photos must resolve directly')
  assert.equal(resolveBinPointImage({ image: 'data:image/jpeg;base64,/9j/AA==', id: 7 }, 'https://cdn.test'), 'data:image/jpeg;base64,/9j/AA==', 'inline Base64 photos must be preserved')
  assert.equal(resolveBinPointImage({ id: 7, hasImage: true, updatedAt: '2026-10-31 12:30:00' }, 'https://cdn.test'), 'https://cdn.test/api/trash-bin/7/image?raw=1&v=2026-10-31%2012%3A30%3A00', 'listed photos must use the versioned raw image endpoint')
  assert.equal(resolveBinPointImage({ id: 0, hasImage: true, mapType: 'recycling' }, 'https://cdn.test'), 'https://cdn.test/images/recycling.webp', 'points without a stored photo must use the map type fallback')

  const mapSources = ['src/pages/map/map.vue', 'src/pages-dark/map/map.vue'].map(file => fs.readFileSync(path.join(root, file), 'utf8'))
  for (const source of mapSources) {
    assert.match(source, /item\.hasImage\s*===\s*true\s*&&\s*!\(item\.image\s*\|\|\s*item\.imagePath\)/, 'map cards must keep lazy Base64 loading available')
    assert.match(source, /resolveTrashBinImage\(item\.image\s*\|\|\s*item\.imagePath,\s*item\.mapType\s*\|\|\s*'waste_basket'\)/, 'map cards must pass an explicit default mapType')
  }
  const adminPanel = fs.readFileSync(path.join(root, 'src/components/MapBinAdminPanel.vue'), 'utf8')
  assert.match(adminPanel, /resolveBinPointImage\(props\.bin,\s*config\.baseUrl\)/, 'admin panel must display the bin image through its raw URL')
  assert.match(adminPanel, /await getBinPointPhoto\(props\.bin\)/, 'admin preview must fetch the JSON image instead of previewing the raw URL')
  assert.match(adminPanel, /@click\.stop="previewBinImage"/, 'admin image preview clicks must not bubble to the map popup')
  assert.match(adminPanel, /image\s*&&\s*editing\.value\s*&&\s*!imageChanged\.value\s*&&\s*binPointPhotoKey\(props\.bin\)\s*===\s*key/, 'late image loads must not overwrite a changed image or a closed editor')
  assert.match(adminPanel, /if\s*\(!imageChanged\.value\)\s*delete payload\.imagePath/, 'admin panel must omit imagePath unless the user changed the image')
  const nearbyPanel = fs.readFileSync(path.join(root, 'src/components/NearbyDisposalPanel.vue'), 'utf8')
  assert.match(nearbyPanel, /getBinPointPhotoSource\(point,\s*\{\s*coverImage:\s*props\.native\s*\}\)/, 'nearby images must fetch JSON only after an image error')
  const nativePanel = fs.readFileSync(path.join(root, 'src/components/NearbyDisposalNativeContent.vue'), 'utf8')
  assert.match(nativePanel, /send\('imageerror',\s*point\.id\)/, 'native image errors must reach the bridge for lazy fallback')
  const appBridge = fs.readFileSync(path.join(root, 'src/components/AppNearbyDisposalPanel.vue'), 'utf8')
  assert.match(appBridge, /pageSubNVue\(page,\s*props\.panelId\)/, 'native-window attachment must use the page-scoped lookup')
  const photoHelper = fs.readFileSync(path.join(root, 'src/utils/bin-point-photo.js'), 'utf8')
  assert.match(photoHelper, /console\.warn\('\[bin-point-photo\]',\s*JSON\.stringify\(/, 'photo fallback logs must remain visible in App console output')

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

function scriptSetupHarness(file, replacements, args, returned, stubs) {
  let source = fs.readFileSync(path.join(root, file), 'utf8')
  const match = source.match(/<script setup>([\s\S]*?)<\/script>/)
  assert.ok(match, `${file} script setup found`)
  source = match[1].replace(/^import .*?;?\s*$/gm, '')
  for (const [pattern, replacement] of replacements) {
    const updated = source.replace(pattern, replacement)
    assert.notEqual(updated, source, `expected harness replacement in ${file}`)
    source = updated
  }
  return new Function(...args, `${source}\nreturn { ${returned} }`)(...stubs)
}

async function testSfcImageFlows() {
  const emitted = []
  const editor = scriptSetupHarness('src/components/TrashBinImageEditor.vue', [
    [/const props = defineProps\([\s\S]*?\)\nconst emit = defineEmits\([\s\S]*?\)/,
      'const props = inputProps\nconst emit = inputEmit']
  ], ['inputProps', 'inputEmit', 'ref', 'computed', 'watch', 'onBeforeUnmount', 'resolveTrashBinImage', 'chooseAppImage', 'compressTrashBinImage', 'previewTrashBinImage'], 'imageSrc, removeImage', [
    { modelValue: '', previewSrc: 'https://cdn.test/api/trash-bin/7/image?raw=1', disabled: false },
    (name, value) => emitted.push([name, value]), value => ({ value }), fn => ({ get value() { return fn() } }), () => {}, () => {}, value => value, () => {}, async () => '', async () => {}
  ])
  assert.equal(editor.imageSrc.value, 'https://cdn.test/api/trash-bin/7/image?raw=1', 'an existing preview URL must make the image deletable before model loading')
  editor.removeImage()
  assert.deepEqual(emitted.at(-1), ['update:modelValue', ''], 'deleting a preview-only image must emit an explicit empty value')

  let submitted
  let previewed
  const admin = scriptSetupHarness('src/components/MapBinAdminPanel.vue', [
    [/const props = defineProps\([\s\S]*?\)\nconst emit = defineEmits\([\s\S]*?\)/,
      'const props = inputProps\nconst emit = inputEmit']
  ], ['inputProps', 'inputEmit', 'ref', 'computed', 'watch', 'binReports', 'config', 'resolveBinPointImage', 'binPointPhotoKey', 'getBinPointPhoto', 'previewTrashBinImage', 'approveBin', 'rejectBin', 'updateBin', 'deleteBin', 'clearBinErrorReports', 'uni'], 'save, previewBinImage', [
    { bin: { id: 7, name: '点位', latitude: 25, longitude: 121, imagePath: 'old.jpg', hasImage: true }, dark: false },
    () => {}, value => ({ value }), fn => ({ get value() { return fn() } }), (source, callback, options) => { if (options?.immediate) callback() }, () => [], { baseUrl: 'https://cdn.test' }, () => '', point => `${point.id}:${point.updatedAt || 'ttl'}`, async () => 'data:image/jpeg;base64,/9j/AA==', async value => { previewed = value }, async () => ({ code: 0 }), async () => ({ code: 0 }), async (_id, payload) => { submitted = payload; return { code: 0 } }, async () => ({ code: 0 }), async () => ({ code: 0 }), { showToast() {} }
  ])
  await admin.save()
  assert.ok(submitted, 'saving unchanged admin details must submit')
  assert.equal(Object.hasOwn(submitted, 'imagePath'), false, 'saving without touching the image must not clear its stored path')
  await admin.previewBinImage()
  assert.equal(previewed, 'data:image/jpeg;base64,/9j/AA==', 'admin point preview must use the JSON image payload')
  console.log('SFC image flows OK preview-only deletion and unchanged-image save preservation')
}

async function loadBinPointPhotoModule(platform, fetchImage, uni = {}) {
  const source = fs.readFileSync(path.join(root, 'src/utils/bin-point-photo.js'), 'utf8')
  let code = preprocess(source, { MP: platform === 'MP' }, 'js')
    .replace(/^import \{ getTrashBinImage \} from ['"]@\/api\/map['"];?\s*$/m, '')
    .replace(/^import \{ config \} from ['"]@\/api\/config\.js['"];?\s*$/m, '')
    .replace(/^import \{ normalizeImageData, resolveStoredBinImage \} from ['"]\.\/trash-bin-image-core\.mjs['"];?\s*$/m, '')
    .replace(/\bexport\s+(?=(?:async\s+)?function\b)/g, '')
  code = (await transformWithEsbuild(code, `bin-point-photo-${platform}.js`, { loader: 'js', target: 'es2022' })).code
  const factory = new Function('getTrashBinImage', 'config', 'normalizeImageData', 'resolveStoredBinImage', 'uni', 'my', `${code}\nreturn { binPointPhotoKey, getBinPointPhoto, getBinPointPhotoSource }`)
  return factory(fetchImage, { baseUrl: 'https://cdn.test' }, normalizeImageData, resolveStoredBinImage, uni, {})
}

async function testBinPointPhoto() {
  let active = 0
  let maximumActive = 0
  const calls = []
  const image = 'data:image/jpeg;base64,/9j/AA=='
  const helper = await loadBinPointPhotoModule('H5', async id => {
    calls.push(id)
    active += 1
    maximumActive = Math.max(maximumActive, active)
    await new Promise(resolve => setTimeout(resolve, 8))
    active -= 1
    return { code: 0, data: { image } }
  })
  const point1 = { id: 'photo-1', hasImage: true }
  const [first, duplicate, second, third] = await Promise.all([
    helper.getBinPointPhoto(point1), helper.getBinPointPhoto(point1),
    helper.getBinPointPhoto({ id: 'photo-2', hasImage: true }), helper.getBinPointPhoto({ id: 'photo-3', hasImage: true })
  ])
  assert.equal(first, image)
  assert.equal(duplicate, image)
  assert.equal(second, image)
  assert.equal(third, image)
  assert.equal(calls.length, 3, 'same id+updatedAt requests must deduplicate')
  assert.equal(maximumActive, 2, 'image JSON requests must be limited to two concurrent calls')
  await helper.getBinPointPhoto(point1)
  assert.equal(calls.length, 3, 'successful image data must be cached')

  let writes = 0
  const removed = []
  const mp = await loadBinPointPhotoModule('MP', async () => ({ code: 0, data: { image } }), {
    env: { USER_DATA_PATH: '/user' },
    getFileSystemManager: () => ({
      writeFile(options) { writes += 1; options.success() },
      unlink(options) { removed.push(options.filePath); options.success?.() }
    })
  })
  const mpPoint = { id: 'cover-1', hasImage: true }
  const [tempPath, samePath] = await Promise.all([
    mp.getBinPointPhotoSource(mpPoint, { coverImage: true }), mp.getBinPointPhotoSource(mpPoint, { coverImage: true })
  ])
  assert.match(tempPath, /^\/user\/bin_point_.*\.jpg$/)
  assert.equal(samePath, tempPath)
  assert.equal(writes, 1, 'MP cover-image should reuse its bounded temporary file cache')
  for (let id = 0; id < 11; id++) await mp.getBinPointPhotoSource({ id: `cover-${id + 2}`, hasImage: true }, { coverImage: true })
  assert.ok(removed.length >= 2, 'MP temporary files must be removed when their bounded cache evicts entries')
  console.log(`BIN POINT PHOTO OK dedupe, max concurrent=${maximumActive}, cache, MP temp cleanup`)
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
await testSfcImageFlows()
await testBinPointPhoto()
for (const platform of ['APP_PLUS', 'MP']) {
  await testCompressionPlatform(platform)
  await testPreviewPlatform(platform)
}
console.log('Trash bin image core/native regressions complete')
