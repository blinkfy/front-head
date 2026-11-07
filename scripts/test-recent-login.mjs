import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'

const file = new URL('../src/pages-nonTheme/account-security.vue', import.meta.url)
const source = await readFile(file, 'utf8')

function conditionalSource(input, target) {
  const stack = [{ parent: true, condition: true, active: true }]
  const lines = []
  for (const line of input.split(/\r?\n/)) {
    const directive = line.match(/^\s*(?:\/\/\s*#(ifdef|ifndef|else|endif)\s*(.*?)\s*|<!--\s*#(ifdef|ifndef|else|endif)\s*(.*?)\s*-->)\s*$/)
    if (!directive) { if (stack.at(-1).active) lines.push(line); continue }
    const kind = directive[1] || directive[3]
    const expression = directive[2] || directive[4] || ''
    if (kind === 'ifdef' || kind === 'ifndef') {
      const hasTarget = expression.split(/\s+\|\|\s+/).includes(target)
      const condition = kind === 'ifdef' ? hasTarget : !hasTarget
      const parent = stack.at(-1).active
      stack.push({ parent, condition, active: parent && condition })
    } else if (kind === 'else') {
      const frame = stack.at(-1)
      frame.active = frame.parent && !frame.condition
    } else if (kind === 'endif') {
      assert.ok(stack.length > 1, 'no unmatched #endif')
      stack.pop()
    }
  }
  assert.equal(stack.length, 1, 'conditional compilation blocks balance')
  return lines.join('\n')
}

function extractFunction(input, name) {
  const start = input.indexOf(`async function ${name}(`)
  assert.notEqual(start, -1, `${name} exists`)
  const brace = input.indexOf('{', start)
  let depth = 0
  for (let i = brace; i < input.length; i++) {
    if (input[i] === '{') depth++
    else if (input[i] === '}' && --depth === 0) return input.slice(start, i + 1)
  }
  assert.fail(`${name} closes`)
}

const descriptor = parse(source, { filename: file.pathname }).descriptor
for (const target of ['APP-PLUS', 'H5', 'MP-WEIXIN']) {
  const parsed = parse(source, { filename: file.pathname }).descriptor
  parsed.scriptSetup.content = conditionalSource(descriptor.scriptSetup.content, target)
  const script = compileScript(parsed, { id: `recent-login-${target}` })
  const template = compileTemplate({ source: conditionalSource(descriptor.template.content, target), filename: file.pathname, id: `recent-login-${target}` })
  assert.ok(script.content.length > 0, `${target} script compiles`)
  assert.deepEqual(template.errors, [], `${target} template compiles`)
  console.log(`PASS ${target} SFC compile`)
}

const testSource = conditionalSource(descriptor.scriptSetup.content, 'H5')
const fnSource = extractFunction(testSource, 'loadRecentLogin')

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function instance(token, getPreviousLogin) {
  const context = { uni: { getStorageSync: key => key === 'token' ? token.value : null }, recentLogin: { value: { location: 'stale' } }, getPreviousLogin }
  vm.createContext(context)
  vm.runInContext(`${fnSource}; globalThis.run = loadRecentLogin`, context)
  return context
}

{
  const token = { value: 'account-A' }, pending = deferred()
  const page = instance(token, () => pending.promise)
  const loading = page.run()
  token.value = 'account-B'
  pending.resolve({ code: 0, data: { loggedInAt: '2026-11-06T05:00:00Z', location: 'A secret region', method: 'password' } })
  await loading
  assert.equal(page.recentLogin.value, null, 'response after token change is discarded')
  console.log('PASS token change discards old account response')
}
{
  const token = { value: 'account-B' }, oldRequest = deferred(), newRequest = deferred()
  let call = 0
  const page = instance(token, () => (++call === 1 ? oldRequest.promise : newRequest.promise))
  const oldLoad = page.run()
  token.value = 'account-C'
  const newLoad = page.run()
  newRequest.resolve({ code: 0, data: { loggedInAt: '2026-11-06T06:00:00Z', location: 'Current account', method: 'wechat' } })
  await newLoad
  oldRequest.resolve({ code: 0, data: { loggedInAt: '2026-11-06T05:00:00Z', location: 'Previous account', method: 'password' } })
  await oldLoad
  assert.equal(page.recentLogin.value.location, 'Current account', 'late prior account response cannot overwrite current account')
  console.log('PASS delayed response cannot overwrite newer account')
}
{
  const token = { value: '' }
  const page = instance(token, async () => ({ code: 0, data: { loggedInAt: '2026-11-06T05:00:00Z', location: 'Must stay hidden' } }))
  await page.run()
  assert.equal(page.recentLogin.value, null, 'empty token never displays recent login')
  console.log('PASS empty token keeps optional record hidden')
}
{
  const token = { value: 'account-D' }
  const page = instance(token, async () => { throw new Error('mock API failure') })
  await page.run()
  assert.equal(page.recentLogin.value, null, 'failed request leaves record hidden')
  console.log('PASS API failure leaves record hidden')
}

{
  const page = instance({ value: 'first-login-account' }, async () => ({ code: 0, data: null }))
  await page.run()
  assert.equal(page.recentLogin.value, null, 'first login has no previous record to display')
  assert.match(source, />上一次登录</)
  console.log('PASS first login hides previous-login card')
}
