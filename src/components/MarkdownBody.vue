<template>
  <!-- #ifdef H5 -->
  <view :class="['md-body', variant ? `md-body--${variant}` : '']" v-html="renderedHtml" />
  <!-- #endif -->
  <!-- #ifndef H5 -->
  <view :class="['md-body', variant ? `md-body--${variant}` : '']">
    <mp-html
      v-if="mpHtmlReady"
      :content="renderedHtml"
      :selectable="false"
      :lazy-load="true"
      :preview-img="false"
    />
    <text v-else class="md-text">{{ plainText }}</text>
  </view>
  <!-- #endif -->
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { renderMarkdown } from '@/utils/renderMarkdown'

const props = defineProps({
  markdown: {
    type: String,
    default: ''
  },
  variant: {
    type: String,
    default: 'default'
  }
})

const renderedHtml = computed(() => renderMarkdown(props.markdown || ''))

// #ifndef H5
// 小程序专用状态：mp-html 组件是否可用
const mpHtmlReady = ref(false)

onMounted(() => {
  // #ifndef H5
  // 检测 mp-html 组件是否可用
  try {
    const hasNativePlugin = typeof uni.requireNativePlugin === 'function'
    mpHtmlReady.value = hasNativePlugin
  } catch (_) {
    mpHtmlReady.value = false
  }
  // #endif
})
// #endif

// 小程序专用：提取纯文本用于降级显示
// #ifdef H5
const plainText = computed(() => '')
// #endif
// #ifndef H5
const plainText = computed(() => {
  if (!props.markdown) return ''
  return props.markdown
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/^\s*[-*+]\s*/gm, '')
    .replace(/^\s*\d+\.\s*/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
})
// #endif
</script>

<style scoped>
/* 全端 Markdown 气泡样式 */
.md-body {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-primary, #1a1a1a);
  word-break: break-word;
  overflow-wrap: break-word;
}

.md-body :deep(h1),
.md-body :deep(h2),
.md-body :deep(h3) {
  font-weight: 600;
  line-height: 1.4;
  margin: 0.6em 0 0.3em;
}

.md-body :deep(h1) { font-size: 1.2em; }
.md-body :deep(h2) { font-size: 1.1em; }
.md-body :deep(h3) { font-size: 1em; }

.md-body :deep(p) {
  margin: 0.35em 0;
}

.md-body :deep(ul),
.md-body :deep(ol) {
  margin: 0.35em 0;
  padding-left: 1.5em;
}

.md-body :deep(li) {
  margin: 0.2em 0;
}

/* 消除松散列表里 li>p 的双倍 margin */
.md-body :deep(li > p) {
  margin: 0;
}

.md-body :deep(strong) {
  font-weight: 600;
}

.md-body :deep(code) {
  font-family: 'Courier New', Courier, monospace;
  font-size: 0.88em;
  background: rgba(0, 0, 0, 0.06);
  padding: 0.1em 0.35em;
  border-radius: 3px;
}

.md-body :deep(pre) {
  overflow-x: auto;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 6px;
  padding: 0.6em 0.8em;
  margin: 0.4em 0;
}

.md-body :deep(pre code) {
  background: none;
  padding: 0;
  font-size: 0.85em;
}

.md-body :deep(blockquote) {
  border-left: 3px solid var(--accent, #4D6BFE);
  margin: 0.4em 0;
  padding: 0.2em 0.6em;
  color: var(--text-secondary, #6B7280);
}

.md-body :deep(a) {
  color: var(--accent, #4D6BFE);
  text-decoration: none;
}

.md-body :deep(hr) {
  border: none;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  margin: 0.6em 0;
}

.md-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9em;
  margin: 0.4em 0;
}

.md-body :deep(th),
.md-body :deep(td) {
  border: 1px solid rgba(0, 0, 0, 0.1);
  padding: 0.3em 0.5em;
  text-align: left;
}

.md-body :deep(img) {
  max-width: 100%;
  border-radius: 4px;
}

/* 空段落不占位 */
.md-body :deep(p:empty) {
  min-height: 0;
  margin: 0;
}

/* 小程序降级纯文本样式 */
.md-text {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-primary, #1a1a1a);
  word-break: break-word;
  white-space: pre-wrap;
}

/* reasoning variant 下的纯文本样式 */
.md-body.md-body--reasoning .md-text {
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-secondary, #6B7280);
}

/* ── reasoning variant（深度思考折叠区内）：更紧凑、更浅 ── */
.md-body.md-body--reasoning {
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-secondary, #6B7280);
}
.md-body.md-body--reasoning :deep(p) {
  margin: 0.18em 0;
}
.md-body.md-body--reasoning :deep(ul),
.md-body.md-body--reasoning :deep(ol) {
  margin: 0.18em 0;
  padding-left: 1.3em;
}
.md-body.md-body--reasoning :deep(li) {
  margin: 0.1em 0;
}
.md-body.md-body--reasoning :deep(h1),
.md-body.md-body--reasoning :deep(h2),
.md-body.md-body--reasoning :deep(h3) {
  font-size: 0.95em;
  margin: 0.4em 0 0.15em;
}
.md-body.md-body--reasoning :deep(code) {
  font-size: 0.82em;
}
.md-body.md-body--reasoning :deep(pre) {
  padding: 0.4em 0.6em;
  margin: 0.3em 0;
}
.md-body.md-body--reasoning :deep(blockquote) {
  margin: 0.3em 0;
  padding: 0.1em 0.5em;
}
.md-body.md-body--reasoning :deep(strong) {
  color: var(--text-primary, #374151);
}

/* 深色主题适配 */
.shell.dark-theme .md-body :deep(code) {
  background: rgba(255, 255, 255, 0.08);
}
.shell.dark-theme .md-body :deep(pre) {
  background: rgba(255, 255, 255, 0.05);
}
.shell.dark-theme .md-body :deep(th),
.shell.dark-theme .md-body :deep(td) {
  border-color: rgba(255, 255, 255, 0.1);
}
.shell.dark-theme .md-body :deep(blockquote) {
  border-color: var(--btn-think-active-text, #8BA4FF);
}
.shell.dark-theme .md-body--reasoning :deep(strong) {
  color: var(--text-primary, #E5E7EB);
}
</style>
