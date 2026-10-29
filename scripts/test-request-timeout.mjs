import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { appendQueryParams, isDatabaseHealthEndpoint } from '../src/api/request-utils.mjs'

let captured
const source = (await readFile(new URL('../src/api/index.js', import.meta.url), 'utf8'))
  .replace(/^import [\s\S]*? from '[^']+'\r?\n/gm, '')
  .replace(/export default request\s*$/, 'globalThis.request = request')
const context = vm.createContext({
  baseUrl: 'https://api.example.test', appendQueryParams, isDatabaseHealthEndpoint,
  uni: {
    getStorageSync: () => '',
    request: options => { captured = options; options.success({ statusCode: 200, data: { code: 0 } }) }
  }
})
vm.runInContext(source, context)
for (const timeout of [8000, 12000]) {
  await context.request({ url: '/api/device/wechat-qr/resolve-image', timeout, silent: true })
  assert.equal(captured.timeout, timeout, 'QR timeout must reach uni.request')
}
for (const timeout of [undefined, null, 0, -1, Infinity, NaN, '12000']) {
  await context.request({ url: '/api/items', timeout })
  assert.equal(Object.hasOwn(captured, 'timeout'), false, 'retain platform default when timeout is absent or invalid')
}
console.log('PASS QR request timeout forwarding and unchanged default for other requests (9 cases)')
