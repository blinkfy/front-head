<template>
  <view class="er-workspace" :class="{ light }">
    <view class="er-header">
      <view class="er-heading">
        <view class="er-brand" aria-hidden="true"><view class="er-branch" /><view class="er-branch second" /><view class="er-brand-hub" /></view>
        <view><text class="er-title">{{ recordMode ? '用户数据图谱' : '数据关系图谱' }}</text><text v-if="structure" class="er-subtitle">主键、外键与字段映射</text><text v-else class="er-subtitle">{{ visibleTables.length }} 张表<text class="er-separator">/</text>{{ fieldCount }} 个外键字段<text v-if="businessCount"> · {{ businessCount }} 条业务关联</text></text></view>
      </view>
      <view class="er-controls">
        <button v-if="structure && tracePath?.length" class="er-button" @click="diagramMode = 'explore'">返回关系探索</button>
        <view v-else-if="structure && tables.some(t => t.name === 'BookingOrder' || t.name === 'BookingChatBinding')" class="er-segment">
          <button class="er-mode" :class="{ active: !entityBooking }" :aria-pressed="!entityBooking" @click="entityBooking = false">当前表</button>
          <button class="er-mode" :class="{ active: entityBooking }" :aria-pressed="entityBooking" @click="entityBooking = true">预约回收</button>
        </view>
        <view v-if="!structure && !recordMode" class="er-segment">
          <button class="er-mode" :class="{ active: !showAll && !scene }" @click="setScope(false)">当前表</button>
          <button class="er-mode" :class="{ active: showAll && !scene }" @click="setScope(true)">全部表</button>
        </view>
        <picker v-if="!structure && !recordMode && availableViews.length" :range="businessOptions" range-key="label" :value="scene ? availableViews.indexOf(scene) + 1 : 0" @change="openBusiness">
          <view class="er-button er-layout" :class="{ 'scope-active': scene }">{{ scene?.label || '业务链路' }} <text>⌄</text></view>
        </picker>
        <picker v-if="!structure" :range="layoutNames" :value="layout === 'force' ? 0 : 1" @change="chooseLayout">
          <view class="er-button er-layout">{{ layout === 'force' ? layoutNames[0] : layoutNames[1] }} <text>⌄</text></view>
        </picker>
        <button v-if="!structure && !recordMode" class="er-button er-trace-toggle" :class="{ active: tracing }" :disabled="loading || !!error || tables.length < 2"
          :aria-pressed="tracing" @click="toggleTrace"><view class="er-route-symbol" aria-hidden="true" />{{ tracing ? '退出追踪' : '路径追踪' }}</button>
        <button class="er-button" @click="$emit('choose-user')">{{ recordMode ? '换用户' : '选择用户看数据' }}</button>
        <button v-if="recordMode && userData && !loading && !error" class="er-button" @click="$emit('account-insights', userData)">账号分析</button>
        <button v-if="recordMode" class="er-button" @click="$emit('exit-user')">退出用户视图</button>
        <button class="er-button" :disabled="loading" @click="load">刷新</button>
      </view>
    </view>
    <view v-if="loading || error || !visibleTables.length" class="er-message">
      <text>{{ loading ? (recordMode ? '正在统计该用户的关联记录…' : '正在读取数据库外键…') : error || '暂无可展示的数据表' }}</text>
      <button v-if="error" class="er-button" @click="load">重试</button>
    </view>
    <template v-else>
      <DatabaseEntityDiagram v-if="structure" v-model:booking="entityBooking" :tables="tables" :current="current" :relations="relations" :business="businessFields" :user-data="userData"
        :trace-steps="tracePath || []" :selected-step="pathKeys.has(pinnedLine) ? pinnedLine : ''"
        :initial-message-field="initialMessageField" @message-field-consumed="emit('message-field-consumed')"
        @field-focus="emit('field-focus', $event)" @switch-table="switchGraphTable" @select-step="pinnedLine = $event" @return-to-trace="diagramMode = 'explore'" @choose-user="emit('choose-user', $event)" @user-records="emit('user-records', $event)" />
      <view v-show="!structure" class="er-body">
        <view class="er-graph">
          <view class="er-scope" :class="{ tracing }"><view class="er-scope-dot" /><text v-if="recordMode">{{ userCaption }} · 直接关联记录</text><text v-else-if="tracing">{{ traceEnd ? tableLabel(traceStart) + ' · ' + tableLabel(traceEnd) : '点击目标表，追踪外键路径' }}</text><text v-else-if="scene">{{ scene.label }} · 业务链路</text><text v-else>{{ showAll ? '全部数据表' : tableLabel(anchor) + ' · 直接关联' }}</text></view>
          <view ref="stage" class="er-stage" :class="{ dragging: moving }"
            @touchstart="touchStart($event)" @touchmove.stop.prevent="touchMove" @touchend="touchEnd" @touchcancel="cancelGesture">
            <view v-if="(!appGraphOptimized || graphMeasured) && !layoutPending" class="er-scene" :style="sceneStyle">
              <!-- #ifdef H5 -->
              <svg class="er-links-svg" width="1" height="1" aria-hidden="true">
                <g v-for="line in lines" :key="line.key" :style="{ color: line.color, opacity: line.opacity }">
                  <path :d="line.path" fill="none" stroke="currentColor" :stroke-width="line.strong ? 2.7 : 1.5" :stroke-dasharray="line.business ? '5 5' : undefined" />
                  <path v-if="(line.strong || line.neighborFlow) && !line.business" class="er-flow" :d="line.path" fill="none" stroke="var(--panel)" :stroke-width="line.strong ? 1.4 : 1.15" :stroke-opacity="line.strong ? 1 : .95" stroke-dasharray="4 12" />
                  <path class="er-hit-path" :d="line.path" fill="none" stroke="transparent" stroke-width="15"
                    @mouseenter="hoverLine = line.key" @mouseleave="hoverLine = ''" @click.stop="pickLine(line.key)" />
                </g>
              </svg>
              <!-- #endif -->
              <!-- #ifndef H5 -->
              <view v-for="line in lines" :key="line.key" class="er-line" :class="{ loop: line.loop, business: line.business, lit: line.key === activeKey }"
                :style="line.style" @mouseenter="hoverLine = line.key" @mouseleave="hoverLine = ''" @click.stop="pickLine(line.key)" />
              <!-- #endif -->
              <view v-for="line in lines" :key="'arrow' + line.key" class="er-arrow" :style="line.arrowStyle" />
              <view v-for="tag in labels.lineLabels" :key="'label' + tag.key" class="er-edge-label"
                :class="{ lit: tag.key === activeKey, dim: activeKey && tag.key !== activeKey, 'empty-records': emptyRecordEdges.has(tag.key) }"
                :style="{ left: tag.x + 'px', top: tag.y + 'px', width: tag.width + 'px' }"
                @mouseenter="hoverLine = tag.key" @mouseleave="hoverLine = ''" @click.stop="pickLine(tag.key)">{{ tag.text }}</view>
              <view v-for="n in graphNodes" :key="n.name" class="er-node" :data-table="n.name" :class="{ selected: n.name === selected, muted: !n.related, waypoint: n.stop, destination: n.stop === '终', faded: tracing && traceEnd && !n.related, 'empty-records': recordMode && n.name !== 'User' && recordCounts.get(n.name)?.total === 0 }"
                :style="{ left: n.x + 'px', top: n.y + 'px', '--node-color': n.color }"
                @mouseenter="hovered = n.name" @mouseleave="hovered = ''"
                @touchstart.stop="touchStart($event, n.name)"
                @click.stop="nodeClick(n.name)" @keydown.enter.prevent="nodeClick(n.name)" :aria-label="n.label" role="button" tabindex="0">
                <view class="er-dot" :style="{ width: n.radius * 2 + 'px', height: n.radius * 2 + 'px' }">
                  <ManifestIcon v-if="tableMap.get(n.name)?.icon" class="er-node-icon" :id="tableMap.get(n.name).icon" :size="Math.max(14, n.radius * 2 - 8) + 'px'" />
                  <view v-else class="er-table-mark" />
                  <text v-if="recordMode && n.name !== 'User'" class="er-record-count er-node-badge">{{ countBadge(n.name) }}</text>
                  <text v-else-if="n.stop" class="er-stop-mark er-node-badge">{{ n.stop }}</text>
                </view>
                <view v-if="labels.nodeLabels.has(n.name)" class="er-label" :class="{ expanded: n.sqlLabel }" :style="labels.nodeLabels.get(n.name)">
                  <text class="er-label-name">{{ n.label }}</text><text v-if="n.sqlLabel" class="er-label-sql">{{ n.sqlLabel }}</text>
                </view>
                <view v-else-if="hovered === n.name" class="er-hover-label" :style="{ top: (n.radius + 6) + 'px' }">{{ n.label }}</view>
              </view>
            </view>
          </view>
          <view v-if="layoutPending || (appGraphOptimized && !graphMeasured)" class="er-layout-wait">正在布局关系图…</view>
          <view v-if="activePair" class="er-edge-card">
            <view class="er-edge-title"><text>{{ tableLabel(activePair.source) }} → {{ tableLabel(activePair.target) }}</text>
              <button v-if="pinnedLine" class="er-dismiss" aria-label="关闭关系详情" @click="clearLine">×</button></view>
            <view class="er-edge-meta"><text>{{ activePair.role }}</text><text>{{ activePair.business ? '业务关联' : '数据库外键' }}</text></view>
            <button v-if="recordMode && activeRole" class="er-button er-edge-records" :disabled="activeRole.count === null"
              @click="drillRecords(activePair.source, [activeRole.field])">{{ totalText(activeRole.count) }} · 查看记录 ↗</button>
            <scroll-view scroll-y class="er-edge-fields" :style="{ height: Math.min(4, activePair.fields.length) * 20 + 'px' }">
              <text v-for="(field, index) in activePair.fields" :key="index">{{ field.sourceColumn }} → {{ field.targetColumn }}</text>
            </scroll-view>
          </view>
          <view v-if="legendOpen" class="er-legend">
            <view v-for="index in legend" :key="index" class="er-legend-item"><view class="er-color-dot" :style="{ backgroundColor: palette(index) }" />{{ domains[index].label }}</view>
            <text class="er-convention">{{ scene ? '实线：外键 · 虚线：业务关联' : '外键表 → 被引用表' }}</text>
          </view>
          <view class="er-graph-footer">
            <button class="er-legend-toggle" :aria-pressed="legendOpen" @click="legendOpen = !legendOpen">{{ legendOpen ? '收起图例' : '图例' }}</button>
            <view class="er-tools">
              <button class="er-tool" aria-label="缩小" :disabled="zoom <= MIN_ZOOM" @click="zoomButton(1 / 1.25)">−</button>
              <button class="er-percent er-actual" aria-label="恢复原始比例" @click="resetZoom">{{ Math.round(zoom * 100) }}%</button>
              <button class="er-tool" aria-label="放大" :disabled="zoom >= MAX_ZOOM" @click="zoomButton(1.25)">＋</button>
              <button class="er-fit" @click="fitView">适配画布</button>
              <button class="er-fit" @click="rearrangeAtCurrentZoom">重排</button>
            </view>
          </view>
        </view>
        <view v-if="recordMode && userData" class="er-inspector er-user-panel">
          <view class="er-panel-heading"><text class="er-trace-title">{{ userCaption }}</text></view>
          <view class="er-identity" v-if="selected === 'User'">
            <text class="er-sql-name">{{ hitTables }} 张表有记录 · {{ userData.tables.length }} 张直接关联表</text>
            <view class="er-actions"><button class="er-button" :aria-pressed="onlyHits" @click="toggleHits">{{ onlyHits ? '显示零记录表' : '仅看有记录' }}</button>
              <button class="er-button" @click="drillRecords('User', ['id'])">查看用户记录</button></view>
          </view>
          <view class="er-identity" v-else-if="selectedCounts">
            <text class="er-table-title">{{ tableLabel(selected) }}</text>
            <text class="er-sql-name">{{ totalText(selectedCounts.total) }} · 同一记录按行去重</text>
            <view class="er-actions"><button class="er-primary" :disabled="selectedCounts.total === null" @click="drillRecords(selected)">查看记录 ↗</button>
              <button class="er-button" @click="inspect('User')">返回用户</button></view>
          </view>
          <view class="er-details-clip"><scroll-view class="er-details" scroll-y :key="selected">
            <template v-if="selected === 'User'">
              <text v-if="!recordTables.length" class="er-empty">{{ onlyHits ? '该用户暂无匹配记录。' : '没有通过用户 ID 直接关联的表。' }}</text>
              <view v-for="t in recordTables" :key="t.name" class="er-row er-record-table" @click="inspect(t.name)">
                <view class="er-row-title"><view class="er-color-dot" :style="{ backgroundColor: colorOf(t.name) }" /><text>{{ tableLabel(t.name) }}</text>
                  <text class="er-direction">{{ totalText(t.total) }} ›</text></view>
              </view>
            </template>
            <template v-else-if="selectedCounts">
              <text class="er-route-label">按关联角色查看</text>
              <button v-for="r in selectedCounts.roles" :key="r.field" class="er-record-role" :disabled="r.count === null"
                @click="drillRecords(selected, [r.field])">
                <view><text>{{ roleLabel(selected, r.column) }}</text><text class="er-field">{{ r.column }} = {{ userData.user.id }}</text></view>
                <text>{{ totalText(r.count) }} ›</text>
              </button>
            </template>
          </scroll-view></view>
        </view>
        <view v-else-if="tracing" class="er-inspector er-trace-panel">
          <view class="er-panel-heading"><text class="er-trace-title">外键路径</text><text v-if="tracePath?.length" class="er-hop-count">{{ tracePath.length }} 段关联</text></view>
          <view class="er-stations">
            <picker v-for="endpoint in endpoints" :key="endpoint.id" :range="tables" range-key="label"
              :value="Math.max(0, tables.findIndex(t => t.name === endpoint.name))" @change="setEndpoint(endpoint.id, $event)">
              <view class="er-station"><text class="er-station-pin" :class="{ end: endpoint.id === 'end' }">{{ endpoint.id === 'start' ? '起' : '终' }}</text>
                <text>{{ endpoint.name ? tableLabel(endpoint.name) : '选择目标表' }}</text><text class="er-station-caret">⌄</text></view>
            </picker>
          </view>
          <button v-if="tracePath?.length" class="er-primary er-open-path" @click="openStructure">在表结构中查看 →</button>
          <view class="er-details-clip"><scroll-view class="er-details" scroll-y>
            <text v-if="!traceEnd" class="er-trace-note">在图中点选目标表，或从上方列表选择。</text>
            <text v-else-if="traceStart === traceEnd" class="er-trace-note">起点与终点相同。选择另一张表可查看关联。</text>
            <text v-else-if="!tracePath" class="er-trace-note">这两张表之间没有可达的外键路径。</text>
            <template v-else>
              <text class="er-route-label">最短关联路径</text>
              <view v-for="(step, i) in tracePath" :key="step.edge.key" class="er-hop" :class="{ current: activeKey === step.edge.key }"
                @click="pickLine(step.edge.key)">
                <text class="er-hop-index">{{ i + 1 }}</text>
                <view class="er-hop-body"><text class="er-hop-name">{{ tableLabel(step.from) }} {{ step.from === step.edge.source ? '→' : '←' }} {{ tableLabel(step.to) }}</text>
                  <text v-for="(f, j) in step.edge.fields" :key="j" class="er-hop-field">{{ step.from === step.edge.source ? f.sourceColumn + ' → ' + f.targetColumn : f.targetColumn + ' ← ' + f.sourceColumn }}</text>
                </view>
              </view>
            </template>
          </scroll-view></view>
        </view>
        <view v-else-if="selectedTable" class="er-inspector">
          <view class="er-panel-heading"><text>表详情</text><text class="er-domain"><text :style="{ color: colorOf(selected) }">●</text> {{ domains[domainIndex(selected)].label }}</text></view>
          <view class="er-identity">
            <text class="er-table-title">{{ tableLabel(selected) }}</text>
            <text class="er-sql-name">{{ selectedTable.sqlTableName || selected }}</text>
            <view class="er-pk"><text class="er-key-tag">PK</text><text>{{ selectedTable.primaryKeys?.join(' / ') || '未提供主键' }}</text></view>
            <view class="er-actions">
              <button class="er-primary" @click="$emit('select', selected)">查看数据 <text>↗</text></button>
              <button v-if="showAll || scene || anchor !== selected" class="er-button" @click="expandSelected">展开关联</button>
            </view>
          </view>
          <view class="er-list-heading">{{ scene ? '表间关系' : '外键关系' }} <text>{{ detailFields }}</text></view>
          <view class="er-details-clip"><scroll-view class="er-details" scroll-y :key="selected">
            <text v-if="!details.length" class="er-empty">这张表没有外键关联。</text>
            <view v-for="item in details" :key="item.key" class="er-row" :class="{ pinned: activeKey === item.key }" @click="pinDetail(item)">
              <view class="er-row-title"><view class="er-color-dot" :style="{ backgroundColor: colorOf(item.other) }" /><text>{{ tableLabel(item.other) }}</text><text class="er-direction">{{ item.business ? '业务' : item.direction }}</text><button v-if="item.other !== selected" class="er-jump-table" :aria-label="'查看' + tableLabel(item.other)" @click.stop="follow(item.other)">↗</button></view>
              <text v-if="item.lanes > 1" class="er-role">{{ item.role }}</text>
              <text v-for="(field, i) in item.fields" :key="i" class="er-field">{{ field.sourceColumn }} → {{ field.targetColumn }}</text>
            </view>
          </scroll-view></view>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup>
