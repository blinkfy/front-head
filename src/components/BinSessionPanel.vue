<template>
  <view class="bin-session" :class="{ dark, celebrating, paused: !!syncError || !active }">
    <view class="feedback-heading">
      <text class="feedback-label">投放反馈</text>
      <view class="sync-badge" :class="{ warning: syncError }">
        <view class="sync-dot"></view>
        <text>{{ syncError ? '同步暂停' : initialized ? '已同步' : '同步中' }}</text>
      </view>
    </view>

    <view class="feedback-stage" :class="{ 'has-result': latest }" aria-live="polite">
      <view :key="pointsAnimationKey" class="bin-illustration" aria-hidden="true">
        <view class="waiting-ring ring-outer"></view>
        <view class="waiting-ring ring-inner"></view>
        <view class="bin-ground"></view>
        <image class="feedback-bin" src="/static/colorful-bin.png" mode="aspectFit" />
        <view v-if="celebrating" class="arrival-item"><text>♻</text></view>
        <view v-if="latest" class="result-check"><text>✓</text></view>
        <view v-if="celebrating" class="celebration-burst">
          <view class="burst-ring burst-ring-one"></view>
          <view class="burst-ring burst-ring-two"></view>
          <view v-for="(particle, index) in celebrationParticles" :key="index" class="celebration-confetti"
            :style="{ '--flight-x': particle.x + 'px', '--flight-y': particle.y + 'px', '--spin': particle.spin + 'deg', background: particle.color, animationDelay: particle.delay + 's' }"></view>
        </view>
      </view>
      <text :key="pointsAnimationKey" class="feedback-title">{{ celebrating ? '收到新的投放记录！' : latest ? '分类记录已同步' : '等待你的下一次投放' }}</text>
      <text class="feedback-description">{{ latest ? '每一次正确分类，都让环保更进一步' : '投放后，分类结果会显示在这里' }}</text>
      <text v-if="!latest" class="device-hint">操作进度请以垃圾桶上的提示为准</text>
      <view v-if="pointsAnimation > 0" :key="pointsAnimationKey" class="points-flight">
        <text class="points-award">+{{ pointsAnimation }}</text>
        <text class="points-award-label">环保积分到账</text>
      </view>
    </view>

    <view v-if="syncError" class="sync-warning">
      <view class="warning-copy">
        <text class="warning-title">暂时无法同步投放反馈</text>
        <text class="warning-description">{{ syncError }}</text>
      </view>
      <button class="retry-button" :disabled="fetching" @click="refresh">重试</button>
    </view>

    <view v-if="latest" :key="latest.id" class="deposit-result" :class="categoryClass(latest.category)">
      <view class="result-main">
        <view class="result-copy">
          <text class="result-caption">最近一次投放</text>
          <text class="result-item">{{ latest.itemName || '分类投放' }}</text>
        </view>
        <text class="category-tag">{{ latest.category }}</text>
      </view>
      <view class="result-details">
        <text>{{ formatTime(latest.occurredAt) }}</text>
        <text>{{ latest.weightKg === null ? '未上报重量' : `${latest.weightKg} kg` }}</text>
        <text class="credit-text">{{ creditLabel(latest) }}</text>
      </view>
    </view>

    <view class="session-metrics">
      <view class="metric-cell">
        <text class="metric-value">{{ session ? session.summary.count : '—' }}<text class="metric-unit"> 次</text></text>
        <text class="metric-label">本次连接投放</text>
      </view>
      <view class="metric-cell points-metric">
        <text class="metric-value">{{ session ? session.summary.pointsAwarded : '—' }}<text class="metric-unit"> 分</text></text>
        <text class="metric-label">本次已到账积分</text>
      </view>
    </view>

    <view v-if="recent.length" class="recent-deposits" :class="{ expanded: historyExpanded }">
      <view class="recent-heading">
        <text class="recent-title">投放足迹</text>
        <button class="history-toggle" :aria-expanded="historyExpanded" @click="historyExpanded = !historyExpanded">{{ historyExpanded ? '收起' : '展开' }}</button>
        <button class="history-button" @click="goToHistory">查看记录 ›</button>
      </view>
      <view v-for="record in recent" :key="record.id" class="recent-row">
        <view class="record-dot" :class="categoryClass(record.category)"></view>
        <view class="record-copy">
          <text class="record-name">{{ record.itemName || record.category }}</text>
          <text class="record-time">{{ formatTime(record.occurredAt) }} · {{ record.category }}</text>
        </view>
        <text class="record-credit">{{ creditLabel(record) }}</text>
      </view>
    </view>
    <view class="feedback-footer">
      <text>{{ lastSyncedAt ? `上次同步 ${formatTime(lastSyncedAt)}` : '正在获取本次投放记录' }}</text>
      <text v-if="remainingSeconds !== null">{{ timeoutLabel }}</text>
    </view>
  </view>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { getDeviceSession } from '@/api/device.js'
