<template>
  <view class="risk-algorithm-workbench">
    <view v-if="!selectedNode" class="algorithm-empty">
      <view class="empty-orbit"></view>
      <text>正在构建 STG-Mamba 时空风险图...</text>
    </view>
    <template v-else>
      <view class="algorithm-summary">
        <view class="summary-card">
          <text>当前容量</text>
          <b>{{ pct(selectedNode.currentFill) }}</b>
          <small>{{ selectedNode.pointCode }} · {{ selectedNode.pointName }}</small>
        </view>
        <view class="summary-card risk">
          <text>{{ horizonLabel }}满载概率</text>
          <b>{{ pct(selectedProbability * 100) }}</b>
          <small :class="['risk-level', riskTone]">{{ riskText }}</small>
        </view>
        <view class="summary-card">
          <text>{{ horizonLabel }}预测容量</text>
          <b>{{ pct(selectedFill) }}</b>
          <small>P10 {{ pct(selectedBand.p10) }} · P90 {{ pct(selectedBand.p90) }}</small>
        </view>
        <view class="summary-card">
          <text>预计满载</text>
          <b>{{ fullTimeText }}</b>
          <small>置信度 {{ pct(selectedNode.confidence * 100) }}</small>
        </view>
      </view>

      <view class="algorithm-grid">
        <view class="algorithm-card graph-card">
          <view class="card-head">
            <view>
              <b>垃圾桶时空风险地图</b>
              <text>腾讯地图真实坐标 · 节点颜色表示满载概率 · 连线亮度表示空间联动强度</text>
            </view>
            <view class="model-chip">
              <i></i>
              <view><b>{{ visualization.model?.name || 'STG-Mamba' }}</b><text>{{ visualization.model?.version || 'v1' }}</text></view>
            </view>
          </view>

          <view class="horizon-control">
            <button class="play-button" @tap="emit('toggle-play')">{{ playing ? 'Ⅱ' : '▶' }}</button>
            <view class="horizon-tabs">
              <button
                v-for="item in horizonOptions"
                :key="item.value"
                :class="{ active: Number(horizon) === item.value }"
                @tap="chooseHorizon(item.value)"
              >{{ item.label }}</button>
            </view>
            <text class="horizon-caption">{{ playing ? '自动演进中' : '已暂停' }}</text>
          </view>
          <slider
            class="horizon-slider"
            :value="horizonIndex"
            :min="0"
            :max="3"
            :step="1"
            activeColor="#118b67"
            backgroundColor="#dbe8e1"
            block-color="#118b67"
            :block-size="15"
            @changing="handleSlider"
            @change="handleSlider"
          />

          <!-- #ifdef H5 -->
          <view class="risk-map-shell">
            <view id="risk-tencent-map" class="risk-tencent-map"></view>
            <view v-if="mapStatus !== 'ready'" class="risk-map-status">
              <i></i>
              <text>{{ mapStatus === 'error' ? '腾讯地图暂时不可用' : '正在加载腾讯地图与垃圾桶点位' }}</text>
            </view>
            <view class="risk-map-corner">腾讯地图 · 垃圾桶真实点位</view>
          </view>
          <!-- #endif -->
          <!-- #ifndef H5 -->
          <svg class="risk-graph" viewBox="0 0 720 408" preserveAspectRatio="none">
            <defs>
              <radialGradient id="riskGraphGlow">
                <stop offset="0%" stop-color="#118b67" stop-opacity=".23" />
                <stop offset="100%" stop-color="#118b67" stop-opacity="0" />
              </radialGradient>
              <filter id="nodeGlow"><feGaussianBlur stdDeviation="3.4" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>
            <circle cx="360" cy="204" r="186" fill="url(#riskGraphGlow)" />
            <g class="graph-grid">
              <line v-for="x in [120,240,360,480,600]" :key="'gx-'+x" :x1="x" y1="20" :x2="x" y2="388" />
              <line v-for="y in [82,143,204,265,326]" :key="'gy-'+y" x1="25" :y1="y" x2="695" :y2="y" />
            </g>
            <g class="graph-edges">
              <line
                v-for="edge in graphEdges"
                :key="edge.id"
                :x1="edge.x1"
                :y1="edge.y1"
                :x2="edge.x2"
                :y2="edge.y2"
                :style="{ '--edge-alpha': edge.opacity, '--edge-speed': edge.speed + 's' }"
              />
            </g>
            <g
              v-for="node in graphNodes"
              :key="node.pointId"
              :class="['graph-node', node.pointId === selectedNode.pointId ? 'selected' : '']"
              :transform="`translate(${node.x} ${node.y})`"
              @click="emit('select', node.id)"
            >
              <circle v-if="node.pointId === selectedNode.pointId" class="node-wave" :r="node.radius + 8" />
              <circle class="node-halo" :r="node.radius + 4" :fill="node.color" />
              <circle class="node-core" :r="node.radius" :fill="node.color" />
              <text v-if="node.showLabel" :x="node.radius + 5" y="-5">{{ node.pointCode }}</text>
              <text v-if="node.pointId === selectedNode.pointId" :x="node.radius + 5" y="10" class="node-value">{{ pct(node.probability * 100) }}</text>
            </g>
          </svg>
          <!-- #endif -->
          <view class="risk-legend">
            <text><i class="low"></i>低风险</text>
            <text><i class="medium"></i>中风险</text>
            <text><i class="high"></i>高风险</text>
            <text><i class="emergency"></i>紧急风险</text>
            <small>垃圾桶 {{ graphNodes.length }} · 空间关系 {{ graphEdges.length }}</small>
          </view>
        </view>

        <view class="insight-column">
          <view class="algorithm-card curve-card">
            <view class="card-head compact">
              <view><b>容量预测区间</b><text>历史实线 · P50 虚线 · P10–P90 光带</text></view>
              <view class="secondary-metrics">
                <span>重量 {{ selectedNode.weightKg.toFixed(1) }} kg</span>
                <span>电量 {{ selectedNode.batteryPct.toFixed(0) }}%</span>
              </view>
            </view>
            <!-- #ifdef H5 -->
            <svg class="prediction-curve" viewBox="0 0 430 185" preserveAspectRatio="none">
              <g class="curve-grid">
                <line v-for="value in [25,50,75,100]" :key="'curve-'+value" x1="28" :y1="curveY(value)" x2="415" :y2="curveY(value)" />
                <text v-for="value in [25,50,75,100]" :key="'label-'+value" x="2" :y="curveY(value)+3">{{ value }}</text>
              </g>
              <line x1="28" :y1="curveY(90)" x2="415" :y2="curveY(90)" class="capacity-threshold" />
              <polygon :points="bandPolygon" class="prediction-band" />
              <polyline :points="historyPolyline" class="history-line" />
              <polyline :points="forecastPolyline" class="forecast-line" />
              <line :x1="curveSplitX" y1="16" :x2="curveSplitX" y2="166" class="curve-split" />
              <circle :cx="activeCurvePoint.x" :cy="activeCurvePoint.y" r="5" class="active-curve-point" />
              <g class="curve-x-labels">
                <text x="28" y="181">-5.5h</text><text :x="curveSplitX - 8" y="181">当前</text>
                <text x="278" y="181">+30m</text><text x="340" y="181">+60m</text><text x="397" y="181">+120m</text>
              </g>
            </svg>
            <!-- #endif -->
          </view>

          <view class="insight-bottom">
            <view class="algorithm-card driver-card">
              <view class="card-head compact"><view><b>风险驱动因素</b><text>输入诊断，不代表模型注意力权重</text></view></view>
              <!-- #ifdef H5 -->
              <svg class="driver-radar" viewBox="0 0 190 178">
                <polygon v-for="scale in [.33,.66,1]" :key="'radar-'+scale" :points="radarBase(scale)" class="radar-grid" />
                <line v-for="axis in radarAxes" :key="axis.key" x1="95" y1="86" :x2="axis.x" :y2="axis.y" class="radar-axis" />
                <polygon :points="radarValuePoints" class="radar-value" />
                <circle v-for="axis in radarValueAxes" :key="'dot-'+axis.key" :cx="axis.x" :cy="axis.y" r="2.5" class="radar-dot" />
                <text v-for="axis in radarAxes" :key="'text-'+axis.key" :x="axis.labelX" :y="axis.labelY" :text-anchor="axis.anchor">{{ axis.label }}</text>
              </svg>
              <!-- #endif -->
              <view class="driver-ranking">
                <view v-for="driver in topDrivers" :key="driver.key">
                  <text>{{ driver.label }}</text><view><i :style="{ width: driver.value * 100 + '%' }"></i></view><b>{{ pct(driver.value * 100) }}</b>
                </view>
              </view>
            </view>

            <view class="algorithm-card threshold-card">
              <view class="card-head compact"><view><b>双阈值预警状态</b><text>进入 60% · 退出 45% · 紧急 85%</text></view></view>
              <view class="threshold-status">
                <b :class="riskTone">{{ riskText }}</b>
                <text>{{ thresholdExplanation }}</text>
              </view>
              <view class="threshold-track">
                <i class="threshold-zone low"></i><i class="threshold-zone medium"></i><i class="threshold-zone high"></i><i class="threshold-zone emergency"></i>
                <span class="threshold-mark exit" style="left:45%"><em>45</em></span>
                <span class="threshold-mark enter" style="left:60%"><em>60</em></span>
                <span class="threshold-mark urgent" style="left:85%"><em>85</em></span>
                <span class="threshold-pointer" :style="{ left: clampPercent(selectedProbability * 100) + '%' }"><em>{{ pct(selectedProbability * 100) }}</em></span>
              </view>
              <view class="threshold-facts">
                <view><text>增长速度</text><b>{{ selectedNode.growthRatePctPerHour.toFixed(2) }}%/h</b></view>
                <view><text>邻域联动</text><b>{{ pct(selectedNode.drivers.neighbor * 100) }}</b></view>
                <view><text>人流热度</text><b>{{ pct(selectedNode.crowdLevel * 100) }}</b></view>
              </view>
              <view class="model-metrics">
                <span>MAE {{ modelMae }}</span><span>区间覆盖 {{ modelCoverage }}</span><span>{{ visualization.model?.featureCount || 10 }} 维输入</span>
              </view>
            </view>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  visualization: { type: Object, default: () => ({ nodes: [], edges: [], model: {}, thresholds: {} }) },
  selectedId: { type: [String, Number], default: '' },
  horizon: { type: Number, default: 0 },
  playing: { type: Boolean, default: true }
})

