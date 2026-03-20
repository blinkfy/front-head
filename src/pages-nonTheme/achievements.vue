<template>
  <view :class="['theme-wrapper', currentTheme === 'light' ? 'light-theme' : '']">
    <!-- 动态科技背景 -->
    <view class="tech-background">
      <view class="grid-overlay"></view>
      <view class="floating-particles">
        <view class="particle" v-for="n in 12" :key="n" :style="{ animationDelay: (n * 0.4) + 's' }"></view>
      </view>
      <view class="glow-orbs">
        <view class="orb orb-1"></view>
        <view class="orb orb-2"></view>
        <view class="orb orb-3"></view>
      </view>
    </view>

    <!-- 顶部导航栏 -->
    <view class="navbar">
      <view class="safe-area-top"></view>
      <view class="nav-content">
        <view class="nav-left">
          <text class="back-btn" @click="goBack">←</text>
        </view>
        <view class="nav-title-wrap">
          <text class="nav-title">成就中心</text>
          <text class="nav-subtitle">完成挑战，解锁荣耀</text>
        </view>
        <view class="nav-right">
          <text class="refresh-btn" :class="{ rotating: loading }" @click="refreshAchievements">↻</text>
        </view>
      </view>
    </view>

    <!-- 主内容区 -->
    <view class="main-content">
      <!-- 成就统计面板 -->
      <view class="panel stats-panel">
        <view class="stats-left">
          <!-- 炫酷仪表盘 -->
          <view class="gauge-container">
            <view class="gauge-ring" :style="{ '--progress': summary.completionRate }">
              <view class="gauge-bg"></view>
              <view class="gauge-progress"></view>
              <view class="gauge-glow"></view>
            </view>
            <view class="gauge-center">
              <text class="gauge-value">{{ summary.completionRate.toFixed(0) }}</text>
              <text class="gauge-unit">%</text>
              <text class="gauge-label">完成度</text>
            </view>
          </view>
          <!-- 等级徽章 -->
          <view class="grade-badge" :class="'grade-' + gradeText.toLowerCase()">
            <text class="grade-letter">{{ gradeText }}</text>
            <text class="grade-label">段位</text>
          </view>
        </view>
        <view class="stats-right">
          <view class="stat-item">
            <view class="stat-icon stat-icon-unlock">✓</view>
            <view class="stat-info">
              <text class="stat-value">{{ summary.unlockedCount }}</text>
              <text class="stat-label">已解锁</text>
            </view>
          </view>
          <view class="stat-item">
            <view class="stat-icon stat-icon-total">★</view>
            <view class="stat-info">
              <text class="stat-value">{{ summary.totalCount }}</text>
              <text class="stat-label">总成就</text>
            </view>
          </view>
          <view class="stat-item">
            <view class="stat-icon stat-icon-new">✦</view>
            <view class="stat-info">
              <text class="stat-value">{{ newUnlockCount }}</text>
              <text class="stat-label">新解锁</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 最新解锁 -->
      <view class="panel latest-panel">
        <view class="panel-header">
          <view class="panel-title-row">
            <view class="title-icon">🏆</view>
            <text class="panel-title">最新成就</text>
          </view>
          <text class="panel-subtitle">按解锁时间倒序</text>
        </view>
        <view class="latest-list" v-if="latestUnlocks.length > 0">
          <view class="latest-item" v-for="(item, index) in latestUnlocks" :key="item.key" :style="{ animationDelay: `${index * 80}ms` }">
            <view class="timeline-dot"></view>
            <view class="timeline-line" v-if="index < latestUnlocks.length - 1"></view>
            <view class="latest-content">
              <text class="latest-name">{{ item.name }}</text>
              <text class="latest-time">{{ formatDateTime(item.unlockedAt) }}</text>
            </view>
          </view>
        </view>
        <view class="empty-latest" v-else>
          <text class="empty-icon">🎯</text>
          <text class="empty-text">还没有解锁记录，先完成一次识别吧</text>
        </view>
      </view>

      <!-- 成就图鉴 -->
      <view class="panel gallery-panel">
        <view class="panel-header">
          <view class="panel-title-row">
            <view class="title-icon">📜</view>
            <text class="panel-title">成就图鉴</text>
          </view>
          <text class="panel-subtitle">共 {{ achievements.length }} 项成就</text>
        </view>

        <!-- 筛选标签 -->
        <view class="filter-tabs">
          <view class="filter-tab" :class="{ active: filter === 'all' }" @click="filter = 'all'">
            <text>全部</text>
            <view class="tab-count">{{ achievements.length }}</view>
          </view>
          <view class="filter-tab" :class="{ active: filter === 'unlocked' }" @click="filter = 'unlocked'">
            <text>已解锁</text>
            <view class="tab-count">{{ unlockedAmount }}</view>
          </view>
          <view class="filter-tab" :class="{ active: filter === 'locked' }" @click="filter = 'locked'">
            <text>未解锁</text>
            <view class="tab-count">{{ achievements.length - unlockedAmount }}</view>
          </view>
        </view>

        <!-- 成就网格 -->
        <view class="achievement-grid" v-if="filteredAchievements.length > 0">
          <view v-for="(item, index) in filteredAchievements" :key="item.key"
            class="achievement-card"
            :class="[
              `rarity-${getRarityByKey(item.key).tier}`,
              item.unlocked ? 'unlocked' : 'locked',
              `animate-${index % 4}`
            ]"
            :style="{ animationDelay: `${Math.min(index * 50, 300)}ms` }">
            <!-- 卡顶部光效 -->
            <view class="card-glare"></view>

            <!-- 图标区域 -->
            <view class="card-icon-wrap">
              <view class="icon-bg" :class="item.unlocked ? 'unlocked' : 'locked'">
                <achievement-icon :icon-key="item.key" />
              </view>
              <!-- 稀有度角标 -->
              <view class="rarity-badge" :class="getRarityByKey(item.key).tier">
                {{ getRarityByKey(item.key).label }}
              </view>
              <!-- 解锁状态 -->
              <view class="status-badge" :class="item.unlocked ? 'unlocked' : 'locked'">
                {{ item.unlocked ? '已解锁' : '未解锁' }}
              </view>
            </view>

            <!-- 成就信息 -->
            <view class="card-info">
              <text class="card-name">{{ item.name }}</text>
              <text class="card-desc">{{ item.description }}</text>
            </view>

            <!-- 进度条 -->
            <view class="card-progress">
              <view class="progress-track">
                <view class="progress-fill"
                  :class="{ 'completed': getPercentage(item) >= 100 }"
                  :style="{ width: `${getPercentage(item)}%` }">
                  <view class="progress-shine"></view>
                </view>
              </view>
              <view class="progress-text">
                <text v-if="item.unlocked">已解锁 · {{ formatDateTime(item.unlockedAt) }}</text>
                <text v-else>进度 {{ getProgressValue(item) }}/{{ getTargetValue(item) }}{{ item.unit || '' }}</text>
                <text class="progress-percent">{{ getPercentage(item) }}%</text>
              </view>
            </view>
          </view>
        </view>

        <view class="empty-gallery" v-else>
          <text class="empty-icon">🔍</text>
          <text class="empty-text">当前筛选条件下没有可展示的成就</text>
        </view>
      </view>
    </view>

    <!-- 新成就解锁弹窗 -->
    <view class="modal-mask" :class="{ show: showModal }" @click.self="showModal = false">
      <view class="unlock-modal" v-if="popupUnlocks.length > 0">
        <!-- 闪光背景 -->
        <view class="modal-bg-effect">
          <view class="effect-orb effect-orb-1"></view>
          <view class="effect-orb effect-orb-2"></view>
          <view class="effect-orb effect-orb-3"></view>
        </view>

        <!-- 标题 -->
        <view class="modal-header">
          <view class="trophy-icon">🏆</view>
          <text class="modal-title">新成就解锁!</text>
          <text class="modal-subtitle">恭喜获得 {{ popupUnlocks.length }} 项新成就</text>
        </view>

        <!-- 成就列表 -->
        <view class="modal-body">
          <view class="unlock-list">
            <view class="unlock-item" v-for="(item, index) in popupUnlocks" :key="item.key" :style="{ animationDelay: `${index * 150}ms` }">
              <view class="unlock-icon-wrap" :class="getRarityByKey(item.key).tier">
                <achievement-icon :icon-key="item.key" />
              </view>
              <view class="unlock-info">
                <text class="unlock-name">{{ item.name }}</text>
                <text class="unlock-desc">{{ item.description || '你已达成一个新的里程碑' }}</text>
                <text class="unlock-time">{{ formatDateTime(item.unlockedAt) }}</text>
              </view>
              <view class="unlock-rarity" :class="getRarityByKey(item.key).tier">
                {{ getRarityByKey(item.key).label }}
              </view>
            </view>
          </view>
        </view>

        <!-- 底部按钮 -->
        <view class="modal-footer">
          <button class="confirm-btn" @click="showModal = false">
            <text>太棒了!</text>
          </button>
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
    .slice(0, 5)
    .map((item) => ({
      key: item.key,
      name: item.name,
      description: item.description,
      unlockedAt: item.unlockedAt
    }))

  return dedupeUnlocks([...(popupUnlocks.value || []), ...unlockedFromApi]).slice(0, 5)
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
/* ==================== CSS 变量定义 ==================== */
.theme-wrapper {
  /* 深色主题（默认） */
  --bg-primary: #060d18;
  --bg-secondary: #0a1628;
  --bg-card: rgba(15, 28, 48, 0.85);
  --bg-card-hover: rgba(20, 38, 65, 0.92);

  --text-primary: #e8f0f8;
  --text-secondary: #8ba3c4;
  --text-muted: #5a728a;

  --accent-primary: #00d9a5;
  --accent-secondary: #00b8e6;
  --accent-gold: #ffd666;
  --accent-purple: #a78bfa;
  --accent-pink: #f472b6;

  --rarity-common: #94a3b8;
  --rarity-rare: #38bdf8;
  --rarity-epic: #a855f7;
  --rarity-legendary: #fbbf24;

  --border-subtle: rgba(100, 150, 200, 0.12);
  --border-medium: rgba(100, 150, 200, 0.2);

  --glow-cyan: rgba(0, 217, 165, 0.4);
  --glow-gold: rgba(255, 214, 102, 0.4);
  --glow-purple: rgba(167, 139, 250, 0.4);

  --shadow-card: 0 8px 32px rgba(0, 0, 0, 0.4);
  --shadow-glow: 0 0 40px rgba(0, 217, 165, 0.15);

  --font-display: "Orbitron", "Rajdhani", "DIN Alternate", sans-serif;
  --font-body: "Source Han Sans SC", "Microsoft YaHei", sans-serif;
}