import { subscribeDeviceSession } from '@/utils/device-session-stream.js'
import { reconcileDepositFeedback } from '@/utils/device-session-feedback.mjs'

const props = defineProps({
  deviceId: { type: [String, Number], required: true },
  active: { type: Boolean, default: true },
  dark: { type: Boolean, default: false }
})
const emit = defineEmits(['disconnected', 'sync-state'])
const session = ref(null)
const initialized = ref(false)
const historyExpanded = ref(false)
const fetching = ref(false)
const syncError = ref('')
const lastSyncedAt = ref(null)
const celebrating = ref(false)
const pointsAnimation = ref(0)
const pointsAnimationKey = ref(0)
const remainingSeconds = ref(null)
const latest = computed(() => session.value?.deposits?.[0] || null)
const recent = computed(() => session.value?.deposits?.slice(0, 3) || [])
const timeoutLabel = computed(() => {
  const seconds = remainingSeconds.value
  return seconds > 0
    ? `无新投放约 ${Math.ceil(seconds / 60)} 分钟后断开`
    : '正在确认连接状态'
})
const celebrationParticles = [
  { x: -104, y: -66, spin: -180, color: '#34d399', delay: .35 },
  { x: 98, y: -74, spin: 225, color: '#f6c64a', delay: .4 },
  { x: -130, y: 4, spin: -260, color: '#73a7f4', delay: .45 },
  { x: 126, y: 12, spin: 300, color: '#fb927c', delay: .35 },
  { x: -78, y: 65, spin: -320, color: '#f6c64a', delay: .5 },
  { x: 86, y: 62, spin: 180, color: '#34d399', delay: .45 },
  { x: -45, y: -95, spin: 240, color: '#a5dc63', delay: .4 },
  { x: 42, y: -90, spin: -200, color: '#bf9cf4', delay: .5 },
  { x: -116, y: -32, spin: 340, color: '#fb927c', delay: .65 },
  { x: 114, y: -38, spin: -300, color: '#73a7f4', delay: .6 },
  { x: -30, y: 85, spin: 180, color: '#34d399', delay: .6 },
  { x: 34, y: 82, spin: -260, color: '#f6c64a', delay: .65 }
]
const seen = new Map()
let pollTimer = null
let animationTimer = null
let generation = 0
let previousConnectionId = null
let unsubscribeStream = null
let transportOnline = false
let pushRefreshTimer = null
let refreshQueued = false

function requestSessionRefresh() {
  if (!props.active) return
  clearTimeout(pollTimer)
  if (fetching.value) {
    refreshQueued = true
    return
  }
  // Coalesce bursts without losing a change that arrives during an HTTP read.
  clearTimeout(pushRefreshTimer)
  pushRefreshTimer = setTimeout(refresh, 75)
}

function scheduleSessionCheck() {
  if (!props.active) return
  let delay = 3000
  if (transportOnline && !syncError.value && session.value) {
    // Keep a low-frequency reconciliation for missed events and multi-instance deployments.
    const untilExpiry = new Date(session.value.expiresAt).getTime() - Date.now() + 250
    delay = Math.max(3000, Math.min(60000, untilExpiry))
  }
  pollTimer = setTimeout(refresh, delay)
}

function formatTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间未知'
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
}

function categoryClass(category = '') {
  if (category.includes('回收')) return 'recyclable'
  if (category.includes('有害')) return 'hazardous'
  if (category.includes('厨余') || category.includes('湿垃圾')) return 'kitchen'
  return 'other'
}

