<template>
  <view class="ed">
    <view class="ed-canvas">
    <view class="ed-bar">
      <view v-if="pathMode" class="ed-context"><text class="ed-context-dot" />外键路径 <text class="ed-sep">/</text> {{ traceSteps.length }} 段关联</view>
      <view v-else class="ed-context"><text class="ed-context-dot" />{{ booking ? '预约回收' : focusTable?.label || root }} <text class="ed-sep">/</text> {{ userData ? (userData.user.username || '用户') + ' #' + userData.user.id : booking ? '业务视图' : '直接关联' }}</view>
    </view>
      <view class="ed-tools">
        <button aria-label="缩小实体图" @click="scaleAt(zoom / 1.25)">−</button>
        <text>{{ Math.round(zoom * 100) }}%</text>
        <button aria-label="放大实体图" @click="scaleAt(zoom * 1.25)">＋</button>
        <button @click="fit">适配</button><button @click="reset">重排</button>
      </view>
    <view v-if="pathMode" class="ed-steps">
      <button v-for="(step, i) in traceSteps" :key="step.edge.key" :class="{ on: step.edge.key === active }"
        :aria-pressed="step.edge.key === active" @click="locateStep(step)">
        <text class="ed-step-number">{{ i + 1 }}</text>{{ tableLabel(step.from) }} {{ step.from === step.edge.source ? '→' : '←' }} {{ tableLabel(step.to) }}
      </button>
    </view>
    <view ref="surface" class="ed-surface" @touchstart="startTouch" @touchmove.stop.prevent="moveTouch" @touchend="finishTouch" @touchcancel="endDrag">
      <view class="ed-world" :style="worldStyle">
        <view v-for="wire in wires" :key="wire.id" class="ed-wire" :class="{ traced: pathMode, dim: active && active !== wire.key, active: active === wire.key, logical: wire.business }" :style="{ color: wire.color }">
          <view v-for="(segment, i) in wire.segments" :key="i" class="ed-segment" :class="{ vertical: segment.vertical }" :style="segment.style" @click.stop="pick(wire.key)" />
          <view class="ed-tip" :style="wire.tip" />
        </view>
        <view v-for="card in cards" :key="card.name" class="ed-card" :class="{ focus: !booking && !pathMode && card.name === root }" :data-entity="card.name" :style="card.style">
          <view class="ed-card-head" :data-drag="card.name" @touchstart.stop="startTouch($event, card.name)">
            <view v-if="pathMode" class="ed-card-mark ed-waypoint">{{ waypoint(card.name) }}</view>
            <view v-else class="ed-card-mark"><view /><view /><view /></view>
            <view class="ed-title-block"><text class="ed-name">{{ card.label }}</text><text class="ed-sql">{{ card.sqlTableName || card.name }}</text></view>
            <button v-if="card.count !== undefined" class="ed-count" :disabled="card.count == null" @mousedown.stop @touchstart.stop @click.stop="records(card)">{{ countText(card.count) }}</button>
          </view>
          <view v-for="row in card.rows" :key="row.column" class="ed-row" :class="{ traced: pathMode && row.keys.length, marked: row.keys.includes(active), composite: row.composite }" :data-column="row.column"
            @click.stop="selectRow(row)">
            <text class="ed-key" :class="{ pk: row.pk, fk: row.fk }">{{ row.badge }}</text>
            <text class="ed-column">{{ row.column }}</text>
            <text v-if="row.role" class="ed-role">{{ row.role }}</text>
            <button v-if="row.stat" class="ed-row-count" :disabled="row.stat.count == null" @click.stop="records(card, row.stat)">{{ countText(row.stat.count) }}</button>
          </view>
          <button v-if="card.extra" class="ed-more" @click.stop="toggleFields(card.name)">{{ expanded[card.name] ? '收起普通字段' : '展开其余 ' + card.extra + ' 个字段' }}</button>
        </view>
      </view>
    </view>
    <view class="ed-footer"><view class="ed-keys"><text>PK 主键</text><text>FK 外键</text><view><view class="ed-sample" />数据库外键</view><view><view class="ed-sample logical" />业务关联</view></view>
      <text v-if="chosen" class="ed-mapping">{{ chosen.role }} · {{ chosen.fields.map(f => f.source + '.' + f.sourceColumn + ' → ' + f.target + '.' + f.targetColumn).join(' / ') }}</text>
      <text v-else-if="!links.length" class="ed-empty">当前范围内没有关联，仍可查看表字段。</text>
      <text v-else class="ed-hint">拖动表头调整位置，点字段查看映射</text>
    </view>
    </view>
  </view>