/* 浅色主题 */
.theme-wrapper.light-theme {
  --bg-primary: #f0f5ff;
  --bg-secondary: #e8f0fa;
  --bg-card: rgba(255, 255, 255, 0.9);
  --bg-card-hover: rgba(255, 255, 255, 0.98);

  --text-primary: #1a2744;
  --text-secondary: #4a6080;
  --text-muted: #7a8aa8;

  --accent-primary: #00b386;
  --accent-secondary: #0099cc;
  --accent-gold: #e6a700;
  --accent-purple: #8b5cf6;
  --accent-pink: #ec4899;

  --rarity-common: #64748b;
  --rarity-rare: #0284c7;
  --rarity-epic: #7c3aed;
  --rarity-legendary: #d97706;

  --border-subtle: rgba(100, 130, 180, 0.15);
  --border-medium: rgba(100, 130, 180, 0.25);

  --glow-cyan: rgba(0, 179, 134, 0.3);
  --glow-gold: rgba(230, 167, 0, 0.3);
  --glow-purple: rgba(139, 92, 246, 0.3);

  --shadow-card: 0 8px 32px rgba(30, 60, 100, 0.12);
  --shadow-glow: 0 0 40px rgba(0, 179, 134, 0.15);
}

/* ==================== 基础重置 ==================== */
* {
  box-sizing: border-box;
}

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(0, 217, 165, 0.3);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 217, 165, 0.5);
}

