<template>
  <view class="ins-backdrop" :class="{ dark }" @click="$emit('close')">
    <view class="ins-panel" :class="{ wide: !booking && tab === 'peers' && peerView === 'graph' }" @click.stop>
      <view class="ins-head">
        <view><text class="kicker">{{ booking ? '预约关联记录' : '账号分析' }}</text>
          <text class="headline">{{ booking ? data?.order?.orderNo || '订单 #' + id : (userData?.user?.username || '用户') + ' #' + id }}</text></view>
        <button aria-label="关闭分析" @click="$emit('close')">关闭</button>
      </view>
      <view v-if="!booking" class="tabs"><button v-for="t in tabs" :key="t.key" :class="{ on: tab === t.key }" @click="switchTab(t.key)">{{ t.label }}</button></view>
      <view v-if="!booking && (tab === 'activity' || tab === 'peers' || tab === 'trend')" class="range-controls">
        <text>时间范围</text>
        <view class="range-options">
          <button v-for="option in visiblePeriods" :key="option.days" :class="{ on: !activityDrill && period === option.days }"
            :aria-pressed="!activityDrill && period === option.days" @click="setPeriod(option.days)">{{ option.label }}</button>
        </view>
      </view>
      <view v-if="activityDrill && tab === 'activity'" class="range-controls">
        <text>{{ activityDrill.day }} UTC · {{ activityDrill.name || ('账号 #' + activityDrill.id) }}</text>
        <button @click="returnToTrend">返回趋势</button>
      </view>
      <view v-if="!booking && (tab === 'activity' || tab === 'trend') && sources.length" class="source-picker">
        <!-- #ifdef H5 -->
        <label class="ins-filter">行为来源
          <select aria-label="行为来源" :value="source" @change="selectSource($event.target.value)">
            <option v-for="choice in sourceChoices" :key="choice.name" :value="choice.name">{{ choice.label }}</option>
          </select>
        </label>
        <!-- #endif -->
        <!-- #ifndef H5 -->
        <picker :range="sourceChoices" range-key="label" :value="sourceIndex" @change="selectSource(sourceChoices[$event.detail.value].name)">
          <text>行为来源 · {{ sourceChoices[sourceIndex].label }} ⌄</text>
        </picker>
        <!-- #endif -->
      </view>
      <view v-if="tab === 'peers'" class="peer-controls">
        <view class="peer-switch"><button v-for="mode in peerModes" :key="mode.key" :class="{ on: peerView === mode.key }" :aria-pressed="peerView === mode.key" @click="setPeerView(mode.key)">{{ mode.label }}</button></view>
        <!-- #ifdef H5 -->
        <label class="ins-filter">关系类型
          <select aria-label="关系类型" :value="relationType" @change="selectType($event.target.value)">
            <option v-for="choice in typeChoices" :key="choice.name" :value="choice.name">{{ choice.label }}</option>
          </select>
        </label>
        <!-- #endif -->
        <!-- #ifndef H5 -->
        <picker :range="typeChoices" range-key="label" :value="typeIndex" @change="selectType(typeChoices[$event.detail.value].name)"><view class="type-picker">关系类型 · {{ typeChoices[typeIndex].label }} ⌄</view></picker>
        <!-- #endif -->
      </view>
      <view v-if="!booking && (tab === 'peers' || tab === 'shared' || tab === 'trend')" class="search">
        <input v-model="input" type="number" placeholder="输入对方账号 ID" @confirm="searchPeer" />
        <button @click="searchPeer">{{ tab === 'trend' ? '对比趋势' : '查两人关系' }}</button>
        <button v-if="peer" @click="clearPeer">{{ tab === 'peers' ? '显示全部' : '清除账号' }}</button>
      </view>
      <view v-if="tab === 'peers' && expanded != null" class="range-controls">
        <button @click="openShared(expanded)">查看与 #{{ expanded }} 的共同关系 ›</button>
      </view>
      <scroll-view class="ins-body" scroll-y :scroll-into-view="scrollTarget" :key="tab + ':' + page + ':' + peer">
        <template v-if="tab === 'inventory' && !booking">
          <text class="note">全部时间 · {{ inventory.length }} 张直接关联表 · 点击业务条形查看来源表和角色</text>
          <view v-for="group in groups" :key="group.label" class="section">
            <button class="domain-bar" :aria-expanded="openGroup === group.label" @click="openGroup = openGroup === group.label ? '' : group.label">
              <view class="bar-title"><text>{{ group.label }}</text><text>{{ group.known ? group.rows + ' 条' : '未统计' }}{{ group.partial ? ' · 部分未统计' : '' }} {{ openGroup === group.label ? '⌃' : '⌄' }}</text></view>
              <view class="volume"><view :style="{ width: group.share + '%' }" /></view>
            </button>
            <view v-if="openGroup === group.label"><view v-for="table in group.items" :key="table.name" class="item">
              <text class="strong">{{ table.label }} · {{ amount(table.total) }}</text>
              <view class="chips"><button v-for="r in table.roles" :key="r.field" :disabled="r.count == null"
                @click="$emit('user-records', { name: table.name, userId: id, fields: [r.field] })">{{ r.label }} · {{ amount(r.count) }} ›</button></view>
            </view></view>
          </view>
          <text v-if="!groups.length" class="note">没有直接关联表。</text>
        </template>
        <text v-else-if="pending" class="note">正在读取记录…</text>
        <view v-else-if="error" class="note">{{ error }} <button @click="retry++">重试</button></view>
        <BookingRecordTrace v-else-if="booking && data" :data="data" @evidence="$emit('evidence', $event)" />
        <AccountActivityTrend v-else-if="tab === 'trend' && data" :data="data" :selected="trendDay" @day="trendDay = $event" @inspect="inspectTrendDay" />
        <template v-else-if="tab === 'shared'">
          <text v-if="!data" class="note">输入对方账号 ID 查看共同群聊、社区和私聊对象。</text>
          <template v-else>
            <text class="note">与 {{ data.user.username || '账号' }} #{{ data.user.id }} · 当前成员关系和全部时间的私聊记录</text>
            <view v-for="section in membershipSections" :key="section.name" class="section">
              <text class="strong">{{ section.label }}</text>
              <text v-if="!section.items.length" class="note">此页无记录</text>
              <view v-for="item in section.items" :key="item.id" class="item">
                <button @click="show(section.entity, { id: item.id })">{{ item.name || ('#' + item.id) }} ›</button>
                <view class="chips"><button v-for="member in [id, data.user.id]" :key="member"
                  @click="show(section.name, { [section.key]: item.id, userId: member })">#{{ member }} 的成员记录 ›</button></view>
              </view>
            </view>
            <view class="section">
              <text class="strong">共同私聊对象</text>
              <text class="note">每个对象分别与这两个账号有私聊记录。点击方向查看该段消息。</text>
              <text v-if="!data.contacts.length" class="note">此页无记录</text>
              <view v-for="contact in data.contacts" :key="contact.id" class="item">
                <text class="strong">{{ contact.name || '账号' }} #{{ contact.id }}</text>
                <view class="chips"><button v-for="link in contact.links" :key="link.from + ':' + link.to"
                  @click="show('Message', { senderId: link.from, receiverId: link.to })">#{{ link.from }} → #{{ link.to }} · {{ link.count }} 条 ›</button></view>
              </view>
            </view>
          </template>
        </template>
        <template v-else-if="data">
          <text v-if="tab === 'activity'" class="note">按已接入的事件来源统计。登录来源最多保留最近两次成功登录。</text>
          <text v-if="range && tab === 'peers'" class="note">当前时段统计带有时间的往来记录。会话设置可在「全部时间」查看。</text>
          <text v-if="data.items.length" class="note">{{ tab === 'peers' ? peer ? '查看与账号 #' + peer + ' 的往来' : peerView === 'graph' ? graphCaption : '按来源记录数排序，展开账号查看方向和明细。' : '按发生时间从近到远排列，点击事件查看原始记录。' }}</text>
          <text v-if="!data.items.length" class="note">{{ tab === 'peers' ? '在已接入的双账号来源中未发现往来记录。' : '该账号暂无已收录的行为记录。' }}</text>
          <view v-if="tab === 'peers' && peerView === 'graph' && graphPeers.length" id="peer-map-start">
            <AccountPeerGraph :peers="graphPeers" :user="userData?.user" :id="id" :selected="expanded"
              @select="selectGraphPeer" @evidence="showRangedEvidence" />
            <view id="peer-map-end" />
          </view>
          <template v-else-if="tab === 'peers' && peerView === 'list'"><view v-for="row in data.items" :key="row.id" class="item">
              <button class="row-button" @click="expanded = expanded === row.id ? null : row.id"><text>{{ row.username || '账号' }} #{{ row.id }}</text><text>{{ row.records }} 条来源记录 {{ expanded === row.id ? '⌃' : '⌄' }}</text></button>
              <view v-if="expanded === row.id" class="chips"><button v-for="e in row.evidence" :key="e.label" @click="showRangedEvidence(e)">{{ e.label }} · {{ e.count }} ›</button></view>
          </view></template>
          <view v-else-if="tab === 'activity'" v-for="day in days" :key="day.label" class="day">
            <text class="strong">{{ day.label }}</text>
            <button v-for="(event,i) in day.events" :key="i" class="time-event" @click="showRangedEvidence(event)">
              <text class="event-time">{{ event.time }}</text><text>{{ event.label }}</text><text class="event-link">›</text></button>
          </view>
        </template>
      </scroll-view>
      <view v-if="!booking && (tab === 'activity' || tab === 'shared' || (tab === 'peers' && peerView === 'list')) && !pending && !error && (page > 1 || data?.hasMore)" class="pager">
        <button :disabled="page === 1" @click="page--">上一页</button><text>第 {{ page }} 页</text><button :disabled="!data?.hasMore" @click="page++">下一页</button></view>
    </view>
  </view>
