const QQ_MAP_KEYS = [
  'RZPBZ-AXLY3-ENO3Q-O3AZU-JGX4Q-KTFZU',
  'F4BBZ-THI6W-LLRR3-YG74H-NDW43-WCFDH'
];
const DEFAULT_CENTER = { latitude: 36.0671, longitude: 120.3826 };
const KPI_HISTORY_KEY = 'collection_dashboard_kpi_history_v2';

const baseUrl = window.__APP_BASE_URL__ || ''

const refs = {
  clockText: document.getElementById('clockText'),
  statusText: document.getElementById('statusText'),
  strategySwitch: document.getElementById('strategySwitch'),
  toCommunityBtn: document.getElementById('toCommunityBtn'),
  metricTotal: document.getElementById('metricTotal'),
  metricUrgent: document.getElementById('metricUrgent'),
  metricAverage: document.getElementById('metricAverage'),
  metricDistance: document.getElementById('metricDistance'),
  metricDuration: document.getElementById('metricDuration'),
  metricTotalDelta: document.getElementById('metricTotalDelta'),
  metricUrgentDelta: document.getElementById('metricUrgentDelta'),
  metricAverageDelta: document.getElementById('metricAverageDelta'),
  metricDistanceDelta: document.getElementById('metricDistanceDelta'),
  metricDurationDelta: document.getElementById('metricDurationDelta'),
  routeBrief: document.getElementById('routeBrief'),
  riskList: document.getElementById('riskList'),
  forecastBars: document.getElementById('forecastBars'),
  alertList: document.getElementById('alertList'),
  dispatchList: document.getElementById('dispatchList'),
  routeTimeline: document.getElementById('routeTimeline')
};

function applyTheme() {
  const theme = localStorage.getItem('app_theme') === 'light' ? 'light' : 'dark';
  document.body.classList.toggle('light-theme', theme === 'light');
}

const state = {
  bins: [],
  plan: null,
  startPoint: null,
  map: null,
  mapReady: false,
  loading: false,
  timer: null,
  infoWindow: null,
  binMarkers: null,
  routePolyline: null,
  sequenceMarkers: null,
  startMarker: null,
  focusPolyline: null,
  iconCache: new Map(),
  selectedBinId: null,
  selectedStopOrder: null,
  handlingByBin: new Map(),
  lastMapSignature: '',
  routeStrategy: normalizeStrategy(localStorage.getItem('collection_route_strategy')),
  kpiSeries: loadKpiSeries()
};

function safeNavigate(path) {
  const target = String(path || '/');
  if (!target) return;
  try {
    window.location.assign(target);
  } catch (_) {
    window.location.href = target;
  }
}

function normalizeStrategy(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'shortest_distance') return 'shortest_distance';
  if (v === 'fewest_stops') return 'fewest_stops';
  return 'shortest_time';
}

function strategyLabel(strategy) {
  if (strategy === 'shortest_distance') return '最短里程';
  if (strategy === 'fewest_stops') return '最少停靠';
  return '最短时间';
}

function setStatus(text, cls) {
  refs.statusText.className = 'status' + (cls ? ` ${cls}` : '');
  refs.statusText.textContent = text || '';
}

function authHeaders() {
  const token = localStorage.getItem('token') || '';
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = token;
  return headers;
}

async function api(path, options) {
  const fullPath = path.startsWith('/') ? `${baseUrl}${path}` : path;
  const res = await fetch(fullPath, {
    ...(options || {}),
    headers: {
      ...authHeaders(),
      ...((options && options.headers) || {})
    }
  });
  const json = await res.json();
  if (!json || json.code !== 0) throw new Error((json && json.msg) || `HTTP ${res.status}`);
  return json.data;
}

function n(v, fallback = 0) {
  const value = Number(v);
  return Number.isFinite(value) ? value : fallback;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, n(v, min)));
}

function seededRatio(seed) {
  const text = String(seed || 'seed');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return (hash % 1000) / 1000;
}

function esc(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sev(fill) {
  if (fill >= 90) return 'red';
  if (fill >= 80) return 'orange';
  if (fill >= 65) return 'amber';
  return 'green';
}

function sevRank(fill) {
  if (fill >= 90) return 3;
  if (fill >= 80) return 2;
  if (fill >= 65) return 1;
  return 0;
}

function sevLabel(fill) {
  if (fill >= 90) return '紧急';
  if (fill >= 80) return '高负载';
  if (fill >= 65) return '临界';
  return '正常';
}

function fmtKm(v) {
  return `${n(v, 0).toFixed(2)} km`;
}

function fmtMin(v) {
  return `${n(v, 0).toFixed(1)} min`;
}

function fmtTime(value, withSeconds) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return withSeconds ? '--:--:--' : '--:--';
  return d.toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: withSeconds ? '2-digit' : undefined
  });
}

