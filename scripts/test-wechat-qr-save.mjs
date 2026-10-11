import assert from 'node:assert/strict'
import test from 'node:test'
import { saveWechatQrToAlbum, downloadWechatQr, getWechatQrMenuPosition } from '../src/utils/wechat-qr-save.mjs'

test('menu follows touch client coordinates with a small offset', () => {
  assert.deepEqual(getWechatQrMenuPosition({ touches: [{ clientX: 120, clientY: 80 }] }, {
    width: 400, height: 800
  }), { left: 128, top: 88 })
})

test('menu stays within the viewport when a touch is near the lower-right edge', () => {
  const position = getWechatQrMenuPosition({ touches: [{ clientX: 319, clientY: 599 }] }, {
    width: 320, height: 600
  })
  assert.deepEqual(position, { left: 164, top: 544 })
  assert.ok(position.left >= 8 && position.left <= 320 - 156)
  assert.ok(position.top >= 8 && position.top <= 600 - 56)
})

test('menu reads App detail coordinates', () => {
  assert.deepEqual(getWechatQrMenuPosition({ detail: { x: 50, y: 60 } }, {
    width: 400, height: 800
  }), { left: 58, top: 68 })
})

test('menu converts changed touch page coordinates to viewport coordinates', () => {
  assert.deepEqual(getWechatQrMenuPosition({ changedTouches: [{ pageX: 220, pageY: 330 }] }, {
    width: 400, height: 800, scrollX: 40, scrollY: 100
  }), { left: 188, top: 238 })
})

test('menu preserves zero touch coordinates', () => {
  assert.deepEqual(getWechatQrMenuPosition({ touches: [{ clientX: 0, clientY: 0 }] }, {
    width: 400, height: 800
  }), { left: 8, top: 8 })
})

test('APP downloads a 200 response to a temporary file before saving it', async () => {
  const calls = []
  await saveWechatQrToAlbum({
    src: 'https://example.test/miniapp.png',
    downloadFile: options => {
      calls.push(['download', options.url, options.timeout])
      options.success({ statusCode: 200, tempFilePath: '/cache/miniapp.png' })
    },
    saveImageToPhotosAlbum: options => {
      calls.push(['save', options.filePath])
      options.success({})
    }
  })
  assert.deepEqual(calls, [
    ['download', 'https://example.test/miniapp.png', 15000],
    ['save', '/cache/miniapp.png']
  ])
})

test('APP rejects non-200 or missing temporary files without saving', async () => {
  for (const file of [
    { statusCode: 500, tempFilePath: '/cache/error.png' },
    { statusCode: 200 },
    { statusCode: 200, tempFilePath: '' }
  ]) {
    let saves = 0
    await assert.rejects(saveWechatQrToAlbum({
      src: 'https://example.test/miniapp.png',
      downloadFile: options => options.success(file),
      saveImageToPhotosAlbum: () => { saves++ }
    }), /二维码下载失败/)
    assert.equal(saves, 0)
  }
})

test('APP download and photo permission failures are propagated', async () => {
  const downloadError = Object.assign(new Error('download permission denied'), { code: 401 })
  await assert.rejects(saveWechatQrToAlbum({
    src: 'https://example.test/miniapp.png',
    downloadFile: options => options.fail(downloadError),
    saveImageToPhotosAlbum: () => assert.fail('album save must not run after download failure')
  }), error => error === downloadError)

  const albumError = Object.assign(new Error('photo permission denied'), { code: 403 })
  await assert.rejects(saveWechatQrToAlbum({
    src: 'https://example.test/miniapp.png',
    downloadFile: options => options.success({ statusCode: 200, tempFilePath: '/cache/miniapp.png' }),
    saveImageToPhotosAlbum: options => options.fail(albumError)
  }), error => error === albumError)
})