import { computed, getCurrentInstance, nextTick, onMounted, onUnmounted, ref, shallowRef, triggerRef, watch } from 'vue'
import { getAdminDatabaseRelations } from '@/api/database'
import DatabaseEntityDiagram from './DatabaseEntityDiagram.vue'
import ManifestIcon from '@/components/ManifestIcon.vue'
import { createRelationFrameBudget } from './database-relation-frame-budget'
import { businessViews, domainIndex, domains, dragSprings, graphBounds, graphLabels, graphPadding, groupRelations, layoutTables, refineRelationNeighborhoodsInSteps, relationStrokes, shortestRelationPath, tableDoubleTap } from './database-relation-layout'

const props = defineProps({ tables: { type: Array, default: () => [] }, current: { type: String, default: '' }, userId: { type: [Number, String], default: null }, light: Boolean, mode: { type: String, default: 'structure' }, initialMessageField: String })
const emit = defineEmits(['select', 'switch-table', 'choose-user', 'exit-user', 'user-records', 'update:mode', 'message-field-consumed', 'account-insights', 'field-focus'])
const diagramMode = computed({ get: () => props.mode, set: value => emit('update:mode', value) })
const entityBooking = ref(false)
const canShowStructure = computed(() => props.tables.length > 0)
const structure = computed(() => canShowStructure.value && diagramMode.value === 'structure')
const instance = getCurrentInstance(), stage = ref(null)
const anchor = ref(props.current), selected = ref(props.current), hovered = ref(''), showAll = ref(false)
const legendOpen = ref(false)
const loading = ref(true), error = ref(''), relations = ref([])
const businessFields = ref([]), sceneRoot = ref('')
const recordMode = computed(() => props.userId != null)
const userData = ref(null), onlyHits = ref(false)
const userCaption = computed(() => userData.value ? (userData.value.user.username || '用户') + ' #' + userData.value.user.id : '')
const recordCounts = computed(() => new Map((userData.value?.tables || []).map(t => [t.name, t])))
const hitTables = computed(() => (userData.value?.tables || []).filter(t => t.total > 0).length)
const recordTables = computed(() => (userData.value?.tables || []).filter(t => !onlyHits.value || t.total !== 0)
  .slice().sort((a,b) => (b.total ?? -1) - (a.total ?? -1) || tableLabel(a.name).localeCompare(tableLabel(b.name))))
