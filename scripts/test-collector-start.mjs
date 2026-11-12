import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { compileScript, compileStyle, compileTemplate, parse } from '@vue/compiler-sfc'

const componentPath = new URL('../src/pages-nonTheme/collector-order-detail.vue', import.meta.url)
const source = await readFile(componentPath, 'utf8')

function preprocess(source, platform) {
  const output = [], active = [true]
  for (const line of source.split(/\r?\n/)) {
    const directive = line.match(/^\s*(?:\/\/|<!--|\/\*)\s*#(ifdef|ifndef)\s+([\w-]+)\s*(?:-->\s*|\*\/\s*)?$/)
    if (directive) {
      const matches = directive[2] === platform
      active.push(active.at(-1) && (directive[1] === 'ifdef' ? matches : !matches))
      continue
    }
    if (/^\s*(?:\/\/|<!--|\/\*)\s*#endif\s*(?:-->\s*|\*\/\s*)?$/.test(line)) {
      active.pop()
      continue
    }
    if (active.at(-1)) output.push(line)
  }
  assert.equal(active.length, 1)
  return output.join('\n')
}

for (const platform of ['H5', 'APP-PLUS', 'MP-WEIXIN']) {
  const filename = componentPath.pathname.replace(/^\//, '')
  const platformSource = source
    .replace(/<template>([\s\S]*?)<\/template>/, (_, body) => `<template>${preprocess(body, platform)}</template>`)
    .replace(/<script( setup)?>([\s\S]*?)<\/script>/, (_, setup = '', body) => `<script${setup}>${preprocess(body, platform)}</script>`)
    .replace(/<style([^>]*)>([\s\S]*?)<\/style>/g, (_, attrs, body) => `<style${attrs}>${preprocess(body, platform)}</style>`)
  const { descriptor, errors } = parse(platformSource, { filename })
  assert.deepEqual(errors, [])
  if (descriptor.script || descriptor.scriptSetup) compileScript(descriptor, { id: `collector-start-${platform}` })
  if (descriptor.template) {
    const result = platform === 'MP-WEIXIN'
      ? (await import('@dcloudio/uni-mp-compiler')).default.compile(descriptor.template.content, { filename, mode: 'module', miniProgram: { class: { array: true }, slot: { fallbackContent: true } } })
      : compileTemplate({ source: descriptor.template.content, filename, id: `collector-start-${platform}` })
    assert.deepEqual(result.errors || [], [])
  }
  for (const style of descriptor.styles) {
    const result = compileStyle({ source: style.content, filename, id: `collector-start-${platform}`, scoped: style.scoped })
    assert.deepEqual(result.errors, [])
  }
  console.log(`ok SFC ${platform}`)
}

assert.match(source, /:disabled="busy \|\| loading \|\| order\.pricingSnapshot\?\.status === \'pending\'" @click="start"/)
assert.match(source, /\{\{ order\.startWindow\?\.requiresConfirmation \? '协商后开始上门' : '开始上门' \}\}/)
assert.match(source, /:disabled="busy \|\| loading \|\| order\.pricingSnapshot\?\.status === \'pending\' \|\| !startReason\.trim\(\)" @click="confirmNegotiatedStart"/)

const script = source.match(/<script>([\s\S]*?)<\/script>/)?.[1]
assert.ok(script, 'component has a regular script block')
const executable = script
  .replace(/^import .*\r?\n/gm, '')
  .replace('export default {', 'globalThis.component = {')
const calls = { orders: [], actions: [], toasts: [] }
const globals = {
  RecyclingShell: {},
  bookingUnitText: unit => unit || 'kg', bookingQuantityText: () => '', bookingPhotoUrl: url => url,
  collectorOrder: async id => {
    calls.orders.push(id)
    if (globals.failLoad) throw new Error('refresh failed')
    return globals.nextOrder
  },
  collectorAction: async (...args) => calls.actions.push(args),
  bookingStatusText: status => status,
  openBookingChat() {}, openPlatformSupport() {},
  mutationData: (writes, action, extra) => ({ action, ...extra }),
  uni: { showToast: value => calls.toasts.push(value) }
}
const context = vm.createContext(globals)
vm.runInContext(executable, context)
const component = context.component
const state = {
  ...component.data(),
  id: '42',
  ...component.methods,
  async act(action, extra) { calls.actions.push([this.id, action, extra]) }
}

globals.nextOrder = { status: 'confirmed', version: 7, startWindow: { requiresConfirmation: false } }
await component.methods.start.call(state)
assert.deepEqual(calls.orders, ['42'], 'start refreshes the order first')
assert.deepEqual(calls.actions, [['42', 'start', undefined]], 'an in-window start dispatches after refresh')
assert.equal(state.showStartAgreement, false)
console.log('ok in-window start refreshes and dispatches start')

calls.orders.length = 0
calls.actions.length = 0
globals.nextOrder = { status: 'confirmed', version: 8, startWindow: { requiresConfirmation: true } }
await component.methods.start.call(state)
assert.deepEqual(calls.orders, ['42'])
assert.equal(state.showStartAgreement, true, 'out-of-window start opens the agreement section')
assert.deepEqual(calls.actions, [], 'out-of-window start does not dispatch start')
console.log('ok out-of-window start opens agreement without dispatch')

calls.actions.length = 0
state.startReason = '   '
component.methods.confirmNegotiatedStart.call(state)
assert.deepEqual(calls.actions, [], 'empty agreement reason is rejected')
assert.equal(calls.toasts.at(-1).title, '请填写协商说明')
state.startReason = '用户同意提前到店'
component.methods.confirmNegotiatedStart.call(state)
assert.equal(calls.actions.length, 1)
assert.deepEqual(calls.actions[0].slice(0, 2), ['42', 'start'])
assert.equal(calls.actions[0][2].confirmedWithCustomer, true)
assert.equal(calls.actions[0][2].reason, '用户同意提前到店')
console.log('ok negotiated confirmation requires a reason and sends confirmation payload')

calls.actions.length = 0
calls.orders.length = 0
globals.failLoad = true
await component.methods.start.call(state)
assert.deepEqual(calls.orders, ['42'])
assert.deepEqual(calls.actions, [], 'failed refresh cannot start the order')
assert.equal(state.order, null)
assert.match(state.error, /refresh failed/)
globals.failLoad = false
console.log('ok failed refresh prevents starting')

globals.nextOrder = { status: 'picking', version: 9 }
state.showStartAgreement = true
state.startReason = '旧草稿'
await component.methods.load.call(state)
assert.equal(state.showStartAgreement, false, 'non-confirmed refresh hides agreement')
assert.equal(state.startReason, '', 'non-confirmed refresh clears draft')
console.log('ok non-confirmed refresh clears agreement draft')