/* ==================== 页面容器 ==================== */
.theme-wrapper {
  min-height: 100vh;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-body);
  position: relative;
  overflow-x: hidden;
  padding-bottom: env(safe-area-inset-bottom);
}

/* ==================== 动态背景 ==================== */
.tech-background {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}

.grid-overlay {
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle at 20% 25%, var(--glow-cyan) 0%, transparent 50%),
    radial-gradient(circle at 80% 75%, var(--glow-purple) 0%, transparent 50%),
    linear-gradient(180deg, transparent 0%, rgba(0, 217, 165, 0.02) 100%);
}

.floating-particles {
  position: absolute;
  inset: 0;
}

.particle {
  position: absolute;
  width: 4px;
  height: 4px;
  background: var(--accent-primary);
  border-radius: 50%;
  opacity: 0.4;
  animation: floatParticle 8s ease-in-out infinite;
}

.particle:nth-child(1) { top: 10%; left: 15%; animation-delay: 0s; }
.particle:nth-child(2) { top: 20%; left: 85%; animation-delay: 0.5s; }
.particle:nth-child(3) { top: 35%; left: 25%; animation-delay: 1s; }
.particle:nth-child(4) { top: 50%; left: 75%; animation-delay: 1.5s; }
.particle:nth-child(5) { top: 65%; left: 10%; animation-delay: 2s; }
.particle:nth-child(6) { top: 80%; left: 60%; animation-delay: 2.5s; }
.particle:nth-child(7) { top: 15%; left: 50%; animation-delay: 3s; }
.particle:nth-child(8) { top: 45%; left: 90%; animation-delay: 3.5s; }
.particle:nth-child(9) { top: 70%; left: 35%; animation-delay: 4s; }
.particle:nth-child(10) { top: 25%; left: 65%; animation-delay: 4.5s; }
.particle:nth-child(11) { top: 55%; left: 20%; animation-delay: 5s; }
.particle:nth-child(12) { top: 85%; left: 45%; animation-delay: 5.5s; }