const selectedCounts = computed(() => recordCounts.value.get(selected.value))
const totalText = count => count == null ? '未能统计' : count + ' 条'
function countBadge(name) {
  const count = recordCounts.value.get(name)?.total
  return count == null ? '—' : count > 999 ? '999+' : String(count)
}
function toggleHits() { onlyHits.value = !onlyHits.value; inspect('User') }
function drillRecords(name, fields) {
  const keys = fields || recordCounts.value.get(name)?.roles.map(r => r.field)
  if (userData.value && keys?.length) emit('user-records', { name, userId: userData.value.user.id, fields: keys })
}
const layoutNames = ['力导向布局', '环形布局'], layout = ref('force')
const width = ref(600), height = ref(410), positions = shallowRef([])
const graphMeasured = ref(false), layoutPending = ref(false)
const MIN_ZOOM = .2, MAX_ZOOM = 5
const zoom = ref(1), pan = ref({ x: 0, y: 0 }), moving = ref(false)
const tableMap = computed(() => new Map(props.tables.map(t => [t.name, t])))
const tableLabel = name => tableMap.value.get(name)?.label || name
const tracing = ref(false), traceStart = ref(''), traceEnd = ref('')
const endpoints = computed(() => [{ id: 'start', name: traceStart.value }, { id: 'end', name: traceEnd.value }])
const selectedTable = computed(() => tableMap.value.get(selected.value))
const palette = index => domains[index][props.light ? 'color' : 'dark']
const colorOf = name => palette(domainIndex(name))
const pairs = computed(() => groupRelations(relations.value.filter(r => r && tableMap.value.has(r.source) && tableMap.value.has(r.target))))
const recordPairs = computed(() => {
  if (!recordMode.value) return []
  const fields = [...relations.value, ...businessFields.value.map(f => ({ ...f, business: true }))]
  return groupRelations(fields.filter(r => r && r.target === 'User' &&
    recordCounts.value.get(r.source)?.roles.some(role => role.column === r.sourceColumn) && (!onlyHits.value || recordCounts.value.get(r.source).total !== 0)))
})
function roleLabel(name, column) {
  return recordPairs.value.find(e => e.source === name && e.fields.some(f => f.sourceColumn === column))?.role || column
}
const tracePath = computed(() => tracing.value ? shortestRelationPath(pairs.value, traceStart.value, traceEnd.value) : null)
const pathKeys = computed(() => new Set((tracePath.value || []).map(s => s.edge.key)))
const stops = computed(() => {
  const names = new Map()
  if (!tracing.value) return names
  for (const [i, step] of (tracePath.value || []).entries()) names.set(step.to, String(i + 1))
  if (traceEnd.value) names.set(traceEnd.value, '终')
  names.set(traceStart.value, '起')
  return names
})
const availableViews = computed(() => businessViews.filter(v => tableMap.value.has(v.root)))
const businessOptions = computed(() => [{ label: '选择业务链路' }, ...availableViews.value])
const scene = computed(() => !tracing.value && availableViews.value.find(v => v.root === sceneRoot.value))
const sceneEdges = computed(() => {
  if (!scene.value) return []
  const names = new Set(scene.value.names)
  const fields = [...relations.value, ...businessFields.value.map(f => ({ ...f, business: true }))]
  return groupRelations(fields.filter(f => f && names.has(f.source) && names.has(f.target) && tableMap.value.has(f.source) && tableMap.value.has(f.target)))
})
const incident = (r, name) => r.source === name || r.target === name
const directTableNames = computed(() => {
  const names = new Set([anchor.value])
  for (const r of pairs.value) if (incident(r, anchor.value)) { names.add(r.source); names.add(r.target) }
  return names
})
const edges = computed(() => {
  if (recordMode.value) return recordPairs.value
  if (scene.value) return sceneEdges.value
  return showAll.value ? pairs.value : pairs.value.filter(r => directTableNames.value.has(r.source) && directTableNames.value.has(r.target))
})
// A role can have no records even when another role in the same table does.
// Unknown counts are kept visible rather than mistaken for zero.
const emptyRecordEdges = computed(() => {
  const result = new Set()
  if (!recordMode.value) return result
  for (const edge of edges.value) {
    const table = recordCounts.value.get(edge.source)
    const roles = edge.fields.map(field => table?.roles.find(role => role.column === field.sourceColumn))
    if (table?.total === 0 || (roles.length && roles.every(role => role && role.count === 0))) result.add(edge.key)
  }
  return result
})
const visibleTables = computed(() => {
  if (recordMode.value) { const names = new Set(recordTables.value.map(t => t.name)); return props.tables.filter(t => t.name === 'User' || names.has(t.name)) }
  if (scene.value) return props.tables.filter(t => scene.value.names.includes(t.name))
  if (showAll.value) return props.tables
  return props.tables.filter(t => directTableNames.value.has(t.name))
})
const legend = computed(() => [...new Set(visibleTables.value.map(t => domainIndex(t.name)))].sort())
const fieldCount = computed(() => edges.value.reduce((sum, r) => sum + (r.business ? 0 : r.fields.length), 0))
const businessCount = computed(() => edges.value.filter(r => r.business).length)
const details = computed(() => (scene.value ? sceneEdges.value : pairs.value).filter(r => incident(r, selected.value)).map(r => ({
  ...r, other: r.source === selected.value ? r.target : r.source,
  direction: r.source === r.target ? '自引用' : r.source === selected.value ? '引用' : '被引用'
})))
const detailFields = computed(() => details.value.reduce((sum, r) => sum + r.fields.length, 0))
const hoverLine = ref(''), pinnedLine = ref('')
const activeKey = computed(() => pinnedLine.value || hoverLine.value)
const activePair = computed(() => edges.value.find(edge => edge.key === activeKey.value))
const activeRole = computed(() => {
  const edge = activePair.value
  return edge && recordCounts.value.get(edge.source)?.roles.find(r => r.column === edge.fields[0]?.sourceColumn)
})
const emphasized = computed(() => hovered.value || selected.value)
const degree = computed(() => {
  const counts = new Map()
  for (const r of edges.value) {
    counts.set(r.source, (counts.get(r.source) || 0) + 1)
    if (r.target !== r.source) counts.set(r.target, (counts.get(r.target) || 0) + 1)
  }
  return counts
})
const near = computed(() => {
  if (tracing.value && traceEnd.value) return new Set(stops.value.keys())
  if (activePair.value) return new Set([activePair.value.source, activePair.value.target])
  const names = new Set([emphasized.value])
  for (const r of edges.value) if (incident(r, emphasized.value)) { names.add(r.source); names.add(r.target) }
  return names
})
const zoomDetail = computed(() => zoom.value < .7 ? 0 : zoom.value >= 1.45 ? 2 : 1)
// Lay out edges and labels in symbol units, then scale the entire drawing.
// On screen, positions still scale by zoom while symbol sizes grow logarithmically.
const symbolScale = computed(() => zoom.value <= 1 ? zoom.value : 1 + .5 * Math.log(zoom.value))
const positionScale = computed(() => zoom.value / symbolScale.value)
const graphNodes = computed(() => positions.value.map(n => {
  const chosen = n.name === selected.value, related = near.value.has(n.name)
  const weight = degree.value.get(n.name) || 0
  const stop = stops.value.get(n.name)
  const sqlLabel = zoomDetail.value === 2 && related ? tableMap.value.get(n.name)?.sqlTableName || n.name : ''
  return { ...n, x: n.x * positionScale.value, y: n.y * positionScale.value,
    label: recordMode.value && n.name === 'User' ? userCaption.value : tableLabel(n.name), stop, sqlLabel,
    hideLabel: !zoomDetail.value && !chosen && !stop && n.name !== hovered.value && weight < 4, color: stop ? 'var(--accent)' : colorOf(n.name), related,
    radius: stop || chosen ? 17 : recordMode.value ? 14 : Math.max(14, 7 + Math.min(7, Math.sqrt(weight) * 1.6)),
    priority: (stop ? 5000 : 0) + (n.name === hovered.value ? 3000 : chosen ? 2000 : related ? 1000 : 0) + weight }
}))
const sceneStyle = computed(() => ({
  transform: 'translate(' + (width.value / 2 + pan.value.x) + 'px,' + (height.value / 2 + pan.value.y) + 'px) scale(' + symbolScale.value + ')'
}))
let curvedLinks = false
// #ifdef H5
curvedLinks = true
// #endif
let appGraphOptimized = false
// #ifdef APP-PLUS
appGraphOptimized = true
// #endif
let desktopBudget = false
try {
  const info = uni.getSystemInfoSync()
  desktopBudget = !appGraphOptimized && !/android|ios|iphone|ipad/i.test(String(info.platform || info.system || '')) && (info.windowWidth || 0) > 740
} catch (_) { /* start conservatively when device information is unavailable */ }
const frameBudget = createRelationFrameBudget(desktopBudget)
let dragBends = null, dragLabels = null, dragArrows = null, gestureLabels = null, stableBends = null, dragOrigin = null
const settling = ref(false)
const bendRevision = ref(0)
const strokes = computed(() => { bendRevision.value; return relationStrokes(graphNodes.value, edges.value, curvedLinks, moving.value || settling.value ? dragBends : stableBends, null, (moving.value || settling.value) ? dragArrows : null) })
const labels = computed(() => {
  if ((moving.value || settling.value) && dragLabels) return { nodeLabels: dragLabels, lineLabels: [] }
  if (moving.value && gestureLabels) return gestureLabels
  const scale = symbolScale.value
  const left = -(width.value / 2 + pan.value.x) / scale
  const top = -(height.value / 2 + pan.value.y) / scale
  const limitLabels = (tracing.value && traceEnd.value) || !zoomDetail.value
  const annotated = limitLabels ? strokes.value.filter(line => pathKeys.value.has(line.key) || line.key === activeKey.value) : strokes.value
  const result = graphLabels(graphNodes.value, annotated, { left, top, right: left + width.value / scale, bottom: top + height.value / scale }, activeKey.value, strokes.value)
  const hoveredLine = strokes.value.find(item => item.key === hoverLine.value)
  for (const node of graphNodes.value) {
    if (hoveredLine && (node.name === hoveredLine.source || node.name === hoveredLine.target) && !result.nodeLabels.has(node.name)) {
      const width = Math.min(144, 10 + [...node.label].reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 12 : 6.7), 0))
      result.nodeLabels.set(node.name, { left: -width / 2 + 'px', top: (node.radius + 5) + 'px', width: width + 'px' })
    }
  }
  for (const line of strokes.value) {
    if (!(line.key === hoverLine.value || hovered.value && incident(line, hovered.value)) || result.lineLabels.some(tag => tag.key === line.key)) continue
    const field = line.fields[0]
    const text = field.sourceColumn + ' → ' + field.targetColumn + (line.fields.length > 1 ? ' +' + (line.fields.length - 1) : '')
    const width = Math.min(160, 12 + text.length * 8)
    result.lineLabels.push({ key: line.key, text, x: line.captionX - width / 2, y: line.captionY - 10, width })
  }
  return result
})
const lines = computed(() => strokes.value.map(line => {
  const lit = activeKey.value ? line.key === activeKey.value : incident(line, emphasized.value)
  const strong = line.key === activeKey.value || pathKeys.value.has(line.key)
  const empty = emptyRecordEdges.value.has(line.key)
  const inspectingEmpty = empty && (hovered.value === line.source || selected.value === line.source)
  const opacity = strong ? 1 : empty && !inspectingEmpty ? .1 : tracing.value && traceEnd.value ? .14 : lit ? .85 : .32
  const color = strong ? 'var(--accent)' : colorOf(line.source === anchor.value ? line.target : line.source)
  const style = { left: line.x + 'px', top: line.y + 'px', width: line.length + 'px', color, opacity }
  if (line.loop) style.height = line.length + 'px'
  else style.transform = 'rotate(' + line.angle + 'rad)'
  return { key: line.key, business: line.business, path: line.path, color, strong, neighborFlow: !!hovered.value && incident(line, hovered.value), opacity, loop: line.loop, style, arrowStyle: {
    left: line.arrowX + 'px', top: line.arrowY + 'px', color, opacity: strong || lit && !tracing.value && (!empty || inspectingEmpty) ? 1 : opacity,
    transform: 'translate(-50%, -50%) rotate(' + line.arrowAngle + 'rad)' } }
}))
function openBusiness(event) {
  const view = availableViews.value[Number(event.detail.value) - 1]
  if (!view) return
  if (tracing.value) exitTrace()
  sceneRoot.value = view.root; anchor.value = view.root; showAll.value = false
  inspect(view.root)
}
async function pinDetail(item) {
  if (!edges.value.some(e => e.key === item.key)) {
    anchor.value = selected.value
    await nextTick()
  }
  pickLine(item.key)
}
function clearLine() { pinnedLine.value = ''; hoverLine.value = '' }
function pickLine(key) {
  if (Date.now() < ignoreClickUntil) return
  pinnedLine.value = pinnedLine.value === key ? '' : key
  hoverLine.value = ''
}

