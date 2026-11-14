<template>
  <view class="db-grid" :class="{ 'grid-light': light }">
    <view v-if="draftCount" class="grid-tools">
      <view class="grid-submit-tools">
        <text class="grid-pending">{{ draftCount }}条待提交</text>
        <view class="grid-column-button" @click="$emit('discard')">放弃</view>
        <view class="grid-column-button grid-submit" @click="finishAndSubmit">{{ submitting ? '提交中…' : '提交修改' }}</view>
      </view>
    </view>
    <view v-if="hasActiveQuery" class="grid-query-bar">
      <text>{{ columnQuery.filters.length }} 个列筛选{{ columnQuery.sortField ? ' · 已排序' : '' }}</text>
      <view class="grid-query-clear" @click="clearColumnQuery">清除筛选与排序</view>
    </view>
    <view v-if="showColumns" class="grid-column-options">
      <view v-for="column in availableColumns" :key="column.key" class="grid-option" :class="{ active: selectedColumns.includes(column.key) }" @click="toggleColumn(column.key)">
        {{ selectedColumns.includes(column.key) ? '✓ ' : '' }}{{ column.label }}
      </view>
      <view class="grid-option reset" @click="resetColumns">恢复默认</view>
    </view>
    <view v-if="rows.length" class="grid-layout">
      <view class="grid-scroll-wrap">
      <scroll-view class="grid-scroller" scroll-x :show-scrollbar="true" @scroll="onGridScroll">
        <view class="grid-content">
          <view class="grid-row grid-header">
            <view v-for="column in visibleColumns" :key="column.key" class="grid-cell grid-heading" :class="{ 'grid-heading-filtered': columnFilterCount(column.key) }" @click.stop="openColumnMenu(column)">
              <text class="grid-heading-label">{{ column.label }}</text>
              <text v-if="columnFilterCount(column.key)" class="grid-filter-badge">筛{{ columnFilterCount(column.key) }}</text>
              <text v-if="columnType(column.key)" class="grid-heading-control" :class="{ active: columnIsActive(column.key) }">{{ columnSortIndicator(column.key) }}⌄</text>
            </view>
          </view>
          <view v-for="(item, index) in rows" :key="rowKey(item, index)" class="grid-row" :class="{ selected: selectionMode && isSelected(item) }" @click="onRowClick(item)">
            <view v-for="column in visibleColumns" :key="column.key" class="grid-cell" :class="{ changed: hasDraft(item, column.key) }" @click.stop="onCellClick(item, column)">
              <template v-if="isEditing(item, column.key)">
                <switch v-if="editor.field.editor === 'switch'" :checked="editorBoolean" @change="editorBoolean = $event.detail.value; saveCellDraft()" color="#20b894" @click.stop />
                <picker v-else-if="editor.field.editor === 'select' && editorOptions.length" class="grid-inline-picker" mode="selector" :range="editorOptions" range-key="label" :value="Math.max(0, editorOptionIndex)" @change="editorOptionIndex = Number($event.detail.value); saveCellDraft()" @click.stop>
                  <view>{{ editorOptions[editorOptionIndex]?.label || editorValue || '请选择' }}</view>
                </picker>
                <textarea v-else-if="['TEXT', 'CLOB', 'JSON', 'JSONB', 'ARRAY'].includes(editor.field.type)" class="grid-inline-input grid-inline-textarea" v-model="editorValue" :maxlength="-1" :focus="true" @blur="saveCellDraft" @click.stop />
                <input v-else class="grid-inline-input" v-model="editorValue" :maxlength="-1" :type="editor.field.inputType || 'text'" :focus="true" @blur="saveCellDraft" @confirm="saveCellDraft" @click.stop />
              </template>
              <template v-else>
                <image v-if="images(item, column.key).length" class="grid-thumbnail" :src="resolveTrashBinImage(images(item, column.key)[0])" mode="aspectFill" />
                <text v-if="images(item, column.key).length > 1" class="grid-image-count">{{ images(item, column.key).length }}张</text>
                <text v-else-if="!images(item, column.key).length" class="grid-value">{{ displayValue(item, column.key) }}</text>
              </template>
            </view>
          </view>
        </view>
      </scroll-view>
      <view v-if="canScrollLeft" class="grid-edge grid-edge-left"><text>‹</text></view>
      <view v-if="canScrollRight" class="grid-edge grid-edge-right"><text>›</text></view>
      </view>
      <view class="grid-fixed">
        <view class="grid-row grid-header grid-actions">{{ selectionMode ? '选择' : '操作' }}</view>
        <view v-for="(item, index) in rows" :key="rowKey(item, index)" class="grid-row grid-actions" :class="{ selected: selectionMode && isSelected(item) }">
          <view v-if="selectionMode" class="grid-action" @click.stop="$emit('select', item)">{{ isSelected(item) ? '✓ 已选' : '选择' }}</view>
          <template v-else-if="editable">
            <view class="grid-action" @click.stop="$emit('edit', item)">编辑</view>
            <view class="grid-action delete" @click.stop="$emit('delete', item)">删除</view>
          </template>
          <view v-else class="grid-action" @click.stop="$emit('detail', item)">查看</view>
        </view>
      </view>
    </view>
    <view v-else class="grid-empty">暂无数据</view>
    <view v-if="columnMenu" class="grid-detail-overlay" @click="columnMenu = null">
      <view class="grid-detail grid-column-menu" @click.stop>
        <view class="grid-detail-header"><text>{{ columnMenu.label }}</text><text class="grid-detail-close" @click="columnMenu = null">关闭</text></view>
        <text class="column-menu-label">排序</text>
        <view class="column-menu-actions">
          <view class="column-menu-choice" :class="{ selected: columnQuery.sortField === columnMenu.key && columnQuery.direction === 'ASC' }" @click="applyColumnSort('ASC')">升序 ↑</view>
          <view class="column-menu-choice" :class="{ selected: columnQuery.sortField === columnMenu.key && columnQuery.direction === 'DESC' }" @click="applyColumnSort('DESC')">降序 ↓</view>
          <view class="column-menu-choice" @click="applyColumnSort('')">取消排序</view>
        </view>
        <text class="column-menu-label">筛选条件（全部满足）</text>
        <view v-if="currentColumnFilters.length" class="column-filter-list">
          <view v-for="filter in currentColumnFilters" :key="filter.index" class="column-filter-chip">
            <text>{{ formatColumnFilter(filter) }}</text>
            <text class="column-filter-remove" @click="removeColumnFilter(filter.index)">×</text>
          </view>
        </view>
        <picker mode="selector" :range="columnFilterOperators" range-key="label" :value="columnOperatorIndex" @change="columnOperatorIndex = Number($event.detail.value)">
          <view class="column-menu-input column-menu-picker">{{ columnFilterOperators[columnOperatorIndex]?.label }}</view>
        </picker>
        <template v-if="!['null', 'notNull'].includes(columnFilterOperators[columnOperatorIndex]?.value)">
          <picker v-if="columnValueOptions.length" mode="selector" :range="columnValueOptions" range-key="label" :value="columnValueIndex" @change="columnValueIndex = Number($event.detail.value)">
            <view class="column-menu-input column-menu-picker">{{ columnValueOptions[columnValueIndex]?.label || '请选择' }}</view>
          </picker>
          <template v-else>
            <input class="column-menu-input" v-model="columnFilterValue" :placeholder="columnFilterPlaceholder" :maxlength="500" />
            <view v-if="isDateColumn" class="column-menu-actions column-date-pickers">
              <picker mode="date" :value="columnPickerDate" @change="setColumnFilterDate">
                <view class="column-menu-choice">选择日期</view>
              </picker>
              <picker v-if="columnMenu.type === 'DATE'" mode="time" :value="columnPickerTime" @change="setColumnFilterTime">
                <view class="column-menu-choice">选择时间</view>
              </picker>
            </view>
          </template>
        </template>
        <view class="column-menu-actions column-menu-footer">
          <view class="column-menu-choice" @click="clearColumnFilter">清除此列筛选</view>
          <view class="column-menu-choice primary" @click="applyColumnFilter">添加条件</view>
        </view>
        <text class="column-menu-tip">筛选和排序作用于全部记录，与现有搜索条件同时生效。</text>
      </view>
    </view>
    <view v-if="detail" class="grid-detail-overlay" @click="detail = null">
      <view class="grid-detail" @click.stop>
        <view class="grid-detail-header"><text>{{ detail.label }}</text><text class="grid-detail-close" @click="detail = null">关闭</text></view>
        <scroll-view scroll-y class="grid-detail-body">
          <view v-if="detail.images" class="grid-detail-images">
            <image v-for="(src, index) in detail.images" :key="index" class="grid-detail-image" :src="resolveTrashBinImage(src)" mode="aspectFill" @click="previewImage(src)" />
          </view>
          <text v-else selectable>{{ detail.value }}</text>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick, getCurrentInstance } from 'vue'
