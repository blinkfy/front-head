import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { buildChatQuickActions } from '../src/pages-nonTheme/utils/ai-chat-prompts.mjs'

const require = createRequire(import.meta.url)
const { parse, compileScript, compileTemplate, compileStyle } = require('@vue/compiler-sfc')
const page = fs.readFileSync(new URL('../src/pages-nonTheme/ai-chat.vue', import.meta.url), 'utf8')
const action = (items, id) => items.find(item => item.id === id)

const pointHistory = [{ role: 'assistant', disposalPoints: [{ id: '17' }] }]
const pointActions = buildChatQuickActions(pointHistory)
assert(action(pointActions, 'report'), 'recent assistant point context exposes the point feedback shortcut')
assert.equal(action(pointActions, 'report').prompt, '我要反馈前面投放点的问题。', 'feedback wording comes from the fixed product catalog')
assert.equal(action(buildChatQuickActions([{ role: 'assistant', content: 'AI: 点位反馈' }]), 'report'), undefined, 'AI text alone cannot create a point action')
assert.equal(action(buildChatQuickActions([...pointHistory, ...Array.from({ length: 10 }, () => ({ role: 'user', content: '普通问题' }))]), 'report'), undefined, 'only the last ten structured messages are inspected')

const recognitionActions = buildChatQuickActions([{ role: 'assistant', businessCards: [{ type: 'recognition', id: '1' }] }])
for (const id of ['checklist', 'again', 'basis', 'steps', 'compare']) assert(action(recognitionActions, id), `recognition context exposes ${id}`)
const unknownActions = buildChatQuickActions([{ role: 'assistant', content: '无点位、无识别记录' }], [{ id: 'model-only', prompt: 'AI建议的分类项' }])
for (const id of ['report', 'basis', 'steps', 'compare', 'post']) assert.equal(action(unknownActions, id), undefined, `unknown context hides ${id}`)
assert(!unknownActions.some(item => item.prompt === 'AI建议的分类项'), 'caller supplied AI suggestions are ignored')
const reportRank = buildChatQuickActions([...pointHistory, { role: 'user', content: '这个投放点已撤走，位置不准，我要反馈。' }]).map(item => item.id)
assert.equal(reportRank[0], 'report', 'recent point feedback language ranks the feedback shortcut first')
const productRank = buildChatQuickActions([{ role: 'user', content: '积分商品商城兑换积分商品' }]).map(item => item.id)
assert.equal(productRank[0], 'products', 'frequent product and points language ranks the product shortcut first')

// Run the actual page computed lists and prompt handler; tapping fills the composer only.
const quickStart = page.indexOf('const showAllQuickActions = ref(false)')
const quickEnd = page.indexOf('\nconst conversationCount', quickStart)
const promptStart = page.indexOf('function applyQuickPrompt(prompt) {')
const promptEnd = page.indexOf('\n// ─── 深度思考切换', promptStart)
const pageContext = {
  ref: value => ({ value }),
  computed: getter => ({ get value() { return getter() } }),
  messageList: { value: pointHistory },
  buildChatQuickActions,
  isStreaming: { value: false }, imagePreparing: { value: false }, recoveringRun: { value: '' }, promptText: { value: '' },
  sendCalls: 0, onSend() { this.sendCalls++ }
}
vm.createContext(pageContext)
vm.runInContext(`${page.slice(quickStart, quickEnd)}\n${page.slice(promptStart, promptEnd)}\nglobalThis.actions = quickActions; globalThis.visible = visibleQuickActions; globalThis.showAll = showAllQuickActions; globalThis.apply = applyQuickPrompt`, pageContext)
assert.equal(pageContext.visible.value.length, 6, 'page shows six quick actions by default')
assert(pageContext.actions.value.length > 6, 'more actions are available')
pageContext.showAll.value = true
assert.equal(pageContext.visible.value.length, pageContext.actions.value.length, 'more reveals the full fixed catalog')
pageContext.apply('我要反馈前面投放点的问题。')
assert.equal(pageContext.promptText.value, '我要反馈前面投放点的问题。')
assert.equal(pageContext.sendCalls, 0, 'quick action does not send automatically')
assert(page.includes('@tap="applyQuickPrompt(item.prompt)"'))
assert(!page.includes('@tap="onSend(item.prompt)"'))

function unipreprocess(source, platform) {
  const stack = [true]
  return source.split('\n').filter(line => {
    const directive = /(?:\/\/|\/\*|<!--)\s*#(ifdef|ifndef)\s+([\w-]+)\s*(?:\*\/|-->)?/.exec(line)
    if (directive) { const matches = directive[2] === platform || (directive[2] === 'MP' && platform.startsWith('MP-')); stack.push(stack.at(-1) && (directive[1] === 'ifdef' ? matches : !matches)); return false }
    if (/(?:\/\/|\/\*|<!--)\s*#endif\s*(?:\*\/|-->)?/.test(line)) { stack.pop(); return false }
    return stack.at(-1)
  }).join('\n')
}
for (const platform of ['H5', 'MP-WEIXIN', 'APP-PLUS']) {
  const { descriptor, errors } = parse(unipreprocess(page, platform), { filename: 'ai-chat.vue' })
  assert.deepEqual(errors, [], `${platform} SFC parse`)
  const compiled = compileScript(descriptor, { id: `prompts-${platform}` })
  const template = compileTemplate({ source: descriptor.template.content, filename: 'ai-chat.vue', id: `prompts-${platform}`, compilerOptions: { bindingMetadata: compiled.bindings } })
  assert.deepEqual(template.errors, [], `${platform} template compile`)
  for (const style of descriptor.styles) assert.deepEqual(compileStyle({ source: style.content, filename: 'ai-chat.vue', id: `prompts-${platform}`, scoped: style.scoped }).errors, [], `${platform} style compile`)
}

console.log('ai-chat prompt checks passed: fixed contextual catalog, composer-only actions, three-platform compile')
