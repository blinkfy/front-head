<template>
  <view class="trace">
    <view class="section-head">
      <text>{{ statusLabel(data.order.status) }}</text>
      <button @click="show('BookingOrder', { id: data.order.id })">订单 #{{ data.order.id }} ›</button>
    </view>
    <text v-if="data.order.appointmentDate" class="caption">预约上门 · {{ data.order.appointmentDate }} {{ data.order.appointmentTimeSlot }}</text>
    <view class="participants">
      <button v-for="person in participants" :key="person.label" :disabled="person.id == null || !userNames.has(String(person.id))"
        @click="show('User', { id: person.id })">
        <text class="caption">{{ person.label }}</text><text>{{ person.id == null ? '尚未指派' : personName(person.id) }}</text>
      </button>
    </view>

    <view class="section">
      <view class="section-head"><text>订单进度</text><button @click="openOrderRows('BookingOrderEvent')">事件表 ›</button></view>
      <text v-if="data.limited?.events" class="caption">显示最近 {{ data.events.length }} 个事件</text>
      <text v-if="!events.length" class="caption">暂无订单事件</text>
      <view v-for="event in events" :key="event.id" class="milestone">
        <button class="record" @click="show('BookingOrderEvent', { id: event.id })">
          <text>{{ eventNames[event.eventType] || event.eventType }} ›</text>
          <text class="caption">{{ time(event.createdAt) }} · 版本 {{ event.version }} · {{ event.actorUserId != null ? personName(event.actorUserId) : event.actorId === 'system' ? '系统' : event.actorId || '操作者未记录' }}</text>
        </button>
        <view v-if="event.beforeStatus !== event.afterStatus" class="caption">{{ statusLabel(event.beforeStatus) }} → {{ statusLabel(event.afterStatus) }}</view>
        <view v-if="event.beforeCollectorId !== event.afterCollectorId" class="caption">回收员 · {{ personName(event.beforeCollectorId) }} → {{ personName(event.afterCollectorId) }}</view>
        <text v-if="event.reason" class="caption">{{ event.reason }}</text>
      </view>
    </view>

    <view class="section">
      <view class="section-head"><text>订单聊天绑定</text></view>
      <text v-if="data.bindingId == null" class="caption">未找到与当前指派及双方账号匹配的有效绑定。</text>
      <button v-for="binding in data.bindings" :key="binding.id" class="record" @click="show('BookingChatBinding', { id: binding.id })">
        <text>{{ binding.id === data.bindingId ? '当前有效绑定' : binding.active ? '其他有效标记' : '已结束绑定' }} · 指派版本 {{ binding.assignmentVersion }} ›</text>
        <text class="caption">客户 #{{ binding.customerUserId }} ↔ 回收员 #{{ binding.collectorUserId }}{{ binding.createdAt ? ' · ' + time(binding.createdAt) : '' }}{{ binding.endedAt ? ' → ' + time(binding.endedAt) : '' }}</text>
      </button>
      <template v-if="data.bindingId != null">
        <text class="caption">双方私聊会话由两个账号共享。</text>
        <button v-for="chat in data.chats" :key="chat.userId" class="record" @click="show('Chat', { userId: chat.userId, otherId: chat.otherId })">#{{ chat.userId }} → #{{ chat.otherId }} 的会话 ›</button>
        <text v-if="!data.chats.length" class="caption">双方尚无会话记录。</text>
      </template>
    </view>

    <view class="section">
      <view class="section-head"><text>回收照片</text><button @click="openOrderRows('RecyclingPhoto')">照片表 ›</button></view>
      <text v-if="data.limited?.photos" class="caption">显示最近 {{ data.photos.length }} 条照片记录</text>
      <text v-if="!data.photos?.length" class="caption">暂无照片记录</text>
      <button v-for="photo in data.photos" :key="photo.id" class="record" @click="show('RecyclingPhoto', { id: photo.id })">
        <text>{{ time(photo.createdAt) }} · {{ personName(photo.userId) }}上传 ›</text>
      </button>
    </view>

    <view class="section">
      <view class="section-head"><text>通知投递</text><button @click="openOrderRows('RecyclingDelivery')">投递表 ›</button></view>
      <text v-if="data.limited?.deliveries" class="caption">显示最近 {{ data.deliveries.length }} 条投递记录</text>
      <text v-if="!data.deliveries?.length" class="caption">暂无投递记录</text>
      <view v-for="delivery in data.deliveries" :key="delivery.id" class="delivery">
        <button class="record" @click="show('RecyclingDelivery', { id: delivery.id })">
          <text>{{ deliveryTypes[delivery.type] || delivery.type }} · {{ deliveryStates[delivery.status] || delivery.status }} ›</text>
          <text class="caption">{{ time(delivery.updatedAt || delivery.createdAt) }}{{ delivery.eventVersion != null ? ' · 事件版本 ' + delivery.eventVersion : '' }}{{ delivery.recipientId != null ? ' · 接收账号 #' + delivery.recipientId : '' }} · 尝试 {{ delivery.attempts }} 次</text>
        </button>
        <button v-if="delivery.notificationId != null" @click="show('UserNotification', { id: delivery.notificationId })">通知 ›</button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({ data: { type: Object, required: true } })
const emit = defineEmits(['evidence'])
const events = computed(() => [...(props.data.events || [])].reverse())
const userNames = computed(() => new Map(props.data.users.map(user => [String(user.id), user.username])))
const participants = computed(() => [
  { label: '下单人', id: props.data.order.userId }, { label: '当前回收员', id: props.data.order.collectorId }
])
const statuses = { pending: '待接单', confirmed: '已接单', picking: '回收中', completed: '已完成', cancelled: '已取消' }
const eventNames = { created: '提交预约', accepted: '接单', assigned: '指派回收员', released: '解除指派', started: '开始回收', completed: '完成回收', cancelled: '取消预约', timeout: '超时取消', quote_confirmed: '确认报价' }
const deliveryTypes = { notice: '用户通知', events: '实时事件', fanout: '大厅通知分发' }
const deliveryStates = { pending: '待处理', processing: '处理中', done: '已处理', failed: '失败', expired: '已过期', unsupported: '投递渠道不支持' }
function statusLabel(status) { return statuses[status] || status || '无状态' }
function personName(id) {
  if (id == null) return '未指派'
  const name = userNames.value.get(String(id))
  return name ? `${name} #${id}` : `账号 #${id}`
}
function time(value) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '无时间' }
function show(name, values) { emit('evidence', { name, values }) }
function openOrderRows(name) { show(name, { orderId: props.data.order.id }) }
</script>

<style scoped>
.caption { display:block; font-size:12px; line-height:1.55; opacity:.76; }
.participants,.section-head,.delivery { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.participants { align-items:stretch; margin-top:8px; }
.trace button { margin:0; padding:4px 8px; border-radius:6px; color:inherit; background:#829d941a; font-size:12px; line-height:1.6; cursor:pointer; }
.trace button::after { border:0; }
.participants button { flex:1; text-align:left; }
.section { display:grid; gap:6px; padding:12px 0; border-bottom:1px solid #829d9436; }
.section-head { font-size:14px; font-weight:650; }
.milestone { border-left:2px solid #319a82; padding-left:8px; }
.trace .record { display:block; width:100%; min-width:0; text-align:left; }
.delivery .record { flex:1; }
</style>
