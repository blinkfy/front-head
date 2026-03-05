const baseUrl = window.__APP_BASE_URL__ || ''

const state = {
  bins: [],
  plan: null,
  map: null,
  mapReady: false,
  binMarkers: null,
  routePolyline: null,
  sequenceMarkers: null,
  startMarker: null,
  infoWindow: null,
  startPoint: null
};

const QQ_MAP_KEYS = [
  'RZPBZ-AXLY3-ENO3Q-O3AZU-JGX4Q-KTFZU',
  'F4BBZ-THI6W-LLRR3-YG74H-NDW43-WCFDH'
];
const DEFAULT_CENTER = { latitude: 36.0671, longitude: 120.3826 };
const markerIconCache = new Map();

const refs = {
  metricTotal: document.getElementById('metricTotal'),
  metricUrgent: document.getElementById('metricUrgent'),
  metricAverage: document.getElementById('metricAverage'),
  metricDistance: document.getElementById('metricDistance'),
  routeSummary: document.getElementById('routeSummary'),
  routeList: document.getElementById('routeList'),
  statusText: document.getElementById('statusText'),
  binList: document.getElementById('binList'),
  urgentThreshold: document.getElementById('urgentThreshold'),
  planningHorizonHours: document.getElementById('planningHorizonHours'),
  speedKmh: document.getElementById('speedKmh'),
  serviceMinutesPerStop: document.getElementById('serviceMinutesPerStop'),
  maxStops: document.getElementById('maxStops'),
  minStops: document.getElementById('minStops'),
  startLat: document.getElementById('startLat'),
  startLng: document.getElementById('startLng')
};

function applyTheme() {
  const theme = localStorage.getItem('app_theme') === 'dark' ? 'dark' : 'light';
  document.body.classList.toggle('dark-theme', theme === 'dark');
  document.documentElement.setAttribute('data-theme', theme);
  
  // 同时也对根容器应用主题
  const legacyRoot = document.querySelector('.legacy-page-host');
  if (legacyRoot) {
    legacyRoot.classList.toggle('dark-theme', theme === 'dark');
  }
}

function setStatus(text, type) {
  refs.statusText.className = 'status' + (type ? ` ${type}` : '');
  refs.statusText.textContent = text || '';
}

function toNum(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function getLat(value) {
  if (!value) return null;
  if (typeof value.getLat === 'function') return value.getLat();
  if (Number.isFinite(value.lat)) return value.lat;
  if (Number.isFinite(value.latitude)) return value.latitude;
  return null;
}

function getLng(value) {
  if (!value) return null;
  if (typeof value.getLng === 'function') return value.getLng();
  if (Number.isFinite(value.lng)) return value.lng;
  if (Number.isFinite(value.longitude)) return value.longitude;
  return null;
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function markerSvg(fillColor, label, textColor = '#ffffff') {
  const safeLabel = escapeHtml(label || '');
  const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
          <circle cx="22" cy="22" r="14" fill="${fillColor}" stroke="#ffffff" stroke-width="3"></circle>
          <text x="22" y="26" text-anchor="middle" font-size="13" font-weight="700" fill="${textColor}" font-family="Arial, sans-serif">${safeLabel}</text>
        </svg>
      `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function getIconSrc(key, fillColor, label, textColor) {
  if (markerIconCache.has(key)) return markerIconCache.get(key);
  const src = markerSvg(fillColor, label, textColor);
  markerIconCache.set(key, src);
  return src;
}

function getBinStyleId(bin) {
  if (bin.selected === false) return 'muted';
  const fill = Number(bin.currentFill) || 0;
  if (fill >= 90) return 'urgent';
  if (fill >= 80) return 'high';
  if (fill >= 65) return 'warning';
  return 'normal';
}

async function loadTencentMapSdk() {
  if (window.TMap) return window.TMap;
  for (const key of QQ_MAP_KEYS) {
    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${key}`;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`failed to load key ${key}`));
        document.head.appendChild(script);
      });
      if (window.TMap) return window.TMap;
    } catch (error) {
      console.warn('[planning-map] sdk load failed:', error.message || error);
    }
  }
  throw new Error('腾讯地图 SDK 加载失败');
}

function clearMapOverlays() {
  if (state.binMarkers) {
    state.binMarkers.setMap(null);
    state.binMarkers = null;
  }
  if (state.routePolyline) {
    state.routePolyline.setMap(null);
    state.routePolyline = null;
  }
  if (state.sequenceMarkers) {
    state.sequenceMarkers.setMap(null);
    state.sequenceMarkers = null;
  }
  if (state.startMarker) {
    state.startMarker.setMap(null);
    state.startMarker = null;
  }
}

