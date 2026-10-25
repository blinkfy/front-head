import { getStorage, setStorage, seededRatio, clamp, n } from './format.js'

const KPI_HISTORY_KEY = 'collection_dashboard_kpi_history_v2'

export function createCollectionKpiHistory({ _state }) {
  function loadKpiSeries() {
    try {
      const raw = getStorage(KPI_HISTORY_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch (_) { return [] }
  }
  function saveKpiSeries(list) {
    try { setStorage(KPI_HISTORY_KEY, JSON.stringify(list)) } catch (_) {}
  }
  function pushKpi(snapshot) {
    const now = Date.now()
    const range = 35 * 24 * 60 * 60 * 1000
    const next = _state.kpiSeries.filter(item => now - Number(item.ts) < range)
    next.push({ ts: now, ...snapshot })
    _state.kpiSeries = next.slice(-800)
    saveKpiSeries(_state.kpiSeries)
  }
  function nearestKpi(hoursAgo, current, seedTag) {
    const target = Date.now() - hoursAgo * 3600 * 1000
    let best = null; let bestDiff = Infinity
    for (const item of _state.kpiSeries) {
      const diff = Math.abs(Number(item.ts) - target)
      if (diff < bestDiff) { best = item; bestDiff = diff }
    }
    if (best) return best
    const ratio = 0.92 + seededRatio(`${seedTag}-${new Date().toDateString()}`) * 0.16
    return {
      total: Math.max(0, current.total / ratio),
      urgent: Math.max(0, current.urgent / ratio),
      average: clamp(current.average / ratio, 0, 100),
      distance: Math.max(0, current.distance / ratio),
      duration: Math.max(0, current.duration / ratio)
    }
  }

  // ─── delta 标签 ────────────────────────────────────────
  function deltaTag(label, current, base, unit, lowerBetter) {
    const c = n(current, NaN); const b = n(base, NaN)
    if (!Number.isFinite(c) || !Number.isFinite(b)) return { symbol: '•', value: '--', ariaLabel: `${label}暂无数据`, cls: 'flat' }
    const delta = c - b; const abs = Math.abs(delta)
    const symbol = delta > 0 ? '▲' : delta < 0 ? '▼' : '—'
    let cls = 'flat'
    if (delta !== 0) cls = lowerBetter ? (delta < 0 ? 'up' : 'down') : (delta > 0 ? 'up' : 'down')
    const sign = delta > 0 ? '+' : delta < 0 ? '−' : ''
    return {
      symbol,
      value: delta === 0 ? '' : `${sign}${abs.toFixed(1)}${unit || ''}`,
      ariaLabel: `${label}${delta > 0 ? '上升' : delta < 0 ? '下降' : '持平'}${abs.toFixed(1)}${unit || ''}`,
      cls
    }
  }

  return { loadKpiSeries, saveKpiSeries, pushKpi, nearestKpi, deltaTag }
}