</template>
<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { getRecordInsights } from '@/api/database'
import { domains, domainIndex } from './database-relation-layout'
import AccountActivityTrend from './AccountActivityTrend.vue'
import AccountPeerGraph from './AccountPeerGraph.vue'
import BookingRecordTrace from './BookingRecordTrace.vue'
import { peerTypes } from './account-peer-types'
const props = defineProps({ kind: String, id: [Number, String], userData: Object, tables: Array, dark: Boolean })
const emit = defineEmits(['close', 'evidence', 'user-records'])
const booking = computed(() => props.kind === 'booking')
const tabs = [{ key: 'activity', label: '行为时间线' }, { key: 'trend', label: '行为趋势' }, { key: 'inventory', label: '业务分布' },
  { key: 'peers', label: '往来账号' }, { key: 'shared', label: '共同关系' }]
const tab = ref('activity'), page = ref(1), peer = ref(''), input = ref(''), expanded = ref(null), retry = ref(0)
const periods = [{ days:0, label:'全部时间' }, { days:7, label:'最近 7 天' }, { days:30, label:'最近 30 天' }, { days:90, label:'最近 90 天' }]
const period = ref(0), range = ref(null)
const trendDay = ref(''), activityDrill = ref(null)
const visiblePeriods = computed(() => tab.value === 'trend' ? periods.slice(1) : periods)
function setPeriod(days) {
  if (days === period.value && !activityDrill.value) return
  activityDrill.value = null
  trendDay.value = ''
  period.value = days
  const now = Date.now()
  range.value = days ? { from:new Date(now - days * 86_400_000).toISOString(), to:new Date(now).toISOString() } : null
  if (range.value && relationType.value === 'Chat') relationType.value = ''
  page.value = 1
}
const peerView = ref('graph'), relationType = ref(''), openGroup = ref('')
const peerModes = [{ key:'graph', label:'关系图' }, { key:'list', label:'列表' }]
const typeChoices = computed(() => [{ name:'', label:'全部' }, ...Object.entries(peerTypes)
  .filter(([name]) => !range.value || name !== 'Chat').map(([name,t]) => ({ name, label:t.label }))])
