<template>
  <view :class="['theme-wrapper', currentTheme === 'light' ? 'light-theme' : '']">
    <!-- 沉浸式暗墨绿纹理背景 -->
    <view class="hall-background">
      <view class="hall-vignette"></view>
      <view class="hall-noise"></view>
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
        </view>
        <view class="nav-right">
          <text class="stat-inline">已解锁: {{ summary.unlockedCount }}/{{ summary.totalCount }}</text>
          <text class="refresh-btn" :class="{ rotating: loading }" @click="refreshAchievements">↻</text>
        </view>
      </view>
    </view>

    <!-- 主内容区 -->
    <view class="main-content">
      <!-- 成就图鉴 -->
      <view class="panel gallery-panel">
        <view class="panel-header">
          <view class="panel-title-row">
            <view class="title-icon">📜</view>
            <text class="panel-title">成就图鉴</text>
          </view>
          <text class="panel-subtitle">共 {{ achievements.length }} 项</text>
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

        <!-- 成就网格 - 金属牌匾图鉴 -->
        <view class="achievement-grid" v-if="filteredAchievements.length > 0">
          <view v-for="(item, index) in filteredAchievements" :key="item.key"
            class="achievement-card"
            :class="[
              `rarity-${getRarityByKey(item.key).tier}`,
              item.unlocked ? 'unlocked' : 'locked'
            ]"
            :style="{ animationDelay: `${Math.min(index * 50, 300)}ms` }"
            hover-class="achievement-card-active">

            <!-- 图标区域 - 纹章风格：大图标居中 -->
            <view class="card-icon-area">
              <view class="card-icon-frame" :class="[item.unlocked ? 'unlocked' : 'locked', `rarity-${getRarityByKey(item.key).tier}`]">
                <achievement-icon :icon-key="item.key" size="large" />
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
                </view>
              </view>
              <view class="progress-text">
                <text v-if="item.unlocked">已解锁</text>
                <text v-else>{{ getProgressValue(item) }}/{{ getTargetValue(item) }}{{ item.unit || '' }}</text>
              </view>
            </view>

            <!-- 解锁时间（仅解锁时显示） -->
            <text class="card-unlock-time" v-if="item.unlocked">{{ formatDateTime(item.unlockedAt) }}</text>
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
/* ==================== CSS 变量定义：灵动毛玻璃主题 ==================== */
.theme-wrapper {
  /* 深色沉浸主题：高级黑灰/深蓝，避免纯黑 */
  --bg-gradient: radial-gradient(circle at 50% 0%, #1e293b 0%, #0f172a 60%, #020617 100%);
  --bg-card: rgba(30, 41, 59, 0.45);
  --bg-card-hover: rgba(51, 65, 85, 0.65);
  --text-primary: #F8FAFC;
  --text-secondary: #94A3B8;
  --text-muted: #475569;
  --accent-gold: #FCD34D;
  --accent-gold-light: #FEF08A;
  --glow-gold: rgba(252, 211, 77, 0.4);
  --rarity-common: #D97706;
  --rarity-rare: #94A3B8;
  --rarity-epic: #A855F7;
  --rarity-legendary: #F59E0B;
  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-medium: rgba(255, 255, 255, 0.15);
  --border-active: rgba(252, 211, 77, 0.5);
  --shadow-card: 0 8px 32px rgba(0, 0, 0, 0.3);
  --shadow-hover: 0 12px 48px rgba(0, 0, 0, 0.4);
  --nav-bg: rgba(15, 23, 42, 0.65);
  --bg-primary: #0F172A;
  --font-display: "Inter", "Helvetica Neue", sans-serif;
  --font-body: "Inter", "PingFang SC", "Microsoft YaHei", sans-serif;
}

/* 浅色主题：清新明快，高级留白与光影 */
.theme-wrapper.light-theme {
  --bg-gradient: radial-gradient(circle at top right, #FEF3C7 0%, #F8FAFC 40%, #F1F5F9 100%);
  --bg-card: rgba(255, 255, 255, 0.7);
  --bg-card-hover: rgba(255, 255, 255, 0.95);
  --text-primary: #0F172A;
  --text-secondary: #475569;
  --text-muted: #94A3B8;
  --accent-gold: #D97706;
  --accent-gold-light: #F59E0B;
  --glow-gold: rgba(217, 119, 6, 0.25);
  --rarity-common: #B45309;
  --rarity-rare: #64748B;
  --rarity-epic: #9333EA;
  --rarity-legendary: #D97706;
  --border-subtle: rgba(0, 0, 0, 0.04);
  --border-medium: rgba(0, 0, 0, 0.08);
  --border-active: rgba(217, 119, 6, 0.3);
  --shadow-card: 0 4px 24px rgba(0, 0, 0, 0.04);
  --shadow-hover: 0 12px 32px rgba(0, 0, 0, 0.08);
  --nav-bg: rgba(255, 255, 255, 0.75);
  --bg-primary: #FFFFFF;
}

/* ==================== 基础重置 ==================== */
* { box-sizing: border-box; }
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-medium); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: var(--border-active); }

