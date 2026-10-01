<template>
  <view class="admin-panel" :class="{ dark }">
    <view class="panel-heading">
      <view class="panel-heading-copy">
        <text class="panel-title">点位管理</text>
        <text class="panel-subtitle">审核状态与点位资料</text>
      </view>
      <view class="status-badge" :class="bin.review ? 'approved' : 'pending'">
        <view class="status-dot"></view>
        <text>{{ bin.review ? '已通过审核' : '待审核' }}</text>
      </view>
    </view>
    <view class="report-summary" :class="{ 'has-reports': visibleReports.length }">
      <ManifestIcon :id="visibleReports.length ? 'dark_alert' : 'confirm'" class="summary-icon" />
      <text>{{ visibleReports.length ? `收到 ${visibleReports.length} 条点位反馈` : '暂无用户反馈' }}</text>
      <view v-if="visibleReports.length" class="summary-action" @click="showReports = !showReports">
        {{ showReports ? '收起' : '查看' }}
      </view>
    </view>
    <view class="actions">
      <view class="action-btn edit-btn" :class="{ disabled: busy }" @click="!busy && (editing = !editing)">
        <ManifestIcon class="action-icon" :id="editing ? 'close' : 'edit_profile'" />{{ editing ? '收起编辑' : '编辑资料' }}
      </view>
      <view v-if="!bin.review" class="action-btn approve-btn" :class="{ disabled: busy }" @click="review(true)">
        <ManifestIcon class="action-icon" id="confirm" />审核通过
      </view>
      <view v-if="bin.review" class="action-btn approve-btn" :class="{ disabled: busy }" @click="review(false)">
        <ManifestIcon class="action-icon" id="restore" />撤销审核
      </view>
      <view class="action-btn delete-btn" :class="{ disabled: busy }" @click="removeBin">
        <ManifestIcon class="action-icon" id="delete" />删除点位
      </view>
    </view>
    <scroll-view v-if="editing || showReports" scroll-y class="details">
      <view v-if="showReports" class="reports">
        <view class="reports-heading">
          <view><text class="group-title">用户反馈</text><text class="group-caption">请核实后再清理记录</text></view>
          <view v-if="visibleReports.length" class="clear-reports" :class="{ disabled: busy }" @click="!busy && (confirmClearReports = true)">清空记录</view>
        </view>
        <view v-if="confirmClearReports" class="clear-confirm">
          <text class="clear-confirm-copy">将清空此点位的 {{ visibleReports.length }} 条反馈，点位资料不会删除。</text>
          <view class="clear-confirm-actions">
            <view class="keep-reports" @click="confirmClearReports = false">保留记录</view>
            <view class="confirm-clear" :class="{ disabled: busy }" @click="!busy && removeReports()">{{ busy ? '清理中…' : '确认清空' }}</view>
          </view>
        </view>
        <view v-for="(report, index) in visibleReports" :key="index" class="report">
          <text class="report-reason">{{ report.reason || '未填写原因' }}</text>
          <text class="muted">{{ report.createdAt || '' }} · {{ report.userId || '匿名用户' }}</text>
        </view>
      </view>
      <view v-if="editing" class="form">
        <view class="form-heading"><text class="group-title">点位资料</text><text class="group-caption">修改后保存即可同步到地图</text></view>
        <view class="form-field">
          <text class="field-label">名称</text>
          <input v-model="draft.name" class="field-control" maxlength="100" placeholder="输入点位名称" />
        </view>
        <view class="form-field">
          <text class="field-label">描述</text>
          <textarea v-model="draft.describe" class="field-control field-textarea" maxlength="2000" auto-height placeholder="补充位置特征或点位说明" />
        </view>
        <view class="form-row">
          <view class="form-field">
            <text class="field-label">类型</text>
            <picker :range="['普通垃圾桶', '智能垃圾桶']" :value="draft.type === 'smart' ? 1 : 0" @change="draft.type = Number($event.detail.value) === 1 ? 'smart' : 'normal'"><view class="field-control picker">{{ draft.type === 'smart' ? '智能垃圾桶' : '普通垃圾桶' }}</view></picker>
          </view>
          <view class="form-field">
            <text class="field-label">状态</text>
            <picker :range="['离线', '在线']" :value="draft.status === 'online' ? 1 : 0" @change="draft.status = Number($event.detail.value) === 1 ? 'online' : 'offline'"><view class="field-control picker">{{ draft.status === 'online' ? '在线' : '离线' }}</view></picker>
          </view>
        </view>
        <view class="form-row">
          <view class="form-field">
            <text class="field-label">纬度</text>
            <input v-model="draft.latitude" class="field-control" type="text" placeholder="纬度" />
          </view>
          <view class="form-field">
            <text class="field-label">经度</text>
            <input v-model="draft.longitude" class="field-control" type="text" placeholder="经度" />
          </view>
        </view>
        <view class="form-field">
          <text class="field-label">图片路径</text>
          <input v-model="draft.imagePath" class="field-control" maxlength="2000" placeholder="可选" />
        </view>
        <view class="form-field">
          <text class="field-label">设备回调地址</text>
          <input v-model="draft.callback_url" class="field-control" maxlength="2000" placeholder="可选" />
        </view>
        <view class="save-btn" :class="{ disabled: busy }" @click="save">
          <ManifestIcon class="action-icon" :id="busy ? 'refresh' : 'confirm'" />{{ busy ? '提交中…' : '保存修改' }}
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { approveBin, rejectBin, updateBin, deleteBin, clearBinErrorReports } from '@/api/database'
import { binReports } from '@/utils/map-admin-bins'
import ManifestIcon from '@/components/ManifestIcon.vue'
const props = defineProps({ bin: { type: Object, required: true }, dark: Boolean })
const emit = defineEmits(['updated'])
const reports = computed(() => binReports(props.bin))
const editing = ref(false)
const showReports = ref(false)
const confirmClearReports = ref(false)
const clearedReportsForId = ref(null)
const busy = ref(false)
const draft = ref({})
watch(() => props.bin.id, () => {
  const bin = props.bin
  editing.value = false
  showReports.value = false
  confirmClearReports.value = false
  clearedReportsForId.value = null
  draft.value = { name: bin.name || '', describe: bin.description || '', type: bin.type || 'normal', status: bin.status || 'offline', latitude: String(bin.latitude ?? ''), longitude: String(bin.longitude ?? ''), imagePath: bin.imagePath || '', callback_url: bin.callback_url || '' }
}, { immediate: true })
const visibleReports = computed(() => String(props.bin.id) === String(clearedReportsForId.value) ? [] : reports.value)
async function submit(id, action, onSuccess) {
  if (busy.value) return
  busy.value = true
  try {
    const result = await action()
    if (result?.code !== 0) throw new Error(result?.msg || '操作失败')
    uni.showToast({ title: '操作成功', icon: 'success' })
    onSuccess?.()
    emit('updated', id)
  } catch (error) { uni.showToast({ title: error.message || '操作失败', icon: 'none' }) }
  finally { busy.value = false }
}
function review(approved) {
  const id = props.bin.id
  if (busy.value) return
  uni.showModal({ title: approved ? '审核通过' : '取消通过审核', content: approved ? '确认将此垃圾桶向普通用户开放？' : '确认将此垃圾桶设为未通过审核？普通用户将不再看到它。', success: result => {
    if (result.confirm) submit(id, () => approved ? approveBin(id) : rejectBin(id))
  } })
}
function removeBin() {
  if (busy.value) return
  const id = props.bin.id
  const name = props.bin.name || '此垃圾桶'
  uni.showModal({ title: '删除垃圾桶', content: `确认永久删除“${name}”？删除后地图不再显示此桶，关联的用户设备关系也会删除。`, success: result => {
    if (result.confirm) submit(id, () => deleteBin(id))
  } })
}
function removeReports() {
  if (busy.value) return
  const id = props.bin.id
  submit(id, () => clearBinErrorReports(id), () => {
    clearedReportsForId.value = id
    confirmClearReports.value = false
  })
}
function save() {
  if (busy.value) return
  const latitude = Number(draft.value.latitude)
  const longitude = Number(draft.value.longitude)
  if (!draft.value.name.trim() || !draft.value.latitude.trim() || !draft.value.longitude.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    uni.showToast({ title: '请填写名称和有效经纬度', icon: 'none' }); return
  }
  const id = props.bin.id
  submit(id, () => updateBin(id, { ...draft.value, name: draft.value.name.trim(), latitude, longitude }))
}
</script>

