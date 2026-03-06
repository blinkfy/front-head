<template>
  <view :class="['theme-wrapper', currentTheme === 'light' ? 'light-theme' : '']">
  <view class="shell">
    <view class="panel hero">
      <view>
        <view class="hero-title">成就中心</view>
        <view class="hero-desc">以游戏成就面板方式展示你的环保里程碑。完成识别、提升积分、解锁稀有成就。</view>
      </view>
      <view class="actions">
        <button class="btn refresh" @click="refreshAchievements" :disabled="loading" type="button">刷新</button>
        <button class="btn back" @click="goBack" type="button">返回</button>
      </view>
    </view>

    <view class="panel summary">
      <view class="rank-panel">
        <view class="ring-wrap" :style="{ background: ringBackground }">
          <view class="ring-core">
            <view>
              <view class="rate">{{ summary.completionRate.toFixed(0) }}%</view>
              <view class="rate-sub">总体完成度</view>
            </view>
          </view>
        </view>
        <view class="rank-text">已解锁 {{ summary.unlockedCount }} / {{ summary.totalCount }}</view>
      </view>

      <view class="summary-cards">
        <view class="summary-card">
          <view class="k">已解锁成就</view>
          <view class="v">{{ summary.unlockedCount }}</view>
          <view class="s">{{ unlockedHint }}</view>
        </view>
        <view class="summary-card">
          <view class="k">总成就数</view>
          <view class="v">{{ summary.totalCount }}</view>
          <view class="s">系统定义</view>
        </view>
        <view class="summary-card">
          <view class="k">本次新解锁</view>
          <view class="v">{{ newUnlockCount }}</view>
          <view class="s">来自最新识别与同步</view>
        </view>
        <view class="summary-card">
          <view class="k">当前等级</view>
          <view class="v">{{ gradeText }}</view>
          <view class="s">更新时间：{{ updatedAtText }}</view>
        </view>
      </view>
    </view>

    <view class="panel latest">
      <view class="section-head">
        <view class="section-title">最新解锁</view>
        <view class="section-note">按解锁时间倒序</view>
      </view>
      <view class="latest-list">
        <template v-if="latestUnlocks.length > 0">
          <view class="latest-item" v-for="item in latestUnlocks" :key="item.key">
            <view class="latest-bullet"></view>
            <text>{{ item.name }}</text>
            <text>{{ formatDateTime(item.unlockedAt) }}</text>
          </view>
        </template>
        <template v-else>
          <view class="state" style="grid-column:1/-1;">还没有解锁记录，先完成一次识别吧。</view>
        </template>
      </view>
    </view>

    <view class="panel gallery">
      <view class="section-head">
        <view class="section-title">成就图鉴</view>
        <view class="section-note">支持按状态筛选</view>
      </view>
      <view class="filters">
        <button class="filter-chip" :class="{ active: filter === 'all' }" @click="filter = 'all'" type="button">全部 ({{ achievements.length }})</button>
        <button class="filter-chip" :class="{ active: filter === 'unlocked' }" @click="filter = 'unlocked'" type="button">已解锁 ({{ unlockedAmount }})</button>
        <button class="filter-chip" :class="{ active: filter === 'locked' }" @click="filter = 'locked'" type="button">未解锁 ({{ achievements.length - unlockedAmount }})</button>
      </view>
      
      <view class="achievement-grid" v-if="filteredAchievements.length > 0">
        <view v-for="(item, index) in filteredAchievements" :key="item.key" 
          class="achievement-card" 
          :class="[`rarity-${getRarityByKey(item.key).tier}`, item.unlocked ? '' : 'locked']"
          :style="{ animationDelay: `${Math.min(index * 40, 320)}ms` }">
          <view class="card-top">
            <view class="icon-wrap">
              <achievement-icon :icon-key="item.key" />
            </view>
            <view class="badge-set">
              <view class="badge" :class="`rarity-${getRarityByKey(item.key).tier}`">{{ getRarityByKey(item.key).label }}</view>
              <view class="badge" :class="item.unlocked ? 'status-unlocked' : 'status-locked'">{{ item.unlocked ? '已解锁' : '未解锁' }}</view>
            </view>
          </view>
          <view class="card-name">{{ item.name }}</view>
          <view class="card-desc">{{ item.description }}</view>
          <view class="progress-track">
            <view class="progress-fill" :style="{ width: `${getPercentage(item)}%` }"></view>
          </view>
          <view class="card-meta">
            <text>{{ item.unlocked ? `解锁时间：${formatDateTime(item.unlockedAt)}` : `进度：${getProgressValue(item)}/${getTargetValue(item)}${item.unit || ''}` }}</text>
            <text>{{ getPercentage(item) }}%</text>
          </view>
        </view>
      </view>
      <view class="state" v-else-if="stateMessage">{{ stateMessage }}</view>
      <view class="state" v-else>当前筛选条件下没有可展示的成就。</view>
    </view>
  </view>

  <view class="modal-mask" :class="{ show: showModal }" @click.self="showModal = false">
    <view class="modal">
      <view class="modal-head">
        <view class="modal-title">新成就解锁</view>
      </view>
      <view class="modal-body">
        <view class="unlock-item" v-for="item in popupUnlocks" :key="item.key">
          <view class="unlock-icon">
            <achievement-icon :icon-key="item.key" />
          </view>
          <view>
            <view class="unlock-title">{{ item.name }}</view>
            <view class="unlock-desc">{{ item.description || '你已达成一个新的里程碑。' }}</view>
            <view class="unlock-desc">解锁时间：{{ formatDateTime(item.unlockedAt) }}</view>
          </view>
        </view>
      </view>
      <view class="modal-foot">
        <button class="close-btn" @click="showModal = false" type="button">知道了</button>
      </view>
    </view>
  </view>
  </view>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, computed, reactive } from 'vue'