/* ==================== 页面容器 ==================== */
.theme-wrapper {
  min-height: 100vh;
  min-height: 100dvh;
  color: var(--text-primary);
  font-family: var(--font-body);
  position: relative;
  overflow-x: hidden;
  padding-bottom: env(safe-area-inset-bottom);
  display: flex;
  flex-direction: column;
}

/* ==================== 动态环境背景 ==================== */
.hall-background {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: var(--bg-gradient);
  transition: background 0.5s ease;
}

.hall-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at center, transparent 30%, rgba(0, 0, 0, 0.03) 100%);
}
.theme-wrapper:not(.light-theme) .hall-vignette {
  background: radial-gradient(circle at center, transparent 30%, rgba(0, 0, 0, 0.5) 100%);
}

.hall-noise {
  position: absolute;
  inset: 0;
  opacity: 0.03;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  mix-blend-mode: overlay;
}

/* ==================== 导航栏 ==================== */
.navbar {
  position: relative;
  z-index: 100;
  flex-shrink: 0;
  background: var(--nav-bg);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-bottom: 1px solid var(--border-subtle);
  transition: all 0.3s ease;
}
.safe-area-top { height: env(safe-area-inset-top); min-height: 20px; }
.nav-content { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; }
.nav-left { flex: 0 0 auto; min-width: 40px; }
.nav-right { flex: 0 1 auto; max-width: 50%; display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
.back-btn { font-size: 20px; color: var(--text-primary); padding: 8px; transition: 0.2s; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--border-subtle); }
.back-btn:active { transform: scale(0.9); background: var(--border-medium); }
.nav-title-wrap { flex: 1; text-align: center; }
.nav-title { font-family: var(--font-display); font-size: 17px; font-weight: 600; color: var(--text-primary); letter-spacing: 1px; }
.stat-inline { font-size: 12px; font-weight: 500; color: var(--text-secondary); background: var(--border-subtle); padding: 4px 10px; border-radius: 20px; white-space: nowrap; }
.refresh-btn { font-size: 18px; color: var(--text-secondary); padding: 8px; transition: 0.3s; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--border-subtle); cursor: pointer; }
.refresh-btn:active { transform: scale(0.9); }
.refresh-btn:hover { color: var(--text-primary); background: var(--border-medium); }
.refresh-btn.rotating { animation: rotate 1s linear infinite; color: var(--accent-gold); }
@keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* ==================== 主内容区 ==================== */
.main-content {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: 20px 16px calc(30px + env(safe-area-inset-bottom));
}