@keyframes floatParticle {
  0%, 100% { transform: translateY(0) scale(1); opacity: 0.3; }
  50% { transform: translateY(-20px) scale(1.3); opacity: 0.6; }
}

.glow-orbs {
  position: absolute;
  inset: 0;
}

.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  opacity: 0.3;
  animation: orbFloat 15s ease-in-out infinite;
}

.orb-1 {
  width: 300px;
  height: 300px;
  background: var(--accent-primary);
  top: -100px;
  right: -50px;
}

.orb-2 {
  width: 250px;
  height: 250px;
  background: var(--accent-gold);
  bottom: 20%;
  left: -80px;
  animation-delay: -5s;
}

.orb-3 {
  width: 200px;
  height: 200px;
  background: var(--accent-purple);
  top: 50%;
  right: -50px;
  animation-delay: -10s;
}

@keyframes orbFloat {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(30px, -30px) scale(1.1); }
  66% { transform: translate(-20px, 20px) scale(0.95); }
}

/* ==================== 导航栏 ==================== */
.navbar {
  position: relative;
  z-index: 100;
  background: linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-primary) 100%);
  border-bottom: 1px solid var(--border-subtle);
}

.safe-area-top {
  height: env(safe-area-inset-top);
  min-height: 20px;
}

.nav-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
}

.nav-left, .nav-right {
  width: 50px;
}

.back-btn {
  font-size: 24px;
  color: var(--accent-primary);
  padding: 8px;
  transition: transform 0.3s ease;
}

.back-btn:active {
  transform: scale(0.9);
}

.nav-title-wrap {
  flex: 1;
  text-align: center;
}