function showInfoWindow(lat, lng, contentHtml) {
  if (!window.TMap || !state.map) return;
  const position = new window.TMap.LatLng(lat, lng);
  if (!state.infoWindow) {
    state.infoWindow = new window.TMap.InfoWindow({
      map: state.map,
      position,
      content: contentHtml
    });
    return;
  }
  state.infoWindow.setMap(state.map);
  state.infoWindow.setPosition(position);
  state.infoWindow.setContent(contentHtml);
}

function authHeaders() {
  const token = localStorage.getItem('token') || '';
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = token;
  return headers;
}

async function api(path, options = {}) {
  const fullPath = path.startsWith('/') ? `${baseUrl}${path}` : path;
  const res = await fetch(fullPath, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.headers || {})
    }
  });
  const json = await res.json();
  if (!json || json.code !== 0) {
    throw new Error((json && json.msg) || `HTTP ${res.status}`);
  }
  return json.data;
}

function colorByFill(fill) {
  if (fill >= 90) return '#c63b3b';
  if (fill >= 80) return '#d06919';
  if (fill >= 65) return '#e0a100';
  return '#1fb57d';
}

function updateMetrics() {
  const total = state.bins.length;
  const urgent = state.bins.filter((bin) => bin.isUrgent).length;
  const average = total > 0
    ? state.bins.reduce((sum, bin) => sum + (Number(bin.currentFill) || 0), 0) / total
    : 0;

  refs.metricTotal.textContent = String(total);
  refs.metricUrgent.textContent = String(urgent);
  refs.metricAverage.textContent = `${average.toFixed(1)}%`;
  refs.metricDistance.textContent = state.plan && state.plan.route
    ? `${Number(state.plan.route.totalDistanceKm || 0).toFixed(2)} km`
    : '0 km';
}

function syncStartInputs() {
  if (!state.startPoint) return;
  refs.startLat.value = Number(state.startPoint.latitude).toFixed(6);
  refs.startLng.value = Number(state.startPoint.longitude).toFixed(6);
}

function readStartFromInputs() {
  const lat = toNum(refs.startLat.value);
  const lng = toNum(refs.startLng.value);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    state.startPoint = {
      name: '手动起点',
      latitude: lat,
      longitude: lng
    };
  }
}

function renderBinList() {
  if (!state.bins.length) {
    refs.binList.innerHTML = '<div class="empty">暂无桶位数据</div>';
    return;
  }

  refs.binList.innerHTML = state.bins.map((bin, index) => {
    const chipClass = bin.currentFill >= 90 ? 'urgent' : (bin.currentFill >= 80 ? 'warning' : '');
    const chipText = bin.currentFill >= 90
      ? 'Urgent'
      : (bin.currentFill >= 80 ? 'Warning' : 'Normal');
    const hoursText = bin.hoursToFull == null ? '--' : `${bin.hoursToFull.toFixed(1)}h`;
    return `
          <div class="bin-row" data-index="${index}">
            <div class="bin-head">
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" class="row-check" data-index="${index}" ${bin.selected !== false ? 'checked' : ''} />
                <span>${bin.name || 'Unnamed Bin'}</span>
              </label>
              <span class="chip ${chipClass}">${chipText}</span>
            </div>
            <div class="bin-sub">
              满载率 ${Number(bin.currentFill || 0).toFixed(1)}% · 预计满载 ${hoursText} · 斜率 ${Number(bin.growthRatePctPerHour || 0).toFixed(2)}%/h
            </div>
            <div class="bin-range">
              <input class="fill-range" data-index="${index}" type="range" min="0" max="100" step="0.5" value="${Number(bin.currentFill || 0)}" />
              <input class="fill-input" data-index="${index}" type="number" min="0" max="100" step="0.5" value="${Number(bin.currentFill || 0)}" />
            </div>
          </div>
        `;
  }).join('');
}

function updateBinFill(index, value) {
  const bin = state.bins[index];
  if (!bin) return;
  bin.currentFill = clamp(value, 0, 100);
  if (bin.hoursToFull != null && Number(bin.growthRatePctPerHour) > 0.05) {
    bin.hoursToFull = (100 - bin.currentFill) / Number(bin.growthRatePctPerHour);
  }
  bin.isUrgent = Number(bin.currentFill) >= Number(refs.urgentThreshold.value || 80);
  renderBinList();
  drawMap();
  updateMetrics();
}

