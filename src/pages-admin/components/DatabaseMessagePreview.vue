<template>
  <view class="message-preview" aria-label="私聊消息关系详情">
    <view class="preview-head">
      <view><text class="caption">私聊消息</text><text class="title">{{ sent ? '发出的消息' : '收到的消息' }}</text></view>
      <button class="close" aria-label="关闭消息详情" @click="$emit('close')">×</button>
    </view>
    <view class="roles">
      <button v-for="role in roles" :key="role.key" :class="{ selected: role.key === selected.key }"
        :aria-pressed="role.key === selected.key" @click="$emit('select', role.key)">{{ role.role }}</button>
    </view>
    <text class="mapping">Message.{{ field }} → User.id</text>
    <button v-if="!user" class="action" @click="$emit('choose-user')">选择用户看消息</button>
    <template v-else>
      <view class="summary"><text>{{ user.username || '用户' }} #{{ user.id }}</text><text>{{ total == null ? '未统计' : total + ' 条' }}</text></view>
      <text v-if="pending" class="status">正在读取消息…</text>
      <view v-else-if="failed" class="status">消息读取失败 <button @click="attempt++">重试</button></view>
      <text v-else-if="!rows.length" class="status">{{ sent ? '该用户还没有发出私聊消息。' : '该用户还没有收到私聊消息。' }}</text>
      <view v-else>
        <text class="caption">最近 {{ rows.length }} 条</text>
        <view v-for="row in rows" :key="row.id" class="message-row">
          <view class="meta"><text>{{ sent ? '发给' : '来自' }} {{ sent ? row.receiverName || '#' + row.receiverId : row.senderName || '#' + row.senderId }}</text><text>{{ timeLabel(row.sendTime) }}</text></view>
          <text class="snippet">{{ snippet(row) }}</text>
        </view>
        <button class="action" @click="$emit('records', { name: 'Message', userId: user.id, fields: [field] })">查看全部 {{ total }} 条</button>
      </view>
    </template>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { getMessagesList } from '@/api/database'

const props = defineProps({ roles: Array, selected: Object, user: Object, stat: Object })
defineEmits(['close', 'select', 'choose-user', 'records'])
const field = computed(() => props.selected.fields[0].sourceColumn)
const sent = computed(() => field.value === 'senderId')
const rows = ref([]), liveTotal = ref(null), pending = ref(false), failed = ref(false), attempt = ref(0)
const total = computed(() => liveTotal.value ?? props.stat?.count)
const types = { image: '图片', voice: '语音', video: '视频', file: '文件', location: '位置' }
function snippet(row) {
  if (row.isWithdraw) return '消息已撤回'
  return row.type === 'text' ? (row.content || '空消息').slice(0, 100) : '［' + (types[row.type] || '其他消息') + '］'
}
function timeLabel(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = n => String(n).padStart(2, '0')
  return (date.getMonth() + 1) + '/' + date.getDate() + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}
watch([() => props.user?.id, field, attempt], async ([id, role], _, onCleanup) => {
  let current = true
  onCleanup(() => { current = false })
  rows.value = []; liveTotal.value = null; failed.value = false; pending.value = id != null
  if (id == null) return
  try {
    const res = await getMessagesList({ [role]: id, page: 1, pageSize: 3, columnSort: 'sendTime', columnDirection: 'DESC' })
    if (!current) return
    if (res?.code !== 0 || !Array.isArray(res.data?.list)) throw new Error('消息读取失败')
    rows.value = res.data.list
    liveTotal.value = res.data.total
  } catch {
    if (current) failed.value = true
  } finally {
    if (current) pending.value = false
  }
}, { immediate: true })
</script>

<style scoped>
.message-preview { position:absolute; top:12px; right:12px; z-index:6; box-sizing:border-box; width:268px; max-height:calc(100% - 64px); overflow:auto; padding:16px; color:var(--text); background:var(--panel); border:1px solid var(--line); border-radius:12px; box-shadow:0 6px 24px #102a241a; }
.preview-head,.summary,.meta,.roles { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.caption,.title,.mapping,.status,.snippet { display:block; }
.caption,.status { font-size:11px; color:var(--soft); }
.title { margin-top:2px; color:var(--ink); font-size:17px; font-weight:700; }
.message-preview button { margin:0; padding:0 9px; min-width:0; color:var(--text); background:var(--surface); border:1px solid var(--line); border-radius:6px; font:inherit; font-size:12px; line-height:28px; cursor:pointer; }
.message-preview button::after { border:0; }
.roles { margin:14px 0 8px; gap:4px; }.roles button { flex:1; }.roles button.selected { background:var(--tint); color:var(--accent); border-color:var(--accent); }
.mapping { color:var(--soft); font:11px/1.6 ui-monospace,monospace; }.summary { font-size:12px; font-weight:650; margin:12px 0; padding-top:10px; border-top:1px solid var(--line); }.summary text:last-child { white-space:nowrap; }
.message-row { padding:8px 0; border-bottom:1px solid var(--line); }.meta { font-size:10px; color:var(--soft); }.meta text:last-child { white-space:nowrap; }.snippet { margin-top:3px; font-size:13px; color:var(--ink); overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.message-preview .action { width:100%; margin-top:12px; color:var(--accent); }.status { line-height:1.7; }
@media(max-width:740px){ .message-preview { position:relative; inset:auto; width:100%; margin:0; max-height:280px; border-radius:0; box-shadow:none; border-width:1px 0 0; } }
</style>
