import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'

const require = createRequire(import.meta.url)
const { preprocess } = require('@dcloudio/uni-cli-shared/lib/preprocess')
const file = '../../src/pages-admin/service-setting.vue'
const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8')
const flags = {
  H5: { H5: true },
  'MP-WEIXIN': { MP: true, MP_WEIXIN: true },
  'APP-PLUS': { APP: true, APP_PLUS: true }
}

function preprocessSfc(target) {
  const { descriptor, errors } = parse(source, { filename: file })
  assert.equal(errors.length, 0, `${target}: SFC parses`)
  const processed = {
    ...descriptor,
    scriptSetup: {
      ...descriptor.scriptSetup,
      content: preprocess(descriptor.scriptSetup.content, flags[target], 'js')
    },
    template: {
      ...descriptor.template,
      content: preprocess(descriptor.template.content, flags[target], 'html')
    }
  }
  const compiled = compileScript(processed, { id: `llm-provider-${target}` })
  const template = compileTemplate({ source: processed.template.content, filename: file,
    id: `llm-provider-${target}`, compilerOptions: { bindingMetadata: compiled.bindings } })
  assert.equal(template.errors.length, 0, `${target}: template compiles`)
  return processed.scriptSetup.content
}

function setup() {
  const requests = []
  const source = preprocessSfc('H5').replace(/^import .*$/gm, '').replace(/\bexport /g, '')
  const context = {
    ref: value => ({ value }),
    reactive: value => value,
    computed: getter => ({ get value() { return getter() } }),
    onBeforeUnmount() {}, onMounted() {}, onShow() {}, onHide() {},
    applyStoredTheme() {}, bindThemeStorageSync: () => () => {},
    userinfo: async () => ({ data: {} }), baseUrl: 'https://local.test',
    applyCommunityChatSettings() {},
    uni: {
      getStorageSync: () => 'test-token',
      request: options => requests.push(options),
      navigateBack() {}, reLaunch() {}, navigateTo() {}, setStorageSync() {}
    }
  }
  vm.createContext(context)
  vm.runInContext(`${source}\nglobalThis.api = { form, llmCredentials, providerOptions, providerIndex,
    qwenThinkingEffortOptions, deepseekThinkingEffortOptions, thinkingEffortOptions, thinkingEffortIndex,
    onProviderChange, onThinkingEffortChange, loadSettings, saveSettings, resetForm, statusText, loading }`, context)
  return { ...context.api, requests }
}

for (const target of Object.keys(flags)) preprocessSfc(target)

const state = setup()
state.loadSettings()
assert.equal(state.requests.length, 1)
assert.equal(state.requests[0].method, 'GET')
state.requests[0].success({ data: { code: 0, data: {
  provider: 'qwen', deepseekModel: 'deepseek-v4-pro', llmCredentials: { qwen: true, deepseek: false },
  allowWebRegistration: true, aiEnabled: true, communityChatEnabled: false,
  detectorMode: 'ai', model: 'qwen-custom-model', recommendAlgorithm: 'deep',
  include3d: false, enableThinking: true, qwenThinkingEffort: 'medium', deepseekThinkingEffort: 'low',
  enableUpcyclingImage: false, skipUnrecommendedUpcyclingImage: false
} } })
state.requests[0].complete()
assert.equal(state.form.provider, 'qwen')
assert.equal(state.form.model, 'qwen-custom-model')
assert.equal(state.form.deepseekModel, 'deepseek-v4-pro')
assert.equal(state.llmCredentials.qwen, true)
assert.equal(state.form.qwenThinkingEffort, 'medium')
assert.equal(state.form.deepseekThinkingEffort, 'low')
assert.ok(source.includes(':disabled="!form.enableThinking"'), 'effort picker is disabled when thinking is off')
assert.equal(state.qwenThinkingEffortOptions.map(option => option.value).join(','), 'auto,low,medium,high')
assert.equal(state.deepseekThinkingEffortOptions.map(option => option.value).join(','), 'low,high,max')

state.onProviderChange({ detail: { value: '1' } })
assert.equal(state.form.provider, 'deepseek')
assert.equal(state.thinkingEffortOptions.value, state.deepseekThinkingEffortOptions)
assert.equal(state.thinkingEffortIndex.value, 0)
state.onThinkingEffortChange({ detail: { value: '2' } })
assert.equal(state.form.deepseekThinkingEffort, 'max')
assert.equal(state.form.qwenThinkingEffort, 'medium', 'changing provider-specific effort does not overwrite Qwen effort')
state.form.enableThinking = false
assert.equal(state.form.deepseekThinkingEffort, 'max', 'turning thinking off retains selected effort')
assert.equal(state.form.qwenThinkingEffort, 'medium', 'turning thinking off retains the other provider effort')
state.form.enableThinking = true
state.form.deepseekModel = 'deepseek-v4-pro-custom'
state.saveSettings()
assert.equal(state.requests.length, 2)
assert.equal(state.requests[1].method, 'PUT')
const payload = state.requests[1].data
assert.equal(payload.provider, 'deepseek')
assert.equal(payload.deepseekModel, 'deepseek-v4-pro-custom')
assert.equal(payload.model, 'qwen-custom-model', 'switching provider preserves the Qwen model')
assert.equal(payload.qwenThinkingEffort, 'medium')
assert.equal(payload.deepseekThinkingEffort, 'max')
assert.equal(Object.hasOwn(payload, 'thinkingBudget'), false, 'server environment controls the token budget')
assert.deepEqual({ ...payload }, {
  provider: 'deepseek', deepseekModel: 'deepseek-v4-pro-custom', allowWebRegistration: true,
  aiEnabled: true, communityChatEnabled: false, detectorMode: 'ai', model: 'qwen-custom-model',
  recommendAlgorithm: 'deep', include3d: false, enableThinking: true,
  qwenThinkingEffort: 'medium', deepseekThinkingEffort: 'max',
  enableUpcyclingImage: false, skipUnrecommendedUpcyclingImage: false
}, 'provider save retains every existing setting')
state.requests[1].success({ data: { code: 0, data: payload } })
state.requests[1].complete()

state.onProviderChange({ detail: { value: '0' } })
assert.equal(state.form.provider, 'qwen')
assert.equal(state.form.model, 'qwen-custom-model')
assert.equal(state.form.qwenThinkingEffort, 'medium', 'switching back preserves Qwen effort')
state.form.model = 'qwen-model-after-switch'
state.onProviderChange({ detail: { value: '1' } })
assert.equal(state.form.deepseekModel, 'deepseek-v4-pro-custom', 'switching models keeps the DeepSeek model')
assert.equal(state.form.deepseekThinkingEffort, 'max', 'switching back preserves DeepSeek effort')
state.resetForm()
assert.equal(state.form.provider, 'qwen')
assert.equal(state.form.deepseekModel, 'deepseek-flash')
assert.equal(state.form.model, 'qwen3.5-flash')
assert.equal(state.form.enableThinking, false)
assert.equal(state.form.qwenThinkingEffort, 'auto')
assert.equal(state.form.deepseekThinkingEffort, 'high')
assert.equal(state.form.communityChatEnabled, true)

console.log('PASS LLM provider settings: H5/MP-WEIXIN/APP preprocessing, settings read, provider/model/effort retention, budget-free save payload and reset')