function bindBinEvents() {
  refs.binList.addEventListener('input', (event) => {
    const target = event.target;
    const idx = Number(target.dataset.index);
    if (!Number.isFinite(idx)) return;
    if (target.classList.contains('fill-range') || target.classList.contains('fill-input')) {
      updateBinFill(idx, target.value);
    }
  });

  refs.binList.addEventListener('change', (event) => {
    const target = event.target;
    if (target.classList.contains('row-check')) {
      const idx = Number(target.dataset.index);
      if (!Number.isFinite(idx) || !state.bins[idx]) return;
      state.bins[idx].selected = !!target.checked;
      drawMap();
    }
  });

  refs.binList.addEventListener('click', (event) => {
    const row = event.target.closest('.bin-row');
    if (!row || !state.map) return;
    const idx = Number(row.dataset.index);
    const bin = state.bins[idx];
    if (!bin) return;
    state.map.setCenter(new window.TMap.LatLng(bin.latitude, bin.longitude));
    if ((state.map.getZoom && state.map.getZoom()) < 14 && state.map.setZoom) {
      state.map.setZoom(14);
    }
    showInfoWindow(
      bin.latitude,
      bin.longitude,
      `
            <div style="font-size:12px;line-height:1.5;">
              <b>${escapeHtml(bin.name || 'Unnamed Bin')}</b><br/>
              满载率 ${Number(bin.currentFill || 0).toFixed(1)}%<br/>
              预计满载: ${bin.hoursToFull == null ? '--' : `${Number(bin.hoursToFull).toFixed(1)}h`}<br/>
              优先级 ${Number(bin.priorityScore || 0).toFixed(3)}
            </div>
          `
    );
  });
}

function drawStartMarker() {
  if (!state.map || !state.startPoint || !window.TMap) return;
  const styles = {
    start: new window.TMap.MarkerStyle({
      width: 34,
      height: 34,
      anchor: { x: 17, y: 17 },
      src: getIconSrc('start', '#2f6ff0', 'S')
    })
  };
  state.startMarker = new window.TMap.MultiMarker({
    id: 'planning-start',
    map: state.map,
    styles,
    geometries: [
      {
        id: 'start-point',
        styleId: 'start',
        position: new window.TMap.LatLng(state.startPoint.latitude, state.startPoint.longitude)
      }
    ]
  });
}

function drawMap() {
  if (!state.map || !window.TMap) return;
  clearMapOverlays();

  const bounds = new window.TMap.LatLngBounds();
  let hasBounds = false;

  const binStyles = {
    normal: new window.TMap.MarkerStyle({
      width: 26,
      height: 26,
      anchor: { x: 13, y: 13 },
      src: getIconSrc('bin-normal', '#1fb57d', '')
    }),
    warning: new window.TMap.MarkerStyle({
      width: 26,
      height: 26,
      anchor: { x: 13, y: 13 },
      src: getIconSrc('bin-warning', '#e0a100', '')
    }),
    high: new window.TMap.MarkerStyle({
      width: 26,
      height: 26,
      anchor: { x: 13, y: 13 },
      src: getIconSrc('bin-high', '#d06919', '')
    }),
    urgent: new window.TMap.MarkerStyle({
      width: 26,
      height: 26,
      anchor: { x: 13, y: 13 },
      src: getIconSrc('bin-urgent', '#c63b3b', '')
    }),
    muted: new window.TMap.MarkerStyle({
      width: 24,
      height: 24,
      anchor: { x: 12, y: 12 },
      src: getIconSrc('bin-muted', '#8ea1b5', '')
    })
  };

  const binGeometries = state.bins.map((bin, index) => {
    const latLng = new window.TMap.LatLng(bin.latitude, bin.longitude);
    bounds.extend(latLng);
    hasBounds = true;
    return {
      id: 'bin-' + index,
      styleId: getBinStyleId(bin),
      title: bin.name || ('Bin-' + (index + 1)),
      position: latLng
    };
  });

  if (binGeometries.length) {
    state.binMarkers = new window.TMap.MultiMarker({
      id: 'planning-bins',
      map: state.map,
      styles: binStyles,
      geometries: binGeometries
    });
    state.binMarkers.on('click', (event) => {
      const geometryId = event && event.geometry && event.geometry.id;
      const index = Number(String(geometryId || '').replace('bin-', ''));
      const bin = state.bins[index];
      if (!bin) return;
      showInfoWindow(
        bin.latitude,
        bin.longitude,
        '<div style="font-size:12px;line-height:1.5;">' +
        '<b>' + escapeHtml(bin.name || 'Unnamed Bin') + '</b><br/>' +
        'Fill: ' + Number(bin.currentFill || 0).toFixed(1) + '%<br/>' +
        'Hours to full: ' + (bin.hoursToFull == null ? '--' : (Number(bin.hoursToFull).toFixed(1) + 'h')) + '<br/>' +
        'Priority: ' + Number(bin.priorityScore || 0).toFixed(3) +
        '</div>'
      );
    });
  }

  drawStartMarker();
  if (state.startPoint) {
    bounds.extend(new window.TMap.LatLng(state.startPoint.latitude, state.startPoint.longitude));
    hasBounds = true;
  }

  if (
    state.plan &&
    state.plan.route &&
    Array.isArray(state.plan.route.polyline) &&
    state.plan.route.polyline.length > 1
  ) {
    const paths = state.plan.route.polyline.map((point) => new window.TMap.LatLng(point[0], point[1]));
    state.routePolyline = new window.TMap.MultiPolyline({
      id: 'planning-route',
      map: state.map,
      styles: {
        route: new window.TMap.PolylineStyle({
          color: '#2f6ff0',
          width: 6,
          borderWidth: 2,
          borderColor: '#ffffff',
          lineCap: 'round'
        })
      },
      geometries: [
        {
          id: 'route-main',
          styleId: 'route',
          paths
        }
      ]
    });
    paths.forEach((point) => {
      bounds.extend(point);
      hasBounds = true;
    });

    const stopStyles = {};
    const stopGeometries = (state.plan.route.stops || []).map((stop, idx) => {
      const styleId = 'stop-' + stop.order;
      if (!stopStyles[styleId]) {
        stopStyles[styleId] = new window.TMap.MarkerStyle({
          width: 26,
          height: 26,
          anchor: { x: 13, y: 13 },
          src: getIconSrc('stop-' + stop.order, '#1f62db', String(stop.order))
        });
      }
      return {
        id: 'stop-' + idx,
        styleId,
        position: new window.TMap.LatLng(stop.latitude, stop.longitude)
      };
    });
    if (stopGeometries.length) {
      state.sequenceMarkers = new window.TMap.MultiMarker({
        id: 'planning-stop-seq',
        map: state.map,
        styles: stopStyles,
        geometries: stopGeometries
      });
    }
  }

  if (hasBounds && state.map.fitBounds) {
    state.map.fitBounds(bounds, { padding: 70 });
  }
}

