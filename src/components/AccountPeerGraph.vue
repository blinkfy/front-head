<template>
  <view class="peer-workspace">
    <view class="peer-stage" ref="stage" :style="{ height: graphHeight + 'px' }">
      <view v-for="n in nodes" :key="n.id" class="peer-branch" :class="{ faded: selected && selected !== n.id, picked: selected === n.id }"
        :style="{ '--branch': n.color }">
        <button class="peer-edge" :style="n.edge" :aria-label="'查看与' + n.title + '的往来'" @click="pick(n.id)"><view /></button>
        <button class="edge-label" :style="n.tag" @click="pick(n.id)">{{ n.label }}</button>
        <button class="peer-node" :style="n.node" :aria-pressed="selected === n.id" @click="pick(n.id)">
          <view class="node-dot" /><text class="name">{{ n.title }}</text><text class="peer-id">#{{ n.id }}</text>
        </button>
      </view>
      <button class="peer-center" :style="centerStyle" aria-label="查看图内全部往来" @click="$emit('select', null)">
        <view class="center-dot"><view /></view><text class="name">{{ user?.username || '当前账号' }}</text><text class="peer-id">#{{ id }}</text>
      </button>
    </view>
    <view class="peer-inspector" id="peer-evidence-panel" ref="inspector">
      <template v-if="pair">
        <view class="inspector-heading"><text class="eyebrow">两人往来</text><button class="reset" @click="$emit('select', null)">总览</button></view>
        <text class="pair-title">{{ user?.username || '#' + id }} ↔ {{ pair.username || '#' + pair.id }}</text>
        <text class="pair-meta">#{{ id }} 与 #{{ pair.id }} · {{ pair.records }} 条来源记录</text>
        <button v-for="e in details" :key="e.label" class="evidence" @click="$emit('evidence', e)">
          <view><text>{{ e.label }}</text><text class="direction">{{ e.direction }}</text></view><text>{{ e.count }} ›</text></button>
      </template>
      <template v-else>
        <text class="eyebrow">图内往来</text>
        <text class="pair-title">{{ peers.length }} 个账号</text>
        <view v-for="t in breakdown" :key="t.name" class="legend"><view class="swatch" :style="{ background:t.color }"/><text>{{ t.label }}</text><text>{{ t.count }} 条</text></view>
        <text class="pair-meta">点连线或账号查看双方记录。</text>
      </template>
    </view>
  </view>