import { resolveTrashBinImage, previewTrashBinImage } from '@/utils/trash-bin-image'
import { getAdminHistoryImage } from '@/api/database'

const props = defineProps({
  table: String, rows: { type: Array, default: () => [] }, schema: { type: Array, default: () => [] },
  selectionMode: Boolean, editable: Boolean, isSelected: Function, rowKey: Function,
  imageFields: Function, userNames: { type: Object, default: () => ({}) }, userIdFields: { type: Array, default: () => [] },
  editFields: { type: Array, default: () => [] }, drafts: { type: Object, default: () => ({}) }, draftKey: Function, submitting: Boolean,
  columnQuery: { type: Object, default: () => ({ filters: [], sortField: '', direction: '' }) },
  light: Boolean
})
const emit = defineEmits(['edit', 'delete', 'select', 'detail', 'stage', 'submit', 'discard', 'query-change'])
const selectedColumns = ref([]), showColumns = ref(false), detail = ref(null)
function toggleColumns() { showColumns.value = !showColumns.value }
defineExpose({ toggleColumns })
const editor = ref(null), editorValue = ref(''), editorBoolean = ref(false), editorOptionIndex = ref(0)
const columnMenu = ref(null), columnOperatorIndex = ref(0), columnFilterValue = ref(''), columnValueIndex = ref(0)
const hasActiveQuery = computed(() => !!(props.columnQuery.filters?.length || props.columnQuery.sortField))
const columnTypes = new Set(['STRING', 'CHAR', 'TEXT', 'UUID', 'ENUM', 'INTEGER', 'BIGINT', 'FLOAT', 'DOUBLE', 'DECIMAL', 'REAL', 'TINYINT', 'SMALLINT', 'BOOLEAN', 'DATE', 'DATEONLY'])
function columnType(key) {
  if (/(password|passwd|secret|token|salt|hash|credential|image|avatar|photo|blob|privatekey)/i.test(key)) return ''
  const type = String(props.schema.find(field => field.key === key)?.type || (/^(createdAt|updatedAt|deletedAt)$/.test(key) ? 'DATE' : '')).toUpperCase()
  return columnTypes.has(type) ? type : ''
}
function columnFilterCount(key) { return (props.columnQuery.filters || []).filter(filter => filter.field === key).length }
function columnIsActive(key) { return props.columnQuery.sortField === key || !!props.columnQuery.filters?.some(filter => filter.field === key) }
function columnSortIndicator(key) { return props.columnQuery.sortField === key ? (props.columnQuery.direction === 'ASC' ? '↑' : '↓') : '' }
const columnFilterOperators = computed(() => {
  const result = []
  if (['STRING', 'CHAR', 'TEXT', 'UUID'].includes(columnMenu.value?.type)) result.push({ label: '包含', value: 'contains' })
  result.push({ label: '等于', value: 'equals' })
  if (['INTEGER', 'BIGINT', 'FLOAT', 'DOUBLE', 'DECIMAL', 'REAL', 'TINYINT', 'SMALLINT', 'DATE', 'DATEONLY'].includes(columnMenu.value?.type)) {
    result.push({ label: '大于', value: 'gt' }, { label: '大于或等于', value: 'gte' }, { label: '小于', value: 'lt' }, { label: '小于或等于', value: 'lte' })
  }
  return [...result, { label: '为空值', value: 'null' }, { label: '不为空值', value: 'notNull' }]
})
const currentColumnFilters = computed(() => (props.columnQuery.filters || []).map((filter, index) => ({ ...filter, index })).filter(filter => filter.field === columnMenu.value?.key))
function formatColumnFilter(filter) {
  const label = ({ contains: '包含', equals: '等于', gt: '大于', gte: '大于或等于', lt: '小于', lte: '小于或等于', null: '为空值', notNull: '不为空值' })[filter.operator] || filter.operator
  const value = columnMenu.value?.type === 'BOOLEAN' ? (filter.value === 'true' ? '是' : '否') : filter.value
  return ['null', 'notNull'].includes(filter.operator) ? label : `${label} ${value === '' ? '（空字符串）' : value}`
}
function removeColumnFilter(index) {
  emit('query-change', { ...props.columnQuery, filters: (props.columnQuery.filters || []).filter((_, i) => i !== index) })
}
const columnValueOptions = computed(() => {
  if (columnMenu.value?.type === 'BOOLEAN') return [{ label: '是', value: 'true' }, { label: '否', value: 'false' }]
  const field = props.schema.find(entry => entry.key === columnMenu.value?.key)
  return columnMenu.value?.type === 'ENUM' ? (field?.values || []).map(value => ({ label: String(value), value: String(value) })) : []
})
const columnFilterPlaceholder = computed(() => columnMenu.value?.type === 'DATE' ? '输入完整时间，例如 2026-11-14 12:00:00' : columnMenu.value?.type === 'DATEONLY' ? '例如 2026-11-14' : '输入筛选值')