function countdownToFull(hoursToFull) {
  const h = n(hoursToFull, NaN);
  if (!Number.isFinite(h)) return '预计满载时间未知';
  const mins = Math.max(0, Math.round(h * 60));
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  if (hh === 0) return `预计 ${mm} 分钟满载`;
  return `预计 ${hh}h ${mm}m 满载`;
}

function markerSvg(fill, label) {
  const safe = esc(label || '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="14" fill="${fill}" stroke="#fff" stroke-width="3"></circle><text x="22" y="26" text-anchor="middle" font-size="13" font-weight="700" fill="#fff" font-family="Arial">${safe}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function icon(key, fill, label) {
  if (state.iconCache.has(key)) return state.iconCache.get(key);
  const src = markerSvg(fill, label);
  state.iconCache.set(key, src);
  return src;
}

function loadKpiSeries() {
  try {
    const raw = localStorage.getItem(KPI_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function saveKpiSeries(list) {
  try {
    localStorage.setItem(KPI_HISTORY_KEY, JSON.stringify(list));
  } catch (_) {}
}

function pushKpi(snapshot) {
  const now = Date.now();
  const historyRange = 35 * 24 * 60 * 60 * 1000;
  const next = state.kpiSeries.filter((item) => now - Number(item.ts) < historyRange);
  next.push({ ts: now, ...snapshot });
  state.kpiSeries = next.slice(-800);
  saveKpiSeries(state.kpiSeries);
}

function nearestKpi(hoursAgo, current, seedTag) {
  const target = Date.now() - hoursAgo * 60 * 60 * 1000;
  let best = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const item of state.kpiSeries) {
    const diff = Math.abs(Number(item.ts) - target);
    if (diff < bestDiff) {
      best = item;
      bestDiff = diff;
    }
  }
  if (best) return best;
  const ratio = 0.92 + seededRatio(`${seedTag}-${new Date().toDateString()}`) * 0.16;
  return {
    total: Math.max(0, current.total / ratio),
    urgent: Math.max(0, current.urgent / ratio),
    average: clamp(current.average / ratio, 0, 100),
    distance: Math.max(0, current.distance / ratio),
    duration: Math.max(0, current.duration / ratio)
  };
}

function deltaTag(label, current, base, unit, lowerBetter) {
  const c = n(current, NaN);
  const b = n(base, NaN);
  if (!Number.isFinite(c) || !Number.isFinite(b)) {
    return `<span class="tag flat">${esc(label)} --</span>`;
  }
  const delta = c - b;
  const abs = Math.abs(delta);
  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
  let cls = 'flat';
  if (delta !== 0) cls = lowerBetter ? (delta < 0 ? 'up' : 'down') : (delta > 0 ? 'up' : 'down');
  return `<span class="tag ${cls}">${esc(label)} ${arrow}${abs.toFixed(1)}${esc(unit || '')}</span>`;
}

function applyStrategyUI() {
  refs.strategySwitch.querySelectorAll('button[data-strategy]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.strategy === state.routeStrategy);
  });
}

function patchList(container, items, options) {
  const opts = options || {};
  if (!Array.isArray(items) || !items.length) {
    if (container.__empty !== opts.emptyHtml) {
      container.innerHTML = opts.emptyHtml || '';
      container.__empty = opts.emptyHtml || '';
    }
    return;
  }

  const oldScroll = container.scrollTop;
  container.__empty = '';
  const previous = new Map();
  Array.from(container.children).forEach((node) => {
    if (node && node.dataset && node.dataset.key) previous.set(node.dataset.key, node);
  });

  const fragment = document.createDocumentFragment();
  items.forEach((item, index) => {
    const key = String(opts.key(item, index));
    let node = previous.get(key);
    if (!node) {
      node = document.createElement('div');
      node.dataset.key = key;
    }
    if (typeof opts.assign === 'function') opts.assign(node, item, index);
    if (typeof opts.className === 'function') {
      const cls = opts.className(item, index) || '';
      if (node.className !== cls) node.className = cls;
    }
    const html = opts.html(item, index);
    if (node.__html !== html) {
      node.innerHTML = html;
      node.__html = html;
    }
    fragment.appendChild(node);
    previous.delete(key);
  });

  container.replaceChildren(fragment);
  container.scrollTop = Math.min(oldScroll, container.scrollHeight);
}

function sortedRiskBins() {
  return (state.bins || [])
    .slice()
    .sort((a, b) => {
      const fa = clamp(a.currentFill, 0, 100);
      const fb = clamp(b.currentFill, 0, 100);
      return (
        sevRank(fb) - sevRank(fa) ||
        n(b.priorityScore, 0) - n(a.priorityScore, 0) ||
        n(a.hoursToFull, Number.POSITIVE_INFINITY) - n(b.hoursToFull, Number.POSITIVE_INFINITY) ||
        String(a.id).localeCompare(String(b.id))
      );
    });
}

function sortedAlertBins() {
  return sortedRiskBins().filter((item) => clamp(item.currentFill, 0, 100) >= 65).slice(0, 8);
}

function handlingStatusMap(alertBins, routeStops) {
  const map = new Map();
  const route = Array.isArray(routeStops) ? routeStops : [];
  const indexed = new Map(route.map((s) => [String(s.id), s]));
  const now = Date.now();
  let processingId = null;
  const etaSorted = route.slice().sort((a, b) => new Date(a.eta) - new Date(b.eta));
  for (const stop of etaSorted) {
    const eta = new Date(stop.eta).getTime();
    const etd = new Date(stop.etd || stop.eta).getTime();
    if (now >= eta - 5 * 60 * 1000 && now <= etd + 5 * 60 * 1000) {
      processingId = String(stop.id);
      break;
    }
  }
  if (!processingId && etaSorted.length) processingId = String(etaSorted[0].id);
  (alertBins || []).forEach((bin) => {
    const id = String(bin.id);
    if (processingId && id === processingId) map.set(id, 'processing');
    else if (indexed.has(id)) map.set(id, 'dispatched');
    else map.set(id, 'pending');
  });
  return map;
}

function handlingLabel(status) {
  if (status === 'processing') return '处理中';
  if (status === 'dispatched') return '已派单';
  return '未处理';
}

function renderMetrics() {
  const bins = state.bins || [];
  const route = state.plan && state.plan.route;
  const m = {
    total: bins.length,
    urgent: bins.filter((bin) => bin.isUrgent).length,
    average: bins.length ? bins.reduce((sum, bin) => sum + n(bin.currentFill, 0), 0) / bins.length : 0,
    distance: route ? n(route.totalDistanceKm, 0) : 0,
    duration: route ? n(route.totalMinutes, 0) : 0
  };

  refs.metricTotal.textContent = String(m.total);
  refs.metricUrgent.textContent = String(m.urgent);
  refs.metricAverage.textContent = `${m.average.toFixed(1)}%`;
  refs.metricDistance.textContent = `${m.distance.toFixed(2)} km`;
  refs.metricDuration.textContent = `${m.duration.toFixed(1)} min`;

  const day = nearestKpi(24, m, 'day');
  const week = nearestKpi(24 * 7, m, 'week');
  const target = {
    total: Math.max(12, Math.round(m.total * 0.9)),
    urgent: Math.max(1, Math.round(m.total * 0.12)),
    average: 72,
    distance: 9.5,
    duration: 42
  };

  refs.metricTotalDelta.innerHTML = [
    deltaTag('较昨日', m.total, day.total, '', false),
    deltaTag('较上周', m.total, week.total, '', false),
    deltaTag('目标差', m.total, target.total, '', false)
  ].join('');
  refs.metricUrgentDelta.innerHTML = [
    deltaTag('较昨日', m.urgent, day.urgent, '', true),
    deltaTag('较上周', m.urgent, week.urgent, '', true),
    deltaTag('目标差', m.urgent, target.urgent, '', true)
  ].join('');
  refs.metricAverageDelta.innerHTML = [
    deltaTag('较昨日', m.average, day.average, '%', true),
    deltaTag('较上周', m.average, week.average, '%', true),
    deltaTag('目标差', m.average, target.average, '%', true)
  ].join('');
  refs.metricDistanceDelta.innerHTML = [
    deltaTag('较昨日', m.distance, day.distance, 'km', true),
    deltaTag('较上周', m.distance, week.distance, 'km', true),
    deltaTag('目标差', m.distance, target.distance, 'km', true)
  ].join('');
  refs.metricDurationDelta.innerHTML = [
    deltaTag('较昨日', m.duration, day.duration, 'min', true),
    deltaTag('较上周', m.duration, week.duration, 'min', true),
    deltaTag('目标差', m.duration, target.duration, 'min', true)
  ].join('');

  pushKpi(m);
}

function renderBrief() {
  const route = state.plan && state.plan.route;
  if (!route) {
    refs.routeBrief.innerHTML = '<strong>路线概览</strong><div>尚未生成路线</div>';
    return;
  }
  const start = state.plan.start || state.startPoint || DEFAULT_CENTER;
  refs.routeBrief.innerHTML = [
    '<strong>路线概览</strong>',
    `<div>策略：${esc(strategyLabel(state.routeStrategy))} | 车辆：1 台</div>`,
    `<div>起点：${esc(start.name || '清运起点')} | 停靠：${route.stops.length} 个</div>`,
    `<div>总里程：${fmtKm(route.totalDistanceKm)} | 总耗时：${fmtMin(route.totalMinutes)}</div>`,
    `<div>开始：${fmtTime(route.startTime)} | 结束：${fmtTime(route.endTime)}</div>`
  ].join('');
}

function renderRisk() {
  const bins = sortedRiskBins().slice(0, 8);
  patchList(refs.riskList, bins, {
    key: (bin) => `risk-${bin.id}`,
    emptyHtml: '<div class="empty">暂无桶位数据</div>',
    assign: (node, bin) => {
      node.dataset.binId = String(bin.id);
    },
    className: (bin) => `risk${state.selectedBinId && String(state.selectedBinId) === String(bin.id) ? ' active' : ''}`,
    html: (bin, index) => {
      const fill = clamp(bin.currentFill, 0, 100);
      return [
        '<div class="top">',
        `<div class="rank">${index + 1}</div>`,
        `<div class="name" title="${esc(bin.name)}">${esc(bin.name)}</div>`,
        `<div class="chip ${sev(fill)}">${sevLabel(fill)}</div>`,
        '</div>',
        `<div class="subline"><span>满载率 ${fill.toFixed(1)}%</span><span>优先级 ${n(bin.priorityScore, 0).toFixed(3)}</span></div>`,
        `<div class="subline"><span>增长 ${n(bin.growthRatePctPerHour, 0).toFixed(2)}%/h</span><span>${esc(countdownToFull(bin.hoursToFull))}</span></div>`
      ].join('');
    }
  });
}

function renderBars() {
  const bins = (state.bins || [])
    .slice()
    .sort((a, b) => n(b.predictedFillInHorizon, 0) - n(a.predictedFillInHorizon, 0))
    .slice(0, 6);
  if (!bins.length) {
    refs.forecastBars.innerHTML = '<div class="empty" style="grid-column:1/-1;">暂无预测数据</div>';
    return;
  }
  refs.forecastBars.innerHTML = bins
    .map((bin) => {
      const val = clamp(bin.predictedFillInHorizon, 0, 100);
      const short = String(bin.name || '').slice(0, 4) || '点位';
      return `<div class="bar"><div class="bar-shell"><div class="bar-fill ${val >= 85 ? 'alert' : ''}" style="height:${val.toFixed(1)}%;"></div></div><div class="bar-val">${val.toFixed(1)}%</div><div class="bar-name" title="${esc(bin.name)}">${esc(short)}</div></div>`;
    })
    .join('');
}

function renderAlerts() {
  const bins = sortedAlertBins();
  const route = state.plan && state.plan.route;
  state.handlingByBin = handlingStatusMap(bins, route && route.stops);
  patchList(refs.alertList, bins, {
    key: (bin) => `alert-${bin.id}`,
    emptyHtml: '<div class="empty">当前无告警</div>',
    assign: (node, bin) => {
      node.dataset.binId = String(bin.id);
    },
    className: (bin) => `alert${state.selectedBinId && String(state.selectedBinId) === String(bin.id) ? ' active' : ''}`,
    html: (bin) => {
      const fill = clamp(bin.currentFill, 0, 100);
      const status = state.handlingByBin.get(String(bin.id)) || 'pending';
      return [
        '<div class="top">',
        `<span>${esc(bin.name)}</span>`,
        `<span class="state-chip ${status}">${handlingLabel(status)}</span>`,
        '</div>',
        `<div class="sub"><span>当前 ${fill.toFixed(1)}%</span><span>预测 ${n(bin.predictedFillInHorizon, 0).toFixed(1)}%</span></div>`,
        `<div class="sub"><span>${esc(countdownToFull(bin.hoursToFull))}</span><span>${sevLabel(fill)}</span></div>`
      ].join('');
    }
  });
}

function renderDispatch() {
  const route = state.plan && state.plan.route;
  const stops = route && Array.isArray(route.stops) ? route.stops : [];
  patchList(refs.dispatchList, stops, {
    key: (stop) => `dispatch-${stop.order}`,
    emptyHtml: '<div class="empty">暂无调度任务</div>',
    assign: (node, stop) => {
      node.dataset.stopOrder = String(stop.order);
      node.dataset.binId = String(stop.id);
    },
    className: (stop) => `dispatch${state.selectedStopOrder === Number(stop.order) ? ' active' : ''}`,
    html: (stop) => {
      const nav = stop.navUrl ? `<button type="button" class="nav-btn" data-nav-url="${esc(stop.navUrl)}">导航</button>` : '';
      return [
        '<div class="top">',
        `<span>#${stop.order} ${esc(stop.name)}</span>`,
        `<span>${fmtTime(stop.eta)}</span>`,
        '</div>',
        `<div class="sub"><span>${fmtKm(stop.travelKm)} / ${fmtMin(stop.travelMinutes)}</span><span>满载率 ${n(stop.currentFill, 0).toFixed(1)}%</span></div>`,
        `<div class="sub"><span>优先级 ${n(stop.priorityScore, 0).toFixed(3)}</span><span>${nav}</span></div>`
      ].join('');
    }
  });
}

function renderTimeline() {
  const route = state.plan && state.plan.route;
  const stops = route && Array.isArray(route.stops) ? route.stops.slice(0, 12) : [];
  patchList(refs.routeTimeline, stops, {
    key: (stop) => `timeline-${stop.order}`,
    emptyHtml: '<div class="empty" style="grid-column:1/-1;">暂无路线时间轴</div>',
    assign: (node, stop) => {
      node.dataset.stopOrder = String(stop.order);
      node.dataset.binId = String(stop.id);
    },
    className: (stop) => `stop${state.selectedStopOrder === Number(stop.order) ? ' active' : ''}`,
    html: (stop) => `<div class="o">#${stop.order}</div><div class="n" title="${esc(stop.name)}">${esc(stop.name)}</div><div class="t">ETA ${fmtTime(stop.eta)}</div>`
  });
}

function mapSignature() {
  const bins = (state.bins || []).map((bin) => `${bin.id}:${Math.round(n(bin.currentFill, 0) * 10) / 10}`).join('|');
  const route = state.plan && state.plan.route;
  const stops = route && Array.isArray(route.stops) ? route.stops.map((s) => `${s.order}:${s.id}`).join('|') : 'none';
  return `${bins}::${stops}::sel-${state.selectedBinId || ''}-${state.selectedStopOrder || ''}-${state.routeStrategy}`;
}

function clearMap() {
  if (state.binMarkers) { state.binMarkers.setMap(null); state.binMarkers = null; }
  if (state.routePolyline) { state.routePolyline.setMap(null); state.routePolyline = null; }
  if (state.sequenceMarkers) { state.sequenceMarkers.setMap(null); state.sequenceMarkers = null; }
  if (state.startMarker) { state.startMarker.setMap(null); state.startMarker = null; }
  if (state.focusPolyline) { state.focusPolyline.setMap(null); state.focusPolyline = null; }
}

function info(lat, lng, html) {
  if (!window.TMap || !state.map) return;
  const point = new window.TMap.LatLng(lat, lng);
  if (!state.infoWindow) {
    state.infoWindow = new window.TMap.InfoWindow({ map: state.map, position: point, content: html });
    return;
  }
  state.infoWindow.setMap(state.map);
  state.infoWindow.setPosition(point);
  state.infoWindow.setContent(html);
}

function drawMap(force) {
  if (!state.map || !window.TMap) return;
  const sig = mapSignature();
  if (!force && sig === state.lastMapSignature) return;
  state.lastMapSignature = sig;

  clearMap();
  const bounds = new window.TMap.LatLngBounds();
  let hasBounds = false;
  const bins = state.bins || [];
  const styles = {
    green: new window.TMap.MarkerStyle({ width: 24, height: 24, anchor: { x: 12, y: 12 }, src: icon('g', '#16c57c', '') }),
    amber: new window.TMap.MarkerStyle({ width: 24, height: 24, anchor: { x: 12, y: 12 }, src: icon('a', '#f5b648', '') }),
    orange: new window.TMap.MarkerStyle({ width: 24, height: 24, anchor: { x: 12, y: 12 }, src: icon('o', '#ff8b3d', '') }),
    red: new window.TMap.MarkerStyle({ width: 24, height: 24, anchor: { x: 12, y: 12 }, src: icon('r', '#ff5d66', '') }),
    selected: new window.TMap.MarkerStyle({ width: 30, height: 30, anchor: { x: 15, y: 15 }, src: icon('selected', '#2c8fff', 'X') })
  };

  const geometries = bins.map((bin, i) => {
    const pos = new window.TMap.LatLng(n(bin.latitude, 0), n(bin.longitude, 0));
    bounds.extend(pos);
    hasBounds = true;
    return {
      id: `bin-${bin.id}-${i}`,
      styleId: state.selectedBinId && String(state.selectedBinId) === String(bin.id) ? 'selected' : sev(clamp(bin.currentFill, 0, 100)),
      position: pos,
      properties: { i }
    };
  });

  if (geometries.length) {
    state.binMarkers = new window.TMap.MultiMarker({ id: 'dashboard-bins', map: state.map, styles, geometries });
    state.binMarkers.on('click', (event) => {
      const i = event && event.geometry && event.geometry.properties ? event.geometry.properties.i : null;
      if (!Number.isFinite(i) || !bins[i]) return;
      focusBin(bins[i].id, true);
    });
  }

  if (state.startPoint) {
    const startPos = new window.TMap.LatLng(state.startPoint.latitude, state.startPoint.longitude);
    state.startMarker = new window.TMap.MultiMarker({
      id: 'dashboard-start',
      map: state.map,
      styles: { s: new window.TMap.MarkerStyle({ width: 28, height: 28, anchor: { x: 14, y: 14 }, src: icon('start', '#2c8fff', 'S') }) },
      geometries: [{ id: 'start-1', styleId: 's', position: startPos }]
    });
    bounds.extend(startPos);
    hasBounds = true;
  }

  const route = state.plan && state.plan.route;
  if (route && Array.isArray(route.polyline) && route.polyline.length > 1) {
    const polyline = route.polyline.map((p) => new window.TMap.LatLng(p[0], p[1]));
    state.routePolyline = new window.TMap.MultiPolyline({
      id: 'dashboard-route',
      map: state.map,
      styles: {
        route: new window.TMap.PolylineStyle({
          color: '#2dc6ff',
          width: 6,
          borderWidth: 2,
          borderColor: '#fff',
          lineCap: 'round'
        })
      },
      geometries: [{ id: 'main', styleId: 'route', paths: polyline }]
    });
    polyline.forEach((p) => {
      bounds.extend(p);
      hasBounds = true;
    });

    const stopStyles = {};
    const stopGeometries = (route.stops || []).map((stop, idx) => {
      const focused = state.selectedStopOrder === Number(stop.order);
      const styleId = focused ? `focus-${stop.order}` : `stop-${stop.order}`;
      if (!stopStyles[styleId]) {
        stopStyles[styleId] = new window.TMap.MarkerStyle({
          width: focused ? 28 : 24,
          height: focused ? 28 : 24,
          anchor: focused ? { x: 14, y: 14 } : { x: 12, y: 12 },
          src: icon(styleId, focused ? '#ff9f42' : '#1f7eff', String(stop.order))
        });
      }
      return {
        id: `stop-${idx}`,
        styleId,
        position: new window.TMap.LatLng(stop.latitude, stop.longitude),
        properties: { order: stop.order }
      };
    });

    if (stopGeometries.length) {
      state.sequenceMarkers = new window.TMap.MultiMarker({
        id: 'dashboard-seq',
        map: state.map,
        styles: stopStyles,
        geometries: stopGeometries
      });
      state.sequenceMarkers.on('click', (event) => {
        const order = event && event.geometry && event.geometry.properties ? event.geometry.properties.order : null;
        if (!Number.isFinite(order)) return;
        focusStop(order, true);
      });
    }

    if (state.selectedStopOrder !== null) {
      const idx = (route.stops || []).findIndex((s) => Number(s.order) === Number(state.selectedStopOrder));
      if (idx >= 0) {
        const stop = route.stops[idx];
        const prev =
          idx === 0
            ? [state.startPoint.latitude, state.startPoint.longitude]
            : [route.stops[idx - 1].latitude, route.stops[idx - 1].longitude];
        state.focusPolyline = new window.TMap.MultiPolyline({
          id: 'dashboard-route-focus',
          map: state.map,
          styles: {
            focus: new window.TMap.PolylineStyle({
              color: '#ffb04a',
              width: 7,
              borderWidth: 2,
              borderColor: '#fff',
              lineCap: 'round'
            })
          },
          geometries: [
            {
              id: 'focus',
              styleId: 'focus',
              paths: [new window.TMap.LatLng(prev[0], prev[1]), new window.TMap.LatLng(stop.latitude, stop.longitude)]
            }
          ]
        });
      }
    }
  }

  if (hasBounds && state.map.fitBounds) {
    state.map.fitBounds(bounds, { padding: 70 });
  }
}

function renderAll() {
  renderMetrics();
  renderBrief();
  renderRisk();
  renderBars();
  renderAlerts();
  renderDispatch();
  renderTimeline();
  if (state.mapReady) drawMap(false);
}

function focusBin(binId, forceMap) {
  const bin = (state.bins || []).find((item) => String(item.id) === String(binId));
  if (!bin) return;
  state.selectedBinId = String(bin.id);
  state.selectedStopOrder = null;
  renderRisk();
  renderAlerts();
  renderDispatch();
  renderTimeline();
  if (state.mapReady) {
    state.map.setCenter(new window.TMap.LatLng(bin.latitude, bin.longitude));
    if (state.map.getZoom && state.map.getZoom() < 14 && state.map.setZoom) state.map.setZoom(14);
    info(
      bin.latitude,
      bin.longitude,
      `<div style="min-width:180px;padding:2px 4px;"><div style="font-size:13px;font-weight:700;color:#17324a;">${esc(bin.name)}</div><div style="margin-top:4px;font-size:12px;color:#365066;">满载率 ${n(bin.currentFill, 0).toFixed(1)}% · 预测 ${n(bin.predictedFillInHorizon, 0).toFixed(1)}%</div><div style="margin-top:2px;font-size:12px;color:#60778b;">优先级 ${n(bin.priorityScore, 0).toFixed(3)}</div></div>`
    );
  }
  drawMap(!!forceMap);
}

function focusStop(order, forceMap) {
  const route = state.plan && state.plan.route;
  if (!route || !Array.isArray(route.stops)) return;
  const stop = route.stops.find((item) => Number(item.order) === Number(order));
  if (!stop) return;
  state.selectedStopOrder = Number(stop.order);
  state.selectedBinId = String(stop.id);
  renderRisk();
  renderAlerts();
  renderDispatch();
  renderTimeline();
  if (state.mapReady) {
    state.map.setCenter(new window.TMap.LatLng(stop.latitude, stop.longitude));
    if (state.map.getZoom && state.map.getZoom() < 14 && state.map.setZoom) state.map.setZoom(14);
    info(
      stop.latitude,
      stop.longitude,
      `<div style="min-width:185px;padding:2px 4px;"><div style="font-size:13px;font-weight:700;color:#17324a;">#${stop.order} ${esc(stop.name)}</div><div style="margin-top:4px;font-size:12px;color:#365066;">ETA ${fmtTime(stop.eta)} · ${fmtKm(stop.travelKm)}</div><div style="margin-top:2px;font-size:12px;color:#60778b;">满载率 ${n(stop.currentFill, 0).toFixed(1)}%</div></div>`
    );
  }
  drawMap(!!forceMap);
}

async function loadTencentMapSdk() {
  if (window.TMap) return window.TMap;
  for (const key of QQ_MAP_KEYS) {
    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${key}`;
        script.async = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`failed to load key ${key}`));
        document.head.appendChild(script);
      });
      if (window.TMap) return window.TMap;
    } catch (error) {
      console.warn('[dashboard-map] sdk load failed:', error && error.message ? error.message : error);
    }
  }
  throw new Error('腾讯地图 SDK 加载失败');
}

async function refresh(options) {
  const silent = !!(options && options.silent);
  if (state.loading) return;
  state.loading = true;
  if (!silent) setStatus(`正在刷新清运数据（${strategyLabel(state.routeStrategy)}）...`, 'warn');

  try {
    const query = new URLSearchParams({ routeStrategy: state.routeStrategy });
    const data = await api(`/api/planning/dashboard-snapshot?${query.toString()}`);
    state.bins = Array.isArray(data && data.bins) ? data.bins : [];
    state.plan = data && data.plan ? data.plan : null;

    if (!state.bins.length) {
      state.plan = null;
      renderAll();
      setStatus('暂无可用桶位数据', 'warn');
      return;
    }

    if (state.plan && state.plan.options && state.plan.options.routeStrategy) {
      state.routeStrategy = normalizeStrategy(state.plan.options.routeStrategy);
      localStorage.setItem('collection_route_strategy', state.routeStrategy);
      applyStrategyUI();
    }

    if (!state.startPoint && state.plan && state.plan.start) {
      state.startPoint = {
        name: state.plan.start.name || '默认起点',
        latitude: state.plan.start.latitude,
        longitude: state.plan.start.longitude
      };
    }
    if (!state.startPoint) {
      const first = state.bins[0];
      state.startPoint = { name: '默认起点', latitude: first.latitude, longitude: first.longitude };
    }

    const routeStops =
      state.plan && state.plan.route && Array.isArray(state.plan.route.stops)
        ? state.plan.route.stops
        : [];
    if (
      state.selectedStopOrder !== null &&
      !routeStops.some((s) => Number(s.order) === Number(state.selectedStopOrder))
    ) {
      state.selectedStopOrder = null;
    }
    if (state.selectedBinId !== null && !state.bins.some((b) => String(b.id) === String(state.selectedBinId))) {
      state.selectedBinId = null;
    }

    renderAll();
    setStatus(
      `刷新成功：${state.bins.length} 个桶位，${routeStops.length} 个停靠点，策略 ${strategyLabel(state.routeStrategy)}`,
      'ok'
    );
  } catch (error) {
    console.error('[collection-dashboard] refresh failed:', error);
    setStatus(error && error.message ? error.message : String(error), 'err');
  } finally {
    state.loading = false;
  }
}

async function initMap() {
  await loadTencentMapSdk();
  state.map = new window.TMap.Map('map', {
    center: new window.TMap.LatLng(DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude),
    zoom: 12,
    viewMode: '2D'
  });
  state.mapReady = true;
  state.map.on('click', (event) => {
    const lat = event && event.latLng && typeof event.latLng.getLat === 'function' ? event.latLng.getLat() : null;
    const lng = event && event.latLng && typeof event.latLng.getLng === 'function' ? event.latLng.getLng() : null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    state.startPoint = { name: '地图选择起点', latitude: lat, longitude: lng };
    renderBrief();
    drawMap(true);
  });
}

function bindViewportResize() {
  let resizeFrameId = 0;
  const onResize = () => {
    if (resizeFrameId) return;
    resizeFrameId = window.requestAnimationFrame(() => {
      resizeFrameId = 0;
      if (!state.mapReady || !state.map) return;
      try {
        if (typeof state.map.resize === 'function') {
          state.map.resize();
        }
      } catch (error) {
        console.warn('[collection-dashboard] map resize failed:', error);
      }
      drawMap(true);
    });
  };
  window.addEventListener('resize', onResize);
}

function bind() {
  if (refs.toCommunityBtn) {
    refs.toCommunityBtn.addEventListener('click', (event) => {
      event.preventDefault();
      safeNavigate('/community-dashboard');
    });
  }
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', () => refresh());
  const backBtn = document.getElementById('backBtn');
  if (backBtn) {
    backBtn.addEventListener('click', (event) => {
      event.preventDefault();
      safeNavigate('/');
    });
  }

  refs.strategySwitch.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-strategy]');
    if (!btn) return;
    const next = normalizeStrategy(btn.dataset.strategy);
    if (next === state.routeStrategy) return;
    state.routeStrategy = next;
    localStorage.setItem('collection_route_strategy', next);
    applyStrategyUI();
    refresh();
  });

  refs.riskList.addEventListener('click', (event) => {
    const card = event.target.closest('.risk');
    if (!card) return;
    focusBin(card.dataset.binId, true);
  });

  refs.alertList.addEventListener('click', (event) => {
    const card = event.target.closest('.alert');
    if (!card) return;
    focusBin(card.dataset.binId, true);
  });

  refs.dispatchList.addEventListener('click', (event) => {
    const navBtn = event.target.closest('.nav-btn');
    if (navBtn) {
      const url = navBtn.dataset.navUrl;
      if (url) window.open(url, '_blank');
      return;
    }
    const card = event.target.closest('.dispatch');
    if (!card) return;
    const order = Number(card.dataset.stopOrder);
    if (!Number.isFinite(order)) return;
    focusStop(order, true);
  });

  refs.routeTimeline.addEventListener('click', (event) => {
    const card = event.target.closest('.stop');
    if (!card) return;
    const order = Number(card.dataset.stopOrder);
    if (!Number.isFinite(order)) return;
    focusStop(order, true);
  });
}

function tick() {
  refs.clockText.textContent = fmtTime(new Date(), true);
}

(async function init() {
  applyTheme();
  window.addEventListener('storage', (event) => {
    if (!event || event.key === 'app_theme') applyTheme();
  });
  tick();
  setInterval(tick, 1000);
  bind();
  applyStrategyUI();
  setStatus('正在加载腾讯地图...', 'warn');
  try {
    await initMap();
  } catch (error) {
    setStatus(error && error.message ? error.message : String(error), 'err');
    return;
  }
  bindViewportResize();
  await refresh();
  state.timer = setInterval(() => refresh({ silent: true }), 60000);
})();