</template>
<script setup>
import { computed, getCurrentInstance, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { peerBreakdown, peerTypes } from './account-peer-types'
const props = defineProps({ id: [String, Number], user: Object, peers: Array, selected: [String, Number] })
const emit = defineEmits(['select', 'evidence'])
const stage = ref(null), inspector = ref(null), width = ref(350), instance = getCurrentInstance()
const pair = computed(() => props.peers.find(row => row.id === props.selected))
const details = computed(() => {
  if (!pair.value) return []
  const mine = props.user?.username || '#' + props.id, other = pair.value.username || '#' + pair.value.id
  return pair.value.evidence.map(e => {
    const outbound = String(e.values[peerTypes[e.name].from]) === String(props.id)
    return { ...e, direction:outbound ? mine + ' → ' + other : other + ' → ' + mine }
  })
})
const breakdown = computed(() => peerBreakdown(props.peers.flatMap(p => p.evidence)))
const graphHeight = computed(() => Math.max(236, Math.ceil(props.peers.length / 2) * 76 + 30))
const center = computed(() => ({ x: width.value * (props.peers.length === 1 ? .26 : .5), y: graphHeight.value / 2 - 14 }))
function point(x, y) { return { left: x + 'px', top: y + 'px' } }
const centerStyle = computed(() => point(center.value.x, center.value.y))
const nodes = computed(() => props.peers.map((p, index) => {
  const left = props.peers.length > 1 && index % 2 === 0
  const count = left ? Math.ceil(props.peers.length / 2) : Math.max(1, Math.floor(props.peers.length / 2))
  const row = Math.floor(index / 2), { x:cx, y:cy } = center.value
  const margin = Math.min(61, width.value * .115)
  const x = left ? margin : width.value - margin
  const y = count === 1 ? cy : 24 + row * (graphHeight.value - 86) / (count - 1)
  const dx = x - cx, dy = y - cy, kinds = peerBreakdown(p.evidence)
  const names = kinds.map(t => t.label)
  const visible = width.value < 480 ? 1 : 2
  const typeLabel = names.slice(0, visible).join('·') + (names.length > visible ? '+' + (names.length - visible) : '')
  return { id:p.id, title:p.username || '账号', color:kinds[0]?.color || '#64818b', label:typeLabel + ' ' + p.records,
    node:point(x,y), tag:point(cx + dx * .57, cy + dy * .57),
    edge:{ ...point(cx,cy), width:Math.hypot(dx,dy)+'px', transform:'rotate('+Math.atan2(dy,dx)+'rad)' } }
}))
async function pick(id) {
  const next = props.selected === id ? null : id
  emit('select', next)
  // #ifdef H5
  if (next != null && window.matchMedia('(max-width:760px)').matches) {
    await nextTick()
    const el = inspector.value?.$el || inspector.value
    el?.scrollIntoView?.({ block:'nearest' })
  }
  // #endif
}
let observer, mounted = true
function resize(w) { if (mounted && w > 0) width.value = w }
function measure() { uni.createSelectorQuery().in(instance.proxy).select('.peer-stage').boundingClientRect(r => resize(r?.width)).exec() }
onMounted(async () => {
  await nextTick()
  if (!mounted) return
  measure(); uni.onWindowResize?.(measure)
  // #ifdef H5
  const el = stage.value?.$el || stage.value
  if (el && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(entries => resize(entries[0].contentRect.width)); observer.observe(el)
  }
  // #endif
})
onUnmounted(() => { mounted = false; observer?.disconnect(); uni.offWindowResize?.(measure) })
</script>
<style scoped>
.peer-workspace { display:grid; grid-template-columns:minmax(0,1fr) 208px; border:1px solid #849f953d; border-radius:12px; overflow:hidden; }
.peer-stage { position:relative; min-width:0; align-self:center; overflow:hidden; background:radial-gradient(#76998b32 1px,transparent 1px) 0 0 / 16px 16px; }
.peer-workspace button { margin:0; padding:0; border:0; border-radius:0; font:inherit; color:inherit; background:transparent; line-height:1.35; cursor:pointer; }
.peer-workspace button::after { border:0; }.peer-branch.faded { opacity:.23; }.peer-branch.picked .peer-edge view { height:3px; }
.peer-stage .peer-edge { position:absolute; height:18px; margin-top:-9px; transform-origin:left center; display:flex; align-items:center; overflow:visible; }.peer-edge view { width:100%; height:1.5px; background:var(--branch); }
.peer-stage .edge-label { position:absolute; z-index:1; transform:translate(-50%,-50%); border:1px solid var(--branch); background:var(--ins-surface,#fff); padding:1px 4px; border-radius:6px; font-size:10px; white-space:nowrap; }
.peer-stage .peer-node,.peer-stage .peer-center { position:absolute; z-index:2; width:24%; max-width:105px; transform:translate(-50%,-8px); display:flex; flex-direction:column; align-items:center; overflow:visible; }
.node-dot { width:12px; height:12px; border:2px solid var(--ins-surface,#fff); border-radius:100%; background:var(--branch); box-shadow:0 0 0 1px var(--branch); }.peer-branch.picked .node-dot { box-shadow:0 0 0 3px var(--branch); }
.peer-stage .peer-center { transform:translate(-50%,-16px); }.center-dot { width:32px; height:32px; display:grid; place-items:center; border-radius:100%; background:#147965; box-shadow:0 0 0 4px #399e8526; }.center-dot view { width:8px; height:8px; border:2px solid white; transform:rotate(45deg); }
.name,.peer-id { display:block; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; background:var(--ins-surface,#fff); }.name { margin-top:3px; font-size:12px; font-weight:650; }.peer-id { font-size:10px; opacity:.8; }
.peer-inspector { padding:14px; min-width:0; border-left:1px solid #849f953d; }.inspector-heading,.legend,.evidence { display:flex; align-items:center; gap:5px; }.inspector-heading,.evidence { justify-content:space-between; }
.eyebrow,.pair-meta,.pair-title { display:block; }.eyebrow,.pair-meta { font-size:11px; opacity:.75; }.pair-meta { margin:6px 0 10px; }.pair-title { font-size:16px; font-weight:700; margin-top:4px; overflow-wrap:anywhere; }
.legend,.peer-inspector .evidence { padding:6px 0; font-size:12px; }.legend text:last-child { margin-left:auto; }.swatch { width:8px; height:8px; border-radius:50%; }.peer-inspector .evidence { width:100%; text-align:left; border-bottom:1px solid #849f9536; }.evidence text:last-child { white-space:nowrap; }.peer-inspector .reset { font-size:11px; text-decoration:underline; }
.evidence>view { min-width:0; }.evidence .direction { display:block; font-size:10px; opacity:.73; overflow:hidden; text-overflow:ellipsis; }
@media(max-width:760px){ .peer-workspace { grid-template-columns:minmax(0,1fr); }.peer-inspector { border-left:0; border-top:1px solid #849f953d; } }
</style>
