import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.resolve(process.argv[2] || path.join(root, 'dist/build/mp-weixin'))
const utils = path.basename(output) === 'utils' ? output : path.join(output, 'pages-nonTheme/utils')
for (const file of ['shop-address.js', 'community-regions.js']) {
  assert.ok(existsSync(path.join(utils, file)), `compiled file not found: ${path.join(utils, file)}`)
}

const child = String.raw`
const assert = require('node:assert/strict')
const path = require('node:path')
const utils = process.argv[1]
const first = process.argv[2]
const second = process.argv[3]
const firstModule = require(path.join(utils, first))
const secondModule = require(path.join(utils, second))
const shopAddress = first === 'shop-address.js' ? firstModule : secondModule
const communityRegions = first === 'community-regions.js' ? firstModule : secondModule

const address = '北京市朝阳区望京路1号'
const parsed = shopAddress.splitShopAddress(address)
assert.deepEqual(parsed.region, ['北京市', '北京市', '朝阳区'])
assert.equal(shopAddress.composeShopAddress(parsed.region, parsed.detail), address)
const tree = communityRegions.buildCommunityRegionTree()
assert.ok(Array.isArray(tree) && tree.length > 0, 'community tree must be non-empty')
assert.equal(tree[0].name, '北京市')
assert.equal(tree[0].children[0].name, '北京市')
assert.ok(tree[0].children[0].children.some(region => region.name === '朝阳区'),
  'Beijing community tree must include Chaoyang District')
`

for (const [first, second] of [
  ['shop-address.js', 'community-regions.js'],
  ['community-regions.js', 'shop-address.js']
]) {
  const result = spawnSync(process.execPath, ['-e', child, utils, first, second], {
    encoding: 'utf8'
  })
  assert.equal(result.status, 0,
    `${first} then ${second} failed:\n${(result.stderr || result.stdout).trim()}`)
  console.log(`PASS ${first} -> ${second}`)
}

console.log(`Region module loading checks passed (${utils}).`)