import { applyStoredTheme, bindThemeStorageSync } from '@/utils/theme'
import { baseUrl } from '@/api/settings'
import AchievementIcon from '@/components/AchievementIcon.vue'

let unbindThemeWatcher = null

const QUEUE_KEY = 'achievement_unlock_queue_v1'

const loading = ref(false)
const filter = ref('all')
const achievements = ref([])
const summary = reactive({ unlockedCount: 0, totalCount: 0, completionRate: 0 })
const popupUnlocks = ref([])
const newUnlockCount = ref(0)
const updatedAtText = ref('--')
const showModal = ref(false)
const stateMessage = ref('')
const currentTheme = ref('light')

const RARITY_MAP = {
  first_sort: { tier: 'common', label: '普通' },
  online_novice: { tier: 'rare', label: '稀有' },
  device_novice: { tier: 'rare', label: '稀有' },
  category_collector: { tier: 'epic', label: '史诗' },
  streak_3_days: { tier: 'epic', label: '史诗' },
  points_100: { tier: 'legendary', label: '传说' }
}

function getStorage(key) {
  const result = uni.getStorageSync(key)
  return result || null
}

function removeStorage(key) {
  uni.removeStorageSync(key)
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text)
  } catch (_) {
    return null
  }
}

function toNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function formatDateTime(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return '--'
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function normalizeUnlockItem(item) {
  if (!item || typeof item !== 'object') return null
  const key = String(item.key || '').trim()
  if (!key) return null
  return {
    key,
    name: String(item.name || '').trim() || key,
    description: String(item.description || '').trim(),
    unlockedAt: item.unlockedAt || null
  }
}

function dedupeUnlocks(items) {
  const map = new Map()
  const list = Array.isArray(items) ? items : []
  for (let i = 0; i < list.length; i += 1) {
    const normalized = normalizeUnlockItem(list[i])
    if (!normalized) continue
    if (!map.has(normalized.key)) {
      map.set(normalized.key, normalized)
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const ta = new Date(a.unlockedAt || 0).getTime()
    const tb = new Date(b.unlockedAt || 0).getTime()
    return tb - ta
  })
}

function readUnlockQueue() {
  const raw = getStorage(QUEUE_KEY) || ''
  const parsed = safeJsonParse(raw)
  return dedupeUnlocks(Array.isArray(parsed) ? parsed : [])
}

function clearUnlockQueue() {
  try {
    removeStorage(QUEUE_KEY)
  } catch (_) {}
}

const ringBackground = computed(() => {
  const value = Math.max(0, Math.min(100, toNumber(summary.completionRate, 0)))
  const angle = (value / 100) * 360
  return `conic-gradient(var(--accent) ${angle}deg, rgba(124, 165, 205, 0.24) ${angle}deg)`
})

const gradeText = computed(() => {
  const v = Math.max(0, Math.min(100, toNumber(summary.completionRate, 0)))
  if (v >= 95) return 'S'
  if (v >= 80) return 'A'
  if (v >= 60) return 'B'
  if (v >= 40) return 'C'
  return 'D'
})

const unlockedHint = computed(() => {
  return summary.unlockedCount === summary.totalCount && summary.totalCount > 0 ? '全部成就已达成' : '本次会话累计'
})

const unlockedAmount = computed(() => {
  return achievements.value.filter(item => !!item.unlocked).length
})

const latestUnlocks = computed(() => {
  const unlockedFromApi = achievements.value
    .filter((item) => item && item.unlocked)
    .sort((a, b) => new Date(b.unlockedAt || 0).getTime() - new Date(a.unlockedAt || 0).getTime())
    .slice(0, 6)
    .map((item) => ({
      key: item.key,
      name: item.name,
      description: item.description,
      unlockedAt: item.unlockedAt
    }))

  return dedupeUnlocks([...(popupUnlocks.value || []), ...unlockedFromApi]).slice(0, 6)
})

function getProgressRatio(item) {
  const target = Math.max(1, toNumber(item && item.target, 1))
  const progress = Math.max(0, toNumber(item && item.progressRaw, 0))
  return Math.min(progress / target, 1)
}

function getRarityByKey(key) {
  return RARITY_MAP[key] || { tier: 'common', label: '普通' }
}

function getTargetValue(item) {
  return Math.max(1, toNumber(item.target, 1))
}

function getProgressValue(item) {
  const rawProgress = Math.max(0, toNumber(item.progressRaw, 0))
  return Math.min(rawProgress, getTargetValue(item))
}

function getPercentage(item) {
  const target = getTargetValue(item)
  const progress = getProgressValue(item)
  const ratio = Math.max(0, Math.min(progress / target, 1))
  return Math.round(ratio * 100)
}

const filteredAchievements = computed(() => {
  let list = achievements.value.slice().sort((a, b) => {
    const aUnlocked = !!a.unlocked
    const bUnlocked = !!b.unlocked
    if (aUnlocked !== bUnlocked) return aUnlocked ? -1 : 1

    if (aUnlocked && bUnlocked) {
      const ta = new Date(a.unlockedAt || 0).getTime()
      const tb = new Date(b.unlockedAt || 0).getTime()
      return tb - ta
    }

    const ra = getProgressRatio(a)
    const rb = getProgressRatio(b)
    if (rb !== ra) return rb - ra
    return toNumber(b.progressRaw, 0) - toNumber(a.progressRaw, 0)
  })

  if (filter.value === 'unlocked') return list.filter((item) => !!item.unlocked)
  if (filter.value === 'locked') return list.filter((item) => !item.unlocked)
  return list
})

async function fetchAchievements() {
  const token = getStorage('token') || ''
  if (!token) {
    throw new Error('未登录，请先登录后查看成就。')
  }

  return new Promise((resolve, reject) => {
    uni.request({
      url: `${baseUrl}/api/achievements`,
      method: 'GET',
      header: {
        Authorization: token
      },
      success: (res) => {
        if (res.statusCode !== 200) {
          const p = res.data
          reject(new Error((p && p.msg) || `请求失败（HTTP ${res.statusCode}）`))
          return
        }
        const payload = res.data
        if (!payload || payload.code !== 0 || !payload.data) {
          reject(new Error((payload && payload.msg) || '请求数据异常'))
          return
        }
        resolve(payload.data)
      },
      fail: (err) => {
        reject(new Error('网络请求失败'))
      }
    })
  })
}

async function refreshAchievements() {
  if (loading.value) return
  loading.value = true
  updatedAtText.value = '加载中...'
  stateMessage.value = ''

  try {
    const data = await fetchAchievements()
    achievements.value = Array.isArray(data.achievements) ? data.achievements : []
    
    const sum = data.summary || { unlockedCount: 0, totalCount: 0, completionRate: 0 }
    summary.unlockedCount = Math.max(0, Math.round(toNumber(sum.unlockedCount, 0)))
    summary.totalCount = Math.max(0, Math.round(toNumber(sum.totalCount, 0)))
    summary.completionRate = toNumber(sum.completionRate, 0)

    const apiNewlyUnlocked = dedupeUnlocks(Array.isArray(data.newlyUnlocked) ? data.newlyUnlocked : [])
    const queuedUnlocks = readUnlockQueue()

    popupUnlocks.value = dedupeUnlocks([...queuedUnlocks, ...apiNewlyUnlocked])
    newUnlockCount.value = Math.max(0, popupUnlocks.value.length)

    updatedAtText.value = formatDateTime(new Date().toISOString())

    if (popupUnlocks.value.length > 0) {
      showModal.value = true
    }
    clearUnlockQueue()
  } catch (error) {
    console.error('[achievements] load failed:', error)
    achievements.value = []
    summary.unlockedCount = 0
    summary.totalCount = 0
    summary.completionRate = 0
    popupUnlocks.value = []
    newUnlockCount.value = 0
    stateMessage.value = error && error.message ? error.message : '加载成就失败。'
    updatedAtText.value = '--'
  } finally {
    loading.value = false
  }
}

function goBack() {
  const pages = getCurrentPages();
  if (pages.length > 1) {
    uni.navigateBack();
  } else {
    uni.reLaunch({ url: '/pages/home/home' });
  }
}

onMounted(() => {
  currentTheme.value = applyStoredTheme()
  unbindThemeWatcher = bindThemeStorageSync()
  refreshAchievements()
})

onBeforeUnmount(() => {
  if (unbindThemeWatcher) {
    unbindThemeWatcher()
  }
})

</script>
<style>
/* ─── 深色主题（默认） ─── */
.theme-wrapper {
  --bg-1: #071a2d;
  --bg-2: #0e2a43;
  --bg-3: #142f52;
  --panel: rgba(18, 33, 54, 0.82);
  --panel-soft: rgba(20, 41, 65, 0.68);
  --line: rgba(126, 174, 221, 0.24);
  --text: #e8f3ff;
  --muted: #9fbbd7;
  --accent: #3ad9a4;
  --accent-2: #5e96ff;
  --gold: #f5c768;
  --danger: #ee7b84;
  --shadow: 0 24px 56px rgba(2, 8, 16, 0.48);
  --font-main: "Source Han Sans SC", "Microsoft YaHei", sans-serif;
  --font-num: "Rajdhani", "DIN Alternate", "Segoe UI", sans-serif;
}

/* ─── 浅色主题 ─── */
.theme-wrapper.light-theme {
  --bg-1: #f2f9ff;
  --bg-2: #e8f3ff;
  --bg-3: #e5fbf2;
  --panel: rgba(255, 255, 255, 0.86);
  --panel-soft: rgba(255, 255, 255, 0.72);
  --line: rgba(126, 164, 211, 0.34);
  --text: #11243b;
  --muted: #5e7b98;
  --accent: #18ba84;
  --accent-2: #3977f1;
  --gold: #eab543;
  --danger: #dd5a62;
  --shadow: 0 20px 44px rgba(29, 62, 98, 0.2);
}

/* #ifdef H5 */
* {
  box-sizing: border-box;
}
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(94, 150, 255, 0.4);
  border-radius: 4px;
  transition: background 0.3s ease;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(80, 130, 180, 0.7);
}
/* #endif */