/* ==================== 面板（玻璃拟物化） ==================== */
.panel {
  background: var(--bg-card);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid var(--border-subtle);
  border-radius: 24px;
  padding: 24px;
  box-shadow: var(--shadow-card);
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.gallery-panel { flex: 1; display: flex; flex-direction: column; min-height: 60vh; }
.panel:hover { border-color: var(--border-medium); box-shadow: var(--shadow-hover); }

.panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.panel-title-row { display: flex; align-items: center; gap: 10px; }
.title-icon { font-size: 22px; filter: drop-shadow(0 2px 4px var(--glow-gold)); }
.panel-title { font-size: 18px; font-weight: 700; color: var(--text-primary); letter-spacing: 0.5px; }
.panel-subtitle { font-size: 13px; color: var(--text-muted); font-weight: 500; background: var(--border-subtle); padding: 4px 12px; border-radius: 20px; }

/* ==================== 胶囊筛选标签 ==================== */
.filter-tabs { display: flex; gap: 10px; margin-bottom: 24px; flex-wrap: wrap; }
.filter-tab { display: flex; align-items: center; gap: 6px; padding: 8px 16px; background: var(--border-subtle); border: 1px solid transparent; border-radius: 30px; cursor: pointer; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.filter-tab text { font-size: 13px; font-weight: 500; color: var(--text-secondary); transition: color 0.3s; }
.tab-count { font-size: 11px; font-weight: 600; padding: 2px 8px; background: rgba(0,0,0,0.05); border-radius: 12px; color: var(--text-muted); transition: all 0.3s; }

.theme-wrapper:not(.light-theme) .tab-count { background: rgba(255,255,255,0.08); }

.filter-tab:hover { background: var(--border-medium); transform: translateY(-1px); }
.filter-tab.active { background: var(--text-primary); border-color: transparent; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
.filter-tab.active text { color: var(--bg-primary); font-weight: 600; }
.filter-tab.active .tab-count { background: var(--bg-primary); color: var(--text-primary); }

/* ==================== 成就卡片网格 ==================== */
.achievement-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
  align-content: start;
}

.achievement-card {
  position: relative;
  background: var(--bg-card);
  border-radius: 20px;
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  border: 1px solid var(--border-subtle);
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  animation: cardEnter 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(0,0,0,0.02);
  overflow: hidden;
}

/* 装饰性背景光晕 */
.achievement-card::before {
  content: "";
  position: absolute;
  top: 0; left: 0; right: 0; height: 100px;
  background: radial-gradient(ellipse at top, var(--glow-gold), transparent 70%);
  opacity: 0;
  transition: opacity 0.5s;
  pointer-events: none;
}

.achievement-card:hover { align-items: center; } /* 触发重新渲染技巧 */

@keyframes cardEnter {
  from { opacity: 0; transform: translateY(20px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.achievement-card:hover {
  transform: translateY(-6px);
  border-color: var(--border-active);
  box-shadow: 0 16px 40px rgba(0,0,0,0.08);
}
.theme-wrapper:not(.light-theme) .achievement-card:hover {
  box-shadow: 0 16px 40px rgba(0,0,0,0.4);
}

.achievement-card:hover::before { opacity: 0.15; }

/* 卡片稀有度基准调色 */
.achievement-card.rarity-common { --card-accent: var(--rarity-common); }
.achievement-card.rarity-rare { --card-accent: var(--rarity-rare); }
.achievement-card.rarity-epic { --card-accent: var(--rarity-epic); }
.achievement-card.rarity-legendary { --card-accent: var(--rarity-legendary); }

.achievement-card.rarity-legendary {
  background: linear-gradient(145deg, var(--bg-card), rgba(245, 158, 11, 0.05));
  border-color: rgba(245, 158, 11, 0.2);
}
.achievement-card.rarity-legendary:hover {
  border-color: rgba(245, 158, 11, 0.6);
  box-shadow: 0 16px 40px rgba(245, 158, 11, 0.15);
}

/* 未锁定状态减淡 */
.achievement-card.locked { opacity: 0.6; filter: grayscale(0.8); }
.achievement-card.locked:hover { opacity: 0.9; filter: grayscale(0.2); }

/* ===== 巨石柱图标区域 ===== */
.card-icon-area { position: relative; display: flex; justify-content: center; }
.card-icon-frame {
  width: 80px; height: 80px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-card);
  border: 4px solid var(--border-subtle);
  box-shadow: 0 8px 24px rgba(0,0,0,0.06);
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
  overflow: hidden;
}

.card-icon-frame::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 50%;
  box-shadow: inset 0 4px 10px rgba(255,255,255,0.4);
  pointer-events: none;
}
.theme-wrapper:not(.light-theme) .card-icon-frame::after {
  box-shadow: inset 0 4px 10px rgba(255,255,255,0.05);
}

.card-icon-frame.unlocked {
  border-color: var(--card-accent);
  background: linear-gradient(135deg, var(--bg-card), rgba(255,255,255,0.1));
  box-shadow: 0 10px 30px rgba(0,0,0,0.08), 0 0 20px rgba(252, 211, 77, 0.1);
}
.theme-wrapper:not(.light-theme) .card-icon-frame.unlocked {
  background: linear-gradient(135deg, var(--bg-card), rgba(255,255,255,0.05));
  box-shadow: 0 10px 30px rgba(0,0,0,0.4), 0 0 20px rgba(252, 211, 77, 0.1);
}

.achievement-card:hover .card-icon-frame {
  transform: scale(1.08) translateY(-4px);
  border-color: var(--card-accent);
}

/* ===== 文本信息 ===== */
.card-info { width: 100%; text-align: center; }
.card-name { display: block; font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px; letter-spacing: 0.5px; }
.card-desc { display: -webkit-box; font-size: 12px; color: var(--text-secondary); line-height: 1.6; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 38px; }

/* ===== 进度条设计重构 ===== */
.card-progress { width: 100%; margin-top: 4px; }
.progress-track {
  height: 6px;
  background: var(--border-subtle);
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 8px;
  position: relative;
}
.progress-fill {
  height: 100%;
  border-radius: 6px;
  background: var(--card-accent, var(--text-muted));
  transition: width 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}

.progress-fill.completed {
  background: linear-gradient(90deg, var(--accent-gold), var(--accent-gold-light));
  box-shadow: 0 0 10px var(--glow-gold);
}

.progress-text { display: flex; justify-content: center; font-size: 12px; font-weight: 600; color: var(--text-muted); }
.card-unlock-time { font-size: 11px; color: var(--text-muted); text-align: center; width: 100%; margin-top: 4px; }

/* ===== 空状态 ===== */
.empty-gallery { text-align: center; padding: 60px 20px; display: flex; flex-direction: column; align-items: center; gap: 16px; }
.empty-icon { font-size: 64px; opacity: 0.5; filter: drop-shadow(0 10px 20px rgba(0,0,0,0.1)); }
.empty-text { font-size: 15px; font-weight: 500; color: var(--text-secondary); }

/* ==================== 解锁弹窗（高保真光影） ==================== */
.modal-mask { position: fixed; inset: 0; z-index: 1000; display: none; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); padding: 20px; transition: all 0.4s; opacity: 0; }
.modal-mask.show { display: flex; opacity: 1; }
.unlock-modal { width: 100%; max-width: 420px; background: var(--bg-card); border: 1px solid rgba(255,255,255,0.2); border-radius: 28px; overflow: hidden; position: relative; animation: modalEnter 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; box-shadow: 0 24px 80px rgba(0,0,0,0.2); }
.theme-wrapper:not(.light-theme) .unlock-modal { box-shadow: 0 24px 80px rgba(0,0,0,0.8), 0 0 40px rgba(252, 211, 77, 0.1); border: 1px solid rgba(255,255,255,0.1); }

@keyframes modalEnter { from { opacity: 0; transform: scale(0.9) translateY(20px); } to { opacity: 1; transform: scale(1) translateY(0); } }

/* 弹窗背景发光特效 */
.modal-bg-effect { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.effect-orb { position: absolute; border-radius: 50%; filter: blur(60px); animation: modalOrb 8s ease-in-out infinite alternate; }
.effect-orb-1 { width: 300px; height: 300px; background: var(--accent-gold); top: -150px; left: -100px; opacity: 0.15; }
.effect-orb-2 { width: 250px; height: 250px; background: var(--rarity-epic); bottom: -100px; right: -80px; opacity: 0.1; animation-delay: -4s; }

@keyframes modalOrb { 0% { transform: translate(0, 0); } 100% { transform: translate(30px, 20px); } }

/* 弹窗结构 */
.modal-header { text-align: center; padding: 40px 24px 24px; position: relative; z-index: 1; }
.trophy-icon { font-size: 64px; line-height: 1; margin-bottom: 16px; display: inline-block; filter: drop-shadow(0 10px 20px rgba(245, 158, 11, 0.3)); animation: float 3s ease-in-out infinite; }
@keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
.modal-title { font-family: var(--font-display); font-size: 26px; font-weight: 800; color: var(--text-primary); margin-bottom: 8px; }
.modal-subtitle { font-size: 14px; color: var(--text-secondary); font-weight: 500; }

.modal-body { padding: 0 24px 24px; max-height: 50vh; overflow-y: auto; position: relative; z-index: 1; }
.unlock-list { display: flex; flex-direction: column; gap: 12px; }
.unlock-item { display: flex; align-items: center; gap: 16px; padding: 16px; background: var(--bg-primary); border-radius: 20px; border: 1px solid var(--border-subtle); animation: unlockItemEnter 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; box-shadow: 0 4px 12px rgba(0,0,0,0.03); }
@keyframes unlockItemEnter { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: translateX(0); } }

.unlock-icon-wrap { width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 3px solid transparent; background: var(--bg-card); }
.unlock-icon-wrap.rarity-common { border-color: var(--rarity-common); }
.unlock-icon-wrap.rarity-rare { border-color: var(--rarity-rare); }
.unlock-icon-wrap.rarity-epic { border-color: var(--rarity-epic); }
.unlock-icon-wrap.rarity-legendary { border-color: var(--rarity-legendary); box-shadow: 0 0 16px rgba(245, 158, 11, 0.3); }

.unlock-info { flex: 1; min-width: 0; }
.unlock-name { font-size: 15px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.unlock-desc { font-size: 12px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.unlock-rarity { font-size: 10px; font-weight: 800; padding: 4px 10px; border-radius: 8px; letter-spacing: 0.5px; }
.unlock-rarity.common { background: rgba(217, 119, 6, 0.1); color: var(--rarity-common); }
.unlock-rarity.rare { background: rgba(100, 116, 139, 0.1); color: var(--rarity-rare); }
.unlock-rarity.epic { background: rgba(168, 85, 247, 0.1); color: var(--rarity-epic); }
.unlock-rarity.legendary { background: rgba(245, 158, 11, 0.1); color: var(--rarity-legendary); }

.modal-footer { padding: 16px 24px 30px; display: flex; justify-content: center; position: relative; z-index: 1; }
.confirm-btn { padding: 14px 48px; background: var(--text-primary); border: none; border-radius: 30px; color: var(--bg-primary); font-size: 16px; font-weight: 700; letter-spacing: 1px; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 24px rgba(0,0,0,0.1); }
.theme-wrapper:not(.light-theme) .confirm-btn { box-shadow: 0 8px 24px rgba(255,255,255,0.1); }
.confirm-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(0,0,0,0.15); }
.confirm-btn:active { transform: translateY(0) scale(0.96); }

/* ==================== 响应式设计 ==================== */
@media (max-width: 900px) {
  .achievement-grid { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
  .panel { padding: 20px; border-radius: 20px; }
}

@media (max-width: 600px) {
  .main-content { padding: 16px 12px calc(20px + env(safe-area-inset-bottom)); }
  .panel { padding: 16px; border-radius: 16px; }
  .achievement-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .achievement-card { padding: 16px 12px; gap: 12px; border-radius: 16px; }
  .card-icon-frame { width: 64px; height: 64px; border-width: 3px; }
  .card-name { font-size: 14px; }
  .card-desc { font-size: 11px; min-height: 32px; }
  .nav-title { font-size: 16px; }
  .filter-tab { padding: 6px 12px; }
  .filter-tab text { font-size: 12px; }
  .nav-right { max-width: 55%; gap: 8px; }
  .stat-inline { font-size: 11px; padding: 4px 8px; }
  .unlock-modal { border-radius: 24px; max-width: 90%; }
}

@media (max-width: 380px) {
  .achievement-grid { grid-template-columns: 1fr; }
  .achievement-card { flex-direction: row; align-items: center; text-align: left; padding: 16px; }
  .card-info { text-align: left; }
  .card-icon-frame { width: 56px; height: 56px; flex-shrink: 0; }
  .card-desc { min-height: auto; }
}
</style>