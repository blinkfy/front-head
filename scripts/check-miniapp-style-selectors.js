const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const SOURCE_ROOT = path.join(ROOT, 'src')
const UNSUPPORTED_TAG = /(^|[\s>+~,(])(a|b|blockquote|code|div|em|h[1-6]|hr|i|img|li|ol|p|pre|small|span|strong|table|tbody|td|th|thead|tr|ul)(?=$|[\s>+~,.:#\[\)])/g

function walk(directory) {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walk(target))
    else if (/\.(vue|css|scss|less)$/i.test(entry.name)) files.push(target)
  }
  return files
}

function styleBlocks(filePath, source) {
  if (!filePath.endsWith('.vue')) return [{ source, offset: 0 }]
  const blocks = []
  const pattern = /<style\b[^>]*>([\s\S]*?)<\/style>/gi
  let match
  while ((match = pattern.exec(source))) {
    const contentStart = match.index + match[0].indexOf(match[1])
    blocks.push({ source: match[1], offset: contentStart })
  }
  return blocks
}

function selectorBeforeBrace(source, braceIndex) {
  let start = braceIndex - 1
  while (start >= 0 && !'{};'.includes(source[start])) start -= 1
  return source.slice(start + 1, braceIndex).replace(/\/\*[\s\S]*?\*\//g, '').trim()
}

function lineNumber(source, index) {
  return source.slice(0, index).split('\n').length
}

const violations = []
for (const filePath of walk(SOURCE_ROOT)) {
  const fileSource = fs.readFileSync(filePath, 'utf8')
  for (const block of styleBlocks(filePath, fileSource)) {
    for (let index = 0; index < block.source.length; index += 1) {
      if (block.source[index] !== '{') continue
      const selector = selectorBeforeBrace(block.source, index)
      if (!selector || selector.startsWith('@')) continue
      UNSUPPORTED_TAG.lastIndex = 0
      let match
      while ((match = UNSUPPORTED_TAG.exec(selector))) {
        const selectorStart = index - selector.length
        violations.push({
          filePath,
          line: lineNumber(fileSource, block.offset + selectorStart + match.index),
          tag: match[2],
          selector: selector.replace(/\s+/g, ' ')
        })
      }
    }
  }
}

if (violations.length) {
  console.error('Unsupported mini-program style tag selectors found:')
  for (const item of violations) {
    console.error(`${path.relative(ROOT, item.filePath)}:${item.line} [${item.tag}] ${item.selector}`)
  }
  process.exitCode = 1
} else {
  console.log('Mini-program style selector check passed.')
}