.nav-title {
  display: block;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 2px;
  text-shadow: 0 0 20px var(--glow-cyan);
}

.nav-subtitle {
  display: block;
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
}

.refresh-btn {
  font-size: 22px;
  color: var(--accent-primary);
  padding: 8px;
  display: inline-block;
  transition: transform 0.3s ease;
}

.refresh-btn:active {
  transform: scale(0.9);
}

.refresh-btn.rotating {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ==================== 主内容区 ==================== */
.main-content {
  position: relative;
  z-index: 1;
  padding: 16px;
  max-width: 1200px;
  margin: 0 auto;
}

/* ==================== 面板通用样式 ==================== */
.panel {
  background: var(--bg-card);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-subtle);
  border-radius: 20px;
  padding: 20px;
  margin-bottom: 16px;
  box-shadow: var(--shadow-card);
  transition: all 0.3s ease;
}

.panel:hover {
  border-color: var(--border-medium);
  box-shadow: var(--shadow-glow);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.panel-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title-icon {
  font-size: 20px;
}

.panel-title {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 1px;
}

.panel-subtitle {
  font-size: 12px;
  color: var(--text-muted);
}

/* ==================== 统计面板 ==================== */
.stats-panel {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  align-items: center;
}

.stats-left {
  display: flex;
  align-items: center;
  gap: 20px;
}

/* 炫酷仪表盘 */
.gauge-container {
  position: relative;
  width: 120px;
  height: 120px;
}

.gauge-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
}

.gauge-bg {
  position: absolute;
  inset: 8px;
  border-radius: 50%;
  background: var(--bg-primary);
}

.gauge-progress {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: conic-gradient(
    var(--accent-primary) calc(var(--progress) * 3.6deg),
    transparent calc(var(--progress) * 3.6deg)
  );
  mask: radial-gradient(transparent 55%, black 56%);
  -webkit-mask: radial-gradient(transparent 55%, black 56%);
  animation: gaugeAnim 1.5s ease-out forwards;
}

@keyframes gaugeAnim {
  from { opacity: 0; transform: scale(0.8); }
  to { opacity: 1; transform: scale(1); }
}

.gauge-glow {
  position: absolute;
  inset: -5px;
  border-radius: 50%;
  background: var(--accent-primary);
  filter: blur(15px);
  opacity: 0.3;
  animation: gaugeGlow 2s ease-in-out infinite;
}

@keyframes gaugeGlow {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.05); }
}

.gauge-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.gauge-value {
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 700;
  color: var(--accent-primary);
  line-height: 1;
}

.gauge-unit {
  font-family: var(--font-display);
  font-size: 14px;
  color: var(--accent-primary);
}

.gauge-label {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 2px;
}

/* 等级徽章 */
.grade-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  border-radius: 16px;
  border: 2px solid;
  background: var(--bg-primary);
}

.grade-letter {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
}

.grade-label {
  font-size: 10px;
  opacity: 0.7;
}

.grade-s {
  border-color: var(--rarity-legendary);
  color: var(--rarity-legendary);
  box-shadow: 0 0 20px var(--glow-gold), inset 0 0 20px rgba(251, 191, 36, 0.1);
}

.grade-a {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  box-shadow: 0 0 20px var(--glow-cyan), inset 0 0 20px rgba(0, 217, 165, 0.1);
}

.grade-b {
  border-color: var(--accent-secondary);
  color: var(--accent-secondary);
  box-shadow: 0 0 15px rgba(0, 184, 230, 0.2);
}

.grade-c {
  border-color: var(--rarity-common);
  color: var(--rarity-common);
}

.grade-d {
  border-color: var(--text-muted);
  color: var(--text-muted);
}

.stats-right {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--bg-primary);
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
}

.stat-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: bold;
}

.stat-icon-unlock {
  background: rgba(0, 217, 165, 0.15);
  color: var(--accent-primary);
}

.stat-icon-total {
  background: rgba(167, 139, 250, 0.15);
  color: var(--accent-purple);
}

