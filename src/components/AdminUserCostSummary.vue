<template>
  <view class="cost-overlay" :class="{ dark }" @click="$emit('close')">
    <view class="cost-panel" @click.stop>
      <view class="cost-head"><text>用户成本汇总</text><button aria-label="关闭成本汇总" @click="$emit('close')">关闭</button></view>
      <text class="cost-note">人民币估算成本 · 按北京时间统计</text>
      <view class="cost-filters">
        <picker mode="date" :value="start" @change="start = $event.detail.value"><view class="cost-input">{{ start || '开始日期' }}</view></picker>
        <text>至</text>
        <picker mode="date" :value="end" @change="end = $event.detail.value"><view class="cost-input">{{ end || '结束日期' }}</view></picker>
        <input v-model="userId" type="number" class="cost-input cost-user" placeholder="用户 ID（全部）" />
        <button @click="reset">清空</button><button class="primary" @click="search">查询</button>
      </view>
      <view class="cost-tabs"><button :class="{ active: group === 'user' }" @click="switchGroup('user')">按用户</button><button :class="{ active: group === 'date' }" @click="switchGroup('date')">按日期</button></view>
      <view v-if="data" class="cost-total"><text>范围总成本</text><text class="amount">¥{{ money(data.totals.totalCost) }}</text></view>
      <view v-if="data" class="cost-breakdown"><text v-for="field in fields" :key="field.key">{{ field.label }} ¥{{ money(data.totals[field.key]) }}</text></view>
      <view v-if="group === 'date' && trend?.points?.length && !loading && !error" class="trend">
        <view class="trend-heading"><text>成本趋势 · {{ trendPeriod }}</text><text>{{ trendSelection ? trendSelection.period + ' · ¥' + money(trendSelection.totalCost) : '点击圆点查看金额' }}</text></view>
        <view class="trend-body">
          <view class="trend-axis"><text>{{ axisMoney(chart.maximum) }}</text><text>0</text></view>
          <scroll-view :scroll-x="chartViewportWidth > 0 && chart.width > chartViewportWidth" class="trend-scroll">
            <view class="trend-canvas" :style="{ width: chart.width + 'px' }">
              <view class="trend-grid top" /><view class="trend-grid middle" /><view class="trend-grid bottom" />
              <view v-for="(line, index) in chart.lines" :key="'l' + index" class="trend-line" :style="line" />
              <view v-for="point in chart.points" :key="point.period" class="trend-point" :class="{ selected: trendSelection?.period === point.period }" :style="{ left: point.x + 'px', top: point.y + 'px' }" @click="trendSelection = point" />
              <text v-for="point in chart.labels" :key="'date' + point.period" class="trend-label" :class="{ first: point.first, last: point.last }" :style="{ left: point.x + 'px' }">{{ point.period }}</text>
            </view>
          </scroll-view>
        </view>
      </view>
      <view v-if="loading" class="cost-empty">正在汇总…</view>
      <view v-else-if="error" class="cost-empty">{{ error }}</view>
      <scroll-view v-else scroll-y class="cost-list">
        <view v-if="!data?.rows?.length" class="cost-empty">该范围暂无成本记录</view>
        <view v-for="row in data?.rows || []" :key="group === 'user' ? row.userId : row.costDate" class="cost-row">
          <view><text class="cost-name">{{ group === 'user' ? ((row.username || '用户') + ' #' + row.userId) : row.costDate }}</text><view class="cost-breakdown"><text v-for="field in fields" :key="field.key">{{ field.label }} {{ money(row[field.key]) }}</text></view></view>
          <text class="cost-row-total">¥{{ money(row.totalCost) }}</text>
        </view>
      </scroll-view>
      <view class="cost-pages"><button :disabled="page <= 1 || loading" @click="changePage(-1)">上一页</button><text>第 {{ page }} 页</text><button :disabled="!data?.hasMore || loading" @click="changePage(1)">下一页</button></view>
    </view>
  </view>