const isDateColumn = computed(() => ['DATE', 'DATEONLY'].includes(columnMenu.value?.type))
const columnPickerDate = computed(() => /^\d{4}-\d{2}-\d{2}/.exec(columnFilterValue.value)?.[0] || '')
const columnPickerTime = computed(() => /[ T](\d{2}:\d{2})/.exec(columnFilterValue.value)?.[1] || '00:00')
function setColumnFilterDate(event) {
  const date = event.detail.value
  if (columnMenu.value?.type === 'DATEONLY') { columnFilterValue.value = date; return }
  const time = /[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)$/.exec(columnFilterValue.value)?.[1]
  columnFilterValue.value = `${date} ${time || '00:00:00'}`
}
function setColumnFilterTime(event) {
  const date = columnPickerDate.value || (() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })()
  const suffix = /[ T]\d{2}:\d{2}(:\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(columnFilterValue.value)
  columnFilterValue.value = `${date} ${event.detail.value}${suffix?.[1] || ':00'}${suffix?.[2] || ''}`
}

function openColumnMenu(column) {
  const type = columnType(column.key)
  if (!type || props.selectionMode) return
  if (editor.value && !saveCellDraft()) return
  columnMenu.value = { ...column, type }
  columnOperatorIndex.value = 0
  columnFilterValue.value = ''
  columnValueIndex.value = 0
}
function applyColumnSort(direction) {
  emit('query-change', { ...props.columnQuery, sortField: direction ? columnMenu.value.key : '', direction })
  columnMenu.value = null
}
function clearColumnFilter() {
  emit('query-change', { ...props.columnQuery, filters: (props.columnQuery.filters || []).filter(entry => entry.field !== columnMenu.value.key) })
  columnMenu.value = null
}
function applyColumnFilter() {
  const operator = columnFilterOperators.value[columnOperatorIndex.value].value
  const value = columnValueOptions.value.length ? columnValueOptions.value[columnValueIndex.value].value : columnFilterValue.value
  if (!['null', 'notNull'].includes(operator) && !value && !['STRING', 'CHAR', 'TEXT'].includes(columnMenu.value.type)) {
    uni.showToast({ title: '请输入筛选值', icon: 'none' }); return
  }
  if (!['null', 'notNull'].includes(operator)) {
    const type = columnMenu.value.type
    if (['INTEGER', 'BIGINT', 'TINYINT', 'SMALLINT'].includes(type) && !/^-?\d+$/.test(value)) { uni.showToast({ title: '请输入有效整数', icon: 'none' }); return }
    if (['FLOAT', 'DOUBLE', 'DECIMAL', 'REAL'].includes(type) && !/^-?\d+(?:\.\d+)?$/.test(value)) { uni.showToast({ title: '请输入有效数字', icon: 'none' }); return }
    if (['DATE', 'DATEONLY'].includes(type) && !Number.isFinite(Date.parse(value))) { uni.showToast({ title: '请输入有效日期', icon: 'none' }); return }
  }
  const filters = [...(props.columnQuery.filters || [])]
  if (filters.length >= 20) { uni.showToast({ title: '最多添加20个条件', icon: 'none' }); return }
  const next = { field: columnMenu.value.key, operator, ...(!['null', 'notNull'].includes(operator) ? { value } : {}) }
  if (filters.some(entry => entry.field === next.field && entry.operator === next.operator && entry.value === next.value)) { uni.showToast({ title: '该条件已存在', icon: 'none' }); return }
  filters.push(next)
  emit('query-change', { ...props.columnQuery, filters })
  columnFilterValue.value = '' 
}
function clearColumnQuery() { emit('query-change', { filters: [], sortField: '', direction: '' }) }