const emit = defineEmits(['select', 'horizon', 'toggle-play'])
const horizonOptions = Object.freeze([
  { value: 0, label: '当前' },
  { value: 30, label: '30 分钟' },
  { value: 60, label: '60 分钟' },
  { value: 120, label: '120 分钟' }
])
const driverMeta = Object.freeze({
  capacity: '当前容量',
  growth: '增长速度',
  neighbor: '邻域风险',
  crowd: '人流热度',
  battery: '电量压力'
})

const nodes = computed(() => Array.isArray(props.visualization?.nodes) ? props.visualization.nodes : [])
const selectedNode = computed(() => nodes.value.find(node => String(node.id) === String(props.selectedId))
  || nodes.value.find(node => String(node.pointId) === String(props.selectedId))
  || nodes.value[0]
  || null)
const horizonIndex = computed(() => Math.max(0, horizonOptions.findIndex(item => item.value === Number(props.horizon))))
const horizonLabel = computed(() => horizonOptions.find(item => item.value === Number(props.horizon))?.label || '当前')
const pct = value => `${Number(value || 0).toFixed(1)}%`
const clampPercent = value => Math.max(0, Math.min(100, Number(value) || 0))
const windowFor = (node, horizon = props.horizon) => node?.windows?.[horizon] || node?.windows?.[String(horizon)] || null
const probabilityFor = (node, horizon = props.horizon) => Number(horizon) === 0
  ? Number(node?.currentFullProbability || 0)
  : Number(windowFor(node, horizon)?.fullProbability || 0)