</template>

<script setup>
import { computed, getCurrentInstance, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { groupRelations } from './database-relation-layout'

const props = defineProps({ tables: Array, current: String, relations: Array, business: Array, userData: Object, booking: Boolean,
  traceSteps: { type: Array, default: () => [] }, selectedStep: { type: String, default: '' } })
const emit = defineEmits(['user-records', 'select-step', 'return-to-trace', 'update:booking'])
const instance = getCurrentInstance(), surface = ref(null)
const width = ref(900), height = ref(470), zoom = ref(1), pan = ref({ x: 0, y: 0 })
const offsets = ref({}), expanded = ref({}), localActive = ref('')
const pathMode = computed(() => props.traceSteps.length > 0)
const pathNames = computed(() => pathMode.value ? [props.traceSteps[0].from, ...props.traceSteps.map(step => step.to)] : [])
const active = computed({
  get: () => pathMode.value ? props.selectedStep : localActive.value,
  set: key => { if (pathMode.value) emit('select-step', key); else localActive.value = key }
})
function tableLabel(name) { return props.tables.find(t => t.name === name)?.label || name }
function waypoint(name) {
  const index = pathNames.value.indexOf(name)
  return index === 0 ? '起' : index === pathNames.value.length - 1 ? '终' : index
}
const booking = computed({ get: () => props.booking, set: value => emit('update:booking', value) })
const bookingNames = ['BookingOrder', 'BookingChatBinding', 'User']
const hasBooking = computed(() => props.tables.some(t => t.name === 'BookingOrder' || t.name === 'BookingChatBinding'))
const focusTable = computed(() => props.tables.find(t => t.name === (props.userData ? 'User' : props.current)) || props.tables[0])
const root = computed(() => focusTable.value?.name)
const counts = computed(() => new Map((props.userData?.tables || []).map(t => [t.name, t])))
const W = 278, HEAD = 58, ROW = 32, FOOT = 30
const links = computed(() => {
  if (pathMode.value) return props.traceSteps.map(step => step.edge)
  const visible = new Set(props.tables.map(t => t.name))
  return groupRelations([...props.relations, ...props.business.map(f => ({ ...f, business: true }))]
    .filter(f => {
      if (!f || !visible.has(f.source) || !visible.has(f.target)) return false
      if (booking.value) return bookingNames.includes(f.source) && bookingNames.includes(f.target)
      if (props.userData) return f.target === root.value && counts.value.get(f.source)?.roles.some(r => r.column === f.sourceColumn)
      return f.source === root.value || f.target === root.value
    }))
})
const sample = computed(() => {
  if (pathMode.value) return pathNames.value.map(name => props.tables.find(t => t.name === name)).filter(Boolean)
  if (booking.value) return bookingNames.map(name => props.tables.find(t => t.name === name)).filter(Boolean)
  const visible = new Set([root.value])
  for (const link of links.value) { visible.add(link.source); visible.add(link.target) }
  return props.tables.filter(t => visible.has(t.name))
})
const targets = computed(() => new Set(links.value.filter(e => e.source === root.value).map(e => e.target)))
function columnFor(name) {
  if (pathMode.value) return pathNames.value.indexOf(name) - (pathNames.value.length - 1) / 2
  if (booking.value) return name === 'User' ? 1 : -1
  if (name === root.value) return 0
  return targets.value.has(name) ? 1 : -1
}
function colorFor(name) {
  if (pathMode.value) return 'var(--accent)'
  if (booking.value) return { BookingOrder: 'var(--ed-order)', BookingChatBinding: 'var(--ed-chat)', User: 'var(--accent)' }[name]
  return ['var(--ed-chat)', 'var(--accent)', 'var(--ed-order)'][columnFor(name) + 1]
}
const chosen = computed(() => links.value.find(e => e.key === active.value))
const size = computed(() => zoom.value <= 1 ? zoom.value : 1 + .5 * Math.log(zoom.value))
const stretch = computed(() => zoom.value / size.value)
const worldStyle = computed(() => ({ transform: 'translate(' + (width.value / 2 + pan.value.x) + 'px,' + (height.value / 2 + pan.value.y) + 'px) scale(' + size.value + ')' }))
function countText(n) { return n == null ? '未统计' : n + ' 条' }
const cardContents = computed(() => sample.value.map(t => {
    const schema = (t.schema || []).filter(f => !f.writeOnly)
    const count = counts.value.get(t.name)
    const cols = new Map(schema.map(f => [f.columnName || f.key, { column: f.columnName || f.key, pk: f.primaryKey || t.primaryKeys?.includes(f.key), keys: [] }]))
    function field(column) {
      if (!cols.has(column)) cols.set(column, { column, keys: [] })
      return cols.get(column)
    }
    for (const key of t.primaryKeys || []) field(schema.find(f => f.key === key)?.columnName || key).pk = true
    for (const edge of links.value) {
      for (const f of edge.fields) {
        if (f.source === t.name) {
          const row = field(f.sourceColumn)
          row.keys.push(edge.key); row.fk ||= !edge.business; row.business ||= edge.business
          row.composite ||= edge.fields.length > 1
          row.role = edge.fields.length > 1 ? '复合外键' : f.target === 'User' ? edge.role : ''
          row.stat = count?.roles.find(r => r.column === f.sourceColumn && f.target === 'User')
        }
        if (f.target === t.name) field(f.targetColumn).keys.push(edge.key)
      }
    }
    const rows = [...cols.values()].map(r => ({ ...r, badge: [r.pk && 'PK', r.fk && 'FK'].filter(Boolean).join('/') || (r.business ? '关联' : '·') }))
    const core = rows.filter(r => r.pk || r.keys.length).sort((a,b) => Number(!!b.pk) - Number(!!a.pk))
    const extra = rows.filter(r => !r.pk && !r.keys.length)
    const preview = core.length ? 0 : 3
    const shown = [...core, ...(expanded.value[t.name] ? extra : extra.slice(0, preview))]
    const hidden = Math.max(0, extra.length - preview)
    return { ...t, rows: shown, extra: hidden, h: HEAD + shown.length * ROW + (hidden ? FOOT : 0),
      count: props.userData && t.name === 'User' ? 1 : count?.total }
  }))
const COLUMN_PITCH = 405, ROW_GAP = 54
const placements = computed(() => {
  const groups = new Map(), positions = new Map()
  for (const card of cardContents.value) {
    const side = columnFor(card.name)
    if (!groups.has(side)) groups.set(side, [])
    groups.get(side).push(card)
  }
  for (const [side, group] of groups) {
    const stack = group.reduce((sum, c) => sum + c.h + ROW_GAP, -ROW_GAP)
    const dense = !pathMode.value && !booking.value && side !== 0 && group.length > 4 && stack > height.value
    const aspect = Math.max(.8, Math.min(1.8, width.value / height.value))
    const columns = dense ? Math.min(Math.ceil(group.length/2), Math.max(2, Math.round(Math.sqrt(stack * aspect / COLUMN_PITCH)))) : 1
    const bands = []
    for (let i = 0; i < group.length; i += columns) {
      bands.push(Math.max(...group.slice(i, i + columns).map(c => c.h)))
    }
    let top = -(bands.reduce((sum, h) => sum + h, 0) + (bands.length - 1) * ROW_GAP)/2
    bands.forEach((h, row) => {
      const y = top + h/2
      group.slice(row * columns, (row + 1) * columns).forEach((card, i) => {
        const col = side * (1 + i)
        positions.set(card.name, { x: col * (booking.value ? 218 : COLUMN_PITCH), y,
          outer: i > 0, corridor: y < 0 ? top + h + ROW_GAP/2 : top - ROW_GAP/2 })
      })
      top += h + ROW_GAP
    })
  }
  return positions
})
const cards = computed(() => cardContents.value.map(c => {
  const pos = placements.value.get(c.name), delta = offsets.value[c.name] || { x: 0, y: 0 }
  const x = (pos.x + delta.x) * stretch.value - W/2, y = (pos.y + delta.y) * stretch.value - c.h/2
  return { ...c, x, y, outer: pos.outer, corridor: pos.corridor * stretch.value,
    style: { left: x+'px', top: y+'px', width: W+'px', '--entity-color': colorFor(c.name) } }
}))

// Take outer-column wires along a row gap, with a separate turn in each endpoint's column gap.
function gutterRoute(xa, ya, xb, yb, right, targetLeft, corridor, track) {
  const exit = xa + (right ? 1 : -1) * (28 + track * 36)
  const enter = xb + (targetLeft ? -1 : 1) * (28 + track * 36)
  const route = y => [[xa,ya,exit,ya], [exit,ya,exit,y], [exit,y,enter,y], [enter,y,enter,yb], [enter,yb,xb,yb]]
  const clear = segments => segments.every(([x1,y1,x2,y2]) => cards.value.every(c =>
    Math.max(x1,x2) <= c.x || Math.min(x1,x2) >= c.x + W ||
    Math.max(y1,y2) <= c.y || Math.min(y1,y2) >= c.y + c.h))
  const preferred = corridor + (track - .5) * 28
  const first = route(preferred)
  if (clear(first)) return first
  // A manually moved card can cover the original row gap.
  const alternatives = cards.value.flatMap(c => [c.y - 14, c.y + c.h + 14])
  alternatives.sort((a,b) => Math.abs(a-preferred) - Math.abs(b-preferred))
  for (const y of alternatives) {
    const candidate = route(y)
    if (clear(candidate)) return candidate
  }
  return first
}
const wires = computed(() => {
  const byName = new Map(cards.value.map(c => [c.name,c])), result = []
  const incoming = new Map()
  const fieldCount = links.value.reduce((sum, edge) => sum + edge.fields.length, 0)
  for (const edge of links.value) for (const f of edge.fields) {
    const port = JSON.stringify([edge.target, f.targetColumn])
    if (!incoming.has(port)) incoming.set(port, [])
    incoming.get(port).push(f)
  }
  for (const edge of links.value) {
    const a = byName.get(edge.source), b = byName.get(edge.target)
    if (!a || !b) continue
    for (const [index, f] of edge.fields.entries()) {
      const rowA = a.rows.findIndex(r => r.column === f.sourceColumn), rowB = b.rows.findIndex(r => r.column === f.targetColumn)
      if (rowA < 0 || rowB < 0) continue
      const peers = incoming.get(JSON.stringify([edge.target, f.targetColumn]))
      const slot = peers.indexOf(f)
      const loopInset = a === b && rowA === rowB ? 5 : 0
      const ya = a.y + HEAD + (rowA+.5)*ROW - loopInset
      const yb = b.y + HEAD + (rowB+.5)*ROW + loopInset + (slot - (peers.length-1)/2) * Math.min(5, 20 / peers.length)
      const sameSide = Math.abs(a.x-b.x) < W+30
      const right = !sameSide && b.x > a.x, targetLeft = sameSide || right
      const xa = a.x + (right ? W : 0), xb = b.x + (targetLeft ? 0 : W)
      const lane = (edge.lane || 0) + index
      const mid = sameSide ? Math.min(a.x,b.x)-22-lane*9 : xa + (xb-xa)*(.26 + .48*(slot+1)/(peers.length+1))
      const color = colorFor(edge.source)
      const outer = a.outer ? a : b.outer ? b : null
      const track = (result.length + 1) / (fieldCount + 1)
      const route = outer && !sameSide ? gutterRoute(xa,ya,xb,yb,right,targetLeft,outer.corridor,track)
        : [[xa,ya,mid,ya],[mid,ya,mid,yb],[mid,yb,xb,yb]]
      const segments = route.map(([x1,y1,x2,y2]) => ({
        vertical: x1===x2, style:{ left: Math.min(x1,x2)+'px', top: Math.min(y1,y2)+'px', width: Math.abs(x2-x1)+'px', height: Math.abs(y2-y1)+'px' }
      }))
      result.push({ key: edge.key, id: edge.key+':'+index, business: edge.business, color, segments,
        tip:{ left: (xb+(targetLeft ? -6 : 6))+'px', top: yb+'px', transform: 'translate(-50%,-50%) rotate('+(targetLeft ? 45 : 225)+'deg)' } })
    }
  }
  return result
})
function pick(key) { active.value = active.value === key ? '' : key }
function locateStep(step) {
  if (active.value === step.edge.key) { active.value = ''; return }
  active.value = step.edge.key
  const ends = cards.value.filter(c => c.name === step.from || c.name === step.to)
  if (ends.length !== 2) return
  const visible = ends.every(c => {
    const x = width.value / 2 + pan.value.x + c.x * size.value
    const y = height.value / 2 + pan.value.y + c.y * size.value
    return x >= 0 && y >= 0 && x + W * size.value <= width.value && y + c.h * size.value <= height.value
  })
  if (visible && zoom.value >= .7) return
  // Fit just this pair for a long path; use layout coordinates at 100%.
  zoom.value = 1
  const pair = cards.value.filter(c => c.name === step.from || c.name === step.to)
  fitCards(pair)
}
function selectRow(row) {
  if (!row.keys.length) { active.value = ''; return }
  active.value = row.keys[(row.keys.indexOf(active.value)+1) % row.keys.length]
}
function records(card, stat) {
  const fields = stat ? [stat.field] : card.name === 'User' ? ['id'] : counts.value.get(card.name)?.roles.map(r => r.field)
  if (props.userData && fields?.length) emit('user-records', { name: card.name, userId: props.userData.user.id, fields })
}
function toggleFields(name) { expanded.value = { ...expanded.value, [name]: !expanded.value[name] } }
function scaleAt(value, x=width.value/2, y=height.value/2) {
  const next = Math.max(.1,Math.min(5,value)), ratio = next/zoom.value
  const dx=x-width.value/2, dy=y-height.value/2
  pan.value = { x:dx-(dx-pan.value.x)*ratio, y:dy-(dy-pan.value.y)*ratio }; zoom.value=next
}
function fit() {
  zoom.value=1
  fitCards(cards.value)
}
function fitCards(items) {
  if (!items.length) return
  const left=Math.min(...items.map(c=>c.x))-48, right=Math.max(...items.map(c=>c.x+W))+22
  const top=Math.min(...items.map(c=>c.y))-18, bottom=Math.max(...items.map(c=>c.y+c.h))+18
  zoom.value=Math.max(.1, Math.min(1,width.value/(right-left),height.value/(bottom-top)))
  pan.value={x:-(right+left)*zoom.value/2,y:-(top+bottom)*zoom.value/2}
}
function reset() { offsets.value={}; frameScope() }
const element = () => surface.value?.$el || surface.value
let drag, pinch, rect={left:0,top:0}, observer, surfaceEl, mounted=true
function begin(p,name) { drag={ x:p.clientX,y:p.clientY,name } }
function move(p) {
  if (!drag) return
  const dx=p.clientX-drag.x, dy=p.clientY-drag.y
  if (drag.name) {
    const d=offsets.value[drag.name] || {x:0,y:0}
    offsets.value={...offsets.value,[drag.name]:{x:d.x+dx/zoom.value,y:d.y+dy/zoom.value}}
  } else pan.value={x:pan.value.x+dx,y:pan.value.y+dy}
  drag.x=p.clientX; drag.y=p.clientY
}
function endDrag() {
  drag=null; pinch=null
  // #ifdef H5
  window.removeEventListener('mousemove',move); window.removeEventListener('mouseup',endDrag); window.removeEventListener('blur',endDrag)
  // #endif
}
function mouseStart(e) {
  if (e.button!==0 || e.target.closest('button,uni-button')) return
  begin(e,e.target.closest('[data-drag]')?.dataset.drag)
  window.addEventListener('mousemove',move); window.addEventListener('mouseup',endDrag); window.addEventListener('blur',endDrag)
}
function wheel(e) {
  e.preventDefault()
  const box=element().getBoundingClientRect()
  scaleAt(zoom.value*Math.exp(-Math.max(-220,Math.min(220,e.deltaY*(e.deltaMode===1?16:1)))*.0018),e.clientX-box.left,e.clientY-box.top)
}
function pair(ts) {
  const a=ts[0], b=ts[1], box=element()?.getBoundingClientRect?.() || rect
  return { x:(a.clientX+b.clientX)/2-box.left,y:(a.clientY+b.clientY)/2-box.top,d:Math.max(1,Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)) }
}
function startTouch(e,name) { if(e.touches.length>=2){drag=null;pinch=pair(e.touches)}else if(e.touches[0])begin(e.touches[0],name) }
function moveTouch(e) {
  if(e.touches.length>=2){
    const p=pair(e.touches)
    if(pinch){scaleAt(zoom.value*p.d/pinch.d,pinch.x,pinch.y);pan.value={x:pan.value.x+p.x-pinch.x,y:pan.value.y+p.y-pinch.y}}
    pinch=p
  }else if(e.touches[0])move(e.touches[0])
}
function finishTouch(e) { endDrag(); if(e.touches[0])begin(e.touches[0]) }
function resize(box) {
  if(!mounted || !box?.width || !box.height)return
  rect=box
  if(width.value!==box.width || height.value!==box.height){width.value=box.width;height.value=box.height;frameScope()}
}
function measure() { uni.createSelectorQuery().in(instance.proxy).select('.ed-surface').boundingClientRect(resize).exec() }
function frameScope() {
  fit()
  if (!pathMode.value && !booking.value && !cards.value.some(c => c.outer) && (width.value >= 700 || sample.value.length > 6)) {
    // Keep a hub readable on entry. The fit control still shows the full neighborhood.
    zoom.value = Math.min(width.value / (2 * COLUMN_PITCH + W + 44), Math.max(.75, zoom.value))
    if (sample.value.length === 1) zoom.value = 1
    pan.value = { x: 0, y: 0 }
  }
}
function openScope() {
  endDrag()
  localActive.value = ''; expanded.value = {}; offsets.value = {}
  frameScope()
}
watch(root, () => { booking.value = false })
watch(hasBooking, available => { if (!available) booking.value = false })
watch(() => JSON.stringify([root.value, booking.value, sample.value.map(t => t.name)]), openScope)
onMounted(async()=>{
  await nextTick()
  if(!mounted)return
  measure();openScope();uni.onWindowResize?.(measure)
  // #ifdef H5
  const el=surfaceEl=element()
  el.addEventListener('wheel',wheel,{passive:false});el.addEventListener('mousedown',mouseStart)
  if(typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(()=>resize(el.getBoundingClientRect()));observer.observe(el)}
  // #endif
})
onUnmounted(()=>{
  mounted=false;observer?.disconnect();endDrag();uni.offWindowResize?.(measure)
  // #ifdef H5
  surfaceEl?.removeEventListener('wheel',wheel);surfaceEl?.removeEventListener('mousedown',mouseStart)
  // #endif
})
</script>
<style scoped>
.ed { --ed-order:#459fce; --ed-chat:#ab91e0; color:var(--text); border-top:1px solid var(--line); }
.ed-canvas { position:relative; }
.light .ed { --ed-order:#367da2; --ed-chat:#8266b0; }
.ed-bar,.ed-tools,.ed-context,.ed-footer,.ed-keys,.ed-keys>view,.ed-card-head,.ed-row { display:flex; align-items:center; }
.ed-bar { position:absolute; z-index:4; top:10px; left:12px; right:12px; justify-content:space-between; align-items:flex-start; gap:8px; pointer-events:none; }
.ed-context { gap:7px; max-width:45%; padding:5px 9px; border:1px solid var(--line); border-radius:20px; background:var(--panel); color:var(--ink); font-weight:650; box-sizing:border-box; }.ed-context-dot { width:7px; height:7px; flex-shrink:0; border-radius:50%; background:var(--accent); }.ed-sep { color:var(--soft); opacity:.6; }
.ed-tools { position:absolute; z-index:5; right:12px; bottom:10px; flex-wrap:wrap; justify-content:flex-end; gap:4px; padding:3px; border:1px solid var(--line); border-radius:8px; background:var(--panel); pointer-events:auto; }.ed-tools text { min-width:33px; text-align:center; color:var(--soft); font:11px/1.2 ui-monospace,monospace; }
.ed-scopes { display:flex; gap:2px; margin-right:6px; }.ed-scopes button.on { background:var(--tint); color:var(--accent); border-color:var(--accent); }
.ed-steps { position:absolute; z-index:4; top:52px; left:12px; right:12px; display:flex; flex-wrap:wrap; gap:5px; pointer-events:none; }.ed-steps button { pointer-events:auto; }
.ed-steps button { display:flex; align-items:center; gap:6px; }.ed-steps button.on,.ed-waypoint { color:var(--accent); background:var(--tint); }
.ed-step-number { color:var(--accent); font-weight:700; }
.ed-row.traced { background:var(--tint); }.ed-row.traced.marked { box-shadow:inset 4px 0 0 var(--accent); }
.ed-wire.traced .ed-segment { border-top-width:2px; }.ed-wire.traced .ed-segment.vertical { border-top-width:0; border-left-width:2px; }
.ed-card.focus { outline:1px solid var(--accent); }.ed-empty { font-size:12px; color:var(--text); }
.ed button { margin:0; padding:0 8px; background:var(--panel); color:var(--text); border:1px solid var(--line); border-radius:5px; font:inherit; font-size:11px; line-height:24px; cursor:pointer; }
.ed button::after { border:0; }.ed button:hover { color:var(--accent); background:var(--tint); }.ed button[disabled] { opacity:.65; }
.ed-surface { position:relative; width:100%; height:clamp(440px,68vh,780px); overflow:hidden; touch-action:none; user-select:none; cursor:grab;
 background-color:var(--canvas); background-image:linear-gradient(to right,var(--grid) 1px,transparent 1px),linear-gradient(to bottom,var(--grid) 1px,transparent 1px); background-size:24px 24px; }
.ed-world { position:absolute; left:0; top:0; width:0; height:0; transform-origin:0 0; }
.ed-card { position:absolute; z-index:2; border-radius:10px; background:var(--panel); box-shadow:0 0 0 1px var(--line),0 4px 16px #17372d12; overflow:hidden; }
.ed-card-head { height:58px; box-sizing:border-box; padding:0 10px; gap:8px; border-top:3px solid var(--entity-color); border-bottom:1px solid var(--line); cursor:grab; }
.ed-card-head:active { cursor:grabbing; }.ed-card-mark { width:23px; height:23px; flex-shrink:0; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:2px; background:var(--surface); border-radius:5px; }
.ed-card-mark>view { width:11px; height:2px; background:var(--entity-color); }
.ed-title-block { min-width:0; }.ed-name,.ed-sql,.ed-column { display:block; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.ed-name { color:var(--ink); font-size:14px; font-weight:700; }.ed-sql { margin-top:3px; color:var(--soft); font:10px/1.2 ui-monospace,Consolas,monospace; }
.ed-row { box-sizing:border-box; height:32px; padding:0 9px; gap:6px; border-bottom:1px solid var(--line); cursor:pointer; }
.ed-row.marked { background:var(--tint); box-shadow:inset 3px 0 0 var(--accent); }
.ed-row.composite .ed-key { border-left:2px solid var(--entity-color); }
.ed-key { min-width:21px; text-align:center; color:var(--soft); font:600 9px/17px ui-monospace,monospace; }
.ed-key.pk,.ed-key.fk { background:var(--surface); border-radius:4px; color:var(--entity-color); }
.ed-column { flex:1; color:var(--ink); font:12px/1.2 ui-monospace,Consolas,monospace; }.ed-role { color:var(--soft); font-size:11px; }
.ed .ed-count,.ed .ed-row-count { color:var(--accent); background:var(--tint); font-size:10px; line-height:19px; padding:0 5px; white-space:nowrap; }.ed .ed-count { margin-left:auto; }
.ed .ed-more { display:block; width:100%; height:30px; text-align:left; padding-left:12px; border:0; border-radius:0; background:var(--surface); color:var(--soft); }
.ed-wire { opacity:.85; }.ed-wire.dim { opacity:.23; }.ed-wire.active { z-index:1; opacity:1; }
.ed-segment { position:absolute; border-top:1.5px solid currentColor; box-sizing:content-box; cursor:pointer; }.ed-segment.vertical { border:0; border-left:1.5px solid currentColor; }
.ed-segment::after { content:''; position:absolute; inset:-4px 0; }.ed-segment.vertical::after { inset:0 -4px; }
.ed-wire.logical .ed-segment { border-style:dashed; border-width:1.5px 0 0; }.ed-wire.logical .ed-segment.vertical { border-width:0 0 0 1.5px; }
.ed-wire.active .ed-segment { border-top-width:3px; }.ed-wire.active .ed-segment.vertical { border-top-width:0; border-left-width:3px; }
.ed-tip { position:absolute; width:7px; height:7px; box-sizing:border-box; border-top:2px solid currentColor; border-right:2px solid currentColor; pointer-events:none; }
.ed-footer { position:absolute; z-index:4; left:12px; right:215px; bottom:10px; flex-wrap:wrap; justify-content:space-between; gap:6px 15px; pointer-events:none; }.ed-keys { flex-wrap:wrap; gap:9px; padding:4px 7px; border-radius:6px; background:var(--panel); }.ed-keys>view { gap:4px; }
.ed-keys,.ed-hint,.ed-mapping { font-size:11px; color:var(--soft); }.ed-hint,.ed-mapping,.ed-empty { padding:4px 7px; border-radius:6px; background:var(--panel); }.ed-sample { width:18px; border-top:2px solid var(--soft); }.ed-sample.logical { border-top-style:dashed; }.ed-mapping { color:var(--accent); overflow-wrap:anywhere; }
@media(max-width:600px){ .ed-bar { top:8px; left:8px; right:8px; flex-wrap:wrap; }.ed-context { max-width:100%; }.ed-tools { right:8px; bottom:8px; }.ed-steps { top:46px; left:8px; right:8px; }.ed-surface { height:clamp(380px,65vh,520px); }.ed-hint { display:none; }.ed-footer { left:8px; right:8px; bottom:48px; } }
</style>
