<template>
  <section class="page-shell">
    <div class="orb orb-a"></div>
    <div class="orb orb-b"></div>
    <main class="card">
      <p class="eyebrow">403 / Access Restricted</p>
      <h1 class="title">没有权限访问该页面</h1>
      <p class="lead">
        当前账号无法打开{{ pageLabel }}。
      </p>
      <p class="reason">{{ reasonText }}</p>

      <div class="meta">
        <span class="meta-label">目标页面</span>
        <span class="meta-value">{{ pageLabel }}</span>
      </div>

      <div class="actions">
        <button type="button" class="action ghost" @click="goBack">返回上一页</button>
        <button type="button" class="action primary" @click="goHome">返回首页</button>
      </div>
    </main>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { applyStoredTheme, bindThemeStorageSync } from '@/utils/theme'

const DEFAULT_REASON = '该页面仅管理员可访问，请使用管理员账号登录。'
const ROUTE_LABELS = {
  '/collection-planning': '垃圾清运规划',
  '/pages-nonTheme/collection-planning': '垃圾清运规划',
  '/community-dashboard': '社区驾驶舱',
  '/pages-nonTheme/community-dashboard': '社区驾驶舱'
}

const sourcePath = ref('')
const reason = ref(DEFAULT_REASON)
let unbindThemeWatcher = null

const pageLabel = computed(() => {
  const path = String(sourcePath.value || '').trim()
  return ROUTE_LABELS[path] || path || '当前页面'
})

const reasonText = computed(() => {
  const value = String(reason.value || '').trim()
  return value || DEFAULT_REASON
})

function goHome() {
  window.location.assign('/')
}

function goBack() {
  if (window.history.length > 1) {
    window.history.back()
    return
  }
  goHome()
}

onMounted(() => {
  applyStoredTheme()
  unbindThemeWatcher = bindThemeStorageSync()

  const query = String(window.location.search || '').replace(/^\?/, '')
  const params = {}

  if (query) {
    query.split('&').forEach((pair) => {
      if (!pair) return
      const index = pair.indexOf('=')
      const rawKey = index >= 0 ? pair.slice(0, index) : pair
      const rawValue = index >= 0 ? pair.slice(index + 1) : ''
      const key = decodeURIComponent(rawKey.replace(/\+/g, ' '))
      const value = decodeURIComponent(rawValue.replace(/\+/g, ' '))
      params[key] = value
    })
  }

  sourcePath.value = params.from || ''
  reason.value = params.reason || DEFAULT_REASON
})

onBeforeUnmount(() => {
  if (typeof unbindThemeWatcher === 'function') {
    unbindThemeWatcher()
  }
})
</script>

<style scoped>
.page-shell {
  --page-bg: linear-gradient(145deg, #0b1c28 0%, #102f40 52%, #154359 100%);
  --card-bg: rgba(7, 19, 28, 0.76);
  --card-border: rgba(117, 213, 199, 0.24);
  --text-main: #f4fbfd;
  --text-subtle: rgba(225, 244, 244, 0.76);
  --accent: #7ce0c3;
  --accent-strong: #2db18e;
  --shadow: 0 28px 80px rgba(1, 9, 14, 0.32);
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--page-bg);
  color: var(--text-main);
}

:global(body.light-theme) .page-shell {
  --page-bg: linear-gradient(145deg, #eef7f2 0%, #dcefe8 52%, #c7e1d5 100%);
  --card-bg: rgba(255, 255, 255, 0.82);
  --card-border: rgba(45, 177, 142, 0.16);
  --text-main: #163341;
  --text-subtle: rgba(22, 51, 65, 0.72);
  --accent: #1f8c73;
  --accent-strong: #0e6f59;
  --shadow: 0 28px 80px rgba(24, 53, 43, 0.12);
}

.orb {
  position: absolute;
  border-radius: 999px;
  filter: blur(12px);
  opacity: 0.85;
}

.orb-a {
  width: 280px;
  height: 280px;
  top: -56px;
  right: -36px;
  background: radial-gradient(circle, rgba(124, 224, 195, 0.48), transparent 72%);
}

.orb-b {
  width: 360px;
  height: 360px;
  left: -120px;
  bottom: -130px;
  background: radial-gradient(circle, rgba(49, 142, 215, 0.32), transparent 72%);
}

.card {
  position: relative;
  z-index: 1;
  width: min(560px, 100%);
  padding: 36px 32px;
  border-radius: 28px;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  box-shadow: var(--shadow);
  backdrop-filter: blur(18px);
}

.eyebrow {
  margin: 0 0 12px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent);
}

.title {
  margin: 0;
  font-size: clamp(28px, 4vw, 42px);
  line-height: 1.08;
}

.lead,
.reason {
  margin: 14px 0 0;
  font-size: 15px;
  line-height: 1.7;
  color: var(--text-subtle);
}

.meta {
  margin-top: 22px;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

:global(body.light-theme) .meta {
  background: rgba(14, 111, 89, 0.08);
}

.meta-label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--text-subtle);
}

.meta-value {
  font-size: 15px;
  font-weight: 700;
}

.actions {
  margin-top: 28px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.action {
  appearance: none;
  border: none;
  border-radius: 999px;
  padding: 12px 18px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
}

.action:hover {
  transform: translateY(-1px);
}

.action.primary {
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  color: #06221e;
  box-shadow: 0 14px 34px rgba(45, 177, 142, 0.28);
}

.action.ghost {
  background: transparent;
  color: var(--text-main);
  border: 1px solid var(--card-border);
}

@media (max-width: 640px) {
  .page-shell {
    padding: 18px;
  }

  .card {
    padding: 28px 22px;
    border-radius: 22px;
  }

  .actions {
    flex-direction: column;
  }

  .action {
    width: 100%;
  }
}
</style>