function creditLabel(record) {
  if (record.pointsAwarded === null) return '积分待确认'
  return record.pointsAwarded > 0 ? `+${record.pointsAwarded} 积分` : '已记录'
}

function goToHistory() {
  uni.navigateTo({ url: props.dark ? '/pages-dark/history/history' : '/pages/history/history' })
}

async function refresh() {
  if (!props.active || !props.deviceId) return
  if (fetching.value) { refreshQueued = true; return }
  clearTimeout(pollTimer)
  clearTimeout(pushRefreshTimer)
  const currentGeneration = generation
  let disconnected = false
  fetching.value = true
  try {
    const response = await getDeviceSession(props.deviceId)
    if (generation !== currentGeneration) return
    if (response.code !== 0 || !response.data) throw new Error('服务暂不可用，请稍后重试')
    if (!response.data.connected) {
      disconnected = true
      emit('disconnected', response.data.reason === 'idle_timeout' ? '长时间无投放，连接已自动结束' : '设备连接已结束')
      return
    }
    const data = response.data
    if (previousConnectionId !== data.connectionId) {
      seen.clear()
      initialized.value = false
      previousConnectionId = data.connectionId
    }
    const feedback = reconcileDepositFeedback(seen, data.deposits, initialized.value)
    session.value = data
    syncError.value = ''
    lastSyncedAt.value = Date.now()
    remainingSeconds.value = Math.max(0, Math.ceil((new Date(data.expiresAt).getTime() - Date.now()) / 1000))
    initialized.value = true
    emit('sync-state', 'synced')
    if (feedback.newRecords.length || feedback.pointsDelta > 0) {
      clearTimeout(animationTimer)
      celebrating.value = false
      // Remount the animation elements when another record arrives.
      pointsAnimationKey.value += 1
      pointsAnimation.value = feedback.pointsDelta
      celebrating.value = true
      animationTimer = setTimeout(() => {
        celebrating.value = false
        pointsAnimation.value = 0
      }, 3200)
    }
  } catch (error) {
    if (generation !== currentGeneration) return
    syncError.value = lastSyncedAt.value ? '当前显示上次同步的记录，网络恢复后会自动更新。' : '请检查网络，稍后会自动重试。'
    remainingSeconds.value = null
    emit('sync-state', 'paused')
  } finally {
    if (generation === currentGeneration) {
      fetching.value = false
      if (!disconnected && props.active) {
        if (refreshQueued) {
          refreshQueued = false
          requestSessionRefresh()
        } else scheduleSessionCheck()
      }
    }
  }
}

watch(() => [props.active, props.deviceId], ([active], previous) => {
  generation += 1
  unsubscribeStream?.()
  unsubscribeStream = null
  transportOnline = false
  refreshQueued = false
  clearTimeout(pushRefreshTimer)
  clearTimeout(pollTimer)
  clearTimeout(animationTimer)
  fetching.value = false
  celebrating.value = false
  pointsAnimation.value = 0
  if (previous && previous[1] !== props.deviceId) {
    session.value = null
    lastSyncedAt.value = null
    previousConnectionId = null
    seen.clear()
    initialized.value = false
  }
  if (active && props.deviceId) {
    const subscriptionGeneration = generation
    unsubscribeStream = subscribeDeviceSession(props.deviceId, {
      onState: state => {
        if (generation !== subscriptionGeneration) return
        const wasOnline = transportOnline
        transportOnline = state === 'online'
        if (transportOnline !== wasOnline) requestSessionRefresh()
      },
      onChange: () => {
        if (generation === subscriptionGeneration) requestSessionRefresh()
      }
    })
    refresh()
  }
}, { immediate: true })

onUnmounted(() => {
  generation += 1
  unsubscribeStream?.()
  clearTimeout(pushRefreshTimer)
  clearTimeout(pollTimer)
  clearTimeout(animationTimer)
})
</script>

