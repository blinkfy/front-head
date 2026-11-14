<template>
  <view class="rt">
    <view v-if="!rows.length" class="rt-empty"><text>{{ emptyText }}</text></view>
    <template v-else>
      <view class="rt-grid">
        <view class="rt-row rt-axis-row">
          <view class="rt-label"></view>
          <view class="rt-track rt-axis"><text v-for="tick in ticks" :key="tick" class="rt-tick" :style="{ left: pct(tick) + '%' }">{{ hourText(tick) }}</text></view>
        </view>
        <view v-for="row in rows" :key="row.key" class="rt-row">
          <view class="rt-label"><text class="rt-area">{{ row.areaName }}</text><text class="rt-sub">{{ row.sub }}</text></view>
          <view class="rt-track rt-lane">
            <view v-for="tick in ticks" :key="'g' + tick" class="rt-gridline" :style="{ left: pct(tick) + '%' }"></view>
            <view v-for="(item, index) in row.windows" :key="'w' + index" class="rt-window" :style="box(item.start, item.end)"></view>
            <view v-for="(item, index) in row.draft" :key="'d' + index" class="rt-draft" :style="box(item.start, item.end)"></view>
            <template v-if="showFree"><view v-for="(item, index) in row.free" :key="'f' + index" class="rt-free" :style="box(item.start, item.end)"></view></template>
            <view v-for="job in row.jobs.filter(hasExecution)" :key="'j' + job.id" :class="['rt-job', jobClass(job), { selected: selected && selected.id === job.id }]" :style="box(job.executionStart, job.executionEnd)" @click="pick(job)"></view>
            <view v-for="(item, index) in row.ghosts" :key="'p' + index" class="rt-ghost" :style="box(item.start, item.end)"><text>{{ item.label || '新单' }}</text></view>
            <view v-if="nowPct !== null" class="rt-now" :style="{ left: nowPct + '%' }"></view>
          </view>
        </view>
      </view>
      <view class="rt-legend">
        <view v-for="item in legend" :key="item.key" class="rt-legend-item"><view :class="['rt-swatch', item.key]"></view><text>{{ item.label }}</text></view>
      </view>
      <view v-if="selected" class="rt-detail">
        <view class="rt-detail-head"><text class="rt-detail-title">订单 {{ selected.orderNo }}</text><text :class="['rt-badge', jobClass(selected)]">{{ statusLabel(selected) }}</text></view>
        <text class="rt-detail-line">{{ execLabel(selected) }}：{{ timeRange(selected.executionStart, selected.executionEnd) }}</text>
        <text class="rt-detail-line">用户预约：{{ selected.appointmentDate }} {{ selected.appointmentTimeSlot }}</text>
        <text v-if="selected.serviceAreaName" class="rt-detail-line">服务范围：{{ selected.serviceAreaName }}</text>
        <text v-if="selected.address" class="rt-detail-line">{{ selected.contactName || '用户' }} · {{ selected.address }}</text>
        <view v-if="actions.length" class="rt-actions">
          <button v-if="actions.includes('detail')" class="rt-btn primary" @click="$emit('detail', selected)">订单详情</button>
          <button v-if="actions.includes('contact')" class="rt-btn" @click="$emit('contact', selected)">联系用户</button>
          <button v-if="actions.includes('navigate') && hasLocation(selected)" class="rt-btn" @click="$emit('navigate', selected)">开始导航</button>
        </view>
      </view>
    </template>
  </view>