const fillFor = (node, horizon = props.horizon) => Number(horizon) === 0
  ? Number(node?.currentFill || 0)
  : Number(windowFor(node, horizon)?.p50 || 0) * 100
const selectedProbability = computed(() => probabilityFor(selectedNode.value))
const selectedFill = computed(() => fillFor(selectedNode.value))
const selectedBand = computed(() => {
  if (Number(props.horizon) === 0) {
    const value = Number(selectedNode.value?.currentFill || 0)
    return { p10: value, p50: value, p90: value }
  }
  const window = windowFor(selectedNode.value) || {}
  return {
    p10: Number(window.p10 || 0) * 100,
    p50: Number(window.p50 || 0) * 100,
    p90: Number(window.p90 || 0) * 100
  }
})
const riskTone = computed(() => selectedProbability.value >= .85 ? 'emergency'
  : selectedProbability.value >= .6 ? 'high'
    : selectedProbability.value >= .3 ? 'medium' : 'low')
const riskText = computed(() => ({
  emergency: '紧急风险',
  high: '高风险',
  medium: '中风险',
  low: '低风险'
})[riskTone.value])
const fullTimeText = computed(() => {
  const fullAt = new Date(selectedNode.value?.estimatedFullAt || '')
  const generatedAt = new Date(props.visualization?.generatedAt || Date.now())
  if (Number.isNaN(fullAt.getTime()) || Number.isNaN(generatedAt.getTime())) return '暂未达到'
  const minutes = Math.max(0, Math.round((fullAt - generatedAt) / 60000))
  if (minutes < 60) return `${minutes} 分钟`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
})

const graphNodes = computed(() => {
  if (!nodes.value.length) return []
  const latitudes = nodes.value.map(node => Number(node.latitude))
  const longitudes = nodes.value.map(node => Number(node.longitude))
  const minLat = Math.min(...latitudes)
  const maxLat = Math.max(...latitudes)
  const minLng = Math.min(...longitudes)
  const maxLng = Math.max(...longitudes)
  const topRiskIds = new Set([...nodes.value]
    .sort((left, right) => probabilityFor(right) - probabilityFor(left))
    .slice(0, 9)
    .map(node => node.pointId))
  return nodes.value.map((node) => {
    const probability = probabilityFor(node)
    const x = 38 + (Number(node.longitude) - minLng) / Math.max(maxLng - minLng, .000001) * 644
    const y = 374 - (Number(node.latitude) - minLat) / Math.max(maxLat - minLat, .000001) * 340
    return {
      ...node,
      x: Number(x.toFixed(1)),
      y: Number(y.toFixed(1)),
      probability,
      radius: Number((5.5 + probability * 7).toFixed(1)),
      color: probability >= .85 ? '#e64d57' : probability >= .6 ? '#ef8a3a' : probability >= .3 ? '#e0b63e' : '#118b67',
      showLabel: node.pointId === selectedNode.value?.pointId || topRiskIds.has(node.pointId)
    }
  })
})
const graphNodeMap = computed(() => new Map(graphNodes.value.map(node => [node.pointId, node])))
const graphEdges = computed(() => (props.visualization?.edges || []).map((edge) => {
  const source = graphNodeMap.value.get(edge.source)
  const target = graphNodeMap.value.get(edge.target)
  if (!source || !target) return null
  const horizonStrength = (source.probability + target.probability) / 2
  return {
    ...edge,
    x1: source.x,
    y1: source.y,
    x2: target.x,
    y2: target.y,
    opacity: Number(Math.max(.1, Math.min(.82, edge.weight * (.25 + horizonStrength))).toFixed(2)),
    speed: Number((3.8 - Math.min(.9, horizonStrength) * 2).toFixed(2))
  }
}).filter(Boolean))

const mapStatus = ref('idle')
let riskMap = null
let riskMapMarkers = null
let riskMapEdges = null
let riskMapInfo = null
let riskMapRetryTimer = null
let riskMapResizeHandler = null
let fittedDatasetSignature = ''

const riskColor = probability => probability >= .85 ? '#e64d57'
  : probability >= .6 ? '#ef8a3a'
    : probability >= .3 ? '#e0b63e' : '#118b67'
const riskToneForProbability = probability => probability >= .85 ? 'emergency'
  : probability >= .6 ? 'high'
    : probability >= .3 ? 'medium' : 'low'
const mapMarkerIcon = (color, selected = false) => {
  const ring = selected ? '#ffffff' : '#d9fff2'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 42 42">
    <circle cx="21" cy="21" r="${selected ? 18 : 14}" fill="${color}" fill-opacity=".18"/>
    <circle cx="21" cy="21" r="${selected ? 12 : 9}" fill="${color}" stroke="${ring}" stroke-width="${selected ? 3 : 1.5}"/>
    <circle cx="21" cy="21" r="3" fill="#ffffff"/>
  </svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}
