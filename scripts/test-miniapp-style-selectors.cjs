const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { initPreContext, preCss } = require('@dcloudio/uni-cli-shared')

const checker = fs.readFileSync(path.join(__dirname, 'check-miniapp-style-selectors.js'), 'utf8')
function check(filename, contents) {
  const output = [], state = {}
  const fakeFs = {
    readdirSync: () => [{ name: filename, isDirectory: () => false }],
    readFileSync: () => contents
  }
  vm.runInNewContext(checker, {
    __dirname, process: state,
    require: name => name === 'node:fs' ? fakeFs : require(name),
    console: { log: value => output.push(value), error: value => output.push(value) }
  })
  return { exitCode: state.exitCode || 0, output: output.join('\n') }
}

assert.equal(check('browser.css', '/* #ifdef H5 */\n.header strong { color: red; }\n/* #endif */').exitCode, 0)
assert.equal(check('shared.css', '.header strong { color: red; }').exitCode, 1, 'shared unsupported tags are still rejected')
assert.equal(check('native.css', '/* #ifdef APP-PLUS */\np { color: red; }\n/* #endif */').exitCode, 0)
assert.equal(check('weixin.css', '/* #ifdef MP-WEIXIN */\np { color: red; }\n/* #endif */').exitCode, 1)
assert.equal(check('not-web.css', '/* #ifndef H5 */\np { color: red; }\n/* #endif */').exitCode, 1)
const nested = '/* #ifdef MP */\n/* #ifndef MP-WEIXIN */\np { color: red; }\n/* #endif */\n.safe { color: green; }\n/* #endif */'
assert.equal(check('nested.scss', nested).exitCode, 0, 'nested platform rules match the compiler')
const vue = '<template><view /></template>\n<style>\n/* #ifdef H5 */\np { color: red; }\n/* #endif */\n.shared strong { color: blue; }\n</style>'
const result = check('example.vue', vue)
assert.equal(result.exitCode, 1)
assert.match(result.output, /example\.vue:6 \[strong\]/, 'diagnostics keep original file line numbers')
assert.doesNotMatch(result.output, /\[p\]/)

const cameraCss = fs.readFileSync(path.join(__dirname, '../src/utils/identity-camera-h5.css'), 'utf8')
initPreContext('mp-weixin')
assert.equal(preCss(cameraCss).trim(), '', 'browser camera CSS is excluded from mini-program output')
initPreContext('h5')
assert.match(preCss(cameraCss), /\.identity-camera-header strong/, 'H5 retains the original camera styling')
console.log('PASS: mini-program style platform filtering and diagnostics')
