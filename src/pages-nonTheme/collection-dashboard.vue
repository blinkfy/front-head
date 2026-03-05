<template>
  <div ref="legacyRoot" class="legacy-page-host"></div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import './collection-dashboard/collection-dashboard.css'
import legacyMarkup from './collection-dashboard/collection-dashboard-markup.html?raw'
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
  }

  await import('./collection-dashboard/init-collection-dashboard.js')
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
</style>