const safeText = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

function riskMapMarkerStyles(TMap) {
  const styles = {}
  ;['low', 'medium', 'high', 'emergency'].forEach((tone) => {
    const probability = { low: .1, medium: .4, high: .7, emergency: .9 }[tone]
    const color = riskColor(probability)
    styles[tone] = new TMap.MarkerStyle({
      width: 28,
      height: 28,
      anchor: { x: 14, y: 14 },
      src: mapMarkerIcon(color, false)
    })
    styles[`selected-${tone}`] = new TMap.MarkerStyle({
      width: 38,
      height: 38,
      anchor: { x: 19, y: 19 },
      src: mapMarkerIcon(color, true)
    })
  })
  return styles
}

function updateRiskMapInfo(TMap) {
  if (!riskMap || !selectedNode.value) return
  const node = selectedNode.value
  const latitude = Number(node.latitude)
  const longitude = Number(node.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return
  const probability = probabilityFor(node)
  const position = new TMap.LatLng(latitude, longitude)
  const content = `<div style="min-width:112px;padding:6px 8px;color:#173c31;font:12px/1.45 Microsoft YaHei,sans-serif">
    <b style="display:block;font-size:13px">${safeText(node.pointCode || node.id)} · ${safeText(node.pointName || node.name)}</b>
    <span>当前 ${pct(node.currentFill)}　满载概率 ${pct(probability * 100)}</span>
  </div>`
  if (!riskMapInfo) {
    riskMapInfo = new TMap.InfoWindow({ map: riskMap, position, content })
    return
  }
  riskMapInfo.setPosition(position)
  riskMapInfo.setContent(content)
  if (typeof riskMapInfo.open === 'function') riskMapInfo.open()
}

function syncRiskMap(fitView = false) {
  if (!riskMap || typeof window === 'undefined' || !window.TMap || !nodes.value.length) return
  const TMap = window.TMap
  const validNodes = nodes.value.filter(node =>
    Number.isFinite(Number(node.latitude)) && Number.isFinite(Number(node.longitude))
  )
  const nodeByPointId = new Map(validNodes.map(node => [String(node.pointId), node]))
  const styles = riskMapMarkerStyles(TMap)
  const geometries = validNodes.map((node) => {
    const probability = probabilityFor(node)
    const tone = riskToneForProbability(probability)
    const selected = String(node.id) === String(props.selectedId)
      || String(node.pointId) === String(props.selectedId)
    return {
      id: `risk-bin-${node.id}`,
      styleId: selected ? `selected-${tone}` : tone,
      position: new TMap.LatLng(Number(node.latitude), Number(node.longitude)),
      properties: { id: node.id }
    }
  })
  if (!riskMapMarkers) {
    riskMapMarkers = new TMap.MultiMarker({
      id: 'stg-mamba-risk-bins',
      map: riskMap,
      styles,
      geometries
    })
    riskMapMarkers.on('click', event => {
      const id = event?.geometry?.properties?.id
      if (id !== undefined && id !== null) emit('select', id)
    })
  } else if (typeof riskMapMarkers.setGeometries === 'function') {
    riskMapMarkers.setGeometries(geometries)
  }

  const edgeStyles = {
    weak: new TMap.PolylineStyle({ color: '#6c968b', width: 1, borderWidth: 0, lineCap: 'round' }),
    medium: new TMap.PolylineStyle({ color: '#35b38f', width: 2, borderWidth: 0, lineCap: 'round' }),
    strong: new TMap.PolylineStyle({ color: '#18d7a0', width: 3, borderWidth: 0, lineCap: 'round' })
  }
  const edgeGeometries = (props.visualization?.edges || []).map((edge, index) => {
    const source = nodeByPointId.get(String(edge.source))
    const target = nodeByPointId.get(String(edge.target))
    if (!source || !target) return null
    const strength = Number(edge.strength ?? edge.weight ?? 0)
    return {
      id: `risk-edge-${index}`,
      styleId: strength >= .68 ? 'strong' : strength >= .4 ? 'medium' : 'weak',
      paths: [
        new TMap.LatLng(Number(source.latitude), Number(source.longitude)),
        new TMap.LatLng(Number(target.latitude), Number(target.longitude))
      ]
    }
  }).filter(Boolean)
  if (!riskMapEdges) {
    riskMapEdges = new TMap.MultiPolyline({
      id: 'stg-mamba-spatial-edges',
      map: riskMap,
      styles: edgeStyles,
      geometries: edgeGeometries
    })
  } else if (typeof riskMapEdges.setGeometries === 'function') {
    riskMapEdges.setGeometries(edgeGeometries)
  }

  updateRiskMapInfo(TMap)
  const datasetSignature = validNodes.map(node => `${node.id}:${node.latitude}:${node.longitude}`).join('|')
  if ((fitView || fittedDatasetSignature !== datasetSignature) && typeof riskMap.fitBounds === 'function') {
    const bounds = new TMap.LatLngBounds()
    validNodes.forEach(node => bounds.extend(new TMap.LatLng(Number(node.latitude), Number(node.longitude))))
    riskMap.fitBounds(bounds, { padding: 58 })
    fittedDatasetSignature = datasetSignature
  }
}

async function ensureRiskMap(attempt = 0) {
  if (riskMap || !nodes.value.length || typeof window === 'undefined') return
  await nextTick()
  const container = document.getElementById('risk-tencent-map')
  if (!container || container.clientWidth < 20 || container.clientHeight < 20 || !window.TMap) {
    mapStatus.value = attempt >= 40 ? 'error' : 'loading'
    if (attempt < 40) {
      clearTimeout(riskMapRetryTimer)
      riskMapRetryTimer = setTimeout(() => ensureRiskMap(attempt + 1), 250)
    }
    return
  }
  const first = selectedNode.value || nodes.value[0]
  riskMap = new window.TMap.Map('risk-tencent-map', {
    center: new window.TMap.LatLng(Number(first.latitude), Number(first.longitude)),
    zoom: 14,
    viewMode: '2D',
    pitch: 0,
    rotation: 0
  })
  mapStatus.value = 'ready'
  riskMapResizeHandler = () => {
    if (riskMap && typeof riskMap.resize === 'function') riskMap.resize()
  }
  window.addEventListener('resize', riskMapResizeHandler)
  syncRiskMap(true)
}

const riskMapRenderSignature = computed(() => [
  props.visualization?.generatedAt || '',
  props.horizon,
  props.selectedId,
  nodes.value.length,
  (props.visualization?.edges || []).length
].join(':'))

watch(riskMapRenderSignature, async () => {
  if (!nodes.value.length) return
  await ensureRiskMap()
  syncRiskMap()
}, { immediate: true })

onBeforeUnmount(() => {
  clearTimeout(riskMapRetryTimer)
  riskMapRetryTimer = null
  if (typeof window !== 'undefined' && riskMapResizeHandler) {
    window.removeEventListener('resize', riskMapResizeHandler)
  }
  riskMapResizeHandler = null
  if (riskMapInfo) {
    try { riskMapInfo.setMap(null) } catch (_) {}
    riskMapInfo = null
  }
  if (riskMapMarkers) {
    try { riskMapMarkers.setMap(null) } catch (_) {}
    riskMapMarkers = null
  }
  if (riskMapEdges) {
    try { riskMapEdges.setMap(null) } catch (_) {}
    riskMapEdges = null
  }
  if (riskMap) {
    try { riskMap.destroy() } catch (_) {}
    riskMap = null
  }
})

const curveY = value => Number((162 - clampPercent(value) * 1.36).toFixed(2))
const curveSplitX = 218
const historyCurvePoints = computed(() => {
  const history = selectedNode.value?.history || []
  return history.map((item, index) => ({
    x: 28 + index / Math.max(1, history.length - 1) * (curveSplitX - 28),
    y: curveY(item.fillLevel),
    value: Number(item.fillLevel)
  }))
})
const forecastCurvePoints = computed(() => {
  const current = { x: curveSplitX, y: curveY(selectedNode.value?.currentFill), value: Number(selectedNode.value?.currentFill) }
  const xs = { 30: 286, 60: 348, 120: 410 }
  return [current, ...[30, 60, 120].map(minutes => ({
    x: xs[minutes],
    y: curveY(Number(windowFor(selectedNode.value, minutes)?.p50 || 0) * 100),
    value: Number(windowFor(selectedNode.value, minutes)?.p50 || 0) * 100
  }))]
})
const historyPolyline = computed(() => historyCurvePoints.value.map(point => `${point.x},${point.y}`).join(' '))
const forecastPolyline = computed(() => forecastCurvePoints.value.map(point => `${point.x},${point.y}`).join(' '))
const bandPolygon = computed(() => {
  const xs = { 30: 286, 60: 348, 120: 410 }
  const upper = [30, 60, 120].map(minutes =>
    `${xs[minutes]},${curveY(Number(windowFor(selectedNode.value, minutes)?.p90 || 0) * 100)}`
  )
  const lower = [120, 60, 30].map(minutes =>
    `${xs[minutes]},${curveY(Number(windowFor(selectedNode.value, minutes)?.p10 || 0) * 100)}`
  )
  return [`${curveSplitX},${curveY(selectedNode.value?.currentFill)}`, ...upper, ...lower].join(' ')
})
const activeCurvePoint = computed(() => {
  if (Number(props.horizon) === 0) return forecastCurvePoints.value[0]
  const index = [30, 60, 120].indexOf(Number(props.horizon)) + 1
  return forecastCurvePoints.value[index] || forecastCurvePoints.value[0]
})

const radarKeys = Object.keys(driverMeta)
const radarPoint = (index, value, radius = 58) => {
  const angle = -Math.PI / 2 + index * Math.PI * 2 / radarKeys.length
  return {
    x: 95 + Math.cos(angle) * radius * value,
    y: 86 + Math.sin(angle) * radius * value
  }
}
const radarAxes = computed(() => radarKeys.map((key, index) => {
  const point = radarPoint(index, 1)
  const label = radarPoint(index, 1.28)
  return {
    key,
    label: driverMeta[key],
    x: point.x,
    y: point.y,
    labelX: label.x,
    labelY: label.y + 3,
    anchor: label.x < 82 ? 'end' : label.x > 108 ? 'start' : 'middle'
  }
}))
const radarBase = scale => radarKeys.map((_, index) => {
  const point = radarPoint(index, scale)
  return `${point.x},${point.y}`
}).join(' ')
const radarValueAxes = computed(() => radarKeys.map((key, index) => ({
  key,
  ...radarPoint(index, Number(selectedNode.value?.drivers?.[key] || 0))
})))
const radarValuePoints = computed(() => radarValueAxes.value.map(point => `${point.x},${point.y}`).join(' '))
const topDrivers = computed(() => radarKeys.map(key => ({
  key,
  label: driverMeta[key],
  value: Number(selectedNode.value?.drivers?.[key] || 0)
})).sort((left, right) => right.value - left.value).slice(0, 3))

const thresholdExplanation = computed(() => {
  if (riskTone.value === 'emergency') return '未来窗口已跨越紧急阈值，建议提前生成返航与补位计划。'
  if (riskTone.value === 'high') return '风险已进入预警区间，点位保持在调度关注集合。'
  if (riskTone.value === 'medium') return '风险正在积累，系统继续观察空间邻域与增长速度。'
  return '当前风险低于进入阈值，维持正常服务与周期预测。'
})
const modelMae = computed(() => {
  const value = Number(props.visualization?.model?.metrics?.mae)
  return Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : '—'
})
const modelCoverage = computed(() => {
  const value = Number(props.visualization?.model?.metrics?.intervalCoverage)
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '—'
})

function chooseHorizon(value) {
  emit('horizon', value)
}

function handleSlider(event) {
  const index = Math.max(0, Math.min(3, Number(event?.detail?.value) || 0))
  emit('horizon', horizonOptions[index].value)
}
</script>

<style scoped>
.risk-algorithm-workbench {
  --alg-surface: rgba(7,30,44,.9);
  --alg-surface-soft: rgba(11,42,58,.78);
  --alg-border: rgba(111,193,224,.22);
  --alg-text: #e9f8ff;
  --alg-muted: #82adbe;
  --alg-primary: #24d9ff;
  --alg-green: #2ed49b;
  min-width: 0;
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--alg-text);
}
.algorithm-empty { flex:1;display:flex;align-items:center;justify-content:center;gap:15px;border:1px dashed var(--alg-border);border-radius:13px;background:var(--alg-surface);color:var(--alg-muted);font-size:13px }
.empty-orbit { width:28px;height:28px;border:2px solid rgba(36,217,255,.22);border-top-color:var(--alg-primary);border-radius:50%;animation:orbit 1s linear infinite }
@keyframes orbit { to { transform:rotate(360deg) } }
.algorithm-summary { display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;flex:0 0 76px }
.summary-card { min-width:0;padding:10px 12px;border:1px solid var(--alg-border);border-radius:11px;background:linear-gradient(145deg,var(--alg-surface-soft),var(--alg-surface));box-shadow:inset 0 1px rgba(255,255,255,.03) }
.summary-card text,.summary-card b,.summary-card small { display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis }
.summary-card > text { color:var(--alg-muted);font-size:11px;letter-spacing:.35px }
.summary-card > b { margin-top:3px;color:var(--alg-text);font-size:22px;line-height:1.1 }
.summary-card > small { margin-top:4px;color:#8db7c7;font-size:10px }
.summary-card.risk > b { color:#ffba67 }
.risk-level.low { color:#52d9a1!important }.risk-level.medium { color:#e7c957!important }.risk-level.high { color:#ff9b55!important }.risk-level.emergency { color:#ff737c!important }
.algorithm-grid { min-height:0;flex:1;display:grid;grid-template-columns:minmax(0,1.22fr) minmax(400px,.78fr);gap:8px }
.algorithm-card { min-width:0;border:1px solid var(--alg-border);border-radius:12px;background:linear-gradient(150deg,var(--alg-surface-soft),var(--alg-surface));overflow:hidden }
.graph-card { padding:10px 11px 7px;display:flex;flex-direction:column;min-height:0 }
.card-head { display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex:0 0 auto }
.card-head > view:first-child b,.card-head > view:first-child text { display:block }
.card-head > view:first-child b { color:var(--alg-text);font-size:14px }
.card-head > view:first-child text { margin-top:3px;color:var(--alg-muted);font-size:10px }
.card-head.compact > view:first-child b { font-size:12px }
.card-head.compact > view:first-child text { font-size:9px }
.model-chip { display:flex;align-items:center;gap:6px;padding:5px 8px;border:1px solid rgba(36,217,255,.2);border-radius:8px;background:rgba(12,72,91,.4) }
.model-chip i { width:7px;height:7px;border-radius:50%;background:var(--alg-primary);box-shadow:0 0 10px var(--alg-primary);animation:modelPulse 1.8s ease-in-out infinite }
.model-chip b,.model-chip text { display:block }.model-chip b { color:#d7f7ff;font-size:10px }.model-chip text { margin-top:1px;color:#7daebe;font-size:8px }
@keyframes modelPulse { 50% { opacity:.35;transform:scale(.76) } }
.horizon-control { display:flex;align-items:center;gap:7px;margin-top:9px }
.play-button,.horizon-tabs button { border:0;margin:0;padding:0;line-height:1 }
.play-button { width:28px;height:28px;border-radius:7px;color:#dffaff;background:rgba(17,139,103,.75);font-size:12px }
.horizon-tabs { display:flex;gap:4px }
.horizon-tabs button { padding:7px 10px;border:1px solid var(--alg-border);border-radius:7px;color:#8db4c3;background:rgba(7,35,49,.72);font-size:10px }
.horizon-tabs button.active { color:#fff;border-color:rgba(46,212,155,.65);background:rgba(17,139,103,.78);box-shadow:0 0 13px rgba(17,139,103,.22) }
.horizon-caption { margin-left:auto;color:#76a4b5;font-size:9px }
.horizon-slider { margin:3px 1px -2px }
.risk-map-shell { position:relative;min-height:0;flex:1;margin:5px 0 3px;border:1px solid rgba(87,177,157,.2);border-radius:9px;overflow:hidden;background:#173b43 }
.risk-tencent-map { position:absolute;inset:0;filter:saturate(.78) brightness(.82) contrast(1.05) }
.risk-map-shell::after { content:"";position:absolute;inset:0;z-index:2;pointer-events:none;background:linear-gradient(180deg,rgba(5,32,43,.06),rgba(5,32,43,.2)) }
.risk-map-status { position:absolute;inset:0;z-index:4;display:flex;align-items:center;justify-content:center;gap:9px;color:#b7d8df;background:rgba(7,34,46,.76);font-size:11px }
.risk-map-status i { width:9px;height:9px;border:2px solid rgba(46,212,155,.25);border-top-color:#2ed49b;border-radius:50%;animation:orbit .9s linear infinite }
.risk-map-corner { position:absolute;right:9px;bottom:8px;z-index:3;padding:5px 8px;border:1px solid rgba(122,219,194,.22);border-radius:6px;color:#d7eee7;background:rgba(9,46,52,.72);font-size:9px;pointer-events:none }
.risk-map-shell :deep(.tmap-control-container) { transform:scale(.84);transform-origin:right bottom }
.risk-graph { width:100%;min-height:0;flex:1;margin-top:1px }
.graph-grid line { stroke:rgba(117,190,217,.07);stroke-width:1;stroke-dasharray:2 7 }
.graph-edges line { stroke:rgba(66,198,168,var(--edge-alpha));stroke-width:1.2;stroke-dasharray:4 8;animation:edgeFlow var(--edge-speed) linear infinite;vector-effect:non-scaling-stroke }
@keyframes edgeFlow { to { stroke-dashoffset:-36 } }
.graph-node { cursor:pointer }.graph-node circle { transition:r .55s ease,fill .55s ease }
.node-halo { opacity:.17;filter:url(#nodeGlow) }.node-core { stroke:rgba(255,255,255,.75);stroke-width:.7;filter:url(#nodeGlow) }
.graph-node text { fill:#a6d0dc;font:8px/1 ui-monospace,Consolas,monospace;paint-order:stroke;stroke:rgba(3,22,31,.85);stroke-width:2px }
.graph-node .node-value { fill:#fff;font-size:7px }.graph-node.selected .node-core { stroke:#fff;stroke-width:1.8 }
.node-wave { fill:none;stroke:rgba(36,217,255,.65);stroke-width:1;animation:nodeWave 1.8s ease-out infinite }
@keyframes nodeWave { 0%{opacity:.9;transform:scale(.65)} 100%{opacity:0;transform:scale(1.45)} }
.risk-legend { display:flex;align-items:center;gap:11px;color:#79a5b6;font-size:9px }
.risk-legend text { display:flex;align-items:center;gap:3px }.risk-legend i { width:6px;height:6px;border-radius:50% }
.risk-legend i.low { background:#118b67 }.risk-legend i.medium { background:#e0b63e }.risk-legend i.high { background:#ef8a3a }.risk-legend i.emergency { background:#e64d57 }
.risk-legend small { margin-left:auto;color:#668f9f;font-size:9px }
.insight-column { min-height:0;display:grid;grid-template-rows:minmax(210px,.47fr) minmax(240px,.53fr);gap:8px }
.curve-card { padding:9px 10px 4px;display:flex;flex-direction:column;min-height:0 }
.secondary-metrics { display:flex;gap:4px }.secondary-metrics span { padding:4px 6px;border-radius:6px;color:#9cd0dd;background:rgba(17,78,96,.46);font-size:9px }
.prediction-curve { width:100%;min-height:0;flex:1;margin-top:2px;overflow:visible }
.curve-grid line { stroke:rgba(119,188,211,.12);stroke-width:1;stroke-dasharray:2 4 }.curve-grid text { fill:#6c98a8;font-size:8.5px }
.capacity-threshold { stroke:rgba(230,77,87,.45);stroke-width:1;stroke-dasharray:4 4 }
.prediction-band { fill:rgba(46,212,155,.14);stroke:rgba(46,212,155,.3);stroke-width:1 }
.history-line,.forecast-line { fill:none;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke }
.history-line { stroke:#6caed1;stroke-width:2 }.forecast-line { stroke:#2ed49b;stroke-width:2.4;stroke-dasharray:6 4;filter:drop-shadow(0 0 4px rgba(46,212,155,.45)) }
.curve-split { stroke:rgba(221,246,255,.28);stroke-width:1;stroke-dasharray:2 3 }
.active-curve-point { fill:#fff;stroke:#118b67;stroke-width:3;filter:drop-shadow(0 0 5px rgba(46,212,155,.8));transition:cx .5s ease,cy .5s ease }
.curve-x-labels text { fill:#6f9dad;font-size:8px }
.insight-bottom { min-height:0;display:grid;grid-template-columns:minmax(0,.86fr) minmax(0,1.14fr);gap:8px }
.driver-card,.threshold-card { padding:9px;min-height:0 }
.driver-card { display:grid;grid-template-rows:auto minmax(116px,1fr) auto }
.driver-radar { width:100%;height:100%;min-height:116px }
.radar-grid { fill:none;stroke:rgba(124,195,217,.18);stroke-width:1 }.radar-axis { stroke:rgba(124,195,217,.14);stroke-width:1 }
.radar-value { fill:rgba(46,212,155,.2);stroke:#2ed49b;stroke-width:1.6;filter:drop-shadow(0 0 3px rgba(46,212,155,.35));transition:all .45s ease }
.radar-dot { fill:#eafff7 }.driver-radar text { fill:#79a4b3;font-size:8.5px }
.driver-ranking { display:flex;flex-direction:column;gap:4px }
.driver-ranking > view { display:grid;grid-template-columns:52px 1fr 36px;align-items:center;gap:4px;color:#86afbd;font-size:8px }
.driver-ranking > view > view { height:4px;border-radius:99px;background:rgba(103,158,178,.18);overflow:hidden }
.driver-ranking i { display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#118b67,#42ddb0) }
.driver-ranking b { color:#bae5dc;text-align:right;font-size:8px }
.threshold-card { display:flex;flex-direction:column }
.threshold-status { margin-top:9px;padding:7px 8px;border-left:2px solid #118b67;background:rgba(10,67,61,.28) }
.threshold-status b,.threshold-status text { display:block }.threshold-status b { font-size:13px }.threshold-status text { margin-top:3px;color:#8eb5c2;font-size:9px;line-height:1.45 }
.threshold-track { position:relative;height:11px;margin:28px 7px 15px;border-radius:99px;background:#173b43 }
.threshold-zone { position:absolute;top:0;bottom:0 }.threshold-zone.low { left:0;width:30%;background:#118b67 }.threshold-zone.medium { left:30%;width:30%;background:#c6ad35 }.threshold-zone.high { left:60%;width:25%;background:#e77f32 }.threshold-zone.emergency { left:85%;right:0;background:#d94550 }
.threshold-mark { position:absolute;top:-6px;width:1px;height:23px;background:rgba(255,255,255,.45) }.threshold-mark em { position:absolute;top:-14px;left:50%;transform:translateX(-50%);color:#779fac;font-size:8px;font-style:normal }
.threshold-pointer { position:absolute;top:50%;width:12px;height:12px;border:2px solid #fff;border-radius:50%;background:#102f38;transform:translate(-50%,-50%);box-shadow:0 0 9px rgba(255,255,255,.55);transition:left .5s ease }
.threshold-pointer em { position:absolute;top:14px;left:50%;transform:translateX(-50%);color:#fff;font-size:8px;font-style:normal;white-space:nowrap }
.threshold-facts { display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:auto }
.threshold-facts view { padding:5px;border-radius:6px;background:rgba(26,75,88,.34) }.threshold-facts text,.threshold-facts b { display:block }
.threshold-facts text { color:#739ead;font-size:8px }.threshold-facts b { margin-top:3px;color:#bfe3e9;font-size:10px }
.model-metrics { display:flex;flex-wrap:wrap;gap:4px;margin-top:7px }.model-metrics span { padding:3px 5px;border-radius:5px;color:#80afbc;background:rgba(13,58,72,.52);font-size:8px }

:global(.screen.light-theme) .risk-algorithm-workbench {
  --alg-surface:#f7faf8;
  --alg-surface-soft:#eef7f2;
  --alg-border:#c5dbcf;
  --alg-text:#173c31;
  --alg-muted:#66877c;
  --alg-primary:#118b67;
  --alg-green:#118b67;
}
:global(.screen.light-theme) .algorithm-card,:global(.screen.light-theme) .summary-card { box-shadow:0 6px 18px rgba(41,82,67,.055) }
:global(.screen.light-theme) .summary-card > small,:global(.screen.light-theme) .card-head > view:first-child text { color:#6b8d81 }
:global(.screen.light-theme) .summary-card.risk > b { color:#c76e25 }
:global(.screen.light-theme) .model-chip { border-color:#bad8ca;background:#e4f2eb }
:global(.screen.light-theme) .model-chip b { color:#195341 }
:global(.screen.light-theme) .horizon-tabs button { color:#637f75;border-color:#cbded4;background:#f8fbf9 }
:global(.screen.light-theme) .horizon-tabs button.active { color:#fff;border-color:#118b67;background:#118b67 }
:global(.screen.light-theme) .graph-grid line { stroke:rgba(35,95,75,.08) }
:global(.screen.light-theme) .risk-tencent-map { filter:saturate(.86) brightness(1.02) contrast(.98) }
:global(.screen.light-theme) .risk-map-shell::after { background:linear-gradient(180deg,rgba(235,247,240,.02),rgba(226,242,234,.12)) }
:global(.screen.light-theme) .risk-map-corner { color:#255849;border-color:#bdd9cb;background:rgba(245,251,248,.9) }
:global(.screen.light-theme) .graph-node text { fill:#436c5e;stroke:rgba(255,255,255,.9) }
:global(.screen.light-theme) .graph-edges line { stroke:rgba(17,139,103,var(--edge-alpha)) }
:global(.screen.light-theme) .risk-legend,:global(.screen.light-theme) .horizon-caption { color:#68877d }
:global(.screen.light-theme) .curve-grid line { stroke:rgba(39,91,73,.12) }
:global(.screen.light-theme) .curve-grid text,:global(.screen.light-theme) .curve-x-labels text { fill:#718c83 }
:global(.screen.light-theme) .secondary-metrics span { color:#416c5e;background:#e5f1eb }
:global(.screen.light-theme) .radar-grid,:global(.screen.light-theme) .radar-axis { stroke:rgba(31,95,73,.18) }
:global(.screen.light-theme) .driver-radar text { fill:#617e74 }
:global(.screen.light-theme) .threshold-status { background:#e9f4ee }
:global(.screen.light-theme) .threshold-status text { color:#58766c }
:global(.screen.light-theme) .threshold-facts view,:global(.screen.light-theme) .model-metrics span { background:#e8f1ec;color:#527266 }
:global(.screen.light-theme) .threshold-facts b { color:#245443 }
@media (max-width:1100px) {
  .algorithm-grid { grid-template-columns:1fr }
  .insight-column { grid-template-columns:1fr 1fr;grid-template-rows:1fr }
  .curve-card { min-height:260px }
}
</style>