/* #ifndef H5 */
page, view, text, scroll-view, swiper, button, form, input, textarea, label, navigator, image, div, span, p, h1, h2, h3, h4, h5, h6, ul, li, article, section, nav, main, header, footer {
  box-sizing: border-box;
}
/* #endif */

/* ─── SVG 图标样式 ─── */
.icon-wrap svg {
  width: 100%;
  height: 100%;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.achievement-card.locked .icon-wrap svg {
  opacity: 0.3;
}

.theme-wrapper {
  margin: 0;
  height: 100vh;
  overflow: auto;
  color: var(--text);
  font-family: var(--font-main);
  background:
    radial-gradient(900px 520px at 104% -12%, rgba(94, 150, 255, 0.26), transparent 62%),
    radial-gradient(800px 420px at -18% 20%, rgba(58, 217, 164, 0.16), transparent 56%),
    linear-gradient(160deg, var(--bg-1), var(--bg-2) 52%, var(--bg-3));
  padding: 18px;
  padding-bottom: calc(18px + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

.shell {
  width: min(1260px, 100%);
  margin: 0 auto;
  display: grid;
  gap: 14px;
}

.panel {
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--panel);
  box-shadow: var(--shadow);
  backdrop-filter: blur(8px);
}

.hero {
  padding: 16px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: center;
  position: relative;
  overflow: hidden;
}

.hero::before {
  content: '';
  position: absolute;
  right: -120px;
  top: -140px;
  width: 320px;
  height: 320px;
  border-radius: 50%;
  background: radial-gradient(circle at center, rgba(58, 217, 164, 0.24), transparent 68%);
  pointer-events: none;
}

.hero h1, .hero-title {
  margin: 0;
  font-size: 32px;
  font-weight: 550;
  letter-spacing: 1px;
  text-shadow: 0 4px 12px rgba(35, 71, 112, 0.34);
}

.hero p, .hero-desc {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
  max-width: 760px;
}

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.btn {
  border: 0;
  border-radius: 10px;
  padding: 9px 13px;
  font-size: 13px;
  cursor: pointer;
  color: #fff;
  white-space: nowrap;
  transition: transform .16s ease;
}

.btn:hover {
  transform: translateY(-1px);
}

.btn.refresh {
  background: linear-gradient(135deg, #1bbf87, #39dfa7);
  box-shadow: 0 10px 20px rgba(29, 189, 134, 0.28);
}

.btn.back {
  background: linear-gradient(135deg, #3b7cf6, #6ea4ff);
  box-shadow: 0 10px 20px rgba(59, 124, 246, 0.26);
}

.summary {
  padding: 14px;
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 12px;
}

.rank-panel {
  border: 1px solid var(--line);
  border-radius: 14px;
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02));
  padding: 12px;
  display: grid;
  justify-items: center;
  gap: 10px;
  position: relative;
  overflow: hidden;
}

.rank-panel::after {
  content: '';
  position: absolute;
  inset: auto -40px -48px auto;
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background: radial-gradient(circle at center, rgba(245, 199, 104, 0.22), transparent 70%);
  pointer-events: none;
}

.ring-wrap {
  width: 188px;
  height: 188px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: conic-gradient(var(--accent) 0deg, rgba(124, 165, 205, 0.24) 0deg);
  transition: background .3s ease;
  box-shadow: inset 0 0 24px rgba(18, 44, 72, 0.24);
}

.ring-core {
  width: 140px;
  height: 140px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  border: 1px solid var(--line);
  background: var(--panel-soft);
  text-align: center;
  z-index: 1;
}

.rate {
  font-family: var(--font-num);
  font-size: 38px;
  line-height: 1;
  font-weight: 700;
}

.rate-sub {
  margin-top: 6px;
  font-size: 12px;
  color: var(--muted);
  letter-spacing: .4px;
}

.rank-text {
  font-size: 13px;
  color: var(--muted);
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  align-content: center;
}

.summary-card {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03));
}