.stat-icon-new {
  background: rgba(255, 214, 102, 0.15);
  color: var(--accent-gold);
}

.stat-info {
  flex: 1;
}

.stat-value {
  display: block;
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.2;
}

.stat-label {
  font-size: 11px;
  color: var(--text-muted);
}

/* ==================== 最新解锁 ==================== */
.latest-panel {
  position: relative;
}

.latest-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.latest-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 0;
  position: relative;
  animation: slideInLeft 0.5s ease-out both;
}

@keyframes slideInLeft {
  from { opacity: 0; transform: translateX(-20px); }
  to { opacity: 1; transform: translateX(0); }
}

.timeline-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--accent-gold);
  box-shadow: 0 0 12px var(--glow-gold);
  flex-shrink: 0;
  z-index: 1;
}

.timeline-line {
  position: absolute;
  left: 6px;
  top: 32px;
  width: 2px;
  height: calc(100% - 18px);
  background: linear-gradient(180deg, var(--accent-gold) 0%, var(--border-medium) 100%);
}

.latest-content {
  flex: 1;
}

.latest-name {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.latest-time {
  font-size: 12px;
  color: var(--text-muted);
}

.empty-latest {
  text-align: center;
  padding: 30px 20px;
  color: var(--text-muted);
}

.empty-latest .empty-icon {
  font-size: 40px;
  display: block;
  margin-bottom: 10px;
  opacity: 0.5;
}

.empty-latest .empty-text {
  font-size: 14px;
}

/* ==================== 筛选标签 ==================== */
.filter-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.filter-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 25px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.filter-tab text {
  font-size: 14px;
  color: var(--text-secondary);
}

.tab-count {
  font-size: 12px;
  padding: 2px 8px;
  background: var(--border-subtle);
  border-radius: 12px;
  color: var(--text-muted);
}

.filter-tab.active {
  background: linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%);
  border-color: transparent;
  box-shadow: 0 4px 15px var(--glow-cyan);
}

.filter-tab.active text,
.filter-tab.active .tab-count {
  color: #fff;
}

.filter-tab.active .tab-count {
  background: rgba(255, 255, 255, 0.2);
}

/* ==================== 成就卡片 ==================== */
.achievement-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.achievement-card {
  position: relative;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
  transition: all 0.3s ease;
  animation: cardEnter 0.5s ease-out both;
}

