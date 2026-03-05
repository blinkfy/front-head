<template>
  <div ref="legacyRoot" class="legacy-page-host"></div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import './achievements.css';
import legacyMarkup from './achievements-markup.html?raw';
import { applyStoredTheme, bindThemeStorageSync } from '../../shared/theme';

const legacyRoot = ref(null);
let unbindThemeWatcher = null;

onMounted(async () => {
  applyStoredTheme();
  unbindThemeWatcher = bindThemeStorageSync();

  if (legacyRoot.value) {
    legacyRoot.value.innerHTML = legacyMarkup;
  }

  await import('./init-achievements.js');
});

onBeforeUnmount(() => {
  if (typeof unbindThemeWatcher === 'function') {
    unbindThemeWatcher();
  }
});
</script>

<style>
.legacy-page-host {
  min-height: 100vh;
}
</style>