const typeIndex = computed(() => Math.max(0, typeChoices.value.findIndex(t => t.name === relationType.value)))
function selectType(name) { relationType.value = name; page.value = 1 }
function setPeerView(mode) {
  if (peerView.value === mode) return
  peerView.value = mode
  if (mode === 'graph') {
    page.value = 1
    if (!graphPeers.value.some(p => p.id === expanded.value)) expanded.value = null
  }
}
const sources = ref([]), source = ref('')
const sourceChoices = computed(() => [{ name:'', label:'全部来源' }, ...sources.value.map(name => ({ name, label:props.tables?.find(t => t.name === name)?.label || name }))])
const sourceIndex = computed(() => Math.max(0, sourceChoices.value.findIndex(s => s.name === source.value)))
function selectSource(name) { source.value = name; page.value = 1; trendDay.value = '' }
const data = ref(null), pending = ref(true), error = ref('')
const membershipSections = computed(() => [
  { name: 'ChatGroupMember', entity: 'ChatGroup', key: 'groupId', label: '共同群聊', items: data.value?.groups || [] },
  { name: 'UserCommunity', entity: 'Community', key: 'communityId', label: '共同社区', items: data.value?.communities || [] }
])
const graphPeers = computed(() => data.value?.items?.slice(0, 10) || [])
const graphCaption = computed(() => data.value?.items.length > 10 || data.value?.hasMore
  ? '按来源记录数排序 · 展示前 10 个往来账号' : '按来源记录数排序 · 共 ' + graphPeers.value.length + ' 个往来账号')