@keyframes cardEnter {
  from { opacity: 0; transform: translateY(20px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.achievement-card:hover {
  transform: translateY(-4px);
  border-color: var(--border-medium);
  box-shadow: var(--shadow-card);
}

.achievement-card.locked {
  opacity: 0.75;
}

.achievement-card.locked:hover {
  opacity: 0.9;
}

/* 卡片光泽效果 */
.card-glare {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: linear-gradient(
    135deg,
    transparent 40%,
    rgba(255, 255, 255, 0.05) 50%,
    transparent 60%
  );
  transform: rotate(30deg);
  transition: all 0.6s ease;
  pointer-events: none;
}

.achievement-card:hover .card-glare {
  transform: rotate(30deg) translateX(30%);
}

/* 稀有度边框 */
.achievement-card.rarity-common {
  border-color: var(--rarity-common);
}

.achievement-card.rarity-rare {
  border-color: var(--rarity-rare);
  box-shadow: 0 0 20px rgba(56, 189, 248, 0.15);
}

.achievement-card.rarity-epic {
  border-color: var(--rarity-epic);
  box-shadow: 0 0 25px rgba(168, 85, 247, 0.2);
}

.achievement-card.rarity-legendary {
  border-color: var(--rarity-legendary);
  box-shadow: 0 0 30px var(--glow-gold);
  background: linear-gradient(135deg, var(--bg-card) 0%, rgba(251, 191, 36, 0.05) 100%);
}

/* 图标区域 */
.card-icon-wrap {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.icon-bg {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.02) 100%);
  border: 1px solid var(--border-subtle);
}

.icon-bg.unlocked {
  background: linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%);
  border-color: transparent;
  box-shadow: 0 4px 15px var(--glow-cyan);
}

.icon-bg.locked {
  opacity: 0.5;
  filter: grayscale(0.5);
}

.rarity-badge {
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 8px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.rarity-badge.common {
  background: rgba(148, 163, 184, 0.15);
  color: var(--rarity-common);
}

.rarity-badge.rare {
  background: rgba(56, 189, 248, 0.15);
  color: var(--rarity-rare);
}

.rarity-badge.epic {
  background: rgba(168, 85, 247, 0.15);
  color: var(--rarity-epic);
}

.rarity-badge.legendary {
  background: rgba(251, 191, 36, 0.15);
  color: var(--rarity-legendary);
}

.status-badge {
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 8px;
}

.status-badge.unlocked {
  background: rgba(0, 217, 165, 0.15);
  color: var(--accent-primary);
}

.status-badge.locked {
  background: rgba(100, 116, 139, 0.15);
  color: var(--text-muted);
}

/* 成就信息 */
.card-info {
  flex: 1;
}

.card-name {
  display: block;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.card-desc {
  display: block;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* 进度条 */
.card-progress {
  margin-top: auto;
}

.progress-track {
  height: 8px;
  background: var(--bg-primary);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--accent-primary) 0%, var(--accent-secondary) 100%);
  position: relative;
  overflow: hidden;
  transition: width 0.5s ease;
}

.progress-fill.completed {
  background: linear-gradient(90deg, var(--accent-gold) 0%, #ffed4a 100%);
}

.progress-shine {
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.4) 50%,
    transparent 100%
  );
  animation: shine 2s ease-in-out infinite;
}

@keyframes shine {
  0% { left: -100%; }
  50%, 100% { left: 100%; }
}

.progress-text {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-muted);
}

.progress-percent {
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--accent-primary);
}

/* 空状态 */
.empty-gallery {
  text-align: center;
  padding: 50px 20px;
}

.empty-gallery .empty-icon {
  font-size: 50px;
  display: block;
  margin-bottom: 16px;
  opacity: 0.4;
}

.empty-gallery .empty-text {
  font-size: 14px;
  color: var(--text-muted);
}

/* ==================== 解锁弹窗 ==================== */
.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: none;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  padding: 20px;
}

.modal-mask.show {
  display: flex;
}

.unlock-modal {
  width: 100%;
  max-width: 420px;
  background: var(--bg-card);
  border: 1px solid var(--border-medium);
  border-radius: 24px;
  overflow: hidden;
  position: relative;
  animation: modalEnter 0.4s ease-out;
}

@keyframes modalEnter {
  from { opacity: 0; transform: scale(0.9) translateY(20px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

/* 弹窗背景特效 */
.modal-bg-effect {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.effect-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(40px);
  animation: modalOrb 8s ease-in-out infinite;
}

.effect-orb-1 {
  width: 200px;
  height: 200px;
  background: var(--accent-gold);
  top: -80px;
  left: -50px;
  opacity: 0.3;
}

.effect-orb-2 {
  width: 150px;
  height: 150px;
  background: var(--accent-primary);
  bottom: -60px;
  right: -40px;
  opacity: 0.3;
  animation-delay: -4s;
}

.effect-orb-3 {
  width: 100px;
  height: 100px;
  background: var(--accent-purple);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  opacity: 0.2;
  animation-delay: -2s;
}

@keyframes modalOrb {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(20px, -20px) scale(1.1); }
}

/* 弹窗头部 */
.modal-header {
  position: relative;
  text-align: center;
  padding: 30px 20px 20px;
  background: linear-gradient(180deg, rgba(255, 214, 102, 0.1) 0%, transparent 100%);
}

.trophy-icon {
  font-size: 48px;
  display: block;
  margin-bottom: 12px;
  animation: trophyBounce 1s ease-in-out infinite;
}

@keyframes trophyBounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.modal-title {
  display: block;
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 700;
  color: var(--accent-gold);
  text-shadow: 0 0 30px var(--glow-gold);
  letter-spacing: 2px;
}

.modal-subtitle {
  display: block;
  font-size: 14px;
  color: var(--text-secondary);
  margin-top: 8px;
}

/* 弹窗内容 */
.modal-body {
  position: relative;
  padding: 0 20px 20px;
  max-height: 50vh;
  overflow-y: auto;
}

.unlock-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.unlock-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px;
  background: var(--bg-primary);
  border-radius: 14px;
  border: 1px solid var(--border-subtle);
  animation: unlockItemEnter 0.5s ease-out both;
}

@keyframes unlockItemEnter {
  from { opacity: 0; transform: translateX(-20px); }
  to { opacity: 1; transform: translateX(0); }
}

.unlock-icon-wrap {
  width: 50px;
  height: 50px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--accent-gold) 0%, #ffed4a 100%);
  box-shadow: 0 4px 15px var(--glow-gold);
  flex-shrink: 0;
}

