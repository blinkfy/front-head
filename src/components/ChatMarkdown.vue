<!-- #ifdef H5 -->
<template>
  <view class="chat-markdown" v-html="renderedHtml" />
</template>

<script setup>
import { computed } from 'vue'
import { renderMarkdown } from '@/utils/renderMarkdown'

const props = defineProps({
  markdown: {
    type: String,
    default: ''
  }
})

const renderedHtml = computed(() => renderMarkdown(props.markdown || ''))
</script>
<!-- #endif -->

<!-- #ifndef H5 -->
<template>
  <view class="chat-markdown">
    <view
      v-for="block in blocks"
      :key="block.key"
      :class="['chat-markdown-block', `chat-markdown-${block.type}`]"
    >
      <template v-if="block.type === 'divider'">
        <view class="chat-markdown-divider" />
      </template>

      <template v-else-if="block.type === 'code'">
        <text class="chat-markdown-code-block" selectable>{{ block.text }}</text>
      </template>

      <template v-else-if="block.type === 'list'">
        <view v-for="(item, itemIndex) in block.items" :key="itemIndex" class="chat-markdown-list-row">
          <text class="chat-markdown-list-marker">{{ block.ordered ? `${itemIndex + 1}.` : '•' }}</text>
          <text class="chat-markdown-inline">
            <text
              v-for="(token, tokenIndex) in item"
              :key="tokenIndex"
              :class="[`chat-markdown-inline-${token.type}`]"
            >{{ token.text }}</text>
          </text>
        </view>
      </template>

      <template v-else-if="block.type === 'table'">
        <view class="chat-markdown-table-wrapper">
          <view class="chat-markdown-table">
            <!-- 表头 -->
            <view v-if="block.header" class="chat-markdown-table-row header-row">
              <text v-for="(cell, cellIndex) in block.header" :key="cellIndex" class="chat-markdown-table-cell header-cell">
                {{ cell }}
              </text>
            </view>
            <!-- 表体 -->
            <view v-for="(row, rowIndex) in block.rows" :key="rowIndex" class="chat-markdown-table-row">
              <text v-for="(cell, cellIndex) in row" :key="cellIndex" class="chat-markdown-table-cell">
                {{ cell }}
              </text>
            </view>
          </view>
        </view>
      </template>

      <template v-else>
        <text class="chat-markdown-inline">
          <text
            v-for="(token, tokenIndex) in block.tokens"
            :key="tokenIndex"
            :class="[`chat-markdown-inline-${token.type}`]"
          >{{ token.text }}</text>
        </text>
      </template>
    </view>
  </view>
</template>

<script>
function inlineTokens(value) {
  const text = String(value || '')
  const tokens = []
  const pattern = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\[[^\]\n]+\]\([^\s)]+\))/g
  let cursor = 0
  let match

  while ((match = pattern.exec(text))) {
    if (match.index > cursor) tokens.push({ type: 'plain', text: text.slice(cursor, match.index) })
    const source = match[0]
    if (match[1]) tokens.push({ type: 'code', text: source.slice(1, -1) })
    else if (match[2] || match[3]) tokens.push({ type: 'strong', text: source.slice(2, -2) })
    else {
      const labelEnd = source.indexOf('](')
      tokens.push({ type: 'link', text: labelEnd > 1 ? source.slice(1, labelEnd) : source })
    }
    cursor = pattern.lastIndex
  }

  if (cursor < text.length || tokens.length === 0) tokens.push({ type: 'plain', text: text.slice(cursor) })
  return tokens
}

function flushParagraph(blocks, lines) {
  if (!lines.length) return
  blocks.push({ type: 'paragraph', tokens: inlineTokens(lines.join('\n')) })
  lines.length = 0
}

function isTableSeparator(line) {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return false
  const cells = trimmed.split('|').slice(1, -1)
  return cells.length > 0 && cells.every(cell => /^\s*:?-+:?\s*$/.test(cell))
}

function parseTableRow(line) {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null
  return trimmed.split('|').slice(1, -1).map(cell => cell.trim())
}

