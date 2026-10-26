import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  MAX_IMAGE_BYTES,
  compressUntilWithinLimit,
  dataUrlByteLength
} from '../src/pages-nonTheme/utils/chat-image-compression-core.mjs'

function makeDataUrl(byteLength) {
  const completeGroups = Math.floor(byteLength / 3)
  const remainder = byteLength % 3
  let payload = 'A'.repeat(completeGroups * 4)
  if (remainder === 1) payload += 'AQ=='
  if (remainder === 2) payload += 'AQI='
  return `data:image/jpeg;base64,${payload}`
}

assert.equal(dataUrlByteLength(makeDataUrl(0)), 0)
assert.equal(dataUrlByteLength(makeDataUrl(1)), 1)
assert.equal(dataUrlByteLength(makeDataUrl(2)), 2)
assert.equal(dataUrlByteLength(makeDataUrl(3)), 3)
assert.equal(dataUrlByteLength('data:text/plain,%E4%B8%AD%E6%96%87'), 6)
assert.equal(dataUrlByteLength('not-a-data-url'), Infinity)

const boundaryImage = { dataUrl: makeDataUrl(MAX_IMAGE_BYTES), filePath: '/tmp/boundary.jpg' }
let boundaryCalls = 0
const boundaryResult = await compressUntilWithinLimit(boundaryImage, async () => {
  boundaryCalls += 1
  throw new Error('不应压缩阈值内的图片')
})
assert.equal(boundaryCalls, 0)
assert.equal(boundaryResult.size, MAX_IMAGE_BYTES)
assert.equal(boundaryResult.filePath, boundaryImage.filePath)

const attempts = []
const compressed = await compressUntilWithinLimit(
  { dataUrl: makeDataUrl(MAX_IMAGE_BYTES + 1), filePath: '/tmp/original.jpg' },
  async ({ maxEdge, quality }) => {
    attempts.push({ maxEdge, quality })
    let size = MAX_IMAGE_BYTES + 1
    if (maxEdge === 1600) size = [700000, 650000, 610000, 530000][[80, 68, 56, 44].indexOf(quality)]
    if (maxEdge === 1200 && quality === 80) size = 520000
    if (maxEdge === 1200 && quality === 68) size = 480000
    // 故意谎报压缩器的 size，核心必须按待发送 dataUrl 的实际解码字节数校验。
    return { dataUrl: makeDataUrl(size), filePath: `/tmp/${maxEdge}-${quality}.jpg`, size: 1 }
  }
)
assert.equal(compressed.size, 480000)
assert.equal(attempts.length, 6)
assert.deepEqual(attempts.slice(0, 4), [80, 68, 56, 44].map((quality) => ({ maxEdge: 1600, quality })))
assert.deepEqual(attempts.slice(4), [
  { maxEdge: 1200, quality: 80 },
  { maxEdge: 1200, quality: 68 }
])

let oversizedAttempts = 0
await assert.rejects(
  compressUntilWithinLimit(
    { dataUrl: makeDataUrl(MAX_IMAGE_BYTES + 1) },
    async ({ maxEdge, quality }) => {
      oversizedAttempts += 1
      return {
        dataUrl: makeDataUrl(MAX_IMAGE_BYTES + 1),
        filePath: `/tmp/oversized-${maxEdge}-${quality}.jpg`
      }
    },
    { maxRounds: 2, qualitySteps: [80, 44] }
  ),
  (error) => /超过 500KB/.test(error.message)
)
assert.equal(oversizedAttempts, 4)

let failedAttempts = 0
await assert.rejects(
  compressUntilWithinLimit(
    { dataUrl: makeDataUrl(MAX_IMAGE_BYTES + 1), filePath: '/tmp/original.jpg' },
    async () => {
      failedAttempts += 1
      throw new Error('模拟平台压缩失败')
    },
    { maxRounds: 3, qualitySteps: [80, 68] }
  ),
  (error) => /超过 500KB/.test(error.message) && error.message !== '模拟平台压缩失败'
)
assert.equal(failedAttempts, 6)

const utilityPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/pages-nonTheme/utils/chat-image-compression.js')
const utilitySource = readFileSync(utilityPath, 'utf8')

function preprocessForPlatform(source, platform) {
  const enabled = new Set([platform])
  if (platform.startsWith('MP-')) enabled.add('MP')
  const stack = []
  let included = true
  const output = []

  for (const line of source.split(/\r?\n/)) {
    const directive = /^\s*\/\/\s*#(ifdef|ifndef)\s+(.+?)\s*$/.exec(line)
    if (directive) {
      const matches = directive[2].split(/\s*\|\|\s*/).some((name) => enabled.has(name))
      const condition = directive[1] === 'ifdef' ? matches : !matches
      stack.push({ parent: included, condition, sawElse: false })
      included = included && condition
      continue
    }
    if (/^\s*\/\/\s*#else\s*$/.test(line)) {
      const frame = stack.at(-1)
      assert.ok(frame && !frame.sawElse, `无效的条件编译 #else (${platform})`)
      frame.sawElse = true
      included = frame.parent && !frame.condition
      continue
    }
    if (/^\s*\/\/\s*#endif\s*$/.test(line)) {
      const frame = stack.pop()
      assert.ok(frame, `无效的条件编译 #endif (${platform})`)
      included = frame.parent
      continue
    }
    if (included) output.push(line)
  }

  assert.equal(stack.length, 0, `条件编译未闭合 (${platform})`)
  return output.join('\n')
}

for (const platform of ['H5', 'APP-PLUS', 'MP-WEIXIN']) {
  const result = spawnSync(process.execPath, ['--check', '--input-type=module'], {
    input: preprocessForPlatform(utilitySource, platform),
    encoding: 'utf8'
  })
  assert.equal(result.status, 0, `${platform} 预处理后语法错误：${result.stderr || result.stdout}`)
}

console.log('聊天图片压缩核心测试通过：阈值、质量/尺寸重试、字节校验、失败边界和三端语法。')