<style scoped>
.bin-session { --ink: #173c32; --muted: #768d85; --line: #e2eee8; --soft: #f3faf6; --surface: #fff; width: 100%; color: var(--ink); }
.bin-session.dark { --ink: #e6f6ef; --muted: #95b7a7; --line: #28483c; --soft: #18372b; --surface: #11291f; }
.feedback-heading, .sync-badge, .result-main, .result-details, .recent-heading, .recent-row, .feedback-footer { display: flex; align-items: center; }
.feedback-heading { justify-content: space-between; }
.feedback-label { font-size: 14px; font-weight: 700; }
.sync-badge { gap: 6px; padding: 5px 9px; border-radius: 20px; color: #11835e; background: var(--soft); font-size: 11px; }
.sync-dot { width: 6px; height: 6px; background: #20ad7a; border-radius: 50%; }
.sync-badge.warning { color: #c48b23; }
.sync-badge.warning .sync-dot { background: #c48b23; }
.feedback-stage { position: relative; display: flex; flex-direction: column; align-items: center; padding: 10px 0 22px; text-align: center; }
.bin-illustration { position: relative; width: 148px; height: 128px; display: flex; align-items: center; justify-content: center; }
.waiting-ring { position: absolute; border: 1px solid #bce8d1; border-radius: 50%; }
.ring-outer { width: 116px; height: 116px; animation: waiting-breathe 3.2s ease-in-out infinite; }
.ring-inner { width: 92px; height: 92px; background: var(--soft); }
.feedback-bin { z-index: 2; width: 74px; height: 74px; transform: translateY(-3px); }
.bin-ground { position: absolute; bottom: 15px; width: 66px; height: 8px; border-radius: 50%; background: rgba(17, 131, 94, .12); }
.feedback-title { margin-top: 2px; font-size: 22px; font-weight: 800; line-height: 1.4; }
.feedback-description { margin-top: 6px; font-size: 12px; color: var(--muted); line-height: 1.6; }
.device-hint { margin-top: 8px; font-size: 11px; color: var(--muted); }
.result-check { position: absolute; z-index: 3; right: 32px; bottom: 29px; width: 25px; height: 25px; display: flex; align-items: center; justify-content: center; border: 3px solid var(--surface); border-radius: 50%; background: #109368; color: white; font-size: 16px; font-weight: 700; }
.has-result .ring-outer { animation: none; }
.celebrating .feedback-stage { background: radial-gradient(ellipse at 50% 34%, rgba(92, 224, 157, .23), transparent 68%); }
.celebrating .ring-outer { animation: success-ripple 1.8s ease-out .35s both; }
.celebrating .feedback-bin { animation: bin-bounce 1.8s cubic-bezier(.22, .8, .3, 1) both; }
.celebrating .bin-ground { animation: ground-bounce 1.8s ease both; }
.celebrating .result-check { animation: check-pop 1.1s cubic-bezier(.2, .9, .3, 1.4) .3s both; }
.celebrating .feedback-title { animation: title-pop .8s ease .35s both; }
.celebrating .deposit-result { animation: result-celebrate 1.3s ease both; }
.celebrating .points-metric .metric-value { animation: metric-pop 1s ease .4s both; }
.arrival-item { position: absolute; z-index: 4; left: 53px; top: -12px; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; border: 2px solid #fff; border-radius: 12px; background: #bcf065; box-shadow: 0 8px 20px rgba(45, 145, 73, .24); color: #24783b; font-size: 32px; animation: record-arrival 1.3s cubic-bezier(.2, .7, .4, 1) both; }
.celebration-burst { position: absolute; inset: 0; z-index: 3; pointer-events: none; }
.burst-ring { position: absolute; top: 24px; left: 34px; width: 80px; height: 80px; border: 3px solid #53dca5; border-radius: 50%; animation: burst-expand 1.5s ease-out .4s both; }
.burst-ring-two { border-color: #f6ce61; animation-delay: .65s; }
.celebration-confetti { position: absolute; left: 70px; top: 62px; width: 9px; height: 14px; border-radius: 3px; opacity: 0; animation: confetti-burst 2.2s cubic-bezier(.15, .75, .3, 1) both; }
.points-flight { position: absolute; z-index: 5; top: 10px; right: 0; display: flex; flex-direction: column; align-items: center; padding: 12px 16px; border: 2px solid #e9b947; border-radius: 16px; background: #fff4c9; box-shadow: 0 8px 24px rgba(206, 156, 38, .22); color: #947018; animation: points-rise 3.2s cubic-bezier(.2, .9, .3, 1) both; pointer-events: none; }
.points-award { font-size: 32px; line-height: 1.05; font-weight: 900; }
.points-award-label { margin-top: 5px; font-size: 11px; font-weight: 700; }
.deposit-result { --category: #6d8692; padding: 16px; margin-bottom: 16px; border: 1px solid var(--line); border-left: 3px solid var(--category); border-radius: 12px; background: var(--soft); animation: result-enter .4s ease both; }
.recyclable { --category: #448fc9; }
.hazardous { --category: #de6868; }
.kitchen { --category: #35a270; }
.other { --category: #7d8790; }
.result-main { justify-content: space-between; gap: 12px; }
.result-copy { display: flex; flex-direction: column; min-width: 0; }
.result-caption { color: var(--muted); font-size: 10px; }
.result-item { margin-top: 5px; font-weight: 800; font-size: 17px; overflow-wrap: anywhere; }
.category-tag { flex-shrink: 0; border: 1px solid var(--category); color: var(--category); padding: 4px 8px; font-size: 11px; border-radius: 6px; }
.result-details { margin-top: 12px; flex-wrap: wrap; gap: 6px 12px; font-size: 11px; color: var(--muted); }
.credit-text { margin-left: auto; color: #19965f; font-weight: 700; }
.session-metrics { display: flex; padding: 16px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.metric-cell { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.points-metric { border-left: 1px solid var(--line); }
.metric-value { font-size: 25px; font-weight: 800; font-variant-numeric: tabular-nums; }
.metric-unit { font-size: 11px; font-weight: 500; color: var(--muted); }
.metric-label { color: var(--muted); font-size: 11px; }
.recent-deposits { margin-top: 18px; }
.recent-heading { justify-content: space-between; margin-bottom: 4px; }
.recent-title { font-size: 12px; font-weight: 700; }
.history-button { margin: 0; padding: 4px 0 4px 10px; background: transparent; color: var(--muted); font-size: 11px; line-height: 1.6; }
.history-toggle { display: none; }
.history-button::after, .history-toggle::after, .retry-button::after { border: none; }
.recent-row { gap: 10px; padding: 10px 0; }
.record-dot { width: 8px; height: 8px; background: var(--category); border-radius: 50%; flex-shrink: 0; }
.record-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.record-name { font-size: 12px; overflow-wrap: anywhere; }
.record-time { font-size: 10px; color: var(--muted); }
.record-credit { flex-shrink: 0; font-size: 11px; color: #19965f; }
.feedback-footer { margin-top: 14px; justify-content: space-between; flex-wrap: wrap; gap: 6px; font-size: 10px; color: var(--muted); }
.sync-warning { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; padding: 12px; border-radius: 8px; background: rgba(218, 159, 49, .1); }
.warning-copy { flex: 1; display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.warning-title { color: #b07b20; font-size: 12px; font-weight: 700; }
.warning-description { color: var(--muted); font-size: 11px; line-height: 1.6; }
.retry-button { margin: 0; padding: 5px 10px; background: var(--surface); color: #b07b20; font-size: 11px; line-height: 1.6; }
.paused .waiting-ring { animation-play-state: paused; }
@keyframes waiting-breathe { 0%, 100% { transform: scale(.94); opacity: .45; } 50% { transform: scale(1.08); opacity: 1; } }
@keyframes record-arrival { 0% { transform: translate(-64px, -26px) rotate(-35deg) scale(.3); opacity: 0; } 25% { transform: translate(-8px, -16px) rotate(12deg) scale(1.3); opacity: 1; } 45% { transform: translate(0, -6px) rotate(-8deg) scale(1); opacity: 1; } 75%, 100% { transform: translate(0, 57px) rotate(14deg) scale(.15); opacity: 0; } }
@keyframes bin-bounce { 0%, 100% { transform: translateY(-3px); } 18% { transform: translateY(9px) scale(1.18, .85) rotate(-7deg); } 38% { transform: translateY(-21px) scale(1.42, 1.48) rotate(7deg); } 56% { transform: translateY(6px) scale(1.22, 1.02) rotate(-5deg); } 73% { transform: translateY(-11px) scale(1.16) rotate(3deg); } 88% { transform: translateY(1px) scale(1.04, .96); } }
@keyframes ground-bounce { 0%, 100% { transform: scale(1); opacity: 1; } 38% { transform: scale(.75); opacity: .45; } 56% { transform: scale(1.35); opacity: 1; } }
@keyframes success-ripple { 0% { transform: scale(.75); opacity: 1; } 100% { transform: scale(1.9); opacity: 0; } }
@keyframes burst-expand { 0% { transform: scale(.45); opacity: .9; } 100% { transform: scale(2.5); opacity: 0; } }
@keyframes check-pop { 0%, 15% { transform: scale(0) rotate(-30deg); } 55% { transform: scale(1.65) rotate(12deg); } 78% { transform: scale(.9) rotate(-5deg); } 100% { transform: scale(1); } }
@keyframes confetti-burst { 0% { transform: translate(0, 0) rotate(0) scale(.2); opacity: 0; } 12% { opacity: 1; } 55% { transform: translate(var(--flight-x), var(--flight-y)) rotate(var(--spin)) scale(1); opacity: 1; } 100% { transform: translate(var(--flight-x), calc(var(--flight-y) + 42px)) rotate(var(--spin)) scale(.7); opacity: 0; } }
@keyframes points-rise { 0% { transform: translateY(28px) rotate(-10deg) scale(.35); opacity: 0; } 20% { transform: translateY(-7px) rotate(5deg) scale(1.17); opacity: 1; } 32%, 80% { transform: translateY(0) rotate(0) scale(1); opacity: 1; } 100% { transform: translateY(-24px) scale(.95); opacity: 0; } }
@keyframes title-pop { 0% { transform: scale(.92); } 55% { transform: scale(1.07); } 100% { transform: scale(1); } }
@keyframes result-celebrate { 0% { transform: translateY(10px) scale(.97); opacity: .5; } 40% { transform: translateY(-3px) scale(1.015); opacity: 1; box-shadow: 0 0 0 5px rgba(67, 198, 139, .15); } 100% { transform: translateY(0) scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(67, 198, 139, 0); } }
@keyframes metric-pop { 0%, 100% { transform: scale(1); } 45% { transform: scale(1.25); color: #19965f; } }
@keyframes result-enter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 420px) { .feedback-title { font-size: 20px; } .points-flight { right: -3px; padding: 10px 12px; } .points-award { font-size: 28px; } }
@media (prefers-reduced-motion: reduce) { .waiting-ring, .feedback-bin, .bin-ground, .result-check, .arrival-item, .burst-ring, .celebration-confetti, .points-flight, .feedback-title, .deposit-result, .metric-value { animation: none !important; } .arrival-item, .celebration-burst { display: none; } }

/* Keep results and actions within a compact phone screen; details stay expandable. */
@media (max-width: 780px) {
  .feedback-stage { padding: 6px 0 14px; }
  .feedback-title { font-size: 19px; line-height: 1.35; }
  .feedback-description { display: none; }
  .device-hint { margin-top: 4px; line-height: 1.5; }
  .deposit-result { padding: 12px; margin-bottom: 12px; }
  .result-caption { display: none; }
  .result-item { margin-top: 0; font-size: 16px; line-height: 1.4; }
  .result-details { margin-top: 8px; }
  .session-metrics { padding: 10px 0; }
  .metric-cell { gap: 3px; }
  .metric-value { font-size: 22px; line-height: 1.2; }
  .recent-deposits { margin-top: 10px; }
  .recent-heading { margin-bottom: 0; }
  .history-toggle { display: block; margin: 0 0 0 auto; padding: 4px 8px; background: transparent; color: var(--muted); font-size: 11px; line-height: 1.6; }
  .recent-row { display: none; }
  .recent-deposits.expanded .recent-row { display: flex; padding: 8px 0; }
  .feedback-footer { margin-top: 8px; }
  .sync-warning { margin-bottom: 12px; padding: 10px; }
}
</style>