function renderRoute() {
  if (!state.plan || !state.plan.route || !Array.isArray(state.plan.route.stops) || !state.plan.route.stops.length) {
    refs.routeSummary.textContent = 'No route generated yet.';
    refs.routeList.innerHTML = '<div class="empty">请先点击“一键规划路线”。</div>';
    return;
  }

  const route = state.plan.route;
  refs.routeSummary.textContent =
    `Stops ${route.stops.length}, distance ${Number(route.totalDistanceKm || 0).toFixed(2)} km, ` +
    `total ${Number(route.totalMinutes || 0).toFixed(1)} min.`;

  refs.routeList.innerHTML = route.stops.map((stop) => `
        <div class="route-item">
          <div class="route-order">${stop.order}</div>
          <div>
            <div style="font-weight:680;">${stop.name}</div>
            <div style="color:#607487;margin-top:2px;">
              ETA ${new Date(stop.eta).toLocaleTimeString()} · 满载率 ${Number(stop.currentFill).toFixed(1)}%
            </div>
          </div>
          <div style="text-align:right;color:#445d73;">
            <div>${Number(stop.travelKm).toFixed(2)} km</div>
            <div style="font-size:11px;">优先级 ${Number(stop.priorityScore).toFixed(3)}</div>
          </div>
        </div>
      `).join('');
}

function getOptions() {
  return {
    urgentThreshold: toNum(refs.urgentThreshold.value, 80),
    planningHorizonHours: toNum(refs.planningHorizonHours.value, 8),
    speedKmh: toNum(refs.speedKmh.value, 25),
    serviceMinutesPerStop: toNum(refs.serviceMinutesPerStop.value, 6),
    maxStops: toNum(refs.maxStops.value, 12),
    minStops: toNum(refs.minStops.value, 3),
    startTime: new Date().toISOString()
  };
}

async function loadBins() {
  setStatus('正在读取桶位数据...');
  const data = await api('/api/planning/bins');
  state.bins = (data.bins || []).map((bin) => ({ ...bin, selected: true }));
  state.plan = null;

  if (!state.startPoint && state.bins.length) {
    state.startPoint = {
      name: '默认起点',
      latitude: state.bins[0].latitude,
      longitude: state.bins[0].longitude
    };
  }

  syncStartInputs();
  renderBinList();
  renderRoute();
  updateMetrics();
  drawMap();
  setStatus(`Loaded ${state.bins.length} bins.`, 'ok');
}