const draftCount = computed(() => Object.keys(props.drafts).length)
const instance = getCurrentInstance()
const gridViewportWidth = ref(0), gridContentWidth = ref(0), gridScrollLeft = ref(0)
const maxGridScroll = computed(() => Math.max(0, gridContentWidth.value - gridViewportWidth.value))
const hasHorizontalOverflow = computed(() => gridViewportWidth.value > 0 && maxGridScroll.value > 2)
const canScrollLeft = computed(() => hasHorizontalOverflow.value && gridScrollLeft.value > 2)
const canScrollRight = computed(() => hasHorizontalOverflow.value && gridScrollLeft.value < maxGridScroll.value - 2)
function onGridScroll(event) {
  const info = event?.detail || {}
  if (Number.isFinite(Number(info.scrollLeft))) gridScrollLeft.value = Math.max(0, Number(info.scrollLeft))
  if (Number(info.scrollWidth) > 0) gridContentWidth.value = Number(info.scrollWidth)
}
async function measureGridScroll() {
  await nextTick()
  if (!props.rows.length || !instance?.proxy || typeof uni.createSelectorQuery !== 'function') {
    gridViewportWidth.value = 0; gridContentWidth.value = 0; gridScrollLeft.value = 0
    return
  }
  uni.createSelectorQuery().in(instance.proxy).select('.grid-scroller').boundingClientRect()
    .select('.grid-content').boundingClientRect().exec(result => {
      const viewport = result?.[0]?.width, content = result?.[1]?.width
      if (!(viewport > 0) || !(content > 0)) return
      gridViewportWidth.value = viewport
      gridContentWidth.value = content
      gridScrollLeft.value = Math.min(gridScrollLeft.value, Math.max(0, content - viewport))
    })
}
onMounted(() => { measureGridScroll(); uni.onWindowResize?.(measureGridScroll) })

