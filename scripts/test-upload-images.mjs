import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'
import { imageMimeFromBase64 } from '../src/utils/trash-bin-image-core.mjs'
import { encodeUploadCanvas, uploadImageDimensions, uploadImageExtension, compressUploadImageBlob } from '../src/utils/upload-image.js'

assert.deepEqual(uploadImageDimensions(2400, 1200, 800), { width: 800, height: 400 })
assert.deepEqual(uploadImageDimensions(20, 10, 256), { width: 20, height: 10 })
assert.equal(uploadImageExtension('image/webp'), 'webp')
assert.equal(uploadImageExtension('image/png'), 'png')
const calls = []
const encoder = supported => ({ toDataURL(mime) {
  calls.push(mime)
  return `data:${mime === 'image/webp' && !supported ? 'image/png' : mime};base64,AQID`
} })
assert.match(encodeUploadCanvas(encoder(true)), /^data:image\/webp;/)
assert.deepEqual(calls.splice(0), ['image/webp'])
assert.match(encodeUploadCanvas(encoder(false)), /^data:image\/jpeg;/)
assert.deepEqual(calls.splice(0), ['image/webp', 'image/jpeg'])
assert.match(encodeUploadCanvas(encoder(false), .8, true), /^data:image\/png;/)
assert.deepEqual(calls.splice(0), ['image/webp', 'image/png'])
assert.match(encodeUploadCanvas({ toDataURL(mime) {
  if (mime === 'image/webp') throw new Error('unsupported encoder')
  return 'data:image/jpeg;base64,AQID'
} }), /^data:image\/jpeg;/)

let canvas
let fills = 0
globalThis.Image = class {
  naturalWidth = 40
  naturalHeight = 20
  set src(value) { this.onload() }
}
globalThis.document = { createElement() {
  canvas = { ...encoder(true), getContext: () => ({ fillRect() { fills++ }, drawImage() {} }) }
  return canvas
} }
const transparentBlob = await compressUploadImageBlob('/avatar.png', .8, 256, true)
assert.equal(transparentBlob.type, 'image/webp')
assert.equal(transparentBlob.size, 3)
assert.equal(fills, 0)
assert.equal(canvas.width, 0)
await compressUploadImageBlob('/photo.jpg', .8, 800)
assert.equal(fills, 1)
delete globalThis.Image
delete globalThis.document

