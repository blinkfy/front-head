import MarkdownIt from 'markdown-it/index.mjs'

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true
})

// Use a class so mini-program styles never need the unsupported `hr` tag selector.
md.renderer.rules.hr = () => '<hr class="md-divider">\n'
md.renderer.rules.paragraph_open = (tokens, index, options, environment, renderer) => {
  tokens[index].attrJoin('class', 'md-paragraph')
  return renderer.renderToken(tokens, index, options)
}

const MARKDOWN_TAG_CLASSES = {
  h1: 'md-heading md-heading-h1',
  h2: 'md-heading md-heading-h2',
  h3: 'md-heading md-heading-h3',
  h4: 'md-heading md-heading-h4',
  h5: 'md-heading md-heading-h5',
  h6: 'md-heading md-heading-h6',
  ul: 'md-list md-list-bullet',
  ol: 'md-list md-list-ordered',
  li: 'md-list-item',
  strong: 'md-strong',
  code: 'md-code',
  pre: 'md-code-block',
  blockquote: 'md-quote',
  a: 'md-link',
  table: 'md-table',
  th: 'md-table-cell md-table-heading',
  td: 'md-table-cell',
  img: 'md-image'
}

function addMarkdownStyleClasses(html) {
  const tagPattern = new RegExp(`<(${Object.keys(MARKDOWN_TAG_CLASSES).join('|')})\\b([^>]*)>`, 'gi')
  return html.replace(tagPattern, (tag, rawTagName, attributes) => {
    const className = MARKDOWN_TAG_CLASSES[rawTagName.toLowerCase()]
    if (/\bclass\s*=\s*["']/i.test(attributes)) {
      return tag.replace(/\bclass\s*=\s*(["'])/i, `class=$1${className} `)
    }
    return `<${rawTagName} class="${className}"${attributes}>`
  })
}

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
    return addMarkdownStyleClasses(md.render(normalized))
  } catch (e) {
    console.warn('[renderMarkdown] failed:', e && e.message ? e.message : e)
    return markdownText
  }
}
