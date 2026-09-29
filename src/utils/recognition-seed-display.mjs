// Presentation only: keep the original seed content intact for chat history and AI context.
export function parseRecognitionSeedSummary(message, index) {
  if (index !== 1 || message?.role !== 'assistant') return null
  const source = String(message.content || '').replace(/\r\n/g, '\n').trim()
  const heading = '本次识别结果：'
  if (!source.startsWith(heading)) return null

  const markers = ['识别到的具体物品：', '分类建议：', '变废为宝建议：']
  const firstMarker = markers.map(marker => source.indexOf(`\n${marker}`)).filter(at => at >= 0)
  const labelText = source.slice(heading.length, firstMarker.length ? Math.min(...firstMarker) : undefined)
  const labels = labelText.split('\n').map(line => {
    const match = line.trim().match(/^\d+\.\s*(.+?)（置信度\s*(\d{1,3}%|--)）$/)
    return match ? { name: match[1].trim(), confidence: match[2] } : null
  }).filter(Boolean)
  if (!labels.length) return null

  function section(marker) {
    const start = source.indexOf(`\n${marker}`)
    if (start < 0) return ''
    const from = start + marker.length + 1
    const next = markers.map(other => source.indexOf(`\n${other}`, from)).filter(at => at >= 0)
    return source.slice(from, next.length ? Math.min(...next) : undefined).trim()
  }

  const items = section(markers[0]).split(/[、，,]/).map(item => item.trim()).filter(Boolean)
  const disposal = section(markers[1])
  let upcycling = section(markers[2])
  // Some existing seeds repeat disposal advice at the start of the upcycling field.
  if (disposal && upcycling.startsWith(`垃圾投放：${disposal}`)) {
    upcycling = upcycling.slice(`垃圾投放：${disposal}`.length).trim()
  }
  const readable = value => value.replace(/([。；])\s*(?=\S)/g, '$1\n')
  return { labels, items, disposal: readable(disposal), upcycling: readable(upcycling) }
}
