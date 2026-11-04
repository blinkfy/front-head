import assert from 'node:assert/strict'
import { installAppWebpEncoder, tryAppUploadWebp } from '../src/utils/app-upload-webp-core.mjs'

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
function fakeIo() {
  const removed = []
  const converted = []
  return {
    removed,
    converted,
    convertLocalFileSystemURL(path) {
      converted.push(path)
      return path.startsWith('_doc/') ? `/local/${path}` : `/local/${path}`
    },
    resolveLocalFileSystemURL(path, success) {
      success({ remove(done) { removed.push(path); done?.() } })
    }
  }
}
const resultFor = (options, patch = {}) => JSON.stringify({
  path: options.destination, size: 42, width: 320, height: 240, ...patch
})

const unavailableIo = fakeIo()
installAppWebpEncoder(undefined)
assert.equal(await tryAppUploadWebp('/photo.jpg', 80, 800, false, unavailableIo), null)
assert.deepEqual(unavailableIo.converted, [])

const io = fakeIo()
let registeredOptions
installAppWebpEncoder((serialized, callback) => {
  registeredOptions = JSON.parse(serialized)
  callback(resultFor(registeredOptions))
})
const successfulPath = await tryAppUploadWebp('/photo.jpg', 120, 2048, false, io)
assert.equal(successfulPath, registeredOptions.destination)
assert.equal(registeredOptions.source, '/local//photo.jpg')
assert.equal(registeredOptions.quality, 100)
assert.equal(registeredOptions.maxSize, 1600)
assert.match(registeredOptions.destination, /^\/local\/_doc\/upload_webp_.*\.webp$/)
assert.deepEqual(io.removed, [])

let repeatedCallback
let doubleSuccessPath
installAppWebpEncoder((serialized, callback) => {
  const options = JSON.parse(serialized)
  doubleSuccessPath = options.destination
  repeatedCallback = () => callback(resultFor(options))
  callback(resultFor(options))
})
const doubleSuccess = await tryAppUploadWebp('/photo.jpg', 80, 800, false, io)
repeatedCallback()
assert.equal(doubleSuccess, doubleSuccessPath)
assert.deepEqual(io.removed, [])

const invalidIo = fakeIo()
for (const invalid of [
  options => 'not json',
  options => JSON.stringify({ path: '/wrong.webp', size: 1, width: 10, height: 10 }),
  options => resultFor(options, { size: 0 }),
  options => resultFor(options, { error: 'ENCODE_UNAVAILABLE' }),
  options => resultFor(options, { width: 0 }),
  options => resultFor(options, { width: 1700 })
]) {
  installAppWebpEncoder((serialized, callback) => callback(invalid(JSON.parse(serialized))))
  assert.equal(await tryAppUploadWebp('/photo.jpg', 80, 800, false, invalidIo), null)
}
assert.equal(invalidIo.removed.length, 2)

installAppWebpEncoder(() => { throw new Error('native bridge failed') })
assert.equal(await tryAppUploadWebp('/photo.jpg', 80, 800, false, invalidIo), null)
assert.equal(invalidIo.removed.length, 2)

const timeoutIo = fakeIo()
let lateCallback
let timeoutDestination
installAppWebpEncoder((serialized, callback) => {
  timeoutDestination = JSON.parse(serialized).destination
  lateCallback = callback
})
assert.equal(await tryAppUploadWebp('/photo.jpg', 80, 800, false, timeoutIo, 12), null)
assert.deepEqual(timeoutIo.removed, [])
lateCallback(JSON.stringify({ path: timeoutDestination, size: 1, width: 10, height: 10 }))
await pause(0)
assert.deepEqual(timeoutIo.removed, [timeoutDestination])

installAppWebpEncoder(undefined)
console.log('app upload WebP tests passed: registration, success, failure, exceptions, timeout, late callback cleanup, and duplicate success')
