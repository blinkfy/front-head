import MarkdownIt from 'markdown-it/index.mjs'

const md = new MarkdownIt({ html: false, breaks: true, linkify: false })

function inlineText(tokens) {
  return tokens.map(token => {
    if (token.children) return inlineText(token.children)
    if (token.type === 'softbreak' || token.type === 'hardbreak') return ' '
    return token.content
  }).join('')
}

// Posts use the community uploader for images. Inline media and links show their labels.
md.renderer.rules.image = (tokens, index) => md.utils.escapeHtml(inlineText(tokens[index].children || []))
md.renderer.rules.link_open = md.renderer.rules.link_close = () => ''

const blockStyles = {
  heading_open: 'font-size:1.15em;font-weight:700;line-height:1.45;margin:.65em 0 .3em',
  paragraph_open: 'margin:.25em 0',
  bullet_list_open: 'list-style-type:disc;padding-left:1.6em;margin:.35em 0',
  ordered_list_open: 'list-style-type:decimal;padding-left:1.8em;margin:.35em 0',
  blockquote_open: 'border-left:3px solid #57a988;padding-left:.8em;margin:.5em 0',
}
for (const [rule, style] of Object.entries(blockStyles)) {
  md.renderer.rules[rule] = (tokens, index, options, env, renderer) => {
    tokens[index].attrSet('style', style)
    return renderer.renderToken(tokens, index, options)
  }
}

export function renderCommunityPost(content) {
  return md.render(content || '')
}

export function communityPostSummary(content) {
  return md.parse(content || '', {}).map(token => {
    if (token.type === 'inline') return inlineText(token.children)
    if (token.type === 'fence' || token.type === 'code_block') return token.content.trim()
    return ''
  }).filter(Boolean).join(' ')
}
