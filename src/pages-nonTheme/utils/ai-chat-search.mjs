export const SEARCH_UNAVAILABLE_MESSAGE = '联网搜索暂不可用，本次使用已有知识回答'
const STATUSES = new Set(['searching', 'completed', 'failed', 'skipped'])

// 小程序可能没有 URL；回退分支仍只允许无凭据的绝对 HTTP(S) 地址。
export function safeSearchUrl(value) {
  if (typeof value !== 'string') return ''
  const url = value.trim()
  if (/[\s\\\u0000-\u001f\u007f]/.test(url)) return ''
  const match = /^https?:\/\/([^/?#]+)(?:[/?#]|$)/i.exec(url)
  if (!match || match[1].includes('@')) return ''
  try {
    if (typeof URL !== 'undefined') {
      const parsed = new URL(url)
      return parsed.hostname && !parsed.username && !parsed.password ? parsed.href : ''
    }
    if (!/^(?:[a-z\d](?:[a-z\d.-]*[a-z\d])?|\[[a-f\d:]+\])(?::\d{1,5})?$/i.test(match[1])) return ''
    const port = /:(\d+)$/.exec(match[1])
    return port && Number(port[1]) > 65535 ? '' : url
  } catch (_) { return '' }
}

function siteFromUrl(url) {
  return /^https?:\/\/([^/?#]+)/i.exec(url)?.[1] || ''
}

function sourceLabel(value, limit) {
  const label = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  // 部分搜索页面返回接口 JSON/错误文档，不能把原始响应当作网页标题。
  if (/^(?:```|["']?\{|\[\s*["{\[\]]|<!doctype\b|<html\b|<\?xml\b)/i.test(label)) return ''
  return label.slice(0, limit)
}

export function normalizeChatSearch(value) {
  if (!value || typeof value !== 'object' || !STATUSES.has(value.status)) return null
  const sources = []
  const seen = new Set()
  for (const source of Array.isArray(value.sources) ? value.sources : []) {
    const url = safeSearchUrl(source?.url)
    if (!url) continue
    const rawIndex = Number(source.index)
    const index = Number.isInteger(rawIndex) && rawIndex > 0 ? rawIndex : sources.length + 1
    // 引用编号才是身份：同一网页可对应多个正文引用。
    if (seen.has(index)) continue
    seen.add(index)
    const siteName = sourceLabel(source.siteName, 80) || siteFromUrl(url)
    sources.push({
      index,
      title: sourceLabel(source.title, 180) || siteName,
      url,
      siteName
    })
    if (sources.length === 30) break
  }
  const result = { status: value.status, sources }
  if (typeof value.message === 'string' && value.message.trim()) result.message = value.message.trim().slice(0, 240)
  return result
}

export function mergeChatSearch(current, incoming) {
  const previous = normalizeChatSearch(current)
  const next = normalizeChatSearch(incoming)
  if (!next) return previous
  // 失败或最终事件可能不再带来源，已收到的有效来源仍可查看。
  return normalizeChatSearch({ ...next, sources: [...next.sources, ...(previous?.sources || [])] })
}

export function finalizeChatSearch(value, answerInterrupted = false) {
  const search = normalizeChatSearch(value)
  if (search && answerInterrupted) {
    search.status = 'failed'
    search.message = search.sources.length ? '回答已中断，已获取的来源仍可查看。' : '回答已中断。'
  } else if (search?.status === 'searching') {
    search.status = 'failed'
    search.message = search.sources.length ? '联网查询已中断，已获取的来源仍可查看。' : '联网查询已中断。'
  }
  return search
}

export function chatSearchMessage(value) {
  if (!value) return ''
  if (value.status === 'searching') return value.message || '正在联网查找资料…'
  if (value.status === 'failed') return value.message || SEARCH_UNAVAILABLE_MESSAGE
  if (value.status === 'completed') return value.message || (value.sources?.length ? '参考来源' : '本次联网未返回可核实来源，实时信息仍需确认。')
  return value.message || ''
}