test('H5 downloads an image with its MIME extension and revokes the object URL', async () => {
  const blob = new Blob(['qr-image'], { type: 'image/png' })
  const links = []
  const appended = []
  const revoked = []
  const scheduled = []
  const cancelled = []
  let fetchOptions
  const link = {
    clickCount: 0,
    removeCount: 0,
    click() { this.clickCount++ },
    remove() { this.removeCount++ }
  }

  await downloadWechatQr({
    src: 'https://example.test/miniapp.png',
    fetchImage: async (_src, options) => {
      fetchOptions = options
      return { ok: true, blob: async () => blob }
    },
    documentRef: {
      createElement(tag) { assert.equal(tag, 'a'); links.push(link); return link },
      body: { appendChild(value) { appended.push(value) } }
    },
    urlApi: {
      createObjectURL(value) { assert.equal(value, blob); return 'blob:wechat-qr' },
      revokeObjectURL(value) { revoked.push(value) }
    },
    schedule: (fn, delay) => { scheduled.push({ fn, delay }); return scheduled.length },
    cancel: id => cancelled.push(id)
  })

  assert.equal(fetchOptions.credentials, 'omit')
  assert.ok(fetchOptions.signal instanceof AbortSignal)
  assert.equal(link.href, 'blob:wechat-qr')
  assert.equal(link.download, '分投侠-小程序码.png')
  assert.equal(link.clickCount, 1)
  assert.equal(link.removeCount, 1)
  assert.deepEqual(appended, links)
  assert.deepEqual(scheduled.map(item => item.delay), [15000, 1000])
  assert.deepEqual(cancelled, [1])
  scheduled[1].fn()
  assert.deepEqual(revoked, ['blob:wechat-qr'])
})

test('H5 rejects JSON error bodies instead of downloading them as images', async () => {
  const scheduled = []
  const revoked = []
  let elements = 0
  await assert.rejects(downloadWechatQr({
    src: 'https://example.test/miniapp.png',
    fetchImage: async () => ({ ok: true, blob: async () => new Blob(['error'], { type: 'application/json' }) }),
    documentRef: { createElement() { elements++; return {} }, body: { appendChild() {} } },
    urlApi: {
      createObjectURL() { assert.fail('invalid JSON response must not create an object URL') },
      revokeObjectURL: value => revoked.push(value)
    },
    schedule: (fn, delay) => { scheduled.push({ fn, delay }); return scheduled.length },
    cancel() {}
  }), /二维码图片无效/)
  assert.equal(elements, 0)
  assert.deepEqual(revoked, [])
  assert.deepEqual(scheduled.map(item => item.delay), [15000])
})

test('H5 fetch failures reject and always clear the timeout', async () => {
  const failure = new Error('offline')
  const scheduled = []
  const cancelled = []
  await assert.rejects(downloadWechatQr({
    src: 'https://example.test/miniapp.png',
    fetchImage: async () => { throw failure },
    documentRef: {},
    urlApi: {},
    schedule: (fn, delay) => { scheduled.push({ fn, delay }); return 42 },
    cancel: id => cancelled.push(id)
  }), error => error === failure)
  assert.deepEqual(scheduled.map(item => item.delay), [15000])
  assert.deepEqual(cancelled, [42])
})

test('empty QR sources reject before invoking native or browser APIs', async () => {
  let downloads = 0
  let saves = 0
  await assert.rejects(saveWechatQrToAlbum({
    src: '',
    downloadFile: () => { downloads++ },
    saveImageToPhotosAlbum: () => { saves++ }
  }), /二维码尚未加载/)
  assert.equal(downloads, 0)
  assert.equal(saves, 0)

  let fetches = 0
  let schedules = 0
  await assert.rejects(downloadWechatQr({
    src: '',
    fetchImage: async () => { fetches++ },
    documentRef: {},
    urlApi: {},
    schedule: () => { schedules++ }
  }), /二维码尚未加载/)
  assert.equal(fetches, 0)
  assert.equal(schedules, 0)
})