</template>
<script setup>
import { ref, computed, watch, nextTick, getCurrentInstance, onMounted, onUnmounted } from 'vue'
import { getUserCostSummary } from '@/api/database'
defineProps({ dark: Boolean })
defineEmits(['close'])
const start = ref(''), end = ref(''), userId = ref(''), group = ref('user'), page = ref(1)
const data = ref(null), error = ref(''), loading = ref(false), trend = ref(null), trendSelection = ref(null)
const instance = getCurrentInstance(), chartViewportWidth = ref(0)
let disposed = false
function measureViewport() {
  nextTick(() => {
    if (disposed || group.value !== 'date' || loading.value || !trend.value?.points?.length) return
    uni.createSelectorQuery().in(instance.proxy).select('.trend-scroll').boundingClientRect(rect => {
      if (!disposed && rect?.width > 0) chartViewportWidth.value = Math.floor(rect.width)
    }).exec()
  })
}
watch([group, loading, trend], measureViewport, { flush: 'post' })
const trendPeriod = computed(() => ({ day: '按日', month: '按月', year: '按年' }[trend.value?.period] || '按日'))
const chart = computed(() => {
  const source = trend.value?.points || [], width = Math.max(chartViewportWidth.value || 240, (source.length - 1) * 22 + 24)
  const highest = Math.max(0, ...source.map(point => Number(point.totalCost) || 0))
  const maximum = Math.ceil(highest * 10000) / 10000
  const points = source.map((point, i) => ({ ...point, x: source.length === 1 ? width / 2 : 12 + i * (width - 24) / Math.max(1, source.length - 1),
    y: 12 + (maximum ? (1 - Number(point.totalCost || 0) / maximum) * 92 : 92) }))
  const lines = points.slice(1).map((point, i) => { const prev = points[i], dx = point.x - prev.x, dy = point.y - prev.y
    return { left: prev.x + 'px', top: prev.y + 'px', width: Math.hypot(dx, dy) + 'px', transform: 'rotate(' + Math.atan2(dy, dx) + 'rad)' } })
  const stride = Math.max(1, Math.ceil((points.length - 1) / 5))
  const labels = points.filter((_, i) => i === 0 || i === points.length - 1 || (i % stride === 0 && i + stride / 2 < points.length - 1))
    .map((point, i, list) => ({ ...point, first: list.length > 1 && i === 0, last: list.length > 1 && i === list.length - 1 }))
  return { width, maximum, points, lines, labels }
})
const fields = [{ key: 'qwenCost', label: '千问' }, { key: 'deepseekCost', label: 'DeepSeek' }, { key: 'imageCost', label: '生图' }, { key: 'speechCost', label: '语音' }, { key: 'identityCost', label: '实名' }]
const money = value => Number(value || 0).toFixed(8).replace(/0+$/, '').replace(/\.$/, '') || '0'
const axisMoney = value => Number(value || 0).toFixed(4).replace(/0+$/, '').replace(/\.$/, '') || '0'
let version = 0
async function load() {
  const id = ++version; loading.value = true; error.value = ''
  try {
    const response = await getUserCostSummary({ start: start.value, end: end.value, userId: userId.value, group: group.value, page: page.value })
    if (id !== version) return
    if (response?.code !== 0) throw new Error(response?.msg || '查询失败')
    data.value = response.data
    if (group.value === 'date' && response.data.trend) { trend.value = response.data.trend; trendSelection.value = null }
  } catch (e) { if (id === version) { data.value = null; error.value = e?.message || '查询失败' } }
  finally { if (id === version) loading.value = false }
}
function search() { page.value = 1; trend.value = null; trendSelection.value = null; load() }
function reset() { start.value = ''; end.value = ''; userId.value = ''; search() }
function switchGroup(value) { if (value !== group.value) { group.value = value; search() } }
function changePage(delta) { page.value += delta; load() }
onMounted(() => { measureViewport(); uni.onWindowResize?.(measureViewport); load() })
onUnmounted(() => { disposed = true; version++; uni.offWindowResize?.(measureViewport) })
</script>
<style scoped>
.cost-overlay{position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,.52);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;--bg:#fff;--ink:#173b34;--muted:#678079;--line:#d7e8df;--tint:#edf8f2;--accent:#0b946e;color:var(--ink)}
.cost-overlay.dark{--bg:#102c37;--ink:#e8f2f1;--muted:#90adae;--line:#304c55;--tint:#173e3b;--accent:#80dcc8}
.cost-panel{width:min(780px,100%);height:min(700px,85vh);display:flex;flex-direction:column;box-sizing:border-box;background:var(--bg);border-radius:14px;padding:18px;gap:10px}
.cost-head,.cost-filters,.cost-tabs,.cost-total,.cost-row,.cost-pages{display:flex;align-items:center;gap:8px}.cost-head,.cost-row{justify-content:space-between}.cost-head{font-size:17px;font-weight:700}.cost-note,.cost-breakdown{font-size:11px;color:var(--muted)}
.cost-filters{flex-wrap:wrap}.cost-input{box-sizing:border-box;background:var(--tint);border:1px solid var(--line);border-radius:6px;padding:6px 9px;min-height:32px;font-size:12px;color:var(--ink)}.cost-user{width:140px;height:32px}
button{margin:0;padding:0 10px;min-height:32px;line-height:30px;font-size:12px;color:var(--ink);border:1px solid var(--line);border-radius:6px;background:var(--bg)}button::after{border:0}button.primary,button.active{background:var(--accent);color:var(--bg)}button[disabled]{opacity:.45}
.trend{padding:8px 8px 2px;border:1px solid var(--line);border-radius:8px;background:var(--tint)}.trend-heading{display:flex;justify-content:space-between;gap:8px;color:var(--muted);font-size:11px}.trend-body{display:flex;align-items:stretch;margin-top:4px}.trend-axis{width:42px;flex:none;height:104px;display:flex;flex-direction:column;justify-content:space-between;align-items:flex-end;padding:7px 5px 0 0;box-sizing:border-box;color:var(--muted);font-size:10px}.trend-scroll{width:0;flex:1;white-space:nowrap}.trend-canvas{position:relative;height:130px}.trend-grid{position:absolute;left:0;right:0;border-top:1px dashed var(--line)}.trend-grid.top{top:12px}.trend-grid.middle{top:58px}.trend-grid.bottom{top:104px}.trend-line{position:absolute;height:2px;background:var(--accent);transform-origin:left center;pointer-events:none}.trend-point{position:absolute;width:26px;height:26px;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center}.trend-point::after{content:'';width:9px;height:9px;border-radius:50%;background:var(--bg);border:2px solid var(--accent);box-sizing:border-box}.trend-point.selected::after{background:var(--accent);width:12px;height:12px}.trend-label{position:absolute;top:111px;transform:translateX(-50%);font-size:10px;color:var(--muted)}.trend-label.first{transform:none}.trend-label.last{transform:translateX(-100%)}
.cost-total{justify-content:space-between;background:var(--tint);padding:10px;border-radius:8px;font-size:13px}.amount{font-size:21px;font-weight:700;color:var(--accent)}.cost-breakdown{display:flex;flex-wrap:wrap;gap:5px 12px}.cost-list{min-height:0;flex:1}.cost-row{padding:10px 2px;border-bottom:1px solid var(--line);gap:12px}.cost-name{font-weight:600;font-size:13px}.cost-row-total{white-space:nowrap;color:var(--accent);font-weight:600}.cost-empty{padding:22px;text-align:center;color:var(--muted);font-size:12px}.cost-pages{margin-top:auto;justify-content:center;font-size:12px;color:var(--muted)}
</style>
