const baseUrl = window.__APP_BASE_URL__ || ''

const refs = {
  clockText: document.getElementById('clockText'),
  statusText: document.getElementById('statusText'),
  daysSelect: document.getElementById('daysSelect'),
  districtSelect: document.getElementById('districtSelect'),
  communitySelect: document.getElementById('communitySelect'),
  toCollectionBtn: document.getElementById('toCollectionBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  syncBtn: document.getElementById('syncBtn'),
  backBtn: document.getElementById('backBtn'),

  kpiCommunities: document.getElementById('kpiCommunities'),
  kpiCommunitiesMeta: document.getElementById('kpiCommunitiesMeta'),
  kpiActiveCommunities: document.getElementById('kpiActiveCommunities'),
  kpiActiveCommunitiesMeta: document.getElementById('kpiActiveCommunitiesMeta'),
  kpiActiveUsers: document.getElementById('kpiActiveUsers'),
  kpiActiveUsersMeta: document.getElementById('kpiActiveUsersMeta'),
  kpiEvents: document.getElementById('kpiEvents'),
  kpiEventsMeta: document.getElementById('kpiEventsMeta'),
  kpiLowConf: document.getElementById('kpiLowConf'),
  kpiLowConfMeta: document.getElementById('kpiLowConfMeta'),
  kpiAvgConf: document.getElementById('kpiAvgConf'),
  kpiAvgConfMeta: document.getElementById('kpiAvgConfMeta'),

  communityRank: document.getElementById('communityRank'),
  categoryDonutSvg: document.getElementById('categoryDonutSvg'),
  categoryDonutLegend: document.getElementById('categoryDonutLegend'),
  trendSvg: document.getElementById('trendSvg'),
  districtRadarSvg: document.getElementById('districtRadarSvg'),
  districtGrid: document.getElementById('districtGrid'),
  communityList: document.getElementById('communityList'),
  alertList: document.getElementById('alertList'),
  alertSummary: document.getElementById('alertSummary')
};

const state = {
  options: [],
  districts: [],
  loading: false,
  lastOverview: null,
  lastBreakdown: null,
  lastTrend: null,
  revealed: false
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

function setHtml(el, html) {
  if (!el) return;
  el.innerHTML = html;
}

const ALERT_META = {
  p1: { label: 'P1', order: 1 },
  p2: { label: 'P2', order: 2 },
  p3: { label: 'P3', order: 3 }
};

function applyTheme() {
  const theme = localStorage.getItem('app_theme') === 'light' ? 'light' : 'dark';
  document.body.classList.toggle('light-theme', theme === 'light');
}

function setStatus(text, cls) {
  if (!refs.statusText) return;
  refs.statusText.textContent = text || '';
  refs.statusText.className = `status${cls ? ` ${cls}` : ''}`;
}

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function n(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function fmtPercent(value, digits = 1) {
  const v = n(value, 0);
  return `${v.toFixed(digits)}%`;
}

function fmtNumber(value) {
  return n(value, 0).toLocaleString('zh-CN');
}

function fmtConfidence(value) {
  const v = n(value, NaN);
  if (!Number.isFinite(v)) return '--';
  return fmtPercent(v * 100, 1);
}

function districtToneClass(district) {
  const normalized = String(district || '').replace(/\s+/g, '');
  if (normalized.includes('市南')) return 'tone-shinan';
  if (normalized.includes('黄岛')) return 'tone-huangdao';
  return 'tone-other';
}

function animateValue(el, target, formatter, duration = 560) {
  if (!el) return;

  const to = n(target, 0);
  const from = n(el.dataset.value, 0);
  if (!Number.isFinite(to)) {
    el.textContent = formatter(target);
    el.dataset.value = '0';
    return;
  }

  if (Math.abs(to - from) < 0.0001) {
    el.textContent = formatter(to);
    el.dataset.value = String(to);
    return;
  }

  if (el.__rafId) cancelAnimationFrame(el.__rafId);
  const start = performance.now();
  const delta = to - from;

  const tick = (now) => {
    const progress = clamp((now - start) / duration, 0, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = from + delta * eased;
    el.textContent = formatter(current);

    if (progress < 1) {
      el.__rafId = requestAnimationFrame(tick);
      return;
    }

    el.textContent = formatter(to);
    el.dataset.value = String(to);
    el.__rafId = 0;
  };

  el.__rafId = requestAnimationFrame(tick);
}

function applyRevealStagger() {
  const targets = Array.from(document.querySelectorAll('.card, .block'));
  targets.forEach((el, idx) => {
    el.classList.add('reveal');
    el.style.setProperty('--delay', `${Math.min(idx, 14) * 45}ms`);
    requestAnimationFrame(() => {
      el.classList.add('is-show');
    });
  });
}

function buildQuery() {
  const query = new URLSearchParams();
  query.set('days', String((refs.daysSelect && refs.daysSelect.value) || '30'));

  const district = String((refs.districtSelect && refs.districtSelect.value) || '').trim();
  if (district && district !== 'undefined' && district !== 'null') query.set('district', district);

  const communityCode = String((refs.communitySelect && refs.communitySelect.value) || '').trim();
  if (communityCode && communityCode !== 'undefined' && communityCode !== 'null') {
    query.set('communityCode', communityCode);
  }

  return query;
}

function renderClock() {
  if (!refs.clockText) return;
  refs.clockText.textContent = new Date().toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function patchSelectOptions(select, items) {
  if (!select) return;
  const oldValue = select.value;
  select.innerHTML = items
    .map((item) => `<option value="${esc(item.value)}">${esc(item.label)}</option>`)
    .join('');

  if (items.some((item) => String(item.value) === String(oldValue))) {
    select.value = oldValue;
  } else if (items.length > 0) {
    select.value = String(items[0].value);
  }
}

function districtOptionsForSelect() {
  const out = [{ value: '', label: '全部区' }];
  state.districts.forEach((item) => {
    out.push({
      value: item.district,
      label: `${item.district} (${item.count})`
    });
  });
  return out;
}

function communityOptionsForSelect() {
  const district = String((refs.districtSelect && refs.districtSelect.value) || '').trim();
  const scoped = district
    ? state.options.filter((item) => item.district === district)
    : state.options.slice();

  const out = [{ value: '', label: '全部社区' }];
  scoped.forEach((item) => {
    out.push({
      value: item.code,
      label: `${item.community}${district ? '' : ` (${item.district})`}`
    });
  });
  return out;
}

function bindToolbar() {
  if (refs.districtSelect) {
    refs.districtSelect.addEventListener('change', () => {
      patchSelectOptions(refs.communitySelect, communityOptionsForSelect());
      refreshDashboard();
    });
  }
  if (refs.communitySelect) refs.communitySelect.addEventListener('change', refreshDashboard);
  if (refs.daysSelect) refs.daysSelect.addEventListener('change', refreshDashboard);
  if (refs.refreshBtn) refs.refreshBtn.addEventListener('click', refreshDashboard);
  if (refs.toCollectionBtn) {
    refs.toCollectionBtn.addEventListener('click', (event) => {
      event.preventDefault();
      safeNavigate('/collection-dashboard');
    });
  }
  if (refs.backBtn) {
    refs.backBtn.addEventListener('click', (event) => {
      event.preventDefault();
      safeNavigate('/');
    });
  }
  if (refs.syncBtn) refs.syncBtn.addEventListener('click', syncDaily);
}

async function loadOptions() {
  const data = await api('/api/admin/community/options');
  state.options = Array.isArray(data.options) ? data.options : [];
  state.districts = Array.isArray(data.districts) ? data.districts : [];

  patchSelectOptions(refs.districtSelect, districtOptionsForSelect());
  patchSelectOptions(refs.communitySelect, communityOptionsForSelect());
}

function renderKpi(overview) {
  const totals = (overview && overview.totals) || {};
  const range = overview && overview.range ? `${overview.range.startDate} ~ ${overview.range.endDate}` : '--';

  animateValue(refs.kpiCommunities, n(totals.communitiesTotal), (v) => fmtNumber(Math.round(v)));
  if (refs.kpiCommunitiesMeta) refs.kpiCommunitiesMeta.textContent = `统计范围：${range}`;

  animateValue(refs.kpiActiveCommunities, n(totals.communitiesActive), (v) => fmtNumber(Math.round(v)));
  if (refs.kpiActiveCommunitiesMeta) {
    refs.kpiActiveCommunitiesMeta.textContent = `活跃率 ${fmtPercent(n(totals.communitiesActive) / Math.max(1, n(totals.communitiesTotal)) * 100)}`;
  }

  animateValue(refs.kpiActiveUsers, n(totals.activeUsers), (v) => fmtNumber(Math.round(v)), 620);
  if (refs.kpiActiveUsersMeta) refs.kpiActiveUsersMeta.textContent = '去重活跃用户';

  animateValue(refs.kpiEvents, n(totals.totalEvents), (v) => fmtNumber(Math.round(v)), 620);
  if (refs.kpiEventsMeta) refs.kpiEventsMeta.textContent = `在线 ${fmtNumber(totals.onlineEvents)} | 设备 ${fmtNumber(totals.deviceEvents)}`;

  animateValue(refs.kpiLowConf, n(totals.lowConfidenceRate), (v) => fmtPercent(v));
  if (refs.kpiLowConfMeta) refs.kpiLowConfMeta.textContent = '低于 60% 置信度';

  const avgConf = n(totals.avgConfidence, NaN);
  if (Number.isFinite(avgConf)) {
    animateValue(refs.kpiAvgConf, avgConf * 100, (v) => fmtPercent(v));
  } else {
    if (refs.kpiAvgConf) {
      refs.kpiAvgConf.textContent = '--';
      refs.kpiAvgConf.dataset.value = '0';
    }
  }
  if (refs.kpiAvgConfMeta) refs.kpiAvgConfMeta.textContent = '全量加权平均';
}

function rankBadgeClass(index) {
  if (index === 0) return 'top1';
  if (index === 1) return 'top2';
  if (index === 2) return 'top3';
  return '';
}

function renderCommunityRank(breakdown) {
  if (!refs.communityRank) return;
  const rows = Array.isArray(breakdown && breakdown.rows) ? breakdown.rows : [];
  const top = rows.slice(0, 12);
  if (!top.length) {
    setHtml(refs.communityRank, '<div class="empty">暂无社区数据</div>');
    return;
  }

  const maxScore = Math.max(1, ...top.map((item) => n(item.engagementScore, 0)));
  setHtml(refs.communityRank, top
    .map((row, idx) => {
      const score = n(row.engagementScore, 0);
      const ratio = clamp((score / maxScore) * 100, 0, 100);
      const badgeCls = rankBadgeClass(idx);
      const toneCls = districtToneClass(row.district);

      return [
        `<div class="item ${toneCls}">`,
        '<div class="top">',
        '<div class="rank-left">',
        `<span class="rank-badge ${badgeCls}">${idx + 1}</span>`,
        `<div class="name">${esc(row.community)}</div>`,
        '</div>',
        `<div class="score">${fmtNumber(score)}</div>`,
        '</div>',
        `<div class="score-track"><div class="score-fill" style="width:${ratio.toFixed(1)}%"></div></div>`,
        `<div class="sub"><span>${esc(row.district)}</span><span>活跃 ${fmtNumber(row.activeUsers)}</span></div>`,
        `<div class="sub"><span>分类 ${fmtNumber(row.totalEvents)}</span><span>低置信 ${fmtPercent(row.lowConfidenceRate)}</span></div>`,
        '</div>'
      ].join('');
    })
    .join(''));
}

function renderCategoryDonut(breakdown) {
  const rows = Array.isArray(breakdown && breakdown.rows) ? breakdown.rows : [];
  const categorySum = {};
  rows.forEach((row) => {
    const categories = row && row.categories && typeof row.categories === 'object' ? row.categories : {};
    Object.keys(categories).forEach((key) => {
      categorySum[key] = (categorySum[key] || 0) + n(categories[key], 0);
    });
  });

  const entries = Object.entries(categorySum)
    .map(([name, value]) => ({ name, value: n(value, 0) }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);

  if (!entries.length) {
    if (refs.categoryDonutSvg) refs.categoryDonutSvg.innerHTML = '';
    if (refs.categoryDonutLegend) refs.categoryDonutLegend.innerHTML = '<div class="empty">暂无分类结构数据</div>';
    return;
  }

  const palette = ['#2bc6de', '#24d392', '#ffbf57', '#5e91ff', '#f37f8f', '#8d7dff'];
  const total = entries.reduce((sum, item) => sum + item.value, 0) || 1;
  const cx = 120;
  const cy = 110;
  const radius = 74;
  const stroke = 34;

  let offset = 0;
  const circles = entries.map((item, idx) => {
    const ratio = item.value / total;
    const dash = Math.max(0.003, ratio) * 2 * Math.PI * radius;
    const color = palette[idx % palette.length];
    const node = `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-dasharray="${dash.toFixed(2)} ${(2 * Math.PI * radius).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" stroke-linecap="butt" transform="rotate(-90 ${cx} ${cy})"></circle>`;
    offset += dash;
    return node;
  });

  if (refs.categoryDonutSvg) {
    refs.categoryDonutSvg.innerHTML = [
      `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="rgba(116,216,232,.16)" stroke-width="${stroke}"></circle>`,
      ...circles,
      `<circle cx="${cx}" cy="${cy}" r="${radius - stroke / 2 - 3}" fill="rgba(5,31,40,.76)"></circle>`,
      `<text x="${cx}" y="${cy - 6}" text-anchor="middle" fill="currentColor" font-size="24" font-family="Rajdhani, DIN Alternate, sans-serif">${fmtNumber(total)}</text>`,
      `<text x="${cx}" y="${cy + 16}" text-anchor="middle" fill="var(--muted)" font-size="11">总分类次数</text>`
    ].join('');
  }

  if (refs.categoryDonutLegend) {
    refs.categoryDonutLegend.innerHTML = entries
      .slice(0, 6)
      .map((item, idx) => {
        const ratio = (item.value / total) * 100;
        const color = palette[idx % palette.length];
        return [
          '<div class="donut-item">',
          `<span class="donut-key"><i class="donut-color" style="background:${color}"></i>${esc(item.name)}</span>`,
          `<b>${ratio.toFixed(1)}%</b>`,
          '</div>'
        ].join('');
      })
      .join('');
  }
}

function polyline(points) {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

function renderTrend(trend) {
  if (!refs.trendSvg) return;
  const daily = Array.isArray(trend && trend.daily) ? trend.daily : [];
  if (!daily.length) {
    setHtml(refs.trendSvg, '');
    return;
  }

  const width = 860;
  const height = 300;
  const pad = { top: 18, right: 16, bottom: 28, left: 38 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const maxEvents = Math.max(1, ...daily.map((d) => n(d.totalEvents, 0)));
  const maxActive = Math.max(1, ...daily.map((d) => n(d.activeUsers, 0)));
  const size = daily.length - 1 || 1;

  const eventPoints = daily.map((item, idx) => ({
    x: pad.left + (plotW * idx) / size,
    y: pad.top + plotH - (n(item.totalEvents, 0) / maxEvents) * plotH
  }));
  const activePoints = daily.map((item, idx) => ({
    x: pad.left + (plotW * idx) / size,
    y: pad.top + plotH - (n(item.activeUsers, 0) / maxActive) * plotH
  }));

  const riskValues = daily.map((item) => {
    const low = n(item.lowConfidenceRate, NaN);
    if (Number.isFinite(low)) return clamp(low, 0, 100);
    const active = n(item.activeUsers, 0);
    const events = n(item.totalEvents, 0);
    const concentration = events > 0 ? clamp((events / Math.max(active, 1)) * 2.2, 0, 50) : 0;
    return clamp(concentration + 18, 0, 100);
  });
  const riskPoints = riskValues.map((value, idx) => ({
    x: pad.left + (plotW * idx) / size,
    y: pad.top + plotH - (value / 100) * plotH
  }));

  const grid = [];
  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + (plotH * i) / 4;
    grid.push(`<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="rgba(116,216,232,.16)" stroke-width="1" />`);
  }

  const thresholdTop = pad.top + plotH - 0.55 * plotH;
  const thresholdBottom = pad.top + plotH - 0.35 * plotH;
  const activeArea = [
    `M ${activePoints[0].x},${pad.top + plotH}`,
    ...activePoints.map((p) => `L ${p.x},${p.y}`),
    `L ${activePoints[activePoints.length - 1].x},${pad.top + plotH}`,
    'Z'
  ].join(' ');

  const labels = [];
  const step = Math.max(1, Math.floor(daily.length / 6));
  for (let i = 0; i < daily.length; i += step) {
    const x = pad.left + (plotW * i) / size;
    labels.push(
      `<text x="${x}" y="${height - 8}" fill="#84b8c2" font-size="10" text-anchor="middle">${esc(String(daily[i].date).slice(5))}</text>`
    );
  }

  setHtml(refs.trendSvg, [
    ...grid,
    `<rect x="${pad.left}" y="${thresholdTop}" width="${plotW}" height="${thresholdBottom - thresholdTop}" fill="rgba(255,191,87,.10)" />`,
    `<path d="${activeArea}" fill="rgba(36,211,146,.18)"></path>`,
    `<polyline class="events-line" points="${polyline(eventPoints)}" fill="none" stroke="#2bc6de" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />`,
    `<polyline class="active-line" points="${polyline(activePoints)}" fill="none" stroke="#24d392" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />`,
    `<polyline points="${polyline(riskPoints)}" fill="none" stroke="#ffbf57" stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round" stroke-linejoin="round" />`,
    ...eventPoints.map((p) => `<circle class="events-dot" cx="${p.x}" cy="${p.y}" r="2.3" fill="#2bc6de" />`),
    ...activePoints.map((p) => `<circle class="active-dot" cx="${p.x}" cy="${p.y}" r="2.3" fill="#24d392" />`),
    ...riskPoints.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="2.2" fill="#ffbf57" />`),
    `<text x="${width - pad.right}" y="${thresholdTop - 4}" fill="#ffdeab" font-size="10" text-anchor="end">风险阈值带</text>`,
    ...labels
  ].join(''));
}

function renderDistricts(overview) {
  if (!refs.districtGrid) return;
  const rows = Array.isArray(overview && overview.districts) ? overview.districts : [];
  if (!rows.length) {
    setHtml(refs.districtGrid, '<div class="empty">暂无区级数据</div>');
    return;
  }

  setHtml(refs.districtGrid, rows
    .map((item) => {
      const toneCls = districtToneClass(item.district);
      return [
        `<div class="district ${toneCls}">`,
        `<div class="name">${esc(item.district)}</div>`,
        `<div class="meta"><span>社区活跃 ${fmtNumber(item.communitiesActive)}/${fmtNumber(item.communitiesTotal)}</span><span>活跃用户 ${fmtNumber(item.activeUsers)}</span></div>`,
        `<div class="meta"><span>分类 ${fmtNumber(item.totalEvents)}</span><span>低置信 ${fmtPercent(item.lowConfidenceRate)}</span></div>`,
        '</div>'
      ].join('');
    })
    .join(''));
}

function renderDistrictRadar(overview) {
  const rows = Array.isArray(overview && overview.districts) ? overview.districts : [];
  if (!refs.districtRadarSvg) return;
  if (!rows.length) {
    refs.districtRadarSvg.innerHTML = '';
    return;
  }

  const agg = rows.reduce(
    (acc, item) => {
      acc.communitiesTotal += n(item.communitiesTotal, 0);
      acc.communitiesActive += n(item.communitiesActive, 0);
      acc.activeUsers += n(item.activeUsers, 0);
      acc.totalEvents += n(item.totalEvents, 0);
      acc.lowConfidenceRate += n(item.lowConfidenceRate, 0);
      return acc;
    },
    { communitiesTotal: 0, communitiesActive: 0, activeUsers: 0, totalEvents: 0, lowConfidenceRate: 0 }
  );
  const districtCount = Math.max(1, rows.length);
  const activeRatio = agg.communitiesActive / Math.max(1, agg.communitiesTotal);
  const userScore = clamp((agg.activeUsers / Math.max(1, agg.communitiesTotal * 8)) * 100, 0, 100);
  const eventScore = clamp((agg.totalEvents / Math.max(1, agg.communitiesTotal * 45)) * 100, 0, 100);
  const qualityScore = clamp(100 - agg.lowConfidenceRate / districtCount * 2.4, 0, 100);
  const balanceScore = clamp((activeRatio * 0.6 + qualityScore / 100 * 0.4) * 100, 0, 100);
  const responseScore = clamp((eventScore * 0.45 + qualityScore * 0.55), 0, 100);

  const metrics = [
    { name: '参与度', score: clamp(activeRatio * 100, 0, 100) },
    { name: '活跃强度', score: userScore },
    { name: '响应效率', score: responseScore },
    { name: '分类质量', score: qualityScore },
    { name: '治理均衡', score: balanceScore }
  ];

  const cx = 160;
  const cy = 130;
  const radius = 94;
  const levels = 5;
  const angleStep = (Math.PI * 2) / metrics.length;
  const start = -Math.PI / 2;

  const bgPolygons = [];
  for (let level = 1; level <= levels; level += 1) {
    const r = (radius * level) / levels;
    const points = metrics
      .map((_, idx) => {
        const a = start + idx * angleStep;
        return `${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`;
      })
      .join(' ');
    bgPolygons.push(`<polygon points="${points}" fill="none" stroke="rgba(116,216,232,.18)" stroke-width="1"></polygon>`);
  }

  const axes = metrics
    .map((item, idx) => {
      const a = start + idx * angleStep;
      const x = cx + Math.cos(a) * radius;
      const y = cy + Math.sin(a) * radius;
      const lx = cx + Math.cos(a) * (radius + 18);
      const ly = cy + Math.sin(a) * (radius + 18);
      const anchor = lx >= cx ? 'start' : 'end';
      return [
        `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="rgba(116,216,232,.24)" stroke-width="1"></line>`,
        `<text x="${lx}" y="${ly}" fill="var(--muted)" font-size="11" text-anchor="${anchor}" dominant-baseline="middle">${esc(item.name)}</text>`
      ].join('');
    })
    .join('');

  const dataPoints = metrics
    .map((item, idx) => {
      const a = start + idx * angleStep;
      const r = radius * (clamp(item.score, 0, 100) / 100);
      return `${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`;
    })
    .join(' ');

  const avgScore = metrics.reduce((sum, item) => sum + item.score, 0) / metrics.length;
  refs.districtRadarSvg.innerHTML = [
    ...bgPolygons,
    axes,
    `<polygon points="${dataPoints}" fill="rgba(47,111,237,.22)" stroke="#5ea2ff" stroke-width="2"></polygon>`,
    ...metrics.map((item, idx) => {
      const a = start + idx * angleStep;
      const r = radius * (clamp(item.score, 0, 100) / 100);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      return `<circle cx="${x}" cy="${y}" r="3" fill="#8fc0ff"></circle>`;
    }),
    `<text x="${cx}" y="${cy - 2}" text-anchor="middle" fill="currentColor" font-size="24" font-family="Rajdhani, DIN Alternate, sans-serif">${avgScore.toFixed(0)}</text>`,
    `<text x="${cx}" y="${cy + 16}" text-anchor="middle" fill="var(--muted)" font-size="11">治理综合评分</text>`
  ].join('');
}

function pushAlert(alerts, level, title, detail) {
  const meta = ALERT_META[level] || ALERT_META.p3;
  alerts.push({
    level,
    order: meta.order,
    chip: meta.label,
    title,
    detail
  });
}

function buildAlerts(breakdown, trend) {
  const alerts = [];
  const rows = Array.isArray(breakdown && breakdown.rows) ? breakdown.rows : [];

  rows.forEach((item) => {
    const community = String(item.community || '未知社区');
    const lowConf = n(item.lowConfidenceRate, 0);
    const totalEvents = n(item.totalEvents, 0);
    const activeUsers = n(item.activeUsers, 0);

    if (lowConf >= 30 && totalEvents >= 30) {
      pushAlert(
        alerts,
        'p1',
        `${community} 低置信度偏高`,
        `当前低置信度占比 ${fmtPercent(lowConf)}，建议排查设备质量并补充分类指引。`
      );
    } else if (lowConf >= 20 && totalEvents >= 20) {
      pushAlert(
        alerts,
        'p2',
        `${community} 低置信度偏高`,
        `当前低置信度占比 ${fmtPercent(lowConf)}，建议尽快抽检样本并优化标注。`
      );
    } else if (lowConf >= 15 && totalEvents >= 15) {
      pushAlert(
        alerts,
        'p3',
        `${community} 低置信度抬升`,
        `当前低置信度占比 ${fmtPercent(lowConf)}，建议持续观察未来 3 天变化。`
      );
    }

    if (activeUsers <= 1 && totalEvents >= 35) {
      pushAlert(
        alerts,
        'p1',
        `${community} 使用集中度过高`,
        `分类量 ${fmtNumber(totalEvents)}，但活跃用户仅 ${fmtNumber(activeUsers)}，疑似单点依赖。`
      );
    } else if (activeUsers <= 2 && totalEvents >= 30) {
      pushAlert(
        alerts,
        'p2',
        `${community} 使用集中度过高`,
        `分类量 ${fmtNumber(totalEvents)}，活跃用户仅 ${fmtNumber(activeUsers)}，建议扩展参与用户。`
      );
    } else if (activeUsers <= 3 && totalEvents >= 25) {
      pushAlert(
        alerts,
        'p3',
        `${community} 用户活跃偏集中`,
        `活跃用户 ${fmtNumber(activeUsers)}，建议做轮班分流，提升稳定性。`
      );
    }
  });

  const daily = Array.isArray(trend && trend.daily) ? trend.daily : [];
  if (daily.length >= 2) {
    const last = daily[daily.length - 1];
    const prev = daily[daily.length - 2];
    const lastEvents = n(last.totalEvents, 0);
    const prevEvents = n(prev.totalEvents, 0);
    if (prevEvents >= 20) {
      const dropRate = (prevEvents - lastEvents) / prevEvents;
      if (dropRate >= 0.55) {
        pushAlert(
          alerts,
          'p1',
          '整体活跃度明显下滑',
          `最近一天分类量 ${fmtNumber(lastEvents)}，较前一天 ${fmtNumber(prevEvents)} 下滑超过 55%。`
        );
      } else if (dropRate >= 0.4) {
        pushAlert(
          alerts,
          'p2',
          '整体活跃度下滑',
          `最近一天分类量 ${fmtNumber(lastEvents)}，较前一天 ${fmtNumber(prevEvents)} 下滑超过 40%。`
        );
      } else if (dropRate >= 0.3) {
        pushAlert(
          alerts,
          'p3',
          '整体活跃度轻度回落',
          `最近一天分类量 ${fmtNumber(lastEvents)}，较前一天 ${fmtNumber(prevEvents)} 下滑超过 30%。`
        );
      }
    }
  }

  alerts.sort((a, b) => a.order - b.order);
  return alerts.slice(0, 12);
}

function renderCommunityList(breakdown) {
  if (!refs.communityList) return;
  const rows = Array.isArray(breakdown && breakdown.rows) ? breakdown.rows : [];
  const top = rows.slice(0, 12);
  if (!top.length) {
    setHtml(refs.communityList, '<div class="empty">暂无社区明细</div>');
    return;
  }

  setHtml(refs.communityList, top
    .map((item) => {
      const categories = item.categories || {};
      const topCats = Object.entries(categories)
        .sort((a, b) => n(b[1], 0) - n(a[1], 0))
        .slice(0, 2)
        .map(([k, v]) => `${k} ${fmtNumber(v)}`)
        .join(' | ') || '暂无分类细分';

      const toneCls = districtToneClass(item.district);
      return [
        `<div class="item ${toneCls}">`,
        '<div class="top">',
        `<div class="name">${esc(item.community)}</div>`,
        `<div class="score">${fmtNumber(item.totalEvents)}</div>`,
        '</div>',
        `<div class="sub"><span>${esc(item.district)}</span><span>活跃 ${fmtNumber(item.activeUsers)}</span></div>`,
        `<div class="sub"><span>${esc(topCats)}</span><span>低置信 ${fmtPercent(item.lowConfidenceRate)}</span></div>`,
        '</div>'
      ].join('');
    })
    .join(''));
}

function renderAlerts(breakdown, trend) {
  if (!refs.alertList) return;
  const alerts = buildAlerts(breakdown, trend);
  const summary = { p1: 0, p2: 0, p3: 0 };
  alerts.forEach((item) => {
    if (summary[item.level] !== undefined) summary[item.level] += 1;
  });

  if (refs.alertSummary) {
    refs.alertSummary.textContent = `P1 ${summary.p1} | P2 ${summary.p2} | P3 ${summary.p3}`;
  }

  if (!alerts.length) {
    setHtml(refs.alertList, '<div class="empty">暂无显著异常</div>');
    return;
  }

  setHtml(refs.alertList, alerts
    .map((item) => {
      return [
        `<div class="alert ${item.level}">`,
        '<div class="alert-top">',
        `<div class="t">${esc(item.title)}</div>`,
        `<span class="alert-chip">${esc(item.chip)}</span>`,
        '</div>',
        `<div class="d">${esc(item.detail)}</div>`,
        '</div>'
      ].join('');
    })
    .join(''));
}

async function refreshDashboard() {
  if (state.loading) return;
  state.loading = true;
  setStatus('数据加载中...', 'warn');

  try {
    const query = buildQuery();
    const [overview, breakdown, trend] = await Promise.all([
      api(`/api/admin/community/overview?${query.toString()}`),
      api(`/api/admin/community/by-community?${query.toString()}`),
      api(`/api/admin/community/trend?${query.toString()}`)
    ]);

    state.lastOverview = overview;
    state.lastBreakdown = breakdown;
    state.lastTrend = trend;

    renderKpi(overview);
    renderCommunityRank(breakdown);
    renderCategoryDonut(breakdown);
    renderTrend(trend);
    renderDistrictRadar(overview);
    renderDistricts(overview);
    renderCommunityList(breakdown);
    renderAlerts(breakdown, trend);

    if (!state.revealed) {
      applyRevealStagger();
      state.revealed = true;
    }

    const syncInfo = overview && overview.sync ? overview.sync : null;
    const suffix = syncInfo && syncInfo.rebuilt ? '（已更新日汇总）' : '';
    setStatus(`更新完成${suffix}`, 'ok');
  } catch (error) {
    console.error('[community-dashboard] refresh failed:', error);
    setStatus(`刷新失败：${error && error.message ? error.message : '未知错误'}`, 'err');
  } finally {
    state.loading = false;
  }
}

async function syncDaily() {
  if (state.loading) return;
  state.loading = true;
  setStatus('正在重算日汇总...', 'warn');
  try {
    const query = buildQuery();
    await api(`/api/admin/community/sync?${query.toString()}`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    setStatus('重算完成，刷新数据中...', 'ok');
    state.loading = false;
    await refreshDashboard();
  } catch (error) {
    console.error('[community-dashboard] sync failed:', error);
    setStatus(`重算失败：${error && error.message ? error.message : '未知错误'}`, 'err');
    state.loading = false;
  }
}

async function init() {
  applyTheme();
  window.addEventListener('storage', (event) => {
    if (!event || event.key === 'app_theme') applyTheme();
  });
  bindToolbar();
  renderClock();
  setInterval(renderClock, 1000);

  try {
    await loadOptions();
    await refreshDashboard();
  } catch (error) {
    console.error('[community-dashboard] init failed:', error);
    setStatus(`初始化失败：${error && error.message ? error.message : '未知错误'}`, 'err');
  }
}

init();

