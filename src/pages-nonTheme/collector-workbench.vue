<template>
  <RecyclingShell title="回收工作台" :dark="isDark" variant="workbench">
    <view v-if="error" class="recycle-error workbench-error" role="alert"><text>{{ error }}</text><button v-if="!me" class="recycle-secondary" :disabled="loading" @click="load">重新加载</button></view>
    <view v-if="loading && !me" class="recycle-empty" role="status">正在加载工作台…</view>
    <view v-else-if="me && me.profile?.status !== 'approved'" class="access-notice"><text class="recycle-heading">{{ collectorStatusText(me.profile?.status || me.application?.status) }}</text><text class="recycle-copy">审核通过后即可使用工作台。已停用人员请联系平台。</text><button class="recycle-primary" @click="apply">查看申请进度</button></view>
    <template v-else-if="me?.profile">
      <view v-if="me.identityVerified === false" class="recycle-card"><text class="recycle-heading">接新单前，请完成实名认证</text><text class="recycle-muted">认证后可继续发布服务和接新单；已有任务可继续履约。</text><button class="recycle-secondary" @click="verifyIdentity">去实名认证</button></view>
      <view class="collector-profile">
        <view class="collector-title-row"><text class="collector-service-name">{{ me.profile.serviceName || '我的回收服务' }}</text><view :class="['collector-availability', { paused: !me.profile.acceptingOrders }]"><view class="availability-dot"></view><text>{{ me.profile.acceptingOrders ? '正在接收新单' : '已暂停接收新单' }}</text></view></view>
        <text class="recycle-muted">按已发布的范围、品类与排班匹配新单</text>
      </view>
      <view class="recycle-tabs workbench-tabs"><button v-for="item in tabs" :key="item.key" class="recycle-pill" :class="{ selected: tab === item.key }" @click="changeTab(item.key)">{{ item.label }}</button></view>

      <template v-if="tab !== 'settings'">
        <view v-if="tab === 'available'" class="overview-card">
          <view class="overview-head"><text class="task-section-title">{{ dayWord }}接单概览</text><text class="recycle-muted">{{ timelineDate }}</text></view>
          <view class="overview-grid">
            <view class="overview-metric"><text class="metric-value">{{ me.profile.acceptingOrders ? availableCount : 0 }}</text><text class="metric-label">可接订单（单）</text></view>
            <view class="overview-metric"><text class="metric-value">{{ summary ? summary.busyHours : '-' }}</text><text class="metric-label">预计工作时长（小时）</text><text class="metric-sub">工作窗口 {{ summary ? summary.windowHours : '-' }} 小时</text></view>
            <view class="overview-metric"><text class="metric-value">{{ summary ? summary.remainingJobs : '-' }}</text><text class="metric-label">剩余接单容量（单）</text><text class="metric-sub">空闲 {{ summary ? freeHours : '-' }} 小时</text></view>
          </view>
        </view>
        <view v-else class="overview-card">
          <view class="overview-head"><text class="task-section-title">{{ dayWord }}任务统计</text><text class="recycle-muted">{{ timelineDate }}</text></view>
          <view class="overview-grid four">
            <view class="overview-metric"><text class="metric-value">{{ taskStats.total }}</text><text class="metric-label">总任务</text></view>
            <view class="overview-metric"><text class="metric-value stat-confirmed">{{ taskStats.confirmed }}</text><text class="metric-label">待执行</text></view>
            <view class="overview-metric"><text class="metric-value stat-picking">{{ taskStats.picking }}</text><text class="metric-label">进行中</text></view>
            <view class="overview-metric"><text class="metric-value stat-completed">{{ taskStats.completed }}</text><text class="metric-label">已完成</text></view>
          </view>
          <view v-if="nextJob" class="next-job"><view class="next-dot"></view><view class="next-copy"><text class="next-title">{{ nextJob.status === 'picking' ? '正在进行' : '下一单预计上门' }} {{ jobTime(nextJob) }}</text><text class="recycle-muted">订单 {{ nextJob.orderNo }} · {{ nextJob.serviceAreaName || areaName(nextJob.serviceAreaId) }} · 用户预约 {{ nextJob.appointmentTimeSlot }}</text></view><button class="toolbar-link" @click="detail(nextJob)">详情</button></view>
          <text v-else-if="timeline && !timelineLoading" class="recycle-muted next-empty">{{ taskStats.total ? '当日任务已全部完成' : '当日暂无已接任务' }}</text>
        </view>
        <view class="task-section-heading"><text class="task-section-title">{{ tab === 'available' ? '可接任务' : '我的任务' }}</text><text class="recycle-muted">{{ tab === 'available' ? '大厅隐藏详细地址与电话，接单后可联系用户。' : '查看履约进度，与用户沟通上门安排。' }}</text></view>
        <view class="task-toolbar"><picker class="task-date" mode="date" :value="date" @change="setDate"><view class="recycle-select">{{ date || '全部日期' }}<view class="field-chevron"></view></view></picker><button v-if="date" class="toolbar-link" @click="clearDate">重置</button><button class="toolbar-link" :disabled="loadingOrders" @click="loadOrders(true)">{{ loadingOrders ? '刷新中…' : '刷新' }}</button></view>
        <view v-if="tab === 'mine'" class="recycle-pills view-switch"><button class="recycle-pill" :class="{ selected: viewMode === 'timeline' }" @click="viewMode = 'timeline'">时间轴</button><button class="recycle-pill" :class="{ selected: viewMode === 'list' }" @click="viewMode = 'list'">任务列表</button></view>
        <view v-if="tab === 'mine' && viewMode === 'list'" class="recycle-pills task-filters"><button v-for="filter in filters" :key="filter.key" class="recycle-pill" :class="{ selected: status === filter.key }" @click="setStatus(filter.key)">{{ filter.label }}</button></view>
        <view v-if="tab === 'available' && !me.profile.acceptingOrders" class="pause-notice"><text>接收新单已暂停，已接任务不受影响。</text><button class="toolbar-link" @click="changeTab('settings')">前往接单设置</button></view>
        <view v-if="tab === 'available' || viewMode === 'timeline'" class="timeline-card">
          <view class="timeline-head"><text class="task-section-title">{{ tab === 'available' ? '单日接单时间轴' : '单日任务时间轴' }}</text><text class="recycle-muted">{{ timelineDate }} · 按区域</text></view>
          <view v-if="timelineError" class="recycle-error" role="alert"><text>{{ timelineError }}</text><button class="recycle-secondary" :disabled="timelineLoading" @click="loadTimeline">重新加载</button></view>
          <view v-else-if="timelineLoading && !timeline" class="recycle-empty" role="status">正在加载时间轴…</view>
          <RecyclingTimeline v-else :lanes="displayLanes" :mode="tab === 'mine' ? 'status' : 'scheduled'" :show-free="tab === 'available'" :ghosts="ghosts" :actions="tab === 'mine' ? ['detail', 'contact', 'navigate'] : []" :now-minutes="nowMinutes" :empty-text="tab === 'available' ? '当天暂无排班，发布排班后可在此查看接单空间' : '当天暂无已接任务'" @detail="detail" @contact="contactUser" @navigate="navigateTo" />
          <text class="recycle-muted timeline-note">时间轴展示服务端按装箱排程实时计算的预计上门时间；用户预约时段与实际执行时间分别标注。</text>
        </view>
        <view v-if="orders.length && (tab === 'available' || viewMode === 'list')" class="task-list">
          <view v-for="order in orders" :key="order.id" class="task-item" @click="detail(order)">
            <view class="task-meta"><text class="task-order-no">订单 {{ order.orderNo }}</text><text class="recycle-status">{{ statusText(order.status) }}</text></view>
            <view class="task-appointment"><text class="task-date-label">{{ order.appointmentDate }}</text><text class="task-time">用户预约 {{ order.appointmentTimeSlot }}</text></view>
            <view class="task-detail-line"><text class="task-detail-label">所属区域</text><text>{{ order.serviceAreaName || areaName(order.serviceAreaId) }}</text></view>
            <view v-if="tab === 'available'" class="task-detail-line"><text class="task-detail-label">预计可插入</text><text :class="order.placement ? 'placement-ok' : 'placement-conflict'">{{ placementText(order) }}</text></view>
            <view v-else-if="jobFor(order)" class="task-detail-line"><text class="task-detail-label">{{ execLabel(order) }}</text><text>{{ jobTime(jobFor(order)) }}</text></view>
            <view class="task-detail-line"><text class="task-detail-label">回收物品</text><text>{{ itemsText(order) || '查看任务了解物品详情' }}</text></view>
            <view class="task-price"><text>{{ orderPriceText(order) }}</text><text class="recycle-muted">以现场确认记录为准</text></view>
            <view v-if="tab === 'available' && previewId === order.id" class="preplan"><text class="preplan-title">接单后预排程</text><text class="recycle-copy">{{ preplanText(order) }}</text></view>
            <view class="task-actions"><button v-if="tab === 'available'" class="recycle-secondary task-action" :disabled="!order.placement" @click.stop="togglePreview(order)">{{ previewId === order.id ? '收起预排程' : '预览接单后排程' }}</button><button v-if="tab === 'mine' && ['confirmed', 'picking'].includes(order.status)" class="recycle-secondary task-action" @click.stop="navigateTo(order)">开始导航</button><button v-if="tab === 'mine' && ['confirmed', 'picking'].includes(order.status)" class="recycle-secondary task-action" @click.stop="contactUser(order)">联系用户</button><button class="recycle-primary task-action" @click.stop="detail(order)">{{ tab === 'available' ? '查看并接单' : '订单详情' }}</button></view>
          </view>
        </view>
        <view v-if="tab === 'available' || viewMode === 'list'">
        <view v-if="loadingOrders" class="recycle-empty" role="status">正在加载任务…</view>
        <view v-else-if="!orders.length" class="task-empty"><view class="empty-task-mark"><view></view><view></view><view></view></view><text class="empty-title">{{ tab === 'available' ? (me.profile.acceptingOrders ? '暂时没有可接的新单' : '接收新单已暂停') : '当前筛选下暂无任务' }}</text><text class="recycle-muted">{{ tab === 'available' ? (me.profile.acceptingOrders ? '新单会按您的服务范围、品类与排班匹配，可稍后刷新。' : '开启接收新单并发布排班后，即可查看匹配任务。') : '试试其他状态或日期，已接任务的进度会保留在这里。' }}</text></view>
        <button v-if="hasMore" class="recycle-secondary load-more" :disabled="loadingOrders" @click="loadOrders(false)">加载更多</button>
        </view>
      </template>

      <template v-else>
        <view class="settings-section">
          <view class="settings-heading"><text class="settings-number">01</text><view><text class="recycle-heading">接单与提醒</text><text class="recycle-muted">安排接单状态，及时收到新任务</text></view></view>
          <view class="settings-switch-row"><view><text class="setting-title">接收新单</text><text class="recycle-muted">暂停后仍可继续处理已接任务</text></view><switch :checked="me.profile.acceptingOrders" color="#10b981" :disabled="saving" @change="changeSetting('acceptingOrders', $event.detail.value)" /></view>
          <view class="settings-switch-row"><view><text class="setting-title">新单提醒</text><text class="recycle-muted">关闭后仍保留站内通知和任务状态通知</text></view><switch :checked="me.profile.newOrderNotifications" color="#10b981" :disabled="saving" @change="changeSetting('newOrderNotifications', $event.detail.value)" /></view>
          <button class="settings-disclosure" :aria-expanded="showNotificationDetails" @click="showNotificationDetails = !showNotificationDetails"><text>通知送达检查</text><view :class="['field-chevron', { expanded: showNotificationDetails }]"></view></button>
          <view v-if="showNotificationDetails" class="notification-details"><text class="recycle-copy">服务端离线推送：{{ me.notificationStatus?.pushEnabled ? '已启用支持通道' : '尚未启用' }}</text><text class="recycle-copy">账号有效绑定设备：{{ me.notificationStatus?.boundDevices || 0 }} 台</text><text class="recycle-copy">当前设备系统通知：{{ deviceNotificationStatus }}</text><text class="recycle-muted">服务端开启和设备绑定不代表通知已在手机展示，站内通知始终可从消息页查看。</text></view>
          <button class="settings-disclosure" @click="systemNotices"><text>查看系统通知</text><view class="field-chevron forward"></view></button>
        </view>

        <view class="settings-section">
          <view class="settings-heading"><text class="settings-number">02</text><view><text class="recycle-heading">回收种类与参考价</text><text class="recycle-muted">管理获批品类和报价，最终金额以现场确认为准</text></view></view>
          <text v-if="me.profile.serviceOffers == null" class="recycle-muted recycle-copy">已预填平台公斤参考价，保存后成为您的服务配置。</text>
          <text v-if="!serviceOffers.length" class="recycle-copy">暂无获批品类，请先申请服务品类。</text>
          <view v-for="offer in serviceOffers" :key="offer.typeId" class="offer-item">
            <view class="offer-header"><view class="offer-heading"><text class="setting-title">{{ offer.name }}</text><text class="offer-price">{{ offerSummary(offer) }}</text></view><switch :checked="offer.enabled" color="#10b981" :disabled="saving" @change="offer.enabled = $event.detail.value" /></view>
            <view class="offer-edit-actions"><button v-if="offer.enabled" class="offer-edit" :disabled="saving" :aria-expanded="editingOfferId === offer.typeId" @click="editingOfferId = editingOfferId === offer.typeId ? null : offer.typeId">{{ editingOfferId === offer.typeId ? '收起报价' : '编辑报价' }}<view :class="['field-chevron', { expanded: editingOfferId === offer.typeId }]"></view></button></view>
            <view v-if="offer.enabled && editingOfferId === offer.typeId" class="offer-editor">
              <view class="offer-fields"><view><text class="recycle-label">计价单位</text><picker :range="offerUnits" range-key="label" :value="offerUnits.findIndex(item => item.value === offer.unit)" :disabled="saving" @change="offer.unit = offerUnits[Number($event.detail.value)].value"><view class="recycle-select">{{ unitLabel(offer.unit) }}</view></picker></view><view><text class="recycle-label">报价方式</text><picker :range="priceModes" range-key="label" :value="offer.priceMode === 'negotiable' ? 1 : 0" :disabled="saving" @change="offer.priceMode = priceModes[Number($event.detail.value)].value"><view class="recycle-select">{{ offer.priceMode === 'negotiable' ? '现场议价' : '固定参考单价' }}</view></picker></view></view>
              <template v-if="offer.priceMode === 'fixed'"><text class="recycle-label">参考单价（元 / {{ unitLabel(offer.unit) }}）</text><input v-model="offer.unitPrice" class="recycle-input" type="digit" :disabled="saving" placeholder="请输入参考单价" /></template>
              <text class="recycle-label">回收说明与限制（选填）</text><textarea v-model="offer.description" class="recycle-textarea" :maxlength="200" :disabled="saving" placeholder="例如：需拆除包装，不接收破损物品" />
              <view class="settings-switch-row"><text>预约时要求上传照片</text><switch :checked="offer.requiresPhoto" color="#10b981" :disabled="saving" @change="offer.requiresPhoto = $event.detail.value" /></view>
            </view>
          </view>
          <view class="service-parameters">
            <view><text class="recycle-label">服务时长</text><picker :range="serviceDurations" :value="serviceDurations.indexOf(serviceDurationMinutes)" :disabled="saving" @change="serviceDurationMinutes = serviceDurations[Number($event.detail.value)]"><view class="recycle-select">{{ serviceDurationMinutes }} 分钟</view></picker></view>
            <view><text class="recycle-label">路程缓冲</text><picker :range="travelBuffers" :value="travelBuffers.indexOf(travelBufferMinutes)" :disabled="saving" @change="travelBufferMinutes = travelBuffers[Number($event.detail.value)]"><view class="recycle-select">{{ travelBufferMinutes }} 分钟</view></picker></view>
            <view><text class="recycle-label">上门窗口</text><picker :range="arrivalWindows" :value="arrivalWindows.indexOf(arrivalWindowMinutes)" :disabled="saving" @change="arrivalWindowMinutes = arrivalWindows[Number($event.detail.value)]"><view class="recycle-select">{{ arrivalWindowMinutes }} 分钟</view></picker></view>
          </view>
          <text class="recycle-muted recycle-copy">建议预留 15–30 分钟路程缓冲；系统按服务时长及缓冲避免任务冲突，上门窗口决定用户可选的到达时间段。</text>
          <button class="recycle-primary" :disabled="saving" @click="saveServiceOffers">{{ saving ? '保存中…' : '保存服务配置' }}</button>
        </view>

        <view class="settings-section schedule-section">
          <view class="settings-heading"><text class="settings-number">03</text><view><text class="recycle-heading">发布服务排班</text><text class="recycle-muted">服务范围 → 服务日 → 工作时间 → 确认发布</text></view></view>
          <text class="recycle-muted recycle-copy">每周排班自动重复；临时改班请选择“单日调整”。</text>
          <view class="recycle-pills schedule-mode"><button class="recycle-pill" :class="{ selected: scheduleMode === 'weekly' }" :disabled="saving" @click="setScheduleMode('weekly')">每周固定</button><button class="recycle-pill" :class="{ selected: scheduleMode === 'daily' }" :disabled="saving" @click="setScheduleMode('daily')">单日调整</button></view>
          <view class="schedule-step"><text class="recycle-label">1. 选择服务范围</text><picker :range="approvedAreas" range-key="name" :value="areaIndex" :disabled="saving" @change="areaIndex = Number($event.detail.value); restoreSchedule()"><view class="recycle-select">{{ approvedAreas[areaIndex]?.name || '暂无获批区域' }}</view></picker>
            <RecyclingServiceMap v-if="approvedAreas[areaIndex]?.geometry" class="workbench-range-map" :areas="[approvedAreas[areaIndex]]" readonly />
            <text v-else class="recycle-muted recycle-copy">这是旧地区资料。请申请补画地图范围并通过审核，以开放按地图地址匹配的预约。</text>
            <button class="toolbar-link area-change" :disabled="saving" @click="apply">申请变更服务范围</button>
          </view>
          <view class="schedule-step">
            <template v-if="scheduleMode === 'weekly'"><text class="recycle-label">2. 选择每周服务日</text><view class="recycle-pills weekday-choices"><button v-for="day in weekdays" :key="day.value" class="recycle-pill" :class="{ selected: selectedWeekdays.includes(day.value) }" :disabled="saving" @click="toggleWeekday(day.value)">{{ day.label }}</button></view>
              <view class="weekday-shortcuts"><button class="toolbar-link" :disabled="saving" @click="setWeekdays([1,2,3,4,5])">工作日</button><button class="toolbar-link" :disabled="saving" @click="setWeekdays([1,2,3,4,5,6,7])">每天</button><button class="toolbar-link" :disabled="saving" @click="setWeekdays([])">取消选择</button></view>
              <text v-if="weeklyMismatch" class="recycle-muted">该区域各星期的服务时段不同：{{ weeklyMismatchText }}。保存后，所选服务日会统一使用当前时段，请先调整后再保存。</text>
            </template>
            <template v-else><text class="recycle-label">2. 选择调整日期</text><picker mode="date" :value="scheduleDate" :start="today" :end="lastDay" :disabled="saving" @change="scheduleDate = $event.detail.value; previewDate = scheduleDate; restoreSlots(); loadPreview()"><view class="recycle-select">{{ scheduleDate }}</view></picker><text class="recycle-muted recycle-copy">当天临时排班只改所选区域，其他区域时段保留，之后调整每周规则也不会改变这项例外；“恢复周排班”会清除当天全部临时调整。</text><text class="override-state">{{ hasDailyOverride ? '当天已临时调整' : '当天沿用每周固定排班' }}</text></template>
          </view>
          <view class="schedule-step"><text class="recycle-label">3. 添加工作时间</text><text class="recycle-muted recycle-copy">支持多段时间，按半小时选择、不跨夜。系统会在工作时间内生成 30 或 60 分钟上门窗口。</text>
            <view v-for="(slot, index) in selectedSlots" :key="index" class="work-range"><picker class="work-range-picker" :range="workTimes.slice(0, -1)" :value="workTimes.indexOf(slot.split('-')[0])" :disabled="saving" @change="changeWorkRange(index, 0, $event)"><view class="recycle-select">{{ slot.split('-')[0] }}</view></picker><text>至</text><picker class="work-range-picker" :range="workTimes" :value="workTimes.indexOf(slot.split('-')[1])" :disabled="saving" @change="changeWorkRange(index, 1, $event)"><view class="recycle-select">{{ slot.split('-')[1] }}</view></picker><button class="toolbar-link" :disabled="saving" @click="removeWorkRange(index)">删除</button></view>
            <text v-if="!selectedSlots.length" class="schedule-hint">尚未添加工作时间，不能发布。请添加时间，例如 08:30 至 12:00。</text><button class="recycle-secondary" :disabled="saving" @click="addWorkRange">添加工作时间</button>
          </view>
          <view class="schedule-step schedule-timeline">
            <text class="recycle-label">单日排班时间轴预览</text>
            <text class="recycle-muted recycle-copy">按日期查看已发布的各区域工作窗口、已接订单占用时段与空闲可接时段{{ draftLanes.length ? '；蓝色虚线为尚未发布的当前编辑内容。' : '。' }}</text>
            <view class="preview-date-row"><button class="toolbar-link" :disabled="previewLoading || previewDate <= today" @click="shiftPreviewDate(-1)">前一天</button><picker class="task-date" mode="date" :value="previewDate" :start="today" :end="lastDay" @change="setPreviewDate"><view class="recycle-select">{{ previewDate }}<view class="field-chevron"></view></view></picker><button class="toolbar-link" :disabled="previewLoading || previewDate >= lastDay" @click="shiftPreviewDate(1)">后一天</button></view>
            <view v-if="previewError" class="recycle-error" role="alert"><text>{{ previewError }}</text><button class="recycle-secondary" :disabled="previewLoading" @click="loadPreview">重新加载</button></view>
            <view v-else-if="previewLoading && !previewTimeline" class="recycle-empty" role="status">正在加载时间轴…</view>
            <RecyclingTimeline v-else :lanes="previewTimeline ? previewTimeline.lanes : []" mode="scheduled" :draft="draftLanes" :now-minutes="previewNow" empty-text="当天暂无已发布的排班" />
          </view>
          <view class="schedule-preview"><text class="recycle-label">4. 核对并发布</text><text class="recycle-copy">{{ scheduleSummary() }}</text><text v-if="scheduleError()" class="schedule-hint">{{ scheduleError() }}</text><text v-else class="recycle-muted recycle-copy">核对后点击发布，用户才可预约。仅开放未来 30 天；单日调整优先于每周规则。</text></view>
          <button class="recycle-primary" :disabled="saving || !approvedAreas.length" @click="saveSchedule">{{ saving ? '处理中…' : (scheduleMode === 'weekly' ? '确认发布每周排班' : '确认发布单日排班') }}</button>
          <text v-if="scheduleNotice" class="schedule-notice" role="status">{{ scheduleNotice }}</text><text v-if="error" class="recycle-error" role="alert">{{ error }}</text>
          <view class="schedule-secondary-actions"><button v-if="scheduleMode === 'weekly' ? getWeeklyRows().length : getDailyRows().length" class="toolbar-link danger-link" :disabled="saving" @click="clearSchedule">{{ scheduleMode === 'weekly' ? '停止该范围每周服务' : '设为该范围当天休息' }}</button><button v-if="scheduleMode === 'daily' && hasDailyOverride" class="toolbar-link" :disabled="saving" @click="resetDailySchedule">恢复周排班</button></view>
        </view>
      </template>
    </template>
  </RecyclingShell>
