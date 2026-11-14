import { extractRecognizedItems, buildExpandedUpcyclingText, splitUpcyclingSections } from './recognition-sync.js'

const text = value => typeof value === 'string' ? value.trim() : ''

// 只整理已保存内容；分类标签本身不构成补充信息，不生成默认建议。
export function normalizeHistoryRecognitionDetail(details, imageFailed = false) {
  const source = details && typeof details === 'object' && details.version === 1 ? details : {}
  const labels = Array.isArray(source.labels) ? source.labels.map(label => ({
    ...label,
    source_name: text(label?.source_name) || text(label?.object_name)
  })) : []
  const items = extractRecognizedItems({ ...source, labels })
  const sections = splitUpcyclingSections(buildExpandedUpcyclingText(source)).map((section, index) => ({
    ...section,
    key: `${section.title}:${index}`
  }))
  const savedImage = text(source.upcyclingImageUrl)
  const imageUrl = !imageFailed && (/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(savedImage) || /^https?:\/\/[^\s/]+\/api\/recognition_history\/upcycling-image\/[1-9]\d*(?:\?[^\s#]*)?$/i.test(savedImage)) ? savedImage : ''
  const blockCount = (items.length ? 1 : 0) + sections.length + (imageUrl ? 1 : 0)
  const content = [...items, ...sections.map(section => section.content)].join('\n')
  return {
    items,
    sections,
    imageUrl,
    hasContent: blockCount > 0,
    isLong: content.length > 280 || blockCount >= 4 || content.split('\n').length >= 9
  }
}
