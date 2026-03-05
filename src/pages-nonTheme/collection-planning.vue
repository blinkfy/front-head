<template>
  <div ref="legacyRoot" class="legacy-page-host"></div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import './collection-planning/collection-planning.css'
import legacyMarkup from './collection-planning/collection-planning-markup.html?raw'
import { applyStoredTheme, bindThemeStorageSync } from '@/utils/theme'
import { baseUrl } from '@/api/settings'

const legacyRoot = ref(null)
let unbindThemeWatcher = null

onMounted(async () => {
  // 注入 baseUrl 到全局作用域供 init-*.js 使用
  window.__APP_BASE_URL__ = baseUrl
  
  applyStoredTheme()
  unbindThemeWatcher = bindThemeStorageSync()

  if (legacyRoot.value) {
    legacyRoot.value.innerHTML = legacyMarkup
    // 让根容器承载 CSS 变量和主题样式
    legacyRoot.value.classList.add('page-root')
  }

  await import('./collection-planning/init-collection-planning.js')
})

onBeforeUnmount(() => {
  if (typeof unbindThemeWatcher === 'function') {
    unbindThemeWatcher()
  }
})
</script>

<style>
.legacy-page-host {
  min-height: 100vh;
}

/* 将 body 的样式应用到根容器 */
.legacy-page-host.page-root {
  margin: 0;
  min-height: 100vh;
  font-family: "Source Han Sans SC", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
  color: var(--text);
  background:
    radial-gradient(980px 500px at 88% -8%, rgba(30, 93, 216, 0.16), transparent 58%),
    radial-gradient(880px 420px at -16% 18%, rgba(15, 154, 102, 0.18), transparent 57%),
    linear-gradient(155deg, var(--bg-1), var(--bg-2));
  padding: 18px;
}

.legacy-page-host.page-root.dark-theme {
  background:
    radial-gradient(980px 500px at 88% -8%, rgba(74, 134, 246, 0.16), transparent 58%),
    radial-gradient(880px 420px at -16% 18%, rgba(26, 181, 125, 0.14), transparent 57%),
    linear-gradient(155deg, var(--bg-1), var(--bg-2));
}
</style>