.summary-card .k {
  font-size: 12px;
  color: var(--muted);
}

.summary-card .v {
  margin-top: 8px;
  font-size: 30px;
  line-height: 1;
  font-family: var(--font-num);
  font-weight: 700;
}

.summary-card .s {
  margin-top: 6px;
  font-size: 12px;
  color: var(--muted);
}

.latest,
.gallery {
  padding: 14px;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.section-head h2, .section-title {
  margin: 0;
  font-size: 18px;
  letter-spacing: .4px;
}

.section-note {
  color: var(--muted);
  font-size: 12px;
}

.latest-list {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
}

.latest-item {
  border-radius: 12px;
  border: 1px solid rgba(245, 199, 104, 0.4);
  background: linear-gradient(135deg, rgba(245, 199, 104, 0.18), rgba(245, 199, 104, 0.08));
  padding: 10px 12px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: center;
  font-size: 12px;
}

.latest-bullet {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--gold);
  box-shadow: 0 0 0 3px rgba(245, 199, 104, 0.2);
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
  position: sticky;
  top: 0;
  z-index: 4;
  background: linear-gradient(180deg, var(--panel), rgba(0, 0, 0, 0));
  padding: 2px 0 6px;
}

.filter-chip {
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 7px 12px;
  font-size: 12px;
  cursor: pointer;
  color: var(--muted);
  background: rgba(255, 255, 255, 0.06);
  transition: all .18s ease;
}

