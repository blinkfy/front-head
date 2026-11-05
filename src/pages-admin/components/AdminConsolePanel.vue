<template>
  <view class="console-panel">
    <view class="console-heading" @click="expanded = !expanded">
      <view>
        <text class="console-title">本机控制台</text>
        <text class="console-subtitle">{{ expanded ? '仅当前运行期间 · 最多保留 120 条' : '查看 App 日志与推送诊断' }}</text>
      </view>
      <text class="console-toggle">{{ expanded ? '收起' : '展开' }}</text>
    </view>
    <view v-if="expanded" class="console-content">
      <view class="console-filters">
        <button v-for="item in filters" :key="item.key" class="console-filter" :class="{ selected: filter === item.key }"
          @click="filter = item.key">{{ item.label }}</button>
      </view>
      <view class="console-toolbar">
        <text class="console-count">{{ visibleEntries.length }} 条日志</text>
        <button class="console-action" :disabled="!visibleEntries.length" @click="copyLogs">复制当前</button>
        <button class="console-action" :disabled="!entries.length" @click="appConsole.clear()">清空</button>
      </view>
      <scroll-view scroll-y class="console-logs">
        <view v-for="entry in visibleEntries" :key="entry.id" class="console-entry" :class="entry.level">
          <view class="console-meta"><text>{{ formatTime(entry.time) }}</text><text>{{ entry.level.toUpperCase() }}</text></view>
          <text selectable class="console-message">{{ entry.message }}</text>
        </view>
        <view v-if="!visibleEntries.length" class="console-empty">
          {{ filter === 'push' ? '暂无推送日志。可退出账号后重新登录，再回到这里查看。' : '暂无日志，后续输出会自动显示在这里。' }}
        </view>
      </scroll-view>
      <text class="console-note">仅显示本机 JavaScript 控制台，常见敏感字段已隐藏；不包含服务器或原生 SDK 内部日志。</text>
    </view>
  </view>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { appConsole } from '@/utils/app-console.mjs'

const expanded = ref(false)
const filter = ref('push')
const entries = ref([])
const filters = [
  { key: 'push', label: '推送' }, { key: 'all', label: '全部' },
  { key: 'log', label: 'Log' }, { key: 'info', label: 'Info' },
  { key: 'warn', label: 'Warn' }, { key: 'error', label: 'Error' }
]
const visibleEntries = computed(() => entries.value.filter(entry => filter.value === 'all' ||
  (filter.value === 'push' ? entry.message.includes('[chat-push]') : entry.level === filter.value)).slice().reverse())
let unsubscribe = null
watch(expanded, value => {
  unsubscribe?.()
  unsubscribe = null
  if (value) {
    entries.value = appConsole.snapshot()
    unsubscribe = appConsole.subscribe(() => { entries.value = appConsole.snapshot() })
  }
})
onBeforeUnmount(() => unsubscribe?.())

function formatTime(time) {
  const date = new Date(time)
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map(value => String(value).padStart(2, '0')).join(':')
}
function copyLogs() {
  const data = visibleEntries.value.slice().reverse().map(entry =>
    `${formatTime(entry.time)} ${entry.level.toUpperCase()} ${entry.message}`).join('\n')
  if (!data) return
  uni.setClipboardData({ data, success: () => uni.showToast({ title: '日志已复制', icon: 'none' }) })
}
</script>

<style scoped>
.console-panel { border: 1px solid var(--line, #e2e7e4); border-radius: 14px; background: var(--card, #fff); color: var(--text, #1e2d27); overflow: hidden; }
.console-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px; }
.console-title, .console-subtitle { display: block; }
.console-title { font-size: 16px; font-weight: 600; }
.console-subtitle, .console-note, .console-count { color: var(--muted, #6b7972); font-size: 12px; line-height: 1.6; }
.console-subtitle { margin-top: 4px; }
.console-toggle { flex-shrink: 0; color: var(--green, #16845e); font-size: 13px; }
.console-content { border-top: 1px solid var(--line, #e2e7e4); padding: 12px; }
.console-filters, .console-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.console-filter, .console-action { margin: 0; padding: 5px 10px; font-size: 12px; line-height: 1.5; border: 1px solid var(--line, #e2e7e4); border-radius: 6px; color: var(--text, #1e2d27); background: transparent; }
.console-filter::after, .console-action::after { border: none; }
.console-filter.selected { color: var(--green, #16845e); border-color: var(--green, #16845e); font-weight: 600; }
.console-action[disabled] { opacity: .45; }
.console-toolbar { margin: 12px 0 8px; }
.console-count { margin-right: auto; }
.console-logs { height: 340px; border: 1px solid var(--line, #e2e7e4); border-radius: 8px; background: var(--bg, #f6f8f7); }
.console-entry { padding: 10px 12px; border-bottom: 1px solid var(--line, #e2e7e4); }
.console-meta { display: flex; gap: 10px; margin-bottom: 4px; color: var(--muted, #6b7972); font-size: 10px; }
.warn .console-meta { color: var(--orange, #a56d15); }
.error .console-meta { color: var(--warn, #b94444); }
.console-message { display: block; white-space: pre-wrap; word-break: break-all; font-family: monospace; font-size: 12px; line-height: 1.6; }
.console-empty { padding: 28px 16px; color: var(--muted, #6b7972); font-size: 13px; line-height: 1.8; text-align: center; }
.console-note { display: block; margin-top: 10px; }
</style>
