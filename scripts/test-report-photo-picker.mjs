import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import test from 'node:test'
import { TRASH_BIN_IMAGE_LIMIT } from '../src/utils/trash-bin-image-core.mjs'
import { createReportPhotoSelection } from '../src/utils/report-photo-selection.mjs'

const require = createRequire(import.meta.url)
const { parse, compileScript, compileTemplate } = require('@vue/compiler-sfc')
const { preprocess } = require('@dcloudio/uni-cli-shared/lib/preprocess')
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = path => readFile(resolve(root, path), 'utf8')

test('report photo pages and picker preprocess as H5, APP-PLUS, and MP-WEIXIN SFCs', async () => {
  const files = ['src/components/ReportPhotoPicker.vue', 'src/pages/map/map.vue', 'src/pages-dark/map/map.vue']
  const platforms = [
    { name: 'H5', context: { H5: true } },
    { name: 'APP-PLUS', context: { APP: true, APP_PLUS: true } },
    { name: 'MP-WEIXIN', context: { MP: true, MP_WEIXIN: true } }
  ]

  for (const file of files) {
    const source = await read(file)
    for (const platform of platforms) {
      const parsed = parse(source, { filename: file })
      assert.equal(parsed.errors.length, 0, `${file} parses for ${platform.name}`)
      const template = preprocess(parsed.descriptor.template.content, platform.context, { type: 'html' })
      const scriptSetup = parsed.descriptor.scriptSetup
      const script = scriptSetup ? preprocess(scriptSetup.content, platform.context, { type: 'js' }) : ''
      if (scriptSetup) {
        const compiledScript = compileScript({ ...parsed.descriptor, scriptSetup: { ...scriptSetup, content: script } }, { id: `${file}-${platform.name}` })
        assert.ok(compiledScript.content.length > 0, `${file} script compiles for ${platform.name}`)
      }
      const compiledTemplate = compileTemplate({ source: template, filename: file, id: `${file}-${platform.name}` })
      assert.deepEqual(compiledTemplate.errors, [], `${file} template compiles for ${platform.name}`)
    }
  }
})

test('report photo limits, upload wiring, processing guard, and trusted admin paths stay focused', async () => {
  assert.equal(TRASH_BIN_IMAGE_LIMIT, 500 * 1024)
  const [picker, light, dark, api, admin, selection] = await Promise.all([
    read('src/components/ReportPhotoPicker.vue'), read('src/pages/map/map.vue'),
    read('src/pages-dark/map/map.vue'), read('src/api/map.js'), read('src/components/MapBinAdminPanel.vue'),
    read('src/utils/report-photo-selection.mjs')
  ])
  assert.match(picker, /createReportPhotoSelection/)
  assert.match(selection, /compressImage\(path\)/)
  assert.match(selection, /3 - photos\.length/)
  assert.match(selection, /data:image/)
  assert.match(picker, /disabled: Boolean/)
  assert.match(picker, /props\.disabled \|\| processing\.value/)
  assert.match(picker, /if \(isDisabled\.value\) return/)
  for (const page of [light, dark]) {
    assert.match(page, /ReportPhotoPicker[^\n]*:disabled="reportSubmitting"/)
    assert.match(page, /reportPhotoProcessing\.value\) return/)
    assert.match(page, /reportPhotos\.value = \[\]/)
    assert.match(page, /reportDeviceError\(deviceId, reason, reportPhotos\.value\)/)
  }
  assert.match(api, /reportDeviceError\(deviceId, reason = '', photos = \[\]\)/)
  assert.match(api, /photos: Array\.isArray\(photos\) \? photos : \[\]/)
  assert.match(admin, /images\\\/bin-reports/)
  assert.match(admin, /previewTrashBinImage\(path\)/)
})

test('photo chooser ignores double taps, resets after cancel, and ignores callbacks after disposal', async () => {
  let callbacks
  let chooseCalls = 0
  let processing = false
  let photos = []
  const processingChanges = []
  const errors = []
  const selection = createReportPhotoSelection({
    chooseImage(options) { chooseCalls++; callbacks = options },
    compressImage: async path => `data:image/jpeg;base64,${path}`,
    getPhotos: () => photos,
    setPhotos: value => { photos = value },
    setProcessing: value => { processing = value; processingChanges.push(value) },
    canChoose: () => true,
    onError: error => { errors.push(error.message) }
  })

  selection.choose()
  selection.choose()
  assert.equal(chooseCalls, 1, 'second tap is ignored while chooser is pending')
  assert.equal(processing, true, 'processing begins before the chooser callback')
  callbacks.success({ tempFilePaths: ['photo.jpg'] })
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(photos, ['data:image/jpeg;base64,photo.jpg'])
  assert.equal(processing, false, 'processing ends after compression')

  selection.choose()
  callbacks.fail({ errMsg: 'chooseImage:fail cancel' })
  assert.equal(processing, false, 'cancel resets processing state')
  assert.deepEqual(errors, [], 'cancel does not show an error')

  selection.choose()
  callbacks.success({ tempFilePaths: [] })
  assert.equal(processing, false, 'empty picker result resets processing state')

  selection.choose()
  callbacks.fail({ errMsg: 'chooseImage:fail permission denied' })
  assert.equal(processing, false, 'picker failure resets processing state')
  assert.equal(errors.length, 1, 'non-cancel picker failure is reported')

  const throwingSelection = createReportPhotoSelection({
    chooseImage() { throw new Error('picker unavailable') },
    compressImage: async photo => photo,
    getPhotos: () => [],
    setPhotos() {},
    setProcessing: value => { processing = value },
    canChoose: () => true,
    onError: error => errors.push(error.message)
  })
  throwingSelection.choose()
  assert.equal(processing, false, 'synchronous picker throw resets processing state')
  assert.equal(errors.at(-1), 'picker unavailable')

  selection.choose()
  const lateCallback = callbacks.success
  selection.dispose()
  lateCallback({ tempFilePaths: ['late.jpg'] })
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(photos, ['data:image/jpeg;base64,photo.jpg'], 'disposed picker ignores late callbacks')
  assert.equal(processingChanges.at(-1), true, 'dispose does not write into a torn-down component')
})

test('unsupported image MIME is rejected before adding the photo', async () => {
  let callbacks
  let processing = false
  let photos = []
  const errors = []
  const selection = createReportPhotoSelection({
    chooseImage(options) { callbacks = options },
    compressImage: async () => 'data:image/gif;base64,R0lGODlh',
    getPhotos: () => photos,
    setPhotos: value => { photos = value },
    setProcessing: value => { processing = value },
    canChoose: () => true,
    onError: error => errors.push(error.message)
  })

  selection.choose()
  callbacks.success({ tempFilePaths: ['animated.gif'] })
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(photos, [])
  assert.match(errors[0], /JPG、PNG 或 WebP/)
  assert.equal(processing, false)
})