.filter-chip.active {
  color: #fff;
  background: linear-gradient(135deg, #2e78f2, #5f97ff);
  border-color: rgba(109, 157, 255, 0.72);
  box-shadow: 0 10px 18px rgba(47, 111, 237, 0.26);
}

.achievement-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.achievement-card {
  border-radius: 14px;
  border: 1px solid var(--line);
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03));
  padding: 12px;
  display: grid;
  gap: 10px;
  position: relative;
  overflow: hidden;
  animation: cardIn .34s ease both;
}

.achievement-card::before {
  content: '';
  position: absolute;
  left: -30%;
  top: -120%;
  width: 160%;
  height: 240%;
  background: linear-gradient(130deg, transparent 36%, rgba(255, 255, 255, 0.12) 52%, transparent 68%);
  transform: translateX(-120%);
  transition: transform .8s ease;
  pointer-events: none;
}

.achievement-card:hover::before {
  transform: translateX(120%);
}

.achievement-card.locked {
  opacity: .82;
  filter: saturate(.7);
}

.achievement-card.rarity-common {
  box-shadow: inset 0 0 0 1px rgba(152, 185, 218, 0.12);
}

.achievement-card.rarity-rare {
  box-shadow: inset 0 0 0 1px rgba(99, 141, 255, 0.28), 0 8px 22px rgba(55, 96, 210, 0.2);
}

