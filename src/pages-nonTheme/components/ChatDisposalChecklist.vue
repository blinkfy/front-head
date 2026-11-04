<template>
  <view v-if="checklist" class="disposal-checklist">
    <view class="checklist-heading">
      <text class="checklist-title">物品投放清单</text>
      <button size="mini" @tap.stop="copyChecklist">复制清单</button>
    </view>
    <text class="checklist-caption">来自 {{ checklist.recordCount }} 条识别记录 · {{ checklist.items.length }} 项</text>
    <checkbox-group @change="setChecked">
      <view v-for="group in groups" :key="group.category" class="checklist-group">
        <text class="checklist-group-title">{{ group.category }} · {{ group.items.length }} 项</text>
        <text class="checklist-guide">{{ group.guide }}</text>
        <view v-for="item in group.items" :key="item.key" class="checklist-item">
          <label class="checklist-label">
            <checkbox :value="item.key" :checked="checked.includes(item.key)" :disabled="!isChecklistItemCheckable(item)" color="#4d6bfe" />
            <view class="checklist-copy">
              <text class="checklist-name">{{ item.name }}</text>
              <text v-if="item.confidence != null" class="checklist-meta">识别置信度 {{ Math.round(item.confidence * 100) }}%</text>
              <text v-if="item.reviewReason" class="checklist-review">{{ item.reviewReason }}</text>
            </view>
          </label>
          <button size="mini" class="checklist-source" @tap.stop="emit('inspect', item)">原识别</button>
        </view>
      </view>
    </checkbox-group>
    <text v-if="checklist.missingCount" class="checklist-note">有 {{ checklist.missingCount }} 条所选记录无法读取，未纳入清单。</text>
    <text v-if="checklist.truncated" class="checklist-note">本次最多展示30项，请减少所选记录后查看其余物品。</text>
    <text class="checklist-note">沿用原识别结果，未重新识别。以当地分类标识为准，待确认项先不要投放。勾选用于本次核对。</text>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { normalizeChatChecklist, CHECKLIST_CATEGORIES, CHECKLIST_GUIDES, checklistText, isChecklistItemCheckable } from '../utils/ai-chat-checklist.mjs'
const props = defineProps({ value: { type: Object, default: null } })
const emit = defineEmits(['inspect'])
const checklist = computed(() => normalizeChatChecklist(props.value))
const checked = ref([])
const groups = computed(() => CHECKLIST_CATEGORIES.map(category => ({ category, guide: CHECKLIST_GUIDES[category],
  items: checklist.value?.items.filter(item => item.category === category) || [] })).filter(group => group.items.length))
watch(() => props.value, () => { checked.value = [] })
function setChecked(event) {
  const eligible = new Set((checklist.value?.items || []).filter(isChecklistItemCheckable).map(item => item.key))
  checked.value = (Array.isArray(event?.detail?.value) ? event.detail.value : []).filter(key => eligible.has(key))
}
function copyChecklist() {
  const data = checklistText(checklist.value)
  if (data) uni.setClipboardData({ data })
}
</script>

<style scoped>
.checklist-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.checklist-title { font-size: 15px; font-weight: 600; }
.checklist-heading button, .checklist-source { margin: 0; padding: 0 8px; font-size: 11px; line-height: 28px; border-radius: 7px; color: var(--accent, #4d6bfe); background: var(--bg-primary, #fff); flex-shrink: 0; }
.checklist-heading button::after, .checklist-source::after { border: 0; }
.checklist-caption, .checklist-guide, .checklist-meta, .checklist-note { display: block; color: var(--text-secondary, #667085); font-size: 11px; line-height: 1.6; }
.checklist-caption { margin-top: 4px; }
.checklist-group { margin-top: 14px; }
.checklist-group-title { display: block; font-size: 13px; font-weight: 600; margin-bottom: 3px; }
.checklist-item { display: flex; align-items: flex-start; gap: 6px; padding: 8px 0; border-bottom: 1px solid var(--border-light, #e5e7eb); }
.checklist-label { flex: 1; min-width: 0; display: flex; align-items: flex-start; gap: 3px; }
.checklist-label checkbox { flex-shrink: 0; transform: scale(.8); transform-origin: left top; }
.checklist-copy { min-width: 0; flex: 1; }
.checklist-name { display: block; font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
.checklist-review { display: block; color: var(--text-secondary, #667085); font-size: 11px; line-height: 1.6; margin-top: 3px; overflow-wrap: anywhere; }
.checklist-note { margin-top: 10px; }
</style>
