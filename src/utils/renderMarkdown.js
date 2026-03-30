import MarkdownIt from 'markdown-it/index.mjs'

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true
})

/**
 * 在渲染前规范化 Markdown 文本：
 * - 把 3 个及以上连续换行压缩为 2 个（避免产生大量空 <p>）
 * - 去掉行尾的多个空格（避免 markdown-it 生成多余 <br>）
 */
function normalizeMarkdown(text) {
  if (!text || typeof text !== 'string') return ''
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')          // 行尾空格无害但多余
    .replace(/\n{3,}/g, '\n\n')        // 超过2个连续空行压缩为2个
}

export function renderMarkdown(markdownText) {
  if (!markdownText || typeof markdownText !== 'string') return ''
  try {
    const normalized = normalizeMarkdown(markdownText.trim())
    return md.render(normalized)
  } catch (e) {
    console.warn('[renderMarkdown] failed:', e && e.message ? e.message : e)
    return markdownText
  }
}