</template>
<script>
import RecyclingShell from './components/RecyclingShell.vue'
import RecyclingServiceMap from './components/RecyclingServiceMap.vue'
import RecyclingTimeline from './components/RecyclingTimeline.vue'
import { collectorMe, collectorSettings, collectorAvailability, collectorWeeklyAvailability, collectorOrders, collectorTimeline, openBookingChat, bookingStatusText, collectorStatusText } from './api/recycling.js'
import { formatBookingDate } from './utils/booking-date.mjs'
const pad2 = value => String(value).padStart(2, '0')
const clock = minutes => `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`
const toMinutes = value => { const [h, m] = String(value).split(':').map(Number); return h * 60 + m }
export default {
  components: { RecyclingShell, RecyclingServiceMap, RecyclingTimeline },
  data: () => ({ timeline: null, timelineLoading: false, timelineError: '', timelineDate: '', timelineVersion: 0, availableCount: 0, viewMode: 'timeline', previewId: null, previewDate: '', previewTimeline: null, previewLoading: false, previewError: '', previewVersion: 0, writes: {}, isDark: false, loading: false, loadingOrders: false, saving: false, error: '', me: null, catalog: { areas: [], types: [], timeSlots: [] }, tab: 'available', tabs: [{ key: 'available', label: '待接单' }, { key: 'mine', label: '我的任务' }, { key: 'settings', label: '接单设置' }], filters: [{ key: 'active', label: '进行中' }, { key: 'completed', label: '已完成' }, { key: 'cancelled', label: '已取消' }, { key: '', label: '全部' }], status: 'active', date: '', orders: [], page: 0, hasMore: false, queryVersion: 0, scheduleMode: 'weekly', scheduleNotice: '', weekdays: [{ value: 1, label: '周一' }, { value: 2, label: '周二' }, { value: 3, label: '周三' }, { value: 4, label: '周四' }, { value: 5, label: '周五' }, { value: 6, label: '周六' }, { value: 7, label: '周日' }], selectedWeekdays: [], weeklyEdited: false, weeklyMismatch: false, weeklyMismatchText: '', scheduleDate: '', today: '', lastDay: '', areaIndex: 0, selectedSlots: [], serviceOffers: [], offerUnits: [{ value: 'kg', label: '公斤' }, { value: 'piece', label: '件' }, { value: 'unit', label: '台' }, { value: 'bag', label: '袋' }], priceModes: [{ value: 'fixed', label: '固定参考单价' }, { value: 'negotiable', label: '现场议价' }], serviceDurations: Array.from({ length: 12 }, (_, index) => (index + 1) * 15), travelBuffers: [0,15,30,45,60], arrivalWindows: [30,60], serviceDurationMinutes: 30, travelBufferMinutes: 0, arrivalWindowMinutes: 60, workTimes: Array.from({ length: 49 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`), editingOfferId: null, showNotificationDetails: false, deviceNotificationStatus: '当前平台未提供状态查询' }),
  computed: {
    dayWord() { return this.timelineDate && this.timelineDate !== this.today ? '当日' : '今日' },
    summary() { return this.timeline?.summary || null },
    freeHours() { return this.summary ? Math.round(this.summary.freeMinutes / 6) / 10 : 0 },
    taskStats() { const jobs = this.timeline?.jobs || []; const count = status => jobs.filter(job => job.status === status).length; return { total: count('confirmed') + count('picking') + count('completed'), confirmed: count('confirmed'), picking: count('picking'), completed: count('completed') } },
    nextJob() { const jobs = this.timeline?.jobs || []; return jobs.find(job => job.status === 'picking') || jobs.filter(job => job.status === 'confirmed').sort((a, b) => a.executionStart - b.executionStart)[0] || null },
    previewOrder() { return this.orders.find(item => item.id === this.previewId && item.appointmentDate === this.timelineDate) || null },
    ghosts() { const order = this.previewOrder; return order?.placement ? [{ serviceAreaId: order.serviceAreaId, start: order.placement.start, end: order.placement.end, label: '新单' }] : [] },
    displayLanes() {
      const lanes = this.timeline?.date === this.timelineDate ? this.timeline.lanes || [] : []
      const plan = this.previewOrder?.placement?.jobs
      if (!Array.isArray(plan)) return lanes
      return lanes.map(lane => ({ ...lane, free: [], jobs: (lane.jobs || []).map(job => {
        if (job.status === 'completed') return job
        const position = plan.find(item => item.id === job.id)
        return { ...job, executionStart: position?.start ?? null, executionEnd: position?.end ?? null }
      }) }))
    },
    nowMinutes() { if (!this.timelineDate || this.timelineDate !== this.today) return null; return this.clockMinutes() },
    previewNow() { return this.previewDate && this.previewDate === this.today ? this.clockMinutes() : null },
    draftLanes() {
      const area = (this.approvedAreas || [])[this.areaIndex]
      if (this.tab !== 'settings' || !area || !this.previewDate) return []
      if (this.scheduleMode === 'daily' ? this.scheduleDate !== this.previewDate : !this.selectedWeekdays.includes(this.weekdayOf(this.previewDate))) return []
      const ranges = this.selectedSlots.map(slot => String(slot).split('-')).filter(([s, e]) => /^\d{2}:\d{2}$/.test(s || '') && /^\d{2}:\d{2}$/.test(e || '')).map(([s, e]) => ({ start: toMinutes(s), end: toMinutes(e) })).filter(item => item.end > item.start).sort((a, b) => a.start - b.start)
      const windows = []
      for (const item of ranges) { const last = windows[windows.length - 1]; if (last && item.start <= last.end) last.end = Math.max(last.end, item.end); else windows.push({ ...item }) }
      if (!windows.length) return []
      const published = (this.previewTimeline?.lanes || []).find(lane => Number(lane.serviceAreaId) === Number(area.id))?.windows || []
      if (published.length === windows.length && published.every((item, index) => item.start === windows[index].start && item.end === windows[index].end)) return []
      return [{ serviceAreaId: area.id, areaName: area.name, windows }]
    },
    approvedAreas() { return (this.me?.areas || []).filter(area => area.enabled !== false && (this.me?.profile?.areaIds || []).map(Number).includes(Number(area.id))) }, hasDailyOverride() { return (this.me?.scheduleOverrides || []).some(row => row.date === this.scheduleDate) } },
  onLoad(options = {}) { if (['mine', 'settings'].includes(options.tab)) this.tab = options.tab; const now = new Date(); this.today = formatBookingDate(now); this.scheduleDate = this.today; this.timelineDate = this.today; this.previewDate = this.today; now.setDate(now.getDate() + 30); this.lastDay = formatBookingDate(now) },
  onShow() { this.isDark = uni.getStorageSync('app_theme') === 'dark'; this.readPermission(); this.load() },
  onUnload() { this.queryVersion++; this.timelineVersion++; this.previewVersion++ },
  methods: {
    verifyIdentity() { uni.navigateTo({ url: '/pages-nonTheme/identity-verification' }) },
    statusText: bookingStatusText, collectorStatusText,
    money(value) { return Number(value || 0).toFixed(2) },
    areaName(id) { return (this.me?.areas || []).find(area => Number(area.id) === Number(id))?.name || '服务区域' },
    orderPriceText(order) { const snapshot = order.pricingSnapshot; if (snapshot?.collectorQuote) return snapshot.collectorQuote.totalPrice == null ? '合计待现场确认' : `参考收益 ¥${this.money(snapshot.collectorQuote.totalPrice)}`; if (snapshot?.reference) { const r = snapshot.reference; return r.minTotal == null || r.maxTotal == null ? '数量或报价待确认' : `参考收益 ¥${this.money(r.minTotal)}–${this.money(r.maxTotal)}${r.hasUnknown ? '（部分物品）' : ''}`; } return order.totalPrice == null ? '合计待现场确认' : `参考收益 ¥${this.money(order.totalPrice)}` },
    itemsText(order) { return (order.items || []).map(item => { const quantity = item.quantity ?? item.weight; return `${item.name} ${quantity == null || quantity === '' ? '数量待现场确认' : `${quantity}${this.unitLabel(item.quantityUnit || item.unit || 'kg')}`}` }).join('、') },
    offerSummary(offer) { if (!offer.enabled) return '已停用该品类'; if (offer.priceMode === 'negotiable') return '现场议价'; return String(offer.unitPrice ?? '').trim() === '' ? '请设置参考单价' : `¥${this.money(offer.unitPrice)}/${this.unitLabel(offer.unit)}` },
    apply() { uni.navigateTo({ url: '/pages-nonTheme/collector-apply' }) },
    systemNotices() { uni.navigateTo({ url: '/pages-nonTheme/system-notifications' }) },
    async load() { if (this.loading) return; this.loading = true; this.error = ''; try { const me = await collectorMe(); this.me = me; this.catalog = { timeSlots: me.timeSlots || [], areas: me.areas || [], types: me.types || [] }; this.restoreServiceOffers(); this.restoreSchedule(); if (me.profile?.status === 'approved') { if (this.tab !== 'settings') await this.loadOrders(true); else this.loadPreview() } } catch (e) { this.error = e.message || '加载失败' } finally { this.loading = false } },
    async loadOrders(reset) {
      if (this.loadingOrders && !reset) return
      if (reset && this.tab !== 'settings') this.loadTimeline()
      if (this.tab === 'available' && !this.me?.profile?.acceptingOrders) { this.queryVersion++; this.orders = []; this.hasMore = false; this.loadingOrders = false; return }
      const version = ++this.queryVersion; this.loadingOrders = true; const page = reset ? 1 : this.page + 1; this.error = ''
      try { const data = await collectorOrders(this.tab === 'mine' ? 'mine' : 'available', { page, status: this.tab === 'mine' ? this.status : undefined, date: this.date || undefined }); if (version !== this.queryVersion) return; this.orders = reset ? data.orders || [] : [...this.orders, ...(data.orders || [])]; this.page = page; this.hasMore = page < (data.totalPages || 1) } catch (e) { if (version === this.queryVersion) this.error = e.message || '任务加载失败' } finally { if (version === this.queryVersion) this.loadingOrders = false }
    },
    changeTab(key) { this.tab = key; this.error = ''; this.previewId = null; if (key !== 'settings') this.loadOrders(true); else { this.queryVersion++; this.loadingOrders = false; this.loadPreview() } },
    setDate(event) { this.date = event.detail.value; this.timelineDate = this.date || this.today; this.previewId = null; this.loadOrders(true) }, clearDate() { this.date = ''; this.timelineDate = this.today; this.previewId = null; this.loadOrders(true) },
    setStatus(status) { this.status = status; this.loadOrders(true) },
    detail(order) { uni.navigateTo({ url: `/pages-nonTheme/collector-order-detail?id=${order.id}` }) },
    clockMinutes() { const now = new Date(); return now.getHours() * 60 + now.getMinutes() },
    weekdayOf(date) { const [y, m, d] = String(date).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7 },
    jobFor(order) { return (this.timeline?.jobs || []).find(job => job.id === order.id) || null },
    jobTime(job) { return job && job.executionStart != null ? `${clock(job.executionStart)}–${clock(job.executionEnd)}` : '' },
    execLabel(order) { return ({ confirmed: '系统预计上门', picking: '实际开始至预计结束', completed: '实际执行时间' }[order.status] || '预计时间') },
    placementText(order) { return order.placement ? `接单后预计 ${clock(order.placement.start)}–${clock(order.placement.end)} 上门` : '当前排程无法插入，可能与现有任务冲突' },
    preplanText(order) {
      if (!order.placement) return '当前排程无法插入该订单。'
      if (order.appointmentDate !== this.timelineDate) return '正在加载该日时间轴…'
      if (!Array.isArray(order.placement.jobs)) return '接单后预计时间已标注，请刷新获取完整预排程。'
      const items = order.placement.jobs.map(job => ({ start: job.start, end: job.end, label: job.id === order.id ? `新单 ${order.orderNo}` : `订单 ${this.timeline?.jobs?.find(item => item.id === job.id)?.orderNo || job.id}` }))
      items.sort((a, b) => a.start - b.start)
      return `接单后当日排程（含各区域）：${items.map(item => `${clock(item.start)}–${clock(item.end)} ${item.label}`).join(' → ')}`
    },
    togglePreview(order) {
      if (this.previewId === order.id) { this.previewId = null; return }
      this.previewId = order.id
      if (order.appointmentDate && order.appointmentDate !== this.timelineDate) { this.timelineDate = order.appointmentDate; this.loadTimeline() }
    },
    async loadTimeline() {
      const version = ++this.timelineVersion; const date = this.timelineDate || this.today
      if (!date || typeof collectorTimeline !== 'function') return
      this.timelineLoading = true; this.timelineError = ''
      try {
        const accepting = this.me?.profile?.acceptingOrders
        const [timeline, available] = await Promise.all([collectorTimeline(date), this.tab === 'available' && accepting ? collectorOrders('available', { page: 1, date }) : Promise.resolve(null)])
        if (version !== this.timelineVersion) return
        this.timeline = timeline
        if (this.tab === 'available') this.availableCount = accepting && available ? (available.total ?? (available.orders || []).length) : 0
      } catch (e) { if (version === this.timelineVersion) this.timelineError = e.message || '时间轴加载失败' } finally { if (version === this.timelineVersion) this.timelineLoading = false }
    },
    async loadPreview() {
      const version = ++this.previewVersion; const date = this.previewDate || this.today
      if (!date || this.me?.profile?.status !== 'approved' || typeof collectorTimeline !== 'function') return
      this.previewLoading = true; this.previewError = ''
      try { const timeline = await collectorTimeline(date); if (version === this.previewVersion) this.previewTimeline = timeline } catch (e) { if (version === this.previewVersion) this.previewError = e.message || '时间轴加载失败' } finally { if (version === this.previewVersion) this.previewLoading = false }
    },
    setPreviewDate(event) { this.previewDate = event.detail.value; this.loadPreview() },
    shiftPreviewDate(step) { const [y, m, d] = this.previewDate.split('-').map(Number); const next = new Date(y, m - 1, d + step); const value = formatBookingDate(next); if (value < this.today || value > this.lastDay) return; this.previewDate = value; this.loadPreview() },
    async contactUser(job) { try { await openBookingChat(job, this.writes) } catch (e) { this.error = e.message || '联系失败，请刷新任务' } },
    navigateTo(job) {
      const latitude = Number(job.addressLat), longitude = Number(job.addressLng)
      if (job.addressLat == null || job.addressLng == null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) { uni.showToast({ title: '该订单暂无定位，请联系用户确认地址', icon: 'none' }); return }
      uni.openLocation({ latitude, longitude, name: job.contactName || '上门地址', address: job.address || '', fail: () => uni.showToast({ title: '无法打开导航', icon: 'none' }) })
    },
    getWeeklyRows() { const area = this.approvedAreas[this.areaIndex]; return (this.me?.weeklySchedule || []).filter(row => Number(row.serviceAreaId) === Number(area?.id)) },
    getDailyRows() { const area = this.approvedAreas[this.areaIndex]; return (this.me?.availability || []).filter(row => row.date === this.scheduleDate && Number(row.serviceAreaId) === Number(area?.id)) },
    restoreSchedule() { if (this.scheduleMode === 'weekly') this.restoreWeeklySlots(); else this.restoreSlots() },
    restoreSlots() { this.scheduleNotice = ''; this.selectedSlots = this.getDailyRows().map(row => row.slot) },
    restoreWeeklySlots() { this.scheduleNotice = ''; const rows = this.getWeeklyRows(); const byDay = {}; rows.forEach(row => { const day = Number(row.weekday); (byDay[day] ||= []).push(row.slot) }); const days = Object.keys(byDay).map(Number).sort((a, b) => a - b); this.selectedWeekdays = days; const signatures = [...new Set(days.map(day => [...byDay[day]].sort().join('|')))]; this.weeklyMismatch = signatures.length > 1; this.weeklyMismatchText = this.weeklyMismatch ? days.map(day => `周${this.weekdays[day - 1]?.label.slice(1)} ${byDay[day].join('、')}`).join('；') : ''; this.selectedSlots = days.length ? [...byDay[days[0]]] : []; this.weeklyEdited = false },
    setScheduleMode(mode) { if (this.saving) return; this.scheduleMode = mode; this.restoreSchedule() },
    setWeekdays(days) { this.scheduleNotice = ''; this.selectedWeekdays = [...days]; this.weeklyEdited = true },
    toggleWeekday(day) { this.scheduleNotice = ''; this.selectedWeekdays = this.selectedWeekdays.includes(day) ? this.selectedWeekdays.filter(value => value !== day) : [...this.selectedWeekdays, day].sort((a, b) => a - b); this.weeklyEdited = true },
    unitLabel(unit) { return this.offerUnits.find(item => item.value === unit)?.label || unit },
    restoreServiceOffers() {
      const profile = this.me?.profile || {}; const saved = profile.serviceOffers; const approvedIds = (profile.typeIds || []).map(Number)
      this.serviceOffers = (this.me?.types || []).filter(type => type.enabled !== false && approvedIds.includes(Number(type.id))).map(type => {
        const offer = Array.isArray(saved) ? saved.find(item => Number(item.typeId) === Number(type.id)) : null
        return { typeId: Number(type.id), name: type.name, enabled: offer ? offer.enabled : saved == null, unit: offer?.unit || 'kg', priceMode: offer?.priceMode || 'fixed', unitPrice: offer ? offer.unitPrice : (type.unitPrice ?? ''), description: offer?.description || '', requiresPhoto: offer?.requiresPhoto || false }
      })
      this.serviceDurationMinutes = profile.serviceDurationMinutes ?? 30; this.travelBufferMinutes = profile.travelBufferMinutes ?? 0; this.arrivalWindowMinutes = profile.arrivalWindowMinutes ?? 60
    },
    async saveServiceOffers() {
      if (this.saving) return
      const serviceOffers = this.serviceOffers.map(({ name, ...offer }) => ({ ...offer, unitPrice: offer.priceMode === 'negotiable' ? null : (String(offer.unitPrice ?? '').trim() === '' ? null : Number(offer.unitPrice)), description: offer.description.trim() }))
      if (serviceOffers.some(offer => offer.enabled && offer.priceMode === 'fixed' && (offer.unitPrice === null || !Number.isFinite(offer.unitPrice) || offer.unitPrice < 0 || Math.abs(offer.unitPrice * 100 - Math.round(offer.unitPrice * 100)) > 0.000001))) { this.error = '请为启用的固定报价品类填写有效的非负参考单价（最多两位小数）'; return }
      if (serviceOffers.some(offer => offer.description.length > 200)) { this.error = '回收说明不能超过 200 字'; return }
      this.saving = true
      try { await collectorSettings({ serviceOffers, serviceDurationMinutes: this.serviceDurationMinutes, travelBufferMinutes: this.travelBufferMinutes, arrivalWindowMinutes: this.arrivalWindowMinutes }); this.me = await collectorMe(); this.restoreServiceOffers(); this.loadPreview(); this.error = ''; uni.showToast({ title: '服务配置已保存', icon: 'success' }) } catch (e) { this.error = e.message || '保存失败' } finally { this.saving = false }
    },
    addWorkRange() { this.scheduleNotice = ''; const lastEnd = this.selectedSlots.slice().sort().map(slot => slot.split('-')[1]).pop(); const start = lastEnd && lastEnd < '24:00' ? lastEnd : '08:30'; const end = lastEnd && lastEnd < '24:00' ? this.workTimes[this.workTimes.indexOf(start) + 1] : '12:00'; this.selectedSlots = [...this.selectedSlots, `${start}-${end}`]; if (this.scheduleMode === 'weekly') this.weeklyEdited = true },
    removeWorkRange(index) { this.scheduleNotice = ''; this.selectedSlots = this.selectedSlots.filter((_, position) => position !== index); if (this.scheduleMode === 'weekly') this.weeklyEdited = true },
    changeWorkRange(index, part, event) { this.scheduleNotice = ''; const range = this.selectedSlots[index].split('-'); range[part] = this.workTimes[Number(event.detail.value)]; this.selectedSlots = this.selectedSlots.map((slot, position) => position === index ? range.join('-') : slot); if (this.scheduleMode === 'weekly') this.weeklyEdited = true },
    workRangeError() {
      const ranges = this.selectedSlots.map(slot => slot.split('-')).sort((a, b) => a[0].localeCompare(b[0]))
      if (ranges.some(([start, end]) => !this.workTimes.includes(start) || !this.workTimes.includes(end) || start === '24:00' || start >= end)) return '工作时间须按半小时选择，开始早于结束，且不能跨夜'
      if (ranges.some(([start], index) => index > 0 && start < ranges[index - 1][1])) return '工作时间不能重叠，请调整后保存'
      return ''
    },
    async changeSetting(key, value) { if (this.saving) return; this.saving = true; try { await collectorSettings({ [key]: value }); this.me = await collectorMe(); this.error = '' } catch (e) { this.error = e.message || '设置失败'; this.me = { ...this.me }; await this.load() } finally { this.saving = false } },
    scheduleError() {
      if (!this.approvedAreas[this.areaIndex]) return '请先选择获批服务范围';
      if (this.scheduleMode === 'weekly' && !this.selectedWeekdays.length) return '请先选择至少一个每周服务日';
      if (this.scheduleMode === 'daily' && (!/^\d{4}-\d{2}-\d{2}$/.test(this.scheduleDate) || (this.today && this.scheduleDate < this.today) || (this.lastDay && this.scheduleDate > this.lastDay))) return '请选择未来 30 天内的调整日期';
      if (!this.selectedSlots.length) return '请添加至少一段工作时间后再发布';
      if (this.scheduleMode === 'weekly' && this.weeklyMismatch && !this.weeklyEdited) return '各服务日原排班不同，请先确认服务日和工作时间';
      return this.workRangeError();
    },
    scheduleSummary() {
      const name = this.approvedAreas[this.areaIndex]?.name || '未选择服务范围';
      const days = this.scheduleMode === 'weekly' ? this.weekdays.filter(day => this.selectedWeekdays.includes(day.value)).map(day => day.label).join('、') || '未选择服务日' : this.scheduleDate;
      return `${name} · ${days} · ${this.selectedSlots.join('、') || '未添加工作时间'}`;
    },
    async saveSchedule() {
      if (this.saving) return;
      const message = this.scheduleError();
      if (message) { this.error = message; this.scheduleNotice = ''; uni.showToast({ title: message, icon: 'none' }); return; }
      await this.persistSchedule(false);
    },
    async clearSchedule() {
      if (this.saving) return;
      const area = this.approvedAreas[this.areaIndex]; if (!area) return;
      const weekly = this.scheduleMode === 'weekly';
      const confirmed = await new Promise(resolve => uni.showModal({ title: weekly ? '停止每周服务？' : '当天休息？', content: weekly ? `将清除“${area.name}”所有每周固定排班。已有单日调整保留。` : `将“${area.name}”在 ${this.scheduleDate} 设为休息，其他范围的排班保留。`, confirmText: weekly ? '确认停止' : '确认休息', success: result => resolve(result.confirm), fail: () => resolve(false) }));
      if (confirmed && !this.saving) await this.persistSchedule(true);
    },
    async persistSchedule(clear) {
      this.saving = true; this.error = ''; this.scheduleNotice = '';
      const weekly = this.scheduleMode === 'weekly'; const area = this.approvedAreas[this.areaIndex];
      try {
        if (weekly) await collectorWeeklyAvailability({ serviceAreaId: area.id, weekdays: clear ? [] : this.selectedWeekdays, slots: clear ? [] : this.selectedSlots });
        else await collectorAvailability({ date: this.scheduleDate, serviceAreaId: area.id, slots: clear ? [] : this.selectedSlots });
        this.me = await collectorMe(); this.restoreSchedule(); this.loadPreview();
        this.scheduleNotice = clear ? (weekly ? '已停止该范围每周服务，已有单日调整保留。' : '已设为该范围当天休息。') : (this.me.profile?.acceptingOrders ? '排班已发布，用户可预约符合范围、品类和剩余名额的时段。' : '排班已保存；请开启“接收新单”，用户才能预约。');
        uni.showToast({ title: clear ? (weekly ? '每周服务已停止' : '已设为当天休息') : (weekly ? '每周排班已发布' : '单日排班已发布'), icon: 'success' });
      } catch (e) { this.error = e.message || '排班保存失败'; } finally { this.saving = false; }
    },
    async resetDailySchedule() { if (this.saving) return; this.saving = true; try { await collectorAvailability({ date: this.scheduleDate, reset: true }); this.me = await collectorMe(); this.restoreSlots(); this.error = ''; this.loadPreview(); uni.showToast({ title: '已恢复周排班', icon: 'success' }) } catch (e) { this.error = e.message || '恢复失败' } finally { this.saving = false } },
    readPermission() {
      // #ifdef APP-PLUS
      try { if (typeof plus !== 'undefined' && plus.android) { const manager = plus.android.importClass('androidx.core.app.NotificationManagerCompat'); this.deviceNotificationStatus = manager.from(plus.android.runtimeMainActivity()).areNotificationsEnabled() ? '已允许' : '未允许，请在系统设置中开启' } } catch (_) { this.deviceNotificationStatus = '请在手机系统设置中查看' }
      // #endif
      // #ifdef H5
      this.deviceNotificationStatus = typeof Notification === 'undefined' ? '浏览器未提供系统通知' : ({ granted: '浏览器已允许（不等于支持离线送达）', denied: '浏览器已拒绝', default: '浏览器尚未授权' }[Notification.permission] || '未知')
      // #endif
    }
  }
}
</script>
<style scoped>
.collector-profile { padding: 4rpx 0 24rpx; }
.collector-title-row { display: flex; align-items: center; flex-wrap: wrap; gap: 12rpx 24rpx; margin-bottom: 8rpx; }
.collector-service-name { flex: 1; min-width: 180rpx; font-size: 36rpx; font-weight: 700; color: var(--workbench-text); overflow-wrap: anywhere; }
.collector-availability { display: flex; align-items: center; gap: 8rpx; font-size: 23rpx; color: var(--workbench-green); }
.availability-dot { width: 12rpx; height: 12rpx; border-radius: 50%; background: currentColor; }
.collector-availability.paused { color: var(--workbench-muted); }
.task-section-heading { display: flex; flex-direction: column; gap: 8rpx; margin: 30rpx 0 20rpx; }
.task-section-title { font-size: 34rpx; font-weight: 700; color: var(--workbench-text); }
.task-toolbar { display: flex; align-items: center; gap: 20rpx; margin-bottom: 24rpx; }
.task-date { flex: 1; min-width: 0; }
.task-date .recycle-select { display: flex; align-items: center; justify-content: space-between; max-width: 360rpx; padding: 16rpx 20rpx; min-height: 76rpx; }
.toolbar-link { box-sizing: border-box; margin: 0; padding: 12rpx 4rpx; line-height: 1.5; min-width: 0; background: transparent; color: var(--workbench-green); font-size: 25rpx; border-radius: 0; white-space: normal; }
.toolbar-link::after, .offer-edit::after, .settings-disclosure::after { border: 0; }
.task-filters { margin-bottom: 24rpx; }
.task-filters .recycle-pill { flex: 1; text-align: center; padding: 12rpx 8rpx; }
.pause-notice { display: flex; flex-direction: column; align-items: flex-start; gap: 4rpx; padding: 18rpx 22rpx; margin-bottom: 20rpx; background: var(--workbench-soft); border-left: 4rpx solid var(--workbench-green); font-size: 25rpx; }
.task-list { background: var(--workbench-surface); padding: 0 24rpx; border: 1rpx solid var(--workbench-line); border-radius: 18rpx; }
.task-item { padding: 24rpx 0; }
.task-item + .task-item { border-top: 1rpx solid var(--workbench-line); }
.task-meta { display: flex; align-items: center; gap: 16rpx; justify-content: space-between; margin-bottom: 18rpx; }
.task-order-no { flex: 1; min-width: 0; font-size: 22rpx; line-height: 1.6; color: var(--workbench-muted); overflow-wrap: anywhere; }
.task-appointment { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8rpx 18rpx; margin-bottom: 18rpx; color: var(--workbench-text); }
.task-date-label { font-size: 26rpx; }
.task-time { font-size: 36rpx; font-weight: 750; line-height: 1.4; }
.task-detail-line { display: flex; align-items: flex-start; gap: 16rpx; margin: 12rpx 0; font-size: 26rpx; line-height: 1.65; overflow-wrap: anywhere; }
.task-detail-label { flex: 0 0 104rpx; color: var(--workbench-muted); }
.task-detail-line > text:last-child { flex: 1; min-width: 0; }
.task-price { display: flex; flex-wrap: wrap; gap: 4rpx 16rpx; margin: 16rpx 0 0; font-size: 26rpx; color: var(--workbench-green); font-weight: 600; }
.task-price .recycle-muted { font-weight: 400; }
.task-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 12rpx; }
.task-actions .task-action { width: auto; min-height: 76rpx; margin: 20rpx 0 0; padding: 16rpx 24rpx; font-size: 25rpx; }
.overview-card, .timeline-card { margin: 24rpx 0; padding: 24rpx; background: var(--workbench-surface); border: 1rpx solid var(--workbench-line); border-radius: 18rpx; }
.overview-head, .timeline-head { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 8rpx 16rpx; margin-bottom: 18rpx; }
.overview-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14rpx; }
.overview-grid.four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.overview-metric { display: flex; flex-direction: column; gap: 6rpx; padding: 18rpx 14rpx; background: var(--workbench-soft); border-radius: 14rpx; min-width: 0; }
.metric-value { font-size: 38rpx; font-weight: 750; line-height: 1.2; color: var(--workbench-green); }
.metric-label { font-size: 22rpx; color: var(--workbench-text); font-weight: 600; }
.metric-sub { font-size: 20rpx; color: var(--workbench-muted); }
.stat-confirmed { color: #3b82f6; }
.stat-picking { color: #f59e0b; }
.stat-completed { color: #10b981; }
.next-job { display: flex; align-items: center; gap: 16rpx; margin-top: 18rpx; padding: 16rpx 18rpx; background: var(--workbench-soft); border-left: 6rpx solid var(--workbench-green); border-radius: 0 12rpx 12rpx 0; }
.next-dot { width: 14rpx; height: 14rpx; border-radius: 50%; background: var(--workbench-green); flex-shrink: 0; }
.next-copy { display: flex; flex-direction: column; gap: 4rpx; flex: 1; min-width: 0; }
.next-title { font-size: 26rpx; font-weight: 700; color: var(--workbench-text); }
.next-empty { display: block; margin-top: 16rpx; font-size: 24rpx; }
.view-switch { margin-bottom: 20rpx; }
.view-switch .recycle-pill { flex: 1; text-align: center; }
.timeline-note { display: block; margin-top: 14rpx; font-size: 22rpx; line-height: 1.5; }
.placement-ok { color: var(--workbench-green); font-weight: 600; }
.placement-conflict { color: var(--workbench-warning); font-weight: 600; }
.preplan { margin-top: 16rpx; padding: 16rpx 18rpx; background: var(--workbench-soft); border: 1rpx dashed var(--workbench-green); border-radius: 12rpx; }
.preplan-title { display: block; margin-bottom: 6rpx; font-size: 24rpx; font-weight: 700; color: var(--workbench-green); }
.schedule-timeline { margin-top: 8rpx; }
.preview-date-row { display: flex; align-items: center; gap: 16rpx; margin: 12rpx 0 18rpx; }
.preview-date-row .task-date .recycle-select { max-width: none; }
.task-empty { padding: 64rpx 24rpx; display: flex; flex-direction: column; align-items: center; gap: 16rpx; text-align: center; }
.empty-task-mark { width: 72rpx; padding: 14rpx 12rpx; box-sizing: border-box; border: 2rpx solid var(--workbench-line); border-radius: 12rpx; transform: rotate(-7deg); }
.empty-task-mark view { height: 4rpx; margin: 8rpx 0; background: var(--workbench-line); border-radius: 4rpx; }
.empty-title { font-size: 28rpx; font-weight: 600; color: var(--workbench-text); }
.workbench-error { display: flex; flex-direction: column; align-items: flex-start; gap: 12rpx; }
.workbench-error .recycle-secondary { margin: 0; width: auto; }
.access-notice { padding: 32rpx 0; }
.settings-section { margin: 28rpx 0 40rpx; }
.settings-section + .settings-section { padding-top: 28rpx; border-top: 8rpx solid var(--workbench-divider); }
.settings-heading { display: flex; align-items: center; gap: 16rpx; padding: 20rpx; margin-bottom: 18rpx; background: var(--workbench-soft); border-left: 6rpx solid #10b981; border-radius: 0 14rpx 14rpx 0; }
.settings-heading > view { flex: 1; min-width: 0; }
.settings-heading .recycle-heading { margin: 0 0 4rpx; font-size: 30rpx; font-weight: 700; }
.settings-heading .recycle-muted { font-size: 22rpx; }
.settings-number { display: flex; align-items: center; justify-content: center; flex: 0 0 52rpx; height: 52rpx; background: linear-gradient(135deg,#10b981,#059669); color: #fff; font-size: 25rpx; font-weight: 700; border-radius: 14rpx; }
.settings-switch-row { display: flex; align-items: center; justify-content: space-between; gap: 18rpx; padding: 18rpx 0; border-bottom: 1rpx solid var(--workbench-line); }
.settings-switch-row > view:first-child { flex: 1; min-width: 0; }
.settings-switch-row switch, .offer-header switch { flex-shrink: 0; }
.settings-switch-row .recycle-muted { display: block; margin-top: 6rpx; font-size: 23rpx; }
.setting-title { display: block; font-weight: 600; color: var(--workbench-text); font-size: 28rpx; }
.settings-disclosure { display: flex; align-items: center; justify-content: space-between; gap: 18rpx; width: 100%; padding: 22rpx 0; margin: 0; background: transparent; color: var(--workbench-text); font-size: 26rpx; line-height: 1.6; text-align: left; border-bottom: 1rpx solid var(--workbench-line); border-radius: 0; }
.field-chevron { width: 10rpx; height: 10rpx; border-right: 2rpx solid currentColor; border-bottom: 2rpx solid currentColor; transform: rotate(45deg); flex-shrink: 0; color: var(--workbench-muted); margin: 0 4rpx; }
.field-chevron.expanded { transform: rotate(225deg); }
.field-chevron.forward { transform: rotate(-45deg); }
.notification-details { padding: 12rpx 20rpx 20rpx; background: var(--workbench-soft); font-size: 25rpx; line-height: 1.6; }
.offer-item { padding: 20rpx 0; border-bottom: 1rpx solid var(--workbench-line); }
.offer-header { display: flex; align-items: center; gap: 20rpx; }
.offer-heading { display: flex; align-items: baseline; flex-wrap: wrap; flex: 1; min-width: 0; gap: 6rpx 20rpx; }
.offer-price { color: var(--workbench-green); font-size: 24rpx; overflow-wrap: anywhere; }
.offer-edit-actions { display: flex; justify-content: flex-end; }
.offer-edit { display: flex; align-items: center; justify-content: center; gap: 14rpx; width: auto; margin: 12rpx 0 0 auto; padding: 8rpx 16rpx; border-radius: 8rpx; background: var(--workbench-soft); color: var(--workbench-green); font-size: 23rpx; line-height: 1.5; }
.offer-editor { margin-top: 16rpx; padding: 0 20rpx 18rpx; border: 1rpx solid var(--workbench-line); border-radius: 12rpx; background: var(--workbench-surface); }
.offer-fields { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 16rpx; }
.offer-fields > view, .service-parameters > view { min-width: 0; }
.offer-editor .recycle-label { margin-top: 18rpx; font-size: 24rpx; }
.offer-editor .settings-switch-row { border: 0; padding-bottom: 0; font-size: 25rpx; }
.service-parameters { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12rpx; margin-top: 14rpx; }
.service-parameters .recycle-label { font-size: 24rpx; }
.service-parameters .recycle-select { padding: 20rpx 8rpx; text-align: center; font-size: 25rpx; }
.schedule-mode .recycle-pill { flex: 1; text-align: center; }
.schedule-step { padding-bottom: 24rpx; border-bottom: 1rpx solid var(--workbench-line); }
.schedule-step .recycle-label { font-size: 28rpx; font-weight: 600; }
.workbench-range-map { margin-top: 20rpx; }
.workbench-range-map :deep(.map-stage), .workbench-range-map :deep(.map-canvas) { height: 360rpx; min-height: 360rpx; }
.area-change { margin-top: 6rpx; }
.weekday-choices { gap: 8rpx; }
.weekday-choices .recycle-pill { flex: 1; padding: 14rpx 4rpx; font-size: 23rpx; border-radius: 10rpx; white-space: nowrap; }
.weekday-shortcuts { display: flex; gap: 24rpx; }
.weekday-shortcuts .toolbar-link { font-size: 23rpx; }
.work-range { display: flex; align-items: center; gap: 12rpx; margin: 16rpx 0; }
.work-range-picker { flex: 1; width: 0; min-width: 0; }
.work-range .recycle-select { padding: 20rpx 10rpx; text-align: center; }
.work-range .toolbar-link { flex-shrink: 0; }
.schedule-preview { margin-top: 24rpx; padding: 4rpx 20rpx 20rpx; background: var(--workbench-soft); border-radius: 12rpx; border-left: 4rpx solid var(--workbench-green); }
.schedule-hint, .schedule-notice { display: block; margin-top: 16rpx; font-size: 25rpx; line-height: 1.65; overflow-wrap: anywhere; }
.schedule-hint { color: var(--workbench-warning); }
.schedule-notice, .override-state { color: var(--workbench-green); }
.schedule-secondary-actions { display: flex; flex-wrap: wrap; gap: 8rpx 24rpx; margin-top: 16rpx; }
.danger-link { color: var(--workbench-warning); }
@media (min-width: 768px) { .task-list { padding: 0 28px; } .task-item { padding: 24px 0; } .settings-heading { padding: 16px; } }
</style>