const editorOptions = computed(() => editor.value?.field.options || [])
let clickTimer = null, previousCell = ''
function hasDraft(item, key) { return Object.prototype.hasOwnProperty.call(props.drafts[props.draftKey(item)]?.changes || {}, key) }
function fieldValue(item, key) { return hasDraft(item, key) ? props.drafts[props.draftKey(item)].changes[key] : item[key] }
function isEditing(item, key) { return editor.value && props.draftKey(editor.value.item) === props.draftKey(item) && editor.value.field.key === key }
function finishAndSubmit() {
  if (editor.value && !saveCellDraft()) return
  emit('submit')
}
function startCellEdit(item, column) {
  if (editor.value && !saveCellDraft()) return
  const field = props.editFields.find(entry => entry.key === column.key)
  if (props.submitting) return
  if (!props.editable || !field) {
    const schemaField = props.schema.find(entry => entry.key === column.key)
    const title = schemaField?.primaryKey || column.key === 'id' ? '主键不可直接修改' : '此列为只读或展示信息'
    uni.showToast({ title, icon: 'none' }); return
  }
  if (images(item, column.key).length || (['Message', 'GroupMessage'].includes(props.table) && column.key === 'content' && item.type !== 'text')) {
    uni.showToast({ title: '此内容请通过行编辑修改', icon: 'none' }); return
  }
  const value = fieldValue(item, column.key)
  editor.value = { item, table: props.table, rowKey: props.draftKey(item), field: { ...field, type: String(field.type || 'STRING').toUpperCase() } }
  editorBoolean.value = !!value
  editorValue.value = value == null ? '' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
  const index = (field.options || []).findIndex(option => String(option.value) === String(value))
  editorOptionIndex.value = index
}
function saveCellDraft() {
  if (!editor.value) return
  const { item, field } = editor.value, type = field.type
  let value = editorValue.value
  try {
    if (field.editor === 'switch') value = editorBoolean.value
    else if (field.editor === 'select' && editorOptions.value.length) {
      if (editorOptionIndex.value < 0) { editor.value = null; return true }
      value = editorOptions.value[editorOptionIndex.value].value
    }
    else if (['JSON', 'JSONB', 'ARRAY'].includes(type)) {
      if (!value.trim()) value = null
      else value = JSON.parse(value)
    } else if (['INTEGER', 'BIGINT', 'FLOAT', 'DOUBLE', 'DECIMAL', 'REAL', 'TINYINT', 'SMALLINT'].includes(type)) {
      if (!value.trim()) value = null
      else if (type === 'BIGINT') { if (!/^-?\d+$/.test(value)) throw new Error('请输入整数') }
      else if (type === 'DECIMAL') { if (!/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error('请输入有效数字') }
      else { value = Number(value); if (!Number.isFinite(value) || (['INTEGER', 'TINYINT', 'SMALLINT'].includes(type) && !Number.isInteger(value))) throw new Error('请输入有效数字') }
    } else if (!value && field.allowNull) value = null
    if ((value === null || value === '') && field.allowNull === false) throw new Error('该字段不能为空')
    if (editor.value.table === 'User' && field.key === 'username' && !String(value || '').trim()) throw new Error('用户名不能为空')
    if (editor.value.table === 'History' && field.key === 'confidence' && value !== null && (value < 0 || value > 1)) throw new Error('置信度须在0到1之间')
    if (['DATE', 'DATEONLY'].includes(type) && value && !Number.isFinite(new Date(value).getTime())) throw new Error('日期格式无效')
    emit('stage', { item, key: field.key, value, table: editor.value.table, rowKey: editor.value.rowKey })
    editor.value = null
    return true
  } catch (error) { uni.showToast({ title: error instanceof SyntaxError ? 'JSON格式无效' : error.message || '数据格式无效', icon: 'none' }); return false }
}

const storageKey = () => `admin-database-columns:${props.table}`
const labels = { id: 'ID', userId: '用户', username: '用户名', userName: '用户名', otherName: '对方', senderName: '发送者', receiverName: '接收者', deviceName: '设备', imagePath: '图片', imageUrl: '识别图片', content: '内容', createdAt: '创建时间', updatedAt: '更新时间', connectedAt: '连接时间', sendTime: '发送时间', hasImage: '识别图片', confidence: '置信度', category: '分类', source: '来源', status: '状态', name: '名称', type: '类型', points: '积分', description: '说明', describe: '描述', isRead: '已读', isWithdraw: '已撤回' }
const hidden = new Set(['password', 'token', 'deviceToken', 'device_token', 'encryptedData', 'documentHash', 'webSessionId', 'webCodeHash', 'webTokenHash', 'imageUrlLength'])
function fieldLabel(key) {
  const fromSchema = props.schema.find(field => field.key === key)?.label
  return labels[key] || (fromSchema && fromSchema !== key ? fromSchema : key.replace(/([a-z0-9])([A-Z])/g, '$1 $2'))
}
const availableColumns = computed(() => {
  const keys = new Set()
  const relatedNames = new Set(['username', 'userName', 'otherName', 'senderName', 'receiverName'])
  const schemaKeys = new Set(props.schema.map(field => field.key))
  props.rows.forEach(row => Object.keys(row || {}).forEach(key => {
    if (relatedNames.has(key) && props.schema.length && !schemaKeys.has(key)) return
    if (!hidden.has(key) && !/(password|passwd|secret|token|salt|hash|credential|privatekey)/i.test(key)) keys.add(key)
  }))
  return [...keys].map(key => ({ key, label: fieldLabel(key) }))
})
function defaults() {
  const keys = availableColumns.value.map(column => column.key)
  const priority = ['id', 'userId', 'username', 'userName', 'otherName', 'senderName', 'receiverName', 'deviceName', 'name', 'category', 'type', 'status', 'content', 'imagePath', 'images', 'hasImage', 'createdAt']
  return [...priority.filter(key => keys.includes(key)), ...keys.filter(key => !priority.includes(key))]
}
function restoreColumns() {
  let saved
  try { saved = uni.getStorageSync(storageKey()) } catch {}
  const available = new Set(availableColumns.value.map(column => column.key))
  selectedColumns.value = Array.isArray(saved) ? saved.filter(key => available.has(key)) : defaults()
  if (!selectedColumns.value.length && available.size) selectedColumns.value = defaults()
}
onBeforeUnmount(() => { if (clickTimer) clearTimeout(clickTimer); if (editor.value) saveCellDraft(); uni.offWindowResize?.(measureGridScroll) })
watch(() => props.rows, () => { if (editor.value) saveCellDraft() }, { flush: 'sync' })
watch(() => props.table, () => { columnMenu.value = null; if (clickTimer) clearTimeout(clickTimer); clickTimer = null; previousCell = ''; if (editor.value) saveCellDraft(); editor.value = null })
watch(() => [props.table, availableColumns.value.map(column => column.key).join('|')], () => { showColumns.value = false; detail.value = null; restoreColumns() }, { immediate: true })
const visibleColumns = computed(() => selectedColumns.value.map(key => availableColumns.value.find(column => column.key === key)).filter(Boolean))
watch(() => [props.table, props.rows.length, visibleColumns.value.map(column => column.key).join('|')], measureGridScroll, { flush: 'post' })
function saveColumns() { try { uni.setStorageSync(storageKey(), selectedColumns.value) } catch {} }
function toggleColumn(key) {
  if (selectedColumns.value.includes(key)) {
    if (selectedColumns.value.length === 1) { uni.showToast({ title: '至少保留一列', icon: 'none' }); return }
    selectedColumns.value = selectedColumns.value.filter(value => value !== key)
  } else selectedColumns.value = [...selectedColumns.value, key]
  saveColumns()
}
function resetColumns() { selectedColumns.value = defaults(); saveColumns() }
function images(item, key) {
  if ((props.table === 'Device' && key === 'imagePath') || (props.table === 'User' && key === 'avatar')) return item[key] ? [item[key]] : []
  return props.imageFields?.(props.table, key, item[key], item.type) || []
}
function displayValue(item, key) {
  const value = fieldValue(item, key)
  if (value === undefined || value === null || value === '') return '—'
  if (props.userIdFields.includes(key)) return `${props.userNames[String(value)] || '未知'} (ID: ${value})`
  const relatedName = { userId: item.username || item.userName, otherId: item.otherName, senderId: item.senderName, receiverId: item.receiverName }[key]
  if (relatedName) return `${relatedName} (ID: ${value})`
  if (key === 'hasImage' && props.table === 'History') return value ? '点击查看图片' : '暂无图片'
  if (key === 'source') return ({ online: '在线识别', device: '设备分类' })[value] || String(value)
  if (typeof value === 'boolean' || (props.schema.find(field => field.key === key)?.type === 'BOOLEAN' && (value === 0 || value === 1))) return value ? '是' : '否'
  if (/^(createdAt|updatedAt|connectedAt|sendTime|verifiedAt|expiresAt|readAt)$/.test(key)) {
    const date = new Date(value)
    if (Number.isFinite(date.getTime())) return date.toLocaleString()
  }
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'string' && (/^data:image\//i.test(value) || (value.length > 500 && /^(?:iVBORw0KGgo|\/9j\/|UklGR|R0lGOD)/.test(value)))) return '[图片数据]'
  return String(value)
}
function onRowClick(item) { if (props.selectionMode) emit('select', item) }
async function previewImage(src) {
  try { await previewTrashBinImage(src) } catch { uni.showToast({ title: '图片预览失败', icon: 'none' }) }
}
function onCellClick(item, column) {
  if (props.selectionMode) { emit('select', item); return }
  const cell = `${props.draftKey(item)}:${column.key}`
  if (clickTimer && previousCell === cell) {
    clearTimeout(clickTimer); clickTimer = null; previousCell = ''
    startCellEdit(item, column)
    return
  }
  if (clickTimer) clearTimeout(clickTimer)
  previousCell = cell
  clickTimer = setTimeout(() => { clickTimer = null; previousCell = ''; showCell(item, column) }, 300)
}
async function showCell(item, column) {
  if (props.table === 'History' && column.key === 'hasImage' && item.hasImage) {
    uni.showLoading({ title: '图片加载中' })
    try {
      const response = await getAdminHistoryImage(item.id)
      if (response?.code !== 0 || !response.data?.imageUrl) throw new Error('图片加载失败')
      uni.hideLoading()
      await previewImage(response.data.imageUrl)
    } catch { uni.hideLoading(); uni.showToast({ title: '图片加载失败', icon: 'none' }) }
    return
  }
  const sources = images(item, column.key)
  if (sources.length > 1) { detail.value = { label: column.label, images: sources }; return }
  if (sources.length) { await previewImage(sources[0]); return }
}
</script>

<style scoped>
.db-grid { min-width: 0; }
.grid-tools { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16rpx; padding: 8rpx 0 14rpx; }
.grid-submit-tools { display: flex; align-items: center; gap: 10rpx; }
.grid-pending { color: #ffe29a; font-size: 20rpx; white-space: nowrap; }
.grid-submit { background: #1cb397; color: #fff; border-color: #1cb397; }
.grid-column-button, .grid-option { color: #8eeaff; background: rgba(64,224,255,.1); border: 1px solid rgba(64,224,255,.25); border-radius: 10rpx; padding: 8rpx 14rpx; font-size: 22rpx; }
.grid-column-options { display: flex; flex-wrap: wrap; gap: 10rpx; padding: 4rpx 0 16rpx; }
.grid-option.active { color: #002e3e; background: #61dded; }
.grid-option.reset { color: #fff; }
.grid-layout { display: flex; width: 100%; min-width: 0; border: 1px solid rgba(64,224,255,.25); border-radius: 12rpx; overflow: hidden; }
.grid-scroll-wrap { position: relative; flex: 1; min-width: 0; width: 1px; }
.grid-scroller { width: 100%; }
.grid-edge { position: absolute; top: 0; bottom: 0; width: 34rpx; display: flex; align-items: center; pointer-events: none; z-index: 2; color: #d8fbff; font-size: 42rpx; font-weight: 700; }
.grid-edge-left { left: 0; padding-left: 4rpx; background: linear-gradient(90deg, rgba(0,15,28,.8), transparent); }
.grid-edge-right { right: 0; justify-content: flex-end; padding-right: 4rpx; background: linear-gradient(270deg, rgba(0,15,28,.8), transparent); }
.grid-content { display: inline-flex; flex-direction: column; min-width: 100%; }
.grid-row { display: flex; align-items: center; height: 88rpx; min-height: 88rpx; box-sizing: border-box; border-bottom: 1px solid rgba(64,224,255,.14); background: #062a40; }
.grid-row:last-child { border-bottom: 0; }
.grid-row.selected { background: #15576b; }
.grid-header { background: #10445b; color: #9eeeff; font-weight: 600; }
.grid-cell { width: 220rpx; min-width: 220rpx; height: 100%; box-sizing: border-box; display: flex; align-items: center; gap: 8rpx; padding: 0 16rpx; border-right: 1px solid rgba(64,224,255,.12); font-size: 22rpx; color: #eafaff; overflow: hidden; }
.grid-cell.changed { background: rgba(240, 193, 77, .16); box-shadow: inset 0 -3rpx #f0c14d; }
.grid-heading { justify-content: space-between; cursor: pointer; }
.grid-header .grid-heading-filtered { background: #235d65; box-shadow: inset 0 -5rpx #f5d47d; }
.grid-filter-badge { flex-shrink: 0; padding: 3rpx 7rpx; border-radius: 7rpx; color: #183b3d; background: #f5d47d; font-size: 18rpx; line-height: 1.3; font-weight: 700; }
.grid-heading-label { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.grid-heading-control { flex-shrink: 0; padding: 4rpx 6rpx; color: #8fc3ce; font-size: 23rpx; }
.grid-heading-control.active { color: #ffe29a; }
.grid-query-bar { display: flex; justify-content: space-between; align-items: center; gap: 10rpx; color: #b9dce5; font-size: 20rpx; padding: 0 0 12rpx; }
.grid-query-clear { color: #88e9f7; }
.grid-header .grid-cell { color: #9eeeff; }
.grid-value { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.grid-thumbnail { width: 64rpx; height: 64rpx; border-radius: 8rpx; flex-shrink: 0; }
.grid-image-count { color: #9eeaff; font-size: 18rpx; }
.grid-fixed { flex: 0 0 156rpx; border-left: 2rpx solid rgba(112,226,241,.6); box-shadow: -7rpx 0 16rpx rgba(0,0,0,.35); z-index: 1; }
.grid-fixed .grid-row { background: #103c4c; }
.grid-fixed .grid-header { background: #1a5363; }
.grid-fixed .grid-row.selected { background: #1c6270; }
.grid-actions { justify-content: center; gap: 12rpx; padding: 0 8rpx; font-size: 21rpx; }
.grid-action { color: #80e8ff; white-space: nowrap; }
.grid-action.delete { color: #ff9d9d; }
.grid-empty { color: #91a8b8; text-align: center; padding: 40rpx; font-size: 24rpx; }
.grid-detail-overlay { position: fixed; inset: 0; z-index: 1100; background: rgba(0,0,0,.65); display: flex; align-items: center; justify-content: center; }
.grid-detail { width: 86%; max-width: 900rpx; max-height: 70vh; background: #092d42; border: 1px solid rgba(64,224,255,.35); border-radius: 16rpx; padding: 24rpx; box-sizing: border-box; }
.grid-detail-header { display: flex; justify-content: space-between; gap: 20rpx; color: #8eeaff; font-size: 26rpx; margin-bottom: 20rpx; }
.grid-detail-close { flex-shrink: 0; color: #fff; }
.grid-inline-input, .grid-inline-picker { width: 100%; height: 64rpx; box-sizing: border-box; background: #17475a; border: 1px solid #5de3f4; color: #fff; border-radius: 6rpx; padding: 7rpx; font-size: 22rpx; }
.grid-inline-textarea { height: 70rpx; }
.grid-inline-picker { display: flex; align-items: center; }
.grid-editor-input { display: block; width: 100%; box-sizing: border-box; background: #123e52; border: 1px solid rgba(64,224,255,.4); color: #fff; border-radius: 10rpx; padding: 12rpx 16rpx; font-size: 24rpx; min-height: 68rpx; }
.grid-editor-textarea { height: 230rpx; }
.grid-editor-switch { display: flex; align-items: center; justify-content: space-between; color: #fff; }
.grid-editor-hint { color: #a4c1cd; font-size: 20rpx; margin-top: 14rpx; }
.grid-editor-actions { display: flex; justify-content: flex-end; gap: 14rpx; margin-top: 20rpx; }
.grid-column-menu { max-width: 640rpx; overflow-y: auto; }
 .column-filter-list { display: flex; flex-wrap: wrap; gap: 10rpx; margin-bottom: 12rpx; }
.column-filter-chip { display: flex; align-items: center; gap: 10rpx; color: #bcecf2; background: rgba(64,224,255,.12); border: 1px solid rgba(64,224,255,.22); border-radius: 9rpx; padding: 8rpx 12rpx; font-size: 21rpx; word-break: break-all; }
.column-filter-remove { color: #fff; font-size: 28rpx; line-height: 1; padding: 2rpx 4rpx; }
.column-menu-label { display: block; color: #a5ccd7; font-size: 22rpx; margin: 18rpx 0 10rpx; }
.column-menu-actions { display: flex; gap: 10rpx; flex-wrap: wrap; }
.column-menu-choice { color: #b6e9f1; border: 1px solid rgba(100,220,235,.3); background: rgba(64,224,255,.08); border-radius: 9rpx; padding: 11rpx 16rpx; font-size: 22rpx; }
.column-menu-choice.selected, .column-menu-choice.primary { color: #06323a; background: #68dce7; border-color: #68dce7; }
.column-menu-input { width: 100%; box-sizing: border-box; min-height: 68rpx; margin: 10rpx 0; padding: 12rpx 16rpx; border: 1px solid rgba(100,220,235,.35); border-radius: 9rpx; background: #123e52; color: #fff; font-size: 24rpx; }
.column-menu-picker { display: flex; align-items: center; }
.column-date-pickers { margin-top: 2rpx; }
.column-menu-footer { justify-content: flex-end; margin-top: 18rpx; }
.column-menu-tip { display: block; color: #8aabba; font-size: 19rpx; margin-top: 16rpx; }
.grid-detail-images { display: flex; flex-wrap: wrap; gap: 14rpx; }
.grid-detail-image { width: 140rpx; height: 140rpx; border-radius: 10rpx; }
.grid-detail-body { max-height: 55vh; color: #f2f9fc; font-size: 24rpx; word-break: break-all; white-space: pre-wrap; }

.db-grid.grid-light .grid-pending { color: #547267; }
.db-grid.grid-light .grid-submit { color: #fff; background: #278b68; border-color: #278b68; }
.db-grid.grid-light .grid-column-button,
.db-grid.grid-light .grid-option { color: #28684f; background: #f0f8f3; border-color: #c9e3d3; }
.db-grid.grid-light .grid-option.active { color: #174b37; background: #d6eddf; }
.db-grid.grid-light .grid-option.reset { color: #28684f; }
.db-grid.grid-light .grid-layout { border-color: #c9ddd0; background: #fff; }
.db-grid.grid-light .grid-edge { color: #315c49; }
.db-grid.grid-light .grid-edge-left { background: linear-gradient(90deg, rgba(255,255,255,.9), transparent); }
.db-grid.grid-light .grid-edge-right { background: linear-gradient(270deg, rgba(255,255,255,.9), transparent); }
.db-grid.grid-light .grid-row { color: #294438; background: #fff; border-bottom-color: #e5eee8; }
.db-grid.grid-light .grid-row.selected { background: #e8f5ed; }
.db-grid.grid-light .grid-header,
.db-grid.grid-light .grid-header .grid-cell { color: #315d49; background: #edf6f0; }
.db-grid.grid-light .grid-cell { color: #294438; border-right-color: #e5eee8; }
.db-grid.grid-light .grid-cell.changed { background: #eff8e9; box-shadow: inset 0 -3rpx #92c66d; }
.db-grid.grid-light .grid-header .grid-heading-filtered { color: #185f43; background: #d5eee0; box-shadow: inset 0 -5rpx #219765; }
.db-grid.grid-light .grid-filter-badge { color: #fff; background: #23865b; }
.db-grid.grid-light .grid-heading-control { color: #789486; }
.db-grid.grid-light .grid-heading-control.active { color: #26704d; }
.db-grid.grid-light .grid-query-bar { color: #597368; }
.db-grid.grid-light .grid-query-clear { color: #27805b; }
.db-grid.grid-light .grid-image-count { color: #467b60; }
.db-grid.grid-light .grid-fixed { border-left-color: #c6ddce; box-shadow: -7rpx 0 16rpx rgba(36,75,52,.1); }
.db-grid.grid-light .grid-fixed .grid-row { color: #294438; background: #f8fbf9; }
.db-grid.grid-light .grid-fixed .grid-header { color: #315d49; background: #edf6f0; }
.db-grid.grid-light .grid-fixed .grid-row.selected { background: #e3f2e8; }
.db-grid.grid-light .grid-action { color: #287653; }
.db-grid.grid-light .grid-action.delete { color: #bd4e4e; }
.db-grid.grid-light .grid-empty { color: #71877a; }
.db-grid.grid-light .grid-detail-overlay { background: rgba(28,48,36,.38); }
.db-grid.grid-light .grid-detail { color: #294438; background: #fff; border-color: #c9ddd0; }
.db-grid.grid-light .grid-detail-header { color: #315d49; }
.db-grid.grid-light .grid-detail-close { color: #52695d; }
.db-grid.grid-light .grid-detail-body { color: #294438; }
.db-grid.grid-light .grid-inline-input,
.db-grid.grid-light .grid-inline-picker,
.db-grid.grid-light .grid-editor-input,
.db-grid.grid-light .column-menu-input { color: #294438; background: #fff; border-color: #b9d5c3; }
.db-grid.grid-light .grid-editor-switch { color: #294438; }
.db-grid.grid-light .grid-editor-hint { color: #71877a; }
.db-grid.grid-light .column-filter-chip { color: #365e49; background: #eef7f0; border-color: #cfe3d5; }
.db-grid.grid-light .column-filter-remove { color: #52695d; }
.db-grid.grid-light .column-menu-label { color: #567064; }
.db-grid.grid-light .column-menu-choice { color: #365e49; background: #f7fbf8; border-color: #cfe1d5; }
.db-grid.grid-light .column-menu-choice.selected,
.db-grid.grid-light .column-menu-choice.primary { color: #fff; background: #338760; border-color: #338760; }
.db-grid.grid-light .column-menu-tip { color: #71877a; }
</style>