.achievement-card.rarity-epic {
  box-shadow: inset 0 0 0 1px rgba(193, 107, 255, 0.32), 0 10px 24px rgba(117, 67, 176, 0.24);
}

.achievement-card.rarity-legendary {
  box-shadow: inset 0 0 0 1px rgba(245, 199, 104, 0.38), 0 12px 28px rgba(170, 112, 10, 0.24);
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}

.icon-wrap {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line);
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.04));
  box-shadow: inset 0 0 22px rgba(66, 114, 161, 0.2);
  color: #b8d6ff;
}

.icon-wrap :deep(.icon-img),
.icon-wrap :deep(.icon-wrap-h5) {
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
}

.icon-wrap svg {
  width: 30px;
  height: 30px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.badge-set {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.badge {
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  border: 1px solid var(--line);
  color: var(--muted);
  background: rgba(255, 255, 255, 0.06);
  letter-spacing: .3px;
}

.badge.status-unlocked {
  color: #9bf1cf;
  border-color: rgba(58, 217, 164, 0.4);
  background: rgba(58, 217, 164, 0.15);
}

.badge.status-locked {
  color: #d7e7f8;
  border-color: rgba(173, 197, 220, 0.3);
  background: rgba(173, 197, 220, 0.1);
}

.badge.rarity-common {
  color: #b8d3ee;
}

.badge.rarity-rare {
  color: #8eb5ff;
  border-color: rgba(99, 141, 255, 0.38);
}

.badge.rarity-epic {
  color: #d4a8ff;
  border-color: rgba(193, 107, 255, 0.4);
}

.badge.rarity-legendary {
  color: #ffd88c;
  border-color: rgba(245, 199, 104, 0.42);
}

.card-name {
  margin: 0;
  font-size: 16px;
  letter-spacing: .3px;
}

.card-desc {
  margin: 0;
  min-height: 38px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}

.progress-track {
  height: 8px;
  border-radius: 999px;
  background: rgba(126, 166, 203, 0.2);
  overflow: hidden;
  position: relative;
}

.progress-fill {
  height: 100%;
  width: 0;
  border-radius: 999px;
  transition: width .4s ease;
  background: linear-gradient(90deg, #2ecf9a, #42e2bf);
  position: relative;
  overflow: hidden;
}

.progress-fill::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, transparent 10%, rgba(255, 255, 255, 0.4) 44%, transparent 78%);
  transform: translateX(-120%);
  animation: shimmer 2.3s linear infinite;
}

.card-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: var(--muted);
  font-size: 12px;
}

