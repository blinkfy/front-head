import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { preserveBinDescription, normalizeBinPreReview, normalizeBinReviewPreview } from '../src/utils/bin-pre-review.mjs'

const require = createRequire(import.meta.url)
const backend = require('../../back-end/utils/trashBinDescription.js')
const original = '智能桶自动分类\n位置：长江西路，青岛西海岸新区，黄岛区，青岛市，山东省，中国石油大学工训中心'
const addition = '智能分类垃圾桶，配备触摸屏操作界面'
const addressSource = '长江西路, 莲花山社区, 长江路街道, 青岛西海岸新区, 黄岛区, 青岛市, 山东省, 266580, 中国'
const addressAdvice = '青岛西海岸新区长江路街道莲花山社区长江西路附近，位于体育馆周边区域。照片显示为绿色外观的智能回收设备，带有屏幕和投放口，可见“绿色环保”字样及回收标识。'
const mixedAddressAdvice = '青岛西海岸新区莲花山社区附近的长江西路，可见绿色外观的智能回收设备，带有屏幕和投放口。'
for (const [source, advice, expected] of [
  [addressSource, addressAdvice, addressAdvice],
  [addressSource, mixedAddressAdvice, mixedAddressAdvice],
  [original, addition, addition],
  ['东门便利店旁二楼有4个桶', addition, addition],
  ['原'.repeat(199), addition, addition],
  ['原'.repeat(180), '补'.repeat(19), '补'.repeat(19)],
  [original, `${original}\n${addition}`, `${original}\n${addition}`],
  [original, '智能桶自动分类', '智能桶自动分类'],
  [original, `  ${addition}  `, addition],
  [original, '补'.repeat(250), '补'.repeat(200)],
  [original, '', '']
]) {
  assert.equal(preserveBinDescription(source, advice), expected)
  assert.equal(backend.preserveBinDescription(source, advice), expected)
  if (expected) assert.equal(preserveBinDescription(source, expected), expected)
}
const suggestions = { description: addition, summary: '补充设备特征' }
for (const normalize of [normalizeBinPreReview, normalizeBinReviewPreview]) {
  const result = normalize({ supported: true, enabled: true, passed: true, suggestions }, original)
  assert.equal(result.reason, '')
  assert.equal(result.suggestions.description, addition)
  assert.equal(normalize({ supported: true, enabled: true, passed: true, reason: '旧服务通过原因', suggestions }).reason, '')
}
assert.equal(normalizeBinPreReview({ supported: true, enabled: true, passed: false, suggestions }).reason, '')
assert.equal(normalizeBinPreReview({ supported: true, enabled: true, passed: false, reason: '照片不是垃圾桶', suggestions }).reason, '照片不是垃圾桶')

const source = readFileSync(new URL('../src/components/AddTrashBinModal.vue', import.meta.url), 'utf8')
assert.ok(source.includes("reviewResult.reason || '请核对照片与填写信息后重试。'"))
assert.ok(source.includes('v-if="!reviewPreview.passed && reviewPreview.reason"'))
const { descriptor, errors } = parse(source)
assert.deepEqual(errors, [])
const script = compileScript(descriptor, { id: 'bin-review-test' })
const template = compileTemplate({ source: descriptor.template.content, filename: 'AddTrashBinModal.vue', id: 'bin-review-test', compilerOptions: { bindingMetadata: script.bindings } })
assert.deepEqual(template.errors, [])
console.log('PASS: description preservation, frontend/backend parity, verdict reasons and modal SFC')
