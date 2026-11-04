<template>
  <view v-if="search && (statusText || search.sources.length)" class="chat-search-sources">
    <text v-if="statusText" :class="['search-status', search.status === 'searching' ? 'is-searching' : '']">{{ statusText }}</text>
    <view v-if="search.sources.length" class="source-list">
      <view v-for="source in visibleSources" :key="`${source.index}:${source.url}`" class="source-link" role="link" :aria-label="source.title" tabindex="0" @tap.stop="openSource(source.url)" @keydown.enter.prevent="openSource(source.url)" @keydown.space.prevent="openSource(source.url)">
        <text class="source-index">{{ source.index }}</text>
        <view class="source-copy">
          <text class="source-title">{{ source.title }}</text>
          <text v-if="source.siteName !== source.title" class="source-site">{{ source.siteName }}</text>
        </view>
        <text class="source-arrow">↗</text>
      </view>
    </view>
    <view v-if="search.sources.length > 6" class="sources-toggle" role="button" tabindex="0" :aria-expanded="expanded" @tap.stop="toggleSources" @keydown.enter.prevent="toggleSources" @keydown.space.prevent="toggleSources">
      <text>{{ expanded ? '收起来源' : `查看全部 ${search.sources.length} 个来源` }}</text>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { normalizeChatSearch, chatSearchMessage, safeSearchUrl } from '../utils/ai-chat-search.mjs'

const props = defineProps({ value: { type: Object, default: null } })
const search = computed(() => normalizeChatSearch(props.value))
const statusText = computed(() => chatSearchMessage(search.value))
const expanded = ref(false)
const visibleSources = computed(() => expanded.value ? (search.value?.sources || []) : (search.value?.sources || []).slice(0, 6))

function toggleSources() {
  expanded.value = !expanded.value
}

function openSource(value) {
  const url = safeSearchUrl(value)
  if (!url) return
  // #ifdef H5
  window.open(url, '_blank', 'noopener,noreferrer')
  // #endif
  // #ifndef H5
  uni.setClipboardData({
    data: url,
    showToast: false,
    success: () => uni.showToast({ title: '链接已复制，请在浏览器打开', icon: 'none' }),
    fail: () => uni.showToast({ title: '复制链接失败，请重试', icon: 'none' })
  })
  // #endif
}
</script>

<style scoped>
.chat-search-sources { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border-light, #e5e7eb); }
.search-status { display: block; color: var(--text-secondary, #71717a); font-size: 12px; line-height: 1.6; }
.search-status.is-searching { color: var(--accent, #4d6bfe); }
.source-list { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
.source-link { display: flex; align-items: center; gap: 6px; min-width: 0; padding: 5px 8px; border: 1px solid var(--border-light, #e5e7eb); border-radius: 7px; background: var(--bg-secondary, #f7f8fa); cursor: pointer; }
.source-link:focus-visible, .sources-toggle:focus-visible { outline: 2px solid var(--accent, #4d6bfe); outline-offset: 3px; }
.source-link:active { border-color: var(--accent, #4d6bfe); }
.source-index { flex: 0 0 auto; min-width: 16px; color: var(--accent, #4d6bfe); font-size: 11px; text-align: center; }
.source-copy { display: flex; align-items: baseline; gap: 8px; flex: 1; min-width: 0; }
.source-title { flex: 1; min-width: 0; color: var(--text-primary, #27272a); font-size: 12px; line-height: 1.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.source-site { flex: 0 1 auto; max-width: 80px; color: var(--text-tertiary, #71717a); font-size: 10px; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sources-toggle { margin-top: 7px; padding: 4px 0; color: var(--accent, #4d6bfe); font-size: 12px; cursor: pointer; }
.source-arrow { flex: 0 0 auto; color: var(--text-tertiary, #71717a); font-size: 13px; }
</style>
