import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { relocateMpSubpackageModules } from '../build/mp-subpackage-modules.mjs'

const output = await fs.mkdtemp(path.join(os.tmpdir(), 'ftx-mp-modules-'))
const roots = ['pages-nonTheme', 'pages-admin']
const entry = 'utils/realtime/realtime-route.js'
const dependency = 'utils/location-error.js'
const cache = new Map()
const relocate = () => relocateMpSubpackageModules(output, cache)
const copy = (root, file) => `${root}/__shared/${file}`
const page = root => `${root}/index.js`
const pageSource = `module.exports = require("../${entry}")`
const entrySource = 'module.exports = require("../location-error.js")'

async function write(name, source) {
  const file = path.join(output, name)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, source)
}

const read = name => fs.readFile(path.join(output, name), 'utf8')
const isMissing = name => assert.rejects(read(name), { code: 'ENOENT' })

async function checkCopy(root, value) {
  assert.equal(await read(page(root)), `module.exports = require("./__shared/${entry}")`)
  assert.equal(await read(copy(root, entry)), entrySource)
  assert.equal(await read(copy(root, dependency)), value)
}

try {
  await write('app.json', JSON.stringify({ subPackages: roots.map(root => ({ root })) }))
  await write(entry, entrySource)
  await write(dependency, 'module.exports = 1')
  await write(page(roots[0]), pageSource)

  await relocate()
  await relocate()
  await checkCopy(roots[0], 'module.exports = 1')
  await isMissing(entry)
  await isMissing(dependency)

  // A partial rebuild re-emits a changed module and adds a consumer in a second package.
  await write(dependency, 'module.exports = 2')
  await write(page(roots[1]), pageSource)
  await relocate()
  for (const root of roots) await checkCopy(root, 'module.exports = 2')
  await isMissing(dependency)

  // A main-package consumer must restore both modules and remove obsolete copies.
  const appSource = `require("./${entry}")`
  await write('app.js', appSource)
  await relocate()
  assert.equal(await read('app.js'), appSource)
  assert.equal(await read(entry), entrySource)
  assert.equal(await read(dependency), 'module.exports = 2')
  for (const root of roots) {
    assert.equal(await read(page(root)), pageSource)
    await isMissing(copy(root, entry))
    await isMissing(copy(root, dependency))
  }
  console.log('WeChat module relocation passes repeat builds, partial re-emits and main-package fallback.')
} finally {
  await fs.rm(output, { recursive: true, force: true })
}