const utility = readFileSync(new URL('../src/utils/upload-image.js', import.meta.url), 'utf8')
const avatar = readFileSync(new URL('../src/utils/avatar-handler.js', import.meta.url), 'utf8')
const require = createRequire(import.meta.url)
const shared = require('@dcloudio/uni-cli-shared/dist/vite/plugins/pre.js')
const preprocessContext = require('@dcloudio/uni-cli-shared/dist/preprocess/context.js')
const sharedConstants = require('@dcloudio/uni-cli-shared/dist/constants.js')
assert.equal(sharedConstants.EXTNAME_JS.includes('.js'), true)
assert.equal(sharedConstants.EXTNAME_JS.includes('.mjs'), false, 'uni:pre must see the utility as .js so platform branches are compiled')
for (const [platform, uniPlatform] of [['H5', 'h5'], ['APP-PLUS', 'app'], ['MP-WEIXIN', 'mp-weixin']]) {
  preprocessContext.initPreContext(uniPlatform)
  const plugin = shared.uniPrePlugin({ sourcemap: false }, { include: /\.js$/ })
  const transformed = plugin.transform.call({ getCombinedSourcemap() { return null } }, utility, new URL('../src/utils/upload-image.js', import.meta.url).pathname)
  assert.ok(transformed?.code, `${platform} upload-image.js should be transformed by uni:pre`)
  const compiled = transformed.code
  assert.ok(!compiled.includes('#ifdef') && !compiled.includes('#ifndef'), `${platform} conditional compilation should be consumed`)
  const source = compiled.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') + '\nthis.api = { prepareAvatarUpload, compressNativeUploadImage, discardUploadImage, readUploadImageData }'
  const removed = []
  let zipOptions
  let appWebpAttempts = 0
  let wechatWebpAttempts = 0
  const wechatArgs = []
  let wechatProcessor = async () => null
  const fileSizes = new Map()
  let legacyCanvasCalls = 0
  const context = { console, atob: globalThis.atob, imageMimeFromBase64, uni: {
    getImageInfo: ({ src, success }) => success({ width: 2400, height: 1200, type: src.endsWith('.jpg') ? 'jpg' : 'png' }),
    compressImage(options) {
      options.success({ tempFilePath: `/tmp/compressed-${options.compressedWidth}.jpg` })
    },
    getFileInfo: ({ filePath, success }) => success({ size: fileSizes.get(filePath) || 0 }),
    createCanvasContext() {
      legacyCanvasCalls++
      return { clearRect() {}, drawImage() {}, draw(_reserve, done) { done?.() } }
    },
    canvasToTempFilePath(options) { options.success({ tempFilePath: '/tmp/legacy-avatar.png' }) },
    getFileSystemManager: () => ({
      unlink: ({ filePath }) => removed.push(filePath),
      readFile: ({ filePath, success, fail }) => {
        if (filePath === '/tmp/broken.webp') return fail(new Error('read failed'))
        if (filePath.endsWith('.webp')) return success({ data: 'UklGRi4AAABXRUJQVlA4ICIAAABwAQCdASoBAAEAAUAmJZQCdAFAAAD+/DeBV/fU6D4r4AAA' })
        if (filePath.endsWith('.png')) return success({ data: 'iVBORw0KGgoAAAANSUhEUg==' })
        return success({ data: '/9j/AQID' })
      }
    })
  }, plus: {
    zip: { compressImage(options, success) { zipOptions = options; success({ target: '/own/upload.png' }) } },
    io: { resolveLocalFileSystemURL(path, success) { success({ remove() { removed.push(path) } }) } }
  }, tryAppUploadWebp: (...args) => { appWebpAttempts++; return Promise.resolve(null) },
  compressWechatUploadImage: (...args) => { wechatWebpAttempts++; wechatArgs.push(args); return wechatProcessor(...args) } }
  runInNewContext(source, context, { filename: `upload-image.${platform}.js` })
  if (platform === 'H5') {
    context.Image = class { naturalWidth = 40; naturalHeight = 20; set src(value) { this.onload() } }
    context.document = { createElement() { canvas = { ...encoder(true), getContext: () => ({ fillRect() { fills++ }, drawImage() {} }) }; return canvas } }
    context.Blob = Blob
    context.File = class extends Blob { constructor(parts, name, options) { super(parts, options); this.name = name } }
    context.URL = { createObjectURL: file => `blob:${file.name}`, revokeObjectURL: path => removed.push(path) }
    const candidate = await context.api.prepareAvatarUpload('/avatar.png')
    assert.match(candidate.path, /^blob:avatar_/)
    assert.equal(candidate.file.type, 'image/webp')
    candidate.cleanup()
    assert.equal(removed[0], candidate.path)
    continue
  }
  assert.equal('Image' in context, false)
  assert.equal('File' in context, false)
  assert.equal('document' in context, false)
  if (platform === 'MP-WEIXIN') assert.match(await context.api.readUploadImageData('/tmp/photo.jpg'), /^data:image\/jpeg;/)
  const candidate = await context.api.prepareAvatarUpload('/original.png')
  const path = candidate.path
  assert.equal(path, platform === 'APP-PLUS' ? '/own/upload.png' : platform === 'MP-WEIXIN' ? '/original.png' : '/tmp/compressed-256.jpg')
  if (platform === 'APP-PLUS') {
    assert.equal(zipOptions.format, 'png')
    assert.equal(zipOptions.width, '256px')
    assert.equal(appWebpAttempts, 1)
  }
  context.api.discardUploadImage('/original.png', '/original.png')
  assert.equal(removed.length, 0)
  candidate.cleanup()
  assert.equal(removed.length, path === '/original.png' ? 0 : 1)
  if (path !== '/original.png') assert.equal(removed[0], path)
  if (platform === 'MP-WEIXIN') {
    const photoPath = await context.api.compressNativeUploadImage('/photo.jpg', 80, 800, false)
    assert.equal(wechatArgs[1][1].type, 'jpg')
    assert.equal(wechatArgs[1][4], false)
    assert.equal(photoPath, '/tmp/compressed-800.jpg')
    assert.equal(wechatWebpAttempts, 2)

    wechatProcessor = async () => '/tmp/avatar-candidate.webp'
    fileSizes.set('/avatar-candidate.png', 100)
    fileSizes.set('/tmp/avatar-candidate.webp', 60)
    const webpAvatar = await context.api.prepareAvatarUpload('/avatar-candidate.png')
    assert.equal(webpAvatar.path, '/tmp/avatar-candidate.webp')
    webpAvatar.cleanup()
    assert.equal(removed.at(-1), '/tmp/avatar-candidate.webp')

    fileSizes.set('/avatar-large.png', 10)
    fileSizes.set('/tmp/avatar-candidate.webp', 20)
    const oversizedAvatar = await context.api.prepareAvatarUpload('/avatar-large.png')
    assert.equal(oversizedAvatar.path, '/avatar-large.png')
    assert.equal(removed.at(-1), '/tmp/avatar-candidate.webp', 'oversized candidate is discarded while original is retained')
    oversizedAvatar.cleanup()
    assert.equal(removed.includes('/avatar-large.png'), false)

    wechatProcessor = async () => { throw new Error('WebP core unavailable') }
    const failedAvatar = await context.api.prepareAvatarUpload('/avatar-failed.png')
    assert.equal(failedAvatar.path, '/avatar-failed.png')
    failedAvatar.cleanup()
    assert.equal(removed.includes('/avatar-failed.png'), false)
  }
  // Compile the avatar's platform branch without executing native APIs.
  preprocessContext.initPreContext(uniPlatform)
  const avatarPlugin = shared.uniPrePlugin({ sourcemap: false }, { include: /\.js$/ })
  const avatarSource = avatarPlugin.transform.call({ getCombinedSourcemap() { return null } }, avatar, new URL('../src/utils/avatar-handler.js', import.meta.url).pathname)?.code
  assert.ok(avatarSource, `${platform} avatar-handler.js should be transformed`)
  const avatarCompiled = avatarSource.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '')
  if (platform === 'MP-WEIXIN') {
    const avatarContext = {
      console,
      uni: context.uni,
      encodeUploadCanvas,
      compressNativeUploadImage: context.api.compressNativeUploadImage,
      readUploadImageData: context.api.readUploadImageData,
      discardUploadImage: context.api.discardUploadImage,
      compressWechatUploadImage: context.compressWechatUploadImage,
    }
    runInNewContext(`${avatarCompiled}\nthis.avatarApi = { compressImageToBase64 }`, avatarContext)
    wechatProcessor = async () => '/tmp/avatar-handler.webp'
    const canvasCallsBefore = legacyCanvasCalls
    const webpData = await avatarContext.avatarApi.compressImageToBase64('/avatar.png', 64, 64, .8, { preferWebp: true })
    assert.match(webpData, /^data:image\/webp;base64,UklGR/)
    assert.equal(legacyCanvasCalls, canvasCallsBefore, 'successful WebP avatar handling bypasses the legacy canvas')
    assert.equal(removed.at(-1), '/tmp/avatar-handler.webp')

    wechatProcessor = async () => '/tmp/broken.webp'
    const failedRead = await avatarContext.avatarApi.compressImageToBase64('/avatar.png', 64, 64, .8, { preferWebp: true })
    assert.match(failedRead, /^data:image\/png;base64,iVBORw0KGgo/)
    assert.ok(removed.includes('/tmp/broken.webp'), 'failed WebP read still cleans its candidate')

    wechatProcessor = async () => null
    const legacyFallback = await avatarContext.avatarApi.compressImageToBase64('/avatar.png', 64, 64, .8, { preferWebp: true })
    assert.match(legacyFallback, /^data:image\/png;base64,iVBORw0KGgo/)
    assert.ok(legacyCanvasCalls > canvasCallsBefore, 'unavailable WebP core retains the legacy PNG canvas path')
  } else runInNewContext(avatarCompiled, {})
}

const uploadCanvasPages = ['../src/pages/home/home.vue', '../src/pages-dark/home/home.vue', '../src/pages/map/map.vue', '../src/pages-dark/map/map.vue', '../src/pages-nonTheme/edit-profile.vue', '../src/pages-nonTheme/chat.vue']
for (const page of uploadCanvasPages) {
  const filename = new URL(page, import.meta.url).pathname
  const source = readFileSync(new URL(page, import.meta.url), 'utf8')
  assert.match(source, /<!-- #ifdef MP-WEIXIN -->\s*<canvas type="2d" id="upload-image-canvas"/, `${page} must expose the hidden Mini Program canvas only to WeChat`)
  const { descriptor, errors } = parse(source, { filename })
  assert.equal(errors.length, 0)
  compileScript(descriptor, { id: page })
  // These map pages have platform-conditional branches around sibling v-if/v-else nodes;
  // raw Vue compilation sees the directives before uni's conditional preprocessing.
  if (!page.includes('/map/')) assert.equal(compileTemplate({ source: descriptor.template.content, filename, id: page }).errors.length, 0)
}
console.log('upload image tests passed: MIME fallback, transparency, dimensions, native compression/cleanup, six canvas guards, and four Vue templates')
