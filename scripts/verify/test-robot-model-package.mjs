import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import { transform } from 'esbuild'

const root = new URL('../../', import.meta.url)
const modulePath = new URL('src/components/recognition/smart-sort-robot-mp.mjs', root)
const moduleSource = await readFile(modulePath, 'utf8')
const transformed = await transform(moduleSource, { format: 'cjs', target: 'es2020', sourcefile: 'smart-sort-robot-mp.mjs' })

function loadRobotPackageModule(requireImpl) {
  const module = { exports: {} }
  vm.runInNewContext(transformed.code, { module, exports: module.exports, require: requireImpl, Promise, Error }, {
    filename: 'smart-sort-robot-mp.cjs'
  })
  return module.exports
}

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

// Exercise the exact dynamic require generated from the module, then resolve it
// from the output directory used by mini-program builds.
const packageFile = new URL('src/pages.json', root)
const pagesSource = (await readFile(packageFile, 'utf8')).replace(/^\s*\/\/.*$/gm, '')
const pages = JSON.parse(pagesSource)
const assetsPluginSource = await readFile(new URL('scripts/build/smart-sort-robot-assets.mjs', root), 'utf8')
const packageNameMatch = moduleSource.match(/export\s+const\s+ROBOT_MP_PACKAGE_NAME\s*=\s*(['"])([^'"]+)\1/)
assert.ok(packageNameMatch, 'robot package name is exported by the module')
const packageName = packageNameMatch[2]
assert.ok(assetsPluginSource.includes('import { ROBOT_MP_PACKAGE_NAME } from'), 'asset plugin imports the module package name')
assert.ok(assetsPluginSource.includes('const xrRoot = `${ROBOT_MP_PACKAGE_NAME}/static/robot_3d`'), 'asset plugin derives xrRoot from the module package name')
assert.ok(assetsPluginSource.includes('fileName: `${xrRoot}/package-ready.js`'), 'asset plugin emits the package-ready marker under xrRoot')
assert.ok(pages.subPackages?.some(item => item.root === packageName), 'pages.json declares the robot package root')

let load = deferred()
let requireCalls = 0
let requestedPath
const packageModule = loadRobotPackageModule((id, resolve, reject) => {
  requireCalls++
  requestedPath = id
  load.promise.then(resolve, reject)
})
const first = packageModule.ensureRobotModelPackage()
const concurrent = packageModule.ensureRobotModelPackage()
assert.strictEqual(concurrent, first, 'concurrent callers share the same in-flight promise')
assert.equal(requireCalls, 1, 'concurrent callers issue one async require')
const outputDirectory = 'components/recognition'
const resolvedMarker = path.posix.normalize(path.posix.join(outputDirectory, requestedPath))
assert.equal(resolvedMarker, `${packageName}/static/robot_3d/package-ready.js`, 'async require resolves from the actual output directory to the emitted marker')
load.resolve({ ready: true })
assert.deepEqual(await first, { ready: true }, 'successful package load resolves to the marker module')

// Platform resource errors become useful Error messages and clear the shared promise.
load = deferred()
requireCalls = 0
const retryModule = loadRobotPackageModule((id, resolve, reject) => {
  requireCalls++
  if (requireCalls === 1) reject({ errMsg: 'subpackage not found' })
  else resolve({ ready: true })
})
await assert.rejects(retryModule.ensureRobotModelPackage(), error => {
  assert.ok(error instanceof Error)
  assert.equal(error.message, 'subpackage not found')
  return true
}, 'resource error errMsg is preserved as an Error message')
assert.deepEqual(await retryModule.ensureRobotModelPackage(), { ready: true }, 'a failed async package request can be retried')
assert.equal(requireCalls, 2, 'retry performs a new async require')

// A synchronous throw while starting the native async require must also reset state.
let syncCalls = 0
const syncThrowModule = loadRobotPackageModule((_id, resolve) => {
  syncCalls++
  if (syncCalls === 1) throw new Error('native require unavailable')
  resolve({ ready: true })
})
await assert.rejects(syncThrowModule.ensureRobotModelPackage(), /native require unavailable/)
assert.deepEqual(await syncThrowModule.ensureRobotModelPackage(), { ready: true }, 'a synchronous require throw does not poison future attempts')
assert.equal(syncCalls, 2, 'synchronous throw is followed by a fresh native require')

const robotViewSource = await readFile(new URL('src/components/recognition/SmartSortRobot3D.vue', root), 'utf8')
assert.ok(robotViewSource.includes("loadingStage.value = 'package-loading'"), 'package preparation reports its own loading stage')
assert.ok(robotViewSource.includes("if (!import.meta.env.DEV) console.warn('[SmartSortRobot3D] 静态图标回退:', { stage: loadingStage.value, message: fallbackReason.value })"),
  'production fallback logs its stage and reason once for device diagnostics')

console.log('robot model package path and retry checks passed')
