import assert from 'node:assert/strict'
import { mergeBinLocation, validBinCoordinates } from '../src/utils/bin-contribution.mjs'

const first = mergeBinLocation('东门右侧，可回收物', '', '阳光小区东门')
assert.equal(first.description, '东门右侧，可回收物\n位置：阳光小区东门')
const next = mergeBinLocation(first.description, first.automatic, '阳光小区北门')
assert.equal(next.description, '东门右侧，可回收物\n位置：阳光小区北门')
assert.deepEqual(mergeBinLocation(next.description, next.automatic, '阳光小区北门'), next)
const appended = mergeBinLocation(first.description + '\n便利店旁', first.automatic, '北门')
assert.ok(appended.description.includes('便利店旁'))
assert.ok(!appended.description.includes('阳光小区东门'))
const edited = mergeBinLocation('用户已改写原有位置说明', first.automatic, '北门')
assert.equal(mergeBinLocation(edited.description, edited.automatic, '南门').description, '用户已改写原有位置说明')
assert.equal(mergeBinLocation('字'.repeat(199), '', '不能截断用户内容').description, '字'.repeat(199))
assert.equal(mergeBinLocation(first.description, first.automatic, '').description, '东门右侧，可回收物')
assert.ok(validBinCoordinates({ latitude: 0, longitude: 0 }))
for (const point of [{}, { latitude: null, longitude: 0 }, { latitude: '', longitude: 0 }, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: 'bad' }]) assert.ok(!validBinCoordinates(point))
console.log('bin contribution: preserve manual text, replace location without duplicates, edited location, size limit, clear and coordinates passed')
