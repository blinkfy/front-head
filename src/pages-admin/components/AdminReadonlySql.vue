<template>
  <view class="sql-tool" :class="{ light }">
    <view class="sql-content">
      <textarea v-model="sql" class="sql-input" maxlength="10000" placeholder="输入 SELECT 查询，例如 SELECT * FROM Users" />
      <view class="sql-actions">
        <text>可等价转换的 SQL 同步页面控件；其余查询按 SQL 展示结果</text>
        <view class="sql-run" :class="{ disabled: loading }" @click="execute">{{ loading ? '查询中…' : '执行查询' }}</view>
      </view>
      <text v-if="error" class="sql-error">{{ error }}</text>
    </view>
  </view>
</template>

<script setup>
import { ref, watch } from 'vue'
import { queryReadonlySql } from '@/api/database'
const props = defineProps({ light: Boolean, listSql: { type: String, default: '' }, listSqlRevision: { type: Number, default: 0 }, syncSql: Function })
const emit = defineEmits(['result', 'query-start', 'query-end'])
const sql = ref('')
const loading = ref(false)
const error = ref('')
let queryVersion = 0
let lastExecutedSql = ''
function invalidateQuery() { queryVersion++; loading.value = false; emit('query-end') }
defineExpose({ cancelPending: invalidateQuery, rerunLast: () => runSql(lastExecutedSql), executeDirect: query => {
  if (loading.value) return
  sql.value = query
  error.value = ''
  return runSql(query)
} })
watch(() => [props.listSqlRevision, props.listSql], () => { invalidateQuery(); sql.value = props.listSql; error.value = '' }, { immediate: true })
async function execute() {
  if (loading.value) return
  error.value = ''
  if (!sql.value.trim()) { error.value = '请输入 SELECT 查询'; return }
  if (props.syncSql?.(sql.value)) return
  await runSql(sql.value)
}
async function runSql(query) {
  if (!query || loading.value) return
  const version = ++queryVersion
  loading.value = true
  emit('query-start')
  try {
    const response = await queryReadonlySql(query)
    if (response.code !== 0) throw new Error(response.msg || '查询失败')
    if (version === queryVersion) { lastExecutedSql = query; emit('result', { ...response.data, sql: query }) }
  } catch (e) { if (version === queryVersion) error.value = e.msg || e.message || '查询失败' }
  finally { if (version === queryVersion) { loading.value = false; emit('query-end') } }
}
</script>

<style scoped>
.sql-tool { margin: 0 0 18rpx; color: #c9e8f2; }
.sql-content { margin-top: 10rpx; padding: 18rpx; border: 1px solid #1f6077; border-radius: 14rpx; background: #08263a; }
.sql-input { box-sizing: border-box; width: 100%; height: 140rpx; padding: 14rpx; border: 1px solid #24556a; border-radius: 8rpx; background: #041d2e; color: #e4f5f8; font: 24rpx monospace; }
.sql-actions { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; margin-top: 12rpx; color: #93b4c3; font-size: 22rpx; }
.sql-run { padding: 10rpx 22rpx; border-radius: 8rpx; color: #fff; background: #087e87; white-space: nowrap; }
.disabled { opacity: .5; }
.sql-error { display: block; margin-top: 12rpx; color: #ff9999; font-size: 23rpx; word-break: break-all; }
.light { color: #24453a; }.light .sql-content { background: #fff; border-color: #cce9da; }.light .sql-input { background: #f5faf7; border-color: #cce9da; color: #243d36; }.light .sql-actions { color: #617a72; }.light .sql-error { color: #b43d3d; }
</style>