const nextFrame = callback => typeof requestAnimationFrame === 'function' ? requestAnimationFrame(callback) : setTimeout(callback, 16)
const dropFrame = id => typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id)
let spring = null, springFrame = null, ticks = 0, viewEdited = false
let bendTargets = null, routedPositions = null, lastRouteTime = 0
let routeWorker = null, routeWorkerFailed = false, routeBusy = false, routeQueued = null, routeSequence = 0, routeTimer = null
function invalidateRouteWork() { routeSequence++; routeQueued = null }
function sendRouteWork(job) {
  if (!routeWorker || routeBusy) {
    if (routeQueued) job.affected = [...new Set([...routeQueued.affected, ...job.affected])]
    routeQueued = job; return
  }
  routeBusy = true
  try { routeWorker.postMessage(job); routeTimer = setTimeout(failRouteWorker, 5000) } catch (_) { failRouteWorker() }
}
function failRouteWorker() {
  if (routeTimer) clearTimeout(routeTimer)
  routeTimer = null
  routeWorker?.terminate(); routeWorker = null; routeWorkerFailed = true
  routeBusy = false; routeQueued = null; routedPositions = null; lastRouteTime = 0
}
function ensureRouteWorker() {
  // #ifdef H5
  if (!routeWorker && !routeWorkerFailed && typeof Worker !== 'undefined') {
    try {
      routeWorker = new Worker(new URL('./database-relation-worker.js', import.meta.url), { type: 'module' })
      routeWorker.onmessage = event => {
        const { id, result, error } = event.data
        if (routeTimer) clearTimeout(routeTimer)
        routeTimer = null
        routeBusy = false
        if (error) { failRouteWorker(); return }
        if (id === routeSequence && dragBends && bendTargets) for (const [key, bend] of result) bendTargets.set(key, bend)
        if (routeQueued) { const next = routeQueued; routeQueued = null; sendRouteWork(next) }
      }
      routeWorker.onerror = failRouteWorker
    } catch (_) { failRouteWorker() }
  }
  // #endif
  return routeWorker
}
function stopSprings() {
  if (springFrame !== null) dropFrame(springFrame)
  springFrame = null; spring = null
  invalidateRouteWork()
  settling.value = false
}
function tickSprings(timestamp) {
  frameBudget.observe(Number.isFinite(timestamp) ? timestamp : Date.now(), 30)
  springFrame = null
  if (!dragBends) return
  const speed = spring ? spring(frameBudget.repulsionPeriod) : 0
  triggerRef(positions)
  const now = Date.now()
  if (curvedLinks && now - lastRouteTime >= frameBudget.routeInterval) {
    const changed = new Set(positions.value.filter(node => {
      const old = routedPositions?.get(node.name)
      return !old || Math.hypot(node.x - old.x, node.y - old.y) > 3
    }).map(node => node.name))
    if (changed.size) {
      const affected = new Set(edges.value.filter(edge => changed.has(edge.source) || changed.has(edge.target)).map(edge => edge.key))
      if (affected.size) {
        if (ensureRouteWorker()) {
          const id = ++routeSequence
          const job = { id,
            nodes: graphNodes.value.map(({ name, x, y, radius }) => ({ name, x, y, radius })),
            edges: edges.value.map(({ key, source, target, lane, lanes }) => ({ key, source, target, lane, lanes })),
            bends: [...dragBends], affected: [...affected] }
          sendRouteWork(job)
        } else for (const line of relationStrokes(graphNodes.value, edges.value, curvedLinks, dragBends, affected)) {
          if (affected.has(line.key)) bendTargets.set(line.key, line.bend || 0)
        }
      }
      routedPositions = new Map(positions.value.map(node => [node.name, { x: node.x, y: node.y }]))
    }
    lastRouteTime = now
  }
  let remaining = 0
  for (const [key, target] of bendTargets || []) {
    const current = dragBends.get(key) ?? target, next = current + (target - current) * .18
    dragBends.set(key, next); remaining = Math.max(remaining, Math.abs(target - next))
  }
  if (curvedLinks) bendRevision.value++
  if (moving.value || speed > .035 || remaining > .15 || routeBusy || routeQueued || curvedLinks && !lastRouteTime) {
    if (++ticks < 300 || moving.value) springFrame = nextFrame(tickSprings)
    else { spring = null; stableBends = new Map(dragBends); settling.value = false; dragBends = null; dragLabels = null; dragArrows = null; dragOrigin = null }
  } else {
    spring = null; stableBends = new Map(dragBends); settling.value = false; dragBends = null; dragLabels = null; dragArrows = null; dragOrigin = null
  }
}

