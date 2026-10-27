import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pagePath = path.join(root, 'src/pages-nonTheme/edit-profile.vue')
const handlerPath = path.join(root, 'src/utils/avatar-handler.js')
const iconPath = path.join(root, 'src/static/icons/restore_128.webp.png')
const [page, handler] = await Promise.all([
  readFile(pagePath, 'utf8'),
  readFile(handlerPath, 'utf8')
])

const canvasIdMatch = page.match(/<canvas\b[^>]*\bcanvas-id=["']([^"']+)["']/)
assert.ok(canvasIdMatch, 'edit-profile must declare a canvas-id for avatar processing')
const declaredCanvasId = canvasIdMatch[1]
const defaultCanvasIdMatch = handler.match(/const canvasId = options\.canvasId \|\| ['"]([^'"]+)['"]\s*;?/)
assert.ok(defaultCanvasIdMatch, 'avatar handler must have a native canvas ID fallback')
assert.equal(declaredCanvasId, defaultCanvasIdMatch[1], 'edit-profile canvas-id must match the avatar handler canvas ID')

let contextCanvasId
let exportCanvasId
const fakeCanvas = {
  clearRect() {},
  drawImage() {},
  draw(_reserve, callback) { callback() }
}
const uni = {
  createCanvasContext(id) {
    contextCanvasId = id
    return fakeCanvas
  },
  canvasToTempFilePath(options) {
    exportCanvasId = options.canvasId
    options.success({ tempFilePath: '/mock/avatar.png' })
  },
  getFileSystemManager() {
    return { readFile(options) { options.success({ data: 'Zm9v' }) } }
  }
}

const executableHandler = handler.replace(/^export\s+/gm, '') +
  '\nglobalThis.__handleNativeImage = handleNativeImage;'
const context = vm.createContext({ uni, console })
vm.runInContext(executableHandler, context)
await new Promise((resolve, reject) => {
  context.__handleNativeImage('/mock/source.png', { width: 32, height: 32 }, 64, 64, resolve, reject)
})
assert.equal(contextCanvasId, declaredCanvasId, 'native canvas context must use the page canvas-id')
assert.equal(exportCanvasId, declaredCanvasId, 'canvas export must use the page canvas-id')

assert.ok(existsSync(iconPath), 'the original restore_128 icon path must resolve to a file')
console.log('Miniapp canvas ID and restore icon path checks passed.')
