import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import {
  HISTORY_IMAGE_RETENTION_DAYS,
  getHistoryImageLabel,
  getHistoryImageState
} from '../src/utils/history-image-state.mjs'

const require = createRequire(import.meta.url)
const { compileScript, compileTemplate, parse } = require('@vue/compiler-sfc')
const dayMs = 24 * 60 * 60 * 1000
const now = Date.parse('2026-10-24T12:00:00.000Z')
const timeDaysAgo = days => new Date(now - days * dayMs).toISOString()

test('history image state distinguishes retained, cleared, missing, and failed images', async t => {
  await t.test('a loadable old image stays available', () => {
    assert.equal(HISTORY_IMAGE_RETENTION_DAYS, 90)
    assert.equal(getHistoryImageState({ hasImage: true, time: timeDaysAgo(120) }, false, now), 'available')
  })

  await t.test('missing or failed old images are classified as cleared', () => {
    assert.equal(getHistoryImageState({ hasImage: false, time: timeDaysAgo(91) }, false, now), 'cleared')
    assert.equal(getHistoryImageState({ hasImage: true, time: timeDaysAgo(91) }, true, now), 'cleared')
  })

  await t.test('the exact 90 day boundary is not expired', () => {
    assert.equal(getHistoryImageState({ hasImage: false, time: timeDaysAgo(90) }, false, now), 'none')
    assert.equal(getHistoryImageState({ hasImage: true, time: timeDaysAgo(90) }, true, now), 'error')
  })

  await t.test('recent missing images and recent load failures remain distinct', () => {
    assert.equal(getHistoryImageState({ hasImage: false, time: timeDaysAgo(5) }, false, now), 'none')
    assert.equal(getHistoryImageState({ hasImage: true, time: timeDaysAgo(5) }, true, now), 'error')
  })

  await t.test('invalid and future timestamps never imply cleanup', () => {
    assert.equal(getHistoryImageState({ hasImage: false, time: 'not-a-date' }, false, now), 'none')
    assert.equal(getHistoryImageState({ hasImage: true, time: 'not-a-date' }, true, now), 'error')
    assert.equal(getHistoryImageState({ hasImage: false, time: new Date(now + dayMs).toISOString() }, false, now), 'none')
    assert.equal(getHistoryImageState({ hasImage: true, time: new Date(now + dayMs).toISOString() }, true, now), 'error')
  })

  await t.test('visible labels are available for all non-empty states', () => {
    assert.equal(getHistoryImageLabel('cleared'), '图片已清理')
    assert.equal(getHistoryImageLabel('error'), '加载失败，点击重试')
    assert.equal(getHistoryImageLabel('none'), '暂无图片')
  })
})

for (const pagePath of [
  '../src/pages/history/history.vue',
  '../src/pages-dark/history/history.vue'
]) {
  test(`history page compiles script and template: ${pagePath}`, async () => {
    const filename = fileURLToPath(new URL(pagePath, import.meta.url))
    const source = await readFile(filename, 'utf8')
    const parsed = parse(source, { filename })
    assert.deepEqual(parsed.errors, [], 'SFC parsing should succeed')
    assert.ok(parsed.descriptor.template, 'SFC should contain a template')

    const id = `history-image-state-${pagePath.includes('pages-dark') ? 'dark' : 'light'}`
    const script = compileScript(parsed.descriptor, { id })
    const template = compileTemplate({
      source: parsed.descriptor.template.content,
      filename,
      id,
      compilerOptions: { bindingMetadata: script.bindings }
    })

    assert.deepEqual(template.errors, [], 'template compilation should succeed')
  })
}