let layoutFrame = null, layoutVersion = 0
function cancelLayout() {
  layoutVersion++
  if (layoutFrame !== null) dropFrame(layoutFrame)
  layoutFrame = null; layoutPending.value = false
}
function finishLayoutInFrames(placed, fitAfter) {
  cancelLayout()
  positions.value = placed
  if (layout.value !== 'force' || !placed.length) { if (fitAfter) fitView(); return }
  const working = placed.map(node => ({ ...node }))
  const steps = refineRelationNeighborhoodsInSteps(working, edges.value, showAll.value ? '' : anchor.value, showAll.value)
  const version = layoutVersion
  layoutPending.value = true
  frameBudget.resetClock()
  const now = () => typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
  const run = timestamp => {
    layoutFrame = null
    if (disposed || version !== layoutVersion) return
    frameBudget.observe(Number.isFinite(timestamp) ? timestamp : Date.now())
    const started = now()
    let done = false, count = 0
    do { done = steps.next().done; count++ }
    while (!done && count < frameBudget.windows && now() - started < frameBudget.milliseconds)
    if (!done) { layoutFrame = nextFrame(run); return }
    positions.value = working
    if (fitAfter) fitView()
    layoutPending.value = false
    frameBudget.resetClock()
  }
  layoutFrame = nextFrame(run)
}
function arrange() {
  viewEdited = false
  cancelLayout(); cancelGesture(); stopSprings(); stopZoom(); clearLine()
  stableBends = null; dragOrigin = null; dragBends = null; dragLabels = null; bendRevision.value++
  const placed = layoutTables(visibleTables.value, edges.value, showAll.value ? '' : anchor.value, layout.value, width.value, height.value, curvedLinks, showAll.value, { deferRefinement: true, iterations: frameBudget.iterations })
  pan.value = { x: 0, y: 0 }; zoom.value = 1; hovered.value = ''
  finishLayoutInFrames(placed, showAll.value)
}
function rearrangeAtCurrentZoom() {
  cancelLayout(); cancelGesture(); stopSprings(); stopZoom(); clearLine()
  stableBends = null; dragOrigin = null; dragBends = null; dragLabels = null; bendRevision.value++
  const scale = zoom.value
  const placed = layoutTables(visibleTables.value, edges.value, showAll.value ? '' : anchor.value,
    layout.value, width.value / scale, height.value / scale, curvedLinks, showAll.value, { deferRefinement: true, iterations: frameBudget.iterations })
  pan.value = { x: 0, y: 0 }; hovered.value = ''; viewEdited = true
  finishLayoutInFrames(placed, false)
}
function fitView() {
  stopZoom()
  if (!positions.value.length) return
  const b = graphBounds(positions.value)
  const padding = graphPadding(width.value, height.value)
  const scale = Math.min(1, Math.max(1, width.value - padding.x) / Math.max(1, b.right - b.left), Math.max(1, height.value - padding.y) / Math.max(1, b.bottom - b.top))
  zoom.value = Math.max(.01, scale)
  pan.value = { x: -(b.left + b.right) * zoom.value / 2, y: -(b.top + b.bottom) * zoom.value / 2 }
}
function chooseLayout(event) { layout.value = Number(event.detail.value) === 1 ? 'circle' : 'force' }
let beforeTrace = null
function openStructure() {
  stopSprings(); stopZoom(); cancelGesture()
  hovered.value = ''; hoverLine.value = ''
  diagramMode.value = 'structure'
}
function toggleTrace() {
  if (tracing.value) { exitTrace(); return }
  if (!selectedTable.value) return
  stopZoom(); stopSprings(); clearLine()
  beforeTrace = { all: showAll.value, anchor: anchor.value, topology: topology.value, edited: viewEdited,
    positions: positions.value.map(n => ({ ...n })), zoom: zoom.value, pan: { ...pan.value } }
  traceStart.value = selected.value; traceEnd.value = ''; hovered.value = ''
  tracing.value = true; showAll.value = true
}
function exitTrace() {
  const saved = beforeTrace
  beforeTrace = null; tracing.value = false; traceStart.value = ''; traceEnd.value = ''; clearLine()
  if (!saved) return
  showAll.value = saved.all; anchor.value = tableMap.value.has(saved.anchor) ? saved.anchor : selected.value
  nextTick(() => {
    if (disposed || tracing.value || topology.value !== saved.topology) return
    stopZoom(); stopSprings()
    positions.value = saved.positions; zoom.value = saved.zoom; pan.value = saved.pan; viewEdited = saved.edited
  })
}
function focusTrace() {
  clearLine(); hovered.value = ''
  if (!traceEnd.value) return
  const points = positions.value.filter(n => stops.value.has(n.name))
  if (!points.length) return
  stopZoom(); viewEdited = true
  const b = graphBounds(points)
  const scale = Math.min(1.35, width.value / (b.right - b.left + 150), height.value / (b.bottom - b.top + 100))
  zoom.value = Math.max(MIN_ZOOM, scale)
  pan.value = { x: -(b.left + b.right) * zoom.value / 2, y: -(b.top + b.bottom) * zoom.value / 2 }
}
function setEndpoint(id, event) {
  const name = props.tables[Number(event.detail.value)]?.name
  if (!name) return
  if (id === 'start') traceStart.value = name
  else traceEnd.value = name
  focusTrace()
}
function setScope(all) {
  if (tracing.value) exitTrace()
  sceneRoot.value = ''
  if (!all) anchor.value = selected.value
  showAll.value = all
}
function inspect(name) { clearLine(); selected.value = name; hovered.value = '' }
function expandSelected() { setScope(false) }
function follow(name) {
  if (!visibleTables.value.some(t => t.name === name)) anchor.value = name
  inspect(name)
}
function zoomAt(value, x = width.value / 2, y = height.value / 2) {
  if (![value, x, y].every(Number.isFinite)) return
  const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value)), ratio = next / zoom.value
  const dx = x - width.value / 2, dy = y - height.value / 2
  pan.value = { x: dx - (dx - pan.value.x) * ratio, y: dy - (dy - pan.value.y) * ratio }
  zoom.value = next
}
let stageRect = { left: 0, top: 0 }, gesture = null, ignoreClickUntil = 0, observer
const stageElement = () => stage.value?.$el || stage.value
function rectNow() { return stageElement()?.getBoundingClientRect?.() || stageRect }
let zoomFrame = null, targetZoom = 1, zoomPivot = null
function stopZoom() {
  if (zoomFrame !== null) dropFrame(zoomFrame)
  zoomFrame = null; targetZoom = zoom.value
}
function animateZoom() {
  const gap = Math.log(targetZoom / zoom.value), done = Math.abs(gap) < .003
  zoomAt(done ? targetZoom : zoom.value * Math.exp(gap * .32), zoomPivot.x, zoomPivot.y)
  zoomFrame = done ? null : nextFrame(animateZoom)
}
function smoothZoom(factor, x, y) {
  viewEdited = true
  const base = zoomFrame === null ? zoom.value : targetZoom
  targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, base * factor))
  zoomPivot = { x, y }
  if (zoomFrame === null) zoomFrame = nextFrame(animateZoom)
}
function resetZoom() {
  stopZoom()
  zoomButton(1 / zoom.value)
}
function zoomButton(factor) {
  const node = positions.value.find(n => n.name === selected.value)
  const x = width.value / 2 + pan.value.x + (node?.x || 0) * zoom.value
  const y = height.value / 2 + pan.value.y + (node?.y || 0) * zoom.value
  const visible = node && x >= 0 && x <= width.value && y >= 0 && y <= height.value
  smoothZoom(factor, visible ? x : width.value / 2, visible ? y : height.value / 2)
}
function wheelZoom(event) {
  event.preventDefault()
  const rect = rectNow(), unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height.value : 1
  const delta = Math.max(-200, Math.min(200, event.deltaY * unit))
  smoothZoom(Math.exp(-delta * (event.ctrlKey ? .009 : .0018)), event.clientX - rect.left, event.clientY - rect.top)
}
function begin(point, name) {
  stopZoom()
  gesture = { x: point.clientX, y: point.clientY, name, lastX: point.clientX, lastY: point.clientY }
}
function move(point) {
  if (!gesture || gesture.pinch) return
  const x = point.clientX, y = point.clientY
  if (!moving.value && Math.hypot(x - gesture.x, y - gesture.y) < 4) return
  if (!moving.value && !gesture.name) gestureLabels = labels.value
  if (!moving.value && gesture.name) {
    const currentBends = new Map(strokes.value.map(line => [line.key, line.bend || 0]))
    const currentArrows = new Map(strokes.value.filter(line => line.arrowT != null).map(line => [line.key, line.arrowT]))
    const currentLabels = new Map(labels.value.nodeLabels)
    stopSprings(); clearLine()
    dragBends = currentBends; dragLabels = currentLabels; dragArrows = currentArrows
    bendTargets = new Map(dragBends); routedPositions = null; lastRouteTime = 0
    dragOrigin = new Map(positions.value.map(node => [node.name, { x: node.x, y: node.y }]))
    if (layout.value === 'force') { frameBudget.resetClock(); spring = dragSprings(positions.value, edges.value, gesture.name) }
    settling.value = true
  }
  moving.value = true; viewEdited = true
  const dx = x - gesture.lastX, dy = y - gesture.lastY
  if (gesture.name) {
    const node = positions.value.find(n => n.name === gesture.name)
    if (node) {
      node.x += dx / zoom.value; node.y += dy / zoom.value
      ticks = 0
      if (springFrame === null) springFrame = nextFrame(tickSprings)
    }
  } else pan.value = { x: pan.value.x + dx, y: pan.value.y + dy }
  gesture.lastX = x; gesture.lastY = y
}
function cancelGesture() {
  if (moving.value) { doubleTap(); ignoreClickUntil = Date.now() + 260 }
  gesture = null; moving.value = false; gestureLabels = null
  if (dragBends) {
    if (springFrame === null) springFrame = nextFrame(tickSprings)
  } else { settling.value = false; dragBends = null; dragLabels = null; dragArrows = null }
  // #ifdef H5
  window.removeEventListener('mousemove', move)
  window.removeEventListener('mouseup', cancelGesture)
  window.removeEventListener('blur', cancelGesture)
  // #endif
}
function mouseStart(event) {
  // #ifdef H5
  if (event.button !== 0 || event.sourceCapabilities?.firesTouchEvents) return
  begin(event, event.target.closest?.('.er-node')?.dataset.table)
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', cancelGesture)
  window.addEventListener('blur', cancelGesture)
  // #endif
}
const doubleTap = tableDoubleTap()
function switchGraphTable(name) {
  if (recordMode.value) {
    if (name === 'User') drillRecords(name, ['id'])
    else if (recordCounts.value.has(name)) drillRecords(name)
    return
  }
  entityBooking.value = false
  inspect(name)
  setScope(false)
  emit('switch-table', name)
}
function nodeClick(name) {
  if (Date.now() < ignoreClickUntil) return
  if (doubleTap(name)) { switchGraphTable(name); return }
  if (tracing.value) { traceEnd.value = name; focusTrace() }
  else inspect(name)
}
function touchPair(touches) {
  const [a, b] = [touches[0], touches[1]], rect = rectNow()
  return { x: (a.clientX + b.clientX) / 2 - rect.left, y: (a.clientY + b.clientY) / 2 - rect.top,
    distance: Math.max(1, Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)) }
}
function touchStart(event, name) {
  stopZoom()
  if (event.touches.length === 1) begin(event.touches[0], name)
  else { if (!moving.value) gestureLabels = labels.value; gesture = { pinch: touchPair(event.touches) }; moving.value = true }
}
function touchMove(event) {
  if (event.touches.length < 2) { if (event.touches[0]) move(event.touches[0]); return }
  const next = touchPair(event.touches), prev = gesture?.pinch
  if (prev) {
    viewEdited = true
    zoomAt(zoom.value * next.distance / prev.distance, prev.x, prev.y)
    pan.value = { x: pan.value.x + next.x - prev.x, y: pan.value.y + next.y - prev.y }
  }
  gesture = { pinch: next }; moving.value = true
}
function touchEnd(event) {
  if (event.touches.length === 1) { begin(event.touches[0], null); moving.value = true }
  else cancelGesture()
}
let disposed = false, measureGeneration = 0
let mouseSurface = null
function bindSurface(element) {
  // #ifdef H5
  // uni-app's normalized events omit mouse buttons and wheel deltas.
  mouseSurface?.removeEventListener('wheel', wheelZoom)
  mouseSurface?.removeEventListener('mousedown', mouseStart)
  mouseSurface = element
  mouseSurface?.addEventListener('wheel', wheelZoom, { passive: false })
  mouseSurface?.addEventListener('mousedown', mouseStart)
  // #endif
}
function setSize(rect) {
  if (disposed || !rect?.width || !rect.height) return
  stageRect = rect; width.value = Math.round(rect.width); height.value = Math.round(rect.height)
  if (appGraphOptimized && !graphMeasured.value) {
    const generation = measureGeneration
    // Let the size watcher finish the first layout before displaying the scene.
    nextTick(() => {
      if (!disposed && generation === measureGeneration && !loading.value && !structure.value && !error.value) graphMeasured.value = true
    })
  }
}
function measure() {
  if (!disposed) uni.createSelectorQuery().in(instance.proxy).select('.er-stage').boundingClientRect(setSize).exec()
}
watch(() => !structure.value && !loading.value && !error.value && visibleTables.value.length > 0, async ready => {
  const generation = ++measureGeneration
  if (!ready && appGraphOptimized) graphMeasured.value = false
  await nextTick()
  if (generation !== measureGeneration) return
  observer?.disconnect()
  bindSurface(ready && !disposed ? stageElement() : null)
  if (!ready || disposed) return
  measure()
  // #ifdef H5
  if (stageElement() && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => setSize(rectNow()))
    observer.observe(stageElement())
  }
  // #endif
}, { flush: 'post' })
const topology = computed(() => JSON.stringify([layout.value, scene.value?.root, showAll.value, showAll.value ? '' : anchor.value,
  visibleTables.value.map(t => t.name), edges.value.map(r => r.key)]))