function parseMarkdown(markdown) {
  const lines = String(markdown || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
  const blocks = []
  const paragraph = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const fence = line.match(/^\s*```(?:[^`]*)$/)
    if (fence) {
      flushParagraph(blocks, paragraph)
      const codeLines = []
      index += 1
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        codeLines.push(lines[index])
        index += 1
      }
      blocks.push({ type: 'code', text: codeLines.join('\n') })
      continue
    }

    if (!line.trim()) {
      flushParagraph(blocks, paragraph)
      continue
    }

    const heading = line.match(/^\s{0,3}(#{1,3})\s+(.+?)\s*#*\s*$/)
    if (heading) {
      flushParagraph(blocks, paragraph)
      blocks.push({ type: 'heading', level: heading[1].length, tokens: inlineTokens(heading[2]) })
      continue
    }

    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      flushParagraph(blocks, paragraph)
      blocks.push({ type: 'divider' })
      continue
    }

    const quote = line.match(/^\s*>\s?(.*)$/)
    if (quote) {
      flushParagraph(blocks, paragraph)
      const quoteLines = [quote[1]]
      while (index + 1 < lines.length) {
        const nextQuote = lines[index + 1].match(/^\s*>\s?(.*)$/)
        if (!nextQuote) break
        quoteLines.push(nextQuote[1])
        index += 1
      }
      blocks.push({ type: 'quote', tokens: inlineTokens(quoteLines.join('\n')) })
      continue
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/)
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/)
    if (unordered || ordered) {
      flushParagraph(blocks, paragraph)
      const isOrdered = Boolean(ordered)
      const items = [inlineTokens((ordered || unordered)[1])]
      const itemPattern = isOrdered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-*+]\s+(.+)$/
      while (index + 1 < lines.length) {
        const nextItem = lines[index + 1].match(itemPattern)
        if (!nextItem) break
        items.push(inlineTokens(nextItem[1]))
        index += 1
      }
      blocks.push({ type: 'list', ordered: isOrdered, items })
      continue
    }

    const firstRowCells = parseTableRow(line)
    if (firstRowCells && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      flushParagraph(blocks, paragraph)
      const header = firstRowCells
      const rows = []
      index += 2
      while (index < lines.length) {
        const rowCells = parseTableRow(lines[index])
        if (!rowCells) break
        rows.push(rowCells)
        index += 1
      }
      index -= 1
      blocks.push({ type: 'table', header, rows })
      continue
    }

    paragraph.push(line)
  }

  flushParagraph(blocks, paragraph)
  return blocks.length ? blocks.map((block, index) => ({ ...block, key: `${block.type}-${index}` })) : [
    { key: 'paragraph-0', type: 'paragraph', tokens: [{ type: 'plain', text: '' }] }
  ]
}

export default {
  name: 'ChatMarkdown',
  props: {
    markdown: {
      type: String,
      default: ''
    }
  },
  computed: {
    blocks() {
      return parseMarkdown(this.markdown)
    }
  }
}
</script>
<!-- #endif -->