</template>
<script>
const STATUS = { confirmed: '待执行', picking: '进行中', completed: '已完成' }
const EXEC = { confirmed: '系统预计上门', picking: '实际开始（预计结束）', completed: '实际执行' }
const pad = value => String(value).padStart(2, '0')
const minutesText = value => { const v = Math.max(0, Math.min(1440, Math.round(Number(value) || 0))); return `${pad(Math.floor(v / 60))}:${pad(v % 60)}` }
export default {
  name: 'RecyclingTimeline',
  props: {
    lanes: { type: Array, default: () => [] },
    mode: { type: String, default: 'scheduled' },
    ghosts: { type: Array, default: () => [] },
    draft: { type: Array, default: () => [] },
    actions: { type: Array, default: () => [] },
    showFree: { type: Boolean, default: true },
    nowMinutes: { type: Number, default: null },
    emptyText: { type: String, default: '当天暂无排班或任务' }
  },
  data: () => ({ selectedId: null }),
  computed: {
    rows() {
      const rows = []
      const keyOf = id => String(id)
      for (const lane of this.lanes || []) rows.push({ key: keyOf(lane.serviceAreaId), serviceAreaId: lane.serviceAreaId, areaName: lane.areaName || '服务区域', windows: lane.windows || [], free: lane.free || [], jobs: lane.jobs || [], draft: [], ghosts: [] })
      for (const item of this.draft || []) {
        let row = rows.find(r => r.key === keyOf(item.serviceAreaId))
        if (!row) { row = { key: keyOf(item.serviceAreaId), serviceAreaId: item.serviceAreaId, areaName: item.areaName || '服务区域', windows: [], free: [], jobs: [], draft: [], ghosts: [] }; rows.push(row) }
        row.draft = item.windows || []
      }
      for (const item of this.ghosts || []) { const row = rows.find(r => r.key === keyOf(item.serviceAreaId)); if (row) row.ghosts.push(item) }
      for (const row of rows) {
        const window = row.windows.reduce((sum, w) => sum + (w.end - w.start), 0)
        row.sub = window ? `${row.jobs.length} 单 · 工作 ${this.hours(window)}` : (row.draft.length ? '待发布' : `${row.jobs.length} 单 · 当天无排班`)
      }
      return rows
    },
    selected() { for (const row of this.rows) { const job = row.jobs.find(j => j.id === this.selectedId); if (job) return job } return null },
    range() {
      const values = []
      for (const row of this.rows) {
        for (const list of [row.windows, row.free, row.draft, row.ghosts]) for (const item of list) values.push(item.start, item.end)
        for (const job of row.jobs) values.push(job.executionStart, job.executionEnd)
      }
      const finite = values.filter(Number.isFinite)
      if (!finite.length) return { start: 480, end: 1080 }
      let start = Math.floor(Math.min(...finite) / 60) * 60, end = Math.ceil(Math.max(...finite) / 60) * 60
      if (end - start < 240) end = Math.min(1440, start + 240)
      if (end - start < 240) start = Math.max(0, end - 240)
      return { start, end }
    },
    ticks() {
      const { start, end } = this.range, span = (end - start) / 60, step = span <= 8 ? 60 : span <= 16 ? 120 : 180, ticks = []
      for (let t = start; t <= end; t += step) ticks.push(t)
      return ticks
    },
    nowPct() { if (this.nowMinutes == null) return null; const { start, end } = this.range; return this.nowMinutes < start || this.nowMinutes > end ? null : this.pct(this.nowMinutes) },
    legend() {
      if (this.mode === 'status') return [{ key: 'st-completed', label: '已完成' }, { key: 'st-picking', label: '进行中' }, { key: 'st-confirmed', label: '待执行' }, { key: 'rt-window', label: '工作窗口' }]
      const base = [{ key: 'rt-window', label: '工作窗口' }, { key: 'st-scheduled', label: '已排订单' }]
      if (this.showFree) base.push({ key: 'rt-free', label: '空闲可接' })
      if (this.ghosts.length) base.push({ key: 'rt-ghost', label: '接单后预排' })
      if (this.draft.length) base.push({ key: 'rt-draft', label: '待发布窗口' })
      return base
    }
  },
  watch: { lanes() { if (this.selectedId != null && !this.selected) this.selectedId = null } },
  methods: {
    pct(value) { const { start, end } = this.range; return Math.max(0, Math.min(100, (value - start) / (end - start) * 100)) },
    box(start, end) { const left = this.pct(start), right = this.pct(end); return { left: left + '%', width: Math.max(right - left, 0.8) + '%' } },
    hourText(value) { return `${pad(Math.floor(value / 60))}:00` },
    hours(minutes) { const h = Math.round(minutes / 6) / 10; return `${h} 小时` },
    hasExecution(job) { return Number.isFinite(job.executionStart) && Number.isFinite(job.executionEnd) },
    timeRange(start, end) { if (!Number.isFinite(start) || !Number.isFinite(end)) return '暂无可用执行时间'; return `${minutesText(start)}–${minutesText(end)}` },
    jobClass(job) { return this.mode === 'status' ? `st-${job.status}` : 'st-scheduled' },
    statusLabel(job) { return STATUS[job.status] || job.status },
    execLabel(job) { return EXEC[job.status] || '预计执行' },
    hasLocation(job) { return Number.isFinite(Number(job.addressLat)) && Number.isFinite(Number(job.addressLng)) && job.addressLat != null && job.addressLng != null },
    pick(job) { this.selectedId = this.selectedId === job.id ? null : job.id; this.$emit('select', this.selected) }
  }
}
</script>
<style scoped>
.rt { width: 100%; }
.rt-empty { padding: 36rpx 0; text-align: center; font-size: 25rpx; color: var(--workbench-muted, #64748b); }
.rt-grid { display: flex; flex-direction: column; gap: 14rpx; }
.rt-row { display: flex; align-items: center; gap: 14rpx; }
.rt-label { width: 132rpx; flex: none; display: flex; flex-direction: column; min-width: 0; }
.rt-area { font-size: 24rpx; font-weight: 600; color: var(--workbench-text, #0f172a); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rt-sub { font-size: 20rpx; color: var(--workbench-muted, #64748b); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rt-track { flex: 1; position: relative; min-width: 0; }
.rt-axis { height: 30rpx; }
.rt-tick { position: absolute; top: 0; transform: translateX(-50%); font-size: 20rpx; color: var(--workbench-muted, #64748b); white-space: nowrap; }
.rt-lane { height: 76rpx; border-radius: 12rpx; background: var(--workbench-surface, #fff); border: 1rpx solid var(--workbench-line, #e2e8f0); overflow: hidden; box-sizing: border-box; }
.rt-gridline { position: absolute; top: 0; bottom: 0; width: 1rpx; background: var(--workbench-line, #e2e8f0); opacity: .7; }
.rt-window { position: absolute; top: 0; bottom: 0; background: rgba(16, 185, 129, .13); }
.rt-draft { position: absolute; top: 4rpx; bottom: 4rpx; border: 2rpx dashed #3b82f6; background: rgba(59, 130, 246, .08); box-sizing: border-box; border-radius: 8rpx; }
.rt-free { position: absolute; top: 10rpx; bottom: 10rpx; border: 2rpx dashed #10b981; border-radius: 8rpx; box-sizing: border-box; background: rgba(16, 185, 129, .06); }
.rt-job { position: absolute; top: 12rpx; bottom: 12rpx; border-radius: 8rpx; box-sizing: border-box; border: 2rpx solid rgba(255, 255, 255, .9); }
.rt-job.selected { box-shadow: 0 0 0 3rpx var(--workbench-text, #0f172a); z-index: 2; }
.rt-ghost { position: absolute; top: 8rpx; bottom: 8rpx; display: flex; align-items: center; justify-content: center; border: 2rpx dashed #f59e0b; background: rgba(245, 158, 11, .22); border-radius: 8rpx; box-sizing: border-box; font-size: 18rpx; color: #b45309; overflow: hidden; z-index: 3; }
.rt-now { position: absolute; top: 0; bottom: 0; width: 3rpx; background: #ef4444; z-index: 4; }
.st-scheduled { background: #0f9f6e; }
.st-completed { background: #10b981; }
.st-picking { background: #f59e0b; }
.st-confirmed { background: #3b82f6; }
.rt-legend { display: flex; flex-wrap: wrap; gap: 8rpx 22rpx; margin-top: 18rpx; }
.rt-legend-item { display: flex; align-items: center; gap: 8rpx; font-size: 21rpx; color: var(--workbench-muted, #64748b); }
.rt-swatch { width: 26rpx; height: 16rpx; border-radius: 4rpx; box-sizing: border-box; position: relative; }
.rt-swatch.rt-window { background: rgba(16, 185, 129, .25); position: relative; }
.rt-swatch.rt-free { border: 2rpx dashed #10b981; background: transparent; }
.rt-swatch.rt-ghost { border: 2rpx dashed #f59e0b; background: rgba(245, 158, 11, .22); }
.rt-swatch.rt-draft { border: 2rpx dashed #3b82f6; background: rgba(59, 130, 246, .12); }
.rt-detail { margin-top: 20rpx; padding: 20rpx 22rpx; background: var(--workbench-soft, #f0fdf4); border-radius: 14rpx; display: flex; flex-direction: column; gap: 6rpx; }
.rt-detail-head { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; }
.rt-detail-title { font-size: 27rpx; font-weight: 700; color: var(--workbench-text, #0f172a); }
.rt-badge { font-size: 21rpx; color: #fff; padding: 2rpx 14rpx; border-radius: 999rpx; }
.rt-detail-line { font-size: 24rpx; color: var(--workbench-text, #0f172a); overflow-wrap: anywhere; }
.rt-actions { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 10rpx; }
.rt-btn { margin: 0; padding: 0 24rpx; height: 64rpx; line-height: 64rpx; font-size: 25rpx; border-radius: 999rpx; background: transparent; color: var(--workbench-green, #059669); border: 1rpx solid var(--workbench-green, #059669); }
.rt-btn.primary { background: var(--workbench-green, #059669); color: #fff; }
.rt-btn::after { border: none; }
</style>