.state {
  border: 1px dashed var(--line);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  color: var(--muted);
  background: rgba(255, 255, 255, 0.05);
}

.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: none;
  align-items: center;
  justify-content: center;
  background: rgba(4, 9, 16, 0.64);
  padding: 16px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
}

.modal-mask.show {
  display: flex;
}

.modal {
  width: min(560px, 100%);
  border-radius: 16px;
  border: 1px solid rgba(245, 199, 104, 0.42);
  background: var(--panel);
  overflow: hidden;
  box-shadow: var(--shadow);
  animation: popup .24s ease;
  max-height: 100%;
  display: flex;
  flex-direction: column;
}

.modal-head {
  padding: 14px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid var(--line);
  background: linear-gradient(135deg, rgba(245, 199, 104, 0.26), rgba(245, 199, 104, 0.08));
}

.modal-head h3, .modal-title {
  margin: 0;
  font-size: 18px;
  color: var(--gold);
}

.modal-.theme-wrapper {
  padding: 14px 16px;
  display: grid;
  gap: 8px;
  max-height: 360px;
  overflow: auto;
  min-height: 0;
}

.unlock-item {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.06);
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  align-items: center;
}

.unlock-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  border: 1px solid var(--line);
  display: grid;
  place-items: center;
  color: #ffd88c;
  background: rgba(245, 199, 104, 0.14);
}

.unlock-icon :deep(.icon-img),
.unlock-icon :deep(.icon-wrap-h5) {
  width: 20px;
  height: 20px;
  flex: 0 0 20px;
}

.unlock-icon svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.unlock-title {
  margin: 0;
  font-size: 15px;
  color: var(--text);
}

.unlock-desc {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.45;
}

.modal-foot {
  border-top: 1px solid var(--line);
  padding: 12px 16px;
  display: flex;
  justify-content: flex-end;
}

.close-btn {
  border: 0;
  border-radius: 10px;
  padding: 8px 14px;
  color: #fff;
  cursor: pointer;
  background: linear-gradient(135deg, #3b7cf6, #6ea4ff);
}

@keyframes shimmer {
  from {
    transform: translateX(-120%);
  }

  to {
    transform: translateX(120%);
  }
}

@keyframes popup {
  from {
    transform: translateY(10px) scale(.98);
    opacity: .6;
  }

  to {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}

@keyframes cardIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 1040px) {
  .summary {
    grid-template-columns: 1fr;
  }

  .summary-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .achievement-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 700px) {
  .theme-wrapper {
    padding: 10px;
    padding-bottom: calc(10px + env(safe-area-inset-bottom));
  }

  .hero {
    grid-template-columns: 1fr;
    padding: 12px;
  }

  .actions {
    justify-content: flex-start;
    width: 100%;
  }

  .actions .btn {
    flex: 1 1 calc(50% - 4px);
    min-height: 40px;
  }

  .hero h1 {
    font-size: 26px;
  }

  .summary-cards {
    grid-template-columns: 1fr;
  }

  .achievement-grid {
    grid-template-columns: 1fr;
  }

  .ring-wrap {
    width: 162px;
    height: 162px;
  }

  .ring-core {
    width: 124px;
    height: 124px;
  }
}

@media (max-width: 520px) {

  .summary,
  .latest,
  .gallery {
    padding: 10px;
  }

  .section-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .filters {
    gap: 6px;
    margin-bottom: 8px;
  }

  .filter-chip {
    padding: 7px 10px;
    font-size: 11px;
  }

  .card-desc {
    min-height: 0;
  }

  .modal-mask {
    padding: 10px;
    padding-bottom: calc(10px + env(safe-area-inset-bottom));
  }

  .modal-head,
  .modal-body,
  .modal-foot {
    padding-left: 12px;
    padding-right: 12px;
  }

  .modal-.theme-wrapper {
    max-height: 58vh;
  }
}
.legacy-page-host {
  min-height: 100vh;
}
</style>