<style scoped>
.chat-markdown {
  font-size: 30rpx;
  line-height: 1.6;
  color: var(--msg-text-other, #202124);
  word-break: break-word;
}

.chat-markdown-block {
  margin: 0;
}

.chat-markdown-paragraph {
  white-space: pre-wrap;
}

.chat-markdown-paragraph + .chat-markdown-paragraph,
.chat-markdown-paragraph + .chat-markdown-list,
.chat-markdown-paragraph + .chat-markdown-quote,
.chat-markdown-list + .chat-markdown-paragraph,
.chat-markdown-quote + .chat-markdown-paragraph {
  margin-top: 14rpx;
}

.chat-markdown-heading {
  margin: 12rpx 0 8rpx;
  font-weight: 700;
}

.chat-markdown-heading:first-child {
  margin-top: 0;
}

.chat-markdown-heading .chat-markdown-inline {
  font-size: 34rpx;
  line-height: 1.45;
}

.chat-markdown-list {
  margin-top: 10rpx;
}

.chat-markdown-list-row {
  display: flex;
  align-items: flex-start;
  margin: 6rpx 0;
}

.chat-markdown-list-marker {
  width: 38rpx;
  flex-shrink: 0;
  color: var(--accent-color, #5B8DEE);
  font-weight: 700;
}

.chat-markdown-inline {
  flex: 1;
  min-width: 0;
  white-space: pre-wrap;
}

.chat-markdown-inline-strong {
  font-weight: 700;
}

.chat-markdown-inline-code,
.chat-markdown-code-block {
  font-family: Consolas, 'Courier New', monospace;
  background: rgba(32, 33, 36, 0.08);
  border-radius: 6rpx;
}

.chat-markdown-inline-code {
  padding: 2rpx 8rpx;
  font-size: 0.9em;
}

.chat-markdown-inline-link {
  color: var(--accent-color, #5B8DEE);
}

.chat-markdown-code {
  margin: 12rpx 0;
  padding: 16rpx 18rpx;
  background: rgba(32, 33, 36, 0.08);
  border-radius: 10rpx;
  white-space: pre-wrap;
  word-break: break-all;
}

.chat-markdown-code-block {
  display: block;
  padding: 0;
  background: transparent;
  font-size: 24rpx;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-all;
}

.chat-markdown-quote {
  margin: 12rpx 0;
  padding: 4rpx 0 4rpx 16rpx;
  border-left: 5rpx solid var(--accent-color, #5B8DEE);
  color: var(--text-secondary, #5f6368);
  white-space: pre-wrap;
}

.chat-markdown-divider {
  height: 1rpx;
  margin: 16rpx 0;
  background: var(--border-color, rgba(0, 0, 0, 0.12));
}

.chat-markdown-table-wrapper {
  margin: 12rpx 0;
  overflow-x: auto;
  border-radius: 8rpx;
  border: 1rpx solid rgba(0, 0, 0, 0.1);
}

.chat-markdown-table {
  display: flex;
  flex-direction: column;
  min-width: 100%;
  border-collapse: collapse;
}

.chat-markdown-table-row {
  display: flex;
  border-bottom: 1rpx solid rgba(0, 0, 0, 0.1);
}

.chat-markdown-table-row.header-row {
  background: rgba(0, 0, 0, 0.05);
  font-weight: 700;
}

.chat-markdown-table-cell {
  flex: 1;
  min-width: 100rpx;
  padding: 12rpx 14rpx;
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-markdown-table-cell.header-cell {
  background: rgba(0, 0, 0, 0.05);
  font-weight: 700;
  color: var(--text-primary, #1a1a1a);
}

.dark-theme .chat-markdown-inline-code,
.dark-theme .chat-markdown-code {
  background: rgba(255, 255, 255, 0.1);
}

.dark-theme .chat-markdown-table-wrapper {
  border-color: rgba(255, 255, 255, 0.1);
}

/* ===== H5 v-html 渲染的 md-* 类样式 ===== */
.chat-markdown :deep(.md-paragraph) {
  margin: 0.4em 0;
  line-height: 1.65;
  word-break: break-word;
}

.chat-markdown :deep(.md-paragraph:first-child) {
  margin-top: 0;
}

.chat-markdown :deep(.md-paragraph:empty) {
  display: none;
}

.chat-markdown :deep(.md-heading) {
  font-weight: 700;
  line-height: 1.4;
  margin: 0.7em 0 0.3em;
}

.chat-markdown :deep(.md-heading:first-child) {
  margin-top: 0;
}

.chat-markdown :deep(.md-heading-h1) { font-size: 1.25em; }
.chat-markdown :deep(.md-heading-h2) { font-size: 1.15em; }
.chat-markdown :deep(.md-heading-h3) { font-size: 1.05em; }

.chat-markdown :deep(.md-list) {
  margin: 0.4em 0;
  padding-left: 1.4em;
}

.chat-markdown :deep(.md-list-item) {
  margin: 0.2em 0;
  line-height: 1.6;
}

.chat-markdown :deep(.md-strong) {
  font-weight: 700;
}

.chat-markdown :deep(.md-code) {
  font-family: Consolas, 'Courier New', monospace;
  background: rgba(32, 33, 36, 0.08);
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 0.9em;
}

.chat-markdown :deep(.md-code-block) {
  font-family: Consolas, 'Courier New', monospace;
  background: rgba(32, 33, 36, 0.08);
  border-radius: 8px;
  padding: 10px 14px;
  margin: 0.5em 0;
  font-size: 0.88em;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-all;
  display: block;
}

.chat-markdown :deep(.md-quote) {
  border-left: 4px solid var(--accent-color, #5B8DEE);
  margin: 0.5em 0;
  padding: 3px 0 3px 12px;
  color: var(--text-secondary, #5f6368);
}

.chat-markdown :deep(.md-divider) {
  border: none;
  border-top: 1px solid rgba(0, 0, 0, 0.12);
  margin: 0.6em 0;
}

.chat-markdown :deep(.md-link) {
  color: var(--accent-color, #5B8DEE);
  text-decoration: none;
}

.chat-markdown :deep(.md-table-wrapper) {
  overflow-x: auto;
  margin: 0.5em 0;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 6px;
}

.chat-markdown :deep(.md-table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9em;
  table-layout: auto;
}

.chat-markdown :deep(.md-table-cell) {
  border: 1px solid rgba(0, 0, 0, 0.1);
  padding: 6px 10px;
  text-align: left;
  word-break: break-word;
  white-space: normal;
}

.chat-markdown :deep(.md-table-heading) {
  font-weight: 600;
  background: rgba(0, 0, 0, 0.04);
}

/* 深色主题 */
@media (prefers-color-scheme: dark) {
  .chat-markdown :deep(.md-code),
  .chat-markdown :deep(.md-code-block) {
    background: rgba(255, 255, 255, 0.1);
  }
  .chat-markdown :deep(.md-table-wrapper),
  .chat-markdown :deep(.md-table-cell) {
    border-color: rgba(255, 255, 255, 0.12);
  }
  .chat-markdown :deep(.md-table-heading) {
    background: rgba(255, 255, 255, 0.06);
  }
}

.dark-theme .chat-markdown-table-row {
  border-bottom-color: rgba(255, 255, 255, 0.1);
}

.dark-theme .chat-markdown-table-row.header-row {
  background: rgba(255, 255, 255, 0.08);
}

.dark-theme .chat-markdown-table-cell.header-cell {
  background: rgba(255, 255, 255, 0.08);
}
</style>