const scrollTarget = ref('')
async function selectGraphPeer(id) {
  expanded.value = id
  // #ifndef H5
  if ((uni.getWindowInfo?.().windowWidth || uni.getSystemInfoSync().windowWidth) <= 760) {
    scrollTarget.value = ''
    await nextTick()
    scrollTarget.value = id == null ? 'peer-map-start' : 'peer-map-end'
  }
  // #endif
}
const days = computed(() => {
  const grouped = new Map()
  for (const event of tab.value === 'activity' ? data.value?.items || [] : []) {
    const date = new Date(event.at), valid = !Number.isNaN(date.getTime())
    const label = valid ? date.toLocaleDateString() : String(event.at).slice(0, 10)
    if (!grouped.has(label)) grouped.set(label, [])
    grouped.get(label).push({ ...event, time:valid ? date.toLocaleTimeString() : String(event.at).slice(11, 19) })
  }
  return Array.from(grouped, ([label, events]) => ({ label, events }))
})
const inventory = computed(() => (props.userData?.tables || []).map(t => {
  const meta = props.tables?.find(m => m.name === t.name)
  const domain = /^(Booking|Recycling|Collector)/.test(t.name) ? '预约回收' :
    /^(Shop|Purchase|Prize|Lottery|Achievement|Challenge)/.test(t.name) ? '积分与活动' : domains[domainIndex(t.name)].label
  return { ...t, domain, label: meta?.label || t.name, roles: t.roles.map(r => ({ ...r, label: meta?.schema?.find(f => f.key === r.field)?.label || r.field })) }
}))
const groups = computed(() => {
  const total = inventory.value.reduce((sum, t) => sum + (t.total || 0), 0)
  return [...new Set(inventory.value.map(t => t.domain))].map(label => {
    const items = inventory.value.filter(t => t.domain === label).sort((a,b) => (b.total ?? -1) - (a.total ?? -1))
    const rows = items.reduce((sum, t) => sum + (t.total || 0), 0)
    const known = items.filter(t => t.total != null).length
    return { label, items, rows, known, partial:known > 0 && known < items.length, share:total ? rows * 100 / total : 0 }
  }).sort((a,b) => b.rows - a.rows)
})
function amount(n) { return n == null ? '未统计' : n + ' 条' }
function show(name, values) { emit('evidence', { name, values }) }
function showRangedEvidence(e) {
  const { name, values, timeField } = e
  emit('evidence', { name, values, ...(data.value.range && timeField ? { range: data.value.range, timeField } : {}) })
}
function switchTab(key) {
  activityDrill.value = null
  if (key === 'trend' && !period.value) setPeriod(30)
  tab.value = key; page.value = 1; expanded.value = null
}
function inspectTrendDay(selection) {
  if (!data.value?.range) return
  const start = Date.parse(selection.day + 'T00:00:00.000Z')
  activityDrill.value = { ...selection, range: {
    from: new Date(Math.max(start, Date.parse(data.value.range.from))).toISOString(),
    to: new Date(Math.min(start + 86400000, Date.parse(data.value.range.to))).toISOString()
  } }
  tab.value = 'activity'; page.value = 1
}
function returnToTrend() { switchTab('trend') }
function openShared(accountId) {
  input.value = peer.value = String(accountId)
  switchTab('shared')
}
function clearPeer() { input.value = ''; peer.value = ''; page.value = 1; expanded.value = null; trendDay.value = '' }
function searchPeer() {
  const id = String(input.value).trim()
  if (id && (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) === Number(props.id))) {
    uni.showToast({ title:'请输入另一个有效的账号 ID', icon:'none' }); return
  }
  peer.value = id; page.value = 1; expanded.value = null; trendDay.value = ''
}
watch([() => props.kind, () => props.id, tab, page, peer, source, relationType, range, activityDrill, retry], async (_, __, cleanup) => {
  let current = true
  cleanup(() => { current = false })
  data.value = null; error.value = ''; expanded.value = null
  if (!booking.value && (tab.value === 'inventory' || (tab.value === 'shared' && !peer.value))) { pending.value = false; return }
  pending.value = true
  try {
    const kind = booking.value ? 'booking' : tab.value
    const drill = kind === 'activity' ? activityDrill.value : null
    const requestRange = kind === 'booking' || kind === 'shared' ? null : drill?.range || range.value
    const usesPeer = ['peers', 'trend', 'shared'].includes(kind)
    const selectedSource = kind === 'peers' ? relationType.value : ['activity', 'trend'].includes(kind) ? source.value : ''
    const res = await getRecordInsights(kind, drill?.id || props.id, { page: page.value, ...requestRange,
      ...(usesPeer && peer.value ? { peerId:peer.value } : {}), ...(selectedSource ? { source:selectedSource } : {}) })
    if (res?.code !== 0 || !res.data) throw new Error(res?.msg || '读取失败')
    if (!current) return
    if (requestRange && (res.data.range?.from !== requestRange.from || res.data.range?.to !== requestRange.to)) {
      throw new Error('时间范围筛选尚未生效，请重启后端后重试。')
    }
    if (tab.value === 'peers' && relationType.value && res.data.source !== relationType.value) throw new Error('当前接口尚未应用关系类型筛选，请重启后端后重试。')
    data.value = res.data
    if (res.data.sources) sources.value = res.data.sources
    if (tab.value === 'peers' && peer.value) expanded.value = res.data.items[0]?.id ?? null
    if (kind === 'trend' && !res.data.days.some(day => day.day === trendDay.value)) trendDay.value = res.data.days[res.data.days.length - 1]?.day || ''
  } catch (e) { if (current) error.value = e.message || '读取失败' }
  finally { if (current) pending.value = false }
}, { immediate:true })
</script>
<style scoped>
.ins-backdrop { position:fixed; inset:0; z-index:1100; display:flex; justify-content:center; align-items:center; padding:14px; background:#10272577; }
.ins-panel { width:min(560px,100%); max-height:86vh; display:flex; flex-direction:column; overflow:hidden; border-radius:16px; background:var(--card-bg,#fff); color:var(--text-primary,#21453f); box-shadow:0 16px 64px #001f2430; }
.ins-panel.wide { width:min(980px,100%); }.ins-panel { --ins-surface:#fff; }.dark .ins-panel { --ins-surface:#0d2a39; }
.dark .ins-panel { background:#0d2a39; color:#e2f3ec; }
.ins-head,.tabs,.search,.pager,.row-button,.chips { display:flex; align-items:center; gap:8px; }.ins-head,.pager,.row-button { justify-content:space-between; }
.ins-head,.tabs,.search,.pager { padding:12px 18px; }.ins-head { border-bottom:1px solid #829d9436; }.ins-body { height:54vh; box-sizing:border-box; padding:12px 18px; }
.ins-body { min-height:0; }
.kicker,.headline,.note,.strong { display:block; }.kicker,.note { font-size:12px; opacity:.77; }.headline { font-size:20px; font-weight:700; }.strong { font-size:14px; font-weight:650; }
.note { padding:7px 0; line-height:1.6; }.item,.section { padding:9px 0; border-bottom:1px solid #829d9429; }.section { margin-bottom:10px; }
.volume { height:4px; margin-top:5px; border-radius:4px; background:#829d9429; }.volume>view { height:100%; border-radius:4px; background:#319a82; }.source-picker { padding:8px 18px 0; font-size:12px; }
.chips { flex-wrap:wrap; padding-top:5px; }
.ins-panel button { margin:0; padding:3px 8px; border:0; border-radius:5px; color:inherit; background:#829d9414; font:inherit; font-size:12px; line-height:1.7; cursor:pointer; }.ins-panel button::after { border:0; }.ins-panel button.on { background:#167660; color:white; }.ins-panel button[disabled] { opacity:.46; }
.ins-panel .row-button { width:100%; text-align:left; background:transparent; font-size:14px; }.row-button text:last-child { opacity:.72; font-size:12px; }.search input { min-width:0; flex:1; font-size:13px; border-bottom:1px solid #829d9480; }.tabs,.search { flex-wrap:wrap; padding-bottom:0; }
.peer-controls,.peer-switch,.bar-title { display:flex; align-items:center; gap:5px; }.peer-controls { padding:10px 18px 0; justify-content:space-between; flex-wrap:wrap; }.type-picker { font-size:12px; cursor:pointer; }
.ins-filter { display:inline-flex; align-items:center; gap:6px; max-width:100%; font-size:12px; }
.ins-filter select { min-width:0; max-width:100%; padding:3px 6px; border:1px solid #829d946b; border-radius:5px; background:var(--ins-surface); color:inherit; font:inherit; }
.dark .ins-filter select { color-scheme:dark; }
.range-controls,.range-options { display:flex; align-items:center; flex-wrap:wrap; gap:5px; }.range-controls { padding:9px 18px 0; gap:8px; font-size:12px; }.range-controls>text { opacity:.77; }
.ins-panel .domain-bar { display:block; width:100%; padding:5px 0; text-align:left; background:transparent; }.bar-title { justify-content:space-between; font-size:14px; }.bar-title text:last-child { font-size:12px; }.volume { height:7px; overflow:hidden; }
.day { margin:12px 0; }.day .strong { margin:0 0 8px; }.ins-panel .time-event { display:flex; align-items:center; gap:10px; width:100%; text-align:left; border-radius:0; border-left:2px solid #369d8a70; background:transparent; padding:8px; }.event-time { min-width:66px; font-variant-numeric:tabular-nums; font-size:11px; opacity:.78; }.event-link { margin-left:auto; }
</style>