.unlock-icon-wrap.rarity-common { background: linear-gradient(135deg, var(--rarity-common) 0%, #cbd5e1 100%); }
.unlock-icon-wrap.rarity-rare { background: linear-gradient(135deg, var(--rarity-rare) 0%, #7dd3fc 100%); box-shadow: 0 4px 15px rgba(56, 189, 248, 0.4); }
.unlock-icon-wrap.rarity-epic { background: linear-gradient(135deg, var(--rarity-epic) 0%, #c4b5fd 100%); box-shadow: 0 4px 15px var(--glow-purple); }
.unlock-icon-wrap.rarity-legendary { background: linear-gradient(135deg, var(--rarity-legendary) 0%, #fde68a 100%); box-shadow: 0 4px 20px var(--glow-gold); }

.unlock-info {
  flex: 1;
  min-width: 0;
}

.unlock-name {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.unlock-desc {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.unlock-time {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
}

.unlock-rarity {
  font-size: 10px;
  padding: 4px 8px;
  border-radius: 6px;
  font-weight: 600;
  flex-shrink: 0;
}

.unlock-rarity.common { background: rgba(148, 163, 184, 0.15); color: var(--rarity-common); }
.unlock-rarity.rare { background: rgba(56, 189, 248, 0.15); color: var(--rarity-rare); }
.unlock-rarity.epic { background: rgba(168, 85, 247, 0.15); color: var(--rarity-epic); }
.unlock-rarity.legendary { background: rgba(251, 191, 36, 0.15); color: var(--rarity-legendary); }

/* 弹窗底部 */
.modal-footer {
  position: relative;
  padding: 16px 20px 24px;
  display: flex;
  justify-content: center;
}

.confirm-btn {
  padding: 14px 48px;
  background: linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%);
  border: none;
  border-radius: 30px;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 1px;
  box-shadow: 0 8px 25px var(--glow-cyan);
  transition: all 0.3s ease;
}

.confirm-btn:active {
  transform: scale(0.96);
  box-shadow: 0 4px 15px var(--glow-cyan);
}

/* ==================== 响应式 ==================== */
@media (max-width: 768px) {
  .stats-panel {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .stats-left {
    justify-content: center;
  }

  .stats-right {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .stat-item {
    flex: 1;
    min-width: 100px;
  }

  .achievement-grid {
    grid-template-columns: 1fr;
  }

  .main-content {
    padding: 12px;
  }

  .panel {
    padding: 16px;
  }

  .nav-title {
    font-size: 18px;
  }
}

@media (max-width: 480px) {
  .stats-right {
    flex-direction: column;
  }

  .stat-item {
    min-width: auto;
  }

  .filter-tabs {
    gap: 8px;
  }

  .filter-tab {
    padding: 8px 12px;
    font-size: 13px;
  }

  .gauge-container {
    width: 100px;
    height: 100px;
  }

  .gauge-value {
    font-size: 26px;
  }

  .grade-badge {
    width: 50px;
    height: 50px;
  }

  .grade-letter {
    font-size: 22px;
  }
}
</style>