<style scoped>
.admin-panel {
  margin-top: 20rpx;
  padding: 24rpx;
  border: 1rpx solid #e5ebef;
  border-radius: 20rpx;
  color: #243442;
  background: linear-gradient(145deg, #fbfefd, #f4faf8);
}
.panel-heading, .reports-heading, .form-row { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
.panel-heading { margin-bottom: 18rpx; }
.panel-heading-copy { display: flex; flex-direction: column; gap: 4rpx; }
.panel-title { color: #203044; font-size: 27rpx; font-weight: 700; }
.panel-subtitle, .group-caption { color: #8b98a7; font-size: 20rpx; }
.status-badge { display: flex; align-items: center; gap: 8rpx; padding: 9rpx 14rpx; border-radius: 24rpx; font-size: 20rpx; font-weight: 600; }
.status-badge.pending { color: #a66a13; background: #fff5df; }
.status-badge.approved { color: #07825e; background: #e4f8ef; }
.status-dot { width: 10rpx; height: 10rpx; border-radius: 50%; background: currentColor; }
.report-summary { display: flex; align-items: center; gap: 10rpx; min-height: 58rpx; padding: 0 16rpx; border-radius: 14rpx; color: #778595; background: #f0f4f5; font-size: 21rpx; }
.report-summary.has-reports { color: #9b5e19; background: #fff6e8; }
.summary-icon { width: 28rpx; height: 28rpx; }
.summary-action { margin-left: auto; color: #07825e; font-weight: 600; }
.actions { display: flex; flex-wrap: wrap; gap: 10rpx; margin-top: 16rpx; }
.action-btn { min-height: 66rpx; flex: 1 1 30%; display: flex; align-items: center; justify-content: center; gap: 8rpx; padding: 0 10rpx; box-sizing: border-box; border-radius: 13rpx; font-size: 21rpx; font-weight: 600; }
.action-icon { width: 26rpx; height: 26rpx; }
.edit-btn { color: #365f91; background: #edf4fd; }
.approve-btn { color: #087d5e; background: #e7f7ef; }
.delete-btn { color: #c24747; background: #fff0ef; }
.disabled { opacity: .48; }
.details { max-height: 540rpx; height: 540rpx; margin-top: 18rpx; padding: 18rpx; box-sizing: border-box; border: 1rpx solid #e5ebef; border-radius: 16rpx; background: #ffffff; }
.reports-heading { margin-bottom: 12rpx; }
.reports-heading > view:first-child, .form-heading { display: flex; flex-direction: column; gap: 4rpx; }
.group-title { color: #27384a; font-size: 23rpx; font-weight: 700; }
.clear-reports { padding: 10rpx 16rpx; color: #bd4d4d; background: #fff0ef; border-radius: 12rpx; font-size: 20rpx; }
.clear-confirm { margin: 12rpx 0; padding: 16rpx; border: 1rpx solid #f0d39e; border-radius: 14rpx; background: #fff8eb; }
.clear-confirm-copy { display: block; color: #80602d; font-size: 21rpx; line-height: 1.45; }
.clear-confirm-actions { display: flex; justify-content: flex-end; gap: 12rpx; margin-top: 14rpx; }
.keep-reports, .confirm-clear { padding: 12rpx 18rpx; border-radius: 10rpx; font-size: 20rpx; font-weight: 600; }
.keep-reports { color: #637184; background: #edf1f4; }
.confirm-clear { color: #ffffff; background: #d95757; }
.report { display: flex; flex-direction: column; gap: 8rpx; padding: 16rpx 0; border-bottom: 1rpx solid #e8edf1; word-break: break-all; }
.report-reason { color: #334355; font-size: 23rpx; line-height: 1.45; }
.muted { color: #98a3af; font-size: 19rpx; }
.form-heading { margin-bottom: 18rpx; }
.form-field { min-width: 0; flex: 1; margin-bottom: 16rpx; }
.field-label { display: block; margin-bottom: 8rpx; color: #5c6b7a; font-size: 21rpx; font-weight: 600; }
.field-control { display: block; width: 100%; min-height: 66rpx; padding: 14rpx 16rpx; box-sizing: border-box; border: 1rpx solid #e2e9ed; border-radius: 12rpx; background: #f8fafb; color: #27384a; font-size: 22rpx; }
.field-textarea { min-height: 112rpx; line-height: 1.45; }
.picker { display: flex; align-items: center; }
.form-row { align-items: flex-start; gap: 14rpx; }
.save-btn { display: flex; align-items: center; justify-content: center; gap: 10rpx; height: 72rpx; margin-top: 2rpx; border-radius: 14rpx; color: #ffffff; background: linear-gradient(135deg, #12ad7b, #078b67); font-size: 23rpx; font-weight: 700; }
.save-btn .action-icon { width: 28rpx; height: 28rpx; }
.dark { color: #e8f1f8; border-color: rgba(107, 149, 178, .24); background: linear-gradient(145deg, rgba(13, 34, 54, .96), rgba(8, 24, 40, .96)); }
.dark .panel-title, .dark .group-title { color: #edf7ff; }
.dark .panel-subtitle, .dark .group-caption { color: #8099ad; }
.dark .status-badge.pending { color: #ffd27a; background: rgba(228, 165, 70, .14); }
.dark .status-badge.approved { color: #6ce2b4; background: rgba(64, 210, 155, .13); }
.dark .report-summary { color: #93a9bb; background: rgba(133, 164, 188, .1); }
.dark .report-summary.has-reports { color: #ffce82; background: rgba(227, 157, 58, .13); }
.dark .summary-action { color: #6ce2b4; }
.dark .edit-btn { color: #a9c9ee; background: rgba(92, 151, 216, .14); }
.dark .approve-btn { color: #6ce2b4; background: rgba(64, 210, 155, .13); }
.dark .delete-btn { color: #ff9999; background: rgba(241, 100, 100, .13); }
.dark .details { border-color: rgba(107, 149, 178, .2); background: rgba(5, 17, 29, .5); }
.dark .clear-reports { color: #ff9999; background: rgba(241, 100, 100, .13); }
.dark .clear-confirm { border-color: rgba(238, 178, 87, .28); background: rgba(227, 157, 58, .12); }
.dark .clear-confirm-copy { color: #e7c789; }
.dark .keep-reports { color: #b8cada; background: rgba(135, 165, 190, .12); }
.dark .confirm-clear { color: #2b1111; background: #ff8989; }
.dark .report { border-color: rgba(107, 149, 178, .2); }
.dark .report-reason { color: #d8e8f4; }
.dark .muted { color: #7892a6; }
.dark .field-label { color: #a9c0d2; }
.dark .field-control { border-color: rgba(107, 149, 178, .22); background: rgba(6, 18, 30, .76); color: #e8f1f8; }
.dark .save-btn { color: #052238; background: linear-gradient(135deg, #68e6ca, #5cc4ee); }
</style>