async function createPlan() {
  readStartFromInputs();
  setStatus('正在计算清运路线...');

  const payload = {
    start: state.startPoint,
    options: getOptions(),
    bins: state.bins.map((bin) => ({
      id: bin.id,
      selected: bin.selected !== false,
      name: bin.name,
      type: bin.type,
      status: bin.status,
      latitude: bin.latitude,
      longitude: bin.longitude,
      currentFill: bin.currentFill,
      history: bin.history || []
    }))
  };

  const plan = await api('/api/planning/plan', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  state.plan = plan;
  const planBinMap = new Map((plan.bins || []).map((item) => [String(item.id), item]));
  state.bins = state.bins.map((bin) => {
    const computed = planBinMap.get(String(bin.id));
    if (!computed) return bin;
    return {
      ...bin,
      ...computed,
      selected: bin.selected !== false
    };
  });

  renderBinList();
  renderRoute();
  updateMetrics();
  drawMap();
  setStatus('规划完成', 'ok');
}

async function saveSnapshots() {
  const targets = state.bins.filter((bin) => bin.selected !== false);
  if (!targets.length) {
    setStatus('Select at least one bin first.', 'err');
    return;
  }
  setStatus('正在保存满载率快照...');
  for (const bin of targets) {
    await api('/api/planning/snapshot', {
      method: 'POST',
      body: JSON.stringify({
        binId: bin.id,
        fillLevel: bin.currentFill,
        timestamp: new Date().toISOString(),
        source: 'web-manual',
        syncOverride: true
      })
    });
  }
  setStatus(`Saved snapshots for ${targets.length} bins.`, 'ok');
}

async function createMockHistory() {
  const targets = state.bins.filter((bin) => bin.selected !== false).map((bin) => bin.id);
  if (!targets.length) {
    setStatus('请先选择桶位后再生成历史', 'err');
    return;
  }
  setStatus('正在生成历史样本...');
  await api('/api/planning/mock-history', {
    method: 'POST',
    body: JSON.stringify({
      binIds: targets,
      days: 7,
      pointsPerDay: 4,
      urgentThreshold: toNum(refs.urgentThreshold.value, 80),
      planningHorizonHours: toNum(refs.planningHorizonHours.value, 8)
    })
  });
  await loadBins();
  setStatus('历史样本已生成并刷新', 'ok');
}

async function initMap() {
  setStatus('Loading Tencent map...');
  await loadTencentMapSdk();
  state.map = new window.TMap.Map('map', {
    center: new window.TMap.LatLng(DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude),
    zoom: 12,
    viewMode: '2D'
  });
  state.mapReady = true;
  state.map.on('click', (event) => {
    const lat = getLat(event && event.latLng);
    const lng = getLng(event && event.latLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    state.startPoint = {
      name: 'Map Selected Start',
      latitude: lat,
      longitude: lng
    };
    syncStartInputs();
    drawMap();
  });
  setStatus('Map ready', 'ok');
}

function bindActions() {
  document.getElementById('refreshBtn').addEventListener('click', async () => {
    try {
      await loadBins();
    } catch (error) {
      setStatus(error.message || String(error), 'err');
    }
  });

  document.getElementById('planBtn').addEventListener('click', async () => {
    try {
      await createPlan();
    } catch (error) {
      setStatus(error.message || String(error), 'err');
    }
  });

  document.getElementById('saveSnapshotsBtn').addEventListener('click', async () => {
    try {
      await saveSnapshots();
    } catch (error) {
      setStatus(error.message || String(error), 'err');
    }
  });

  document.getElementById('mockBtn').addEventListener('click', async () => {
    try {
      await createMockHistory();
    } catch (error) {
      setStatus(error.message || String(error), 'err');
    }
  });

  document.getElementById('useCenterBtn').addEventListener('click', () => {
    if (!state.map) return;
    const center = state.map.getCenter();
    const lat = getLat(center);
    const lng = getLng(center);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    state.startPoint = {
      name: 'Map Center Start',
      latitude: lat,
      longitude: lng
    };
    syncStartInputs();
    drawMap();
  });

  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = '/';
  });
}

(async function init() {
  applyTheme();
  window.addEventListener('storage', (event) => {
    if (!event || event.key === 'app_theme') {
      applyTheme();
    }
  });
  bindBinEvents();
  bindActions();
  await initMap();
  try {
    await loadBins();
  } catch (error) {
    setStatus(error.message || String(error), 'err');
  }
})();