watch(topology, arrange, { immediate: true })
watch([width, height], () => { if (!viewEdited) arrange() })
watch(() => props.mode, mode => {
  doubleTap()
  if (mode === 'structure') { cancelLayout(); cancelGesture(); stopSprings(); stopZoom(); hovered.value = ''; hoverLine.value = '' }
})
watch(() => props.current, name => { if (name && !recordMode.value) { if (tracing.value) exitTrace(); anchor.value = name; inspect(name) } })
watch(tableMap, map => {
  if (!map.has(anchor.value)) anchor.value = map.keys().next().value || ''
  if (!map.has(selected.value)) inspect(anchor.value)
  if (sceneRoot.value && !map.has(sceneRoot.value)) sceneRoot.value = ''
  if (tracing.value && (!map.has(traceStart.value) || traceEnd.value && !map.has(traceEnd.value))) exitTrace()
}, { immediate: true })
let loadVersion = 0
watch(() => props.userId, () => { load() })
async function load() {
  const version = ++loadVersion
  if (appGraphOptimized) graphMeasured.value = false
  cancelLayout()
  loading.value = true; error.value = ''
  try {
    const response = await getAdminDatabaseRelations(props.userId)
    if (disposed || version !== loadVersion) return
    if (response?.code !== 0 || !Array.isArray(response.data?.relations)) throw new Error(response?.msg || '读取失败')
    if (recordMode.value && (String(response.data.userData?.user?.id) !== String(props.userId) || !Array.isArray(response.data.userData?.tables))) throw new Error('未取得该用户的记录统计')
    if (!disposed) {
      const hadUser = !!userData.value, previousUser = userData.value?.user.id
      userData.value = response.data.userData || null
      if (recordMode.value) {
        tracing.value = false; beforeTrace = null; sceneRoot.value = ''; showAll.value = false; anchor.value = 'User'
        if (previousUser !== userData.value.user.id || !selectedCounts.value || (onlyHits.value && selectedCounts.value.total === 0)) inspect('User')
        if (previousUser !== userData.value.user.id) onlyHits.value = false
      } else if (hadUser) { onlyHits.value = false; anchor.value = props.current || 'User'; inspect(anchor.value) }
      relations.value = response.data.relations
      businessFields.value = Array.isArray(response.data.businessRelations) ? response.data.businessRelations.filter(Boolean) : []
    }
  } catch (e) { if (!disposed && version === loadVersion) error.value = (recordMode.value ? '读取用户数据失败：' : '读取关系失败：') + (e?.message || '请重试') }
  finally { if (!disposed && version === loadVersion) loading.value = false }
}
onMounted(() => { load(); uni.onWindowResize?.(measure) })
onUnmounted(() => { disposed = true; cancelLayout(); cancelGesture(); stopSprings(); stopZoom(); routeWorker?.terminate(); routeWorker = null; if (routeTimer) clearTimeout(routeTimer); observer?.disconnect(); bindSurface(null); uni.offWindowResize?.(measure) })
</script>
<style scoped>
.er-workspace {
  --panel: #102c37; --floating-panel: rgba(16,44,55,.82); --surface: #173640; --canvas: #102a34; --grid: rgba(151,197,196,.14);
  --ink: #e8f2f1; --text: #b9d1d1; --soft: #90adae; --line: #304c55;
  --accent: #80dcc8; --tint: #21483f; --cta: #91e1ca; --cta-ink: #123b32;
  margin: 5px 10px; color: var(--text); background: var(--panel); overflow: hidden;
  border: 1px solid var(--line); border-radius: 14px; font-family: inherit; font-size: 12px;
}
.er-workspace.light {
  --panel: #fff; --floating-panel: rgba(255,255,255,.82); --surface: #f3f7f5; --canvas: #f7faf8; --grid: rgba(92,126,111,.17);
  --ink: #193b34; --text: #3d5c53; --soft: #617b71; --line: #dce7e1;
  --accent: #15745f; --tint: #e6f4ee; --cta: #176952; --cta-ink: #fff;
}
.er-header,.er-heading,.er-controls,.er-segment,.er-graph-footer,.er-tools,.er-legend,.er-legend-item,.er-scope,
.er-panel-heading,.er-pk,.er-actions,.er-list-heading,.er-row-title { display: flex; align-items: center; }
.er-header { justify-content: space-between; padding: 8px 16px; gap: 12px; flex-wrap: wrap; }
.er-heading { gap: 9px; }
.er-brand { position: relative; width: 28px; height: 28px; border-radius: 8px; background: var(--tint); color: var(--accent); }
.er-brand-hub,.er-branch::after { position: absolute; border-radius: 50%; background: currentColor; }
.er-brand-hub { left: 6px; top: 11px; width: 6px; height: 6px; }
.er-branch { position: absolute; left: 10px; top: 14px; width: 11px; height: 1.5px; background: currentColor; transform-origin: left center; transform: rotate(-36deg); }
.er-branch.second { transform: rotate(34deg); width: 9px; }
.er-branch::after { content: ''; right: -1px; top: -1.5px; width: 5px; height: 5px; }
.er-title,.er-subtitle,.er-table-title,.er-sql-name,.er-field,.er-empty { display: block; }
.er-title { color: var(--ink); font-size: 15px; font-weight: 700; letter-spacing: .4px; line-height: 1.3; }
.er-subtitle { margin-top: 1px; color: var(--soft); font-size: 11px; line-height: 1.3; font-variant-numeric: tabular-nums; }
.er-separator { margin: 0 8px; opacity: .5; }
.er-controls { flex-wrap: wrap; gap: 7px; }
.er-segment { padding: 3px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; }
.er-mode,.er-button,.er-tool,.er-fit,.er-primary {
  display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; min-height: 28px;
  margin: 0; padding: 0 10px; color: var(--text); background: transparent; border: 0;
  border-radius: 5px; font: inherit; font-size: 12px; line-height: 1.4; cursor: pointer; white-space: nowrap;
}
.er-mode::after,.er-button::after,.er-tool::after,.er-fit::after,.er-primary::after { border: 0; }
.er-mode.active { background: var(--panel); color: var(--accent); box-shadow: 0 1px 4px #102c3820; font-weight: 700; }
.er-button { border: 1px solid var(--line); min-height: 34px; border-radius: 7px; }
.er-layout { gap: 12px; }.er-layout text { color: var(--soft); }
.er-button:hover,.er-fit:hover,.er-tool:hover { color: var(--accent); background: var(--tint); }
.er-body { display: flex; align-items: stretch; height: clamp(480px, 72vh, 840px); border-top: 1px solid var(--line); overflow: hidden; }
.er-graph {
  flex: 1; min-width: 0; min-height: 0; position: relative; display: flex; flex-direction: column;
  background-color: var(--canvas); background-image: radial-gradient(var(--grid) .8px, transparent .9px); background-size: 19px 19px;
}
.er-scope { position: absolute; z-index: 4; top: 14px; left: 16px; max-width: calc(100% - 32px); box-sizing: border-box; gap: 7px; background: var(--panel); padding: 5px 9px; border: 1px solid var(--line); border-radius: 20px; font-weight: 600; font-size: 11px; pointer-events: none; }
.er-scope text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.er-scope-dot,.er-color-dot { width: 7px; height: 7px; flex: 0 0 7px; border-radius: 50%; }
.er-scope-dot { background: var(--accent); }
.er-layout-wait { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--soft); pointer-events: none; }
.er-stage { width: 100%; flex: 1; min-height: 0; position: relative; overflow: hidden; touch-action: none; user-select: none; cursor: grab; }
.er-stage.dragging,.er-stage.dragging .er-node { cursor: grabbing; }
.er-node { position: absolute; width: 0; height: 0; z-index: 2; cursor: pointer; outline: 0; }
.er-node.selected,.er-node:hover,.er-node:focus-visible { z-index: 3; }
.er-dot {
  position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); border-radius: 50%;
  box-sizing: border-box; background: var(--node-color); border: 2px solid var(--panel);
  display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 1px var(--node-color);
}
.er-dot::after { content: ''; position: absolute; inset: -4px; border-radius: 50%; }
.er-node-icon { pointer-events: none; }
.er-node.empty-records { opacity: .28; filter: grayscale(.85); }
.er-node.empty-records.selected,.er-node.empty-records:hover,.er-node.empty-records:focus-visible { opacity: .85; }
.er-node-badge { position: absolute; z-index: 1; right: -7px; top: -7px; min-width: 15px; height: 15px; padding: 0 3px; box-sizing: border-box; border-radius: 8px; border: 1px solid var(--panel); background: var(--node-color); color: #fff; text-align: center; font-size: 9px; line-height: 13px; }
.er-node.selected .er-dot,.er-node:hover .er-dot,.er-node:focus-visible .er-dot { outline: 1px solid var(--node-color); outline-offset: 4px; }
.er-table-mark { width: 14px; height: 12px; border: 1.5px solid var(--panel); box-sizing: border-box; border-radius: 2px; position: relative; }
.er-table-mark::before,.er-table-mark::after { content: ''; position: absolute; background: var(--panel); }
.er-table-mark::before { left: 0; right: 0; height: 1px; top: 3px; }.er-table-mark::after { left: 4px; bottom: 0; top: 3px; width: 1px; }
.er-label { position: absolute; box-sizing: border-box; height: 21px; line-height: 21px; text-align: center; background: var(--canvas); border-radius: 4px; color: var(--ink); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.er-label-name,.er-label-sql { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.er-hover-label { position: absolute; left: 0; transform: translateX(-50%); z-index: 5; padding: 3px 7px; border: 1px solid var(--line); border-radius: 5px; background: var(--panel); color: var(--ink); font-size: 12px; white-space: nowrap; pointer-events: none; box-shadow: 0 2px 8px #102c3820; }
.er-label.expanded { height: 35px; border: 1px solid var(--line); border-radius: 5px; background: var(--panel); }
.er-label.expanded .er-label-name { line-height: 19px; }.er-label-sql { padding: 0 3px; font: 9px/12px ui-monospace,Consolas,monospace; color: var(--soft); }
.er-node.selected .er-label { font-weight: 700; color: var(--node-color); }
.er-node.muted .er-dot { opacity: .53; }.er-node.muted .er-label { color: var(--soft); }
.er-scene { position: absolute; top: 0; left: 0; width: 0; height: 0; transform-origin: 0 0; }
.er-links-svg { position: absolute; top: 0; left: 0; overflow: visible; pointer-events: none; }
.er-hit-path { pointer-events: stroke; cursor: pointer; }.er-flow { animation: er-direction 1.3s linear infinite; pointer-events: none; }
@keyframes er-direction { to { stroke-dashoffset: -32; } }
@media (prefers-reduced-motion: reduce) { .er-flow { animation: none; } }
.er-line { position: absolute; height: 14px; margin-top: -7px; transform-origin: left center; cursor: pointer; }
.er-line::before { content: ''; position: absolute; left: 0; right: 0; top: 6px; height: 1.5px; background: currentColor; }
.er-line.lit::before { height: 3px; top: 5.5px; }
.er-line.loop { box-sizing: border-box; margin-top: 0; border: 1.5px solid currentColor; border-radius: 50%; }
.er-line.loop::before { display: none; }.er-line.loop.lit { border-width: 3px; }
.er-arrow { position: absolute; z-index: 1; width: 0; height: 0; border-top: 4px solid transparent; border-bottom: 4px solid transparent; border-left: 9px solid currentColor; pointer-events: none; }
.er-edge-label { position: absolute; box-sizing: border-box; height: 19px; padding: 0 4px; text-align: center; border: 1px solid var(--line); border-radius: 5px; background: var(--panel); color: var(--text); font: 10px/17px ui-monospace,Consolas,monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
.er-edge-label.lit { color: var(--accent); border-color: var(--accent); }.er-edge-label.dim { opacity: .5; }.er-edge-label.empty-records { opacity: .22; }.er-edge-label.empty-records.lit,.er-edge-label.empty-records:hover { opacity: 1; }
.er-edge-card { position: absolute; z-index: 5; left: 12px; bottom: 92px; max-width: calc(100% - 48px); padding: 8px 12px; border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: 7px; background: var(--panel); box-shadow: 0 3px 14px #102c3814; }
.er-edge-title { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-weight: 650; color: var(--ink); }
.er-dismiss { margin: 0; padding: 0 4px; line-height: 18px; color: var(--soft); background: transparent; font-size: 15px; }
.er-dismiss::after { border: none; }.er-edge-fields { margin-top: 2px; }.er-edge-fields text { display: block; font: 11px/20px ui-monospace,Consolas,monospace; color: var(--accent); }

.er-graph-footer { position: absolute; z-index: 4; left: 14px; right: 14px; bottom: 12px; justify-content: space-between; gap: 8px; flex-wrap: wrap; pointer-events: none; }
.er-legend-toggle { margin: 0; padding: 0 9px; min-height: 28px; border: 1px solid var(--line); border-radius: 7px; background: var(--panel); color: var(--soft); font: inherit; font-size: 11px; line-height: 26px; pointer-events: auto; }
.er-legend-toggle::after { border: 0; }
.er-hint { color: var(--soft); font-size: 11px; padding: 4px 7px; border-radius: 6px; background: var(--panel); }
.er-tools { gap: 1px; margin-left: auto; padding: 3px; border-radius: 8px; border: 1px solid var(--line); background: var(--panel); box-shadow: 0 2px 6px #102c380a; }
.er-tools { pointer-events: auto; }
.er-tool { width: 27px; padding: 0; font-size: 17px; }.er-tool[disabled] { color: var(--soft); opacity: .4; }
.er-percent { width: 36px; text-align: center; color: var(--text); font-size: 11px; font-variant-numeric: tabular-nums; }
.er-actual { margin: 0; padding: 0; line-height: 28px; border: 0; background: transparent; cursor: pointer; }.er-actual::after { border: 0; }
.er-fit { padding: 0 8px; border-left: 1px solid var(--line); border-radius: 0; font-size: 11px; }
.er-inspector { width: 235px; height: 100%; min-height: 0; overflow: hidden; flex-shrink: 0; box-sizing: border-box; display: flex; flex-direction: column; border-left: 1px solid var(--line); background: var(--panel); }
.er-panel-heading { padding: 15px 15px 8px; justify-content: space-between; color: var(--soft); font-size: 11px; }
.er-domain { color: var(--text); font-size: 10px; }.er-domain text { margin-right: 2px; }
.er-identity { padding: 3px 15px 14px; border-bottom: 1px solid var(--line); }
.er-table-title { color: var(--ink); font-weight: 700; font-size: 17px; }
.er-sql-name,.er-field,.er-pk { font-family: ui-monospace, Consolas, monospace; overflow-wrap: anywhere; }
.er-sql-name { color: var(--soft); font-size: 12px; margin-top: 3px; }
.er-pk { gap: 7px; margin-top: 11px; font-size: 11px; flex-wrap: wrap; }
.er-key-tag { border-radius: 3px; background: var(--tint); color: var(--accent); font-weight: 700; padding: 2px 4px; font-size: 9px; }
.er-actions { gap: 6px; margin-top: 12px; }.er-actions .er-button,.er-primary { min-height: 28px; font-size: 11px; }
.er-primary { color: var(--cta-ink); background: var(--cta); gap: 10px; }
.er-list-heading { gap: 7px; padding: 12px 15px 6px; color: var(--ink); font-weight: 700; }
.er-list-heading text { color: var(--soft); font-size: 10px; font-weight: 500; }
.er-details-clip { flex: 1; min-height: 0; overflow: hidden; }
.er-details { height: 100%; width: 100%; }
.er-row { margin: 0 10px; padding: 9px 5px; border-bottom: 1px solid var(--line); cursor: pointer; }
.er-row:hover { background: var(--surface); }
.er-row-title { gap: 6px; color: var(--text); font-size: 12px; font-weight: 600; }
.er-direction { margin-left: auto; color: var(--soft); font-size: 10px; font-weight: 400; white-space: nowrap; }
.er-field { color: var(--soft); font-size: 10px; padding-left: 13px; margin-top: 4px; line-height: 1.4; }
.er-empty { padding: 10px 15px; color: var(--soft); font-size: 12px; }
.er-legend { position: absolute; z-index: 4; left: 14px; bottom: 52px; max-width: calc(100% - 28px); box-sizing: border-box; flex-wrap: wrap; gap: 5px 12px; padding: 5px 8px; border: 1px solid var(--line); border-radius: 7px; background: var(--panel); color: var(--soft); font-size: 11px; pointer-events: none; }
.er-legend-item { gap: 5px; }.er-convention { margin-left: auto; }
.er-scope,.er-legend,.er-legend-toggle,.er-tools,.er-edge-card { background: var(--floating-panel); }
.er-trace-toggle { gap: 8px; }.er-trace-toggle.active,.er-scope.tracing { background: var(--tint); color: var(--accent); }
.er-route-symbol { position: relative; width: 13px; height: 2px; background: currentColor; transform: rotate(-25deg); }
.er-route-symbol::before,.er-route-symbol::after { content: ''; position: absolute; top: -2px; width: 4px; height: 4px; border: 1px solid currentColor; border-radius: 50%; background: var(--panel); }
.er-route-symbol::before { left: -1px; }.er-route-symbol::after { right: -1px; }
.er-trace-title { color: var(--ink); font-size: 15px; font-weight: 700; }
.er-open-path { align-self: flex-start; margin: 0 12px 6px; }
.er-hop-count { background: var(--tint); color: var(--accent); border-radius: 12px; padding: 2px 7px; font-size: 10px; }
.er-stations { position: relative; margin: 4px 12px 8px; padding: 2px 8px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface); }
.er-stations::before { content: ''; position: absolute; left: 18px; top: 20px; bottom: 20px; border-left: 1px dashed var(--accent); }
.er-station { position: relative; min-height: 35px; display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 600; color: var(--ink); }
.er-station-pin { width: 20px; height: 20px; flex: 0 0 20px; border-radius: 50%; text-align: center; font-weight: 600; line-height: 20px; font-size: 11px; background: var(--cta); color: var(--cta-ink); }
.er-station-pin.end { background: var(--panel); color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }.er-station-caret { margin-left: auto; color: var(--soft); }
.er-trace-note,.er-route-label { display: block; color: var(--soft); margin: 9px 15px; font-size: 11px; line-height: 1.6; }
.er-hop { display: flex; align-items: flex-start; gap: 9px; padding: 9px; margin: 0 8px; border-radius: 7px; cursor: pointer; }
.er-hop:hover,.er-hop.current { background: var(--tint); }.er-hop-index { flex: 0 0 18px; height: 18px; line-height: 18px; text-align: center; font-weight: 700; border-radius: 50%; background: var(--tint); color: var(--accent); }
.er-hop-body { min-width: 0; }.er-hop-name { display: block; font-size: 12px; color: var(--ink); font-weight: 650; }.er-hop-field { display: block; margin-top: 4px; font: 10px/1.5 ui-monospace,Consolas,monospace; color: var(--soft); overflow-wrap: anywhere; }
.er-node.faded { opacity: .39; }.er-node.waypoint .er-dot { outline: 1px solid var(--node-color); outline-offset: 3px; }
.er-node.destination .er-dot { background: var(--panel); border: 2px solid var(--accent); }
.er-stop-mark { font-weight: 700; }
.scope-active,.er-row.pinned { color: var(--accent); background: var(--tint); }
.er-actions { flex-wrap: wrap; }.er-role { display: inline-block; padding: 2px 6px; margin: 4px 0 0 12px; border-radius: 4px; background: var(--tint); color: var(--accent); font-size: 11px; }
.er-edge-meta { display: flex; justify-content: space-between; gap: 14px; color: var(--soft); font-size: 11px; padding: 4px 0; }
.er-jump-table { margin: 0; padding: 0 4px; color: var(--accent); background: none; font-size: 12px; line-height: 20px; }
.er-jump-table::after { border: 0; }.er-line.business::before { background: repeating-linear-gradient(90deg,currentColor 0 5px,transparent 5px 10px); }
.er-edge-records { min-height: 23px; margin: 3px 0; font-size: 11px; }
.er-record-count { font-weight: 700; font-variant-numeric: tabular-nums; }
.er-record-role { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: calc(100% - 18px); margin: 2px 9px; padding: 8px; text-align: left; background: var(--surface); color: var(--ink); font: inherit; line-height: 1.5; border-radius: 6px; cursor: pointer; }
.er-record-role::after { border: 0; }.er-record-role .er-field { padding-left: 0; }.er-record-role[disabled] { opacity: .65; }
.er-message { min-height: 200px; display: flex; align-items: center; justify-content: center; gap: 10px; border-top: 1px solid var(--line); color: var(--soft); }
@media (max-width: 740px) {
  .er-header { padding: 7px 10px; }.er-body { height: auto; flex-direction: column; }
  .er-graph { flex: none; height: clamp(420px, 70vh, 580px); }
  .er-inspector { width: 100%; height: auto; border-left: none; border-top: 1px solid var(--line); }
  .er-panel-heading { padding: 10px 12px 5px; }.er-identity { padding: 0 12px 10px; }
  .er-table-title { font-size: 15px; }.er-identity .er-pk,.er-actions { margin-top: 7px; }
  .er-list-heading { padding: 8px 12px 2px; }.er-details-clip { height: 130px; flex: none; }
  .er-legend { gap: 4px 8px; padding: 5px 7px; }
}
@media (max-width: 480px) {
  .er-workspace { margin: 4px; }.er-heading { gap: 7px; }.er-title { font-size: 15px; }
  .er-header { align-items: flex-start; gap: 9px; }.er-controls { gap: 5px; }
  .er-hint { display: none; }.er-mode,.er-button { padding: 0 8px; }.er-scope { top: 10px; left: 10px; max-width: calc(100% - 20px); }
  .er-graph-footer { left: 8px; right: 8px; bottom: 8px; }.er-convention { margin-left: 0; }
}
</style>
